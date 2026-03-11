import { Beat } from './Beat';
import type { BeatConfig } from '../types';
import type { IRenderer } from '../types';
import { StoryContext } from '../engine/StoryContext';
import { PlayerContextBuilder } from '../utils/PlayerContextBuilder';

export interface AIConditionCategory {
  /** Category name (returned by AI) */
  name: string;
  /** Description for AI to understand when this category applies */
  description: string;
  /** Target beat ID to navigate to */
  targetId: string;
}

export interface AIConditionBeatParams {
  /** Prompt describing what the AI should evaluate */
  prompt: string;

  /** Categories for the AI to choose from */
  categories: AIConditionCategory[];

  /** Include player variables in evaluation */
  evaluateVariables?: boolean;

  /** Include player inventory in evaluation */
  evaluateInventory?: boolean;

  /** Include beat history in evaluation */
  evaluateHistory?: boolean;

  /** Include counters in evaluation */
  evaluateCounters?: boolean;

  /** Include rich choice history in evaluation */
  evaluateChoiceHistory?: boolean;

  /** Fallback target if AI can't decide (separate from base Beat's defaultTarget) */
  fallbackTarget?: string;

  /** Maximum response time in ms before falling back to default */
  timeout?: number;
}

/**
 * AIConditionBeat - AI-driven branching decisions
 *
 * This is an INVISIBLE beat that uses AI to analyze player state
 * and determine which story path to take. It executes instantly
 * without rendering any UI.
 *
 * Example use cases:
 * - Determine player's personality type based on choices
 * - Route to appropriate content based on accumulated state
 * - Dynamic difficulty adjustment based on player performance
 */
export class AIConditionBeat extends Beat {
  public prompt: string;
  public categories: AIConditionCategory[];
  public evaluateVariables: boolean;
  public evaluateInventory: boolean;
  public evaluateHistory: boolean;
  public evaluateCounters: boolean;
  public evaluateChoiceHistory: boolean;
  public aiDefaultTarget?: string;
  public timeout: number;

  constructor(config: BeatConfig & {
    parameters?: Partial<AIConditionBeatParams>;
  } & Partial<AIConditionBeatParams>) {
    super(config);
    const params = config.parameters || {};

    this.prompt = params.prompt || config.prompt || '';
    this.categories = params.categories || config.categories || [];
    this.evaluateVariables = params.evaluateVariables ?? config.evaluateVariables ?? true;
    this.evaluateInventory = params.evaluateInventory ?? config.evaluateInventory ?? true;
    this.evaluateHistory = params.evaluateHistory ?? config.evaluateHistory ?? true;
    this.evaluateCounters = params.evaluateCounters ?? config.evaluateCounters ?? true;
    this.evaluateChoiceHistory = params.evaluateChoiceHistory ?? config.evaluateChoiceHistory ?? true;
    this.aiDefaultTarget = params.fallbackTarget || config.fallbackTarget || params.defaultTarget || config.defaultTarget;
    this.timeout = params.timeout || config.timeout || 30000;
  }

  getParameters(): Record<string, any> {
    return {
      prompt: this.prompt,
      categories: this.categories,
      evaluateVariables: this.evaluateVariables,
      evaluateInventory: this.evaluateInventory,
      evaluateHistory: this.evaluateHistory,
      evaluateCounters: this.evaluateCounters,
      evaluateChoiceHistory: this.evaluateChoiceHistory,
      fallbackTarget: this.aiDefaultTarget,
      timeout: this.timeout,
    };
  }

