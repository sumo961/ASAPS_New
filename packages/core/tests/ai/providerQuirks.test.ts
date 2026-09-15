/**
 * Tests for providerQuirks — single source of truth for AI provider
 * workarounds (consolidated from the 3 historical code paths that
 * each reimplemented these). A bug here ships to all three.
 *
 * Coverage focus:
 *   - requiresMaxCompletionTokens model-matching: every documented
 *     family (gpt-5, gpt-4o, o1, o3, o4, kimi-k2) MUST return true;
 *     other models false
 *   - case-insensitive matching (the file lowercases the input)
 *   - isReasoningModel covers OpenAI o-series + gpt-5 + kimi-k2,
 *     AND treats any reasoningEffort as a reasoning marker
 *   - effectiveMaxTokens floors reasoning models at 4096 (so the
 *     visible response isn't eaten by hidden thinking) but leaves
 *     non-reasoning untouched
 *   - stripThinkingBlocks handles <think>, <thinking>, <reasoning>
 *     in any case, multi-line spans, edge whitespace, and
 *     ≥3-blank-line collapse
 *   - buildChatRequestBody emits max_completion_tokens for the
 *     new families, max_tokens for the rest
 *   - temperature is OMITTED for reasoning models (they 400 on it)
 *   - response_format / reasoning_effort pass-through
 */
import { describe, it, expect } from 'vitest';
import {
  requiresMaxCompletionTokens,
  isReasoningModel,
  effectiveMaxTokens,
  stripThinkingBlocks,
  buildChatRequestBody,
  supportsProReasoning,
  buildResponsesRequestBody,
  extractResponsesOutputText,
  isGpt6Model,
  openaiReasoningEffort,
  isOfficialOpenAIEndpoint,
  buildResponsesToolRequestBody,
  extractResponsesFunctionCalls,
} from '../../src/ai/providerQuirks';

describe('requiresMaxCompletionTokens', () => {
  describe('returns true for the documented families', () => {
    it('gpt-5 family', () => {
      expect(requiresMaxCompletionTokens('gpt-5')).toBe(true);
      expect(requiresMaxCompletionTokens('gpt-5-turbo')).toBe(true);
    });

    it('gpt-6 astra (Sept 2026 flagship)', () => {
      expect(requiresMaxCompletionTokens('gpt-6-astra')).toBe(true);
      expect(requiresMaxCompletionTokens('GPT-6-Astra')).toBe(true);
    });

    it('gpt-5.6 tier family (Sol / Terra / Luna, GA 2026-07-09)', () => {
      // OpenAI's tiered naming: generation number + capability tier.
      // All ride the gpt-5 prefix, so detection must cover them.
      expect(requiresMaxCompletionTokens('gpt-5.6-sol')).toBe(true);
      expect(requiresMaxCompletionTokens('gpt-5.6-terra')).toBe(true);
      expect(requiresMaxCompletionTokens('gpt-5.6-luna')).toBe(true);
      expect(requiresMaxCompletionTokens('gpt-5.6')).toBe(true); // alias → Sol
      expect(requiresMaxCompletionTokens('gpt-5.5')).toBe(true);
    });

    it('gpt-4o family', () => {
      expect(requiresMaxCompletionTokens('gpt-4o')).toBe(true);
      expect(requiresMaxCompletionTokens('gpt-4o-mini')).toBe(true);
      expect(requiresMaxCompletionTokens('gpt-4o-2024-08-06')).toBe(true);
    });

    it('o1 / o3 / o4 reasoning families', () => {
      expect(requiresMaxCompletionTokens('o1')).toBe(true);
      expect(requiresMaxCompletionTokens('o1-mini')).toBe(true);
      expect(requiresMaxCompletionTokens('o3')).toBe(true);
      expect(requiresMaxCompletionTokens('o3-mini')).toBe(true);
      expect(requiresMaxCompletionTokens('o4')).toBe(true);
    });

    it('kimi-k2 and variants', () => {
      // Includes is critical here: K2.5, K2.6, kimi-k2-thinking
      // all share the substring.
      expect(requiresMaxCompletionTokens('kimi-k2')).toBe(true);
      expect(requiresMaxCompletionTokens('moonshot-kimi-k2.5')).toBe(true);
      expect(requiresMaxCompletionTokens('kimi-k2-thinking')).toBe(true);
    });
  });

  describe('returns false for everything else', () => {
    it('older OpenAI models', () => {
      expect(requiresMaxCompletionTokens('gpt-4')).toBe(false);
      expect(requiresMaxCompletionTokens('gpt-4-turbo')).toBe(false);
      expect(requiresMaxCompletionTokens('gpt-3.5-turbo')).toBe(false);
    });

    it('Anthropic Claude (uses different param entirely)', () => {
      expect(requiresMaxCompletionTokens('claude-3-5-sonnet')).toBe(false);
      expect(requiresMaxCompletionTokens('claude-3-opus')).toBe(false);
    });

    it('other vendors', () => {
      expect(requiresMaxCompletionTokens('llama3')).toBe(false);
      expect(requiresMaxCompletionTokens('mistral-large')).toBe(false);
      expect(requiresMaxCompletionTokens('deepseek-chat')).toBe(false);
    });

    it('empty string', () => {
      expect(requiresMaxCompletionTokens('')).toBe(false);
    });
  });

  it('is case-insensitive', () => {
    expect(requiresMaxCompletionTokens('GPT-4o')).toBe(true);
    expect(requiresMaxCompletionTokens('Kimi-K2-Thinking')).toBe(true);
    expect(requiresMaxCompletionTokens('O1-MINI')).toBe(true);
  });
});

