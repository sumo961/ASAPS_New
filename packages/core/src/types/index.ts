// Core type definitions
export * from './ClusterTypes';
export * from './theme';
export * from './animation';
import type { AnimationPath } from './animation';

export interface Location {
  kind: 'text' | 'hotspot' | 'prop' | 'character' | 'button' | 'dialog' | 'input' | 'meter' | 'keypad' | 'webview' | 'camera';
  name: string;
  id?: string;  // Unique element ID for animation targeting
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * Layout-agnostic position siblings to x/y (percent of stage,
   * 0..100). Populated by the Fixed → Responsive migrator for
   * free-positioned avatars (kind: 'character' | 'prop') so the
   * responsive renderer can scale the location against the live
   * stage at any viewport. Absent on fixed-mode locations; pixel
   * x/y remains canonical for the absolute renderer.
   */
  xPercent?: number;
  yPercent?: number;
  widthPercent?: number;
  heightPercent?: number;
  zIndex?: number;
  assetId?: string;  // Asset reference for character/prop elements
  assetType?: 'image' | 'audio' | 'video' | 'font';  // Asset type for rendering (video renders as <video> instead of <img>)
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
  /**
   * Phase 1 — opt out of CollisionDetect auto-shifting in absolute mode.
   * When true the renderer keeps the element at the authored x/y even
   * if it overlaps another element. Designer feedback: forced
   * collision avoidance fought authored layouts; this is the escape
   * hatch. Default `false` (legacy behavior preserved).
   */
  lockPosition?: boolean;
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
  /**
   * Spatial / directional sound configuration (v0.9.48 / S4+).
   *
   * When set, the renderer routes this sound through a Web Audio
   * PannerNode that pans audio left/right (and front/back / up/down
   * via HRTF when supported) based on the source's position relative
   * to the player. Two flavours, mutually exclusive in practice but
   * coexisting in the schema for future extension:
   *
   *   - **Geographic** (`lat` + `lng` set): the runtime computes
   *     bearing from the player's current GPS reading to this fixed
   *     point and updates the panner as the player walks around.
   *     Pair with a story that has GPS authoring (the SensorService
   *     keeps a fresh location cache via S2 + S3).
   *   - **Azimuth** (`azimuth` set, no lat/lng): the source has a
   *     fixed compass direction relative to true north (0=N, 90=E).
   *     The panner uses the device's orientation (alpha) to compute
   *     left/right pan. Cheaper, no GPS required — works for "the
   *     sound is always to your left" effects in any beat.
   *
   * `maxDistanceMeters` (geographic only) caps audible range — beyond
   * the threshold, the sound is silent. Default 100m.
   */
  spatialPosition?: {
    /** Source latitude (geographic mode). */
    lat?: number;
    /** Source longitude (geographic mode). */
    lng?: number;
    /** Fixed azimuth in degrees, 0=N (azimuth-only mode). */
    azimuth?: number;
    /** Optional elevation offset in metres for vertical positioning. */
    elevation?: number;
    /** Audible-range cap in metres (geographic mode). Default 100m. */
    maxDistanceMeters?: number;
  };
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
  type:
    | 'variable' | 'inventory' | 'counter' | 'timer' | 'counterCompare'
    | 'visitedBeat' | 'fictionalTime' | 'mood' | 'sentiment' | 'emotion'
    | 'trait' | 'goal' | 'characterVariant'
    // XR / sensor conditions (v0.9.48 / S3+).
    //   gpsProximity     — branch on player's distance to a GPS target
    //   indoorProximity  — branch on a beacon's signal strength
    //   permissionGranted — branch on whether the player has granted the
    //                       listed sensor permissions
    | 'gpsProximity' | 'indoorProximity' | 'permissionGranted';
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
  // For mood conditions (Step 4): which axis to test on `character`'s mood.
  moodAxis?: 'valence' | 'arousal';
  // For sentiment conditions (Step 4): direction & emotion of the test.
  // `character` is the holder of the sentiment; `sentimentTarget` is whom the
  // sentiment is directed at; `sentimentEmotion` is the emotion label.
  // The compared scalar is the strength stored at (target, emotion). When
  // sentimentEmotion is omitted, the strength is summed across all emotions
  // toward the target — useful for "does Granny like the player overall?".
  sentimentTarget?: string;
  sentimentEmotion?: string;
  // For emotion conditions (Step 5): tests `character`'s current intensity
  // for `emotionName` against `value`. The compared scalar is the level
  // ∈ [0, 1] from StoryContext.getCharacterEmotion.
  emotionName?: string;
  // For trait conditions (Step 6): tests `character`'s static trait value
  // against `value`. Traits are author-set on Character.traits and stay in
  // [0, 1] (default Big Five: openness / conscientiousness / extraversion /
  // agreeableness / neuroticism — but the bag is open).
  traitName?: string;
  // For goal conditions (Step 8): tests the runtime status of a named goal
  // on `character`. Compare with `==` / `!=` / etc. against a status string
  // ('open' | 'met' | 'failed' | 'abandoned'). The compared value is read
  // from `value` (preferred) or `goalStatus` for explicit clarity.
  goalId?: string;
  goalStatus?: 'open' | 'met' | 'failed' | 'abandoned';
  // For characterVariant conditions: tests which variant is currently
  // active on `character`. The compared value (variantId) is read from
  // `value` or `variantId`. Operators: == / !=. An empty / unset
  // variant compares as the empty string.
  variantId?: string;
  // For gpsProximity conditions (S3+): test the player's distance to a
  // target lat/lng against `radiusMeters`. `proximityMode` distinguishes
  // 'within' (player is inside the radius — "you've arrived") from
  // 'outside' (player is outside — "you've left the area"). When the
  // SensorService has no cached location yet, the condition evaluates
  // false (the player can't be near a place we don't know about).
  targetLat?: number;
  targetLng?: number;
  radiusMeters?: number;
  proximityMode?: 'within' | 'outside';
  // For indoorProximity conditions (S3+): test whether a specific beacon
  // is detected with at least the given signal strength. `minRssi` is in
  // dBm — closer to 0 = stronger signal. -65 dBm ≈ within 1 metre,
  // -85 dBm ≈ within 10 metres (highly variable). When no cached beacon
  // matches the uuid, the condition evaluates false.
  beaconUuid?: string;
  beaconMajor?: number;
  beaconMinor?: number;
  minRssi?: number;
  // For permissionGranted conditions (S3+): a list of sensor capabilities
  // that must ALL be 'granted' for the condition to evaluate true. Use to
  // gate XR beats behind a permission probe ("did the player accept the
  // GPS prompt?") and route to a fallback when not. Names are the same
  // strings the SensorService.getPermissionState API takes.
  permissions?: Array<'gps' | 'camera' | 'orientation' | 'beacons'>;
  /**
   * Baseline-relative comparison switch for the continuous-valued affect
   * conditions (`mood`, `emotion`, `sentiment`). When set, the operator
   * compares `current - baseline` (a delta) against `value` instead of
   * comparing `current` directly. Lets authors phrase requirements as
   * "trust toward player has *grown* by 0.3" rather than as a fixed
   * threshold that depends on the character's starting point.
   *
   *   - `'literal'` (or undefined) — current behaviour: compare current
   *     against `value` directly.
   *   - `'initial'` — compare against the value the slot held when the
   *     story started (or when the character first picked it up). The
   *     runtime captures this lazily on first mutation. Missing initial
   *     reads as 0 — which matches the slot's default rest state.
   *   - `{ bookmark: name }` — compare against a snapshot taken earlier
   *     by the `bookmarkAffectState` effect. Missing bookmark or missing
   *     entry reads as 0.
   *
   * No effect on conditions other than mood / emotion / sentiment — the
   * trait / goal / variant / non-affect predicates ignore this field.
   */
  baseline?: 'literal' | 'initial' | { bookmark: string };
}

