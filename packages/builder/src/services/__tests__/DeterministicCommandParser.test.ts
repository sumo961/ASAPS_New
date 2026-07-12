/**
 * Tests for DeterministicCommandParser — pattern-matches common helper
 * commands into StructuredActions without calling the AI, falling back to
 * null (→ AI) for anything unrecognized. Pure logic.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { DeterministicCommandParser, getDeterministicParser } from '../DeterministicCommandParser';
import type { HelperCommandContext } from '../../types/helperCommand';

const ctx = (over: Partial<HelperCommandContext> = {}): HelperCommandContext => ({
  beatTypes: ['titleScreen', 'infoText', 'dialogTree'],
  clusterNames: [],
  assets: [],
  characterNames: [],
  sampleBeatNames: [],
  modifiableProperties: { beats: [], locations: [], transitions: [] },
  ...over,
});

let parser: DeterministicCommandParser;
beforeEach(() => {
  parser = new DeterministicCommandParser();
});

describe('set backgrounds', () => {
  it('resolves a background asset (fuzzy) and builds a setProperty node action', () => {
    const r = parser.parse(
      'set all backgrounds to forest',
      ctx({ assets: [{ id: 'bg1', name: 'forest_dawn.png', type: 'background' }] }),
    );
    expect(r?.fullyUnderstood).toBe(true);
    expect(r?.action.actionType).toBe('setProperty');
    expect(r?.action.modification).toMatchObject({ property: 'node', value: 'bg1' });
    expect(r?.action.interpretation).toMatch(/background/i);
  });

  it('returns a clarification when no asset matches', () => {
    const r = parser.parse('set all backgrounds to nonexistent', ctx({ assets: [] }));
    expect(r?.fullyUnderstood).toBe(false);
    expect(r?.clarificationQuestions?.length).toBeGreaterThan(0);
    expect(r?.action.confidence).toBe(0);
  });
});

describe('transitions', () => {
  it('parses type + explicit duration', () => {
    const r = parser.parse('set all transitions to fade 500ms', ctx());
    expect(r?.fullyUnderstood).toBe(true);
    expect(r?.action.modification).toMatchObject({ property: 'transition', value: { type: 'fade', duration: 500 } });
  });

  it('defaults the duration to 500ms when omitted', () => {
    const r = parser.parse('set all transitions to dissolve', ctx());
    expect((r?.action.modification as any).value).toMatchObject({ type: 'dissolve', duration: 500 });
  });

  it('clarifies an unknown transition type', () => {
    const r = parser.parse('set all transitions to wobble', ctx());
    expect(r?.fullyUnderstood).toBe(false);
    expect(r?.clarificationQuestions?.[0]).toMatch(/transition type/i);
  });
});

describe('button sounds', () => {
  it('resolves a preset sound by name', () => {
    const r = parser.parse(
      'set all button sounds to Soft Click',
      ctx({ presetSounds: [{ id: 'snd1', name: 'Soft Click', category: 'ui' }] }),
    );
    expect(r?.fullyUnderstood).toBe(true);
    expect(r?.action.targetSelector.targetType).toBe('location');
    expect(r?.action.modification).toMatchObject({ property: 'sound', value: 'snd1' });
  });
});

describe('remove elements', () => {
  it('builds a removeElement action (singular form)', () => {
    const r = parser.parse('remove all meter from dialog beats', ctx());
    expect(r?.fullyUnderstood).toBe(true);
    expect(r?.action.actionType).toBe('removeElement');
    expect(r?.action.modification).toMatchObject({ type: 'remove', property: 'meter' });
    expect((r?.action.targetSelector.filters as any).beatTypes).toEqual(['dialogTree']);
  });

  it('also handles the PLURAL element form (regression for the greedy \\w+ capture)', () => {
    // Pre-fix, "(\\w+)s?" captured "meters" with its trailing s → unknown
    // element type → error. The de-pluralize fallback restores it.
    const r = parser.parse('remove all meters from dialog beats', ctx());
    expect(r?.fullyUnderstood).toBe(true);
    expect(r?.action.actionType).toBe('removeElement');
    expect(r?.action.modification).toMatchObject({ property: 'meter' });
  });
});

describe('schema-derived beat types (regression: hand list stopped at ~13 types)', () => {
  it('parses commands targeting beat types added after the old hand list', () => {
    const r = parser.parse('remove all buttons from keypad beats', ctx());
    expect(r?.fullyUnderstood).toBe(true);
    expect((r?.action.targetSelector.filters as any).beatTypes).toEqual(['keypad']);

    const r2 = parser.parse('remove all meters from multichoice beats', ctx());
    expect(r2?.fullyUnderstood).toBe(true);
    expect((r2?.action.targetSelector.filters as any).beatTypes).toEqual(['multiChoice']);
  });

  it('still resolves the legacy shorthands', () => {
    const r = parser.parse('remove all meters from timed beats', ctx());
    expect(r?.fullyUnderstood).toBe(true);
    expect((r?.action.targetSelector.filters as any).beatTypes).toEqual(['durScreen']);
  });
});

describe('fallback + needsAI', () => {
  it('returns null for an unrecognized command (defers to AI)', () => {
    expect(parser.parse('please make the whole story spookier', ctx())).toBeNull();
  });

  it('needsAI flags pronoun / replace-in-text / exclusion commands', () => {
    expect(parser.needsAI('change he to she with correct pronouns')).toBe(true);
    expect(parser.needsAI('replace Tom with Tim in all text')).toBe(true);
    expect(parser.needsAI('set all backgrounds except the title to forest')).toBe(true);
    expect(parser.needsAI('set all transitions to fade')).toBe(false);
  });
});

describe('singleton', () => {
  it('getDeterministicParser returns a stable instance', () => {
    expect(getDeterministicParser()).toBe(getDeterministicParser());
  });
});
