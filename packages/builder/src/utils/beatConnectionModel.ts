/**
 * Which beat types derive their outgoing links from parameters (choices,
 * props, dialog nodes, timers, random targets) versus the beat-level
 * `connections` array every other beat carries. The Inspector, the review's
 * fix planner and the AI-fix simulation all need the same answer.
 */
export const PARAMETER_DERIVED_TYPES: ReadonlySet<string> = new Set([
  'dialogTree', 'pickProp', 'movementChoice', 'multiChoice',
  'aiDialogTree', 'aiCondition', 'setTimer', 'randomTarget',
]);
