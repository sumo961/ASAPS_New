import { describe, it, expect } from 'vitest';
import { DEFAULT_EFFECT_TEMPLATES, findEffectTemplate } from '../effectTemplates';

describe('DEFAULT_EFFECT_TEMPLATES library', () => {
  it('ships a non-empty library with stable unique ids', () => {
    expect(DEFAULT_EFFECT_TEMPLATES.length).toBeGreaterThan(5);
    const ids = DEFAULT_EFFECT_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every template has a name + description', () => {
    for (const t of DEFAULT_EFFECT_TEMPLATES) {
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
    }
  });

  it('forge() with no project counters produces no incrementCounter rows', () => {
    for (const t of DEFAULT_EFFECT_TEMPLATES) {
      const fx = t.forge({ target: 'char_x', playerRef: 'player', counters: [] });
      expect(fx.every((e) => e.type !== 'incrementCounter')).toBe(true);
    }
  });

  it('forge() with all counters present yields the counter increments', () => {
    const counters = ['supportScore', 'maxSupport', 'partialSupport', 'failedSupport'];
    const t = findEffectTemplate('empathetic-max')!;
    const fx = t.forge({ target: 'char_alex', playerRef: 'player', counters });
    const counterFx = fx.filter((e) => e.type === 'incrementCounter');
    expect(counterFx.length).toBeGreaterThan(0);
    expect(counterFx.some((e) => e.target === 'supportScore' && e.value === 2)).toBe(true);
    expect(counterFx.some((e) => e.target === 'maxSupport' && e.value === 1)).toBe(true);
  });

  it("'empathetic-max' template targets the passed character on every affect effect", () => {
    const t = findEffectTemplate('empathetic-max')!;
    const fx = t.forge({ target: 'char_alex', playerRef: 'player', counters: [] });
    for (const e of fx) {
      if (e.type === 'incrementCounter') continue;
      expect((e as any).target).toBe('char_alex');
    }
  });

  it("'empathetic-max' template seeds positive trust toward the player", () => {
    const t = findEffectTemplate('empathetic-max')!;
    const fx = t.forge({ target: 'char_alex', playerRef: 'player', counters: [] });
    const trust = fx.find((e: any) => e.type === 'addSentiment'
      && e.sentimentTarget === 'player' && e.sentimentEmotion === 'trust');
    expect(trust).toBeDefined();
    expect((trust as any).strengthDelta).toBeGreaterThan(0);
  });

  it("'pushy-dismissive' template erodes trust (negative strengthDelta)", () => {
    const t = findEffectTemplate('pushy-dismissive')!;
    const fx = t.forge({ target: 'char_alex', playerRef: 'player', counters: [] });
    const trust = fx.find((e: any) => e.type === 'addSentiment'
      && e.sentimentTarget === 'player' && e.sentimentEmotion === 'trust');
    expect(trust).toBeDefined();
    expect((trust as any).strengthDelta).toBeLessThan(0);
  });

  it('templates that touch self-shame do so with a self-directed sentiment', () => {
    // Empathetic max should reduce self-shame; pushy should add to it.
    const max = findEffectTemplate('empathetic-max')!.forge({ target: 'char_alex', playerRef: 'player', counters: [] });
    const pushy = findEffectTemplate('pushy-dismissive')!.forge({ target: 'char_alex', playerRef: 'player', counters: [] });
    const findShame = (fx: any[]) => fx.find((e) => e.type === 'addSentiment'
      && e.sentimentTarget === 'char_alex' && e.sentimentEmotion === 'shame');
    const maxShame = findShame(max);
    const pushyShame = findShame(pushy);
    expect(maxShame).toBeDefined();
    expect(pushyShame).toBeDefined();
    expect((maxShame as any).strengthDelta).toBeLessThan(0);
    expect((pushyShame as any).strengthDelta).toBeGreaterThan(0);
  });

  it('"recovery-quiet" template uses no sentiments (just mood + emotion)', () => {
    const t = findEffectTemplate('recovery-quiet')!;
    const fx = t.forge({ target: 'char_alex', playerRef: 'player', counters: ['partialSupport'] });
    expect(fx.every((e) => e.type !== 'addSentiment')).toBe(true);
    expect(fx.some((e) => e.type === 'nudgeMood')).toBe(true);
    expect(fx.some((e) => e.type === 'fireEmotion')).toBe(true);
  });
});

describe('findEffectTemplate', () => {
  it('returns the matching template by id', () => {
    expect(findEffectTemplate('empathetic-max')?.id).toBe('empathetic-max');
  });

  it('returns undefined for unknown / empty ids', () => {
    expect(findEffectTemplate('nope')).toBeUndefined();
    expect(findEffectTemplate('')).toBeUndefined();
  });
});
