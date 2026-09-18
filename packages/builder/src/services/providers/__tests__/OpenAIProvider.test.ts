/**
 * Tests for OpenAIProvider's pure, non-network logic:
 *   - isLocalhostUrl / isOllamaConnection (connection classification)
 *   - configure(): readiness, model default, proxy + json-format decisions
 *   - buildChatRequest(): token-param selection, response_format,
 *     reasoning_effort ('max'→'xhigh' cap), temperature gating, Ollama opts
 *   - collectDialogTreeTargets / normalizeBeatsFormat / cleanupBeatParameters
 *     (the response-massaging helpers run on model output)
 *
 * buildChatRequest delegates token/temperature decisions to the shared
 * @asaps/core quirks (requiresMaxCompletionTokens / isReasoningModel);
 * model ids below are chosen to land on known sides of those rules:
 *   - gpt-4.1  → not reasoning, uses max_tokens + temperature
 *   - gpt-5.5  → reasoning, uses max_completion_tokens, no temperature
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OpenAIProvider } from '../OpenAIProvider';
import type { AIProviderConfig } from '../../../types/ai';

function cfg(over: Partial<AIProviderConfig> = {}): AIProviderConfig {
  return { provider: 'openai', apiKey: 'sk-test', ...over };
}

let p: OpenAIProvider;
beforeEach(() => {
  p = new OpenAIProvider();
});

describe('isLocalhostUrl', () => {
  const isLocal = (url: string) => (p as any).isLocalhostUrl(url);

  it('recognizes localhost / loopback / private ranges', () => {
    expect(isLocal('http://localhost:11434')).toBe(true);
    expect(isLocal('http://127.0.0.1:1234')).toBe(true);
    expect(isLocal('http://192.168.1.50:8080')).toBe(true);
    expect(isLocal('http://10.0.0.4:5000')).toBe(true);
  });

  it('rejects remote hosts and unparseable urls', () => {
    expect(isLocal('https://api.openai.com')).toBe(false);
    expect(isLocal('not a url')).toBe(false);
  });
});

describe('configure', () => {
  it('is not ready without an api key', () => {
    p.configure(cfg({ apiKey: '' }));
    expect(p.isReady()).toBe(false);
  });

  it('defaults the model to gpt-6-astra and proxies the default OpenAI endpoint', () => {
    p.configure(cfg());
    expect(p.isReady()).toBe(true);
    expect((p as any).model).toBe('gpt-6-astra');
    expect((p as any).useProxy).toBe(true); // no baseUrl → proxy
    expect((p as any).useJsonFormat).toBe(true); // json_object on for default
  });

  it('connects directly (no proxy) for a localhost baseUrl', () => {
    p.configure(cfg({ baseUrl: 'http://localhost:11434/v1' }));
    expect((p as any).useProxy).toBe(false);
    expect((p as any).useJsonFormat).toBe(false); // disabled when a baseUrl is set
  });

  it('proxies a remote custom baseUrl', () => {
    p.configure(cfg({ baseUrl: 'https://moonshot.example/v1' }));
    expect((p as any).useProxy).toBe(true);
  });

  it('reports its provider name', () => {
    expect(p.name).toBe('openai');
  });
});

describe('isOllamaConnection', () => {
  const isOllama = () => (p as any).isOllamaConnection();

  it('is true for localhost:11434 or any url containing "ollama"', () => {
    p.configure(cfg({ baseUrl: 'http://localhost:11434/v1' }));
    expect(isOllama()).toBe(true);
    p.configure(cfg({ baseUrl: 'http://127.0.0.1/ollama/v1' }));
    expect(isOllama()).toBe(true);
  });

  it('is false without a baseUrl or for a non-Ollama host', () => {
    p.configure(cfg());
    expect(isOllama()).toBe(false);
    p.configure(cfg({ baseUrl: 'https://api.openai.com/v1' }));
    expect(isOllama()).toBe(false);
  });
});

describe('default token budgets get reasoning headroom', () => {
  const build = (over: Partial<AIProviderConfig>, defMax: number) => {
    p.configure(cfg(over));
    return (p as any).buildChatRequest([{ role: 'user', content: 'hi' }], defMax, 0.7);
  };

  it('floors an app-default budget for reasoning models (empty-content fix)', () => {
    // 3000 default on gpt-5.x → reasoning tokens ate the whole budget and
    // content came back empty (the "beat suggestions do nothing" bug)
    const body = build({ model: 'gpt-5.5' }, 3000);
    expect(body.max_completion_tokens).toBeGreaterThanOrEqual(4096);
  });

  it('leaves non-reasoning models at the requested default', () => {
    const body = build({ model: 'gpt-4.1' }, 3000);
    expect(body.max_tokens).toBe(3000);
  });

  it('respects an explicit user-configured maxTokens verbatim', () => {
    const body = build({ model: 'gpt-5.5', maxTokens: 2000 }, 3000);
    expect(body.max_completion_tokens).toBe(2000);
  });
});

describe('pro reasoning mode (Responses API)', () => {
  const build = (over: Partial<AIProviderConfig>, max = 1000) => {
    p.configure(cfg(over));
    return (p as any).buildChatRequest([{ role: 'user', content: 'hi' }], max, 0.7);
  };

  it('builds a Responses-API body when pro + gpt-5.6 + official endpoint', () => {
    const body = build({ model: 'gpt-5.6-sol', reasoningMode: 'pro' });
    expect(body._endpoint).toBe('responses');
    expect(body.reasoning).toEqual({ mode: 'pro' });
    expect(body.input).toEqual([{ role: 'user', content: 'hi' }]);
    // default floored for the reasoning model before the pro branch
    expect(body.max_output_tokens).toBe(4096);
    // chat-completions keys must not leak in
    expect(body.messages).toBeUndefined();
    expect(body.max_tokens).toBeUndefined();
    expect(body.max_completion_tokens).toBeUndefined();
    expect(body.temperature).toBeUndefined();
  });

  it('threads reasoningEffort into reasoning.effort', () => {
    const body = build({ model: 'gpt-5.6-sol', reasoningMode: 'pro', reasoningEffort: 'high' });
    expect(body.reasoning).toEqual({ mode: 'pro', effort: 'high' });
  });

  it('falls back to plain chat completions for non-5.6 models', () => {
    const body = build({ model: 'gpt-5.5', reasoningMode: 'pro' });
    expect(body._endpoint).toBeUndefined();
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }]);
    expect(body.max_completion_tokens).toBe(4096);
    expect(body.input).toBeUndefined();
    expect(body.reasoning).toBeUndefined();
  });

  it('falls back to plain chat completions on custom / local endpoints', () => {
    for (const baseUrl of ['http://localhost:11434/v1', 'https://api.moonshot.ai/v1']) {
      const body = build({ model: 'gpt-5.6-sol', reasoningMode: 'pro', baseUrl });
      expect(body._endpoint).toBeUndefined();
      expect(body.messages).toBeDefined();
      expect(body.reasoning).toBeUndefined();
    }
  });

  it('is inert when reasoningMode is standard or unset', () => {
    for (const reasoningMode of ['standard', undefined] as const) {
      const body = build({ model: 'gpt-5.6-sol', reasoningMode });
      expect(body._endpoint).toBeUndefined();
      expect(body.messages).toBeDefined();
      expect(body.reasoning).toBeUndefined();
    }
  });
});

describe('buildChatRequest', () => {
  const build = (over: Partial<AIProviderConfig>, max = 1000, temp = 0.7) => {
    p.configure(cfg(over));
    return (p as any).buildChatRequest([{ role: 'user', content: 'hi' }], max, temp);
  };

  it('uses max_tokens + temperature for a non-reasoning model', () => {
    const body = build({ model: 'gpt-4.1' });
    expect(body.max_tokens).toBe(1000);
    expect(body.max_completion_tokens).toBeUndefined();
    expect(body.temperature).toBe(0.7);
  });

  it('uses max_completion_tokens and omits temperature for a reasoning model', () => {
    const body = build({ model: 'gpt-5.5' });
    // 1000 default floored to the reasoning-model minimum (hidden reasoning
    // tokens count against the cap)
    expect(body.max_completion_tokens).toBe(4096);
    expect(body.max_tokens).toBeUndefined();
    expect(body.temperature).toBeUndefined();
  });

  it('honors an explicit maxTokens override', () => {
    const body = build({ model: 'gpt-4.1', maxTokens: 4242 });
    expect(body.max_tokens).toBe(4242);
  });

  it('adds response_format json_object only when json format is enabled', () => {
    const withJson = build({ model: 'gpt-4.1' }); // no baseUrl → json on
    expect(withJson.response_format).toEqual({ type: 'json_object' });

    const noJson = build({ model: 'gpt-4.1', baseUrl: 'https://remote.example/v1' });
    expect(noJson.response_format).toBeUndefined();
  });

  it('passes reasoning_effort through and forces max_completion_tokens when set', () => {
    const body = build({ model: 'gpt-4.1', reasoningEffort: 'high' });
    expect(body.reasoning_effort).toBe('high');
    expect(body.max_completion_tokens).toBe(1000); // effort forces this even on gpt-4.1
    expect(body.temperature).toBeUndefined(); // effort makes it a reasoning request
  });

  it("caps the 'max' tier to 'xhigh' on OpenAI models that lack it", () => {
    const body = build({ model: 'gpt-5.5', reasoningEffort: 'max' });
    expect(body.reasoning_effort).toBe('xhigh');
  });

  it("honours 'max' on GPT-6 Astra and rewrites none/minimal to 'low' (Astra 400s on them)", () => {
    expect(build({ model: 'gpt-6-astra', reasoningEffort: 'max' }).reasoning_effort).toBe('max');
    expect(build({ model: 'gpt-6-astra', reasoningEffort: 'none' }).reasoning_effort).toBe('low');
    expect(build({ model: 'gpt-6-astra', reasoningEffort: 'minimal' }).reasoning_effort).toBe('low');
    expect(build({ model: 'gpt-6-astra', reasoningEffort: 'high' }).reasoning_effort).toBe('high');
    // reasoning model: max_completion_tokens, no temperature
    const body = build({ model: 'gpt-6-astra' });
    expect(body.max_completion_tokens).toBeDefined();
    expect(body.max_tokens).toBeUndefined();
    expect(body.temperature).toBeUndefined();
  });

  it('injects Ollama options for an Ollama connection', () => {
    const body = build({ model: 'llama3', baseUrl: 'http://localhost:11434/v1' }, 2048);
    expect(body.options).toEqual({ num_ctx: 32768, num_predict: 2048 });
  });
});

describe('collectDialogTreeTargets', () => {
  it('collects targets from choices and nested dialogNodes recursively', () => {
    const targets: string[] = [];
    (p as any).collectDialogTreeTargets(
      {
        choices: [
          { target: 'a' },
          { dialogNode: { choices: [{ target: 'b' }, { target: 'c' }] } },
        ],
      },
      targets,
    );
    expect(targets).toEqual(['a', 'b', 'c']);
  });

  it('handles a null node and a node without choices', () => {
    const targets: string[] = [];
    (p as any).collectDialogTreeTargets(null, targets);
    (p as any).collectDialogTreeTargets({}, targets);
    expect(targets).toEqual([]);
  });
});

describe('normalizeBeatsFormat', () => {
  it('converts object-style beats to an array, injecting id from the key', () => {
    const data: any = { beats: { beat_0: { name: 'Intro' }, beat_1: { type: 'infoText' } } };
    (p as any).normalizeBeatsFormat(data);
    expect(Array.isArray(data.beats)).toBe(true);
    expect(data.beats).toHaveLength(2);
    expect(data.beats[0]).toMatchObject({ id: 'beat_0', name: 'Intro' });
    expect(data.beats[1]).toMatchObject({ id: 'beat_1', type: 'infoText' });
  });

  it('leaves an already-array beats list untouched', () => {
    const data: any = { beats: [{ id: 'beat_0' }] };
    (p as any).normalizeBeatsFormat(data);
    expect(data.beats).toEqual([{ id: 'beat_0' }]);
  });
});

describe('cleanupBeatParameters', () => {
  it('is a no-op when there is no beats array', () => {
    const data: any = { beats: undefined };
    expect(() => (p as any).cleanupBeatParameters(data)).not.toThrow();
  });

  it("removes the stray 'connection' param from multi-connection beats", () => {
    const data: any = {
      beats: [
        { id: 'b1', type: 'dialogTree', parameters: { connection: { targetId: 'x' }, choices: [{ target: 't1' }] } },
      ],
    };
    (p as any).cleanupBeatParameters(data);
    expect('connection' in data.beats[0].parameters).toBe(false);
  });

  it('rebuilds the connections array from actual choice/prop/dialog targets (deduped)', () => {
    const data: any = {
      beats: [
        {
          id: 'b1',
          type: 'dialogTree',
          connections: [{ targetId: 'stale' }],
          parameters: {
            choices: [{ target: 't1' }, { target: 't1' }], // duplicate
            dialogTree: { choices: [{ target: 't2' }] },
          },
        },
      ],
    };
    (p as any).cleanupBeatParameters(data);
    expect(data.beats[0].connections).toEqual([{ targetId: 't1' }, { targetId: 't2' }]);
  });

  it('strips flat conditionBeat params when the nested condition is present', () => {
    const data: any = {
      beats: [
        {
          id: 'c1',
          type: 'conditionBeat',
          parameters: {
            condition: { type: 'variable', variable: 'k', operator: '==', value: true },
            operator: '==', // forbidden flat duplicate
            value: true, // forbidden flat duplicate
            trueTarget: 'x', // forbidden
          },
        },
      ],
    };
    (p as any).cleanupBeatParameters(data);
    const params = data.beats[0].parameters;
    expect('operator' in params).toBe(false);
    expect('value' in params).toBe(false);
    expect('trueTarget' in params).toBe(false);
    expect(params.condition).toBeDefined(); // nested form preserved
  });

  it('removes non-schema parameters from titleScreen beats', () => {
    const data: any = {
      beats: [
        { id: 't', type: 'titleScreen', parameters: { title: 'T', author: 'A', backgroundColor: '#000', extra: 1 } },
      ],
    };
    (p as any).cleanupBeatParameters(data);
    expect(Object.keys(data.beats[0].parameters).sort()).toEqual(['author', 'title']);
  });
});

describe('generateChatWithTools — Responses API on the official endpoint', () => {
  const tools = [
    { name: 'web_search', description: 'Search', input_schema: { type: 'object', properties: { query: { type: 'string' } } } },
  ];
  let fetchMock: ReturnType<typeof vi.fn>;
  const originalFetch = globalThis.fetch;

  const jsonResponse = (payload: unknown) =>
    ({ ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload) }) as unknown as Response;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const sentBody = (call: number) => JSON.parse(fetchMock.mock.calls[call][1].body as string);

  it('posts a Responses-API body (flat tools, instructions, _endpoint marker) instead of chat completions', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      status: 'completed',
      output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'no search needed' }] }],
    }));
    p.configure(cfg({ model: 'gpt-6-astra', reasoningEffort: 'none' }));

    const result = await p.generateChatWithTools({
      systemPrompt: 'You are the Ideator',
      messages: [{ role: 'user', content: 'hello' }],
      tools,
      executeTool: async () => 'unused',
    });

    expect(result).toEqual({ text: 'no search needed', toolCalls: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:3001/api/ai/openai');
    const body = sentBody(0);
    expect(body._endpoint).toBe('responses');
    expect(body.model).toBe('gpt-6-astra');
    expect(body.instructions).toBe('You are the Ideator');
    expect(body.input).toEqual([{ role: 'user', content: 'hello' }]);
    expect(body.tools).toEqual([
      { type: 'function', name: 'web_search', description: 'Search', parameters: tools[0].input_schema, strict: false },
    ]);
    expect(body.max_output_tokens).toBe(8192);
    // Astra: none → low; chat-completions keys must not leak in
    expect(body.reasoning).toEqual({ effort: 'low' });
    expect(body.messages).toBeUndefined();
    expect(body.reasoning_effort).toBeUndefined();
    expect(body.stream).toBeUndefined();
  });

  it('runs the requested tool, echoes output items + function_call_output, and returns the final text', async () => {
    const firstOutput = [
      { type: 'reasoning', id: 'rs_1', summary: [] },
      { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'web_search', arguments: '{"query":"neolithic"}' },
    ];
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ status: 'completed', output: firstOutput }))
      .mockResolvedValueOnce(jsonResponse({
        status: 'completed',
        output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Here is what I found.' }] }],
      }));
    p.configure(cfg({ model: 'gpt-5.6-sol', reasoningEffort: 'medium' }));

    const executeTool = vi.fn(async (name: string, input: Record<string, unknown>) => `results for ${input.query} via ${name}`);
    const onToolUse = vi.fn();
    const result = await p.generateChatWithTools({
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'research neolithic life' }],
      tools,
      executeTool,
      onToolUse,
    });

    expect(executeTool).toHaveBeenCalledWith('web_search', { query: 'neolithic' });
    expect(onToolUse).toHaveBeenCalledWith('web_search', { query: 'neolithic' });
    expect(result.text).toBe('Here is what I found.');
    expect(result.toolCalls).toEqual([
      { name: 'web_search', input: { query: 'neolithic' }, result: 'results for neolithic via web_search' },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const second = sentBody(1);
    expect(second.input).toEqual([
      { role: 'user', content: 'research neolithic life' },
      ...firstOutput,
      { type: 'function_call_output', call_id: 'call_1', output: 'results for neolithic via web_search' },
    ]);
    // GPT-5.6 keeps its chat-style effort values on the Responses API
    expect(second.reasoning).toEqual({ effort: 'medium' });
    expect(second.reasoning.mode).toBeUndefined();
  });

  it('keeps the chat-completions tool loop for OpenAI-compatible third parties', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      choices: [{ finish_reason: 'stop', message: { content: 'plain reply' } }],
    }));
    p.configure(cfg({ model: 'kimi-k2-thinking', baseUrl: 'https://api.moonshot.ai/v1' }));

    const result = await p.generateChatWithTools({
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
      tools,
      executeTool: async () => 'unused',
    });

    expect(result.text).toBe('plain reply');
    const body = sentBody(0);
    expect(body._endpoint).toBeUndefined();
    expect(body.messages?.[0]).toEqual({ role: 'system', content: 'sys' });
    expect(body.tools?.[0]?.type).toBe('function');
    expect(body.tools?.[0]?.function?.name).toBe('web_search');
  });
});

describe('direct (local) calls send an explicit stream:false', () => {
  // Apple's `fm serve` (macOS 27) answers an OMITTED stream flag with an
  // event stream; the SDK's non-streaming call omits it. Ollama etc. are
  // indifferent. Pin the flag on every direct call site.
  it('callOpenAI and the tool loop both pass stream:false to the SDK client', async () => {
    p.configure(cfg({ baseUrl: 'http://localhost:8000/v1', model: 'system', apiKey: 'ollama' }));
    const create = vi.fn(async () => ({ choices: [{ finish_reason: 'stop', message: { content: 'hi' } }] }));
    (p as any).client = { chat: { completions: { create } } };
    expect((p as any).useProxy).toBe(false);

    await (p as any).callOpenAI({ model: 'system', messages: [] });
    expect(create.mock.calls[0][0].stream).toBe(false);

    await p.generateChatWithTools({
      systemPrompt: 's', messages: [{ role: 'user', content: 'u' }],
      tools: [{ name: 't', description: 'd', input_schema: { type: 'object' } }],
      executeTool: async () => '',
    });
    expect(create.mock.calls[1][0].stream).toBe(false);
  });
});
