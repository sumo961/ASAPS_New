/**
 * Tests for the dialog-tree generation prompt builders. These drive the
 * "Generate Dialog with AI" feature. The system prompt teaches the model
 * the compact alternating dialogNode/choice structure and several rules
 * the model violates without them ("[Continue]" placeholders, the
 * choice-text-is-the-player's-line convention, the __self__ loop target).
 * Pin the load-bearing markers + the request-field branching.
 */
import { describe, it, expect } from 'vitest';
import {
  buildDialogGenerationSystemPrompt,
  buildDialogGenerationUserPrompt,
  getDialogGenerationExample,
} from '../dialogGeneration';
import type { DialogGenerationRequest } from '../../../types/ai';

describe('buildDialogGenerationSystemPrompt', () => {
  const prompt = buildDialogGenerationSystemPrompt();

  it('introduces the expert-dialogue-writer role', () => {
    expect(prompt).toMatch(/expert dialogue writer/i);
  });

  it('teaches the choice-text-is-the-players-line convention', () => {
    // The single most important structural insight — the model
    // otherwise writes choices as paraphrased intents.
    expect(prompt).toMatch(/The choice text IS the player'?s line/i);
  });

  it('documents the nested dialogNode response structure', () => {
    expect(prompt).toContain('dialogNode');
    expect(prompt).toMatch(/NPC responds to this choice/i);
  });

  it('forbids "[Continue]" / placeholder choice text', () => {
    expect(prompt).toMatch(/NEVER use "\[Continue\]"/);
  });

  it('documents the __self__ loop target for multi-question dialogs', () => {
    expect(prompt).toContain('__self__');
    expect(prompt).toMatch(/markVisited/);
  });

  it('documents NPC auto-exit (target on a node skips choices)', () => {
    expect(prompt).toMatch(/NPC AUTO-EXIT/);
    expect(prompt).toMatch(/auto-advance WITHOUT showing choices/i);
  });

  it('documents the speaker = character displayName rule', () => {
    expect(prompt).toMatch(/must match a character'?s \*\*displayName\*\*/);
    expect(prompt).toContain('Narrator');
  });

  it('documents the three presentation modes', () => {
    expect(prompt).toContain('positioned');
    expect(prompt).toContain('chat-scroll');
    expect(prompt).toContain('chat-bubble');
  });

  it('documents counter effects on choices (counter/counterOperation/counterValue)', () => {
    expect(prompt).toContain('counterOperation');
    expect(prompt).toContain('counterValue');
  });
});

describe('buildDialogGenerationUserPrompt', () => {
  const base: DialogGenerationRequest = { scene: 'A tense standoff at the docks' };

  it('always includes the scene', () => {
    expect(buildDialogGenerationUserPrompt(base)).toContain('Scene: A tense standoff at the docks');
  });

  it('omits optional fields when unset', () => {
    const out = buildDialogGenerationUserPrompt(base);
    expect(out).not.toContain('Speaking Character:');
    expect(out).not.toContain('Conversation Goal:');
    expect(out).not.toContain('Branching:');
    expect(out).not.toContain('Story Context:');
  });

  it('includes character, goal and branching factor when set', () => {
    const out = buildDialogGenerationUserPrompt({
      ...base,
      character: 'Captain Reyes',
      goal: 'Get the manifest',
      branchingFactor: 4,
    });
    expect(out).toContain('Speaking Character: Captain Reyes');
    expect(out).toContain('Conversation Goal: Get the manifest');
    expect(out).toContain('Include 4 distinct player choice options');
  });

  it('renders story context with variables and other characters', () => {
    const out = buildDialogGenerationUserPrompt({
      ...base,
      storyContext: {
        title: 'Harbor Nights',
        existingBeats: [],
        variables: ['trust', 'hasManifest'],
        characters: ['Reyes', 'Dockmaster'],
      },
    });
    expect(out).toContain('Title: Harbor Nights');
    expect(out).toContain('Available Variables: trust, hasManifest');
    expect(out).toContain('Other Characters: Reyes, Dockmaster');
  });

  it('omits the variables/characters lines when those arrays are empty', () => {
    const out = buildDialogGenerationUserPrompt({
      ...base,
      storyContext: { title: 'Harbor Nights', existingBeats: [], variables: [], characters: [] },
    });
    expect(out).toContain('Title: Harbor Nights');
    expect(out).not.toContain('Available Variables:');
    expect(out).not.toContain('Other Characters:');
  });

  it('always ends with the JSON generation instruction', () => {
    expect(buildDialogGenerationUserPrompt(base)).toMatch(/Generate the dialog tree as JSON\.$/);
  });
});

describe('getDialogGenerationExample', () => {
  const example = getDialogGenerationExample();

  it('returns a user/assistant pair', () => {
    expect(example).toHaveProperty('user');
    expect(example).toHaveProperty('assistant');
  });

  it('the assistant side is valid JSON with a root dialogTree', () => {
    const parsed = JSON.parse(example.assistant);
    expect(parsed.dialogTree.id).toBe('root');
    expect(Array.isArray(parsed.dialogTree.choices)).toBe(true);
  });

  it('every leaf choice exits via a target (no dangling [Continue])', () => {
    // The example must model the "final choice is the player's last
    // line + target" rule it teaches.
    const parsed = JSON.parse(example.assistant);
    for (const choice of parsed.dialogTree.choices) {
      // Each top choice nests a node whose choices all carry targets.
      const node = choice.dialogNode ?? {};
      for (const inner of node.choices ?? []) {
        expect(inner.target).toBeTruthy();
        expect(inner.text).not.toContain('[Continue]');
      }
    }
  });

  it('demonstrates distinct emotional approaches (the reasoning says so)', () => {
    const parsed = JSON.parse(example.assistant);
    expect(parsed.reasoning).toMatch(/sympathetic|aggressive|factual/i);
  });
});
