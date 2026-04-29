import { interactionsForCharacter } from './narrativeMemory';

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

interface MoodLike {
  valence: number;
  arousal: number;
}

interface SentimentLike {
  toEntityRef: string;
  emotion: string;
  strength: number;
}

interface BeatLike {
  id: string;
  type?: string;
  name?: string;
  speaker?: string;
  characterRef?: string;
  parameters?: Record<string, any>;
}

interface ChoiceRecordLike {
  beatId: string;
  beatName?: string;
  beatType?: string;
  choiceText: string;
  choiceContext?: string;
  timestamp: number;
}

export interface DossierInteraction {
  /** Beat name (or id) where the interaction happened. */
  beatName: string;
  /** Optional one-line summary; when omitted, only the beat name is shown. */
  summary?: string;
}

export interface BuildDossierOptions {
  /** Optional character-scoped state from StoryContext.getCharacterState(charId).
   * When omitted, the dossier reflects only authored data. */
  state?: CharacterScopedState;
  /** When true, prepends a one-line "DO NOT BREAK CHARACTER" reminder. Default true. */
  includeAnchorReminder?: boolean;
  /** Override the heading text. Default "CHARACTER DOSSIER". */
  heading?: string;
  /** Recent interactions to include in a "Recent interactions" block.
   * Caller (typically buildDossierForRef) builds these from
   * narrativeMemory.interactionsForCharacter(). Cap to ~5–10 to keep tokens
   * bounded; the dossier truncates if more than `maxInteractions` are passed. */
  interactions?: ReadonlyArray<DossierInteraction>;
  /** Maximum interactions to render (default 8). */
  maxInteractions?: number;
  /** Current 2D mood (Layer 3 / Step 4). Renders as one descriptive line. */
  mood?: MoodLike;
  /** Sentiments held by this character. Top-N rendered (default 5) by
   * absolute strength so the LLM sees the strongest feelings first. */
  sentiments?: ReadonlyArray<SentimentLike>;
  /** Maximum sentiments to render (default 5). */
  maxSentiments?: number;
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

  // Mood (Step 4). Only render when meaningfully different from neutral —
  // a brand-new character's neutral mood adds noise to the prompt without
  // signal. Threshold 0.05 keeps tiny rounding artefacts out.
  if (options.mood && (Math.abs(options.mood.valence) > 0.05 || Math.abs(options.mood.arousal) > 0.05)) {
    lines.push(`Mood: ${describeMood(options.mood)}`);
  }

  // Sentiments (Step 4). Top-N by absolute strength, descending.
  if (options.sentiments && options.sentiments.length > 0) {
    const cap = options.maxSentiments ?? 5;
    const top = [...options.sentiments]
      .filter((s) => Math.abs(s.strength) > 0.05)
      .sort((a, b) => Math.abs(b.strength) - Math.abs(a.strength))
      .slice(0, cap);
    if (top.length > 0) {
      lines.push('Feels toward others:');
      for (const s of top) {
        const intensity = describeSentimentIntensity(s.strength);
        lines.push(`  - ${intensity} ${s.emotion} toward ${s.toEntityRef}`);
      }
    }
  }

