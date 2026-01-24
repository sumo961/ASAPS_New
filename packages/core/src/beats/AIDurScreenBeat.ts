import { Beat } from './Beat';
import type { BeatConfig } from '../types';
import type { IRenderer } from '../types';
import { StoryContext } from '../engine/StoryContext';
import { PlayerContextBuilder } from '../utils/PlayerContextBuilder';

export interface AIDurScreenBeatParams {
  /** Prompt/context for AI to generate text */
  prompt: string;

  /** Which variables to include in AI context (optional - defaults to all if includeVariables is true) */
  contextVariables?: string[];

  /** Include player variables in context */
  includeVariables?: boolean;

  /** Include player inventory in context */
  includeInventory?: boolean;

  /** Include visited beats in context */
  includeHistory?: boolean;

  /** Maximum sentences to generate (default: 2) */
  maxSentences?: number;

  /** Fallback text to show if AI is unavailable */
  fallbackText: string;

  /** Reading speed in words per minute (default: 200 - average adult reading speed) */
  wordsPerMinute?: number;

  /** Minimum display duration in milliseconds (default: 2000) */
  minDuration?: number;

  /** Maximum display duration in milliseconds (default: 15000) */
  maxDuration?: number;
}

/**
 * AIDurScreenBeat - Generate contextual text using AI with automatic duration based on reading speed
 *
 * This beat generates short, contextual text and displays it for a calculated duration
 * based on the average reading speed. No user interaction required - it auto-advances.
 *
 * Duration is calculated as: (wordCount / wordsPerMinute) * 60 * 1000 ms
 * Clamped between minDuration and maxDuration.
 */
export class AIDurScreenBeat extends Beat {
  public prompt: string;
  public contextVariables?: string[];
  public includeVariables: boolean;
  public includeInventory: boolean;
  public includeHistory: boolean;
  public maxSentences: number;
  public fallbackText: string;
  public wordsPerMinute: number;
  public minDuration: number;
  public maxDuration: number;

  private generatedText: string | null = null;
  private lastContextHash: string | null = null;

  constructor(config: BeatConfig & {
    parameters?: Partial<AIDurScreenBeatParams>;
  } & Partial<AIDurScreenBeatParams>) {
    super(config);
    const params = config.parameters || {};

    this.prompt = params.prompt || config.prompt || '';
    this.contextVariables = params.contextVariables || config.contextVariables;
    this.includeVariables = params.includeVariables ?? config.includeVariables ?? true;
    this.includeInventory = params.includeInventory ?? config.includeInventory ?? false;
    this.includeHistory = params.includeHistory ?? config.includeHistory ?? false;
    this.maxSentences = params.maxSentences || config.maxSentences || 2;
    this.fallbackText = params.fallbackText || config.fallbackText || 'Continue...';
    this.wordsPerMinute = params.wordsPerMinute || config.wordsPerMinute || 200;
    this.minDuration = params.minDuration || config.minDuration || 2000;
    this.maxDuration = params.maxDuration || config.maxDuration || 15000;
  }

  getParameters(): Record<string, any> {
    return {
      prompt: this.prompt,
      contextVariables: this.contextVariables,
      includeVariables: this.includeVariables,
      includeInventory: this.includeInventory,
      includeHistory: this.includeHistory,
      maxSentences: this.maxSentences,
      fallbackText: this.fallbackText,
      wordsPerMinute: this.wordsPerMinute,
      minDuration: this.minDuration,
      maxDuration: this.maxDuration,
    };
  }

  updateParameters(params: Record<string, any>): void {
    if (params.prompt !== undefined) this.prompt = params.prompt;
    if (params.contextVariables !== undefined) this.contextVariables = params.contextVariables;
    if (params.includeVariables !== undefined) this.includeVariables = params.includeVariables;
    if (params.includeInventory !== undefined) this.includeInventory = params.includeInventory;
    if (params.includeHistory !== undefined) this.includeHistory = params.includeHistory;
    if (params.maxSentences !== undefined) this.maxSentences = params.maxSentences;
    if (params.fallbackText !== undefined) this.fallbackText = params.fallbackText;
    if (params.wordsPerMinute !== undefined) this.wordsPerMinute = params.wordsPerMinute;
    if (params.minDuration !== undefined) this.minDuration = params.minDuration;
    if (params.maxDuration !== undefined) this.maxDuration = params.maxDuration;
  }

  /**
   * Calculate reading duration based on word count and reading speed
   */
  private calculateDuration(text: string): number {
    // Count words (split by whitespace)
    const wordCount = text.trim().split(/\s+/).filter(w => w.length > 0).length;

    // Calculate duration: (words / wordsPerMinute) * 60 seconds * 1000 ms
    const calculatedDuration = (wordCount / this.wordsPerMinute) * 60 * 1000;

    // Clamp between min and max
    return Math.max(this.minDuration, Math.min(this.maxDuration, calculatedDuration));
  }

