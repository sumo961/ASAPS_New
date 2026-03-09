/**
 * Auto-generated TypeScript types from beat-definitions/core-beats.json
 * DO NOT EDIT MANUALLY - Run 'npm run generate:types' to regenerate
 * 
 * Schema Version: 2.2.0
 * Generated: 2026-03-09T01:24:02.690Z
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
  counter?: string;
  counterOperation?: 'set' | 'change';
  counterValue?: number;
  soundEffect?: string;
}

/**
 * A movement choice
 */
export interface MovementOption {
  id: string;
  text: string;
  displayText?: string;
  location: string;
  locationName?: string;
  target: string;
  conditions?: Condition[];
  effects?: Effect[];
  counter?: string;
  counterOperation?: 'set' | 'change';
  counterValue?: number;
  soundEffect?: string;
}

/**
 * A prop interaction choice
 */
export interface PropOption {
  id: string;
  name: string;
  displayName?: string;
  description: string;
  assetId?: string;
  locationName?: string;
  inventoryName?: string;
  target: string;
  conditions?: Condition[];
  effects?: Effect[];
  counter?: string;
  counterOperation?: 'set' | 'change';
  counterValue?: number;
  soundEffect?: string;
}

/**
 * A hotspot in a 360° panorama placed at pitch/yaw coordinates
 */
export interface PanoramaHotspot {
  id: string;
  pitch: number;
  yaw: number;
  text: string;
  displayText?: string;
  locationName?: string;
  soundEffect?: string;
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
  /** Who speaks this beat's text (for TTS voice and optional display) */
  speaker?: string | undefined;
  /** Show speaker name to the interactor */
  showSpeaker?: boolean | undefined;
  /** Target beat when start is clicked */
  connection: Connection;
}

/**
 * Info Text - Text display with continue button
 * Category: visible
 * Connection Type: single
 */
export interface InfoTextParameters {
  /** Text content to display */
  text: string;
  /** Optional array of text variations. Combined with main text for random selection at runtime. */
  textVariations?: string[] | undefined;
  /** Continue button text (also used as connection label) */
  buttonText?: string | undefined;
  /** Who speaks this beat's text (for TTS voice and optional display) */
  speaker?: string | undefined;
  /** Show speaker name to the interactor */
  showSpeaker?: boolean | undefined;
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
  /** Block and dim choices leading to previously visited beats */
  markVisited?: boolean | undefined;
  /** Dialog presentation style: 'positioned' (traditional positioned elements), 'chat-scroll' (scrollable chat history), or 'chat-bubble' (single message bubble) */
  presentationMode?: string | undefined;
  /** Show character avatars in chat mode */
  showAvatars?: boolean | undefined;
  /** Delay in seconds before NPC responds in chat mode (shows typing indicator) */
  responseDelay?: number | undefined;
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
  /** Block and dim choices leading to previously visited beats */
  markVisited?: boolean | undefined;
  /** Only show choice text when hovering over the hotspot */
  showTextOnHover?: boolean | undefined;
  /** Who speaks this beat's text (for TTS voice and optional display) */
  speaker?: string | undefined;
  /** Show speaker name to the interactor */
  showSpeaker?: boolean | undefined;
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
  /** Block and dim choices leading to previously visited beats */
  markVisited?: boolean | undefined;
  /** Who speaks this beat's text (for TTS voice and optional display) */
  speaker?: string | undefined;
  /** Show speaker name to the interactor */
  showSpeaker?: boolean | undefined;
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
  /** Who speaks this beat's text (for TTS voice and optional display) */
  speaker?: string | undefined;
  /** Show speaker name to the interactor */
  showSpeaker?: boolean | undefined;
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
  /** Reset all values on restart */
  reset?: boolean | undefined;
  /** Clear all variables */
  resetVariables?: boolean | undefined;
  /** Clear all counters */
  resetCounters?: boolean | undefined;
  /** Clear inventory */
  resetInventory?: boolean | undefined;
  /** Clear all timers */
  resetTimers?: boolean | undefined;
  /** Clear fictional time */
  resetFictionalTime?: boolean | undefined;
  /** Clear visited beat tracking */
  resetVisitedTracking?: boolean | undefined;
  /** Clear beat history */
  resetHistory?: boolean | undefined;
  /** Text for restart button */
  restartText?: string | undefined;
  /** Text for credits button */
  creditsText?: string | undefined;
  /** Title text for the credits page */
  creditsPageTitle?: string | undefined;
  /** Body text for the credits page (auto-populated from metadata if empty) */
  creditsPageBody?: string | undefined;
  /** Text for the close button on credits page */
  creditsCloseText?: string | undefined;
  /** Who speaks this beat's text (for TTS voice and optional display) */
  speaker?: string | undefined;
  /** Show speaker name to the interactor */
  showSpeaker?: boolean | undefined;
  /** Target beat for restart (usually beat 0) */
  restartConnection?: Connection | undefined;
}

