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

  /** Include counters in context */
  includeCounters?: boolean;

  /** Include rich choice history in context */
  includeChoiceHistory?: boolean;

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
  public includeCounters: boolean;
  public includeChoiceHistory: boolean;
  public maxSentences: number;
  public fallbackText: string;
  public wordsPerMinute: number;
  public minDuration: number;
  public maxDuration: number;

  private generatedText: string | null = null;
  private lastContextHash: string | null = null;
  private _aiSuggestions: string[] = [];

  /** Get AI suggestions for improving the beat (e.g., missing variables) */
  public get aiSuggestions(): string[] {
    return this._aiSuggestions;
  }

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
    this.includeCounters = params.includeCounters ?? config.includeCounters ?? true;
    this.includeChoiceHistory = params.includeChoiceHistory ?? config.includeChoiceHistory ?? true;
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
      includeCounters: this.includeCounters,
      includeChoiceHistory: this.includeChoiceHistory,
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
    if (params.includeCounters !== undefined) this.includeCounters = params.includeCounters;
    if (params.includeChoiceHistory !== undefined) this.includeChoiceHistory = params.includeChoiceHistory;
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
        this.generatedText = await this.generateText(context, aiService, renderer);
        this.lastContextHash = contextHash;

        // Store suggestions in renderer state for preview to display
        if (this._aiSuggestions.length > 0) {
          renderer.setState('aiSuggestions', {
            beatId: this.id,
            beatName: this.name || this.id,
            suggestions: this._aiSuggestions,
          });
        }
      }

      // Record AI output for session logging
      if (this.generatedText) {
        context.recordAIOutput({
          beatId: this.id,
          beatName: this.name || this.id,
          beatType: 'aiDurScreen',
          text: this.generatedText,
        });
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
   * Prefetch AI content in the background so it's cached when the beat executes.
   * Called by StoryEngine when this beat is the next beat to be executed.
   * Does NOT render anything - only generates and caches text.
   */
  async prefetch(context: StoryContext, renderer: IRenderer): Promise<void> {
    try {
      const aiService = renderer.getState('aiService');
      if (!aiService || typeof aiService.generateContent !== 'function') return;

      const contextHash = this.createContextHash(context);
      if (this.generatedText && this.lastContextHash === contextHash) return; // already cached

      console.log(`[AIDurScreenBeat ${this.id}] Prefetching content...`);
      this.generatedText = await this.generateText(context, aiService, renderer);
      this.lastContextHash = contextHash;
      console.log(`[AIDurScreenBeat ${this.id}] Prefetch complete`);
    } catch (err) {
      // Prefetch failure is non-fatal - will retry on execute
      console.log(`[AIDurScreenBeat ${this.id}] Prefetch failed (will retry on execute):`, err);
    }
  }

  /**
   * Create a hash of key context values to detect if we need to regenerate
   */
  private createContextHash(context: StoryContext): string {
    const variables = context.getVariables();
    const counters = context.getCounters();
    const inventory = context.getInventory();
    const visitedBeats = context.getVisitedBeats();

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

    // Include counters if enabled
    if (this.includeCounters) {
      for (const [key, value] of Object.entries(counters)) {
        keyValues.push(`counter:${key}:${value}`);
      }
    }

    // Include inventory if enabled
    if (this.includeInventory && inventory.length > 0) {
      keyValues.push(`inventory:${inventory.sort().join(',')}`);
    }

    // Include history if enabled
    if (this.includeHistory && visitedBeats.length > 0) {
      keyValues.push(`history:${visitedBeats.join(',')}`);
    }

    // Include choice history if enabled
    if (this.includeChoiceHistory) {
      const choiceHistory = context.getChoiceHistory();
      if (choiceHistory.length > 0) {
        const choiceKeys = choiceHistory.map(c => `${c.beatId}:${c.choiceText}`);
        keyValues.push(`choices:${choiceKeys.join(',')}`);
      }
    }

    return keyValues.join('|');
  }

  /**
   * Generate text using AI
   */
  private async generateText(context: StoryContext, aiService: any, renderer?: any): Promise<string> {
    // Build player context
    const story = context.getStory();
    const contextBuilder = new PlayerContextBuilder(context, story);

    // Get story context from renderer state (if available)
    const storyContext = renderer?.getState?.('storyContext') || {};
    const storyTitle = storyContext.title || story?.getMetadata?.()?.title || 'Interactive Story';
    const storyAuthor = storyContext.author || story?.getMetadata?.()?.author || '';
    const characters = storyContext.characters || [];

    // Build story context section for prompt
    let storyContextSection = `STORY: "${storyTitle}"`;
    if (storyAuthor) {
      storyContextSection += ` by ${storyAuthor}`;
    }
    if (characters.length > 0) {
      const charDescriptions = characters
        .filter((c: any) => c.name && c.name !== 'player')
        .map((c: any) => {
          let desc = c.name;
          if (c.role) desc += ` (${c.role})`;
          if (c.description) desc += `: ${c.description}`;
          return desc;
        })
        .join('; ');
      if (charDescriptions) {
        storyContextSection += `\nCHARACTERS: ${charDescriptions}`;
      }
    }

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
      if (this.includeInventory || this.includeCounters || this.includeChoiceHistory) {
        filteredContext += '\n' + contextBuilder.buildPromptContext({
          includeVariables: false,
          includeInventory: this.includeInventory,
          includeHistory: this.includeHistory,
          includeCounters: this.includeCounters,
          includeChoiceHistory: this.includeChoiceHistory,
        });
      }
    } else {
      filteredContext = contextBuilder.buildPromptContext({
        includeVariables: this.includeVariables,
        includeInventory: this.includeInventory,
        includeHistory: this.includeHistory,
        includeCounters: this.includeCounters,
        includeChoiceHistory: this.includeChoiceHistory,
      });
    }

    // Build list of available data for AI
    const variables = context.getVariables();
    const counters = context.getCounters();
    const inventory = context.getInventory();

    const availableData: string[] = [];
    if (this.includeVariables && Object.keys(variables).length > 0) {
      availableData.push(`Variables: ${Object.keys(variables).join(', ')}`);
    }
    if (this.includeCounters && Object.keys(counters).length > 0) {
      availableData.push(`Counters: ${Object.keys(counters).join(', ')}`);
    }
    if (this.includeInventory && inventory.length > 0) {
      availableData.push(`Inventory items: ${inventory.join(', ')}`);
    }

    const dataAvailability = availableData.length > 0
      ? `AVAILABLE DATA (you may reference these):\n${availableData.join('\n')}`
      : 'AVAILABLE DATA: None - no player variables, counters, or inventory items exist yet.';

    // Build the generation prompt
    const prompt = `Generate a short text response (${this.maxSentences} sentence${this.maxSentences > 1 ? 's' : ''} maximum) for the following situation:

${storyContextSection}

SCENE CONTEXT: ${this.prompt}

PLAYER STATE:
${filteredContext}

${dataAvailability}

CRITICAL REQUIREMENTS:
1. Write exactly ${this.maxSentences} sentence${this.maxSentences > 1 ? 's' : ''} or fewer
2. ONLY reference data that exists in PLAYER STATE above
3. Do NOT use placeholders like [Player Name], [Location], etc.
4. Do NOT reference variables, names, or data that are not explicitly listed above
5. Do NOT reference internal beat names, story structure, or technical terms (e.g., "Title Screen", "beat_3", "DialogTree")
6. Use player-friendly language: say "beginning" not "title screen", "conversation" not "dialog tree", "choice" not "movement beat"
7. Write as if speaking directly to the player immersed in the story, not describing the game system
8. If no personalization data is available, write engaging generic text
9. Keep the tone appropriate to the context
10. Be concise and engaging

Return a JSON object with this exact format:
{
  "text": "Your generated text here",
  "suggestions": ["suggestion 1", "suggestion 2"]
}

The "suggestions" array should contain ideas for story variables that would improve personalization (e.g., "Add a 'playerName' variable for personalized greetings"). Leave empty if no suggestions.`;

    console.log(`[AIDurScreenBeat ${this.id}] Generating text...`);

    const response = await aiService.generateContent(prompt, {
      maxTokens: 250, // Increased for JSON response
    });

    // Parse the response (could be JSON or plain text)
    const rawResponse = typeof response === 'string' ? response : '';
    let text = '';
    this._aiSuggestions = [];

    try {
      // Try to extract JSON from response (may be wrapped in markdown code blocks)
      const jsonMatch = rawResponse.match(/\{[\s\S]*"text"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        text = parsed.text || '';
        if (Array.isArray(parsed.suggestions)) {
          this._aiSuggestions = parsed.suggestions.filter((s: unknown) => typeof s === 'string' && s.trim());
        }
        console.log(`[AIDurScreenBeat ${this.id}] Parsed JSON response, suggestions:`, this._aiSuggestions);
      } else {
        // Fallback to plain text
        text = rawResponse;
      }
    } catch {
      // JSON parse failed, use raw response as text
      console.warn(`[AIDurScreenBeat ${this.id}] Failed to parse JSON, using raw response`);
      text = rawResponse;
    }

    // Clean up the text
    text = text.replace(/^["']|["']$/g, '').trim();
    text = text.replace(/^#+\s*/gm, '').trim();

    return text || this.fallbackText;
  }
}
