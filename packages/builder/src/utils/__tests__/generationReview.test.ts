import { describe, it, expect } from 'vitest';
import { analyzeStoryFindings, proposeFixes, idSimilarity, closestBeatId, buildParameterPatch, openFindings, createGenerationReview, planBeatEdit, applyPlanToSerializedBeat } from '../generationReview';

const story = () => ({
  metadata: { title: 'T' },
  beats: [
    { id: 'beat_0', type: 'titleScreen', name: 'Title', parameters: { connection: { target: 'beat_1' } } },
    { id: 'beat_1', type: 'infoText', name: 'Intro', parameters: { connection: { target: 'beat_2' } } },
    { id: 'beat_2', type: 'multiChoice', name: 'Fork', parameters: { choices: [
      { text: 'kind', target: 'beat_gate', effects: [{ type: 'incrementCounter', target: 'trust', value: 1 }] },
      { text: 'typo', target: 'beat_end_kind' },
    ] } },
    { id: 'beat_gate', type: 'conditionBeat', name: 'Gate', parameters: { conditionType: 'counter', variableName: 'trust', operator: '>=', value: 3, trueTarget: 'beat_end_kindness', falseTarget: 'beat_end_cold' } },
    { id: 'beat_orphan_setup', type: 'infoText', name: 'Setup', parameters: {} },
    { id: 'beat_orphan', type: 'infoText', name: 'Lost scene', parameters: { connection: { target: 'beat_end_cold' } } },
    { id: 'beat_end_kindness', type: 'endScreen', name: 'Kind end', parameters: {} },
    { id: 'beat_end_cold', type: 'endScreen', name: 'Cold end', parameters: {} },
  ],
});

describe('analyzeStoryFindings', () => {
  it('finds the typo target, the unreachable beats and the unsatisfiable gate, each typed', () => {
    const f = analyzeStoryFindings(story());
    const kinds = f.map(x => x.kind + ':' + x.beatId);
    expect(kinds).toContain('missing-target:beat_2');
    expect(kinds).toContain('unreachable-beat:beat_orphan_setup');
    expect(kinds).toContain('unreachable-beat:beat_orphan');
    expect(kinds).toContain('unsatisfiable-threshold:beat_gate');
    const missing: any = f.find(x => x.kind === 'missing-target');
    expect(missing.targetId).toBe('beat_end_kind');
    expect(missing.path).toBe('choices[1].target');
    const gate: any = f.find(x => x.kind === 'unsatisfiable-threshold');
    expect(gate).toMatchObject({ branch: 'true', counterName: 'trust', requiredValue: 3, maxValue: 1, counterModified: true, nested: false });
  });
  it('reports an unmodified counter as such (no clamp proposal follows)', () => {
    const s: any = story();
    s.beats[2].parameters.choices[0].effects = [];
    const gate: any = analyzeStoryFindings(s).find(x => x.kind === 'unsatisfiable-threshold');
    expect(gate.counterModified).toBe(false);
    expect(proposeFixes([gate], s)).toEqual([]);
  });
});

describe('proposeFixes', () => {
  it('retargets a typo to the closest id, clamps the threshold, links the orphan from the beat before it', () => {
    const s = story();
    const p = proposeFixes(analyzeStoryFindings(s), s);
    const byKind = Object.fromEntries(p.map(x => [x.kind, x]));
    expect(byKind['retarget']).toMatchObject({ beatId: 'beat_2', path: 'choices[1].target', value: 'beat_end_kindness' });
    expect(byKind['clamp-threshold']).toMatchObject({ beatId: 'beat_gate', path: 'value', value: 1, confidence: 'review' });
    // beat_orphan follows beat_orphan_setup, whose single exit is free
    expect(byKind['link-from-previous']).toMatchObject({ beatId: 'beat_orphan_setup', path: 'connection.target', value: 'beat_orphan' });
    // beat_orphan_setup follows the gate, which is not a single-exit type → no proposal for it
    expect(p.filter(x => x.kind === 'link-from-previous')).toHaveLength(1);
  });
  it('never proposes a retarget when two ids are equally plausible', () => {
    expect(closestBeatId('beat_end', ['beat_end_a', 'beat_end_b'])).toBeNull();
    expect(closestBeatId('beat_end_kind', ['beat_end_kindness', 'beat_start'])?.id).toBe('beat_end_kindness');
    expect(idSimilarity('beat_end_kind', 'beat_end_kindness')).toBeGreaterThan(0.8);
  });
});

