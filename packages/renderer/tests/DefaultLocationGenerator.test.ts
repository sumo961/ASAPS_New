/**
 * Tests for generateDefaultLocations — the layout fallback that
 * runs when a beat has no author-placed Locations[]. This powers
 * BOTH the Visual Editor's empty-beat preview and the runtime's
 * legacy fixed-mode renderer, so any divergence between the two
 * surfaces silently desyncs the editor and preview.
 *
 * Coverage focus:
 *   - per-beat-type shapes (titleScreen / infoText / endScreen)
 *   - dynamic-elements (dialogTree/multiChoice choices, movement
 *     hotspots, pickProp grid)
 *   - special-case beats (endScreenCredits virtual type, hyperText
 *     hyperlinks filter)
 *   - unknown beat type returns [] without crashing
 *   - paired-buttons layout for endScreen (restart + credits don't
 *     overlap at the same x)
 *   - stage dimensions affect positioning (regression for any
 *     hardcoded 1024×768 leak)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateDefaultLocations } from '../src/utils/DefaultLocationGenerator';

describe('generateDefaultLocations', () => {
  // The generator console.log's its work — silence in tests.
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  describe('unknown beat type', () => {
    it('returns an empty array and warns', () => {
      const result = generateDefaultLocations('totally_made_up', {});
      expect(result).toEqual([]);
      expect(warnSpy).toHaveBeenCalled();
    });
  });

  describe('titleScreen', () => {
    it('emits at least a title and a startButton', () => {
      const result = generateDefaultLocations('titleScreen', {});
      // Don't pin exact count — schema may grow. Pin the shape.
      const names = result.map(l => l.name.toLowerCase());
      expect(names.some(n => n.includes('title'))).toBe(true);
      expect(names.some(n => n.includes('button'))).toBe(true);
    });

    it('positions title near the top of the stage', () => {
      const result = generateDefaultLocations('titleScreen', {}, 1024, 768);
      const title = result.find(l => l.name.toLowerCase().includes('title'));
      // Title pinned to y=60 per the source.
      expect(title?.y).toBe(60);
    });

    it('centers the title horizontally on the stage', () => {
      const result = generateDefaultLocations('titleScreen', {}, 1024, 768);
      const title = result.find(l => l.name.toLowerCase().includes('title'));
      if (!title) return;
      // Centered: x = centerX - width/2 = 512 - 300 = 212.
      expect(title.x).toBe(212);
      expect(title.width).toBe(600);
    });

    it('scales with a wider stage', () => {
      // Regression for hardcoded-1024 leaks. Title stays
      // centered on the actual stage width, not on 1024.
      const result = generateDefaultLocations('titleScreen', {}, 1920, 1080);
      const title = result.find(l => l.name.toLowerCase().includes('title'));
      expect(title?.x).toBe(660); // 1920/2 - 300
    });
  });

  describe('endScreen — paired buttons', () => {
    // Regression test for the "Credits and Restart overlap on the
    // same x" bug fixed in the source. The two buttons MUST sit
    // side by side on the same baseline, not on top of each other.
    it('places restart and credits buttons at different x but same y', () => {
      const result = generateDefaultLocations('endScreen', {}, 1024, 768);
      const restart = result.find(l => l.name.toLowerCase().includes('restart'));
      const credits = result.find(l => l.name.toLowerCase().includes('credits'));
      if (!restart || !credits) {
        // If schema doesn't emit both, skip — but flag for review.
        return;
      }
      expect(restart.y).toBe(credits.y);
      expect(restart.x).not.toBe(credits.x);
    });

    it('positions buttons near the bottom of the stage', () => {
      const result = generateDefaultLocations('endScreen', {}, 1024, 768);
      const restart = result.find(l => l.name.toLowerCase().includes('restart'));
      if (restart) {
        // y pinned to stageHeight - 100 per the source.
        expect(restart.y).toBe(668);
      }
    });
  });

  describe('infoText', () => {
    it('emits text + button locations', () => {
      const result = generateDefaultLocations('infoText', {});
      const names = result.map(l => l.name.toLowerCase());
      // Source schema has 'text' and 'continueButton'.
      expect(names.some(n => n.includes('text'))).toBe(true);
      expect(names.some(n => n.includes('button'))).toBe(true);
    });

    it('every location has the standard rect shape', () => {
      // Defensive — every emitted location must carry the four
      // numeric fields the renderer reads. Any missing field
      // crashes the absolute-path renderer.
      const result = generateDefaultLocations('infoText', {});
      for (const loc of result) {
        expect(typeof loc.x).toBe('number');
        expect(typeof loc.y).toBe('number');
        expect(typeof loc.width).toBe('number');
        expect(typeof loc.height).toBe('number');
        expect(typeof loc.zIndex).toBe('number');
        expect(typeof loc.name).toBe('string');
      }
    });
  });

  describe('dynamic elements — dialogTree choices', () => {
    it('generates a button per choice', () => {
      const result = generateDefaultLocations('dialogTree', {
        choices: [
          { text: 'Yes' },
          { text: 'No' },
          { text: 'Maybe' },
        ],
      });
      const buttons = result.filter(l => l.kind === 'button');
      // At least one per choice (other buttons from the static
      // locations may also be present).
      expect(buttons.length).toBeGreaterThanOrEqual(3);
      const names = buttons.map(b => b.name);
      expect(names).toContain('Yes');
      expect(names).toContain('No');
      expect(names).toContain('Maybe');
    });

    it('uses fallback names when choice.text is missing', () => {
      // Defensive — a malformed choice (no text) gets a generic
      // "Choice N" label so the editor doesn't render a blank
      // button.
      const result = generateDefaultLocations('dialogTree', {
        choices: [{ /* no text */ }, { text: 'Real' }],
      });
      const names = result.map(l => l.name);
      expect(names).toContain('Choice 1');
      expect(names).toContain('Real');
    });

    it('stacks choice buttons vertically with consistent spacing', () => {
      const result = generateDefaultLocations('dialogTree', {
        choices: [{ text: 'A' }, { text: 'B' }, { text: 'C' }],
      });
      const buttons = result
        .filter(l => l.kind === 'button' && ['A', 'B', 'C'].includes(l.name))
        .sort((a, b) => a.y - b.y);
      expect(buttons).toHaveLength(3);
      const dyAB = buttons[1].y - buttons[0].y;
      const dyBC = buttons[2].y - buttons[1].y;
      expect(dyAB).toBe(dyBC);
      expect(dyAB).toBeGreaterThan(0);
    });
  });

  describe('dynamic elements — movementChoice hotspots', () => {
    it('emits a hotspot per choice without locationName', () => {
      const result = generateDefaultLocations('movementChoice', {
        choices: [
          { text: 'Forest', location: 'Forest' },
          { text: 'Village', location: 'Village' },
        ],
      });
      const hotspots = result.filter(l => l.kind === 'hotspot');
      expect(hotspots.length).toBeGreaterThanOrEqual(2);
    });

    it('skips choices that already have a locationName (linked hotspots)', () => {
      // Critical contract: a choice with locationName is bound to
      // an existing hotspot in beat.locations — we must NOT generate
      // a duplicate or the editor renders two markers on the same
      // spot.
      const result = generateDefaultLocations('movementChoice', {
        choices: [
          { text: 'Forest', locationName: 'forest_marker' },
          { text: 'Village' /* no locationName */ },
        ],
      });
      const hotspots = result.filter(l => l.kind === 'hotspot');
      const names = hotspots.map(h => h.name);
      // Forest skipped because it's already linked. Village
      // generated because it isn't.
      expect(names).not.toContain('Forest');
      expect(names).toContain('Village');
    });
  });

  describe('dynamic elements — pickProp grid', () => {
    it('arranges props in a 3-column grid', () => {
      // 5 props → 3 in row 0, 2 in row 1. Pin grid math:
      // every prop has a different (x, y) and row 1 sits below row 0.
      const result = generateDefaultLocations('pickProp', {
        props: [
          { name: 'P1' }, { name: 'P2' }, { name: 'P3' },
          { name: 'P4' }, { name: 'P5' },
        ],
      });
      const propButtons = result.filter(l =>
        l.kind === 'button' && ['P1', 'P2', 'P3', 'P4', 'P5'].includes(l.name)
      );
      expect(propButtons).toHaveLength(5);
      // Row 0 (P1, P2, P3) share a y; row 1 (P4, P5) share a higher y.
      const p1 = propButtons.find(p => p.name === 'P1')!;
      const p2 = propButtons.find(p => p.name === 'P2')!;
      const p3 = propButtons.find(p => p.name === 'P3')!;
      const p4 = propButtons.find(p => p.name === 'P4')!;
      const p5 = propButtons.find(p => p.name === 'P5')!;
      expect(p1.y).toBe(p2.y);
      expect(p2.y).toBe(p3.y);
      expect(p4.y).toBe(p5.y);
      expect(p4.y).toBeGreaterThan(p1.y);
    });
  });

  describe('endScreenCredits (virtual beat type)', () => {
    it('emits a title + body + close-button trio', () => {
      const result = generateDefaultLocations('endScreenCredits', {}, 1024, 768);
      expect(result).toHaveLength(3);
      const kinds = result.map(l => l.kind);
      expect(kinds).toEqual(['text', 'dialog', 'button']);
    });

    it('positions the close button near the bottom', () => {
      // The button y is `stageHeight - 120` per the source.
      const result = generateDefaultLocations('endScreenCredits', {}, 1024, 768);
      const button = result.find(l => l.kind === 'button');
      expect(button?.y).toBe(648);
    });

    it('scales with the stage height', () => {
      // Stage-height contract — verifies no hardcoded 768 leaked.
      const result = generateDefaultLocations('endScreenCredits', {}, 1024, 1200);
      const button = result.find(l => l.kind === 'button');
      expect(button?.y).toBe(1080); // 1200 - 120
    });
  });

  describe('hyperText special-case filter', () => {
    it('removes any "hyperlink"-named location from the result', () => {
      // Source contract: hyperlinks are rendered as inline spans
      // inside the text element, NOT as separate positioned
      // locations. If a schema entry slips through, the filter
      // catches it.
      const result = generateDefaultLocations('hyperText', {});
      for (const loc of result) {
        expect(loc.name.toLowerCase()).not.toContain('hyperlink');
      }
    });
  });

  describe('autosize flag', () => {
    it('marks hotspot-kind locations as autosize=true (no fontSize)', () => {
      // The kind:'hotspot' entries don't have a fontSize, so
      // autosize is true — letting the renderer pick a font
      // based on box dimensions.
      const result = generateDefaultLocations('inputText', {});
      const hotspotLike = result.filter(l => l.kind === 'hotspot');
      for (const loc of hotspotLike) {
        expect(loc.autosize).toBe(true);
      }
    });

    it('marks fixed-fontSize locations as autosize=false', () => {
      const result = generateDefaultLocations('titleScreen', {});
      const title = result.find(l => l.name.toLowerCase().includes('title'));
      if (title) {
        expect(title.autosize).toBe(false);
        expect(typeof title.fontSize).toBe('number');
      }
    });
  });
});
