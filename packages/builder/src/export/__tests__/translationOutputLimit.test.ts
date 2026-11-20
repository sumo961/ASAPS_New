import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { outputLimitFromRefusal, translateStory } from '../StoryTranslator';

/**
 * A translation batch asks for a generous output limit. A model that allows
 * less refused every batch with a 400 (author report, 2026-11-20: 134
 * strings "could not be translated", max_tokens 32768 against a model that
 * supports 16384). The translator now asks again for what the model allows.
 */
const OPENAI_REFUSAL = JSON.stringify({ error: { message: 'max_tokens is too large: 32768. This model supports at most 16384 completion tokens, whereas you provided 32768.', type: 'invalid_request_error', param: 'max_tokens' } });
const ANTHROPIC_REFUSAL = JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'max_tokens: 32768 > 8192, which is the maximum allowed number of output tokens for claude-3-5-haiku' } });

describe('outputLimitFromRefusal', () => {
  it("reads the limit out of a provider's refusal", () => {
    expect(outputLimitFromRefusal(OPENAI_REFUSAL)).toBe(16384);
    expect(outputLimitFromRefusal(ANTHROPIC_REFUSAL)).toBe(8192);
  });
  it('leaves other refusals alone', () => {
    expect(outputLimitFromRefusal('{"error":{"message":"Incorrect API key provided"}}')).toBeNull();
    expect(outputLimitFromRefusal('{"error":{"message":"The model `x` does not exist"}}')).toBeNull();
    expect(outputLimitFromRefusal('')).toBeNull();
  });
});

describe('translating with a model that allows less output', () => {
  let originalFetch: typeof global.fetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  const project = { project: { story: { beats: [{ id: 'b1', type: 'infoText', parameters: { text: 'Hello there.', buttonText: 'Continue' } }], characters: [] }, globalSettings: {} } };
  const limitOf = (call: any[]) => { const body = JSON.parse(call[1].body); return body.max_tokens ?? body.max_completion_tokens; };
  const answerAll = (call: any[]) => {
    const body = JSON.parse(call[1].body);
    const user = body.messages[body.messages.length - 1].content as string;
    const keys = [...user.matchAll(/"([^"\n]+)":\s*"/g)].map((m) => m[1]);
    return Object.fromEntries(keys.map((k) => [k, 'DE']));
  };

  it('asks again for what the model allows, and remembers it for the next batch', async () => {
    const calls: any[][] = [];
    global.fetch = vi.fn(async (...call: any[]) => {
      calls.push(call);
      if (limitOf(call) > 16384) return new Response(OPENAI_REFUSAL, { status: 400 });
      return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(answerAll(call)) } }] }), { status: 200 });
    }) as any;

    const ai = { provider: 'openai', apiKey: 'sk-test', model: 'test-small-output' } as any;
    await translateStory(project, 'German', ai);
    const limits = calls.map(limitOf);
    expect(limits[0]).toBe(32768);
    expect(limits[1]).toBe(16384);
    expect(limits.slice(1).every((l) => l === 16384)).toBe(true);

    calls.length = 0;
    await translateStory(project, 'German', ai);
    expect(calls.map(limitOf).every((l) => l === 16384)).toBe(true);
  });

  it('uses the app\'s default OpenAI model when the setup names none', async () => {
    const models: string[] = [];
    global.fetch = vi.fn(async (...call: any[]) => {
      models.push(JSON.parse(call[1].body).model);
      return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(answerAll(call)) } }] }), { status: 200 });
    }) as any;
    await translateStory(project, 'German', { provider: 'openai', apiKey: 'sk-test' } as any);
    expect(new Set(models)).toEqual(new Set(['gpt-6-astra']));
  });

  it('still reports a refusal that is not about the limit', async () => {
    global.fetch = vi.fn(async () => new Response('{"error":{"message":"Incorrect API key provided"}}', { status: 401 })) as any;
    await expect(translateStory(project, 'German', { provider: 'openai', apiKey: 'sk-bad', model: 'm' } as any)).rejects.toThrow(/AI API error 401/);
  });
});
