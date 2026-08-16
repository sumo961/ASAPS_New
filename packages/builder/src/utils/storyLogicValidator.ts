/**
 * Story Logic Validator
 *
 * Analyzes narrative consistency in stories:
 * - Hub beats with state-dependent text (text assumes player state without condition checks)
 * - Text/state mismatches (references to clues/items/evidence without gating)
 * - Path analysis to detect convergence points that may have inconsistent narratives
 */

import { beatTargetIds } from './storyLinks';

export interface LogicIssue {
  type: 'error' | 'warning' | 'info';
  category: 'hub_state_assumption' | 'ungated_state_reference' | 'missing_condition_gate' | 'narrative_inconsistency' | 'undescribed_item';
  message: string;
  beatId: string;
  beatName?: string;
  beatType?: string;
  problematicText?: string;
  suggestedFix?: string;
  incomingPaths?: number;
  itemName?: string;
  targetBeatType?: string;
}

export interface LogicValidationResult {
  valid: boolean;
  issues: LogicIssue[];
  hubBeats: string[];  // Beats reachable from multiple paths
  pathAnalysis: Map<string, string[]>;  // Beat ID -> array of beats that lead to it
}

/**
 * Keywords/phrases that suggest the text assumes player state
 */
const STATE_ASSUMPTION_PATTERNS = [
  // Evidence/clues patterns
  { pattern: /you('ve| have) (enough|gathered|collected|found) (evidence|clues|proof|information)/i, category: 'evidence' },
  { pattern: /with (the|all|your) (evidence|clues|proof|information)/i, category: 'evidence' },
  { pattern: /the (evidence|clues|proof) you('ve| have) (gathered|collected|found)/i, category: 'evidence' },
  { pattern: /(enough|sufficient) (pieces|evidence|clues|proof)/i, category: 'evidence' },

  // Item possession patterns
  { pattern: /you('ve| have) the ([a-z]+\s)?(key|sword|lantern|map|item|tool)/i, category: 'item' },
  { pattern: /with (the|your) ([a-z]+\s)?(key|sword|lantern|map|item|tool)/i, category: 'item' },
  { pattern: /using (the|your) ([a-z]+\s)?(key|sword|lantern|map|item|tool)/i, category: 'item' },

  // Knowledge/discovery patterns
  { pattern: /you (now )?know (about|that|the)/i, category: 'knowledge' },
  { pattern: /(having|with) (learned|discovered|uncovered)/i, category: 'knowledge' },
  { pattern: /the secret you('ve| have) (learned|discovered|uncovered)/i, category: 'knowledge' },

  // Progress/achievement patterns
  { pattern: /you('ve| have) (completed|finished|accomplished|achieved)/i, category: 'progress' },
  { pattern: /(all|everything) (is|has been) (done|completed|gathered)/i, category: 'progress' },
  { pattern: /your (investigation|search|quest) (is|has) (complete|revealed)/i, category: 'progress' },

  // Counter/score patterns
  { pattern: /(your|the) ([a-z]+\s)?(score|count|points?) (is|are|reach)/i, category: 'counter' },
  { pattern: /you('ve| have) (earned|accumulated|gained) (enough|sufficient)/i, category: 'counter' },
];

/**
 * Extract text content from a beat for analysis
 */
function extractBeatText(beat: any): string[] {
  const texts: string[] = [];
  const params = beat.parameters || {};

  // infoText, durScreen
  if (params.text) texts.push(params.text);

  // movementChoice question
  if (params.question) texts.push(params.question);

  // titleScreen
  if (params.title) texts.push(params.title);

  // endScreen
  if (params.message) texts.push(params.message);

  // dialogTree - extract speaker text
  if (params.dialogTree) {
    extractDialogText(params.dialogTree, texts);
  }

  return texts;
}

/**
 * Recursively extract text from dialog tree
 */
function extractDialogText(node: any, texts: string[]): void {
  if (!node) return;

  if (node.text) texts.push(node.text);

  if (node.choices && Array.isArray(node.choices)) {
    node.choices.forEach((choice: any) => {
      if (choice.text) texts.push(choice.text);
      if (choice.dialogNode) {
        extractDialogText(choice.dialogNode, texts);
      }
    });
  }
}

/**
 * Check if text contains state assumption patterns
 */
function detectStateAssumptions(text: string): { found: boolean; matches: { pattern: string; category: string }[] } {
  const matches: { pattern: string; category: string }[] = [];

  for (const { pattern, category } of STATE_ASSUMPTION_PATTERNS) {
    if (pattern.test(text)) {
      const match = text.match(pattern);
      if (match) {
        matches.push({ pattern: match[0], category });
      }
    }
  }

  return { found: matches.length > 0, matches };
}

/**
 * Build a map of incoming connections for each beat
 */
function buildIncomingPathsMap(beats: any[]): Map<string, string[]> {
  const incomingPaths = new Map<string, string[]>();

  // Initialize all beats with empty arrays
  for (const beat of beats) {
    if (beat.id) {
      incomingPaths.set(beat.id, []);
    }
  }

  // Build incoming connections
  for (const beat of beats) {
    const targets = beatTargetIds(beat);
    for (const target of targets) {
      const existing = incomingPaths.get(target) || [];
      if (!existing.includes(beat.id)) {
        existing.push(beat.id);
        incomingPaths.set(target, existing);
      }
    }
  }

  return incomingPaths;
}

/**
 * Check if a single path has a conditionBeat gate
 */
function pathHasConditionGate(
  sourceBeatId: string,
  beats: any[],
  incomingPaths: Map<string, string[]>,
  depth: number = 3
): boolean {
  if (depth <= 0) return false;

  const sourceBeat = beats.find(b => b.id === sourceBeatId);
  if (!sourceBeat) return false;

  // Check if this is a conditionBeat
  if (sourceBeat.type === 'conditionBeat') {
    return true;
  }

  // Recursively check predecessors (but only for single-path beats)
  const sourceIncoming = incomingPaths.get(sourceBeatId) || [];
  if (sourceIncoming.length === 1) {
    return pathHasConditionGate(sourceIncoming[0], beats, incomingPaths, depth - 1);
  }

  return false;
}

/**
 * Check if a beat is preceded by a conditionBeat that checks relevant state.
 * For hub beats (multiple incoming paths), ALL paths must be gated to suppress the warning.
 * For non-hub beats (single incoming path), only that path needs to be gated.
 */
function isPrecededByConditionCheck(
  beatId: string,
  beats: any[],
  incomingPaths: Map<string, string[]>,
  isHubBeat: boolean
): boolean {
  const incoming = incomingPaths.get(beatId) || [];

  if (incoming.length === 0) return false;

  if (isHubBeat) {
    // For hub beats: ALL incoming paths must be gated
    return incoming.every(sourceBeatId =>
      pathHasConditionGate(sourceBeatId, beats, incomingPaths)
    );
  } else {
    // For non-hub beats: ANY incoming path with a gate is sufficient
    return incoming.some(sourceBeatId =>
      pathHasConditionGate(sourceBeatId, beats, incomingPaths)
    );
  }
}

/**
 * Check if pickProp items lead to infoText beats that describe them
 */
function validatePickPropDescriptions(beats: any[]): LogicIssue[] {
  const issues: LogicIssue[] = [];
  const beatMap = new Map(beats.map(b => [b.id, b]));

  for (const beat of beats) {
    if (beat.type !== 'pickProp') continue;

    const props = beat.parameters?.props || [];

    for (const prop of props) {
      if (!prop.target) continue;

      const targetBeat = beatMap.get(prop.target);
      if (!targetBeat) continue;

      // Check if the target is an infoText (good) or something else (potentially bad)
      if (targetBeat.type !== 'infoText' && targetBeat.type !== 'durScreen') {
        // The item picked doesn't lead to a description beat
        issues.push({
          type: 'warning',
          category: 'undescribed_item',
          message: `pickProp item "${prop.name}" in beat '${beat.name || beat.id}' leads directly to ${targetBeat.type} without an infoText describing what the player learns from the item.`,
          beatId: beat.id,
          beatName: beat.name,
          beatType: beat.type,
          itemName: prop.name,
          targetBeatType: targetBeat.type,
          suggestedFix: `Add an infoText beat between the pickProp and ${targetBeat.type} to describe what the player sees/learns from "${prop.name}" (e.g., what a letter says, what a photo shows, what makes a key special).`
        });
      }
    }
  }

  return issues;
}

/**
 * Validate story logic for narrative consistency
 */
export function validateStoryLogic(story: any): LogicValidationResult {
  const issues: LogicIssue[] = [];
  const hubBeats: string[] = [];

  if (!story || !story.beats || !Array.isArray(story.beats)) {
    return {
      valid: true,
      issues: [],
      hubBeats: [],
      pathAnalysis: new Map()
    };
  }

  const beats = story.beats;
  const incomingPaths = buildIncomingPathsMap(beats);

  // Check for undescribed pickProp items
  const pickPropIssues = validatePickPropDescriptions(beats);
  issues.push(...pickPropIssues);

  // Identify hub beats (beats with multiple incoming connections)
  for (const [beatId, sources] of incomingPaths.entries()) {
    if (sources.length > 1) {
      hubBeats.push(beatId);
    }
  }

  // Analyze each beat for narrative logic issues
  for (const beat of beats) {
    if (!beat.id) continue;

    const texts = extractBeatText(beat);
    const incomingCount = (incomingPaths.get(beat.id) || []).length;
    const isHubBeat = incomingCount > 1;

    for (const text of texts) {
      const { found, matches } = detectStateAssumptions(text);

      if (found) {
        // Check if this beat is properly gated by a conditionBeat
        const isGated = isPrecededByConditionCheck(beat.id, beats, incomingPaths, isHubBeat);

        if (isHubBeat && !isGated) {
          // Hub beat with state assumption but no condition gate - this is the main issue!
          issues.push({
            type: 'warning',
            category: 'hub_state_assumption',
            message: `Hub beat '${beat.name || beat.id}' has text that assumes player state but can be reached from ${incomingCount} different paths without condition checks. Players may reach this with different states.`,
            beatId: beat.id,
            beatName: beat.name,
            beatType: beat.type,
            problematicText: matches.map(m => `"${m.pattern}" (${m.category})`).join(', '),
            suggestedFix: `Either: 1) Use generic text that doesn't assume state, 2) Add a conditionBeat before this beat to gate access, or 3) Split into multiple beats with different text based on state`,
            incomingPaths: incomingCount
          });
        } else if (!isGated) {
          // Not a hub but still has state assumption without gating
          issues.push({
            type: 'info',
            category: 'ungated_state_reference',
            message: `Beat '${beat.name || beat.id}' references player state (${matches.map(m => m.category).join(', ')}) but isn't preceded by a condition check. Verify this is intentional.`,
            beatId: beat.id,
            beatName: beat.name,
            beatType: beat.type,
            problematicText: matches.map(m => `"${m.pattern}"`).join(', ')
          });
        }
      }
    }
  }

  return {
    valid: issues.filter(i => i.type === 'error').length === 0,
    issues,
    hubBeats,
    pathAnalysis: incomingPaths
  };
}

/**
 * Format validation result for display
 */
export function formatLogicValidationResult(result: LogicValidationResult): string {
  const lines: string[] = [];

  lines.push(`=== Story Logic Validation ===`);
  lines.push(`Hub Beats (multiple incoming paths): ${result.hubBeats.length}`);
  if (result.hubBeats.length > 0) {
    lines.push(`  ${result.hubBeats.join(', ')}`);
  }

  const warnings = result.issues.filter(i => i.type === 'warning');
  const infos = result.issues.filter(i => i.type === 'info');

  if (warnings.length > 0) {
    lines.push(`\n⚠️ Warnings (${warnings.length}):`);
    for (const issue of warnings) {
      lines.push(`  [${issue.beatId}] ${issue.message}`);
      if (issue.problematicText) {
        lines.push(`    Text: ${issue.problematicText}`);
      }
      if (issue.suggestedFix) {
        lines.push(`    Fix: ${issue.suggestedFix}`);
      }
    }
  }

  if (infos.length > 0) {
    lines.push(`\nℹ️ Info (${infos.length}):`);
    for (const issue of infos) {
      lines.push(`  [${issue.beatId}] ${issue.message}`);
    }
  }

  if (warnings.length === 0 && infos.length === 0) {
    lines.push(`\n✓ No narrative logic issues detected`);
  }

  return lines.join('\n');
}
