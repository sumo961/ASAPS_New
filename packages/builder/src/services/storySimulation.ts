/**
 * One search of each kind per story for the Debug window, so tools read the
 * same answer instead of each simulating the story again:
 * - the situation search (what can happen) for Problems, Reachability and Story Logic;
 * - the path search (which ways through there are) for Path Analysis and the
 *   Preview's Start as if…, which show or start from whole playthroughs.
 *
 * Keyed by the Story object: the Debug window builds a new one whenever the
 * story changes, so a cached simulation never outlives its story.
 */
import {
  ReachabilityAnalyzer,
  StateSimulationAnalyzer,
  arrivalStates,
  type Story,
  type SimulatedPath,
  type ConstraintPathResult,
  type BeatArrival,
  type SimulationProgress,
  type SituationSearch,
  type StoryEvidence,
  type ReachabilityResult,
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

/** What the situation search found, for the tools that ask what can happen. */
export interface StorySituations {
  analyzer: StateSimulationAnalyzer;
  search: SituationSearch;
  /** Every beat some way of playing reaches, by either search if both have run:
   *  the path search can find a beat the situation search stopped short of. */
  playedBeats: ReadonlySet<string>;
  arrivals: () => Map<string, BeatArrival[]>;
  evidence: StoryEvidence;
}

const situationsCache = new WeakMap<Story, StorySituations>();
const situationsRunning = new WeakMap<Story, { promise: Promise<StorySituations>; signal: { aborted: boolean } }>();
const situationListeners = new WeakMap<Story, Set<(progress: SimulationProgress) => void>>();

function finishSituations(story: Story, analyzer: StateSimulationAnalyzer, search: SituationSearch): StorySituations {
  const played = () => {
    const paths = cache.get(story)?.playedBeats;
    return new Set<string>([...search.perBeat.keys(), ...(paths ?? [])]);
  };
  const situations: StorySituations = {
    analyzer,
    search,
    get playedBeats() { return played(); },
    arrivals: () => search.arrivals,
    evidence: {
      get played() { return played(); },
      hiddenChoices: search.hiddenChoices,
      arrivalsAt: (beatId) => (search.arrivals.get(beatId) ?? []).map((a) => a.state),
    },
  };
  situationsCache.set(story, situations);
  return situations;
}

/**
 * What is reachable, by what the search played. Stopped at its limit, the
 * search marks what it may have missed (unsure); every never-taken link says
 * which condition on the way the players who get there don't meet.
 */
export function reachabilityOf(story: Story, simulation: StorySituations): ReachabilityResult {
  const { analyzer, search } = simulation;
  return new ReachabilityAnalyzer(story, {
    playedBeats: simulation.playedBeats,
    searchLimited: analyzer.searchLimited,
    gatesOnTheWay: (from, to) => analyzer.gatesOnTheWay(from, to, (search.arrivals.get(from) ?? []).map((a) => a.state)),
    ranges: analyzer.rangeFacts,
  }).analyze();
}

export function cachedSituations(story: Story): StorySituations | undefined {
  return situationsCache.get(story);
}

export function searchSituations(story: Story): StorySituations {
  const cached = situationsCache.get(story);
  if (cached) return cached;
  const analyzer = newAnalyzer(story);
  return finishSituations(story, analyzer, analyzer.exploreSituations());
}

/** searchSituations without freezing the window; callers share one run. */
export function searchSituationsAsync(
  story: Story,
  onProgress?: (progress: SimulationProgress) => void,
): Promise<StorySituations> {
  const cached = situationsCache.get(story);
  if (cached) return Promise.resolve(cached);
  let listeners = situationListeners.get(story);
  if (!listeners) situationListeners.set(story, (listeners = new Set()));
  if (onProgress) listeners.add(onProgress);
  const under = situationsRunning.get(story);
  if (under) return under.promise;
  const signal = { aborted: false };
  const analyzer = newAnalyzer(story);
  const run = analyzer
    .exploreSituationsAsync((p) => situationListeners.get(story)?.forEach((l) => l(p)), signal)
    .then((search) => finishSituations(story, analyzer, search))
    .finally(() => {
      if (situationsRunning.get(story)?.signal === signal) {
        situationsRunning.delete(story);
        situationListeners.delete(story);
      }
    });
  situationsRunning.set(story, { promise: run, signal });
  return run;
}

/** Stop a situation search nobody needs any more. */
export function cancelSituations(story: Story): void {
  const under = situationsRunning.get(story);
  if (!under) return;
  under.signal.aborted = true;
  situationsRunning.delete(story);
  situationListeners.delete(story);
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
  // Long enough for a playthrough through every beat twice: a long linear story
  // was cut off short, and a bigger limit only costs time on endless loops.
  const maxDepth = Math.max(300, story.getAllBeats().length * 2);
  return new StateSimulationAnalyzer(story, { maxDepth });
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
