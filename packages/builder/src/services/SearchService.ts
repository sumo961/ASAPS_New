import type { Beat } from '@asaps/core';
import type { Character } from '../types/character';
import type { Asset } from '../components/assets/AssetManager';
import { SEARCHABLE_TEXT_FIELDS } from '../utils/searchableTextFields';

/**
 * Represents a single search match in the project
 */
export interface SearchMatch {
  /** Type of content where match was found */
  type: 'beat' | 'location' | 'character' | 'metadata' | 'variable' | 'counter' | 'asset';
  /** ID of the matched item */
  id: string;
  /** Field path where the match was found (e.g., 'dialogTree.text') */
  field: string;
  /** The matched value (the text containing the match) */
  value: string;
  /** Start index of match within the value */
  matchStart: number;
  /** End index of match within the value */
  matchEnd: number;
  /** Additional context for the match */
  context: {
    beatId?: string;
    beatName?: string;
    beatType?: string;
    characterId?: string;
    characterName?: string;
    assetId?: string;
    assetName?: string;
  };
}

/**
 * Options for controlling search behavior
 */
export interface SearchOptions {
  /** Case-sensitive matching */
  caseSensitive?: boolean;
  /** Match whole words only */
  wholeWord?: boolean;
  /** Treat query as regex */
  useRegex?: boolean;
  /** Which content types to search in */
  searchIn?: {
    beats?: boolean;
    locations?: boolean;
    characters?: boolean;
    metadata?: boolean;
    variables?: boolean;
    counters?: boolean;
    assets?: boolean;
  };
}

/**
 * Result of a replace operation
 */
export interface ReplaceResult {
  success: boolean;
  replacedCount: number;
  errors: string[];
}

/**
 * SearchService - Provides project-wide search and replace functionality
 */
export class SearchService {
  private beats: Beat[] = [];
  private characters: Character[] = [];
  private assets: Asset[] = [];
  private metadata: { title?: string; author?: string } = {};
  private variables: Record<string, any> = {};
  private counters: Record<string, any> = {};

  /**
   * Update the data to search through
   */
  setData(data: {
    beats?: Beat[];
    characters?: Character[];
    assets?: Asset[];
    metadata?: { title?: string; author?: string };
    variables?: Record<string, any>;
    counters?: Record<string, any>;
  }): void {
    if (data.beats !== undefined) this.beats = data.beats;
    if (data.characters !== undefined) this.characters = data.characters;
    if (data.assets !== undefined) this.assets = data.assets;
    if (data.metadata !== undefined) this.metadata = data.metadata;
    if (data.variables !== undefined) this.variables = data.variables;
    if (data.counters !== undefined) this.counters = data.counters;
  }

  /**
   * Search for matches across all project content
   */
  search(query: string, options: SearchOptions = {}): SearchMatch[] {
    if (!query) return [];

    const matches: SearchMatch[] = [];
    const searchIn = {
      beats: true,
      locations: true,
      characters: true,
      metadata: true,
      variables: true,
      counters: true,
      assets: true,
      ...options.searchIn,
    };

    // Build the search pattern
    let pattern: RegExp;
    try {
      if (options.useRegex) {
        pattern = new RegExp(query, options.caseSensitive ? 'g' : 'gi');
      } else {
        const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const wordBoundary = options.wholeWord ? '\\b' : '';
        pattern = new RegExp(
          `${wordBoundary}${escapedQuery}${wordBoundary}`,
          options.caseSensitive ? 'g' : 'gi'
        );
      }
    } catch (e) {
      console.error('[SearchService] Invalid regex pattern:', e);
      return [];
    }

    // Search in metadata
    if (searchIn.metadata) {
      this.searchInMetadata(pattern, matches);
    }

    // Search in beats
    if (searchIn.beats || searchIn.locations) {
      this.searchInBeats(pattern, matches, searchIn);
    }

    // Search in characters
    if (searchIn.characters || searchIn.counters) {
      this.searchInCharacters(pattern, matches, searchIn);
    }

    // Search in assets
    if (searchIn.assets) {
      this.searchInAssets(pattern, matches);
    }

    // Search in variables
    if (searchIn.variables) {
      this.searchInVariables(pattern, matches);
    }

    return matches;
  }

  private searchInMetadata(pattern: RegExp, matches: SearchMatch[]): void {
    if (this.metadata.title) {
      this.findMatches(this.metadata.title, pattern, (matchStart, matchEnd, value) => {
        matches.push({
          type: 'metadata',
          id: 'story-title',
          field: 'title',
          value,
          matchStart,
          matchEnd,
          context: {},
        });
      });
    }

    if (this.metadata.author) {
      this.findMatches(this.metadata.author, pattern, (matchStart, matchEnd, value) => {
        matches.push({
          type: 'metadata',
          id: 'story-author',
          field: 'author',
          value,
          matchStart,
          matchEnd,
          context: {},
        });
      });
    }
  }

