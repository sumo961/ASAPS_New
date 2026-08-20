/**
 * Tests for SearchService — project-wide find/replace across metadata, beats,
 * characters, assets, and variables. Pure logic; beats are minimal fakes
 * exposing the Beat surface it touches (id/name/type/getParameters/locations).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { SearchService } from '../SearchService';

const beat = (over: any = {}) =>
  ({
    id: 'b1',
    name: 'Beat One',
    type: 'infoText',
    getParameters: () => ({}),
    locations: new Map(),
    ...over,
  }) as any;

let svc: SearchService;
beforeEach(() => {
  svc = new SearchService();
});

describe('basics', () => {
  it('returns no matches for an empty query', () => {
    svc.setData({ metadata: { title: 'Anything' } });
    expect(svc.search('')).toEqual([]);
  });

  it('matches case-insensitively by default', () => {
    svc.setData({ metadata: { title: 'The Forest' } });
    const m = svc.search('forest');
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ type: 'metadata', field: 'title', value: 'The Forest' });
  });

  it('honors caseSensitive', () => {
    svc.setData({ metadata: { title: 'The Forest' } });
    expect(svc.search('forest', { caseSensitive: true })).toHaveLength(0);
    expect(svc.search('Forest', { caseSensitive: true })).toHaveLength(1);
  });
});

describe('content types', () => {
  it('finds matches in asset names', () => {
    svc.setData({ assets: [{ id: 'a1', name: 'forest_bg.png', type: 'background', url: '' } as any] });
    const m = svc.search('forest');
    expect(m[0]).toMatchObject({ type: 'asset', id: 'a1', field: 'name' });
  });

  it('finds matches in variable names and string values', () => {
    svc.setData({ variables: { heroName: 'Tomforest' } });
    const byName = svc.search('hero');
    expect(byName.some((x) => x.field === 'name')).toBe(true);
    const byValue = svc.search('forest');
    expect(byValue.some((x) => x.field === 'value')).toBe(true);
  });

  it('finds matches in beat name and text parameters', () => {
    svc.setData({
      beats: [beat({ id: 'b9', name: 'Forest Hub', getParameters: () => ({ text: 'You enter the forest.' }) })],
    });
    const m = svc.search('forest');
    expect(m.some((x) => x.type === 'beat' && x.field === 'name')).toBe(true);
    expect(m.some((x) => x.type === 'beat' && x.field === 'text')).toBe(true);
  });
});

describe('options', () => {
  it('scopes the search via searchIn', () => {
    svc.setData({
      metadata: { title: 'forest' },
      assets: [{ id: 'a1', name: 'forest.png', type: 'background', url: '' } as any],
    });
    const m = svc.search('forest', {
      searchIn: { metadata: true, beats: false, assets: false, characters: false, variables: false, counters: false, locations: false },
    });
    expect(m).toHaveLength(1);
    expect(m[0].type).toBe('metadata');
  });

  it('wholeWord excludes substring matches', () => {
    svc.setData({ metadata: { title: 'forester forest' } });
    expect(svc.search('forest')).toHaveLength(2); // both occurrences
    expect(svc.search('forest', { wholeWord: true })).toHaveLength(1); // only standalone
  });

  it('useRegex matches a pattern', () => {
    svc.setData({ metadata: { title: 'forest' } });
    expect(svc.search('f.r.st', { useRegex: true })).toHaveLength(1);
  });

  it('returns [] for an invalid regex', () => {
    svc.setData({ metadata: { title: 'forest' } });
    expect(svc.search('[unterminated', { useRegex: true })).toEqual([]);
  });
});

describe('match offsets + createReplacements', () => {
  it('reports the match start/end offsets within the value', () => {
    svc.setData({ metadata: { title: 'The Forest' } });
    const m = svc.search('Forest')[0];
    expect([m.matchStart, m.matchEnd]).toEqual([4, 10]);
  });

  it('createReplacements splices the replacement into the matched span', () => {
    svc.setData({ metadata: { title: 'The Forest' } });
    const reps = svc.createReplacements(svc.search('Forest'), 'Woods');
    expect(reps[0].newValue).toBe('The Woods');
    expect(typeof reps[0].apply).toBe('function');
  });
});

describe('field coverage (shared SEARCHABLE_TEXT_FIELDS list)', () => {
  // The old hand-maintained 5-field list silently missed `prompt` (used by
  // 11 beat types), `question`, `cancelButtonText`, choice labels, and text
  // variations — a "renamed everywhere" pass quietly wasn't. These pin the
  // widened coverage.
  it('finds text in prompt, question, and cancelButtonText', () => {
    svc.setData({
      beats: [beat({
        getParameters: () => ({
          prompt: 'Ask the Prince a question',
          question: 'Trust the Prince?',
          cancelButtonText: 'Leave the Prince',
        }),
      })],
    });
    const m = svc.search('Prince');
    const fields = m.map((x) => x.field).sort();
    expect(fields).toEqual(['cancelButtonText', 'prompt', 'question']);
  });

  it('finds choice labels and prop labels with indexed replace paths', () => {
    svc.setData({
      beats: [beat({
        type: 'multiChoice',
        getParameters: () => ({
          choices: [{ text: 'Follow the Prince' }, { text: 'Run away' }],
          props: [{ text: 'The Prince statue' }],
        }),
      })],
    });
    const m = svc.search('Prince');
    expect(m.map((x) => x.field).sort()).toEqual(['choices[0].text', 'props[0].text']);
  });

  it('finds text variations with indexed paths', () => {
    svc.setData({
      beats: [beat({
        getParameters: () => ({ textVariations: ['A dull day', 'The Prince arrives'] }),
      })],
    });
    const m = svc.search('Prince');
    expect(m.map((x) => x.field)).toEqual(['textVariations[1]']);
  });

  it('finds a top-level speaker that getParameters does not expose', () => {
    svc.setData({
      beats: [beat({ speaker: 'Prince', getParameters: () => ({ text: 'Hello.' }) })],
    });
    const m = svc.search('Prince');
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ type: 'beat', field: 'speaker', value: 'Prince' });
  });

  it('does not double-match speaker when parameters expose it too', () => {
    svc.setData({
      beats: [beat({ speaker: 'Prince', getParameters: () => ({ speaker: 'Prince' }) })],
    });
    expect(svc.search('Prince')).toHaveLength(1);
  });
});
