/**
 * Character generation prompts — the AI "Develop character" helper.
 *
 * Three calls, all one-shot JSON:
 *   1. buildCharacterQuestionsPrompt — read the author's brief and ask 2-3
 *      targeted follow-up questions (each with tappable suggested answers).
 *      Skippable; the profile prompt works with or without answers.
 *   2. buildCharacterProfilePrompt — generate the full character profile,
 *      optionally with one disposition variant per requested disposition.
 *   3. buildCharacterCardRevisionPrompt — regenerate ONE card (base profile
 *      or a single variant) following a free-text direction ("more
 *      passive-aggressive"), leaving the rest untouched.
 *
 * Output lands in the existing Character / CharacterVariant model, so the
 * normalizers below clamp traits to [0,1], mood axes to [-1,1], and slugify
 * ids. IMPORTANT model semantics the prompts encode:
 *   - A variant's characterDescription REPLACES the base description when
 *     active (partial overlay, resolveCharacterWithVariant) — so every
 *     variant description must be self-contained (identity + disposition),
 *     not a diff against the base.
 *   - When variants exist, personality lives per-variant; the base
 *     description stays disposition-neutral (identity, backstory, voice).
 */

import { DEFAULT_TRAIT_NAMES, DEFAULT_TRAIT_VALUES } from '@asaps/core';
import {
  findDispositionDefinition,
  applyStanceToTraits,
  normalizeStance,
  type InterpersonalStance,
} from './interpersonalStance';

export interface CharacterGenerationSeed {
  /** Character name if already known (beat's npcName or manager input). */
  name?: string;
  /** The author's free-text brief. May be empty when opened blank. */
  brief: string;
  /** Scenario text from the AI conversation beat, when opened from there. */
  scenario?: string;
  /** Requested disposition variants (e.g. ['Cooperative','Hostile']). Empty = no variants. */
  dispositions?: string[];
  /** Answers collected in the optional follow-up-questions stage. */
  answers?: Array<{ question: string; answer: string }>;
}

export interface GeneratedCharacterQuestion {
  question: string;
  suggestions: string[];
}

export interface GeneratedCharacterVariant {
  id: string;
  /** Author-facing label, usually the disposition ("Hostile"). */
  name: string;
  /** Self-contained persona description — replaces the base when active. */
  characterDescription: string;
  traits: Record<string, number>;
  initialMood: { valence: number; arousal: number };
  /**
   * Interpersonal-circumplex position of this disposition (see
   * interpersonalStance.ts). When present, the variant's extraversion +
   * agreeableness were DERIVED from base traits + this stance — the AI
   * only authored O/C/N. Persisted for future runtime use (e.g. Leary
   * complementarity feedback in rehearsal scenarios).
   */
  stance?: InterpersonalStance;
}

export interface GeneratedCharacterProfile {
  /** Code-name slug suggestion (lowercase, underscores). */
  name: string;
  displayName: string;
  /** Personality + speaking style; disposition-neutral core when variants exist. */
  description: string;
  traits: Record<string, number>;
  initialMood: { valence: number; arousal: number };
  variants?: GeneratedCharacterVariant[];
  /**
   * Optional: the one feeling this character's relationship with the player
   * most naturally tracks, proposed from the brief. The helper offers it as
   * an opt-in tracked quantity — the author decides whether it exists at all,
   * how it moves, and whether the interactor ever sees it.
   *
   * Optional by design: models omit it, and a missing proposal simply means
   * no offer is made. See docs/Counter-Binding-Design.md.
   */
  trackedQuantity?: {
    /** Sentiment emotion name, lowercase — e.g. "trust", "respect", "fear". */
    emotion: string;
    /** Author-facing meter label — e.g. "Trust". */
    displayName: string;
    /** One short line on why this feeling is the one worth tracking here. */
    rationale?: string;
    /** True when the feeling has a meaningful opposite (trust/distrust). */
    bipolar?: boolean;
  };
}

const TRAIT_GUIDE = `"traits" uses the Big Five, each 0.0-1.0 (0.5 = average):
openness, conscientiousness, extraversion, agreeableness, neuroticism.
"initialMood" is { "valence": -1.0..1.0 (unpleasant..pleasant), "arousal": -1.0..1.0 (calm..activated) }.`;

