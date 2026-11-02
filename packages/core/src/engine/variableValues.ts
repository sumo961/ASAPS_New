/**
 * Variable values arrive as text from most authoring surfaces — the Set
 * Variable beat, a choice's "Set variable" effect, a condition's value field
 * — while Project Settings stores a declared default as a real boolean or
 * number. Strict comparison then fails across the two: a boolean variable
 * that starts `false` never matched a condition written as "false", and
 * after an effect stored "true" it no longer matched a `true` written
 * anywhere else.
 */

export type DeclaredVariableType = 'string' | 'number' | 'boolean';

// Empty reads as false: the editors' true/false picker shows "false" for a
// value that was never set, so that is what the story should do too.
function parseBoolean(value: string): boolean | undefined {
  const v = value.trim().toLowerCase();
  if (v === 'true') return true;
  if (v === 'false' || v === '') return false;
  return undefined;
}

function parseNumber(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Bring a written value to the variable's declared type. Text that does not
 * read as that type is kept as written (a typo stays visible in the debug
 * view instead of silently becoming false or 0).
 */
export function coerceToDeclaredType(value: unknown, type: DeclaredVariableType | undefined): unknown {
  if (typeof value !== 'string') return value;
  if (type === 'boolean') return parseBoolean(value) ?? value;
  if (type === 'number') return parseNumber(value) ?? value;
  return value;
}

/**
 * Line two scalar operands up for comparison: when one side is a boolean or
 * number and the other is text that reads as the same kind of value, the
 * text is converted. Everything else is returned unchanged.
 */
export function alignForComparison(left: unknown, right: unknown): [unknown, unknown] {
  if (typeof left === 'string' && typeof right !== 'string') {
    const [r, l] = alignForComparison(right, left);
    return [l, r];
  }
  if (typeof right !== 'string') return [left, right];
  if (typeof left === 'boolean') {
    const b = parseBoolean(right);
    return b === undefined ? [left, right] : [left, b];
  }
  if (typeof left === 'number') {
    const n = parseNumber(right);
    return n === undefined ? [left, right] : [left, n];
  }
  return [left, right];
}

/**
 * The value a counter is compared with. A counter holds a number, so a value
 * that reads as a number is one, and an empty value is 0 (what the editors
 * show for it). Text stays text and so never equals the counter: `==` and the
 * ordering operators are false, `!=` is true.
 */
export function counterComparisonValue(value: unknown): unknown {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number') return Number.isNaN(value) ? 0 : value;
  if (typeof value === 'string') {
    if (value.trim() === '') return 0;
    return parseNumber(value) ?? value;
  }
  return Number(value) || 0;
}

/** True for a value no counter can ever hold: text that is not a number. */
export function isTextForCounter(value: unknown): value is string {
  return typeof counterComparisonValue(value) === 'string';
}
