/**
 * Path analysis plays what the engine plays (2026-10-31). Each case is a
 * small story the simulator used to get wrong: an ending it reported that
 * the story can't reach, or one it missed.
 */
import { describe, it, expect } from 'vitest';
import { StateSimulationAnalyzer } from '../../src/analysis/StateSimulationAnalyzer';
import { ReachabilityAnalyzer } from '../../src/analysis/ReachabilityAnalyzer';
import { buildPathTree, type PathTreeNode } from '../../src/analysis/PathTree';
import { Story } from '../../src/engine/Story';
import { createTestBeat } from '../test-utils';

function story(beats: any[], characters?: any[]): Story {
  const s = new Story({ title: 'T', author: 'T', firstBeatId: beats[0].id });
  for (const b of beats) {
    const beat = createTestBeat({ name: b.id, ...b } as any);
    if (b.locations) beat.locations = new Map(b.locations.map((l: any) => [l.id, l]));
    s.addBeat(beat);
  }
  if (characters) (s as any).getCharacters = () => characters;
  return s;
}

const end = (id: string) => ({ id, type: 'endScreen', parameters: { message: id } });
const check = (condition: Record<string, any>, extra: Record<string, any> = {}) =>
  ({ id: 'check', type: 'conditionBeat', parameters: { ...condition, ...extra, trueTarget: 'yes', falseTarget: 'no' } });
const flagCheck = check({ conditionType: 'variable', variableName: 'flag', operator: '==', value: true });

function endings(s: Story): string[] {
  const r = new StateSimulationAnalyzer(s).analyze();
  return [...new Set(r.outcomes.filter((o: any) => o.endType === 'ending').map((o: any) => o.endingBeatId))].sort();
}

const setFlag = [{ type: 'setVariable', target: 'flag', value: true }];

