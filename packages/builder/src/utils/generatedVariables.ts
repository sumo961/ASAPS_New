import { normalizeRoles } from '@asaps/core';
import type { GlobalSettings } from '../storage/types';

/**
 * Merge a generated story's top-level `variables[]` ({ name, initialValue,
 * description }) into `globalSettings.variables` ({ name, type, defaultValue,
 * description }) so the authoring surfaces (Variables panel, Inspector,
 * state-preset editor) see them.
 *
 * Without this the AI generator's declared variables were silently dropped
 * on import — the story still played (StoryContext creates a variable on
 * first write) but the editor was blind to them. Character counters need no
 * equivalent step: they ride on `story.characters[].counters[]` and are
 * seeded at runtime.
 *
 * `type` is inferred from `initialValue`. Existing entries (by name) win —
 * never clobbers an author's prior definition. Pure; the caller owns the
 * state/ref write. Returns the merged settings, or `null` when there is
 * nothing to add (so callers can skip the state update entirely).
 */
export function mergeGeneratedVariables(
  base: GlobalSettings,
  storyVariables: unknown,
): GlobalSettings | null {
  if (!Array.isArray(storyVariables) || storyVariables.length === 0) return null;

  const inferType = (v: unknown): 'string' | 'number' | 'boolean' =>
    typeof v === 'boolean' ? 'boolean' : typeof v === 'number' ? 'number' : 'string';

  const generated = storyVariables
    .filter(
      (v: any): v is { name: string; initialValue?: unknown; description?: unknown; keepOnRestart?: unknown } =>
        v && typeof v.name === 'string' && v.name.trim().length > 0,
    )
    .map((v) => {
      const t = inferType(v.initialValue);
      return {
        name: v.name.trim(),
        type: t,
        defaultValue:
          v.initialValue ?? (t === 'boolean' ? false : t === 'number' ? 0 : ''),
        description: typeof v.description === 'string' ? v.description : undefined,
        ...(v.keepOnRestart === true ? { keepOnRestart: true } : {}),
      };
    });

  if (generated.length === 0) return null;

  const existing = Array.isArray((base as any).variables)
    ? ((base as any).variables as Array<{ name: string }>)
    : [];
  const byName = new Map<string, unknown>();
  for (const v of existing) byName.set(v.name, v);
  for (const v of generated) if (!byName.has(v.name)) byName.set(v.name, v);

  return { ...base, variables: Array.from(byName.values()) } as GlobalSettings;
}

/**
 * A generated story's top-level `roles[]` (cast roles) become
 * `globalSettings.roles`. A generated story is a new project, so its roles
 * replace any the previous project had; none generated ⇒ none kept.
 * Returns null when nothing changes.
 */
export function applyGeneratedRoles(
  base: GlobalSettings,
  storyRoles: unknown,
): GlobalSettings | null {
  const roles = normalizeRoles(storyRoles);
  const had = Array.isArray((base as any).roles) && (base as any).roles.length > 0;
  if (roles.length === 0 && !had) return null;
  return { ...base, roles } as GlobalSettings;
}

/**
 * Roles a generated story uses without declaring them, inferred from how
 * it uses them: a Choose Your Character beat names its role and its
 * characters; a castRole effect names a role and a character. Only roles
 * with at least one such character are inferred — an "@id" seen only in
 * text stays undeclared and the review flags it. Declared roles win.
 */
export function inferUndeclaredRoles(story: { beats?: any[]; roles?: unknown }): Array<{ id: string; candidates: string[]; selection: 'cast' }> {
  const declared = new Set(normalizeRoles(story.roles).map((r) => r.id));
  const found = new Map<string, Set<string>>();
  const add = (role: unknown, character: unknown) => {
    if (typeof role !== 'string' || !role.trim()) return;
    const id = role.trim().replace(/^@/, '');
    if (declared.has(id)) return;
    if (!found.has(id)) found.set(id, new Set());
    if (typeof character === 'string' && character.trim()) found.get(id)!.add(character.trim());
  };
  const walk = (v: any) => {
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (!v || typeof v !== 'object') return;
    if (v.type === 'castRole') add(v.target, v.character);
    for (const k of Object.keys(v)) walk(v[k]);
  };
  for (const beat of story.beats ?? []) {
    const params = beat?.parameters ?? {};
    if (beat?.type === 'chooseCharacter') {
      const role = params.role ?? 'player';
      add(role, undefined);
      for (const c of Array.isArray(params.choices) ? params.choices : []) add(role, c?.character);
    }
    walk(params);
    walk(beat?.connections);
  }
  return [...found.entries()]
    .filter(([, chars]) => chars.size > 0)
    .map(([id, chars]) => ({ id, candidates: [...chars], selection: 'cast' as const }));
}