  private searchInBeats(
    pattern: RegExp,
    matches: SearchMatch[],
    searchIn: { beats?: boolean; locations?: boolean }
  ): void {
    for (const beat of this.beats) {
      const context = {
        beatId: beat.id,
        beatName: beat.name,
        beatType: beat.type,
      };

      if (searchIn.beats) {
        // Search in beat name
        this.findMatches(beat.name, pattern, (matchStart, matchEnd, value) => {
          matches.push({
            type: 'beat',
            id: beat.id,
            field: 'name',
            value,
            matchStart,
            matchEnd,
            context,
          });
        });

        // Search in beat-specific content based on type
        const params = beat.getParameters();
        this.searchInBeatParameters(beat, params, pattern, matches, context);
      }

      // Search in locations
      if (searchIn.locations && beat.locations) {
        for (const [locName, location] of beat.locations) {
          this.findMatches(locName, pattern, (matchStart, matchEnd, value) => {
            matches.push({
              type: 'location',
              id: `${beat.id}:${locName}`,
              field: 'name',
              value,
              matchStart,
              matchEnd,
              context,
            });
          });
        }
      }
    }
  }

  private searchInBeatParameters(
    beat: Beat,
    params: any,
    pattern: RegExp,
    matches: SearchMatch[],
    context: { beatId?: string; beatName?: string; beatType?: string }
  ): void {
    // Search in dialogTree content
    if (params.dialogTree) {
      this.searchInDialogNode(params.dialogTree, pattern, matches, context, 'dialogTree');
    }

    // Search in text fields common to various beat types — the shared list,
    // so Search & Replace and Transformations cover the same text.
    for (const field of SEARCHABLE_TEXT_FIELDS) {
      if (params[field] && typeof params[field] === 'string') {
        this.findMatches(params[field], pattern, (matchStart, matchEnd, value) => {
          matches.push({
            type: 'beat',
            id: beat.id,
            field,
            value,
            matchStart,
            matchEnd,
            context,
          });
        });
      }
    }

    // Top-level speaker: several beat types keep `speaker` on the Beat
    // itself without exposing it through getParameters, so a character
    // rename silently missed exactly those types. Only when the params copy
    // is absent, to avoid double matches.
    const topLevelSpeaker = (beat as any).speaker;
    if (!params.speaker && topLevelSpeaker && typeof topLevelSpeaker === 'string') {
      this.findMatches(topLevelSpeaker, pattern, (matchStart, matchEnd, value) => {
        matches.push({
          type: 'beat',
          id: beat.id,
          field: 'speaker',
          value,
          matchStart,
          matchEnd,
          context,
        });
      });
    }

    // Choice labels (multiChoice / movementChoice / pickProp props share the
    // shape) and text variations — indexed paths so replace can write back
    // through the same nested-path applier the flat fields use.
    if (Array.isArray(params.choices)) {
      params.choices.forEach((choice: any, i: number) => {
        if (choice?.text && typeof choice.text === 'string') {
          this.findMatches(choice.text, pattern, (matchStart, matchEnd, value) => {
            matches.push({
              type: 'beat',
              id: beat.id,
              field: `choices[${i}].text`,
              value,
              matchStart,
              matchEnd,
              context,
            });
          });
        }
      });
    }
    if (Array.isArray(params.props)) {
      params.props.forEach((prop: any, i: number) => {
        if (prop?.text && typeof prop.text === 'string') {
          this.findMatches(prop.text, pattern, (matchStart, matchEnd, value) => {
            matches.push({
              type: 'beat',
              id: beat.id,
              field: `props[${i}].text`,
              value,
              matchStart,
              matchEnd,
              context,
            });
          });
        }
      });
    }
    if (Array.isArray(params.textVariations)) {
      params.textVariations.forEach((variation: any, i: number) => {
        if (typeof variation === 'string' && variation) {
          this.findMatches(variation, pattern, (matchStart, matchEnd, value) => {
            matches.push({
              type: 'beat',
              id: beat.id,
              field: `textVariations[${i}]`,
              value,
              matchStart,
              matchEnd,
              context,
            });
          });
        }
      });
    }
  }

  private searchInDialogNode(
    node: any,
    pattern: RegExp,
    matches: SearchMatch[],
    context: { beatId?: string; beatName?: string; beatType?: string },
    fieldPrefix: string
  ): void {
    if (!node) return;

    // Search in speaker
    if (node.speaker) {
      this.findMatches(node.speaker, pattern, (matchStart, matchEnd, value) => {
        matches.push({
          type: 'beat',
          id: context.beatId!,
          field: `${fieldPrefix}.speaker`,
          value,
          matchStart,
          matchEnd,
          context,
        });
      });
    }

    // Search in text
    if (node.text) {
      this.findMatches(node.text, pattern, (matchStart, matchEnd, value) => {
        matches.push({
          type: 'beat',
          id: context.beatId!,
          field: `${fieldPrefix}.text`,
          value,
          matchStart,
          matchEnd,
          context,
        });
      });
    }

    // Search in choices
    if (node.choices && Array.isArray(node.choices)) {
      node.choices.forEach((choice: any, index: number) => {
        if (choice.text) {
          this.findMatches(choice.text, pattern, (matchStart, matchEnd, value) => {
            matches.push({
              type: 'beat',
              id: context.beatId!,
              field: `${fieldPrefix}.choices[${index}].text`,
              value,
              matchStart,
              matchEnd,
              context,
            });
          });
        }

        // Recursively search in nested dialogNodes
        if (choice.dialogNode) {
          this.searchInDialogNode(
            choice.dialogNode,
            pattern,
            matches,
            context,
            `${fieldPrefix}.choices[${index}].dialogNode`
          );
        }
      });
    }
  }

