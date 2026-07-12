/**
 * Deterministic Command Parser
 *
 * Parses common helper commands using pattern matching instead of AI.
 * Falls back to AI for complex or ambiguous commands.
 *
 * Supported command patterns:
 * - Set backgrounds: "set all backgrounds to forest.jpg"
 * - Set button sounds: "set all button sounds to Soft Click"
 * - Set transitions: "set all transitions to fade 500ms"
 * - Remove elements: "remove all meters from dialog beats"
 */

import type {
  StructuredAction,
  HelperCommandContext,
  HelperCommandResponse,
} from '../types/helperCommand';
import { getVisibleBeatTypeIds, resolveBeatTypeAlias } from './beatSchemaVocabulary';

// ============================================================================
// Types
// ============================================================================

interface ParseResult {
  /** Whether a pattern was matched */
  matched: boolean;

  /** The structured action if matched */
  action?: StructuredAction;

  /** Error message if parsing failed */
  error?: string;
}

interface AssetMatch {
  id: string;
  name: string;
  type: string;
  score: number;
}

interface SoundMatch {
  id: string;
  name: string;
  score: number;
}

// ============================================================================
// Pattern Definitions
// ============================================================================

/**
 * Visible beat types for filtering — derived from the beat schema so new
 * beat types are automatically known here (previously a stale hand list).
 */
const VISIBLE_BEAT_TYPES = getVisibleBeatTypeIds();

/**
 * Valid transition types
 */
const TRANSITION_TYPES = ['none', 'fade', 'slide', 'zoom', 'dissolve'];

/**
 * Command patterns with their parsers
 */
type PatternParser = (match: RegExpMatchArray, context: HelperCommandContext) => ParseResult;

interface CommandPattern {
  /** Pattern name for debugging */
  name: string;

  /** Regex pattern to match */
  pattern: RegExp;

  /** Parser function to create action from match */
  parse: PatternParser;
}

// ============================================================================
// Fuzzy Matching Utilities
// ============================================================================

/**
 * Calculate similarity between two strings (0-1)
 * Uses a simple approach: lowercase comparison + substring matching
 */
function stringSimilarity(a: string, b: string): number {
  const aLower = a.toLowerCase().trim();
  const bLower = b.toLowerCase().trim();

  // Exact match
  if (aLower === bLower) return 1.0;

  // One contains the other
  if (aLower.includes(bLower) || bLower.includes(aLower)) {
    const longer = Math.max(aLower.length, bLower.length);
    const shorter = Math.min(aLower.length, bLower.length);
    return 0.7 + (0.3 * shorter / longer);
  }

  // Check without extension for files
  const aNoExt = aLower.replace(/\.[^.]+$/, '');
  const bNoExt = bLower.replace(/\.[^.]+$/, '');
  if (aNoExt === bNoExt) return 0.95;
  if (aNoExt.includes(bNoExt) || bNoExt.includes(aNoExt)) {
    return 0.8;
  }

  // Word-based matching
  const aWords = aLower.split(/[\s_-]+/);
  const bWords = bLower.split(/[\s_-]+/);
  const matchingWords = aWords.filter(w => bWords.some(bw => bw.includes(w) || w.includes(bw)));
  if (matchingWords.length > 0) {
    return 0.5 + (0.4 * matchingWords.length / Math.max(aWords.length, bWords.length));
  }

  return 0;
}

/**
 * Find best matching asset by name
 */
function findAsset(name: string, assets: HelperCommandContext['assets'], type?: string): AssetMatch | null {
  let bestMatch: AssetMatch | null = null;
  let bestScore = 0;

  for (const asset of assets) {
    // Filter by type if specified
    if (type && asset.type !== type) continue;

    const score = stringSimilarity(name, asset.name);
    if (score > bestScore && score >= 0.5) {
      bestScore = score;
      bestMatch = { ...asset, score };
    }
  }

  return bestMatch;
}

/**
 * Find best matching preset sound by name
 */
function findPresetSound(name: string, presets: HelperCommandContext['presetSounds']): SoundMatch | null {
  if (!presets) return null;

  let bestMatch: SoundMatch | null = null;
  let bestScore = 0;

  for (const preset of presets) {
    // Check both ID and name
    const nameScore = stringSimilarity(name, preset.name);
    const idScore = stringSimilarity(name, preset.id);
    const score = Math.max(nameScore, idScore);

    if (score > bestScore && score >= 0.5) {
      bestScore = score;
      bestMatch = { id: preset.id, name: preset.name, score };
    }
  }

  return bestMatch;
}

