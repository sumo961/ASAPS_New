import  { EventEmitter } from 'eventemitter3';
import type { Condition, Effect, FictionalTime } from '../types';
import type { Story } from './Story';
import { TimerManager } from './TimerManager';
import { resolveCharacterKey } from '../utils/characterRef';
import { modulateEmotionDelta } from './PersonalityTraits';

/**
 * Inventory entry with quantity support
 */
export interface InventoryEntry {
  name: string;
  quantity: number;
}

/**
 * 2D mood (Layer 3 / Step 4 — mood + sentiments MVP).
 * `valence`  ∈ [-1, 1]  — negative = unpleasant, positive = pleasant.
 * `arousal`  ∈ [-1, 1]  — negative = calm/sleepy, positive = excited/agitated.
 * Authors and beat actions both use `nudgeCharacterMood` which clamps each
 * axis on write. Default mood is `{ valence: 0, arousal: 0 }` — neutral.
 */
export interface CharacterMood {
  valence: number;
  arousal: number;
}

/**
 * A directed emotional memory (Layer 3 / Step 4). One character "feels
 * `emotion` toward `toEntityRef` with a given strength."
 *
 * `toEntityRef` is intentionally loose: a Character.id, a free-text item
 * name, a beat id, or any author-chosen tag. `emotion` is also a free
 * string — Ekman 6 + pride/shame/interest are sensible defaults, but the
 * runtime doesn't enforce a palette (Step 5 will add an opt-in palette).
 *
 * `strength` ∈ [-1, 1]. Negative values mean "anti-emotion toward target"
 * (e.g. fear-of vs trust-in collapse to one row with opposite signs).
 * `createdAt` is the timestamp when the sentiment was first recorded —
 * `addCharacterSentiment` updates an existing sentiment's strength rather
 * than overwriting createdAt.
 */
export interface Sentiment {
  toEntityRef: string;
  emotion: string;
  strength: number;
  createdAt: number;
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
  // Character-scoped state (Layer 2 of the rich-character roadmap).
  // Outer key is the canonical Character.id (or a fallback string for inline /
  // legacy refs). Inner key is the variable / counter / flag name.
  // Existing un-namespaced `variables` and `counters` continue to work for
  // story-global state — character-scoped storage is opt-in.
  characterCounters: Record<string, Record<string, number>>;
  characterVariables: Record<string, Record<string, any>>;
  characterFlags: Record<string, Record<string, boolean>>;
  // Mood + sentiments (Layer 3 / Step 4 of the rich-character roadmap).
  // Both keyed by canonical Character.id (or fallback ref string).
  characterMoods: Record<string, CharacterMood>;
  characterSentiments: Record<string, Sentiment[]>;
  // Emotion levels per character (Step 5). Outer key = canonical Character.id,
  // inner key = emotion name (matched case-insensitively against the story's
  // EmotionPalette). Each value ∈ [0, 1] — emotion intensity decays toward 0
  // each tick (typically per beat-entry) at the rate the palette declares.
  characterEmotionLevels: Record<string, Record<string, number>>;
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
  // Character-scoped state (Layer 2). Optional in serialized form so older
  // save files / committed contexts still load — the loader fills missing
  // slots with empty objects.
  characterCounters?: Record<string, Record<string, number>>;
  characterMoods?: Record<string, CharacterMood>;
  characterSentiments?: Record<string, Sentiment[]>;
  characterEmotionLevels?: Record<string, Record<string, number>>;
  characterVariables?: Record<string, Record<string, any>>;
  characterFlags?: Record<string, Record<string, boolean>>;
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

export interface AIOutputRecord {
  beatId: string;
  beatName?: string;
  beatType: string;
  text: string;
  timestamp: number;
}

export type TimelineEventType = 'beat-enter' | 'choice' | 'ai-output' | 'branch' | 'state-change';

export interface TimelineEvent {
  type: TimelineEventType;
  timestamp: number;
  beatId: string;
  beatName?: string;
  beatType?: string;
  /** For 'choice': what the player chose */
  choiceText?: string;
  /** For 'choice': the question/context */
  choiceContext?: string;
  /** For 'ai-output': the generated text */
  text?: string;
  /** For 'branch': which target was chosen and why */
  targetBeatId?: string;
  targetBeatName?: string;
  reason?: string;
  /** For 'state-change': what changed */
  stateChange?: string;
}

export class StoryContext extends EventEmitter {
  private state: StoryState;
  private history: string[] = [];
  private choiceHistory: ChoiceRecord[] = [];
  private aiOutputHistory: AIOutputRecord[] = [];
  private timeline: TimelineEvent[] = [];
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
      characterCounters: {},
      characterVariables: {},
      characterFlags: {},
      characterMoods: {},
      characterSentiments: {},
      characterEmotionLevels: {},
      visitedBeats: new Set(),
      visitedChoices: new Set(),
      timers: {},
      ...initialState
    };
    this.story = story;
    this.timerManager = new TimerManager();
    // Seed authored initial affect (mood + sentiments) into the runtime
    // state. No-op when no story or no characters declare initial affect.
    if (story) this.seedCharacterAffectFromStory();

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