function seedContext(seed: CharacterGenerationSeed): string {
  const parts: string[] = [];
  if (seed.name) parts.push(`CHARACTER NAME: ${seed.name}`);
  if (seed.scenario) parts.push(`SCENARIO the character appears in:\n${seed.scenario}`);
  parts.push(seed.brief.trim() ? `AUTHOR'S BRIEF:\n${seed.brief.trim()}` : `AUTHOR'S BRIEF: (none given yet)`);
  const answered = (seed.answers || []).filter((a) => a.answer.trim());
  if (answered.length > 0) {
    parts.push(
      'FOLLOW-UP ANSWERS:\n' + answered.map((a) => `Q: ${a.question}\nA: ${a.answer}`).join('\n'),
    );
  }
  return parts.join('\n\n');
}

/** Stage 2 — ask what's missing. */
export function buildCharacterQuestionsPrompt(seed: CharacterGenerationSeed): {
  systemPrompt: string;
  userPrompt: string;
} {
  return {
    systemPrompt: `You help an interactive-story author flesh out a character for an AI-driven conversation. Read what the author has so far and ask the 2-3 follow-up questions whose answers would most change how this character behaves in conversation. Ask about behavior, not parameters: how the character reacts under pressure, what they want from the other person, what they avoid saying, how self-aware they are. Never ask the author to rate traits or numbers. Each question gets 3-4 short suggested answers the author can tap.

Respond with ONLY valid JSON:
{
  "questions": [
    { "question": "...", "suggestions": ["...", "...", "..."] }
  ]
}`,
    userPrompt: seedContext(seed),
  };
}

/** Stage 3 — generate the profile (+ optional disposition variants). */
export function buildCharacterProfilePrompt(seed: CharacterGenerationSeed): {
  systemPrompt: string;
  userPrompt: string;
} {
  const wantsVariants = (seed.dispositions?.length ?? 0) > 0;
  const knownStanceLines = (seed.dispositions || [])
    .map((label) => {
      const def = findDispositionDefinition(label);
      return def
        ? `- ${def.label}: warmth ${def.warmth >= 0 ? '+' : ''}${def.warmth.toFixed(1)}, dominance ${def.dominance >= 0 ? '+' : ''}${def.dominance.toFixed(1)} — realizes as ${def.manifestation}.`
        : null;
    })
    .filter(Boolean)
    .join('\n');
  const variantRules = wantsVariants
    ? `
The author asked for one DISPOSITION VARIANT per entry in DISPOSITIONS — versions of the SAME person showing up differently (same identity and backstory, different demeanor). Rules:
- "description" (base) stays disposition-neutral: identity, backstory, manner of speaking. No mood words that only fit one disposition.
- Each variant's "characterDescription" REPLACES the base description at runtime, so it must be SELF-CONTAINED: restate the identity/backstory core, then how this disposition colors their behavior, conversational tactics, and speech. 60-120 words.
- Give each variant its own "traits" and "initialMood" that plausibly produce that disposition.
- "id": short lowercase slug of the disposition. "name": the disposition label as given.
- Every variant also gets "stance": { "warmth": -1.0..1.0, "dominance": -1.0..1.0 } — its position on the interpersonal circumplex (Leary). Use the coordinates below for listed dispositions; place any other disposition yourself.
- The app derives each variant's agreeableness and extraversion from the base character's traits plus the stance (interpersonal-circumplex rotation), so in variant "traits" concentrate on openness, conscientiousness, and neuroticism. Let the manifestation notes below shape the conversational tactics in each characterDescription.
${knownStanceLines ? `\nDISPOSITION STANCES:\n${knownStanceLines}` : ''}`
    : '';

  return {
    systemPrompt: `You create a character profile for an interactive story's AI conversation system. The description drives an LLM playing this character, so write it as behavioral instruction: who they are, what they want, how they speak (sentence length, register, verbal tics), what they do under pressure. Concrete and playable, not literary. 60-120 words.

${TRAIT_GUIDE}
${variantRules}

ALWAYS include a "trackedQuantity" key. It names the ONE feeling this character's relationship with the player most naturally follows over a story — the thing an author would want a meter for. Pick the feeling the brief actually implies (trust, respect, fear, suspicion, affection, patience…), never a generic default: a porter who decides whether he respects you tracks RESPECT, not trust. "bipolar" is true only when the feeling has a real opposite that could be named (trust/distrust: yes; fear: no — its absence is just calm). Keep "rationale" to one short clause.
Set "trackedQuantity" to null ONLY when the character has no ongoing relationship with the player at all — a one-scene functionary, a voice on a recording. Almost every character worth generating has one feeling worth following, so null should be rare.

Respond with ONLY valid JSON:
{
  "name": "code_name_slug",
  "displayName": "...",
  "description": "...",
  "traits": { "openness": 0.5, "conscientiousness": 0.5, "extraversion": 0.5, "agreeableness": 0.5, "neuroticism": 0.5 },
  "initialMood": { "valence": 0.0, "arousal": 0.0 },
  "trackedQuantity": { "emotion": "trust", "displayName": "Trust", "rationale": "...", "bipolar": true }${
    wantsVariants
      ? `,
  "variants": [
    { "id": "hostile", "name": "Hostile", "characterDescription": "...", "traits": { ... }, "initialMood": { ... }, "stance": { "warmth": -0.7, "dominance": 0.5 } }
  ]`
      : ''
  }
}`,
    userPrompt:
      seedContext(seed) +
      (wantsVariants ? `\n\nDISPOSITIONS: ${seed.dispositions!.join(', ')}` : ''),
  };
}

