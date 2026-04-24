/**
 * StoryWarnings — detect soft-locks and authoring problems by analyzing a
 * simulated story alongside its declared requirements.
 *
 * Level-2 analyzer output: annotations that help authors surface bugs the
 * simulator alone cannot describe (soft-locks, ungated puzzles, unfulfillable
 * requirements). These warnings are purely advisory — they don't change
 * engine behavior.
 */

import type { Story } from '../engine/Story';
import type { Beat } from '../beats/Beat';
import type { SimulatedPath, SimulatedStep, SimulationState } from './StateSimulationAnalyzer';
import type { StateRequirement, Condition } from '../types';

export type StoryWarningCode =
  | 'keypad-softlock-loop'            // failTarget eventually leads back to the keypad with no state change
  | 'keypad-softlock-unlimited'       // maxAttempts=0 AND no state mutation on failure path
  | 'keypad-ungated'                  // no prerequisite check ancestor; player can always succeed
  | 'requires-unfulfillable'          // beat declares requires but no ancestor provides the state
  | 'requires-violated-on-path';      // a specific path reaches the gated beat without satisfying requires

export interface StoryWarning {
  code: StoryWarningCode;
  severity: 'warn' | 'error';
  beatId: string;
  beatName: string;
  /** Human-readable explanation, includes context. */
  message: string;
  /** Optional extra details (related beat IDs, path indices, etc.). */
  detail?: Record<string, any>;
}

export interface DetectConfig {
  /** Paths from StateSimulationAnalyzer.analyzeRaw(). Used for violation checks. */
  paths: SimulatedPath[];
  story: Story;
}

/**
 * Run all authoring-side checks and return the collected warnings.
 */
export function detectStoryWarnings(cfg: DetectConfig): StoryWarning[] {
  const warnings: StoryWarning[] = [];
  const { paths, story } = cfg;

  // 1. Keypad-specific checks
  for (const beat of story.getAllBeats()) {
    if (beat.type !== 'keypad') continue;
    warnings.push(...detectKeypadWarnings(beat, story, paths));
  }

  // 2. Requires-declared checks (any beat)
  for (const beat of story.getAllBeats()) {
    const params = beat.getParameters() as any;
    const requires: StateRequirement[] | undefined = beat.requires || params.requires;
    if (!requires || requires.length === 0) continue;
    warnings.push(...detectRequiresWarnings(beat, requires, story, paths));
  }

  return warnings;
}

// ============================================================================
// Keypad detection
// ============================================================================

function detectKeypadWarnings(
  keypad: Beat,
  story: Story,
  paths: SimulatedPath[],
): StoryWarning[] {
  const out: StoryWarning[] = [];
  const params = keypad.getParameters() as any;
  const maxAttempts: number = params.maxAttempts ?? 0;
  const failTarget: string | undefined = params.failTarget;
  const declaredRequires: StateRequirement[] | undefined = keypad.requires || params.requires;
  const hasRequires = declaredRequires && declaredRequires.length > 0;
  // For keypads, ONLY an explicit `requires` counts as proper gating. An
  // upstream conditionBeat might gate a different concept (e.g., Lantern
  // possession) while leaving the code ungated. Without explicit author
  // intent via `requires`, we can't semantically verify the keypad is
  // narratively protected.
  const isProperlyGated = hasRequires;

  // For a keypad, the ONLY way out is to enter `correctCode`. Loop-state
  // mutations don't help the player escape the keypad itself — they only
  // matter after the keypad is passed. So any `failTarget` that cycles
  // back to the keypad is a soft-lock UNLESS an upstream gate prevents
  // the player from reaching the keypad without the code (via conditionBeat
  // or a declared `requires`).
  if (failTarget && !isProperlyGated) {
    const loops = traceReachesSelf(failTarget, keypad.id, story, new Set(), 0);
    if (loops.cycles) {
      if (maxAttempts > 0) {
        out.push({
          code: 'keypad-softlock-loop',
          severity: 'error',
          beatId: keypad.id,
          beatName: keypad.name,
          message:
            `Keypad's failTarget loops back to the keypad, and nothing upstream ` +
            `prevents the player from reaching it without the code. A player who ` +
            `doesn't know the code will be stuck: the loop's state changes (if any) ` +
            `don't change the keypad's correctCode, so they cannot escape. ` +
            `Either (a) gate the keypad with a conditionBeat / 'requires' checking ` +
            `a flag set when the code is revealed, or (b) wire failTarget to an ` +
            `endScreen or recovery beat.`,
          detail: { failTarget },
        });
      } else {
        out.push({
          code: 'keypad-softlock-unlimited',
          severity: 'error',
          beatId: keypad.id,
          beatName: keypad.name,
          message:
            `Keypad has maxAttempts: 0 (unlimited tries) and failTarget loops ` +
            `back to this keypad. A player without the code will be stuck ` +
            `indefinitely — the keypad only exits on correct input. Add a ` +
            `'requires' / upstream conditionBeat so the player cannot reach ` +
            `this keypad without the code, or wire failTarget to an escape.`,
          detail: { failTarget },
        });
      }
    }
  }

  // Ungated keypad (no requires, no upstream conditionBeat) — warning
  if (!isProperlyGated) {
    out.push({
      code: 'keypad-ungated',
      severity: 'warn',
      beatId: keypad.id,
      beatName: keypad.name,
      message:
        `Keypad has no declared prerequisite (no 'requires' and no upstream ` +
        `conditionBeat checking for a code-found variable or item). Any player ` +
        `reaching this keypad can enter the correct code, even if the narrative ` +
        `hasn't revealed it. If the code is meant to be earned, declare a ` +
        `'requires' annotation or gate the keypad with a conditionBeat checking ` +
        `a flag set by the code-revealing beat.`,
    });
  }

  return out;
}