describe('path analysis follows the engine', () => {
  it('branches on every Free Layout button, with its effects', () => {
    const s = story([
      { id: 'fl', type: 'freeLayout', parameters: { choices: [
        { id: 'b1', locationName: 'Button', text: 'Plain', target: 'check' },
        { id: 'b2', locationName: 'Picture', text: '', target: 'check', effects: setFlag },
        { id: 'b3', locationName: 'Deleted', target: 'gone' },
      ] }, locations: [{ id: 'e1', name: 'Button', kind: 'button' }, { id: 'e2', name: 'Picture', kind: 'prop' }] },
      flagCheck, end('yes'), end('no'), end('gone'),
    ]);
    expect(endings(s)).toEqual(['no', 'yes']);
  });

  it('a choice beat with one way out still applies its effects', () => {
    const s = story([
      { id: 'mc', type: 'multiChoice', parameters: { question: '?', choices: [{ id: 'c', text: 'Go', target: 'check', effects: setFlag }] } },
      flagCheck, end('yes'), end('no'),
    ]);
    expect(endings(s)).toEqual(['yes']);
  });

  it('a Dialog Tree reply counts on the way to a line\'s own exit', () => {
    const s = story([
      { id: 'd', type: 'dialogTree', parameters: { dialogTree: { id: 'r', speaker: 'Bob', text: 'Hi', choices: [
        { id: 'c1', text: 'Insult', effects: setFlag, dialogNode: { id: 'n1', speaker: 'Bob', text: 'Out', target: 'check' } },
        { id: 'c2', text: 'Greet', dialogNode: { id: 'n2', speaker: 'Bob', text: 'Hello', target: 'check' } },
      ] } } },
      flagCheck, end('yes'), end('no'),
    ]);
    expect(endings(s)).toEqual(['no', 'yes']);
  });

  it("a Dialog Tree's own default link doesn't borrow a reply's condition or effects", () => {
    const s = story([
      { id: 'd', type: 'dialogTree', defaultTarget: 'check', parameters: { dialogTree: { id: 'r', speaker: 'Bob', text: 'Hi', choices: [
        { id: 'c1', text: 'Show the key', target: 'check', effects: setFlag,
          conditions: [{ type: 'variable', variableName: 'hasKey', operator: '==', value: true }] },
      ] } } },
      flagCheck, end('yes'), end('no'),
    ]);
    // The reply is hidden (no key); the default link plays without its effects.
    expect(endings(s)).toEqual(['no']);
  });

  it('a choice that stays on the beat still changes state', () => {
    const s = story([
      { id: 'mc', type: 'multiChoice', parameters: { question: '?', choices: [
        { id: 'c1', text: 'Search the desk', target: '__self__', effects: setFlag },
        { id: 'c2', text: 'Leave', target: 'check' },
      ] } },
      flagCheck, end('yes'), end('no'),
    ]);
    expect(endings(s)).toEqual(['no', 'yes']);
  });

  it('a choice hidden by its conditions is not taken', () => {
    const s = story([
      { id: 'mc', type: 'multiChoice', parameters: { question: '?', choices: [
        { id: 'c1', text: 'Use key', target: 'yes', conditions: [{ type: 'variable', variableName: 'hasKey', operator: '==', value: true }] },
        { id: 'c2', text: 'Walk away', target: 'no' },
      ] } },
      end('yes'), end('no'),
    ]);
    expect(endings(s)).toEqual(['no']);
  });

  it('a hidden choice does not hide a plain one to the same beat', () => {
    const s = story([
      { id: 'mc', type: 'multiChoice', parameters: { question: '?', choices: [
        { id: 'c1', text: 'Pay with gold', target: 'yes', conditions: [{ type: 'variable', variableName: 'gold', operator: '>=', value: 5 }] },
        { id: 'c2', text: 'Ask nicely', target: 'yes' },
      ] } },
      end('yes'),
    ]);
    const r = new StateSimulationAnalyzer(s).analyze();
    expect(endings(s)).toEqual(['yes']);
    expect(r.outcomes.some((o: any) => o.endType === 'deadEnd')).toBe(false);
  });

  it('an unmet requirement jumps to its fallback before the beat shows', () => {
    const s = story([
      { id: 'door', type: 'infoText', parameters: { text: 'The door opens' }, connections: [{ targetId: 'yes' }],
        requires: [{ condition: { type: 'variable', variableName: 'hasKey', operator: '==', value: true }, fallbackTarget: 'no' }] },
      end('yes'), end('no'),
    ]);
    expect(endings(s)).toEqual(['no']);
  });

  it('requirements that redirect back and forth end as a cycle, not a runaway search', () => {
    const needs = (v: string, fallbackTarget: string) => [{ condition: { type: 'variable', variableName: v, operator: '==', value: true }, fallbackTarget }];
    const s = story([
      { id: 'a', type: 'infoText', parameters: { text: 'A' }, connections: [{ targetId: 'yes' }], requires: needs('x', 'b') },
      { id: 'b', type: 'infoText', parameters: { text: 'B' }, connections: [{ targetId: 'yes' }], requires: needs('y', 'a') },
      end('yes'),
    ]);
    const analyzer = new StateSimulationAnalyzer(s);
    const r = analyzer.analyze();
    expect(analyzer.truncated).toBe(false);
    expect(r.outcomes.some((o: any) => o.endType === 'cycle')).toBe(true);
  });

  it('a Condition Check with more conditions matches all or any', () => {
    const beats = (match: 'all' | 'any') => [
      { id: 'set', type: 'setVariable', parameters: { name: 'a', value: true }, connections: [{ targetId: 'check' }] },
      check({ conditionType: 'variable', variableName: 'a', operator: '==', value: true },
        { moreConditions: [{ type: 'variable', variableName: 'b', operator: '==', value: true }], conditionsMatch: match }),
      end('yes'), end('no'),
    ];
    expect(endings(story(beats('all')))).toEqual(['no']);
    expect(endings(story(beats('any')))).toEqual(['yes']);
  });

  it('counts items: two coins less one is still a coin; quantity checks compare amounts', () => {
    const inv = (id: string, action: string, quantity: number, next: string) =>
      ({ id, type: 'addRemoveInventory', parameters: { action, item: 'coin', quantity }, connections: [{ targetId: next }] });
    expect(endings(story([inv('a', 'add', 2, 'r'), inv('r', 'remove', 1, 'check'),
      check({ conditionType: 'inventory', item: 'coin', checkType: 'has' }), end('yes'), end('no')]))).toEqual(['yes']);
    expect(endings(story([inv('a', 'add', 1, 'check'),
      check({ conditionType: 'inventory', item: 'coin', checkType: 'quantity', quantityCheck: true, quantityOperator: '>=', quantityValue: 3 }),
      end('yes'), end('no')]))).toEqual(['no']);
  });

  it('another character\'s items are not the player\'s', () => {
    const s = story([
      check({ conditionType: 'inventory', item: 'Lantern', checkType: 'has' }), end('yes'), end('no'),
    ], [{ id: 'shop', name: 'Shopkeeper', inventory: [{ name: 'Lantern' }] }]);
    expect(endings(s)).toEqual(['no']);
  });

  it('two characters\' counters of one name are kept apart', () => {
    const s = story([
      { id: 'mc', type: 'multiChoice', parameters: { question: '?', choices: [{ id: 'c', text: 'Talk', target: 'check', effects: [
        { type: 'incrementCounter', target: 'trust', value: 1, character: 'mara' },
        { type: 'incrementCounter', target: 'trust', value: 1, character: 'jonas' },
      ] }] } },
      check({ conditionType: 'counter', variableName: 'trust', operator: '>=', value: 2, character: 'mara' }),
      end('yes'), end('no'),
    ], [
      { id: 'mara', name: 'Mara', counters: [{ name: 'trust', value: 0 }] },
      { id: 'jonas', name: 'Jonas', counters: [{ name: 'trust', value: 0 }] },
    ]);
    expect(endings(s)).toEqual(['no']);
  });

  it('a Set Timer\'s "time runs out" link is followed', () => {
    const s = story([
      // As the builder saves it: the timer link and the way on in connections.
      { id: 't', type: 'setTimer', parameters: { timerName: 'T', value: 30, timerTarget: 'late', continueTarget: 'yes' },
        connections: [{ targetId: 'late', label: 'Timer Target' }, { targetId: 'yes' }] },
      end('yes'), end('late'),
    ]);
    expect(endings(s)).toEqual(['late', 'yes']);
    expect(new ReachabilityAnalyzer(s).analyze().unreachableBeats).toEqual([]);
  });

  it('a path cut off at the depth limit is not a dead end', () => {
    const chain = Array.from({ length: 10 }, (_, i) =>
      ({ id: `b${i}`, type: 'infoText', parameters: { text: `${i}` }, connections: i < 9 ? [{ targetId: `b${i + 1}` }] : [] }));
    const s = story(chain);
    const r = new StateSimulationAnalyzer(s, { maxDepth: 5 }).analyze();
    expect(r.outcomes.map((o: any) => o.endType)).toEqual(['depthLimit']);
    const tree = buildPathTree(new StateSimulationAnalyzer(s, { maxDepth: 5 }).analyzeRaw(), s);
    expect(terminals(tree.root).map(n => n.endType)).toEqual(['depthLimit']);
  });

  it('the path tree keeps a trap a trap', () => {
    const s = story([
      { id: 'hub', type: 'multiChoice', parameters: { question: '?', choices: [
        { id: 'a', text: 'Look left', target: 'left' }, { id: 'b', text: 'Look right', target: 'right' },
      ] } },
      { id: 'left', type: 'infoText', parameters: { text: 'L' }, connections: [{ targetId: 'hub' }] },
      { id: 'right', type: 'infoText', parameters: { text: 'R' }, connections: [{ targetId: 'hub' }] },
    ]);
    const paths = new StateSimulationAnalyzer(s).analyzeRaw();
    expect(paths.every(p => p.outcome.type === 'stuck')).toBe(true);
    // The tree folds the loop into a hub; with no way out, the player is stuck.
    const root = buildPathTree(paths, s).root;
    expect(root.type).toBe('hub');
    expect(root.endType).toBe('stuck');
  });
});


