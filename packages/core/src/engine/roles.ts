/**
 * Character roles (recastable cast) — docs/Character-Roles-Design.md.
 *
 * A role is a part in the story ("the confidant", "the player") that one of
 * several characters fills at runtime. Stories refer to it as `@confidant`
 * wherever a character is expected, and as `${@confidant.name}` /
 * `${@confidant.they}` in text. State (counters, feelings, inventory of a
 * non-player role) stays on the character who holds the role at the moment.
 *
 * Roles are declared in Project Settings (`settings.roles`), beside the
 * story variables, so they travel to every host with the settings.
 */

export type RoleSelection = 'cast' | 'random' | 'fixed';

export interface CastRole {
  /** Referenced as '@id'. */
  id: string;
  /** Author-facing name, e.g. 'The confidant'. */
  name?: string;
  /** What the role does in the story (for authors and AI). */
  description?: string;
  /** Character ids that may fill it. */
  candidates: string[];
  /** Holder before anything casts it. Falls back to the first candidate. */
  defaultCharacterId?: string;
  /**
   * cast   — a castRole effect or a Choose your character beat fills it
   * random — drawn from the candidates at story start
   * fixed  — always the default holder
   */
  selection?: RoleSelection;
  /** May a castRole replace a holder that is already cast? Default false. */
  recastable?: boolean;
  /** Keep the holder across an in-story restart. */
  keepOnRestart?: boolean;
}

/** The role id that makes the implicit 'player' key follow the chosen protagonist. */
export const PLAYER_ROLE_ID = 'player';

/** The roles declared in a story's settings, cleaned up. */
export function normalizeRoles(raw: unknown): CastRole[] {
  if (!Array.isArray(raw)) return [];
  const out: CastRole[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const id = typeof r?.id === 'string' ? stripRolePrefix(r.id.trim()) : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const candidates = Array.isArray(r.candidates)
      ? r.candidates.filter((c: unknown): c is string => typeof c === 'string' && c.length > 0)
      : [];
    out.push({
      ...r,
      id,
      candidates,
      selection: r.selection === 'random' || r.selection === 'fixed' ? r.selection : 'cast',
    });
  }
  return out;
}

/** True for '@confidant'. */
export function isRoleRef(ref: unknown): ref is string {
  return typeof ref === 'string' && ref.length > 1 && ref.startsWith('@');
}

/** '@confidant' → 'confidant'; anything else unchanged. */
export function stripRolePrefix(ref: string): string {
  return ref.startsWith('@') ? ref.slice(1) : ref;
}

/** Who fills a role when nothing has cast it: the default, else the first candidate. */
export function fallbackHolder(role: CastRole): string | null {
  return role.defaultCharacterId || role.candidates[0] || null;
}

// ---------------------------------------------------------------------------
// Pronouns
// ---------------------------------------------------------------------------

export interface PronounSet {
  they: string;
  them: string;
  their: string;
  theirs: string;
  themself: string;
  /** Agreement helpers: 'is'/'are', 'has'/'have', 'was'/'were'. */
  is: string;
  has: string;
  was: string;
}

export const PRONOUN_PRESETS: Record<'she' | 'he' | 'they', PronounSet> = {
  she: { they: 'she', them: 'her', their: 'her', theirs: 'hers', themself: 'herself', is: 'is', has: 'has', was: 'was' },
  he: { they: 'he', them: 'him', their: 'his', theirs: 'his', themself: 'himself', is: 'is', has: 'has', was: 'was' },
  they: { they: 'they', them: 'them', their: 'their', theirs: 'theirs', themself: 'themself', is: 'are', has: 'have', was: 'were' },
};

export const PRONOUN_KEYS = ['they', 'them', 'their', 'theirs', 'themself', 'is', 'has', 'was'] as const;
export type PronounKey = (typeof PRONOUN_KEYS)[number];

/**
 * A character's pronouns: `pronouns` is 'she' | 'he' | 'they' or a custom
 * set (missing forms fall back to they/them). No pronouns ⇒ they/them.
 */
export function pronounSetFor(character: { pronouns?: unknown } | null | undefined): PronounSet {
  const p = character?.pronouns as any;
  if (typeof p === 'string' && p in PRONOUN_PRESETS) return PRONOUN_PRESETS[p as keyof typeof PRONOUN_PRESETS];
  if (p && typeof p === 'object') {
    const base = PRONOUN_PRESETS.they;
    const out = { ...base } as PronounSet;
    for (const k of PRONOUN_KEYS) {
      if (typeof p[k] === 'string' && p[k].trim()) out[k] = p[k].trim();
    }
    // A custom singular set ("xe") without agreement forms reads as singular.
    if (typeof p.they === 'string' && p.they.trim().toLowerCase() !== 'they') {
      if (!p.is) out.is = 'is';
      if (!p.has) out.has = 'has';
      if (!p.was) out.was = 'was';
    }
    return out;
  }
  return PRONOUN_PRESETS.they;
}

/**
 * The text a `${@role.key}` placeholder stands for, given the holder.
 * `key` is name (default) | displayName | a pronoun key; a capitalised key
 * ('They', 'Their') capitalises the result. Returns undefined for an
 * unknown key so the caller can leave the placeholder visible.
 */
export function rolePlaceholderText(
  holder: { name?: string; displayName?: string; pronouns?: unknown } | null | undefined,
  key: string | undefined,
): string | undefined {
  if (!holder) return undefined;
  const raw = key || 'name';
  const lower = raw.toLowerCase();
  let text: string | undefined;
  if (lower === 'name' || lower === 'displayname') {
    text = holder.displayName || holder.name;
  } else if ((PRONOUN_KEYS as readonly string[]).includes(lower)) {
    text = pronounSetFor(holder)[lower as PronounKey];
  }
  if (text === undefined) return undefined;
  const capitalise = raw[0] !== raw[0].toLowerCase();
  return capitalise ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}
