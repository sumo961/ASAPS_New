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
        true, true, [], true,
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
