/**
 * Effects, conditions and requirements — validation, compact descriptions
 * and the prompt reference, from ONE place (Co-Designer wiring proposals).
 *
 * Sources of truth:
 *  - effect types: core `EFFECT_TYPES` (the engine's list). `EFFECT_SPECS`
 *    is typed `Record<EffectType, …>`, so a new engine effect type is a
 *    compile error here until it is described.
 *  - condition types and their required / optional fields and aliases:
 *    beat-definitions/core-beats.json `conditionTypes` (the schema-driven
 *    normalize pipeline reads the same table).
 *
 * Validation mirrors what the ENGINE does, so a proposal can never apply as
 * a silent no-op: StoryContext.applyEffect ignores e.g. an addSentiment
 * without an emotion or a zero strength, and we reject those here instead.
 */

import { EFFECT_TYPES, type EffectType } from '@asaps/core';
import beatDefinitions from '../../../../beat-definitions/core-beats.json';

type Json = Record<string, unknown>;

interface EffectSpec {
  /** Fields that must be present (non-empty strings / finite numbers). */
  required: string[];
  optional: string[];
  /** Numeric fields of which at least one must be a non-zero number. */
  nonZeroOneOf?: string[];
  /** One line for the prompt: what `target` means + the fields. */
  summary: string;
}

const NUMERIC_FIELDS = new Set([
  'strengthDelta', 'valenceDelta', 'arousalDelta', 'emotionDelta', 'reflectionSalience',
]);
const BOOLEAN_FIELDS = new Set(['suppressEmotion', 'suppressSeed']);

export const EFFECT_SPECS: Record<EffectType, EffectSpec> = {
  setVariable: { required: ['target'], optional: ['value'], summary: 'target = variable name, value = new value' },
  addInventory: { required: ['target'], optional: ['character'], summary: 'target = item name; character? = owner (default the player)' },
  removeInventory: { required: ['target'], optional: ['character'], summary: 'target = item name; character? = owner' },
  incrementCounter: { required: ['target'], optional: ['value', 'character'], summary: 'target = counter name, value = delta (default 1, may be negative); character? = owner of a per-character counter' },
  setCounter: { required: ['target', 'value'], optional: ['character'], summary: 'target = counter name, value = new value; character? = owner' },
  nudgeMood: { required: ['target'], optional: ['valenceDelta', 'arousalDelta'], nonZeroOneOf: ['valenceDelta', 'arousalDelta'], summary: 'target = character; valenceDelta / arousalDelta in -1..1 (at least one non-zero)' },
  addSentiment: { required: ['target', 'sentimentTarget', 'sentimentEmotion', 'strengthDelta'], optional: [], nonZeroOneOf: ['strengthDelta'], summary: "target = character who feels it; sentimentTarget = whom it is about (character id or 'player'); sentimentEmotion e.g. 'trust'; strengthDelta non-zero, e.g. 0.2" },
  fireEmotion: { required: ['target', 'emotion', 'emotionDelta'], optional: [], nonZeroOneOf: ['emotionDelta'], summary: "target = character; emotion e.g. 'fear'; emotionDelta non-zero, e.g. 0.4" },
  addReflection: { required: ['target', 'reflectionText'], optional: ['reflectionSalience'], summary: 'target = character; reflectionText; reflectionSalience? 0..1' },
  setGoalStatus: { required: ['target', 'goalId', 'goalStatus'], optional: ['suppressEmotion'], summary: "target = character; goalId; goalStatus 'open'|'met'|'failed'|'abandoned'" },
  setCharacterVariant: { required: ['target', 'variantId'], optional: ['suppressSeed'], summary: 'target = character; variantId' },
  bookmarkAffectState: { required: ['bookmarkName'], optional: ['target', 'scope'], summary: "bookmarkName; scope? 'all'|'character' (then target = character)" },
  playSound: { required: ['target'], optional: ['value'], summary: 'target = sound asset id / preset / URL; value? = volume 0..1' },
};

const GOAL_STATUSES = new Set(['open', 'met', 'failed', 'abandoned']);

interface ConditionTypeSpec {
  required?: string[];
  optional?: string[];
  aliases?: Record<string, string[]>;
  description?: string;
}
const CONDITION_TYPES: Record<string, ConditionTypeSpec> = Object.fromEntries(
  Object.entries(((beatDefinitions as any).conditionTypes ?? {}) as Record<string, ConditionTypeSpec>)
    .filter(([k]) => k !== '_meta'),
);
const OPERATORS = new Set<string>(((beatDefinitions as any).conditionTypes?._meta?.operators ?? []) as string[]);

