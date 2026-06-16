/**
 * Tests for HelperCommandExecutor — turns a structured helper-command action +
 * a filter result into a preview and an undoable BatchCommand. Covers the
 * public preview/execute surface plus the pure text-transform, property-map,
 * and diff helpers (reached via `as any` since they're private).
 */
import { describe, it, expect, vi } from 'vitest';
import { HelperCommandExecutor, getHelperCommandExecutor } from '../HelperCommandExecutor';

const exec = () => new HelperCommandExecutor();

const beat = (over: any = {}) =>
  ({
    id: 'b1',
    name: 'Beat One',
    type: 'infoText',
    transition: 'fade',
    sound: undefined,
    node: undefined,
    cluster: undefined,
    defaultTarget: undefined,
    defaultTargetDelay: undefined,
    getParameters: () => ({ text: 'hello', speaker: 'Narrator' }),
    locations: new Map(),
    ...over,
  }) as any;

const filterResult = (over: any = {}) => ({ beats: [], locations: [], clusters: [], totalCount: 0, ...over });

const action = (over: any = {}) =>
  ({
    actionType: 'setProperty',
    targetSelector: { targetType: 'beat', filters: {} },
    modification: { type: 'set', property: 'text', value: 'world' },
    confidence: 1,
    interpretation: 'set text to world',
    ...over,
  }) as any;

describe('generatePreview', () => {
  it('previews a setProperty change on a beat with old/new values', async () => {
    const preview = await exec().generatePreview(action(), filterResult({ beats: [beat()], totalCount: 1 }));
    expect(preview.changes).toHaveLength(1);
    expect(preview.changes[0]).toMatchObject({
      elementType: 'beat',
      elementId: 'b1',
      property: 'text',
      oldValue: 'hello',
      newValue: 'world',
    });
  });

  it('previews an addElement change', async () => {
    const preview = await exec().generatePreview(
      action({ actionType: 'addElement', modification: { type: 'add', property: 'choice', value: { text: 'Go' } } }),
      filterResult({ beats: [beat()], totalCount: 1 }),
    );
    expect(preview.changes[0]).toMatchObject({ property: 'add choice', oldValue: null });
  });

  it('previews a removeElement change for a location target', async () => {
    const loc = { name: 'door' };
    const preview = await exec().generatePreview(
      action({ actionType: 'removeElement', targetSelector: { targetType: 'location', filters: {} } }),
      filterResult({ locations: [{ beat: beat(), location: loc }], totalCount: 1 }),
    );
    expect(preview.changes[0]).toMatchObject({ elementType: 'location', property: 'remove', newValue: null });
  });

  it('records an error for an unknown action type', async () => {
    const preview = await exec().generatePreview(action({ actionType: 'frobnicate' }), filterResult());
    expect(preview.errors[0]).toMatch(/unknown action type/i);
  });
});

describe('execute', () => {
  const mutations = () => ({ addBeat: vi.fn(), updateBeat: vi.fn(), deleteBeat: vi.fn(), moveBeat: vi.fn() });

  it('throws when mutations are not set', async () => {
    await expect(exec().execute(action(), filterResult({ beats: [beat()] }))).rejects.toThrow(/mutations not set/i);
  });

  it('builds a BatchCommand for a setProperty action', async () => {
    const e = exec();
    e.setMutations(mutations());
    const cmd = await e.execute(action(), filterResult({ beats: [beat()], totalCount: 1 }));
    expect(cmd).not.toBeNull();
    expect(cmd!.description).toBe('set text to world');
  });

  it('returns null when there is nothing to change', async () => {
    const e = exec();
    e.setMutations(mutations());
    expect(await e.execute(action(), filterResult())).toBeNull();
  });
});

