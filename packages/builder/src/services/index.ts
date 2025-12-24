/**
 * Services Exports
 *
 * Central export point for all services
 */

// Main services
export { AIService, getAIService, resetAIService } from './AIService';
export { AIValidator, getAIValidator } from './AIValidator';
export { ThemeService, getThemeService, initThemeService } from './ThemeService';

// Provider base and implementations
export { BaseAIProvider } from './providers/IProvider';
export { ClaudeProvider } from './providers/ClaudeProvider';
export { OpenAIProvider } from './providers/OpenAIProvider';

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
