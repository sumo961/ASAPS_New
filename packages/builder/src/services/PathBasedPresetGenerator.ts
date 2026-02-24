/**
 * PathBasedPresetGenerator - Generate state presets from path analysis
 *
 * Uses StateSimulationAnalyzer to find all paths through a story,
 * then extracts the simulation state at specific beats to create
 * presets for testing.
 */

import type { Story, StatePreset } from '@asaps/core';
import {
  StateSimulationAnalyzer,
  type SimulationState,
  type SimulatedPath,
  type SimulatedStep,
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

  // Run forward analysis to get all paths
  const analyzer = new StateSimulationAnalyzer(story, {
    maxPaths: 500, // Limit for performance
    maxDepth: 100,
  });

  const analysisResult = analyzer.analyze();

  // Find paths that pass through the target beat
  const pathsToTarget = findPathsToTarget(analysisResult.outcomes, targetBeatId);

  // Generate presets from the paths
  const presets = pathsToTarget.map((pathInfo, index) => {
    const { path, stepIndex, outcomeGroup, pathIndexInGroup, totalInGroup } = pathInfo;

    // Get the state at the target beat
    const stateAtTarget = path.steps[stepIndex].stateAfter;

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

  // Deduplicate presets with identical states
  const totalPaths = presets.length;
  const uniquePresets = deduplicatePresets(presets);

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
  const relevantDecisions = path.decisions.filter((d, i) => {
    // Find the step index for this decision
    const stepIdx = path.steps.findIndex(s => s.beatId === d.beatId);
    return stepIdx <= upToIndex;
  });

  if (relevantDecisions.length === 0) {
    return 'Direct path';
  }

  // Take up to 3 most recent decisions
  const recent = relevantDecisions.slice(-3);
  return 'Via ' + recent.map(d => d.choiceMade || d.beatName).join(' → ');
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