/**
 * An authored goal on a Character (Step 8 — Phase A). Goals are static
 * authoring data; their *status* is runtime state managed by StoryContext.
 *
 * Authors give each goal:
 *   id           — stable identifier; used by status lookups and effects.
 *   name         — short label for editor UIs and dossier rendering.
 *   description? — fuller author note, included in the dossier.
 *   priority?    — relative weight ∈ [0, 1]. Default 0.5. Used to scale
 *                  GAMYGDALA-style emotion deltas when the goal advances.
 *   satisfaction?— optional Condition the runtime evaluates each beat-
 *                  enter; flips `status` to 'met' when it returns true.
 *                  Goals without a satisfaction predicate stay open
 *                  until something explicitly sets their status.
 */
export interface CharacterGoal {
  id: string;
  name: string;
  description?: string;
  priority?: number;
  satisfaction?: Condition;
}

/**
 * A partial overlay on a Character record. Variants let one character
 * (one stable id, one set of beats) carry several persona profiles —
 * e.g. Alex-introvert vs Alex-extrovert in a coming-out story, or Player-
 * man vs Player-woman in a customisable protagonist. Exactly one variant
 * is active at any time; switching is intended to happen at story-start
 * via the `setCharacterVariant` effect or the character's authored
 * `defaultVariantId`. Mid-story switches are allowed but discard mood
 * and sentiments accumulated under the prior variant when re-seeding.
 */
