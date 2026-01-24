import { Beat } from './Beat';
import type { BeatConfig } from '../types';
import type { IRenderer } from '../types';
import { StoryContext } from '../engine/StoryContext';
import { PlayerContextBuilder } from '../utils/PlayerContextBuilder';

export interface AIInfoTextBeatParams {
  /** Prompt/context for AI to generate text (e.g., "A merchant's reply when the player can't afford the item") */
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

  /** Continue button text */
  buttonText?: string;
}

/**
 * AIInfoTextBeat - Generate contextual 1-2 sentence info text using AI at runtime
 *
 * This beat generates short, contextual text based on:
 * - The prompt describing what kind of text is needed
 * - Player's current state (variables, inventory, history)
 *
 * The AI creates personalized text that references the player's situation.
 */
export class AIInfoTextBeat extends Beat {
  public prompt: string;
  public contextVariables?: string[];
  public includeVariables: boolean;
  public includeInventory: boolean;
  public includeHistory: boolean;
  public maxSentences: number;
  public fallbackText: string;
  public buttonText: string;

  private generatedText: string | null = null;
  private lastContextHash: string | null = null;

  constructor(config: BeatConfig & {
    parameters?: Partial<AIInfoTextBeatParams>;
  } & Partial<AIInfoTextBeatParams>) {
    super(config);
    const params = config.parameters || {};

    this.prompt = params.prompt || config.prompt || '';
    this.contextVariables = params.contextVariables || config.contextVariables;
    this.includeVariables = params.includeVariables ?? config.includeVariables ?? true;
    this.includeInventory = params.includeInventory ?? config.includeInventory ?? false;
    this.includeHistory = params.includeHistory ?? config.includeHistory ?? false;
    this.maxSentences = params.maxSentences || config.maxSentences || 2;
    this.fallbackText = params.fallbackText || config.fallbackText || 'Continue...';
    this.buttonText = params.buttonText || config.buttonText || 'Continue';
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
      buttonText: this.buttonText,
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
    if (params.buttonText !== undefined) this.buttonText = params.buttonText;
  }

  protected async performAction(
    context: StoryContext,
    renderer: IRenderer
  ): Promise<string | null> {
    const locations = Array.from(this.locations.values());

    // Check if AI service is available
    const aiService = renderer.getState('aiService');
    if (!aiService || typeof aiService.generateText !== 'function') {
      console.warn(`[AIInfoTextBeat ${this.id}] AI service not configured, using fallback`);
      const processedFallback = this.processText(this.fallbackText, context);
      await renderer.renderText(processedFallback, this.buttonText, locations);
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
      await renderer.renderText(processedText, this.buttonText, locations);
      return this.getNextBeat(context);

    } catch (error) {
      console.error(`[AIInfoTextBeat ${this.id}] Error:`, error);
      const processedFallback = this.processText(this.fallbackText, context);
      await renderer.renderText(processedFallback, this.buttonText, locations);
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

    console.log(`[AIInfoTextBeat ${this.id}] Generating text...`);

    const response = await aiService.generateText({
      prompt,
      maxTokens: 100, // Keep response short
      temperature: 0.7,
    });

    // Clean up the response
    let text = typeof response === 'string' ? response : response.text || response.content || '';

    // Remove any markdown or quotes
    text = text.replace(/^["']|["']$/g, '').trim();
    text = text.replace(/^#+\s*/gm, '').trim();

    return text || this.fallbackText;
  }
}
