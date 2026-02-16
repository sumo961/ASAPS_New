/**
 * Tests for HyperTextBeat - clickable word/phrase branching
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HyperTextBeat } from '../../src/beats/HyperTextBeat';
import { StoryContext } from '../../src/engine/StoryContext';
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
    renderEndScreen: vi.fn().mockResolvedValue(undefined),
    renderDurScreen: vi.fn().mockResolvedValue(undefined),
    renderInputText: vi.fn().mockResolvedValue(''),
    renderHyperText: vi.fn().mockResolvedValue(''),
  } as unknown as IRenderer;
}

describe('HyperTextBeat', () => {
  let context: StoryContext;
  let renderer: IRenderer;

  beforeEach(() => {
    context = new StoryContext();
    renderer = createMockRenderer();
  });

  describe('constructor', () => {
    it('should create with default values', () => {
      const beat = new HyperTextBeat({
        id: 'ht1',
        name: 'HyperText',
        type: 'hyperText',
      });

      expect(beat.text).toBe('Click on any word to explore.');
      expect(beat.hyperlinks).toEqual([]);
      expect(beat.allowMultipleClicks).toBe(false);
      expect(beat.highlightColor).toBe('#0066cc');
      expect(beat.hoverColor).toBe('#003366');
    });

    it('should create with custom text and hyperlinks', () => {
      const beat = new HyperTextBeat({
        id: 'ht1',
        name: 'HyperText',
        type: 'hyperText',
        text: 'You see a silver key on the desk.',
        hyperlinks: [
          { word: 'silver key', targetBeatId: 'beat_key' },
          { word: 'desk', targetBeatId: 'beat_desk' },
        ],
      });

      expect(beat.text).toBe('You see a silver key on the desk.');
      expect(beat.hyperlinks).toHaveLength(2);
      expect(beat.hyperlinks[0].word).toBe('silver key');
    });

    it('should support parameters object format', () => {
      const beat = new HyperTextBeat({
        id: 'ht1',
        name: 'HyperText',
        type: 'hyperText',
        parameters: {
          text: 'Look around the room.',
          hyperlinks: [{ word: 'room', targetBeatId: 'beat_room' }],
          allowMultipleClicks: true,
        },
      });

      expect(beat.text).toBe('Look around the room.');
      expect(beat.hyperlinks).toHaveLength(1);
      expect(beat.allowMultipleClicks).toBe(true);
    });

    it('should support custom colors', () => {
      const beat = new HyperTextBeat({
        id: 'ht1',
        name: 'HyperText',
        type: 'hyperText',
        highlightColor: '#ff0000',
        hoverColor: '#cc0000',
      });

      expect(beat.highlightColor).toBe('#ff0000');
      expect(beat.hoverColor).toBe('#cc0000');
    });
  });

  describe('getParameters', () => {
    it('should return all parameters', () => {
      const beat = new HyperTextBeat({
        id: 'ht1',
        name: 'HyperText',
        type: 'hyperText',
        text: 'Explore the room.',
        hyperlinks: [{ word: 'room', targetBeatId: 'beat_room' }],
        allowMultipleClicks: true,
        highlightColor: '#ff0000',
        hoverColor: '#cc0000',
        node: 'room_bg',
        backgroundSound: 'ambient.mp3',
      });

      const params = beat.getParameters();
      expect(params.text).toBe('Explore the room.');
      expect(params.hyperlinks).toHaveLength(1);
      expect(params.allowMultipleClicks).toBe(true);
      expect(params.highlightColor).toBe('#ff0000');
      expect(params.hoverColor).toBe('#cc0000');
      expect(params.node).toBe('room_bg');
      expect(params.backgroundSound).toBe('ambient.mp3');
    });
  });

  describe('updateParameters', () => {
    it('should update text and hyperlinks', () => {
      const beat = new HyperTextBeat({
        id: 'ht1',
        name: 'HyperText',
        type: 'hyperText',
      });

      beat.updateParameters({
        text: 'New text with a link.',
        hyperlinks: [{ word: 'link', targetBeatId: 'beat_link' }],
      });

      expect(beat.text).toBe('New text with a link.');
      expect(beat.hyperlinks).toHaveLength(1);
    });

    it('should update allowMultipleClicks', () => {
      const beat = new HyperTextBeat({
        id: 'ht1',
        name: 'HyperText',
        type: 'hyperText',
      });

      beat.updateParameters({ allowMultipleClicks: true });
      expect(beat.allowMultipleClicks).toBe(true);
    });

    it('should update colors', () => {
      const beat = new HyperTextBeat({
        id: 'ht1',
        name: 'HyperText',
        type: 'hyperText',
      });

      beat.updateParameters({ highlightColor: '#00ff00', hoverColor: '#009900' });
      expect(beat.highlightColor).toBe('#00ff00');
      expect(beat.hoverColor).toBe('#009900');
    });
  });

  describe('getConnections', () => {
    it('should return connections from hyperlinks', () => {
      const beat = new HyperTextBeat({
        id: 'ht1',
        name: 'HyperText',
        type: 'hyperText',
        hyperlinks: [
          { word: 'silver key', targetBeatId: 'beat_key' },
          { word: 'desk', targetBeatId: 'beat_desk' },
          { word: 'window', targetBeatId: 'beat_window' },
        ],
      });

      const connections = beat.getConnections();
      expect(connections).toHaveLength(3);
      expect(connections[0].targetId).toBe('beat_key');
      expect(connections[0].label).toBe('silver key');
      expect(connections[1].targetId).toBe('beat_desk');
      expect(connections[2].targetId).toBe('beat_window');
    });

    it('should skip hyperlinks without targetBeatId', () => {
      const beat = new HyperTextBeat({
        id: 'ht1',
        name: 'HyperText',
        type: 'hyperText',
        hyperlinks: [
          { word: 'valid', targetBeatId: 'beat_valid' },
          { word: 'invalid' } as any,
        ],
      });

      const connections = beat.getConnections();
      expect(connections).toHaveLength(1);
      expect(connections[0].targetId).toBe('beat_valid');
    });
  });

  describe('performAction', () => {
    it('should render hypertext and return selected target', async () => {
      (renderer.renderHyperText as any).mockResolvedValue('beat_key');

      const beat = new HyperTextBeat({
        id: 'ht1',
        name: 'HyperText',
        type: 'hyperText',
        text: 'You see a silver key on the desk.',
        hyperlinks: [
          { word: 'silver key', targetBeatId: 'beat_key' },
          { word: 'desk', targetBeatId: 'beat_desk' },
        ],
      });

      const result = await beat.execute(context, renderer);

      expect(renderer.renderHyperText).toHaveBeenCalled();
      expect(result).toBe('beat_key');
    });

    it('should process text with variable interpolation', async () => {
      context.setVariable('item', 'golden ring');
      (renderer.renderHyperText as any).mockResolvedValue('beat_ring');

      const beat = new HyperTextBeat({
        id: 'ht1',
        name: 'HyperText',
        type: 'hyperText',
        text: 'You notice a $item$ on the shelf.',
        hyperlinks: [
          { word: 'golden ring', targetBeatId: 'beat_ring' },
        ],
      });

      await beat.execute(context, renderer);

      const callArgs = (renderer.renderHyperText as any).mock.calls[0];
      expect(callArgs[0].text).toBe('You notice a golden ring on the shelf.');
    });

    it('should record choice for AI context', async () => {
      (renderer.renderHyperText as any).mockResolvedValue('beat_key');

      const beat = new HyperTextBeat({
        id: 'ht1',
        name: 'Click Test',
        type: 'hyperText',
        text: 'You see a silver key.',
        hyperlinks: [
          { word: 'silver key', targetBeatId: 'beat_key' },
        ],
      });

      await beat.execute(context, renderer);

      const history = context.getChoiceHistory();
      expect(history).toHaveLength(1);
      expect(history[0].beatType).toBe('hyperText');
      expect(history[0].choiceText).toContain('silver key');
    });

    it('should pass hypertext data with correct style to renderer', async () => {
      (renderer.renderHyperText as any).mockResolvedValue('beat_link');

      const beat = new HyperTextBeat({
        id: 'ht1',
        name: 'HyperText',
        type: 'hyperText',
        text: 'Click the link.',
        hyperlinks: [
          {
            word: 'link',
            targetBeatId: 'beat_link',
            style: { color: '#ff0000', underline: false, bold: true },
          },
        ],
        highlightColor: '#0066cc',
        hoverColor: '#003366',
      });

      await beat.execute(context, renderer);

      const callArgs = (renderer.renderHyperText as any).mock.calls[0];
      const links = callArgs[0].links;
      expect(links[0].word).toBe('link');
      expect(links[0].style.color).toBe('#ff0000');
      expect(links[0].style.underline).toBe(false);
      expect(links[0].style.bold).toBe(true);
      expect(links[0].style.hoverColor).toBe('#003366');
    });

    it('should use default style when link has no custom style', async () => {
      (renderer.renderHyperText as any).mockResolvedValue('beat_word');

      const beat = new HyperTextBeat({
        id: 'ht1',
        name: 'HyperText',
        type: 'hyperText',
        text: 'Click a word.',
        hyperlinks: [
          { word: 'word', targetBeatId: 'beat_word' },
        ],
        highlightColor: '#0066cc',
      });

      await beat.execute(context, renderer);

      const callArgs = (renderer.renderHyperText as any).mock.calls[0];
      const links = callArgs[0].links;
      expect(links[0].style.color).toBe('#0066cc');
      expect(links[0].style.underline).toBe(true);
      expect(links[0].style.bold).toBe(false);
    });
  });
});
