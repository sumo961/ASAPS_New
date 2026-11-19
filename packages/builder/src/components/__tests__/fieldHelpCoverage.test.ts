import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * The Properties panel shows a field's `ui.help` and falls back to its
 * `description`, which is written for AI generation (code names, option
 * values, instructions to the model). Every field an author can see has its
 * own hint; this fails when a new parameter arrives without one.
 */
const schema = JSON.parse(readFileSync(resolve(__dirname, '../../../../../beat-definitions/core-beats.json'), 'utf8'));

describe('author hints in the beat schema', () => {
  const visible: Array<{ path: string; help?: string }> = [];
  for (const [type, def] of Object.entries<any>(schema.beatTypes)) {
    for (const [name, param] of Object.entries<any>(def.parameters ?? {})) {
      if (param?.ui?.hidden) continue;
      visible.push({ path: `${type}.${name}`, help: param?.ui?.help });
    }
  }

  it('every visible field has one', () => {
    expect(visible.filter((f) => !f.help || !f.help.trim()).map((f) => f.path)).toEqual([]);
  });

  it('is a sentence for an author, not a note for the AI', () => {
    const odd = visible.filter((f) => f.help && (!/[.!?"”)]$/.test(f.help.trim()) || /\b(the pipeline|schema|enum|camelCase|beat id as a string)\b/i.test(f.help)));
    expect(odd.map((f) => `${f.path}: ${f.help}`)).toEqual([]);
  });
});