/**
 * Parse duration string to milliseconds
 */
function parseDuration(durationStr: string): number | null {
  const str = durationStr.toLowerCase().trim();

  // Match patterns like "500ms", "500 ms", "1s", "1 second", "2 seconds", "1.5s"
  const msMatch = str.match(/^(\d+(?:\.\d+)?)\s*(?:ms|milliseconds?)$/);
  if (msMatch) {
    return Math.round(parseFloat(msMatch[1]));
  }

  const secMatch = str.match(/^(\d+(?:\.\d+)?)\s*(?:s|sec|seconds?)$/);
  if (secMatch) {
    return Math.round(parseFloat(secMatch[1]) * 1000);
  }

  // Plain number assumed to be ms
  const numMatch = str.match(/^(\d+)$/);
  if (numMatch) {
    return parseInt(numMatch[1], 10);
  }

  return null;
}

/**
 * Parse transition type
 */
function parseTransitionType(typeStr: string): string | null {
  const normalized = typeStr.toLowerCase().trim();

  // Direct match
  if (TRANSITION_TYPES.includes(normalized)) {
    return normalized;
  }

  // Fuzzy match
  for (const type of TRANSITION_TYPES) {
    if (type.startsWith(normalized) || normalized.startsWith(type)) {
      return type;
    }
  }

  return null;
}

// ============================================================================
// Command Patterns
// ============================================================================

const COMMAND_PATTERNS: CommandPattern[] = [
  // -------------------------------------------------------------------------
  // Background Commands
  // -------------------------------------------------------------------------
  {
    name: 'set-backgrounds',
    // Matches: "set/change (all) background(s) (of/on visible beats) to <name>"
    pattern: /^(?:set|change|apply)\s+(?:all\s+)?(?:the\s+)?backgrounds?\s+(?:(?:of|on|for)\s+(?:all\s+)?(?:visible\s+)?beats?\s+)?to\s+["']?([^"']+?)["']?\s*$/i,
    parse: (match, context) => {
      const assetName = match[1].trim();
      const asset = findAsset(assetName, context.assets, 'background');

      if (!asset) {
        // Try without type filter
        const anyAsset = findAsset(assetName, context.assets);
        if (!anyAsset) {
          return {
            matched: true,
            error: `Could not find asset matching "${assetName}". Available backgrounds: ${context.assets.filter(a => a.type === 'background').map(a => a.name).slice(0, 5).join(', ')}`,
          };
        }
        // Use any matching asset
        return createBackgroundAction(anyAsset.id, assetName);
      }

      return createBackgroundAction(asset.id, assetName);
    },
  },
  {
    name: 'set-backgrounds-alt',
    // Matches: "set/change (all) (visible) beat background(s) to <name>"
    pattern: /^(?:set|change|apply)\s+(?:all\s+)?(?:visible\s+)?beats?\s+backgrounds?\s+to\s+["']?([^"']+?)["']?\s*$/i,
    parse: (match, context) => {
      const assetName = match[1].trim();
      const asset = findAsset(assetName, context.assets, 'background');

      if (!asset) {
        return {
          matched: true,
          error: `Could not find background asset matching "${assetName}"`,
        };
      }

      return createBackgroundAction(asset.id, assetName);
    },
  },

  // -------------------------------------------------------------------------
  // Button Sound Commands
  // -------------------------------------------------------------------------
  {
    name: 'set-button-sounds',
    // Matches: "set/change (all) button sound(s) to <name>"
    pattern: /^(?:set|change|apply|add)\s+(?:all\s+)?(?:the\s+)?button\s+sounds?\s+to\s+["']?([^"']+?)["']?\s*$/i,
    parse: (match, context) => {
      const soundName = match[1].trim();
      return parseButtonSoundCommand(soundName, context);
    },
  },
  {
    name: 'apply-sound-to-buttons',
    // Matches: "apply (sound/sound effect) <name> to (all) buttons"
    pattern: /^(?:apply|add|set)\s+(?:(?:the\s+)?(?:sound|sound\s+effect)\s+)?["']?([^"']+?)["']?\s+to\s+(?:all\s+)?buttons?\s*$/i,
    parse: (match, context) => {
      const soundName = match[1].trim();
      return parseButtonSoundCommand(soundName, context);
    },
  },

  // -------------------------------------------------------------------------
  // Transition Commands
  // -------------------------------------------------------------------------
  {
    name: 'set-transitions',
    // Matches: "set/change (all) transition(s) to <type> [duration]"
    pattern: /^(?:set|change|apply)\s+(?:all\s+)?(?:the\s+)?transitions?\s+to\s+(\w+)(?:\s+(\d+(?:\.\d+)?\s*(?:ms|s|sec|seconds?|milliseconds?)?))?(?:\s+(?:on|for)\s+(?:all\s+)?(?:visible\s+)?beats?)?\s*$/i,
    parse: (match, context) => {
      const typeStr = match[1];
      const durationStr = match[2];
      return parseTransitionCommand(typeStr, durationStr);
    },
  },
  {
    name: 'set-transitions-alt',
    // Matches: "set (all) (visible) beat transition(s) to <type> [duration]"
    pattern: /^(?:set|change|apply)\s+(?:all\s+)?(?:visible\s+)?beats?\s+transitions?\s+to\s+(\w+)(?:\s+(\d+(?:\.\d+)?\s*(?:ms|s|sec|seconds?|milliseconds?)?))?$/i,
    parse: (match, context) => {
      const typeStr = match[1];
      const durationStr = match[2];
      return parseTransitionCommand(typeStr, durationStr);
    },
  },

  // -------------------------------------------------------------------------
  // Remove Commands
  // -------------------------------------------------------------------------
  {
    name: 'remove-elements',
    // Matches: "remove (all) <element-type> from <beat-type> beats"
    pattern: /^remove\s+(?:all\s+)?(\w+)s?\s+from\s+(?:all\s+)?(\w+)\s+beats?\s*$/i,
    parse: (match, context) => {
      const elementType = match[1].toLowerCase();
      const beatType = match[2].toLowerCase();
      return parseRemoveCommand(elementType, beatType, context);
    },
  },
];

