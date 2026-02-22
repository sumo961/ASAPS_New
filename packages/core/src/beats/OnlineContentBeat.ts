import { Beat } from './Beat';
import type { BeatConfig, Location } from '../types';
import type { IRenderer } from '../types';
import { StoryContext } from '../engine/StoryContext';

export interface OnlineContentBeatParams {
  /** Data source type: 'api' for direct API calls, 'ai-query' for AI-powered search */
  sourceType: 'api' | 'ai-query';

  // For 'api' type - direct API call
  /** API URL to fetch data from (supports ${variable} interpolation) */
  apiUrl?: string;
  /** Query parameters for the API (supports ${variable} interpolation) */
  apiParams?: Record<string, string>;
  /** JSONPath expression to extract data from response */
  jsonPath?: string;
  /** HTTP headers for the request */
  headers?: Record<string, string>;

  // For 'ai-query' type - AI performs web search and summarizes
  /** Query for AI to search and summarize (supports ${variable} interpolation) */
  query?: string;

  // Display options
  /** Title displayed above the content (auto-derived from query if not set) */
  title?: string;
  /** Template for displaying the result (use {{data}} placeholder) */
  displayTemplate?: string;
  /** Continue button text */
  buttonText?: string;
  /** Maximum word count for AI-generated content (default: 150) */
  maxWords?: number;

  // Error handling
  /** Message to show if fetch fails */
  errorMessage?: string;
  /** Beat to navigate to on error (optional) */
  errorTarget?: string;
}

/**
 * OnlineContentBeat - Fetches real-time data from web APIs or AI queries
 *
 * This beat allows stories to incorporate dynamic, real-world data such as:
 * - Weather for a player's chosen city
 * - News headlines relevant to story theme
 * - Statistics or facts looked up via AI
 * - Stock prices, sports scores, etc.
 */
export class OnlineContentBeat extends Beat {
  public sourceType: 'api' | 'ai-query';
  public apiUrl?: string;
  public apiParams?: Record<string, string>;
  public jsonPath?: string;
  public headers?: Record<string, string>;
  public query?: string;
  public title?: string;
  public displayTemplate?: string;
  public buttonText?: string;
  public maxWords: number;
  public errorMessage?: string;
  public errorTarget?: string;

  constructor(config: BeatConfig & {
    parameters?: Partial<OnlineContentBeatParams>;
  } & Partial<OnlineContentBeatParams>) {
    super(config);
    const params = config.parameters || {};

    this.sourceType = params.sourceType || config.sourceType || 'api';
    this.apiUrl = params.apiUrl || config.apiUrl;
    this.apiParams = params.apiParams || config.apiParams;
    this.jsonPath = params.jsonPath || config.jsonPath;
    this.headers = params.headers || config.headers;
    this.query = params.query || config.query;
    this.title = params.title || config.title;
    this.displayTemplate = params.displayTemplate || config.displayTemplate || '{{data}}';
    this.buttonText = params.buttonText || config.buttonText || 'Continue';
    this.maxWords = params.maxWords || config.maxWords || 150;
    this.errorMessage = params.errorMessage || config.errorMessage || 'Unable to fetch content. Please try again.';
    this.errorTarget = params.errorTarget || config.errorTarget;
  }

  getParameters(): Record<string, any> {
    return {
      sourceType: this.sourceType,
      apiUrl: this.apiUrl,
      apiParams: this.apiParams,
      jsonPath: this.jsonPath,
      headers: this.headers,
      query: this.query,
      title: this.title,
      displayTemplate: this.displayTemplate,
      buttonText: this.buttonText,
      maxWords: this.maxWords,
      errorMessage: this.errorMessage,
      errorTarget: this.errorTarget,
    };
  }