  // Recent interactions (Layer 4 / Step 3 narrative memory). Tail-truncated
  // to maxInteractions so the dossier stays bounded.
  if (options.interactions && options.interactions.length > 0) {
    const cap = options.maxInteractions ?? 8;
    const tail = options.interactions.slice(-cap);
    lines.push('Recent interactions:');
    for (const i of tail) {
      const summary = i.summary ? ` — ${i.summary}` : '';
      lines.push(`  - ${i.beatName}${summary}`);
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
 * Describe a single mood axis qualitatively. Used by builder UIs so the
 * Inspector can show authors what their numeric delta means in words.
 *
 * @param value Axis value, expected in [-1, 1]; rounded to nearest band.
 * @param axis  'valence' (pleasant↔unpleasant) or 'arousal' (calm↔excited).
 */
export function describeMoodAxis(value: number, axis: 'valence' | 'arousal'): string {
  if (axis === 'valence') {
    if (value >= 0.6) return 'happy';
    if (value >= 0.2) return 'pleased';
    if (value <= -0.6) return 'sad';
    if (value <= -0.2) return 'displeased';
    return 'even-keeled';
  }
  if (value >= 0.6) return 'energetic';
  if (value >= 0.2) return 'alert';
  if (value <= -0.6) return 'lethargic';
  if (value <= -0.2) return 'subdued';
  return 'steady';
}

/**
 * Describe a 2D mood in natural language. Pairs a valence word (pleasant /
 * unpleasant) with an arousal word (calm / energetic). The LLM gets a
 * compact sentence rather than two opaque numbers.
 */
function describeMood(mood: MoodLike): string {
  return `${describeMoodAxis(mood.valence, 'valence')}, ${describeMoodAxis(mood.arousal, 'arousal')} (valence ${mood.valence.toFixed(2)}, arousal ${mood.arousal.toFixed(2)})`;
}

/** Translate sentiment strength into a qualitative adjective. */
function describeSentimentIntensity(strength: number): string {
  const abs = Math.abs(strength);
  const polarity = strength < 0 ? 'anti-' : '';
  if (abs >= 0.75) return `intense ${polarity}`.trim();
  if (abs >= 0.4) return `strong ${polarity}`.trim();
  if (abs >= 0.15) return `mild ${polarity}`.trim();
  return `slight ${polarity}`.trim();
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
 *
 * If `contextLike` exposes story / history-shaped accessors, the recent
 * interactions section is built automatically via narrativeMemory:
 *   - getStory() returning a story with getCharacters() / getBeats()
 *   - getHistory() returning the visited beat-id list
 *   - getChoiceHistory() returning the choice records
 * The AI beats pass `context` directly because StoryContext implements all
 * three methods.
 */
export function buildDossierForRef(
  characterRef: string | null | undefined,
  characters: ReadonlyArray<CharacterLike> | null | undefined,
  contextLike: {
    getCharacterState?: (ref: string) => CharacterScopedState;
    getCharacterInteractions?: (ref: string) => ReadonlyArray<DossierInteraction>;
    getCharacterMood?: (ref: string) => MoodLike;
    getCharacterSentiments?: (ref: string) => ReadonlyArray<SentimentLike>;
    getStory?: () => any;
    getHistory?: () => ReadonlyArray<string>;
    getChoiceHistory?: () => ReadonlyArray<ChoiceRecordLike>;
  } | null | undefined,
  options: BuildDossierOptions = {},
): string {
  if (!characterRef || !characters) return '';
  const character = characters.find((c) => c.id === characterRef) || null;
  if (!character) return '';
  const state = contextLike?.getCharacterState?.(characterRef);
  const mood = contextLike?.getCharacterMood?.(characterRef);
  const sentiments = contextLike?.getCharacterSentiments?.(characterRef);

  // Resolve interactions from whichever path the caller wired up. Prefer the
  // explicit accessor; fall back to deriving from story + history.
  let interactions = contextLike?.getCharacterInteractions?.(characterRef);
  if (!interactions && contextLike?.getStory && contextLike?.getHistory) {
    const story = contextLike.getStory();
    const beats: BeatLike[] = (story?.getBeats?.() || story?.beats || []);
    const history = contextLike.getHistory() || [];
    const choiceHistory = contextLike.getChoiceHistory?.() || [];
    if (beats.length && history.length) {
      const trail = interactionsForCharacter(history, choiceHistory, beats, character, characters);
      interactions = trail.map<DossierInteraction>((entry) => ({
        beatName: entry.beatName || entry.beatId,
        summary: entry.kind === 'choice' && entry.choiceText
          ? `chose "${entry.choiceText}"`
          : undefined,
      }));
    }
  }

  return buildDossier(character, { ...options, state, interactions, mood, sentiments });
}
