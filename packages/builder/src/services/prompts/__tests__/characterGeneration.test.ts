/**
 * Character generation prompt + normalization tests.
 *
 * The prompt builders are string-assembly; the normalizers are the safety
 * layer between the AI's JSON and the Character/CharacterVariant model —
 * clamping, slugifying, deduping — so they get the thorough coverage.
 */
import { describe, it, expect } from 'vitest';
import {
  buildCharacterQuestionsPrompt,
  buildCharacterProfilePrompt,
  buildCharacterCardRevisionPrompt,
  normalizeGeneratedQuestions,
  normalizeGeneratedProfile,
  applyRevisedCard,
  slugify,
  normalizeTraits,
  normalizeMood,
  type CharacterGenerationSeed,
  type GeneratedCharacterProfile,
} from '../characterGeneration';
import {
  stanceToTraitDeltas,
  bigFiveToStance,
  stanceToBigFive,
  applyStanceToTraits,
  normalizeStance,
  describeStance,
} from '../interpersonalStance';

const seed: CharacterGenerationSeed = {
  name: 'Iris',
  brief: 'A narcissistic mother who guilt-trips her daughter.',
  scenario: 'Weekly phone call where the daughter tries to hold a boundary.',
  dispositions: ['Hostile', 'Avoidant'],
  answers: [{ question: 'How does she react to refusal?', answer: 'Goes cold, then escalates.' }],
};

describe('prompt builders', () => {
  it('questions prompt carries name, scenario, and brief', () => {
    const { systemPrompt, userPrompt } = buildCharacterQuestionsPrompt(seed);
    expect(systemPrompt).toContain('JSON');
    expect(userPrompt).toContain('Iris');
    expect(userPrompt).toContain('Weekly phone call');
    expect(userPrompt).toContain('narcissistic mother');
  });

  it('profile prompt includes dispositions and answers when present', () => {
    const { systemPrompt, userPrompt } = buildCharacterProfilePrompt(seed);
    expect(userPrompt).toContain('DISPOSITIONS: Hostile, Avoidant');
    expect(userPrompt).toContain('Goes cold, then escalates.');
    expect(systemPrompt).toContain('SELF-CONTAINED'); // variant overlay semantics
  });

  it('profile prompt omits variant rules without dispositions', () => {
    const { systemPrompt, userPrompt } = buildCharacterProfilePrompt({
      brief: 'a shopkeeper',
      dispositions: [],
    });
    expect(systemPrompt).not.toContain('DISPOSITION VARIANT');
    expect(userPrompt).not.toContain('DISPOSITIONS:');
  });

  it('empty answers are excluded from the prompt', () => {
    const { userPrompt } = buildCharacterProfilePrompt({
      brief: 'x',
      answers: [{ question: 'Q1', answer: '  ' }],
    });
    expect(userPrompt).not.toContain('FOLLOW-UP ANSWERS');
  });

  it('revision prompt embeds the targeted card only', () => {
    const profile: GeneratedCharacterProfile = {
      name: 'iris',
      displayName: 'Iris',
      description: 'Base description.',
      traits: { openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, neuroticism: 0.5 },
      initialMood: { valence: 0, arousal: 0 },
      variants: [
        {
          id: 'hostile',
          name: 'Hostile',
          characterDescription: 'Hostile Iris.',
          traits: { openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.2, neuroticism: 0.8 },
          initialMood: { valence: -0.4, arousal: 0.5 },
        },
      ],
    };
    const base = buildCharacterCardRevisionPrompt(profile, 'base', 'warmer');
    expect(base.userPrompt).toContain('Base description.');
    expect(base.userPrompt).toContain('DIRECTION: warmer');
    const variant = buildCharacterCardRevisionPrompt(profile, 'hostile', 'more sarcastic');
    expect(variant.userPrompt).toContain('Hostile Iris.');
    expect(variant.userPrompt).toContain('variant "hostile"');
  });
});

describe('slugify / normalizeTraits / normalizeMood', () => {
  it('slugifies with fallback', () => {
    expect(slugify('Anxious Introvert!', 'x')).toBe('anxious_introvert');
    expect(slugify('', 'fallback')).toBe('fallback');
    expect(slugify('###', 'fallback')).toBe('fallback');
  });

  it('clamps traits to [0,1] and fills missing with defaults', () => {
    const traits = normalizeTraits({ openness: 1.7, neuroticism: -0.3, bogus: 0.9 });
    expect(traits.openness).toBe(1);
    expect(traits.neuroticism).toBe(0);
    expect(traits.extraversion).toBe(0.5); // default
    expect(traits).not.toHaveProperty('bogus');
  });

  it('clamps mood to [-1,1] and defaults non-numbers to 0', () => {
    expect(normalizeMood({ valence: -3, arousal: 'high' })).toEqual({ valence: -1, arousal: 0 });
    expect(normalizeMood(undefined)).toEqual({ valence: 0, arousal: 0 });
  });
});

