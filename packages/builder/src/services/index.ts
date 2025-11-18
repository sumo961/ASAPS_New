/**
 * AI Services Exports
 *
 * Central export point for all AI services
 */

// Main services
export { AIService, getAIService, resetAIService } from './AIService';
export { AIValidator, getAIValidator } from './AIValidator';

// Provider base
export { BaseAIProvider } from './providers/IProvider';

// Types
export type {
  IAIProvider,
  AIProviderConfig,
  AIServiceOptions,
  StoryGenerationRequest,
  StoryGenerationResponse,
  DialogGenerationRequest,
  DialogGenerationResponse,
  BeatSuggestionRequest,
  BeatSuggestionResponse,
  NaturalLanguageBeatRequest,
  NaturalLanguageBeatResponse,
  GeneratedBeat,
  DialogNode,
  BeatSuggestion,
  AIValidationResult
} from '../types/ai';

// Prompt templates
export * as StoryPrompts from './prompts/storyGeneration';
export * as DialogPrompts from './prompts/dialogGeneration';
export * as BeatSuggestionsPrompts from './prompts/beatSuggestions';
