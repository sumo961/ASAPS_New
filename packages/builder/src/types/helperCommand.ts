/**
 * Helper Command Types
 *
 * Type definitions for AI-powered bulk story operations.
 * These types define the structure of natural language commands
 * parsed into structured actions that can be executed deterministically.
 */

import type { Beat, Connection } from '@asaps/core';

// ============================================================================
// Core Action Types
// ============================================================================

/**
 * Structured action parsed from natural language command
 */
export interface StructuredAction {
  /** Type of action to perform */
  actionType: ActionType;

  /** Selector for target elements */
  targetSelector: ElementSelector;

  /** What modification to apply */
  modification: Modification;

  /** Optional exclusion selector for "except" clauses */
  exclusionSelector?: ElementSelector;

  /** AI confidence score (0-1) */
  confidence: number;

  /** Human-readable interpretation of the command */
  interpretation: string;

  /** Reasoning for the interpretation */
  reasoning?: string;
}

/**
 * Types of actions that can be performed
 */
export type ActionType =
  | 'setProperty'      // Set a property value on elements
  | 'addElement'       // Add an element (location, connection, etc.)
  | 'removeElement'    // Remove an element
  | 'moveElement'      // Change position of elements
  | 'copyElement'      // Copy element from one place to another
  | 'transformText';   // AI-powered text transformation

// ============================================================================
// Element Selectors
// ============================================================================

/**
 * Selector for targeting elements in the story
 */
export interface ElementSelector {
  /** What type of element to target */
  targetType: SelectorTargetType;

  /** Filter criteria */
  filters: SelectorFilters;
}

/**
 * Types of elements that can be selected
 */
export type SelectorTargetType =
  | 'beat'
  | 'location'
  | 'cluster'
  | 'connection'
  | 'text';  // For text transformation operations

/**
 * Filter criteria for selecting elements
 */
export interface SelectorFilters {
  /** Filter by beat type(s) */
  beatTypes?: string[];

  /** Filter by cluster name (exact or pattern) */
  clusterName?: string;

  /** Filter by cluster ID */
  clusterId?: string;

  /** Filter by beat name pattern (supports wildcards) */
  beatNamePattern?: string;

  /** Filter by beat ID(s) */
  beatIds?: string[];

  /** Filter locations by kind */
  locationKind?: LocationKind[];

  /** Filter locations by name pattern */
  locationNamePattern?: string;

  /** Filter by presence of a property */
  hasProperty?: string;

  /** Filter by property value */
  propertyValue?: {
    property: string;
    value: any;
    operator?: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'regex';
  };

  /** Filter beats that have specific connection targets */
  connectsTo?: string[];

  /** Filter beats that are connected from specific sources */
  connectedFrom?: string[];

  /** For text selectors: scope of text to search */
  textScope?: TextScope;
}

/**
 * Types of locations within beats
 */
export type LocationKind = 'button' | 'character' | 'prop' | 'meter' | 'textbox';

/**
 * Scope for text transformations
 */
export type TextScope = 'all' | 'dialog' | 'buttons' | 'narration' | 'titles';

// ============================================================================
// Modifications
// ============================================================================

/**
 * Describes what modification to apply to selected elements
 */
export interface Modification {
  /** Type of modification */
  type: ModificationType;

  /** Property to modify (for set/add/remove operations) */
  property?: string;

  /** Value to set or add */
  value?: any;

  /** For relative positioning */
  relativePosition?: RelativePosition;

  /** For text transformations */
  textTransform?: TextTransform;

  /** Source element for copy operations */
  copySource?: {
    beatId?: string;
    beatName?: string;
    property?: string;
  };
}

/**
 * Types of modifications
 */
export type ModificationType =
  | 'set'        // Set a property value
  | 'add'        // Add to a collection
  | 'remove'     // Remove from a collection
  | 'transform'; // Apply a transformation

/**
 * Relative positioning specification
 */
export interface RelativePosition {
  /** Reference element to position relative to */
  relativeTo: {
    kind?: LocationKind;
    namePattern?: string;
    assetId?: string;
  };

  /** Direction relative to reference */
  direction: 'left' | 'right' | 'above' | 'below' | 'next-to';

  /** Offset in pixels */
  offset?: number;

  /** Whether to match the scale of the reference */
  matchScale?: boolean;
}

/**
 * Single text replacement pair
 */
export interface TextReplacement {
  /** Text/pattern to find */
  find: string;

  /** Text to replace with */
  replace: string;
}

/**
 * Text transformation specification
 */
export interface TextTransform {
  /** Primary text/pattern to find (for backward compatibility) */
  findPattern: string;

  /** Primary text to replace with (for backward compatibility) */
  replacement: string;

  /** Additional replacements (for multiple find/replace pairs) */
  additionalReplacements?: TextReplacement[];

  /** Whether to adjust pronouns for gender changes */
  adjustPronouns: boolean;

  /** Scope of text to transform */
  scope: TextScope;

  /** Whether to use regex matching */
  useRegex?: boolean;

  /** Whether to match case-insensitively */
  caseInsensitive?: boolean;

  /**
   * Whether to adapt surrounding context semantically.
   * When true, the AI will analyze and transform related terms
   * (e.g., "blacksmith" → "jeweler" would also change "forge" → "workshop", "sword" → "jewelry")
   */
  adaptContext?: boolean;
}

// ============================================================================
// Preview Types
// ============================================================================

/**
 * Preview of changes before execution
 */
export interface ChangePreview {
  /** Total number of elements affected */
  totalAffected: number;