export interface CharacterVariant {
  id: string;
  name: string;
  description?: string;
  displayName?: string;
  portrait?: { image?: string; assetId?: string };
  traits?: Record<string, number>;
  dossierPolicy?: 'reAnchor' | 'reflection';
  initialMood?: { valence: number; arousal: number };
  initialSentiments?: Array<{ toEntityRef: string; emotion: string; strength: number }>;
  characterDescription?: string;
}

/**
 * One location entry on a multi-location XR beat (v0.9.49+). Mirrors the
 * shape of MovementChoice's `choices` — each location has its own
 * target beat and optional Effects bundle that fires when this
 * specific location is the one the player crossed into / out of.
 *
 * Two flavours: GPS (lat/lng) and indoor (beaconUuid). The `kind`
 * discriminator lets a beat type filter to the right one.
 */
export interface XRLocationEntry {
  /** Stable id for this location. Used by the renderer to identify which one fired. */
  id: string;
  /** Author-facing label (e.g. "Front gate", "Statue", "Bookshelf"). */
  name?: string;
  /** GPS target — set for GpsLocationBeat. */
  lat?: number;
  lng?: number;
  /** Indoor beacon target — set for IndoorLocationBeat. */
  beaconUuid?: string;
  /**
   * Indoor floor-plan position in metres from the top-left of this beat's
   * floor plan (v0.9.49+). Authoring-time visual coordinate — distinct
   * from the beacon's stable physical UUID, so the same beacon can be
   * drawn at different positions on different beats' floor plans.
   */
  x?: number;
  y?: number;
  /**
   * Per-location radius. Falls back to the beat's `radiusMeters`,
   * then the project's `defaultProximityRadiusM`, then a beat-type
   * default (25m for GPS, 5m for indoor).
   */
  radiusMeters?: number;
  /** Beat id to advance to when this location is the resolution. Required. */
  target: string;
  /** Effects to apply on resolution (counters, mood, sentiment, etc). */
  effects?: Effect[];
}

