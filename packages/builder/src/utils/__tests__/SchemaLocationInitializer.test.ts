/**
 * Tests for SchemaLocationInitializer — the schema-driven default-location
 * generator. Covers the schema lookups (supportsVisualElements /
 * getLocationNamesForBeatType), the per-element generator
 * (initializeLocationsFromSchema, incl. conditional skips), the guarded
 * batch entry point (initializeBeatLocations and ALL its skip guards), and
 * dynamic choice regeneration. Uses the real core-beats.json schema with
 * duck-typed fake beats.
 */
import { describe, it, expect } from 'vitest';
import {
  initializeLocationsFromSchema,
  getLocationNamesForBeatType,
  supportsVisualElements,
  initializeBeatLocations,
  regenerateChoiceElements,
} from '../SchemaLocationInitializer';

const beat = (type: string, params: any = {}, locations?: any) =>
  ({ id: `${type}-1`, type, getParameters: () => params, ...(locations !== undefined ? { locations } : {}) }) as any;

// Generated elements carry a display-transformed `name` ('title'→'Title'); the
// raw location name lives in the id as `element_<locationName>_...`.
const byLoc = (els: any[], loc: string) => els.find((e) => e.id?.startsWith(`element_${loc}_`));

describe('schema lookups', () => {
  it('supportsVisualElements: true for visible beats, false for invisible/unknown', () => {
    expect(supportsVisualElements('titleScreen')).toBe(true);
    expect(supportsVisualElements('setVariable')).toBe(false);
    expect(supportsVisualElements('nonsenseBeat')).toBe(false);
  });

  it('getLocationNamesForBeatType returns the schema location list, [] for unknown', () => {
    const names = getLocationNamesForBeatType('titleScreen');
    expect(names).toContain('title');
    expect(getLocationNamesForBeatType('nonsenseBeat')).toEqual([]);
  });
});

describe('initializeLocationsFromSchema', () => {
  it('returns [] for an unknown beat type', () => {
    expect(initializeLocationsFromSchema(beat('nonsenseBeat'), {})).toEqual([]);
  });

  it('generates centered, visible, unlocked elements for titleScreen', () => {
    const els = initializeLocationsFromSchema(beat('titleScreen'), { title: 'My Story', author: 'Me' }, { width: 1024, height: 768 });
    expect(els.length).toBeGreaterThan(0);
    const title = byLoc(els, 'title');
    expect(title).toBeDefined();
    expect(title!.name).toBe('Title'); // display-transformed location name
    expect(title!.type).toBe('text');
    expect(title!.visible).toBe(true);
    expect(title!.locked).toBe(false);
    // centered horizontally: x === centerX - width/2
    expect(title!.x).toBeCloseTo(1024 / 2 - title!.width / 2);
  });

  it('skips restartButton when showRestart is false and creditsButton unless showCredits is true', () => {
    const hidden = initializeLocationsFromSchema(beat('endScreen'), { showRestart: false, showCredits: false });
    expect(byLoc(hidden, 'restartButton')).toBeUndefined();
    expect(byLoc(hidden, 'creditsButton')).toBeUndefined();

    const shown = initializeLocationsFromSchema(beat('endScreen'), { showRestart: true, showCredits: true });
    expect(byLoc(shown, 'restartButton')).toBeDefined();
    expect(byLoc(shown, 'creditsButton')).toBeDefined();
  });

  it('skips the dynamic "choices" location for movementChoice (created separately)', () => {
    const els = initializeLocationsFromSchema(beat('movementChoice'), { question: 'Where to?', choices: [{ text: 'North' }] });
    expect(byLoc(els, 'choices')).toBeUndefined();
  });
});

