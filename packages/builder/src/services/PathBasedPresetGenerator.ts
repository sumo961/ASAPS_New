/**
 * PathBasedPresetGenerator - Generate state presets from path analysis
 *
 * Uses StateSimulationAnalyzer to find all paths through a story,
 * then extracts the simulation state at specific beats to create
 * presets for testing.
 */

import { StoryContext, type Story, type StatePreset } from '@asaps/core';
import {
  StateSimulationAnalyzer,
  type SimulationState,
  type SimulatedPath,
  type SimulatedStep,
  type SimulationProgress,
} from '@asaps/core';

/**
 * Information about an inputText beat that needs user input
 */
export interface InputTextBeatInfo {
  beatId: string;
  beatName: string;
  prompt: string;
  variableName: string;
  saveToType: 'variable' | 'counter' | 'characterName';
  validation: 'none' | 'numeric' | 'email' | 'alphanumeric';
  placeholder?: string;
  minLength?: number;
  maxLength?: number;
  // The auto-generated placeholder value from simulation
  simulatedValue: string | number;
}

/**
 * A generated preset with path context
 */
export interface GeneratedPreset {
  // Preset data (ready to use)
  preset: Omit<StatePreset, 'id' | 'createdAt' | 'modifiedAt'>;

  // Path context for grouping/display
  outcomeGroup: string;        // Which ending this path leads to
  pathDescription: string;     // e.g., "Via Expert A → Expert B"
  pathIndex: number;           // Index in the outcome group
  totalPathsInGroup: number;   // How many paths lead to this outcome

  // InputText beats in this path that need user input
  inputTextBeats: InputTextBeatInfo[];

  // How many paths lead to this exact game state (after dedup)
  pathCount: number;
}

/**
 * Result of preset generation
 */
export interface PresetGenerationResult {
  targetBeatId: string;
  targetBeatName: string;
  presets: GeneratedPreset[];       // Deduplicated by game state
  totalPaths: number;               // Total paths before dedup
  analysisTime: number;
}

/**
 * Generate state presets from path analysis
 *
 * @param story - The story to analyze
 * @param targetBeatId - The beat to generate presets for
 * @returns Generated presets grouped by outcome
 */
export function generatePathPresets(
  story: Story,
  targetBeatId: string
): PresetGenerationResult {
  const startTime = performance.now();

  const targetBeat = story.getBeat(targetBeatId);
  if (!targetBeat) {
    return {
      targetBeatId,
      targetBeatName: 'Unknown',
      presets: [],
      totalPaths: 0,
      analysisTime: performance.now() - startTime,
    };
  }

  const analyzer = presetAnalyzer(story);
  return presetsFromAnalysis(story, targetBeat, analyzer, analyzer.analyze(), startTime);
}

/**
 * generatePathPresets without freezing the UI: the path simulation runs in
 * frame-sized slices and reports progress between them.
 */
export async function generatePathPresetsAsync(
  story: Story,
  targetBeatId: string,
  onProgress?: (progress: SimulationProgress) => void,
  signal?: { aborted: boolean }
): Promise<PresetGenerationResult> {
  const startTime = performance.now();
  const targetBeat = story.getBeat(targetBeatId);
  if (!targetBeat) {
    return { targetBeatId, targetBeatName: 'Unknown', presets: [], totalPaths: 0, analysisTime: performance.now() - startTime };
  }
  const analyzer = presetAnalyzer(story);
  const analysisResult = await analyzer.analyzeAsync(onProgress, signal);
  return presetsFromAnalysis(story, targetBeat, analyzer, analysisResult, startTime);
}

function presetAnalyzer(story: Story): StateSimulationAnalyzer {
  return new StateSimulationAnalyzer(story, {
    // The simulation is bounded by its own queue/step caps now (a 76-beat
    // story takes ~1.5 s at any budget); 500 left late beats with no preset.
    maxPaths: 20000,
    maxDepth: 100,
  });
}

