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

  /**
   * Reasoning effort for GPT-5 class reasoning models.
   * Supported values vary by model; gpt-5.2 defaults to 'none'.
   */
  reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

  /** Custom base URL for API-compatible providers (e.g., ANTHROPIC_BASE_URL) */
  baseUrl?: string;

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

  /** Include AI-powered beats (onlineContent, aiCondition, aiDialogTree, aiSummary) */
  includeAIBeats?: boolean;

  /** Target languages for the generated story (e.g., ["en", "de", "fr"]) */
  languages?: string[];

  /**
   * How much of the rich-character / affect system the generated story
   * should use. Defaults to 'auto' — the AI reads the user prompt and
   * picks a tier itself. Force a tier when you want explicit control.
   *
   *   - 'sparse': characters as speakers, no mood / traits / goals;
   *     classic Condition operators only. Lean output.
   *   - 'standard': mood seeds on major characters, affect Effects on
   *     emotionally salient choices, mood/sentiment Conditions on
   *     branches. No traits/variants unless prompted.
   *   - 'rich': full deployment — traits, goals, variants, dossier
   *     reflection policy on evolving characters, effect templates,
   *     baseline-relative conditions, bookmarks at act breaks.
   *
   * See packages/core/src/prompts/affectPrompt.ts for the canonical
   * tier definitions and AI-facing guidance.
   */
  affectDepth?: 'auto' | 'sparse' | 'standard' | 'rich';

  /**
   * Optional AbortSignal — providers thread this into their fetch calls
   * so the user can cancel an in-flight generation. AIService also
   * checks the signal between retry attempts and bails out instead of
   * continuing the loop.
   */
  signal?: AbortSignal;
}

/**
 * Suggested theme for a generated story
 */
export interface SuggestedTheme {
  /** Theme ID (builtin-visual-novel, builtin-twine, builtin-point-and-click) */
  themeId: string;
  /** Reason for the recommendation */
  reason: string;
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

  /** Suggested theme based on genre and story style */
  suggestedTheme?: SuggestedTheme;

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

// ============================================================================
// Conversation Turn Types (for AIConversationBeat)
// ============================================================================

/**
 * Request to generate a single conversation turn
 */
export interface ConversationTurnRequest {
  /** System prompt with scenario, NPC personality, directions */
  systemPrompt: string;

  /** Conversation history as messages */
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
}

/**
 * Response from generating a conversation turn
 */
export interface ConversationTurnResponse {
  /** The NPC's response text */
  text: string;
}

// ============================================================================
// Helper Command Types (for AI-powered bulk operations)
// ============================================================================

// Re-export helper command types for convenience
export type {
  StructuredAction,
  ElementSelector,
  Modification,
  HelperCommandRequest,
  HelperCommandResponse,
  HelperCommandContext,
  TextTransform,
} from './helperCommand';

/**
 * Text transformation request for AI-powered text changes
 */
export interface TextTransformationRequest {
  /** Original text to transform */
  originalText: string;

  /** Transformation to apply */
  transform: {
    /** Primary text/name to find */
    find: string;
    /** Primary replacement text */
    replace: string;
    /** Additional find/replace pairs */
    additionalReplacements?: Array<{
      find: string;
      replace: string;
    }>;
    /** Whether to adjust pronouns */
    adjustPronouns: boolean;
    /**
     * Whether to adapt surrounding context semantically.
     * When true, the AI should analyze and transform related terms
     * (e.g., "blacksmith" → "jeweler" would also change "forge" → "workshop", "sword" → "jewelry")
     */
    adaptContext?: boolean;
  };

  /** Context about the text */
  context?: {
    /** Type of text (dialog, narration, button, etc.) */
    textType: string;
    /** Speaker name if applicable */
    speaker?: string;
  };
}

/**
 * Text transformation response
 */
export interface TextTransformationResponse {
  /** Transformed text */
  transformedText: string;

  /** Changes made */
  changes: Array<{
    original: string;
    replacement: string;
    reason: string;
  }>;
}