describe('buildParameterPatch', () => {
  it('replaces the whole top-level parameter with the leaf changed, and keeps the old one for undo', () => {
    const params = { choices: [{ text: 'a', target: 'x' }, { text: 'b', target: 'bad' }], question: 'q' };
    const patch = buildParameterPatch(params, 'choices[1].target', 'good');
    expect(patch.key).toBe('choices');
    expect(patch.next.choices[1].target).toBe('good');
    expect(patch.next.choices[0]).toEqual({ text: 'a', target: 'x' });
    expect(patch.prev.choices[1].target).toBe('bad');
    expect(params.choices[1].target).toBe('bad'); // input untouched
  });
  it('creates intermediate objects and handles flat keys', () => {
    expect(buildParameterPatch({}, 'connection.target', 'b2').next).toEqual({ connection: { target: 'b2' } });
    expect(buildParameterPatch({ value: 3 }, 'value', 1)).toEqual({ key: 'value', next: { value: 1 }, prev: { value: 3 } });
  });
});

describe('review record', () => {
  it('tracks open findings by status', () => {
    const s = story();
    const findings = analyzeStoryFindings(s);
    const review = createGenerationReview({ source: 'generator', title: 'T', original: s, findings, proposals: proposeFixes(findings, s) });
    expect(openFindings(review)).toHaveLength(findings.length);
    review.status[findings[0].id] = 'applied';
    expect(openFindings(review)).toHaveLength(findings.length - 1);
  });
});

describe('after the normalize pipeline (trueTarget → trueConnection string alias)', () => {
  it('still sees the gate and its exits: no false unreachable, threshold finding present', () => {
    const s: any = story();
    const gate = s.beats.find((b: any) => b.id === 'beat_gate');
    gate.parameters = { conditionType: 'counter', variableName: 'trust', operator: '>=', value: 3, trueConnection: 'beat_end_kindness', falseConnection: 'beat_end_cold' };
    const f = analyzeStoryFindings(s);
    expect(f.some(x => x.kind === 'unreachable-beat' && x.beatId === 'beat_end_kindness')).toBe(false);
    expect(f.some(x => x.kind === 'unsatisfiable-threshold' && x.beatId === 'beat_gate')).toBe(true);
  });
  it('flattenConditionParams accepts the string form', async () => {
    const { flattenConditionParams } = await import('../applyGeneratedStory');
    expect(flattenConditionParams({ trueConnection: 'a', falseConnection: { target: 'b' } })).toEqual({ trueTarget: 'a', falseTarget: 'b' });
  });
});

describe('planBeatEdit — connections vs parameters', () => {
  it('routes a connection edit on a single-exit beat to the beat-level connections array', () => {
    const plan = planBeatEdit({ type: 'infoText', name: 'Intro', parameters: { text: 'x' }, connections: [{ targetId: 'beat_2', label: 'To Fork' }] }, 'connection.target', 'beat_camp');
    expect(plan.kind).toBe('connections');
    expect(plan.next).toEqual({ connections: [{ targetId: 'beat_camp', label: 'To Fork' }] });
    expect(plan.prev).toEqual({ connections: [{ targetId: 'beat_2', label: 'To Fork' }] });
    expect(plan.before).toBe('beat_2');
    expect(plan.after).toBe('beat_camp');
  });
  it('accepts the object form too, and writes an empty array when the beat had no link', () => {
    const plan = planBeatEdit({ type: 'infoText', parameters: {} }, 'connection', { target: 'beat_2' });
    expect(plan.next).toEqual({ connections: [{ targetId: 'beat_2' }] });
    expect(plan.prev).toEqual({ connections: [] });
    expect(plan.before).toBeUndefined();
  });
  it('keeps parameter-derived types and every other path as a parameter patch', () => {
    const plan = planBeatEdit({ type: 'multiChoice', parameters: { choices: [{ target: 'a' }] } }, 'choices[0].target', 'b');
    expect(plan.kind).toBe('parameters');
    expect(plan.next.parameters.choices[0].target).toBe('b');
    expect(applyPlanToSerializedBeat).toBeTypeOf('function');
  });
});
