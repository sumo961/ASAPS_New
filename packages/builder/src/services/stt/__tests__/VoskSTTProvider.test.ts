/**
 * Tests for VoskSTTProvider — the local Vosk WebSocket STT provider. Covers
 * identity, the baseUrl-required config, and the batch transcribe() flow over a
 * faked WebSocket: URL-scheme normalization (http→ws, bare host→ws://, trailing
 * slash stripped), the open→send(audio)+eof handshake, text accumulation from
 * messages, resolve-on-close, and reject-on-error.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VoskSTTProvider } from '../VoskSTTProvider';

let lastWS: any = null;
class FakeWebSocket {
  url: string;
  onopen: any = null;
  onmessage: any = null;
  onclose: any = null;
  onerror: any = null;
  send = vi.fn();
  close = vi.fn();
  readyState = 1;
  static OPEN = 1;
  static CONNECTING = 0;
  constructor(url: string) {
    this.url = url;
    lastWS = this;
  }
}

const audioBlob = () => ({ arrayBuffer: async () => new ArrayBuffer(8) }) as any;

describe('VoskSTTProvider', () => {
  let provider: VoskSTTProvider;
  let originalWS: any;

  beforeEach(() => {
    originalWS = global.WebSocket;
    (global as any).WebSocket = FakeWebSocket;
    lastWS = null;
    provider = new VoskSTTProvider();
    provider.configure({ provider: 'vosk', baseUrl: 'ws://localhost:2700' });
  });
  afterEach(() => {
    global.WebSocket = originalWS;
  });

  it('has the expected identity', () => {
    expect(provider.name).toBe('Vosk STT');
    expect(provider.requiresApiKey).toBe(false);
    expect(provider.supportsStreaming).toBe(true);
    expect(provider.isListening()).toBe(false);
  });

  it('requires a baseUrl to be ready', () => {
    expect(provider.isReady()).toBe(true);
    const bare = new VoskSTTProvider();
    bare.configure({ provider: 'vosk' });
    expect(bare.isReady()).toBe(false);
  });

  it('transcribe: opens WS, sends audio + eof, accumulates text, resolves on close', async () => {
    const p = provider.transcribe(audioBlob());
    expect(lastWS.url).toBe('ws://localhost:2700');

    await lastWS.onopen(); // sends arrayBuffer + eof
    expect(lastWS.send).toHaveBeenCalledTimes(2);
    expect(lastWS.send).toHaveBeenLastCalledWith('{"eof" : 1}');

    lastWS.onmessage({ data: '{"partial":"he"}' }); // no text field → ignored
    lastWS.onmessage({ data: '{"text":"hello there"}' });
    lastWS.onmessage({ data: 'not json' }); // tolerated
    lastWS.onclose();

    expect(await p).toEqual({ text: 'hello there', isFinal: true });
  });

  it.each([
    ['http://localhost:2700', 'ws://localhost:2700'],
    ['localhost:2700', 'ws://localhost:2700'],
    ['ws://host:9/', 'ws://host:9'],
    ['wss://secure:443', 'wss://secure:443'],
  ])('normalizes baseUrl %s → %s', async (input, expected) => {
    provider.configure({ provider: 'vosk', baseUrl: input });
    const p = provider.transcribe(audioBlob());
    expect(lastWS.url).toBe(expected);
    lastWS.onclose(); // resolve to avoid a dangling promise
    await p;
  });

  it('rejects on WebSocket error', async () => {
    const p = provider.transcribe(audioBlob());
    lastWS.onerror(new Error('conn refused'));
    await expect(p).rejects.toThrow(/Vosk WebSocket transcription failed/);
  });

  it('transcribe throws when not configured', async () => {
    const bare = new VoskSTTProvider();
    await expect(bare.transcribe(audioBlob())).rejects.toThrow();
  });
});