describe('initializeBeatLocations (guarded batch entry point)', () => {
  it('skips invisible beats (locations stay empty)', () => {
    const b = beat('setVariable', {}, new Map());
    initializeBeatLocations([b]);
    expect(b.locations.size).toBe(0);
  });

  it('skips schema layoutMode=spatial/slot beats even in a fixed project', () => {
    const b = beat('titleScreen', { title: 'X' }, new Map());
    initializeBeatLocations([b], 1024, 768, 'fixed');
    expect(b.locations.size).toBe(0); // titleScreen is layoutMode 'spatial' → never auto-baked
  });

  it('bakes locations for a dual-mode beat in a FIXED project', () => {
    const b = beat('movementChoice', { question: 'Where?' }, new Map());
    initializeBeatLocations([b], 1024, 768, 'fixed');
    expect(b.locations.size).toBeGreaterThan(0);
  });

  it('skips a dual-mode beat in a RESPONSIVE project', () => {
    const b = beat('movementChoice', { question: 'Where?' }, new Map());
    initializeBeatLocations([b], 1024, 768, 'responsive');
    expect(b.locations.size).toBe(0);
  });

  it('skips a beat whose choices carry a spatial hotspot', () => {
    const b = beat('movementChoice', { choices: [{ text: 'N', hotspot: { x: 0, y: 0, width: 0.1, height: 0.1 } }] }, new Map());
    initializeBeatLocations([b], 1024, 768, 'fixed');
    expect(b.locations.size).toBe(0);
  });

  it('does not override a beat that already has locations', () => {
    const existing = new Map([['custom', { kind: 'text', name: 'custom', x: 1, y: 2 }]]);
    const b = beat('movementChoice', { question: 'Where?' }, existing);
    initializeBeatLocations([b], 1024, 768, 'fixed');
    expect(b.locations.size).toBe(1);
    expect(b.locations.get('custom')).toMatchObject({ x: 1, y: 2 });
  });

  it('converts an array-form locations field to a Map', () => {
    const b = beat('movementChoice', { question: 'Where?' }, [{ name: 'a', x: 0, y: 0 }]);
    initializeBeatLocations([b], 1024, 768, 'fixed');
    expect(b.locations instanceof Map).toBe(true);
    expect(b.locations.get('a')).toBeDefined();
  });

  it('initializes a missing locations field to a Map for a visible beat', () => {
    const b = beat('movementChoice', { question: 'Where?' }); // no locations field at all
    initializeBeatLocations([b], 1024, 768, 'fixed');
    expect(b.locations instanceof Map).toBe(true);
    expect(b.locations.size).toBeGreaterThan(0);
  });

  it('leaves an invisible beat untouched (returns before locations init)', () => {
    const b = beat('setVariable'); // no locations field
    initializeBeatLocations([b]);
    expect(b.locations).toBeUndefined(); // early return — never initialized
  });
});

describe('regenerateChoiceElements', () => {
  it('movementChoice: one hotspot element per choice, stacked vertically', () => {
    const els = regenerateChoiceElements('movementChoice', { choices: [{ text: 'North' }, { text: 'South' }] });
    expect(els).toHaveLength(2);
    expect(els.every((e) => e.type === 'hotspot')).toBe(true);
    expect(els.map((e) => e.name)).toEqual(['North', 'South']);
    expect(els[1].y).toBeGreaterThan(els[0].y); // stacked
  });

  it('multiChoice: button elements, falling back to "Choice N" labels', () => {
    const els = regenerateChoiceElements('multiChoice', { choices: [{ text: 'Yes' }, {}] });
    expect(els).toHaveLength(2);
    expect(els.every((e) => e.type === 'button')).toBe(true);
    expect(els[1].name).toBe('Choice 2');
  });

  it('pickProp: prop type when assetId present, button otherwise', () => {
    const els = regenerateChoiceElements('pickProp', { props: [{ name: 'Key', assetId: 'a1' }, { name: 'Map' }] });
    expect(els).toHaveLength(2);
    expect(els.find((e) => e.name === 'Key')!.type).toBe('prop');
    expect(els.find((e) => e.name === 'Key')!.assetId).toBe('a1');
    expect(els.find((e) => e.name === 'Map')!.type).toBe('button');
  });

  it('returns [] for a beat type with no dynamic choices', () => {
    expect(regenerateChoiceElements('movementChoice', {})).toEqual([]);
  });
});
