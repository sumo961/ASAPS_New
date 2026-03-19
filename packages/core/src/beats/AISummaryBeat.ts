import { Beat } from './Beat';
import type { BeatConfig, Location } from '../types';
import type { IRenderer } from '../types';
import { StoryContext } from '../engine/StoryContext';
import { PlayerContextBuilder } from '../utils/PlayerContextBuilder';

export interface AISummaryBeatParams {
  /** Custom instructions for the summary style */
  prompt?: string;

  /** Include player variables in summary */
  includeVariables?: boolean;

  /** Include player inventory in summary */
  includeInventory?: boolean;

  /** Include visited beats in summary */
  includeVisitedBeats?: boolean;

  /** Include rich choice history in summary (what choices were made) */
  includeChoiceHistory?: boolean;

  /** Include final counter values */
  includeCounters?: boolean;

  /** Summary style */
  summaryStyle?: 'narrative' | 'bullet-points' | 'reflection';

  /** Maximum length of summary */
  maxLength?: 'short' | 'medium' | 'long';

  /** Title text displayed above summary */
  title?: string;

  /** Show restart button */
  showRestart?: boolean;

  /** Show credits button */
  showCredits?: boolean;

  /** Text for restart button */
  restartText?: string;

  /** Text for credits button */
  creditsText?: string;

  /** Beat to restart to */
  restartTarget?: string;

  /** Reset state on restart */
  resetOnRestart?: boolean;

  /** Granular reset sub-options */
  resetVariables?: boolean;
  resetCounters?: boolean;
  resetInventory?: boolean;
  resetTimers?: boolean;
  resetFictionalTime?: boolean;
  resetVisitedTracking?: boolean;
  resetHistory?: boolean;

  /** Credits page properties */
  creditsPageTitle?: string;
  creditsPageBody?: string;
  creditsCloseText?: string;
}

/**
 * AISummaryBeat - Generate a narrative summary of the player's journey
 *
 * This beat creates a personalized summary explaining:
 * - Key choices the player made
 * - How those choices led to this ending
 * - Character development and relationships
 * - Final state of important variables
 */
export class AISummaryBeat extends Beat {
  public prompt?: string;
  public includeVariables: boolean;
  public includeInventory: boolean;
  public includeVisitedBeats: boolean;
  public includeChoiceHistory: boolean;
  public includeCounters: boolean;
  public summaryStyle: 'narrative' | 'bullet-points' | 'reflection';
  public maxLength: 'short' | 'medium' | 'long';
  public title?: string;
  public showRestart: boolean;
  public showCredits: boolean;
  public restartText: string;
  public creditsText: string;
  public restartTarget?: string;
  public resetOnRestart: boolean;

  // Granular reset sub-options (all default true for backward compatibility)
  public resetVariables: boolean;
  public resetCounters: boolean;
  public resetInventory: boolean;
  public resetTimers: boolean;
  public resetFictionalTime: boolean;
  public resetVisitedTracking: boolean;
  public resetHistory: boolean;

  // Credits page properties
  public creditsPageTitle: string;
  public creditsPageBody: string;
  public creditsCloseText: string;

  private generatedSummary: string | null = null;

