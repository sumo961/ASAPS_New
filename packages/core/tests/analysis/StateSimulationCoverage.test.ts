/**
 * Path analysis plays what the engine plays (2026-10-31). Each case is a
 * small story the simulator used to get wrong: an ending it reported that
 * the story can't reach, or one it missed.
 */
import { describe, it, expect } from 'vitest';
import { StateSimulationAnalyzer } from '../../src/analysis/StateSimulationAnalyzer';
import { ReachabilityAnalyzer } from '../../src/analysis/ReachabilityAnalyzer';
import { detectStoryWarnings } from '../../src/analysis/StoryWarnings';
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

describe('stops in a story too large to explore fully', () => {
  it('the coverage pass still reports a reply that goes nowhere', () => {
    const story = new Story({ title: 'T', author: 'T', firstBeatId: 'q0' });
    const add = (b: any) => story.addBeat(createTestBeat(b));
    for (let i = 0; i < 14; i++) {
      add({ id: `q${i}`, name: `q${i}`, type: 'multiChoice', parameters: { question: 'q', choices: ['a', 'b', 'c'].map((id) => ({
        id, text: id, target: i === 13 ? 'scene' : `q${i + 1}`, effects: [{ type: 'incrementCounter', target: id, value: 1 }],
      })) } });
    }
    add({ id: 'scene', name: 'scene', type: 'dialogTree', parameters: { dialogTree: { id: 'r', speaker: 'N', text: 't', choices: [
      { id: 'on', text: 'On', target: 'end' },
      { id: 'no', text: 'so?', dialogNode: { id: 'n', speaker: 'N', text: 'nothing after this', choices: [] } },
    ] } } });
    add({ id: 'end', name: 'end', type: 'endScreen', parameters: { message: 'e', showRestart: false } });
    const paths = new StateSimulationAnalyzer(story, { maxPaths: 50, maxDepth: 40, maxExpansions: 2000, maxFrontier: 5, maxCoveragePaths: 200, maxCoverageExpansions: 5000 } as any).analyzeRaw();
    expect(paths.some((p) => p.outcome.beatId === 'scene' && p.outcome.type === 'deadEnd')).toBe(true);
  });
});

describe('a loop that keeps a running total', () => {
  const story = (gate: boolean) => {
    const st = new Story({ title: 'T', author: 'T', firstBeatId: 'hub' });
    st.addBeat(createTestBeat({ id: 'hub', name: 'hub', type: 'multiChoice', parameters: { question: 'q', choices: [
      { id: 'a', text: 'Again', target: 'hub', effects: [{ type: 'incrementCounter', target: 'laps', value: 1 }] },
      { id: 'b', text: 'Leave', target: 'end', ...(gate ? { conditions: [{ type: 'counter', variableName: 'laps', operator: '>=', value: 3 }] } : {}) },
    ] } } as any));
    st.addBeat(createTestBeat({ id: 'end', name: 'end', type: 'endScreen', parameters: { message: 'e', showRestart: false } } as any));
    return st;
  };
  const types = (st: Story) => new StateSimulationAnalyzer(st, { maxPaths: 200, maxDepth: 40 }).analyzeRaw().map((p) => p.outcome.type);

  it('is not followed to the depth limit when nothing reads the total', () => {
    expect(types(story(false))).not.toContain('depthLimit');
  });

  it('is still followed when a gate ahead reads it', () => {
    expect(types(story(true))).toContain('ending');
  });
});

describe('a branch a Condition Check never takes', () => {
  it('says what the check asks', () => {
    const st = new Story({ title: 'T', author: 'T', firstBeatId: 'gate' });
    st.addBeat(createTestBeat({ id: 'gate', name: 'BrokeCheck', type: 'conditionBeat', parameters: { conditionType: 'counter', variableName: 'Money', operator: '<=', value: 0, trueTarget: 'dead', falseTarget: 'on' } } as any));
    for (const id of ['dead', 'on']) st.addBeat(createTestBeat({ id, name: id, type: 'endScreen', parameters: { message: id, showRestart: false } } as any));
    const paths = new StateSimulationAnalyzer(st, { maxPaths: 10, maxDepth: 5 }).analyzeRaw();
    const played = new Set(paths.flatMap((p) => p.steps.map((x) => x.beatId)));
    const on = new ReachabilityAnalyzer(st, { playedBeats: played }).analyze().unreachableBeats.find((u) => u.beatId === 'on');
    expect(on?.reason).toBe('neverOffered');
    expect(on?.details).toContain('Money <= 0');
  });
});

