/**
 * Tests for ConversationChoiceBeat — legacy NPC dialog beat (a
 * questioner + question + N text choices, each with its own target).
 * Functionally a small DialogTree without nested follow-ups.
 *
 * Most modern projects use DialogTree / MultiChoice instead, but
 * legacy projects + imported ASML keep landing here, so the
 * regression surface matters.
 *
 * Coverage focus:
 *   - constructor parameter resolution (top-level vs nested,
 *     defaults)
 *   - dialog render (questioner + question, variable-interpolated)
 *   - choice render (id passed through, text variable-interpolated)
 *   - selected choice's targetBeat returned as next-beat
 *   - falls through to getNextBeat when the renderer returns an
 *     unknown id (defensive — never crash on a renderer wobble)
 */
import { describe, it, expect } from 'vitest';
import { ConversationChoiceBeat } from '../../src/beats/ConversationChoiceBeat';
import { makeRenderer, makeContext } from '../helpers/beatHarness';

describe('ConversationChoiceBeat', () => {
  describe('constructor / parameter resolution', () => {
    it('reads top-level fields', () => {
      const beat = new ConversationChoiceBeat({
        id: 'b1',
        questioner: 'Alice',
        question: 'Coffee?',
        choices: [
          { id: 'yes', text: 'Yes', targetBeat: 'after-yes' },
          { id: 'no', text: 'No', targetBeat: 'after-no' },
        ],
      } as any);
      expect(beat.questioner).toBe('Alice');
      expect(beat.question).toBe('Coffee?');
      expect(beat.choices).toHaveLength(2);
    });

    it('reads from nested parameters', () => {
      const beat = new ConversationChoiceBeat({
        id: 'b1',
        parameters: {
          questioner: 'Bob',
          question: 'Tea?',
          choices: [{ id: 'y', text: 'OK', targetBeat: 't1' }],
        },
      } as any);
      expect(beat.questioner).toBe('Bob');
      expect(beat.question).toBe('Tea?');
      expect(beat.choices).toEqual([{ id: 'y', text: 'OK', targetBeat: 't1' }]);
    });

    it('top-level wins over nested', () => {
      const beat = new ConversationChoiceBeat({
        id: 'b1',
        questioner: 'Top',
        parameters: { questioner: 'Nested' },
      } as any);
      expect(beat.questioner).toBe('Top');
    });

    it('defaults questioner to "Character"', () => {
      // Honest default — nameless speaker is generic.
      const beat = new ConversationChoiceBeat({ id: 'b1' } as any);
      expect(beat.questioner).toBe('Character');
    });

    it('defaults question to empty string', () => {
      const beat = new ConversationChoiceBeat({ id: 'b1' } as any);
      expect(beat.question).toBe('');
    });

    it('defaults choices to empty array', () => {
      const beat = new ConversationChoiceBeat({ id: 'b1' } as any);
      expect(beat.choices).toEqual([]);
    });
  });

  describe('rendering', () => {
    it('renders the dialog with questioner + question', async () => {
      const { renderer, methods } = makeRenderer({
        renderChoices: 'yes',
      });
      const beat = new ConversationChoiceBeat({
        id: 'b1',
        questioner: 'Alice',
        question: 'Coffee?',
        choices: [{ id: 'yes', text: 'Yes please', targetBeat: 't1' }],
      } as any);
      const ctx = makeContext();

      await beat.execute(ctx, renderer);

      expect(methods.renderDialog).toHaveBeenCalledOnce();
      const [speaker, text] = methods.renderDialog.mock.calls[0];
      expect(speaker).toBe('Alice');
      expect(text).toBe('Coffee?');
    });

    it('interpolates variables into questioner and question', async () => {
      const { renderer, methods } = makeRenderer({
        renderChoices: 'a',
      });
      const beat = new ConversationChoiceBeat({
        id: 'b1',
        questioner: '{npcName}',
        question: 'Are you {playerStatus}?',
        choices: [{ id: 'a', text: 'Yes', targetBeat: 't' }],
      } as any);
      const ctx = makeContext(c => {
        c.setVariable('npcName', 'Alice');
        c.setVariable('playerStatus', 'tired');
      });

      await beat.execute(ctx, renderer);

      const [speaker, text] = methods.renderDialog.mock.calls[0];
      expect(speaker).toBe('Alice');
      expect(text).toBe('Are you tired?');
    });

    it('passes choices (id + interpolated text) to renderChoices', async () => {
      const { renderer, methods } = makeRenderer({
        renderChoices: 'no',
      });
      const beat = new ConversationChoiceBeat({
        id: 'b1',
        questioner: 'NPC',
        question: 'Q',
        choices: [
          { id: 'yes', text: 'Yes, {playerName}', targetBeat: 't1' },
          { id: 'no', text: 'Not today', targetBeat: 't2' },
        ],
      } as any);
      const ctx = makeContext(c => c.setVariable('playerName', 'Alice'));

      await beat.execute(ctx, renderer);

      expect(methods.renderChoices).toHaveBeenCalledOnce();
      const [choicesArg] = methods.renderChoices.mock.calls[0];
      expect(choicesArg).toEqual([
        { id: 'yes', text: 'Yes, Alice' },
        { id: 'no', text: 'Not today' },
      ]);
    });
  });

  describe('target routing', () => {
    it('returns the targetBeat of the selected choice', async () => {
      const { renderer } = makeRenderer({ renderChoices: 'yes' });
      const beat = new ConversationChoiceBeat({
        id: 'b1',
        questioner: 'NPC',
        question: 'Q',
        choices: [
          { id: 'yes', text: 'Yes', targetBeat: 'after-yes' },
          { id: 'no', text: 'No', targetBeat: 'after-no' },
        ],
        defaultTarget: 'fallback',
      } as any);
      const ctx = makeContext();

      const next = await beat.execute(ctx, renderer);

      // Selected choice's targetBeat wins over defaultTarget.
      expect(next).toBe('after-yes');
    });

    it('returns "after-no" when the renderer picks "no"', async () => {
      const { renderer } = makeRenderer({ renderChoices: 'no' });
      const beat = new ConversationChoiceBeat({
        id: 'b1',
        questioner: 'NPC',
        question: 'Q',
        choices: [
          { id: 'yes', text: 'Yes', targetBeat: 'after-yes' },
          { id: 'no', text: 'No', targetBeat: 'after-no' },
        ],
      } as any);
      const ctx = makeContext();

      const next = await beat.execute(ctx, renderer);
      expect(next).toBe('after-no');
    });

    it('falls through to getNextBeat when the returned id matches no choice', async () => {
      // Defensive — a renderer that returns '' or an unrelated id
      // (e.g. on a bug or a mis-wired event) shouldn't crash. The
      // beat should fall through cleanly.
      const { renderer } = makeRenderer({ renderChoices: 'never-existed' });
      const beat = new ConversationChoiceBeat({
        id: 'b1',
        questioner: 'NPC',
        question: 'Q',
        choices: [{ id: 'yes', text: 'Yes', targetBeat: 'after-yes' }],
        defaultTarget: 'safe-fallback',
      } as any);
      const ctx = makeContext();

      const next = await beat.execute(ctx, renderer);

      expect(next).toBe('safe-fallback');
    });

    it('falls through when choices array is empty', async () => {
      // No choices configured — renderer's empty-choice render
      // returns nothing meaningful. Treat as "click through".
      const { renderer } = makeRenderer({ renderChoices: '' });
      const beat = new ConversationChoiceBeat({
        id: 'b1',
        questioner: 'NPC',
        question: 'Just narration',
        choices: [],
        defaultTarget: 'next',
      } as any);
      const ctx = makeContext();

      const next = await beat.execute(ctx, renderer);
      expect(next).toBe('next');
    });
  });

  describe('getParameters round-trip', () => {
    it('serializes all fields', () => {
      const beat = new ConversationChoiceBeat({
        id: 'b1',
        questioner: 'X',
        question: 'Y',
        choices: [{ id: 'a', text: 'A', targetBeat: 't1' }],
      } as any);
      expect(beat.getParameters()).toEqual({
        questioner: 'X',
        question: 'Y',
        choices: [{ id: 'a', text: 'A', targetBeat: 't1' }],
      });
    });

    it('updateParameters mutates in place', () => {
      const beat = new ConversationChoiceBeat({ id: 'b1' } as any);
      beat.updateParameters({
        questioner: 'Updated',
        question: 'New?',
        choices: [{ id: 'c1', text: 'c', targetBeat: 't' }],
      });
      expect(beat.questioner).toBe('Updated');
      expect(beat.question).toBe('New?');
      expect(beat.choices).toHaveLength(1);
    });
  });
});
