/**
 * Tests for WebSpeechSTTProvider — the browser SpeechRecognition STT provider.
 * jsdom has no SpeechRecognition, so we install a fake constructor whose
 * instance we drive via the onstart/onresult/onerror/onend handlers the
 * provider assigns. Covers identity, the API-availability config gate,
 * start/stop/result wiring (final + interim, ignored vs. real errors), and the
 * unsupported batch transcribe().
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebSpeechSTTProvider } from '../WebSpeechSTTProvider';

let lastRec: any = null;
class FakeRecognition {
  continuous = false;
  interimResults = false;
  maxAlternatives = 0;
  lang = '';
  onstart: any = null;
  onresult: any = null;
  onerror: any = null;
  onend: any = null;
  start = vi.fn(() => this.onstart?.());
  stop = vi.fn(() => this.onend?.());
  abort = vi.fn();
  constructor() {
    lastRec = this;
  }
}

// Build a SpeechRecognition result event the provider can read.
const resultEvent = (entries: Array<{ text: string; isFinal: boolean; confidence?: number }>) => ({
  resultIndex: 0,
  results: Object.assign(
    { length: entries.length },
    entries.reduce((acc: any, e, i) => {
      acc[i] = { isFinal: e.isFinal, 0: { transcript: e.text, confidence: e.confidence ?? 0.9 } };
      return acc;
    }, {}),
  ),
});

const options = () => ({ onResult: vi.fn(), onError: vi.fn(), onEnd: vi.fn() });

describe('WebSpeechSTTProvider', () => {
  let provider: WebSpeechSTTProvider;
  beforeEach(() => {
    lastRec = null;
    (window as any).SpeechRecognition = FakeRecognition;
    provider = new WebSpeechSTTProvider();
    provider.configure({ provider: 'web-speech' });
  });
  afterEach(() => {
    delete (window as any).SpeechRecognition;
    delete (window as any).webkitSpeechRecognition;
  });

  it('has the expected identity', () => {
    expect(provider.name).toBe('Web Speech STT');
    expect(provider.requiresApiKey).toBe(false);
    expect(provider.supportsStreaming).toBe(true);
  });

  it('is ready only when a SpeechRecognition implementation exists', () => {
    expect(provider.isReady()).toBe(true);
    delete (window as any).SpeechRecognition;
    const bare = new WebSpeechSTTProvider();
    bare.configure({ provider: 'web-speech' });
    expect(bare.isReady()).toBe(false);
  });

  it('startListening configures and starts recognition; onstart flips isListening', () => {
    const opts = options();
    provider.startListening({ ...opts, language: 'de-DE' } as any);
    expect(lastRec.continuous).toBe(true);
    expect(lastRec.interimResults).toBe(true);
    expect(lastRec.lang).toBe('de-DE');
    expect(lastRec.start).toHaveBeenCalled();
    expect(provider.isListening()).toBe(true);
  });

  it('emits final and interim results', () => {
    const opts = options();
    provider.startListening(opts as any);

    lastRec.onresult(resultEvent([{ text: 'hello world', isFinal: true, confidence: 0.8 }]));
    expect(opts.onResult).toHaveBeenCalledWith({ text: 'hello world', isFinal: true, confidence: 0.8 });

    lastRec.onresult(resultEvent([{ text: 'typing', isFinal: false }]));
    expect(opts.onResult).toHaveBeenCalledWith({ text: 'typing', isFinal: false });
  });

  it('ignores no-speech/aborted errors but surfaces real ones', () => {
    const opts = options();
    provider.startListening(opts as any);

    lastRec.onerror({ error: 'no-speech' });
    lastRec.onerror({ error: 'aborted' });
    expect(opts.onError).not.toHaveBeenCalled();

    lastRec.onerror({ error: 'network' });
    expect(opts.onError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('network') }));
  });

  it('onend flips isListening off and calls onEnd', () => {
    const opts = options();
    provider.startListening(opts as any);
    lastRec.onend();
    expect(provider.isListening()).toBe(false);
    expect(opts.onEnd).toHaveBeenCalled();
  });

  it('startListening reports an error when the API is missing', () => {
    delete (window as any).SpeechRecognition;
    const bare = new WebSpeechSTTProvider();
    bare.configure({ provider: 'web-speech' });
    // bare.isReady() is false; bypass ensureReady by forcing configured state
    const opts = options();
    expect(() => bare.startListening(opts as any)).toThrow(); // ensureReady throws when not configured
  });

  it('stopListening returns null when not listening', async () => {
    expect(await provider.stopListening()).toBeNull();
  });

  it('stopListening resolves the last result after onend', async () => {
    const opts = options();
    provider.startListening(opts as any);
    lastRec.onresult(resultEvent([{ text: 'final words', isFinal: true }]));
    const p = provider.stopListening();
    lastRec.onend(); // stop() already triggers onend via the fake, but call again is harmless
    expect(await p).toMatchObject({ text: 'final words', isFinal: true });
  });

  it('transcribe rejects — batch mode unsupported', async () => {
    await expect(provider.transcribe(new Blob(['a']))).rejects.toThrow(/does not support batch/i);
  });
});