describe('isReasoningModel', () => {
  it('flags o-series models', () => {
    expect(isReasoningModel('o1')).toBe(true);
    expect(isReasoningModel('o1-mini')).toBe(true);
    expect(isReasoningModel('o3-preview')).toBe(true);
  });

  it('flags gpt-5 family', () => {
    expect(isReasoningModel('gpt-5')).toBe(true);
  });

  it('flags kimi-k2 family', () => {
    expect(isReasoningModel('kimi-k2-thinking')).toBe(true);
  });

  it('non-reasoning models return false', () => {
    expect(isReasoningModel('gpt-4o')).toBe(false);
    expect(isReasoningModel('gpt-4')).toBe(false);
    expect(isReasoningModel('claude-3-5-sonnet')).toBe(false);
  });

  it('ANY truthy reasoningEffort flips to true (even on unmarked models)', () => {
    // The "OpenAI-compatible endpoints accept an effort knob on
    // otherwise-unmarked model ids" path — opt-in by config.
    expect(isReasoningModel('gpt-4', 'medium')).toBe(true);
    expect(isReasoningModel('llama3', 'high')).toBe(true);
  });

  it('empty-string reasoningEffort does NOT flip', () => {
    // !!'' === false. An empty string is "no effort configured".
    expect(isReasoningModel('gpt-4', '')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isReasoningModel('O1')).toBe(true);
    expect(isReasoningModel('GPT-5-TURBO')).toBe(true);
  });
  it('detects gpt-6 astra as a reasoning model (temperature must not be sent)', () => {
    expect(isReasoningModel('gpt-6-astra')).toBe(true);
  });

  it('detects the gpt-5.6 tier family as reasoning models', () => {
    expect(isReasoningModel('gpt-5.6-sol')).toBe(true);
    expect(isReasoningModel('gpt-5.6-terra')).toBe(true);
    expect(isReasoningModel('gpt-5.6-luna')).toBe(true);
    expect(isReasoningModel('gpt-5.6')).toBe(true);
  });

});

describe('effectiveMaxTokens', () => {
  it('floors reasoning models at 4096 when requested is lower', () => {
    // The "AIInfoTextBeat asked for 250, got nothing because the
    // reasoning ate the budget" regression. 4096 leaves room for
    // both thinking AND visible content.
    expect(effectiveMaxTokens('o1', 250)).toBe(4096);
    expect(effectiveMaxTokens('gpt-5', 100)).toBe(4096);
    expect(effectiveMaxTokens('kimi-k2', 1000)).toBe(4096);
  });

  it('keeps a higher requested value as-is for reasoning models', () => {
    // The floor is a MINIMUM, not a clamp. Authors who ask for
    // 10000 tokens get 10000.
    expect(effectiveMaxTokens('o1', 8000)).toBe(8000);
  });

  it('passes requested through unchanged for non-reasoning models', () => {
    expect(effectiveMaxTokens('gpt-4', 250)).toBe(250);
    expect(effectiveMaxTokens('claude-3-5-sonnet', 100)).toBe(100);
  });

  it('passes through unchanged when model is undefined', () => {
    // Defensive — the helper shouldn't blow up on missing model
    // info. Caller's request is honored verbatim.
    expect(effectiveMaxTokens(undefined, 250)).toBe(250);
  });
});