/** Preview refinement — regenerate one card following a direction. */
export function buildCharacterCardRevisionPrompt(
  profile: GeneratedCharacterProfile,
  target: 'base' | string,
  direction: string,
): { systemPrompt: string; userPrompt: string } {
  const isBase = target === 'base';
  const card = isBase
    ? {
        displayName: profile.displayName,
        description: profile.description,
        traits: profile.traits,
        initialMood: profile.initialMood,
      }
    : profile.variants?.find((v) => v.id === target);

  return {
    systemPrompt: `You revise ONE card of an already-generated character profile following the author's direction. Keep everything the direction doesn't touch; change what it does. Same field meanings as before: the description is behavioral instruction for an LLM playing the character (60-120 words).

If the card carries a "stance" (interpersonal circumplex: warmth/dominance, each -1..1) and the direction implies an interpersonal shift ("more dominant", "colder"), move the stance accordingly — the app derives agreeableness and extraversion from it.

${TRAIT_GUIDE}

Respond with ONLY valid JSON — the revised card, same shape as CURRENT CARD, no wrapper.`,
    userPrompt: `CHARACTER: ${profile.displayName}
${isBase ? 'CARD: base profile' : `CARD: variant "${target}"`}

CURRENT CARD:
${JSON.stringify(card, null, 2)}

DIRECTION: ${direction}`,
  };
}

// ---------------------------------------------------------------------------
// Normalization — pure, unit-testable. The AI's JSON is clamped/slugified
// here so downstream code can trust the shapes.
// ---------------------------------------------------------------------------

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function slugify(input: string, fallback: string): string {
  const slug = (input || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  return slug || fallback;
}

export function normalizeTraits(raw: unknown): Record<string, number> {
  const out: Record<string, number> = { ...DEFAULT_TRAIT_VALUES };
  if (raw && typeof raw === 'object') {
    for (const key of DEFAULT_TRAIT_NAMES) {
      const v = (raw as Record<string, unknown>)[key];
      if (typeof v === 'number' && Number.isFinite(v)) out[key] = clamp(v, 0, 1);
    }
  }
  return out;
}

export function normalizeMood(raw: unknown): { valence: number; arousal: number } {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, -1, 1) : 0);
  return { valence: num(obj.valence), arousal: num(obj.arousal) };
}

export function normalizeGeneratedQuestions(raw: unknown): GeneratedCharacterQuestion[] {
  const list = Array.isArray((raw as any)?.questions) ? (raw as any).questions : [];
  return list
    .filter((q: any) => q && typeof q.question === 'string' && q.question.trim())
    .slice(0, 3)
    .map((q: any) => ({
      question: q.question.trim(),
      suggestions: Array.isArray(q.suggestions)
        ? q.suggestions.filter((s: any) => typeof s === 'string' && s.trim()).slice(0, 4)
        : [],
    }));
}