export type Normalized<T> = { ok: true; value: T } | { ok: false; problem: string };

function present(v: unknown): boolean {
  if (typeof v === 'string') return v.trim().length > 0;
  if (typeof v === 'number') return Number.isFinite(v);
  return v !== undefined && v !== null;
}

/** Validate + trim one effect to the fields its type uses. */
export function normalizeEffect(raw: unknown): Normalized<Json> {
  if (!raw || typeof raw !== 'object') return { ok: false, problem: 'effect is not an object' };
  const r = raw as Json;
  const type = r.type as EffectType;
  if (!(EFFECT_TYPES as readonly string[]).includes(type as string)) {
    return { ok: false, problem: `unknown effect type "${String(r.type)}"` };
  }
  const spec = EFFECT_SPECS[type];
  const out: Json = { type };
  for (const f of [...spec.required, ...spec.optional]) {
    if (r[f] === undefined) continue;
    if (NUMERIC_FIELDS.has(f)) {
      const n = Number(r[f]);
      if (!Number.isFinite(n)) return { ok: false, problem: `${type}: ${f} must be a number` };
      out[f] = n;
    } else if (BOOLEAN_FIELDS.has(f)) {
      out[f] = !!r[f];
    } else {
      out[f] = r[f];
    }
  }
  for (const f of spec.required) {
    if (!present(out[f])) return { ok: false, problem: `${type} needs ${f}` };
  }
  if ((type === 'incrementCounter' || type === 'setCounter') && out.value !== undefined) {
    const n = Number(out.value);
    if (!Number.isFinite(n)) return { ok: false, problem: `${type}: value must be a number` };
    out.value = n;
  }
  if (spec.nonZeroOneOf && !spec.nonZeroOneOf.some((f) => typeof out[f] === 'number' && out[f] !== 0)) {
    return { ok: false, problem: `${type} needs a non-zero ${spec.nonZeroOneOf.join(' or ')} (the engine ignores zero)` };
  }
  if (type === 'setGoalStatus' && !GOAL_STATUSES.has(String(out.goalStatus))) {
    return { ok: false, problem: `setGoalStatus: goalStatus must be open, met, failed or abandoned` };
  }
  if (type === 'bookmarkAffectState' && out.scope !== undefined && out.scope !== 'all' && out.scope !== 'character') {
    return { ok: false, problem: `bookmarkAffectState: scope must be 'all' or 'character'` };
  }
  return { ok: true, value: out };
}

/** Validate one condition against the schema's conditionTypes table (aliases applied). */
export function normalizeCondition(raw: unknown): Normalized<Json> {
  if (!raw || typeof raw !== 'object') return { ok: false, problem: 'condition is not an object' };
  const r = raw as Json;
  const type = String(r.type ?? '');
  const spec = CONDITION_TYPES[type];
  if (!spec) return { ok: false, problem: `unknown condition type "${type || '(missing)'}"` };
  const out: Json = { type };
  const allowed = new Set([...(spec.required ?? []), ...(spec.optional ?? [])]);
  for (const f of allowed) {
    if (r[f] !== undefined) {
      out[f] = r[f];
      continue;
    }
    for (const alias of spec.aliases?.[f] ?? []) {
      if (r[alias] !== undefined) { out[f] = r[alias]; break; }
    }
  }
  for (const f of spec.required ?? []) {
    if (!present(out[f])) return { ok: false, problem: `${type} condition needs ${f}` };
  }
  if (out.operator !== undefined && OPERATORS.size > 0 && !OPERATORS.has(String(out.operator))) {
    return { ok: false, problem: `${type} condition: operator "${String(out.operator)}" is not one of ${[...OPERATORS].join(' ')}` };
  }
  return { ok: true, value: out };
}

/** Validate a list; the first problem wins (the proposal is all-or-nothing). */
export function normalizeList(raw: unknown, one: (x: unknown) => Normalized<Json>): Normalized<Json[]> {
  if (!Array.isArray(raw)) return { ok: false, problem: 'expected a list' };
  const out: Json[] = [];
  for (let i = 0; i < raw.length; i++) {
    const n = one(raw[i]);
    if (!n.ok) return { ok: false, problem: `#${i + 1}: ${n.problem}` };
    out.push(n.value);
  }
  return { ok: true, value: out };
}

