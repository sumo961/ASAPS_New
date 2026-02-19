import  { EventEmitter } from 'eventemitter3';
import type { Condition, Effect, FictionalTime } from '../types';
import type { Story } from './Story';
import { TimerManager } from './TimerManager';

/**
 * Inventory entry with quantity support
 */
export interface InventoryEntry {
  name: string;
  quantity: number;
}

/**
 * Rich choice record for AI context
 * Captures what choice was made, not just which beat was visited
 */
export interface ChoiceRecord {
  beatId: string;
  beatName?: string;
  beatType?: string;
  choiceText: string;      // What the player clicked (e.g., "Take the bike")
  choiceContext?: string;  // The question/prompt (e.g., "How will you travel?")
  timestamp: number;
}

/**
 * Options for selective reset - each flag controls whether that category is cleared.
 * All default to true for backward compatibility with full reset.
 */
export interface ResetOptions {
  variables?: boolean;
  counters?: boolean;
  inventory?: boolean;
  timers?: boolean;
  fictionalTime?: boolean;
  visitedTracking?: boolean;
  history?: boolean;
}

interface StoryState {
  currentBeatId: string;
  variables: Record<string, any>;
  counters: Record<string, number>;
  inventory: InventoryEntry[];
  characterInventories: Record<string, InventoryEntry[]>; // Character-specific inventories
  visitedBeats: Set<string>;
  visitedChoices: Set<string>; // Per-choice visited tracking, composite keys: "beatId:choiceId"
  timers: Record<string, { value: number; target?: string }>; // Enhanced timer structure
  fictionalTime?: FictionalTime; // Fictional time for in-story time progression
}

/**
 * Serializable version of StoryState for save/load functionality
 * Used by the standalone player's save system
 */
export interface SerializedStoryState {
  currentBeatId: string;
  variables: Record<string, any>;
  counters: Record<string, number>;
  inventory: InventoryEntry[];  // Now stores entries with quantities
  characterInventories: Record<string, InventoryEntry[]>;
  visitedBeats: string[]; // Array instead of Set for JSON serialization
  visitedChoices?: string[]; // Per-choice visited tracking (composite keys: "beatId:choiceId")
  timers: Record<string, { value: number; target?: string }>;
  history: string[]; // Include beat history for proper restoration
  choiceHistory?: ChoiceRecord[]; // Rich choice tracking for AI context
  fictionalTime?: FictionalTime; // Fictional time state
}

/**
 * Debug session tracking
 */
interface DebugSession {
  sessionId: string;
  startTime: number;
  currentPath: string[]; // Beat IDs in current execution path
  pathHistory: string[][]; // All complete paths taken in this session
}

/**
 * Cached analysis results
 */
interface AnalysisCache {
  reachability?: {
    timestamp: number;
    results: any;
    aiAnalysis?: any;
  };
  paths?: {
    timestamp: number;
    results: any;
    aiAnalysis?: any;
  };
}

/**
 * AI suggestion tracking
 */
interface AISuggestion {
  id: string;
  type: string;
  description: string;
  applied: boolean;
  timestamp: number;
  data?: any;
}

export class StoryContext extends EventEmitter {
  private state: StoryState;
  private history: string[] = [];
  private choiceHistory: ChoiceRecord[] = [];
  private story?: Story;
  private timerManager: TimerManager;

  // Debug features
  private debugSession?: DebugSession;
  private analysisCache: AnalysisCache = {};
  private aiSuggestions: AISuggestion[] = [];

  constructor(initialState?: Partial<StoryState>, story?: Story) {
    super();
    this.state = {
      currentBeatId: '0',
      variables: {},
      counters: {},
      inventory: [],
      characterInventories: {},
      visitedBeats: new Set(),
      visitedChoices: new Set(),
      timers: {},
      ...initialState
    };
    this.story = story;
    this.timerManager = new TimerManager();

    // Forward timer events
    this.timerManager.on('timerExpired', (data) => this.emit('timerExpired', data));
    this.timerManager.on('timerTick', (data) => this.emit('timerTick', data));
  }

  getVariable(name: string): any {
    return this.state.variables[name];
  }

