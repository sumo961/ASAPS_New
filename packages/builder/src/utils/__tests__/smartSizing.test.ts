/**
 * Tests for smartSizing — auto font-size + text-align helpers used
 * when CREATING new elements in the editor (giving them sensible
 * initial values). The render-time auto-sizing lives in
 * PositionedBeatView; this is the pre-fill mirror so the editor
 * shows the same shape the renderer will produce.
 *
 * Coverage focus:
 *   - title/author elements use theme.titleFontSize when set
 *   - non-title elements use theme.textFontSize when set
 *   - falls back to content-length-based auto-size when theme
 *     values are missing
 *   - the content-length thresholds (400+/200+/80+/<30/default)
 *   - locationName matching is case-insensitive (case-insensitive
 *     substring of 'title' or 'author')
 *   - text alignment: short content centered, long content
 *     left-aligned
 */
import { describe, it, expect } from 'vitest';
import { computeAutoFontSize, computeAutoTextAlign } from '../smartSizing';
import type { RenderThemeSettings } from '@asaps/renderer';

/** Build a minimal theme; only the fonts.X values matter for these. */
function theme(opts: { titleFontSize?: number; textFontSize?: number } = {}): RenderThemeSettings {
  return {
    fonts: {
      titleFont: 'Arial',
      textFont: 'Arial',
      buttonFont: 'Arial',
      titleFontSize: opts.titleFontSize,
      textFontSize: opts.textFontSize,
    },
  } as any;
}

describe('computeAutoFontSize', () => {
  describe('theme override path', () => {
    it('uses theme.titleFontSize when locationName contains "title"', () => {
      expect(computeAutoFontSize('Hello', 'title', theme({ titleFontSize: 48 }))).toBe(48);
    });

    it('uses theme.titleFontSize when locationName contains "author" too', () => {
      // The title-family check matches BOTH title and author —
      // typical credits cluster has the author name styled like
      // the title.
      expect(computeAutoFontSize('Hello', 'author', theme({ titleFontSize: 40 }))).toBe(40);
    });

    it('is case-insensitive on locationName', () => {
      // Authors capitalize inconsistently — "Title", "TITLE", and
      // "title" all behave the same.
      expect(computeAutoFontSize('Hi', 'Title', theme({ titleFontSize: 32 }))).toBe(32);
      expect(computeAutoFontSize('Hi', 'TITLE', theme({ titleFontSize: 32 }))).toBe(32);
    });

    it('uses theme.textFontSize for non-title elements', () => {
      expect(computeAutoFontSize('text content', 'dialog', theme({ textFontSize: 14 }))).toBe(14);
    });

    it('falls through to auto-sizing when titleFontSize is not set on a title element', () => {
      // Theme override is OPTIONAL — if not set, auto-size from
      // content length. Short content like "Hi" lands in the
      // largest bucket.
      expect(computeAutoFontSize('Hi', 'title', theme())).toBe(36);
    });

    it('falls through to auto-sizing when textFontSize is not set on a body element', () => {
      const result = computeAutoFontSize(
        'medium length text that should land in the default bucket',
        'dialog',
        theme(),
      );
      // 56 chars → in the < 30 vs default range; not <30, so 16.
      expect(result).toBe(16);
    });
  });

  describe('content-length thresholds', () => {
    it('returns 11 for content > 400 chars', () => {
      // The "long literary endScreen ending" bucket — shrinks
      // text to fit without scrolling.
      const long = 'x'.repeat(401);
      expect(computeAutoFontSize(long, 'message', theme())).toBe(11);
    });

    it('returns 12 for content between 200 and 400 chars', () => {
      const medLong = 'x'.repeat(300);
      expect(computeAutoFontSize(medLong, 'message', theme())).toBe(12);
    });

    it('returns 14 for content between 80 and 200 chars', () => {
      const med = 'x'.repeat(150);
      expect(computeAutoFontSize(med, 'message', theme())).toBe(14);
    });

    it('returns 16 for content between 30 and 80 chars (the default)', () => {
      const normal = 'x'.repeat(50);
      expect(computeAutoFontSize(normal, 'message', theme())).toBe(16);
    });

    it('returns 36 for very short content (< 30 chars)', () => {
      // Short content gets the "big and punchy" size — typical
      // for one-word labels or the "The End" message.
      expect(computeAutoFontSize('The End', 'message', theme())).toBe(36);
    });
  });

  describe('boundary values', () => {
    it('200 chars stays in the 14 bucket (not 12)', () => {
      // Threshold is "> 200" → 200 doesn't qualify.
      expect(computeAutoFontSize('x'.repeat(200), 'message', theme())).toBe(14);
    });

    it('400 chars stays in the 12 bucket (not 11)', () => {
      expect(computeAutoFontSize('x'.repeat(400), 'message', theme())).toBe(12);
    });

    it('80 chars stays in the 16 bucket (not 14)', () => {
      expect(computeAutoFontSize('x'.repeat(80), 'message', theme())).toBe(16);
    });

    it('29 chars qualifies as < 30 (gets the 36 bucket)', () => {
      // Threshold is "< 30" → 29 qualifies, 30 does not.
      expect(computeAutoFontSize('x'.repeat(29), 'message', theme())).toBe(36);
    });

    it('30 chars does NOT qualify as < 30 (gets default 16)', () => {
      expect(computeAutoFontSize('x'.repeat(30), 'message', theme())).toBe(16);
    });
  });

  describe('defensive content', () => {
    it('treats empty content as length 0 (< 30 bucket)', () => {
      expect(computeAutoFontSize('', 'message', theme())).toBe(36);
    });

    it('handles null/undefined content gracefully', () => {
      // content?.length || 0 — guards against undefined.
      expect(computeAutoFontSize(undefined as any, 'message', theme())).toBe(36);
      expect(computeAutoFontSize(null as any, 'message', theme())).toBe(36);
    });

    it('handles null/undefined locationName gracefully', () => {
      // locationName?.toLowerCase() — no crash on undefined.
      expect(() => computeAutoFontSize('x', undefined as any, theme())).not.toThrow();
    });
  });
});

describe('computeAutoTextAlign', () => {
  it('returns "center" for short content (≤ 200 chars)', () => {
    // Short headlines / labels look best centered.
    expect(computeAutoTextAlign('short')).toBe('center');
    expect(computeAutoTextAlign('x'.repeat(200))).toBe('center');
  });

  it('returns "left" for long content (> 200 chars)', () => {
    // Long body text reads better left-aligned (centered long
    // text gives an unsteady left margin).
    expect(computeAutoTextAlign('x'.repeat(201))).toBe('left');
    expect(computeAutoTextAlign('x'.repeat(1000))).toBe('left');
  });

  it('handles empty content (centers)', () => {
    expect(computeAutoTextAlign('')).toBe('center');
  });

  it('handles undefined content', () => {
    expect(computeAutoTextAlign(undefined as any)).toBe('center');
  });
});
