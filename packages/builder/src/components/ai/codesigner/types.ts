/**
 * Co-Designer shared types — the structured change-proposal contract
 * (track D of the AI-on-existing-stories plan).
 *
 * The model NEVER applies anything. It emits a ChangeProposalSet inside a
 * fenced block; the pop-out renders it with per-item checkboxes; the
 * selected proposals travel to the main window, which validates each one
 * against live state and applies it through the existing undoable
 * commands. Authorial intent stays with the author at every step.
 */

/** One concrete, self-contained change the model proposes. */
export type ChangeProposal =
  | {
      kind: 'editText';
      /** Beat to edit (must be a real beat id from the digest). */
      beatId: string;
      /** Parameter name carrying the text (e.g. 'text', 'buttonText', 'question'). */
      param: string;
      newValue: string;
      /** One-line why, shown to the author. */
      note?: string;
    }
  | {
      kind: 'updateParams';
      beatId: string;
      /** Partial parameter patch, canonical schema shapes. */
      params: Record<string, unknown>;
      note?: string;
    }
  | {
      kind: 'addBeat';
      beatType: string;
      name: string;
      parameters?: Record<string, unknown>;
      /** Optional wiring: connect an existing beat to the new one, and/or the new one onward. */
      connectFrom?: string;
      connectTo?: string;
      connectLabel?: string;
      note?: string;
    }
  | {
      kind: 'addNote';
      beatId: string;
      /** Design note appended to the beat's notes field (visible in the Inspector). */
      note: string;
    };

export interface ChangeProposalSet {
  /** Short title for the batch, e.g. "Make Marcus more sinister". */
  title: string;
  /** Optional one-paragraph rationale shown above the list. */
  rationale?: string;
  proposals: ChangeProposal[];
}

/** Per-proposal outcome reported back from the main window. */
export interface ProposalApplyResult {
  /** Index into the APPLIED (selected) proposals array. */
  index: number;
  ok: boolean;
  /** Human-readable summary ("Set text on beat_12" / "beat_99 not found"). */
  detail: string;
}

/** Cross-window messages between the main builder and the Co-Designer pop-out. */
export type CoDesignerWireMessage =
  | { type: 'PING' }
  | { type: 'APPLY_PROPOSALS'; payload: { proposals: ChangeProposal[]; title?: string } }
  | { type: 'APPLY_RESULT'; payload: { results: ProposalApplyResult[] } };