  setVariable(name: string, value: any): void {
    this.state.variables[name] = value;
    this.emit('variableChanged', { name, value });
  }

  getCounter(name: string): number {
    return this.state.counters[name] || 0;
  }

  setCounter(name: string, value: number): void {
    this.state.counters[name] = value;
    this.emit('counterChanged', { name, value });
  }

  incrementCounter(name: string, value: number = 1): void {
    this.state.counters[name] = (this.state.counters[name] || 0) + value;
    this.emit('counterChanged', { name, value: this.state.counters[name] });
  }

  addToInventory(item: string, quantity: number = 1): void {
    const existing = this.state.inventory.find(entry => entry.name === item);
    if (existing) {
      existing.quantity += quantity;
      this.emit('inventoryChanged', { action: 'add', item, quantity, newTotal: existing.quantity });
    } else {
      this.state.inventory.push({ name: item, quantity });
      this.emit('inventoryChanged', { action: 'add', item, quantity, newTotal: quantity });
    }
  }

  removeFromInventory(item: string, quantity: number = 1): void {
    const existing = this.state.inventory.find(entry => entry.name === item);
    if (existing) {
      existing.quantity -= quantity;
      if (existing.quantity <= 0) {
        // Remove the item entirely
        const index = this.state.inventory.findIndex(entry => entry.name === item);
        this.state.inventory.splice(index, 1);
        this.emit('inventoryChanged', { action: 'remove', item, quantity, newTotal: 0 });
      } else {
        this.emit('inventoryChanged', { action: 'remove', item, quantity, newTotal: existing.quantity });
      }
    }
  }

  hasInInventory(item: string): boolean {
    const existing = this.state.inventory.find(entry => entry.name === item);
    return existing !== undefined && existing.quantity > 0;
  }

  getInventoryQuantity(item: string): number {
    const existing = this.state.inventory.find(entry => entry.name === item);
    return existing?.quantity ?? 0;
  }

  // Character-specific inventory methods
  addInventoryItem(character: string, item: string, quantity: number = 1): void {
    // Use main inventory for 'player' or initialize character inventory
    if (character === 'player' || !character) {
      this.addToInventory(item, quantity);
    } else {
      if (!this.state.characterInventories[character]) {
        this.state.characterInventories[character] = [];
      }
      const charInventory = this.state.characterInventories[character];
      const existing = charInventory.find(entry => entry.name === item);
      if (existing) {
        existing.quantity += quantity;
        this.emit('inventoryChanged', { action: 'add', character, item, quantity, newTotal: existing.quantity });
      } else {
        charInventory.push({ name: item, quantity });
        this.emit('inventoryChanged', { action: 'add', character, item, quantity, newTotal: quantity });
      }
    }
  }

  removeInventoryItem(character: string, item: string, quantity: number = 1): void {
    // Use main inventory for 'player' or character-specific inventory
    if (character === 'player' || !character) {
      this.removeFromInventory(item, quantity);
    } else {
      const charInventory = this.state.characterInventories[character];
      if (charInventory) {
        const existing = charInventory.find(entry => entry.name === item);
        if (existing) {
          existing.quantity -= quantity;
          if (existing.quantity <= 0) {
            const index = charInventory.findIndex(entry => entry.name === item);
            charInventory.splice(index, 1);
            this.emit('inventoryChanged', { action: 'remove', character, item, quantity, newTotal: 0 });
          } else {
            this.emit('inventoryChanged', { action: 'remove', character, item, quantity, newTotal: existing.quantity });
          }
        }
      }
    }
  }

  hasInventoryItem(character: string, item: string): boolean {
    if (character === 'player' || !character) {
      return this.hasInInventory(item);
    }
    const charInventory = this.state.characterInventories[character];
    if (!charInventory) return false;
    const existing = charInventory.find(entry => entry.name === item);
    return existing !== undefined && existing.quantity > 0;
  }

  getCharacterInventoryQuantity(character: string, item: string): number {
    if (character === 'player' || !character) {
      return this.getInventoryQuantity(item);
    }
    const charInventory = this.state.characterInventories[character];
    if (!charInventory) return 0;
    const existing = charInventory.find(entry => entry.name === item);
    return existing?.quantity ?? 0;
  }