  constructor(config: BeatConfig & {
    parameters?: Partial<AISummaryBeatParams>;
  } & Partial<AISummaryBeatParams>) {
    super(config);
    const params = config.parameters || {};

    this.prompt = params.prompt || config.prompt;
    this.includeVariables = params.includeVariables ?? config.includeVariables ?? true;
    this.includeInventory = params.includeInventory ?? config.includeInventory ?? false;
    this.includeVisitedBeats = params.includeVisitedBeats ?? config.includeVisitedBeats ?? true;
    this.includeChoiceHistory = params.includeChoiceHistory ?? config.includeChoiceHistory ?? true;
    this.includeCounters = params.includeCounters ?? config.includeCounters ?? false;
    this.summaryStyle = params.summaryStyle || config.summaryStyle || 'narrative';
    this.maxLength = params.maxLength || config.maxLength || 'medium';
    this.title = params.title || config.title || 'Your Journey';
    this.showRestart = params.showRestart ?? config.showRestart ?? true;
    this.showCredits = params.showCredits ?? config.showCredits ?? false;
    this.restartText = params.restartText || config.restartText || 'Play Again';
    this.creditsText = params.creditsText || config.creditsText || 'Credits';
    this.restartTarget = params.restartTarget || config.restartTarget;
    this.resetOnRestart = params.resetOnRestart ?? config.resetOnRestart ?? true;

    // Granular reset sub-options default to true
    this.resetVariables = params.resetVariables ?? config.resetVariables ?? true;
    this.resetCounters = params.resetCounters ?? config.resetCounters ?? true;
    this.resetInventory = params.resetInventory ?? config.resetInventory ?? true;
    this.resetTimers = params.resetTimers ?? config.resetTimers ?? true;
    this.resetFictionalTime = params.resetFictionalTime ?? config.resetFictionalTime ?? true;
    this.resetVisitedTracking = params.resetVisitedTracking ?? config.resetVisitedTracking ?? true;
    this.resetHistory = params.resetHistory ?? config.resetHistory ?? true;

    // Credits page properties
    this.creditsPageTitle = params.creditsPageTitle || config.creditsPageTitle || 'Credits';
    this.creditsPageBody = params.creditsPageBody || config.creditsPageBody || '';
    this.creditsCloseText = params.creditsCloseText || config.creditsCloseText || 'Close';
  }

  getParameters(): Record<string, any> {
    return {
      prompt: this.prompt,
      includeVariables: this.includeVariables,
      includeInventory: this.includeInventory,
      includeVisitedBeats: this.includeVisitedBeats,
      includeChoiceHistory: this.includeChoiceHistory,
      includeCounters: this.includeCounters,
      summaryStyle: this.summaryStyle,
      maxLength: this.maxLength,
      title: this.title,
      showRestart: this.showRestart,
      showCredits: this.showCredits,
      restartText: this.restartText,
      creditsText: this.creditsText,
      restartTarget: this.restartTarget,
      resetOnRestart: this.resetOnRestart,
      resetVariables: this.resetVariables,
      resetCounters: this.resetCounters,
      resetInventory: this.resetInventory,
      resetTimers: this.resetTimers,
      resetFictionalTime: this.resetFictionalTime,
      resetVisitedTracking: this.resetVisitedTracking,
      resetHistory: this.resetHistory,
      creditsPageTitle: this.creditsPageTitle,
      creditsPageBody: this.creditsPageBody,
      creditsCloseText: this.creditsCloseText,
    };
  }

  updateParameters(params: Record<string, any>): void {
    if (params.prompt !== undefined) this.prompt = params.prompt;
    if (params.includeVariables !== undefined) this.includeVariables = params.includeVariables;
    if (params.includeInventory !== undefined) this.includeInventory = params.includeInventory;
    if (params.includeVisitedBeats !== undefined) this.includeVisitedBeats = params.includeVisitedBeats;
    if (params.includeChoiceHistory !== undefined) this.includeChoiceHistory = params.includeChoiceHistory;
    if (params.includeCounters !== undefined) this.includeCounters = params.includeCounters;
    if (params.summaryStyle !== undefined) this.summaryStyle = params.summaryStyle;
    if (params.maxLength !== undefined) this.maxLength = params.maxLength;
    if (params.title !== undefined) this.title = params.title;
    if (params.showRestart !== undefined) this.showRestart = params.showRestart;
    if (params.showCredits !== undefined) this.showCredits = params.showCredits;
    if (params.restartText !== undefined) this.restartText = params.restartText;
    if (params.creditsText !== undefined) this.creditsText = params.creditsText;
    if (params.restartTarget !== undefined) this.restartTarget = params.restartTarget;
    if (params.resetOnRestart !== undefined) this.resetOnRestart = params.resetOnRestart;
    if (params.resetVariables !== undefined) this.resetVariables = params.resetVariables;
    if (params.resetCounters !== undefined) this.resetCounters = params.resetCounters;
    if (params.resetInventory !== undefined) this.resetInventory = params.resetInventory;
    if (params.resetTimers !== undefined) this.resetTimers = params.resetTimers;
    if (params.resetFictionalTime !== undefined) this.resetFictionalTime = params.resetFictionalTime;
    if (params.resetVisitedTracking !== undefined) this.resetVisitedTracking = params.resetVisitedTracking;
    if (params.resetHistory !== undefined) this.resetHistory = params.resetHistory;
    if (params.creditsPageTitle !== undefined) this.creditsPageTitle = params.creditsPageTitle;
    if (params.creditsPageBody !== undefined) this.creditsPageBody = params.creditsPageBody;
    if (params.creditsCloseText !== undefined) this.creditsCloseText = params.creditsCloseText;
  }

