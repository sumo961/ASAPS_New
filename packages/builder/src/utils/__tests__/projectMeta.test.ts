/**
 * Tests for getProjectMeta, the helper that powers the Project
 * Browser cards' badge row (`11 beats · Responsive · 3 characters`).
 *
 * Defensive shape — Browser cards must never crash on a malformed
 * project. listProjects() returns whatever it finds in storage,
 * including legacy ASML imports that may lack story.layoutMode and
 * older projects with no characters array.
 */
import { describe, it, expect } from 'vitest';
import { getProjectMeta } from '../projectMeta';
import type { Project } from '../../storage/types';

// Minimal shape factory — keeps each case focused on the field
// under test without typing out the full Project surface.
function makeProject(overrides: Record<string, any> = {}): Project {
  return {
    id: 'p1',
    name: 'Test Project',
    description: '',
    modifiedAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  } as any;
}

describe('getProjectMeta', () => {
  describe('beat count', () => {
    it('counts beats from project.story.beats', () => {
      const p = makeProject({
        story: { beats: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] },
      });
      expect(getProjectMeta(p).beatCount).toBe(3);
    });

    it('returns 0 for an empty beats array', () => {
      expect(getProjectMeta(makeProject({ story: { beats: [] } })).beatCount).toBe(0);
    });

    it('returns 0 when story is missing entirely', () => {
      // listProjects may return rows where story didn't deserialize
      // (corrupt project, migration in progress). The card needs to
      // still render — beatCount=0 is honest.
      expect(getProjectMeta(makeProject({})).beatCount).toBe(0);
    });

    it('returns 0 when beats is not an array', () => {
      // Legacy ASML imports occasionally leave beats as undefined or
      // even {} during a partial migration.
      expect(getProjectMeta(makeProject({ story: { beats: null } })).beatCount).toBe(0);
      expect(getProjectMeta(makeProject({ story: { beats: 'oops' } })).beatCount).toBe(0);
      expect(getProjectMeta(makeProject({ story: {} })).beatCount).toBe(0);
    });
  });

  describe('layout label', () => {
    it('reads layoutMode "responsive" off story', () => {
      const p = makeProject({ story: { layoutMode: 'responsive' } });
      expect(getProjectMeta(p).layoutLabel).toBe('Responsive');
    });

    it('reads layoutMode "fixed" off story', () => {
      const p = makeProject({ story: { layoutMode: 'fixed' } });
      expect(getProjectMeta(p).layoutLabel).toBe('Fixed');
    });

    it('falls back to story.globalSettings.layoutMode when story.layoutMode is absent', () => {
      // Older projects stored layoutMode on globalSettings before
      // the field was promoted. The badge logic checks both.
      const p = makeProject({
        story: { globalSettings: { layoutMode: 'responsive' } },
      });
      expect(getProjectMeta(p).layoutLabel).toBe('Responsive');
    });

    it('returns null when layoutMode is missing in both places', () => {
      // Legacy ASML imports that never declared a layout. The badge
      // row drops the layout chip entirely rather than fabricating
      // a "Mixed" or "Unknown" label.
      expect(getProjectMeta(makeProject({ story: {} })).layoutLabel).toBeNull();
      expect(getProjectMeta(makeProject({})).layoutLabel).toBeNull();
    });

    it('returns null for unknown layoutMode values', () => {
      // A future layoutMode the current build doesn't recognize
      // should drop out instead of rendering as 'Unknown'. Keeps
      // forward-compat clean.
      const p = makeProject({ story: { layoutMode: 'future-mode' } });
      expect(getProjectMeta(p).layoutLabel).toBeNull();
    });
  });

  describe('character count', () => {
    it('counts characters from story.characters', () => {
      const p = makeProject({
        story: {
          characters: [{ id: 'alice' }, { id: 'bob' }],
        },
      });
      expect(getProjectMeta(p).characterCount).toBe(2);
    });

    it('returns 0 for empty characters array', () => {
      const p = makeProject({ story: { characters: [] } });
      expect(getProjectMeta(p).characterCount).toBe(0);
    });

    it('returns 0 when characters field is missing', () => {
      // The most common case — most projects don't author named
      // characters. The badge logic drops the chip via a guard in
      // the caller; this helper just reports 0.
      expect(getProjectMeta(makeProject({ story: {} })).characterCount).toBe(0);
    });

    it('returns 0 when characters is not an array', () => {
      const p = makeProject({ story: { characters: 'not an array' } });
      expect(getProjectMeta(p).characterCount).toBe(0);
    });
  });

  describe('combined shapes (regression for real-world projects)', () => {
    it('handles a typical responsive project', () => {
      const p = makeProject({
        story: {
          layoutMode: 'responsive',
          beats: new Array(11).fill({ id: 'x' }),
          characters: [{ id: 'a' }],
        },
      });
      expect(getProjectMeta(p)).toEqual({
        beatCount: 11,
        layoutLabel: 'Responsive',
        characterCount: 1,
      });
    });

    it('handles a never-edited project (empty story)', () => {
      // The Browser shows "empty project" in italics when all three
      // fields are zero/null. This is the input that triggers that.
      const p = makeProject({ story: {} });
      expect(getProjectMeta(p)).toEqual({
        beatCount: 0,
        layoutLabel: null,
        characterCount: 0,
      });
    });

    it('handles a legacy ASML import (no layout, has beats + characters)', () => {
      const p = makeProject({
        story: {
          beats: new Array(95).fill({ id: 'x' }),
          characters: new Array(5).fill({ id: 'x' }),
        },
      });
      expect(getProjectMeta(p)).toEqual({
        beatCount: 95,
        layoutLabel: null,
        characterCount: 5,
      });
    });
  });
});
