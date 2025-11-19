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

export class StoryContext extends EventEmitter {
  private state: StoryState;
  private history: string[] = [];
  private story?: Story;
  private timerManager: TimerManager;

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
      const beatId = condition.beatId || condition.left;
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

    // Handle other condition types that use left/right pattern
    if (!condition.left) {
      console.warn(`Condition of type ${condition.type} missing required left value`);
      return false;
    }

    let left: any;
    const right = condition.right;

    // Resolve left value based on condition type
    switch (condition.type) {
      case 'counter':
        left = this.state.counters[condition.left] || 0;
        break;
      case 'variable':
        left = this.state.variables[condition.left];
        break;
      case 'inventory':
        // For inventory conditions, left is the character name, check their inventory
        // For now, we'll check the main inventory - could be extended for character-specific inventories
        left = this.state.inventory;
        break;
      case 'timer':
        left = this.state.timers[condition.left]?.value || 0;
        break;
      default:
        // Fallback to the old resolveValue method for backward compatibility
        left = this.resolveValue(condition.left);
        break;
    }

    switch (condition.operator) {
      case '==': return left === right;
      case '!=': return left !== right;
      case '>': return left > right;
      case '<': return left < right;
      case '>=': return left >= right;
      case '<=': return left <= right;
      case 'contains':
        return Array.isArray(left) ? left.includes(right) : false;
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
}
