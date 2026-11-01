/**
 * AI Story Logic without a model: real path simulation, a scripted reply.
 * Covers what the model is given, batching, the cache and the check every
 * finding must pass before an author sees it.
 */
import { describe, it, expect, vi } from 'vitest';
import { BeatTypeRegistry, Story, StateSimulationAnalyzer, arrivalStates, arrivesDifferently } from '@asaps/core';
import {
  beatScript, beatWords, describeState, dismissFinding, estimateRun, estimateRunCost, firstPass, findingKey, makeBatches, mergeChecked, pendingCandidates,
  runStoryLogicCheck, selectCandidates, validateFindings, visibleFindings, type StoryLogicCandidate,
} from '../storyLogicReview';
import { NO_SPEND, createSpendMeter, describeSpend } from '../aiPricing';

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

describe('what the model reads about a beat', () => {
  const tree = {
    dialogTree: {
      speaker: 'Narrator', text: 'Wiard waits.',
      choices: [
        { continue: true, conditions: [{ type: 'visitedBeat', beatId: 'shame', operator: '==' }], text: '', dialogNode: { speaker: 'Wiard', text: 'You again.', choices: [] } },
        { continue: true, text: '', dialogNode: { speaker: 'Gudrun', text: 'Good cloth.', choices: [
          { text: 'Thanks.', conditions: [{ type: 'visitedBeat', beatId: '', operator: '==' }] },
        ] } },
      ],
    },
  };

  it('shows speakers, gated lines in order, and a gate with no beat', () => {
    const script = beatScript(tree, { beatName: (id) => (id === 'shame' ? 'Refuse loudly' : id) });
    expect(script).toEqual([
      'Narrator: Wiard waits.',
      '[next line only if visited "Refuse loudly"]',
      '  Wiard: You again.',
      '[otherwise, next line]',
      '  Gudrun: Good cloth.',
      '  Reply: Thanks. [shown only if visited (no beat chosen: this condition is never true)]',
    ]);
  });

  it('leaves speaker labels out when the story hides names', () => {
    expect(beatScript(tree, { speakerNames: false })[0]).toBe('Wiard waits.');
  });

  it('a gated choice with no words is a button with no label, and keeps its gate', () => {
    const script = beatScript({ dialogTree: { speaker: 'A', text: 'One.', choices: [
      { text: '', conditions: [{ type: 'visitedBeat', beatId: 'b', operator: '==' }], dialogNode: { speaker: 'B', text: 'Two.' } },
      { text: '', dialogNode: { speaker: 'C', text: 'Three.' } },
    ] } });
    expect(script).toEqual(['A: One.', 'Reply: (a button with no label) [shown only if visited "b"]', '  B: Two.', 'Reply: (a button with no label)', '  C: Three.']);
  });

  it('of two next lines with no conditions the second never plays, as in the engine', () => {
    const script = beatScript({ dialogTree: { speaker: 'A', text: 'One.', choices: [
      { continue: true, text: '', dialogNode: { speaker: 'B', text: 'Two.' } },
      { continue: true, text: '', dialogNode: { speaker: 'C', text: 'Three.' } },
    ] } });
    expect(script).toEqual(['A: One.', 'B: Two.', '[this next line never plays: the one before it always does]', '  C: Three.']);
  });

  it('a plain next line is not called a branch', () => {
    const script = beatScript({ dialogTree: { speaker: 'A', text: 'One.', choices: [{ continue: true, text: '', dialogNode: { speaker: 'B', text: 'Two.' } }] } });
    expect(script).toEqual(['A: One.', 'B: Two.']);
  });

  it('adding a gate checks the beat again, and quotes still match the words alone', () => {
    const arrivals = new Map([['x', [
      { state: { inventory: new Map(), variables: new Map([['a', 1]]), counters: new Map() }, path: { steps: [] }, stepIndex: 0, pathCount: 1 },
    ]]]) as any;
    const make = (conditions?: unknown[]) => selectCandidates({
      beats: [{ id: 'x', type: 'multiChoice', parameters: { question: 'Q?', choices: [{ text: 'Go', conditions }] } }],
      arrivals, hubBeats: ['x'], incoming: new Map(),
    })[0];
    expect(make().cacheKey).not.toBe(make([{ type: 'inventory', item: 'Key' }]).cacheKey);
    expect(make().words).toEqual(['Q?', 'Go']);
  });

  it('keeps the spend figures across merges and dismissals', () => {
    const spent = { ...NO_SPEND, calls: 3 };
    const store = { version: 1 as const, dismissed: [], checked: {}, spent, lastRun: spent };
    expect(mergeChecked(store, {}).spent).toBe(spent);
    expect(dismissFinding(store, 'k').lastRun).toBe(spent);
  });
});

describe('what a check costs', () => {
  const totals = (over: object) => [{ route: 'story-logic', model: 'claude-opus-5-5', calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, ...over }];

  it('counts each request once, at the model price', () => {
    let now = totals({});
    const meter = createSpendMeter('story-logic', () => now);
    now = totals({ calls: 1, inputTokens: 1_000_000, cacheReadTokens: 1_000_000, cacheWriteTokens: 1_000_000, outputTokens: 1_000_000 });
    expect(meter().costUsd).toBeCloseTo(4 + 0.2 + 5 + 20);
    expect(meter().calls).toBe(0);
  });

  it('a model with no known price stays in tokens, and other routes are not counted', () => {
    const now = [...totals({ model: 'llama3', calls: 2, inputTokens: 5000, outputTokens: 900 }), { ...totals({ calls: 9 })[0], route: 'conversation' }];
    let current: typeof now = [];
    const meter = createSpendMeter('story-logic', () => current);
    current = now;
    const s = meter();
    expect(s).toMatchObject({ calls: 2, unpricedCalls: 2, costUsd: 0 });
    expect(describeSpend(s)).toBe('5k tokens in, 0 from cache, 900 out, 2 requests');
  });

  it('sees totals that are updated in place', () => {
    const live = totals({ calls: 1, inputTokens: 100, outputTokens: 10 });
    const meter = createSpendMeter('story-logic', () => live);
    live[0].calls = 2; live[0].inputTokens = 300;
    expect(meter()).toMatchObject({ calls: 1, inputTokens: 200 });
    live[0].calls = 3; live[0].inputTokens = 450;
    expect(meter()).toMatchObject({ calls: 1, inputTokens: 150 });
  });

  it('estimates caching the shared part, and goes by real output when it can', () => {
    const e = { batches: 2, inputTokens: 2_200_000, sharedTokens: 1_000_000, maxOutputTokens: 8000 };
    const p = { input: 1, cacheWrite: 2, cacheRead: 0.5, output: 100 };
    expect(estimateRunCost(e, p, 500)).toBeCloseTo(0.2 + 2 + 0.5 + 0.1);
    expect(estimateRunCost(e, p)).toBeCloseTo(0.2 + 2 + 0.5 + 0.2);
  });
});
