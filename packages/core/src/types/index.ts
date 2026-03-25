// Core type definitions
export * from './ClusterTypes';
export * from './theme';
export * from './animation';
import type { AnimationPath } from './animation';

export interface Location {
  kind: 'text' | 'hotspot' | 'prop' | 'character' | 'button' | 'dialog' | 'input' | 'meter' | 'keypad';
  name: string;
  id?: string;  // Unique element ID for animation targeting
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex?: number;
  assetId?: string;  // Asset reference for character/prop elements
  imageUrl?: string;  // Direct image URL (for base64 data or when assetId is not available)
  sound?: string;    // Sound to play when element is interacted with
  // Transform properties for visual elements
  rotation?: number;  // Rotation in degrees
  scale?: number;     // Scale factor (1 = 100%)
  // Character-specific fields (for kind='character')
  characterId?: string;     // Reference to Character definition (modern)
  characterName?: string;   // Character name for ASML export and legacy import
  stateId?: string;         // Which character state to display
  size?: number;            // Scale percentage (e.g., 90 = 90% scale, like ASML size attribute)
  // Font properties for text/button/dialog elements
  font?: string;
  fontSize?: number;
  textAlign?: 'left' | 'center' | 'right';
  autosize?: boolean;  // Auto-calculate font size based on box dimensions
  fontOverridden?: boolean;  // True if font/size explicitly set, false = use theme defaults
  visible?: boolean;   // Element visibility (false = hidden, true/undefined = visible)
  // Scroll behavior properties (for text/dialog elements)
  requireScrollToBottom?: boolean;  // If true, continue button disabled until user scrolls to bottom
  manuallyResized?: boolean;        // User has manually resized - skip auto-sizing on content change
  initialAutoSized?: boolean;       // Was auto-sized on creation (enables re-auto-sizing when content changes)
  // Meter-specific fields (for kind='meter')
  counterName?: string;      // Name of the counter to display
  meterOrientation?: 'horizontal' | 'vertical';
  showNumericValue?: boolean;
  numericFormat?: 'value' | 'fraction' | 'percentage';
  meterColor?: string;       // Bar fill color
  meterBackgroundColor?: string;  // Bar background color
  // Per-element hotspot appearance override (overrides global hotspot settings)
  hotspotOverride?: {
    enabled: boolean;
    opacity?: number;           // 0-100 percentage
    showInPreview?: 'visible' | 'onHover' | 'invisible';
  };
}

export interface Transition {
  type: 'none' | 'fade' | 'slide' | 'zoom' | 'dissolve';
  duration: number;
  direction?: 'in' | 'out';
  easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
}

export interface Sound {
  file: string;
  assetId?: string; // Asset ID for the sound (preferred over file which may be blob URL)
  volume?: number;
  loop?: boolean;
  fadeIn?: number;
  fadeOut?: number;
}

export interface Video {
  file: string;
  //volume?: number;
  autoplay?: boolean;
  skipButton?: boolean;
}

export interface Connection {
  targetId: string;
  condition?: Condition;
  label?: string;
}

/**
 * Fictional time representation (avoids JS Date timezone issues)
 */
export interface FictionalTime {
  year: number;   // e.g., 1929
  month: number;  // 1-12
  day: number;    // 1-31
  hour: number;   // 0-23
  minute: number; // 0-59
}

export interface Condition {
  type: 'variable' | 'inventory' | 'counter' | 'timer' | 'counterCompare' | 'visitedBeat' | 'fictionalTime';
  operator: '==' | '!=' | '>' | '<' | '>=' | '<=' | 'contains' | 'not';
  // New canonical field names
  variableName?: string;
  value?: any;
  // Legacy field names (kept for backwards compatibility)
  left?: string;
  right?: any;
  // For counterCompare type
  counter1?: string;
  counter2?: string;
  // For visitedBeat type
  beatId?: string;
  // For inventory conditions
  item?: string;                   // Inventory item name to check
  character?: string;              // Character whose inventory to check (default: 'player')
  checkType?: 'has' | 'notHas' | 'quantity'; // Type of inventory check
  // For inventory quantity check
  quantityCheck?: boolean;         // Whether to check quantity (vs just existence)
  quantityOperator?: '==' | '!=' | '>' | '<' | '>=' | '<=';
  quantityValue?: number | string; // Number or variable name (prefixed with $)
  compareSource?: 'inventory' | 'variable'; // What to compare: inventory quantity or variable value
  compareVariable?: string;        // Variable name when compareSource is 'variable'
  // For fictionalTime conditions
  compareTime?: FictionalTime;     // Time to compare against
}

export interface Effect {
  type: 'setVariable' | 'addInventory' | 'removeInventory' | 'incrementCounter' | 'setCounter';
  target: string;
  value?: any;
}