describe('the path tree says what a choice does', () => {
  it('names variable changes, lost items and feelings, and spells out a sentiment check', () => {
    const chars = [{ id: 'c1', name: 'Tomas' }];
    const s = story([
      { id: 'start', type: 'infoText', parameters: { text: 'Go' }, connections: [{ targetId: 'mc' }] },
      { id: 'mc', type: 'multiChoice', parameters: { question: '?', choices: [
        { id: 'a', text: 'Back him', target: 'check', effects: [
          { type: 'setVariable', target: 'brave', value: true },
          { type: 'addSentiment', target: 'Tomas', sentimentTarget: 'player', sentimentEmotion: 'trust', strengthDelta: 0.6 }] },
        { id: 'b', text: 'Stay quiet', target: 'check' },
      ] } },
      { id: 'check', type: 'conditionBeat', parameters: { conditionType: 'sentiment', character: 'Tomas', sentimentTarget: 'player',
        sentimentEmotion: 'trust', operator: '>=', value: 0.5, trueTarget: 'yes', falseTarget: 'no' } },
      end('yes'), end('no'),
    ], chars);
    const tree = buildPathTree(new StateSimulationAnalyzer(s).analyzeRaw(), s);
    const variants = allNodes(tree.root).flatMap(n => n.beats).flatMap(b => b.choiceVariants ?? []);
    const back = variants.find(v => v.label === 'Back him');
    expect(back?.stateEffects).toEqual(expect.arrayContaining(['brave = true', 'Tomas trust → player +0.6']));
    const branch = allNodes(tree.root).find(n => n.conditionAnnotation);
    expect(branch?.conditionAnnotation?.conditionText).toBe('Tomas trust → player >= 0.5');
  });

  it('names a second coin, not just the first', () => {
    const s = story([
      { id: 'start', type: 'addRemoveInventory', parameters: { action: 'add', item: 'coin', quantity: 1 }, connections: [{ targetId: 'shop' }] },
      { id: 'shop', type: 'multiChoice', parameters: { question: '?', choices: [
        { id: 'buy', text: 'Buy one more', target: '__self__', effects: [{ type: 'addInventory', target: 'coin' }] },
        { id: 'go', text: 'Leave', target: 'out' },
      ] } },
      end('out'),
    ]);
    const tree = buildPathTree(new StateSimulationAnalyzer(s).analyzeRaw(), s);
    // The coin from the start beat is no choice's doing; buying another is.
    const labels: string[] = [];
    JSON.stringify(tree.root, (k, v) => { if (k === 'stateEffects' && Array.isArray(v)) labels.push(...v); return v; });
    expect(labels).toContain('+coin');
  });
});