  // Timer methods
  setTimer(name: string, value: number, target?: string): void {
    this.state.timers[name] = { value, target };
    // Start actual countdown timer
    this.timerManager.startTimer(name, value, target);
    this.emit('timerSet', { name, value, target });
  }

  clearTimer(name: string): void {
    delete this.state.timers[name];
    this.timerManager.stopTimer(name);
    this.emit('timerCleared', { name });
  }

  getTimer(name: string): number {
    // Get live remaining time from timer manager if timer is active
    if (this.timerManager.hasTimer(name)) {
      return this.timerManager.getRemainingTime(name);
    }
    return this.state.timers[name]?.value || 0;
  }

  getTimerTarget(name: string): string | undefined {
    return this.state.timers[name]?.target;
  }
  
  getTimerManager(): TimerManager {
    return this.timerManager;
  }

  // Fictional time methods
  getFictionalTime(): FictionalTime | undefined {
    return this.state.fictionalTime ? { ...this.state.fictionalTime } : undefined;
  }

  setFictionalTime(time: FictionalTime): void {
    this.state.fictionalTime = { ...time };
    this.emit('fictionalTimeChanged', this.state.fictionalTime);
  }

  /**
   * Advance (or subtract with negative amount) the fictional time.
   * Uses JS Date transiently for correct month-length/leap-year arithmetic.
   */
  advanceFictionalTime(amount: number, unit: 'minutes' | 'hours' | 'days' | 'months' | 'years'): void {
    const ft = this.state.fictionalTime;
    if (!ft) return;
    const d = new Date(ft.year, ft.month - 1, ft.day, ft.hour, ft.minute);
    switch (unit) {
      case 'minutes': d.setMinutes(d.getMinutes() + amount); break;
      case 'hours':   d.setHours(d.getHours() + amount); break;
      case 'days':    d.setDate(d.getDate() + amount); break;
      case 'months':  d.setMonth(d.getMonth() + amount); break;
      case 'years':   d.setFullYear(d.getFullYear() + amount); break;
    }
    this.state.fictionalTime = {
      year: d.getFullYear(), month: d.getMonth() + 1,
      day: d.getDate(), hour: d.getHours(), minute: d.getMinutes()
    };
    this.emit('fictionalTimeChanged', this.state.fictionalTime);
  }

  /**
   * Format fictional time for display.
   * @param format One of: 'time-12h', 'time-24h', 'date', 'datetime-12h', 'datetime-24h', 'day-number', 'year'
   * @param initialTime Optional initial time for 'day-number' calculation
   */
  formatFictionalTime(format: string, initialTime?: FictionalTime): string {
    const ft = this.state.fictionalTime;
    if (!ft) return '';

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];

    const formatTime12h = (h: number, m: number): string => {
      const period = h >= 12 ? 'PM' : 'AM';
      const hour12 = h % 12 || 12;
      return `${hour12}:${m.toString().padStart(2, '0')} ${period}`;
    };

    const formatTime24h = (h: number, m: number): string => {
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    };

    const formatDate = (): string => {
      return `${ft.day} ${monthNames[ft.month - 1]} ${ft.year}`;
    };