describe('normalizeGeneratedQuestions', () => {
  it('filters malformed entries and caps at 3 questions / 4 suggestions', () => {
    const result = normalizeGeneratedQuestions({
      questions: [
        { question: 'Q1', suggestions: ['a', 'b', 'c', 'd', 'e'] },
        { question: '', suggestions: ['x'] },
        { question: 'Q2' },
        { question: 'Q3', suggestions: 'not-an-array' },
        { question: 'Q4', suggestions: [] },
      ],
    });
    expect(result.map((q) => q.question)).toEqual(['Q1', 'Q2', 'Q3']);
    expect(result[0].suggestions).toEqual(['a', 'b', 'c', 'd']);
    expect(result[1].suggestions).toEqual([]);
  });

  it('returns empty for garbage', () => {
    expect(normalizeGeneratedQuestions(null)).toEqual([]);
    expect(normalizeGeneratedQuestions({})).toEqual([]);
  });
});

describe('normalizeGeneratedProfile', () => {
  it('throws when the description is missing', () => {
    expect(() => normalizeGeneratedProfile({ displayName: 'X' }, { brief: '' })).toThrow(/description/);
  });

  it('falls back displayName to the seed name and slugifies the code name', () => {
    const profile = normalizeGeneratedProfile(
      { description: 'desc', name: 'Frau Müller!' },
      { name: 'Iris', brief: '' },
    );
    expect(profile.displayName).toBe('Iris');
    expect(profile.name).toBe('frau_m_ller');
  });

  it('dedupes variant ids and drops variants without descriptions', () => {
    const profile = normalizeGeneratedProfile(
      {
        description: 'core',
        displayName: 'Iris',
        variants: [
          { id: 'Hostile!', name: 'Hostile', characterDescription: 'v1', traits: { agreeableness: 2 } },
          { id: 'hostile', name: 'Hostile 2', characterDescription: 'v2' },
          { id: 'broken', name: 'No description' },
        ],
      },
      { brief: '' },
    );
    expect(profile.variants).toHaveLength(2);
    expect(profile.variants![0].id).toBe('hostile');
    expect(profile.variants![1].id).toBe('hostile_2');
    // 'Hostile' matches a known disposition → agreeableness is DERIVED from
    // base traits + circumplex rotation, not taken from the AI's value.
    expect(profile.variants![0].stance).toEqual({ warmth: -0.7, dominance: 0.5 });
    expect(profile.variants![0].traits.agreeableness).toBeCloseTo(0.5 + 0.35 * ((-0.7 - 0.5) / Math.SQRT2), 5);
  });

  it('omits the variants key when none survive', () => {
    const profile = normalizeGeneratedProfile({ description: 'd' }, { brief: '' });
    expect(profile).not.toHaveProperty('variants');
  });
});