describe('a running total past its last threshold', () => {
  const story = (down: boolean) => {
    const st = new Story({ title: 'T', author: 'T', firstBeatId: 'hub' });
    st.addBeat(createTestBeat({ id: 'hub', name: 'hub', type: 'multiChoice', parameters: { question: 'q', choices: [
      { id: 'a', text: 'Again', target: 'hub', effects: [{ type: 'incrementCounter', target: 'laps', value: 1 }] },
      ...(down ? [{ id: 'c', text: 'Back', target: 'hub', effects: [{ type: 'incrementCounter', target: 'laps', value: -1 }] }] : []),
      { id: 'b', text: 'Leave', target: 'end', conditions: [{ type: 'counter', variableName: 'laps', operator: '>=', value: 3 }] },
    ] } } as any));
    st.addBeat(createTestBeat({ id: 'end', name: 'end', type: 'endScreen', parameters: { message: 'e', showRestart: false } } as any));
    return new StateSimulationAnalyzer(st, { maxPaths: 300, maxDepth: 60 }).analyzeRaw();
  };

  it('stops the laps once only climbing is possible, but still climbs to the threshold', () => {
    const paths = story(false);
    expect(paths.some((p) => p.outcome.beatId === 'end')).toBe(true);
    expect(paths.some((p) => p.outcome.type === 'depthLimit')).toBe(false);
  });

  it('still reaches the threshold when the total can also come back down', () => {
    expect(story(true).some((p) => p.outcome.beatId === 'end')).toBe(true);
  });
});

describe('searching situations (experiment)', () => {
  const build = () => {
    const st = new Story({ title: 'T', author: 'T', firstBeatId: 'hub' });
    st.addBeat(createTestBeat({ id: 'hub', name: 'hub', type: 'multiChoice', parameters: { question: 'q', choices: [
      { id: 'a', text: 'Again', target: 'hub', effects: [{ type: 'incrementCounter', target: 'laps', value: 1 }] },
      { id: 'b', text: 'Leave', target: 'end', conditions: [{ type: 'counter', variableName: 'laps', operator: '>=', value: 3 }] },
      { id: 'c', text: 'Stop', target: 'stop' },
    ] } } as any));
    st.addBeat(createTestBeat({ id: 'end', name: 'end', type: 'endScreen', parameters: { message: 'e', showRestart: false } } as any));
    st.addBeat(createTestBeat({ id: 'stop', name: 'stop', type: 'infoText', parameters: { text: 't' } } as any));
    st.addBeat(createTestBeat({ id: 'lost', name: 'lost', type: 'infoText', parameters: { text: 't' } } as any));
    return st;
  };

  it('finishes on a loop, finds what a gate opens, and remembers one way there', () => {
    const r = new StateSimulationAnalyzer(build()).exploreSituations();
    expect(r.complete).toBe(true);
    expect([...r.perBeat.keys()].sort()).toEqual(['end', 'hub', 'stop']);
    expect([...r.endings]).toEqual(['end']);
    expect([...r.stops]).toEqual(['stop']);
    expect(r.routeTo!('end').map((step) => step.label)).toEqual(['Again', 'Again', 'Again', 'Leave']);
  });

  it('says when it stopped at its cap', () => {
    expect(new StateSimulationAnalyzer(build()).exploreSituations({ maxSituations: 1 }).complete).toBe(false);
  });
});