function allNodes(n: PathTreeNode): PathTreeNode[] {
  return [n, ...n.children.flatMap(c => allNodes(c.child)), ...(n.hubExitNode ? allNodes(n.hubExitNode) : [])];
}

function terminals(n: PathTreeNode): PathTreeNode[] {
  const out = n.type === 'ending' || n.type === 'deadEnd' ? [n] : [];
  for (const c of n.children) out.push(...terminals(c.child));
  if (n.hubExitNode) out.push(...terminals(n.hubExitNode));
  return out;
}

describe('long scenes and large stories', () => {
  const deepTree = (levels: number, target: string) => {
    const root: any = { speaker: 'A', text: 'Line 0', choices: [] };
    let node = root;
    for (let i = 1; i < levels; i++) {
      const next: any = { speaker: 'A', text: `Line ${i}`, choices: [] };
      node.choices = [{ id: `c${i}`, text: '', continue: true, dialogNode: next }];
      node = next;
    }
    node.target = target;
    return root;
  };
  const build = (beats: any[]) => story(beats);
  const beatsOnPaths = (result: any) => new Set<string>(result.outcomes.flatMap((o: any) => (o.pathVariations ?? []).flatMap((v: any) => v.pathBeatIds ?? [])));

  it('follows the exit of a scene nested deeper than 20 lines', () => {
    const story = build([
      { id: 'a', type: 'dialogTree', name: 'Long', parameters: { dialogTree: deepTree(30, 'end') } },
      { id: 'end', type: 'endScreen', name: 'End', parameters: { message: 'x', showRestart: false } },
    ]);
    expect(story.getBeat('a')!.getConnections().map((c: any) => c.targetId)).toContain('end');
    expect(beatsOnPaths(new StateSimulationAnalyzer(story).analyze()).has('end')).toBe(true);
  });

  it('when the budget runs out on breadth, still reaches beats behind a late gate', () => {
    // Ten two-way choices: 1024 ways through, far over a budget of 50 paths.
    const beats: any[] = [];
    for (let i = 0; i < 10; i++) {
      beats.push({ id: `q${i}`, type: 'multiChoice', name: `Q${i}`, parameters: { question: 'q', choices: [
        { id: 'l', text: 'L', target: i < 9 ? `q${i + 1}` : 'gate', ...(i === 0 ? { effects: [{ type: 'setVariable', target: 'key', value: 'yes' }] } : {}) },
        { id: 'r', text: 'R', target: i < 9 ? `q${i + 1}` : 'gate' },
      ] } });
    }
    beats.push({ id: 'gate', type: 'multiChoice', name: 'Gate', parameters: { question: 'g', choices: [
      { id: 'o', text: 'Open', target: 'secret', conditions: [{ type: 'variable', variableName: 'key', operator: '==', value: 'yes' }] },
      { id: 'c', text: 'Leave', target: 'end' },
    ] } });
    beats.push({ id: 'secret', type: 'infoText', name: 'Secret', parameters: { text: 's' }, connections: [{ targetId: 'end' }] });
    beats.push({ id: 'end', type: 'endScreen', name: 'End', parameters: { message: 'x', showRestart: false } });
    const analyzer = new StateSimulationAnalyzer(build(beats), { maxPaths: 2, maxFrontier: 4 });
    const on = beatsOnPaths(analyzer.analyze());
    expect(analyzer.truncated).toBe(true);
    expect(on.has('secret')).toBe(true);
    expect(on.has('end')).toBe(true);
  });

  it('a story that fits the budget gets no extra pass', () => {
    const story = build([
      { id: 'a', type: 'multiChoice', name: 'A', parameters: { question: 'q', choices: [{ id: 'x', text: 'X', target: 'e1' }, { id: 'y', text: 'Y', target: 'e2' }] } },
      { id: 'e1', type: 'endScreen', name: 'E1', parameters: { message: 'x', showRestart: false } },
      { id: 'e2', type: 'endScreen', name: 'E2', parameters: { message: 'x', showRestart: false } },
    ]);
    const analyzer = new StateSimulationAnalyzer(story);
    expect(analyzer.analyzeRaw()).toHaveLength(2);
    expect(analyzer.truncated).toBe(false);
  });
});

