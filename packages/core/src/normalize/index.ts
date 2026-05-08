/**
 * Schema-driven normalize/validate pipeline.
 *
 * Entry point for the v0.9.51+ refactor that replaces the four ad-hoc
 * cleaners (OpenAIProvider.cleanupBeatParameters, AIService transform +
 * cleanup, App.tsx flattener) with a single pipeline driven by metadata
 * in core-beats.json.
 *
 * Typical usage:
 *
 *   import { normalizeStory } from '@asaps/core';
 *   import schema from '/path/to/beat-definitions/core-beats.json';
 *
 *   const { story, report, errors, warnings } = normalizeStory(rawStory, schema);
 *   if (errors.length) { ... }
 */

export * from './types';
export { normalizeBeat } from './normalizeBeat';
export type { NormalizeBeatOptions } from './normalizeBeat';
export { validateBeat } from './validateBeat';
export type { ValidateBeatResult } from './validateBeat';
export {
  normalizeStory,
  buildRefIndex,
  buildClustersFromBeats,
  normalizeCharacter,
} from './normalizeStory';
export type { NormalizeStoryOptions } from './normalizeStory';
