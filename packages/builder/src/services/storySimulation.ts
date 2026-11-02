/**
 * One path simulation per story for the Debug window: Path Analysis
 * (outcomes, tree, warnings), Reachability, Story Logic (arrival states) and the
 * Preview's Start as if… read the same paths instead of each simulating the story again.
 *
 * Keyed by the Story object: the Debug window builds a new one whenever the
 * story changes, so a cached simulation never outlives its story.
 */
import {
  StateSimulationAnalyzer,
  arrivalStates,
  type Story,
  type SimulatedPath,
  type ConstraintPathResult,
  type BeatArrival,
  type SimulationProgress,
} from '@asaps/core';

export interface StorySimulation {
  analyzer: StateSimulationAnalyzer;
  paths: SimulatedPath[];
  /** Outcomes grouped as Path Analysis shows them. */
  result: () => ConstraintPathResult;
  /** For each beat, the distinct states players arrive in. */
  arrivals: () => Map<string, BeatArrival[]>;
  /** Every beat on a path: what reachable means in every tool. */
  playedBeats: ReadonlySet<string>;
}

const cache = new WeakMap<Story, StorySimulation>();
const running = new WeakMap<Story, { promise: Promise<StorySimulation>; signal: { aborted: boolean } }>();

/**
 * The one way every tool simulates a story, so they all see the same paths.
 * Default maxPaths (50k) is needed for real AI stories with wide hub-and-
 * spoke structures: narrow condition-gated endings sit deep in the BFS queue
 * and a small budget exhausts before they are dequeued.
 */
function newAnalyzer(story: Story): StateSimulationAnalyzer {
  return new StateSimulationAnalyzer(story, { maxDepth: 300 });
}

function finish(story: Story, analyzer: StateSimulationAnalyzer, paths: SimulatedPath[], startTime: number): StorySimulation {
  // How long the simulation took (the result may be built later, when Path
  // Analysis is opened; its timing is the simulation's).
  const elapsed = performance.now() - startTime;
  let result: ConstraintPathResult | undefined;
  let arrivals: Map<string, BeatArrival[]> | undefined;
  const sim: StorySimulation = {
    analyzer,
    paths,
    result: () => (result ??= analyzer.resultFromPaths(paths, performance.now() - elapsed)),
    arrivals: () => (arrivals ??= arrivalStates(paths)),
    playedBeats: new Set(paths.flatMap((p) => p.steps.map((step) => step.beatId))),
  };
  cache.set(story, sim);
  return sim;
}

/** The finished simulation, if there is one yet. */
export function cachedSimulation(story: Story): StorySimulation | undefined {
  return cache.get(story);
}

export function simulateStory(story: Story): StorySimulation {
  const cached = cache.get(story);
  if (cached) return cached;
  const startTime = performance.now();
  const analyzer = newAnalyzer(story);
  return finish(story, analyzer, analyzer.analyzeRaw(), startTime);
}

/**
 * simulateStory without freezing the window. Callers asking while one is
 * under way share it, and each hears its progress.
 */
export function simulateStoryAsync(
  story: Story,
  onProgress?: (progress: SimulationProgress) => void,
): Promise<StorySimulation> {
  const cached = cache.get(story);
  if (cached) return Promise.resolve(cached);
  let listeners = progressListeners.get(story);
  if (!listeners) progressListeners.set(story, (listeners = new Set()));
  if (onProgress) listeners.add(onProgress);
  const under = running.get(story);
  if (under) return under.promise;
  const signal = { aborted: false };
  const startTime = performance.now();
  const analyzer = newAnalyzer(story);
  const run = analyzer
    .analyzeRawAsync((p) => progressListeners.get(story)?.forEach((l) => l(p)), signal)
    .then((paths) => finish(story, analyzer, paths, startTime))
    .finally(() => {
      if (running.get(story)?.signal === signal) {
        running.delete(story);
        progressListeners.delete(story);
      }
    });
  running.set(story, { promise: run, signal });
  return run;
}

/** Stop a simulation nobody needs any more (the story changed, the window moved on). */
export function cancelSimulation(story: Story): void {
  const under = running.get(story);
  if (!under) return;
  under.signal.aborted = true;
  running.delete(story);
  progressListeners.delete(story);
}

const progressListeners = new WeakMap<Story, Set<(progress: SimulationProgress) => void>>();