  /**
   * Prefetch AI content in the background so it's cached when the beat executes.
   * Called by StoryEngine when this beat is the next beat to be executed.
   * Does NOT render anything - only generates and caches the summary.
   */
  async prefetch(context: StoryContext, renderer: IRenderer): Promise<void> {
    try {
      const aiService = renderer.getState('aiService');
      if (!aiService || typeof aiService.generateContent !== 'function') return;
      if (this.generatedSummary) return; // already cached

      console.log(`[AISummaryBeat ${this.id}] Prefetching summary...`);
      this.generatedSummary = await this.generateAISummary(context, aiService);
      console.log(`[AISummaryBeat ${this.id}] Prefetch complete`);
    } catch (err) {
      // Prefetch failure is non-fatal - will retry on execute
      console.log(`[AISummaryBeat ${this.id}] Prefetch failed (will retry on execute):`, err);
    }
  }

  protected async performAction(
    context: StoryContext,
    renderer: IRenderer
  ): Promise<string | null> {
    let summaryText: string;

    // Check if AI service is available
    const aiService = renderer.getState('aiService');

    if (aiService && typeof aiService.generateContent === 'function') {
      // Use prefetched summary if available
      if (this.generatedSummary) {
        console.log(`[AISummaryBeat ${this.id}] Using prefetched summary`);
        summaryText = this.generatedSummary;
      } else {
        // Show loading indicator while generating summary
        if (renderer.renderLoading) {
          const loadingMessages = [
            "Let me reflect on your journey...",
            "Summarizing your experience...",
            "Reviewing your choices...",
            "Creating your personal summary...",
          ];
          const message = loadingMessages[Math.floor(Math.random() * loadingMessages.length)];
          renderer.renderLoading(message, {
            subMessage: 'This will just take a moment',
            spinnerType: 'pulse',
          });
        }

        try {
          // Generate AI summary
          summaryText = await this.generateAISummary(context, aiService);
        } catch (error) {
          console.error(`[AISummaryBeat ${this.id}] AI generation failed:`, error);
          // Fall back to static summary
          summaryText = this.generateStaticSummary(context);
        }
      }
    } else {
      console.warn(`[AISummaryBeat ${this.id}] AI service not configured, using static summary`);
      summaryText = this.generateStaticSummary(context);
    }

    // Record AI output for session logging
    context.recordAIOutput({
      beatId: this.id,
      beatName: this.name || this.id,
      beatType: 'aiSummary',
      text: summaryText,
    });

    // Process text with variable interpolation
    const processedTitle = this.processText(this.title || 'Your Journey', context);
    const processedSummary = this.processText(summaryText, context);
    const processedRestartText = this.processText(this.restartText, context);
    const processedCreditsText = this.processText(this.creditsText, context);

    // Use dedicated AI Summary renderer if available, otherwise fall back to end screen
    let result: string;
    if (renderer.renderAISummary) {
      result = await renderer.renderAISummary({
        title: processedTitle,
        summary: processedSummary,
        showRestart: this.showRestart,
        showCredits: this.showCredits,
        restartText: processedRestartText,
        creditsText: processedCreditsText,
      }, Array.from(this.locations.values()));
    } else {
      // Fallback: combine title and summary for legacy renderers
      const fullMessage = `${processedTitle}\n\n${processedSummary}`;
      result = await renderer.renderEndScreen(
        fullMessage,
        this.showRestart,
        this.showCredits,
        Array.from(this.locations.values())
      );
    }

    // Handle restart
    if (result === 'restart') {
      if (this.resetOnRestart) {
        // If all sub-options are true, use full reset for efficiency
        const allTrue = this.resetVariables && this.resetCounters && this.resetInventory &&
          this.resetTimers && this.resetFictionalTime && this.resetVisitedTracking && this.resetHistory;
        if (allTrue) {
          context.reset();
        } else {
          context.selectiveReset({
            variables: this.resetVariables,
            counters: this.resetCounters,
            inventory: this.resetInventory,
            timers: this.resetTimers,
            fictionalTime: this.resetFictionalTime,
            visitedTracking: this.resetVisitedTracking,
            history: this.resetHistory,
          });
        }
      }
      return this.restartTarget || context.getStory().getFirstBeatId();
    }

    // Handle credits
    if (result === 'credits') {
      if (this.showCredits) {
        await this.showCreditsPage(context, renderer);
      }
      return null;
    }

    return this.getNextBeat(context);
  }