export function normalizeGeneratedProfile(
  raw: unknown,
  seed: CharacterGenerationSeed,
): GeneratedCharacterProfile {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const displayName =
    (typeof obj.displayName === 'string' && obj.displayName.trim()) ||
    seed.name?.trim() ||
    'New Character';
  const description = typeof obj.description === 'string' ? obj.description.trim() : '';
  if (!description) {
    throw new Error('AI response did not include a character description');
  }

  const baseTraits = normalizeTraits(obj.traits);
  const seenIds = new Set<string>();
  const variants: GeneratedCharacterVariant[] = (Array.isArray(obj.variants) ? obj.variants : [])
    .filter((v: any) => v && typeof v.characterDescription === 'string' && v.characterDescription.trim())
    .map((v: any, i: number) => {
      let id = slugify(typeof v.id === 'string' ? v.id : v.name || '', `variant${i + 1}`);
      while (seenIds.has(id)) id = `${id}_2`;
      seenIds.add(id);
      const name = (typeof v.name === 'string' && v.name.trim()) || id;
      // Ground the interpersonal plane: known dispositions use their
      // authored circumplex position; custom ones use the AI's placement.
      // With a stance, agreeableness + extraversion are DERIVED from the
      // base character's traits (rotation, interpersonalStance.ts) so the
      // person stays recognizable across dispositions; the AI keeps O/C/N.
      const def = findDispositionDefinition(name) || findDispositionDefinition(id);
      const stance: InterpersonalStance | null = def
        ? { warmth: def.warmth, dominance: def.dominance }
        : normalizeStance(v.stance);
      const traits = normalizeTraits(v.traits);
      if (stance) {
        const derived = applyStanceToTraits(baseTraits, stance);
        traits.extraversion = derived.extraversion;
        traits.agreeableness = derived.agreeableness;
      }
      return {
        id,
        name,
        characterDescription: v.characterDescription.trim(),
        traits,
        initialMood: normalizeMood(v.initialMood),
        ...(stance ? { stance } : {}),
      };
    });

  // The tracked-quantity proposal. Validated rather than trusted: a
  // half-specified one would offer the author a binding that reads nothing.
  //
  // This function builds its result from an explicit field list, so anything
  // not named here is silently dropped no matter what the model returned —
  // which is exactly what happened to trackedQuantity until this line existed.
  const tq = obj.trackedQuantity;
  const trackedQuantity =
    tq && typeof tq === 'object' && typeof tq.emotion === 'string' && tq.emotion.trim()
      ? {
          emotion: tq.emotion.trim().toLowerCase(),
          displayName:
            (typeof tq.displayName === 'string' && tq.displayName.trim()) ||
            tq.emotion.trim().charAt(0).toUpperCase() + tq.emotion.trim().slice(1),
          ...(typeof tq.rationale === 'string' && tq.rationale.trim()
            ? { rationale: tq.rationale.trim() }
            : {}),
          ...(typeof tq.bipolar === 'boolean' ? { bipolar: tq.bipolar } : {}),
        }
      : undefined;

  return {
    name: slugify(typeof obj.name === 'string' ? obj.name : displayName, 'new_character'),
    displayName,
    description,
    traits: baseTraits,
    initialMood: normalizeMood(obj.initialMood),
    ...(variants.length > 0 ? { variants } : {}),
    ...(trackedQuantity ? { trackedQuantity } : {}),
  };
}

/** Merge a revised card back into the profile (returns a new profile). */
export function applyRevisedCard(
  profile: GeneratedCharacterProfile,
  target: 'base' | string,
  rawCard: unknown,
): GeneratedCharacterProfile {
  const obj = (rawCard && typeof rawCard === 'object' ? rawCard : {}) as Record<string, any>;
  if (target === 'base') {
    return {
      ...profile,
      displayName:
        (typeof obj.displayName === 'string' && obj.displayName.trim()) || profile.displayName,
      description:
        (typeof obj.description === 'string' && obj.description.trim()) || profile.description,
      traits: obj.traits !== undefined ? normalizeTraits(obj.traits) : profile.traits,
      initialMood: obj.initialMood !== undefined ? normalizeMood(obj.initialMood) : profile.initialMood,
    };
  }
  return {
    ...profile,
    variants: (profile.variants || []).map((v) => {
      if (v.id !== target) return v;
      // A revision may move the stance ("more dominant"); with a stance
      // (new or carried over), A/E stay derived from the base traits so
      // the interpersonal plane remains circumplex-grounded.
      const stance = normalizeStance(obj.stance) || v.stance || null;
      const traits = obj.traits !== undefined ? normalizeTraits(obj.traits) : { ...v.traits };
      if (stance) {
        const derived = applyStanceToTraits(profile.traits, stance);
        traits.extraversion = derived.extraversion;
        traits.agreeableness = derived.agreeableness;
      }
      return {
        ...v,
        name: (typeof obj.name === 'string' && obj.name.trim()) || v.name,
        characterDescription:
          (typeof obj.characterDescription === 'string' && obj.characterDescription.trim()) ||
          v.characterDescription,
        traits,
        initialMood: obj.initialMood !== undefined ? normalizeMood(obj.initialMood) : v.initialMood,
        ...(stance ? { stance } : {}),
      };
    }),
  };
}