  updateParameters(params: Record<string, any>): void {
    if (params.prompt !== undefined) this.prompt = params.prompt;
    if (params.categories !== undefined) {
      this.categories = params.categories;
      // Clear stored connections — getConnections() derives them from categories
      this.clearConnections();
    }
    if (params.evaluateVariables !== undefined) this.evaluateVariables = params.evaluateVariables;
    if (params.evaluateInventory !== undefined) this.evaluateInventory = params.evaluateInventory;
    if (params.evaluateHistory !== undefined) this.evaluateHistory = params.evaluateHistory;
    if (params.evaluateCounters !== undefined) this.evaluateCounters = params.evaluateCounters;
    if (params.evaluateChoiceHistory !== undefined) this.evaluateChoiceHistory = params.evaluateChoiceHistory;
    if (params.fallbackTarget !== undefined) {
      this.aiDefaultTarget = params.fallbackTarget;
      this.clearConnections();
    }
    if (params.timeout !== undefined) this.timeout = params.timeout;
  }

  /**
   * Override getConnections to return connections from categories
   */
  getConnections(): Array<{ targetId: string; label?: string; condition?: any }> {
    const connections: Array<{ targetId: string; label?: string; condition?: any }> = [];

    // Add connections from categories
    for (const category of this.categories) {
      if (category.targetId) {
        connections.push({
          targetId: category.targetId,
          label: category.name,
        });
      }
    }

    // Add fallback target if present
    if (this.aiDefaultTarget) {
      connections.push({
        targetId: this.aiDefaultTarget,
        label: 'Fallback',
      });
    }

    // Also include any base connections
    const baseConnections = super.getConnections();
    for (const conn of baseConnections) {
      if (!connections.some(c => c.targetId === conn.targetId)) {
        connections.push(conn);
      }
    }

    return connections;
  }

  protected async performAction(
    context: StoryContext,
    renderer: IRenderer
  ): Promise<string | null> {
    // Validate configuration
    if (!this.prompt || this.categories.length === 0) {
      console.error(`[AIConditionBeat ${this.id}] Missing prompt or categories`);
      return this.aiDefaultTarget || this.getNextBeat(context);
    }

    // Check if AI service is available
    const aiService = renderer.getState('aiService');
    if (!aiService || typeof aiService.classifyContent !== 'function') {
      console.warn(`[AIConditionBeat ${this.id}] AI service not configured, using default target`);
      return this.aiDefaultTarget || this.getNextBeat(context);
    }

    try {
      // Build player context
      const story = context.getStory();
      const contextBuilder = new PlayerContextBuilder(context, story);
      const playerContext = contextBuilder.buildPromptContext({
        includeVariables: this.evaluateVariables,
        includeInventory: this.evaluateInventory,
        includeHistory: this.evaluateHistory,
        includeCounters: this.evaluateCounters,
        includeChoiceHistory: this.evaluateChoiceHistory,
      });

      // Build the classification prompt
      const categoryDescriptions = this.categories
        .map(c => `- "${c.name}": ${c.description}`)
        .join('\n');

      const fullPrompt = `${this.prompt}

Player Context:
${playerContext}

Categories to choose from:
${categoryDescriptions}

Based on the player's state and the criteria above, which category best applies?
Respond with ONLY the category name, nothing else.`;

      console.log(`[AIConditionBeat ${this.id}] Evaluating with AI...`);

      // Call AI service with timeout
      const categoryNames = this.categories.map(c => c.name);
      const chosenCategory = await Promise.race([
        aiService.classifyContent(fullPrompt, categoryNames),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), this.timeout)
        ),
      ]);

      // Find the matching category
      const matchedCategory = this.categories.find(
        c => c.name.toLowerCase() === chosenCategory.toLowerCase()
      );

      if (matchedCategory) {
        console.log(`[AIConditionBeat ${this.id}] AI chose: "${matchedCategory.name}" → ${matchedCategory.targetId}`);
        return matchedCategory.targetId;
      } else {
        console.warn(`[AIConditionBeat ${this.id}] AI returned unknown category: "${chosenCategory}"`);
        return this.aiDefaultTarget || this.getNextBeat(context);
      }
    } catch (error) {
      console.error(`[AIConditionBeat ${this.id}] Error:`, error);
      return this.aiDefaultTarget || this.getNextBeat(context);
    }
  }
}
