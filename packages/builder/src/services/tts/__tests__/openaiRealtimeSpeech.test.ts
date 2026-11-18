import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OpenAIRealtimeSpeech, pcmToWav, realtimeVoice } from '../openaiRealtimeSpeech';
import { OpenAITTSProvider } from '../OpenAITTSProvider';

/** A socket that answers like the Realtime API. Tests drive the responses. */
class FakeSocket {
  static all: FakeSocket[] = [];
  sent: any[] = [];
  onmessage: ((m: { data: string }) => void) | null = null;
  onclose: ((e: { code: number; reason: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(public url: string, public protocols: string[]) {
    FakeSocket.all.push(this);
    queueMicrotask(() => this.emit({ type: 'session.created', session: { id: 's1' } }));
  }

  emit(event: any) { this.onmessage?.({ data: JSON.stringify(event) }); }

  send(raw: string) {
    const event = JSON.parse(raw);
    this.sent.push(event);
    if (event.type === 'session.update') queueMicrotask(() => this.emit({ type: 'session.updated' }));
  }

  close() { this.closed = true; }

  /** The response.create events sent so far. */
  get lines() { return this.sent.filter((e) => e.type === 'response.create').map((e) => e.response); }

  /** Answer line `n` (0-based) with `bytes` of audio. */
  answer(n: number, bytes = [1, 2, 3, 4], status = 'completed') {
    const id = `resp_${n}`;
    this.emit({ type: 'response.created', response: { id, metadata: this.lines[n].metadata } });
    if (bytes.length) this.emit({ type: 'response.output_audio.delta', response_id: id, delta: btoa(String.fromCharCode(...bytes)) });
    this.emit({ type: 'response.done', response: { id, status } });
  }
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('OpenAI Realtime speech', () => {
  let originalFetch: typeof global.fetch;
  const originalSocket = (globalThis as any).WebSocket;

  beforeEach(() => {
    originalFetch = global.fetch;
    FakeSocket.all = [];
    (globalThis as any).WebSocket = FakeSocket;
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ value: 'ek_secret' }) });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    (globalThis as any).WebSocket = originalSocket;
    delete (window as any).electronAPI;
  });

  it('maps voices the Realtime API lacks', () => {
    expect(realtimeVoice('marin')).toBe('marin');
    expect(realtimeVoice('nova')).toBe('marin');
    expect(realtimeVoice('onyx')).toBe('cedar');
    expect(realtimeVoice('fable')).toBe('alloy');
    expect(realtimeVoice(undefined)).toBe('alloy');
    expect(realtimeVoice('voice_1234')).toBe('alloy');
  });

  it('wraps PCM in a WAV header', async () => {
    const wav = pcmToWav([new Uint8Array([1, 2]), new Uint8Array([3, 4])]);
    expect(wav.type).toBe('audio/wav');
    expect(wav.size).toBe(48);
  });

  it('signs in with a short-lived secret, never the key, and sets the voice', async () => {
    const speech = new OpenAIRealtimeSpeech({ apiKey: 'sk-real' });
    const reading = speech.read('Hello', 'cedar');
    await settle();

    const [url, init] = (global.fetch as any).mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/realtime/client_secrets');
    expect(init.headers.Authorization).toBe('Bearer sk-real');

    const socket = FakeSocket.all[0];
    expect(socket.url).toBe('wss://api.openai.com/v1/realtime?model=gpt-realtime-2.1-mini');
    expect(socket.protocols).toEqual(['realtime', 'openai-insecure-api-key.ek_secret']);
    expect(JSON.stringify(socket.protocols)).not.toContain('sk-real');
    expect(socket.sent[0].session.audio.output.voice).toBe('cedar');

    socket.answer(0);
    expect((await reading).size).toBe(48);
  });

  it('sends each line by itself, outside the conversation, with the language named', async () => {
    const speech = new OpenAIRealtimeSpeech({ apiKey: 'sk-real' });
    const reading = speech.read('Ja', 'marin', 'German');
    await settle();
    const line = FakeSocket.all[0].lines[0];
    expect(line.conversation).toBe('none');
    expect(line.output_modalities).toEqual(['audio']);
    expect(line.input).toEqual([{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Ja' }] }]);
    expect(line.instructions).toMatch(/exactly as written/);
    expect(line.instructions).toMatch(/The message is in German\./);
    FakeSocket.all[0].answer(0);
    await reading;
  });

  it('keeps one session per voice', async () => {
    const speech = new OpenAIRealtimeSpeech({ apiKey: 'sk-real' });
    let reading = speech.read('One', 'marin'); await settle(); FakeSocket.all[0].answer(0); await reading;
    reading = speech.read('Two', 'marin'); await settle(); FakeSocket.all[0].answer(1); await reading;
    expect(FakeSocket.all).toHaveLength(1);
    reading = speech.read('Three', 'cedar'); await settle(); FakeSocket.all[1].answer(0); await reading;
    expect(FakeSocket.all).toHaveLength(2);
  });

  it('stop() ends the line with an AbortError and cancels the response', async () => {
    const speech = new OpenAIRealtimeSpeech({ apiKey: 'sk-real' });
    const reading = speech.read('A long line', 'marin');
    await settle();
    const socket = FakeSocket.all[0];
    socket.emit({ type: 'response.created', response: { id: 'resp_0', metadata: socket.lines[0].metadata } });
    speech.stop();
    await expect(reading).rejects.toMatchObject({ name: 'AbortError' });
    expect(socket.sent.at(-1)).toEqual({ type: 'response.cancel', response_id: 'resp_0' });

    // Audio of the stopped line arriving late is not mixed into the next one.
    const next = speech.read('Next', 'marin');
    await settle();
    socket.emit({ type: 'response.output_audio.delta', response_id: 'resp_0', delta: btoa('late!') });
    socket.answer(1, [9, 9]);
    expect((await next).size).toBe(46);
  });

  it('opens a new session when OpenAI has closed the old one', async () => {
    const speech = new OpenAIRealtimeSpeech({ apiKey: 'sk-real' });
    let reading = speech.read('One', 'marin'); await settle(); FakeSocket.all[0].answer(0); await reading;
    FakeSocket.all[0].onclose?.({ code: 1000, reason: 'session expired' });
    reading = speech.read('Two', 'marin'); await settle();
    expect(FakeSocket.all).toHaveLength(2);
    FakeSocket.all[1].answer(0);
    await reading;
  });

  it('reports a refused sign-in without the key', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, text: () => Promise.resolve('bad key sk-real12345678') });
    const speech = new OpenAIRealtimeSpeech({ apiKey: 'sk-real12345678' });
    await expect(speech.read('Hello')).rejects.toThrow(/sign-in failed \(401\): bad key \[key\]/);
  });

  it('reports a line the model did not read', async () => {
    const speech = new OpenAIRealtimeSpeech({ apiKey: 'sk-real' });
    const reading = speech.read('Hello', 'marin');
    await settle();
    FakeSocket.all[0].answer(0, [], 'failed');
    await expect(reading).rejects.toThrow(/did not read the line \(failed\)/);
  });

  describe('through the OpenAI provider', () => {
    it('reads with the Realtime model when it is chosen', async () => {
      const provider = new OpenAITTSProvider();
      provider.configure({ provider: 'openai', apiKey: 'sk-real', model: 'gpt-realtime-2.1-mini' });
      const reading = provider.synthesize('Guten Tag', { voiceId: 'nova', lang: 'de-AT' });
      await settle();
      const socket = FakeSocket.all[0];
      expect(socket.sent[0].session.audio.output.voice).toBe('marin');
      expect(socket.lines[0].instructions).toMatch(/in German\./);
      socket.answer(0);
      const result = await reading;
      expect(result.audio?.type).toBe('audio/wav');
      expect(result.response).toBeUndefined();
    });

    it('moves an older model over once OpenAI refuses it, and stays there', async () => {
      (window as any).electronAPI = { isElectron: true };
      const provider = new OpenAITTSProvider();
      provider.configure({ provider: 'openai', apiKey: 'sk-real', model: 'tts-1' });
      global.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: false, status: 404, text: () => Promise.resolve('Invalid URL (POST /v1/audio/speech)') })
        .mockResolvedValue({ ok: true, json: () => Promise.resolve({ value: 'ek_secret' }) });

      let reading = provider.synthesize('Hello', { voiceId: 'onyx' });
      await settle(); await settle();
      const socket = FakeSocket.all[0];
      expect(socket.url).toContain('model=gpt-realtime-2.1-mini');
      expect(socket.sent[0].session.audio.output.voice).toBe('cedar');
      socket.answer(0);
      expect((await reading).audio).toBeTruthy();

      reading = provider.synthesize('Again', { voiceId: 'onyx' });
      await settle();
      socket.answer(1);
      await reading;
      // One refused Speech API call, one sign-in; no second try of the old model.
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });
});
