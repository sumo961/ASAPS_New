/**
 * Tripwires: the effect / condition vocabularies must agree everywhere an
 * author or an AI reads them. The schema's `effect` customType had drifted
 * to 4 of 13 effect types and `condition` to 6 of 16 condition types — the
 * MCP server serves that schema to Claude Desktop, so generated stories
 * never learned the rest.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { EFFECT_TYPES } from '../../src/types';

const schema = JSON.parse(
  readFileSync(resolve(__dirname, '../../../../beat-definitions/core-beats.json'), 'utf-8'),
);
const engineSource = readFileSync(resolve(__dirname, '../../src/engine/StoryContext.ts'), 'utf-8');

function unionMembers(union: string): string[] {
  return [...union.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe('effect vocabulary', () => {
  it('the schema effect customType lists exactly the engine EFFECT_TYPES', () => {
    expect(unionMembers(schema.customTypes.effect.schema.type).sort()).toEqual([...EFFECT_TYPES].sort());
  });

  it('the engine applies every listed effect type', () => {
    for (const t of EFFECT_TYPES) {
      expect(engineSource.includes(`case '${t}'`), `StoryContext.applyEffect handles '${t}'`).toBe(true);
    }
  });
});

describe('condition vocabulary', () => {
  it('the schema condition customType lists exactly the conditionTypes table', () => {
    const table = Object.keys(schema.conditionTypes).filter((k) => k !== '_meta');
    expect(unionMembers(schema.customTypes.condition.schema.type).sort()).toEqual(table.sort());
  });
});