/**
 * Trace forward from startBeatId. Returns whether the trace eventually returns
 * to targetBeatId (a cycle), AND whether any beat on the cycle mutates state
 * that is inspected by any condition in the story.
 */
function traceReachesSelf(
  startBeatId: string,
  targetBeatId: string,
  story: Story,
  seen: Set<string>,
  depth: number,
): { cycles: boolean; mutatesInspectedState: boolean } {
  if (depth > 40) return { cycles: false, mutatesInspectedState: false };
  if (seen.has(startBeatId)) return { cycles: false, mutatesInspectedState: false };
  const newSeen = new Set(seen);
  newSeen.add(startBeatId);

  const beat = story.getBeat(startBeatId);
  if (!beat) return { cycles: false, mutatesInspectedState: false };

  const thisMutates = beatMutatesInspectedState(beat, story);

  const conns = beat.getConnections();
  let cycles = false;
  let mutates = thisMutates;
  for (const conn of conns) {
    if (conn.targetId === targetBeatId) {
      cycles = true;
      continue;
    }
    const sub = traceReachesSelf(conn.targetId, targetBeatId, story, newSeen, depth + 1);
    if (sub.cycles) {
      cycles = true;
      if (sub.mutatesInspectedState) mutates = true;
    }
  }
  return { cycles, mutatesInspectedState: mutates };
}

/**
 * Check if a beat's effects modify a variable/counter/item that any condition
 * in the story actually inspects. (A counter change that nothing reads is not
 * a real "state degradation" — it's a no-op.)
 */
function beatMutatesInspectedState(beat: Beat, story: Story): boolean {
  const params = beat.getParameters() as any;
  // Collect the names this beat writes to
  const names = new Set<string>();

  if (beat.type === 'setVariable') {
    const name = params.name || params.variableName;
    if (name) names.add(name);
  }

  if (beat.type === 'addRemoveInventory') {
    const item = params.item || params.prop;
    if (item) names.add(item);
  }

  // Canonical effects on this beat's params (if any)
  const effects = params.effects;
  if (Array.isArray(effects)) {
    for (const e of effects) {
      if (e.target) names.add(e.target);
      if (e.counter) names.add(e.counter);
      if (e.variable) names.add(e.variable);
      if (e.item) names.add(e.item);
    }
  }

  if (names.size === 0) return false;

  // Do any conditions in the story reference any of these names?
  for (const b of story.getAllBeats()) {
    const p = b.getParameters() as any;
    const conds = collectConditionsFromBeat(p);
    // Also include any beat-level requires (Beat.requires)
    if ((b as any).requires) {
      for (const r of (b as any).requires as StateRequirement[]) {
        if (r.condition) conds.push(r.condition);
      }
    }
    for (const c of conds) {
      const refs = collectConditionReferencedNames(c);
      for (const r of refs) {
        if (names.has(r)) return true;
      }
    }
  }
  return false;
}

