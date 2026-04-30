/**
 * Character System Types
 * Defines the data model for characters in ASPS stories
 */

export interface Character {
  id: string;
  name: string;
  displayName: string;
  role: 'player' | 'npc' | 'companion';
  
  // Visual Configuration
  visual: {
    type: 'static' | 'sprite';
    defaultImage?: string;  // URL for static characters (blob URL for display)
    defaultAssetId?: string; // Asset ID for persistence (resolves to URL after reload)
    spriteSheet?: {
      url: string;
      assetId?: string;    // Asset ID for persistence (resolves to URL after reload)
      frameWidth: number;
      frameHeight: number;
      imageWidth?: number;  // Full sprite sheet image width (for frame position calculation)
      imageHeight?: number; // Full sprite sheet image height
      animations: SpriteAnimation[];
    };
  };

  // Speaker Portrait (face/head image for dialog display)
  portrait?: {
    image?: string;      // Blob URL for display
    assetId?: string;    // Asset ID for persistence
  };

  // Character States
  states: CharacterState[];
  defaultState: string;
  
  // Game Variables
  counters: CharacterCounter[];
  inventory: InventoryItem[];

  // Authored initial affect — seeded into the runtime when the story starts.
  // Both fields are optional; characters without affect spec start at neutral
  // mood and zero sentiments. Step 4 of the rich-character roadmap.
  /** Initial 2D mood at story start (each axis ∈ [-1, 1], runtime clamps). */
  initialMood?: { valence: number; arousal: number };
  /** Initial directed sentiments at story start. */
  initialSentiments?: Array<{
    /** Entity the sentiment is directed at — Character.id, item name, beat id, or any author tag. */
    toEntityRef: string;
    /** Emotion label — free text (e.g. trust, fear, anger, joy, pride, shame). */
    emotion: string;
    /** Strength ∈ [-1, 1]. Negative = opposite of the named emotion. */
    strength: number;
  }>;

  /**
   * Personality traits — Step 6. Static, author-set keyed bag in [0, 1].
   * Default schema is Big Five (openness, conscientiousness, extraversion,
   * agreeableness, neuroticism). Authors can rename / extend. Traits never
   * gate choices on their own — they modulate emotion deltas at runtime
   * via the project's TraitModulationProfile.
   */
  traits?: Record<string, number>;

  /**
   * Step 7 — dossier policy. Controls how the character's LLM dossier is
   * assembled at runtime:
   *   'reAnchor'   — Mode A (default). Rebuild dossier from structured
   *                  state every turn. The NPC cannot drift away from
   *                  who they are; reflections are not surfaced.
   *   'reflection' — Mode B. Append accumulated reflection memory to the
   *                  dossier so the LLM sees recent felt-experience.
   *                  The character is allowed to grow over the session.
   * Optional — characters that omit this field default to 'reAnchor'.
   */
  dossierPolicy?: 'reAnchor' | 'reflection';

  /**
   * Step 8 — authored goals. Each entry is static authoring data; the
   * runtime tracks status (open / met / failed / abandoned) separately on
   * StoryContext. Optional satisfaction predicate is a Condition the
   * runtime re-evaluates each beat-enter and uses to flip status to 'met'.
   * Drives the GAMYGDALA-style emotion firings and the dossier "Pursuing:"
   * block.
   */
  goals?: Array<{
    id: string;
    name: string;
    description?: string;
    priority?: number;
    satisfaction?: import('@asaps/core').Condition;
  }>;

  /**
   * Variants — alternate personality / visual profiles for the same
   * character. Each variant is a *partial overlay* on the base: any field
   * the variant defines replaces the base value when that variant is
   * active. Use cases:
   *   - Two Alexes for a coming-out story (introvert / extrovert) sharing
   *     the same beats.
   *   - "Play as a man or a woman" — one Player character with two
   *     variants differing in displayName + portrait + traits.
   *
   * Variants are *exclusive* and *chosen at story-start* (either via a
   * `setCharacterVariant` effect on a player-facing choice, or via the
   * `defaultVariantId` field below). Switching mid-story is not
   * recommended — it would discard accumulated mood / sentiments from
   * the previous variant.
   *
   * The character keeps one stable `id` regardless of active variant —
   * all beats that reference the character keep working without
   * duplication. Only the affect / persona slice swaps.
   */
  variants?: CharacterVariant[];
  /**
   * Variant id that becomes active at story-start when no
   * `setCharacterVariant` effect has fired yet. Optional — when omitted,
   * the base character (no overlay) is used until a variant is chosen.
   */
  defaultVariantId?: string;

  // Metadata
  description?: string;
  tags?: string[];
  color?: string; // Theme color for UI
  createdAt: string;
  updatedAt: string;

  // Translated display names per language code (e.g., { de: { displayName: 'Rot' } })
  translations?: Record<string, { displayName: string }>;

  // Meter Frame Configuration
  /** Configuration for grouped meter display (HUD overlay) */
  meterFrame?: MeterFrameConfig;

  // Inventory Frame Configuration
  /** Configuration for inventory display (HUD overlay) */
  inventoryFrame?: InventoryFrameConfig;