  // Character-specific inventory methods.
  //
  // The `character` arg accepts a Character.id (canonical), a name, or a
  // displayName — we resolve to the canonical id-keyed bucket via
  // resolveCharacterKey. If a legacy bucket exists under one of the alias
  // strings (because an older story wrote to "Granny" before promotion),
  // ensureCanonicalCharacterBucket merges it into the canonical bucket the
  // first time the character is touched. After that, all aliases route to
  // the same storage and stay in sync.

  /**
   * Ensure the canonical-id bucket exists and absorb any legacy alias buckets.
   * Returns the canonical key to use, or null if the ref should route to the
   * global player inventory ('player' / empty).
   */
  private ensureCanonicalCharacterBucket(ref: string): string | null {
    if (ref === 'player' || !ref) return null;
    const canonical = this.resolveCharRef(ref);
    if (!canonical) return null;

    // Find aliases (name, displayName, original ref) that have separate buckets
    // and merge them into the canonical bucket.
    const characters = (this.story as any)?.getCharacters?.() as
      | { id: string; name?: string; displayName?: string }[]
      | undefined;
    const character = characters?.find((c) => c.id === canonical);
    const aliasKeys = new Set<string>();
    if (character) {
      if (character.name && character.name !== canonical) aliasKeys.add(character.name);
      if (character.displayName && character.displayName !== canonical) aliasKeys.add(character.displayName);
    }
    if (ref !== canonical) aliasKeys.add(ref);

    if (!this.state.characterInventories[canonical]) {
      this.state.characterInventories[canonical] = [];
    }
    const target = this.state.characterInventories[canonical];

    for (const alias of aliasKeys) {
      const aliasBucket = this.state.characterInventories[alias];
      if (!aliasBucket || aliasBucket === target) continue;
      // Merge alias entries into target (sum quantities for matching items).
      for (const entry of aliasBucket) {
        const existing = target.find((e) => e.name === entry.name);
        if (existing) existing.quantity += entry.quantity;
        else target.push({ ...entry });
      }
      delete this.state.characterInventories[alias];
    }
    return canonical;
  }

  addInventoryItem(character: string, item: string, quantity: number = 1): void {
    if (character === 'player' || !character) {
      this.addToInventory(item, quantity);
      return;
    }
    const key = this.ensureCanonicalCharacterBucket(character) ?? character;
    if (!this.state.characterInventories[key]) {
      this.state.characterInventories[key] = [];
    }
    const charInventory = this.state.characterInventories[key];
    const existing = charInventory.find(entry => entry.name === item);
    if (existing) {
      existing.quantity += quantity;
      this.emit('inventoryChanged', { action: 'add', character: key, item, quantity, newTotal: existing.quantity });
    } else {
      charInventory.push({ name: item, quantity });
      this.emit('inventoryChanged', { action: 'add', character: key, item, quantity, newTotal: quantity });
    }
  }

  removeInventoryItem(character: string, item: string, quantity: number = 1): void {
    if (character === 'player' || !character) {
      this.removeFromInventory(item, quantity);
      return;
    }
    const key = this.ensureCanonicalCharacterBucket(character) ?? character;
    const charInventory = this.state.characterInventories[key];
    if (!charInventory) return;
    const existing = charInventory.find(entry => entry.name === item);
    if (!existing) return;
    existing.quantity -= quantity;
    if (existing.quantity <= 0) {
      const index = charInventory.findIndex(entry => entry.name === item);
      charInventory.splice(index, 1);
      this.emit('inventoryChanged', { action: 'remove', character: key, item, quantity, newTotal: 0 });
    } else {
      this.emit('inventoryChanged', { action: 'remove', character: key, item, quantity, newTotal: existing.quantity });
    }
  }

  hasInventoryItem(character: string, item: string): boolean {
    if (character === 'player' || !character) {
      return this.hasInInventory(item);
    }
    const key = this.ensureCanonicalCharacterBucket(character) ?? character;
    const charInventory = this.state.characterInventories[key];
    if (!charInventory) return false;
    const existing = charInventory.find(entry => entry.name === item);
    return existing !== undefined && existing.quantity > 0;
  }

