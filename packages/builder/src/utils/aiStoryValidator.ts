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
  category: 'missing_beat' | 'duplicate_id' | 'orphaned_beat' | 'missing_field' | 'invalid_structure';
  message: string;
  beatId?: string;
  targetId?: string;
  field?: string;
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

  // Single connection (introText, titleScreen, etc.)
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
