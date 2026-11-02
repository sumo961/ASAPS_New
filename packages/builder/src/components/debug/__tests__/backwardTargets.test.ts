import { describe, it, expect } from 'vitest';
import { backwardTargets } from '../backwardTargets';

const beats = [
  { id: 'e1', name: 'Win', type: 'endScreen' },
  { id: 'e2', name: 'Lost forever', type: 'endScreen' },
  { id: 's', name: 'Stop', type: 'dialogTree' },
  { id: 'l', name: 'Loop', type: 'dialogTree' },
  { id: 'x', name: 'Orphan', type: 'infoText' },
];
const outcomes: any[] = [
  { endType: 'ending', endingBeatId: 'e1', endingBeatName: 'Win' },
  { endType: 'deadEnd', endingBeatId: 's', endingBeatName: 'Stop' },
  { endType: 'cycle', endingBeatId: 'l', endingBeatName: 'Loop' },
  { endType: 'depthLimit', endingBeatId: 'x', endingBeatName: 'Orphan' },
];

describe('backwardTargets', () => {
  it('sorts beats by how playthroughs really end', () => {
    const t = backwardTargets({ outcomes }, beats);
    expect(t.endings.map((b) => b.beatId)).toEqual(['e1']);
    expect(t.deadEnds.map((b) => b.beatId)).toEqual(['s']);
    expect(t.loops.map((b) => b.beatId)).toEqual(['l']);
    expect(t.neverReached.map((b) => b.beatId)).toEqual(['e2']);
    expect(t.all).toHaveLength(5);
  });

  it('with no result yet, every end screen waits under never reached', () => {
    expect(backwardTargets(null, beats).neverReached).toHaveLength(2);
  });
});