function collectConditionsFromBeat(params: any): Condition[] {
  const out: Condition[] = [];
  if (params.condition) out.push(params.condition);
  if (Array.isArray(params.requires)) {
    for (const r of params.requires as StateRequirement[]) {
      if (r.condition) out.push(r.condition);
    }
  }
  // Conditional connections (on choices/connections)
  if (Array.isArray(params.connections)) {
    for (const c of params.connections) if (c.condition) out.push(c.condition);
  }
  if (Array.isArray(params.choices)) {
    for (const ch of params.choices) {
      if (Array.isArray(ch.conditions)) out.push(...ch.conditions);
      if (ch.condition) out.push(ch.condition);
    }
  }
  if (Array.isArray(params.props)) {
    for (const pr of params.props) {
      if (Array.isArray(pr.conditions)) out.push(...pr.conditions);
      if (pr.condition) out.push(pr.condition);
    }
  }
  return out;
}

function collectConditionReferencedNames(c: Condition): string[] {
  const names: string[] = [];
  if ((c as any).variableName) names.push((c as any).variableName);
  if ((c as any).variable) names.push((c as any).variable);
  if ((c as any).left) names.push((c as any).left);
  if ((c as any).counter1) names.push((c as any).counter1);
  if ((c as any).counter2) names.push((c as any).counter2);
  if ((c as any).beatId) names.push((c as any).beatId);
  if ((c as any).item) names.push((c as any).item);
  return names;
}

// ============================================================================
// Requires / upstream gate detection
// ============================================================================

/**
 * Is there a conditionBeat somewhere upstream of `gateBeat` that checks any
 * variable/item that appears to function as a prerequisite flag? Heuristic:
 * any conditionBeat that's reachable from any ancestor of gateBeat and whose
 * condition references a state name set by some other ancestor counts.
 */
function findUpstreamPrerequisiteGate(gateBeat: Beat, story: Story): boolean {
  // Walk backward from gateBeat; any conditionBeat in the ancestor set counts.
  const ancestors = collectAncestorBeatIds(gateBeat.id, story);
  for (const id of ancestors) {
    const b = story.getBeat(id);
    if (!b) continue;
    if (b.type === 'conditionBeat') return true;
  }
  return false;
}

function collectAncestorBeatIds(targetId: string, story: Story): Set<string> {
  // Reverse-edge traversal from targetId to story start.
  // Build an index of inbound edges once.
  const inbound = new Map<string, Set<string>>();
  for (const b of story.getAllBeats()) {
    for (const c of b.getConnections()) {
      if (!inbound.has(c.targetId)) inbound.set(c.targetId, new Set());
      inbound.get(c.targetId)!.add(b.id);
    }
    // Default target and requires-fallback are also real inbound edges.
    if (b.defaultTarget) {
      if (!inbound.has(b.defaultTarget)) inbound.set(b.defaultTarget, new Set());
      inbound.get(b.defaultTarget)!.add(b.id);
    }
    const requires = (b as any).requires as any[] | undefined;
    if (Array.isArray(requires)) {
      for (const req of requires) {
        const fb = req?.fallbackTarget;
        if (fb) {
          if (!inbound.has(fb)) inbound.set(fb, new Set());
          inbound.get(fb)!.add(b.id);
        }
      }
    }
  }

  const out = new Set<string>();
  const queue = [targetId];
  const seen = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const ins = inbound.get(id);
    if (!ins) continue;
    for (const src of ins) {
      if (src !== targetId) out.add(src);
      queue.push(src);
    }
  }
  return out;
}

// ============================================================================
// Requires violation checks
// ============================================================================