  private async showCreditsPage(context: StoryContext, renderer: IRenderer): Promise<void> {
    const story = context.getStory();
    const metadata = story.getMetadata();

    // Auto-populate body from metadata if empty
    let body = this.creditsPageBody;
    if (!body) {
      body = `${metadata.title || 'Untitled Story'}\n\nCreated by: ${metadata.author || 'Anonymous'}\n\nThank you for playing!`;
    }

    const creditsContent = {
      creditsTitle: this.processText(this.creditsPageTitle, context),
      creditsBody: this.processText(body, context),
      creditsCloseText: this.processText(this.creditsCloseText, context),
    };

    // Get credits-specific locations from beat locations
    const creditsLocations = this.getCreditsLocations();

    if (renderer.renderCreditsPage) {
      await renderer.renderCreditsPage(creditsContent, creditsLocations);
    } else {
      // Fallback for renderers that don't support renderCreditsPage
      await renderer.renderText(
        `${creditsContent.creditsTitle}\n\n${creditsContent.creditsBody}`,
        creditsContent.creditsCloseText,
        []
      );
    }
  }

  /**
   * Get Location[] for credits page elements from beat.locations
   * Filters for credits-phase elements (creditsTitle, creditsBody, creditsCloseButton)
   */
  private getCreditsLocations(): Location[] {
    const creditsLocationNames = ['creditstitle', 'creditsbody', 'creditsclosebutton'];
    const locations: Location[] = [];

    this.locations.forEach((loc) => {
      const nameLower = loc.name?.toLowerCase().replace(/\s+/g, '') || '';
      if (creditsLocationNames.some(n => nameLower.includes(n))) {
        locations.push(loc);
      }
    });

    return locations;
  }