function presetsFromAnalysis(
  story: Story,
  targetBeat: NonNullable<ReturnType<Story['getBeat']>>,
  analyzer: StateSimulationAnalyzer,
  analysisResult: ReturnType<StateSimulationAnalyzer['analyze']>,
  startTime: number
): PresetGenerationResult {
  const targetBeatId = targetBeat.id;

  // Find paths that pass through the target beat
  const pathsToTarget = findPathsToTarget(analysisResult.outcomes, targetBeatId);

  // Generate presets from the paths
  const presets = pathsToTarget.map((pathInfo, index) => {
    const { path, stepIndex, outcomeGroup, pathIndexInGroup, totalInGroup } = pathInfo;

    // The state the player ARRIVES with — the preset starts the story AT this
    // beat, which then runs its own effects. (stateAfter of the target itself
    // already included them, and for a dialog tree the effects of whichever
    // choice this path went on to take.)
    const stateAtTarget = stepIndex > 0 ? path.steps[stepIndex - 1].stateAfter : createEmptyState();

    // Build the path description from decisions
    const pathDescription = buildPathDescription(path, stepIndex);

    // Convert simulation state to preset format
    const preset = convertToPreset(
      stateAtTarget,
      targetBeatId,
      targetBeat.name,
      pathDescription,
      outcomeGroup,
      path.steps.slice(0, stepIndex + 1).map(s => s.beatId)
    );
    const affect = analyzer.affectAt(stateAtTarget);
    if (affect) preset.state.affect = affect;

    // Extract inputText beats from the path (up to the target beat)
    const inputTextBeats = extractInputTextBeats(story, path, stepIndex, stateAtTarget);

    return {
      preset,
      outcomeGroup,
      pathDescription,
      pathIndex: pathIndexInGroup,
      totalPathsInGroup: totalInGroup,
      inputTextBeats,
      pathCount: 1,
    };
  });

  // Deduplicate presets with identical states, then with states that only
  // differ in what nothing from here on reads (hundreds → a handful).
  const totalPaths = presets.length;
  const uniquePresets = condenseByRelevance(deduplicatePresets(presets), relevantState(story, targetBeatId));

  return {
    targetBeatId,
    targetBeatName: targetBeat.name,
    presets: uniquePresets,
    totalPaths,
    analysisTime: performance.now() - startTime,
  };
}

/**
 * Find all paths that pass through a target beat
 */
function findPathsToTarget(
  outcomes: any[],
  targetBeatId: string
): Array<{
  path: SimulatedPath;
  stepIndex: number;
  outcomeGroup: string;
  pathIndexInGroup: number;
  totalInGroup: number;
}> {
  const result: Array<{
    path: SimulatedPath;
    stepIndex: number;
    outcomeGroup: string;
    pathIndexInGroup: number;
    totalInGroup: number;
  }> = [];

  for (const outcome of outcomes) {
    // Each outcome has pathVariations with simulated paths
    const paths = outcome.pathVariations || [];
    let pathIndexInGroup = 0;

    for (const variation of paths) {
      // Check if the path has detailed step data
      // If not, we need to reconstruct from pathBeatIds
      if (variation.simulatedPath) {
        const path = variation.simulatedPath as SimulatedPath;
        const stepIndex = path.steps.findIndex(s => s.beatId === targetBeatId);

        if (stepIndex !== -1) {
          result.push({
            path,
            stepIndex,
            outcomeGroup: outcome.endingBeatName || 'Unknown Ending',
            pathIndexInGroup,
            totalInGroup: paths.length,
          });
        }
      } else if (variation.pathBeatIds) {
        // Path beat IDs are available but not full state data
        // We can still check if the path passes through target
        const beatIds = variation.pathBeatIds as string[];
        const stepIndex = beatIds.indexOf(targetBeatId);

        if (stepIndex !== -1 && variation.finalState) {
          // Create a minimal path structure
          result.push({
            path: {
              steps: beatIds.map((beatId, i) => ({
                beatId,
                beatName: beatId,
                beatType: 'unknown',
                stateAfter: i === beatIds.length - 1 ? variation.finalState : createEmptyState(),
              })),
              decisions: variation.decisions || [],
              outcome: {
                beatId: outcome.endingBeatId || '',
                beatName: outcome.endingBeatName || 'Unknown',
                type: 'ending' as const,
              },
              finalState: variation.finalState,
            },
            stepIndex,
            outcomeGroup: outcome.endingBeatName || 'Unknown Ending',
            pathIndexInGroup,
            totalInGroup: paths.length,
          });
        }
      }

      pathIndexInGroup++;
    }
  }

  return result;
}