  getCharacterInventoryQuantity(character: string, item: string): number {
    if (character === 'player' || !character) {
      return this.getInventoryQuantity(item);
    }
    const key = this.ensureCanonicalCharacterBucket(character) ?? character;
    const charInventory = this.state.characterInventories[key];
    if (!charInventory) return 0;
    const existing = charInventory.find(entry => entry.name === item);
    return existing?.quantity ?? 0;
  }

  // ======== Character-scoped state (Layer 2) ========
  //
  // Counters / variables / flags namespaced under a Character ref. The ref
  // can be a Character.id (canonical), a Character.name, or a Character
  // displayName — the resolver normalises all three to the same id-keyed
  // bucket. If the ref doesn't match any defined Character, the original
  // string is used as the bucket key, so inline-only personas and legacy
  // free-text speakers still get coherent storage.
  //
  // These coexist with the un-namespaced `variables` and `counters` for
  // story-global state. Beats opt in to character-scoped storage explicitly.

  /** Resolve a character ref to its canonical storage key, using this story's character list. */
  private resolveCharRef(ref: string | null | undefined): string | null {
    if (!ref) return null;
    const characters = (this.story as any)?.getCharacters?.() as
      | { id: string; name?: string; displayName?: string }[]
      | undefined;
    return resolveCharacterKey(ref, characters);
  }

  // -- Counters --
  getCharacterCounter(charRef: string, name: string): number {
    const key = this.resolveCharRef(charRef);
    if (!key) return 0;
    return this.state.characterCounters[key]?.[name] ?? 0;
  }

  setCharacterCounter(charRef: string, name: string, value: number): void {
    const key = this.resolveCharRef(charRef);
    if (!key) return;
    if (!this.state.characterCounters[key]) this.state.characterCounters[key] = {};
    const previous = this.state.characterCounters[key][name] ?? 0;
    this.state.characterCounters[key][name] = value;
    this.emit('characterCounterChanged', { characterRef: key, name, value, previous });
  }

  incrementCharacterCounter(charRef: string, name: string, delta: number = 1): number {
    const key = this.resolveCharRef(charRef);
    if (!key) return 0;
    const next = (this.state.characterCounters[key]?.[name] ?? 0) + delta;
    this.setCharacterCounter(charRef, name, next);
    return next;
  }

  // -- Variables --
  getCharacterVariable(charRef: string, name: string): any {
    const key = this.resolveCharRef(charRef);
    if (!key) return undefined;
    return this.state.characterVariables[key]?.[name];
  }

  setCharacterVariable(charRef: string, name: string, value: any): void {
    const key = this.resolveCharRef(charRef);
    if (!key) return;
    if (!this.state.characterVariables[key]) this.state.characterVariables[key] = {};
    const previous = this.state.characterVariables[key][name];
    this.state.characterVariables[key][name] = value;
    this.emit('characterVariableChanged', { characterRef: key, name, value, previous });
  }

  // -- Flags --
  getCharacterFlag(charRef: string, name: string): boolean {
    const key = this.resolveCharRef(charRef);
    if (!key) return false;
    return this.state.characterFlags[key]?.[name] ?? false;
  }

  setCharacterFlag(charRef: string, name: string, value: boolean): void {
    const key = this.resolveCharRef(charRef);
    if (!key) return;
    if (!this.state.characterFlags[key]) this.state.characterFlags[key] = {};
    const previous = this.state.characterFlags[key][name] ?? false;
    this.state.characterFlags[key][name] = value;
    this.emit('characterFlagChanged', { characterRef: key, name, value, previous });
  }

  /** All character-scoped state (counters, variables, flags) for one character — handy for dossier building / debug panels. */
  getCharacterState(charRef: string): {
    counters: Record<string, number>;
    variables: Record<string, any>;
    flags: Record<string, boolean>;
  } {
    const key = this.resolveCharRef(charRef);
    if (!key) return { counters: {}, variables: {}, flags: {} };
    return {
      counters: { ...(this.state.characterCounters[key] || {}) },
      variables: { ...(this.state.characterVariables[key] || {}) },
      flags: { ...(this.state.characterFlags[key] || {}) },
    };
  }

  // ======== Character mood + sentiments (Layer 3 / Step 4) ========

  private static clampUnit(v: number): number {
    if (Number.isNaN(v)) return 0;
    return Math.min(1, Math.max(-1, v));
  }

