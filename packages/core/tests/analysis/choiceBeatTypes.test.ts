/**
 * Tripwire: every beat type in the catalogue says whether the debug tools
 * branch on it. Free Layout shipped without a place on the analyzers' own
 * choice lists, so Path Analysis followed only its first button
 * (2026-10-31). A new beat type fails here until it is put in
 * CHOICE_BEAT_TYPES or SINGLE_LINK_BEAT_TYPES (analysis/analysisLinks.ts).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { CHOICE_BEAT_TYPES, SINGLE_LINK_BEAT_TYPES } from '../../src/analysis/analysisLinks';

const catalogue = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../beat-definitions/core-beats.json'), 'utf8'));
const types = Object.keys(catalogue.beatTypes ?? catalogue);

describe('every beat type is classified for analysis', () => {
  it('the catalogue has its beat types', () => expect(types.length).toBeGreaterThan(30));
  for (const type of types) {
    it(type, () => {
      const choice = CHOICE_BEAT_TYPES.has(type);
      const single = SINGLE_LINK_BEAT_TYPES.has(type);
      expect([type, choice !== single]).toEqual([type, true]);
    });
  }
});
