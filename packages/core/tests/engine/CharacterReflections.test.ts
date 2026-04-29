/**
 * Step 7 — runtime tests: reflection memory storage, eviction policy, and
 * the addReflection Effect dispatch path.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Story } from '../../src/engine/Story';
import { StoryContext } from '../../src/engine/StoryContext';

const granny = { id: 'char_1', name: 'Granny', displayName: 'Grandma' };
const wolf = { id: 'char_2', name: 'Wolf' };

describe('appendCharacterReflection', () => {
  let story: Story;
  let ctx: StoryContext;

  beforeEach(() => {
    vi.stubGlobal('window', { setInterval: vi.fn().mockReturnValue(1), clearInterval: vi.fn() });
    story = new Story();
    story.setCharacters([granny, wolf]);
    ctx = new StoryContext(undefined, story);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('starts with no reflections', () => {
    expect(ctx.getCharacterReflections('char_1')).toEqual([]);
  });

  it('appends a reflection in append order', () => {
    ctx.appendCharacterReflection('char_1', 'first');
    ctx.appendCharacterReflection('char_1', 'second');
    const list = ctx.getCharacterReflections('char_1');
    expect(list.map((r) => r.text)).toEqual(['first', 'second']);
  });

  it('returns the appended entry with timestamp filled', () => {
    const before = Date.now();
    const entry = ctx.appendCharacterReflection('char_1', 'note');
    expect(entry).not.toBeNull();
    expect(entry!.text).toBe('note');
    expect(entry!.timestamp).toBeGreaterThanOrEqual(before);
  });

  it('rejects empty / whitespace-only text', () => {
    expect(ctx.appendCharacterReflection('char_1', '')).toBeNull();
    expect(ctx.appendCharacterReflection('char_1', '   ')).toBeNull();
    expect(ctx.getCharacterReflections('char_1')).toEqual([]);
  });

  it('clamps salience into [0, 1]', () => {
    ctx.appendCharacterReflection('char_1', 'a', { salience: 5 });
    ctx.appendCharacterReflection('char_1', 'b', { salience: -2 });
    const list = ctx.getCharacterReflections('char_1');
    expect(list[0].salience).toBe(1);
    expect(list[1].salience).toBe(0);
  });

  it('resolves character refs by name', () => {
    ctx.appendCharacterReflection('Grandma', 'via displayName');
    expect(ctx.getCharacterReflections('char_1')[0].text).toBe('via displayName');
  });

  it('returns a defensive shallow copy', () => {
    ctx.appendCharacterReflection('char_1', 'hi');
    const list = ctx.getCharacterReflections('char_1');
    list[0].text = 'mutated';
    const fresh = ctx.getCharacterReflections('char_1');
    expect(fresh[0].text).toBe('hi');
  });

  it('emits characterReflectionAdded event', () => {
    const handler = vi.fn();
    ctx.on('characterReflectionAdded', handler);
    ctx.appendCharacterReflection('char_1', 'event-test');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].characterRef).toBe('char_1');
    expect(handler.mock.calls[0][0].reflection.text).toBe('event-test');
  });

  it('caps stored reflections per character', () => {
    for (let i = 0; i < 50; i += 1) {
      ctx.appendCharacterReflection('char_1', `entry ${i}`);
    }
    const list = ctx.getCharacterReflections('char_1');
    expect(list.length).toBe(32);  // REFLECTION_CAP
    // Eviction is FIFO when salience is uniform → newest 32 retained.
    expect(list[0].text).toBe('entry 18');
    expect(list[list.length - 1].text).toBe('entry 49');
  });

  it('keeps high-salience entries when evicting', () => {
    // Fill with low-salience.
    for (let i = 0; i < 31; i += 1) {
      ctx.appendCharacterReflection('char_1', `low ${i}`, { salience: 0.2 });
    }
    // High-salience entry — added at position 32, no eviction yet.
    ctx.appendCharacterReflection('char_1', 'pivotal', { salience: 0.9 });
    expect(ctx.getCharacterReflections('char_1').length).toBe(32);
    // Now overflow with another high-salience entry. Eviction targets the
    // oldest entry whose salience is below incoming; "low 0" should go.
    ctx.appendCharacterReflection('char_1', 'another', { salience: 0.9 });
    const list = ctx.getCharacterReflections('char_1');
    expect(list.length).toBe(32);
    expect(list.find((r) => r.text === 'pivotal')).toBeTruthy();
    expect(list.find((r) => r.text === 'another')).toBeTruthy();
    expect(list.find((r) => r.text === 'low 0')).toBeFalsy();
  });

  it('returns null when the character ref does not resolve', () => {
    expect(ctx.appendCharacterReflection('', 'blank')).toBeNull();
  });
});

describe('addReflection effect', () => {
  let story: Story;
  let ctx: StoryContext;

  beforeEach(() => {
    vi.stubGlobal('window', { setInterval: vi.fn().mockReturnValue(1), clearInterval: vi.fn() });
    story = new Story();
    story.setCharacters([granny]);
    ctx = new StoryContext(undefined, story);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('records a reflection when the effect fires', () => {
    ctx.applyEffect({
      type: 'addReflection', target: 'char_1',
      reflectionText: 'I now distrust the wolf.',
      reflectionSalience: 0.8,
    } as any);
    const list = ctx.getCharacterReflections('char_1');
    expect(list).toHaveLength(1);
    expect(list[0].text).toBe('I now distrust the wolf.');
    expect(list[0].salience).toBe(0.8);
  });

  it('skips the effect when reflectionText is missing or empty', () => {
    ctx.applyEffect({ type: 'addReflection', target: 'char_1' } as any);
    ctx.applyEffect({ type: 'addReflection', target: 'char_1', reflectionText: '   ' } as any);
    expect(ctx.getCharacterReflections('char_1')).toEqual([]);
  });
});

describe('Reflection serialization round-trip', () => {
  let story: Story;
  let ctx: StoryContext;

  beforeEach(() => {
    vi.stubGlobal('window', { setInterval: vi.fn().mockReturnValue(1), clearInterval: vi.fn() });
    story = new Story();
    story.setCharacters([granny]);
    ctx = new StoryContext(undefined, story);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('serializes and restores reflections losslessly', () => {
    ctx.appendCharacterReflection('char_1', 'remembered', { salience: 0.7 });
    const blob = ctx.serialize();
    expect(blob.characterReflections!.char_1[0].text).toBe('remembered');

    const ctx2 = new StoryContext(undefined, story);
    ctx2.loadFromSerialized(blob);
    const list = ctx2.getCharacterReflections('char_1');
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ text: 'remembered', salience: 0.7 });
  });

  it('forward-compatible with saves that lack characterReflections', () => {
    const blob = ctx.serialize();
    delete (blob as any).characterReflections;
    const ctx2 = new StoryContext(undefined, story);
    expect(() => ctx2.loadFromSerialized(blob)).not.toThrow();
    expect(ctx2.getCharacterReflections('char_1')).toEqual([]);
  });
});
