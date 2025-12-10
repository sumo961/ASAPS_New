/**
 * Auto-generated TypeScript types from beat-definitions/core-beats.json
 * DO NOT EDIT MANUALLY - Run 'npm run generate:types' to regenerate
 * 
 * Schema Version: 2.2.0
 * Generated: 2025-12-10T18:52:28.392Z
 */

// ============================================
// Custom Types from Schema
// ============================================

import type { Connection, Condition, Effect } from '../types';

/**
 * A node in a dialog tree representing NPC/system output. Always followed by player choices.
 */
export interface DialogNode {
  id: string;
  speaker: string;
  text: string;
  emotion?: string;
  conditions?: Condition[];
  choices: DialogChoice[];
  effects?: Effect[];
}

/**
 * A player choice in dialog. Can exit to a beat or continue with nested dialog.
 */
export interface DialogChoice {
  id: string;
  text: string;
  target?: string;
  dialogNode?: DialogNode;
  conditions?: Condition[];
  effects?: Effect[];
  visible?: boolean;
}

/**
 * A movement choice
 */
export interface MovementOption {
  id: string;
  text: string;
  location: string;
  target: string;
  conditions?: Condition[];
  effects?: Effect[];
}

/**
 * A prop interaction choice
 */
export interface PropOption {
  id: string;
  name: string;
  description: string;
  target: string;
  conditions?: Condition[];
  effects?: Effect[];
}

// ============================================
// Beat Parameter Interfaces
// ============================================

/**
 * Title Screen - Opening title screen with start button
 * Category: visible
 * Connection Type: single
 */
export interface TitleScreenParameters {
  /** Story title text */
  title: string;
  /** Author name */
  author?: string | undefined;
  /** Start button text */
  buttonText?: string | undefined;
  /** Target beat when start is clicked */
  connection: Connection;
}

/**
 * Intro Text - Text display with continue button
 * Category: visible
 * Connection Type: single
 */
export interface IntroTextParameters {
  /** Text content to display */
  text: string;
  /** Continue button text (also used as connection label) */
  buttonText?: string | undefined;
  /** Target beat when button is clicked */
  connection: Connection;
}

/**
 * Dialog Tree - Complex branching conversation system
 * Category: visible
 * Connection Type: multiple
 */
export interface DialogTreeParameters {
  /** Root dialog node with full conversation tree */
  dialogTree: DialogNode;
  /** Delay in seconds before showing choices with fade-in */
  choiceDelay?: number | undefined;
}

/**
 * Movement Choice - Location-based navigation choices
 * Category: visible
 * Connection Type: multiple
 */
export interface MovementChoiceParameters {
  /** Question prompt */
  question: string;
  /** Array of movement options (each contains a target) */
  choices: MovementOption[];
  /** Delay in seconds before showing choices with fade-in */
  choiceDelay?: number | undefined;
}

/**
 * Pick Prop - Interactive object selection
 * Category: visible
 * Connection Type: multiple
 */
export interface PickPropParameters {
  /** Interaction prompt */
  question: string;
  /** Available props to interact with (each contains a target) */
  props: PropOption[];
  /** Delay in seconds before showing choices with fade-in */
  choiceDelay?: number | undefined;
}

/**
 * Video Beat - Video playback with optional controls
 * Category: visible
 * Connection Type: single
 */
export interface VideoBeatParameters {
  /** Path to video file */
  videoFile: string;
  /** Start playing automatically */
  autoplay?: boolean | undefined;
  /** Show video controls */
  controls?: boolean | undefined;
  /** Allow skipping video */
  skipButton?: boolean | undefined;
  /** Target beat after video ends */
  connection?: Connection | undefined;
}

/**
 * End Screen - Story conclusion screen
 * Category: visible
 * Connection Type: single
 */
export interface EndScreenParameters {
  /** Ending message */
  message?: string | undefined;
  /** Show restart button */
  showRestart?: boolean | undefined;
  /** Show credits button */
  showCredits?: boolean | undefined;
  /** Reset all values (counters, variables, timers) on restart */
  reset?: boolean | undefined;
  /** Text for restart button */
  restartText?: string | undefined;
  /** Text for credits button */
  creditsText?: string | undefined;
  /** Target beat for restart (usually beat 0) */
  restartConnection?: Connection | undefined;
}

/**
 * Set Variable/Counter - Modify story variables or counters
 * Category: invisible
 * Connection Type: single
 */
export interface SetVariableParameters {
  /** Type: variable or counter */
  type: string;
  /** Variable or counter name */
  name: string;
  /** New value (string for variables, number for counters) */
  value: any;
  /** For counters: set or change. For variables: set only */
  operation?: string | undefined;
  /** Next beat after variable/counter is set */
  connection: Connection;
}

/**
 * Condition Check - Conditional branching logic
 * Category: invisible
 * Connection Type: conditional
 */
