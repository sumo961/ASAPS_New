/**
 * Generation review — what the AI generator handed over, what the
 * deterministic analysis found in it, and what can be fixed with a local
 * edit the author approves.
 *
 * Design rule (decision 2026-09-08): detection and proposals are
 * deterministic code; nothing applies without the author seeing it; the
 * original generation is kept untouched so any fix can be compared or
 * reverted. Model-authored fixes, when they come, go through the same
 * proposal shape with a diff preview — never through this pipeline on
 * their own.
 */

export type FindingKind = 'missing-target' | 'unreachable-beat' | 'unsatisfiable-threshold';

interface FindingBase {
  /** Stable id: kind + beat + discriminator, so status survives re-analysis. */
  id: string;
  kind: FindingKind;
  beatId: string;
  beatName?: string;
  /** Author-facing sentence. */
  message: string;
}

/** A link points at a beat id no beat carries. */
export interface MissingTargetFinding extends FindingBase {
  kind: 'missing-target';
  targetId: string;
  /** Where on the beat the link sits (storyLinks `via`). */
  via: string;
  /** Parameter path of the target field, relative to `parameters`, when the
   *  link shape is one a retarget can write back to (e.g. `choices[2].target`). */
  path?: string;
}

/** No link anywhere points at this beat (and it is not the first). */
export interface UnreachableBeatFinding extends FindingBase {
  kind: 'unreachable-beat';
  beatType?: string;
  /** Position in the story's beat list (authoring order). */
  index: number;
}

/** A counter gate whose branch can never be taken given every counter change in the story. */
export interface UnsatisfiableThresholdFinding extends FindingBase {
  kind: 'unsatisfiable-threshold';
  branch: 'true' | 'false';
  targetId: string;
  counterName: string;
  operator: string;
  requiredValue: number;
  minValue: number;
  maxValue: number;
  /** False when no beat or choice in the story changes the counter at all —
   *  then the gate is unsatisfiable for a different reason (or the walk
   *  missed a shape), and clamping the threshold would be wrong. */
  counterModified: boolean;
  /** Threshold lives in the nested `condition` object rather than flat. */
  nested: boolean;
}

export type GenerationFinding = MissingTargetFinding | UnreachableBeatFinding | UnsatisfiableThresholdFinding;

export type ProposalKind = 'retarget' | 'clamp-threshold' | 'link-from-previous' | 'ai-edit';

/**
 * A local, undoable edit: set one parameter path on one beat to one value.
 * `confidence: 'safe'` proposals may be applied in one go from the banner;
 * `'review'` ones need a look first.
 */
export interface FixProposal {
  id: string;
  findingId: string;
  kind: ProposalKind;
  beatId: string;
  beatName?: string;
  /** Parameter path relative to `parameters`, e.g. `trueTarget`, `choices[1].target`, `connection.target`. */
  path: string;
  value: unknown;
  /** Author-facing sentence describing the edit. */
  description: string;
  confidence: 'safe' | 'review';
  /** Who authored the edit. Absent = deterministic code. */
  source?: 'deterministic' | 'ai';
  /** The model's stated reason (AI edits only). */
  rationale?: string;
}

/**
 * One AI-authored fix for one finding: a handful of parameter edits that
 * passed the deterministic envelope (allowed beats only, valid paths, the
 * finding gone and no new finding on a simulated copy). Shown as a diff;
 * applied only on accept.
 */
export interface AIFixSuggestion {
  findingId: string;
  rationale: string;
  edits: FixProposal[];
  preview: Array<{ beatId: string; beatName?: string; path: string; before: unknown; after: unknown }>;
}

export type ReviewStatus = 'open' | 'applied' | 'skipped';

export interface GenerationReview {
  version: 1;
  source: 'generator' | 'ideator' | 'mcp';
  createdAt: string;
  title: string;
  model?: string;
  request?: { prompt: string; genre?: string; length?: string; complexity?: string; affectDepth?: string };
  /** The story exactly as it arrived — before normalize, layout, or any fix. */
  original: unknown;
  findings: GenerationFinding[];
  proposals: FixProposal[];
  /** Per finding id. Absent = open. */
  status: Record<string, ReviewStatus>;
  /** Author closed the review banner; it does not come back on load. */
  dismissedAt?: string;
}
