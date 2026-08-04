/**
 * Tests for the shared runtime AI adapter — the single IAIService behind
 * PreviewWindow, StoryPreview, and the exported player's WebAIProvider.
 *
 * A stub transport captures the exact request body per provider family and
 * feeds back canned provider-shaped responses, pinning:
 *   - request-body construction (token params, system placement, multimodal parts)
 *   - response parsing (Anthropic content blocks, chat-completions choices)
 *   - thinking-block stripping on every text path
 *   - dialog JSON repair vs text-format fallback
 *   - classifyContent matching + the historical Claude non-text fallback
 *   - the proxy transport's { baseUrl, apiKey, ...body } wire contract
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createRuntimeAIService,
  createProxyTransport,
  createRelayTransport,
  createDirectAnthropicTransport,
  createDirectOpenAITransport,
  DEFAULT_OPENAI_MODEL,
} from '../../src/ai/runtimeAdapter';

function stub(response: any) {
  const calls: any[] = [];
  const transport = async (body: Record<string, unknown>) => {
    calls.push(body);
    return typeof response === 'function' ? response(body) : response;
  };
  return { transport, calls };
}

const openaiReply = (content: string) => ({ choices: [{ message: { content } }] });
const anthropicReply = (text: string, withThinking = false) => ({
  content: [
    ...(withThinking ? [{ type: 'thinking', thinking: 'hmm' }] : []),
    { type: 'text', text },
  ],
});

describe('generateContent', () => {
  it('openai family: reasoning default model uses max_completion_tokens, no system message', async () => {
    const { transport, calls } = stub(openaiReply('hello'));
    const svc = createRuntimeAIService({ family: 'openai', transport });
    const out = await svc.generateContent('hi', { maxTokens: 500 });
    expect(out).toBe('hello');
    expect(calls[0].model).toBe(DEFAULT_OPENAI_MODEL);
    // reasoning-model headroom: 500 requested → floored up, on max_completion_tokens
    expect(calls[0].max_completion_tokens).toBeGreaterThanOrEqual(500);
    expect(calls[0].max_tokens).toBeUndefined();
    expect(calls[0].messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('openai family: non-reasoning model uses max_tokens as requested', async () => {
    const { transport, calls } = stub(openaiReply('x'));
    const svc = createRuntimeAIService({ family: 'openai', model: 'gpt-4.1', transport });
    await svc.generateContent('hi', { maxTokens: 300 });
    expect(calls[0].max_tokens).toBe(300);
    expect(calls[0].max_completion_tokens).toBeUndefined();
  });

  it('anthropic family: parses the text block even behind a thinking block', async () => {
    const { transport, calls } = stub(anthropicReply('claude says', true));
    const svc = createRuntimeAIService({ family: 'anthropic', model: 'claude-sonnet-4-6', transport });
    const out = await svc.generateContent('hi');
    expect(out).toBe('claude says');
    expect(calls[0].max_tokens).toBeGreaterThan(0);
    expect(calls[0].messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('strips inline <thinking> tags from text results (both families)', async () => {
    const { transport } = stub(openaiReply('<thinking>secret</thinking>The answer'));
    const svc = createRuntimeAIService({ family: 'openai', model: 'gpt-4.1', transport });
    expect(await svc.generateContent('q')).toBe('The answer');
  });
});

describe('generateDialog', () => {
  it('json format: repairs prose-wrapped truncated JSON', async () => {
    const { transport } = stub(openaiReply('Sure!\n```json\n{"dialog": {"text": "Hi"'));
    const svc = createRuntimeAIService({ family: 'openai', model: 'gpt-4.1', transport });
    const out = await svc.generateDialog({ prompt: 'p', format: 'tree' });
    expect(out).toEqual({ dialog: { text: 'Hi' } });
  });

  it('text format: returns raw text when the reply is not JSON (no repair mangling)', async () => {
    const { transport } = stub(openaiReply('Just some { weird prose'));
    const svc = createRuntimeAIService({ family: 'openai', model: 'gpt-4.1', transport });
    const out = await svc.generateDialog({ prompt: 'p', format: 'text' });
    expect(out).toBe('Just some { weird prose');
  });

  it('json format: throws a clear error when nothing salvages', async () => {
    const { transport } = stub(openaiReply('no json at all'));
    const svc = createRuntimeAIService({ family: 'openai', model: 'gpt-4.1', transport });
    await expect(svc.generateDialog({ prompt: 'p', format: 'tree' })).rejects.toThrow(/No valid JSON/);
  });
});

describe('generateConversationTurn', () => {
  it('anthropic: hoists systemPrompt to body.system and filters system-role messages', async () => {
    const { transport, calls } = stub(anthropicReply('reply'));
    const svc = createRuntimeAIService({ family: 'anthropic', model: 'claude-sonnet-4-6', transport });
    const out = await svc.generateConversationTurn!({
      systemPrompt: 'be nice',
      messages: [
        { role: 'system', content: 'ignore me' },
        { role: 'user', content: 'hello' },
      ],
    });
    expect(out.text).toBe('reply');
    expect(calls[0].system).toBe('be nice');
    expect(calls[0].messages).toEqual([{ role: 'user', content: 'hello' }]);
  });

  it('anthropic: injects a "Begin." user message when only system messages exist', async () => {
    const { transport, calls } = stub(anthropicReply('go'));
    const svc = createRuntimeAIService({ family: 'anthropic', model: 'claude-sonnet-4-6', transport });
    await svc.generateConversationTurn!({ systemPrompt: 's', messages: [] });
    expect(calls[0].messages).toEqual([{ role: 'user', content: 'Begin.' }]);
  });

  it('openai: prepends the system prompt and guarantees a user message', async () => {
    const { transport, calls } = stub(openaiReply(' trimmed '));
    const svc = createRuntimeAIService({ family: 'openai', model: 'gpt-4.1', transport });
    const out = await svc.generateConversationTurn!({
      systemPrompt: 'sys',
      messages: [{ role: 'assistant', content: 'earlier' }],
    });
    expect(out.text).toBe('trimmed');
    expect(calls[0].messages[0]).toEqual({ role: 'system', content: 'sys' });
    expect(calls[0].messages.some((m: any) => m.role === 'user')).toBe(true);
  });
});

describe('classifyContent', () => {
  it('matches case-insensitively and falls back to the first category', async () => {
    const s1 = stub(openaiReply('  YES  '));
    const svc1 = createRuntimeAIService({ family: 'openai', model: 'gpt-4.1', transport: s1.transport });
    expect(await svc1.classifyContent!('q', ['yes', 'no'])).toBe('yes');

    const s2 = stub(openaiReply('gibberish'));
    const svc2 = createRuntimeAIService({ family: 'openai', model: 'gpt-4.1', transport: s2.transport });
    expect(await svc2.classifyContent!('q', ['yes', 'no'])).toBe('yes');
  });

  it('anthropic: a non-text response classifies as the first category (historical behavior)', async () => {
    const { transport } = stub({ content: [{ type: 'tool_use' }] });
    const svc = createRuntimeAIService({ family: 'anthropic', model: 'claude-sonnet-4-6', transport });
    expect(await svc.classifyContent!('q', ['safe', 'unsafe'])).toBe('safe');
  });
});

describe('analyzeImage', () => {
  const img = { base64: 'AAAA', mediaType: 'image/png' };

  it('anthropic: sends an image content block + text part', async () => {
    const { transport, calls } = stub(anthropicReply(' a cat '));
    const svc = createRuntimeAIService({ family: 'anthropic', model: 'claude-sonnet-4-6', transport });
    const out = await svc.analyzeImage!(img, 'what is this?');
    expect(out).toBe('a cat');
    const content = calls[0].messages[0].content;
    expect(content[0]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: 'AAAA' },
    });
    expect(content[1]).toEqual({ type: 'text', text: 'what is this?' });
  });

  it('openai: sends an image_url data URI + text part', async () => {
    const { transport, calls } = stub(openaiReply('a dog'));
    const svc = createRuntimeAIService({ family: 'openai', model: 'gpt-4.1', transport });
    const out = await svc.analyzeImage!(img, 'and this?');
    expect(out).toBe('a dog');
    const content = calls[0].messages[0].content;
    expect(content[0]).toEqual({
      type: 'image_url',
      image_url: { url: 'data:image/png;base64,AAAA' },
    });
    expect(content[1]).toEqual({ type: 'text', text: 'and this?' });
  });
});

describe('transports (fetch wire contracts)', () => {
  afterEach(() => vi.unstubAllGlobals());

  function fetchSpy(json: any = { ok: true }) {
    const spy = vi.fn(async () => ({ ok: true, json: async () => json }) as any);
    vi.stubGlobal('fetch', spy);
    return spy;
  }

  it('relay transport posts { provider, body } and NEVER a key (public-deploy contract)', async () => {
    const spy = fetchSpy({ content: [{ type: 'text', text: 'hi' }] });
    const t = createRelayTransport({ endpoint: '/.netlify/functions/asaps-ai', family: 'anthropic' });
    const out = await t({ model: 'claude-sonnet-5', max_tokens: 10, messages: [] });
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('/.netlify/functions/asaps-ai');
    expect(JSON.parse(init.body)).toEqual({
      provider: 'anthropic',
      // stream:true is added by the transport (serverless timeout fix) —
      // the response here is plain JSON, which the transport passes through.
      body: { model: 'claude-sonnet-5', max_tokens: 10, messages: [], stream: true },
    });
    expect(init.body).not.toContain('apiKey');
    expect(out).toEqual({ content: [{ type: 'text', text: 'hi' }] });
  });

  it('relay transport STREAMS anthropic requests and reassembles the SSE (serverless timeout fix)', async () => {
    const sse = [
      'event: message_start',
      'data: {"type":"message_start","message":{"id":"m1","role":"assistant","usage":{"input_tokens":5}}}',
      '',
      'event: content_block_start',
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
      '',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"{\\"tree\\":"}}',
      '',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"1}"}}',
      '',
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":9}}',
      '',
    ].join('\n') + '\n';
    const spy = vi.fn(async () => new Response(sse, {
      status: 200, headers: { 'content-type': 'text/event-stream' },
    }));
    vi.stubGlobal('fetch', spy);
    const t = createRelayTransport({ endpoint: '/relay', family: 'anthropic' });
    const out = await t({ model: 'claude-sonnet-5', max_tokens: 16000, messages: [] });
    // the transport must have requested streaming from the relay
    expect(JSON.parse(spy.mock.calls[0][1].body).body.stream).toBe(true);
    // and callers still see the plain non-streaming response shape
    expect(out.content).toEqual([{ type: 'text', text: '{"tree":1}' }]);
    expect(out.stop_reason).toBe('end_turn');
    expect(out.usage.output_tokens).toBe(9);
  });

  it('relay transport does NOT stream for the openai family', async () => {
    const spy = fetchSpy({ choices: [] });
    const t = createRelayTransport({ endpoint: '/relay', family: 'openai' });
    await t({ model: 'gpt-4o-mini', messages: [] });
    expect(JSON.parse(spy.mock.calls[0][1].body).body.stream).toBeUndefined();
  });

  it('relay transport surfaces the relay error message on non-ok responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: 'ANTHROPIC_API_KEY is not set. Add it under Site configuration.' }),
    }) as any));
    const t = createRelayTransport({ endpoint: '/relay', family: 'anthropic' });
    await expect(t({ model: 'm' })).rejects.toThrow(/ANTHROPIC_API_KEY is not set/);
  });

  it('proxy transport posts { baseUrl, apiKey, ...body } to the proxy endpoint', async () => {
    const spy = fetchSpy();
    const t = createProxyTransport({ endpoint: '/api/ai/openai', baseUrl: 'https://x.example/v1', apiKey: 'k' });
    await t({ model: 'm', messages: [] });
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('/api/ai/openai');
    expect(JSON.parse(init.body)).toEqual({ baseUrl: 'https://x.example/v1', apiKey: 'k', model: 'm', messages: [] });
  });

  it('direct anthropic transport targets /v1/messages with CORS opt-in headers', async () => {
    const spy = fetchSpy();
    const t = createDirectAnthropicTransport({ apiKey: 'sk' });
    await t({ model: 'm' });
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers['x-api-key']).toBe('sk');
    expect(init.headers['anthropic-dangerous-direct-browser-access']).toBe('true');
  });

  it('direct openai transport appends /chat/completions to a custom baseUrl', async () => {
    const spy = fetchSpy();
    const t = createDirectOpenAITransport({ apiKey: 'ollama', baseUrl: 'http://localhost:11434/v1/' });
    await t({ model: 'm' });
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('http://localhost:11434/v1/chat/completions');
    expect(init.headers['Authorization']).toBe('Bearer ollama');
  });
});
