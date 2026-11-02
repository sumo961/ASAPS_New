import type { ConstraintPathResult } from '@asaps/core';

export interface BackwardTarget {
  beatId: string;
  beatName: string;
}

export interface BackwardTargets {
  endings: BackwardTarget[];
  deadEnds: BackwardTarget[];
  loops: BackwardTarget[];
  /** End screens no way of playing reaches. */
  neverReached: BackwardTarget[];
  /** Every beat, for looking one up by name. */
  all: BackwardTarget[];
}

/**
 * The beats the Backward view offers, sorted by what they are, from the same
 * simulation the Forward view shows: where playthroughs really end, not just
 * which beats have no links.
 */
export function backwardTargets(
  result: Pick<ConstraintPathResult, 'outcomes'> | null,
  beats: ReadonlyArray<{ id: string; name: string; type: string }>,
): BackwardTargets {
  const groups: Record<'ending' | 'deadEnd' | 'stuck', Map<string, BackwardTarget>> = {
    ending: new Map(), deadEnd: new Map(), stuck: new Map(),
  };
  for (const o of result?.outcomes ?? []) {
    const group = groups[o.endType as keyof typeof groups];
    if (group) group.set(o.endingBeatId, { beatId: o.endingBeatId, beatName: o.endingBeatName });
  }
  const label = (b: { id: string; name: string }) => ({ beatId: b.id, beatName: b.name });
  const byName = (a: BackwardTarget, b: BackwardTarget) => a.beatName.localeCompare(b.beatName);
  return {
    endings: [...groups.ending.values()].sort(byName),
    deadEnds: [...groups.deadEnd.values()].sort(byName),
    loops: [...groups.stuck.values()].sort(byName),
    neverReached: beats
      .filter((b) => (b.type === 'endScreen' || b.type === 'aiSummary') && !groups.ending.has(b.id))
      .map(label).sort(byName),
    all: beats.map(label).sort(byName),
  };
}
