/**
 * AI Story Logic without a model: real path simulation, a scripted reply.
 * Covers what the model is given, batching, the cache and the check every
 * finding must pass before an author sees it.
 */
import { describe, it, expect, vi } from 'vitest';
import { BeatTypeRegistry, Story, StateSimulationAnalyzer, arrivalStates, arrivesDifferently } from '@asaps/core';
import {
  beatWords, describeState, dismissFinding, estimateRun, firstPass, findingKey, makeBatches, mergeChecked, pendingCandidates,
  runStoryLogicCheck, selectCandidates, validateFindings, visibleFindings, type StoryLogicCandidate,
} from '../storyLogicReview';

function buildStory(beats: any[], characters?: any[]) {
  const story = new Story({ title: 'T', author: 'T', firstBeatId: beats[0].id });
  if (characters) story.setCharacters(characters as any);
  const registry = BeatTypeRegistry.getInstance();
  for (const b of beats) story.addBeat(registry.createBeat(b.type, { name: b.id, ...b }));
  return story;
}

// Planted: the door's text assumes the notebook; one way in doesn't have it.
const notebookBeats = () => [
  { id: 'start', type: 'multiChoice', parameters: { question: 'Where first?', choices: [
    { id: 'a', text: 'The desk', target: 'desk' }, { id: 'b', text: 'Straight on', target: 'door' },
  ] } },
  { id: 'desk', type: 'addRemoveInventory', parameters: { action: 'add', item: 'notebook', quantity: 1 }, connections: [{ targetId: 'door' }] },
  { id: 'door', type: 'infoText', parameters: { text: 'With the notebook you read, the code is easy.' }, connections: [{ targetId: 'end' }] },
  { id: 'end', type: 'endScreen', parameters: { message: 'The end' } },
];

function candidatesFor(beats: any[], characters?: any[]) {
  const story = buildStory(beats, characters);
  const analyzer = new StateSimulationAnalyzer(story);
  const arrivals = arrivalStates(analyzer.analyzeRaw());
  const hubs = [...arrivals].filter(([, l]) => arrivesDifferently(l)).map(([id]) => id);
  const incoming = new Map<string, string[]>();
  for (const b of beats) {
    for (const t of [...(b.connections ?? []).map((c: any) => c.targetId), ...(b.parameters?.choices ?? []).map((c: any) => c.target)]) {
      incoming.set(t, [...(incoming.get(t) ?? []), b.id]);
    }
  }
  return selectCandidates({
    beats: story.getAllBeats().map((b: any) => ({ id: b.id, name: b.name, type: b.type, speaker: b.speaker, parameters: b.getParameters() })),
    arrivals, hubBeats: hubs, incoming, affectOf: (st) => analyzer.affectAt(st) as any,
  });
}

const reply = (findings: any[]) => JSON.stringify({ findings });
const good = { beatId: 'door', kind: 'assumes-missing-state', quote: 'the notebook you read', state: 0, why: 'This state has no notebook.', severity: 'problem', suggestion: 'Reword it.' };

describe('what the model is given', () => {
  it('a beat reached in different states is a candidate, with each state in words', () => {
    const c = candidatesFor(notebookBeats()).find((x) => x.beatId === 'door')!;
    expect(c.words).toEqual(['With the notebook you read, the code is easy.']);
    expect(c.arrivingStates).toHaveLength(2);
    expect(c.arrivingStates.some((s) => s.startsWith('has: notebook'))).toBe(true);
    expect(c.arrivingStates.some((s) => s.startsWith('has no items'))).toBe(true);
    expect(c.before.some((b) => b.includes('Where first?'))).toBe(true);
    expect(c.statePaths[0]?.at(-1)).toBe('door');
  });

  it('feelings and casting are part of a state', () => {
    const state: any = { variables: new Map([['brave', true]]), counters: new Map([['score', 2]]), inventory: new Map([['player', new Set(['coin'])]]), itemCounts: new Map([['player\u0001coin', 3]]), visitedBeats: new Set() };
    const text = describeState(state, { affect: { roleHolders: { confidant: 't' }, characterSentiments: { t: [{ toEntityRef: 'player', emotion: 'trust', strength: 0.6 }] } }, nameOf: (r) => (r === 't' ? 'Tomas' : r) });
    expect(text).toContain('has: 3 coin');
    expect(text).toContain('brave = true');
    expect(text).toContain('score = 2');
    expect(text).toContain('@confidant is Tomas');
    expect(text).toContain('Tomas feels trust toward player: 0.6');
  });

  it('collects Dialog Tree lines and replies, not setting values', () => {
    expect(beatWords({ dialogTree: { text: 'Hi', choices: [{ text: 'Hello', dialogNode: { text: 'Bye', choices: [] } }] }, spatialFit: 'cover' })).toEqual(['Hi', 'Hello', 'Bye']);
  });

  it('a beat with no words to judge, or one way of arriving, is left out', () => {
    const c = candidatesFor([
      { id: 'a', type: 'infoText', parameters: { text: 'One way.' }, connections: [{ targetId: 'b' }] },
      { id: 'b', type: 'endScreen', parameters: { message: 'End' } },
    ]);
    expect(c).toEqual([]);
  });
});