export interface ConditionBeatParameters {
  /** Condition to evaluate */
  condition: Condition;
  /** Target if condition is true */
  trueConnection: Connection;
  /** Target if condition is false */
  falseConnection?: Connection | undefined;
}

/**
 * Duration Screen - Timed display screen
 * Category: visible
 * Connection Type: single
 */
export interface DurScreenParameters {
  /** Text to display */
  text: string;
  /** Display duration in milliseconds */
  duration: number;
  /** Target beat after duration expires */
  connection?: Connection | undefined;
}

/**
 * Random Target - Randomly select next beat from choices
 * Category: invisible
 * Connection Type: multiple
 */
export interface RandomTargetParameters {
  /** Array of possible target beats */
  choices: Connection[];
}

/**
 * Set Timer - Set or clear a named timer
 * Category: invisible
 * Connection Type: single
 */
export interface SetTimerParameters {
  /** Timer name */
  name: string;
  /** Timer value in seconds (0 to clear) */
  value: number;
  /** Beat to jump to when timer expires */
  timerTarget: string;
  /** Next beat after timer is set */
  connection: Connection;
}

/**
 * Inventory Management - Add, remove, or transfer inventory items
 * Category: invisible
 * Connection Type: single
 */
export interface AddRemoveInventoryParameters {
  /** Action: add, remove, or transfer */
  action: string;
  /** Item name */
  item: string;
  /** Character name (for add/remove) */
  character: string;
  /** Source character (for transfer) */
  fromChar?: string | undefined;
  /** Target character (for transfer) */
  toChar?: string | undefined;
  /** Next beat after inventory change */
  connection: Connection;
}

/**
 * Input Text - Prompts user for text input and stores in a variable or character display name
 * Category: visible
 * Connection Type: single
 */
export interface InputTextParameters {
  /** Question or prompt text to display */
  prompt: string;
  /** Save input to: 'variable' or 'characterName' */
  saveToType: string;
  /** Variable name to store the input (when saveToType='variable') */
  variable?: string | undefined;
  /** Character ID to update display name (when saveToType='characterName') */
  characterId?: string | undefined;
  /** Optional placeholder text for input field */
  placeholder?: string | undefined;
  /** Validation type: none, numeric, email, alphanumeric */
  validation?: string | undefined;
  /** Minimum character length */
  minLength?: number | undefined;
  /** Maximum character length */
  maxLength?: number | undefined;
  /** Whether input is required */
  required?: boolean | undefined;
  /** Text for submit button */
  buttonText?: string | undefined;
  /** Target beat after input is submitted */
  connection: Connection;
}

/**
 * Hyper Text - Text with clickable hyperlinked words that branch to different beats
 * Category: visible
 * Connection Type: multiple
 */
export interface HyperTextParameters {
  /** Main text content with hyperlinked words */
  text: string;
  /** Array of { word: string, targetBeatId: string, style?: object } */
  hyperlinks: object[];
  /** Whether user can click multiple links */
  allowMultipleClicks?: boolean | undefined;
  /** Color for hyperlinked text */
  highlightColor?: string | undefined;
  /** Color when hovering over hyperlinks */
  hoverColor?: string | undefined;
}

// ============================================
// Beat Type Union and Maps
// ============================================

/**
 * Union type of all valid beat type names
 */
export type BeatType =
  | 'titleScreen'
  | 'introText'
  | 'dialogTree'
  | 'movementChoice'
  | 'pickProp'
  | 'videoBeat'
  | 'endScreen'
  | 'setVariable'
  | 'conditionBeat'
  | 'durScreen'
  | 'randomTarget'
  | 'setTimer'
  | 'addRemoveInventory'
  | 'inputText'
  | 'hyperText';

/**
 * Map of beat type name to its parameter interface
 */
export interface BeatParameterMap {
  'titleScreen': TitleScreenParameters;
  'introText': IntroTextParameters;
  'dialogTree': DialogTreeParameters;
  'movementChoice': MovementChoiceParameters;
  'pickProp': PickPropParameters;
  'videoBeat': VideoBeatParameters;
  'endScreen': EndScreenParameters;
  'setVariable': SetVariableParameters;
  'conditionBeat': ConditionBeatParameters;
  'durScreen': DurScreenParameters;
  'randomTarget': RandomTargetParameters;
  'setTimer': SetTimerParameters;
  'addRemoveInventory': AddRemoveInventoryParameters;
  'inputText': InputTextParameters;
  'hyperText': HyperTextParameters;
}

// ============================================
// Helper Types
// ============================================

/**
 * Get the parameter type for a specific beat type
 */
export type ParametersFor<T extends BeatType> = BeatParameterMap[T];

/**
 * Type-safe beat configuration object
 */
export interface TypedBeatConfig<T extends BeatType> {
  id: string;
  type: T;
  parameters: ParametersFor<T>;
}