export interface BeatConfig {
  id: string;
  name: string;
  type: string;
  cluster?: string;
  transition?: Transition;
  sound?: Sound;
  locations?: Location[];
  connections?: Connection[];
  animations?: AnimationPath[];
  defaultTarget?: string;
  parameters?: Record<string, any>;
  x?: number;
  y?: number;
  notes?: string; // Author notes (not shown to player)
}

export interface StoryMetadata {
  title?: string;
  author?: string;
  version?: string;
  created?: string;
  modified?: string;
  firstBeatId: string;
  clusters?: import('./ClusterTypes').Cluster[]; // Optional cluster definitions
  statePresets?: StatePreset[]; // Debug state presets
}

/**
 * State preset for debugging - allows starting story from specific beat with predefined state
 */
export interface StatePreset {
  id: string;
  name: string;
  description?: string;
  beatId: string; // Starting beat ID
  state: {
    variables: Record<string, any>;
    counters: Record<string, number>;
    inventory: string[];
    characterInventories?: Record<string, string[]>;
    visitedBeats: string[];
    timers?: Record<string, { value: number; target?: string }>;
  };
  aiGenerated?: boolean; // Whether this preset was generated by AI
  createdAt: string;
  modifiedAt: string;
}

/**
 * AI Service interface for dynamic AI-powered beats
 * Used by OnlineContentBeat, AIConditionBeat, AIDialogTreeBeat, AISummaryBeat
 */
export interface IAIService {
  /** Generate text content from a prompt */
  generateContent(prompt: string, options?: {
    maxTokens?: number;
    enableWebSearch?: boolean;
  }): Promise<string>;

  /** Generate a dialog tree structure */
  generateDialog(request: {
    prompt: string;
    format: 'dialogTree';
    maxTurns?: number;
  }): Promise<any>;

  /** Classify content into one of the provided categories */
  classifyContent(prompt: string, categories: string[]): Promise<string>;

  /** Generate a single conversation turn (for AIConversationBeat) */
  generateConversationTurn?(request: {
    systemPrompt: string;
    messages: Array<{ role: string; content: string }>;
  }): Promise<{ text: string }>;
}

/**
 * IRenderer interface defines the contract for all renderers
 * Moved to core package to avoid circular dependencies
 *
 * AI Service Integration:
 * AI-powered beats access the AI service via renderer state:
 * - renderer.getState('aiService') returns the IAIService instance
 * - renderer.setState('aiService', service) sets the service
 *
 * Builder Preview: Pass the AIService from useAI() hook
 * Player App: Configure AI settings and set the service on the renderer
 */
export interface IRenderer {
  // Core rendering methods (with optional locations for positioned rendering)
  renderTitleScreen(title: string, author: string, buttonText: string, locations?: Location[]): Promise<void>;
  renderText(text: string, buttonText: string, locations?: Location[]): Promise<void>;
  renderDialog(speaker: string, text: string, emotion?: string, locations?: Location[]): Promise<void>;
  renderChoices(choices: { id: string; text: string }[], locations?: Location[]): Promise<string>;
  renderMovement(question: string, choices: { id: string; text: string; displayText?: string; location: string; locationName?: string }[], locations?: Location[]): Promise<string>;
  renderPropSelection(question: string, props: { id: string; name: string; displayName?: string; description: string; locationName?: string }[], locations?: Location[]): Promise<string>;
  renderVideo(videoFile: string, autoplay: boolean, controls: boolean): Promise<void>;
  renderEndScreen(message: string, showRestart: boolean, showCredits: boolean, locations?: Location[]): Promise<string>;
  renderAISummary?(data: {
    title: string;
    summary: string;
    showRestart: boolean;
    showCredits: boolean;
    restartText?: string;
    creditsText?: string;
  }, locations?: Location[]): Promise<string>;
  renderCreditsPage?(content: { creditsTitle: string; creditsBody: string; creditsCloseText: string }, locations?: Location[]): Promise<string>;
  renderDurScreen(text: string, duration: number, locations?: Location[]): Promise<void>;

  // Show choices with optional fade-in animation
  showChoices<TResult = string>(choices: { id: string; text: string; icon?: string }[], options?: { fadeIn?: boolean; duration?: number }): Promise<TResult>;

  // New beat types
  renderInputText(prompt: string, placeholder?: string, buttonText?: string, options?: {
    validation?: 'none' | 'numeric' | 'email' | 'alphanumeric';
    minLength?: number;
    maxLength?: number;
    required?: boolean;
  }, locations?: Location[]): Promise<string>;
  renderHyperText(data: {
    text: string;
    links: Array<{
      word: string;
      targetBeatId: string;
      style: {
        color: string;
        hoverColor: string;
        underline: boolean;
        bold: boolean;
      };
    }>;
    allowMultiple: boolean;
  }, locations?: Location[]): Promise<string>;
  