function detectRequiresWarnings(
  beat: Beat,
  requires: StateRequirement[],
  story: Story,
  paths: SimulatedPath[],
): StoryWarning[] {
  const out: StoryWarning[] = [];
  const ancestors = collectAncestorBeatIds(beat.id, story);

  // Rule 4a: requires-unfulfillable — no ancestor beat can produce the state
  // this requirement checks.
  //
  // Structural rather than simulation-based: the BFS path simulator doesn't
  // enumerate every hub-visit permutation, so "no simulated path satisfies"
  // used to flag perfectly fulfillable setups. Instead we walk the beat graph
  // backwards and ask: is there ANY ancestor that writes the state this
  // condition reads? If yes, the requirement is plausibly fulfillable.
  for (const req of requires) {
    const cond = req.condition as any;
    const refs = collectConditionReferencedNames(cond || {}).filter(Boolean);
    const descr = req.explanation && req.explanation.trim()
      ? req.explanation
      : formatConditionSummary(cond);

    // Incomplete condition: the author opened a requirement slot but didn't pick
    // an item/variable/counter. Surface separately so the message is actionable.
    if (refs.length === 0) {
      out.push({
        code: 'requires-unfulfillable',
        severity: req.severity ?? 'warn',
        beatId: beat.id,
        beatName: beat.name,
        message:
          `Requirement on "${beat.name}" is incomplete — no item, variable, or ` +
          `counter is selected in the condition. Finish configuring it or remove ` +
          `the requirement.`,
        detail: { requirement: req },
      });
      continue;
    }

    // Does any ancestor beat produce the referenced state?
    let producedByAncestor = false;
    for (const ancId of ancestors) {
      const anc = story.getBeat(ancId);
      if (!anc) continue;
      if (beatProducesAnyOf(anc, refs)) {
        producedByAncestor = true;
        break;
      }
    }

    if (!producedByAncestor) {
      out.push({
        code: 'requires-unfulfillable',
        severity: req.severity ?? 'error',
        beatId: beat.id,
        beatName: beat.name,
        message:
          `Requirement "${descr}" on "${beat.name}" cannot be satisfied: no ` +
          `upstream beat produces ${refs.join(' / ')}. Wire a setVariable, ` +
          `addRemoveInventory, pickProp, or choice effect upstream — or remove the ` +
          `requirement.`,
        detail: { requirement: req },
      });
    }
  }

  // Rule 4b: requires-violated-on-path — some simulated path reaches this beat
  // without satisfying the requirement. Only meaningful for complete conditions
  // and when the requirement is fulfillable at all (otherwise Rule 4a handles it).
  let totalPathsToBeat = 0;
  let violatingPaths = 0;
  for (const p of paths) {
    const stepIdx = p.steps.findIndex((s: SimulatedStep) => s.beatId === beat.id);
    if (stepIdx < 0) continue;
    totalPathsToBeat++;
    const stateBefore = stepIdx > 0 ? p.steps[stepIdx - 1].stateAfter : p.steps[stepIdx].stateAfter;
    for (const req of requires) {
      const cond = req.condition as any;
      const refs = collectConditionReferencedNames(cond || {}).filter(Boolean);
      if (refs.length === 0) continue; // skip incomplete
      if (!evaluateCondition(req.condition, stateBefore)) {
        violatingPaths++;
        break;
      }
    }
  }
  if (violatingPaths > 0 && violatingPaths < totalPathsToBeat) {
    out.push({
      code: 'requires-violated-on-path',
      severity: 'warn',
      beatId: beat.id,
      beatName: beat.name,
      message:
        `${violatingPaths} of ${totalPathsToBeat} simulated paths reach this beat ` +
        `without satisfying its declared requirement. Players may encounter this ` +
        `beat unprepared — the runtime gate will redirect to the fallback, but ` +
        `consider whether that flow is what you want.`,
      detail: { violatingPaths, totalPathsToBeat },
    });
  }

  return out;
}

/**
 * Does this beat write any of the given state names? Scans the beat-type-specific
 * parameter shapes plus the canonical `effects[]` wherever they appear (prop,
 * choice, connection, top-level).
 */