describe('what the situation search hands the debug tools', () => {
  const end = { id: 'end', type: 'endScreen', parameters: { message: 'e', showRestart: false } };

  it('keeps the states a beat is arrived in, with a way there, even where no gate tells them apart', () => {
    const r = new StateSimulationAnalyzer(story([
      { id: 'menu', type: 'multiChoice', parameters: { question: 'q', choices: [
        { id: 'a', text: 'A', target: 'hall', effects: [{ type: 'setVariable', target: 'mood', value: 'glad' }] },
        { id: 'b', text: 'B', target: 'hall', effects: [{ type: 'setVariable', target: 'mood', value: 'sad' }] },
      ] } },
      { id: 'hall', type: 'infoText', parameters: { text: 't' }, connections: [{ targetId: 'end' }] },
      end,
    ])).exploreSituations();
    const hall = r.arrivals.get('hall')!;
    expect(hall.map((a) => a.state.variables.get('mood')).sort()).toEqual(['glad', 'sad']);
    expect(hall[0].path.steps.map((s) => s.beatId)).toEqual(['menu', 'hall']);
    expect(hall[0].stepIndex).toBe(1);
  });

  it('notes a beat reached with every choice hidden', () => {
    const r = new StateSimulationAnalyzer(story([
      { id: 'menu', type: 'multiChoice', connections: [{ targetId: 'end', label: 'A' }], parameters: { question: 'q', choices: [
        { id: 'a', text: 'A', target: 'end', conditions: [{ type: 'variable', variableName: 'never', operator: '==', value: 'yes' }] },
      ] } },
      end,
    ])).exploreSituations();
    expect([...r.hiddenChoices]).toEqual(['menu']);
  });

  it('calls a loop with no way out a trap, and an ending met twice not', () => {
    const r = new StateSimulationAnalyzer(story([
      { id: 'menu', type: 'multiChoice', parameters: { question: 'q', choices: [
        { id: 'a', text: 'A', target: 'end' }, { id: 'b', text: 'B', target: 'end' }, { id: 'c', text: 'C', target: 'x' },
      ] } },
      { id: 'x', type: 'infoText', parameters: { text: 't' }, connections: [{ targetId: 'y' }] },
      { id: 'y', type: 'infoText', parameters: { text: 't' }, connections: [{ targetId: 'x' }] },
      end,
    ])).exploreSituations();
    expect(r.traps.has('x')).toBe(true);
    expect(r.traps.has('end')).toBe(false);
  });

  it('stops once nothing new has turned up for a long time, and says so', () => {
    const analyzer = new StateSimulationAnalyzer(story([
      { id: 'menu', type: 'multiChoice', parameters: { question: 'q', choices: [
        { id: 'a', text: 'More', target: 'menu', effects: [{ type: 'incrementCounter', target: 'n', value: 1 }] },
        { id: 'c', text: 'Less', target: 'menu', effects: [{ type: 'incrementCounter', target: 'n', value: -1 }] },
        { id: 'b', text: 'Leave', target: 'end', conditions: [{ type: 'counter', variableName: 'n', operator: '<', value: 1000000 }] },
      ] } },
      end,
    ]));
    const r = analyzer.exploreSituations({ maxStalled: 50 });
    expect(r.complete).toBe(false);
    expect(r.situations).toBeLessThan(200);
    expect(analyzer.searchLimited).toBe(true);
  });
});