// ============================================================================
// Action Creators
// ============================================================================

function createBackgroundAction(assetId: string, originalName: string): ParseResult {
  return {
    matched: true,
    action: {
      actionType: 'setProperty',
      targetSelector: {
        targetType: 'beat',
        filters: {
          beatTypes: VISIBLE_BEAT_TYPES,
        },
      },
      modification: {
        type: 'set',
        property: 'node',
        value: assetId,
      },
      confidence: 1.0,
      interpretation: `Set background to "${originalName}" on all visible beats`,
    },
  };
}

function parseButtonSoundCommand(soundName: string, context: HelperCommandContext): ParseResult {
  // Try preset sounds first
  const preset = findPresetSound(soundName, context.presetSounds);
  if (preset) {
    return {
      matched: true,
      action: {
        actionType: 'setProperty',
        targetSelector: {
          targetType: 'location',
          filters: {
            locationKind: ['button'],
          },
        },
        modification: {
          type: 'set',
          property: 'sound',
          value: preset.id,
        },
        confidence: 1.0,
        interpretation: `Set sound "${preset.name}" on all buttons`,
      },
    };
  }

  // Try custom sound assets
  const soundAsset = findAsset(soundName, context.assets, 'sound');
  if (soundAsset) {
    return {
      matched: true,
      action: {
        actionType: 'setProperty',
        targetSelector: {
          targetType: 'location',
          filters: {
            locationKind: ['button'],
          },
        },
        modification: {
          type: 'set',
          property: 'sound',
          value: soundAsset.id,
        },
        confidence: 1.0,
        interpretation: `Set sound "${soundAsset.name}" on all buttons`,
      },
    };
  }

  // List available sounds
  const availableSounds = [
    ...(context.presetSounds?.map(s => s.name) || []),
    ...context.assets.filter(a => a.type === 'sound').map(a => a.name),
  ].slice(0, 8);

  return {
    matched: true,
    error: `Could not find sound matching "${soundName}". Available sounds: ${availableSounds.join(', ')}`,
  };
}

function parseTransitionCommand(typeStr: string, durationStr?: string): ParseResult {
  const transitionType = parseTransitionType(typeStr);
  if (!transitionType) {
    return {
      matched: true,
      error: `Unknown transition type "${typeStr}". Valid types: ${TRANSITION_TYPES.join(', ')}`,
    };
  }

  // Parse duration or use default
  let duration = 500; // default
  if (durationStr) {
    const parsed = parseDuration(durationStr);
    if (parsed === null) {
      return {
        matched: true,
        error: `Could not parse duration "${durationStr}". Use formats like "500ms", "1s", or "1 second"`,
      };
    }
    duration = parsed;
  }

  return {
    matched: true,
    action: {
      actionType: 'setProperty',
      targetSelector: {
        targetType: 'beat',
        filters: {
          beatTypes: VISIBLE_BEAT_TYPES,
        },
      },
      modification: {
        type: 'set',
        property: 'transition',
        value: {
          type: transitionType,
          duration: duration,
        },
      },
      confidence: 1.0,
      interpretation: `Set transition to ${transitionType} ${duration}ms on all visible beats`,
    },
  };
}

