/**
 * Tests for TTS wait utilities
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waitForTTS, waitForReadingTime } from '../../src/utils/ttsWait';
import type { IRenderer } from '../../src/types';

function createMockRenderer(stateOverrides: Record<string, any> = {}): IRenderer {
  return {
    initialize: vi.fn(),
    clear: vi.fn(),
    playSound: vi.fn(),
    stopSound: vi.fn(),
    setState: vi.fn(),
    getState: vi.fn().mockImplementation((key: string) => stateOverrides[key] ?? null),
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

describe('waitForTTS', () => {
  it('should return immediately when no TTS service', async () => {
    const renderer = createMockRenderer();
    const start = Date.now();
    await waitForTTS(renderer);
    expect(Date.now() - start).toBeLessThan(100);
  });

  it('should return immediately when TTS is not speaking', async () => {
    const renderer = createMockRenderer({
      ttsService: { isSpeaking: () => false },
    });
    const start = Date.now();
    await waitForTTS(renderer);
    expect(Date.now() - start).toBeLessThan(100);
  });

  it('should wait until TTS finishes then pause', async () => {
    let speakingCount = 3;
    const renderer = createMockRenderer({
      ttsService: {
        isSpeaking: () => {
          speakingCount--;
          return speakingCount > 0;
        },
      },
    });

    const start = Date.now();
    await waitForTTS(renderer, 50, 100);
    const elapsed = Date.now() - start;

    // Should have waited for polling (~2 polls × 50ms) + post-pause (100ms)
    expect(elapsed).toBeGreaterThanOrEqual(100);
  });
});

describe('waitForReadingTime', () => {
  it('should wait minimum delay for short text', async () => {
    const renderer = createMockRenderer();
    const start = Date.now();
    await waitForReadingTime(renderer, 'Hello', 200);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(190);
  });

  it('should skip delay when TTS is active and speaking', async () => {
    const renderer = createMockRenderer({
      ttsService: { isEnabled: () => true, isSpeaking: () => true },
    });
    const start = Date.now();
    await waitForReadingTime(renderer, 'Hello world this is a test', 2000);
    expect(Date.now() - start).toBeLessThan(100);
  });

  it('should skip reading delay when TTS is enabled, regardless of current speaking state', async () => {
    // In production, waitForReadingTime is always preceded by waitForTTS,
    // which ensures any active audio has finished and added a 500ms
    // post-pause. If TTS is enabled in the project, that pacing IS the
    // reading time — adding another 2s on top would make every NPC
    // auto-advance feel sluggish. So when TTS is enabled at all
    // (whether currently speaking or quiescent), the reading delay is
    // skipped and the TTS pipeline carries the pacing.
    const renderer = createMockRenderer({
      ttsService: { isEnabled: () => true, isSpeaking: () => false },
    });
    const start = Date.now();
    await waitForReadingTime(renderer, 'Hello', 200);
    expect(Date.now() - start).toBeLessThan(100);
  });
});