/**
 * Build a human-readable path description
 */
function buildPathDescription(path: SimulatedPath, upToIndex: number): string {
  // Decisions taken BEFORE arriving — not the one made at the target itself.
  const relevant = path.steps.slice(0, upToIndex).filter(s => s.decisionMade);

  if (relevant.length === 0) {
    return 'Direct path';
  }

  // Take up to 3 most recent decisions
  const recent = relevant.slice(-3);
  return 'Via ' + recent.map(s => s.decisionMade).join(' → ');
}

/**
 * Extract inputText beat information from a path
 */
function extractInputTextBeats(
  story: Story,
  path: SimulatedPath,
  upToIndex: number,
  stateAtTarget: SimulationState
): InputTextBeatInfo[] {
  const inputTextBeats: InputTextBeatInfo[] = [];

  // Look through the path steps up to the target beat
  for (let i = 0; i <= upToIndex; i++) {
    const step = path.steps[i];
    if (step.beatType === 'inputText' || step.beatType === 'keypad') {
      const beat = story.getBeat(step.beatId);
      if (!beat) continue;

      const params = beat.getParameters();
      const variableName = params.variable || params.variableName || 'userInput';
      const saveToType = params.saveToType || 'variable';
      const validation = params.validation || 'none';

      // Get the simulated value from state
      let simulatedValue: string | number = '';
      if (saveToType === 'variable') {
        const value = stateAtTarget.variables.get(variableName);
        // Convert boolean to string, otherwise use as-is
        simulatedValue = typeof value === 'boolean' ? String(value) : (value || '');
      } else if (saveToType === 'counter') {
        const counterName = params.counter;
        simulatedValue = stateAtTarget.counters.get(counterName) || 0;
      } else if (saveToType === 'characterName') {
        const charKey = `character_${params.characterId}_name`;
        const value = stateAtTarget.variables.get(charKey);
        simulatedValue = typeof value === 'boolean' ? String(value) : (value || '');
      }

      inputTextBeats.push({
        beatId: step.beatId,
        beatName: step.beatName,
        prompt: params.prompt || 'Enter your response:',
        variableName,
        saveToType: saveToType as 'variable' | 'counter' | 'characterName',
        validation: validation as 'none' | 'numeric' | 'email' | 'alphanumeric',
        placeholder: params.placeholder,
        minLength: params.minLength,
        maxLength: params.maxLength,
        simulatedValue,
      });
    }
  }

  return inputTextBeats;
}

/**
 * Convert SimulationState to StatePreset format
 */
function convertToPreset(
  state: SimulationState,
  beatId: string,
  beatName: string,
  pathDescription: string,
  outcomeGroup: string,
  visitedBeatIds: string[]
): Omit<StatePreset, 'id' | 'createdAt' | 'modifiedAt'> {
  // Convert Map-based state to Record-based preset format
  const variables: Record<string, string> = {};
  state.variables.forEach((value, key) => {
    variables[key] = String(value);
  });

  const counters: Record<string, number> = {};
  state.counters.forEach((value, key) => {
    counters[key] = value;
  });

  // Flatten inventory (combine all characters' items)
  const inventory: string[] = [];
  state.inventory.forEach((items) => {
    items.forEach((item) => {
      if (!inventory.includes(item)) {
        inventory.push(item);
      }
    });
  });

  return {
    name: `${beatName} - ${pathDescription}`,
    description: `State at "${beatName}" (${outcomeGroup})`,
    beatId,
    state: {
      variables,
      counters,
      inventory,
      visitedBeats: visitedBeatIds,
    },
  };
}

/**
 * Create an empty simulation state
 */
function createEmptyState(): SimulationState {
  return {
    variables: new Map(),
    counters: new Map(),
    inventory: new Map(),
    visitedBeats: new Set(),
  };
}

/**
 * What can make a difference from `targetBeatId` on, in any beat reachable
 * from it (the beat included): every variable / counter / inventory
 * condition (beat conditions, choice guards, requirements) and every text
 * placeholder.
 */
