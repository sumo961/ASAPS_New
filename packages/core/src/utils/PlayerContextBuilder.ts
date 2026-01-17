import type { StoryContext } from '../engine/StoryContext';
import type { Story } from '../engine/Story';

export interface PlayerContextOptions {
  /** Specific variable names to include (if empty, includes all) */
  variables?: string[];
  /** Include player inventory */
  includeInventory?: boolean;
  /** Include visited beats history */
  includeHistory?: boolean;
  /** Include counter values */
  includeCounters?: boolean;
  /** Specific counter names to include (if empty, includes all) */
  counters?: string[];
  /** Include character inventories */
  includeCharacterInventories?: boolean;
  /** Maximum history items to include */
  maxHistoryItems?: number;
}

export interface PlayerContextData {
  variables: Record<string, any>;
  counters: Record<string, number>;
  inventory: string[];
  characterInventories?: Record<string, string[]>;
  visitedBeats: string[];
  history: string[];
}

/**
 * Utility class to gather player state for AI prompts
 * Extracts and formats relevant context from StoryContext for use in AI-powered beats
 */
export class PlayerContextBuilder {
  constructor(
    private context: StoryContext,
    private story?: Story
  ) {}

  /**
   * Build a structured context object from player state
   */
  buildContext(options: PlayerContextOptions = {}): PlayerContextData {
    const {
      variables = [],
      includeInventory = true,
      includeHistory = false,
      includeCounters = true,
      counters = [],
      includeCharacterInventories = false,
      maxHistoryItems = 50,
    } = options;

    // Get variables
    const allVariables = this.context.getVariables();
    const selectedVariables: Record<string, any> = {};

    if (variables.length === 0) {
      // Include all variables
      Object.assign(selectedVariables, allVariables);
    } else {
      // Include only specified variables
      for (const varName of variables) {
        if (varName in allVariables) {
          selectedVariables[varName] = allVariables[varName];
        }
      }
    }

    // Get counters
    const allCounters = this.context.getCounters();
    const selectedCounters: Record<string, number> = {};

    if (includeCounters) {
      if (counters.length === 0) {
        // Include all counters
        Object.assign(selectedCounters, allCounters);
      } else {
        // Include only specified counters
        for (const counterName of counters) {
          if (counterName in allCounters) {
            selectedCounters[counterName] = allCounters[counterName];
          }
        }
      }
    }

    // Get inventory
    const inventory = includeInventory ? this.context.getInventory() : [];

    // Get visited beats
    const visitedBeats = this.context.getVisitedBeats();

    // Get history (limited)
    const fullHistory = this.context.getHistory();
    const history = includeHistory
      ? fullHistory.slice(-maxHistoryItems)
      : [];

    // Get character inventories
    const state = this.context.getState();
    const characterInventories = includeCharacterInventories
      ? { ...state.characterInventories }
      : undefined;

    return {
      variables: selectedVariables,
      counters: selectedCounters,
      inventory,
      characterInventories,
      visitedBeats,
      history,
    };
  }

  /**
   * Build a formatted string for AI prompts describing the player's current state
   */
  buildPromptContext(options: PlayerContextOptions = {}): string {
    const data = this.buildContext(options);
    const sections: string[] = [];

    // Variables section
    const varEntries = Object.entries(data.variables);
    if (varEntries.length > 0) {
      const varLines = varEntries.map(([k, v]) => `  - ${k}: ${JSON.stringify(v)}`);
      sections.push(`Player Variables:\n${varLines.join('\n')}`);
    }

    // Counters section
    const counterEntries = Object.entries(data.counters);
    if (counterEntries.length > 0) {
      const counterLines = counterEntries.map(([k, v]) => `  - ${k}: ${v}`);
      sections.push(`Counters:\n${counterLines.join('\n')}`);
    }

    // Inventory section
    if (data.inventory.length > 0) {
      sections.push(`Player Inventory: ${data.inventory.join(', ')}`);
    }

    // Character inventories section
    if (data.characterInventories) {
      const charInvLines: string[] = [];
      for (const [char, items] of Object.entries(data.characterInventories)) {
        if (items.length > 0) {
          charInvLines.push(`  - ${char}: ${items.join(', ')}`);
        }
      }
      if (charInvLines.length > 0) {
        sections.push(`Character Inventories:\n${charInvLines.join('\n')}`);
      }
    }

    // Visited beats section
    if (data.visitedBeats.length > 0) {
      // Get beat names if story is available
      const beatDescriptions = this.getBeatDescriptions(data.visitedBeats);
      if (beatDescriptions.length > 0) {
        sections.push(`Visited Scenes: ${beatDescriptions.join(', ')}`);
      }
    }

    // History section (for journey summary)
    if (data.history.length > 0 && options.includeHistory) {
      const historyDescriptions = this.getBeatDescriptions(data.history);
      sections.push(`Journey Path (${data.history.length} beats):\n${historyDescriptions.join(' → ')}`);
    }

    return sections.join('\n\n');
  }

  /**
   * Build a summary of the player's journey for AI summary generation
   */
  buildJourneySummary(): string {
    const history = this.context.getHistory();
    const variables = this.context.getVariables();
    const counters = this.context.getCounters();
    const inventory = this.context.getInventory();
    const visitedBeats = this.context.getVisitedBeats();

    const sections: string[] = [];

    // Journey statistics
    sections.push(`## Journey Statistics
- Total beats visited: ${history.length}
- Unique beats visited: ${visitedBeats.length}`);

    // Player profile from variables
    const profileVars = ['name', 'playerName', 'gender', 'profession', 'role'];
    const profile: string[] = [];
    for (const varName of profileVars) {
      if (varName in variables && variables[varName]) {
        profile.push(`${varName}: ${variables[varName]}`);
      }
    }
    if (profile.length > 0) {
      sections.push(`## Player Profile
${profile.join('\n')}`);
    }

    // Other variables (excluding profile)
    const otherVars = Object.entries(variables)
      .filter(([k]) => !profileVars.includes(k))
      .map(([k, v]) => `- ${k}: ${JSON.stringify(v)}`);
    if (otherVars.length > 0) {
      sections.push(`## Story Variables
${otherVars.join('\n')}`);
    }

    // Counters
    const counterLines = Object.entries(counters)
      .map(([k, v]) => `- ${k}: ${v}`);
    if (counterLines.length > 0) {
      sections.push(`## Final Counters
${counterLines.join('\n')}`);
    }

    // Inventory
    if (inventory.length > 0) {
      sections.push(`## Final Inventory
${inventory.join(', ')}`);
    }

    // Full journey path
    const journeyPath = this.getBeatDescriptions(history);
    sections.push(`## Journey Path
${journeyPath.join(' → ')}`);

    return sections.join('\n\n');
  }

  /**
   * Get human-readable descriptions for beat IDs
   */
  private getBeatDescriptions(beatIds: string[]): string[] {
    if (!this.story) {
      return beatIds;
    }

    return beatIds.map(id => {
      const beat = this.story!.getBeat(id);
      if (beat) {
        return beat.name || id;
      }
      return id;
    });
  }
}
