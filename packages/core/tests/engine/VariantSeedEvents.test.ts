/**
 * Verifies that setActiveCharacterVariant re-seeds mood from the merged
 * variant AND emits characterMoodChanged so the HUD overlay can refresh.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Story } from '../../src/engine/Story';
import { StoryContext } from '../../src/engine/StoryContext';

const alex = {
  id: 'char_alex',
  name: 'Alex',
  variants: [
    { id: 'free-spirit', name: 'Free Spirit', initialMood: { valence: 0.25, arousal: 0.30 } },
    { id: 'anxious', name: 'Anxious', initialMood: { valence: -0.20, arousal: -0.10 } },
  ],
};

describe('Variant pick re-seeds mood and emits event', () => {
  let story: Story;
  let ctx: StoryContext;

  beforeEach(() => {
    vi.stubGlobal('window', { setInterval: vi.fn().mockReturnValue(1), clearInterval: vi.fn() });
    story = new Story();
    story.setCharacters([alex]);
    ctx = new StoryContext(undefined, story);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('starts with neutral mood when no defaultVariantId is set', () => {
    const m = ctx.getCharacterMood('char_alex');
    expect(m.valence).toBe(0);
    expect(m.arousal).toBe(0);
  });

  it("setActiveCharacterVariant('free-spirit') re-seeds mood and emits", () => {
    const handler = vi.fn();
    ctx.on('characterMoodChanged', handler);
    ctx.setActiveCharacterVariant('char_alex', 'free-spirit');
    const m = ctx.getCharacterMood('char_alex');
    expect(m.valence).toBeCloseTo(0.25);
    expect(m.arousal).toBeCloseTo(0.30);
    expect(handler).toHaveBeenCalled();
    expect(handler.mock.calls[0][0].mood.valence).toBeCloseTo(0.25);
  });

  it("setCharacterVariant Effect dispatch re-seeds mood and emits", () => {
    const handler = vi.fn();
    ctx.on('characterMoodChanged', handler);
    ctx.applyEffect({ type: 'setCharacterVariant', target: 'char_alex', variantId: 'anxious' } as any);
    const m = ctx.getCharacterMood('char_alex');
    expect(m.valence).toBeCloseTo(-0.20);
    expect(m.arousal).toBeCloseTo(-0.10);
    expect(handler).toHaveBeenCalled();
  });

  it('switching variants from free-spirit to anxious re-seeds and emits', () => {
    ctx.setActiveCharacterVariant('char_alex', 'free-spirit');
    const handler = vi.fn();
    ctx.on('characterMoodChanged', handler);
    ctx.setActiveCharacterVariant('char_alex', 'anxious');
    const m = ctx.getCharacterMood('char_alex');
    expect(m.valence).toBeCloseTo(-0.20);
    expect(m.arousal).toBeCloseTo(-0.10);
    expect(handler).toHaveBeenCalled();
  });
});
