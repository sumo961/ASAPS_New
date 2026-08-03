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