  /** Current 2D mood for the character. Defaults to neutral { 0, 0 } when unset. */
  getCharacterMood(charRef: string): CharacterMood {
    const key = this.resolveCharRef(charRef);
    if (!key) return { valence: 0, arousal: 0 };
    return { ...(this.state.characterMoods[key] || { valence: 0, arousal: 0 }) };
  }

  /** Replace the character's mood. Each axis is clamped to [-1, 1]. */
  setCharacterMood(charRef: string, mood: Partial<CharacterMood>): void {
    const key = this.resolveCharRef(charRef);
    if (!key) return;
    const current = this.state.characterMoods[key] || { valence: 0, arousal: 0 };
    const next: CharacterMood = {
      valence: StoryContext.clampUnit(mood.valence ?? current.valence),
      arousal: StoryContext.clampUnit(mood.arousal ?? current.arousal),
    };
    this.state.characterMoods[key] = next;
    this.emit('characterMoodChanged', { characterRef: key, mood: next, previous: current });
  }

  /** Add deltas to the mood, clamped per axis. The most common authoring path. */
  nudgeCharacterMood(charRef: string, dValence: number = 0, dArousal: number = 0): CharacterMood {
    const key = this.resolveCharRef(charRef);
    if (!key) return { valence: 0, arousal: 0 };
    const current = this.state.characterMoods[key] || { valence: 0, arousal: 0 };
    const next: CharacterMood = {
      valence: StoryContext.clampUnit(current.valence + dValence),
      arousal: StoryContext.clampUnit(current.arousal + dArousal),
    };
    this.state.characterMoods[key] = next;
    this.emit('characterMoodChanged', { characterRef: key, mood: next, previous: current });
    return next;
  }

  /** All sentiments held by the character. Returns a clone — caller can't mutate state. */
  getCharacterSentiments(charRef: string): Sentiment[] {
    const key = this.resolveCharRef(charRef);
    if (!key) return [];
    return (this.state.characterSentiments[key] || []).map((s) => ({ ...s }));
  }

  /**
   * Sentiment strength from `fromCharRef` toward `toEntityRef` for `emotion`.
   * Returns 0 when no matching sentiment exists. Use this in conditions like
   * "if granny.sentimentTo(player, 'trust') >= 0.5".
   */
  getSentimentTo(fromCharRef: string, toEntityRef: string, emotion?: string): number {
    const sentiments = this.getCharacterSentiments(fromCharRef);
    let total = 0;
    for (const s of sentiments) {
      if (s.toEntityRef !== toEntityRef) continue;
      if (emotion && s.emotion !== emotion) continue;
      // When `emotion` is unspecified, sum across all emotions toward the
      // target — gives a rough "overall feeling toward X" scalar.
      total = emotion ? s.strength : total + s.strength;
      if (emotion) break;
    }
    return total;
  }

  /**
   * Add or strengthen a directed emotional memory. When a sentiment with the
   * same `(toEntityRef, emotion)` already exists, strengths sum (clamped to
   * [-1, 1]) and `createdAt` is preserved. Otherwise a new sentiment is
   * recorded with the current timestamp.
   */
  addCharacterSentiment(
    fromCharRef: string,
    toEntityRef: string,
    emotion: string,
    deltaStrength: number,
  ): Sentiment | null {
    const key = this.resolveCharRef(fromCharRef);
    if (!key) return null;
    if (!this.state.characterSentiments[key]) this.state.characterSentiments[key] = [];
    const list = this.state.characterSentiments[key];
    const existingIdx = list.findIndex((s) => s.toEntityRef === toEntityRef && s.emotion === emotion);
    let next: Sentiment;
    if (existingIdx >= 0) {
      const existing = list[existingIdx];
      next = {
        ...existing,
        strength: StoryContext.clampUnit(existing.strength + deltaStrength),
      };
      list[existingIdx] = next;
    } else {
      next = {
        toEntityRef,
        emotion,
        strength: StoryContext.clampUnit(deltaStrength),
        createdAt: Date.now(),
      };
      list.push(next);
    }
    this.emit('characterSentimentChanged', {
      characterRef: key,
      toEntityRef,
      emotion,
      strength: next.strength,
      delta: deltaStrength,
    });
    return next;
  }

  // ======== Character emotions (Step 5 — emotion nodes) ========

  /** Current intensity of a single emotion for the character (∈ [0, 1]). */
  getCharacterEmotion(charRef: string, emotion: string): number {
    const key = this.resolveCharRef(charRef);
    if (!key || !emotion) return 0;
    const lower = emotion.toLowerCase();
    return this.state.characterEmotionLevels[key]?.[lower] ?? 0;
  }

