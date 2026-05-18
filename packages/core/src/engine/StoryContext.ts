import  { EventEmitter } from 'eventemitter3';
import type { Condition, Effect, FictionalTime } from '../types';
import type { Story } from './Story';
import { TimerManager } from './TimerManager';
import { resolveCharacterKey } from '../utils/characterRef';
import { resolveCharacterWithVariant, findCharacterVariant } from '../utils/characterVariant';
import { modulateEmotionDelta } from './PersonalityTraits';
import {
  createSensorService,
  MockSensorService,
  type SensorService,
  type SensorPermissionName,
  type PermissionState,
} from './SensorService';

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
 * Reflection memory entry (Step 7 — Mode B). A short narrative note about
 * something that happened to / through this character, accumulated as play
 * progresses. Used in dossier rendering when the character's policy is
 * `'reflection'` so the LLM sees recent felt-experience rather than only
 * structured state. Reflections are append-only at the runtime level —
 * `appendCharacterReflection` evicts the oldest when the per-character cap
 * is exceeded so token cost stays bounded.
 */
export interface Reflection {
  /** When the reflection was recorded. */
  timestamp: number;
  /** One- or two-sentence narrative note in the character's voice. */
  text: string;
  /** Beat the reflection originated from, when known — useful for debug. */
  beatId?: string;
  /**
   * Salience ∈ [0, 1] — author's hint at how important this reflection is.
   * Reflections with higher salience are kept longer when the cap evicts.
   * Defaults to 0.5 when omitted by the caller.
   */
  salience?: number;
}

/**
 * Goal status — runtime state for an authored CharacterGoal. `'open'` is the
 * starting state; the runtime flips it to `'met'` when the goal's
 * satisfaction predicate evaluates true, or to `'failed'` / `'abandoned'`
 * via the `setGoalStatus` effect or direct API call.
 */
export type GoalStatus = 'open' | 'met' | 'failed' | 'abandoned';

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
  // Reflection memory per character (Step 7 — Mode B). Append-only narrative
  // notes accumulated during play, used by characters whose `dossierPolicy`
  // is `'reflection'`. The newest reflections are appended to the tail; the
  // dossier reads the tail. Capped per character to keep token usage bounded
  // — the FIFO eviction is in appendCharacterReflection().
  characterReflections: Record<string, Reflection[]>;
  // Goal status per character (Step 8 — Phase A). Outer key = canonical
  // Character.id; inner key = CharacterGoal.id; value = current status.
  // Goals themselves are authored on Character.goals[]; the runtime tracks
  // only their progress so authoring can stay declarative. Empty by default
  // — characters whose authored goals haven't moved off 'open' have no
  // entries here. The dossier renders status by joining authored goals
  // with these statuses.
  characterGoalStatus: Record<string, Record<string, GoalStatus>>;
  // Active variant per character. Variants are partial overlays on a
  // Character record (alternate persona / portrait / mood seed), exclusive
  // and chosen at story-start. Outer key = canonical Character.id; value =
  // CharacterVariant.id. Empty until the runtime hits a setCharacterVariant
  // effect or the seed step fills it from `Character.defaultVariantId`.
  activeCharacterVariants: Record<string, string>;
  // Initial-value capture for delta-from-initial condition baselines
  // (v0.9.45). Each map mirrors the live affect map but is populated
  // *lazily on first touch* — the first mutator call for a (character,
  // slot[, sub-key]) combination records the current pre-mutation value
  // here, and subsequent calls leave it alone. Authored seed values are
  // also captured at seed time so a delta-from-initial check after seed
  // sees the seeded baseline rather than 0. Conditions read this when
  // `condition.baseline === 'initial'`.
  initialMoods: Record<string, CharacterMood>;
  initialEmotionLevels: Record<string, Record<string, number>>;
  initialSentiments: Record<string, Sentiment[]>;
  // Author-named affect snapshots (v0.9.45). Each entry is a frozen
  // mood / emotion / sentiment snapshot taken via the bookmarkAffectState
  // effect. Authors then reference the bookmark from condition baseline
  // switches (`condition.baseline = { bookmark: 'reunion-scene' }`).
  // Writing the same name again overwrites the prior snapshot.
  affectBookmarks: Record<string, AffectSnapshot>;
  visitedBeats: Set<string>;
  visitedChoices: Set<string>; // Per-choice visited tracking, composite keys: "beatId:choiceId"
  timers: Record<string, { value: number; target?: string }>; // Enhanced timer structure
  fictionalTime?: FictionalTime; // Fictional time for in-story time progression
}

/**
 * Frozen affect snapshot used by named bookmarks (v0.9.45). The shape
 * mirrors the live mood / emotion / sentiment maps in `StoryState` so
 * baseline reads can resolve the same way against either source.
 */
export interface AffectSnapshot {
  moods: Record<string, CharacterMood>;
  emotionLevels: Record<string, Record<string, number>>;
  sentiments: Record<string, Sentiment[]>;
}

/**
 * Cheap sniff for whether a Condition's baseline switch is literal (the
 * legacy / default behaviour). Used by checkCondition's affect branches
 * to choose between `current op value` and `(current - baseline) op value`.
 */
function isLiteralBaseline(b: Condition['baseline']): boolean {
  return !b || b === 'literal';
}

/**
 * Haversine great-circle distance in metres between two lat/lng points.
 * Used by the `gpsProximity` condition. Mean Earth radius from WGS84
 * (6,371,008.8m) — accurate to within ±0.5% for any pair of points
 * (the model assumes a sphere, ignoring Earth's oblateness). Plenty
 * good for "are you within 50 metres of the meeting point?" checks.
 */
export function haversineMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6_371_008.8;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Initial bearing in degrees (0=N, 90=E, 180=S, 270=W) from `(lat1,lng1)`
 * to `(lat2,lng2)` along the great circle. Used by spatial-sound
 * positioning (S4+) to derive "which way is the sound coming from?"
 * relative to the player's current location.
 *
 * The result is always in [0, 360). Antipodal / co-located inputs are
 * stable but meaningless — caller should treat bearing as undefined
 * when distance is zero.
 */
