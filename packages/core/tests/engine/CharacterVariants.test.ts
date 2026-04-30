/**
 * Character variants — runtime tests. Covers:
 *   - resolveCharacterWithVariant merge semantics
 *   - StoryContext.setActiveCharacterVariant + re-seeding
 *   - getMergedCharacter integration with fireCharacterEmotion
 *   - setCharacterVariant effect dispatch
 *   - characterVariant condition operator
 *   - defaultVariantId auto-applies at construction
 *   - Dossier reads the merged variant
 *   - Serialization round-trip + forward-compat
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Story } from '../../src/engine/Story';
import { StoryContext } from '../../src/engine/StoryContext';
import { resolveCharacterWithVariant, findCharacterVariant } from '../../src/utils/characterVariant';
import { buildDossierForRef } from '../../src/utils/dossier';

const baseAlex = {
  id: 'char_alex',
  name: 'Alex',
  displayName: 'Alex',
  description: 'A young person finding themselves.',
  traits: { neuroticism: 0.5, extraversion: 0.5, openness: 0.5, conscientiousness: 0.5, agreeableness: 0.5 },
  variants: [
    {
      id: 'introvert',
      name: 'Anxious introvert',
      description: 'Inward, sensitive Alex.',
      traits: { neuroticism: 0.85, extraversion: 0.20, openness: 0.65, conscientiousness: 0.55, agreeableness: 0.55 },
      initialMood: { valence: -0.3, arousal: -0.2 },
      initialSentiments: [{ toEntityRef: 'char_alex', emotion: 'shame', strength: 0.4 }],
    },
    {
      id: 'extrovert',
      name: 'Confident extrovert',
      displayName: 'Alex (out & proud)',
      traits: { neuroticism: 0.25, extraversion: 0.85, openness: 0.55, conscientiousness: 0.45, agreeableness: 0.65 },
      initialMood: { valence: 0.4, arousal: 0.3 },
      initialSentiments: [{ toEntityRef: 'char_alex', emotion: 'pride', strength: 0.6 }],
    },
  ],
};

describe('resolveCharacterWithVariant', () => {
  it('returns the base unchanged when no variant is provided', () => {
    expect(resolveCharacterWithVariant(baseAlex, undefined)).toBe(baseAlex);
    expect(resolveCharacterWithVariant(baseAlex, null)).toBe(baseAlex);
  });

  it('replaces only the fields the variant defines', () => {
    const variant = baseAlex.variants[0];
    const merged = resolveCharacterWithVariant(baseAlex, variant);
    expect(merged.id).toBe('char_alex');         // base
    expect(merged.name).toBe('Alex');            // base
    expect(merged.traits!.neuroticism).toBe(0.85);  // variant
    expect((merged as any).initialMood.valence).toBe(-0.3);
    // displayName not in variant → falls through.
    expect(merged.displayName).toBe('Alex');
  });

  it('overrides displayName when the variant defines it', () => {
    const variant = baseAlex.variants[1];
    const merged = resolveCharacterWithVariant(baseAlex, variant);
    expect(merged.displayName).toBe('Alex (out & proud)');
  });
});

describe('findCharacterVariant', () => {
  it('finds by id', () => {
    expect(findCharacterVariant(baseAlex, 'introvert')?.name).toBe('Anxious introvert');
  });
  it('returns undefined when missing', () => {
    expect(findCharacterVariant(baseAlex, 'nope')).toBeUndefined();
    expect(findCharacterVariant(null as any, 'introvert')).toBeUndefined();
    expect(findCharacterVariant(baseAlex, '')).toBeUndefined();
  });
});

describe('Variant runtime — setActiveCharacterVariant', () => {
  let story: Story;
  let ctx: StoryContext;

  beforeEach(() => {
    vi.stubGlobal('window', { setInterval: vi.fn().mockReturnValue(1), clearInterval: vi.fn() });
    story = new Story();
    story.setCharacters([baseAlex]);
    ctx = new StoryContext(undefined, story);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('defaults to no active variant', () => {
    expect(ctx.getActiveCharacterVariant('char_alex')).toBeUndefined();
  });

  it('flipping the variant emits an event', () => {
    const handler = vi.fn();
    ctx.on('characterVariantChanged', handler);
    ctx.setActiveCharacterVariant('char_alex', 'introvert');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toMatchObject({ characterRef: 'char_alex', variantId: 'introvert' });
  });

  it('re-seeds mood from the variant when activated', () => {
    ctx.setActiveCharacterVariant('char_alex', 'introvert');
    const mood = ctx.getCharacterMood('char_alex');
    expect(mood.valence).toBeCloseTo(-0.3);
    expect(mood.arousal).toBeCloseTo(-0.2);
  });

  it('switching variants wipes prior affect and re-seeds', () => {
    ctx.setActiveCharacterVariant('char_alex', 'introvert');
    expect(ctx.getCharacterMood('char_alex').valence).toBeCloseTo(-0.3);
    ctx.setActiveCharacterVariant('char_alex', 'extrovert');
    expect(ctx.getCharacterMood('char_alex').valence).toBeCloseTo(0.4);
  });

  it('seedAffect:false preserves accumulated affect', () => {
    ctx.setActiveCharacterVariant('char_alex', 'introvert');
    ctx.nudgeCharacterMood('char_alex', 0.5, 0.5);
    const mid = ctx.getCharacterMood('char_alex');
    ctx.setActiveCharacterVariant('char_alex', 'extrovert', { seedAffect: false });
    expect(ctx.getCharacterMood('char_alex')).toEqual(mid);
  });

  it('clearing the variant (null) reverts to base', () => {
    ctx.setActiveCharacterVariant('char_alex', 'introvert');
    ctx.setActiveCharacterVariant('char_alex', null);
    expect(ctx.getActiveCharacterVariant('char_alex')).toBeUndefined();
  });
});

describe('getMergedCharacter feeds trait modulation + dossier', () => {
  let story: Story;
  let ctx: StoryContext;

  beforeEach(() => {
    vi.stubGlobal('window', { setInterval: vi.fn().mockReturnValue(1), clearInterval: vi.fn() });
    story = new Story();
    story.setCharacters([baseAlex]);
    ctx = new StoryContext(undefined, story);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('fireCharacterEmotion uses variant traits', () => {
    // Introvert: neuroticism 0.85 → fear delta scales up.
    ctx.setActiveCharacterVariant('char_alex', 'introvert');
    const introFear = ctx.fireCharacterEmotion('char_alex', 'fear', 0.4);

    // Reset, switch to extrovert: neuroticism 0.25 → fear delta scales down.
    const ctx2 = new StoryContext(undefined, story);
    ctx2.setActiveCharacterVariant('char_alex', 'extrovert');
    const extroFear = ctx2.fireCharacterEmotion('char_alex', 'fear', 0.4);

    expect(introFear).toBeGreaterThan(extroFear);
  });

  it('dossier renders the active variant displayName', () => {
    ctx.setActiveCharacterVariant('char_alex', 'extrovert');
    const dossier = buildDossierForRef('char_alex', [baseAlex], {
      getMergedCharacter: (ref) => ctx.getMergedCharacter(ref),
    });
    expect(dossier).toContain('Alex (out & proud)');
  });
});

describe('setCharacterVariant effect + characterVariant condition', () => {
  let story: Story;
  let ctx: StoryContext;

  beforeEach(() => {
    vi.stubGlobal('window', { setInterval: vi.fn().mockReturnValue(1), clearInterval: vi.fn() });
    story = new Story();
    story.setCharacters([baseAlex]);
    ctx = new StoryContext(undefined, story);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('effect activates the named variant', () => {
    ctx.applyEffect({ type: 'setCharacterVariant', target: 'char_alex', variantId: 'introvert' } as any);
    expect(ctx.getActiveCharacterVariant('char_alex')).toBe('introvert');
  });

  it('effect with empty variantId clears the variant', () => {
    ctx.setActiveCharacterVariant('char_alex', 'introvert');
    ctx.applyEffect({ type: 'setCharacterVariant', target: 'char_alex', variantId: '' } as any);
    expect(ctx.getActiveCharacterVariant('char_alex')).toBeUndefined();
  });

  it('effect with suppressSeed keeps prior affect', () => {
    ctx.setActiveCharacterVariant('char_alex', 'introvert');
    ctx.nudgeCharacterMood('char_alex', 0.6, 0);
    const before = ctx.getCharacterMood('char_alex');
    ctx.applyEffect({
      type: 'setCharacterVariant', target: 'char_alex', variantId: 'extrovert', suppressSeed: true,
    } as any);
    expect(ctx.getCharacterMood('char_alex')).toEqual(before);
  });

  it('characterVariant condition matches the active variant', () => {
    ctx.setActiveCharacterVariant('char_alex', 'extrovert');
    expect(ctx.checkCondition({
      type: 'characterVariant', operator: '==', character: 'char_alex', variantId: 'extrovert',
    } as any)).toBe(true);
    expect(ctx.checkCondition({
      type: 'characterVariant', operator: '==', character: 'char_alex', variantId: 'introvert',
    } as any)).toBe(false);
    expect(ctx.checkCondition({
      type: 'characterVariant', operator: '!=', character: 'char_alex', variantId: 'introvert',
    } as any)).toBe(true);
  });

  it('compares to empty string when no variant is active', () => {
    expect(ctx.checkCondition({
      type: 'characterVariant', operator: '==', character: 'char_alex', variantId: '',
    } as any)).toBe(true);
  });
});

describe('defaultVariantId auto-applies at story start', () => {
  it('applies the default variant during seedCharacterAffectFromStory', () => {
    const alexWithDefault = { ...baseAlex, defaultVariantId: 'extrovert' };
    const story = new Story();
    story.setCharacters([alexWithDefault]);
    const ctx = new StoryContext(undefined, story);

    expect(ctx.getActiveCharacterVariant('char_alex')).toBe('extrovert');
    // And the variant's mood seeded.
    expect(ctx.getCharacterMood('char_alex').valence).toBeCloseTo(0.4);
  });
});

describe('Variant serialization', () => {
  it('round-trips activeCharacterVariants', () => {
    vi.stubGlobal('window', { setInterval: vi.fn().mockReturnValue(1), clearInterval: vi.fn() });
    const story = new Story();
    story.setCharacters([baseAlex]);
    const ctx = new StoryContext(undefined, story);
    ctx.setActiveCharacterVariant('char_alex', 'introvert', { seedAffect: false });
    const blob = ctx.serialize();
    expect(blob.activeCharacterVariants!.char_alex).toBe('introvert');

    const ctx2 = new StoryContext(undefined, story);
    ctx2.loadFromSerialized(blob);
    expect(ctx2.getActiveCharacterVariant('char_alex')).toBe('introvert');
    vi.unstubAllGlobals();
  });

  it('forward-compat with saves missing the field', () => {
    vi.stubGlobal('window', { setInterval: vi.fn().mockReturnValue(1), clearInterval: vi.fn() });
    const story = new Story();
    story.setCharacters([baseAlex]);
    const ctx = new StoryContext(undefined, story);
    const blob = ctx.serialize();
    delete (blob as any).activeCharacterVariants;
    const ctx2 = new StoryContext(undefined, story);
    expect(() => ctx2.loadFromSerialized(blob)).not.toThrow();
    expect(ctx2.getActiveCharacterVariant('char_alex')).toBeUndefined();
    vi.unstubAllGlobals();
  });
});
