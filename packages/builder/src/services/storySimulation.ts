/**
 * One path simulation per story for the Debug window: Path Analysis
 * (outcomes, tree, warnings) and Story Logic (arrival states) read the same
 * paths instead of each simulating the story again.
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
} from '@asaps/core';

export interface StorySimulation {
  analyzer: StateSimulationAnalyzer;
  paths: SimulatedPath[];
  /** Outcomes grouped as Path Analysis shows them. */
  result: () => ConstraintPathResult;
  /** For each beat, the distinct states players arrive in. */
  arrivals: () => Map<string, BeatArrival[]>;
}

const cache = new WeakMap<Story, StorySimulation>();

export function simulateStory(story: Story): StorySimulation {
  const cached = cache.get(story);
  if (cached) return cached;
  const startTime = performance.now();
  // Default maxPaths (50k) is needed for real AI stories with wide hub-and-
  // spoke structures — narrow condition-gated endings sit deep in the BFS
  // queue and a small budget exhausts before they are dequeued.
  const analyzer = new StateSimulationAnalyzer(story, { maxDepth: 300 });
  const paths = analyzer.analyzeRaw();
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
  };
  cache.set(story, sim);
  return sim;
}