  updateParameters(params: Record<string, any>): void {
    if (params.sourceType !== undefined) this.sourceType = params.sourceType;
    if (params.apiUrl !== undefined) this.apiUrl = params.apiUrl;
    if (params.apiParams !== undefined) this.apiParams = params.apiParams;
    if (params.jsonPath !== undefined) this.jsonPath = params.jsonPath;
    if (params.headers !== undefined) this.headers = params.headers;
    if (params.query !== undefined) this.query = params.query;
    if (params.title !== undefined) this.title = params.title;
    if (params.displayTemplate !== undefined) this.displayTemplate = params.displayTemplate;
    if (params.buttonText !== undefined) this.buttonText = params.buttonText;
    if (params.maxWords !== undefined) this.maxWords = params.maxWords;
    if (params.errorMessage !== undefined) this.errorMessage = params.errorMessage;
    if (params.errorTarget !== undefined) this.errorTarget = params.errorTarget;
  }

  protected async performAction(
    context: StoryContext,
    renderer: IRenderer
  ): Promise<string | null> {
    // Mark this as an online content beat for centering in PositionedBeatView
    renderer.setState('currentBeatType', 'onlineContent');

    try {
      let content: string;

      // Show loading indicator while fetching content
      if (renderer.renderLoading) {
        if (this.sourceType === 'api') {
          renderer.renderLoading('Fetching data...', {
            subMessage: 'Please wait while I retrieve the information',
            spinnerType: 'spinner',
          });
        } else {
          // AI query - use friendlier messages
          const loadingMessages = [
            "Let me search for that...",
            "Searching the internet for you...",
            "Let me find out more...",
            "Looking that up for you...",
          ];
          const message = loadingMessages[Math.floor(Math.random() * loadingMessages.length)];
          renderer.renderLoading(message, {
            subMessage: 'This may take a moment',
            spinnerType: 'dots',
          });
        }
      }

      if (this.sourceType === 'api') {
        content = await this.fetchApiContent(context, renderer);
      } else {
        content = await this.fetchAIContent(context, renderer);
      }

      // Generate title: author-set > AI-generated > derived from query
      let title = this.title;
      if (!title && this.aiGeneratedTitle) {
        title = this.aiGeneratedTitle;
      } else if (!title && this.query) {
        const processedQuery = this.processText(this.query, context);
        title = this.deriveTitle(processedQuery);
      }

      // Apply display template
      const displayText = this.displayTemplate?.replace('{{data}}', content) || content;
      const processedText = this.processText(displayText, context);
      const processedButtonText = this.processText(this.buttonText || 'Continue', context);
      const processedTitle = title ? this.processText(title, context) : '';

      // Update location content - title and text should be separate
      console.log(`[OnlineContentBeat ${this.id}] Updating locations, count=${this.locations.size}`);
      for (const [name, loc] of this.locations) {
        const nameLower = name.toLowerCase();
        if (nameLower === 'title' || nameLower.includes('title')) {
          (loc as any).content = processedTitle;
          console.log(`[OnlineContentBeat ${this.id}] Location "${name}": x=${loc.x}, y=${loc.y}, w=${loc.width}, h=${loc.height} -> TITLE`);
        } else if (nameLower === 'text' || nameLower.includes('text')) {
          (loc as any).content = processedText; // Content WITHOUT title
          console.log(`[OnlineContentBeat ${this.id}] Location "${name}": x=${loc.x}, y=${loc.y}, w=${loc.width}, h=${loc.height} -> TEXT (${processedText.length} chars)`);
        } else if (nameLower.includes('button') || nameLower.includes('continue')) {
          (loc as any).content = processedButtonText;
          console.log(`[OnlineContentBeat ${this.id}] Location "${name}": x=${loc.x}, y=${loc.y}, w=${loc.width}, h=${loc.height} -> BUTTON`);
        } else {
          console.log(`[OnlineContentBeat ${this.id}] Location "${name}": x=${loc.x}, y=${loc.y}, w=${loc.width}, h=${loc.height} -> UNMATCHED`);
        }
      }

      // Render as text display - pass content (not title) as main text
      const locations = Array.from(this.locations.values());
      console.log(`[OnlineContentBeat ${this.id}] Calling renderText with ${locations.length} locations`);
      await renderer.renderText(processedText, processedButtonText, locations);

      return this.getNextBeat(context);
    } catch (error) {
      console.error(`[OnlineContentBeat ${this.id}] Error:`, error);

      // If there's an error target, navigate there
      if (this.errorTarget) {
        return this.errorTarget;
      }

      // Otherwise show error message and continue
      const processedError = this.processText(this.errorMessage || 'Content unavailable.', context);
      const processedButtonText = this.processText(this.buttonText || 'Continue', context);
      const locations = Array.from(this.locations.values());
      await renderer.renderText(processedError, processedButtonText, locations);

      return this.getNextBeat(context);
    }
  }

