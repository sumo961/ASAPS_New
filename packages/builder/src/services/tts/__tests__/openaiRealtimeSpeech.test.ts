import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OpenAIRealtimeSpeech, PcmStreamPlayer, pcmToWav, realtimeVoice } from '@asaps/core';
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

  describe('warming up', () => {
    it("opens each voice's session ahead of its first line, once per voice", async () => {
      const speech = new OpenAIRealtimeSpeech({ apiKey: 'sk-test' });
      speech.warm(['marin', 'cedar', 'nova', undefined, 'marin']); // nova is read by Marin; no voice is Alloy
      await settle(); await settle();
      expect(FakeSocket.all).toHaveLength(3);
      const voices = FakeSocket.all.map((s) => s.sent.find((e) => e.type === 'session.update').session.audio.output.voice);
      expect(voices.sort()).toEqual(['alloy', 'cedar', 'marin']);
      // Nothing was asked to be read
      expect(FakeSocket.all.flatMap((s) => s.lines)).toHaveLength(0);

      // The first line in a warmed voice uses the open session
      const read = speech.read('Hej', 'marin');
      await settle();
      expect(FakeSocket.all).toHaveLength(3);
      FakeSocket.all.find((s) => s.lines.length === 1)!.answer(0);
      await read;
    });

    it('keeps to the number of sessions it holds', async () => {
      const speech = new OpenAIRealtimeSpeech({ apiKey: 'sk-test' });
      speech.warm(['alloy', 'ash', 'ballad', 'coral', 'echo', 'sage']);
      await settle(); await settle();
      expect(FakeSocket.all).toHaveLength(4);
    });

    it('a failed warm-up is not an error; the line reports it', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, text: () => Promise.resolve('bad key') });
      const speech = new OpenAIRealtimeSpeech({ apiKey: 'sk-test' });
      expect(() => speech.warm(['marin'])).not.toThrow();
      await settle();
      await expect(speech.read('Hej', 'marin')).rejects.toThrow(/sign-in failed \(401\)/);
    });

    it('the provider warms up only when it reads through the Realtime API', async () => {
      const realtime = new OpenAITTSProvider();
      realtime.configure({ provider: 'openai', apiKey: 'sk-test', model: 'gpt-realtime-2.1-mini' } as any);
      realtime.warmUp(['marin']);
      await settle(); await settle();
      expect(FakeSocket.all).toHaveLength(1);

      const older = new OpenAITTSProvider();
      older.configure({ provider: 'openai', apiKey: 'sk-test', model: 'tts-1' } as any);
      older.warmUp(['marin']);
      await settle(); await settle();
      expect(FakeSocket.all).toHaveLength(1);
    });
  });

  describe('playing a line while it arrives', () => {
    /** A Web Audio context that records what was scheduled; tests end the pieces. */
    class FakeContext {
      static all: FakeContext[] = [];
      state = 'running';
      currentTime = 10;
      destination = {};
      gainValue = 1;
      started: Array<{ at: number; duration: number; samples: number[]; source: any }> = [];
      constructor() { FakeContext.all.push(this); }
      resume() { return Promise.resolve(); }
      close() { this.state = 'closed'; return Promise.resolve(); }
      createGain() { const self = this; return { connect() {}, gain: { set value(v: number) { self.gainValue = v; }, get value() { return self.gainValue; } } }; }
      createBuffer(_channels: number, length: number, rate: number) { const data = new Float32Array(length); return { duration: length / rate, getChannelData: () => data }; }
      createBufferSource() {
        const self = this;
        const source: any = { buffer: null, onended: null, stopped: false, connect() {}, disconnect() {}, stop() { source.stopped = true; },
          start(at: number) { self.started.push({ at, duration: source.buffer.duration, samples: Array.from(source.buffer.getChannelData(0)), source }); } };
        return source;
      }
      /** Every scheduled piece has played. */
      playAll() { for (const piece of this.started) piece.source.onended?.(); }
    }
    const original = (globalThis as any).AudioContext;
    beforeEach(() => { FakeContext.all = []; (globalThis as any).AudioContext = FakeContext; });
    afterEach(() => { (globalThis as any).AudioContext = original; });

    it('schedules the pieces one after the other, without a gap', async () => {
      const player = new PcmStreamPlayer(24000);
      expect(player.start(0.5)).toBe(true);
      const context = FakeContext.all[0];
      expect(context.gainValue).toBe(0.5);
      player.push(new Uint8Array(4800)); // 0.1 s
      player.push(new Uint8Array(2400)); // 0.05 s
      expect(context.started.map((p) => p.duration)).toEqual([0.1, 0.05]);
      expect(context.started[0].at).toBeGreaterThan(context.currentTime);
      expect(context.started[1].at).toBeCloseTo(context.started[0].at + 0.1, 6);

      let heard: boolean | null = null;
      void player.finish().then((h) => { heard = h; });
      await settle();
      expect(heard).toBeNull(); // still playing
      context.playAll();
      await settle();
      expect(heard).toBe(true);
    });

    it('joins a sample cut in two by the pieces', () => {
      const player = new PcmStreamPlayer(24000);
      player.start();
      player.push(new Uint8Array([0x00, 0x40, 0x00])); // 16384, then half a sample
      player.push(new Uint8Array([0xc0]));             // … its other half: -16384
      const context = FakeContext.all[0];
      expect(context.started.map((p) => p.samples)).toEqual([[0.5], [-0.5]]);
    });

    it('says so when the page may not play sound', async () => {
      const player = new PcmStreamPlayer();
      player.start();
      FakeContext.all[0].state = 'suspended';
      player.push(new Uint8Array(480));
      expect(await player.finish()).toBe(false);

      (globalThis as any).AudioContext = undefined;
      expect(new PcmStreamPlayer().start()).toBe(false);
    });

    it('speak() plays the audio as it comes and resolves when it has been heard', async () => {
      const speech = new OpenAIRealtimeSpeech({ apiKey: 'sk-test' });
      let done: { heard: boolean; audio: Blob } | null = null;
      void speech.speak('Guten Tag', 'marin', 'German', 0.8).then((r) => { done = r; });
      await settle(); await settle();
      const socket = FakeSocket.all[0];
      socket.answer(0, [1, 2, 3, 4]);
      await settle();
      const context = FakeContext.all[0];
      expect(context.started).toHaveLength(1); // scheduled before the line was complete for the caller
      expect(done).toBeNull();
      context.playAll();
      await settle();
      expect(done!.heard).toBe(true);
      expect(done!.audio.size).toBe(48);
    });

    it('stop() cuts the line off', async () => {
      const speech = new OpenAIRealtimeSpeech({ apiKey: 'sk-test' });
      const spoken = speech.speak('Eine lange Zeile', 'marin');
      spoken.catch(() => undefined);
      await settle(); await settle();
      const socket = FakeSocket.all[0];
      socket.emit({ type: 'response.created', response: { id: 'r1', metadata: socket.lines[0].metadata } });
      socket.emit({ type: 'response.output_audio.delta', response_id: 'r1', delta: btoa(String.fromCharCode(1, 2, 3, 4)) });
      const piece = FakeContext.all[0].started[0];
      speech.stop();
      expect(piece.source.stopped).toBe(true);
      await expect(spoken).rejects.toMatchObject({ name: 'AbortError' });
    });
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