export interface Effect {
  type:
    | 'setVariable' | 'addInventory' | 'removeInventory' | 'incrementCounter' | 'setCounter'
    // Step 4 / Phase A: character affect effects so dialog choices, dialog
    // nodes, and other effect hosts can update mood and sentiments inline
    // without needing a separate UpdateAffect beat in the graph.
    | 'nudgeMood' | 'addSentiment'
    // Step 5: fire an emotion at a character (auto-nudges mood per palette
    // weights). The same authoring shortcut as nudgeMood/addSentiment, but
    // routed through the emotion model so palette changes take effect.
    | 'fireEmotion'
    // Step 7 / Mode B: append a reflection to a character's memory. Used by
    // characters whose dossierPolicy is 'reflection' so the LLM sees recent
    // felt-experience alongside (or instead of) the structured dossier.
    | 'addReflection'
    // Step 8 — change the runtime status of a named goal on a character.
    // Triggers GAMYGDALA-style emotion firing (pride/joy on 'met',
    // shame/sadness on 'failed') unless `suppressEmotion` is set.
    | 'setGoalStatus'
    // Switch which variant is active for a character. Use on a player-
    // facing choice (e.g. "play as a man" / "play as a woman") or in a
    // story-start branch to lock in a persona. By default this re-seeds
    // the character's mood / sentiments from the variant's authored
    // values; set `suppressSeed` to keep accumulated affect.
    | 'setCharacterVariant'
    // Snapshot the current mood / emotion / sentiment values of one
    // character (or every character) under a bookmark name. The bookmark
    // is then a stable point of comparison for future condition checks
    // — "trust toward player has improved since the reunion-scene
    // bookmark" reads as `(current trust) - (bookmarked trust) >= …`.
    // The bookmark name is the canonical handle: writing the same name
    // again overwrites the prior snapshot.
    | 'bookmarkAffectState';
  target: string;
  value?: any;
  /**
   * Counter owner for `incrementCounter` / `setCounter` effects. Omitted ⇒
   * the story-global counter (default, unchanged). A Character id/name
   * scopes the counter to that character's per-character store — mirrors
   * setVariable.character. NOTE: for counter effects `target` is the
   * counter NAME (not the character); the affect effects instead use
   * `target` as the character ref. Ignored for non-counter effect types.
   */
  character?: string;
  // Sentiment-effect parameters (used when type === 'addSentiment'). Kept
  // top-level rather than nested under `value` so the existing effect-editor
  // UI can wire them up like any other effect property.
  sentimentTarget?: string;
  sentimentEmotion?: string;
  /**
   * Mood-effect parameters (used when type === 'nudgeMood'). Each axis is
   * an optional delta — runtime clamps the resulting mood to [-1, 1].
   */
  valenceDelta?: number;
  arousalDelta?: number;
  /** Strength delta for addSentiment effects (clamped post-add). */
  strengthDelta?: number;
  /** Emotion name for fireEmotion effects. Looked up case-insensitively
   * against the story's EmotionPalette to find weights for the auto
   * mood nudge. Unknown names update the level but skip the nudge. */
  emotion?: string;
  /** Intensity delta for fireEmotion effects (clamped to [0, 1] post-add). */
  emotionDelta?: number;
  /**
   * Reflection text for addReflection effects (Step 7). Stored on the
   * character's reflection memory at the moment the effect fires. Authors
   * can use this to seed feelings the dossier renders to the LLM.
   */
  reflectionText?: string;
  /** Optional salience hint ∈ [0, 1] for the reflection — higher = harder
   * to evict when the per-character cap fills up. Defaults to 0.5. */
  reflectionSalience?: number;
  /**
   * Goal id for setGoalStatus effects (Step 8). Identifies which authored
   * `Character.goals[]` entry to flip. The character is `effect.target`.
   */
  goalId?: string;
  /** New status for setGoalStatus effects. */
  goalStatus?: 'open' | 'met' | 'failed' | 'abandoned';
  /**
   * When true, the goal status change does not auto-fire pride / shame /
   * joy / sadness emotions. Default false. Use for status changes that
   * should not register as emotional events (e.g. quiet abandonment).
   */
  suppressEmotion?: boolean;
  /**
   * Variant id for setCharacterVariant effects. The character is
   * `effect.target`. Empty string clears the active variant.
   */
  variantId?: string;
  /**
   * When true on setCharacterVariant, runtime keeps the current mood /
   * sentiments instead of re-seeding from the variant's authored values.
   * Default false (re-seed) — appropriate for story-start switches.
   */
  suppressSeed?: boolean;
  /**
   * Bookmark name for `bookmarkAffectState` effects. Writing the same
   * name again overwrites the snapshot. Empty / missing names are
   * ignored. Bookmarks are referenced by condition `baseline` switches.
   */
  bookmarkName?: string;
  /**
   * Bookmark scope for `bookmarkAffectState`. `'all'` (default) snapshots
   * every character's mood / sentiments / emotion levels. `'character'`
   * snapshots only `effect.target` — useful for per-arc bookmarks that
   * shouldn't get overwritten by an unrelated character's later snapshot.
   */
  scope?: 'all' | 'character';
}

