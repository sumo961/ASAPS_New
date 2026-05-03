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
 *
 * In production this function is always preceded by `waitForTTS`, which
 * ensures any active TTS audio has finished plus a 500ms post-pause.
 * If TTS is *enabled* in the project, that audio-finish + post-pause IS
 * the reading time — adding another 2s on top would make every NPC
 * auto-advance feel sluggish. So the rule is: if TTS is enabled at all,
 * skip the reading delay; let the TTS pipeline carry the pacing.
 *
 * The fallback word-count based delay only fires when TTS isn't
 * configured. Minimum delay is `minDelayMs` (default 2s), scaled up at
 * 200 WPM for longer text.
 */
export async function waitForReadingTime(
  renderer: IRenderer,
  text: string,
  minDelayMs = 2000,
): Promise<void> {
  const ttsService = renderer.getState('ttsService') as any;
  if (ttsService?.isEnabled?.()) {
    // TTS is configured — let the audio pipeline (and waitForTTS's
    // post-pause) carry the pacing. Skip the reading delay.
    return;
  }
  const wordCount = text.split(/\s+/).length;
  const readingDelayMs = Math.max(minDelayMs, (wordCount / 200) * 60 * 1000);
  await new Promise(r => setTimeout(r, readingDelayMs));
}
