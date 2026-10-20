import { describe, it, expect } from 'vitest';
import { newBeatId, shortenRunawayBeatIds, isRunawayBeatId } from '../beatIds';

describe('newBeatId', () => {
  it('makes beat_ plus eight lowercase letters or digits, never twice in a large batch', () => {
    const ids = new Set(Array.from({ length: 5000 }, () => newBeatId()));
    expect(ids.size).toBe(5000);
    for (const id of ids) expect(id).toMatch(/^beat_[0-9a-z]{8}$/);
  });
});

describe('shortenRunawayBeatIds', () => {
  const long = 'beat_20_copymv8ch5921_copymv8cjm1q1_copymv8ck2zz1';
  it('shortens copy-of-copy ids and rewrites every reference, leaving ordinary ids alone', () => {
    const project = {
      story: {
        metadata: { firstBeatId: long },
        beats: [
          { id: long, type: 'infoText', parameters: { text: 'Hi' }, connections: [{ targetId: 'beat_20_copymv8ch5921' }] },
          { id: 'beat_20_copymv8ch5921', type: 'dialogTree', parameters: { dialogTree: { id: 'n0', choices: [{ id: 'c', target: long }] } }, connections: [] },
          { id: 'beat_1', type: 'infoText', parameters: {}, connections: [{ targetId: long }] },
        ],
        clusters: [{ id: 'c1', beatIds: [long, 'beat_1'] }],
      },
      globalSettings: { restartTarget: long },
      createdAt: new Date('2026-01-01'),
    };
    const { project: fixed, renamed } = shortenRunawayBeatIds(project);
    expect(renamed).toBe(1);
    const fresh = fixed.story.beats[0].id;
    expect(fresh).toMatch(/^beat_[0-9a-z]{8}$/);
    expect(fixed.story.metadata.firstBeatId).toBe(fresh);
    expect(fixed.story.beats[1].parameters.dialogTree.choices[0].target).toBe(fresh);
    expect(fixed.story.beats[2].connections[0].targetId).toBe(fresh);
    expect(fixed.story.clusters[0].beatIds).toEqual([fresh, 'beat_1']);
    expect(fixed.globalSettings.restartTarget).toBe(fresh);
    // one copy suffix is fine; dates survive
    expect(fixed.story.beats[1].id).toBe('beat_20_copymv8ch5921');
    expect((fixed as any).createdAt).toBeInstanceOf(Date);
  });

  it('returns the same project when nothing is runaway', () => {
    const p = { story: { beats: [{ id: 'beat_1' }, { id: 'beat_20_copymv8ch5921' }] } };
    expect(shortenRunawayBeatIds(p).project).toBe(p);
    expect(isRunawayBeatId('x'.repeat(33))).toBe(true);
  });
});