function beatProducesAnyOf(beat: Beat, refs: string[]): boolean {
  const nameSet = new Set(refs.filter(Boolean));
  if (nameSet.size === 0) return false;
  const params = (beat.getParameters() as any) || {};

  if (beat.type === 'setVariable') {
    const n = params.name || params.variableName;
    if (n && nameSet.has(n)) return true;
  }

  if (beat.type === 'addRemoveInventory') {
    if (params.item && nameSet.has(params.item)) return true;
  }

  if (Array.isArray(params.props)) {
    for (const p of params.props) {
      const item = p?.inventoryName || p?.locationName || p?.name;
      if (item && nameSet.has(item)) return true;
      if (p?.counter && nameSet.has(p.counter)) return true;
      if (Array.isArray(p?.effects)) {
        for (const e of p.effects) if (effectTouchesName(e, nameSet)) return true;
      }
    }
  }

  if (Array.isArray(params.choices)) {
    for (const c of params.choices) {
      if (Array.isArray(c?.effects)) {
        for (const e of c.effects) if (effectTouchesName(e, nameSet)) return true;
      }
    }
  }

  if (Array.isArray(params.connections)) {
    for (const conn of params.connections) {
      if (Array.isArray(conn?.effects)) {
        for (const e of conn.effects) if (effectTouchesName(e, nameSet)) return true;
      }
    }
  }

  if (Array.isArray(params.effects)) {
    for (const e of params.effects) if (effectTouchesName(e, nameSet)) return true;
  }

  // DialogTree nested effects
  if (params.dialogTree) {
    const walk = (node: any): boolean => {
      if (!node || typeof node !== 'object') return false;
      if (Array.isArray(node.choices)) {
        for (const c of node.choices) {
          if (Array.isArray(c?.effects)) {
            for (const e of c.effects) if (effectTouchesName(e, nameSet)) return true;
          }
          if (c?.next && walk(c.next)) return true;
        }
      }
      return false;
    };
    if (walk(params.dialogTree)) return true;
  }

  return false;
}

function effectTouchesName(e: any, nameSet: Set<string>): boolean {
  if (!e || typeof e !== 'object') return false;
  const candidates = [e.target, e.counter, e.variable, e.item, e.name];
  return candidates.some(n => n && nameSet.has(n));
}

function formatConditionSummary(c: any): string {
  if (!c || typeof c !== 'object') return 'condition';
  const t = c.type;
  if (t === 'inventory') return `has ${c.item || '?'}`;
  if (t === 'counter') return `${c.variableName || c.variable || '?'} ${c.operator || ''} ${c.value ?? ''}`.trim();
  if (t === 'variable') return `${c.variableName || c.variable || '?'} ${c.operator || ''} ${c.value ?? ''}`.trim();
  if (t === 'visitedBeat') return `visited ${c.beatId || '?'}`;
  return String(t || 'condition');
}

// Minimal condition evaluator — mirrors StateSimulationAnalyzer's evaluateCondition.
function evaluateCondition(condition: Condition, state: SimulationState): boolean {
  const { type, operator } = condition as any;
  const varName = (condition as any).variableName || (condition as any).variable || (condition as any).left;
  const value = (condition as any).value ?? (condition as any).right;

  switch (type) {
    case 'counter': {
      if (!varName) return false;
      const cur = state.counters.get(varName) ?? 0;
      return compare(cur, operator, Number(value));
    }
    case 'variable': {
      if (!varName) return false;
      const cur = state.variables.get(varName);
      return operator === '!=' || operator === 'not' ? cur != value : cur == value;
    }
    case 'inventory': {
      const item = (condition as any).item || value;
      const char = (condition as any).character || 'player';
      const has = state.inventory.get(char)?.has(item) ?? false;
      return operator === '!=' || operator === 'not' ? !has : has;
    }
    case 'visitedBeat': {
      const id = (condition as any).beatId || varName;
      const visited = state.visitedBeats.has(id);
      return operator === '!=' || operator === 'not' ? !visited : visited;
    }
    default:
      return false;
  }
}

function compare(left: number, op: string, right: number): boolean {
  switch (op) {
    case '>=': return left >= right;
    case '<=': return left <= right;
    case '>':  return left > right;
    case '<':  return left < right;
    case '==': return left === right;
    case '!=': return left !== right;
    default:   return false;
  }
}
