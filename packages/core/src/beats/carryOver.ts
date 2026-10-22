/**
 * Carry what a newer ASAPS wrote through an older one (2026-10-21).
 *
 * Every beat type rebuilt its data from the fields it knows, so a teammate on
 * an older version silently removed whatever a newer version had added on the
 * next save — a group's dialogs lost every "then another character speaks"
 * step that way. Now a beat remembers the parameters and top-level fields it
 * was given but does not know, and writes them back unchanged.
 *
 * "Does not know" = the beat type never read it while being built or updated
 * (recorded with a read-tracking view of the data), does not output it, and
 * the schema does not list it for the type. So a field this version knows
 * but leaves out when empty never comes back from old data.
 */
import beatDefinitions from '../../../../beat-definitions/core-beats.json';

const SCHEMA_PARAMS: Record<string, Set<string>> = Object.fromEntries(
  Object.entries(((beatDefinitions as any).beatTypes ?? {}) as Record<string, any>).map(([type, def]) => [
    type,
    new Set(Object.keys((def && typeof def.parameters === 'object' && def.parameters) || {})),
  ]),
);

export function schemaKnowsParameter(type: string, key: string): boolean {
  return SCHEMA_PARAMS[type]?.has(key) ?? false;
}

/**
 * A view of `obj` that records every key read from it (get, `in`, and — with
 * `spreads` — a spread or Object.keys, which counts every key as read).
 * Top-level config is tracked without spreads: a beat that spreads its
 * config to pass it on (ChooseCharacter) doesn't know every field, and
 * Beat.toJSON writes every top-level field it knows anyway.
 */
export function trackReads<T extends object>(obj: T, seen: Set<string>, spreads = true): T {
  // Without `spreads`: a spread copies every key — it checks each one
  // (getOwnPropertyDescriptor) and then reads it. Such a read is skipped;
  // a plain `config.x` read (no check before it) still counts.
  const copying = new Set<string>();
  return new Proxy(obj, {
    get(t, k, r) {
      if (typeof k === 'string') {
        if (copying.has(k)) copying.delete(k);
        else seen.add(k);
      }
      return Reflect.get(t, k, r);
    },
    has(t, k) { if (typeof k === 'string') seen.add(k); return Reflect.has(t, k); },
    ownKeys(t) {
      const keys = Reflect.ownKeys(t);
      if (spreads) for (const k of keys) if (typeof k === 'string') seen.add(k);
      return keys;
    },
    getOwnPropertyDescriptor(t, k) {
      if (typeof k === 'string') {
        if (spreads) seen.add(k);
        else copying.add(k);
      }
      return Reflect.getOwnPropertyDescriptor(t, k);
    },
  });
}

/** Swap a tracking view stored on the beat back for the plain object (a Proxy must not escape). */
export function untrack(target: Record<string, any>, views: Array<[object, object]>): void {
  for (const key of Object.keys(target)) {
    for (const [view, plain] of views) if (target[key] === view) target[key] = plain;
  }
}

export interface CarryState {
  /** The parameters given so far (merged over updates). */
  params: Record<string, unknown>;
  /** Parameter keys the beat type read. */
  readParams: Set<string>;
  /** Top-level fields given at creation (minus parameters). */
  top: Record<string, unknown>;
  /** Top-level keys the beat type read. */
  readTop: Set<string>;
}

/** Parameters to write back unchanged: given, never read, not output, not in the schema. */
export function carriedParameters(state: CarryState | undefined, type: string, output: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!state) return out;
  for (const [k, v] of Object.entries(state.params)) {
    if (v === undefined || k in output || state.readParams.has(k) || schemaKnowsParameter(type, k)) continue;
    out[k] = v;
  }
  return out;
}

/** Top-level fields to write back unchanged. */
export function carriedTopFields(state: CarryState | undefined, output: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!state) return out;
  for (const [k, v] of Object.entries(state.top)) {
    if (v === undefined || k === 'parameters' || k in output || state.readTop.has(k)) continue;
    out[k] = v;
  }
  return out;
}
