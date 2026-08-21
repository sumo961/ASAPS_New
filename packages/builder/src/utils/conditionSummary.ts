/**
 * Human-readable one-liners for guard conditions — "logic visible where it
 * acts": the same summary appears on the guarded edge in the flowchart and
 * in the choice's condition editor.
 */
import type { Condition } from '@asaps/core';

const OP_TEXT: Record<string, string> = {
  '==': '=',
  '!=': '≠',
  '>': '>',
  '<': '<',
  '>=': '≥',
  '<=': '≤',
};

export function summarizeCondition(
  c: Condition,
  beatNameOf?: (beatId: string) => string | undefined,
): string {
  switch (c.type) {
    case 'inventory': {
      const item = (c as any).item ?? c.variableName ?? '?';
      const negated = c.operator === 'not' || c.operator === '!=';
      return negated ? `lacks ${item}` : `has ${item}`;
    }
    case 'variable':
      return `${c.variableName ?? '?'} ${OP_TEXT[c.operator] ?? c.operator} ${JSON.stringify(c.value)}`;
    case 'counter':
      return `${c.variableName ?? '?'} ${OP_TEXT[c.operator] ?? c.operator} ${c.value}`;
    case 'counterCompare':
      return `${c.counter1 ?? '?'} ${OP_TEXT[c.operator] ?? c.operator} ${c.counter2 ?? '?'}`;
    case 'visitedBeat': {
      const name = (c.beatId && beatNameOf?.(c.beatId)) || c.beatId || '?';
      const negated = c.operator === 'not' || c.operator === '!=';
      return negated ? `not visited "${name}"` : `visited "${name}"`;
    }
    default:
      // Affect / XR / timer types — name the type rather than invent syntax
      return `${c.type}${c.variableName ? ` ${c.variableName}` : ''}`;
  }
}

/** "has key · trust ≥ 2" — the edge-label form. */
export function summarizeConditions(
  conds: ReadonlyArray<Condition> | undefined,
  beatNameOf?: (beatId: string) => string | undefined,
): string | null {
  if (!conds || conds.length === 0) return null;
  return conds.map(c => summarizeCondition(c, beatNameOf)).join(' · ');
}
