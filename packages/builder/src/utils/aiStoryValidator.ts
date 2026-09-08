/**
 * AI Story Validator
 *
 * Validates AI-generated story structures before import to catch common issues:
 * - Missing beats (connections to non-existent beat IDs)
 * - Duplicate beat IDs
 * - Orphaned beats (no incoming connections)
 * - Missing required fields
 */

import { storyLinks } from './storyLinks';
import { analyzeCounterRanges, readCounterCondition, conditionCanBeTrue, conditionCanBeFalse } from './counterRangeAnalysis';

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
 * Counter gates that can never take a branch — the shared analysis
 * (utils/counterRangeAnalysis), reported in this validator's own issue shape.
 * The private copy this replaced only read the nested `condition` object,
 * so every post-pipeline (flattened) story went unchecked, and it never saw
 * the canonical `effects[]` on choices.
 */
function validateConditionThresholds(beats: any[], variables?: any[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const ranges = analyzeCounterRanges(beats, variables);
  for (const beat of beats) {
    const cond = readCounterCondition(beat);
    if (!cond) continue;
    const r = ranges.get(cond.counterName) || { min: 0, max: 0, modified: false };
    if (cond.trueTarget && !conditionCanBeTrue(r, cond.operator, cond.value)) {
      issues.push({
        type: 'warning', category: 'unreachable_threshold', beatId: beat.id,
        counterName: cond.counterName, threshold: cond.value, maxReachable: r.max,
        message: r.modified
          ? `Beat "${beat.name || beat.id}" checks ${cond.counterName} ${cond.operator} ${cond.value}, but ${cond.counterName} can only reach ${r.min}…${r.max}`
          : `Beat "${beat.name || beat.id}" checks ${cond.counterName} ${cond.operator} ${cond.value}, but nothing in the story changes ${cond.counterName}`,
      });
    }
    if (cond.falseTarget && !conditionCanBeFalse(r, cond.operator, cond.value)) {
      issues.push({
        type: 'warning', category: 'unreachable_threshold', beatId: beat.id,
        counterName: cond.counterName, threshold: cond.value, maxReachable: r.max,
        message: `Beat "${beat.name || beat.id}" checks ${cond.counterName} ${cond.operator} ${cond.value}, which is always true (${cond.counterName} reaches ${r.min}…${r.max})`,
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

  // Collect all targets and check they exist.
  //
  // One walk, shared with layout and both importers — storyLinks. This
  // validator used to carry its own copy, which read links off beats but not
  // the story-level `connections` array, so an MCP-injected story reported
  // "Connections: 0, VALID" while its links pointed nowhere.
  const allTargets: Array<{ source: string; target: string }> = storyLinks(story)
    .map((l) => ({ source: l.source, target: l.target }));
  const beatsWithIncoming = new Set<string>();
  let connectionCount = 0;
  allTargets.forEach(({ target }) => {
    connectionCount++;
    beatsWithIncoming.add(target);
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

  // Check for unreachable counter thresholds in conditionBeats
  const thresholdIssues = validateConditionThresholds(story.beats, story.variables);
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
