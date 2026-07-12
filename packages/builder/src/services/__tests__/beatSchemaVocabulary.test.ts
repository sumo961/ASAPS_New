/**
 * Tests for the schema-driven beat-type vocabulary — the single source the
 * helper-command parser, helper-command AI context, and beat-suggestions
 * prompt read instead of hand-maintained lists (which had gone stale:
 * multiChoice, inputImage, keypad, updateAffect etc. were all missing).
 */
import { describe, it, expect } from 'vitest';
import {
  getAllBeatTypeIds,
  getVisibleBeatTypeIds,
  getInvisibleBeatTypeIds,
  getParameterNames,
  getBeatTypeAliases,
  resolveBeatTypeAlias,
  buildBeatTypeDigest,
} from '../beatSchemaVocabulary';

describe('type id derivation', () => {
  it('knows every schema beat type (the hand lists stopped at ~13)', () => {
    const all = getAllBeatTypeIds();
    expect(all.length).toBeGreaterThanOrEqual(30);
    for (const recent of ['multiChoice', 'inputImage', 'keypad', 'updateAffect', 'aiConversation', 'webView', 'panorama']) {
      expect(all).toContain(recent);
    }
  });

  it('splits visible (incl. xr) and invisible by schema category', () => {
    const visible = getVisibleBeatTypeIds();
    const invisible = getInvisibleBeatTypeIds();
    expect(visible).toContain('multiChoice');
    expect(visible).toContain('inputImage');
    expect(visible).toContain('keypad');
    expect(visible).toContain('gpsLocation'); // xr renders on screen
    expect(invisible).toContain('setVariable');
    expect(invisible).toContain('updateAffect');
    expect(invisible).toContain('aiCondition');
    // disjoint
    expect(visible.filter(v => invisible.includes(v))).toEqual([]);
  });

  it('exposes per-type parameter names', () => {
    expect(getParameterNames('infoText')).toContain('text');
    expect(getParameterNames('inputImage')).toContain('analysisPrompt');
    expect(getParameterNames('nope')).toEqual([]);
  });
});

describe('alias resolution', () => {
  it('resolves ids, display names, and curated shorthands', () => {
    expect(resolveBeatTypeAlias('dialogTree')).toBe('dialogTree');
    expect(resolveBeatTypeAlias('Dialog Tree')).toBe('dialogTree');
    expect(resolveBeatTypeAlias('timed')).toBe('durScreen');
    expect(resolveBeatTypeAlias('intro')).toBe('infoText');
    expect(resolveBeatTypeAlias('multi_choice')).toBe('multiChoice');
    expect(resolveBeatTypeAlias('input image')).toBe('inputImage');
    expect(resolveBeatTypeAlias('mood')).toBe('updateAffect');
  });

  it('returns null for unknowns', () => {
    expect(resolveBeatTypeAlias('flibbertigibbet')).toBe(null);
  });

  it('every alias maps to a real schema type', () => {
    const all = new Set(getAllBeatTypeIds());
    for (const target of Object.values(getBeatTypeAliases())) {
      expect(all.has(target)).toBe(true);
    }
  });
});

describe('prompt digest', () => {
  it('mentions every type id with its parameters, at a fraction of the schema size', () => {
    const digest = buildBeatTypeDigest();
    for (const id of getAllBeatTypeIds()) {
      expect(digest).toContain(`- ${id} (`);
    }
    expect(digest).toContain('analysisPrompt'); // inputImage params present
    expect(digest.length).toBeLessThan(20000); // vs ~150KB full schema JSON
  });
});