describe('Dialog Tree routes follow the runtime', () => {
  const run = (dialogTree: any) => {
    const story = new Story({ title: 'T', author: 'T', firstBeatId: 'd' });
    story.addBeat(createTestBeat({ id: 'd', name: 'D', type: 'dialogTree', parameters: { dialogTree } } as any));
    for (const id of ['a', 'b']) story.addBeat(createTestBeat({ id, name: id, type: 'endScreen', parameters: { text: id } } as any));
    return new StateSimulationAnalyzer(story, { maxPaths: 50, maxDepth: 10 }).analyzeRaw();
  };
  const ends = (paths: any[]) => paths.map((p) => `${p.outcome.beatId}:${p.outcome.type}`).sort();

  it('a reply that goes nowhere stops the story', () => {
    expect(ends(run({ id: 'r', speaker: 'N', text: 't', choices: [
      { id: 'x', text: 'Nowhere' },
      { id: 'y', text: 'On', target: 'a' },
    ] }))).toEqual(['a:ending', 'd:deadEnd']);
  });

  it('a next line behind one that always plays never plays', () => {
    expect(ends(run({ id: 'r', speaker: 'N', text: 't', choices: [
      { id: 'x', text: '', continue: true, target: 'a' },
      { id: 'y', text: '', continue: true, target: 'b' },
    ] }))).toEqual(['a:ending']);
  });

  it('a first next line with no exit stops the story, whatever follows it', () => {
    expect(ends(run({ id: 'r', speaker: 'N', text: 't', choices: [
      { id: 'x', text: '', continue: true, dialogNode: { id: 'n', speaker: 'N', text: 'end', choices: [] } },
      { id: 'y', text: '', continue: true, target: 'b' },
      { id: 'z', text: 'Reply', target: 'b' },
    ] }))).toEqual(['d:deadEnd']);
  });

  it('a later next line plays only when the earlier one does not', () => {
    const paths = run({ id: 'r', speaker: 'N', text: 't', choices: [
      { id: 'x', text: '', continue: true, conditions: [{ type: 'visitedBeat', beatId: 'b' }], target: 'b' },
      { id: 'y', text: '', continue: true, target: 'a' },
    ] });
    expect(ends(paths)).toEqual(['a:ending']);
  });

  it('every reply hidden stops the story; a line with an open reply does not', () => {
    expect(ends(run({ id: 'r', speaker: 'N', text: 't', choices: [
      { id: 'x', text: 'Gated', conditions: [{ type: 'visitedBeat', beatId: 'b' }], target: 'a' },
    ] }))).toEqual(['d:deadEnd']);
  });
});

describe('Every choice hidden', () => {
  it('skips the beat by its own link, as the runtime does, without any choice effects', () => {
    const story = new Story({ title: 'T', author: 'T', firstBeatId: 'm' });
    story.addBeat(createTestBeat({ id: 'm', name: 'M', type: 'multiChoice', parameters: { question: 'q', choices: [
      { id: 'x', text: 'Give', target: 'a', conditions: [{ type: 'inventory', item: 'Gold', operator: 'contains' }], effects: [{ type: 'setCounter', target: 'n', value: 1 }] },
      { id: 'y', text: 'Keep', target: 'b', conditions: [{ type: 'inventory', item: 'Gold', operator: 'contains' }] },
    ] }, connections: [{ targetId: 'a', label: 'Give' }, { targetId: 'b', label: 'Keep' }] } as any));
    for (const id of ['a', 'b']) story.addBeat(createTestBeat({ id, name: id, type: 'endScreen', parameters: { text: id } } as any));
    const paths = new StateSimulationAnalyzer(story, { maxPaths: 10, maxDepth: 5 }).analyzeRaw();
    expect(paths.map((p) => p.outcome.beatId)).toEqual(['a']);
    expect(paths[0].finalState.counters.get('n')).toBeUndefined();
  });
});

