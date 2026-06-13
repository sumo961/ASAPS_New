/**
 * Tests for the beat-suggestion prompt builders. These power the
 * "Suggest Next Beats" AI affordance in the editor.
 *
 * NOTE: beat suggestions is slated for a rework (the system-prompt
 * "common patterns" library will change). So we deliberately DO NOT pin
 * the system-prompt wording here — only its stable contract (returns a
 * string that embeds the schema). The real coverage is on the parts that
 * survive a prompt rewrite: the user-prompt request-summary logic and the
 * few-shot example's JSON shape.
 */
import { describe, it, expect } from 'vitest';
import {
  buildBeatSuggestionsSystemPrompt,
  buildBeatSuggestionsUserPrompt,
  getBeatSuggestionsExample,
} from '../beatSuggestions';
import type { BeatSuggestionRequest } from '../../../types/ai';
import type { BeatConfig } from '@asaps/core';

const SCHEMA = { beatTypes: { titleScreen: {}, infoText: {}, pickProp: {} } };

const beat = (over: Partial<BeatConfig> = {}): BeatConfig =>
  ({
    id: 'beat_1',
    type: 'movementChoice',
    name: 'Choose Path',
    parameters: {},
    connections: [],
    ...over,
  }) as BeatConfig;

describe('buildBeatSuggestionsSystemPrompt (stable contract only)', () => {
  it('returns a non-empty string that embeds the supplied schema', () => {
    // Intentionally light: the prompt wording is about to be reworked,
    // so we pin only that the schema is interpolated (the one piece of
    // behavior a rewrite must preserve).
    const prompt = buildBeatSuggestionsSystemPrompt(SCHEMA);
    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt).toContain('"titleScreen"');
    expect(prompt).toContain('"pickProp"');
  });
});

describe('buildBeatSuggestionsUserPrompt', () => {
  it('summarizes the current beat (type, name, parameters)', () => {
    const req: BeatSuggestionRequest = {
      currentBeat: beat({ type: 'infoText', name: 'Intro', parameters: { text: 'Hi' } }),
      existingBeats: [],
    };
    const out = buildBeatSuggestionsUserPrompt(req);
    expect(out).toContain('Type: infoText');
    expect(out).toContain('Name: Intro');
    expect(out).toContain('"text": "Hi"');
  });

  it('reports "No connections yet" when the beat has none', () => {
    const out = buildBeatSuggestionsUserPrompt({ currentBeat: beat(), existingBeats: [] });
    expect(out).toContain('No connections yet');
  });

  it('reports the connection count when present', () => {
    const out = buildBeatSuggestionsUserPrompt({
      currentBeat: beat({ connections: [{ targetId: 'beat_2' }, { targetId: 'beat_3' }] as any }),
      existingBeats: [],
    });
    expect(out).toContain('Existing Connections: 2 connection(s)');
  });

  it('includes story metadata (title + genre) when provided', () => {
    const out = buildBeatSuggestionsUserPrompt({
      currentBeat: beat(),
      existingBeats: [],
      storyMetadata: { title: 'Manor', genre: 'mystery' },
    });
    expect(out).toContain('Title: Manor');
    expect(out).toContain('Genre: mystery');
  });

  it('summarizes existing beats with a type histogram', () => {
    const out = buildBeatSuggestionsUserPrompt({
      currentBeat: beat(),
      existingBeats: [
        beat({ id: 'a', type: 'infoText' }),
        beat({ id: 'b', type: 'infoText' }),
        beat({ id: 'c', type: 'dialogTree' }),
      ],
    });
    expect(out).toContain('Total Beats: 3');
    expect(out).toContain('infoText(2)');
    expect(out).toContain('dialogTree(1)');
  });

  it('defaults to requesting 3 suggestions, honoring count when set', () => {
    const def = buildBeatSuggestionsUserPrompt({ currentBeat: beat(), existingBeats: [] });
    expect(def).toContain('Suggest 3 logical next beats');
    const five = buildBeatSuggestionsUserPrompt({ currentBeat: beat(), existingBeats: [], count: 5 });
    expect(five).toContain('Suggest 5 logical next beats');
  });
});

describe('getBeatSuggestionsExample', () => {
  const example = getBeatSuggestionsExample();

  it('returns a user/assistant pair', () => {
    expect(example).toHaveProperty('user');
    expect(example).toHaveProperty('assistant');
  });

  it('the assistant side is valid JSON with a suggestions array', () => {
    const parsed = JSON.parse(example.assistant);
    expect(Array.isArray(parsed.suggestions)).toBe(true);
    expect(parsed.suggestions.length).toBeGreaterThanOrEqual(3);
  });

  it('every suggestion carries beatType, reasoning and a 0-1 confidence', () => {
    const parsed = JSON.parse(example.assistant);
    for (const s of parsed.suggestions) {
      expect(typeof s.beatType).toBe('string');
      expect(s.reasoning.length).toBeGreaterThan(0);
      expect(s.confidence).toBeGreaterThan(0);
      expect(s.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('suggestions are ordered by descending confidence (as the prompt demands)', () => {
    const parsed = JSON.parse(example.assistant);
    const confidences = parsed.suggestions.map((s: any) => s.confidence);
    const sorted = [...confidences].sort((a, b) => b - a);
    expect(confidences).toEqual(sorted);
  });
});
