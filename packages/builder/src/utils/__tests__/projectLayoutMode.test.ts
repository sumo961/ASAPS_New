/**
 * Tests for projectLayoutMode — the explicit-or-inferred layout-mode
 * resolution for projects.
 *
 * Critical because the resolved value gates BOTH editor controls
 * (fixed vs responsive UI) AND runtime renderer selection.
 * Mis-classification silently breaks one or the other; the
 * inference must stay conservative ("any baked locations → fixed")
 * so legacy projects stay legacy.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveLayoutMode,
  inferLayoutMode,
  layoutModeLabel,
  type BeatLike,
} from '../projectLayoutMode';
import type { GlobalSettings } from '../../storage/types';

function settingsWith(layoutMode?: 'fixed' | 'responsive'): GlobalSettings {
  return { project: layoutMode ? { layoutMode } : {} } as any;
}

const beat = (locations?: BeatLike['locations']): BeatLike => ({ locations });

describe('inferLayoutMode', () => {
  describe('no beats', () => {
    it('returns responsive for undefined beats', () => {
      // A fresh project with no beats yet is responsive by default —
      // the modern flow. Legacy projects only get classified as
      // fixed when they actually have baked locations.
      expect(inferLayoutMode(undefined)).toBe('responsive');
    });

    it('returns responsive for null beats', () => {
      expect(inferLayoutMode(null)).toBe('responsive');
    });

    it('returns responsive for empty beat list', () => {
      expect(inferLayoutMode([])).toBe('responsive');
    });
  });

  describe('beats with no baked locations', () => {
    it('returns responsive when all beats have undefined locations', () => {
      expect(inferLayoutMode([beat(), beat(), beat()])).toBe('responsive');
    });

    it('returns responsive when all beats have empty Map', () => {
      // Critical regression case from the docstring: a SchemaLocationInitializer
      // bug previously left beats with an empty Map after the skip-guard fix
      // — those are RESPONSIVE intent, not fixed.
      expect(inferLayoutMode([beat(new Map()), beat(new Map())])).toBe('responsive');
    });

    it('returns responsive when all beats have empty array', () => {
      expect(inferLayoutMode([beat([]), beat([])])).toBe('responsive');
    });

    it('returns responsive when all beats have empty object', () => {
      expect(inferLayoutMode([beat({}), beat({})])).toBe('responsive');
    });
  });

  describe('beats with baked locations → fixed', () => {
    it('returns fixed if ANY beat has a non-empty Map', () => {
      const baked = beat(new Map([['title', { x: 100, y: 100 }]]));
      expect(inferLayoutMode([beat(), baked, beat()])).toBe('fixed');
    });

    it('returns fixed if ANY beat has a non-empty array', () => {
      // Legacy projects sometimes store locations as a plain array.
      const baked = beat([{ kind: 'text', x: 100, y: 100 }]);
      expect(inferLayoutMode([beat(), baked])).toBe('fixed');
    });

    it('returns fixed if ANY beat has a non-empty object', () => {
      // Older serialization stored locations as plain { name: loc } object.
      const baked = beat({ title: { x: 100, y: 100 } });
      expect(inferLayoutMode([beat(), baked])).toBe('fixed');
    });

    it('returns fixed when only ONE beat out of many is baked', () => {
      // The conservative rule: any baked beat anchors the whole
      // project as fixed. Authors who used the VE for even one beat
      // expect the project to stay in fixed mode.
      const beats = Array(20).fill(beat());
      beats[10] = beat(new Map([['x', {}]]));
      expect(inferLayoutMode(beats)).toBe('fixed');
    });
  });
});

describe('resolveLayoutMode', () => {
  it('honors explicit "fixed" setting', () => {
    // Once the author has picked, the setting is the source of
    // truth regardless of what the inference would say.
    expect(resolveLayoutMode(settingsWith('fixed'), [])).toBe('fixed');
    // Even when there are no baked locations (which would infer
    // responsive) — author's explicit pick wins.
    expect(resolveLayoutMode(settingsWith('fixed'), [beat(), beat()])).toBe('fixed');
  });

  it('honors explicit "responsive" setting', () => {
    expect(resolveLayoutMode(settingsWith('responsive'), [])).toBe('responsive');
    // Author picked responsive — even if their beats happen to
    // have baked locations (mid-migration), the explicit pick is
    // authoritative.
    const baked = beat(new Map([['x', {}]]));
    expect(resolveLayoutMode(settingsWith('responsive'), [baked])).toBe('responsive');
  });

  it('infers when settings is undefined (legacy project loaded)', () => {
    expect(resolveLayoutMode(undefined, [])).toBe('responsive');
    expect(resolveLayoutMode(undefined, [beat(new Map([['x', {}]]))])).toBe('fixed');
  });

  it('infers when project.layoutMode is undefined', () => {
    expect(resolveLayoutMode(settingsWith(undefined), [beat()])).toBe('responsive');
    expect(resolveLayoutMode(settingsWith(undefined), [beat(new Map([['x', {}]]))])).toBe('fixed');
  });

  it('ignores invalid layoutMode values, falls back to inference', () => {
    // Defensive: a corrupted project file could have layoutMode:
    // 'invalid' — the resolver only accepts the two valid strings
    // and otherwise infers.
    const bad = { project: { layoutMode: 'invalid' as any } } as any;
    expect(resolveLayoutMode(bad, [])).toBe('responsive');
    expect(resolveLayoutMode(bad, [beat(new Map([['x', {}]]))])).toBe('fixed');
  });
});

describe('layoutModeLabel', () => {
  it('returns "Responsive layout" for responsive', () => {
    // Pinned because the header badge reads exactly this string.
    // Changing the label is a UI change that should be deliberate.
    expect(layoutModeLabel('responsive')).toBe('Responsive layout');
  });

  it('returns "Fixed canvas" for fixed', () => {
    expect(layoutModeLabel('fixed')).toBe('Fixed canvas');
  });
});
