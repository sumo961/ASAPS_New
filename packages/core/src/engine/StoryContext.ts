import  { EventEmitter } from 'eventemitter3';
import type { Condition, Effect } from '../types';
import type { Story } from './Story';
import { TimerManager } from './TimerManager';

interface StoryState {
  currentBeatId: string;
  variables: Record<string, any>;
  counters: Record<string, number>;
  inventory: string[];
  characterInventories: Record<string, string[]>; // Character-specific inventories
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
  inventory: string[];
  characterInventories: Record<string, string[]>;
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

  addToInventory(item: string): void {
    if (!this.state.inventory.includes(item)) {
      this.state.inventory.push(item);
      this.emit('inventoryChanged', { action: 'add', item });
    }
  }

  removeFromInventory(item: string): void {
    const index = this.state.inventory.indexOf(item);
    if (index >= 0) {
      this.state.inventory.splice(index, 1);
      this.emit('inventoryChanged', { action: 'remove', item });
    }
  }

  hasInInventory(item: string): boolean {
    return this.state.inventory.includes(item);
  }

  // Character-specific inventory methods
  addInventoryItem(character: string, item: string): void {
    // Use main inventory for 'player' or initialize character inventory
    if (character === 'player' || !character) {
      this.addToInventory(item);
    } else {
      if (!this.state.characterInventories[character]) {
        this.state.characterInventories[character] = [];
      }
      if (!this.state.characterInventories[character].includes(item)) {
        this.state.characterInventories[character].push(item);
        this.emit('inventoryChanged', { action: 'add', character, item });
      }
    }
  }

  removeInventoryItem(character: string, item: string): void {
    // Use main inventory for 'player' or character-specific inventory
    if (character === 'player' || !character) {
      this.removeFromInventory(item);
    } else {
      const charInventory = this.state.characterInventories[character];
      if (charInventory) {
        const index = charInventory.indexOf(item);
        if (index >= 0) {
          charInventory.splice(index, 1);
          this.emit('inventoryChanged', { action: 'remove', character, item });
        }
      }
    }
  }

  hasInventoryItem(character: string, item: string): boolean {
    if (character === 'player' || !character) {
      return this.hasInInventory(item);
    }
    const charInventory = this.state.characterInventories[character];
    return charInventory ? charInventory.includes(item) : false;
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

      const hasItem = this.state.inventory.includes(itemToCheck);
      console.log(`[StoryContext] Inventory check: "${itemToCheck}" in [${this.state.inventory.join(', ')}] = ${hasItem}`);

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
      return this.state.inventory;
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

  getInventory(): string[] {
    return [...this.state.inventory];
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
      inventory: [...this.state.inventory],
      characterInventories: Object.fromEntries(
        Object.entries(this.state.characterInventories).map(([k, v]) => [k, [...v]])
      ),
      visitedBeats: Array.from(this.state.visitedBeats),
      timers: { ...this.state.timers },
      history: [...this.history]
    };
  }

  /**
   * Load state from a serialized save
   * Restores the context to the saved state
   */
  loadFromSerialized(serialized: SerializedStoryState): void {
    // Stop any active timers before restoring state
    this.timerManager.stopAllTimers();

    // Restore state
    this.state = {
      currentBeatId: serialized.currentBeatId,
      variables: { ...serialized.variables },
      counters: { ...serialized.counters },
      inventory: [...serialized.inventory],
      characterInventories: Object.fromEntries(
        Object.entries(serialized.characterInventories || {}).map(([k, v]) => [k, [...v]])
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
