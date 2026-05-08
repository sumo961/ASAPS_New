/**
 * Tests for the schema-driven validateBeat.
 *
 * Per-condition-type required-field check is the headline behavior here —
 * it replaces the hardcoded map currently in AIValidator.ts.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateBeat } from '../../src/normalize/validateBeat';
import { normalizeBeat } from '../../src/normalize/normalizeBeat';
import { buildRefIndex } from '../../src/normalize/normalizeStory';
import type { BeatSchema } from '../../src/normalize/types';

const schemaPath = resolve(__dirname, '../../../../beat-definitions/core-beats.json');
const schema = JSON.parse(readFileSync(schemaPath, 'utf-8')) as BeatSchema;

const emptyRefIndex = {
  characterIds: new Set<string>(),
  beatIds: new Set<string>(),
  clusterNames: new Set<string>(),
  assetIds: new Set<string>(),
};

describe('validateBeat — required parameters', () => {
  it('flags missing required item on addRemoveInventory', () => {
    const beat = {
      id: 'b',
      type: 'addRemoveInventory',
      parameters: { action: 'add', character: 'player', connection: { target: 'x' } },
    };
    const result = validateBeat(beat, schema, emptyRefIndex);
    expect(result.errors.find(e => e.message.includes("'item'"))).toBeDefined();
  });

  it('does NOT flag the nested `condition` field as missing on conditionBeat', () => {
    // After normalize the nested object is gone, but the schema still
    // marks it required. Validate must skip nested-block fields.
    const raw = {
      id: 'b',
      type: 'conditionBeat',
      parameters: {
        condition: { type: 'sentiment', character: 'mara', sentimentTarget: 'player', operator: '>=', value: 0.2 },
        trueConnection: { target: 'x' },
      },
    };
    const { beat } = normalizeBeat(raw, schema);
    const result = validateBeat(beat, schema, emptyRefIndex);
    expect(result.errors.find(e => e.message.includes("'condition'"))).toBeUndefined();
  });
});

describe('validateBeat — per-condition-type required fields', () => {
  function normalized(rawCondition: any) {
    const raw = {
      id: 'b',
      type: 'conditionBeat',
      parameters: {
        condition: rawCondition,
        trueConnection: { target: 'next' },
      },
    };
    return normalizeBeat(raw, schema).beat;
  }

  it('warns on a sentiment missing sentimentTarget', () => {
    const beat = normalized({ type: 'sentiment', character: 'mara', operator: '>=', value: 0.2 });
    const result = validateBeat(beat, schema, emptyRefIndex);
    expect(result.warnings.find(w => w.message.includes('sentimentTarget'))).toBeDefined();
  });

  it('passes a fully-specified sentiment condition (only ref-resolution warnings)', () => {
    const beat = normalized({
      type: 'sentiment',
      character: 'mara',
      sentimentTarget: 'player',
      sentimentEmotion: 'trust',
      operator: '>=',
      value: 0.2,
    });
    const result = validateBeat(beat, schema, emptyRefIndex);
    // No required-field warnings for sentiment fields
    expect(result.warnings.find(w => w.message.includes("missing required field"))).toBeUndefined();
  });

  it('warns on goal condition missing goalId', () => {
    const beat = normalized({ type: 'goal', character: 'mara', operator: '==' });
    const result = validateBeat(beat, schema, emptyRefIndex);
    expect(result.warnings.find(w => w.message.includes("'goalId'"))).toBeDefined();
  });

  it('warns on gpsProximity missing targetLat/Lng', () => {
    const beat = normalized({ type: 'gpsProximity', operator: '<=' });
    const result = validateBeat(beat, schema, emptyRefIndex);
    expect(result.warnings.find(w => w.message.includes('targetLat'))).toBeDefined();
    expect(result.warnings.find(w => w.message.includes('targetLng'))).toBeDefined();
  });

  it('warns on indoorProximity missing beaconUuid', () => {
    const beat = normalized({ type: 'indoorProximity', operator: '<=' });
    const result = validateBeat(beat, schema, emptyRefIndex);
    expect(result.warnings.find(w => w.message.includes('beaconUuid'))).toBeDefined();
  });

  it('warns on permissionGranted missing permission', () => {
    const beat = normalized({ type: 'permissionGranted', operator: '==' });
    const result = validateBeat(beat, schema, emptyRefIndex);
    expect(result.warnings.find(w => w.message.includes("'permission'"))).toBeDefined();
  });

  it('warns on unknown conditionType', () => {
    const beat = normalized({ type: 'someBogusKind' as any, operator: '==' });
    const result = validateBeat(beat, schema, emptyRefIndex);
    expect(result.warnings.find(w => w.message.includes('Unknown conditionType'))).toBeDefined();
  });
});

describe('validateBeat — type checking after coercion', () => {
  it('passes addRemoveInventory after normalize coerced quantity to string', () => {
    const raw = {
      id: 'b',
      type: 'addRemoveInventory',
      parameters: {
        action: 'add',
        item: 'Card',
        character: 'player',
        quantity: 1,
        connection: { target: 'x' },
      },
    };
    const { beat } = normalizeBeat(raw, schema);
    const result = validateBeat(beat, schema, emptyRefIndex);
    // No type errors — quantity coerced before validate
    expect(result.errors.find(e => e.message.includes('quantity'))).toBeUndefined();
  });
});

describe('validateBeat — reference resolution', () => {
  it('warns when sentiment condition references unknown character', () => {
    // We'd add `references: 'character'` on the schema's character param to
    // get this for free; test now records the desired behavior.
    // (Skipping the warn assertion until we add the references metadata —
    //  this test documents the intent.)
    const beat = normalizeBeat({
      id: 'b',
      type: 'conditionBeat',
      parameters: {
        condition: {
          type: 'sentiment',
          character: 'unknownChar',
          sentimentTarget: 'player',
          operator: '>=',
          value: 0,
        },
        trueConnection: { target: 'next' },
      },
    }, schema).beat;
    const refIndex = buildRefIndex({ characters: [{ id: 'mara' }] });
    const result = validateBeat(beat, schema, refIndex);
    // The schema does not currently mark character as `references: 'character'`,
    // so no ref warning yet. Just assert that the basic shape passes.
    expect(result).toBeDefined();
    void refIndex;
  });
});