/**
 * Declares a state prerequisite that must hold when a beat is entered.
 *
 * Requirements are a first-class authoring primitive: at runtime, the engine
 * evaluates each requirement against the StoryContext when the beat is about
 * to execute; if any fail, the engine redirects to the requirement's
 * `fallbackTarget` instead of running the beat's action. This is the natural
 * way to say "you need the lantern to enter the crypt — otherwise go back to
 * the hall". It also gives the path analyzer a formal contract to verify
 * (e.g. surfacing soft-locks when no path satisfies the requirement).
 *
 * The condition reuses the standard Condition type, so any predicate a
 * conditionBeat can express can also be a requirement (variable, counter,
 * inventory, counterCompare, visitedBeat, fictionalTime).
 */
export interface StateRequirement {
  condition: Condition;
  /** Human-readable explanation, e.g. "Player must have read the code.". */
  explanation: string;
  /** Analyzer severity when no reachable path satisfies the requirement. Defaults to 'error'. */
  severity?: 'warn' | 'error';
  /**
   * Beat to redirect to when this requirement is unmet at runtime. If omitted,
   * the engine logs a warning and continues into the beat (backwards-compatible
   * with pure-annotation usage).
   */
  fallbackTarget?: string;
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
  /** State prerequisites — see StateRequirement for semantics. */
  requires?: StateRequirement[];
  /**
   * How multiple requirements combine. 'all' (default) — every requirement
   * must hold. 'any' — at least one must hold; the beat is gated only when
   * *every* requirement fails.
   */
  requiresMode?: 'all' | 'any';
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

  /** Analyze an image with a vision-capable model (for InputImageBeat).
   *  Optional — providers/models without vision support simply omit it
   *  and the beat falls back to its fallbackValue. */
  analyzeImage?(
    image: { base64: string; mediaType: string },
    prompt: string,
    options?: { maxTokens?: number }
  ): Promise<string>;
}

/**
 * Permission identifiers — intent-level (not tied to web/native APIs).
 * Each runtime target maps these to its own native equivalent:
 *   web      → navigator.permissions / getUserMedia / Geolocation
 *   Electron → session.setPermissionRequestHandler
 *   iOS      → AVCaptureDevice.requestAccess / CLLocationManager
 *   Android  → ActivityCompat.requestPermissions
 *
 * Beats declare the permissions they need via the schema's `permissions`
 * field; the runtime resolves them via IPermissionManager before
 * mounting the beat's primary UI.
 */
export type Permission = 'camera' | 'microphone' | 'geolocation' | 'network';
export type PermissionStatus = 'granted' | 'denied' | 'prompt' | 'unavailable';