  // Mood Frame Configuration — opt-in 2D mood-pad HUD overlay.
  /** When set with `enabled: true`, the renderer shows a compact
   *  Russell's-circumplex mood pad next to the character (or fixed to
   *  a screen corner). Off by default. */
  moodFrame?: MoodFrameConfig;
}

export interface MoodFrameConfig {
  enabled: boolean;
  dockMode: MeterFrameDockMode;
  anchor: MeterFrameAnchor;
  screenPosition: MeterFrameScreenPosition;
  offset: { x: number; y: number };
  /** Square pixel size — defaults to 96. */
  size: number;
  /** Plot project emotion-palette markers on the disc. */
  showEmotionMarkers: boolean;
  /** Cardinal labels (sad / happy / calm / excited). Off by default for HUD. */
  showLabels: boolean;
  /** Override the mood-dot fill colour (defaults to neutral dark). */
  dotColor?: string;
  /** Background opacity (0 = transparent, 1 = opaque). */
  backgroundOpacity: number;
}

export const DEFAULT_MOOD_FRAME_CONFIG: MoodFrameConfig = {
  enabled: false,
  dockMode: 'character',
  anchor: 'top-right',
  screenPosition: 'screen-top-right',
  offset: { x: 0, y: 0 },
  size: 96,
  showEmotionMarkers: true,
  showLabels: false,
  backgroundOpacity: 0.85,
};

/**
 * A partial overlay on a Character — only the fields the variant defines
 * are replaced; everything else falls through to the base. Variants are
 * exclusive (one active at a time) and chosen at story-start.
 */
export interface CharacterVariant {
  /** Stable identifier used by setCharacterVariant effect / condition. */
  id: string;
  /** Display name shown in the editor's variant picker. */
  name: string;
  /** Optional one-line author note. Surfaced in the variant picker UI. */
  description?: string;
  /** When set, replaces the base character's user-facing display name. */
  displayName?: string;
  /** Portrait override — same shape as the base Character.portrait. */
  portrait?: { image?: string; assetId?: string };
  /** Personality traits override (Big Five, [0, 1]). */
  traits?: Record<string, number>;
  /** Dossier-policy override (Mode A vs Mode B). */
  dossierPolicy?: 'reAnchor' | 'reflection';
  /** Initial 2D mood at story start, when this variant is active. */
  initialMood?: { valence: number; arousal: number };
  /** Initial directed sentiments at story start, when this variant is active. */
  initialSentiments?: Array<{
    toEntityRef: string;
    emotion: string;
    strength: number;
  }>;
  /** Description override — useful when the variant has a different
   *  backstory / authored persona block than the base. */
  characterDescription?: string;
}

export interface CharacterState {
  id: string;
  name: string;
  displayName: string;
  visual: {
    image?: string;        // Static image URL for this state (blob URL for display)
    assetId?: string;      // Asset ID for persistence (resolves to URL after reload)
    animation?: string;    // Sprite animation name
    effects?: VisualEffect[];
  };
  transitions?: StateTransition[];
}

export interface SpriteAnimation {
  name: string;
  frames: number[];        // Frame indices in sprite sheet
  frameDuration: number;   // Milliseconds per frame
  loop: boolean;
}

export interface CharacterCounter {
  name: string;
  displayName: string;
  value: number;
  min?: number;
  max?: number;
  visible: boolean;
  icon?: string;
  color?: string;
  /** Show level meter in preview */
  showLevelMeter?: boolean;
  /** Level meter orientation */
  levelMeterOrientation?: 'horizontal' | 'vertical';
  /** Show numeric value alongside level meter */
  showNumericValue?: boolean;
  /** Numeric display format: 'value' (75), 'fraction' (75/100), 'percentage' (75%) */
  numericFormat?: 'value' | 'fraction' | 'percentage';
}

// ============================================
// Meter Frame Types
// ============================================

/**
 * Dock mode: relative to character or fixed to screen corner
 */
export type MeterFrameDockMode = 'character' | 'screen';

/**
 * Anchor position for meter frame relative to character
 */
export type MeterFrameAnchor =
  | 'top' | 'bottom' | 'left' | 'right'
  | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/**
 * Screen corner positions for fixed docking
 */
export type MeterFrameScreenPosition =
  | 'screen-top-left' | 'screen-top-right'
  | 'screen-bottom-left' | 'screen-bottom-right';

/**
 * Configuration for the grouped meter frame that displays character counters
 */
export interface MeterFrameConfig {
  /** Dock mode: 'character' follows the character, 'screen' is fixed to a corner */
  dockMode: MeterFrameDockMode;
  /** Anchor position relative to character (used when dockMode is 'character') */
  anchor: MeterFrameAnchor;
  /** Screen corner position (used when dockMode is 'screen') */
  screenPosition: MeterFrameScreenPosition;
  /** Offset from anchor/corner position in pixels */
  offset: { x: number; y: number };
  /** Visual style settings */
  style: {
    backgroundColor: string;
    borderColor: string;
    borderWidth: number;
    borderRadius: number;
    padding: number;
    opacity: number;  // 0-100
  };
  /** Height of each meter bar in pixels */
  meterHeight: number;
  /** Gap between meters in pixels */
  meterSpacing: number;
  /** Show displayName label for each counter */
  showLabels: boolean;
  /** Width of meter bars in pixels */
  meterWidth: number;
}