describe('what an unreachable beat says when the search stops short (2026-11-03)', () => {
  const end = { id: 'end', type: 'endScreen', parameters: { message: 'e', showRestart: false } };
  const reachability = (s: Story, config: { played?: string[]; limited: boolean }) => {
    const analyzer = new StateSimulationAnalyzer(s);
    const search = analyzer.exploreSituations();
    const played = new Set(config.played ?? search.perBeat.keys());
    return new ReachabilityAnalyzer(s, {
      playedBeats: played,
      searchLimited: config.limited,
      gatesOnTheWay: (from, to) => analyzer.gatesOnTheWay(from, to, (search.arrivals.get(from) ?? []).map((a) => a.state)),
    }).analyze().unreachableBeats;
  };

  it('marks only what an open link leads to as maybe reachable', () => {
    const s = story([
      { id: 'menu', type: 'multiChoice', parameters: { question: 'q', choices: [
        // Only the merchant carries it, and nothing hands it over.
        { id: 'g', text: 'Pay', target: 'vault', conditions: [{ type: 'inventory', operator: 'contains', item: 'Gold' }] },
        // Set to the number 1 by a choice: "1" can match it.
        { id: 'd', text: 'Door', target: 'door', conditions: [{ type: 'variable', variableName: 'key', operator: '==', value: '1' }] },
        // Text against a counter never matches.
        { id: 'c', text: 'Count', target: 'odd', conditions: [{ type: 'counter', variableName: 'n', operator: '==', value: 'many' }] },
        { id: 'k', text: 'Take the key', target: 'end', effects: [{ type: 'setVariable', target: 'key', value: 1 }] },
      ] } },
      { id: 'vault', type: 'infoText', parameters: { text: 't' }, connections: [{ targetId: 'end' }] },
      { id: 'door', type: 'infoText', parameters: { text: 't' }, connections: [{ targetId: 'behind' }] },
      { id: 'behind', type: 'infoText', parameters: { text: 't' }, connections: [{ targetId: 'end' }] },
      { id: 'odd', type: 'infoText', parameters: { text: 't' }, connections: [{ targetId: 'end' }] },
      { id: 'lost', type: 'infoText', parameters: { text: 't' }, connections: [{ targetId: 'end' }] },
      end,
    ], [{ id: 'm', name: 'Merchant', role: 'npc', inventory: [{ name: 'Gold', quantity: 5 }] }]);
    // As if the search had stopped after the first beat.
    const unreached = reachability(s, { played: ['menu', 'end'], limited: true });
    const unsure = (id: string) => unreached.find((u) => u.beatId === id)?.unsure ?? false;
    expect(unsure('door')).toBe(true);
    expect(unsure('behind')).toBe(true);
    expect(unsure('vault')).toBe(false);
    expect(unsure('odd')).toBe(false);
    expect(unsure('lost')).toBe(false);
    expect(unreached.find((u) => u.beatId === 'vault')!.details).toContain('Nothing in the story gives Gold to the player: only Merchant carries it');
    expect(unreached.find((u) => u.beatId === 'odd')!.details).toContain('a counter holds a number');
    expect(unreached.find((u) => u.beatId === 'door')!.details).toContain('no way of playing the search tried');
  });

  it('names the condition players miss on the way and where the story sets it', () => {
    const s = story([
      { id: 'talk', type: 'dialogTree', parameters: { dialogTree: { id: 'root', speaker: 'Guard', text: 'Halt.', choices: [
        { id: 'r1', text: 'Charge', conditions: [{ type: 'variable', variableName: 'mood', operator: '==', value: 'brave' }],
          dialogNode: { id: 'n1', speaker: 'Guard', text: 'Fine.', target: 'cave', choices: [] } },
        { id: 'r2', text: 'Leave', target: 'end' },
      ] } } },
      { id: 'cave', type: 'infoText', parameters: { text: 't' }, connections: [{ targetId: 'end' }] },
      { id: 'pep', type: 'setVariable', parameters: { type: 'variable', name: 'mood', value: 'brave' }, connections: [{ targetId: 'end' }] },
      end,
    ]);
    const cave = reachability(s, { limited: false }).find((u) => u.beatId === 'cave')!;
    expect(cave.reason).toBe('neverOffered');
    expect(cave.unsure).toBeUndefined();
    expect(cave.details).toContain('it needs mood == brave, and no way of playing has that there');
    expect(cave.details).toContain('mood is set in "pep" (to brave, not reached)');
  });

  it('says when a next line before it always plays instead, and counts that as certain', () => {
    const s = story([
      { id: 'talk', type: 'dialogTree', connections: [{ targetId: 'end' }, { targetId: 'hidden' }], parameters: { dialogTree: { id: 'root', speaker: 'Guard', text: 'Halt.', choices: [
        { id: 'c1', continue: true, text: '', dialogNode: { id: 'n1', speaker: 'Guard', text: 'Go.', target: 'end', choices: [] } },
        { id: 'c2', continue: true, text: '', dialogNode: { id: 'n2', speaker: 'Guard', text: 'Never said.', target: 'hidden', choices: [] } },
      ] } } },
      { id: 'hidden', type: 'infoText', parameters: { text: 't' }, connections: [{ targetId: 'end' }] },
      end,
    ]);
    const hidden = reachability(s, { limited: true }).find((u) => u.beatId === 'hidden')!;
    expect(hidden.details).toContain('never shown: a next line before it always plays instead');
    expect(hidden.unsure).toBeUndefined();
  });
});

describe('stopped short, the situation search aims at the links never taken', () => {
  // The key comes the long way round, so the check is first met without it.
  const build = () => story([
    { id: 'start', type: 'multiChoice', parameters: { question: 'q', choices: [
      { id: 'b', text: 'Shop', target: 'shop', effects: [{ type: 'setVariable', target: 'key', value: 'yes' }] },
      { id: 'a', text: 'Walk', target: 'hall' },
    ] } },
    { id: 'shop', type: 'infoText', parameters: { text: 't' }, connections: [{ targetId: 'hall' }] },
    { id: 'hall', type: 'conditionBeat', parameters: { conditionType: 'variable', condition: { type: 'variable', variableName: 'key', operator: '==', value: 'yes' }, trueTarget: 'vault', falseTarget: 'end' } },
    { id: 'vault', type: 'endScreen', parameters: { message: 'v', showRestart: false } },
    { id: 'end', type: 'endScreen', parameters: { message: 'e', showRestart: false } },
  ]);

  it('tries the states that open a closed link before giving up', () => {
    expect(new StateSimulationAnalyzer(build()).exploreSituations({ maxSituations: 4, maxAimed: 0 }).perBeat.has('vault')).toBe(false);
    const aimed = new StateSimulationAnalyzer(build()).exploreSituations({ maxSituations: 4 });
    expect(aimed.perBeat.has('vault')).toBe(true);
    expect(aimed.complete).toBe(false);
  });
});

