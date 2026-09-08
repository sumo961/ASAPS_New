import { describe, it, expect } from 'vitest';
import { buildFixPrompt, validateAIFix, contextBeatsFor, requestAIFix } from '../findingFixService';
import { analyzeStoryFindings } from '../../utils/generationReview';

const story = () => ({
  beats: [
    { id: 'beat_0', type: 'titleScreen', name: 'Title', parameters: { connection: { target: 'beat_1' } } },
    { id: 'beat_1', type: 'infoText', name: 'Intro', parameters: { text: 'Hi', connection: { target: 'beat_2' } } },
    { id: 'beat_2', type: 'multiChoice', name: 'Fork', parameters: { choices: [
      { text: 'kind', target: 'beat_end_a', effects: [{ type: 'incrementCounter', target: 'trust', value: 1 }] },
      { text: 'typo', target: 'beat_ending' },
    ] } },
    { id: 'beat_end_a', type: 'endScreen', name: 'End A', parameters: {} },
    { id: 'beat_end_b', type: 'endScreen', name: 'End B', parameters: {} },
  ],
});
const missing = () => analyzeStoryFindings(story()).find(f => f.kind === 'missing-target')!;

describe('buildFixPrompt', () => {
  it('sends the finding, the involved beats, the schema excerpt and every id — not the whole story', () => {
    const schema = { beatTypes: { multiChoice: { parameters: { choices: { type: 'array<multiChoiceOption>', description: 'The options' } } } } };
    const { systemPrompt, userPrompt, editable } = buildFixPrompt(missing(), { story: story(), schema });
    const body = JSON.parse(userPrompt);
    expect(body.problem.kind).toBe('missing-target');
    expect(editable).toContain('beat_2');
    expect(body.beats.map((b: any) => b.id)).toContain('beat_2');
    expect(body.beats.some((b: any) => b.id === 'beat_end_b')).toBe(false); // not linked, not a neighbour
    expect(body.allBeatIds.map((b: any) => b.id)).toContain('beat_end_b');
    expect(body.parameterSchema.multiChoice.choices.description).toBe('The options');
    expect(body.beats.find((b: any) => b.id === 'beat_1').currentLinks).toEqual([{ target: 'beat_2', via: 'connection', path: 'connection.target' }]);
    expect(systemPrompt).toMatch(/JSON only/);
  });
  it('for a counter gate, every beat that mentions the counter is editable', () => {
    const s: any = story();
    s.beats.push({ id: 'gate', type: 'conditionBeat', name: 'Gate', parameters: { conditionType: 'counter', variableName: 'trust', operator: '>=', value: 5, trueTarget: 'beat_end_a', falseTarget: 'beat_end_b' } });
    const f = analyzeStoryFindings(s).find(x => x.kind === 'unsatisfiable-threshold')!;
    expect(contextBeatsFor(f, s).editable).toEqual(expect.arrayContaining(['gate', 'beat_2']));
  });
});