describe('interpersonal stance grounding', () => {
  it('rotation: hostile lowers agreeableness, cooperative raises it', () => {
    const hostile = stanceToTraitDeltas({ warmth: -0.7, dominance: 0.5 });
    expect(hostile.agreeableness).toBeLessThan(-0.5);
    const cooperative = stanceToTraitDeltas({ warmth: 0.7, dominance: -0.2 });
    expect(cooperative.agreeableness).toBeGreaterThan(0.5);
    // Friendly dominance loads on extraversion.
    const warmDominant = stanceToTraitDeltas({ warmth: 0.7, dominance: 0.7 });
    expect(warmDominant.extraversion).toBeCloseTo(1.4 / Math.SQRT2, 5);
    expect(warmDominant.agreeableness).toBeCloseTo(0, 5);
  });

  it('bigFiveToStance is the inverse lens: neutral traits sit at the origin', () => {
    expect(bigFiveToStance({ extraversion: 0.5, agreeableness: 0.5 })).toEqual({ dominance: 0, warmth: 0 });
    const s = bigFiveToStance({ extraversion: 1, agreeableness: 0 });
    expect(s.dominance).toBeCloseTo(2 / Math.SQRT2, 5); // pure cold dominance
    expect(s.warmth).toBeCloseTo(0, 5);
  });

  it('applyStanceToTraits displaces from the BASE traits and clamps', () => {
    const shy = { extraversion: 0.2, agreeableness: 0.6 };
    const hostile = applyStanceToTraits(shy, { warmth: -0.7, dominance: 0.5 });
    // A shy person turned hostile stays shy — E barely moves.
    expect(hostile.extraversion).toBeCloseTo(0.2 + 0.35 * (-0.2 / Math.SQRT2), 5);
    expect(hostile.agreeableness).toBeCloseTo(0.6 + 0.35 * (-1.2 / Math.SQRT2), 5);
    const extreme = applyStanceToTraits({ extraversion: 0.05, agreeableness: 0.05 }, { warmth: -1, dominance: -1 });
    expect(extreme.extraversion).toBe(0); // clamped
  });

  it('stanceToBigFive is the full-scale inverse of bigFiveToStance', () => {
    // Round-trip: any E/A inside the unit disc survives both rotations.
    for (const [e, a] of [[0.5, 0.5], [0.7, 0.3], [0.2, 0.8], [0.5, 0.9]]) {
      const back = stanceToBigFive(bigFiveToStance({ extraversion: e, agreeableness: a }));
      expect(back.extraversion).toBeCloseTo(e, 5);
      expect(back.agreeableness).toBeCloseTo(a, 5);
    }
    // The origin is neutral E/A.
    expect(stanceToBigFive({ warmth: 0, dominance: 0 })).toEqual({ extraversion: 0.5, agreeableness: 0.5 });
    // Full warm-dominant clamps into [0, 1].
    const extreme = stanceToBigFive({ warmth: 1, dominance: 1 });
    expect(extreme.extraversion).toBe(1);
    expect(extreme.agreeableness).toBeCloseTo(0.5, 5);
  });

  it('describeStance names octants, pure axes, and the neutral center', () => {
    expect(describeStance({ warmth: 0, dominance: 0 })).toBe('neutral');
    expect(describeStance({ warmth: 0.05, dominance: -0.1 })).toBe('neutral');
    expect(describeStance({ warmth: 0.8, dominance: 0.05 })).toBe('warm');
    expect(describeStance({ warmth: 0.05, dominance: -0.8 })).toBe('submissive');
    expect(describeStance({ warmth: -0.7, dominance: 0.5 })).toBe('cold-dominant (hostile)');
    expect(describeStance({ warmth: 0.7, dominance: -0.2 })).toBe('warm-submissive (cooperative)');
    expect(describeStance({ warmth: -0.4, dominance: -0.6 })).toBe('cold-submissive (withdrawn)');
    expect(describeStance({ warmth: 0.6, dominance: 0.6 })).toBe('warm-dominant (leading)');
  });

  it('normalizeStance clamps axes and rejects garbage', () => {
    expect(normalizeStance({ warmth: 3, dominance: -2 })).toEqual({ warmth: 1, dominance: -1 });
    expect(normalizeStance({ warmth: 'cold' })).toBeNull();
    expect(normalizeStance(null)).toBeNull();
  });

  it('custom dispositions use the AI-placed stance to derive A/E', () => {
    const profile = normalizeGeneratedProfile(
      {
        description: 'core',
        traits: { extraversion: 0.3, agreeableness: 0.7 },
        variants: [
          {
            id: 'wheedling',
            name: 'Wheedling',
            characterDescription: 'v',
            traits: { agreeableness: 0.9, neuroticism: 0.8 },
            stance: { warmth: 0.4, dominance: -0.8 },
          },
        ],
      },
      { brief: '' },
    );
    const v = profile.variants![0];
    expect(v.stance).toEqual({ warmth: 0.4, dominance: -0.8 });
    expect(v.traits.agreeableness).toBeCloseTo(0.7 + 0.35 * ((0.4 + 0.8) / Math.SQRT2), 5);
    expect(v.traits.neuroticism).toBe(0.8); // O/C/N stay AI-authored
  });

  it('variants without any stance keep the AI traits untouched', () => {
    const profile = normalizeGeneratedProfile(
      {
        description: 'core',
        variants: [
          { id: 'odd', name: 'Odd One', characterDescription: 'v', traits: { agreeableness: 0.9 } },
        ],
      },
      { brief: '' },
    );
    expect(profile.variants![0].stance).toBeUndefined();
    expect(profile.variants![0].traits.agreeableness).toBe(0.9);
  });

  it('profile prompt lists known disposition stances and manifestation hints', () => {
    const { systemPrompt } = buildCharacterProfilePrompt({
      brief: 'x',
      dispositions: ['Hostile', 'Wheedling'],
    });
    expect(systemPrompt).toContain('DISPOSITION STANCES');
    expect(systemPrompt).toContain('Hostile: warmth -0.7, dominance +0.5');
    expect(systemPrompt).toContain('bald-on-record');
    expect(systemPrompt).not.toContain('Wheedling: warmth'); // custom → AI places it
  });

  it('applyRevisedCard re-derives A/E when the revision moves the stance', () => {
    const profile = normalizeGeneratedProfile(
      {
        description: 'core',
        traits: { extraversion: 0.4, agreeableness: 0.6 },
        variants: [{ id: 'hostile', name: 'Hostile', characterDescription: 'v', traits: {} }],
      },
      { brief: '' },
    );
    const revised = applyRevisedCard(profile, 'hostile', {
      characterDescription: 'colder still',
      stance: { warmth: -1, dominance: 0.8 },
    });
    const v = revised.variants![0];
    expect(v.stance).toEqual({ warmth: -1, dominance: 0.8 });
    expect(v.traits.agreeableness).toBeCloseTo(0.6 + 0.35 * ((-1 - 0.8) / Math.SQRT2), 5);
  });
});