describe('finding gated routes in a large story', () => {
  it('tries an early flag a late gate needs, past running scores that multiply the states', () => {
    const story = new Story({ title: 'T', author: 'T', firstBeatId: 'flag' });
    const add = (b: any) => story.addBeat(createTestBeat(b));
    // An early flag, then many questions that each move a score no gate reads.
    add({ id: 'flag', name: 'flag', type: 'multiChoice', parameters: { question: 'q', choices: [
      { id: 'a', text: 'wake', target: 'q0', effects: [{ type: 'setVariable', target: 'wake', value: 1 }] },
      { id: 'b', text: 'alone', target: 'q0', effects: [{ type: 'setVariable', target: 'alone', value: 1 }] },
    ] } });
    for (let i = 0; i < 14; i++) {
      add({ id: `q${i}`, name: `q${i}`, type: 'multiChoice', parameters: { question: 'q', choices: [
        { id: 'a', text: 'x', target: i === 13 ? 'gate' : `q${i + 1}`, effects: [{ type: 'incrementCounter', target: 'x', value: 1 }] },
        { id: 'b', text: 'y', target: i === 13 ? 'gate' : `q${i + 1}`, effects: [{ type: 'incrementCounter', target: 'y', value: 1 }] },
        { id: 'c', text: 'z', target: i === 13 ? 'gate' : `q${i + 1}`, effects: [{ type: 'incrementCounter', target: 'z', value: 1 }] },
      ] } });
    }
    add({ id: 'gate', name: 'gate', type: 'multiChoice', parameters: { question: 'q', choices: [
      { id: 'a', text: 'w', target: 'e1', conditions: [{ type: 'variable', variableName: 'wake', operator: '==', value: '1' }] },
      { id: 'b', text: 'l', target: 'e2', conditions: [{ type: 'variable', variableName: 'alone', operator: '==', value: '1' }] },
    ] } });
    for (const id of ['e1', 'e2']) add({ id, name: id, type: 'endScreen', parameters: { text: id } });
    const paths = new StateSimulationAnalyzer(story, { maxPaths: 300, maxDepth: 40, maxExpansions: 2000, maxCoveragePaths: 300, maxCoverageExpansions: 3000 } as any).analyzeRaw();
    const ends = new Set(paths.map((p) => p.outcome.beatId));
    expect(ends.has('e1')).toBe(true);
    expect(ends.has('e2')).toBe(true);
  });

  it('goes back to a menu for a choice leading to what is still uncovered', () => {
    const story = new Story({ title: 'T', author: 'T', firstBeatId: 'hub' });
    const add = (b: any) => story.addBeat(createTestBeat(b));
    add({ id: 'hub', name: 'hub', type: 'multiChoice', parameters: { question: 'q', choices: [
      { id: 'a', text: 'A', target: 'seen' },
      { id: 'b', text: 'B', target: 'door', conditions: [{ type: 'visitedBeat', beatId: 'seen' }] },
    ] } });
    add({ id: 'seen', name: 'seen', type: 'infoText', parameters: { text: 't' }, connections: [{ targetId: 'hub' }] });
    add({ id: 'door', name: 'door', type: 'endScreen', parameters: { text: 'd' } });
    const ends = new StateSimulationAnalyzer(story, { maxPaths: 50, maxDepth: 20 }).analyzeRaw().map((p) => p.outcome.beatId);
    expect(ends).toContain('door');
  });
});

