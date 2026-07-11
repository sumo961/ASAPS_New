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
} from '../../src/ai/providerQuirks';

describe('requiresMaxCompletionTokens', () => {
  describe('returns true for the documented families', () => {
    it('gpt-5 family', () => {
      expect(requiresMaxCompletionTokens('gpt-5')).toBe(true);
      expect(requiresMaxCompletionTokens('gpt-5-turbo')).toBe(true);
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
