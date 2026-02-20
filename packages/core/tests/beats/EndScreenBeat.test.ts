/**
 * Tests for EndScreenBeat - story conclusion
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EndScreenBeat } from '../../src/beats/EndScreenBeat';
import { StoryContext } from '../../src/engine/StoryContext';
import { Story } from '../../src/engine/Story';
import { InfoTextBeat } from '../../src/beats/InfoTextBeat';
import type { IRenderer } from '../../src/types';

function createMockRenderer(): IRenderer {
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
    renderChoices: vi.fn().mockResolvedValue(''),
    renderMovement: vi.fn().mockResolvedValue(''),
    renderPropSelection: vi.fn().mockResolvedValue(''),
    renderVideo: vi.fn().mockResolvedValue(undefined),
    renderEndScreen: vi.fn().mockResolvedValue(''),
    renderDurScreen: vi.fn().mockResolvedValue(undefined),
    renderInputText: vi.fn().mockResolvedValue(''),
    renderHyperText: vi.fn().mockResolvedValue(''),
  } as unknown as IRenderer;
}

function createStoryWithFirstBeat(): Story {
  const story = new Story({ firstBeatId: 'beat_0' });
  const firstBeat = new InfoTextBeat({
    id: 'beat_0',
    name: 'Start',
    type: 'infoText',
    text: 'Welcome!',
  });
  story.addBeat(firstBeat);
  return story;
}

describe('EndScreenBeat', () => {
  let context: StoryContext;
  let renderer: IRenderer;
  let story: Story;

  beforeEach(() => {
    story = createStoryWithFirstBeat();
    context = new StoryContext({}, story);
    renderer = createMockRenderer();
  });

  describe('constructor', () => {
    it('should create with default values', () => {
      const beat = new EndScreenBeat({
        id: 'end1',
        name: 'Ending',
        type: 'endScreen',
      });

      expect(beat.message).toBe('The End');
      expect(beat.showRestart).toBe(true);
      expect(beat.showCredits).toBe(false);
      expect(beat.reset).toBe(false);
    });

    it('should create with custom values', () => {
      const beat = new EndScreenBeat({
        id: 'end1',
        name: 'Good Ending',
        type: 'endScreen',
        message: 'Victory! You saved the kingdom!',
        showRestart: true,
        showCredits: true,
        restartText: 'Play Again',
        creditsText: 'View Credits',
      });

      expect(beat.message).toBe('Victory! You saved the kingdom!');
      expect(beat.showRestart).toBe(true);
      expect(beat.showCredits).toBe(true);
      expect(beat.restartText).toBe('Play Again');
      expect(beat.creditsText).toBe('View Credits');
    });

    it('should support parameters object format', () => {
      const beat = new EndScreenBeat({
        id: 'end1',
        name: 'Ending',
        type: 'endScreen',
        parameters: {
          message: 'Game Over',
          showRestart: false,
          showCredits: true,
        },
      });

      expect(beat.message).toBe('Game Over');
      expect(beat.showRestart).toBe(false);
      expect(beat.showCredits).toBe(true);
    });

    it('should support legacy buttonText', () => {
      const beat = new EndScreenBeat({
        id: 'end1',
        name: 'Ending',
        type: 'endScreen',
        buttonText: 'Try Again',
      });

      expect(beat.buttonText).toBe('Try Again');
    });
  });

  describe('getParameters', () => {
    it('should return all parameters', () => {
      const beat = new EndScreenBeat({
        id: 'end1',
        name: 'Ending',
        type: 'endScreen',
        message: 'The End',
        showRestart: true,
        showCredits: true,
        reset: true,
        restartText: 'Restart',
        creditsText: 'Credits',
        node: 'ending_bg',
      });

      const params = beat.getParameters();
      expect(params.message).toBe('The End');
      expect(params.showRestart).toBe(true);
      expect(params.showCredits).toBe(true);
      expect(params.reset).toBe(true);
      expect(params.restartText).toBe('Restart');
      expect(params.creditsText).toBe('Credits');
      expect(params.node).toBe('ending_bg');
    });
  });

  describe('updateParameters', () => {
    it('should update message', () => {
      const beat = new EndScreenBeat({
        id: 'end1',
        name: 'Ending',
        type: 'endScreen',
      });

      beat.updateParameters({ message: 'New ending!' });
      expect(beat.message).toBe('New ending!');
    });

    it('should update showRestart and showCredits', () => {
      const beat = new EndScreenBeat({
        id: 'end1',
        name: 'Ending',
        type: 'endScreen',
      });

      beat.updateParameters({ showRestart: false, showCredits: true });
      expect(beat.showRestart).toBe(false);
      expect(beat.showCredits).toBe(true);
    });

    it('should update restartText and creditsText', () => {
      const beat = new EndScreenBeat({
        id: 'end1',
        name: 'Ending',
        type: 'endScreen',
      });

      beat.updateParameters({ restartText: 'Retry', creditsText: 'See Credits' });
      expect(beat.restartText).toBe('Retry');
      expect(beat.creditsText).toBe('See Credits');
    });
  });

  describe('performAction', () => {
    it('should render end screen with message', async () => {
      (renderer.renderEndScreen as any).mockResolvedValue('restart');

      const beat = new EndScreenBeat({
        id: 'end1',
        name: 'Ending',
        type: 'endScreen',
        message: 'Congratulations!',
        showRestart: true,
      });

      await beat.execute(context, renderer);

      expect(renderer.renderEndScreen).toHaveBeenCalledWith(
        'Congratulations!',
        true,
        false,
        expect.any(Array)
      );
    });

    it('should navigate to first beat when user clicks restart (no outgoing connection)', async () => {
      (renderer.renderEndScreen as any).mockResolvedValue('restart');

      const beat = new EndScreenBeat({
        id: 'end1',
        name: 'Ending',
        type: 'endScreen',
        showRestart: true,
      });

      const result = await beat.execute(context, renderer);

      // With no outgoing connection, navigates to story's first beat
      expect(result).toBe('beat_0');
    });

    it('should navigate to first beat for Play Again action', async () => {
      (renderer.renderEndScreen as any).mockResolvedValue('Play Again');

      const beat = new EndScreenBeat({
        id: 'end1',
        name: 'Ending',
        type: 'endScreen',
        showRestart: true,
      });

      const result = await beat.execute(context, renderer);

      expect(result).toBe('beat_0');
    });

    it('should navigate to first beat for button1 when showRestart is true', async () => {
      (renderer.renderEndScreen as any).mockResolvedValue('button1');

      const beat = new EndScreenBeat({
        id: 'end1',
        name: 'Ending',
        type: 'endScreen',
        showRestart: true,
      });

      const result = await beat.execute(context, renderer);

      expect(result).toBe('beat_0');
    });

    it('should navigate to outgoing connection target when available', async () => {
      (renderer.renderEndScreen as any).mockResolvedValue('restart');

      const beat = new EndScreenBeat({
        id: 'end1',
        name: 'Ending',
        type: 'endScreen',
        showRestart: true,
      });
      // Add an outgoing connection to a specific beat
      beat.connections = [{ targetId: 'beat_5' }];

      const result = await beat.execute(context, renderer);

      expect(result).toBe('beat_5');
    });

    it('should return null for unknown action with both buttons', async () => {
      (renderer.renderEndScreen as any).mockResolvedValue('unknown');

      const beat = new EndScreenBeat({
        id: 'end1',
        name: 'Ending',
        type: 'endScreen',
        showRestart: true,
        showCredits: true, // Both buttons means single-button shortcut doesn't apply
      });

      const result = await beat.execute(context, renderer);

      expect(result).toBeNull();
    });

    it('should reset context when reset is true', async () => {
      (renderer.renderEndScreen as any).mockResolvedValue('');
      context.setVariable('test', 'value');

      const beat = new EndScreenBeat({
        id: 'end1',
        name: 'Ending',
        type: 'endScreen',
        reset: true,
        showRestart: false,
      });

      await beat.execute(context, renderer);

      // Context should have been reset
      expect(context.getVariable('test')).toBeUndefined();
    });

    it('should process message with variable interpolation', async () => {
      context.setVariable('score', '100');
      (renderer.renderEndScreen as any).mockResolvedValue('');

      const beat = new EndScreenBeat({
        id: 'end1',
        name: 'Ending',
        type: 'endScreen',
        message: 'Your score: $score$ points!',
        showRestart: false,
      });

      await beat.execute(context, renderer);

      expect(renderer.renderEndScreen).toHaveBeenCalledWith(
        'Your score: 100 points!',
        expect.any(Boolean),
        expect.any(Boolean),
        expect.any(Array)
      );
    });

    it('should set restartText and creditsText in renderer state', async () => {
      (renderer.renderEndScreen as any).mockResolvedValue('');

      const beat = new EndScreenBeat({
        id: 'end1',
        name: 'Ending',
        type: 'endScreen',
        restartText: 'Try Again',
        creditsText: 'See Credits',
        showRestart: false,
      });

      await beat.execute(context, renderer);

      expect(renderer.setState).toHaveBeenCalledWith('restartText', 'Try Again');
      expect(renderer.setState).toHaveBeenCalledWith('creditsText', 'See Credits');
    });

    it('should navigate to first beat when single button with showRestart', async () => {
      (renderer.renderEndScreen as any).mockResolvedValue('anything');

      const beat = new EndScreenBeat({
        id: 'end1',
        name: 'Ending',
        type: 'endScreen',
        showRestart: true,
        showCredits: false, // Only restart button
      });

      const result = await beat.execute(context, renderer);

      expect(result).toBe('beat_0');
    });
  });
});