describe('Replay', () => {
  const build = (end: any, extra: any[] = []) => {
    const story = new Story({ title: 'T', author: 'T', firstBeatId: 'start' });
    story.addBeat(createTestBeat({ id: 'start', name: 'start', type: 'multiChoice', parameters: { question: 'q', choices: [
      { id: 'a', text: 'A', target: 'end', effects: [{ type: 'setVariable', target: 'flag', value: 'yes' }] },
      { id: 'b', text: 'B', target: 'gate', conditions: [{ type: 'variable', variableName: 'flag', operator: '==', value: 'yes' }] },
    ] } } as any));
    story.addBeat(createTestBeat({ id: 'end', name: 'end', type: 'endScreen', ...end } as any));
    story.addBeat(createTestBeat({ id: 'gate', name: 'gate', type: 'endScreen', parameters: { message: 'g', showRestart: false } } as any));
    for (const b of extra) story.addBeat(createTestBeat(b));
    return story;
  };
  const after = { id: 'after', name: 'after', type: 'infoText', parameters: { text: 't' } };
  const reached = (story: Story) => {
    const paths = new StateSimulationAnalyzer(story, { maxPaths: 100, maxDepth: 30 }).analyzeRaw();
    return { paths, seen: new Set(paths.flatMap((p) => p.steps.map((x) => x.beatId))) };
  };

  it("follows an end screen's own link, keeping the ending on its path", () => {
    const { paths, seen } = reached(build({ parameters: { message: 'e', reset: true }, connections: [{ targetId: 'after' }] }, [after]));
    expect(seen.has('after')).toBe(true);
    expect(paths.some((p) => p.outcome.beatId === 'end' && p.outcome.type === 'ending')).toBe(true);
    const via = paths.find((p) => p.steps.some((x) => x.beatId === 'after'))!;
    expect(via.decisions.at(-1)?.choiceMade).toBe('Replay');
  });

  it('keeps replays out of the outcome counts and the tree, but tells them apart', () => {
    const story = build({ parameters: { message: 'e', reset: true }, connections: [{ targetId: 'after' }] },
      [{ ...after, connections: [{ targetId: 'start' }] }]);
    const analyzer = new StateSimulationAnalyzer(story, { maxPaths: 100, maxDepth: 30 });
    const paths = analyzer.analyzeRaw();
    const result = analyzer.resultFromPaths(paths);
    expect(paths.some((p) => p.viaReplay)).toBe(true);
    expect(result.outcomes.every((o) => (o.pathVariations ?? []).every((v: any) => !v.simulatedPath?.viaReplay))).toBe(true);
    expect(result.replayOutcomes?.length).toBeGreaterThan(0);
    expect(result.totalConstraintSets).toBe(paths.filter((p) => !p.viaReplay).length);
    const tree = buildPathTree(paths, story);
    expect(tree.root?.type).not.toBe('hub');
  });

  it('the beat after a reset ending arrives with the reset state', () => {
    const { paths } = reached(build({ parameters: { message: 'e', reset: true }, connections: [{ targetId: 'after' }] }, [after]));
    const via = paths.find((p) => p.viaReplay)!;
    const i = via.steps.findIndex((x) => x.beatId === 'after');
    expect(via.steps[i - 1].stateAfter.variables.get('flag')).toBeUndefined();
  });

  it('after a reset-off ending it arrives with what was left', () => {
    const { paths } = reached(build({ parameters: { message: 'e', reset: false }, connections: [{ targetId: 'after' }] }, [after]));
    const via = paths.find((p) => p.viaReplay)!;
    const i = via.steps.findIndex((x) => x.beatId === 'after');
    expect(via.steps[i - 1].stateAfter.variables.get('flag')).toBe('yes');
  });

  it('Backward uses one playthrough when it can, and Replay for what only a replay reaches', () => {
    const story = build({ parameters: { message: 'e', reset: true }, connections: [{ targetId: 'after' }] }, [{ ...after, connections: [{ targetId: 'start' }] }]);
    const analyzer = new StateSimulationAnalyzer(story, { maxPaths: 100, maxDepth: 30 });
    const paths = analyzer.analyzeRaw();
    expect(analyzer.analyzeBackward('end', paths).requirements.every((r: any) => !r.decisions?.some((d: any) => d.choiceMade === 'Replay'))).toBe(true);
    expect(analyzer.analyzeBackward('end', paths).minimumSteps).toBe(2);
    expect(analyzer.analyzeBackward('after', paths).requirements.length).toBeGreaterThan(0);
  });

  it('does not follow it when the screen has no replay button', () => {
    const { seen } = reached(build({ parameters: { message: 'e', showRestart: false }, connections: [{ targetId: 'after' }] }, [after]));
    expect(seen.has('after')).toBe(false);
  });

  it('with reset off and a link, what was set stays and opens gates on the way round', () => {
    const linked = { id: 'after', name: 'after', type: 'infoText', parameters: { text: 't' }, connections: [{ targetId: 'start' }] };
    expect(reached(build({ parameters: { message: 'e', reset: false }, connections: [{ targetId: 'after' }] }, [linked])).seen.has('gate')).toBe(true);
  });

  it('with reset off and no link, leftovers do not count as a way in', () => {
    expect(reached(build({ parameters: { message: 'e', reset: false } })).seen.has('gate')).toBe(false);
  });

  it('with everything reset, it does not', () => {
    expect(reached(build({ parameters: { message: 'e', reset: true } })).seen.has('gate')).toBe(false);
  });

  it('a variable marked keep across restarts survives the reset', () => {
    const story = build({ parameters: { message: 'e', reset: true } });
    story.setSettings({ variables: [{ name: 'flag', type: 'string', defaultValue: 'no', keepOnRestart: true }] });
    expect(reached(story).seen.has('gate')).toBe(true);
  });

  it('adds no paths when everything was already on one', () => {
    const story = new Story({ title: 'T', author: 'T', firstBeatId: 'start' });
    story.addBeat(createTestBeat({ id: 'start', name: 'start', type: 'infoText', parameters: { text: 't' }, connections: [{ targetId: 'end' }] } as any));
    story.addBeat(createTestBeat({ id: 'end', name: 'end', type: 'endScreen', parameters: { message: 'e', reset: true }, connections: [{ targetId: 'start' }] } as any));
    expect(reached(story).paths).toHaveLength(1);
  });
});

describe('reachable means played', () => {
  const story = () => {
    const st = new Story({ title: 'T', author: 'T', firstBeatId: 'menu' });
    st.addBeat(createTestBeat({ id: 'menu', name: 'Menu', type: 'multiChoice', parameters: { question: 'q', choices: [
      { id: 'a', text: 'A', target: 'end' },
      { id: 'b', text: 'B', target: 'gated', conditions: [{ type: 'visitedBeat', beatId: 'orphan' }] },
    ] } } as any));
    st.addBeat(createTestBeat({ id: 'end', name: 'End', type: 'endScreen', parameters: { message: 'e', showRestart: false } } as any));
    st.addBeat(createTestBeat({ id: 'gated', name: 'Gated', type: 'infoText', parameters: { text: 't' }, connections: [{ targetId: 'after' }] } as any));
    st.addBeat(createTestBeat({ id: 'after', name: 'After', type: 'endScreen', parameters: { message: 'a', showRestart: false } } as any));
    st.addBeat(createTestBeat({ id: 'orphan', name: 'Orphan', type: 'infoText', parameters: { text: 't' } } as any));
    return st;
  };

  it('Path Analysis and Reachability give the same answer, with the reason', () => {
    const s = story();
    const analyzer = new StateSimulationAnalyzer(s, { maxPaths: 50, maxDepth: 10 });
    const paths = analyzer.analyzeRaw();
    const result = analyzer.resultFromPaths(paths);
    const played = new Set(paths.flatMap((p) => p.steps.map((x) => x.beatId)));
    const reach = new ReachabilityAnalyzer(s, { playedBeats: played }).analyze();
    expect(result.reachableBeats.sort()).toEqual(['end', 'menu']);
    expect([...reach.reachableBeats].sort()).toEqual(result.reachableBeats);
    expect(reach.unreachableBeats.map((u) => u.beatId).sort()).toEqual([...result.unreachableBeats].sort());
    const why = Object.fromEntries(reach.unreachableBeats.map((u) => [u.beatId, u.reason]));
    expect(why).toEqual({ gated: 'neverOffered', after: 'unreachableParent', orphan: 'orphaned' });
  });

  it('without played beats Reachability still means linked', () => {
    expect(new ReachabilityAnalyzer(story()).analyze().reachableBeats.has('gated')).toBe(true);
  });
});

