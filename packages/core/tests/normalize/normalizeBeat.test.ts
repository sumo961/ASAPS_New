/**
 * Tests for the schema-driven normalizeBeat pipeline.
 *
 * The cases mirror the bugs that the v0.9.50 patches fixed by hand —
 * once these pass, the patches can be deleted and the pipeline becomes
 * the single source of truth.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeBeat } from '../../src/normalize/normalizeBeat';
import type { BeatSchema } from '../../src/normalize/types';

// Load the real schema once. The pipeline is data-driven, so the test
// MUST run against the canonical core-beats.json (not a hand-rolled stub).
const schemaPath = resolve(__dirname, '../../../../beat-definitions/core-beats.json');
const schema = JSON.parse(readFileSync(schemaPath, 'utf-8')) as BeatSchema;

describe('normalizeBeat — affect-stack condition flattening', () => {
  it('flattens a sentiment condition\'s nested fields to top-level params', () => {
    const raw = {
      id: 'beat_7',
      type: 'conditionBeat',
      parameters: {
        condition: {
          type: 'sentiment',
          character: 'mara',
          sentimentTarget: 'player',
          sentimentEmotion: 'trust',
          operator: '>=',
          value: 0.2,
          baseline: 'initial',
        },
        trueConnection: { target: 'beat_8' },
        falseConnection: { target: 'beat_9' },
      },
    };

    const { beat, changes } = normalizeBeat(raw, schema);

    // Discriminator should map `type` → `conditionType` at top-level
    expect(beat.parameters.conditionType).toBe('sentiment');
    expect(beat.parameters.character).toBe('mara');
    expect(beat.parameters.sentimentTarget).toBe('player');
    expect(beat.parameters.sentimentEmotion).toBe('trust');
    expect(beat.parameters.operator).toBe('>=');
    expect(beat.parameters.value).toBe(0.2);
    expect(beat.parameters.baseline).toBe('initial');

    // The nested condition object is gone after flatten
    expect(beat.parameters.condition).toBeUndefined();

    // Connection params are passed through untouched
    expect(beat.parameters.trueConnection).toEqual({ target: 'beat_8' });

    // Changes log records the flatten
    const flattens = changes.filter(c => c.kind === 'flattened');
    expect(flattens.length).toBeGreaterThan(0);
    expect(flattens.find(c => c.path.endsWith('sentimentTarget'))).toBeDefined();
  });

  it('flattens mood conditions with baseline', () => {
    const raw = {
      id: 'beat_x',
      type: 'conditionBeat',
      parameters: {
        condition: {
          type: 'mood',
          character: 'alex',
          moodAxis: 'valence',
          operator: '>=',
          value: 0.3,
          baseline: { bookmark: 'before-fight' },
        },
      },
    };
    const { beat } = normalizeBeat(raw, schema);
    expect(beat.parameters.conditionType).toBe('mood');
    expect(beat.parameters.moodAxis).toBe('valence');
    expect(beat.parameters.baseline).toEqual({ bookmark: 'before-fight' });
  });

  it('flattens XR condition fields (gpsProximity)', () => {
    const raw = {
      id: 'beat_y',
      type: 'conditionBeat',
      parameters: {
        condition: {
          type: 'gpsProximity',
          targetLat: 40.7128,
          targetLng: -74.006,
          radiusMeters: 25,
          operator: '<=',
        },
      },
    };
    const { beat } = normalizeBeat(raw, schema);
    expect(beat.parameters.conditionType).toBe('gpsProximity');
    expect(beat.parameters.targetLat).toBe(40.7128);
    expect(beat.parameters.targetLng).toBe(-74.006);
    expect(beat.parameters.radiusMeters).toBe(25);
  });

  it('does not overwrite already-flattened fields', () => {
    // If the AI happens to emit the same field twice (top-level AND nested),
    // top-level wins.
    const raw = {
      id: 'beat_z',
      type: 'conditionBeat',
      parameters: {
        conditionType: 'sentiment',
        character: 'topLevel',
        condition: {
          type: 'sentiment',
          character: 'nested',
          sentimentTarget: 'player',
        },
      },
    };
    const { beat } = normalizeBeat(raw, schema);
    expect(beat.parameters.character).toBe('topLevel');
    expect(beat.parameters.sentimentTarget).toBe('player');
  });
});

describe('normalizeBeat — registry-level aliases (per-condition-type)', () => {
  it('renames condition.variable → condition.variableName for variable conditions', () => {
    // The AI consistently emits `variable` (not `variableName`) on
    // variable / counter conditions. The schema's conditionTypes.variable.aliases
    // teaches the pipeline this rename.
    const raw = {
      id: 'b14',
      type: 'conditionBeat',
      parameters: {
        condition: { type: 'variable', variable: 'satWithMaya', operator: '==', value: true },
        trueConnection: { target: 'b15' },
        falseConnection: { target: 'b16' },
      },
    };
    const { beat, changes } = normalizeBeat(raw, schema);
    expect(beat.parameters.conditionType).toBe('variable');
    expect(beat.parameters.variableName).toBe('satWithMaya');
    expect(beat.parameters.variable).toBeUndefined();
    expect(beat.parameters.value).toBe(true);
    const aliased = changes.find(c => c.kind === 'aliased' && c.path.includes('variableName'));
    expect(aliased).toBeDefined();
  });

  it('renames condition.left → condition.variableName (legacy alias)', () => {
    const raw = {
      id: 'b',
      type: 'conditionBeat',
      parameters: {
        condition: { type: 'variable', left: 'flag', operator: '==', value: true },
        trueConnection: { target: 'x' },
      },
    };
    const { beat } = normalizeBeat(raw, schema);
    expect(beat.parameters.variableName).toBe('flag');
    expect(beat.parameters.left).toBeUndefined();
  });

  it('renames condition.counter → condition.variableName for counter conditions', () => {
    const raw = {
      id: 'b24',
      type: 'conditionBeat',
      parameters: {
        condition: { type: 'counter', counter: 'friendshipPoints', operator: '>=', value: 4 },
        trueConnection: { target: 'b25' },
      },
    };
    const { beat } = normalizeBeat(raw, schema);
    expect(beat.parameters.conditionType).toBe('counter');
    expect(beat.parameters.variableName).toBe('friendshipPoints');
    expect(beat.parameters.counter).toBeUndefined();
  });
});

describe('normalizeBeat — primitive coercion', () => {
  it('coerces numeric quantity to string on addRemoveInventory', () => {
    const raw = {
      id: 'beat_q',
      type: 'addRemoveInventory',
      parameters: {
        action: 'add',
        item: 'Crisis Plan Card',
        character: 'player',
        quantity: 1, // <- AI emits number; schema wants string
        connection: { target: 'beat_next' },
      },
    };
    const { beat, changes } = normalizeBeat(raw, schema);
    expect(beat.parameters.quantity).toBe('1');
    expect(typeof beat.parameters.quantity).toBe('string');
    const coerced = changes.find(c => c.kind === 'coerced');
    expect(coerced).toBeDefined();
    expect(coerced?.from).toBe(1);
    expect(coerced?.to).toBe('1');
  });

  it('does not coerce a string quantity (variable reference)', () => {
    const raw = {
      id: 'beat_q2',
      type: 'addRemoveInventory',
      parameters: {
        action: 'add',
        item: 'Coins',
        character: 'player',
        quantity: '$gold',
      },
    };
    const { beat, changes } = normalizeBeat(raw, schema);
    expect(beat.parameters.quantity).toBe('$gold');
    expect(changes.find(c => c.kind === 'coerced')).toBeUndefined();
  });
});

describe('normalizeBeat — aliases', () => {
  it('renames variableName → variable on inputText', () => {
    const raw = {
      id: 'beat_in',
      type: 'inputText',
      parameters: {
        prompt: 'What is your name?',
        saveToType: 'variable',
        variableName: 'playerName', // AI emits this; canonical is `variable`
        connection: { target: 'beat_next' },
      },
    };
    const { beat, changes } = normalizeBeat(raw, schema);
    expect(beat.parameters.variable).toBe('playerName');
    expect(beat.parameters.variableName).toBeUndefined();
    expect(changes.find(c => c.kind === 'aliased' && c.path.includes('variable'))).toBeDefined();
  });

  it('does not clobber an existing canonical value when alias also present', () => {
    const raw = {
      id: 'beat_in2',
      type: 'inputText',
      parameters: {
        prompt: 'Test',
        saveToType: 'variable',
        variable: 'kept',
        variableName: 'discarded',
        connection: { target: 'beat_next' },
      },
    };
    const { beat } = normalizeBeat(raw, schema);
    expect(beat.parameters.variable).toBe('kept');
    // The alias is left in place when canonical already had a value (no rename needed).
    expect(beat.parameters.variableName).toBe('discarded');
  });
});

describe('normalizeBeat — defaults', () => {
  it('fills required defaults for addRemoveInventory when missing', () => {
    const raw = {
      id: 'beat_d',
      type: 'addRemoveInventory',
      parameters: {
        item: 'Sword',
        connection: { target: 'beat_next' },
      },
    };
    const { beat, changes } = normalizeBeat(raw, schema);
    expect(beat.parameters.action).toBe('add');
    expect(beat.parameters.character).toBe('player');
    const defaulted = changes.filter(c => c.kind === 'defaulted');
    expect(defaulted.length).toBe(2);
  });

  it('does not overwrite an explicitly set value with a default', () => {
    const raw = {
      id: 'beat_d2',
      type: 'addRemoveInventory',
      parameters: {
        action: 'remove',
        item: 'Sword',
        character: 'enemy',
        connection: { target: 'beat_next' },
      },
    };
    const { beat } = normalizeBeat(raw, schema);
    expect(beat.parameters.action).toBe('remove');
    expect(beat.parameters.character).toBe('enemy');
  });
});

describe('normalizeBeat — pass-through behavior', () => {
  it('leaves an unknown beat type alone', () => {
    const raw = { id: 'b', type: 'mysteryBeat', parameters: { foo: 'bar' } };
    const { beat, changes } = normalizeBeat(raw, schema);
    expect(beat).toEqual(raw);
    expect(changes).toEqual([]);
  });

  it('preserves cluster and notes (top-level fields)', () => {
    const raw = {
      id: 'beat_n',
      type: 'infoText',
      cluster: 'Act II - The Apartment',
      notes: 'AFFECT BOOKMARK: snapshot before the fight',
      parameters: { text: 'Hello', connection: { target: 'next' } },
    };
    const { beat } = normalizeBeat(raw, schema);
    expect(beat.cluster).toBe('Act II - The Apartment');
    expect(beat.notes).toBe('AFFECT BOOKMARK: snapshot before the fight');
  });
});