/** A beat requirement: { condition, explanation, severity?, fallbackTarget? }. */
export function normalizeRequirement(raw: unknown): Normalized<Json> {
  if (!raw || typeof raw !== 'object') return { ok: false, problem: 'requirement is not an object' };
  const r = raw as Json;
  const cond = normalizeCondition(r.condition);
  if (!cond.ok) return { ok: false, problem: `condition: ${cond.problem}` };
  const out: Json = {
    condition: cond.value,
    explanation: typeof r.explanation === 'string' ? r.explanation.trim() : '',
  };
  if (r.severity === 'warn' || r.severity === 'error') out.severity = r.severity;
  if (typeof r.fallbackTarget === 'string' && r.fallbackTarget.trim()) out.fallbackTarget = r.fallbackTarget.trim();
  return { ok: true, value: out };
}

// ---------------------------------------------------------------------------
// Compact human descriptions (digest, proposal card, apply results)
// ---------------------------------------------------------------------------

function signed(n: unknown): string {
  const v = Number(n);
  return Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${v}` : String(n);
}

export function describeEffect(e: Json): string {
  const who = e.character ? ` (${String(e.character)})` : '';
  switch (e.type) {
    case 'setVariable': return `set ${String(e.target)} = ${JSON.stringify(e.value)}`;
    case 'addInventory': return `give ${String(e.target)}${who}`;
    case 'removeInventory': return `take ${String(e.target)}${who}`;
    case 'incrementCounter': return `${String(e.target)} ${signed(e.value ?? 1)}${who}`;
    case 'setCounter': return `${String(e.target)} = ${String(e.value)}${who}`;
    case 'nudgeMood': return `${String(e.target)} mood${e.valenceDelta ? ` valence ${signed(e.valenceDelta)}` : ''}${e.arousalDelta ? ` arousal ${signed(e.arousalDelta)}` : ''}`;
    case 'addSentiment': return `${String(e.target)} ${String(e.sentimentEmotion)} toward ${String(e.sentimentTarget)} ${signed(e.strengthDelta)}`;
    case 'fireEmotion': return `${String(e.target)} feels ${String(e.emotion)} ${signed(e.emotionDelta)}`;
    case 'addReflection': return `${String(e.target)} reflects "${String(e.reflectionText).slice(0, 40)}"`;
    case 'setGoalStatus': return `${String(e.target)} goal ${String(e.goalId)} → ${String(e.goalStatus)}`;
    case 'setCharacterVariant': return `${String(e.target)} becomes ${String(e.variantId)}`;
    case 'bookmarkAffectState': return `bookmark "${String(e.bookmarkName)}"`;
    case 'playSound': return `play ${String(e.target)}`;
    default: return String(e.type);
  }
}

export function describeCondition(c: Json): string {
  const op = c.operator !== undefined ? ` ${String(c.operator)}` : '';
  const val = c.value !== undefined ? ` ${JSON.stringify(c.value)}` : '';
  switch (c.type) {
    case 'variable':
    case 'counter': return `${String(c.variableName)}${op}${val}`;
    case 'counterCompare': return `${String(c.counter1)}${op} ${String(c.counter2)}`;
    case 'inventory': return `${c.checkType === 'lacks' ? 'lacks' : 'has'} ${String(c.item)}${c.character ? ` (${String(c.character)})` : ''}`;
    case 'visitedBeat': return `${c.operator === 'not' || c.operator === '!=' ? 'not visited' : 'visited'} ${String(c.beatId)}`;
    case 'sentiment': return `${String(c.character)} ${String(c.sentimentEmotion ?? 'sentiment')} toward ${String(c.sentimentTarget)}${op}${val}`;
    case 'emotion': return `${String(c.character)} ${String(c.emotionName)}${op}${val}`;
    case 'mood': return `${String(c.character)} ${String(c.moodAxis)}${op}${val}`;
    case 'trait': return `${String(c.character)} ${String(c.traitName)}${op}${val}`;
    default: return `${String(c.type)}${op}${val}`;
  }
}

// ---------------------------------------------------------------------------
// Prompt reference (generated, so it cannot drift from the engine / schema)
// ---------------------------------------------------------------------------

export function wiringPromptReference(): string {
  const effects = (EFFECT_TYPES as readonly EffectType[])
    .map((t) => `  - ${t}: ${EFFECT_SPECS[t].summary}`)
    .join('\n');
  const conditions = Object.entries(CONDITION_TYPES)
    .map(([t, s]) => {
      const opt = (s.optional ?? []).length ? `; optional ${(s.optional ?? []).join(', ')}` : '';
      return `  - ${t}: ${(s.required ?? []).join(', ')}${opt}`;
    })
    .join('\n');
  return `EFFECT TYPES ({ "type": …, …fields }):
${effects}
CONDITION TYPES ({ "type": …, …required fields }; operators ${[...OPERATORS].join(' ')}):
${conditions}`;
}