function parseRemoveCommand(elementType: string, beatType: string, context: HelperCommandContext): ParseResult {
  // Map element types to location kinds
  const elementToKind: Record<string, string> = {
    'meter': 'meter',
    'button': 'button',
    'character': 'character',
    'prop': 'prop',
    'textbox': 'textbox',
  };

  // The matching regex `(\w+)s?` is greedy, so a plural element ("meters",
  // "buttons") is captured WITH its trailing 's' — the s? never strips it.
  // Fall back to the de-pluralized key so the documented plural forms work.
  const locationKind = elementToKind[elementType] ?? elementToKind[elementType.replace(/s$/, '')];
  if (!locationKind) {
    return {
      matched: true,
      error: `Unknown element type "${elementType}". Valid types: ${Object.keys(elementToKind).join(', ')}`,
    };
  }

  // Normalize beat type
  const normalizedBeatType = normalizeBeatType(beatType);
  if (!normalizedBeatType) {
    return {
      matched: true,
      error: `Unknown beat type "${beatType}". Available types: ${context.beatTypes.join(', ')}`,
    };
  }

  return {
    matched: true,
    action: {
      actionType: 'removeElement',
      targetSelector: {
        targetType: 'location',
        filters: {
          beatTypes: [normalizedBeatType],
          locationKind: [locationKind as any],
        },
      },
      modification: {
        type: 'remove',
        property: locationKind,
      },
      confidence: 1.0,
      interpretation: `Remove all ${elementType}s from ${normalizedBeatType} beats`,
    },
  };
}

/**
 * Normalize beat type name to match actual type
 */
function normalizeBeatType(input: string): string | null {
  // Schema-derived: ids + display names + curated colloquial shorthands
  // ("timed" → durScreen). Previously a hand map that stopped at ~13 types.
  return resolveBeatTypeAlias(input);
}

// ============================================================================
// Main Parser Class
// ============================================================================

/**
 * Deterministic command parser
 */
export class DeterministicCommandParser {
  /**
   * Try to parse a command deterministically
   * Returns null if the command doesn't match any known patterns
   */
  parse(command: string, context: HelperCommandContext): HelperCommandResponse | null {
    const normalizedCommand = command.trim();

    for (const pattern of COMMAND_PATTERNS) {
      const match = normalizedCommand.match(pattern.pattern);
      if (match) {
        console.log(`[DeterministicParser] Matched pattern: ${pattern.name}`);
        const result = pattern.parse(match, context);

        if (result.error) {
          // Pattern matched but parsing failed - return error response
          return {
            action: {
              actionType: 'setProperty',
              targetSelector: { targetType: 'beat', filters: {} },
              modification: { type: 'set' },
              confidence: 0,
              interpretation: result.error,
            },
            fullyUnderstood: false,
            clarificationQuestions: [result.error],
          };
        }

        if (result.action) {
          return {
            action: result.action,
            fullyUnderstood: true,
          };
        }
      }
    }

    // No pattern matched - return null to fall back to AI
    console.log('[DeterministicParser] No pattern matched, falling back to AI');
    return null;
  }

  /**
   * Check if AI is needed for a command
   * Returns true if the command likely needs AI interpretation
   */
  needsAI(command: string): boolean {
    const lowerCommand = command.toLowerCase();

    // Commands that always need AI
    const aiPatterns = [
      /change\s+["']?\w+["']?\s+to\s+["']?\w+["']?\s+with\s+(?:correct\s+)?pronouns/i, // Text with pronouns
      /adapt|semantic|context/i, // Context adaptation
      /replace\s+.+\s+in\s+(?:all\s+)?text/i, // Text replacement
      /except|excluding|but\s+not/i, // Exclusions need AI
    ];

    return aiPatterns.some(p => p.test(lowerCommand));
  }
}

// ============================================================================
// Singleton
// ============================================================================

let parserInstance: DeterministicCommandParser | null = null;

export function getDeterministicParser(): DeterministicCommandParser {
  if (!parserInstance) {
    parserInstance = new DeterministicCommandParser();
  }
  return parserInstance;
}
