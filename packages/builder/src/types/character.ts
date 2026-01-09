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
      frameWidth: number;
      frameHeight: number;
      imageWidth?: number;  // Full sprite sheet image width (for frame position calculation)
      imageHeight?: number; // Full sprite sheet image height
      animations: SpriteAnimation[];
    };
  };
  
  // Character States
  states: CharacterState[];
  defaultState: string;
  
  // Game Variables
  counters: CharacterCounter[];
  inventory: InventoryItem[];
  
  // Metadata
  description?: string;
  tags?: string[];
  color?: string; // Theme color for UI
  createdAt: string;
  updatedAt: string;

  // Meter Frame Configuration
  /** Configuration for grouped meter display (HUD overlay) */
  meterFrame?: MeterFrameConfig;
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

export interface InventoryItem {
  id: string;
  name: string;
  displayName: string;
  description: string;
  icon: string;
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
