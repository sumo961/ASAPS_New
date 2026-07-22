/**
 * Tests for VideoBeat
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VideoBeat } from '../../src/beats/VideoBeat';
import { StoryContext } from '../../src/engine/StoryContext';
import type { IRenderer } from '../../src/types';

function createMockRenderer() {
  const stateStore: Record<string, any> = {};

  const renderer: IRenderer = {
    initialize: vi.fn(),
    clear: vi.fn(),
    playSound: vi.fn(),
    stopSound: vi.fn(),
    setState: vi.fn().mockImplementation((key, value) => { stateStore[key] = value; }),
    getState: vi.fn().mockImplementation((key) => stateStore[key] ?? null),
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
  };

  return { renderer, getState: (key: string) => stateStore[key] };
}

describe('VideoBeat', () => {
  let context: StoryContext;

  beforeEach(() => {
    context = new StoryContext();
  });

  describe('constructor and parameters', () => {
    it('should initialize with default values', () => {
      const beat = new VideoBeat({
        id: 'video_1',
        name: 'Test Video',
        type: 'videoBeat',
      });

      expect(beat.videoFile).toBe('');
      expect(beat.videoAssetId).toBeUndefined();
      expect(beat.autoplay).toBe(true);
      expect(beat.controls).toBe(true);
      expect(beat.skipButton).toBe(true);
    });

    it('should initialize from parameters', () => {
      const beat = new VideoBeat({
        id: 'video_1',
        name: 'Test Video',
        type: 'videoBeat',
        parameters: {
          videoFile: 'test.mp4',
          videoAssetId: 'asset_123',
          autoplay: false,
          controls: false,
          skipButton: false,
        },
      });

      expect(beat.videoFile).toBe('test.mp4');
      expect(beat.videoAssetId).toBe('asset_123');
      expect(beat.autoplay).toBe(false);
      expect(beat.controls).toBe(false);
      expect(beat.skipButton).toBe(false);
    });

    it('should return all parameters via getParameters', () => {
      const beat = new VideoBeat({
        id: 'video_1',
        name: 'Test Video',
        type: 'videoBeat',
        parameters: {
          videoFile: 'movie.mp4',
          videoAssetId: 'asset_456',
          autoplay: true,
          controls: false,
          skipButton: true,
        },
      });

      const params = beat.getParameters();
      expect(params.videoFile).toBe('movie.mp4');
      expect(params.videoAssetId).toBe('asset_456');
      expect(params.autoplay).toBe(true);
      expect(params.controls).toBe(false);
      expect(params.skipButton).toBe(true);
    });

    it('should update parameters', () => {
      const beat = new VideoBeat({
        id: 'video_1',
        name: 'Test Video',
        type: 'videoBeat',
      });

      beat.updateParameters({
        videoFile: 'updated.mp4',
        videoAssetId: 'asset_789',
        autoplay: false,
        controls: true,
        skipButton: false,
      });

      expect(beat.videoFile).toBe('updated.mp4');
      expect(beat.videoAssetId).toBe('asset_789');
      expect(beat.autoplay).toBe(false);
      expect(beat.controls).toBe(true);
      expect(beat.skipButton).toBe(false);
    });

    it('round-trips captions + videoTranslations', () => {
      const beat = new VideoBeat({
        id: 'video_1', name: 'V', type: 'videoBeat',
        parameters: {
          captions: [{ start: 0, end: 3, text: 'Hi' }],
          videoTranslations: { sv: { videoAssetId: 'asset_sv' } },
        } as any,
      });
      expect(beat.captions).toEqual([{ start: 0, end: 3, text: 'Hi' }]);
      expect(beat.captionsEnabled).toBe(true);
      expect(beat.videoTranslations).toEqual({ sv: { videoAssetId: 'asset_sv' } });
      const p = beat.getParameters();
      expect(p.captions).toEqual([{ start: 0, end: 3, text: 'Hi' }]);
      expect(p.videoTranslations).toEqual({ sv: { videoAssetId: 'asset_sv' } });
    });
  });

  describe('captions', () => {
    it('passes language-resolved cues (displayText over text) to renderVideo, dropping invalid ones', async () => {
      const { renderer } = createMockRenderer();
      const beat = new VideoBeat({
        id: 'v', name: 'V', type: 'videoBeat',
        parameters: {
          videoFile: 'clip.mp4',
          captions: [
            { start: 0, end: 3, text: 'Welcome', displayText: 'Välkommen' }, // translated wins
            { start: 3, end: 6, text: 'Founded 1566' },                       // source (no translation)
            { start: 6, end: 6, text: 'zero-length' },                        // dropped (end<=start)
            { start: 9, end: 12, text: '   ' },                               // dropped (blank)
          ],
        } as any,
      });
      await beat.execute(context, renderer);
      expect(renderer.renderVideo).toHaveBeenCalledWith(
        'clip.mp4', true, true, [], true,
        [
          { start: 0, end: 3, text: 'Välkommen' },
          { start: 3, end: 6, text: 'Founded 1566' },
        ],
      );
    });

    it('captionsEnabled=false yields no cues', async () => {
      const { renderer } = createMockRenderer();
      const beat = new VideoBeat({
        id: 'v', name: 'V', type: 'videoBeat',
        parameters: {
          videoFile: 'clip.mp4',
          captionsEnabled: false,
          captions: [{ start: 0, end: 3, text: 'Hidden' }],
        } as any,
      });
      await beat.execute(context, renderer);
      expect(renderer.renderVideo).toHaveBeenCalledWith('clip.mp4', true, true, [], true, []);
    });
  });

  describe('performAction', () => {
    it('should call renderer.renderVideo with correct parameters', async () => {
      const { renderer } = createMockRenderer();
      const beat = new VideoBeat({
        id: 'video_1',
        name: 'Test Video',
        type: 'videoBeat',
        parameters: {
          videoFile: 'test.mp4',
          autoplay: true,
          controls: false,
          skipButton: true,
        },
      });

      await beat.execute(context, renderer);

      expect(renderer.renderVideo).toHaveBeenCalledWith(
        'test.mp4',
        true,   // autoplay
        false,  // controls
        [],     // locations (empty — no VE elements)
        true,   // skipButton
        [],     // captions (none)
      );
    });

    it('should set videoAssetId on renderer state', async () => {
      const { renderer, getState } = createMockRenderer();
      const beat = new VideoBeat({
        id: 'video_1',
        name: 'Test Video',
        type: 'videoBeat',
        parameters: {
          videoFile: 'test.mp4',
          videoAssetId: 'asset_123',
        },
      });

      await beat.execute(context, renderer);

      expect(renderer.setState).toHaveBeenCalledWith('videoAssetId', 'asset_123');
    });

    it('should skip rendering when no video file specified', async () => {
      const { renderer } = createMockRenderer();
      const beat = new VideoBeat({
        id: 'video_1',
        name: 'No Video',
        type: 'videoBeat',
      });

      await beat.execute(context, renderer);

      expect(renderer.renderVideo).not.toHaveBeenCalled();
    });

    it('should fall back to node parameter for ASML imports', async () => {
      const { renderer } = createMockRenderer();
      context.setStory({ getEnvironment: () => ({ nodes: [] }), getBeat: () => null } as any);
      const beat = new VideoBeat({
        id: 'video_1',
        name: 'ASML Video',
        type: 'videoBeat',
      });
      beat.node = 'legacy_video.mp4';

      await beat.execute(context, renderer);

      expect(renderer.renderVideo).toHaveBeenCalledWith(
        'legacy_video.mp4',
        true, true, [], true, [],
      );
    });

    it('should handle renderer errors gracefully', async () => {
      const { renderer } = createMockRenderer();
      (renderer.renderVideo as any).mockRejectedValue(new Error('Render failed'));

      const beat = new VideoBeat({
        id: 'video_1',
        name: 'Error Video',
        type: 'videoBeat',
        parameters: { videoFile: 'bad.mp4' },
      });

      // Should not throw
      const result = await beat.execute(context, renderer);
      expect(result).toBeNull(); // getNextBeat returns null when no connections
    });
  });
});