describe('stripThinkingBlocks', () => {
  it('removes a single <think> block', () => {
    const input = '<think>internal stuff</think>visible text';
    expect(stripThinkingBlocks(input)).toBe('visible text');
  });

  it('removes <thinking> blocks', () => {
    expect(stripThinkingBlocks('<thinking>x</thinking>hello'))
      .toBe('hello');
  });

  it('removes <reasoning> blocks', () => {
    expect(stripThinkingBlocks('<reasoning>x</reasoning>hello'))
      .toBe('hello');
  });

  it('is case-insensitive on the tag', () => {
    // /gi flag — the model might emit <THINK> or <Thinking>.
    expect(stripThinkingBlocks('<THINK>internal</THINK>visible')).toBe('visible');
    expect(stripThinkingBlocks('<Thinking>x</Thinking>visible')).toBe('visible');
  });

  it('removes multi-line spans', () => {
    // The [\s\S]*? non-greedy match handles newlines inside the
    // block.
    const input = '<think>\nline 1\nline 2\nline 3\n</think>\nresult';
    expect(stripThinkingBlocks(input)).toBe('result');
  });

  it('removes multiple blocks of the same kind', () => {
    const input = '<think>one</think>middle<think>two</think>end';
    expect(stripThinkingBlocks(input)).toBe('middleend');
  });

  it('removes blocks of different kinds in the same text', () => {
    const input = '<think>a</think>X<thinking>b</thinking>Y<reasoning>c</reasoning>Z';
    expect(stripThinkingBlocks(input)).toBe('XYZ');
  });

  it('trims leading and trailing whitespace', () => {
    expect(stripThinkingBlocks('   hello   ')).toBe('hello');
  });

  it('collapses runs of 3+ blank lines into 2', () => {
    // After block removal, the leftover blank-line stretches
    // can look ugly. Collapse to a single paragraph break.
    const input = 'line1\n\n\n\n\nline2';
    expect(stripThinkingBlocks(input)).toBe('line1\n\nline2');
  });

  it('preserves 2-blank-line paragraph breaks', () => {
    expect(stripThinkingBlocks('line1\n\nline2')).toBe('line1\n\nline2');
  });

  it('returns empty string when input is only a thinking block', () => {
    expect(stripThinkingBlocks('<think>just internal</think>')).toBe('');
  });

  it('leaves text untouched when there are no thinking blocks', () => {
    expect(stripThinkingBlocks('plain text')).toBe('plain text');
  });
});

describe('buildChatRequestBody', () => {
  const messages = [
    { role: 'user' as const, content: 'hi' },
  ];

  describe('max_tokens vs max_completion_tokens', () => {
    it('uses max_tokens for legacy models', () => {
      const body = buildChatRequestBody('gpt-4', messages, 1000);
      expect(body.max_tokens).toBe(1000);
      expect(body.max_completion_tokens).toBeUndefined();
    });

    it('uses max_completion_tokens for gpt-4o', () => {
      const body = buildChatRequestBody('gpt-4o', messages, 1000);
      expect(body.max_completion_tokens).toBe(1000);
      expect(body.max_tokens).toBeUndefined();
    });

    it('uses max_completion_tokens for o1', () => {
      const body = buildChatRequestBody('o1', messages, 1000);
      expect(body.max_completion_tokens).toBe(1000);
    });

    it('uses max_completion_tokens for kimi-k2-thinking', () => {
      const body = buildChatRequestBody('kimi-k2-thinking', messages, 1000);
      expect(body.max_completion_tokens).toBe(1000);
    });
  });

  describe('temperature', () => {
    it('passes temperature through for non-reasoning models', () => {
      const body = buildChatRequestBody('gpt-4', messages, 1000, { temperature: 0.7 });
      expect(body.temperature).toBe(0.7);
    });

    it('OMITS temperature for reasoning models (they 400 on it)', () => {
      // Critical safety: reasoning models reject explicit
      // temperature. Sending it produces a 400 the user sees
      // as a confusing AI failure.
      const body = buildChatRequestBody('o1', messages, 1000, { temperature: 0.7 });
      expect(body.temperature).toBeUndefined();
    });

    it('OMITS temperature when reasoningEffort is set, even on non-reasoning models', () => {
      // The opt-in-by-config path — passing reasoningEffort marks
      // the request as reasoning-style, so we drop temperature.
      const body = buildChatRequestBody('gpt-4', messages, 1000, {
        temperature: 0.7,
        reasoningEffort: 'high',
      });
      expect(body.temperature).toBeUndefined();
    });

    it('does not add temperature when it was not requested', () => {
      const body = buildChatRequestBody('gpt-4', messages, 1000);
      expect(body.temperature).toBeUndefined();
    });
  });

  describe('response_format and reasoning_effort pass-through', () => {
    it('passes response_format when provided', () => {
      const body = buildChatRequestBody('gpt-4o', messages, 1000, {
        responseFormat: { type: 'json_object' },
      });
      expect(body.response_format).toEqual({ type: 'json_object' });
    });

    it('passes reasoning_effort when provided', () => {
      const body = buildChatRequestBody('o1', messages, 1000, {
        reasoningEffort: 'medium',
      });
      expect(body.reasoning_effort).toBe('medium');
    });

    it('does not set response_format / reasoning_effort when not requested', () => {
      const body = buildChatRequestBody('gpt-4', messages, 1000);
      expect(body.response_format).toBeUndefined();
      expect(body.reasoning_effort).toBeUndefined();
    });
  });

  describe('shape', () => {
    it('always includes model and messages', () => {
      const body = buildChatRequestBody('gpt-4', messages, 1000);
      expect(body.model).toBe('gpt-4');
      expect(body.messages).toBe(messages);
    });
  });
});