  // 360° Panorama beat
  renderPanorama?(panoramaUrl: string, options: {
    hotspots: Array<{
      id: string;
      pitch: number;
      yaw: number;
      text: string;
      width?: number;
      height?: number;
      scale?: number;
      rotation?: number;
      sound?: string;
      assetId?: string;
      imageUrl?: string;
      kind?: string;
      hotspotOverride?: {
        enabled: boolean;
        opacity?: number;
        showInPreview?: 'visible' | 'onHover' | 'invisible';
      };
    }>;
    initialPitch?: number;
    initialYaw?: number;
    hfov?: number;
    minHfov?: number;
    maxHfov?: number;
    zoomSpeed?: number;
    projectionType?: 'equirectangular' | 'cylindrical';
    prompt?: string;
    promptDisplay?: 'static' | 'pinned';
    locations?: Location[];
  }): Promise<string>;

  // Keypad beat
  renderKeypad?(prompt: string, options: {
    layout: 'numeric' | 'phone' | 'pin';
    maxDigits: number;
    minDigits: number;
    correctCode?: string;
    failTarget?: string;
    maxAttempts: number;
    maskInput: boolean;
    buttonText: string;
    clearButtonText: string;
    showDisplay: boolean;
    skinId?: string;
  }, locations?: Location[]): Promise<string>;

  // Transition and effects
  prepareTransition?(transition: Transition): void;  // Set up initial hidden state before rendering
  applyTransition(transition: Transition): Promise<void>;  // Animate to visible after rendering
  playSound(sound: Sound): Promise<void>;

  // Cluster and beat sound lifecycle
  playClusterSound?(clusterId: string | null, sound: Sound | null): Promise<void>;
  stopBeatSound?(): void;

  // Chat mode support
  clearChatHistory?(): void;

  // AI Conversation input (text + mic for real-time conversation beats)
  renderConversationInput?(options: {
    prompt?: string;
    placeholder?: string;
    showMic?: boolean;
    language?: string;
  }): Promise<string>;

  // Per-choice visited tracking for recursive dialogs
  setVisitedChoiceIds?(choiceIds: string[]): void;

  // Loading indicator for AI-powered beats
  renderLoading?(message: string, options?: {
    subMessage?: string;
    spinnerType?: 'spinner' | 'dots' | 'pulse';
  }): void;
  hideLoading?(): void;

  // User interaction
  waitForUserInput(): Promise<void>;
  
  // State management
  clear(): void;
  setState(key: string, value: any): void;
  getState(key: string): any;
}

export interface BeatTypeDefinition {
  category: 'visible' | 'invisible' | 'custom';
  displayName: string;
  icon: string;
  parameters: Record<string, any>;
  locations?: string[];
  transitions?: boolean;
  sound?: boolean;
  renderer?: string;
}

// ============================================================================
// Conversation Direction Types (for AIConversationBeat)
// ============================================================================

/**
 * A conversation direction: trigger + action pair for steering AI conversations.
 * Structured data (not prompt strings) for future extensibility.
 */
export interface ConversationDirection {
  /** Unique identifier */
  id: string;

  /** When this direction activates */
  trigger: ConversationTrigger;

  /** What happens when triggered */
  action: ConversationAction;

  /** Priority (higher = checked first). Default 0 */
  priority?: number;

  /** If true, direction fires at most once per conversation */
  once?: boolean;

  /** Additional guard: only fire if this variable has the expected value */
  requiresVariable?: string;

  /** Expected value for the guard variable (if empty, just checks existence) */
  requiresVariableValue?: any;
}

/**
 * Trigger conditions for conversation directions
 */
export interface ConversationTrigger {
  /** Trigger type */
  type: 'topic-mention' | 'sentiment' | 'turn-count' | 'variable' | 'silence' | 'custom';

  /** If true, invert the trigger (fires when condition is NOT met) */
  negate?: boolean;

  /** Keywords to detect (topic-mention) */
  keywords?: string[];

  /** Sentiment to detect (sentiment) */
  sentiment?: 'positive' | 'negative' | 'neutral' | 'angry' | 'curious';

  /** Turn count threshold (turn-count) */
  turnCount?: number;

  /** Variable name to check (variable) */
  variableName?: string;

  /** Variable value to compare (variable) */
  variableValue?: any;

  /** Freeform description for AI evaluation (custom) */
  description?: string;
}

/**
 * Actions taken when a conversation direction triggers
 */
export interface ConversationAction {
  /** Action type */
  type: 'steer' | 'exit' | 'set-variable' | 'multi';

  /** Steering instruction for the NPC (steer) */
  instruction?: string;

  /** Target beat ID to exit to (exit) */
  exitTarget?: string;

  /** Variable name to set (set-variable) */
  variableName?: string;

  /** Variable value to set (set-variable) */
  variableValue?: any;

  /** Composed actions (multi) */
  actions?: ConversationAction[];
}