    switch (format) {
      case 'time-12h':
        return formatTime12h(ft.hour, ft.minute);
      case 'time-24h':
        return formatTime24h(ft.hour, ft.minute);
      case 'date':
        return formatDate();
      case 'datetime-12h':
        return `${formatDate()}, ${formatTime12h(ft.hour, ft.minute)}`;
      case 'datetime-24h':
        return `${formatDate()}, ${formatTime24h(ft.hour, ft.minute)}`;
      case 'day-number': {
        if (!initialTime) return 'Day 1';
        const current = new Date(ft.year, ft.month - 1, ft.day);
        const initial = new Date(initialTime.year, initialTime.month - 1, initialTime.day);
        const diffMs = current.getTime() - initial.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        return `Day ${diffDays + 1}`;
      }
      case 'year':
        return String(ft.year);
      default:
        return `${formatDate()}, ${formatTime12h(ft.hour, ft.minute)}`;
    }
  }

  checkCondition(condition: Condition): boolean {
    // Handle counterCompare conditions separately
    if (condition.type === 'counterCompare') {
      if (!condition.counter1 || !condition.counter2) {
        console.warn('counterCompare condition missing counter1 or counter2');
        return false;
      }

      const counter1Value = this.state.counters[condition.counter1] || 0;
      const counter2Value = this.state.counters[condition.counter2] || 0;

      switch (condition.operator) {
        case '==': return counter1Value === counter2Value;
        case '!=': return counter1Value !== counter2Value;
        case '>': return counter1Value > counter2Value;
        case '<': return counter1Value < counter2Value;
        case '>=': return counter1Value >= counter2Value;
        case '<=': return counter1Value <= counter2Value;
        default: return false;
      }
    }

    // Handle visitedBeat conditions
    if (condition.type === 'visitedBeat') {
      const beatId = condition.beatId || condition.variableName || condition.left;
      if (!beatId) {
        console.warn('visitedBeat condition missing beatId');
        return false;
      }

      const hasVisited = this.state.visitedBeats.has(beatId);

      // Support both boolean and operator-based checks
      if (condition.operator === '!=' || condition.operator === 'not') {
        return !hasVisited;
      }
      return hasVisited;
    }

    // Handle fictionalTime conditions
    if (condition.type === 'fictionalTime') {
      const current = this.state.fictionalTime;
      if (!current || !condition.compareTime) return false;
      const currentMs = new Date(current.year, current.month - 1, current.day, current.hour, current.minute).getTime();
      const compareMs = new Date(
        condition.compareTime.year, condition.compareTime.month - 1,
        condition.compareTime.day, condition.compareTime.hour, condition.compareTime.minute
      ).getTime();
      console.log(`[StoryContext] FictionalTime check: current=${currentMs} ${condition.operator} compare=${compareMs}`);
      switch (condition.operator) {
        case '>': return currentMs > compareMs;
        case '<': return currentMs < compareMs;
        case '==': return currentMs === compareMs;
        case '>=': return currentMs >= compareMs;
        case '<=': return currentMs <= compareMs;
        case '!=': return currentMs !== compareMs;
        default: return false;
      }
    }

    // Handle inventory conditions specially - ASML uses 'character' and 'item' fields
    if (condition.type === 'inventory') {
      // Get item to check - support both ASML format (item) and standard format (value/right)
      const itemToCheck = (condition as any).item || condition.value || condition.right;
      if (!itemToCheck) {
        console.warn('inventory condition missing item to check');
        return false;
      }

      const entry = this.state.inventory.find(e => e.name === itemToCheck);
      const itemQuantity = entry?.quantity ?? 0;
      const hasItem = itemQuantity > 0;
      const itemNames = this.state.inventory.map(e => `${e.name}(x${e.quantity})`);

      // Check if this is a quantity comparison (vs just existence check)
      if (condition.quantityCheck && condition.quantityOperator) {
        // Determine the left side of the comparison
        let leftValue: number;
        const compareSource = (condition as any).compareSource || 'inventory';

        if (compareSource === 'variable') {
          // Compare a variable/counter value against the threshold
          const rawVar = (condition as any).compareVariable || '';
          // Strip $ prefix if present (user might enter $goldOffer or goldOffer)
          const compareVar = rawVar.startsWith('$') ? rawVar.substring(1) : rawVar;
          const resolved = this.getVariable(compareVar) ?? this.state.counters[compareVar] ?? 0;
          leftValue = typeof resolved === 'number' ? resolved : parseInt(resolved) || 0;
        } else {
          // Compare inventory quantity against the threshold (default behavior)
          leftValue = itemQuantity;
        }

        // Resolve quantityValue (threshold) - can be a number or a variable name (prefixed with $)
        let threshold: number;
        if (typeof condition.quantityValue === 'string') {
          // Variable reference - strip $ prefix if present
          const varName = condition.quantityValue.startsWith('$')
            ? condition.quantityValue.substring(1)
            : condition.quantityValue;
          const resolved = this.getVariable(varName) ?? this.state.counters[varName] ?? 0;
          threshold = typeof resolved === 'number' ? resolved : parseInt(resolved) || 0;
        } else {
          threshold = condition.quantityValue ?? 0;
        }

        const leftLabel = compareSource === 'variable'
          ? `$${(condition as any).compareVariable}`
          : `"${itemToCheck}" qty`;
        console.log(`[StoryContext] Quantity check: ${leftLabel}=${leftValue} ${condition.quantityOperator} ${threshold}`);

        switch (condition.quantityOperator) {
          case '==': return leftValue === threshold;
          case '!=': return leftValue !== threshold;
          case '>': return leftValue > threshold;
          case '<': return leftValue < threshold;
          case '>=': return leftValue >= threshold;
          case '<=': return leftValue <= threshold;
          default: return false;
        }
      }

      console.log(`[StoryContext] Inventory check: "${itemToCheck}" in [${itemNames.join(', ')}] = ${hasItem}`);

      // Support negation operators
      if (condition.operator === '!=' || condition.operator === 'not') {
        return !hasItem;
      }
      return hasItem;
    }

    // Get variable name - support both new (variableName) and old (left) field names
    // Trim to handle ASML imports that may have leading/trailing whitespace in names
    const varName = (condition.variableName || condition.left)?.trim();

    // Handle other condition types that use variableName/value pattern
    if (!varName) {
      console.warn(`Condition of type ${condition.type} missing required variableName`);
      return false;
    }

    let leftValue: any;
    // Support both new (value) and old (right) field names
    let rightValue: any = condition.value !== undefined ? condition.value : condition.right;

    // Resolve left value based on condition type
    switch (condition.type) {
      case 'counter':
        leftValue = this.state.counters[varName] || 0;
        // Ensure rightValue is numeric for counter comparisons (guards against undefined/NaN)
        if (rightValue === undefined || rightValue === null || Number.isNaN(Number(rightValue))) {
          rightValue = 0;
        } else {
          rightValue = Number(rightValue);
        }
        console.log(`[StoryContext] Counter check: "${varName}" = ${leftValue}, comparing ${condition.operator} ${rightValue}, all counters:`, JSON.stringify(this.state.counters));
        break;
      case 'variable':
        leftValue = this.state.variables[varName];
        break;
      case 'timer':
        leftValue = this.state.timers[varName]?.value || 0;
        // Ensure rightValue is numeric for timer comparisons
        if (rightValue === undefined || rightValue === null || Number.isNaN(Number(rightValue))) {
          rightValue = 0;
        } else {
          rightValue = Number(rightValue);
        }
        break;
      default:
        // Fallback to the old resolveValue method for backward compatibility
        leftValue = this.resolveValue(varName);
        break;
    }

    switch (condition.operator) {
      case '==': return leftValue === rightValue;
      case '!=': return leftValue !== rightValue;
      case '>': return leftValue > rightValue;
      case '<': return leftValue < rightValue;
      case '>=': return leftValue >= rightValue;
      case '<=': return leftValue <= rightValue;
      case 'contains':
        return Array.isArray(leftValue) ? leftValue.includes(rightValue) : false;
      default: return false;
    }
  }

  applyEffect(effect: Effect): void {
    switch (effect.type) {
      case 'setVariable':
        this.setVariable(effect.target, effect.value);
        break;
      case 'addInventory':
        this.addToInventory(effect.target);
        break;
      case 'removeInventory':
        this.removeFromInventory(effect.target);
        break;
      case 'incrementCounter':
        this.incrementCounter(effect.target, effect.value || 1);
        break;
      case 'setCounter':
        this.setCounter(effect.target, effect.value ?? 0);
        break;
    }
  }

  markBeatVisited(beatId: string): void {
    this.state.visitedBeats.add(beatId);
    this.history.push(beatId);
  }

  markChoiceVisited(beatId: string, choiceId: string): void {
    this.state.visitedChoices.add(`${beatId}:${choiceId}`);
  }

  getVisitedChoicesForBeat(beatId: string): string[] {
    const prefix = `${beatId}:`;
    return Array.from(this.state.visitedChoices)
      .filter(key => key.startsWith(prefix))
      .map(key => key.substring(prefix.length));
  }

  /**
   * Record a player choice for rich AI context
   * Called by choice beats (DialogTree, MovementChoice, PickProp, HyperText)
   */
  recordChoice(choice: Omit<ChoiceRecord, 'timestamp'>): void {
    this.choiceHistory.push({
      ...choice,
      timestamp: Date.now(),
    });
  }

  /**
   * Get the rich choice history for AI prompts
   */
  getChoiceHistory(): ChoiceRecord[] {
    return [...this.choiceHistory];
  }

  /**
   * Get recent choices (for context-limited AI prompts)
   */
  getRecentChoices(limit: number = 10): ChoiceRecord[] {
    return this.choiceHistory.slice(-limit);
  }

  private resolveValue(ref: string | undefined): any {
    if (!ref) {
      return undefined;
    }

    if (ref.startsWith('var:')) {
      return this.getVariable(ref.substring(4));
    }
    if (ref.startsWith('counter:')) {
      return this.state.counters[ref.substring(8)] || 0;
    }
    if (ref === 'inventory') {
      // Return item names for backward compatibility
      return this.state.inventory.map(entry => entry.name);
    }
    return ref;
  }

  getState(): Readonly<StoryState> {
    return Object.freeze({ ...this.state });
  }

  getVisitedBeats(): string[] {
    return Array.from(this.state.visitedBeats);
  }

  getVariables(): Record<string, any> {
    return { ...this.state.variables };
  }

  getCounters(): Record<string, number> {
    return { ...this.state.counters };
  }

  /**
   * Get inventory as array of item names (backward compatible)
   * Each item appears once regardless of quantity
   */
  getInventory(): string[] {
    return this.state.inventory.map(entry => entry.name);
  }

  /**
   * Get full inventory entries with quantities
   */
  getInventoryEntries(): InventoryEntry[] {
    return this.state.inventory.map(entry => ({ ...entry }));
  }

  getTimers(): Record<string, { value: number; target?: string }> {
    return { ...this.state.timers };
  }

  reset(): void {
    this.timerManager.stopAllTimers();
    this.state = {
      currentBeatId: '0',
      variables: {},
      counters: {},
      inventory: [],
      characterInventories: {},
      visitedBeats: new Set(),
      visitedChoices: new Set(),
      timers: {}
    };
    this.history = [];
    this.choiceHistory = [];
    this.emit('reset');
  }

  /**
   * Selective reset - only clear the categories set to true.
   * Allows EndScreen beats to preserve certain state (e.g. keep variables but reset counters).
   */
  selectiveReset(options: ResetOptions): void {
    if (options.variables) {
      this.state.variables = {};
    }
    if (options.counters) {
      this.state.counters = {};
    }
    if (options.inventory) {
      this.state.inventory = [];
      this.state.characterInventories = {};
    }
    if (options.timers) {
      this.timerManager.stopAllTimers();
      this.state.timers = {};
    }
    if (options.fictionalTime) {
      delete this.state.fictionalTime;
    }
    if (options.visitedTracking) {
      this.state.visitedBeats = new Set();
      this.state.visitedChoices = new Set();
    }
    if (options.history) {
      this.history = [];
      this.choiceHistory = [];
    }
    this.state.currentBeatId = '0';
    this.emit('selectiveReset', options);
  }

  getStory(): Story {
    if (!this.story) {
      throw new Error('Story not set in context');
    }
    return this.story;
  }

  setStory(story: Story): void {
    this.story = story;
  }

  /**
   * Update a character's display name
   * This keeps the character ID stable while allowing dynamic renaming
   */
  updateCharacterDisplayName(characterId: string, displayName: string): void {
    if (!this.story) {
      console.warn('Cannot update character display name: story not set in context');
      return;
    }

    const characters = this.story.getCharacters();
    const character = characters.find((c: any) => c.id === characterId);

    if (character) {
      character.displayName = displayName;
      this.emit('characterRenamed', { characterId, displayName });
    } else {
      console.warn(`Character with id '${characterId}' not found`);
    }
  }

  // ======== Debug Session Management ========

  /**
   * Start a new debug session
   */
  startDebugSession(): string {
    const sessionId = `debug_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    this.debugSession = {
      sessionId,
      startTime: Date.now(),
      currentPath: [],
      pathHistory: []
    };
    this.emit('debugSessionStarted', { sessionId });
    return sessionId;
  }

  /**
   * End the current debug session
   */
  endDebugSession(): void {
    if (this.debugSession) {
      // Save current path to history if not empty
      if (this.debugSession.currentPath.length > 0) {
        this.debugSession.pathHistory.push([...this.debugSession.currentPath]);
      }
      this.emit('debugSessionEnded', { sessionId: this.debugSession.sessionId });
      this.debugSession = undefined;
    }
  }

  /**
   * Get the current path in the debug session
   */
  getCurrentPath(): string[] {
    return this.debugSession ? [...this.debugSession.currentPath] : [];
  }

  /**
   * Get all completed paths from the debug session
   */
  getPathHistory(): string[][] {
    return this.debugSession ? [...this.debugSession.pathHistory] : [];
  }

  /**
   * Add a beat to the current debug path
   */
  addToDebugPath(beatId: string): void {
    if (this.debugSession) {
      this.debugSession.currentPath.push(beatId);
    }
  }

  /**
   * Complete the current path and start a new one (e.g., when reaching an end beat)
   */
  completeDebugPath(): void {
    if (this.debugSession && this.debugSession.currentPath.length > 0) {
      this.debugSession.pathHistory.push([...this.debugSession.currentPath]);
      this.debugSession.currentPath = [];
    }
  }

  // ======== Analysis Caching ========

  /**
   * Cache reachability analysis results
   */
  cacheReachabilityResults(results: any, aiAnalysis?: any): void {
    this.analysisCache.reachability = {
      timestamp: Date.now(),
      results,
      aiAnalysis
    };
  }

  /**
   * Get cached reachability results
   */
  getCachedReachability(): any | null {
    return this.analysisCache.reachability?.results || null;
  }

  /**
   * Cache path analysis results
   */
  cachePathResults(results: any, aiAnalysis?: any): void {
    this.analysisCache.paths = {
      timestamp: Date.now(),
      results,
      aiAnalysis
    };
  }

  /**
   * Get cached path results
   */
  getCachedPaths(): any | null {
    return this.analysisCache.paths?.results || null;
  }

  /**
   * Invalidate all analysis caches (call when story structure changes)
   */
  invalidateAnalysisCache(): void {
    this.analysisCache = {};
    this.emit('analysisCacheInvalidated');
  }

  /**
   * Check if cached analysis is still valid (not older than maxAge in milliseconds)
   */
  isCacheValid(cacheType: 'reachability' | 'paths', maxAge: number = 60000): boolean {
    const cache = this.analysisCache[cacheType];
    if (!cache) return false;
    return Date.now() - cache.timestamp < maxAge;
  }

  // ======== AI Suggestion Management ========

  /**
   * Add an AI-generated suggestion
   */
  addAISuggestion(suggestion: Omit<AISuggestion, 'id' | 'timestamp'>): string {
    const id = `suggestion_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const fullSuggestion: AISuggestion = {
      ...suggestion,
      id,
      timestamp: Date.now(),
      applied: false
    };
    this.aiSuggestions.push(fullSuggestion);
    this.emit('aiSuggestionAdded', fullSuggestion);
    return id;
  }

  /**
   * Mark a suggestion as applied
   */
  applySuggestion(suggestionId: string): void {
    const suggestion = this.aiSuggestions.find(s => s.id === suggestionId);
    if (suggestion) {
      suggestion.applied = true;
      this.emit('aiSuggestionApplied', suggestion);
    }
  }

  /**
   * Get all AI suggestions, optionally filtered
   */
  getSuggestions(filter?: { applied?: boolean; type?: string }): AISuggestion[] {
    let suggestions = [...this.aiSuggestions];

    if (filter) {
      if (filter.applied !== undefined) {
        suggestions = suggestions.filter(s => s.applied === filter.applied);
      }
      if (filter.type) {
        suggestions = suggestions.filter(s => s.type === filter.type);
      }
    }

    return suggestions;
  }

  /**
   * Clear all AI suggestions
   */
  clearAISuggestions(): void {
    this.aiSuggestions = [];
    this.emit('aiSuggestionsCleared');
  }

  /**
   * Remove a specific AI suggestion
   */
  removeAISuggestion(suggestionId: string): void {
    const index = this.aiSuggestions.findIndex(s => s.id === suggestionId);
    if (index !== -1) {
      this.aiSuggestions.splice(index, 1);
      this.emit('aiSuggestionRemoved', { suggestionId });
    }
  }

  // ======== Save/Load Serialization ========

  /**
   * Serialize the current story state for saving
   * Converts Sets to Arrays for JSON compatibility
   */
  serialize(): SerializedStoryState {
    return {
      currentBeatId: this.state.currentBeatId,
      variables: { ...this.state.variables },
      counters: { ...this.state.counters },
      inventory: this.state.inventory.map(entry => ({ ...entry })),
      characterInventories: Object.fromEntries(
        Object.entries(this.state.characterInventories).map(([k, v]) => [k, v.map(entry => ({ ...entry }))])
      ),
      visitedBeats: Array.from(this.state.visitedBeats),
      visitedChoices: Array.from(this.state.visitedChoices),
      timers: { ...this.state.timers },
      history: [...this.history],
      choiceHistory: this.choiceHistory.map(c => ({ ...c })),
      fictionalTime: this.state.fictionalTime ? { ...this.state.fictionalTime } : undefined,
    };
  }

  /**
   * Load state from a serialized save
   * Restores the context to the saved state
   * Handles both old format (string[]) and new format (InventoryEntry[])
   */
  loadFromSerialized(serialized: SerializedStoryState): void {
    // Stop any active timers before restoring state
    this.timerManager.stopAllTimers();

    // Helper to migrate old string[] format to InventoryEntry[]
    const migrateInventory = (inv: any[]): InventoryEntry[] => {
      if (!inv || inv.length === 0) return [];
      // Check if it's old format (string[]) or new format (InventoryEntry[])
      if (typeof inv[0] === 'string') {
        // Old format - convert to new format with quantity 1
        return inv.map((name: string) => ({ name, quantity: 1 }));
      }
      // New format - clone entries
      return inv.map((entry: InventoryEntry) => ({ ...entry }));
    };

    // Restore state
    this.state = {
      currentBeatId: serialized.currentBeatId,
      variables: { ...serialized.variables },
      counters: { ...serialized.counters },
      inventory: migrateInventory(serialized.inventory),
      characterInventories: Object.fromEntries(
        Object.entries(serialized.characterInventories || {}).map(([k, v]) => [k, migrateInventory(v)])
      ),
      visitedBeats: new Set(serialized.visitedBeats),
      visitedChoices: new Set((serialized as any).visitedChoices || []),
      timers: { ...serialized.timers },
      fictionalTime: serialized.fictionalTime ? { ...serialized.fictionalTime } : undefined,
    };

    // Restore history
    this.history = [...serialized.history];

    // Restore choice history (if available - may be missing in old saves)
    this.choiceHistory = serialized.choiceHistory
      ? serialized.choiceHistory.map(c => ({ ...c }))
      : [];

    // Restart any saved timers
    for (const [name, timer] of Object.entries(serialized.timers)) {
      if (timer.value > 0) {
        this.timerManager.startTimer(name, timer.value, timer.target);
      }
    }

    this.emit('stateLoaded', { serialized });
  }

  /**
   * Get the current beat ID
   */
  getCurrentBeatId(): string {
    return this.state.currentBeatId;
  }

  /**
   * Set the current beat ID
   */
  setCurrentBeatId(beatId: string): void {
    this.state.currentBeatId = beatId;
    this.emit('beatChanged', { beatId });
  }

  /**
   * Get the beat history
   */
  getHistory(): string[] {
    return [...this.history];
  }
}
