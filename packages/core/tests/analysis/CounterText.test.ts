/**
 * A counter holds a number, so text never matches it. The engine and the
 * simulator must give the same answer, the warning names the mistake, and
 * generated stories get a variable check instead.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StoryContext } from '../../src/engine/StoryContext';
import { StateSimulationAnalyzer } from '../../src/analysis/StateSimulationAnalyzer';
import { detectStoryWarnings } from '../../src/analysis/StoryWarnings';
import { Story } from '../../src/engine/Story';
import { normalizeStory } from '../../src/normalize/normalizeStory';
import { createTestBeat } from '../test-utils';

beforeEach(() => vi.stubGlobal('window', { setInterval: vi.fn().mockReturnValue(1), clearInterval: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

const OPS = ['==', '!=', '>', '<', '>=', '<='] as const;

function gateStory(operator: string, value: unknown) {
  const story = new Story({ title: 'T', author: 'T', firstBeatId: 'gate' });
  story.addBeat(createTestBeat({ id: 'gate', name: 'Gate', type: 'conditionBeat', parameters: {
    conditionType: 'counter', variableName: 'path', operator, value, trueTarget: 'yes', falseTarget: 'no',
  } } as any));
  for (const id of ['yes', 'no']) story.addBeat(createTestBeat({ id, name: id, type: 'endScreen', parameters: { text: id } } as any));
  return story;
}

function simulatedEnd(operator: string, value: unknown) {
  const r: any = new StateSimulationAnalyzer(gateStory(operator, value), { maxPaths: 10, maxDepth: 5 }).analyze();
  return r.outcomes.map((o: any) => o.endingBeatId);
}

describe('counter compared with a value', () => {
  it('text never matches a counter in the engine', () => {
    const ctx: any = new (StoryContext as any)();
    const check = (operator: string) => ctx.checkCondition({ type: 'counter', variableName: 'path', operator, value: 'stay' });
    expect(OPS.map(check)).toEqual([false, true, false, false, false, false]);
  });

  it('an empty value still reads as 0, and number text as the number', () => {
    const ctx: any = new (StoryContext as any)();
    ctx.setCounter('path', 5);
    expect(ctx.checkCondition({ type: 'counter', variableName: 'path', operator: '==', value: '5' })).toBe(true);
    ctx.setCounter('path', 0);
    for (const value of [undefined, null, '', ' ', NaN]) {
      expect(ctx.checkCondition({ type: 'counter', variableName: 'path', operator: '==', value } as any)).toBe(true);
    }
  });

  it.each([...OPS.map((op) => [op, 'stay']), ...OPS.map((op) => [op, 0]), ...OPS.map((op) => [op, 3])])(
    'the simulator takes the branch the engine takes: %s %s', (operator, value) => {
      const engine = (new (StoryContext as any)() as any).checkCondition({ type: 'counter', variableName: 'path', operator, value });
      expect(simulatedEnd(operator as string, value)).toEqual([engine ? 'yes' : 'no']);
    });
});

describe('Story Warnings', () => {
  const warningsFor = (beats: any[]) => {
    const story = new Story({ title: 'T', author: 'T', firstBeatId: beats[0].id });
    for (const b of beats) story.addBeat(createTestBeat(b));
    return detectStoryWarnings({ paths: [], story });
  };

  it('names a Condition beat that checks a counter against text, once', () => {
    const story = gateStory('==', 'stay');
    const found = detectStoryWarnings({ paths: [], story }).filter((w) => w.code === 'counter-text');
    expect(found).toHaveLength(1);
    expect(found[0].beatId).toBe('gate');
    expect(found[0].message).toContain('never true');
  });

  it('stays quiet for a number', () => {
    expect(detectStoryWarnings({ paths: [], story: gateStory('==', 3) }).filter((w) => w.code === 'counter-text')).toEqual([]);
  });

  it('finds choice conditions and effects that use text', () => {
    const found = warningsFor([{ id: 'm', name: 'M', type: 'multiChoice', parameters: { question: 'q', choices: [
      { id: 'a', text: 'A', target: 'm', conditions: [{ type: 'counter', variableName: 'x', operator: '!=', value: 'no' }] },
      { id: 'b', text: 'B', target: 'm', effects: [{ type: 'setCounter', target: 'y', value: 'word' }] },
    ] } }]).filter((w) => w.code === 'counter-text');
    expect(found.map((w) => w.detail?.name).sort()).toEqual(['x', 'y']);
    expect(found.find((w) => w.detail?.name === 'x')?.message).toContain('always true');
  });

  it('finds blank reply buttons and next lines that never play, but not next lines', () => {
    const found = warningsFor([{ id: 'd', name: 'D', type: 'dialogTree', parameters: { dialogTree: {
      id: 'root', speaker: 'N', text: 'First', choices: [
        { id: 'c1', text: '', continue: true, dialogNode: { id: 'n1', speaker: 'N', text: 'Plays', choices: [
          { id: 'blank', text: '', conditions: [{ type: 'visitedBeat', beatId: 'd' }], dialogNode: { id: 'n3', speaker: 'N', text: 'x', choices: [] } },
        ] } },
        { id: 'c2', text: '', continue: true, dialogNode: { id: 'n2', speaker: 'N', text: 'Dead', choices: [] } },
      ] } } }]);
    expect(found.filter((w) => w.code === 'wordless-reply').map((w) => w.detail?.count)).toEqual([1]);
    const dead = found.filter((w) => w.code === 'line-never-plays');
    expect(dead).toHaveLength(1);
    expect(dead[0].message).toContain('Dead');
  });

  it('names a reply that goes nowhere, and only that one', () => {
    const found = warningsFor([{ id: 'd', name: 'D', type: 'dialogTree', parameters: { dialogTree: {
      id: 'root', speaker: 'N', text: 'First', choices: [
        { id: 'a', text: 'Nowhere' }, { id: 'b', text: 'On', target: 'd' },
      ] } } }]).filter((w) => w.code === 'reply-nowhere');
    expect(found).toHaveLength(1);
    expect(found[0].severity).toBe('error');
    expect(found[0].message).toContain('Nowhere');
  });

  it('a conditional next line before a fallback is fine', () => {
    const found = warningsFor([{ id: 'd', name: 'D', type: 'dialogTree', parameters: { dialogTree: {
      id: 'root', speaker: 'N', text: 'First', choices: [
        { id: 'c1', text: '', continue: true, conditions: [{ type: 'visitedBeat', beatId: 'd' }], dialogNode: { id: 'n1', speaker: 'N', text: 'A', choices: [] } },
        { id: 'c2', text: '', continue: true, dialogNode: { id: 'n2', speaker: 'N', text: 'B', choices: [] } },
      ] } } }]);
    expect(found.filter((w) => w.code === 'line-never-plays' || w.code === 'wordless-reply')).toEqual([]);
  });
});

describe('generated stories', () => {
  it('turn a counter used with text into a variable, leaving the input alone', () => {
    const raw = { beats: [
      { id: 'g', type: 'conditionBeat', name: 'G', parameters: { conditionType: 'counter', variableName: 'path', operator: '==', value: 'stay', trueTarget: 'm', falseTarget: 'm' } },
      { id: 'm', type: 'multiChoice', name: 'M', parameters: { question: 'q', choices: [
        { id: 'a', text: 'A', target: 'g', conditions: [{ type: 'counter', variableName: 'path', operator: '==', value: 'sail' }], effects: [{ type: 'setCounter', target: 'path', value: 'stay' }] },
        { id: 'b', text: 'B', target: 'g', conditions: [{ type: 'counter', variableName: 'score', operator: '>=', value: 2 }] },
      ] } },
    ] };
    const before = JSON.stringify(raw);
    const { story } = normalizeStory(raw, { beatTypes: {} } as any);
    expect(JSON.stringify(raw)).toBe(before);
    const [g, m] = story.beats;
    expect(g.parameters.conditionType).toBe('variable');
    expect(m.parameters.choices[0].conditions[0].type).toBe('variable');
    expect(m.parameters.choices[0].effects[0].type).toBe('setVariable');
    expect(m.parameters.choices[1].conditions[0].type).toBe('counter');
  });
});

describe('what conditions read against what the story sets', () => {
  const build = (beats: any[], settings?: any) => {
    const story = new Story({ title: 'T', author: 'T', firstBeatId: beats[0].id });
    if (settings) story.setSettings(settings);
    for (const b of beats) story.addBeat(createTestBeat(b));
    return story;
  };
  const menu = (cond: any, effects: any[] = []) => ({ id: 'm', name: 'Menu', type: 'multiChoice', parameters: { question: 'q', choices: [
    { id: 'a', text: 'A', target: 'e', effects }, { id: 'b', text: 'B', target: 'e', conditions: [cond] },
  ] } });
  const end = { id: 'e', name: 'End', type: 'endScreen', parameters: { message: 'e', showRestart: false } };
  const codes = (story: Story, paths: any[] = []) => detectStoryWarnings({ paths, story });
  const variable = (name: string) => ({ type: 'variable', variableName: name, operator: '==', value: true });

  it('catches a name that differs only in capitals', () => {
    const w = codes(build([menu(variable('savedScreenshot'), [{ type: 'setVariable', target: 'savedscreenshot', value: true }]), end])).filter((x) => x.code === 'name-mismatch');
    expect(w).toHaveLength(1);
    expect(w[0].message).toContain('savedscreenshot');
  });

  it('catches an item spelled nearly the same', () => {
    const w = codes(build([menu({ type: 'inventory', item: 'Greater Sword', operator: 'contains' }, [{ type: 'addInventory', target: 'Great Sword' }]), end])).filter((x) => x.code === 'name-mismatch');
    expect(w.map((x) => x.detail?.set)).toEqual(['Great Sword']);
  });

  it('leaves alone numbered names, short names and names that are set', () => {
    for (const [read, set] of [['score1', 'score2'], ['hat', 'hit'], ['trust', 'trust']]) {
      const w = codes(build([menu(variable(read), [{ type: 'setVariable', target: set, value: 1 }]), end])).filter((x) => x.code === 'name-mismatch');
      expect(w).toEqual([]);
    }
  });

  it('names a setup beat nobody reaches when a played beat checks what it sets', () => {
    const story = build([
      menu({ type: 'counter', variableName: 'Money', operator: '>', value: 0 }), end,
      { id: 'setup', name: 'MoneyStart', type: 'setVariable', parameters: { type: 'counter', name: 'Money', value: 100, operation: 'set' } },
    ]);
    const paths = new StateSimulationAnalyzer(story, { maxPaths: 10, maxDepth: 5 }).analyzeRaw();
    const w = codes(story, paths).filter((x) => x.code === 'setup-unreached');
    expect(w.map((x) => x.beatName)).toEqual(['MoneyStart']);
    expect(w[0].message).toContain('checks Money');
    expect(codes(story).some((x) => x.code === 'setup-unreached')).toBe(false);
  });

  it('says when a reply beside next lines can never show, not when it is a fallback', () => {
    const scene = (conditions?: any[]) => ({ id: 'd', name: 'D', type: 'dialogTree', parameters: { dialogTree: { id: 'r', speaker: 'N', text: 'First', choices: [
      { id: 'x', text: 'so?', target: 'e' },
      { id: 'n', text: '', continue: true, ...(conditions ? { conditions } : {}), target: 'e' },
    ] } } });
    const hidden = (st: Story) => {
      const a = new StateSimulationAnalyzer(st, { maxPaths: 10, maxDepth: 5 });
      const paths = a.analyzeRaw();
      return detectStoryWarnings({ paths, story: st, shownReplies: a.shownReplies }).filter((x) => x.code === 'reply-hidden-by-next-line');
    };
    expect(hidden(build([scene(), end]))[0].message).toContain('never show');
    // The flag is never set: the reply is what players get.
    expect(hidden(build([scene([variable('flag')]), end]))).toEqual([]);
    // The flag is always set first: the reply can't be reached.
    const setFlag = { id: 'first', name: 'First', type: 'multiChoice', parameters: { question: 'q', choices: [
      { id: 'a', text: 'A', target: 'd', effects: [{ type: 'setVariable', target: 'flag', value: true }] },
    ] } };
    const w = hidden(build([setFlag, scene([variable('flag')]), end]));
    expect(w).toHaveLength(1);
    expect(w[0].message).toContain('never showed');
  });
});

describe('generated stories spell names as declared', () => {
  const story = () => ({
    variables: [{ name: 'savedScreenshot', type: 'boolean' }],
    characters: [{ id: 'c', name: 'C', counters: [{ name: 'Trust', value: 0 }] }],
    beats: [
      { id: 'm', type: 'multiChoice', name: 'M', parameters: { question: 'Saved: \${savedscreenshot}', choices: [
        { id: 'a', text: 'A', target: 'g', effects: [{ type: 'setVariable', target: 'savedscreenshot', value: true }, { type: 'incrementCounter', target: 'trust', value: 1 }] },
        { id: 'b', text: 'B', target: 'g', conditions: [{ type: 'inventory', item: 'savedscreenshot', operator: 'contains' }] },
      ] } },
      { id: 'g', type: 'conditionBeat', name: 'G', parameters: { conditionType: 'variable', variableName: 'SAVEDSCREENSHOT', operator: '==', value: true, trueTarget: 'm', falseTarget: 'm' } },
      { id: 's', type: 'setVariable', name: 'S', parameters: { type: 'variable', name: 'savedSCREENSHOT', value: true } },
      { id: 'o', type: 'multiChoice', name: 'O', parameters: { question: 'q', choices: [{ id: 'x', text: 'X', target: 'g', effects: [{ type: 'setVariable', target: 'savedScreenshots', value: true }] }] } },
    ],
  });

  it('corrects capitals everywhere a name is read, set or shown', () => {
    const raw = story();
    const before = JSON.stringify(raw);
    const { story: out, report } = normalizeStory(raw, { beatTypes: {} } as any);
    const [m, g, s] = out.beats;
    expect(m.parameters.choices[0].effects[0].target).toBe('savedScreenshot');
    expect(m.parameters.choices[0].effects[1].target).toBe('Trust');
    expect(m.parameters.question).toContain('\${savedScreenshot}');
    expect(g.parameters.variableName).toBe('savedScreenshot');
    expect(s.parameters.name).toBe('savedScreenshot');
    expect(report.changes.some((c) => c.note === 'Spelled as declared')).toBe(true);
    expect(JSON.stringify(raw)).toBe(before);
  });

  it('leaves items and closer calls alone', () => {
    const { story: out } = normalizeStory(story(), { beatTypes: {} } as any);
    expect(out.beats[0].parameters.choices[1].conditions[0].item).toBe('savedscreenshot');
    expect(out.beats[3].parameters.choices[0].effects[0].target).toBe('savedScreenshots');
  });
});

describe('a reply only some states show, in a story too large to explore fully', () => {
  it('the search goes looking for a state that shows it', () => {
    const story = new Story({ title: 'T', author: 'T', firstBeatId: 'flag' });
    const add = (b: any) => story.addBeat(createTestBeat(b));
    // Nearly every way sets the flag; the state without it is rare in a large story.
    add({ id: 'flag', name: 'flag', type: 'multiChoice', parameters: { question: 'q', choices: [
      { id: 'a', text: 'A', target: 'q0', effects: [{ type: 'setVariable', target: 'seen', value: true }] },
      { id: 'b', text: 'B', target: 'q0' },
    ] } });
    for (let i = 0; i < 12; i++) {
      add({ id: `q${i}`, name: `q${i}`, type: 'multiChoice', parameters: { question: 'q', choices: ['x', 'y', 'z'].map((id) => ({
        id, text: id, target: i === 11 ? 'scene' : `q${i + 1}`, effects: [{ type: 'incrementCounter', target: id, value: 1 }],
      })) } });
    }
    add({ id: 'scene', name: 'scene', type: 'dialogTree', parameters: { dialogTree: { id: 'r', speaker: 'N', text: 't', choices: [
      { id: 'hidden', text: 'so?', target: 'end' },
      { id: 'n', text: '', continue: true, conditions: [{ type: 'variable', variableName: 'seen', operator: '==', value: true }], target: 'end' },
    ] } } });
    add({ id: 'end', name: 'end', type: 'endScreen', parameters: { message: 'e', showRestart: false } });
    const a = new StateSimulationAnalyzer(story, { maxPaths: 40, maxDepth: 40, maxExpansions: 300, maxFrontier: 20, maxCoveragePaths: 200, maxCoverageExpansions: 5000 } as any);
    const paths = a.analyzeRaw();
    expect(a.shownReplies.has('scene|hidden')).toBe(true);
    expect(detectStoryWarnings({ paths, story, shownReplies: a.shownReplies }).filter((w) => w.code === 'reply-hidden-by-next-line')).toEqual([]);
  });
});
