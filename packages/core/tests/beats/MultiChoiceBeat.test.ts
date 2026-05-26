/**
 * Tests for MultiChoiceBeat — NPC prompt + several response buttons,
 * single-level (no nesting), full per-choice effect surface.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MultiChoiceBeat } from '../../src/beats/MultiChoiceBeat';
import { StoryContext } from '../../src/engine/StoryContext';
import type { IRenderer } from '../../src/types';

function createMockRenderer(choicePicked = ''): IRenderer {
  return {
    initialize: vi.fn(),
    clear: vi.fn(),
    playSound: vi.fn(),
    stopSound: vi.fn(),
    setState: vi.fn(),
    getState: vi.fn().mockReturnValue(null),
    renderTitleScreen: vi.fn().mockResolvedValue(undefined),
    renderText: vi.fn().mockResolvedValue(undefined),
    renderDialog: vi.fn().mockResolvedValue(undefined),
    renderChoices: vi.fn().mockResolvedValue(choicePicked),
    renderMovement: vi.fn().mockResolvedValue(''),
    renderPropSelection: vi.fn().mockResolvedValue(''),
    renderVideo: vi.fn().mockResolvedValue(undefined),
    renderEndScreen: vi.fn().mockResolvedValue(undefined),
    renderDurScreen: vi.fn().mockResolvedValue(undefined),
    renderInputText: vi.fn().mockResolvedValue(''),
    renderHyperText: vi.fn().mockResolvedValue(''),
  } as unknown as IRenderer;
}

describe('MultiChoiceBeat', () => {
  let context: StoryContext;

  beforeEach(() => {
    context = new StoryContext();
  });

  describe('construction', () => {
    it('uses sensible defaults for an empty beat', () => {
      const beat = new MultiChoiceBeat({
        id: 'mc1',
        name: 'Greeting',
        type: 'multiChoice',
      });
      const params = beat.getParameters();
      expect(params.question).toBe('What do you say?');
      expect(params.choices).toEqual([]);
      expect(params.markVisited).toBe(false);
    });

    it('accepts question + choices via top-level config', () => {
      const beat = new MultiChoiceBeat({
        id: 'mc1',
        name: 'Greeting',
        type: 'multiChoice',
        question: 'Friend or foe?',
        choices: [
          { id: 'a', text: 'Friend', target: 'beat_friend' },
          { id: 'b', text: 'Foe', target: 'beat_foe' },
        ],
      });
      expect(beat.question).toBe('Friend or foe?');
      expect(beat.choices).toHaveLength(2);
      expect(beat.choices[0].target).toBe('beat_friend');
    });

    it('accepts question + choices via parameters bag (load-from-storage shape)', () => {
      const beat = new MultiChoiceBeat({
        id: 'mc1',
        name: 'Greeting',
        type: 'multiChoice',
        parameters: {
          question: 'Hello?',
          choices: [{ id: 'a', text: 'Hi', target: 'beat_next' }],
        },
      });
      expect(beat.question).toBe('Hello?');
      expect(beat.choices).toHaveLength(1);
    });
  });

  describe('updateParameters', () => {
    it('updates question without touching choices', () => {
      const beat = new MultiChoiceBeat({
        id: 'mc1',
        name: 'Greeting',
        type: 'multiChoice',
        choices: [{ id: 'a', text: 'A', target: 't1' }],
      });
      beat.updateParameters({ question: 'New question' });
      expect(beat.question).toBe('New question');
      expect(beat.choices).toHaveLength(1);
    });

    it('rebuilds connections when choices change', () => {
      const beat = new MultiChoiceBeat({
        id: 'mc1',
        name: 'Greeting',
        type: 'multiChoice',
        choices: [{ id: 'a', text: 'A', target: 'old_target' }],
      });
      beat.updateParameters({
        choices: [
          { id: 'b', text: 'B', target: 'new_target_1' },
          { id: 'c', text: 'C', target: 'new_target_2' },
        ],
      });
      const conns = beat.getConnections();
      const targets = conns.map(c => c.targetId).sort();
      expect(targets).toEqual(['new_target_1', 'new_target_2']);
    });

    it('skips __self__ in connections (loop-back is internal, not graph-visible)', () => {
      const beat = new MultiChoiceBeat({
        id: 'mc1',
        name: 'Greeting',
        type: 'multiChoice',
        choices: [
          { id: 'a', text: 'Again', target: '__self__' },
          { id: 'b', text: 'Done', target: 'beat_next' },
        ],
      });
      const conns = beat.getConnections();
      expect(conns.map(c => c.targetId)).toEqual(['beat_next']);
    });
  });

  describe('performAction', () => {
    it('renders the prompt via renderDialog and the buttons via renderChoices', async () => {
      const renderer = createMockRenderer('a');
      const beat = new MultiChoiceBeat({
        id: 'mc1',
        name: 'Greeting',
        type: 'multiChoice',
        question: 'Friend or foe?',
        choices: [
          { id: 'a', text: 'Friend', target: 'beat_friend' },
          { id: 'b', text: 'Foe', target: 'beat_foe' },
        ],
      });
      const next = await (beat as any).performAction(context, renderer);
      expect(renderer.renderDialog).toHaveBeenCalledWith('', 'Friend or foe?');
      expect(renderer.renderChoices).toHaveBeenCalledTimes(1);
      expect(next).toBe('beat_friend');
    });

    it('passes the speaker to renderDialog when one is set', async () => {
      const renderer = createMockRenderer('a');
      const beat = new MultiChoiceBeat({
        id: 'mc1',
        name: 'Greeting',
        type: 'multiChoice',
        speaker: 'Alex',
        question: 'Hi!',
        choices: [{ id: 'a', text: 'Hi back', target: 'beat_next' }],
      });
      await (beat as any).performAction(context, renderer);
      expect(renderer.renderDialog).toHaveBeenCalledWith('Alex', 'Hi!');
    });

    it('applies per-choice effects on selection', async () => {
      const renderer = createMockRenderer('a');
      const beat = new MultiChoiceBeat({
        id: 'mc1',
        name: 'Greeting',
        type: 'multiChoice',
        choices: [
          {
            id: 'a',
            text: 'Friend',
            target: 'beat_next',
            effects: [{ type: 'setVariable', target: 'mood', value: 'happy' } as any],
          },
        ],
      });
      const applySpy = vi.spyOn(context, 'applyEffect');
      const next = await (beat as any).performAction(context, renderer);
      expect(applySpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'setVariable', target: 'mood', value: 'happy' }),
      );
      expect(next).toBe('beat_next');
    });

    it('filters choices by condition before rendering', async () => {
      const renderer = createMockRenderer('b');
      // Choice "a" gated on a variable that is not set; only "b" should render.
      const beat = new MultiChoiceBeat({
        id: 'mc1',
        name: 'Greeting',
        type: 'multiChoice',
        choices: [
          {
            id: 'a',
            text: 'Gated',
            target: 'beat_gated',
            conditions: [
              { type: 'variable', operator: '==', variableName: 'hasKey', value: true } as any,
            ],
          },
          { id: 'b', text: 'Open', target: 'beat_open' },
        ],
      });
      await (beat as any).performAction(context, renderer);
      const arg = (renderer.renderChoices as any).mock.calls[0][0];
      expect(arg.map((c: any) => c.id)).toEqual(['b']);
    });
  });
});
