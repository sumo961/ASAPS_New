/**
 * Reply shapes the runtime AI beats ask for. Providers with structured
 * outputs (Claude, OpenAI) enforce them; the prompts still describe the same
 * shape for everyone else.
 */

/** AI Info Text / AI Duration Screen: the text, plus variable ideas for the author. */
export const TEXT_WITH_SUGGESTIONS_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    text: { type: 'string' },
    suggestions: { type: 'array', items: { type: 'string' } },
  },
  required: ['text', 'suggestions'],
  additionalProperties: false,
};
