/**
 * Character dossier — natural-language synthesis of a Character record + its
 * runtime state (counters / variables / flags) into a string the LLM can
 * consume as context.
 *
 * Layer 5 of the rich-character roadmap (Step 2 work). Today this is a thin
 * synthesis from authored data plus character-scoped state. Future layers
 * (3 — affect, 3b — goals, 4 — narrative memory) will extend this without
 * changing the call sites: the dossier function adds new sections as the
 * character data grows.
 *
 * Mode A "re-anchor" policy is the default: the dossier is rebuilt fresh on
 * every LLM turn from the structured state, so the LLM cannot drift away
 * from the character's authored identity. Reflection-memory accumulation
 * (Mode B) is a follow-up after the affect layers land.
 */

interface CharacterLike {
  id: string;
  name?: string;
  displayName?: string;
  description?: string;
  tags?: string[];
  role?: string;
}

interface CharacterScopedState {
  counters: Record<string, number>;
  variables: Record<string, any>;
  flags: Record<string, boolean>;
}

export interface BuildDossierOptions {
  /** Optional character-scoped state from StoryContext.getCharacterState(charId).
   * When omitted, the dossier reflects only authored data. */
  state?: CharacterScopedState;
  /** When true, prepends a one-line "DO NOT BREAK CHARACTER" reminder. Default true. */
  includeAnchorReminder?: boolean;
  /** Override the heading text. Default "CHARACTER DOSSIER". */
  heading?: string;
}

/**
 * Build a natural-language dossier for `character` that an LLM can use as
 * grounding context. Returns an empty string when there's nothing useful to
 * say (no description, no tags, no state) — callers can use that as a signal
 * to skip the section entirely.
 */
export function buildDossier(
  character: CharacterLike | null | undefined,
  options: BuildDossierOptions = {},
): string {
  if (!character) return '';

  const lines: string[] = [];
  const heading = options.heading || 'CHARACTER DOSSIER';
  const displayName = character.displayName || character.name || character.id;

  // Identity line — always present when a character is provided.
  const roleSuffix = character.role && character.role !== 'npc' ? ` (${character.role})` : '';
  lines.push(`Name: ${displayName}${roleSuffix}`);

  // Description — the authored personality / backstory.
  if (character.description && character.description.trim()) {
    lines.push(`Description: ${character.description.trim()}`);
  }

  // Tags — short hints. Useful for the LLM but only when meaningful.
  if (character.tags && character.tags.length > 0) {
    lines.push(`Tags: ${character.tags.join(', ')}`);
  }

  // Character-scoped state — only emit sections that have content. Counters,
  // variables, and flags map to a "current state" block the LLM can read.
  if (options.state) {
    const stateLines = formatStateBlock(options.state);
    if (stateLines.length > 0) {
      lines.push('Current state:');
      for (const line of stateLines) {
        lines.push(`  ${line}`);
      }
    }
  }

  // If we only have the name line and nothing else of substance, skip the
  // dossier entirely — there's nothing for the LLM to anchor on.
  if (lines.length === 1) return '';

  const out: string[] = [];
  if (options.includeAnchorReminder !== false) {
    out.push(`${heading} — stay in character; the facts below are canonical:`);
  } else {
    out.push(`${heading}:`);
  }
  out.push(...lines);
  return out.join('\n');
}

/**
 * Format counters / variables / flags into a list of "key: value" lines.
 * Skips empty maps so the dossier stays tight.
 */
function formatStateBlock(state: CharacterScopedState): string[] {
  const lines: string[] = [];

  const counterKeys = Object.keys(state.counters || {}).sort();
  for (const key of counterKeys) {
    lines.push(`${key}: ${state.counters[key]}`);
  }

  const flagKeys = Object.keys(state.flags || {}).sort();
  for (const key of flagKeys) {
    if (state.flags[key]) lines.push(`${key}: yes`);
  }

  const varKeys = Object.keys(state.variables || {}).sort();
  for (const key of varKeys) {
    const v = state.variables[key];
    if (v === undefined || v === null || v === '') continue;
    lines.push(`${key}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
  }

  return lines;
}

/**
 * Convenience: resolve a characterRef against a story's characters and a
 * StoryContext, then build the dossier. Returns empty string when the ref
 * doesn't resolve so callers can fall back to authored npcPersonality alone.
 */
export function buildDossierForRef(
  characterRef: string | null | undefined,
  characters: ReadonlyArray<CharacterLike> | null | undefined,
  contextLike: { getCharacterState?: (ref: string) => CharacterScopedState } | null | undefined,
  options: BuildDossierOptions = {},
): string {
  if (!characterRef || !characters) return '';
  const character = characters.find((c) => c.id === characterRef) || null;
  if (!character) return '';
  const state = contextLike?.getCharacterState?.(characterRef);
  return buildDossier(character, { ...options, state });
}
