import { describe, it, expect } from 'vitest';
import { normalizeTranslationResources, syncTranslation } from '../../src/translation';

describe('normalizeTranslationResources', () => {
  it('loads the minimal resource that used to fail the whole project (no _sourceSnapshot)', () => {
    const minimal = { languageCode: 'sv', languageName: 'Swedish', origin: 'human', direction: 'ltr', requiredFonts: [], sourceHash: '', strings: {} };
    expect(() => syncTranslation(minimal as any, { a: 'Hello' })).toThrow();
    const [r] = normalizeTranslationResources([minimal]);
    expect(r._sourceSnapshot).toEqual({});
    expect(() => syncTranslation(r, { a: 'Hello' })).not.toThrow();
  });

  it('fills missing fields, keeps what is there, and drops entries it cannot use', () => {
    const out = normalizeTranslationResources([
      { languageCode: 'ar', direction: 'rtl', strings: { a: 'مرحبا', b: { value: 'x', status: 'stale' }, c: 42 } },
      { languageName: 'no code' },
      null,
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ languageCode: 'ar', languageName: 'ar', direction: 'rtl', requiredFonts: [], sourceHash: '' });
    expect(out[0].strings).toEqual({ a: { value: 'مرحبا', status: 'translated' }, b: { value: 'x', status: 'stale' } });
    expect(normalizeTranslationResources(undefined)).toEqual([]);
  });
});
