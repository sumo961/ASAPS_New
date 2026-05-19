import type { GlobalSettings } from '../components/settings/GlobalSettingsInspector';

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
      (v: any): v is { name: string; initialValue?: unknown; description?: unknown } =>
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