describe('supportsProReasoning', () => {
  it('accepts the gpt-5.6 family (tiers + bare alias)', () => {
    expect(supportsProReasoning('gpt-5.6-sol')).toBe(true);
    expect(supportsProReasoning('gpt-5.6-terra')).toBe(true);
    expect(supportsProReasoning('gpt-5.6-luna')).toBe(true);
    expect(supportsProReasoning('gpt-5.6')).toBe(true);
    expect(supportsProReasoning('GPT-5.6-Sol')).toBe(true); // case-insensitive
  });

  it('rejects everything that is not gpt-5.6 (Astra has no pro mode)', () => {
    expect(supportsProReasoning('gpt-6-astra')).toBe(false);
    expect(supportsProReasoning('gpt-5.5')).toBe(false);
    expect(supportsProReasoning('gpt-4.1')).toBe(false);
    expect(supportsProReasoning('o1')).toBe(false);
    expect(supportsProReasoning('kimi-k2-thinking')).toBe(false);
    expect(supportsProReasoning('llama3.2')).toBe(false);
    expect(supportsProReasoning('')).toBe(false);
  });
});

describe('buildResponsesRequestBody', () => {
  const msgs = [
    { role: 'system', content: 'be brief' },
    { role: 'user', content: 'hi' },
  ];

  it('builds the Responses-API shape: input[], max_output_tokens, reasoning.mode pro', () => {
    const body = buildResponsesRequestBody('gpt-5.6-sol', msgs, 2000);
    expect(body.model).toBe('gpt-5.6-sol');
    expect(body.input).toEqual([
      { role: 'system', content: 'be brief' },
      { role: 'user', content: 'hi' },
    ]);
    expect(body.max_output_tokens).toBe(2000);
    expect(body.reasoning).toEqual({ mode: 'pro' });
    // chat-completions keys must NOT leak in
    expect((body as any).messages).toBeUndefined();
    expect((body as any).max_tokens).toBeUndefined();
    expect((body as any).max_completion_tokens).toBeUndefined();
  });

  it('passes pro-supported efforts through (medium/high/xhigh)', () => {
    for (const effort of ['medium', 'high', 'xhigh'] as const) {
      const body = buildResponsesRequestBody('gpt-5.6-sol', msgs, 1000, {
        reasoningEffort: effort,
      });
      expect(body.reasoning).toEqual({ mode: 'pro', effort });
    }
  });

  it("maps our 'max' alias to xhigh", () => {
    const body = buildResponsesRequestBody('gpt-5.6-sol', msgs, 1000, {
      reasoningEffort: 'max',
    });
    expect(body.reasoning).toEqual({ mode: 'pro', effort: 'xhigh' });
  });

  it('omits efforts pro mode does not accept (none/minimal/low) and unset', () => {
    for (const effort of ['none', 'minimal', 'low', undefined] as const) {
      const body = buildResponsesRequestBody('gpt-5.6-sol', msgs, 1000, {
        reasoningEffort: effort,
      });
      expect(body.reasoning).toEqual({ mode: 'pro' });
    }
  });
});

