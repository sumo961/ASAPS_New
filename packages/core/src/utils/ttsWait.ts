import type { IRenderer } from '../types';

/**
 * Wait for TTS to finish speaking, then add a brief pause for natural pacing.
 * Returns immediately if TTS is not active or not available.
 */
export async function waitForTTS(
  renderer: IRenderer,
  pollInterval = 200,
  postPause = 500,
): Promise<void> {
  const ttsService = renderer.getState('ttsService') as any;
  if (ttsService?.isSpeaking?.()) {
    while (ttsService.isSpeaking()) {
      await new Promise(r => setTimeout(r, pollInterval));
    }
    await new Promise(r => setTimeout(r, postPause));
  }
}

/**
 * Wait for a reading-time delay based on word count.
 * Only applies if TTS is not currently speaking (TTS provides its own timing).
 * Minimum 2 seconds, based on ~200 WPM reading speed.
 */
export async function waitForReadingTime(
  renderer: IRenderer,
  text: string,
  minDelayMs = 2000,
): Promise<void> {
  const ttsService = renderer.getState('ttsService') as any;
  if (ttsService?.isEnabled?.() && ttsService?.isSpeaking?.()) {
    // TTS is handling timing — skip reading delay
    return;
  }
  const wordCount = text.split(/\s+/).length;
  const readingDelayMs = Math.max(minDelayMs, (wordCount / 200) * 60 * 1000);
  await new Promise(r => setTimeout(r, readingDelayMs));
}
