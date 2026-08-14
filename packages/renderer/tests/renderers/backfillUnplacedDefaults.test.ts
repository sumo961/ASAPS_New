/**
 * Per-element layout fallback on a fixed canvas.
 *
 * A fixed-canvas beat used to be all-or-nothing: placing ONE element made the
 * beat "author positioned", so its text and continue button were dropped.
 * Observed live — adding a meter to a working infoText emptied the screen with
 * no indication why.
 */
import { describe, it, expect } from 'vitest';
import { backfillUnplacedDefaults } from '../../src/renderers/ReactRenderer';
import type { Location } from '@asaps/core';

const loc = (kind: string, name = kind): Location =>
  ({ kind, name, x: 0, y: 0, width: 10, height: 10 } as Location);

const DEFAULTS = [loc('text'), loc('button')];

describe('backfillUnplacedDefaults', () => {
  it('keeps a beat readable when only a meter was placed', () => {
    // The exact case: one placed meter, text and button never positioned.
    const out = backfillUnplacedDefaults(DEFAULTS, [loc('meter')]);
    expect(out.map((l) => l.kind).sort()).toEqual(['button', 'meter', 'text']);
  });

  it('never overrides what the author DID place', () => {
    const authored = { ...loc('text'), x: 999, y: 999 } as Location;
    const out = backfillUnplacedDefaults(DEFAULTS, [authored]);
    const text = out.filter((l) => l.kind === 'text');
    expect(text).toHaveLength(1);          // no duplicate default text
    expect(text[0].x).toBe(999);           // the authored one survives
  });

  it('adds nothing when every kind is already placed', () => {
    const authored = [loc('text'), loc('button')];
    expect(backfillUnplacedDefaults(DEFAULTS, authored)).toBe(authored);
  });

  it('returns the defaults untouched when nothing was placed', () => {
    expect(backfillUnplacedDefaults(DEFAULTS, [])).toBe(DEFAULTS);
    expect(backfillUnplacedDefaults(DEFAULTS, undefined)).toBe(DEFAULTS);
  });

  it('ignores characters and props when deciding what counts as placed', () => {
    // Those are an overlay, not layout — a story with only a character sprite
    // placed still needs its text back.
    const out = backfillUnplacedDefaults(DEFAULTS, [loc('character'), loc('prop')]);
    expect(out.map((l) => l.kind)).toContain('text');
    expect(out.map((l) => l.kind)).toContain('button');
  });
});
