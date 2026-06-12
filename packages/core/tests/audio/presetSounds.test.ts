/**
 * Tests for presetSounds — the built-in UI sound library. Authors
 * pick from these in the editor; the runtime resolves the id to
 * URL + volume. A broken accessor here means UI sounds silently
 * fall back to "no sound" without an obvious error.
 *
 * Coverage focus:
 *   - PRESET_SOUNDS registry shape: every entry has the required
 *     fields, valid category, volume in [0, 1]
 *   - all ids unique + match the map key (the id-as-key invariant)
 *   - getAllPresetSounds enumerates the full registry
 *   - getPresetSoundsByCategory filters correctly
 *   - getPresetSound id lookup + undefined for unknown
 *   - isPresetSound boolean check (no false-positive on '__proto__'
 *     etc — uses `in` which is fine on object literals)
 *   - getSoundCategories returns the canonical list (matches the
 *     PresetSound['category'] union)
 */
import { describe, it, expect } from 'vitest';
import {
  PRESET_SOUNDS,
  getAllPresetSounds,
  getPresetSoundsByCategory,
  getPresetSound,
  isPresetSound,
  getSoundCategories,
} from '../../src/audio/presetSounds';

describe('PRESET_SOUNDS registry', () => {
  it('has at least one entry', () => {
    // Sanity — the editor's sound picker shows this. Empty
    // registry would silently produce an empty dropdown.
    expect(Object.keys(PRESET_SOUNDS).length).toBeGreaterThan(0);
  });

  it('every entry has the required fields', () => {
    for (const sound of Object.values(PRESET_SOUNDS)) {
      expect(typeof sound.id).toBe('string');
      expect(sound.id.length).toBeGreaterThan(0);
      expect(typeof sound.name).toBe('string');
      expect(typeof sound.description).toBe('string');
      expect(typeof sound.url).toBe('string');
      expect(sound.url.length).toBeGreaterThan(0);
      expect(typeof sound.duration).toBe('number');
      expect(sound.duration).toBeGreaterThan(0);
    }
  });

  it('every category is one of the allowed values', () => {
    // Pinning the union here catches a typo'd category sneaking
    // into the registry — without this guard, a sound with
    // category:"clicks" (plural typo) would silently never show
    // up in getPresetSoundsByCategory('click').
    const allowed = ['click', 'hover', 'success', 'error', 'notification', 'transition'];
    for (const sound of Object.values(PRESET_SOUNDS)) {
      expect(allowed).toContain(sound.category);
    }
  });

  it('every volume (when set) is in [0, 1]', () => {
    for (const sound of Object.values(PRESET_SOUNDS)) {
      if (sound.volume !== undefined) {
        expect(sound.volume).toBeGreaterThanOrEqual(0);
        expect(sound.volume).toBeLessThanOrEqual(1);
      }
    }
  });

  it('each map key matches the sound\'s id (canonical-id invariant)', () => {
    // The runtime looks up by id; if the key and id disagree,
    // getPresetSound(id) would return undefined even when the
    // entry exists. Pin so a future hand-edit can't desync.
    for (const [key, sound] of Object.entries(PRESET_SOUNDS)) {
      expect(sound.id).toBe(key);
    }
  });

  it('all ids are unique', () => {
    // Object-literal keys are already unique, but pinning here
    // catches a future migration to an array-based registry
    // that would lose this property.
    const ids = Object.values(PRESET_SOUNDS).map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every URL is HTTPS (no insecure asset requests)', () => {
    // Mixed-content blocking. Authors playing previews from
    // https:// origins must not get silently failed sound
    // loads.
    for (const sound of Object.values(PRESET_SOUNDS)) {
      expect(sound.url).toMatch(/^https:\/\//);
    }
  });
});

describe('getAllPresetSounds', () => {
  it('returns every entry in the registry', () => {
    expect(getAllPresetSounds().length).toBe(Object.keys(PRESET_SOUNDS).length);
  });

  it('returns the entries (not the keys)', () => {
    const all = getAllPresetSounds();
    // Pick the first registry entry by key and verify it's in the
    // returned list.
    const firstKey = Object.keys(PRESET_SOUNDS)[0];
    expect(all.find(s => s.id === firstKey)).toBeDefined();
  });
});

describe('getPresetSoundsByCategory', () => {
  it('returns only sounds matching the category', () => {
    const clicks = getPresetSoundsByCategory('click');
    expect(clicks.length).toBeGreaterThan(0);
    expect(clicks.every(s => s.category === 'click')).toBe(true);
  });

  it('returns empty array for a category with no entries (forward-compat)', () => {
    // If a future category is added to the union but not used
    // yet, querying it returns empty rather than throwing.
    const result = getPresetSoundsByCategory('nonexistent-category' as any);
    expect(result).toEqual([]);
  });

  it('partitions all sounds across the categories', () => {
    // Sum of per-category counts must equal the total.
    const categories = getSoundCategories();
    const sum = categories.reduce(
      (acc, c) => acc + getPresetSoundsByCategory(c).length,
      0,
    );
    expect(sum).toBe(getAllPresetSounds().length);
  });
});

describe('getPresetSound', () => {
  it('returns the registry entry by id', () => {
    // Use the first id at runtime to avoid hard-coding.
    const firstId = Object.keys(PRESET_SOUNDS)[0];
    expect(getPresetSound(firstId)?.id).toBe(firstId);
  });

  it('returns undefined for an unknown id', () => {
    expect(getPresetSound('does-not-exist')).toBeUndefined();
  });

  it('returns undefined for empty-string id', () => {
    // Defensive — an empty id is "no sound selected", not
    // "find the entry with empty id".
    expect(getPresetSound('')).toBeUndefined();
  });
});

describe('isPresetSound', () => {
  it('returns true for a known id', () => {
    const firstId = Object.keys(PRESET_SOUNDS)[0];
    expect(isPresetSound(firstId)).toBe(true);
  });

  it('returns false for an unknown id', () => {
    expect(isPresetSound('does-not-exist')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isPresetSound('')).toBe(false);
  });

  it('does NOT confuse custom (asset-id) sounds with presets', () => {
    // Common runtime check: "is this id a preset, or a custom
    // user-uploaded asset id?" — assets use UUID-like ids that
    // must NOT collide with preset names.
    expect(isPresetSound('a1b2c3d4-fake-uuid')).toBe(false);
  });
});

describe('getSoundCategories', () => {
  it('returns the canonical list of 6 categories', () => {
    expect(getSoundCategories()).toEqual([
      'click', 'hover', 'success', 'error', 'notification', 'transition',
    ]);
  });

  it('matches the categories used by registry entries', () => {
    // Pin the integrity check: every registry-category is in
    // the canonical list. Catches a future entry that uses an
    // off-canonical category which would silently hide it from
    // category browsers.
    const canonical = getSoundCategories();
    for (const sound of getAllPresetSounds()) {
      expect(canonical).toContain(sound.category);
    }
  });
});
