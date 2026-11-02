import type { SimulationProgress } from '@asaps/core';

/**
 * The words every debug tool uses. One place, so Reachability, Path Analysis,
 * Story Logic and the Preview don't each name the same thing differently.
 */
export const END_TYPE_LABEL: Record<string, string> = {
  ending: 'Ending',
  deadEnd: 'Dead end',
  stuck: 'Stuck in a loop',
  cycle: 'Back to a menu',
  depthLimit: 'Cut off',
};

export const END_TYPE_HELP: Record<string, string> = {
  ending: 'An End Screen or AI Summary.',
  deadEnd: 'The story stops here without an end screen.',
  stuck: 'The player keeps coming back here and no way on gets out.',
  cycle: 'The path came back to a choice with nothing new to find. The player can still leave by another choice.',
  depthLimit: 'The analysis stopped following this path because it grew very long. It is not a fault in the story.',
};

export const END_TYPE_STYLE: Record<string, string> = {
  ending: 'bg-green-100 text-green-700',
  deadEnd: 'bg-red-100 text-red-700',
  stuck: 'bg-red-100 text-red-700',
  cycle: 'bg-purple-100 text-purple-700',
  depthLimit: 'bg-orange-100 text-orange-700',
};

const PHASE: Record<SimulationProgress['phase'], string> = {
  exploring: 'Trying every way through',
  unreached: 'Looking for beats not reached yet',
  replay: 'Following Replay buttons',
};

/** "Looking for beats not reached yet: 12,430 paths, 287 of 419 beats reached". */
export function simulationProgressText(progress: SimulationProgress | null, totalBeats: number): string {
  if (!progress) return `Starting, ${totalBeats.toLocaleString()} beats to check`;
  return `${PHASE[progress.phase]}: ${progress.pathsFound.toLocaleString()} paths, ${progress.beatsReached.toLocaleString()} of ${totalBeats.toLocaleString()} beats reached`;
}

/** The same, for a small button: "287 of 419 beats". */
export function simulationProgressShort(progress: SimulationProgress, totalBeats: number): string {
  return `${progress.beatsReached.toLocaleString()} of ${totalBeats.toLocaleString()} beats`;
}