  /**
   * Generate a summary using AI
   */
  private async generateAISummary(context: StoryContext, aiService: any): Promise<string> {
    // Build comprehensive journey data
    const story = context.getStory();
    const contextBuilder = new PlayerContextBuilder(context, story);
    const journeySummary = contextBuilder.buildJourneySummary({
      includeVariables: this.includeVariables,
      includeInventory: this.includeInventory,
      includeVisitedBeats: this.includeVisitedBeats,
      includeChoiceHistory: this.includeChoiceHistory,
      includeCounters: this.includeCounters,
    });

    // Determine strict word limits (500 max for long, much less for shorter)
    const wordLimits = {
      short: 75,
      medium: 150,
      long: 300,
    };
    const maxWords = wordLimits[this.maxLength];

    // Determine style guidelines
    const styleGuide = {
      narrative: 'Write in third person narrative style, like a story epilogue.',
      'bullet-points': 'Use bullet points to highlight key moments and outcomes.',
      reflection: 'Write as if the player is reflecting on their journey, using "you" form.',
    }[this.summaryStyle];

    // Build the generation prompt with strict constraints
    // IMPORTANT: Be very explicit about output format to avoid AI reasoning/thinking in output
    const prompt = `You are generating a summary for an interactive story. Output ONLY the summary text itself - no thinking, no explanations, no metadata, no word counts.

PLAYER JOURNEY DATA:
${journeySummary}

${this.prompt ? `ADDITIONAL CONTEXT: ${this.prompt}` : ''}

STYLE: ${styleGuide}

CRITICAL RULES:
- Output ONLY the final summary text (${maxWords} words maximum)
- Do NOT include any reasoning, planning, or meta-commentary
- Do NOT start with phrases like "I need to...", "Let me...", "Here's...", or "Based on..."
- Do NOT include word counts or analysis
- Just write the summary directly, starting with the content itself
- Use the player's name if available in the data
- ONLY reference things that are EXPLICITLY stated in the journey data above
- Do NOT invent or hallucinate events, conversations, or choices that are not in the data
- If a beat name suggests a topic (like "Car Ownership"), you can mention the player explored that topic, but do NOT invent specific conversations or discussions that aren't documented
- Focus on the player's journey path, variables, and counters that ARE provided
- End positively

OUTPUT THE SUMMARY NOW (just the text, nothing else):`;

    console.log(`[AISummaryBeat ${this.id}] Generating summary (max ${maxWords} words)...`);

    const response = await aiService.generateContent(prompt, {
      maxTokens: Math.max(500, maxWords * 3), // Extra headroom for complete responses
    });

    // Post-process to remove any reasoning/meta-commentary that slipped through
    let cleanedResponse = response;

    // Remove common reasoning patterns at the start
    const reasoningPatterns = [
      /^(I need to|Let me|I'll|I will|Here's|Here is|Based on|Looking at|Analyzing)[^.]*\.\s*/gi,
      /^(First,|To start,|Starting with)[^.]*\.\s*/gi,
      /^\*\*[^*]+\*\*\s*/g,  // Remove bold headers like **Summary:**
      /^Summary:?\s*/i,
    ];

    for (const pattern of reasoningPatterns) {
      cleanedResponse = cleanedResponse.replace(pattern, '');
    }

    // Remove likely hallucinations - phrases that indicate the AI is inventing content
    // These patterns often appear when AI sees beat names and invents discussions about them
    const hallucinationPatterns = [
      /\s*(?:and\s+)?(?:later\s+)?(?:an?\s+)?AI\s+(?:car|vehicle|transport|discussion|conversation)[^.]*[.,]/gi,
      /\s*(?:explored|discussed|engaged in)\s+(?:questions?\s+)?(?:around|about)\s+(?:car ownership\s+and\s+)?(?:the\s+)?role\s+of\s+AI[^.]*[.,]/gi,
      /\s*(?:the\s+)?(?:role\s+of\s+)?AI\s+in\s+(?:cars|vehicles|transportation)[^.]*[.,]/gi,
      /\s*questions?\s+around\s+car\s+ownership\s+and\s+(?:the\s+)?role\s+of\s+AI[^.]*[.,]/gi,
    ];

    for (const pattern of hallucinationPatterns) {
      cleanedResponse = cleanedResponse.replace(pattern, ',');
    }

    // Clean up any double commas or awkward punctuation from removals
    cleanedResponse = cleanedResponse
      .replace(/,\s*,/g, ',')
      .replace(/\.\s*,/g, '.')
      .replace(/,\s*\./g, '.')
      .replace(/\s+,/g, ',')
      .replace(/,\s+\./g, '.');

    // If the response has duplicate content (AI repeated itself), take just the first occurrence
    const lines = cleanedResponse.split('\n').filter((line: string) => line.trim());
    if (lines.length > 1) {
      // Check for duplicate paragraphs
      const seen = new Set<string>();
      const uniqueLines: string[] = [];
      for (const line of lines) {
        const normalized = line.trim().toLowerCase().substring(0, 50);
        if (!seen.has(normalized)) {
          seen.add(normalized);
          uniqueLines.push(line);
        }
      }
      cleanedResponse = uniqueLines.join('\n\n');
    }

    return cleanedResponse.trim();
  }

  /**
   * Generate a basic static summary when AI is not available
   */
  private generateStaticSummary(context: StoryContext): string {
    const variables = context.getVariables();
    const counters = context.getCounters();
    const inventory = context.getInventory();
    const history = context.getHistory();
    const visitedBeats = context.getVisitedBeats();

    const sections: string[] = [];

    // Player name if available
    const playerName = variables.name || variables.playerName;
    if (playerName) {
      sections.push(`Congratulations, ${playerName}!`);
    }

    // Journey stats
    sections.push(`You visited ${visitedBeats.length} unique scenes on your journey.`);

    // Inventory summary
    if (inventory.length > 0) {
      sections.push(`You collected: ${inventory.join(', ')}.`);
    }

    // Counter summary
    const counterEntries = Object.entries(counters);
    if (counterEntries.length > 0) {
      const counterSummary = counterEntries
        .map(([name, value]) => `${name}: ${value}`)
        .join(', ');
      sections.push(`Final scores: ${counterSummary}`);
    }

    return sections.join('\n\n');
  }
}
