/**
 * Shared utilities for OpenAI API requests
 * Used by both OpenAIProvider and StoryPreview's AI adapter
 */

/**
 * Check if a model requires max_completion_tokens instead of max_tokens
 * Modern OpenAI models (GPT-4o, o1, o3, GPT-5) require the newer parameter
 */
export function requiresMaxCompletionTokens(model: string): boolean {
  const m = model.toLowerCase();
  // GPT-5 series
  if (m.startsWith('gpt-5')) return true;
  // GPT-4o series (gpt-4o, gpt-4o-mini, etc.)
  if (m.includes('gpt-4o')) return true;
  // o1 series (o1, o1-mini, o1-preview)
  if (m.startsWith('o1')) return true;
  // o3 series
  if (m.startsWith('o3')) return true;
  // o4 series (future-proofing)
  if (m.startsWith('o4')) return true;
  // Default: use max_tokens for older/third-party models
  return false;
}

/**
 * Check if a model is a reasoning model that doesn't support temperature
 */
export function isReasoningModel(model: string, reasoningEffort?: string): boolean {
  const m = model.toLowerCase();
  return m.startsWith('o1') ||
         m.startsWith('o3') ||
         m.startsWith('gpt-5') ||
         !!reasoningEffort;
}

/**
 * Build a chat completion request body with correct parameters for the model
 */
export function buildChatRequestBody(
  model: string,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  maxTokens: number,
  options?: {
    temperature?: number;
    reasoningEffort?: string;
    responseFormat?: { type: string };
  }
): Record<string, any> {
  const body: Record<string, any> = {
    model,
    messages,
  };

  // Use correct token parameter based on model
  if (requiresMaxCompletionTokens(model)) {
    body.max_completion_tokens = maxTokens;
  } else {
    body.max_tokens = maxTokens;
  }

  // Add response format if specified
  if (options?.responseFormat) {
    body.response_format = options.responseFormat;
  }

  // Add reasoning effort for models that support it
  if (options?.reasoningEffort !== undefined) {
    body.reasoning_effort = options.reasoningEffort;
  }

  // Temperature is not supported by reasoning models
  if (!isReasoningModel(model, options?.reasoningEffort) && options?.temperature !== undefined) {
    body.temperature = options.temperature;
  }

  return body;
}