describe('only an end screen is an ending', () => {
  const end = (beat: any) => {
    const story = new Story({ title: 'T', author: 'T', firstBeatId: beat.id });
    story.addBeat(createTestBeat(beat));
    return new StateSimulationAnalyzer(story, { maxPaths: 10, maxDepth: 5 }).analyzeRaw().map((p) => p.outcome.type);
  };
  it('an end screen is', () => {
    expect(end({ id: 'e', name: 'e', type: 'endScreen', parameters: { message: 'm' } })).toEqual(['ending']);
  });
  it('a scene with no way on is a dead end', () => {
    expect(end({ id: 'd', name: 'd', type: 'dialogTree', parameters: { dialogTree: { id: 'r', speaker: 'N', text: 't', choices: [] } } })).toEqual(['deadEnd']);
    expect(end({ id: 't', name: 't', type: 'infoText', parameters: { text: 't' } })).toEqual(['deadEnd']);
  });
  it('a scene whose reply returns to its start traps the player', () => {
    expect(end({ id: 'd', name: 'd', type: 'dialogTree', parameters: { dialogTree: { id: 'r', speaker: 'N', text: 't', choices: [{ id: 'c', text: 'Again', target: '__self__' }] } } })).toEqual(['stuck']);
  });

  it('a menu the path came back to, with a way out, is not a trap', () => {
    const story = new Story({ title: 'T', author: 'T', firstBeatId: 'hub' });
    story.addBeat(createTestBeat({ id: 'hub', name: 'hub', type: 'multiChoice', parameters: { question: 'q', choices: [
      { id: 'a', text: 'Look', target: 'room' }, { id: 'b', text: 'Leave', target: 'end' },
    ] } } as any));
    story.addBeat(createTestBeat({ id: 'room', name: 'room', type: 'infoText', parameters: { text: 't' }, connections: [{ targetId: 'hub' }] } as any));
    story.addBeat(createTestBeat({ id: 'end', name: 'end', type: 'endScreen', parameters: { message: 'e' } } as any));
    const types = new StateSimulationAnalyzer(story, { maxPaths: 10, maxDepth: 10 }).analyzeRaw().map((p) => p.outcome.type);
    expect(types).toContain('ending');
    expect(types).not.toContain('stuck');
  });

  it('a menu whose every choice comes back is a trap', () => {
    const story = new Story({ title: 'T', author: 'T', firstBeatId: 'hub' });
    story.addBeat(createTestBeat({ id: 'hub', name: 'hub', type: 'multiChoice', parameters: { question: 'q', choices: [
      { id: 'a', text: 'A', target: 'r1' }, { id: 'b', text: 'B', target: 'r2' },
    ] } } as any));
    for (const id of ['r1', 'r2']) story.addBeat(createTestBeat({ id, name: id, type: 'infoText', parameters: { text: 't' }, connections: [{ targetId: 'hub' }] } as any));
    const types = new StateSimulationAnalyzer(story, { maxPaths: 10, maxDepth: 10 }).analyzeRaw().map((p) => p.outcome.type);
    expect(types).toContain('stuck');
  });
});

describe('a screen with a timed exit', () => {
  it('has two ways on: the button, and letting the time run out', () => {
    const story = new Story({ title: 'T', author: 'T', firstBeatId: 'dodge' });
    const dodge = createTestBeat({ id: 'dodge', name: 'Dodge', type: 'infoText', parameters: { text: 'Quick!' }, connections: [{ targetId: 'safe' }] } as any);
    dodge.defaultTarget = 'hit';
    dodge.defaultTargetDelay = 3;
    story.addBeat(dodge);
    for (const id of ['safe', 'hit']) story.addBeat(createTestBeat({ id, name: id, type: 'endScreen', parameters: { message: id } } as any));
    const ends = new StateSimulationAnalyzer(story, { maxPaths: 10, maxDepth: 5 }).analyzeRaw().map((p) => p.outcome.beatId).sort();
    expect(ends).toEqual(['hit', 'safe']);
  });
});
