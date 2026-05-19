import { describe, it, expect } from 'vitest';
import { mergeGeneratedVariables } from '../generatedVariables';
import type { GlobalSettings } from '../../components/settings/GlobalSettingsInspector';

const base = (vars?: unknown[]): GlobalSettings =>
  ({ project: {}, ...(vars ? { variables: vars } : {}) } as unknown as GlobalSettings);

const varsOf = (s: GlobalSettings | null) =>
  (s as any)?.variables as Array<{
    name: string;
    type: string;
    defaultValue: unknown;
    description?: string;
  }>;

describe('mergeGeneratedVariables', () => {
  it('returns null when there is nothing to add', () => {
    expect(mergeGeneratedVariables(base(), undefined)).toBeNull();
    expect(mergeGeneratedVariables(base(), [])).toBeNull();
    expect(mergeGeneratedVariables(base(), 'nope' as unknown)).toBeNull();
    // all entries filtered out (no usable name)
    expect(mergeGeneratedVariables(base(), [{ initialValue: 1 }, { name: '  ' }])).toBeNull();
  });

  it('infers type from initialValue and maps defaultValue', () => {
    const out = varsOf(
      mergeGeneratedVariables(base(), [
        { name: 'toldHelen', initialValue: false, description: 'told her' },
        { name: 'depletion', initialValue: 0 },
        { name: 'note', initialValue: 'hi' },
        { name: 'weird', initialValue: { a: 1 } },
        { name: 'noInitial' },
      ]),
    );
    expect(out).toEqual([
      { name: 'toldHelen', type: 'boolean', defaultValue: false, description: 'told her' },
      { name: 'depletion', type: 'number', defaultValue: 0, description: undefined },
      { name: 'note', type: 'string', defaultValue: 'hi', description: undefined },
      { name: 'weird', type: 'string', defaultValue: { a: 1 }, description: undefined },
      { name: 'noInitial', type: 'string', defaultValue: '', description: undefined },
    ]);
  });

  it('keeps false / 0 as the default rather than falling back', () => {
    const out = varsOf(
      mergeGeneratedVariables(base(), [
        { name: 'flag', initialValue: false },
        { name: 'count', initialValue: 0 },
      ]),
    );
    expect(out.find((v) => v.name === 'flag')!.defaultValue).toBe(false);
    expect(out.find((v) => v.name === 'count')!.defaultValue).toBe(0);
  });

  it('does not clobber an existing author-defined variable of the same name', () => {
    const existing = { name: 'toldHelen', type: 'string', defaultValue: 'authored' };
    const out = varsOf(
      mergeGeneratedVariables(base([existing]), [
        { name: 'toldHelen', initialValue: false },
        { name: 'fresh', initialValue: 1 },
      ]),
    );
    expect(out.find((v) => v.name === 'toldHelen')).toEqual(existing);
    expect(out.find((v) => v.name === 'fresh')).toEqual({
      name: 'fresh',
      type: 'number',
      defaultValue: 1,
      description: undefined,
    });
  });

  it('trims names and preserves other globalSettings fields', () => {
    const merged = mergeGeneratedVariables(
      { project: { width: 1024 } } as unknown as GlobalSettings,
      [{ name: '  spaced  ', initialValue: true }],
    );
    expect((merged as any).project).toEqual({ width: 1024 });
    expect(varsOf(merged)[0].name).toBe('spaced');
  });
});
