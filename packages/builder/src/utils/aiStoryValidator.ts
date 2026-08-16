/**
 * AI Story Validator
 *
 * Validates AI-generated story structures before import to catch common issues:
 * - Missing beats (connections to non-existent beat IDs)
 * - Duplicate beat IDs
 * - Orphaned beats (no incoming connections)
 * - Missing required fields
 */

export interface ValidationIssue {
  type: 'error' | 'warning';
  category: 'missing_beat' | 'duplicate_id' | 'orphaned_beat' | 'missing_field' | 'invalid_structure' | 'unreachable_threshold';
  message: string;
  beatId?: string;
  targetId?: string;
  field?: string;
  counterName?: string;
  threshold?: number;
  maxReachable?: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  beatCount: number;
  connectionCount: number;
  missingBeatIds: string[];
}

/**
 * Extract all target IDs from a beat's parameters and connections
 */
function extractTargetIds(beat: any): string[] {
  const targets: string[] = [];

  // From top-level connections array
  if (beat.connections && Array.isArray(beat.connections)) {
    beat.connections.forEach((conn: any) => {
      if (conn.targetId) targets.push(conn.targetId);
      if (conn.target) targets.push(conn.target);
    });
  }

  const params = beat.parameters || {};

  // Single connection (infoText, titleScreen, etc.)
  if (params.connection?.target) {
    targets.push(params.connection.target);
  }

  // Condition beat
  if (params.trueConnection?.target) {
    targets.push(params.trueConnection.target);
  }
  if (params.falseConnection?.target) {
    targets.push(params.falseConnection.target);
  }

  // Choice-based beats (movementChoice, pickProp)
  if (params.choices && Array.isArray(params.choices)) {
    params.choices.forEach((choice: any) => {
      if (choice.target) targets.push(choice.target);
    });
  }
  if (params.props && Array.isArray(params.props)) {
    params.props.forEach((prop: any) => {
      if (prop.target) targets.push(prop.target);
    });
  }

  // Dialog tree (recursive extraction)
  if (params.dialogTree) {
    extractDialogTargets(params.dialogTree, targets);
  }

  // Random target
  if (params.targets && Array.isArray(params.targets)) {
    params.targets.forEach((t: any) => {
      if (t.targetId) targets.push(t.targetId);
    });
  }

  // Set timer
  if (params.timerTarget) {
    targets.push(params.timerTarget);
  }

  // End screen restart
  if (params.restartConnection?.target) {
    targets.push(params.restartConnection.target);
  }

  return targets;
}

/**
 * Recursively extract targets from dialog tree
 */
function extractDialogTargets(node: any, targets: string[]): void {
  if (!node) return;

  if (node.choices && Array.isArray(node.choices)) {
    node.choices.forEach((choice: any) => {
      if (choice.target) {
        targets.push(choice.target);
      }
      // Recurse into nested dialog nodes
      if (choice.dialogNode) {
        extractDialogTargets(choice.dialogNode, targets);
      }
    });
  }
}

/**
 * Analyze counter modifications in the story to determine max reachable values
 */
function analyzeCounterModifications(beats: any[]): Map<string, { min: number; max: number }> {
  const counterRanges = new Map<string, { min: number; max: number }>();

  for (const beat of beats) {
    const params = beat.parameters || {};

    // SetVariable beats
    if (beat.type === 'setVariable' || beat.type === 'variable') {
      const varType = params.type;
      const varName = params.name;
      const value = Number(params.value) || 0;
      const operation = params.operation || 'set';

      if (varType === 'counter' && varName) {
        if (!counterRanges.has(varName)) {
          counterRanges.set(varName, { min: 0, max: 0 });
        }

        const range = counterRanges.get(varName)!;
        if (operation === 'set') {
          range.max = Math.max(range.max, value);
          range.min = Math.min(range.min, value);
        } else if (operation === 'add' || operation === 'change') {
          if (value > 0) {
            range.max += value;
          } else {
            range.min += value;
          }
        } else if (operation === 'subtract') {
          range.min -= value;
        }
      }
    }

    // Choice-based beats with counter effects
    const choices = params.choices || params.props || [];
    for (const choice of choices) {
      // Check both counterEffect object format and flat counter/counterValue format
      const counterName = choice.counterEffect?.counter || choice.counter;
      const counterValue = choice.counterEffect?.value || choice.counterValue;

      if (counterName && counterValue !== undefined) {
        const value = Number(counterValue) || 0;

        if (!counterRanges.has(counterName)) {
          counterRanges.set(counterName, { min: 0, max: 0 });
        }

        const range = counterRanges.get(counterName)!;
        if (value > 0) {
          range.max += value;
        } else {
          range.min += value;
        }
      }
    }

    // DialogTree choices
    if (beat.type === 'dialogTree' && params.dialogTree) {
      analyzeDialogTreeCounters(params.dialogTree, counterRanges);
    }
  }

  return counterRanges;
}