  /** All non-zero emotions for the character — keyed by emotion name (lowercase). */
  getCharacterEmotions(charRef: string): Record<string, number> {
    const key = this.resolveCharRef(charRef);
    if (!key) return {};
    return { ...(this.state.characterEmotionLevels[key] || {}) };
  }

  /** Replace one emotion's intensity directly. Clamped to [0, 1]. */
  setCharacterEmotion(charRef: string, emotion: string, value: number): void {
    const key = this.resolveCharRef(charRef);
    if (!key || !emotion) return;
    const lower = emotion.toLowerCase();
    if (!this.state.characterEmotionLevels[key]) this.state.characterEmotionLevels[key] = {};
    const previous = this.state.characterEmotionLevels[key][lower] ?? 0;
    const next = Math.max(0, Math.min(1, value));
    this.state.characterEmotionLevels[key][lower] = next;
    this.emit('characterEmotionChanged', { characterRef: key, emotion: lower, value: next, previous });
  }

  /**
   * Fire an emotion at the character: bumps the emotion's level by `delta`
   * (clamped to [0, 1]) AND nudges the character's mood by delta × the
   * emotion's weights from the story's EmotionPalette. This is the primary
   * authoring path — `setCharacterEmotion` is the lower-level escape hatch
   * for cases where mood shouldn't be auto-nudged.
   */
  fireCharacterEmotion(charRef: string, emotion: string, delta: number): number {
    const key = this.resolveCharRef(charRef);
    if (!key || !emotion) return 0;
    const lower = emotion.toLowerCase();

    // Step 6 — modulate the incoming delta by the character's traits before
    // anything else uses it. A neutral or trait-less character produces the
    // same delta as before (modulateEmotionDelta is a no-op then). Mood
    // nudging downstream uses the modulated delta too, so a trait-amplified
    // joy lifts mood proportionally more.
    const characters = (this.story as any)?.getCharacters?.() as
      Array<{ id?: string; traits?: Record<string, number> }> | undefined;
    const character = characters?.find((c) => c?.id === key);
    const modulations = (this.story as any)?.getTraitModulations?.();
    const effectiveDelta = modulateEmotionDelta(delta, lower, character?.traits, modulations);

    if (!this.state.characterEmotionLevels[key]) this.state.characterEmotionLevels[key] = {};
    const previous = this.state.characterEmotionLevels[key][lower] ?? 0;
    const next = Math.max(0, Math.min(1, previous + effectiveDelta));
    this.state.characterEmotionLevels[key][lower] = next;
    this.emit('characterEmotionChanged', { characterRef: key, emotion: lower, value: next, previous, delta: effectiveDelta });

    // Auto-nudge mood via the palette weights when the emotion is recognised.
    const palette: any[] | undefined = (this.story as any)?.getEmotionPalette?.();
    const def = palette?.find((e) => (e.name || '').toLowerCase() === lower);
    if (def) {
      const dV = Number(def.weightToValence ?? 0) * effectiveDelta;
      const dA = Number(def.weightToArousal ?? 0) * effectiveDelta;
      if (dV !== 0 || dA !== 0) this.nudgeCharacterMood(charRef, dV, dA);
    }
    return next;
  }