describe('extractResponsesOutputText', () => {
  it('prefers the output_text convenience field', () => {
    expect(extractResponsesOutputText({ output_text: 'quick answer' })).toBe('quick answer');
  });

  it('walks output[] message items and joins their output_text parts', () => {
    const json = {
      output: [
        { type: 'reasoning', summary: [] },
        {
          type: 'message',
          content: [
            { type: 'output_text', text: 'part one' },
            { type: 'output_text', text: ' part two' },
          ],
        },
      ],
    };
    expect(extractResponsesOutputText(json)).toBe('part one part two');
  });

  it('returns empty string for malformed/empty payloads', () => {
    expect(extractResponsesOutputText({})).toBe('');
    expect(extractResponsesOutputText(null)).toBe('');
    expect(extractResponsesOutputText({ output: [] })).toBe('');
    expect(extractResponsesOutputText({ output: [{ type: 'message', content: [] }] })).toBe('');
  });
});

describe('isGpt6Model', () => {
  it('matches the gpt-6 family case-insensitively and nothing else', () => {
    expect(isGpt6Model('gpt-6-astra')).toBe(true);
    expect(isGpt6Model('GPT-6-ASTRA')).toBe(true);
    expect(isGpt6Model('gpt-5.6-sol')).toBe(false);
    expect(isGpt6Model('o4-mini')).toBe(false);
    expect(isGpt6Model(undefined)).toBe(false);
    expect(isGpt6Model('')).toBe(false);
  });
});

describe('openaiReasoningEffort', () => {
  it('sends nothing when no effort is set', () => {
    expect(openaiReasoningEffort('gpt-6-astra', undefined)).toBeUndefined();
    expect(openaiReasoningEffort('gpt-5.6-sol', '')).toBeUndefined();
  });

  it("honours 'max' on GPT-6 Astra and caps it at 'xhigh' everywhere else", () => {
    expect(openaiReasoningEffort('gpt-6-astra', 'max')).toBe('max');
    expect(openaiReasoningEffort('gpt-5.6-sol', 'max')).toBe('xhigh');
    expect(openaiReasoningEffort('gpt-5.5', 'max')).toBe('xhigh');
    expect(openaiReasoningEffort(undefined, 'max')).toBe('xhigh');
  });

  it("maps none/minimal to 'low' on GPT-6 Astra (Astra 400s on them) and passes them through elsewhere", () => {
    expect(openaiReasoningEffort('gpt-6-astra', 'none')).toBe('low');
    expect(openaiReasoningEffort('gpt-6-astra', 'minimal')).toBe('low');
    expect(openaiReasoningEffort('gpt-5.6-sol', 'none')).toBe('none');
    expect(openaiReasoningEffort('gpt-5.5', 'minimal')).toBe('minimal');
  });

  it('passes the supported tiers through untouched', () => {
    for (const effort of ['low', 'medium', 'high', 'xhigh']) {
      expect(openaiReasoningEffort('gpt-6-astra', effort)).toBe(effort);
      expect(openaiReasoningEffort('gpt-5.6-terra', effort)).toBe(effort);
    }
  });

  it('is what buildChatRequestBody applies to reasoning_effort', () => {
    const msgs = [{ role: 'user' as const, content: 'hi' }];
    expect(buildChatRequestBody('gpt-6-astra', msgs, 100, { reasoningEffort: 'none' }).reasoning_effort).toBe('low');
    expect(buildChatRequestBody('gpt-6-astra', msgs, 100, { reasoningEffort: 'max' }).reasoning_effort).toBe('max');
    expect(buildChatRequestBody('gpt-5.6-sol', msgs, 100, { reasoningEffort: 'max' }).reasoning_effort).toBe('xhigh');
    expect(buildChatRequestBody('gpt-6-astra', msgs, 100, {}).reasoning_effort).toBeUndefined();
  });
});