  /**
   * Derive a title from the query text
   * Creates a descriptive title like "Transportation and Environment in Marsaskala, Malta"
   */
  private deriveTitle(query: string): string {
    // First, try to find a proper location name (Capitalized words, often with comma like "City, Country")
    // Match patterns like "in Marsaskala, Malta" or "for Berlin, Germany"
    // Use \p{L} to match any Unicode letter (supports international characters like ö, ä, ü, etc.)
    const properLocationMatch = query.match(/\s+(?:in|for)\s+([\p{Lu}][\p{L}]+(?:,\s*[\p{Lu}][\p{L}]+)?)/u);
    let location = '';

    if (properLocationMatch) {
      location = properLocationMatch[1].trim();
    }

    // Extract key topic words from the query
    // Look for common topic indicators
    const topicPatterns = [
      /car\s*ownership/gi,
      /transportation/gi,
      /transport/gi,
      /environment(?:al)?/gi,
      /public\s*transit/gi,
      /traffic/gi,
      /pollution/gi,
      /climate/gi,
      /weather/gi,
      /news/gi,
      /statistics?/gi,
      /economy/gi,
      /population/gi,
      /culture/gi,
      /history/gi,
      /food/gi,
      /tourism/gi,
    ];

    const foundTopics: string[] = [];
    for (const pattern of topicPatterns) {
      const match = query.match(pattern);
      if (match) {
        // Normalize the topic
        let topic = match[0].toLowerCase()
          .replace(/\s+/g, ' ')
          .replace(/^car ownership$/i, 'Car Ownership')
          .replace(/^transportation$/i, 'Transportation')
          .replace(/^transport$/i, 'Transportation')
          .replace(/^environment$/i, 'Environment')
          .replace(/^environmental$/i, 'Environment')
          .replace(/^public transit$/i, 'Public Transit')
          .replace(/^traffic$/i, 'Traffic')
          .replace(/^pollution$/i, 'Pollution')
          .replace(/^climate$/i, 'Climate')
          .replace(/^weather$/i, 'Weather')
          .replace(/^news$/i, 'News')
          .replace(/^statistics?$/i, 'Statistics')
          .replace(/^economy$/i, 'Economy')
          .replace(/^population$/i, 'Population')
          .replace(/^culture$/i, 'Culture')
          .replace(/^history$/i, 'History')
          .replace(/^food$/i, 'Food')
          .replace(/^tourism$/i, 'Tourism');

        // Capitalize first letter
        topic = topic.charAt(0).toUpperCase() + topic.slice(1);

        if (!foundTopics.includes(topic)) {
          foundTopics.push(topic);
        }
      }
    }

    // Build title from found topics (max 3)
    let title = '';
    if (foundTopics.length > 0) {
      const topics = foundTopics.slice(0, 3);
      if (topics.length === 1) {
        title = topics[0];
      } else if (topics.length === 2) {
        title = `${topics[0]} and ${topics[1]}`;
      } else {
        title = `${topics[0]}, ${topics[1]} and ${topics[2]}`;
      }
    } else {
      // Fallback: use first few words of query, cleaned up
      title = query
        .replace(/^(what is|what are|how many|how much|tell me about|find|search for|look up|give me|provide|explain|the)\s*/i, '')
        .replace(/[?.].*$/, '')  // Remove everything after first ? or .
        .trim()
        .split(/\s+/)
        .slice(0, 5)
        .join(' ');

      // Title case
      title = title.split(' ').map(word =>
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      ).join(' ');
    }

    // Add location if found
    if (location) {
      title += ` in ${location}`;
    }

    return title;
  }