describe('validateAIFix — the deterministic envelope', () => {
  const ctx = () => ({ story: story() });
  it('accepts an edit that resolves the finding without introducing another, with a before/after preview', () => {
    const r = validateAIFix('{"edits":[{"beatId":"beat_2","path":"choices[1].target","value":"beat_end_b","why":"the other ending"}],"rationale":"typo"}', missing(), ctx(), ['beat_2']);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.suggestion.edits[0]).toMatchObject({ kind: 'ai-edit', source: 'ai', beatId: 'beat_2', path: 'choices[1].target', value: 'beat_end_b', confidence: 'review' });
      expect(r.suggestion.preview[0]).toMatchObject({ before: 'beat_ending', after: 'beat_end_b' });
    }
  });
  it('rejects edits outside the allowed beats', () => {
    const r = validateAIFix('{"edits":[{"beatId":"beat_1","path":"connection.target","value":"beat_end_b"}]}', missing(), ctx(), ['beat_2']);
    expect(r).toMatchObject({ ok: false, reason: expect.stringMatching(/outside/) });
  });
  it('rejects a link to a beat that does not exist', () => {
    const r = validateAIFix('{"edits":[{"beatId":"beat_2","path":"choices[1].target","value":"beat_nope"}]}', missing(), ctx(), ['beat_2']);
    expect(r).toMatchObject({ ok: false, reason: expect.stringMatching(/not a beat/) });
  });
  it('rejects edits that leave the finding in place', () => {
    const r = validateAIFix('{"edits":[{"beatId":"beat_2","path":"question","value":"Hmm?"}]}', missing(), ctx(), ['beat_2']);
    expect(r).toMatchObject({ ok: false, reason: expect.stringMatching(/still found/) });
  });
  it('rejects edits that introduce a new finding', () => {
    // Fixing the typo by re-pointing the OTHER choice away from End A leaves End A unreachable.
    const r = validateAIFix('{"edits":[{"beatId":"beat_2","path":"choices[1].target","value":"beat_end_b"},{"beatId":"beat_2","path":"choices[0].target","value":"beat_end_b"}]}', missing(), ctx(), ['beat_2']);
    expect(r).toMatchObject({ ok: false, reason: expect.stringMatching(/new problem/) });
  });
  it('rejects non-JSON and empty answers with the model\'s own reason', () => {
    expect(validateAIFix('no idea', missing(), ctx(), ['beat_2']).ok).toBe(false);
    expect(validateAIFix('{"edits":[],"rationale":"nothing fits"}', missing(), ctx(), ['beat_2'])).toMatchObject({ ok: false, rationale: 'nothing fits' });
  });
});

describe('requestAIFix', () => {
  it('threads the prompt to the completer and validates the answer', async () => {
    const seen: any[] = [];
    const r = await requestAIFix(missing(), { story: story() }, async (sys, user) => { seen.push(sys, user); return '```json\n{"edits":[{"beatId":"beat_2","path":"choices[1].target","value":"beat_end_b"}],"rationale":"r"}\n```'; });
    expect(seen[1]).toContain('"editableBeatIds"');
    expect(r.ok).toBe(true);
  });
});

describe('validateAIFix — single-exit beats link through connections, not parameters', () => {
  it('an unreachable scene fixed by re-linking two text beats: simulation, preview and edits all use the connections array', () => {
    const s = {
      beats: [
        { id: 'beat_0', type: 'titleScreen', name: 'Title', parameters: {}, connections: [{ targetId: 'beat_1' }] },
        { id: 'beat_1', type: 'infoText', name: 'Intro', parameters: { text: 'campfire' }, connections: [{ targetId: 'beat_2' }] },
        { id: 'beat_2', type: 'endScreen', name: 'End', parameters: {}, connections: [] },
        { id: 'beat_camp', type: 'infoText', name: 'Campfire', parameters: { text: 'x' }, connections: [] },
      ],
    };
    const f = analyzeStoryFindings(s).find(x => x.kind === 'unreachable-beat' && x.beatId === 'beat_camp')!;
    const r = validateAIFix('{"edits":[{"beatId":"beat_1","path":"connection.target","value":"beat_camp"},{"beatId":"beat_camp","path":"connection.target","value":"beat_2"}],"rationale":"spine"}', f, { story: s }, ['beat_1', 'beat_camp']);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.suggestion.preview[0]).toMatchObject({ beatId: 'beat_1', before: 'beat_2', after: 'beat_camp' });
      expect(r.suggestion.preview[1]).toMatchObject({ beatId: 'beat_camp', before: undefined, after: 'beat_2' });
    }
    // re-linking Intro alone would strand the ending → rejected
    const bad = validateAIFix('{"edits":[{"beatId":"beat_1","path":"connection.target","value":"beat_camp"}]}', f, { story: s }, ['beat_1', 'beat_camp']);
    expect(bad).toMatchObject({ ok: false, reason: expect.stringMatching(/new problem/) });
  });
});
