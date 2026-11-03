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
import { analyzeRoleFindings } from './roleFindings';
import { analysisLinks } from './analysisLinks';
import { isTextForCounter } from '../engine/variableValues';

export type StoryWarningCode =
  | 'keypad-softlock-loop'            // failTarget eventually leads back to the keypad with no state change
  | 'keypad-softlock-unlimited'       // maxAttempts=0 AND no state mutation on failure path
  | 'keypad-ungated'                  // no prerequisite check ancestor; player can always succeed
  | 'requires-unfulfillable'          // beat declares requires but no ancestor provides the state
  | 'requires-violated-on-path'       // a specific path reaches the gated beat without satisfying requires
  | 'counter-text'                    // a counter checked against, or set to, text
  | 'wordless-reply'                  // a Dialog Tree reply button with no words
  | 'line-never-plays'                // a next line behind one that always plays
  | 'name-mismatch'                   // a condition reads a name nothing sets; a very similar name is set
  | 'setup-unreached'                 // what a played beat checks is only ever set on beats nobody reaches
  | 'reply-hidden-by-next-line'       // a reply beside next lines: shown only when none of them plays
  | 'choices-all-hidden'              // no choice on offer: the beat is skipped by its own link
  | 'reply-nowhere'                   // a reply with no next line and no exit: picking it ends the scene
  | 'role';                           // cast roles: unknown role, non-candidate cast, recast, used before cast, bare AI partner

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
  /** What was played, from the path search (analyzeRaw) ... */
  paths?: SimulatedPath[];
  /** ... or from any other search. */
  evidence?: StoryEvidence;
  story: Story;
  /** Replies some playthrough had on screen (StateSimulationAnalyzer.shownReplies). */
  shownReplies?: ReadonlySet<string>;
  /** The search ran out of budget: what it didn't see may still happen. */
  searchLimited?: boolean;
}

/** What a search of the story saw players do. */
export interface StoryEvidence {
  played: ReadonlySet<string>;
  /** Beats some player reaches with every choice hidden. */
  hiddenChoices: ReadonlySet<string>;
  /** The states a beat is arrived in. */
  arrivalsAt: (beatId: string) => SimulationState[];
}

function evidenceFromPaths(paths: SimulatedPath[]): StoryEvidence {
  const played = new Set<string>();
  const hiddenChoices = new Set<string>();
  for (const p of paths) for (const s of p.steps) {
    played.add(s.beatId);
    if (s.allChoicesHidden) hiddenChoices.add(s.beatId);
  }
  return {
    played,
    hiddenChoices,
    arrivalsAt: (beatId) => {
      const out: SimulationState[] = [];
      for (const p of paths) {
        const i = p.steps.findIndex((s) => s.beatId === beatId);
        if (i >= 0) out.push(i > 0 ? p.steps[i - 1].stateAfter : p.steps[i].stateAfter);
      }
      return out;
    },
  };
}

/**
 * Run all authoring-side checks and return the collected warnings.
 */
