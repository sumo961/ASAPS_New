import { describe, it, expect, vi, afterEach } from 'vitest';
import { createProxyTransport, wrapPlainTextAsProviderResponse } from '../../src/ai/runtimeAdapter';

const mockFetch = (status: number, contentType: string, body: string) => {
  const res = {
    ok: status < 400, status,
    headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? contentType : null) },
    text: async () => body,
    json: async () => JSON.parse(body),
    body: {
      getReader: () => { let done = false; return { read: async () => done ? { done: true, value: undefined } : (done = true, { done: false, value: new TextEncoder().encode(body) }) }; },
    },
  } as any;
  const f = vi.fn(async () => res); (globalThis as any).fetch = f; return f;
};
afterEach(() => { delete (globalThis as any).fetch; });

describe('createProxyTransport — streams by default', () => {
  it('sends stream:true plus the { baseUrl, apiKey } wire contract', async () => {
    const f = mockFetch(200, 'application/json', JSON.stringify({ content: [{ type: 'text', text: 'hi' }] }));
    const t = createProxyTransport({ endpoint: '/api/ai/claude', baseUrl: 'https://gw.example', apiKey: 'k' });
    await t({ model: 'm', messages: [] });
    const sent = JSON.parse((f.mock.calls[0] as any)[1].body);
    expect(sent).toMatchObject({ baseUrl: 'https://gw.example', apiKey: 'k', model: 'm', stream: true });
  });

  it('rebuilds the Anthropic shape from the proxies\' text/plain chunk stream', async () => {
    mockFetch(200, 'text/plain; charset=utf-8', 'Hello from Nia');
    const t = createProxyTransport({ endpoint: '/api/ai/claude', baseUrl: 'https://gw', apiKey: 'k' });
    const r = await t({ model: 'm' });
    expect(r.content[0].text).toBe('Hello from Nia');
    expect(r.stop_reason).toBe('end_turn');
  });

  it('rebuilds the chat-completions shape for the openai endpoint', async () => {
    mockFetch(200, 'text/plain', 'Hello');
    const t = createProxyTransport({ endpoint: '/api/ai/openai', baseUrl: 'https://gw', apiKey: 'k' });
    const r = await t({ model: 'm' });
    expect(r.choices[0].message.content).toBe('Hello');
  });

  it('accepts a proxy that ignores the flag and returns JSON', async () => {
    mockFetch(200, 'application/json', JSON.stringify({ choices: [{ message: { content: 'buffered' } }] }));
    const t = createProxyTransport({ endpoint: '/api/ai/openai', baseUrl: 'https://gw', apiKey: 'k' });
    expect((await t({ model: 'm' })).choices[0].message.content).toBe('buffered');
  });

  it('reassembles a passthrough SSE stream', async () => {
    const sse = 'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n'
      + 'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Stre"}}\n\n'
      + 'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"amed"}}\n\n'
      + 'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":2}}\n\n';
    mockFetch(200, 'text/event-stream', sse);
    const t = createProxyTransport({ endpoint: '/api/ai/claude', baseUrl: 'https://gw', apiKey: 'k' });
    const r = await t({ model: 'm' });
    expect(r.content.find((b: any) => b.type === 'text').text).toBe('Streamed');
  });

  it('honours stream:false (buffered request, no flag on the wire)', async () => {
    const f = mockFetch(200, 'application/json', '{"content":[]}');
    const t = createProxyTransport({ endpoint: '/api/ai/claude', baseUrl: 'https://gw', apiKey: 'k' });
    await t({ model: 'm', stream: false } as any);
    expect(JSON.parse((f.mock.calls[0] as any)[1].body).stream).toBe(false);
  });

  it('wrapPlainTextAsProviderResponse shapes', () => {
    expect(wrapPlainTextAsProviderResponse('x', 'anthropic').content[0]).toEqual({ type: 'text', text: 'x' });
    expect(wrapPlainTextAsProviderResponse('x', 'openai').choices[0].message.content).toBe('x');
  });
});