  /**
   * Fetch content from a direct API endpoint
   */
  private async fetchApiContent(context: StoryContext, renderer: IRenderer): Promise<string> {
    if (!this.apiUrl) {
      throw new Error('API URL is required for api source type');
    }

    // Interpolate variables in URL
    let url = this.processText(this.apiUrl, context);

    // Add query params if provided
    if (this.apiParams) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(this.apiParams)) {
        params.append(key, this.processText(value, context));
      }
      const separator = url.includes('?') ? '&' : '?';
      url = `${url}${separator}${params.toString()}`;
    }

    console.log(`[OnlineContentBeat ${this.id}] Fetching: ${url}`);

    // Make the fetch request
    const response = await fetch(url, {
      headers: this.headers,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    // Extract data using JSONPath if provided
    if (this.jsonPath) {
      return this.extractByPath(data, this.jsonPath);
    }

    // Return stringified data if no path specified
    return typeof data === 'string' ? data : JSON.stringify(data);
  }

  /**
   * Fetch content using AI query
   */
  private aiGeneratedTitle: string | null = null;

  private async fetchAIContent(context: StoryContext, renderer: IRenderer): Promise<string> {
    if (!this.query) {
      throw new Error('Query is required for ai-query source type');
    }

    // Check if AI service is available
    const aiService = renderer.getState('aiService');
    if (!aiService || typeof aiService.generateContent !== 'function') {
      throw new Error('AI service not configured. Please configure AI settings.');
    }

    // Interpolate variables in query
    const processedQuery = this.processText(this.query, context);

    console.log(`[OnlineContentBeat ${this.id}] AI Query: ${processedQuery}`);

    // Reset AI-generated title
    this.aiGeneratedTitle = null;

    // Call AI service with conversational prompt
    const result = await aiService.generateContent(
      `You are providing information for an interactive story. The user is exploring a topic.

TOPIC TO RESEARCH: ${processedQuery}

Write a brief, engaging response that:
- Is conversational and friendly in tone
- Presents the key facts naturally, as if explaining to a curious friend
- Uses clear paragraph breaks for readability
- Does NOT repeat or include the original question/topic - start directly with the facts
- Does NOT start with "Based on my research..." or similar phrases
- Does NOT use bullet points or lists - write in flowing prose
- Does NOT include citations, URLs, or "According to..." attributions
- Is approximately ${this.maxWords} words (${Math.round(this.maxWords * 0.8)}-${Math.round(this.maxWords * 1.2)} words acceptable)

IMPORTANT: Start your response with a short, descriptive title on its own line (no formatting prefix, no colon, no quotes), followed by an empty line, then the content. The title should summarize the topic.

Example format:
Transportation and Urban Life in Example City

The city's transportation network features...`,
      { enableWebSearch: true, maxTokens: Math.max(1000, this.maxWords * 4) }
    );

    // Clean up any unwanted patterns that might slip through
    let cleaned = result;

    // Remove Kimi/thinking model's reasoning process
    // These models often output their thinking before the actual response
    const thinkingPatterns = [
      /^.*?(?:The user is asking|Let me search|I need to find|Let me think|I'll search|I should|Let me structure|Word count target|I'll write)[^]*?(?:---+|Let me write:?|Here's my response:?|Final response:?)\s*/i,
      /^.*?(?:For \w+ (?:rates?|data|info|statistics):)[^]*?(?:---+|Let me write|Here's my response)\s*/i,
    ];

    for (const pattern of thinkingPatterns) {
      const match = cleaned.match(pattern);
      if (match) {
        cleaned = cleaned.slice(match[0].length).trim();
        console.log(`[OnlineContentBeat] Removed thinking process (${match[0].length} chars)`);
      }
    }

    // Also check for thinking that ends with "---" separator
    const separatorMatch = cleaned.match(/^[^]*?---+\s*/);
    if (separatorMatch && separatorMatch[0].length < cleaned.length * 0.8) {
      // Only remove if separator is in first 80% (not at the very end)
      cleaned = cleaned.slice(separatorMatch[0].length).trim();
      console.log(`[OnlineContentBeat] Removed content before separator`);
    }

    // Extract AI-generated title from first line (if separated by blank line)
    const titleSplit = cleaned.match(/^([^\n]{5,100})\n\s*\n([\s\S]+)$/);
    if (titleSplit) {
      const potentialTitle = titleSplit[1].trim();
      // Accept as title if it's short, has no periods (not a sentence), and no formatting
      if (!potentialTitle.includes('.') && !potentialTitle.startsWith('#') && !potentialTitle.startsWith('*')) {
        this.aiGeneratedTitle = potentialTitle;
        cleaned = titleSplit[2].trim();
        console.log(`[OnlineContentBeat ${this.id}] Extracted AI title: "${this.aiGeneratedTitle}"`);
      }
    }

    // Remove echoed query from the beginning - AI sometimes repeats the question
    // Check if the response starts with text similar to the query
    const queryWords = processedQuery.toLowerCase().split(/\s+/).slice(0, 8);
    const firstWords = cleaned.toLowerCase().split(/\s+/).slice(0, 10);
    const matchCount = queryWords.filter(w => firstWords.includes(w)).length;

    // If more than half the query words appear in the first 10 words, it's likely echoing
    if (matchCount > queryWords.length / 2) {
      // Find where the actual content starts (after "Based on", ":", or first proper sentence)
      const contentStart = cleaned.match(/(?:Based on[^:]*:|According to[^:]*:|:\s*)/i);
      if (contentStart && contentStart.index !== undefined) {
        cleaned = cleaned.slice(contentStart.index + contentStart[0].length).trim();
      } else {
        // Try to find the first sentence that doesn't contain query words
        const sentences = cleaned.split(/(?<=[.!?])\s+/);
        let startIndex = 0;
        for (let i = 0; i < sentences.length; i++) {
          const sentenceWords = sentences[i].toLowerCase().split(/\s+/);
          const sentenceMatch = queryWords.filter(w => sentenceWords.includes(w)).length;
          if (sentenceMatch < queryWords.length / 3) {
            startIndex = i;
            break;
          }
        }
        if (startIndex > 0) {
          cleaned = sentences.slice(startIndex).join(' ');
        }
      }
    }

    // Remove markdown bold/italic formatting
    cleaned = cleaned
      .replace(/\*\*([^*]+)\*\*/g, '$1')  // **bold** -> bold
      .replace(/\*([^*]+)\*/g, '$1')      // *italic* -> italic
      .replace(/__([^_]+)__/g, '$1')      // __bold__ -> bold
      .replace(/_([^_]+)_/g, '$1')        // _italic_ -> italic
      // Remove common AI preambles at the start only (handle both period and colon endings)
      .replace(/^(Based on|According to|From|My research|I found|Looking at|When examining)[^.:]*[.:]\s*/i, '')
      .replace(/^(Here's|Here is|Here are)[^:]*:\s*/i, '')
      .trim();

    // Ensure content starts with a capital letter
    if (cleaned.length > 0) {
      cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }

    return cleaned;
  }

  /**
   * Simple JSONPath-like extraction (supports basic paths like "$.current.temp_c")
   */
  private extractByPath(data: any, path: string): string {
    // Remove leading $. if present
    const cleanPath = path.startsWith('$.') ? path.slice(2) : path;

    // Split by . and [] for array access
    const parts = cleanPath.split(/\.|\[|\]/).filter(p => p);

    let current = data;
    for (const part of parts) {
      if (current === null || current === undefined) {
        return '';
      }
      // Handle numeric array indices
      const index = parseInt(part, 10);
      if (!isNaN(index) && Array.isArray(current)) {
        current = current[index];
      } else {
        current = current[part];
      }
    }

    return typeof current === 'string' ? current : JSON.stringify(current);
  }
}
