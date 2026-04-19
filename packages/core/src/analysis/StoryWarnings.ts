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
  const declaredRequires: StateRequirement[] | undefined = params.requires;

  // Rule 1: bounded keypad with failTarget that loops back
  if (maxAttempts > 0 && failTarget) {
    const loops = traceReachesSelf(failTarget, keypad.id, story, new Set(), 0);
    if (loops.cycles && !loops.mutatesInspectedState) {
      out.push({
        code: 'keypad-softlock-loop',
        severity: 'error',
        beatId: keypad.id,
        beatName: keypad.name,
        message:
          `Keypad's failure path ("failTarget") loops back to the keypad without ` +
          `any state change that would help the player (no counter/variable/inventory ` +
          `change is read by a downstream condition). Players who don't know the code ` +
          `will be stuck indefinitely. Wire failTarget to a beat that either helps the ` +
          `player obtain the code, or to an explanatory endScreen.`,
        detail: { failTarget },
      });
    }
  }

  // Rule 2: unlimited-tries keypad with no state-degrading mechanic
  if (maxAttempts === 0 && failTarget) {
    const loops = traceReachesSelf(failTarget, keypad.id, story, new Set(), 0);
    if (loops.cycles && !loops.mutatesInspectedState) {
      out.push({
        code: 'keypad-softlock-unlimited',
        severity: 'error',
        beatId: keypad.id,
        beatName: keypad.name,
        message:
          `Keypad has maxAttempts: 0 (unlimited tries), and the failure loop makes no ` +
          `state changes that any downstream condition reads. The player has no way ` +
          `to progress if they don't know the code. Either add a counter that ` +
          `eventually triggers a recovery beat, or point failTarget to an escape.`,
        detail: { failTarget },
      });
    }
  }

  // Rule 3: ungated keypad (no requires, no upstream conditionBeat checking for prerequisite)
  const hasRequires = declaredRequires && declaredRequires.length > 0;
  const hasUpstreamGate = findUpstreamPrerequisiteGate(keypad, story);
  if (!hasRequires && !hasUpstreamGate) {
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
        `'requires' annotation or gate the keypad with a conditionBeat checking a ` +
        `flag set by the code-revealing beat.`,
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

  // Rule 4a: requires-unfulfillable — no path simulated reaches this beat with
  // the requirement satisfied.
  for (const req of requires) {
    const canBeSatisfied = paths.some(p => {
      const stepIdx = p.steps.findIndex((s: SimulatedStep) => s.beatId === beat.id);
      if (stepIdx < 0) return false;
      const stateBefore = stepIdx > 0 ? p.steps[stepIdx - 1].stateAfter : p.steps[stepIdx].stateAfter;
      return evaluateCondition(req.condition, stateBefore);
    });

    if (!canBeSatisfied) {
      out.push({
        code: 'requires-unfulfillable',
        severity: req.severity ?? 'error',
        beatId: beat.id,
        beatName: beat.name,
        message:
          `Requirement "${req.explanation}" cannot be satisfied by any path reaching ` +
          `this beat. No ancestor beat sets the state this requirement checks. ` +
          `Either wire a beat that sets the prerequisite state, or remove the requirement.`,
        detail: { requirement: req },
      });
    }
  }

  // Rule 4b: requires-violated-on-path — some path reaches this beat without satisfying
  let totalPathsToBeat = 0;
  let violatingPaths = 0;
  for (const p of paths) {
    const stepIdx = p.steps.findIndex((s: SimulatedStep) => s.beatId === beat.id);
    if (stepIdx < 0) continue;
    totalPathsToBeat++;
    const stateBefore = stepIdx > 0 ? p.steps[stepIdx - 1].stateAfter : p.steps[stepIdx].stateAfter;
    for (const req of requires) {
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
        `without satisfying its declared requirement. The player may encounter this ` +
        `beat unprepared; consider gating access with a conditionBeat.`,
      detail: { violatingPaths, totalPathsToBeat },
    });
  }

  return out;
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
