/**
 * Golden-file regression suite.
 *
 * Feeds real-world AI-generated debug files (captured during v0.9.50 /
 * v0.9.51 development) through the schema-driven pipeline and asserts
 * key post-pipeline invariants. The fixtures are stories the pipeline
 * has been observed to handle correctly — this suite catches future
 * divergence: a schema change that breaks flattening, a refactor that
 * loses character backfill, an alias that stops being honored, etc.
 *
 * Run-time properties asserted (not byte-identical match):
 *
 *   1. errors.length === 0
 *   2. Every conditionBeat: conditionType set, params.condition deleted
 *   3. Every conditionBeat: per-condition-type required fields present
 *   4. Every character: visual + states[] + defaultState + timestamps
 *   5. Every addRemoveInventory beat: quantity is string (post-coerce)
 *   6. Idempotency — re-running the pipeline on the result yields zero
 *      additional changes
 *
 * Plus per-fixture targeted assertions for the specific scenario each
 * fixture exercises (e.g. cluster auto-create, condition.variable alias).
 *
 * Adding a new fixture: drop a debug JSON in fixtures/, add an entry to
 * the FIXTURES table below. Each test runs in isolation so a regression
 * on one doesn't mask others.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeStory } from '../../src/normalize/normalizeStory';
import type { BeatSchema } from '../../src/normalize/types';

const schemaPath = resolve(__dirname, '../../../../beat-definitions/core-beats.json');
const schema = JSON.parse(readFileSync(schemaPath, 'utf-8')) as BeatSchema;

const FIXTURES_DIR = resolve(__dirname, 'fixtures');

interface FixtureExpectation {
  name: string;
  /** Expected to produce >0 clusters from per-beat strings */
  expectsClusters?: boolean;
  /** Expected to apply at least N condition flattens */
  minBeatsNormalized?: number;
  /** Expected to apply at least N character backfills */
  minCharactersNormalized?: number;
  /**
   * Fixture is already in post-pipeline canonical shape (saved AFTER the
   * pipeline ran on a real generation). Pipeline call should yield zero
   * changes — this is the strongest idempotency check we can write
   * because it uses real-world data, not a synthetic input.
   */
  postPipelineCanonical?: boolean;
  /** A description of what this fixture exercises, for documentation */
  exercises: string;
}

const FIXTURES: FixtureExpectation[] = [
  {
    name: 'kimi-counter-conditions.json',
    exercises:
      'Kimi K2 generation, captured AFTER the pipeline successfully ran ' +
      'end-to-end (story-debug-1778255235206). Counter conditions with ' +
      'variableName already flat, characters already backfilled. The ' +
      'pipeline must produce ZERO changes on this input — proves ' +
      'idempotency on a real saved project.',
    expectsClusters: false,
    postPipelineCanonical: true,
  },
  {
    name: 'gpt-sentiment-clusters.json',
    exercises:
      'Pre-pipeline raw GPT-5.5 generation with rich sentiment conditions ' +
      '(character + sentimentTarget + sentimentEmotion + baseline) and ' +
      'per-beat cluster strings. Six nested conditionBeats and three ' +
      'characters lacking editor-only fields. Exercises affect-stack ' +
      'flatten, character backfill, and cluster auto-create.',
    expectsClusters: true,
    minBeatsNormalized: 6,
    minCharactersNormalized: 3,
  },
  {
    name: 'gpt-mixed-flatten.json',
    exercises:
      'Mixed GPT-5.5 generation: AI emitted SOME affect-stack fields at ' +
      'top-level AND in the nested condition object, characters ALREADY ' +
      'have editor-only shape, story already declares clusters. Pipeline ' +
      'must flatten the 5 nested condition objects without overwriting ' +
      'pre-existing top-level values, and not duplicate clusters.',
    expectsClusters: true,
    minBeatsNormalized: 5,
  },
];

function loadFixture(name: string): any {
  const raw = readFileSync(resolve(FIXTURES_DIR, name), 'utf-8');
  const parsed = JSON.parse(raw);
  // Debug files wrap the story under `.story` along with status/errors/warnings.
  return parsed.story || parsed;
}