describe('applyRevisedCard', () => {
  const profile: GeneratedCharacterProfile = {
    name: 'iris',
    displayName: 'Iris',
    description: 'Base.',
    traits: { openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, neuroticism: 0.5 },
    initialMood: { valence: 0, arousal: 0 },
    variants: [
      {
        id: 'hostile',
        name: 'Hostile',
        characterDescription: 'Hostile.',
        traits: { openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.2, neuroticism: 0.8 },
        initialMood: { valence: -0.4, arousal: 0.5 },
      },
    ],
  };

  it('merges a revised base card, keeping untouched fields', () => {
    const next = applyRevisedCard(profile, 'base', { description: 'Warmer base.' });
    expect(next.description).toBe('Warmer base.');
    expect(next.displayName).toBe('Iris');
    expect(next.variants).toBe(profile.variants);
  });

  it('merges a revised variant card without touching the base', () => {
    const next = applyRevisedCard(profile, 'hostile', {
      characterDescription: 'More sarcastic.',
      initialMood: { valence: -0.9, arousal: 2 },
    });
    expect(next.description).toBe('Base.');
    expect(next.variants![0].characterDescription).toBe('More sarcastic.');
    expect(next.variants![0].initialMood).toEqual({ valence: -0.9, arousal: 1 }); // clamped
    expect(next.variants![0].traits).toEqual(profile.variants![0].traits);
  });

  it('ignores garbage revisions (keeps prior card)', () => {
    const next = applyRevisedCard(profile, 'base', null);
    expect(next.description).toBe('Base.');
  });
});

describe('normalizeGeneratedProfile — trackedQuantity survives', () => {
  const seed = { brief: 'a porter' } as any;
  const base = { displayName: 'Len', description: 'A porter who has seen everything.', traits: {}, initialMood: {} };

  it('carries a well-formed proposal through', () => {
    // This function builds its result from an explicit field list, so a new
    // field is dropped unless named. trackedQuantity was dropped exactly that
    // way — the model returned it and the UI never saw it.
    const p = normalizeGeneratedProfile({
      ...base,
      trackedQuantity: { emotion: 'Respect', displayName: 'Respect', rationale: 'he sizes people up fast', bipolar: true },
    }, seed);
    expect(p.trackedQuantity).toEqual({
      emotion: 'respect', displayName: 'Respect', rationale: 'he sizes people up fast', bipolar: true,
    });
  });

  it('derives a display name when the model omits one', () => {
    const p = normalizeGeneratedProfile({ ...base, trackedQuantity: { emotion: 'patience' } }, seed);
    expect(p.trackedQuantity?.displayName).toBe('Patience');
  });

  it('drops a proposal with no usable emotion rather than offering a dead binding', () => {
    for (const tq of [null, {}, { emotion: '   ' }, { displayName: 'Trust' }, 'trust']) {
      expect(normalizeGeneratedProfile({ ...base, trackedQuantity: tq }, seed).trackedQuantity).toBeUndefined();
    }
  });

  it('omits the key entirely when the model returns null — a valid answer', () => {
    const p = normalizeGeneratedProfile({ ...base, trackedQuantity: null }, seed);
    expect('trackedQuantity' in p).toBe(false);
  });
});