export function detectStoryWarnings(cfg: DetectConfig): StoryWarning[] {
  const warnings: StoryWarning[] = [];
  const { story } = cfg;
  const evidence = cfg.evidence ?? evidenceFromPaths(cfg.paths ?? []);

  // 1. Keypad-specific checks
  for (const beat of story.getAllBeats()) {
    if (beat.type !== 'keypad') continue;
    warnings.push(...detectKeypadWarnings(beat, story));
  }

  // 2. Requires-declared checks (any beat)
  for (const beat of story.getAllBeats()) {
    const params = beat.getParameters() as any;
    const requires: StateRequirement[] | undefined = beat.requires || params.requires;
    if (!requires || requires.length === 0) continue;
    warnings.push(...detectRequiresWarnings(beat, requires, story, evidence));
  }

  // 3. Cast roles (the same checks the generation review runs), so stories
  // written by hand get them too.
  const plainBeats = story.getAllBeats().map((b: any) => ({
    id: b.id, name: b.name, type: b.type, speaker: b.speaker, characterRef: b.characterRef,
    parameters: b.getParameters?.() ?? b.parameters, connections: b.connections, requires: b.requires,
  }));
  for (const f of analyzeRoleFindings(plainBeats, (story as any).getSettings?.()?.roles, story.getCharacters?.(), story.getFirstBeatId?.())) {
    warnings.push({
      code: 'role', severity: f.problem === 'unknown-role' || f.problem === 'not-candidate' ? 'error' : 'warn',
      beatId: f.beatId, beatName: f.beatName || f.beatId, message: f.message, detail: { problem: f.problem, role: f.role },
    });
  }

  // Paths that arrived at a choice with nothing to choose.
  const skipped = new Map<string, Beat>();
  for (const id of evidence.hiddenChoices) {
    const beat = story.getBeat(id);
    if (beat) skipped.set(id, beat);
  }
  for (const beat of skipped.values()) {
    const first = beat.connections?.find((c) => !c.condition)?.targetId ?? beat.defaultTarget;
    const on = first ? story.getBeat(first)?.name ?? first : null;
    warnings.push({
      code: 'choices-all-hidden', severity: 'warn', beatId: beat.id, beatName: beat.name,
      message: `Some players reach this beat with every choice hidden by its conditions. They never see the question: the story moves straight on${on ? ` to "${on}"` : ''}. Add a choice with no condition, or check the conditions.`,
      detail: { target: first },
    });
  }

  warnings.push(...detectStateWiring(story, evidence.played));

  // 4. Mistakes only a read of the beat shows: the simulator plays them as written.
  const played = evidence.played;
  for (const beat of story.getAllBeats()) {
    warnings.push(...detectCounterText(beat));
    if (beat.type === 'dialogTree') warnings.push(...detectDialogShape(beat, cfg.shownReplies, played, cfg.searchLimited));
  }

  return warnings;
}

// ============================================================================
// What conditions read against what the story sets
// ============================================================================

/** Edit distance, stopping early: names further than `limit` apart don't matter. */
function nameDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    row = next;
  }
  return row[b.length];
}

/**
 * Two names meant to be one: the same but for capitals, or a slip of a letter
 * or two in a longer name. Names told apart by a number (score1, score2) are
 * meant to be different.
 */
export function looksLikeSameName(a: string, b: string): boolean {
  const [x, y] = [a.trim().toLowerCase(), b.trim().toLowerCase()];
  if (x === y) return true;
  if (x.replace(/\d+/g, '') === y.replace(/\d+/g, '')) return false;
  return Math.min(x.length, y.length) >= 6 && nameDistance(x, y, 2) <= 2;
}

