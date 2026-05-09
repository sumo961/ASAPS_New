/**
 * Prompt synthesis — turn an Ideator transcript into a StoryGenerationRequest
 * via a single Claude call using the synthesis system prompt.
 */

import type { StoryGenerationRequest } from '../../../types/ai';
import { getAIService } from '../../../services';
import { buildSynthesisSystemPrompt } from './systemPrompt';
import type { IdeatorMessage } from './types';

export interface SynthesisResult {
  request: StoryGenerationRequest;
  /** Raw JSON the model returned, for debugging. */
  raw: string;
}

/**
 * Extract the JSON object from the model response. The synthesis system
 * prompt asks for plain JSON but we defensively strip markdown code fences
 * that smaller models sometimes add anyway.
 */
function extractJson(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

function validate(parsed: any): StoryGenerationRequest {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Synthesis response was not an object');
  }
  if (typeof parsed.prompt !== 'string' || parsed.prompt.trim().length === 0) {
    throw new Error('Synthesis response is missing a non-empty "prompt" field');
  }

  const req: StoryGenerationRequest = {
    prompt: parsed.prompt.trim(),
  };

  if (typeof parsed.genre === 'string' && parsed.genre.trim().length > 0) {
    req.genre = parsed.genre.trim();
  }
  if (parsed.length === 'short' || parsed.length === 'medium' || parsed.length === 'long') {
    req.length = parsed.length;
  }
  if (
    parsed.complexity === 'linear' ||
    parsed.complexity === 'moderate' ||
    parsed.complexity === 'complex'
  ) {
    req.complexity = parsed.complexity;
  }
  if (typeof parsed.includeAIBeats === 'boolean') {
    req.includeAIBeats = parsed.includeAIBeats;
  }

  return req;
}

export async function synthesizeStoryRequest(
  transcript: IdeatorMessage[]
): Promise<SynthesisResult> {
  const aiService = getAIService();
  if (!aiService.isReady()) {
    throw new Error('AI service is not configured — open AI settings first');
  }

  const system = buildSynthesisSystemPrompt();
  // tool_use chips are UI artifacts — they would just be empty assistant
  // turns from the model's perspective. Filter them out before synthesis.
  const messages = transcript
    .filter(m => m.kind !== 'tool_use')
    .map(m => ({
      role: m.role,
      content: m.content,
    }));

  // The transcript on its own is not a user turn in a chat sense, so we
  // wrap it into one explicit message the synthesis prompt can operate on.
  const wrapped = [
    {
      role: 'user' as const,
      content:
        'Here is the full ideation transcript. Produce the JSON object now:\n\n' +
        messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n'),
    },
  ];

  // Synthesis emits a JSON object whose `prompt` field is 2–6 paragraphs
  // of natural language, so the default 1000-token chat-turn cap is too
  // small and causes mid-string truncation. Give it room to breathe.
  const { text } = await aiService.generateConversationTurn({
    systemPrompt: system,
    messages: wrapped,
    maxTokens: 4000,
  });

  const json = extractJson(text);
  let parsed: any;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new Error(
      `Synthesis returned invalid JSON: ${(err as Error).message}\nRaw: ${text}`
    );
  }

  const request = validate(parsed);
  return { request, raw: text };
}
