/**
 * When someone starts and stops speaking, from the loudness of a microphone.
 *
 * A recogniser that writes down what is said while it is said (the
 * browser's, whisper.cpp, Vosk) knows this by itself. One that takes a whole
 * recording at once (OpenAI's transcription, a plain Whisper server) does
 * not: its microphone had to be clicked to start and again to stop, where
 * the others listen and send by themselves (author's field test,
 * 2026-11-26). With this, such a recording ends when the speaker has
 * finished, and one in which nobody spoke is dropped.
 *
 * `createSpeechGate` is the rule alone (fed with loudness and time, so it
 * can be tested); `watchSpeech` listens to a microphone stream with it.
 */

export interface SpeechGateOptions {
  /** A pause this long after speech means the speaker has finished. */
  silenceMs?: number;
  /** Nobody spoke for this long: give up. */
  noSpeechMs?: number;
  /** Speech counts once it has lasted this long (a click or a cough doesn't). */
  minSpeechMs?: number;
}

export type SpeechGateEvent = 'speech-start' | 'speech-end' | 'no-speech' | null;

export const SPEECH_SILENCE_MS = 1400;
export const SPEECH_WAIT_MS = 20_000;
const MIN_SPEECH_MS = 200;
/** Loudness (RMS, 0–1) below which a quiet room is taken to be. */
const FLOOR = 0.012;

/**
 * Feed it the loudness (RMS of the signal, 0–1) at each moment; it answers
 * when speech begins, when it has ended, or when none came. The room's own
 * noise is learnt as it goes, so a fan or a street doesn't count as speech.
 * After 'speech-end' or 'no-speech' it stays silent.
 */
export function createSpeechGate(options: SpeechGateOptions = {}): { feed: (rms: number, nowMs: number) => SpeechGateEvent; spoke: () => boolean } {
  const silenceMs = options.silenceMs ?? SPEECH_SILENCE_MS;
  const noSpeechMs = options.noSpeechMs ?? SPEECH_WAIT_MS;
  const minSpeechMs = options.minSpeechMs ?? MIN_SPEECH_MS;
  let startedAt: number | null = null;
  let noise: number | null = null;
  let loudSince: number | null = null;
  let quietSince: number | null = null;
  let speaking = false;
  let done = false;
  return {
    spoke: () => speaking,
    feed(rms, now) {
      if (done) return null;
      startedAt ??= now;
      // The room's own noise: what the microphone hears at its quietest. It
      // follows a drop at once (the gaps between words show it even while
      // someone talks) and creeps up slowly, so a hum that was there from
      // the start is not taken for a voice, and a voice is not taken for it.
      const heard = Math.max(rms, 0.002);
      if (noise === null) noise = Math.min(heard, 0.05);
      else if (heard < noise) noise = noise * 0.7 + heard * 0.3;
      else noise = Math.min(noise * 1.003, 0.08);
      const threshold = Math.max(FLOOR * 1.5, noise * 3);
      const loud = rms > threshold;
      if (loud) {
        quietSince = null;
        loudSince ??= now;
        if (!speaking && now - loudSince >= minSpeechMs) { speaking = true; return 'speech-start'; }
        return null;
      }
      loudSince = null;
      if (speaking) {
        quietSince ??= now;
        if (now - quietSince >= silenceMs) { done = true; return 'speech-end'; }
        return null;
      }
      if (now - startedAt >= noSpeechMs) { done = true; return 'no-speech'; }
      return null;
    },
  };
}

/** Whether this browser can listen to how loud a microphone is. */
export function canWatchSpeech(): boolean {
  const g = globalThis as any;
  return typeof (g.AudioContext ?? g.webkitAudioContext) === 'function';
}

/**
 * Listen to `stream` and say when its speaker starts, has finished, or
 * never began. Returns a function that stops listening (the stream itself
 * is the caller's). Does nothing, and returns a no-op, where the browser
 * can't measure loudness: the microphone is then stopped by hand.
 */
export function watchSpeech(
  stream: MediaStream,
  handlers: { onSpeechStart?: () => void; onSpeechEnd: () => void; onNoSpeech?: () => void },
  options: SpeechGateOptions = {},
): () => void {
  const g = globalThis as any;
  const Context: typeof AudioContext | undefined = g.AudioContext ?? g.webkitAudioContext;
  if (!Context) return () => undefined;
  let context: AudioContext;
  try { context = new Context(); } catch { return () => undefined; }
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser); // not to the speakers: nothing is heard
  const samples = new Float32Array(analyser.fftSize);
  const gate = createSpeechGate(options);
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    try { source.disconnect(); } catch { /* already */ }
    void context.close().catch(() => undefined);
  };
  // Measured twenty times a second: this is sampling a signal, the one place a clock is the signal.
  const timer = setInterval(() => {
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
    const event = gate.feed(Math.sqrt(sum / samples.length), performance.now());
    if (event === 'speech-start') handlers.onSpeechStart?.();
    else if (event === 'speech-end') { stop(); handlers.onSpeechEnd(); }
    else if (event === 'no-speech') { stop(); (handlers.onNoSpeech ?? handlers.onSpeechEnd)(); }
  }, 50);
  return stop;
}