function detectStateWiring(story: Story, played: ReadonlySet<string>): StoryWarning[] {
  type Kind = 'value' | 'item';
  const reads = new Map<string, { kind: Kind; name: string; beats: Set<string> }>();
  const sets = new Map<string, Set<string>>();
  const key = (kind: Kind, name: string) => `${kind}\u0001${name.trim()}`;
  const noteSet = (kind: Kind, name: unknown, beatId: string) => {
    if (typeof name !== 'string' || !name.trim()) return;
    const k = key(kind, name);
    if (!sets.has(k)) sets.set(k, new Set());
    sets.get(k)!.add(beatId);
  };
  const playerBag = (o: any) => !o.character || o.character === 'player';
  for (const beat of story.getAllBeats()) {
    const params = beat.getParameters() as any;
    const walk = (o: any): void => {
      if (Array.isArray(o)) { o.forEach(walk); return; }
      if (!o || typeof o !== 'object') return;
      if (o.type === 'variable' || o.type === 'counter') {
        const name = o.variableName || o.variable || o.left;
        if (typeof name === 'string' && name.trim() && !o.character) {
          const k = key('value', name);
          if (!reads.has(k)) reads.set(k, { kind: 'value', name: name.trim(), beats: new Set() });
          reads.get(k)!.beats.add(beat.id);
        }
      } else if (o.type === 'inventory' && playerBag(o)) {
        const name = o.item || o.value || o.right;
        if (typeof name === 'string' && name.trim()) {
          const k = key('item', name);
          if (!reads.has(k)) reads.set(k, { kind: 'item', name: name.trim(), beats: new Set() });
          reads.get(k)!.beats.add(beat.id);
        }
      }
      if (o.type === 'setVariable' || o.type === 'setCounter' || o.type === 'incrementCounter') noteSet('value', o.target, beat.id);
      if (o.type === 'addInventory' && playerBag(o)) noteSet('item', o.target, beat.id);
      noteSet('value', o.counter, beat.id);
      if (typeof o.variable === 'string' && o.type !== 'variable' && o.type !== 'counter') noteSet('value', o.variable, beat.id);
      for (const v of Object.values(o)) if (v && typeof v === 'object') walk(v);
    };
    walk(params);
    walk((beat as any).requires);
    walk(beat.connections);
    if (beat.type === 'setVariable') noteSet('value', params.name, beat.id);
    if (beat.type === 'inputText') noteSet('value', params.variable ?? params.variableName, beat.id);
    if (beat.type === 'addRemoveInventory' && params.action !== 'remove' && playerBag(params)) noteSet('item', params.item, beat.id);
    if (beat.type === 'pickProp') for (const prop of params.props ?? []) noteSet('item', prop?.item ?? prop?.name, beat.id);
  }
  // What the story starts with counts as set: nothing is missing there.
  const starts = new Set<string>();
  for (const c of story.getCharacters?.() ?? [] as any[]) {
    for (const d of (c as any)?.counters ?? []) if (d?.name) starts.add(key('value', d.name));
    if ((c as any)?.role === 'player') for (const it of (c as any)?.inventory ?? []) if (it?.name) starts.add(key('item', it.name));
  }

  const out: StoryWarning[] = [];
  const nameOf = (id: string) => story.getBeat(id)?.name?.trim() || id;
  const firstOf = (ids: Set<string>) => [...ids].sort((a, b) => nameOf(a).localeCompare(nameOf(b)))[0];
  const what = (kind: Kind) => (kind === 'item' ? 'item' : 'name');

  for (const [k, read] of reads) {
    if (sets.has(k) || starts.has(k)) continue;
    const similar = [...sets.keys()]
      .filter((s) => s.startsWith(`${read.kind}\u0001`))
      .map((s) => s.slice(s.indexOf('\u0001') + 1))
      .find((s) => s !== read.name && looksLikeSameName(s, read.name));
    if (!similar) continue;
    const at = firstOf(read.beats);
    out.push({
      code: 'name-mismatch', severity: 'error', beatId: at, beatName: nameOf(at),
      message: `Checks the ${what(read.kind)} "${read.name}", which nothing in the story sets, but "${similar}" is set on "${nameOf(firstOf(sets.get(key(read.kind, similar))!))}". If they are meant to be the same, make the spelling match: until then this check never sees it.`,
      detail: { read: read.name, set: similar },
    });
  }

  // Needs the playthroughs: without them nothing is known about who is reached.
  if (played.size > 0) {
    for (const [k, read] of reads) {
      const setters = sets.get(k);
      if (!setters || starts.has(k)) continue;
      const readers = [...read.beats].filter((id) => played.has(id));
      if (readers.length === 0 || [...setters].some((id) => played.has(id))) continue;
      // A Set Variable beat is the likeliest one meant as the setup.
      const ordered = [...setters].sort((a, b) =>
        Number(story.getBeat(b)?.type === 'setVariable') - Number(story.getBeat(a)?.type === 'setVariable')
        || nameOf(a).localeCompare(nameOf(b)));
      const names = ordered.slice(0, 3).map((id) => `"${nameOf(id)}"`).join(', ') + (ordered.length > 3 ? ` and ${ordered.length - 3} more` : '');
      out.push({
        code: 'setup-unreached', severity: 'error', beatId: ordered[0], beatName: nameOf(ordered[0]),
        message: `"${nameOf(firstOf(new Set(readers)))}" checks ${read.name}, but it is only set on ${names}, and no way of playing reaches ${ordered.length === 1 ? 'that beat' : 'those beats'}. It never changes from its start. Link the beat into the story, or set it somewhere players do reach.`,
        detail: { name: read.name, setters: ordered },
      });
    }
  }
  return out;
}