describe('isOfficialOpenAIEndpoint', () => {
  it('is true for unset and api.openai.com base URLs', () => {
    expect(isOfficialOpenAIEndpoint(undefined)).toBe(true);
    expect(isOfficialOpenAIEndpoint('')).toBe(true);
    expect(isOfficialOpenAIEndpoint('https://api.openai.com/v1')).toBe(true);
    expect(isOfficialOpenAIEndpoint('https://api.openai.com/v1/')).toBe(true);
  });

  it('is false for OpenAI-compatible third parties and local servers', () => {
    expect(isOfficialOpenAIEndpoint('http://localhost:11434/v1')).toBe(false);
    expect(isOfficialOpenAIEndpoint('https://api.moonshot.ai/v1')).toBe(false);
    expect(isOfficialOpenAIEndpoint('https://api.deepseek.com')).toBe(false);
  });
});

describe('buildResponsesToolRequestBody', () => {
  const tools = [
    { name: 'web_search', description: 'Search the web', input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
  ];
  const input = [{ role: 'user', content: 'find something' }];

  it('builds the Responses function-calling shape (flat tools, instructions, input, max_output_tokens)', () => {
    const body = buildResponsesToolRequestBody('gpt-6-astra', 'be helpful', input, tools, 8192);
    expect(body.model).toBe('gpt-6-astra');
    expect(body.instructions).toBe('be helpful');
    expect(body.input).toBe(input);
    expect(body.max_output_tokens).toBe(8192);
    expect(body.tools).toEqual([
      {
        type: 'function',
        name: 'web_search',
        description: 'Search the web',
        parameters: tools[0].input_schema,
        strict: false,
      },
    ]);
    // chat-completions keys and temperature must not leak in
    expect((body as any).messages).toBeUndefined();
    expect((body as any).max_completion_tokens).toBeUndefined();
    expect((body as any).temperature).toBeUndefined();
    expect((body as any).reasoning_effort).toBeUndefined();
    expect(body.reasoning).toBeUndefined();
  });

  it('threads the model-aware effort into reasoning.effort', () => {
    expect(buildResponsesToolRequestBody('gpt-6-astra', 's', input, tools, 100, { reasoningEffort: 'none' }).reasoning)
      .toEqual({ effort: 'low' });
    expect(buildResponsesToolRequestBody('gpt-6-astra', 's', input, tools, 100, { reasoningEffort: 'max' }).reasoning)
      .toEqual({ effort: 'max' });
    expect(buildResponsesToolRequestBody('gpt-5.6-sol', 's', input, tools, 100, { reasoningEffort: 'max' }).reasoning)
      .toEqual({ effort: 'xhigh' });
    expect(buildResponsesToolRequestBody('gpt-5.6-sol', 's', input, tools, 100, { reasoningEffort: 'none' }).reasoning)
      .toEqual({ effort: 'none' });
  });

  it('adds reasoning.mode pro (medium+ efforts only) when asked', () => {
    expect(buildResponsesToolRequestBody('gpt-5.6-sol', 's', input, tools, 100, { proMode: true }).reasoning)
      .toEqual({ mode: 'pro' });
    expect(buildResponsesToolRequestBody('gpt-5.6-sol', 's', input, tools, 100, { proMode: true, reasoningEffort: 'high' }).reasoning)
      .toEqual({ mode: 'pro', effort: 'high' });
    expect(buildResponsesToolRequestBody('gpt-5.6-sol', 's', input, tools, 100, { proMode: true, reasoningEffort: 'low' }).reasoning)
      .toEqual({ mode: 'pro' });
  });
});

describe('extractResponsesFunctionCalls', () => {
  it('lifts function_call items out of output[] and ignores the rest', () => {
    const calls = extractResponsesFunctionCalls({
      output: [
        { type: 'reasoning', id: 'rs_1', summary: [] },
        { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'web_search', arguments: '{"query":"x"}' },
        { type: 'message', id: 'msg_1', role: 'assistant', content: [{ type: 'output_text', text: 'hi' }] },
        { type: 'function_call', id: 'fc_2', call_id: 'call_2', name: 'web_search' }, // no arguments
        { type: 'function_call', name: 'broken' }, // no call_id → skipped
      ],
    });
    expect(calls).toEqual([
      { id: 'fc_1', call_id: 'call_1', name: 'web_search', arguments: '{"query":"x"}' },
      { id: 'fc_2', call_id: 'call_2', name: 'web_search', arguments: '{}' },
    ]);
  });

  it('is empty for text-only results and malformed input', () => {
    expect(extractResponsesFunctionCalls({ output: [{ type: 'message', content: [] }] })).toEqual([]);
    expect(extractResponsesFunctionCalls({})).toEqual([]);
    expect(extractResponsesFunctionCalls(null)).toEqual([]);
  });
});
