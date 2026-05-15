/**
 * Provider quirk helpers for the builder path.
 *
 * The implementations now live in @asaps/core (`providerQuirks.ts`) so the
 * builder path, the in-app runtime (PreviewWindow), and the exported-HTML
 * runtime (player-web's WebAIProvider) all share ONE source of truth. A
 * quirk fix written once in core reaches every path — previously each fix
 * had to be applied three times or it shipped to only one path.
 *
 * This file is kept as a thin re-export so existing
 * `from '.../openai-utils'` imports continue to resolve unchanged.
 */

export {
  requiresMaxCompletionTokens,
  isReasoningModel,
  effectiveMaxTokens,
  stripThinkingBlocks,
  buildChatRequestBody,
} from '@asaps/core';