  private searchInCharacters(
    pattern: RegExp,
    matches: SearchMatch[],
    searchIn: { characters?: boolean; counters?: boolean }
  ): void {
    for (const character of this.characters) {
      const context = {
        characterId: character.id,
        characterName: character.name,
      };

      if (searchIn.characters) {
        // Search in character name
        this.findMatches(character.name, pattern, (matchStart, matchEnd, value) => {
          matches.push({
            type: 'character',
            id: character.id,
            field: 'name',
            value,
            matchStart,
            matchEnd,
            context,
          });
        });

        // Search in state names
        if (character.states) {
          character.states.forEach((state, index) => {
            if (state.name) {
              this.findMatches(state.name, pattern, (matchStart, matchEnd, value) => {
                matches.push({
                  type: 'character',
                  id: character.id,
                  field: `states[${index}].name`,
                  value,
                  matchStart,
                  matchEnd,
                  context,
                });
              });
            }
          });
        }
      }

      if (searchIn.counters && character.counters) {
        character.counters.forEach((counter, index) => {
          if (counter.name) {
            this.findMatches(counter.name, pattern, (matchStart, matchEnd, value) => {
              matches.push({
                type: 'counter',
                id: `${character.id}:${counter.name}`,
                field: 'name',
                value,
                matchStart,
                matchEnd,
                context,
              });
            });
          }
          if (counter.displayName) {
            this.findMatches(counter.displayName, pattern, (matchStart, matchEnd, value) => {
              matches.push({
                type: 'counter',
                id: `${character.id}:${counter.name}`,
                field: 'displayName',
                value,
                matchStart,
                matchEnd,
                context,
              });
            });
          }
        });
      }
    }
  }

  private searchInAssets(pattern: RegExp, matches: SearchMatch[]): void {
    for (const asset of this.assets) {
      const context = {
        assetId: asset.id,
        assetName: asset.name,
      };

      this.findMatches(asset.name, pattern, (matchStart, matchEnd, value) => {
        matches.push({
          type: 'asset',
          id: asset.id,
          field: 'name',
          value,
          matchStart,
          matchEnd,
          context,
        });
      });
    }
  }

  private searchInVariables(pattern: RegExp, matches: SearchMatch[]): void {
    for (const [varName, varValue] of Object.entries(this.variables)) {
      this.findMatches(varName, pattern, (matchStart, matchEnd, value) => {
        matches.push({
          type: 'variable',
          id: varName,
          field: 'name',
          value,
          matchStart,
          matchEnd,
          context: {},
        });
      });

      if (typeof varValue === 'string') {
        this.findMatches(varValue, pattern, (matchStart, matchEnd, value) => {
          matches.push({
            type: 'variable',
            id: varName,
            field: 'value',
            value,
            matchStart,
            matchEnd,
            context: {},
          });
        });
      }
    }
  }

  private findMatches(
    text: string,
    pattern: RegExp,
    callback: (matchStart: number, matchEnd: number, value: string) => void
  ): void {
    if (!text) return;

    // Reset regex lastIndex for global patterns
    pattern.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      callback(match.index, match.index + match[0].length, text);

      // Prevent infinite loops with zero-length matches
      if (match[0].length === 0) {
        pattern.lastIndex++;
      }
    }
  }

  /**
   * Replace matches with new text
   * Returns callbacks that can be used to apply the replacements to the actual data
   */
  createReplacements(
    matches: SearchMatch[],
    replacement: string
  ): Array<{
    match: SearchMatch;
    apply: () => void;
    newValue: string;
  }> {
    return matches.map((match) => {
      const newValue =
        match.value.substring(0, match.matchStart) +
        replacement +
        match.value.substring(match.matchEnd);

      return {
        match,
        newValue,
        apply: () => {
          // This is a placeholder - actual replacement needs to be done
          // through the appropriate update functions in useStoryBuilder
          console.log(`[SearchService] Would replace in ${match.type}:${match.id}.${match.field}`);
          console.log(`  From: "${match.value.substring(match.matchStart, match.matchEnd)}"`);
          console.log(`  To: "${replacement}"`);
        },
      };
    });
  }
}

// Singleton instance
export const searchService = new SearchService();