export interface IPermissionManager {
  /** Cheap check — does NOT trigger a prompt. */
  query(p: Permission): Promise<PermissionStatus>;
  /** Triggers the native consent prompt if needed; resolves when the
   *  user responds. May resolve with 'denied' or 'unavailable'. */
  request(p: Permission): Promise<PermissionStatus>;
  /** Optional hint that the story will need these permissions soon.
   *  A native runtime can use this to batch prompts at story start
   *  instead of mid-beat. Web/Electron can no-op. */
  declare?(perms: Permission[]): void;
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
  renderChoices(choices: { id: string; text: string; isExit?: boolean; hotspot?: { x: number; y: number; width: number; height: number; shape?: 'rect' | 'ellipse' } }[], locations?: Location[]): Promise<string>;
  renderMovement(question: string, choices: { id: string; text: string; displayText?: string; location: string; locationName?: string; hotspot?: { x: number; y: number; width: number; height: number; shape?: 'rect' | 'ellipse' } }[], locations?: Location[]): Promise<string>;
  renderPropSelection(question: string, props: { id: string; name: string; displayName?: string; description: string; locationName?: string; hotspot?: { x: number; y: number; width: number; height: number; shape?: 'rect' | 'ellipse' } }[], locations?: Location[]): Promise<string>;
  renderVideo(videoFile: string, autoplay: boolean, controls: boolean, locations?: Location[], skipButton?: boolean): Promise<void>;
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

  // QR-scan beat — opens the rear (or front) camera, decodes QR codes
  // frame-by-frame, resolves with the decoded string when one is found
  // OR with the literal 'cancelled' / 'permission_denied' on failure
  // paths. The renderer wires `cameraLayer.onDecode.saveTo` so the beat
  // can record the scanned value to a variable before branching.
  renderQRScan?(prompt: string, options: {
    facing?: 'rear' | 'front';
    /** Optional regex array — if set, only matching codes resolve. */
    matchPatterns?: string[];
    /** Continue button label (lets the player give up). */
    cancelButtonText?: string;
    /** Persistent help text shown above the scan target. */
    helperText?: string;
  }, locations?: Location[]): Promise<string>;

  // Input-image beat — file picker / camera capture. Resolves with the
  // selected image as a data URL (data:image/jpeg;base64,...) or the
  // literal 'cancelled' when the player skips. The renderer downscales
  // the image before resolving so it fits vision-API size limits.
  renderInputImage?(prompt: string, options: {
    imageSource?: 'upload' | 'camera' | 'both';
    buttonText?: string;
    cancelButtonText?: string;
  }, locations?: Location[]): Promise<string>;

  // webView beat — embeds an external URL in an iframe (web) or
  // <webview> (Electron). Resolves with one of:
  //  - 'done' when the player clicks the done button
  //  - the matched URL when exitUrlPattern fires
  //  - the postMessage value when the page sends {asaps:'result', value}
  // The page can read variables in the URL hash; we pass them as
  // #key=value pairs (URL-encoded) for those listed in passContext.
  renderWebView?(options: {
    url: string;
    prompt?: string;
    exitUrlPattern?: string;
    /** Pre-resolved query-style hash fragment to append to URL. */
    contextHash?: string;
    doneButtonText?: string;
  }, locations?: Location[]): Promise<string>;

  // arBeat — augmented-reality scene. Camera + marker tracking; anchor
  // overlays are tappable. Resolves with one of:
  //  - 'cancelled' / 'permission_denied' — runtime sentinels
  //  - the anchor's onTap value (asaps:// URI or bare beat id) when
  //    the player taps an overlay
  // Asset ids (markerAssetId, anchor.assetId) are passed through and
  // the renderer resolves them via its registered asset resolver —
  // same pattern as renderPanorama.
  renderAR?(options: {
    prompt?: string;
    trackingMode?: 'marker' | 'world' | 'face';
    markerAssetId?: string;
    anchors: Array<{
      id: string;
      label?: string;
      assetId?: string;
      anchoredTo?: string;
      offsetX?: number;
      offsetY?: number;
      scale?: number;
      onTap?: string;
    }>;
    cancelButtonText?: string;
  }, locations?: Location[]): Promise<string>;