describe('counter ranges, worked out before the search (2026-11-03)', () => {
  const counterCheck = (id: string, name: string, operator: string, value: number, yes: string, no: string) => ({
    id, type: 'conditionBeat',
    parameters: { conditionType: 'counter', condition: { type: 'counter', variableName: name, operator, value }, trueTarget: yes, falseTarget: no },
  });
  const info = (id: string, to: string, effects?: any[]) => ({ id, type: 'infoText', parameters: { text: 't' }, connections: [{ targetId: to, ...(effects ? { effects } : {}) }] });
  const stop = (id: string) => ({ id, type: 'endScreen', parameters: { message: id, showRestart: false } });
  const add = (name: string, value: number) => [{ type: 'incrementCounter', target: name, value }];
  const unreached = (s: Story, maxSituations?: number) => {
    const analyzer = new StateSimulationAnalyzer(s);
    const search = analyzer.exploreSituations(maxSituations ? { maxSituations, maxAimed: 0 } : {});
    return {
      analyzer,
      beats: new ReachabilityAnalyzer(s, {
        playedBeats: new Set(search.perBeat.keys()),
        searchLimited: analyzer.searchLimited,
        ranges: analyzer.rangeFacts,
        gatesOnTheWay: (from, to) => analyzer.gatesOnTheWay(from, to, (search.arrivals.get(from) ?? []).map((a) => a.state)),
      }).analyze().unreachableBeats,
    };
  };

  // Group 3's shape: everything that pays comes after the check that you're broke.
  const broke = () => story([
    { id: 'start', type: 'multiChoice', parameters: { question: 'q', choices: [
      { id: 'a', text: 'A', target: 'broke', effects: add('anger', 1) },
      { id: 'b', text: 'B', target: 'broke', effects: add('anger', 2) },
      { id: 'c', text: 'C', target: 'broke', effects: add('anger', 3) },
    ] } },
    counterCheck('broke', 'Money', '<=', 0, 'dead', 'job'),
    info('job', 'deeper', add('Money', 4000)),
    info('deeper', 'end'),
    stop('dead'), stop('end'),
  ]);

  it('rules out a branch a check always answers the same way, as certain even when the search stops short', () => {
    const { analyzer, beats } = unreached(broke(), 2);
    expect(analyzer.searchLimited).toBe(true);
    expect(analyzer.rangeFacts?.reached.has('job')).toBe(false);
    const job = beats.find((u) => u.beatId === 'job')!;
    expect(job.unsure).toBeUndefined();
    expect(job.details).toContain('"broke" checks Money <= 0, and Money is always 0 there, so the answer always sends players the other way');
    expect(job.details).toContain('Money changes in "job" (not reached)');
    expect(beats.find((u) => u.beatId === 'deeper')!.unsure).toBeUndefined();
  });

  it('rules out a choice whose counter can never be enough there', () => {
    const s = story([
      info('first', 'menu', add('Trust', 1)),
      { id: 'menu', type: 'multiChoice', parameters: { question: 'q', choices: [
        { id: 'ask', text: 'Ask', target: 'secret', conditions: [{ type: 'counter', variableName: 'Trust', operator: '>=', value: 5 }] },
        { id: 'go', text: 'Go', target: 'end' },
      ] } },
      info('secret', 'end'), stop('end'),
    ]);
    const secret = unreached(s).beats.find((u) => u.beatId === 'secret')!;
    expect(secret.details).toContain('it needs Trust >= 5, and Trust is always 1 there, so no way of playing has that there');
  });

  it('keeps open what a loop can add up to, and the search finds it', () => {
    const s = story([
      { id: 'hub', type: 'multiChoice', parameters: { question: 'q', choices: [
        { id: 'work', text: 'Work', target: 'shift' },
        { id: 'buy', text: 'Buy', target: 'shop', conditions: [{ type: 'counter', variableName: 'coins', operator: '>=', value: 3 }] },
      ] } },
      info('shift', 'hub', add('coins', 1)),
      info('shop', 'end'), stop('end'),
    ]);
    const analyzer = new StateSimulationAnalyzer(s);
    const search = analyzer.exploreSituations();
    expect(analyzer.rangeFacts?.reached.has('shop')).toBe(true);
    expect(search.perBeat.has('shop')).toBe(true);
  });

  it('keeps open what replays add up to when the end screen keeps the counters', () => {
    const s = story([
      info('start', 'check', add('runs', 1)),
      counterCheck('check', 'runs', '>=', 3, 'last', 'again'),
      { id: 'again', type: 'endScreen', parameters: { message: 'again', showRestart: true, reset: false }, connections: [{ targetId: 'start' }] },
      stop('last'),
    ]);
    expect(new StateSimulationAnalyzer(s).counterRanges()!.reached.has('last')).toBe(true);
  });

  it('holds every state the search plays', () => {
    const s = broke();
    const analyzer = new StateSimulationAnalyzer(s);
    const search = analyzer.exploreSituations();
    const ranges = analyzer.counterRanges()!;
    for (const [beatId, arrivals] of search.arrivals) {
      for (const a of arrivals) {
        for (const [k, v] of a.state.counters) {
          const r = ranges.at(beatId)!.get(k)!;
          expect(v >= r[0] && v <= r[1]).toBe(true);
        }
      }
    }
    expect(analyzer.rangeFacts).not.toBeNull();
  });

  it('can be turned off', () => {
    const analyzer = new StateSimulationAnalyzer(broke());
    analyzer.exploreSituations({ counterRanges: false });
    expect(analyzer.rangeFacts).toBeNull();
  });
});