  /** Changes grouped by type */
  changesByType: Map<string, ChangeGroup>;

  /** List of individual changes */
  changes: PreviewChange[];

  /** Warnings about potential issues */
  warnings: string[];

  /** Errors that would prevent execution */
  errors: string[];
}

/**
 * Group of changes by element type
 */
export interface ChangeGroup {
  /** Type of elements in this group */
  type: SelectorTargetType;

  /** Number of elements affected */
  count: number;

  /** Sample of affected element names */
  sampleNames: string[];
}

/**
 * Individual change preview
 */
export interface PreviewChange {
  /** Unique identifier for this change */
  id: string;

  /** Type of element being changed */
  elementType: SelectorTargetType;

  /** ID of the element */
  elementId: string;

  /** Display name of the element */
  elementName: string;

  /** Property being changed */
  property: string;

  /** Current value */
  oldValue: any;

  /** New value after change */
  newValue: any;

  /** For text transforms: diff of the change */
  textDiff?: TextDiff;
}

/**
 * Text difference for preview
 */
export interface TextDiff {
  /** Original text */
  original: string;

  /** Modified text */
  modified: string;

  /** Highlighted segments showing changes */
  segments: DiffSegment[];
}

/**
 * Segment of a text diff
 */
export interface DiffSegment {
  /** Text content */
  text: string;

  /** Type of change */
  type: 'unchanged' | 'removed' | 'added';
}

// ============================================================================
// Execution Types
// ============================================================================

/**
 * Result of executing a helper command
 */
export interface ExecutionResult {
  /** Whether execution succeeded */
  success: boolean;

  /** Number of elements modified */
  modifiedCount: number;

  /** Error message if failed */
  error?: string;

  /** Detailed results per element */
  details: ExecutionDetail[];
}

/**
 * Detail of a single element modification
 */
export interface ExecutionDetail {
  /** Element ID */
  elementId: string;

  /** Whether this specific modification succeeded */
  success: boolean;

  /** Error message if failed */
  error?: string;
}

// ============================================================================
// AI Interpretation Types
// ============================================================================

/**
 * Request for AI to interpret a natural language command
 */
export interface HelperCommandRequest {
  /** Natural language command from user */
  command: string;

  /** Context about the story */
  storyContext: HelperCommandContext;
}

/**
 * Context provided to AI for interpretation
 */
export interface HelperCommandContext {
  /** List of beat types available */
  beatTypes: string[];

  /** List of cluster names */
  clusterNames: string[];

  /** List of asset names with their types */
  assets: {
    id: string;
    name: string;
    type: 'background' | 'character' | 'prop' | 'sound';
  }[];

  /** List of character names */
  characterNames: string[];

  /** Sample beat names */
  sampleBeatNames: string[];

  /** Available properties that can be modified */
  modifiableProperties: {
    beats: string[];
    locations: string[];
    transitions: string[];
  };

  /** Built-in preset sounds (id → name) */
  presetSounds?: {
    id: string;
    name: string;
    category: string;
  }[];

  /** Visible beat types (can have transitions, locations, etc.) */
  visibleBeatTypes?: string[];

  /** Invisible beat types (logic-only, no visuals) */
  invisibleBeatTypes?: string[];
}

/**
 * Response from AI interpretation
 */
export interface HelperCommandResponse {
  /** Parsed structured action */
  action: StructuredAction;

  /** Suggestions if command is ambiguous */
  suggestions?: string[];

  /** Whether the command was fully understood */
  fullyUnderstood: boolean;

  /** Questions to clarify if not fully understood */
  clarificationQuestions?: string[];
}

// ============================================================================
// History Types
// ============================================================================

/**
 * Recent command for history
 */
export interface RecentCommand {
  /** Command text */
  command: string;

  /** When it was executed */
  timestamp: Date;

  /** Number of elements affected */
  affectedCount: number;

  /** Whether it was successful */
  success: boolean;
}

// ============================================================================
// UI State Types
// ============================================================================

/**
 * State of the helper command panel
 */
export interface HelperCommandPanelState {
  /** Whether the panel is open */
  isOpen: boolean;

  /** Current command input */
  command: string;

  /** Whether AI is interpreting */
  isInterpreting: boolean;

  /** Current parsed action */
  parsedAction: StructuredAction | null;

  /** Current preview */
  preview: ChangePreview | null;

  /** Whether preview is being generated */
  isGeneratingPreview: boolean;

  /** Recent commands */
  recentCommands: RecentCommand[];

  /** Error message */
  error: string | null;
}

// ============================================================================
// Example Commands
// ============================================================================

/**
 * Example commands for the UI
 */
export const EXAMPLE_COMMANDS = [
  {
    command: "Apply the sound effect 'pling' to all buttons",
    description: "Adds a click sound to every button location",
    category: 'sound'
  },
  {
    command: "Set all beat transitions to fade 500ms except cluster 'the jazz club'",
    description: "Changes transition style with cluster exception",
    category: 'transition'
  },
  {
    command: "Place character 'Robber_#2' next to 'Robber_#1' in all beats",
    description: "Positions a character relative to another",
    category: 'position'
  },
  {
    command: "Add background 'forest_day' to all dialogTree beats",
    description: "Sets background for specific beat type",
    category: 'background'
  },
  {
    command: "Remove all meters from dialog beats",
    description: "Removes meter locations from beats",
    category: 'remove'
  },
  {
    command: "Change 'Prince' to 'Princess' with correct pronouns",
    description: "AI-powered text transformation with pronoun adjustment",
    category: 'text'
  }
] as const;
