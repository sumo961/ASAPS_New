/**
 * The ONE list of simple string parameters that count as author-facing text.
 *
 * Both text tools consume it:
 *  - SearchService (Search & Replace, ⌘F)
 *  - HelperCommandFilter (Transformations / bulk edit)
 *
 * They used to keep separate hand-maintained lists that had silently
 * diverged — Search covered 5 fields and never saw `prompt` (used by 11
 * beat types), `question`, or `cancelButtonText`, so a "renamed everywhere"
 * pass quietly wasn't. Arrays (choices[].text, textVariations[]) and the
 * dialogTree walk stay in the consumers; this list is only the flat
 * string-valued parameters.
 */
export const SEARCHABLE_TEXT_FIELDS = [
  'text',
  'title',
  'message',
  'buttonText',
  'cancelButtonText',
  'author',
  'speaker',
  'prompt',
  'question',
  'content',
  'description',
  'restartText',
  'creditsText',
  'creditsPageBody',
] as const;
