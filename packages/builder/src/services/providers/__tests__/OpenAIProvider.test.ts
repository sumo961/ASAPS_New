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
import { describe, it, expect, beforeEach } from 'vitest';
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

  it('defaults the model to gpt-5.6-sol and proxies the default OpenAI endpoint', () => {
    p.configure(cfg());
    expect(p.isReady()).toBe(true);
    expect((p as any).model).toBe('gpt-5.6-sol');
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

  it("caps the Anthropic-only 'max' tier to 'xhigh' on the OpenAI side", () => {
    const body = build({ model: 'gpt-5.5', reasoningEffort: 'max' });
    expect(body.reasoning_effort).toBe('xhigh');
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
