/**
 * Counter reachability — the ONE analysis of "what values can this counter
 * take" and "can this counter gate ever be taken".
 *
 * Two hand-rolled copies used to live in AIValidator and aiStoryValidator
 * and disagreed: one skipped flattened conditions (post-pipeline stories
 * were never checked), both only saw the legacy flat counter fields on
 * movementChoice/pickProp and never the canonical `effects[]` every choice
 * carries now, so a counter fed only by choice effects had a "range" of
 * 0..0 and every gate on it read as unsatisfiable. Since proposals now act
 * on these findings, the walk has to be right — and shared.
 *
 * Flow-insensitive: the range is the union over every change in the story,
 * not per path. That makes "unsatisfiable" a strong claim (no path at all)
 * and "satisfiable" a weak one — exactly the asymmetry a fix proposal wants.
 */

export interface CounterRange {
  min: number;
  max: number;
  /** At least one beat or choice changes this counter. */
  modified: boolean;
}

export interface CounterCondition {
  counterName: string;
  operator: string;
  value: number;
  trueTarget?: string;
  falseTarget?: string;
  /** Threshold lives in `parameters.condition.value` rather than `parameters.value`. */
  nested: boolean;
}

function rangeFor(map: Map<string, CounterRange>, name: string): CounterRange {
  let r = map.get(name);
  if (!r) { r = { min: 0, max: 0, modified: false }; map.set(name, r); }
  return r;
}

export function applyCounterOperation(range: CounterRange, operation: string, value: number): void {
  range.modified = true;
  switch (operation) {
    case 'set':
      range.max = Math.max(range.max, value);
      range.min = Math.min(range.min, value);
      break;
    case 'subtract':
      if (value > 0) range.min -= value; else range.max -= value;
      break;
    case 'multiply':
      if (value !== 0) {
        const a = range.max * value, b = range.min * value;
        range.max = Math.max(a, b); range.min = Math.min(a, b);
      }
      break;
    case 'divide':
      if (value !== 0) {
        const a = range.max / value, b = range.min / value;
        range.max = Math.max(a, b); range.min = Math.min(a, b);
      }
      break;
    case 'add':
    case 'change':
    case 'increment':
    default:
      if (value > 0) range.max += value; else range.min += value;
  }
}

/** One choice / prop / dialog option: legacy flat counter fields AND canonical effects[]. */
function applyChoiceCounters(choice: any, map: Map<string, CounterRange>): void {
  if (!choice || typeof choice !== 'object') return;
  const legacyName = choice.counterEffect?.counter || choice.counter;
  if (legacyName) {
    const v = Number(choice.counterEffect?.value ?? choice.counterValue ?? 1);
    const op = choice.counterEffect?.operation || choice.counterOperation || 'change';
    applyCounterOperation(rangeFor(map, legacyName), op, Number.isFinite(v) ? v : 0);
  }
  if (Array.isArray(choice.effects)) {
    for (const e of choice.effects) {
      if (!e || typeof e !== 'object') continue;
      if (e.type === 'incrementCounter' && typeof e.target === 'string' && e.target) {
        const v = e.value === undefined || e.value === null ? 1 : Number(e.value);
        applyCounterOperation(rangeFor(map, e.target), 'add', Number.isFinite(v) ? v : 0);
      }
    }
  }
}

function walkDialogCounters(node: any, map: Map<string, CounterRange>, depth = 0): void {
  if (!node || typeof node !== 'object' || depth > 50) return;
  if (Array.isArray(node.choices)) {
    for (const c of node.choices) {
      applyChoiceCounters(c, map);
      if (c?.dialogNode) walkDialogCounters(c.dialogNode, map, depth + 1);
      if (c?.target && typeof c.target === 'object') walkDialogCounters(c.target, map, depth + 1);
    }
  }
  if (Array.isArray(node.entries)) for (const e of node.entries) walkDialogCounters(e, map, depth + 1);
  if (node.next && typeof node.next === 'object') walkDialogCounters(node.next, map, depth + 1);
}

/**
 * Every value each counter can reach, from every beat that changes it.
 * `variables` (story-level declarations) seed the initial value.
 */
export function analyzeCounterRanges(
  beats: readonly any[],
  variables?: readonly any[],
): Map<string, CounterRange> {
  const map = new Map<string, CounterRange>();
  if (Array.isArray(variables)) {
    for (const v of variables) {
      if (v && typeof v.name === 'string' && (v.type === 'counter' || typeof v.initialValue === 'number')) {
        const init = Number(v.initialValue ?? 0);
        if (Number.isFinite(init)) map.set(v.name, { min: init, max: init, modified: false });
      }
    }
  }
  for (const beat of beats || []) {
    const p = beat?.parameters || {};
    if (beat?.type === 'setVariable' || beat?.type === 'variable') {
      if (p.type === 'counter' && typeof p.name === 'string' && p.name) {
        const v = Number(p.value); const op = p.operation || 'set';
        applyCounterOperation(rangeFor(map, p.name), op, Number.isFinite(v) ? v : 0);
      }
      continue;
    }
    for (const key of ['choices', 'props', 'options']) {
      if (Array.isArray(p[key])) for (const c of p[key]) applyChoiceCounters(c, map);
    }
    if (p.dialogTree) walkDialogCounters(p.dialogTree, map);
  }
  return map;
}

/** Read a conditionBeat's counter gate in either shape (nested `condition` or flattened). */
export function readCounterCondition(beat: any): CounterCondition | null {
  if (!beat || beat.type !== 'conditionBeat') return null;
  const p = beat.parameters || {};
  const nestedCond = p.condition && typeof p.condition === 'object' ? p.condition : null;
  const condType = nestedCond?.type ?? p.conditionType;
  if (condType !== 'counter') return null;
  const counterName = nestedCond?.variable || nestedCond?.variableName || p.variableName || p.variable || p.counterName;
  if (typeof counterName !== 'string' || !counterName) return null;
  const operator = nestedCond?.operator || p.operator || '>=';
  const raw = nestedCond?.value ?? p.value ?? 0;
  const value = Number(raw);
  return {
    counterName,
    operator,
    value: Number.isFinite(value) ? value : 0,
    trueTarget: p.trueTarget || (typeof p.trueConnection === 'string' ? p.trueConnection : p.trueConnection?.target),
    falseTarget: p.falseTarget || (typeof p.falseConnection === 'string' ? p.falseConnection : p.falseConnection?.target),
    nested: !!nestedCond && nestedCond.value !== undefined,
  };
}

export function conditionCanBeTrue(range: CounterRange, operator: string, value: number): boolean {
  switch (operator) {
    case '==': return range.min <= value && value <= range.max;
    case '!=': return !(range.min === value && range.max === value);
    case '>': return range.max > value;
    case '>=': return range.max >= value;
    case '<': return range.min < value;
    case '<=': return range.min <= value;
    default: return true;
  }
}

export function conditionCanBeFalse(range: CounterRange, operator: string, value: number): boolean {
  switch (operator) {
    case '==': return range.min < value || value < range.max;
    case '!=': return range.min <= value && value <= range.max;
    case '>': return range.min <= value;
    case '>=': return range.min < value;
    case '<': return range.max >= value;
    case '<=': return range.max > value;
    default: return true;
  }
}