// ============================================================================
// Counters and text
// ============================================================================

function detectCounterText(beat: Beat): StoryWarning[] {
  const out: StoryWarning[] = [];
  const params = beat.getParameters() as any;
  const seen = new Set<string>();
  const add = (message: string, detail: Record<string, any>) => {
    if (seen.has(message)) return;
    seen.add(message);
    out.push({ code: 'counter-text', severity: 'error', beatId: beat.id, beatName: beat.name, message, detail });
  };
  const check = (name: string, operator: string, value: unknown) => {
    const outcome = operator === '!=' ? 'always true' : 'never true';
    add(`Checks the counter "${name}" ${operator} "${String(value)}", but a counter holds a number, so this is ${outcome}. If "${name}" holds text, change the check to Variable.`, { name, value });
  };
  const walk = (node: any): void => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (!node || typeof node !== 'object') return;
    if (node.type === 'counter' && isTextForCounter(node.value ?? node.right)) {
      check(node.variableName || node.variable || node.left || '?', node.operator || '==', node.value ?? node.right);
    }
    if ((node.type === 'setCounter' || node.type === 'incrementCounter') && isTextForCounter(node.value)) {
      add(`Sets the counter "${node.target}" to the text "${node.value}", but a counter holds a number, so it gets 0. If "${node.target}" holds text, use Set Variable.`, { name: node.target, value: node.value });
    }
    for (const k of Object.keys(node)) walk(node[k]);
  };
  walk(params);
  walk((beat as any).requires);
  walk(beat.connections);
  if (beat.type === 'setVariable' && params.type === 'counter' && isTextForCounter(params.value) && !String(params.value).trim().startsWith('=')) {
    add(`Sets the counter "${params.name}" to the text "${params.value}", but a counter holds a number, so it gets 0. If "${params.name}" holds text, change the type to Variable.`, { name: params.name, value: params.value });
  }
  return out;
}

// ============================================================================
// Dialog Tree shape
// ============================================================================