  protected async performAction(
    context: StoryContext,
    renderer: IRenderer
  ): Promise<string | null> {
    const locations = Array.from(this.locations.values());

    // Check if AI service is available
    const aiService = renderer.getState('aiService');
    if (!aiService || typeof aiService.generateContent !== 'function') {
      console.warn(`[AIDurScreenBeat ${this.id}] AI service not configured, using fallback`);
      const processedFallback = this.processText(this.fallbackText, context);
      const duration = this.calculateDuration(processedFallback);
      await renderer.renderDurScreen(processedFallback, duration, locations);
      return this.getNextBeat(context);
    }

    try {
      // Create a hash of key context to detect if we need to regenerate
      const contextHash = this.createContextHash(context);
      const needsRegeneration = !this.generatedText || this.lastContextHash !== contextHash;

      if (needsRegeneration) {
        // Clear previous generation
        this.generatedText = null;

        // Show loading indicator
        if (renderer.renderLoading) {
          renderer.renderLoading('Thinking...', {
            subMessage: 'Generating response',
            spinnerType: 'dots',
          });
        }

        // Generate new text
        this.generatedText = await this.generateText(context, aiService);
        this.lastContextHash = contextHash;
      }

      // Render the generated text
      const displayText = this.generatedText || this.fallbackText;
      const processedText = this.processText(displayText, context);
      const duration = this.calculateDuration(processedText);

      console.log(`[AIDurScreenBeat ${this.id}] Displaying for ${duration}ms (${processedText.split(/\s+/).length} words at ${this.wordsPerMinute} WPM)`);

      await renderer.renderDurScreen(processedText, duration, locations);
      return this.getNextBeat(context);

    } catch (error) {
      console.error(`[AIDurScreenBeat ${this.id}] Error:`, error);
      const processedFallback = this.processText(this.fallbackText, context);
      const duration = this.calculateDuration(processedFallback);
      await renderer.renderDurScreen(processedFallback, duration, locations);
      return this.getNextBeat(context);
    }
  }

  /**
   * Create a hash of key context values to detect if we need to regenerate
   */
  private createContextHash(context: StoryContext): string {
    const variables = context.getVariables();
    const counters = context.getCounters();

    const keyValues: string[] = [];

    // Include the prompt itself
    keyValues.push(this.prompt);

    // Include specified context variables or all variables
    if (this.contextVariables && this.contextVariables.length > 0) {
      for (const varName of this.contextVariables) {
        if (variables[varName] !== undefined) {
          keyValues.push(`${varName}:${String(variables[varName])}`);
        }
      }
    } else if (this.includeVariables) {
      for (const [key, value] of Object.entries(variables)) {
        keyValues.push(`${key}:${String(value)}`);
      }
    }

    // Include counters
    for (const [key, value] of Object.entries(counters)) {
      keyValues.push(`counter:${key}:${value}`);
    }

    return keyValues.join('|');
  }

  /**
   * Generate text using AI
   */
  private async generateText(context: StoryContext, aiService: any): Promise<string> {
    // Build player context
    const story = context.getStory();
    const contextBuilder = new PlayerContextBuilder(context, story);

    // Filter variables if contextVariables is specified
    let filteredContext: string;
    if (this.contextVariables && this.contextVariables.length > 0) {
      const variables = context.getVariables();
      const filtered: Record<string, any> = {};
      for (const varName of this.contextVariables) {
        if (variables[varName] !== undefined) {
          filtered[varName] = variables[varName];
        }
      }
      filteredContext = `Variables: ${JSON.stringify(filtered)}`;
      if (this.includeInventory) {
        filteredContext += '\n' + contextBuilder.buildPromptContext({
          includeVariables: false,
          includeInventory: true,
          includeHistory: this.includeHistory,
        });
      }
    } else {
      filteredContext = contextBuilder.buildPromptContext({
        includeVariables: this.includeVariables,
        includeInventory: this.includeInventory,
        includeHistory: this.includeHistory,
      });
    }

    // Build the generation prompt
    const prompt = `Generate a short text response (${this.maxSentences} sentence${this.maxSentences > 1 ? 's' : ''} maximum) for the following situation:

CONTEXT: ${this.prompt}

PLAYER STATE:
${filteredContext}

REQUIREMENTS:
1. Write exactly ${this.maxSentences} sentence${this.maxSentences > 1 ? 's' : ''} or fewer
2. Personalize the text based on the player's state (use their name, reference their situation)
3. Keep the tone appropriate to the context
4. Be concise and engaging

Return ONLY the generated text, no JSON or additional formatting.`;

    console.log(`[AIDurScreenBeat ${this.id}] Generating text...`);

    const response = await aiService.generateContent(prompt, {
      maxTokens: 150, // Keep response short
    });

    // Clean up the response (generateContent returns a string directly)
    let text = typeof response === 'string' ? response : '';

    // Remove any markdown or quotes
    text = text.replace(/^["']|["']$/g, '').trim();
    text = text.replace(/^#+\s*/gm, '').trim();

    return text || this.fallbackText;
  }
}