/**
 * Recursively analyze dialog tree for counter modifications
 */
function analyzeDialogTreeCounters(node: any, counterRanges: Map<string, { min: number; max: number }>): void {
  if (!node || !node.choices) return;

  for (const choice of node.choices) {
    const counterName = choice.counterEffect?.counter || choice.counter;
    const counterValue = choice.counterEffect?.value || choice.counterValue;

    if (counterName && counterValue !== undefined) {
      const value = Number(counterValue) || 0;

      if (!counterRanges.has(counterName)) {
        counterRanges.set(counterName, { min: 0, max: 0 });
      }

      const range = counterRanges.get(counterName)!;
      if (value > 0) {
        range.max += value;
      } else {
        range.min += value;
      }
    }

    if (choice.dialogNode) {
      analyzeDialogTreeCounters(choice.dialogNode, counterRanges);
    }
  }
}

/**
 * Check if a counter condition threshold is reachable
 */
function checkCounterThresholdReachable(
  range: { min: number; max: number },
  operator: string,
  threshold: number
): boolean {
  switch (operator) {
    case '==': return range.min <= threshold && threshold <= range.max;
    case '!=': return true;
    case '>': return range.max > threshold;
    case '>=': return range.max >= threshold;
    case '<': return range.min < threshold;
    case '<=': return range.min <= threshold;
    default: return true;
  }
}

/**
 * Validate conditionBeat thresholds against counter modifications
 */
function validateConditionThresholds(
  beats: any[],
  counterRanges: Map<string, { min: number; max: number }>
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const beat of beats) {
    if (beat.type !== 'conditionBeat') continue;

    const params = beat.parameters || {};
    const condition = params.condition || {};

    // Only check counter-type conditions
    if (condition.type !== 'counter') continue;

    const counterName = condition.variable || condition.variableName;
    const operator = condition.operator || '==';
    const threshold = Number(condition.value) || 0;

    if (!counterName) continue;

    const range = counterRanges.get(counterName);

    if (!range) {
      // Counter is never modified - defaults to 0
      const defaultRange = { min: 0, max: 0 };
      if (!checkCounterThresholdReachable(defaultRange, operator, threshold)) {
        issues.push({
          type: 'warning',
          category: 'unreachable_threshold',
          message: `ConditionBeat '${beat.id}' checks counter "${counterName}" ${operator} ${threshold}, but counter is never modified (stays at 0). True branch may be unreachable.`,
          beatId: beat.id,
          counterName,
          threshold,
          maxReachable: 0
        });
      }
    } else if (!checkCounterThresholdReachable(range, operator, threshold)) {
      issues.push({
        type: 'warning',
        category: 'unreachable_threshold',
        message: `ConditionBeat '${beat.id}' checks counter "${counterName}" ${operator} ${threshold}, but counter can only reach ${range.min} to ${range.max}. True branch is UNREACHABLE.`,
        beatId: beat.id,
        counterName,
        threshold,
        maxReachable: range.max
      });
    }
  }

  return issues;
}

/**
 * Validate an AI-generated story structure
 */
