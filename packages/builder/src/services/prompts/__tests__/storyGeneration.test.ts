/**
 * Tests for the lightweight story-generation prompt builders. This module
 * is the simpler alternative to storyGenerationEnhanced — kept for
 * lighter-weight callers (e.g. the MCP server) per the file header. The
 * providers use the enhanced variant for the main feature, so this one
 * has fewer guards, but the same structural contract: a system prompt that
 * embeds the schema + per-beat-type notes, a user prompt that branches on
 * request fields, and a valid few-shot example.
 */
import { describe, it, expect } from 'vitest';
import {
  buildStoryGenerationSystemPrompt,
  buildStoryGenerationUserPrompt,
  getStoryGenerationExample,
} from '../storyGeneration';
import type { StoryGenerationRequest } from '../../../types/ai';

const SCHEMA = {
  beatTypes: {
    titleScreen: { category: 'visible' },
    conditionBeat: { category: 'invisible' },
    pickProp: { category: 'visible' },
  },
};

describe('buildStoryGenerationSystemPrompt', () => {
  const prompt = buildStoryGenerationSystemPrompt(SCHEMA);

  it('lists the available beat types from the schema', () => {
    expect(prompt).toContain('titleScreen');
    expect(prompt).toContain('conditionBeat');
    expect(prompt).toContain('pickProp');
  });

  it('embeds the full schema as JSON', () => {
    expect(prompt).toContain('"category": "visible"');
  });

  it('requires beat_0 to be a titleScreen', () => {
    expect(prompt).toMatch(/beat_0 MUST be type "titleScreen"/);
  });

  it('limits conditionBeat to its 3 parameters', () => {
    expect(prompt).toMatch(/conditionBeat\*\*: ONLY 3 parameters/);
  });

  it('keeps the counter→conditionBeat coupling rule', () => {
    expect(prompt).toMatch(/If you use counters, you MUST include conditionBeat/i);
  });

  it('keeps the pickProp auto-add-to-inventory warning', () => {
    expect(prompt).toMatch(/AUTO-ADDS selected item to inventory/);
    expect(prompt).toMatch(/DO NOT follow with addRemoveInventory/);
  });

  it('keeps the counter-threshold-reachability rule', () => {
    // A genuinely load-bearing math guard: thresholds must be reachable.
    expect(prompt).toMatch(/Counter Threshold Reachability/);
  });

  it('requires every non-title beat to be reachable', () => {
    expect(prompt).toMatch(/Every beat \(except titleScreen\) must be reachable/);
  });

  it('documents the multi-language translation key format', () => {
    expect(prompt).toContain('beat:{beatId}.parameters.{field}');
  });
});

describe('buildStoryGenerationUserPrompt', () => {
  const base: StoryGenerationRequest = { prompt: 'A heist gone wrong' };

  it('always quotes the prompt', () => {
    expect(buildStoryGenerationUserPrompt(base)).toContain('Create an interactive story: "A heist gone wrong"');
  });

  it('omits optional lines when unset', () => {
    const out = buildStoryGenerationUserPrompt(base);
    expect(out).not.toContain('Genre:');
    expect(out).not.toContain('Length:');
    expect(out).not.toContain('Branching:');
    expect(out).not.toContain('Additional context:');
  });

  it('maps length to its short guide string', () => {
    expect(buildStoryGenerationUserPrompt({ ...base, length: 'short' })).toContain('5-10 beats, simple branching');
    expect(buildStoryGenerationUserPrompt({ ...base, length: 'long' })).toContain('20+ beats, complex branching');
  });

  it('maps complexity to its guide string', () => {
    expect(buildStoryGenerationUserPrompt({ ...base, complexity: 'linear' })).toContain('Mostly linear story');
    expect(buildStoryGenerationUserPrompt({ ...base, complexity: 'complex' })).toContain('Highly branching');
  });

  it('appends genre and context when set', () => {
    const out = buildStoryGenerationUserPrompt({ ...base, genre: 'noir', context: 'set in 1940s LA' });
    expect(out).toContain('Genre: noir');
    expect(out).toContain('Additional context: set in 1940s LA');
  });

  describe('multi-language', () => {
    it('single language → simple directive', () => {
      const out = buildStoryGenerationUserPrompt({ ...base, languages: ['fr'] });
      expect(out).toContain('Language: Write all content in fr');
      expect(out).not.toContain('Include translations for');
    });

    it('multiple languages → translation directive listing the extras', () => {
      const out = buildStoryGenerationUserPrompt({ ...base, languages: ['en', 'de', 'es'] });
      expect(out).toContain('Write story in en');
      expect(out).toContain('Include translations for: de, es');
    });

    it('empty languages array → no language line', () => {
      const out = buildStoryGenerationUserPrompt({ ...base, languages: [] });
      expect(out).not.toContain('Language');
    });
  });

  it('always ends with the JSON generation instruction', () => {
    expect(buildStoryGenerationUserPrompt(base)).toMatch(/Generate the complete story structure as JSON\.$/);
  });
});

describe('getStoryGenerationExample', () => {
  const example = getStoryGenerationExample();

  it('returns a user/assistant pair', () => {
    expect(example).toHaveProperty('user');
    expect(example).toHaveProperty('assistant');
  });

  it('the assistant side is valid JSON', () => {
    expect(() => JSON.parse(example.assistant)).not.toThrow();
  });

  it('models beat_0 as a titleScreen', () => {
    const story = JSON.parse(example.assistant);
    expect(story.beats[0].id).toBe('beat_0');
    expect(story.beats[0].type).toBe('titleScreen');
  });

  it('includes characters with role and displayName', () => {
    const story = JSON.parse(example.assistant);
    expect(story.characters.length).toBeGreaterThan(0);
    for (const c of story.characters) {
      expect(c.displayName).toBeTruthy();
      expect(c.role).toBeTruthy();
    }
  });
});