function detectDialogShape(beat: Beat, shownReplies?: ReadonlySet<string>, played?: ReadonlySet<string>, searchLimited?: boolean): StoryWarning[] {
  const out: StoryWarning[] = [];
  const tree = (beat.getParameters() as any).dialogTree;
  const onRoute = new Set<any>();
  const preview = (node: any) => String(node?.text ?? '').trim().slice(0, 50);
  const walk = (node: any): void => {
    if (!node || typeof node !== 'object' || onRoute.has(node)) return;
    onRoute.add(node);
    const choices: any[] = Array.isArray(node.choices) ? node.choices.filter(Boolean) : [];
    const wordless = choices.filter((c) => !c.continue && c.id !== 'auto_continue' && !String(c.text ?? '').trim());
    if (wordless.length > 0) {
      out.push({
        code: 'wordless-reply', severity: 'warn', beatId: beat.id, beatName: beat.name,
        message: `After the line "${preview(node)}", ${wordless.length === 1 ? 'a reply has' : `${wordless.length} replies have`} no words, so players see a blank button. Give ${wordless.length === 1 ? 'it' : 'them'} words, or make ${wordless.length === 1 ? 'it a next line' : 'them next lines'} ("Then another character speaks").`,
        detail: { nodeId: node.id, count: wordless.length },
      });
    }
    for (const c of choices) {
      if (!c.continue && String(c.text ?? '').trim() && !c.target && !c.dialogNode) {
        const onward = (beat as any).connections?.length > 0 || beat.defaultTarget;
        out.push({
          code: 'reply-nowhere', severity: onward ? 'warn' : 'error', beatId: beat.id, beatName: beat.name,
          message: `The reply "${String(c.text).trim().slice(0, 50)}" has no next line and no exit, so picking it ends the scene${onward ? '' : ' and the story stops there'}. Give it an exit or a next line.`,
          detail: { nodeId: node.id, choiceId: c.id },
        });
      }
    }
    const steps = choices.filter((c) => c.continue === true);
    const replies = choices.filter((c) => !c.continue && String(c.text ?? '').trim());
    if (steps.length > 0 && replies.length > 0) {
      const always = steps.some((c) => !(Array.isArray(c.conditions) && c.conditions.length > 0));
      // A reply beside gated lines is often meant as the fallback. It is only a
      // problem when no way of playing ever shows it.
      const unseen = always ? replies : shownReplies && played?.has(beat.id)
        ? replies.filter((c) => !shownReplies.has(`${beat.id}|${c.id}`))
        : [];
      if (unseen.length > 0) {
        const named = unseen.map((c) => `"${String(c.text).trim().slice(0, 40)}"`).join(', ');
        out.push({
          code: 'reply-hidden-by-next-line', severity: 'warn', beatId: beat.id, beatName: beat.name,
          message: always
            ? `After the line "${preview(node)}", the replies ${named} never show: a next line with no condition plays instead.`
            : searchLimited
              ? `After the line "${preview(node)}", the search never saw the replies ${named}: a next line played instead every time. It didn't try every way through this story, so check them.`
              : `After the line "${preview(node)}", the replies ${named} never showed on any way of playing: one of the next lines always plays instead.`,
          detail: { nodeId: node.id, always },
        });
      }
    }
    const firstAlways = steps.findIndex((c) => !(Array.isArray(c.conditions) && c.conditions.length > 0));
    for (const dead of firstAlways >= 0 ? steps.slice(firstAlways + 1) : []) {
      out.push({
        code: 'line-never-plays', severity: 'warn', beatId: beat.id, beatName: beat.name,
        message: `The next line "${preview(dead.dialogNode) || 'without text'}" never plays: the one before it has no condition, so it always plays instead.`,
        detail: { nodeId: node.id, choiceId: dead.id },
      });
    }
    for (const c of choices) walk(c.dialogNode);
  };
  walk(tree);
  return out;
}

// ============================================================================
// Keypad detection
// ============================================================================

/** From `start`, can a player reach an ending or a stop without passing `avoid`? */
function canLeaveWithout(start: string, avoid: string, story: Story): boolean {
  const seen = new Set<string>([avoid, start]);
  const todo = [start];
  while (todo.length > 0) {
    const beat = story.getBeat(todo.pop()!);
    if (!beat) continue;
    const links = analysisLinks(beat);
    if (beat.type === 'endScreen' || beat.type === 'aiSummary' || links.length === 0) return true;
    for (const c of links) if (!seen.has(c.targetId)) { seen.add(c.targetId); todo.push(c.targetId); }
  }
  return false;
}

function detectKeypadWarnings(
  keypad: Beat,
  story: Story,
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
    // Coming back round is only a trap if nothing else leads out: a wrong code
    // that returns to a menu with other ways on leaves the keypad optional.
    if (loops.cycles && !canLeaveWithout(failTarget, keypad.id, story)) {
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

  // A restart resets state — it is not a way round a loop.
  const conns = analysisLinks(beat).filter((c) => c.role !== 'restart');
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
    // Choices, auto-advance, requirement fallbacks, timer and QR targets.
    for (const c of analysisLinks(b)) {
      if (c.role === 'restart') continue; // state is reset: not an ancestor
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
  evidence: StoryEvidence,
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
  for (const stateBefore of evidence.arrivalsAt(beat.id)) {
    totalPathsToBeat++;
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
        `${violatingPaths} of ${totalPathsToBeat} ways of playing reach this beat ` +
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
  if (t === 'inventory') return `${c.checkType === 'notHas' || c.operator === 'not' || c.operator === '!=' ? 'lacks' : 'has'} ${c.item || '?'}`;
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
      return operator === '!=' || operator === 'not' || (condition as any).checkType === 'notHas' ? !has : has;
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