/**
 * 360° Panorama - 360-degree panoramic view with interactive hotspots
 * Category: visible
 * Connection Type: multiple
 */
export interface PanoramaParameters {
  /** How the panorama image is mapped. Equirectangular = full sphere (360° cameras), Cylindrical = cylinder wrap (phone panoramas) */
  projectionType?: string | undefined;
  /** Panorama image (equirectangular 2:1 or cylindrical 4:1–8:1, depending on projection) */
  panoramaAssetId: string;
  /** Array of interactive hotspots (each contains a target) */
  hotspots: PanoramaHotspot[];
  /** Initial vertical angle (-90 to 90, 0 = horizon) */
  initialPitch?: number | undefined;
  /** Initial horizontal angle (-180 to 180, 0 = front-center) */
  initialYaw?: number | undefined;
  /** Horizontal field of view in degrees */
  hfov?: number | undefined;
  /** Minimum horizontal FOV in degrees (maximum zoom in) */
  minHfov?: number | undefined;
  /** Maximum horizontal FOV in degrees (maximum zoom out) */
  maxHfov?: number | undefined;
  /** Mouse wheel zoom speed multiplier (0.1 = very slow, 3.0 = very fast) */
  zoomSpeed?: number | undefined;
  /** Optional instruction text overlay (e.g. 'Look around to explore') */
  prompt?: string | undefined;
  /** How prompt text is displayed: static (floating overlay) or pinned (scrolls with panorama) */
  promptDisplay?: string | undefined;
  /** Who speaks this beat's text (for TTS voice and optional display) */
  speaker?: string | undefined;
  /** Show speaker name to the interactor */
  showSpeaker?: boolean | undefined;
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
  /** Optional array of text variations. Combined with main text for random selection at runtime. */
  textVariations?: string[] | undefined;
  /** Display duration in milliseconds */
  duration: number;
  /** Who speaks this beat's text (for TTS voice and optional display) */
  speaker?: string | undefined;
  /** Show speaker name to the interactor */
  showSpeaker?: boolean | undefined;
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
 * Inventory Management - Add, remove, or transfer inventory items with optional quantity
 * Category: invisible
 * Connection Type: single
 */
export interface AddRemoveInventoryParameters {
  /** Action: add, remove, or transfer */
  action: string;
  /** Item name */
  item: string;
  /** Number of items to add/remove/transfer. Can be a number or variable name (e.g., $goldAmount) */
  quantity?: string | undefined;
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
  /** Save input to: 'variable', 'characterName', or 'counter' */
  saveToType: string;
  /** Variable name to store the input (when saveToType='variable') */
  variable?: string | undefined;
  /** Character ID to update display name (when saveToType='characterName') */
  characterId?: string | undefined;
  /** Counter name to store numeric input (when saveToType='counter') */
  counter?: string | undefined;
  /** Counter operation: 'set' or 'change' (when saveToType='counter') */
  counterOperation?: string | undefined;
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
  /** Who speaks this beat's text (for TTS voice and optional display) */
  speaker?: string | undefined;
  /** Show speaker name to the interactor */
  showSpeaker?: boolean | undefined;
  /** Target beat after input is submitted */
  connection: Connection;
}

/**
 * Keypad - Numeric keypad for phone, safe lock, PIN entry
 * Category: visible
 * Connection Type: single
 */
export interface KeypadParameters {
  /** Prompt text displayed above the keypad */
  prompt: string;
  /** Keypad layout: numeric (1-9,←,0,✓), phone (1-9,*,0,#), pin (1-9,C,0,✓) */
  layout?: string | undefined;
  /** Maximum number of digits */
  maxDigits?: number | undefined;
  /** Minimum number of digits */
  minDigits?: number | undefined;
  /** Expected code (empty = accept any input) */
  correctCode?: string | undefined;
  /** Beat to navigate to on wrong code */
  failTarget?: string | undefined;
  /** Maximum attempts (0 = unlimited) */
  maxAttempts?: number | undefined;
  /** Show * instead of digits */
  maskInput?: boolean | undefined;
  /** Save input to: variable or counter */
  saveToType?: string | undefined;
  /** Variable name to store the entered code */
  variable?: string | undefined;
  /** Counter name to store numeric input */
  counter?: string | undefined;
  /** Counter operation: set or change */
  counterOperation?: string | undefined;
  /** Submit button text */
  buttonText?: string | undefined;
  /** Clear button text */
  clearButtonText?: string | undefined;
  /** Show digit display area above keypad */
  showDisplay?: boolean | undefined;
  /** Target beat after code is entered */
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
  /** Who speaks this beat's text (for TTS voice and optional display) */
  speaker?: string | undefined;
  /** Show speaker name to the interactor */
  showSpeaker?: boolean | undefined;
}

/**
 * Online Content - Fetch and display real-time data from web APIs or AI queries
 * Category: visible
 * Connection Type: single
 */
export interface OnlineContentParameters {
  /** Data source type: 'api' for direct API calls, 'ai-query' for AI-powered search */
  sourceType: string;
  /** API URL to fetch (supports ${variable} interpolation) */
  apiUrl?: string | undefined;
  /** Query parameters for the API */
  apiParams?: object | undefined;
  /** JSONPath to extract data (e.g., $.current.temp_c) */
  jsonPath?: string | undefined;
  /** Query for AI to search and summarize (supports ${variable} interpolation) */
  query?: string | undefined;
  /** Title displayed above the content (auto-derived from query if not set) */
  title?: string | undefined;
  /** Maximum word count for AI-generated content */
  maxWords?: number | undefined;
  /** Template for displaying result (use {{data}} placeholder) */
  displayTemplate?: string | undefined;
  /** Continue button text */
  buttonText?: string | undefined;
  /** Message to show if fetch fails */
  errorMessage?: string | undefined;
  /** Target beat when button is clicked */
  connection: Connection;
}

/**
 * AI Condition - AI-driven branching that analyzes player state to determine path
 * Category: invisible
 * Connection Type: multiple
 */
export interface AiConditionParameters {
  /** Prompt describing what the AI should evaluate */
  prompt: string;
  /** Categories for AI to choose from */
  categories: object[];
  /** Include player variables in evaluation */
  evaluateVariables?: boolean | undefined;
  /** Include player inventory in evaluation */
  evaluateInventory?: boolean | undefined;
  /** Include beat history in evaluation */
  evaluateHistory?: boolean | undefined;
  /** Include counters in evaluation */
  evaluateCounters?: boolean | undefined;
  /** Include rich choice history in evaluation (what choices were made) */
  evaluateChoiceHistory?: boolean | undefined;
  /** Fallback target if AI can't decide (used when no category matches) */
  fallbackTarget?: string | undefined;
  /** Maximum response time in ms */
  timeout?: number | undefined;
}

/**
 * AI Dialog Tree - Generate personalized dialog trees at runtime using AI
 * Category: visible
 * Connection Type: multiple
 */
export interface AiDialogTreeParameters {
  /** Scene description for context */
  scenario: string;
  /** NPC name the player is talking to */
  npcName: string;
  /** NPC personality traits */
  npcPersonality?: string | undefined;
  /** Include player variables in context */
  includeVariables?: boolean | undefined;
  /** Include player inventory in context */
  includeInventory?: boolean | undefined;
  /** Include visited beats in context */
  includeVisitedBeats?: boolean | undefined;
  /** Include rich choice history in context (what choices were made) */
  includeChoiceHistory?: boolean | undefined;
  /** Maximum conversation turns */
  maxTurns?: number | undefined;
  /** Exit targets for conversation outcomes */
  exitTargets: object[];
  /** Delay before showing choices */
  choiceDelay?: number | undefined;
}

/**
 * AI Summary - Generate a narrative summary of the player's journey
 * Category: visible
 * Connection Type: single
 */
export interface AiSummaryParameters {
  /** Custom instructions for summary style */
  prompt?: string | undefined;
  /** Include player variables in summary */
  includeVariables?: boolean | undefined;
  /** Include player inventory in summary */
  includeInventory?: boolean | undefined;
  /** Include visited beats in summary */
  includeVisitedBeats?: boolean | undefined;
  /** Include rich choice history in summary (what choices were made) */
  includeChoiceHistory?: boolean | undefined;
  /** Include final counter values */
  includeCounters?: boolean | undefined;
  /** Summary style */
  summaryStyle?: string | undefined;
  /** Summary length */
  maxLength?: string | undefined;
  /** Title above summary */
  title?: string | undefined;
  /** Show restart button */
  showRestart?: boolean | undefined;
  /** Show credits button */
  showCredits?: boolean | undefined;
  /** Beat to restart to */
  restartTarget?: string | undefined;
  /** Reset state on restart */
  resetOnRestart?: boolean | undefined;
  /** Clear all variables */
  resetVariables?: boolean | undefined;
  /** Clear all counters */
  resetCounters?: boolean | undefined;
  /** Clear inventory */
  resetInventory?: boolean | undefined;
  /** Clear all timers */
  resetTimers?: boolean | undefined;
  /** Clear fictional time */
  resetFictionalTime?: boolean | undefined;
  /** Clear visited beat tracking */
  resetVisitedTracking?: boolean | undefined;
  /** Clear beat history */
  resetHistory?: boolean | undefined;
  /** Text for restart button */
  restartText?: string | undefined;
  /** Text for credits button */
  creditsText?: string | undefined;
  /** Title text for the credits page */
  creditsPageTitle?: string | undefined;
  /** Body text for the credits page (auto-populated from metadata if empty) */
  creditsPageBody?: string | undefined;
  /** Text for the close button on credits page */
  creditsCloseText?: string | undefined;
}

/**
 * AI Info Text - Generate contextual 1-2 sentence info text using AI at runtime
 * Category: visible
 * Connection Type: single
 */
export interface AiInfoTextParameters {
  /** Context/instruction for AI (e.g., "A merchant's reply when the player can't afford the item") */
  prompt: string;
  /** Specific variables to include in AI context (leave empty for all) */
  contextVariables?: string[] | undefined;
  /** Include player variables in context */
  includeVariables?: boolean | undefined;
  /** Include player inventory in context */
  includeInventory?: boolean | undefined;
  /** Include visited beats in context */
  includeHistory?: boolean | undefined;
  /** Include counters in context */
  includeCounters?: boolean | undefined;
  /** Include rich choice history in context (what choices were made) */
  includeChoiceHistory?: boolean | undefined;
  /** Maximum sentences to generate */
  maxSentences?: number | undefined;
  /** Text to show if AI is unavailable */
  fallbackText: string;
  /** Continue button text */
  buttonText?: string | undefined;
  /** Target beat when button is clicked */
  connection: Connection;
}

/**
 * AI Duration Screen - Generate text using AI with automatic duration based on reading speed
 * Category: visible
 * Connection Type: single
 */
export interface AiDurScreenParameters {
  /** Context/instruction for AI (e.g., "Describe the atmosphere as the player enters the dark cave") */
  prompt: string;
  /** Specific variables to include in AI context (leave empty for all) */
  contextVariables?: string[] | undefined;
  /** Include player variables in context */
  includeVariables?: boolean | undefined;
  /** Include player inventory in context */
  includeInventory?: boolean | undefined;
  /** Include visited beats in context */
  includeHistory?: boolean | undefined;
  /** Include counters in context */
  includeCounters?: boolean | undefined;
  /** Include rich choice history in context (what choices were made) */
  includeChoiceHistory?: boolean | undefined;
  /** Maximum sentences to generate */
  maxSentences?: number | undefined;
  /** Text to show if AI is unavailable */
  fallbackText: string;
  /** Reading speed in words per minute (average adult: 200-250) */
  wordsPerMinute?: number | undefined;
  /** Minimum display duration in milliseconds */
  minDuration?: number | undefined;
  /** Maximum display duration in milliseconds */
  maxDuration?: number | undefined;
  /** Target beat after duration expires */
  connection?: Connection | undefined;
}

// ============================================
// Beat Type Union and Maps
// ============================================

/**
 * Union type of all valid beat type names
 */
export type BeatType =
  | 'titleScreen'
  | 'infoText'
  | 'dialogTree'
  | 'movementChoice'
  | 'pickProp'
  | 'videoBeat'
  | 'endScreen'
  | 'panorama'
  | 'setVariable'
  | 'conditionBeat'
  | 'durScreen'
  | 'randomTarget'
  | 'setTimer'
  | 'addRemoveInventory'
  | 'inputText'
  | 'keypad'
  | 'hyperText'
  | 'onlineContent'
  | 'aiCondition'
  | 'aiDialogTree'
  | 'aiSummary'
  | 'aiInfoText'
  | 'aiDurScreen';

/**
 * Map of beat type name to its parameter interface
 */
export interface BeatParameterMap {
  'titleScreen': TitleScreenParameters;
  'infoText': InfoTextParameters;
  'dialogTree': DialogTreeParameters;
  'movementChoice': MovementChoiceParameters;
  'pickProp': PickPropParameters;
  'videoBeat': VideoBeatParameters;
  'endScreen': EndScreenParameters;
  'panorama': PanoramaParameters;
  'setVariable': SetVariableParameters;
  'conditionBeat': ConditionBeatParameters;
  'durScreen': DurScreenParameters;
  'randomTarget': RandomTargetParameters;
  'setTimer': SetTimerParameters;
  'addRemoveInventory': AddRemoveInventoryParameters;
  'inputText': InputTextParameters;
  'keypad': KeypadParameters;
  'hyperText': HyperTextParameters;
  'onlineContent': OnlineContentParameters;
  'aiCondition': AiConditionParameters;
  'aiDialogTree': AiDialogTreeParameters;
  'aiSummary': AiSummaryParameters;
  'aiInfoText': AiInfoTextParameters;
  'aiDurScreen': AiDurScreenParameters;
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

