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
}

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