  /**
   * Decay every emotion's intensity for the character (or all characters
   * when charRef is omitted). Each emotion is reduced by its declared
   * decayRate × current value; emotions that drop below 0.005 are removed
   * from the map to keep state sparse. Typically called once per beat-entry
   * by markBeatVisited.
   */
  decayCharacterEmotions(charRef?: string): void {
    const palette: any[] | undefined = (this.story as any)?.getEmotionPalette?.();
    if (!palette || palette.length === 0) return;
    const rateByEmotion = new Map<string, number>();
    for (const e of palette) {
      rateByEmotion.set((e.name || '').toLowerCase(), Number(e.decayRate ?? 0));
    }
    const targetKeys = charRef
      ? [this.resolveCharRef(charRef)].filter(Boolean) as string[]
      : Object.keys(this.state.characterEmotionLevels);
    for (const key of targetKeys) {
      const levels = this.state.characterEmotionLevels[key];
      if (!levels) continue;
      for (const [emotion, value] of Object.entries(levels)) {
        const rate = rateByEmotion.get(emotion) ?? 0;
        if (rate <= 0) continue;
        const next = value * (1 - rate);
        if (next < 0.005) {
          delete levels[emotion];
        } else {
          levels[emotion] = next;
        }
      }
    }
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
    // Mood conditions (Step 4). `character` is the mood holder; `moodAxis`
    // is 'valence' or 'arousal'; `value` is the threshold to compare against.
    if (condition.type === 'mood') {
      const character = condition.character;
      const axis = condition.moodAxis || 'valence';
      if (!character) {
        console.warn('mood condition missing required character field');
        return false;
      }
      const mood = this.getCharacterMood(character);
      const left = axis === 'arousal' ? mood.arousal : mood.valence;
      const right = Number(condition.value ?? condition.right ?? 0);
      switch (condition.operator) {
        case '==': return left === right;
        case '!=': return left !== right;
        case '>': return left > right;
        case '<': return left < right;
        case '>=': return left >= right;
        case '<=': return left <= right;
        default: return false;
      }
    }

    // Emotion conditions (Step 5). Compares the current intensity of
    // `character`'s `emotionName` against `value`. Both `character` and
    // `emotionName` are required; emotionName is matched case-insensitively.
    if (condition.type === 'emotion') {
      const character = condition.character;
      const emotionName = condition.emotionName;
      if (!character || !emotionName) {
        console.warn('emotion condition missing character or emotionName');
        return false;
      }
      const left = this.getCharacterEmotion(character, emotionName);
      const right = Number(condition.value ?? condition.right ?? 0);
      switch (condition.operator) {
        case '==': return left === right;
        case '!=': return left !== right;
        case '>': return left > right;
        case '<': return left < right;
        case '>=': return left >= right;
        case '<=': return left <= right;
        default: return false;
      }
    }

    // Trait conditions (Step 6). Compares a character's static trait value
    // (e.g. neuroticism, openness, or any author-defined trait) against
    // `value`. Traits are stored on the Character record as a Record<string,
    // number> in [0, 1]. Missing trait reads as 0.
    if (condition.type === 'trait') {
      const character = condition.character;
      const traitName = condition.traitName;
      if (!character || !traitName) {
        console.warn('trait condition missing character or traitName');
        return false;
      }
      const key = this.resolveCharRef(character);
      const characters = (this.story as any)?.getCharacters?.() as
        Array<{ id?: string; traits?: Record<string, number> }> | undefined;
      const charRecord = characters?.find((c) => c?.id === key);
      const left = Number(charRecord?.traits?.[traitName] ?? 0);
      const right = Number(condition.value ?? condition.right ?? 0);
      switch (condition.operator) {
        case '==': return left === right;
        case '!=': return left !== right;
        case '>': return left > right;
        case '<': return left < right;
        case '>=': return left >= right;
        case '<=': return left <= right;
        default: return false;
      }
    }

    // Sentiment conditions (Step 4). Compares the strength of
    // `character`'s sentiment toward `sentimentTarget` (optionally filtered
    // by `sentimentEmotion`) against `value`.
    if (condition.type === 'sentiment') {
      const character = condition.character;
      const target = condition.sentimentTarget;
      if (!character || !target) {
        console.warn('sentiment condition missing character or sentimentTarget');
        return false;
      }
      const left = this.getSentimentTo(character, target, condition.sentimentEmotion);
      const right = Number(condition.value ?? condition.right ?? 0);
      switch (condition.operator) {
        case '==': return left === right;
        case '!=': return left !== right;
        case '>': return left > right;
        case '<': return left < right;
        case '>=': return left >= right;
        case '<=': return left <= right;
        default: return false;
      }
    }

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
      // Step 4 / Phase A: character affect effects. The deltas live on the
      // effect record itself (`valenceDelta` / `arousalDelta` / `strengthDelta`)
      // so the existing effect-editor UI can treat them as any other field.
      // `target` is the character ref (id, name, or displayName) — resolved
      // by the underlying nudgeCharacterMood / addCharacterSentiment.
      case 'nudgeMood': {
        const dV = Number(effect.valenceDelta ?? 0);
        const dA = Number(effect.arousalDelta ?? 0);
        if (dV !== 0 || dA !== 0) {
          this.nudgeCharacterMood(effect.target, dV, dA);
        }
        break;
      }
      case 'addSentiment': {
        const t = effect.sentimentTarget;
        const e = effect.sentimentEmotion;
        const d = Number(effect.strengthDelta ?? 0);
        if (t && e && d !== 0) {
          this.addCharacterSentiment(effect.target, t, e, d);
        }
        break;
      }
      // Step 5 — fire an emotion at the character. The runtime auto-nudges
      // mood by the palette weights when the emotion is recognised; unknown
      // emotion names still update the level but skip the mood side-effect.
      case 'fireEmotion': {
        const name = effect.emotion;
        const delta = Number(effect.emotionDelta ?? 0);
        if (name && delta !== 0) {
          this.fireCharacterEmotion(effect.target, name, delta);
        }
        break;
      }
    }
  }

  markBeatVisited(beatId: string): void {
    // Step 5 — emotion decay tick on every beat-enter. Emotions decay before
    // the new beat's effects fire, so `fireCharacterEmotion` adds against a
    // freshly-decayed level and the resulting mood nudge reflects recovery.
    this.decayCharacterEmotions();
    this.state.visitedBeats.add(beatId);
    this.history.push(beatId);
    // Also record in timeline with beat metadata
    const beat = this.story?.getBeat(beatId);
    this.timeline.push({
      type: 'beat-enter',
      timestamp: Date.now(),
      beatId,
      beatName: beat?.name,
      beatType: beat?.type,
    });
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
    const ts = Date.now();
    this.choiceHistory.push({ ...choice, timestamp: ts });
    this.timeline.push({
      type: 'choice',
      timestamp: ts,
      beatId: choice.beatId,
      beatName: choice.beatName,
      beatType: choice.beatType,
      choiceText: choice.choiceText,
      choiceContext: choice.choiceContext,
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

  /**
   * Record AI-generated output for session logging and future AI context
   */
  recordAIOutput(output: Omit<AIOutputRecord, 'timestamp'>): void {
    const ts = Date.now();
    this.aiOutputHistory.push({ ...output, timestamp: ts });
    this.timeline.push({
      type: 'ai-output',
      timestamp: ts,
      beatId: output.beatId,
      beatName: output.beatName,
      beatType: output.beatType,
      text: output.text,
    });
  }

  /**
   * Get all AI output history
   */
  getAIOutputHistory(): AIOutputRecord[] {
    return [...this.aiOutputHistory];
  }

  /**
   * Record a timeline event for the unified session log
   */
  recordTimelineEvent(event: Omit<TimelineEvent, 'timestamp'>): void {
    this.timeline.push({
      ...event,
      timestamp: Date.now(),
    });
  }

  /**
   * Get the full timeline of events
   */
  getTimeline(): TimelineEvent[] {
    return [...this.timeline];
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
    // Capture counter names before clearing so we can emit change events
    const oldCounterNames = Object.keys(this.state.counters);

    this.timerManager.stopAllTimers();
    this.state = {
      currentBeatId: this.story?.getFirstBeatId() || '0',
      variables: {},
      counters: {},
      inventory: [],
      characterInventories: {},
      characterCounters: {},
      characterVariables: {},
      characterFlags: {},
      characterMoods: {},
      characterSentiments: {},
      characterEmotionLevels: {},
      visitedBeats: new Set(),
      visitedChoices: new Set(),
      timers: {}
    };
    this.history = [];
    this.choiceHistory = [];
    this.aiOutputHistory = [];
    this.timeline = [];
    // Re-seed authored initial affect after the wipe so a story restart
    // begins from the same emotional starting point each time.
    this.seedCharacterAffectFromStory();
    this.emit('reset');

    // Emit change events so UI listeners (countdown meter, debug panel) update
    for (const name of oldCounterNames) {
      this.emit('counterChanged', { name, value: 0 });
    }
    this.emit('inventoryChanged');
  }

  /**
   * Selective reset - only clear the categories set to true.
   * Allows EndScreen beats to preserve certain state (e.g. keep variables but reset counters).
   */
  selectiveReset(options: ResetOptions): void {
    const oldCounterNames = options.counters ? Object.keys(this.state.counters) : [];

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
      this.aiOutputHistory = [];
      this.timeline = [];
    }
    this.state.currentBeatId = this.story?.getFirstBeatId() || '0';
    this.emit('selectiveReset', options);

    // Emit change events so UI listeners (countdown meter, debug panel) update
    for (const name of oldCounterNames) {
      this.emit('counterChanged', { name, value: 0 });
    }
    if (options.inventory) {
      this.emit('inventoryChanged');
    }
  }

  getStory(): Story {
    if (!this.story) {
      throw new Error('Story not set in context');
    }
    return this.story;
  }

  setStory(story: Story): void {
    this.story = story;
    this.seedCharacterAffectFromStory();
  }

  /**
   * Seed character mood + sentiments from authored Character.initialMood /
   * initialSentiments values. Only fills slots that are currently empty —
   * runtime changes already in flight (e.g. from UpdateAffect beats) are
   * never overwritten. Called automatically from setStory and reset; safe
   * to call manually if the story is mutated and the new characters need
   * their starting affect propagated.
   */
  seedCharacterAffectFromStory(): void {
    const story = this.story;
    if (!story) return;
    const characters = (story as any).getCharacters?.() as
      | Array<{
          id: string;
          initialMood?: { valence: number; arousal: number };
          initialSentiments?: Array<{ toEntityRef: string; emotion: string; strength: number }>;
        }>
      | undefined;
    if (!characters) return;

    for (const char of characters) {
      if (!char?.id) continue;
      // Mood: seed only when no runtime mood is set for this character.
      if (char.initialMood && !this.state.characterMoods[char.id]) {
        this.state.characterMoods[char.id] = {
          valence: StoryContext.clampUnit(char.initialMood.valence ?? 0),
          arousal: StoryContext.clampUnit(char.initialMood.arousal ?? 0),
        };
      }
      // Sentiments: seed each authored entry only if no matching
      // (target, emotion) row already exists in runtime state.
      if (char.initialSentiments && char.initialSentiments.length > 0) {
        if (!this.state.characterSentiments[char.id]) this.state.characterSentiments[char.id] = [];
        const existing = this.state.characterSentiments[char.id];
        for (const seed of char.initialSentiments) {
          if (!seed?.toEntityRef || !seed?.emotion) continue;
          const present = existing.some(
            (s) => s.toEntityRef === seed.toEntityRef && s.emotion === seed.emotion,
          );
          if (!present) {
            existing.push({
              toEntityRef: seed.toEntityRef,
              emotion: seed.emotion,
              strength: StoryContext.clampUnit(seed.strength ?? 0),
              createdAt: Date.now(),
            });
          }
        }
      }
    }
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
    // Deep-clone the per-character maps so saved snapshots don't alias live state.
    const cloneNamespacedNumbers = (m: Record<string, Record<string, number>>) =>
      Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { ...v }]));
    const cloneNamespacedAny = (m: Record<string, Record<string, any>>) =>
      Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { ...v }]));
    const cloneNamespacedBools = (m: Record<string, Record<string, boolean>>) =>
      Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { ...v }]));
    return {
      currentBeatId: this.state.currentBeatId,
      variables: { ...this.state.variables },
      counters: { ...this.state.counters },
      inventory: this.state.inventory.map(entry => ({ ...entry })),
      characterInventories: Object.fromEntries(
        Object.entries(this.state.characterInventories).map(([k, v]) => [k, v.map(entry => ({ ...entry }))])
      ),
      characterCounters: cloneNamespacedNumbers(this.state.characterCounters),
      characterVariables: cloneNamespacedAny(this.state.characterVariables),
      characterFlags: cloneNamespacedBools(this.state.characterFlags),
      characterMoods: Object.fromEntries(
        Object.entries(this.state.characterMoods).map(([k, v]) => [k, { ...v }])
      ),
      characterSentiments: Object.fromEntries(
        Object.entries(this.state.characterSentiments).map(([k, v]) => [k, v.map((s) => ({ ...s }))])
      ),
      characterEmotionLevels: Object.fromEntries(
        Object.entries(this.state.characterEmotionLevels).map(([k, v]) => [k, { ...v }])
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

    // Helper: clone a Record<string, Record<string, V>> from a possibly-undefined
    // serialized field, defaulting to {} for forward-compat with older saves.
    const cloneNs = <V>(m: Record<string, Record<string, V>> | undefined) =>
      m ? Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { ...v }])) : {};

    // Restore state
    this.state = {
      currentBeatId: serialized.currentBeatId,
      variables: { ...serialized.variables },
      counters: { ...serialized.counters },
      inventory: migrateInventory(serialized.inventory),
      characterInventories: Object.fromEntries(
        Object.entries(serialized.characterInventories || {}).map(([k, v]) => [k, migrateInventory(v)])
      ),
      characterCounters: cloneNs<number>(serialized.characterCounters),
      characterVariables: cloneNs<any>(serialized.characterVariables),
      characterFlags: cloneNs<boolean>(serialized.characterFlags),
      characterMoods: serialized.characterMoods
        ? Object.fromEntries(Object.entries(serialized.characterMoods).map(([k, v]) => [k, { ...v }]))
        : {},
      characterSentiments: serialized.characterSentiments
        ? Object.fromEntries(Object.entries(serialized.characterSentiments).map(([k, v]) => [k, v.map((s: any) => ({ ...s }))]))
        : {},
      characterEmotionLevels: serialized.characterEmotionLevels
        ? Object.fromEntries(Object.entries(serialized.characterEmotionLevels).map(([k, v]) => [k, { ...v }]))
        : {},
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
