import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchFromOwnServer, refuseServerFailure, withSound } from '../ownServer';
import { LocalTTSProvider, LOCAL_TTS_PRESETS } from '../LocalTTSProvider';

const bytes = (...chunks: number[][]) => new Response(new ReadableStream<Uint8Array>({
  start(controller) { for (const c of chunks) controller.enqueue(new Uint8Array(c)); controller.close(); },
}));

describe("a speech server of the author's own", () => {
  let originalFetch: typeof global.fetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('a server that is off is reported as unavailable, for the browser voice to take over', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(fetchFromOwnServer('http://localhost:4123/v1/audio/speech', {}, 'The local speech server'))
      .rejects.toMatchObject({ name: 'TTSUnavailableError', unexpected: true, message: "The local speech server can't be reached at http://localhost:4123" });
  });

  it('a stopped request stays a stopped request', async () => {
    global.fetch = vi.fn().mockRejectedValue(new DOMException('stopped', 'AbortError'));
    await expect(fetchFromOwnServer('http://localhost:4123/x', {}, 'It')).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('a crash on the line (5xx) is unavailable; a wrong setup (4xx) is left to its own error', async () => {
    await expect(refuseServerFailure(new Response('boom', { status: 500 }), 'It')).rejects.toMatchObject({ name: 'TTSUnavailableError', unexpected: true });
    await expect(refuseServerFailure(new Response('no such voice', { status: 400 }), 'It')).resolves.toBeUndefined();
  });

  it('"200 OK" without any sound is unavailable', async () => {
    await expect(withSound(bytes(), 'It')).rejects.toMatchObject({ name: 'TTSUnavailableError', message: 'It answered without any sound' });
    await expect(withSound(bytes([]), 'It')).rejects.toMatchObject({ name: 'TTSUnavailableError' });
  });

  it('a line with sound comes through whole, first piece included', async () => {
    const response = await withSound(bytes([1, 2], [3], [4, 5]), 'It');
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([1, 2, 3, 4, 5]);
  });

  it('the Local provider hands a line to the browser voice when Kokoro answers without sound', async () => {
    const provider = new LocalTTSProvider();
    const preset = LOCAL_TTS_PRESETS.find((p) => p.id === 'kokoro')!;
    provider.configure({ provider: 'local', localPreset: 'kokoro', localTemplate: preset.template, baseUrl: 'http://localhost:4123/v1', model: 'kokoro' } as any);
    global.fetch = vi.fn().mockResolvedValue(bytes());
    await expect(provider.synthesize('こんにちは', { voiceId: 'jf_alpha', lang: 'ja' })).rejects.toMatchObject({ name: 'TTSUnavailableError', unexpected: true });
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(provider.synthesize('Hello', { voiceId: 'af_heart', lang: 'en' })).rejects.toMatchObject({ name: 'TTSUnavailableError' });
  });
});
