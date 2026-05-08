/**
 * Schema-driven normalize/validate pipeline — shared types.
 *
 * Phase 2 of the v0.9.51+ refactor. Replaces the four ad-hoc cleaners
 * (OpenAIProvider.cleanupBeatParameters, AIService.transformBeatFormat,
 * AIService.cleanupBeatParameters, App.tsx handleStoryGenerated flattener)
 * with a single pipeline driven by the metadata in core-beats.json.
 */

export type ChangeKind =
  | 'aliased'      // renamed paramX → paramY because of `aliases`
  | 'flattened'    // copied condition.X → params.X via `nested`
  | 'coerced'      // converted primitive type because of `coerce`
  | 'defaulted'    // filled from `default`
  | 'deleted'      // removed (post-flatten nested object cleanup)
  | 'normalized';  // structural normalize (e.g. character editor-only fields backfilled)

export interface NormalizeChange {
  beatId?: string;
  path: string;
  kind: ChangeKind;
  from?: any;
  to?: any;
  note?: string;
}

export interface NormalizeReport {
  changes: NormalizeChange[];
  clustersCreated: string[];
  charactersNormalized: number;
  beatsNormalized: number;
}

export interface ValidationIssue {
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface RefIndex {
  characterIds: Set<string>;
  beatIds: Set<string>;
  clusterNames: Set<string>;
  assetIds: Set<string>;
}

export interface NormalizeResult {
  story: any;
  report: NormalizeReport;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  /** Convenience: errors.length === 0. */
  valid: boolean;
}

/**
 * Schema shape we read from core-beats.json. Kept loose because the schema
 * is hand-authored JSON and we tolerate fields the pipeline doesn't use.
 */
export interface BeatSchema {
  schema: string;
  version: string;
  customTypes?: Record<string, any>;
  conditionTypes?: Record<string, ConditionTypeSpec | { description?: string }>;
  beatTypes: Record<string, BeatTypeSpec>;
}

export interface ConditionTypeSpec {
  required?: string[];
  optional?: string[];
  /**
   * Per-canonical-name list of aliases the AI commonly emits.
   * Example: { variableName: ['variable', 'left'] } means the pipeline
   * accepts condition.variable / condition.left and renames either to
   * condition.variableName before the flatten step copies it up to
   * top-level params. Lets the schema absorb model-specific quirks
   * without per-field carve-outs in the pipeline code.
   */
  aliases?: Record<string, string[]>;
  description?: string;
}

export interface BeatTypeSpec {
  category?: string;
  displayName?: string;
  parameters?: Record<string, ParameterSpec>;
  nested?: Record<string, NestedSpec>;
  connectionType?: string;
  [key: string]: any;
}

export interface ParameterSpec {
  type?: string;
  required?: boolean;
  default?: any;
  description?: string;
  /** Alternate names accepted from messy input; renamed to the canonical name. */
  aliases?: string[];
  /** "primitiveToString" — coerce number/boolean values to string. */
  coerce?: 'primitiveToString';
  /** What the value must resolve to in the story's reference index. */
  references?: 'character' | 'beat' | 'asset' | 'cluster';
  ui?: any;
  [key: string]: any;
}

export interface NestedSpec {
  /** The discriminator field inside the nested object (e.g. `type`). */
  discriminator?: string;
  /** Where the discriminator value lands at top-level (e.g. `conditionType`). */
  discriminatorMapsTo?: string;
  /** Name of a conditionTypes-style registry to look up required/optional fields. */
  registry?: 'conditionTypes';
  /** Copy every field from the nested object to top-level params. */
  flattenAll?: boolean;
  /** Whether to delete the nested object after copying. Default true. */
  deleteAfterFlatten?: boolean;
  description?: string;
}