describe('transformText helpers', () => {
  const e = exec() as any;

  it('transformTextSingle preserves the case pattern of each match', () => {
    expect(e.transformTextSingle('the CAT and Cat and cat', 'cat', 'dog')).toBe('the DOG and Dog and dog');
  });

  it('transformText applies primary then additional replacements', () => {
    const out = e.transformText('Alice met Bob', {
      findPattern: 'Alice',
      replacement: 'Carol',
      additionalReplacements: [{ find: 'Bob', replace: 'Dave' }],
    });
    expect(out).toBe('Carol met Dave');
  });

  it('escapeRegex escapes regex metacharacters', () => {
    expect(e.escapeRegex('a.b*c(d)')).toBe('a\\.b\\*c\\(d\\)');
  });

  it('transformTextSingle treats the find pattern literally (not as regex)', () => {
    // 'a.b' is lowercase, so case-preservation lowercases the replacement; the
    // point here is that '.' matches a literal dot, not "any char" (axb is untouched).
    expect(e.transformTextSingle('a.b and axb', 'a.b', 'Z')).toBe('z and axb');
  });

  it('needsAITransform is true only when pronoun/context adaptation is requested', () => {
    expect(e.needsAITransform({ findPattern: 'x', replacement: 'y' })).toBe(false);
    expect(e.needsAITransform({ findPattern: 'x', replacement: 'y', adjustPronouns: true })).toBe(true);
    expect(e.needsAITransform({ findPattern: 'x', replacement: 'y', adaptContext: true })).toBe(true);
  });

  it('getTextTypeForField maps fields to text types', () => {
    expect(e.getTextTypeForField('buttonText')).toBe('button');
    expect(e.getTextTypeForField('location.label')).toBe('button');
    expect(e.getTextTypeForField('title')).toBe('title');
    expect(e.getTextTypeForField('dialogTree.text')).toBe('dialog');
    expect(e.getTextTypeForField('choices')).toBe('dialog');
    expect(e.getTextTypeForField('message')).toBe('message');
    expect(e.getTextTypeForField('text')).toBe('narration');
  });

  it('transformDialogTree transforms node text and choice text recursively', () => {
    const tree = {
      text: 'Hi Alice',
      choices: [{ text: 'Ask Alice', target: { text: 'Alice nods' } }],
    };
    const out = e.transformDialogTree(tree, { findPattern: 'Alice', replacement: 'Bob' });
    expect(out.text).toBe('Hi Bob');
    expect(out.choices[0].text).toBe('Ask Bob');
    expect(out.choices[0].target.text).toBe('Bob nods');
  });
});

describe('property mapping helpers', () => {
  const e = exec() as any;

  it('createBeatUpdate routes direct properties vs parameters', () => {
    expect(e.createBeatUpdate('transition', 'fade')).toEqual({ transition: 'fade' });
    expect(e.createBeatUpdate('cluster', 'c1')).toEqual({ cluster: 'c1' });
    expect(e.createBeatUpdate('node', 5)).toEqual({ node: 5 });
    expect(e.createBeatUpdate('speaker', 'Bob')).toEqual({ parameters: { speaker: 'Bob' } });
  });

  it('getBeatPropertyValue reads direct props and falls back to parameters', () => {
    const b = beat({ transition: 'cut', getParameters: () => ({ speaker: 'Eve' }) });
    expect(e.getBeatPropertyValue(b, 'transition')).toBe('cut');
    expect(e.getBeatPropertyValue(b, 'speaker')).toBe('Eve');
    expect(e.getBeatPropertyValue(b, 'missing')).toBeUndefined();
  });
});

describe('createTextDiff', () => {
  it('marks matched spans as removed and the rest unchanged', () => {
    const e = exec() as any;
    const diff = e.createTextDiff('I saw Alice today', 'I saw Bob today', { findPattern: 'Alice', replacement: 'Bob' });
    expect(diff.original).toBe('I saw Alice today');
    expect(diff.modified).toBe('I saw Bob today');
    expect(diff.segments.find((s: any) => s.type === 'removed')?.text).toBe('Alice');
    expect(diff.segments.filter((s: any) => s.type === 'unchanged').map((s: any) => s.text).join('')).toBe('I saw  today');
  });
});

describe('singleton', () => {
  it('getHelperCommandExecutor returns a stable instance', () => {
    expect(getHelperCommandExecutor()).toBe(getHelperCommandExecutor());
  });
});
