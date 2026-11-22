/**
 * Behavior tests for the GENERATED relay function itself (relayKit.ts →
 * RELAY_FUNCTION_SOURCE). The source is imported as a real ES module via a
 * data: URL and driven with Request objects — so these pin the actual
 * runtime behavior authors deploy, not just the template text.
 *
 * The CORS allowlist (ALLOWED_ORIGINS) is the shared-classroom-relay
 * security boundary: one relay, many student story sites, and ONLY listed
 * origins may spend the key from a browser.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { RELAY_FUNCTION_SOURCE } from '../relayKit';

type Handler = (req: Request) => Promise<Response>;
let handler: Handler;

const req = (method: string, origin: string | null, body?: unknown) =>
  new Request('https://relay.test/.netlify/functions/asaps-ai', {
    method,
    headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) },
    body: method === 'POST'
      ? JSON.stringify(body ?? { provider: 'anthropic', body: { model: 'm' } })
      : undefined,
  });

beforeAll(async () => {
  const mod = await import(/* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(RELAY_FUNCTION_SOURCE).toString('base64')}`);
  handler = mod.default;
});

beforeEach(() => {
  delete process.env.ALLOWED_ORIGINS;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  process.env.OPENAI_API_KEY = 'test-key';
  // Upstream stub — the relay must never reach the real providers in tests
  vi.stubGlobal('fetch', vi.fn(async () =>
    new Response(JSON.stringify({ ok: true }), { status: 200 })));
});

afterAll(() => {
  vi.unstubAllGlobals();
  delete process.env.ALLOWED_ORIGINS;
});

describe('relay function — same-origin default (no ALLOWED_ORIGINS)', () => {
  it('serves same-origin POSTs and emits no CORS headers', async () => {
    const r = await handler(req('POST', null));
    expect(r.status).toBe(200);
    expect(r.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('rejects foreign-origin preflight (403) and gives cross-origin POSTs no CORS', async () => {
    expect((await handler(req('OPTIONS', 'https://evil.example'))).status).toBe(403);
    const r = await handler(req('POST', 'https://evil.example'));
    expect(r.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('relay function — ALLOWED_ORIGINS allowlist', () => {
  it('exact origins: allows listed, rejects unlisted, echoes the origin', async () => {
    process.env.ALLOWED_ORIGINS = 'https://annas-story.netlify.app, https://bens-story.netlify.app';
    const pre = await handler(req('OPTIONS', 'https://annas-story.netlify.app'));
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBe('https://annas-story.netlify.app');
    const post = await handler(req('POST', 'https://bens-story.netlify.app'));
    expect(post.headers.get('access-control-allow-origin')).toBe('https://bens-story.netlify.app');
    expect((await handler(req('OPTIONS', 'https://mallory.netlify.app'))).status).toBe(403);
  });

  it('requires https (except localhost) even for listed hosts', async () => {
    process.env.ALLOWED_ORIGINS = 'https://annas-story.netlify.app,http://localhost:8877';
    const http = await handler(req('POST', 'http://annas-story.netlify.app'));
    expect(http.headers.get('access-control-allow-origin')).toBeNull();
    const local = await handler(req('POST', 'http://localhost:8877'));
    expect(local.headers.get('access-control-allow-origin')).toBe('http://localhost:8877');
  });

  it('suffix wildcard matches on dot boundaries only — no lookalike bypass', async () => {
    process.env.ALLOWED_ORIGINS = '*.netlify.app';
    const ok = await handler(req('POST', 'https://anything.netlify.app'));
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://anything.netlify.app');
    // embedded lookalike + non-dot-boundary suffix must NOT match
    for (const evil of ['https://netlify.app.evil.com', 'https://evilnetlify.app']) {
      const r = await handler(req('POST', evil));
      expect(r.headers.get('access-control-allow-origin'), evil).toBeNull();
    }
  });
});

describe('relay function — streaming pass-through (serverless timeout fix)', () => {
  it('pipes an SSE upstream body through with event-stream content-type', async () => {
    const sse = 'data: {"type":"message_start"}\n\ndata: {"type":"message_stop"}\n\n';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(sse, {
      status: 200, headers: { 'content-type': 'text/event-stream' },
    })));
    const r = await handler(req('POST', null, {
      provider: 'anthropic',
      body: { model: 'm', stream: true },
    }));
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('text/event-stream');
    expect(await r.text()).toBe(sse);
  });

  it('streams with CORS headers for allowed cross-origin callers', async () => {
    process.env.ALLOWED_ORIGINS = 'https://annas-story.netlify.app';
    vi.stubGlobal('fetch', vi.fn(async () => new Response('data: {}\n\n', {
      status: 200, headers: { 'content-type': 'text/event-stream' },
    })));
    const r = await handler(req('POST', 'https://annas-story.netlify.app', {
      provider: 'anthropic', body: { model: 'm', stream: true },
    }));
    expect(r.headers.get('content-type')).toBe('text/event-stream');
    expect(r.headers.get('access-control-allow-origin')).toBe('https://annas-story.netlify.app');
  });

  it('non-streaming requests still return buffered JSON', async () => {
    const r = await handler(req('POST', null)); // default stub: JSON 200
    expect(r.headers.get('content-type')).toBe('application/json');
    expect((await r.json()).ok).toBe(true);
  });
});

describe('relay function — request validation', () => {
  it('405 on GET, 400 on junk, 400 on bad provider', async () => {
    expect((await handler(req('GET', null))).status).toBe(405);
    const junk = new Request('https://relay.test/x', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: 'not json',
    });
    expect((await handler(junk)).status).toBe(400);
    expect((await handler(req('POST', null, { provider: 'mystery', body: {} }))).status).toBe(400);
  });

  it('500 with the actionable message when the key is missing', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const r = await handler(req('POST', null));
    expect(r.status).toBe(500);
    expect((await r.json()).error).toContain('ANTHROPIC_API_KEY is not set');
  });
});

describe('relay function — server-side refusal fallbacks', () => {
  const sent = () => {
    const [, init] = (fetch as any).mock.calls.at(-1);
    return { body: JSON.parse(init.body), beta: init.headers['anthropic-beta'] };
  };

  it('opts Opus 5 / 5.5 and Fable into fallbacks with the beta header', async () => {
    for (const model of ['claude-opus-5', 'claude-opus-5-5', 'claude-fable-5-1']) {
      await handler(req('POST', null, { provider: 'anthropic', body: { model, messages: [] } }));
      expect(sent()).toEqual({ body: { model, messages: [], fallbacks: 'default' }, beta: 'server-side-fallback-2026-07-01' });
    }
  });

  it('leaves other models, OpenAI and an explicit fallbacks setting alone', async () => {
    await handler(req('POST', null, { provider: 'anthropic', body: { model: 'claude-sonnet-5' } }));
    expect(sent()).toEqual({ body: { model: 'claude-sonnet-5' }, beta: undefined });
    await handler(req('POST', null, { provider: 'openai', body: { model: 'gpt-6-astra' } }));
    expect(sent().body.fallbacks).toBeUndefined();
    await handler(req('POST', null, { provider: 'anthropic', body: { model: 'claude-opus-5', fallbacks: [{ model: 'claude-opus-4-8' }] } }));
    expect(sent().beta).toBeUndefined();
  });

  it('tripwire: the relay\'s model list matches @asaps/core claudeSupportsServerFallbacks', async () => {
    const { claudeSupportsServerFallbacks } = await import('@asaps/core');
    const m = RELAY_FUNCTION_SOURCE.match(/const FALLBACK_MODELS = \/(.*)\/;/);
    const relayRx = new RegExp(m![1]);
    for (const model of ['claude-opus-5', 'claude-opus-5-5', 'claude-opus-6', 'claude-opus-4-8', 'claude-sonnet-5',
      'claude-sonnet-4-6', 'claude-haiku-4-5', 'claude-fable-5', 'claude-fable-5-1', 'claude-mythos-5-1', 'gpt-6-astra', 'kimi-k2']) {
      expect(relayRx.test(model), model).toBe(claudeSupportsServerFallbacks(model));
    }
  });
});

// Reading aloud through the relay: the speech key stays on the host too.
describe('relay function — reading aloud', () => {
  const post = (body: unknown) => handler(req('POST', null, body));
  const upstream = () => (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
  beforeEach(() => { process.env.ELEVENLABS_API_KEY = 'el-key'; });

  it("hands out OpenAI's short-lived Realtime secret, for a reading session only", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ value: 'ek_short' }), { status: 200, headers: { 'content-type': 'application/json' } })));
    const r = await post({ provider: 'openai', target: 'realtime-secret', body: { session: { type: 'realtime', model: 'gpt-realtime-2.1-mini', instructions: 'do something else', tools: [{}] } } });
    expect(r.status).toBe(200);
    expect((await r.json()).value).toBe('ek_short');
    const [url, init] = upstream();
    expect(url).toBe('https://api.openai.com/v1/realtime/client_secrets');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer test-key');
    // Whatever else the caller put into the session is not passed on.
    expect(JSON.parse(String(init.body))).toEqual({ session: { type: 'realtime', model: 'gpt-realtime-2.1-mini' } });
  });

  it('refuses a secret for a model that is not a Realtime one', async () => {
    const r = await post({ provider: 'openai', target: 'realtime-secret', body: { session: { model: 'gpt-6-astra' } } });
    expect(r.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('pipes an ElevenLabs line through, with the key from the host', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'audio/mpeg' } })));
    const r = await post({ provider: 'elevenlabs', target: 'speech', voiceId: 'abcDEF123', latency: 3, body: { text: 'Hello', model_id: 'eleven_flash_v2_5' } });
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('audio/mpeg');
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    const [url, init] = upstream();
    expect(url).toBe('https://api.elevenlabs.io/v1/text-to-speech/abcDEF123/stream?optimize_streaming_latency=3');
    expect((init.headers as Record<string, string>)['xi-api-key']).toBe('el-key');
    expect(JSON.parse(String(init.body))).toEqual({ text: 'Hello', model_id: 'eleven_flash_v2_5' });
  });

  it('a voice id cannot steer the address', async () => {
    for (const voiceId of ['../../v1/user', 'a/b', 'a?x=1', '']) {
      expect((await post({ provider: 'elevenlabs', target: 'speech', voiceId, body: { text: 'x' } })).status).toBe(400);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("pipes OpenAI's Speech API through", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([9]), { status: 200, headers: { 'content-type': 'audio/mpeg' } })));
    const r = await post({ provider: 'openai', target: 'speech', body: { model: 'gpt-4o-mini-tts', input: 'Hi', voice: 'alloy' } });
    expect(r.headers.get('content-type')).toBe('audio/mpeg');
    expect(upstream()[0]).toBe('https://api.openai.com/v1/audio/speech');
  });

  it('keeps a refusal\'s status and message, so the player can tell why', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { message: 'model_not_found' } }), { status: 404, headers: { 'content-type': 'application/json' } })));
    const r = await post({ provider: 'openai', target: 'speech', body: { model: 'tts-1', input: 'Hi', voice: 'alloy' } });
    expect(r.status).toBe(404);
    expect(await r.text()).toContain('model_not_found');
  });

  it('says which key is missing, and refuses what it does not know', async () => {
    delete process.env.ELEVENLABS_API_KEY;
    const r = await post({ provider: 'elevenlabs', target: 'speech', voiceId: 'abc', body: { text: 'x' } });
    expect(r.status).toBe(500);
    expect((await r.json()).error).toContain('ELEVENLABS_API_KEY');
    expect((await post({ provider: 'anthropic', target: 'speech', body: {} })).status).toBe(400);
    expect((await post({ provider: 'elevenlabs', target: 'realtime-secret', body: {} })).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('speech answers carry CORS headers for an allowed story site', async () => {
    process.env.ALLOWED_ORIGINS = 'https://annas-story.netlify.app';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1]), { status: 200, headers: { 'content-type': 'audio/mpeg' } })));
    const r = await handler(req('POST', 'https://annas-story.netlify.app', { provider: 'elevenlabs', target: 'speech', voiceId: 'abc', body: { text: 'x' } }));
    expect(r.headers.get('access-control-allow-origin')).toBe('https://annas-story.netlify.app');
  });
});

// Voice input through the relay: a recorded answer is written down by OpenAI.
describe('relay function — voice input', () => {
  const post = (body: unknown) => handler(req('POST', null, body));
  const audio = Buffer.from('not really sound').toString('base64');

  it('passes the recording to OpenAI as a file, with the key from the host', async () => {
    const seen: any = {};
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      seen.url = url; seen.auth = (init.headers as Record<string, string>).authorization;
      const form = init.body as FormData;
      const file = form.get('file') as File;
      seen.file = { name: file.name, type: file.type, bytes: file.size };
      seen.model = form.get('model'); seen.languages = form.getAll('languages[]'); seen.language = form.get('language');
      return new Response(JSON.stringify({ text: 'I can pay on Friday.' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    const r = await post({ provider: 'openai', target: 'transcribe', audio, mime: 'audio/webm;codecs=opus', model: 'gpt-transcribe', language: 'de' });
    expect(r.status).toBe(200);
    expect((await r.json()).text).toBe('I can pay on Friday.');
    expect(seen).toMatchObject({ url: 'https://api.openai.com/v1/audio/transcriptions', auth: 'Bearer test-key', model: 'gpt-transcribe', languages: ['de'], language: null });
    // The recording itself, decoded from base64 (16 bytes here).
    expect(seen.file).toEqual({ name: 'answer.webm', type: 'audio/webm', bytes: 16 });
  });

  it('an older model takes the single language field; no language is fine too', async () => {
    const forms: FormData[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => { forms.push(init.body as FormData); return new Response('{"text":"x"}', { status: 200 }); }));
    await post({ provider: 'openai', target: 'transcribe', audio, mime: 'audio/mp4', model: 'whisper-1', language: 'sv' });
    await post({ provider: 'openai', target: 'transcribe', audio, mime: 'audio/mp4' });
    expect(forms[0].get('language')).toBe('sv');
    expect((forms[0].get('file') as File).name).toBe('answer.mp4');
    expect(forms[1].get('model')).toBe('gpt-transcribe');
    expect(forms[1].getAll('languages[]')).toEqual([]);
  });

  it('refuses what is not a recording for a transcription model', async () => {
    expect((await post({ provider: 'openai', target: 'transcribe', audio, mime: 'audio/webm', model: 'gpt-6-astra' })).status).toBe(400);
    expect((await post({ provider: 'openai', target: 'transcribe', audio, mime: 'text/html' })).status).toBe(400);
    expect((await post({ provider: 'openai', target: 'transcribe', audio: '', mime: 'audio/webm' })).status).toBe(400);
    expect((await post({ provider: 'openai', target: 'transcribe', audio: 'A'.repeat(5 * 1024 * 1024 + 1), mime: 'audio/webm' })).status).toBe(413);
    expect((await post({ provider: 'elevenlabs', target: 'transcribe', audio, mime: 'audio/webm' })).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps a refusal\'s status and message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { message: 'Incorrect API key' } }), { status: 401, headers: { 'content-type': 'application/json' } })));
    const r = await post({ provider: 'openai', target: 'transcribe', audio, mime: 'audio/webm' });
    expect(r.status).toBe(401);
    expect(await r.text()).toContain('Incorrect API key');
  });
});