describe('links that need several things at once (2026-11-03)', () => {
  const stop = (id: string) => ({ id, type: 'endScreen', parameters: { message: id, showRestart: false } });
  const is = (name: string, value: string) => ({ type: 'variable', variableName: name, operator: '==', value });
  const setTo = (name: string, value: string) => [{ type: 'setVariable', target: name, value }];
  const check = (s: Story, maxSituations: number) => {
    const analyzer = new StateSimulationAnalyzer(s);
    const search = analyzer.exploreSituations({ maxSituations, maxAimed: 0 });
    const beats = new ReachabilityAnalyzer(s, {
      playedBeats: new Set(search.perBeat.keys()),
      searchLimited: analyzer.searchLimited,
      ranges: analyzer.rangeFacts,
      gatesOnTheWay: (from, to) => analyzer.gatesOnTheWay(from, to, (search.arrivals.get(from) ?? []).map((a) => a.state)),
    }).analyze().unreachableBeats;
    return { analyzer, search, beat: (id: string) => beats.find((u) => u.beatId === id) };
  };
  // North sets one, south the other: no way has both.
  const forks = (oneWayBoth = false) => story([
    { id: 'start', type: 'multiChoice', parameters: { question: 'q', choices: [
      { id: 'n', text: 'North', target: oneWayBoth ? 'also' : 'mid', effects: setTo('a', 'x') },
      { id: 's', text: 'South', target: 'mid', effects: setTo('b', 'y') },
    ] } },
    { id: 'also', type: 'infoText', parameters: { text: 't' }, connections: [{ targetId: 'mid', effects: setTo('b', 'y') }] },
    { id: 'mid', type: 'multiChoice', parameters: { question: 'q', choices: [
      { id: 'both', text: 'Both', target: 'treasure', conditions: [is('a', 'x'), is('b', 'y')] },
      { id: 'leave', text: 'Leave', target: 'end' },
    ] } },
    { id: 'treasure', type: 'infoText', parameters: { text: 't' }, connections: [{ targetId: 'end' }] },
    stop('end'),
  ]);

  it('rules out a choice that needs two values no way of playing has together', () => {
    const { analyzer, beat } = check(forks(), 3);
    expect(analyzer.searchLimited).toBe(true);
    const treasure = beat('treasure')!;
    expect(treasure.unsure).toBeUndefined();
    expect(treasure.details).toContain('it needs a == x and b == y');
    expect(treasure.details).toContain('a x and b unset');
    expect(treasure.details).toContain('a unset and b y');
  });

  it('keeps it open when one way sets both, and the search plays it', () => {
    expect(new StateSimulationAnalyzer(forks(true)).counterRanges(['v\u0001a', 'v\u0001b'])!.reached.has('treasure')).toBe(true);
    expect(new StateSimulationAnalyzer(forks(true)).exploreSituations().perBeat.has('treasure')).toBe(true);
  });

  it('rules out an item asked for before anything gives it', () => {
    const s = story([
      { id: 'door', type: 'multiChoice', parameters: { question: 'q', choices: [
        { id: 'p', text: 'Pay', target: 'vault', conditions: [{ type: 'inventory', operator: 'contains', item: 'Gold' }] },
        { id: 'w', text: 'Walk', target: 'shop' },
        { id: 'x', text: 'Wait', target: 'shop' },
      ] } },
      { id: 'shop', type: 'infoText', parameters: { text: 't' }, connections: [{ targetId: 'end', effects: [{ type: 'addInventory', target: 'Gold' }] }] },
      { id: 'vault', type: 'infoText', parameters: { text: 't' }, connections: [{ targetId: 'end' }] },
      stop('end'),
    ]);
    const vault = check(s, 2).beat('vault')!;
    expect(vault.unsure).toBeUndefined();
    expect(vault.details).toContain('players arrive there with no Gold');
  });

  it('starts each check from what the others ruled out', () => {
    // b is set to y only behind a choice that needs a visit nobody makes first.
    const s = story([
      { id: 'start', type: 'multiChoice', parameters: { question: 'q', choices: [
        { id: 'k', text: 'Knock', target: 'setter', conditions: [{ type: 'visitedBeat', operator: '==', beatId: 'later' }] },
        { id: 'g', text: 'Go', target: 'later' },
      ] } },
      { id: 'setter', type: 'infoText', parameters: { text: 't' }, connections: [{ targetId: 'later', effects: setTo('b', 'y') }] },
      { id: 'later', type: 'multiChoice', parameters: { question: 'q', choices: [
        { id: 'y', text: 'Yes', target: 'prize', conditions: [is('b', 'y')] },
        { id: 'n', text: 'No', target: 'end' },
      ] } },
      { id: 'prize', type: 'infoText', parameters: { text: 't' }, connections: [{ targetId: 'end' }] },
      stop('end'),
    ]);
    const { beat } = check(s, 3);
    expect(beat('setter')!.unsure).toBeUndefined();
    expect(beat('prize')!.unsure).toBeUndefined();
  });

  it('leaves what players type open', () => {
    const s = story([
      { id: 'ask', type: 'inputText', parameters: { prompt: 'Name?', saveToType: 'variable', variable: 'name' }, connections: [{ targetId: 'gate' }] },
      { id: 'gate', type: 'multiChoice', parameters: { question: 'q', choices: [
        { id: 'b', text: 'Bob', target: 'secret', conditions: [is('name', 'Bob')] },
        { id: 'l', text: 'Leave', target: 'end' },
      ] } },
      { id: 'secret', type: 'infoText', parameters: { text: 't' }, connections: [{ targetId: 'end' }] },
      stop('end'),
    ]);
    expect(new StateSimulationAnalyzer(s).counterRanges(['v\u0001name'])!.reached.has('secret')).toBe(true);
  });
});