export function validateAIStory(story: any): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const missingBeatIds: string[] = [];

  // Check basic structure
  if (!story || typeof story !== 'object') {
    return {
      valid: false,
      errors: [{ type: 'error', category: 'invalid_structure', message: 'Story must be an object' }],
      warnings: [],
      beatCount: 0,
      connectionCount: 0,
      missingBeatIds: []
    };
  }

  if (!story.beats || !Array.isArray(story.beats)) {
    return {
      valid: false,
      errors: [{ type: 'error', category: 'invalid_structure', message: 'Story must have a beats array' }],
      warnings: [],
      beatCount: 0,
      connectionCount: 0,
      missingBeatIds: []
    };
  }

  // Collect all beat IDs
  const beatIds = new Set<string>();
  const duplicateIds: string[] = [];

  story.beats.forEach((beat: any) => {
    if (!beat.id) {
      errors.push({
        type: 'error',
        category: 'missing_field',
        message: `Beat is missing required 'id' field`,
        field: 'id'
      });
    } else {
      if (beatIds.has(beat.id)) {
        duplicateIds.push(beat.id);
      }
      beatIds.add(beat.id);
    }

    if (!beat.type) {
      errors.push({
        type: 'error',
        category: 'missing_field',
        message: `Beat '${beat.id || 'unknown'}' is missing required 'type' field`,
        beatId: beat.id,
        field: 'type'
      });
    }
  });

  // Report duplicate IDs
  duplicateIds.forEach(id => {
    errors.push({
      type: 'error',
      category: 'duplicate_id',
      message: `Duplicate beat ID: '${id}'`,
      beatId: id
    });
  });

  // Collect all targets and check they exist
  const allTargets: Array<{ source: string; target: string }> = [];
  const beatsWithIncoming = new Set<string>();
  let connectionCount = 0;

  story.beats.forEach((beat: any) => {
    const targets = extractTargetIds(beat);
    targets.forEach(target => {
      allTargets.push({ source: beat.id, target });
      connectionCount++;
      beatsWithIncoming.add(target);
    });
  });

  /*
   * Story-level connections.
   *
   * `extractTargetIds` reads links that hang off a beat, which is the shape a
   * story has once the builder owns it. A story arriving from outside carries
   * its links in a single top-level array instead — that is the shape
   * `asaps_inject_story` advertises and the shape Claude Desktop sends. The
   * validator saw none of them: an injected story reported "Connections: 0,
   * Status: VALID" no matter how many of its links pointed nowhere, which is
   * the whole link graph going unchecked on the one path where the author has
   * least visibility into what was generated.
   */
  if (Array.isArray(story.connections)) {
    story.connections.forEach((conn: any) => {
      const source = conn.source ?? conn.from ?? conn.sourceId;
      const target = conn.target ?? conn.to ?? conn.targetId;
      if (!source || !target) return;
      allTargets.push({ source, target });
      connectionCount++;
      beatsWithIncoming.add(target);
    });
  }

  // Check for missing beats
  allTargets.forEach(({ source, target }) => {
    if (!beatIds.has(target)) {
      if (!missingBeatIds.includes(target)) {
        missingBeatIds.push(target);
      }
      errors.push({
        type: 'error',
        category: 'missing_beat',
        message: `Beat '${source}' references non-existent beat '${target}'`,
        beatId: source,
        targetId: target
      });
    }
  });

  // Check for orphaned beats (no incoming connections, except the first beat)
  story.beats.forEach((beat: any, index: number) => {
    if (index > 0 && beat.id && !beatsWithIncoming.has(beat.id)) {
      // Not an error for endScreen beats - they might be intended orphans
      if (beat.type !== 'endScreen') {
        warnings.push({
          type: 'warning',
          category: 'orphaned_beat',
          message: `Beat '${beat.id}' (${beat.name || beat.type}) has no incoming connections`,
          beatId: beat.id
        });
      }
    }
  });

  // Check for title screen at start
  if (story.beats.length > 0 && story.beats[0].type !== 'titleScreen') {
    warnings.push({
      type: 'warning',
      category: 'invalid_structure',
      message: `First beat is '${story.beats[0].type}' instead of 'titleScreen'`
    });
  }

  // Check for at least one end screen
  const hasEndScreen = story.beats.some((beat: any) => beat.type === 'endScreen');
  if (!hasEndScreen) {
    warnings.push({
      type: 'warning',
      category: 'invalid_structure',
      message: 'Story has no endScreen beat - story may not have a proper ending'
    });
  }

  // Check for unreachable counter thresholds in conditionBeats
  const counterRanges = analyzeCounterModifications(story.beats);
  const thresholdIssues = validateConditionThresholds(story.beats, counterRanges);
  warnings.push(...thresholdIssues);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    beatCount: story.beats.length,
    connectionCount,
    missingBeatIds
  };
}

/**
 * Format validation result for console logging
 */
export function formatValidationResult(result: ValidationResult): string {
  const lines: string[] = [];

  lines.push(`=== AI Story Validation ===`);
  lines.push(`Beats: ${result.beatCount}, Connections: ${result.connectionCount}`);
  lines.push(`Status: ${result.valid ? '✓ VALID' : '✗ INVALID'}`);

  if (result.errors.length > 0) {
    lines.push(`\nErrors (${result.errors.length}):`);
    result.errors.forEach(e => {
      lines.push(`  ✗ ${e.message}`);
    });
  }

  if (result.warnings.length > 0) {
    lines.push(`\nWarnings (${result.warnings.length}):`);
    result.warnings.forEach(w => {
      lines.push(`  ⚠ ${w.message}`);
    });
  }

  if (result.missingBeatIds.length > 0) {
    lines.push(`\nMissing Beat IDs: ${result.missingBeatIds.join(', ')}`);
  }

  return lines.join('\n');
}