describe('the check before an author sees a finding', () => {
  const batch = () => candidatesFor(notebookBeats());
  it('keeps a grounded finding, quote matched across case and whitespace', () => {
    const r = validateFindings(reply([{ ...good, quote: 'THE  notebook\nyou read' }]), batch());
    expect(r.dropped).toEqual([]);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0].key).toBe(findingKey('door', 'assumes-missing-state', 'the notebook you read'));
  });
  it.each([
    ['a quote not in the beat', { ...good, quote: 'the map you stole' }],
    ['a beat it was not given', { ...good, beatId: 'elsewhere' }],
    ['a state it was not given', { ...good, state: 9 }],
    ['an unknown kind', { ...good, kind: 'plot-hole' }],
    ['no reason', { ...good, why: '' }],
  ])('drops %s', (_name, f) => {
    const r = validateFindings(reply([f]), batch());
    expect(r.findings).toEqual([]);
    expect(r.dropped).toHaveLength(1);
  });
  it('a reply that is no JSON finds nothing', () => {
    expect(validateFindings('Sorry, I cannot.', batch()).findings).toEqual([]);
  });
});

describe('a run', () => {
  const many = (n: number): StoryLogicCandidate[] => Array.from({ length: n }, (_, i) => ({
    beatId: `b${i}`, type: 'infoText', words: ['x'.repeat(100)], arrivingStates: ['s'], before: [], pathCount: n - i, statePaths: [[]], cacheKey: `k${i}`,
  }));

  it('batches by count and by size', () => {
    expect(makeBatches(many(30)).map((b) => b.length)).toEqual([12, 12, 6]);
    const big = many(3).map((c) => ({ ...c, words: ['y'.repeat(15000)] }));
    expect(makeBatches(big)).toHaveLength(3);
  });

  it('estimates its size; the first pass covers about half the path visits', () => {
    const list = many(40);
    expect(estimateRun(list, 4000).batches).toBe(4);
    expect(estimateRun(list, 4000).inputTokens).toBeGreaterThan(4000);
    const first = firstPass(list);
    expect(first.length).toBeLessThan(list.length);
    const sum = (l: StoryLogicCandidate[]) => l.reduce((n, c) => n + c.pathCount, 0);
    expect(sum(first)).toBeGreaterThanOrEqual(sum(list) / 2);
  });

  it('hands over each batch, sends the digest as context and schema, and stops on cancel', async () => {
    const complete = vi.fn(async () => reply([]));
    const onBatch = vi.fn();
    await runStoryLogicCheck(many(13), 'THE DIGEST', complete, { onBatch });
    expect(complete).toHaveBeenCalledTimes(2);
    expect(onBatch).toHaveBeenCalledTimes(2);
    const opts = (complete.mock.calls[0] as any[])[2];
    expect(opts.systemContext).toContain('THE DIGEST');
    expect(opts.schema).toBeTruthy();

    const controller = new AbortController();
    const cancelling = vi.fn(async () => { controller.abort(); return reply([]); });
    const onBatch2 = vi.fn();
    await runStoryLogicCheck(many(13), '', cancelling, { onBatch: onBatch2, signal: controller.signal });
    expect(cancelling).toHaveBeenCalledTimes(1);
    expect(onBatch2).not.toHaveBeenCalled();
  });

  it('a failing request keeps what was checked before it', async () => {
    const complete = vi.fn().mockResolvedValueOnce(reply([])).mockRejectedValueOnce(new Error('overloaded'));
    const onBatch = vi.fn();
    await expect(runStoryLogicCheck(many(13), '', complete, { onBatch })).rejects.toThrow('overloaded');
    expect(onBatch).toHaveBeenCalledTimes(1);
  });
});

describe('the store', () => {
  it('an unchanged beat is not checked again; changed words check it again and retire its findings', () => {
    const candidates = candidatesFor(notebookBeats());
    const door = candidates.find((c) => c.beatId === 'door')!;
    const { findings } = validateFindings(reply([good]), candidates);
    const store = mergeChecked(null, Object.fromEntries(candidates.map((c) => [c.beatId, { key: c.cacheKey, findings: findings.filter((f) => f.beatId === c.beatId) }])));
    expect(pendingCandidates(candidates, store)).toEqual([]);
    expect(visibleFindings(candidates, store)).toHaveLength(1);

    const edited = notebookBeats();
    edited[2].parameters!.text = 'The code is easy now.';
    const after = candidatesFor(edited);
    expect(pendingCandidates(after, store).map((c) => c.beatId)).toContain(door.beatId);
    expect(visibleFindings(after, store)).toEqual([]);
  });

  it('a dismissed finding stays dismissed, and the dismissal survives a later run', () => {
    const candidates = candidatesFor(notebookBeats());
    const { findings } = validateFindings(reply([good]), candidates);
    const checked = Object.fromEntries(candidates.map((c) => [c.beatId, { key: c.cacheKey, findings: findings.filter((f) => f.beatId === c.beatId) }]));
    const dismissed = dismissFinding(mergeChecked(null, checked), findings[0].key);
    expect(visibleFindings(candidates, dismissed)).toEqual([]);
    expect(visibleFindings(candidates, mergeChecked(dismissed, checked))).toEqual([]);
  });
});
