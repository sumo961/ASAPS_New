/**
 * Validation utilities for MCP Desktop server
 *
 * Validates story structures before injection into ASAPS Builder
 */

export interface ValidationError {
  success: false;
  error: string;
  message: string;
}

export interface ValidationSuccess {
  success: true;
}

export type ValidationResult = ValidationError | ValidationSuccess;

export interface StoryBeat {
  id?: string;
  type?: string;
  name?: string;
  parameters?: Record<string, unknown>;
  x?: number;
  y?: number;
}

export interface StoryMetadata {
  title?: string;
  author?: string;
  description?: string;
}

export interface StoryConnection {
  source: string;
  target: string;
  label?: string;
}

export interface StoryData {
  metadata?: StoryMetadata;
  beats?: StoryBeat[];
  connections?: StoryConnection[];
  characters?: unknown[];
}

/**
 * Validate story metadata
 */
export function validateMetadata(metadata: StoryMetadata | undefined): ValidationResult {
  if (!metadata?.title) {
    return {
      success: false,
      error: 'metadata.title is required',
      message: 'Please provide a title for your story.',
    };
  }
  return { success: true };
}

/**
 * Validate beats array
 */
export function validateBeatsArray(beats: StoryBeat[] | undefined): ValidationResult {
  if (!beats || !Array.isArray(beats) || beats.length === 0) {
    return {
      success: false,
      error: 'beats array is required and must not be empty',
      message: 'Please provide at least one beat for your story.',
    };
  }
  return { success: true };
}

/**
 * Validate individual beat structure
 */
export function validateBeat(beat: StoryBeat, index: number): ValidationResult {
  if (!beat.id) {
    return {
      success: false,
      error: `Beat at index ${index} is missing required field: id`,
      message: 'Every beat needs a unique ID (e.g., "beat_0", "beat_1").',
    };
  }
  if (!beat.type) {
    return {
      success: false,
      error: `Beat "${beat.id}" is missing required field: type`,
      message: 'Every beat needs a type (e.g., "titleScreen", "introText").',
    };
  }
  return { success: true };
}

/**
 * Validate all beats in the array
 */
export function validateAllBeats(beats: StoryBeat[]): ValidationResult {
  for (let i = 0; i < beats.length; i++) {
    const result = validateBeat(beats[i], i);
    if (!result.success) {
      return result;
    }
  }
  return { success: true };
}

/**
 * Validate complete story structure
 */
export function validateStory(data: StoryData): ValidationResult {
  // Check metadata
  const metadataResult = validateMetadata(data.metadata);
  if (!metadataResult.success) {
    return metadataResult;
  }

  // Check beats array exists
  const beatsArrayResult = validateBeatsArray(data.beats);
  if (!beatsArrayResult.success) {
    return beatsArrayResult;
  }

  // Check individual beats
  const beatsResult = validateAllBeats(data.beats!);
  if (!beatsResult.success) {
    return beatsResult;
  }

  return { success: true };
}

/**
 * Check for duplicate beat IDs
 */
export function findDuplicateBeatIds(beats: StoryBeat[]): string[] {
  const seen = new Set<string>();
  const duplicates: string[] = [];

  for (const beat of beats) {
    if (beat.id) {
      if (seen.has(beat.id)) {
        duplicates.push(beat.id);
      } else {
        seen.add(beat.id);
      }
    }
  }

  return duplicates;
}

/**
 * Find connection references to non-existent beats
 */
export function findBrokenConnections(
  connections: StoryConnection[],
  beatIds: Set<string>
): { source?: string; target?: string }[] {
  const broken: { source?: string; target?: string }[] = [];

  for (const conn of connections) {
    if (!beatIds.has(conn.source) || !beatIds.has(conn.target)) {
      broken.push({
        source: beatIds.has(conn.source) ? undefined : conn.source,
        target: beatIds.has(conn.target) ? undefined : conn.target,
      });
    }
  }

  return broken;
}