describe('replays that carry values over (2026-11-03)', () => {
  const runs = (reset: boolean) => story([
    { id: 'start', type: 'infoText', parameters: { text: 't' }, connections: [{ targetId: 'check', effects: [{ type: 'incrementCounter', target: 'runs', value: 1 }] }] },
    { id: 'check', type: 'conditionBeat', parameters: { conditionType: 'counter', condition: { type: 'counter', variableName: 'runs', operator: '>=', value: 3 }, trueTarget: 'last', falseTarget: 'again' } },
    { id: 'again', type: 'endScreen', parameters: { message: 'again', showRestart: true, reset }, connections: [{ targetId: 'start' }] },
    { id: 'last', type: 'endScreen', parameters: { message: 'last', showRestart: false } },
  ]);

  it('says an end screen restarts without resetting what the story checks', () => {
    const keeps = detectStoryWarnings({ story: runs(false) }).filter((w) => w.code === 'restart-keeps-values');
    expect(keeps.map((w) => [w.beatId, w.severity])).toEqual([['again', 'note']]);
    expect(keeps[0].message).toContain('runs carries into the next run');
    expect(detectStoryWarnings({ story: runs(true) }).some((w) => w.code === 'restart-keeps-values')).toBe(false);
  });

  it('marks a beat only replays can reach, and says why', () => {
    const s = runs(false);
    const analyzer = new StateSimulationAnalyzer(s);
    const search = analyzer.exploreSituations({ maxSituations: 3, maxAimed: 0 });
    expect(search.perBeat.has('last')).toBe(false);
    const last = new ReachabilityAnalyzer(s, {
      playedBeats: new Set(search.perBeat.keys()),
      searchLimited: analyzer.searchLimited,
      ranges: analyzer.rangeFacts,
      oneRun: analyzer.oneRunFacts,
      gatesOnTheWay: (from, to) => analyzer.gatesOnTheWay(from, to, (search.arrivals.get(from) ?? []).map((a) => a.state)),
    }).analyze().unreachableBeats.find((u) => u.beatId === 'last')!;
    expect(last.unsure).toBe(true);
    expect(last.afterReplays).toBe(true);
    expect(last.details).toContain("Can't be reached in one playthrough. \"check\" checks runs >= 3, and in one playthrough runs is always 1 there.");
    expect(last.details).toContain('"again" restarts the story without resetting');
    // Played through, the replays do get there.
    expect(new StateSimulationAnalyzer(s).exploreSituations().perBeat.has('last')).toBe(true);
  });
});