describe('normalize pipeline — golden-file regression suite', () => {
  // Fixtures are present
  it('fixtures dir exists with at least one fixture', () => {
    const files = readdirSync(FIXTURES_DIR).filter(f => f.endsWith('.json'));
    expect(files.length).toBeGreaterThan(0);
  });

  for (const fixture of FIXTURES) {
    describe(`${fixture.name}`, () => {
      const rawStory = loadFixture(fixture.name);
      const result = normalizeStory(rawStory, schema);

      it('produces zero errors', () => {
        expect(result.errors).toEqual([]);
        expect(result.valid).toBe(true);
      });

      it('flattens every conditionBeat (no nested condition, conditionType set)', () => {
        const conds = (result.story.beats || []).filter((b: any) => b.type === 'conditionBeat');
        expect(conds.length).toBeGreaterThan(0); // sanity: every fixture has at least one
        for (const beat of conds) {
          expect(beat.parameters.condition, `beat ${beat.id} should have nested condition deleted`).toBeUndefined();
          expect(beat.parameters.conditionType, `beat ${beat.id} should have conditionType at top level`).toBeDefined();
        }
      });

      it('honors per-condition-type required fields after flatten', () => {
        const conds = (result.story.beats || []).filter((b: any) => b.type === 'conditionBeat');
        for (const beat of conds) {
          const t = beat.parameters.conditionType;
          const ctSpec = (schema.conditionTypes as any)?.[t];
          if (!ctSpec || !Array.isArray(ctSpec.required)) continue;
          for (const req of ctSpec.required) {
            const v = beat.parameters[req];
            expect(v, `beat ${beat.id} (type=${t}) missing required field '${req}' after flatten`).toBeDefined();
          }
        }
      });

      it('backfills editor-only fields on every character', () => {
        const chars = result.story.characters || [];
        expect(chars.length).toBeGreaterThan(0);
        for (const c of chars) {
          expect(c.visual, `${c.id} missing visual`).toBeDefined();
          expect(Array.isArray(c.states), `${c.id} states should be array`).toBe(true);
          expect(c.states.length, `${c.id} should have at least one state`).toBeGreaterThan(0);
          expect(c.defaultState, `${c.id} missing defaultState`).toBeDefined();
          expect(c.createdAt, `${c.id} missing createdAt`).toBeDefined();
          expect(c.updatedAt, `${c.id} missing updatedAt`).toBeDefined();
        }
      });

      it('coerces addRemoveInventory.quantity to string', () => {
        const invs = (result.story.beats || []).filter((b: any) => b.type === 'addRemoveInventory');
        for (const beat of invs) {
          if (beat.parameters.quantity === undefined) continue;
          expect(typeof beat.parameters.quantity, `beat ${beat.id} quantity should be string`).toBe('string');
        }
      });

      if (fixture.expectsClusters) {
        it('auto-creates clusters from per-beat cluster strings', () => {
          expect(result.story.clusters?.length, 'expected pipeline to auto-create at least one cluster').toBeGreaterThan(0);
          // Every cluster has the expected shape
          for (const c of result.story.clusters) {
            expect(c.id).toBeDefined();
            expect(c.name).toBeDefined();
            expect(c.containerPosition).toBeDefined();
            expect(c.containerBounds).toBeDefined();
            expect(c.isExpanded).toBe(true);
          }
        });
      }

      if (typeof fixture.minBeatsNormalized === 'number') {
        it(`normalizes at least ${fixture.minBeatsNormalized} beats`, () => {
          expect(result.report.beatsNormalized).toBeGreaterThanOrEqual(fixture.minBeatsNormalized!);
        });
      }

      if (typeof fixture.minCharactersNormalized === 'number') {
        it(`normalizes at least ${fixture.minCharactersNormalized} characters`, () => {
          expect(result.report.charactersNormalized).toBeGreaterThanOrEqual(fixture.minCharactersNormalized!);
        });
      }

      if (fixture.postPipelineCanonical) {
        it('produces zero changes (already canonical)', () => {
          expect(result.report.beatsNormalized).toBe(0);
          expect(result.report.charactersNormalized).toBe(0);
          expect(result.report.clustersCreated.length).toBe(0);
        });
      }

      it('is idempotent — re-running the pipeline yields no further changes', () => {
        const second = normalizeStory(result.story, schema);
        expect(second.report.beatsNormalized, 'second pass should not normalize any more beats').toBe(0);
        expect(second.report.charactersNormalized, 'second pass should not normalize any more characters').toBe(0);
        expect(second.report.clustersCreated.length, 'second pass should not auto-create more clusters').toBe(0);
        expect(second.errors).toEqual([]);
      });
    });
  }
});
