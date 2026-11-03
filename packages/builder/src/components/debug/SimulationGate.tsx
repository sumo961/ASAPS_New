import React, { useEffect, useState } from 'react';
import type { SimulationProgress, Story } from '@asaps/core';
import {
  cachedSimulation, cachedSituations, cancelSimulation, cancelSituations, searchSituationsAsync, simulateStoryAsync,
} from '../../services/storySimulation';
import { simulationProgressText } from './debugWording';

/**
 * Runs the search the open tool reads before the tool, so it finds it ready.
 * A large story takes a while: the window stays usable and says how far it has
 * got. If the search fails, the tools handle that themselves.
 */
export const SimulationGate: React.FC<{ story: Story; needs: 'situations' | 'paths'; children: React.ReactNode }> = ({ story, needs, children }) => {
  const isCached = () => (needs === 'paths' ? cachedSimulation(story) : cachedSituations(story)) !== undefined;
  const [readyFor, setReadyFor] = useState<string | null>(() => (isCached() ? needs : null));
  const [readyStory, setReadyStory] = useState<Story>(story);
  const [progress, setProgress] = useState<SimulationProgress | null>(null);

  useEffect(() => {
    const done = () => { setReadyStory(story); setReadyFor(needs); };
    if (isCached()) { done(); return; }
    let current = true;
    setReadyFor(null);
    setProgress(null);
    const onProgress = (p: SimulationProgress) => { if (current) setProgress(p); };
    const run: Promise<unknown> = needs === 'paths' ? simulateStoryAsync(story, onProgress) : searchSituationsAsync(story, onProgress);
    run
      .catch((err) => { if (err?.name !== 'AbortError') console.error('[SimulationGate] Search failed:', err); })
      .finally(() => { if (current) done(); });
    return () => { current = false; if (needs === 'paths') cancelSimulation(story); else cancelSituations(story); };
  }, [story, needs]);

  if (readyFor === needs && readyStory === story) return <>{children}</>;
  return <SimulationProgressNote progress={progress} totalBeats={story.getAllBeats().length} />;
};

export const SimulationProgressNote: React.FC<{ progress: SimulationProgress | null; totalBeats: number }> = ({ progress, totalBeats }) => (
  <div className="flex flex-col items-center justify-center py-16 text-gray-600" role="status" aria-live="polite">
    <div className="w-8 h-8 mb-3 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
    <p className="text-sm font-medium">Playing through the story…</p>
    <p className="text-xs text-gray-500 mt-1">{simulationProgressText(progress, totalBeats)}</p>
  </div>
);

/** Said wherever "unreachable" is, when the search stopped before trying everything. */
export const SearchLimitNote: React.FC = () => (
  <div className="p-2 mb-2 rounded border border-amber-200 bg-amber-50 text-xs text-amber-800">
    This story is too large to try every way through, and the search stopped at its limit. An unreachable beat here is one it did not find, so it may still be possible to reach it.
  </div>
);
