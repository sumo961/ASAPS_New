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

describe('legacy ASML text locations count as placed (name matching)', () => {
  // Red Riding Hood regression (2026-08): legacy imports bake the beat's main
  // text into a location NAMED 'text' with KIND 'text', filled by name at
  // render time. The schema default for the same box is kind 'dialog', so
  // kind-matching alone re-added a duplicate question/text box in both the
  // Visual Editor and the preview.
  const named = (kind: string, name: string): Location =>
    ({ kind, name, x: 0, y: 0, width: 10, height: 10 } as Location);

  it('does not duplicate a movementChoice question over a legacy text location', () => {
    // movementChoice_7.json: locations text(kind text) + hotspots + characters;
    // default is name 'Question', kind 'dialog'.
    const authored = [
      named('text', 'text'),
      named('hotspot', 'tree'),
      named('hotspot', 'path'),
      named('character', 'wolf'),
      named('character', 'Red'),
    ];
    const out = backfillUnplacedDefaults([named('dialog', 'Question')], authored);
    expect(out).toBe(authored);
  });

  it('does not duplicate a durScreen text over a legacy text location', () => {
    // durScreen_9.json: locations text(kind text) + character; default is
    // name 'Text', kind 'dialog' — same name, different kind.
    const authored = [named('text', 'text'), named('character', 'Red')];
    const out = backfillUnplacedDefaults([named('dialog', 'Text')], authored);
    expect(out).toBe(authored);
  });

  it('does not duplicate pickProp buttons over same-named authored props', () => {
    // pickProp_5.json: props baked as locations NAMED like the props (kind
    // 'prop'); the schema default generates a BUTTON per prop with the same
    // name. Three phantom buttons rendered next to the real clickable props.
    const authored = [
      named('text', 'text'),
      named('prop', 'knife'),
      named('prop', 'sweets'),
      named('prop', 'book'),
    ];
    const out = backfillUnplacedDefaults(
      [named('dialog', 'Question'), named('button', 'sweets'), named('button', 'knife'), named('button', 'book')],
      authored,
    );
    expect(out).toBe(authored);
  });

  it('still backfills a button whose name has no authored counterpart', () => {
    const authored = [named('text', 'text'), named('prop', 'sweets')];
    const out = backfillUnplacedDefaults(
      [named('button', 'sweets'), named('button', 'lantern')],
      authored,
    );
    expect(out.map((l) => l.name)).toContain('lantern');
    expect(out.filter((l) => l.name === 'sweets')).toHaveLength(1);
  });

  it('matches names case-insensitively', () => {
    const authored = [named('text', 'Prompt')];
    const out = backfillUnplacedDefaults([named('dialog', 'prompt')], authored);
    expect(out).toBe(authored);
  });

  it('still backfills text-kind defaults whose name was never placed', () => {
    // aiSummary-style beat: a placed title (kind text) must not suppress the
    // summary body (kind dialog, different name).
    const authored = [named('text', 'Title')];
    const out = backfillUnplacedDefaults(
      [named('text', 'Title'), named('dialog', 'Summary'), named('button', 'Restart Button')],
      authored,
    );
    expect(out.map((l) => l.name)).toContain('Summary');
    expect(out.map((l) => l.name)).toContain('Restart Button');
  });
});

describe('backfilled defaults do not land on authored elements', () => {
  const at = (kind: string, x: number, y: number, w = 100, h = 40): Location =>
    ({ kind, name: kind, x, y, width: w, height: h } as Location);

  it('drops a colliding default below what the author placed', () => {
    // The live symptom: a default text box rendered straight under a placed
    // meter. The collision pass never reconciles them — a meter is scenery to
    // it, neither moving nor blocking.
    const meter = at('meter', 60, 60, 320, 44);
    const out = backfillUnplacedDefaults([at('text', 60, 60, 320, 200)], [meter]);
    const text = out.find((l) => l.kind === 'text')!;
    expect(text.y).toBeGreaterThanOrEqual(meter.y + meter.height);
  });

  it('leaves a default alone when it never overlapped', () => {
    const out = backfillUnplacedDefaults([at('text', 60, 400)], [at('meter', 60, 60, 320, 44)]);
    expect(out.find((l) => l.kind === 'text')!.y).toBe(400);
  });

  it('clears the lowest of several blockers, not just the first', () => {
    const out = backfillUnplacedDefaults(
      [at('text', 0, 0, 400, 300)],
      [at('meter', 0, 0, 400, 40), at('image', 0, 100, 400, 60)],
    );
    expect(out.find((l) => l.kind === 'text')!.y).toBeGreaterThanOrEqual(160);
  });

  it('never moves what the author positioned', () => {
    const meter = at('meter', 60, 60, 320, 44);
    const out = backfillUnplacedDefaults([at('text', 60, 60, 320, 200)], [meter]);
    expect(out.find((l) => l.kind === 'meter')).toEqual(meter);
  });
});
