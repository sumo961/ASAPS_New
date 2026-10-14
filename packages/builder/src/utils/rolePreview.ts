/**
 * Editor preview of cast roles: shows `${@role…}` placeholders and '@role'
 * speakers as the character the author is previewing (Preview as). Used by
 * the Visual Editor on the content it draws — never written to the beat.
 */
import { rolePlaceholderText } from '@asaps/core';

type Holder = { name?: string; displayName?: string; pronouns?: unknown } | null | undefined;

const PLACEHOLDER = /\$\{\s*@([A-Za-z0-9_-]+)(?:\.([A-Za-z]+))?\s*\}/g;
const WHOLE = /^\s*@([A-Za-z0-9_-]+)\s*$/;

/** Roles a value refers to ('@role' strings and ${@role…} placeholders), deep. */
export function rolesReferencedIn(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (typeof value === 'string') {
    const whole = WHOLE.exec(value);
    if (whole) out.add(whole[1]);
    for (const m of value.matchAll(PLACEHOLDER)) out.add(m[1]);
  } else if (Array.isArray(value)) {
    value.forEach((v) => rolesReferencedIn(v, out));
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) rolesReferencedIn(v, out);
  }
  return out;
}

/** A copy of `value` with role references shown as `holderFor(role)`; unknown roles stay visible. */
export function previewRoles<T>(value: T, holderFor: (roleId: string) => Holder): T {
  const visit = (v: any): any => {
    if (typeof v === 'string') {
      const whole = WHOLE.exec(v);
      if (whole) return rolePlaceholderText(holderFor(whole[1]), 'name') ?? v;
      if (!v.includes('${')) return v;
      return v.replace(PLACEHOLDER, (match, role: string, key?: string) => rolePlaceholderText(holderFor(role), key) ?? match);
    }
    if (Array.isArray(v)) return v.map(visit);
    if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
      const out: any = {};
      for (const k of Object.keys(v)) out[k] = visit(v[k]);
      return out;
    }
    return v;
  };
  return visit(value);
}

/** Where the Preview's current holder of a role came from (Debug → Roles). */
export type RoleHolderSource = 'preview' | 'random' | 'story' | 'debug';

/**
 * Which roles the Preview Window casts from the editor's "Preview as" pick
 * when a run starts. Only roles the story hasn't decided yet:
 * - From a beat: every role without a holder, plus random and fixed roles
 *   (their start-of-run holder is not a decision of the story).
 * - From the beginning: only roles the story never casts itself and that
 *   aren't random — the story's own pick and draw are what is being tested.
 * A role a "Start as if…" preset already set is left alone.
 */
export function rolesToSeedAtStart(opts: {
  roles: ReadonlyArray<{ id: string; candidates: string[]; selection?: string }>;
  previewCasting: Readonly<Record<string, string>> | undefined;
  fromBeginning: boolean;
  /** Roles some beat in the story casts (Choose Your Character, Cast Role). */
  castByStory: ReadonlySet<string>;
  /** Roles already holding someone, and how (from the run's start state). */
  alreadyCast: (roleId: string) => boolean;
}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const role of opts.roles) {
    const pick = opts.previewCasting?.[role.id];
    if (!pick || !role.candidates.includes(pick)) continue;
    // Random and fixed roles get a holder at the start of every run; that
    // is not a decision of the story, so Preview as may stand in for it.
    const setAtStart = role.selection === 'random' || role.selection === 'fixed';
    if (opts.fromBeginning && (role.selection === 'random' || opts.castByStory.has(role.id))) continue;
    if (opts.alreadyCast(role.id) && !setAtStart) continue;
    out[role.id] = pick;
  }
  return out;
}