export function relevantState(story: Story, targetBeatId: string): { conditions: any[]; placeholders: Set<string>; context: StoryContext } {
  const conditions: any[] = [];
  const placeholders = new Set<string>();
  const seenConds = new Set<string>();
  const seen = new Set<string>();
  const queue = [targetBeatId];
  const collect = (o: any): void => {
    if (Array.isArray(o)) { o.forEach(collect); return; }
    if (!o || typeof o !== 'object') return;
    // Any condition: variables, counters, items — and feelings (sentiment,
    // mood, emotion, goal, variant), which presets now carry.
    if (typeof o.operator === 'string' && (typeof o.type === 'string' || typeof o.variableName === 'string')) {
      const k = JSON.stringify(o);
      if (!seenConds.has(k)) { seenConds.add(k); conditions.push(o); }
    }
    Object.values(o).forEach(collect);
  };
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const beat: any = story.getBeat(id);
    if (!beat) continue;
    const data = { p: beat.getParameters?.(), r: beat.requires, c: beat.connections };
    collect(data);
    for (const m of JSON.stringify(data).matchAll(/\$\{([^}]+)\}|(?<!\$)\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)\$/g)) {
      placeholders.add((m[1] ?? m[2] ?? m[3]).trim());
    }
    // A restart resets state: nothing past it depends on the arrival state.
    for (const c of beat.getConnections?.() ?? []) if (c.role !== 'restart') queue.push(c.targetId);
    for (const r of beat.requires ?? []) if (r?.fallbackTarget) queue.push(r.fallbackTarget);
    if (beat.defaultTarget) queue.push(beat.defaultTarget);
  }
  // A runtime context for evaluating them (feelings need the story's cast).
  let context: StoryContext;
  try { context = new StoryContext(undefined, story); } catch { context = new StoryContext(); }
  return { conditions, placeholders, context };
}

/**
 * Merge presets that play the same from the target beat on: every condition
 * ahead comes out the same and every placeholder reads the same. The kept
 * preset keeps its FULL state (play is unchanged); pathCount sums the rest.
 */
function condenseByRelevance(presets: GeneratedPreset[], relevant: { conditions: any[]; placeholders: Set<string>; context: StoryContext }): GeneratedPreset[] {
  const seen = new Map<string, GeneratedPreset>();
  for (const p of presets) {
    const { variables, counters, inventory, affect } = p.preset.state;
    const ctx = relevant.context;
    ctx.loadSimulationState((affect ?? {}) as any, variables, counters, inventory);
    const outcomes = relevant.conditions.map((c) => { try { return ctx.checkCondition(c) ? 1 : 0; } catch { return -1; } });
    const texts = [...relevant.placeholders].map((n) => variables[n] ?? counters[n] ?? null);
    const key = JSON.stringify([outcomes, texts]);
    const kept = seen.get(key);
    if (kept) kept.pathCount += p.pathCount;
    else seen.set(key, p);
  }
  return Array.from(seen.values());
}

/**
 * Deduplicate presets with identical states
 */
function deduplicatePresets(presets: GeneratedPreset[]): GeneratedPreset[] {
  const seen = new Map<string, GeneratedPreset>();

  for (const preset of presets) {
    // Create a hash of the game-relevant state (vars, counters, inventory)
    // Exclude visitedBeats because paths with identical game state but
    // different routes are redundant for testing purposes
    const stateHash = JSON.stringify({
      vars: preset.preset.state.variables,
      counters: preset.preset.state.counters,
      inv: preset.preset.state.inventory.sort(),
      affect: preset.preset.state.affect ?? null, // feelings are state too
    });

    const existing = seen.get(stateHash);
    if (existing) {
      // Increment pathCount on the existing representative entry
      existing.pathCount++;
    } else {
      // Keep the first occurrence (shortest path) as representative
      seen.set(stateHash, preset);
    }
  }

  return Array.from(seen.values());
}

/**
 * Group presets by outcome for display
 */
export function groupPresetsByOutcome(
  presets: GeneratedPreset[]
): Map<string, GeneratedPreset[]> {
  const groups = new Map<string, GeneratedPreset[]>();

  for (const preset of presets) {
    const group = groups.get(preset.outcomeGroup) || [];
    group.push(preset);
    groups.set(preset.outcomeGroup, group);
  }

  return groups;
}
