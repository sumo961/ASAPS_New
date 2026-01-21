import  { EventEmitter } from 'eventemitter3';
import type { Condition, Effect } from '../types';
import type { Story } from './Story';
import { TimerManager } from './TimerManager';

/**
 * Inventory entry with quantity support
 */
export interface InventoryEntry {
  name: string;
  quantity: number;
}

interface StoryState {
  currentBeatId: string;
  variables: Record<string, any>;
  counters: Record<string, number>;
  inventory: InventoryEntry[];
  characterInventories: Record<string, InventoryEntry[]>; // Character-specific inventories
  visitedBeats: Set<string>;
  timers: Record<string, { value: number; target?: string }>; // Enhanced timer structure
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
  timers: Record<string, { value: number; target?: string }>;
  history: string[]; // Include beat history for proper restoration
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
        // Resolve quantityValue - can be a number or a variable name (prefixed with $)
        let compareValue: number;
        if (typeof condition.quantityValue === 'string') {
          // Variable reference - strip $ prefix if present
          const varName = condition.quantityValue.startsWith('$')
            ? condition.quantityValue.substring(1)
            : condition.quantityValue;
          const resolved = this.getVariable(varName) ?? this.state.counters[varName] ?? 0;
          compareValue = typeof resolved === 'number' ? resolved : parseInt(resolved) || 0;
        } else {
          compareValue = condition.quantityValue ?? 0;
        }

        console.log(`[StoryContext] Inventory quantity check: "${itemToCheck}" qty=${itemQuantity} ${condition.quantityOperator} ${compareValue}`);

        switch (condition.quantityOperator) {
          case '==': return itemQuantity === compareValue;
          case '!=': return itemQuantity !== compareValue;
          case '>': return itemQuantity > compareValue;
          case '<': return itemQuantity < compareValue;
          case '>=': return itemQuantity >= compareValue;
          case '<=': return itemQuantity <= compareValue;
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
    const varName = condition.variableName || condition.left;

    // Handle other condition types that use variableName/value pattern
    if (!varName) {
      console.warn(`Condition of type ${condition.type} missing required variableName`);
      return false;
    }

    let leftValue: any;
    // Support both new (value) and old (right) field names
    const rightValue = condition.value !== undefined ? condition.value : condition.right;

    // Resolve left value based on condition type
    switch (condition.type) {
      case 'counter':
        leftValue = this.state.counters[varName] || 0;
        console.log(`[StoryContext] Counter check: "${varName}" = ${leftValue}, comparing ${condition.operator} ${rightValue}, all counters:`, JSON.stringify(this.state.counters));
        break;
      case 'variable':
        leftValue = this.state.variables[varName];
        break;
      case 'timer':
        leftValue = this.state.timers[varName]?.value || 0;
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
    }
  }

  markBeatVisited(beatId: string): void {
    this.state.visitedBeats.add(beatId);
    this.history.push(beatId);
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
      timers: {}
    };
    this.history = [];
    this.emit('reset');
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
      timers: { ...this.state.timers },
      history: [...this.history]
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
      timers: { ...serialized.timers }
    };

    // Restore history
    this.history = [...serialized.history];

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
