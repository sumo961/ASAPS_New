/**
 * AI Story Logic results kept WITH the project (generation/story-logic.json):
 * what each checked beat was found to do, under a key of its words and the
 * states arriving there (a re-run only checks what changed), and the findings
 * an author dismissed (a group doesn't re-triage them).
 */

export type StoryLogicKind =
  | 'assumes-missing-state'
  | 'contradicts-earlier-text'
  | 'character-knows-too-much'
  | 'feeling-mismatch'
  | 'choice-promise-broken'
  | 'dangling-reference';

export interface StoryLogicFinding {
  /** Stable across runs: beat + kind + quote. Dismissals use it. */
  key: string;
  beatId: string;
  kind: StoryLogicKind;
  /** Words really in the beat (checked). */
  quote: string;
  /** Index into the beat's arriving states as described to the model. */
  state: number;
  why: string;
  severity: 'problem' | 'worth a look';
  suggestion: string;
}

export interface StoryLogicStore {
  version: 1;
  /** Finding keys marked "Not a problem". */
  dismissed: string[];
  /** Per beat: the key it was checked under and what was found (often nothing). */
  checked: Record<string, { key: string; findings: StoryLogicFinding[] }>;
}
