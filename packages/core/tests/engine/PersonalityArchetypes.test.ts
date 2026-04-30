import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PERSONALITY_ARCHETYPES,
  findPersonalityArchetype,
} from '../../src/engine/PersonalityArchetypes';
import { DEFAULT_TRAIT_NAMES } from '../../src/engine/PersonalityTraits';

describe('DEFAULT_PERSONALITY_ARCHETYPES', () => {
  it('ships a non-empty library with stable ids', () => {
    expect(DEFAULT_PERSONALITY_ARCHETYPES.length).toBeGreaterThan(5);
    const ids = DEFAULT_PERSONALITY_ARCHETYPES.map((a) => a.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('every archetype has a name and description', () => {
    for (const a of DEFAULT_PERSONALITY_ARCHETYPES) {
      expect(a.name.length).toBeGreaterThan(0);
      expect(a.description.length).toBeGreaterThan(0);
    }
  });

  it('every archetype defines all five Big Five traits in [0, 1]', () => {
    for (const a of DEFAULT_PERSONALITY_ARCHETYPES) {
      for (const trait of DEFAULT_TRAIT_NAMES) {
        const v = a.traits[trait];
        expect(typeof v).toBe('number');
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it("'balanced' is exactly neutral on every axis", () => {
    const balanced = findPersonalityArchetype('balanced');
    expect(balanced).toBeDefined();
    for (const trait of DEFAULT_TRAIT_NAMES) {
      expect(balanced!.traits[trait]).toBe(0.5);
    }
  });

  it("'narcissist' has the canonical low-A / low-N / high-E shape", () => {
    const narc = findPersonalityArchetype('narcissist');
    expect(narc).toBeDefined();
    expect(narc!.traits.agreeableness).toBeLessThan(0.3);
    expect(narc!.traits.neuroticism).toBeLessThan(0.3);
    expect(narc!.traits.extraversion).toBeGreaterThan(0.7);
  });

  it("'anxious-introvert' has high N + low E", () => {
    const ai = findPersonalityArchetype('anxious-introvert');
    expect(ai).toBeDefined();
    expect(ai!.traits.neuroticism).toBeGreaterThan(0.7);
    expect(ai!.traits.extraversion).toBeLessThan(0.3);
  });

  it("'peacekeeper' has very high A + low N", () => {
    const p = findPersonalityArchetype('peacekeeper');
    expect(p).toBeDefined();
    expect(p!.traits.agreeableness).toBeGreaterThan(0.7);
    expect(p!.traits.neuroticism).toBeLessThan(0.4);
  });

  it("'stoic' has very low N + high C", () => {
    const s = findPersonalityArchetype('stoic');
    expect(s).toBeDefined();
    expect(s!.traits.neuroticism).toBeLessThan(0.2);
    expect(s!.traits.conscientiousness).toBeGreaterThan(0.7);
  });

  it('self-sentiment seeds (when present) are well-formed', () => {
    for (const a of DEFAULT_PERSONALITY_ARCHETYPES) {
      if (!a.selfSentiments) continue;
      for (const s of a.selfSentiments) {
        expect(typeof s.emotion).toBe('string');
        expect(s.emotion.length).toBeGreaterThan(0);
        expect(s.strength).toBeGreaterThanOrEqual(-1);
        expect(s.strength).toBeLessThanOrEqual(1);
      }
    }
  });

  it("'narcissist' seeds pride toward self", () => {
    const narc = findPersonalityArchetype('narcissist');
    expect(narc!.selfSentiments).toBeDefined();
    expect(narc!.selfSentiments!.find((s) => s.emotion === 'pride')).toBeTruthy();
  });

  it("'balanced' has no self-sentiment seeds (truly neutral)", () => {
    const balanced = findPersonalityArchetype('balanced');
    expect(balanced!.selfSentiments).toBeUndefined();
  });
});

describe('findPersonalityArchetype', () => {
  it('returns the matching archetype by id', () => {
    const a = findPersonalityArchetype('narcissist');
    expect(a?.id).toBe('narcissist');
  });

  it('returns undefined for unknown ids', () => {
    expect(findPersonalityArchetype('does-not-exist')).toBeUndefined();
    expect(findPersonalityArchetype('')).toBeUndefined();
  });

  it('accepts a custom library', () => {
    const custom = [{
      id: 'x', name: 'X', description: 'd',
      traits: { openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, neuroticism: 0.5 },
    }];
    expect(findPersonalityArchetype('x', custom)?.id).toBe('x');
    expect(findPersonalityArchetype('balanced', custom)).toBeUndefined();
  });
});