export function bearingDegrees(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dLambda = toRad(lng2 - lng1);
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2)
    - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
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
  characterReflections?: Record<string, Reflection[]>;
  characterGoalStatus?: Record<string, Record<string, GoalStatus>>;
  activeCharacterVariants?: Record<string, string>;
  characterVariables?: Record<string, Record<string, any>>;
  characterFlags?: Record<string, Record<string, boolean>>;
  // Baseline + bookmark state (v0.9.45). All optional so prior save files
  // keep loading; the loader fills missing maps with empty objects.
  initialMoods?: Record<string, CharacterMood>;
  initialEmotionLevels?: Record<string, Record<string, number>>;
  initialSentiments?: Record<string, Sentiment[]>;
  affectBookmarks?: Record<string, AffectSnapshot>;
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
  /**
   * Per-character flag tracking whether the variant was explicitly chosen
   * via `setActiveCharacterVariant` (i.e., a setCharacterVariant Effect or
   * direct API call). Distinguishes explicit user pick from the
   * default-variant auto-apply that runs in seedCharacterAffectFromStory.
   * Reset on full reset() and selectiveReset({history:true}). Not
   * persisted in the serialized state — variant *id* is, but "how it
   * was set" is session-local.
   */
  private explicitVariantSet: Record<string, boolean> = {};
  private history: string[] = [];
  private choiceHistory: ChoiceRecord[] = [];
  private aiOutputHistory: AIOutputRecord[] = [];
  private timeline: TimelineEvent[] = [];
  private story?: Story;
  private timerManager: TimerManager;
  /**
   * Sensor service for XR beats (v0.9.48+). Lazily resolves to either
   * WebSensorService (PWA / mobile playback) or MockSensorService
   * (desktop authoring via PreviewWindow). Beats access this via
   * getSensorService(); they should not construct their own.
   */
  private sensorService: SensorService;
  /**
   * Permission state cache (v0.9.48 / S3+). Populated by
   * `ensureXRPermission` (or any code that calls
   * `recordPermissionState`) so synchronous condition evaluators
   * (`permissionGranted`) can branch without awaiting. Keys are the
   * SensorPermissionName strings; values are the most recent observed
   * PermissionState. Untouched permissions resolve to undefined and
   * are treated as "not granted" by the condition evaluator (fail-
   * closed semantics — a beat that wants to gate on a permission
   * must run a probe first).
   */
  private permissionStateCache = new Map<SensorPermissionName, PermissionState>();

  // Debug features
  private debugSession?: DebugSession;
  private analysisCache: AnalysisCache = {};
  private aiSuggestions: AISuggestion[] = [];

  constructor(
    initialState?: Partial<StoryState>,
    story?: Story,
    opts?: { mockMode?: boolean; existingSensorService?: SensorService },
  ) {
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
      characterReflections: {},
      characterGoalStatus: {},
      activeCharacterVariants: {},
      initialMoods: {},
      initialEmotionLevels: {},
      initialSentiments: {},
      affectBookmarks: {},
      visitedBeats: new Set(),
      visitedChoices: new Set(),
      timers: {},
      ...initialState
    };
    this.story = story;
    this.timerManager = new TimerManager();
    // v0.9.48+ — XR sensor service. Mock-mode comes from PreviewWindow
    // (desktop authoring); production playback gets the Web service via
    // capability detection.
    //
    // existingSensorService preserves the SAME service instance across
    // context recreations (StoryEngine.loadStory creates a new context;
    // without preservation, the engine's sensorService getter returns a
    // fresh MockSensorService while the renderer state and any subscribed
    // adapters still point at the old one — the panel's setMockLocation
    // calls land on a different instance than the audio adapter is
    // subscribed to).
    this.sensorService = opts?.existingSensorService
      ?? createSensorService({ mockMode: opts?.mockMode });
    if (opts?.mockMode && !opts?.existingSensorService && this.sensorService instanceof MockSensorService) {
      const mockLoc = (story as any)?.getSettings?.()?.location?.mockLocation;
      if (mockLoc) this.sensorService.seedFromSettings(mockLoc);
    }
    // Seed authored initial affect (mood + sentiments) into the runtime
    // state. No-op when no story or no characters declare initial affect.
    if (story) {
      this.seedCharacterAffectFromStory();
      this.seedCharacterCountersFromStory();
    }

    // Forward timer events
    this.timerManager.on('timerExpired', (data) => this.emit('timerExpired', data));
    this.timerManager.on('timerTick', (data) => this.emit('timerTick', data));
  }

  /**
   * Get the SensorService for this context. Beats use this to access
   * GPS / beacons / orientation. The same service instance lives for
   * the lifetime of the context — beats subscribe and unsubscribe but
   * don't construct their own.
   */
  getSensorService(): SensorService {
    return this.sensorService;
  }

  /**
   * Record an observed permission state in the cache. Called by
   * `ensureXRPermission` and any other code that probes a permission,
   * so the synchronous `permissionGranted` condition evaluator has a
   * value to read. Idempotent — overwrites any prior cached value.
   */
  recordPermissionState(name: SensorPermissionName, state: PermissionState): void {
    this.permissionStateCache.set(name, state);
    this.emit('permissionStateChanged', { name, state });
  }

  /**
   * Read a previously-cached permission state. Returns undefined when
   * the permission has never been probed in this session — synchronous
   * caller (the condition evaluator) interprets undefined as
   * not-granted.
   */
  getCachedPermissionState(name: SensorPermissionName): PermissionState | undefined {
    return this.permissionStateCache.get(name);
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
    this.captureInitialMood(key);
    const current = this.state.characterMoods[key] || { valence: 0, arousal: 0 };
    const next: CharacterMood = {
      valence: StoryContext.clampUnit(mood.valence ?? current.valence),
      arousal: StoryContext.clampUnit(mood.arousal ?? current.arousal),
    };
    this.state.characterMoods[key] = next;
    this.emit('characterMoodChanged', { characterRef: key, mood: next, previous: current });
  }

  // ---------------------------------------------------------------------------
  // Baseline capture (v0.9.45)
  //
  // Continuous-valued affect slots (mood, emotion levels, sentiment strengths)
  // get a parallel "initial" snapshot that condition baselines can compare
  // against. The capture is *idempotent first-touch*: each helper writes
  // only when no entry exists yet. Mutators call these *before* applying a
  // delta, so the initial reflects the value as of the first time the slot
  // was about to change. seedCharacterAffectFor also calls these so authored
  // initialMood / initialSentiments end up as the baseline rather than 0.
  // ---------------------------------------------------------------------------

  /** Record the current mood as the initial mood for `key` if not already captured. */
  private captureInitialMood(key: string): void {
    if (this.state.initialMoods[key]) return;
    const current = this.state.characterMoods[key] || { valence: 0, arousal: 0 };
    this.state.initialMoods[key] = { valence: current.valence, arousal: current.arousal };
  }

  /** Record the current emotion level as the initial level for (key, emotion) if not yet captured. */
  private captureInitialEmotion(key: string, emotionLower: string): void {
    if (!this.state.initialEmotionLevels[key]) this.state.initialEmotionLevels[key] = {};
    if (this.state.initialEmotionLevels[key][emotionLower] !== undefined) return;
    const current = this.state.characterEmotionLevels[key]?.[emotionLower] ?? 0;
    this.state.initialEmotionLevels[key][emotionLower] = current;
  }

  /**
   * Record the current sentiment strength toward (toEntityRef, emotion) as
   * the initial value if not yet captured. New sentiment slots default to
   * 0 — capture before the first delta is applied locks that 0 in as the
   * baseline, which is correct ("trust started at zero").
   */
  private captureInitialSentiment(key: string, toEntityRef: string, emotion: string): void {
    if (!this.state.initialSentiments[key]) this.state.initialSentiments[key] = [];
    const list = this.state.initialSentiments[key];
    const present = list.some((s) => s.toEntityRef === toEntityRef && s.emotion === emotion);
    if (present) return;
    const live = (this.state.characterSentiments[key] || []).find(
      (s) => s.toEntityRef === toEntityRef && s.emotion === emotion,
    );
    list.push({
      toEntityRef,
      emotion,
      strength: live?.strength ?? 0,
      createdAt: live?.createdAt ?? Date.now(),
    });
  }

  /** Look up the captured initial mood for a character (or zero). */
  private getInitialMood(key: string): CharacterMood {
    return this.state.initialMoods[key] || { valence: 0, arousal: 0 };
  }

  /** Look up the captured initial emotion level for (key, emotion) or zero. */
  private getInitialEmotion(key: string, emotionLower: string): number {
    return this.state.initialEmotionLevels[key]?.[emotionLower] ?? 0;
  }

  /** Look up the captured initial sentiment strength for (key, target[, emotion]) or zero. */
  private getInitialSentiment(key: string, toEntityRef: string, emotion?: string): number {
    const list = this.state.initialSentiments[key] || [];
    if (emotion) {
      const found = list.find((s) => s.toEntityRef === toEntityRef && s.emotion === emotion);
      return found?.strength ?? 0;
    }
    return list
      .filter((s) => s.toEntityRef === toEntityRef)
      .reduce((sum, s) => sum + s.strength, 0);
  }

  // ---------------------------------------------------------------------------
  // Affect bookmarks (v0.9.45) — author-named snapshots of mood / emotion /
  // sentiment state used as a baseline for "X has improved since the
  // bookmark moment Y" condition checks. Driven by the bookmarkAffectState
  // effect; readable via getAffectBookmark for debug / inspection.
  // ---------------------------------------------------------------------------

  /**
   * Snapshot mood / emotion / sentiment state under `name`. With `target`
   * given, only that character's slots are captured (other characters'
   * slots in the same-named prior snapshot are preserved). With `target`
   * omitted, every character's slots are captured. Writing the same name
   * with a wider scope overwrites narrower prior captures.
   */
  takeAffectBookmark(name: string, options?: { target?: string }): void {
    if (!name) return;
    const targetKey = options?.target ? this.resolveCharRef(options.target) : undefined;
    const prior = this.state.affectBookmarks[name];
    const next: AffectSnapshot = prior
      ? {
          moods: { ...prior.moods },
          emotionLevels: { ...prior.emotionLevels },
          sentiments: { ...prior.sentiments },
        }
      : { moods: {}, emotionLevels: {}, sentiments: {} };

    const charKeys = targetKey
      ? [targetKey]
      : new Set([
          ...Object.keys(this.state.characterMoods),
          ...Object.keys(this.state.characterEmotionLevels),
          ...Object.keys(this.state.characterSentiments),
        ]);
    for (const key of charKeys) {
      const m = this.state.characterMoods[key];
      if (m) next.moods[key] = { valence: m.valence, arousal: m.arousal };
      const levels = this.state.characterEmotionLevels[key];
      if (levels) next.emotionLevels[key] = { ...levels };
      const sentiments = this.state.characterSentiments[key];
      if (sentiments) next.sentiments[key] = sentiments.map((s) => ({ ...s }));
    }
    this.state.affectBookmarks[name] = next;
    this.emit('affectBookmarkTaken', { name, target: targetKey });
  }

  /** Read a bookmark snapshot by name. Returns undefined when none exists. */
  getAffectBookmark(name: string): AffectSnapshot | undefined {
    return this.state.affectBookmarks[name];
  }

  /** All bookmark names currently recorded. Useful for editor dropdowns. */
  getAffectBookmarkNames(): string[] {
    return Object.keys(this.state.affectBookmarks);
  }

  /**
   * Resolve a baseline mood value for `(key, axis)` against the requested
   * source ('initial' or { bookmark: name }). Missing entries read as 0
   * — the slot's default rest state — so a delta-vs-baseline check on a
   * never-touched character behaves the same as a literal threshold.
   */
  private resolveMoodBaseline(
    key: string,
    axis: 'valence' | 'arousal',
    baseline: Condition['baseline'],
  ): number {
    if (!baseline || baseline === 'literal') return 0;
    if (baseline === 'initial') {
      const init = this.getInitialMood(key);
      return axis === 'arousal' ? init.arousal : init.valence;
    }
    const snap = this.state.affectBookmarks[baseline.bookmark];
    if (!snap) return 0;
    const m = snap.moods[key];
    if (!m) return 0;
    return axis === 'arousal' ? m.arousal : m.valence;
  }

  /** Same idea as resolveMoodBaseline, for a single emotion level. */
  private resolveEmotionBaseline(
    key: string,
    emotionLower: string,
    baseline: Condition['baseline'],
  ): number {
    if (!baseline || baseline === 'literal') return 0;
    if (baseline === 'initial') return this.getInitialEmotion(key, emotionLower);
    const snap = this.state.affectBookmarks[baseline.bookmark];
    return snap?.emotionLevels[key]?.[emotionLower] ?? 0;
  }

  /**
   * Same idea as resolveMoodBaseline, for a sentiment toward a target
   * (optionally filtered by emotion). When emotion is omitted, sums all
   * sentiments toward the target — matches the "overall feeling" read in
   * getSentimentTo.
   */
  private resolveSentimentBaseline(
    key: string,
    toEntityRef: string,
    emotion: string | undefined,
    baseline: Condition['baseline'],
  ): number {
    if (!baseline || baseline === 'literal') return 0;
    if (baseline === 'initial') return this.getInitialSentiment(key, toEntityRef, emotion);
    const snap = this.state.affectBookmarks[baseline.bookmark];
    const list = snap?.sentiments[key] || [];
    if (emotion) {
      const found = list.find((s) => s.toEntityRef === toEntityRef && s.emotion === emotion);
      return found?.strength ?? 0;
    }
    return list
      .filter((s) => s.toEntityRef === toEntityRef)
      .reduce((sum, s) => sum + s.strength, 0);
  }

  /** Add deltas to the mood, clamped per axis. The most common authoring path. */
  nudgeCharacterMood(charRef: string, dValence: number = 0, dArousal: number = 0): CharacterMood {
    const key = this.resolveCharRef(charRef);
    if (!key) return { valence: 0, arousal: 0 };
    this.captureInitialMood(key);
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
    this.captureInitialSentiment(key, toEntityRef, emotion);
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
    this.captureInitialEmotion(key, lower);
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
    this.captureInitialEmotion(key, lower);

    // Step 6 — modulate the incoming delta by the character's traits before
    // anything else uses it. A neutral or trait-less character produces the
    // same delta as before (modulateEmotionDelta is a no-op then). Mood
    // nudging downstream uses the modulated delta too, so a trait-amplified
    // joy lifts mood proportionally more.
    // Variants: traits from the active variant overlay take precedence
    // over the base — so Alex-introvert and Alex-extrovert experience
    // emotion deltas differently even though they're the same Character.
    const character = this.getMergedCharacter(key) as { traits?: Record<string, number> } | undefined;
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

  // ---------------------------------------------------------------------------
  // Reflection memory (Step 7 — Mode B)
  // ---------------------------------------------------------------------------

  /**
   * Per-character cap on stored reflections. The runtime keeps the most recent
   * `REFLECTION_CAP` entries; older entries are evicted in FIFO order. This is
   * a token-budget guardrail for the dossier — a few dozen entries is plenty
   * for a session-length conversation. Authors who need a larger window can
   * raise this on a per-project basis later (Step 8 territory).
   */
  private static readonly REFLECTION_CAP = 32;

  /**
   * Return a shallow copy of the character's reflections in append order
   * (oldest → newest). Empty array when none have been recorded.
   */
  getCharacterReflections(charRef: string): Reflection[] {
    const key = this.resolveCharRef(charRef);
    if (!key) return [];
    return (this.state.characterReflections[key] || []).map((r) => ({ ...r }));
  }

  /**
   * Append a reflection to a character's memory. Returns the appended entry
   * (with timestamp filled in) for callers that want to chain or echo it.
   * Empty / whitespace-only text is rejected silently — there's no value in
   * storing an empty reflection and downstream dossier rendering would skip
   * it anyway.
   *
   * Eviction policy when the per-character cap is reached: drop the oldest
   * entry whose salience is below the new entry's salience; if all stored
   * entries are at-or-above the new entry's salience, drop the literal-oldest.
   * This keeps highly salient reflections in the window even when the
   * character is generating churn.
   */
  appendCharacterReflection(
    charRef: string,
    text: string,
    options?: { beatId?: string; salience?: number; timestamp?: number },
  ): Reflection | null {
    const key = this.resolveCharRef(charRef);
    if (!key) return null;
    const trimmed = (text || '').trim();
    if (!trimmed) return null;

    const entry: Reflection = {
      timestamp: options?.timestamp ?? Date.now(),
      text: trimmed,
      ...(options?.beatId ? { beatId: options.beatId } : {}),
      ...(options?.salience !== undefined
        ? { salience: Math.max(0, Math.min(1, options.salience)) }
        : {}),
    };

    if (!this.state.characterReflections[key]) this.state.characterReflections[key] = [];
    const list = this.state.characterReflections[key];
    list.push(entry);

    if (list.length > StoryContext.REFLECTION_CAP) {
      const incomingSalience = entry.salience ?? 0.5;
      // Find an evictable entry: oldest with strictly lower salience.
      let evictIdx = -1;
      for (let i = 0; i < list.length - 1; i += 1) {
        const s = list[i].salience ?? 0.5;
        if (s < incomingSalience) { evictIdx = i; break; }
      }
      if (evictIdx === -1) evictIdx = 0;  // all entries ≥ new — drop oldest.
      list.splice(evictIdx, 1);
    }

    this.emit('characterReflectionAdded', { characterRef: key, reflection: { ...entry } });
    return { ...entry };
  }

  // ---------------------------------------------------------------------------
  // Character variants
  //
  // A character can carry several persona profiles (Alex-introvert vs
  // Alex-extrovert; Player-man vs Player-woman). The variant is partial —
  // only fields it sets override the base. The runtime tracks which
  // variant is active per character; readers like fireCharacterEmotion,
  // the dossier, and condition evaluation use `getMergedCharacter` so
  // they see the effective traits / mood / dossierPolicy / displayName
  // for the currently-active variant.
  // ---------------------------------------------------------------------------

  /** Active variant id for a character, or undefined when none is set. */
  getActiveCharacterVariant(charRef: string): string | undefined {
    const key = this.resolveCharRef(charRef);
    if (!key) return undefined;
    return this.state.activeCharacterVariants[key];
  }

  /**
   * True iff the character's variant was explicitly chosen via a
   * setCharacterVariant Effect or direct setActiveCharacterVariant call
   * during this play. False when the active variant is just the engine-
   * applied default from `Character.defaultVariantId`. Use to gate
   * runtime UI ("HUD shows once the player has picked") on actual choice
   * rather than authored default.
   */
  hasExplicitlySetVariant(charRef: string): boolean {
    const key = this.resolveCharRef(charRef);
    if (!key) return false;
    return !!this.explicitVariantSet[key];
  }

  /**
   * Merge the base character with whichever variant is currently active.
   * Falls back to the base record when no variant has been chosen. Used by
   * dossier rendering, trait modulation, mood seeding, etc. — anywhere a
   * downstream reader cares about the *effective* persona.
   */
  getMergedCharacter(charRef: string): any {
    const key = this.resolveCharRef(charRef);
    if (!key) return undefined;
    const characters = (this.story as any)?.getCharacters?.() as
      Array<any> | undefined;
    const base = characters?.find((c) => c?.id === key);
    if (!base) return undefined;
    const variantId = this.state.activeCharacterVariants[key];
    if (!variantId) return base;
    const variant = findCharacterVariant(base, variantId);
    if (!variant) return base;
    return resolveCharacterWithVariant(base, variant);
  }

  /**
   * Switch which variant is active for a character. Returns the previous
   * variant id (or undefined). When `options.seedAffect` is true (default),
   * the runtime re-seeds mood + sentiments from the merged variant —
   * appropriate when the variant is chosen at story-start. Authors
   * driving mid-story personality shifts should pass false explicitly so
   * accumulated affect survives.
   */
  setActiveCharacterVariant(charRef: string, variantId: string | null, options?: { seedAffect?: boolean }): string | undefined {
    const key = this.resolveCharRef(charRef);
    if (!key) return undefined;
    const previous = this.state.activeCharacterVariants[key];
    // Mark this character's variant as explicitly chosen (not default-
    // applied at startup). Used by HUD overlays that want to gate
    // "is the persona settled?" on actual user choice rather than the
    // engine-applied default — see hasExplicitlySetVariant().
    if (variantId != null && variantId !== '') {
      this.explicitVariantSet[key] = true;
    } else {
      delete this.explicitVariantSet[key];
    }
    if (variantId == null || variantId === '') {
      delete this.state.activeCharacterVariants[key];
    } else {
      this.state.activeCharacterVariants[key] = variantId;
    }
    if (previous === variantId) return previous;

    this.emit('characterVariantChanged', { characterRef: key, variantId, previous });

    const seed = options?.seedAffect !== false;
    if (seed) {
      // Wipe per-character affect so the new variant's seed is the
      // authoritative starting point, then re-seed from authored data
      // (which now reads the merged character via getMergedCharacter).
      delete this.state.characterMoods[key];
      delete this.state.characterSentiments[key];
      delete this.state.characterEmotionLevels[key];
      this.seedCharacterAffectFor(key);
    }
    return previous;
  }

  // ---------------------------------------------------------------------------
  // Goals (Step 8 — Phase A)
  //
  // Goals are authored on Character.goals[]; this block tracks their runtime
  // status and re-evaluates satisfaction predicates on every beat-enter (via
  // `evaluateCharacterGoals`, called from markBeatVisited). When a goal flips
  // from `open` to `met` / `failed`, the runtime fires GAMYGDALA-style
  // emotions (pride/joy on success, shame/sadness on failure) scaled by the
  // goal's authored priority. Authors can opt out via `suppressEmotion` on
  // the setGoalStatus effect for goals that should change quietly.
  // ---------------------------------------------------------------------------

  /** Default emotion firings on goal status transitions. The lookup is
   *  case-insensitive against the project's EmotionPalette so renaming
   *  emotions doesn't break the auto-fire path — unknown names just no-op. */
  private static readonly GOAL_EMOTIONS: Record<GoalStatus, ReadonlyArray<{ emotion: string; weight: number }>> = {
    open:      [],
    met:       [{ emotion: 'pride', weight: 0.7 }, { emotion: 'joy', weight: 0.4 }],
    failed:    [{ emotion: 'shame', weight: 0.6 }, { emotion: 'sadness', weight: 0.4 }],
    abandoned: [],
  };

  /**
   * Read the runtime status of a single goal on a character. Defaults to
   * 'open' for goals the runtime hasn't touched (and for goals it doesn't
   * know about — the runtime has no opinion until something happens).
   */
  getGoalStatus(charRef: string, goalId: string): GoalStatus {
    const key = this.resolveCharRef(charRef);
    if (!key || !goalId) return 'open';
    return this.state.characterGoalStatus[key]?.[goalId] || 'open';
  }

  /** All known goal statuses for a character (defensive copy). */
  getCharacterGoalStatuses(charRef: string): Record<string, GoalStatus> {
    const key = this.resolveCharRef(charRef);
    if (!key) return {};
    return { ...(this.state.characterGoalStatus[key] || {}) };
  }

  /**
   * Set the runtime status of a goal. Returns the previous status so callers
   * can distinguish a real transition from a no-op. When the status actually
   * changes, fires GAMYGDALA-style emotions per `GOAL_EMOTIONS` (scaled by
   * the authored goal priority) unless `options.suppressEmotion` is set.
   */
  setGoalStatus(charRef: string, goalId: string, status: GoalStatus, options?: { suppressEmotion?: boolean }): GoalStatus | null {
    const key = this.resolveCharRef(charRef);
    if (!key || !goalId) return null;

    const previous: GoalStatus = this.state.characterGoalStatus[key]?.[goalId] || 'open';
    if (previous === status) return previous;

    if (!this.state.characterGoalStatus[key]) this.state.characterGoalStatus[key] = {};
    this.state.characterGoalStatus[key][goalId] = status;
    this.emit('characterGoalStatusChanged', { characterRef: key, goalId, status, previous });

    if (!options?.suppressEmotion) {
      // Look the goal up so we can scale emotion firings by its authored
      // priority. Unknown / fully-defaulted goals fire at priority 0.5 so
      // status changes still register emotionally.
      const characters = (this.story as any)?.getCharacters?.() as
        Array<{ id?: string; goals?: Array<{ id: string; priority?: number }> }> | undefined;
      const character = characters?.find((c) => c?.id === key);
      const goal = character?.goals?.find((g) => g.id === goalId);
      const priority = typeof goal?.priority === 'number'
        ? Math.max(0, Math.min(1, goal.priority))
        : 0.5;

      for (const fire of StoryContext.GOAL_EMOTIONS[status]) {
        const delta = fire.weight * priority;
        if (delta !== 0) this.fireCharacterEmotion(key, fire.emotion, delta);
      }
    }

    return previous;
  }

  /**
   * Re-evaluate every goal with a satisfaction predicate for `charRef`.
   * Goals already in a terminal state ('met' / 'failed' / 'abandoned') are
   * skipped — once a goal closes, only an explicit setGoalStatus reopens it.
   * Open goals whose predicate evaluates true flip to 'met' and trigger the
   * goal-emotion side-effects. Returns the number of goals that flipped so
   * tests / callers can detect motion.
   */
  evaluateCharacterGoals(charRef: string): number {
    const key = this.resolveCharRef(charRef);
    if (!key) return 0;
    const characters = (this.story as any)?.getCharacters?.() as
      Array<{ id?: string; goals?: Array<{ id: string; satisfaction?: Condition }> }> | undefined;
    const character = characters?.find((c) => c?.id === key);
    const goals = character?.goals || [];
    let flipped = 0;
    for (const g of goals) {
      if (!g.satisfaction) continue;
      const status = this.getGoalStatus(key, g.id);
      if (status !== 'open') continue;
      if (this.checkCondition(g.satisfaction)) {
        this.setGoalStatus(key, g.id, 'met');
        flipped += 1;
      }
    }
    return flipped;
  }

  /** Re-evaluate goals across every character that has authored goals. */
  evaluateAllCharacterGoals(): number {
    const characters = (this.story as any)?.getCharacters?.() as
      Array<{ id?: string; goals?: unknown[] }> | undefined;
    if (!characters) return 0;
    let total = 0;
    for (const c of characters) {
      if (!c?.id || !Array.isArray(c.goals) || c.goals.length === 0) continue;
      total += this.evaluateCharacterGoals(c.id);
    }
    return total;
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
  advanceFictionalTime(
    amount: number,
    unit: 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years'
  ): void {
    const ft = this.state.fictionalTime;
    if (!ft) return;
    const d = new Date(ft.year, ft.month - 1, ft.day, ft.hour, ft.minute);
    // Tolerate singular ("week") — the only realistic non-canonical form.
    const u = unit === ('week' as typeof unit) ? 'weeks' : unit;
    switch (u) {
      case 'minutes': d.setMinutes(d.getMinutes() + amount); break;
      case 'hours':   d.setHours(d.getHours() + amount); break;
      case 'days':    d.setDate(d.getDate() + amount); break;
      // 'weeks' was missing — AI generation legitimately emits it as a
      // natural story time-skip unit. Without this case the switch fell
      // through and time silently never advanced (the "advances once to
      // Jan 31 then stuck" bug: the first jump used 'days', every
      // subsequent one used 'weeks' = no-op).
      case 'weeks':   d.setDate(d.getDate() + amount * 7); break;
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

      // When `character` is set, both operands are read from that
      // character's per-character counter store; omitted ⇒ story-global
      // (unchanged).
      const ccOwner = (condition as any).character as string | undefined;
      const counter1Value = ccOwner
        ? this.getCharacterCounter(ccOwner, condition.counter1)
        : this.state.counters[condition.counter1] || 0;
      const counter2Value = ccOwner
        ? this.getCharacterCounter(ccOwner, condition.counter2)
        : this.state.counters[condition.counter2] || 0;

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
    // v0.9.45 — `baseline` switches the comparison to "delta from initial /
    // bookmark" instead of literal threshold.
    if (condition.type === 'mood') {
      const character = condition.character;
      const axis = condition.moodAxis || 'valence';
      if (!character) {
        console.warn('mood condition missing required character field');
        return false;
      }
      const key = this.resolveCharRef(character);
      const mood = this.getCharacterMood(character);
      const currentVal = axis === 'arousal' ? mood.arousal : mood.valence;
      const baselineVal = key
        ? this.resolveMoodBaseline(key, axis, condition.baseline)
        : 0;
      // For 'literal' (default) baseline is 0 — compare current directly.
      // For 'initial' / bookmark baselines, baselineVal is the captured
      // axis value and the operator compares the *delta*.
      const left = isLiteralBaseline(condition.baseline) ? currentVal : currentVal - baselineVal;
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
    // v0.9.45 — `baseline` switches to delta-from-initial / bookmark.
    if (condition.type === 'emotion') {
      const character = condition.character;
      const emotionName = condition.emotionName;
      if (!character || !emotionName) {
        console.warn('emotion condition missing character or emotionName');
        return false;
      }
      const key = this.resolveCharRef(character);
      const lower = emotionName.toLowerCase();
      const currentVal = this.getCharacterEmotion(character, emotionName);
      const baselineVal = key
        ? this.resolveEmotionBaseline(key, lower, condition.baseline)
        : 0;
      const left = isLiteralBaseline(condition.baseline) ? currentVal : currentVal - baselineVal;
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

    // CharacterVariant condition. Compares the active variant id on
    // `character` with `variantId` (or `value`). Lets authors branch on
    // which persona was chosen — "if Alex is introvert, take this path".
    if (condition.type === 'characterVariant') {
      const character = condition.character;
      if (!character) {
        console.warn('characterVariant condition missing character');
        return false;
      }
      const left = this.getActiveCharacterVariant(character) || '';
      const right = String((condition as any).variantId ?? condition.value ?? '');
      switch (condition.operator) {
        case '==': return left === right;
        case '!=': return left !== right;
        default: return false;
      }
    }

    // Goal conditions (Step 8). Compares a character's runtime goal status
    // against an authored target string. When `goalStatus` is set on the
    // condition, the operator compares against it; otherwise falls back to
    // `value`. Status read defaults to 'open' for unset goals.
    if (condition.type === 'goal') {
      const character = condition.character;
      const goalId = (condition as any).goalId;
      if (!character || !goalId) {
        console.warn('goal condition missing character or goalId');
        return false;
      }
      const left = this.getGoalStatus(character, goalId);
      const right = String((condition as any).goalStatus ?? condition.value ?? 'met');
      switch (condition.operator) {
        case '==': return left === right;
        case '!=': return left !== right;
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
      const charRecord = this.getMergedCharacter(character) as
        { traits?: Record<string, number> } | undefined;
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
    // v0.9.45 — `baseline` switches to delta-from-initial / bookmark.
    if (condition.type === 'sentiment') {
      const character = condition.character;
      const target = condition.sentimentTarget;
      if (!character || !target) {
        console.warn('sentiment condition missing character or sentimentTarget');
        return false;
      }
      const key = this.resolveCharRef(character);
      const currentVal = this.getSentimentTo(character, target, condition.sentimentEmotion);
      const baselineVal = key
        ? this.resolveSentimentBaseline(key, target, condition.sentimentEmotion, condition.baseline)
        : 0;
      const left = isLiteralBaseline(condition.baseline) ? currentVal : currentVal - baselineVal;
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

    // ===== XR / sensor conditions (v0.9.48 / S3+) =====
    // gpsProximity — test player's distance to a target lat/lng against
    // radiusMeters. Reads the SensorService's last cached location
    // synchronously (no awaiting). When the cache is empty, the
    // condition evaluates false (the player can't be near a place we
    // don't know about; better to fail closed than fire spuriously).
    if (condition.type === 'gpsProximity') {
      const targetLat = Number(condition.targetLat ?? NaN);
      const targetLng = Number(condition.targetLng ?? NaN);
      const radius = Number(condition.radiusMeters ?? 0);
      if (Number.isNaN(targetLat) || Number.isNaN(targetLng) || radius <= 0) {
        console.warn('gpsProximity condition needs targetLat, targetLng, radiusMeters > 0');
        return false;
      }
      const reading = this.sensorService.getLastKnownLocation();
      if (!reading) return false;
      const distance = haversineMeters(reading.lat, reading.lng, targetLat, targetLng);
      const within = distance <= radius;
      return condition.proximityMode === 'outside' ? !within : within;
    }

    // indoorProximity — test whether the named beacon is detected with
    // at least minRssi (signal strength in dBm; closer to 0 = stronger).
    // No matching beacon in the cache → condition is false.
    if (condition.type === 'indoorProximity') {
      const uuid = condition.beaconUuid;
      const minRssi = Number(condition.minRssi ?? -100);
      if (!uuid) {
        console.warn('indoorProximity condition missing beaconUuid');
        return false;
      }
      const beacons = this.sensorService.getLastKnownBeacons();
      const match = beacons.find((b) => {
        if (b.uuid !== uuid) return false;
        if (condition.beaconMajor !== undefined && b.major !== condition.beaconMajor) return false;
        if (condition.beaconMinor !== undefined && b.minor !== condition.beaconMinor) return false;
        return true;
      });
      if (!match) return false;
      // RSSI comparison: a beacon at -60 dBm beats a -70 dBm minRssi
      // threshold (the value is "less negative" / closer to 0).
      return match.rssi >= minRssi;
    }

    // permissionGranted — every listed permission must be 'granted'. Reads
    // the SensorService synchronously by relying on a pre-warmed
    // permissionStateCache populated whenever permission state is queried
    // through the engine. Conditions can't await; the cache is the
    // synchronous read path.
    if (condition.type === 'permissionGranted') {
      const requested = condition.permissions || [];
      if (requested.length === 0) return true;  // empty list → trivially granted
      for (const p of requested) {
        const cached = this.permissionStateCache.get(p);
        // Treat unknown / un-probed permissions as not-granted. A beat
        // that wants to gate on a permission must have run a probe
        // (ensureXRPermission) earlier in the story to populate the cache.
        if (cached !== 'granted') return false;
      }
      return true;
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
      case 'counter': {
        // When `character` is set, read the character-scoped counter store
        // (mirrors setVariable's owner model); omitted ⇒ story-global,
        // unchanged.
        const ctrOwner = (condition as any).character as string | undefined;
        leftValue = ctrOwner
          ? this.getCharacterCounter(ctrOwner, varName)
          : this.state.counters[varName] || 0;
        // Ensure rightValue is numeric for counter comparisons (guards against undefined/NaN)
        if (rightValue === undefined || rightValue === null || Number.isNaN(Number(rightValue))) {
          rightValue = 0;
        } else {
          rightValue = Number(rightValue);
        }
        console.log(`[StoryContext] Counter check: "${varName}"${ctrOwner ? ` @${ctrOwner}` : ''} = ${leftValue}, comparing ${condition.operator} ${rightValue}`);
        break;
      }
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
      // Step 7 / Mode B — record a reflection on the character's memory.
      // Effects fire from a beat or choice, so they're a natural place to
      // author "this character now feels X about what just happened".
      case 'addReflection': {
        const text = (effect.reflectionText || '').trim();
        if (text) {
          this.appendCharacterReflection(effect.target, text, {
            salience: typeof effect.reflectionSalience === 'number'
              ? effect.reflectionSalience
              : undefined,
          });
        }
        break;
      }
      // Step 8 — change a character's runtime goal status. Auto-fires
      // GAMYGDALA-style emotions for the new status unless suppressed.
      case 'setGoalStatus': {
        const goalId = (effect as any).goalId;
        const status = (effect as any).goalStatus as GoalStatus | undefined;
        if (goalId && status) {
          this.setGoalStatus(effect.target, goalId, status, {
            suppressEmotion: !!(effect as any).suppressEmotion,
          });
        }
        break;
      }
      // Switch a character's active variant. Re-seeds the character's
      // mood / sentiments from the variant's authored values unless
      // `suppressSeed` is set — appropriate for story-start switches.
      case 'setCharacterVariant': {
        const variantId = (effect as any).variantId as string | undefined;
        if (variantId !== undefined) {
          this.setActiveCharacterVariant(effect.target, variantId, {
            seedAffect: !((effect as any).suppressSeed),
          });
        }
        break;
      }
      // v0.9.45 — snapshot mood / emotion / sentiment state under a name
      // so subsequent condition baselines can compare against it. With
      // scope 'all' (default), every character's slots are captured. With
      // scope 'character' and a target, only that character is captured.
      case 'bookmarkAffectState': {
        const name = (effect as any).bookmarkName as string | undefined;
        if (!name) break;
        const scope = (effect as any).scope as 'all' | 'character' | undefined;
        if (scope === 'character' && effect.target) {
          this.takeAffectBookmark(name, { target: effect.target });
        } else {
          this.takeAffectBookmark(name);
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
    // Step 8 — re-evaluate authored goal satisfaction predicates each beat.
    // A goal that just became true (the player picked up the lantern, the
    // counter crossed a threshold, etc.) flips to 'met' and fires the
    // GAMYGDALA-style emotion stack here so subsequent beats see the
    // character's reaction.
    this.evaluateAllCharacterGoals();
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
      characterReflections: {},
      characterGoalStatus: {},
      activeCharacterVariants: {},
      initialMoods: {},
      initialEmotionLevels: {},
      initialSentiments: {},
      affectBookmarks: {},
      visitedBeats: new Set(),
      visitedChoices: new Set(),
      timers: {}
    };
    this.explicitVariantSet = {};
    this.history = [];
    this.choiceHistory = [];
    this.aiOutputHistory = [];
    this.timeline = [];
    // Re-seed authored initial affect after the wipe so a story restart
    // begins from the same emotional starting point each time.
    this.seedCharacterAffectFromStory();
    this.seedCharacterCountersFromStory();
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
    this.seedCharacterCountersFromStory();
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
      Array<{ id: string; defaultVariantId?: string }> | undefined;
    if (!characters) return;
    for (const char of characters) {
      if (!char?.id) continue;
      // Apply the authored default variant before seeding affect, so a
      // character with `defaultVariantId: 'introvert'` boots into the
      // introvert mood/sentiments without an explicit setCharacterVariant
      // call. Author can still override via a setCharacterVariant effect
      // before the first beat fires.
      if (char.defaultVariantId && !this.state.activeCharacterVariants[char.id]) {
        this.state.activeCharacterVariants[char.id] = char.defaultVariantId;
      }
      this.seedCharacterAffectFor(char.id);
    }
  }

  /**
   * Seed each character's authored counters (Character.counters[]) into the
   * runtime per-character store. Without this, an author defining
   * "Wolf.health = 100" in the character editor never reaches
   * `characterCounters` at runtime — reads return the 0 default and the
   * meter never moves while a `setVariable type:counter` beat that targets
   * the same character mutates a value the editor can't see. This connects
   * the two halves of the per-character counter system.
   *
   * Only fills slots that are currently empty, mirroring affect seeding:
   * a value already present (loaded from a saved game, or mutated by a beat
   * that ran before this call) is never overwritten. Idempotent; called
   * from the constructor, reset, and setStory.
   */
  seedCharacterCountersFromStory(): void {
    const story = this.story;
    if (!story) return;
    const characters = (story as any).getCharacters?.() as
      Array<{ id: string }> | undefined;
    if (!characters) return;
    for (const char of characters) {
      if (!char?.id) continue;
      const key = this.resolveCharRef(char.id);
      if (!key) continue;
      // Merged record so an active variant's counter overrides win, matching
      // how affect seeding reads the merged character.
      const merged = this.getMergedCharacter(key) as
        | { counters?: Array<{ name?: string; value?: number }> }
        | undefined;
      const defs = merged?.counters;
      if (!Array.isArray(defs) || defs.length === 0) continue;
      for (const def of defs) {
        const name = def?.name;
        if (!name) continue;
        if (!this.state.characterCounters[key]) this.state.characterCounters[key] = {};
        if (this.state.characterCounters[key][name] !== undefined) continue;
        const value = typeof def.value === 'number' ? def.value : 0;
        this.state.characterCounters[key][name] = value;
        this.emit('characterCounterChanged', {
          characterRef: key,
          name,
          value,
          previous: 0,
        });
      }
    }
  }

  /**
   * Seed mood + sentiments for one character from the merged record (so the
   * active variant's `initialMood` / `initialSentiments` win over the base).
   * Used both by the cross-character startup walk and by
   * setActiveCharacterVariant after a runtime variant switch.
   */
  private seedCharacterAffectFor(charId: string): void {
    const merged = this.getMergedCharacter(charId) as
      | {
          id?: string;
          initialMood?: { valence: number; arousal: number };
          initialSentiments?: Array<{ toEntityRef: string; emotion: string; strength: number }>;
        }
      | undefined;
    if (!merged) return;
    if (merged.initialMood && !this.state.characterMoods[charId]) {
      const next = {
        valence: StoryContext.clampUnit(merged.initialMood.valence ?? 0),
        arousal: StoryContext.clampUnit(merged.initialMood.arousal ?? 0),
      };
      this.state.characterMoods[charId] = next;
      // Capture the seeded mood as the initial baseline (v0.9.45). Without
      // this, a "mood improved since the start" condition would compare
      // against 0 instead of the authored seed for characters who started
      // off-neutral (e.g. Alex seeded at valence -0.3).
      this.state.initialMoods[charId] = { valence: next.valence, arousal: next.arousal };
      // Emit so HUDs / panels subscribed via characterMoodChanged
      // re-render. Otherwise a runtime variant switch (which wipes the
      // mood map and reseeds here) would change state silently and the
      // overlay would keep showing the prior values.
      this.emit('characterMoodChanged', { characterRef: charId, mood: next, previous: { valence: 0, arousal: 0 } });
    }
    if (merged.initialSentiments && merged.initialSentiments.length > 0) {
      if (!this.state.characterSentiments[charId]) this.state.characterSentiments[charId] = [];
      if (!this.state.initialSentiments[charId]) this.state.initialSentiments[charId] = [];
      const existing = this.state.characterSentiments[charId];
      const initialList = this.state.initialSentiments[charId];
      let seededAny = false;
      for (const seed of merged.initialSentiments) {
        if (!seed?.toEntityRef || !seed?.emotion) continue;
        const present = existing.some(
          (s) => s.toEntityRef === seed.toEntityRef && s.emotion === seed.emotion,
        );
        if (!present) {
          const strength = StoryContext.clampUnit(seed.strength ?? 0);
          existing.push({
            toEntityRef: seed.toEntityRef,
            emotion: seed.emotion,
            strength,
            createdAt: Date.now(),
          });
          // Capture seeded sentiment as the initial baseline so
          // delta-from-initial conditions read against the authored seed.
          if (!initialList.some((s) => s.toEntityRef === seed.toEntityRef && s.emotion === seed.emotion)) {
            initialList.push({
              toEntityRef: seed.toEntityRef,
              emotion: seed.emotion,
              strength,
              createdAt: Date.now(),
            });
          }
          seededAny = true;
        }
      }
      if (seededAny) {
        this.emit('characterSentimentChanged', { characterRef: charId });
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
      characterReflections: Object.fromEntries(
        Object.entries(this.state.characterReflections).map(([k, v]) => [k, v.map((r) => ({ ...r }))])
      ),
      characterGoalStatus: Object.fromEntries(
        Object.entries(this.state.characterGoalStatus).map(([k, v]) => [k, { ...v }])
      ),
      activeCharacterVariants: { ...this.state.activeCharacterVariants },
      // v0.9.45 — baseline + bookmark snapshots so save/load preserves
      // delta-vs-initial / delta-vs-bookmark comparisons across sessions.
      initialMoods: Object.fromEntries(
        Object.entries(this.state.initialMoods).map(([k, v]) => [k, { ...v }])
      ),
      initialEmotionLevels: Object.fromEntries(
        Object.entries(this.state.initialEmotionLevels).map(([k, v]) => [k, { ...v }])
      ),
      initialSentiments: Object.fromEntries(
        Object.entries(this.state.initialSentiments).map(([k, v]) => [k, v.map((s) => ({ ...s }))])
      ),
      affectBookmarks: Object.fromEntries(
        Object.entries(this.state.affectBookmarks).map(([name, snap]) => [
          name,
          {
            moods: Object.fromEntries(Object.entries(snap.moods).map(([k, v]) => [k, { ...v }])),
            emotionLevels: Object.fromEntries(Object.entries(snap.emotionLevels).map(([k, v]) => [k, { ...v }])),
            sentiments: Object.fromEntries(Object.entries(snap.sentiments).map(([k, v]) => [k, v.map((s) => ({ ...s }))])),
          },
        ])
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
      characterReflections: serialized.characterReflections
        ? Object.fromEntries(Object.entries(serialized.characterReflections).map(([k, v]) => [k, v.map((r: any) => ({ ...r }))]))
        : {},
      characterGoalStatus: serialized.characterGoalStatus
        ? Object.fromEntries(Object.entries(serialized.characterGoalStatus).map(([k, v]) => [k, { ...v }]))
        : {},
      activeCharacterVariants: serialized.activeCharacterVariants
        ? { ...serialized.activeCharacterVariants }
        : {},
      // v0.9.45 — restore baseline snapshots and named bookmarks; default
      // to empty maps for older saves (forward-compat).
      initialMoods: serialized.initialMoods
        ? Object.fromEntries(Object.entries(serialized.initialMoods).map(([k, v]) => [k, { ...v }]))
        : {},
      initialEmotionLevels: serialized.initialEmotionLevels
        ? Object.fromEntries(Object.entries(serialized.initialEmotionLevels).map(([k, v]) => [k, { ...v }]))
        : {},
      initialSentiments: serialized.initialSentiments
        ? Object.fromEntries(Object.entries(serialized.initialSentiments).map(([k, v]) => [k, v.map((s: any) => ({ ...s }))]))
        : {},
      affectBookmarks: serialized.affectBookmarks
        ? Object.fromEntries(Object.entries(serialized.affectBookmarks).map(([name, snap]: [string, any]) => [
            name,
            {
              moods: Object.fromEntries(Object.entries(snap.moods || {}).map(([k, v]: [string, any]) => [k, { ...v }])),
              emotionLevels: Object.fromEntries(Object.entries(snap.emotionLevels || {}).map(([k, v]: [string, any]) => [k, { ...v }])),
              sentiments: Object.fromEntries(Object.entries(snap.sentiments || {}).map(([k, v]: [string, any]) => [k, (v as any[]).map((s: any) => ({ ...s }))])),
            },
          ]))
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