describe('counters that move together (2026-11-03)', () => {
  // Group 3's shape: the police check comes first, and police never trails anger.
  const heat = (anger: number) => story([
    { id: 'hub', type: 'multiChoice', parameters: { question: 'q', choices: [
      { id: 'j', text: 'Job', target: 'job' },
      { id: 'q', text: 'Quit', target: 'end' },
    ] } },
    { id: 'job', type: 'infoText', parameters: { text: 't' }, connections: [{ targetId: 'police', effects: [
      { type: 'incrementCounter', target: 'police', value: 10 }, { type: 'incrementCounter', target: 'anger', value: anger },
    ] }] },
    { id: 'police', type: 'conditionBeat', parameters: { conditionType: 'counter', condition: { type: 'counter', variableName: 'police', operator: '>=', value: 30 }, trueTarget: 'arrested', falseTarget: 'gang' } },
    { id: 'gang', type: 'conditionBeat', parameters: { conditionType: 'counter', condition: { type: 'counter', variableName: 'anger', operator: '>=', value: 30 }, trueTarget: 'hit', falseTarget: 'hub' } },
    { id: 'arrested', type: 'endScreen', parameters: { message: 'a', showRestart: false } },
    { id: 'hit', type: 'endScreen', parameters: { message: 'h', showRestart: false } },
    { id: 'end', type: 'endScreen', parameters: { message: 'e', showRestart: false } },
  ]);

  it('rules out a check the earlier one always gets to first', () => {
    const s = heat(10);
    const analyzer = new StateSimulationAnalyzer(s);
    const search = analyzer.exploreSituations();
    expect(search.perBeat.has('hit')).toBe(false);
    expect(analyzer.counterRanges()!.reached.has('hit')).toBe(false);
    const hit = new ReachabilityAnalyzer(s, { playedBeats: new Set(search.perBeat.keys()), ranges: analyzer.rangeFacts })
      .analyze().unreachableBeats.find((u) => u.beatId === 'hit')!;
    expect(hit.details).toContain('anger is never above police there');
    expect(hit.details).toContain('police is at least 10 and below 30 there');
  });

  it('keeps it open when one climbs faster, and the search plays it', () => {
    const s = heat(15);
    expect(new StateSimulationAnalyzer(s).counterRanges()!.reached.has('hit')).toBe(true);
    expect(new StateSimulationAnalyzer(s).exploreSituations().perBeat.has('hit')).toBe(true);
  });
});

describe('a Restart that keeps what players did (2026-11-03)', () => {
  it('is followed a few times, not forever, and the search says it stopped short', () => {
    // Every run adds to the tally and nothing resets it: each replay is new.
    const s = story([
      { id: 'start', type: 'infoText', parameters: { text: 't' }, connections: [{ targetId: 'check', effects: [{ type: 'incrementCounter', target: 'tally', value: 1 }] }] },
      // A check far ahead reads the tally, so no two runs are the same.
      { id: 'check', type: 'conditionBeat', parameters: { conditionType: 'counter', condition: { type: 'counter', variableName: 'tally', operator: '>=', value: 100 }, trueTarget: 'won', falseTarget: 'again' } },
      { id: 'again', type: 'endScreen', parameters: { message: 'again', showRestart: true, reset: false }, connections: [{ targetId: 'start' }] },
      { id: 'won', type: 'endScreen', parameters: { message: 'won', showRestart: false } },
    ]);
    const t = performance.now();
    const search = new StateSimulationAnalyzer(s).exploreSituations();
    expect(performance.now() - t).toBeLessThan(2000);
    expect(search.situations).toBeLessThan(20);
    expect(search.complete).toBe(false);
  });
});

describe('a role check in words (2026-11-03)', () => {
  it('names the character and the role', async () => {
    const { describeGate } = await import('../../src/analysis/ReachabilityAnalyzer');
    const names = (id: string) => (id === 'char_tomas' ? 'Tomas' : id);
    expect(describeGate({ type: 'roleHolder', role: 'confidant', character: 'char_tomas', operator: '==' }, (id) => id, names)).toBe('Tomas as the confidant');
    expect(describeGate({ type: 'roleHolder', role: '@confidant', character: 'char_tomas', operator: '!=' }, (id) => id, names)).toBe('someone other than Tomas as the confidant');
  });
});
