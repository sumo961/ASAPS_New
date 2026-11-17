/**
 * Where the story starts: the beat set in Project Settings ▸ Project ▸
 * "Story starts at", else the first Title Screen, else the first beat (as
 * Story.getFirstBeatId decides). The flowchart marks it and its right-click
 * menu sets it.
 */
import { createContext, useContext } from 'react';

interface StoryStartValue {
  startBeatId: string | null;
  /** Make this beat the start; absent where the story can't be changed. */
  setStartBeat?: (beatId: string) => void;
}

export const StoryStartContext = createContext<StoryStartValue>({ startBeatId: null });
export const useStoryStart = () => useContext(StoryStartContext);

export function resolveStoryStart(
  beats: ReadonlyArray<{ id: string; type: string }>,
  setting: string | undefined,
): string | null {
  if (setting && beats.some((b) => b.id === setting)) return setting;
  return beats.find((b) => b.type === 'titleScreen')?.id ?? beats[0]?.id ?? null;
}
