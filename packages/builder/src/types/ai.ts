/**
 * AI Integration Types
 *
 * Type definitions for the AI-assisted story creation system
 */

import type { BeatConfig, Connection } from '@asaps/core';

/**
 * AI Provider configuration
 */
export interface AIProviderConfig {
  /** Provider name (claude, openai, custom) */
  provider: 'claude' | 'openai' | 'custom';

  /** API key for the provider */
  apiKey: string;

  /** Model identifier */
  model?: string;

  /** Temperature (creativity) - 0.0 to 1.0 */
  temperature?: number;

  /** Maximum tokens to generate */
  maxTokens?: number;

  /** Custom provider endpoint (for custom providers) */
  endpoint?: string;
}

/**
 * Story generation request
 */
export interface StoryGenerationRequest {
  /** User prompt describing the story */
  prompt: string;

  /** Story genre (optional) */
  genre?: string;

  /** Desired story length */
  length?: 'short' | 'medium' | 'long';

  /** Branching complexity */
  complexity?: 'linear' | 'moderate' | 'complex';

  /** Additional context or requirements */
  context?: string;
}

/**
 * Story generation response
 */
export interface StoryGenerationResponse {
  /** Generated story metadata */
  metadata: {
    title: string;
    author: string;
    description?: string;
    genre?: string;
  };

  /** Generated beats */
  beats: GeneratedBeat[];

  /** Variables to track */
  variables?: Array<{
    name: string;
    initialValue: any;
    description: string;
  }>;

  /** Characters in the story */
  characters?: Array<{
    id: string;
    name: string;
    description: string;
  }>;

  /** Reasoning behind generation choices */
  reasoning?: string;
}

/**
 * Generated beat structure
 */
export interface GeneratedBeat {
  /** Beat identifier (will be reassigned) */
  id: string;

  /** Display name */
  name: string;

  /** Beat type (must match schema) */
  type: string;

  /** Canvas position */
  position: { x: number; y: number };

  /** Beat parameters (schema-validated) */
  parameters: Record<string, any>;

  /** Connections to other beats */
  connections: Connection[];

  /** Optional cluster assignment */
  cluster?: string;
}

/**
 * Dialog generation request
 */
export interface DialogGenerationRequest {
  /** Character speaking */
  character?: string;

  /** Scene context */
  scene: string;

  /** Goal of the conversation */
  goal?: string;

  /** Number of choices/branches */
  branchingFactor?: number;

  /** Current story context */
  storyContext?: {
    title: string;
    existingBeats: BeatConfig[];
    variables: string[];
    characters: string[];
  };
}

/**
 * Dialog generation response
 */
export interface DialogGenerationResponse {
  /** Root dialog node */
  dialogTree: DialogNode;

  /** Reasoning for dialog structure */
  reasoning?: string;
}

/**
 * Dialog tree node structure
 */
export interface DialogNode {
  /** Node ID */
  id: string;

  /** Speaker name */
  speaker?: string;

  /** Dialog text */
  text: string;

  /** Speaker emotion */
  emotion?: 'neutral' | 'happy' | 'angry' | 'sad' | 'surprised' | 'fearful';

  /** Player choices */
  choices?: Array<{
    id: string;
    text: string;
    target: string | DialogNode;  // Beat ID or nested dialog
    conditions?: any[];
    effects?: any[];
  }>;

  /** Next node (for linear conversations) */
  next?: string | DialogNode;
}

/**
 * Beat suggestion request
 */
export interface BeatSuggestionRequest {
  /** Current beat context */
  currentBeat: BeatConfig;

  /** All existing beats */
  existingBeats: BeatConfig[];

  /** Story metadata */
  storyMetadata?: {
    title: string;
    genre?: string;
  };

  /** Number of suggestions to generate */
  count?: number;
}

/**
 * Beat suggestion response
 */
export interface BeatSuggestionResponse {
  /** List of suggested beats */
  suggestions: BeatSuggestion[];
}

/**
 * Individual beat suggestion
 */
export interface BeatSuggestion {
  /** Suggested beat type */
  beatType: string;

  /** Human-readable name */
  name: string;

  /** Why this beat makes sense */
  reasoning: string;

  /** Pre-filled parameters */
  parameters: Record<string, any>;

  /** Suggested connections */
  connections: Connection[];

  /** Confidence score (0-1) */
  confidence: number;

  /** Suggested position */
  position?: { x: number; y: number };
}

/**
 * Natural language beat creation request
 */
export interface NaturalLanguageBeatRequest {
  /** Natural language description */
  description: string;

  /** Context from current story */
  storyContext?: {
    title: string;
    existingBeats: BeatConfig[];
    currentPosition?: { x: number; y: number };
  };
}

/**
 * Natural language beat creation response
 */
export interface NaturalLanguageBeatResponse {
  /** Generated beat configuration */
  beat: GeneratedBeat;

  /** Interpretation of the user's request */
  interpretation: string;
}

/**
 * AI validation result
 */
export interface AIValidationResult {
  /** Whether the generated content is valid */
  valid: boolean;

  /** Validation errors */
  errors: Array<{
    path: string;
    message: string;
    severity: 'error' | 'warning';
  }>;

  /** Warnings (non-fatal issues) */
  warnings?: string[];
}

/**
 * AI provider interface
 */
export interface IAIProvider {
  /** Provider name */
  readonly name: string;

  /** Configure the provider */
  configure(config: AIProviderConfig): void;

  /** Generate complete story */
  generateStory(request: StoryGenerationRequest): Promise<StoryGenerationResponse>;

  /** Generate dialog tree */
  generateDialog(request: DialogGenerationRequest): Promise<DialogGenerationResponse>;

  /** Suggest next beats */
  suggestBeats(request: BeatSuggestionRequest): Promise<BeatSuggestionResponse>;

  /** Create beat from natural language */
  createBeatFromNL(request: NaturalLanguageBeatRequest): Promise<NaturalLanguageBeatResponse>;

  /** Check if provider is configured and ready */
  isReady(): boolean;
}

/**
 * AI service options
 */
export interface AIServiceOptions {
  /** Default provider to use */
  defaultProvider?: 'claude' | 'openai' | 'custom';

  /** Provider configurations */
  providers?: {
    claude?: AIProviderConfig;
    openai?: AIProviderConfig;
    custom?: AIProviderConfig;
  };

  /** Enable schema validation */
  validateSchema?: boolean;

  /** Retry failed requests */
  retryOnError?: boolean;

  /** Number of retries */
  maxRetries?: number;
}