  // GPS Location beat (v0.9.48 / S4+) — renders a map UI showing the
  // target location and (when available) the player's current position
  // and distance. In trigger modes, the renderer should resolve when
  // the proximity threshold is crossed or the timeout expires (or the
  // player explicitly skips). Returning a string lets the beat report
  // back which path it took: 'arrived' / 'departed' / 'timeout' /
  // 'skipped' / 'continue' (display-mode click).
  //
  // The renderer reads live location updates from the StoryContext's
  // SensorService — it doesn't need to take location data via this
  // call. The mode + target + radius parameters tell the renderer how
  // to display and when to resolve.
  renderMap?(options: {
    mode: 'display' | 'trigger-on-arrival' | 'trigger-on-departure';
    /**
     * Locations to render on the map. v0.9.49+ supports multiple per
     * beat — each entry has its own lat/lng + radius + name. The
     * renderer reports back which location the player crossed via
     * the resolution's `locationId`. Single-location beats produce a
     * one-element array.
     */
    locations: Array<{
      id: string;
      name?: string;
      lat: number;
      lng: number;
      radiusMeters: number;
    }>;
    text?: string;
    buttonText?: string;
    cancelButtonText?: string;
    timeoutMs?: number;
    mapStyle?: 'streets' | 'satellite' | 'minimal';
    showPlayerMarker?: boolean;
  }, _locations?: Location[]): Promise<{
    /** Resolution path. */
    path: 'arrived' | 'departed' | 'continue' | 'timeout' | 'skipped';
    /** Which location resolved (when path is arrival/departure). */
    locationId?: string;
  }>;

  /**
   * Render an indoor floor-plan view for the IndoorLocationBeat (v0.9.49+).
   * The beat resolves venue + beacon definitions from globalSettings before
   * the call so the renderer doesn't need direct access to story state. Live
   * BeaconReadings come from the StoryContext's SensorService (in renderer
   * state). Resolves with the same path strings as renderMap.
   */
  renderIndoorMap?(options: {
    mode: 'display' | 'trigger-on-arrival' | 'trigger-on-departure';
    /**
     * Target locations on the floor plan. Each carries its own x/y
     * (metres from top-left), so the renderer doesn't need to look up
     * positions in a project-level beacon registry. beaconUuid identifies
     * the physical beacon for proximity matching at runtime.
     */
    locations: Array<{
      id: string;
      name?: string;
      beaconUuid: string;
      x: number;
      y: number;
      radiusMeters: number;
    }>;
    text?: string;
    buttonText?: string;
    cancelButtonText?: string;
    timeoutMs?: number;
    /** Resolved venue floorplan info (assetId + dimensions in metres). */
    venue?: {
      name?: string;
      floorPlanAssetId?: string;
      floorWidth: number;
      floorHeight: number;
    };
  }): Promise<{
    path: 'arrived' | 'departed' | 'continue' | 'timeout' | 'skipped';
    locationId?: string;
  }>;

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
  category: 'visible' | 'invisible' | 'custom' | 'xr';
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

  /**
   * Authoring-only: the exact comma-separated string the author typed in the
   * inspector, preserved verbatim so mid-edit separators (a trailing "," or
   * space) survive the flatten/unflatten round-trip. `keywords` remains the
   * cleaned array used at runtime; this is never read by the trigger logic.
   */
  keywordsRaw?: string;

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

  /**
   * Optional NPC farewell/confirmation prompt for exit actions.
   * When set, the NPC generates a final message from this prompt before exiting.
   * Example: "confirm the order enthusiastically and say you'll get it started"
   */
  exitMessage?: string;

  /** Variable name to set (set-variable) */
  variableName?: string;

  /** Variable value to set — static value (set-variable) */
  variableValue?: any;

  /**
   * AI extraction prompt for dynamic variable values (set-variable).
   * When set, the AI extracts the value from the conversation history
   * instead of using the static variableValue.
   * Example: "summarize the complete chicken wing order"
   */
  extractionPrompt?: string;

  /** Composed actions (multi) */
  actions?: ConversationAction[];
}