/**
 * Default configuration for meter frames
 */
export const DEFAULT_METER_FRAME_CONFIG: MeterFrameConfig = {
  dockMode: 'character',
  anchor: 'top',
  screenPosition: 'screen-top-left',
  offset: { x: 0, y: -10 },
  style: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderColor: '#4a90d9',
    borderWidth: 1,
    borderRadius: 6,
    padding: 8,
    opacity: 90,
  },
  meterHeight: 12,
  meterSpacing: 6,
  showLabels: true,
  meterWidth: 100,
};

// ============================================
// Inventory Frame Types
// ============================================

/**
 * Configuration for the inventory frame that displays character items
 */
export interface InventoryFrameConfig {
  /** Dock mode: 'character' follows the character, 'screen' is fixed to a corner */
  dockMode: MeterFrameDockMode;
  /** Anchor position relative to character (used when dockMode is 'character') */
  anchor: MeterFrameAnchor;
  /** Screen corner position (used when dockMode is 'screen') */
  screenPosition: MeterFrameScreenPosition;
  /** Offset from anchor/corner position in pixels */
  offset: { x: number; y: number };
  /** Visual style settings */
  style: {
    backgroundColor: string;
    borderColor: string;
    borderWidth: number;
    borderRadius: number;
    padding: number;
    opacity: number;  // 0-100
  };
  /** Size of each item icon in pixels */
  itemSize: number;
  /** Number of columns in grid */
  columns: number;
  /** Gap between items in pixels */
  itemSpacing: number;
  /** Show item name labels below icons */
  showLabels: boolean;
  /** If true, inventory is hidden until Ctrl/Cmd+I is pressed */
  showOnDemand: boolean;
}

/**
 * Default configuration for inventory frames
 */
export const DEFAULT_INVENTORY_FRAME_CONFIG: InventoryFrameConfig = {
  dockMode: 'screen',
  anchor: 'bottom-right',
  screenPosition: 'screen-bottom-right',
  offset: { x: 0, y: 0 },
  style: {
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderColor: '#6366f1',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    opacity: 95,
  },
  itemSize: 48,
  columns: 4,
  itemSpacing: 6,
  showLabels: false,
  showOnDemand: false,  // Show by default; can enable for Ctrl/Cmd+I toggle
};

export interface InventoryItem {
  id: string;
  name: string;
  displayName: string;
  description: string;
  icon: string;           // URL for display (blob URL)
  assetId?: string;       // Asset ID for persistence (resolves to URL after reload)
  quantity: number;
  stackable: boolean;
  category: string;
  maxStack?: number;
}

export interface VisualEffect {
  type: 'filter' | 'overlay' | 'particle';
  properties: Record<string, any>;
}

export interface StateTransition {
  fromState: string;
  toState: string;
  condition?: string;
  duration?: number;
}

// Helper type for character selection in beats
export interface CharacterReference {
  characterId: string;
  stateId?: string;
}

// Default character templates
export const CHARACTER_TEMPLATES: Partial<Character>[] = [
  {
    name: 'player',
    displayName: 'Player',
    role: 'player',
    visual: { type: 'static' },
    states: [
      { id: 'default', name: 'default', displayName: 'Default', visual: {} }
    ],
    defaultState: 'default',
    counters: [
      { name: 'health', displayName: 'Health', value: 100, min: 0, max: 100, visible: true, color: '#ff4444' },
      { name: 'energy', displayName: 'Energy', value: 100, min: 0, max: 100, visible: true, color: '#4444ff' },
    ],
    inventory: [],
  },
  {
    name: 'npc_merchant',
    displayName: 'Merchant',
    role: 'npc',
    visual: { type: 'static' },
    states: [
      { id: 'default', name: 'default', displayName: 'Default', visual: {} },
      { id: 'happy', name: 'happy', displayName: 'Happy', visual: {} },
      { id: 'angry', name: 'angry', displayName: 'Angry', visual: {} },
    ],
    defaultState: 'default',
    counters: [
      { name: 'friendship', displayName: 'Friendship', value: 0, min: -100, max: 100, visible: false },
    ],
    inventory: [],
  },
  {
    name: 'npc_wizard',
    displayName: 'Old Wizard',
    role: 'npc',
    visual: { type: 'static' },
    states: [
      { id: 'default', name: 'default', displayName: 'Default', visual: {} },
      { id: 'casting', name: 'casting', displayName: 'Casting', visual: {} },
      { id: 'pleased', name: 'pleased', displayName: 'Pleased', visual: {} },
      { id: 'displeased', name: 'displeased', displayName: 'Displeased', visual: {} },
    ],
    defaultState: 'default',
    counters: [
      { name: 'wisdom', displayName: 'Wisdom', value: 100, min: 0, max: 100, visible: false },
      { name: 'trust', displayName: 'Trust', value: 50, min: 0, max: 100, visible: false },
    ],
    inventory: [],
  },
];
