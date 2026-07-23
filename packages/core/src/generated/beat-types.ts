/**
 * Auto-generated TypeScript types from beat-definitions/core-beats.json
 * DO NOT EDIT MANUALLY - Run 'npm run generate:types' to regenerate
 * 
 * Schema Version: 2.16.0
 * Generated: 2026-07-23T07:17:49.533Z
 */

// ============================================
// Custom Types from Schema
// ============================================

import type { Connection, Condition, Effect } from '../types';

/**
 * A node in a dialog tree representing NPC/system output. Followed by player choices, or auto-advances if target is set with no choices.
 */
export interface DialogNode {
  id: string;
  speaker: string;
  text: string;
  emotion?: string;
  conditions?: Condition[];
  choices: DialogChoice[];
  effects?: Effect[];
  target?: string;
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
  hotspot?: SpatialHotspot;
}

/**
 * A button-style choice in a MultiChoice beat (NPC text + several response buttons, single level, no spatial layer). Same per-choice effect surface as a movementOption / dialogChoice, but no location / hotspot fields — the choice is always a button.
 */
export interface MultiChoiceOption {
  id: string;
  text: string;
  displayText?: string;
  target: string;
  conditions?: Condition[];
  effects?: Effect[];
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
  hotspot?: SpatialHotspot;
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
  hotspot?: SpatialHotspot;
}

/**
 * Normalized 0–1 clickable region on the spatial image (P3-3c). Coordinates are RELATIVE to the LETTERBOXED image rect (objectFit:'contain'), so the hotspot tracks the picture pixels across viewports / orientations.
 */
export interface SpatialHotspot {
  x: number;
  y: number;
  width: number;
  height: number;
  shape?: 'rect' | 'ellipse';
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
  /** Soft responsive layout intent for slot-mode rendering (per-slot preferredLines / anchor / gap). Visual-Editor managed; NEVER serialized as baked locations[] — a beat carrying slotIntent and no locations[] stays responsive (slot mode). Absent → pure flow. */
  slotIntent?: Object | undefined;
  /** Responsive motion intent for slot-mode rendering (P3-anim). Per-slot enter/exit/emphasis presets resolved against the slot's responsive box — survives reflow/orientation. Distinct from the legacy `animations` (AnimationPath[] over absolute x/y). Absent → no animation. P3-anim-1 supports the 'fade' enter preset; further presets land per the P3-anim phasing in project_responsive_layout_system memory. */
  slotAnimations?: Object | undefined;
  /** Responsive motion intent for the SPATIAL layer (Phase-3 composite image). Cinematic enter presets — ken-burns, zoom-in, zoom-out, pan-{left,right,up,down}. Resolved against the image's currently-rendered rect, so motion survives reflow / viewport. Distinct from slotAnimations (flow layer). Absent → no animation. Only meaningful for spatial-mode beats. */
  spatialAnimations?: Object | undefined;
  /** Story title text */
  title: string;
  /** Author name */
  author?: string | undefined;
  /** Start button text */
  buttonText?: string | undefined;
  /** How the background image fits the stage. 'contain' (default) preserves the full image with letterboxed bars when aspect ratios differ; 'cover' fills the stage and may crop the image's edges. Override the schema-level default per beat. */
  spatialFit?: string | undefined;
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
  textVariations?: String[] | undefined;
  /** Continue button text (also used as connection label) */
  buttonText?: string | undefined;
  /** Who speaks this beat's text (for TTS voice and optional display) */
  speaker?: string | undefined;
  /** Show speaker name to the interactor */
  showSpeaker?: boolean | undefined;
  /** Target beat when button is clicked */
  connection: Connection;
  /** Responsive motion intent for slot-mode rendering (P3-anim). Per-slot enter/exit/emphasis presets resolved against the slot's responsive box — survives reflow/orientation. Distinct from the legacy `animations` (AnimationPath[] over absolute x/y). Absent → no animation. P3-anim-1 supports the 'fade' enter preset; further presets land per the P3-anim phasing in project_responsive_layout_system memory. */
  slotAnimations?: Object | undefined;
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
  /** How the dialog renders in responsive mode. 'conversation' (default) lays text on one side and choices on the other — the natural back-and-forth feel. 'stacked' keeps text on top, choices below. 'chat-scroll' is a scrollable chat history. 'chat-bubble' shows one bubble at a time. 'custom' reads slotIntent anchors for fine-grained author control. Lives in the LEFT-side VE settings panel (it's a layout property, not a content property). */
  layoutTemplate?: string | undefined;
  /** DEPRECATED in v0.9.62 — use layoutTemplate instead. Existing projects auto-migrate at load: 'positioned' → 'conversation', 'chat-scroll' → 'chat-scroll', 'chat-bubble' → 'chat-bubble'. The field is kept in the schema only so legacy ZIPs deserialize without warnings; new projects should never write to it. */
  presentationMode?: string | undefined;
  /** Show character avatars in chat mode */
  showAvatars?: boolean | undefined;
  /** Delay in seconds before NPC responds in chat mode (shows typing indicator) */
  responseDelay?: number | undefined;
  /** Displays per-node speaker names as labels during dialog */
  showSpeaker?: boolean | undefined;
  /** How the background image fits the stage. 'contain' (default) preserves the full image with letterboxed bars when aspect ratios differ; 'cover' fills the stage and may crop the image's edges. Edited in the VE left sidebar (Background section), not the inspector. */
  spatialFit?: string | undefined;
}

/**
 * Multi Choice - NPC prompt + several response buttons. Simpler than DialogTree (no nesting, single level), more powerful than ConversationChoice (full per-choice effects + conditions).
 * Category: visible
 * Connection Type: multiple
 */
export interface MultiChoiceParameters {
  /** Prompt text shown above the choice buttons */
  question: string;
  /** Array of choice buttons. Each has its own target + per-choice effect/condition bundle (same surface as DialogTree's choices). */
  choices: MultiChoiceOption[];
  /** Delay in seconds before the choices fade in (lets the player read the prompt first) */
  choiceDelay?: number | undefined;
  /** Block and dim choices that lead to previously visited beats */
  markVisited?: boolean | undefined;
  /** How the beat renders in responsive mode. 'stacked' (default) is the standard question-on-top / buttons-below layout. 'conversation' lays the prompt and buttons side-by-side — useful when the prompt has a speaker and reads like NPC dialogue. 'chat-bubble' renders as a single bubble (NPC says X, player picks). 'custom' reads slotIntent anchors for fine-grained author control. NOTE: 'chat-scroll' is intentionally not exposed here — MultiChoice is single-screen by design; for multi-turn scrollable chat use DialogTree. Lives in the LEFT-side VE settings panel. */
  layoutTemplate?: string | undefined;
  /** Who speaks the prompt (for TTS voice routing and optional display) */
  speaker?: string | undefined;
  /** Show speaker name to the interactor */
  showSpeaker?: boolean | undefined;
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
  /** How the background image fits the stage. 'contain' (default) preserves the full image with letterboxed bars when aspect ratios differ; 'cover' fills the stage and may crop the image's edges. Edited in the VE left sidebar (Background section), not the inspector. */
  spatialFit?: string | undefined;
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
  /** How the background image fits the stage. 'contain' (default) preserves the full image with letterboxed bars when aspect ratios differ; 'cover' fills the stage and may crop the image's edges. Edited in the VE left sidebar (Background section), not the inspector. */
  spatialFit?: string | undefined;
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
  /** Direct URL/path to video file (legacy — prefer videoAssetId) */
  videoFile?: string | undefined;
  /** Asset ID referencing the video file */
  videoAssetId?: string | undefined;
  /** Start playing automatically */
  autoplay?: boolean | undefined;
  /** Show video controls */
  controls?: boolean | undefined;
  /** Allow skipping video */
  skipButton?: boolean | undefined;
  /** Show captions/subtitles when cues are present */
  captionsEnabled?: boolean | undefined;
  /** Caption/subtitle cues (start/end in seconds + text). Cue text is translated by the normal translation system, so subtitles come free in every language. */
  captions?: Object[] | undefined;
  /** Per-language alternate video: { langCode: { videoAssetId } }. Applied at export/preview time; falls back to the base video for languages without an override. */
  videoTranslations?: Object | undefined;
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
  /** Soft responsive layout intent for slot-mode rendering (per-slot preferredLines / anchor / gap). Visual-Editor managed; NEVER serialized as baked locations[] — a beat carrying slotIntent and no locations[] stays responsive (slot mode). Absent → pure flow. */
  slotIntent?: Object | undefined;
  /** Responsive motion intent for slot-mode rendering (P3-anim). Per-slot enter/exit/emphasis presets resolved against the slot's responsive box — survives reflow/orientation. Distinct from the legacy `animations` (AnimationPath[] over absolute x/y). Absent → no animation. P3-anim-1 supports the 'fade' enter preset; further presets land per the P3-anim phasing in project_responsive_layout_system memory. */
  slotAnimations?: Object | undefined;
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
  /** Alias of restartConnection — accepted because AI generation commonly emits this name. Both shapes resolve to the restart target. */
  connection?: Connection | undefined;
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
 * Set Variable/Counter - Modify story variables or counters (or fictional-time clock)
 * Category: invisible
 * Connection Type: single
 */
export interface SetVariableParameters {
  /** Discriminator: 'variable' | 'counter' | 'fictionalTime'. Drives which fields below are read at runtime. */
  type: string;
  /** Variable or counter name (ignored when type='fictionalTime' — the runtime targets the project's fictional-time clock instead) */
  name: string;
  /** type='counter' only. Counter owner. OMIT for a story-global counter (default — world/plot tallies). Set to a Character id/name to scope the counter to that character's per-character store (per-character stats like health/trust). Unlike inventory there is no implicit 'player' default — absence means global. Ignored for type='variable'|'fictionalTime'. */
  character?: string | undefined;
  /** New value (string for variables, number for counters). Prefix with '=' (spreadsheet convention) to compute an arithmetic expression at runtime, e.g. "= (var1 + var2) / 100" — supports + - * / parentheses, unary minus, numeric literals, and variable/counter references (plain identifiers like score, plus ${name}, $name$, {name}; names resolve against variables first, then counters; character-scoped counters via owner.counter, e.g. alice.trust). If evaluation fails (unknown reference, division by zero, syntax error) the raw string is stored unchanged. Without the leading '=' nothing is evaluated — '5+3' stays the literal string '5+3'. For type='fictionalTime' with operation='advance'/'subtract', this is the magnitude (paired with timeUnit). Empty/zero is a valid value. */
  value: any;
  /** Variable: 'set'. Counter: 'set' | 'change' | 'add' | 'subtract' | 'multiply'. fictionalTime: 'set' | 'advance' | 'subtract'. */
  operation?: string | undefined;
  /** Next beat after variable/counter is set */
  connection: Connection;
  /** type='fictionalTime' / operation='set' only. Year component (e.g. 2024). */
  timeYear?: number | undefined;
  /** type='fictionalTime' / operation='set' only. Month component (1-12). */
  timeMonth?: number | undefined;
  /** type='fictionalTime' / operation='set' only. Day component (1-31). */
  timeDay?: number | undefined;
  /** type='fictionalTime' / operation='set' only. Hour component (0-23). */
  timeHour?: number | undefined;
  /** type='fictionalTime' / operation='set' only. Minute component (0-59). */
  timeMinute?: number | undefined;
  /** type='fictionalTime' / operation='advance'|'subtract' only. Unit of advance: 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years'. */
  timeUnit?: string | undefined;
}

/**
 * Set GPS Location - Write a named GPS point set into story state — capture the player's current position, set explicit coordinates, or randomly scatter points around a center. A GpsLocation beat can then geofence the named set dynamically (bind an entry to the same name), and a Condition beat can react to it.
 * Category: invisible
 * Connection Type: single
 */
export interface SetGpsLocationParameters {
  /** 'capture' pins the player's current position; 'explicit' stores author-entered coordinates; 'scatter' randomly distributes points within a radius of a center at play time; 'preset' writes a set of points you place and review on a map at authoring time (optionally auto-generated onto streets/parks). */
  mode: string;
  /** preset mode: author-curated GPS points ({ lat, lng, radiusMeters? }) placed and reviewed on a map, optionally auto-generated onto walkable streets/parks. Written verbatim at play time — no network or sensor needed. */
  presetPoints?: Object[] | undefined;
  /** Name of the GPS point set to write. Reference this name from a GpsLocation entry (its 'pointName') to geofence these points. */
  pointName: string;
  /** Latitude (WGS84). Used by 'explicit' mode, and by 'scatter' when the center source is explicit coordinates. */
  lat?: number | undefined;
  /** Longitude (WGS84). Used by 'explicit' mode, and by 'scatter' when the center source is explicit coordinates. */
  lng?: number | undefined;
  /** Optional geofence radius (metres) stamped on each stored point; falls back to the GpsLocation beat's radius when omitted. */
  pointRadiusMeters?: number | undefined;
  /** scatter mode: how many points to generate. */
  count?: number | undefined;
  /** scatter mode: maximum distance (metres) from the center to scatter points. */
  scatterRadiusMeters?: number | undefined;
  /** scatter mode: where the scatter is centered. */
  centerSource?: string | undefined;
  /** scatter mode with center source 'point': the name of the point set to center on (uses its first point). */
  centerPointName?: string | undefined;
  /** scatter mode: 'uniform' places points by pure math (offline, may land inside buildings/water); 'walkable' snaps points onto real streets, paths, and parks via OpenStreetMap (needs a network connection at play time; falls back to uniform when coverage is thin or the lookup fails). */
  placement?: string | undefined;
  /** Fallback latitude used when the sensor is unavailable / permission denied (capture, or scatter-from-current). */
  fallbackLat?: number | undefined;
  /** Fallback longitude used when the sensor is unavailable / permission denied (capture, or scatter-from-current). */
  fallbackLng?: number | undefined;
  /** Next beat after the points are stored */
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
  /** Soft responsive layout intent for slot-mode rendering (per-slot preferredLines / anchor / gap). Visual-Editor managed; NEVER serialized as baked locations[] — a beat carrying slotIntent and no locations[] stays responsive (slot mode). Absent → pure flow. */
  slotIntent?: Object | undefined;
  /** Responsive motion intent for slot-mode rendering (P3-anim). Per-slot enter/exit/emphasis presets resolved against the slot's responsive box — survives reflow/orientation. Distinct from the legacy `animations` (AnimationPath[] over absolute x/y). Absent → no animation. P3-anim-1 supports the 'fade' enter preset; further presets land per the P3-anim phasing in project_responsive_layout_system memory. */
  slotAnimations?: Object | undefined;
  /** Text to display */
  text: string;
  /** Optional array of text variations. Combined with main text for random selection at runtime. */
  textVariations?: String[] | undefined;
  /** Display duration in SECONDS (fractional allowed, e.g. 0.5). Set proportional to text length — roughly ceil(words / 200 * 60 * 1.5), minimum ~3s. Legacy projects storing milliseconds (value > 60) are auto-migrated to seconds on load. */
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
  /** Number of items to add/remove/transfer. Can be a number or variable name (e.g., $goldAmount). The runtime accepts both forms; the schema declares string because it's the most general (variable refs need to be strings). The pipeline coerces emitted numbers/booleans to string so AI output validates without per-field carve-outs. */
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
 * Update Affect - Nudge a character's mood and/or strengthen a sentiment toward another entity. The runtime clamps each axis and sentiment strength to [-1, 1].
 * Category: invisible
 * Connection Type: single
 */
export interface UpdateAffectParameters {
  /** Character whose affect changes */
  character: string;
  /** Pushes the character's mood pleasanter (positive) or unpleasanter (negative). Runtime clamps the resulting mood to [-1, 1]. */
  moodValenceDelta?: number | undefined;
  /** Pushes the character calmer (negative) or more excited (positive). Clamped to [-1, 1]. */
  moodArousalDelta?: number | undefined;
  /** Entity the sentiment is directed at (Character.id, item name, beat id, or any author tag). */
  sentimentTarget?: string | undefined;
  /** Emotion label (e.g. trust, fear, anger, joy, pride, shame). Free-text — no enforced palette. */
  sentimentEmotion?: string | undefined;
  /** Adds to (or subtracts from) the existing (target, emotion) sentiment strength. Negative values weaken or invert the feeling. Clamped to [-1, 1]. */
  sentimentDelta?: number | undefined;
  /** Emotion name to fire (e.g. joy, anger, fear). When the emotion is in the project's emotion palette, mood is auto-nudged by its weights — no need to also set mood deltas above. Unknown names still update the level but skip the mood side-effect so typos are surfaced. */
  emotion?: string | undefined;
  /** Intensity delta for the named emotion. Positive bumps the emotion; negative reduces it. Clamped to [0, 1] post-add. */
  emotionDelta?: number | undefined;
  /** Next beat after the affect update */
  connection: Connection;
  /** v0.9.45+ canonical shape — an ordered list of Effects (mood nudge, sentiment delta, emotion fire, goal status, variant switch, bookmark, …). When present, this replaces the legacy single-row fields above (moodValenceDelta, sentimentTarget, …). The migration helpers in core promote legacy shapes into this array on load. */
  effects?: Effect[] | undefined;
}

/**
 * GPS Location - Show one or more GPS-anchored locations on a map. Each location has its own next-beat target and Effects bundle (counters, mood, sentiment, etc) — the first location the player crosses into (or out of) wins, like a movement choice on a map. The runtime probes GPS permission via ensureXRPermission and falls back per the project's LocationSettings.onPermissionDenied policy.
 * Category: xr
 * Connection Type: multiple
 */
export interface GpsLocationParameters {
  /** Behaviour mode: 'display' shows the map with a continue button (no waiting); 'trigger-on-arrival' resolves when the player enters the radius; 'trigger-on-departure' resolves when the player leaves it. */
  mode: string;
  /** Target latitude in degrees (WGS84). E.g. 51.5074 for London. */
  targetLat: number;
  /** Target longitude in degrees (WGS84). E.g. -0.1278 for London. */
  targetLng: number;
  /** Proximity radius in metres. Falls back to the project's LocationSettings.defaultProximityRadiusM when unset, then 25m. */
  radiusMeters?: number | undefined;
  /** Instructional text shown over the map (e.g. 'Walk to the meeting point at the fountain'). */
  text?: string | undefined;
  /** Continue button label (display mode). */
  buttonText?: string | undefined;
  /** Optional skip / cancel button label. Lets the player exit the beat without waiting for arrival. */
  cancelButtonText?: string | undefined;
  /** Optional timeout in milliseconds. The beat resolves with 'timeout' if no arrival / departure / skip happens within this window. */
  timeoutMs?: number | undefined;
  /** Visual style for the map. */
  mapStyle?: string | undefined;
  /** Whether to show the player's current location on the map. */
  showPlayerMarker?: boolean | undefined;
  /** Next beat after the GPS beat resolves (regardless of how — arrival, timeout, skip). */
  connection: Connection;
}

/**
 * Indoor Location - Show a floor plan for this beat with one or more target Bluetooth beacons. Each beat carries its own floor plan + dimensions, so different beats can show different rooms or scales. Each location has its own (x, y) on this floor plan, beaconUuid, target beat, and Effects bundle. The first beacon the player walks within radius wins.
 * Category: xr
 * Connection Type: multiple
 */
export interface IndoorLocationParameters {
  /** Behaviour mode: 'display' shows the floor plan with a continue button; 'trigger-on-arrival' resolves when the player enters the radius around the target beacon; 'trigger-on-departure' resolves when the player leaves it. */
  mode: string;
  /** UUID of the target beacon — must match a beacon configured in Project Settings → Location & XR → Indoor venue → Beacons. */
  targetBeaconUuid: string;
  /** Proximity radius in metres. Falls back to LocationSettings.defaultProximityRadiusM when unset, then 5m (room-scale default — indoor is tighter than outdoor). */
  radiusMeters?: number | undefined;
  /** Instructional text shown over the floor plan (e.g. 'Find the artefact in the east wing'). */
  text?: string | undefined;
  /** Continue button label (display mode). */
  buttonText?: string | undefined;
  /** Optional skip / cancel button label. */
  cancelButtonText?: string | undefined;
  /** Optional timeout in milliseconds. Beat resolves with 'timeout' if no arrival / departure / skip within this window. */
  timeoutMs?: number | undefined;
  /** Next beat after the indoor-location beat resolves. */
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
  /** Variable name to store the input (when saveToType='variable'). AI sometimes emits 'variableName' — pipeline aliases it to 'variable'. */
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
 * Input Image - Lets the player submit a photo (camera or upload). The image is analyzed by AI and the resulting text is stored in a variable.
 * Category: visible
 * Connection Type: single
 */
export interface InputImageParameters {
  /** Question or instruction shown to the player */
  prompt: string;
  /** Instruction for the AI describing what to extract from the image. Not shown to the player; stays in the source language. */
  analysisPrompt: string;
  /** Variable name that receives the AI's answer text */
  saveTo: string;
  /** How the player provides the image */
  imageSource?: string | undefined;
  /** Submit button label */
  buttonText?: string | undefined;
  /** Skip button label (lets the player continue without an image) */
  cancelButtonText?: string | undefined;
  /** Stored in the variable when AI is unavailable, fails, or the player skips */
  fallbackValue?: string | undefined;
  /** Maximum AI response time in ms before falling back */
  timeout?: number | undefined;
  /** Who speaks this beat's text (for TTS voice and optional display) */
  speaker?: string | undefined;
  /** Show speaker name to the interactor */
  showSpeaker?: boolean | undefined;
  /** Target beat after the image is analyzed (or the player skips) */
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
 * QR Scan - Opens the camera and waits for the player to scan a QR code. The decoded string is saved to a variable, then the beat branches.
 * Category: visible
 * Connection Type: single
 */
export interface QrScanParameters {
  /** Instruction shown above the camera preview */
  prompt: string;
  /** Variable name to receive the decoded value (used when the QR is not an asaps:// URI, or interpretAsapsUri is off) */
  saveTo: string;
  /** When true and the scanned code is a valid asaps:// URI (e.g. asaps://beat/<id>, asaps://variable/<name>/<value>, asaps://inventory/add/<item>), apply it directly instead of just saving to a variable. Non-asaps codes still save to the variable. */
  interpretAsapsUri?: boolean | undefined;
  /** Which camera to use */
  facing?: string | undefined;
  /** Optional regex patterns — only codes that match resolve. Leave empty to accept any code. */
  matchPatterns?: String[] | undefined;
  /** Authoring metadata only: beat IDs that printed asaps://beat/<id> QR codes for this beat jump to. NOT a runtime route (the scanned code carries the jump) — these are declared in the QR generator so the flowchart can draw the otherwise-invisible jumps as dashed edges. No generic inspector control; managed by the QR generator panel. */
  qrJumpTargets?: String[] | undefined;
  /** Small helper text shown near the scan target */
  helperText?: string | undefined;
  /** Cancel/skip button label */
  cancelButtonText?: string | undefined;
  /** Who speaks this beat's text (for TTS voice and optional display) */
  speaker?: string | undefined;
  /** Show speaker name to the interactor */
  showSpeaker?: boolean | undefined;
  /** Target beat after a code is scanned (or the player cancels) */
  connection: Connection;
}

/**
 * AR Scene - Augmented-reality scene with marker tracking. The player aims the camera at a printed marker; overlay anchors (text, image, tappable cards) attach to the marker. Each anchor's tap routes through an asaps:// URI or target beat id, so authors get treasure-hunt / pick-the-clue mechanics without scripting.
 * Category: visible
 * Connection Type: multiple
 */
export interface ArBeatParameters {
  /** Instruction shown above the AR view */
  prompt?: string | undefined;
  /** How anchors are placed in the scene. Phase 1: only 'marker' is implemented (image-target tracking via MindAR). 'world' and 'face' are reserved for Phase 2. */
  trackingMode?: string | undefined;
  /** Asset ID of a pre-compiled .mind file produced by the MindAR compiler (https://hiukim.github.io/mind-ar-js-doc/tools/compile/). Used as the image target the camera tracks. */
  markerAssetId?: string | undefined;
  /** Overlay anchors attached to the marker. Each anchor has a label, optional sprite, and an onTap target (asaps:// URI or beat id). */
  anchors?: Object[] | undefined;
  /** Cancel button label */
  cancelButtonText?: string | undefined;
  /** Target beat when the player skips, when permission is denied, or when no anchor is tapped */
  fallbackTarget?: string | undefined;
  /** Who speaks this beat's text */
  speaker?: string | undefined;
  /** Show speaker name to the interactor */
  showSpeaker?: boolean | undefined;
}

/**
 * Web View - Embed a live external web page. The player interacts until they hit the Done button, navigate to an exit URL pattern, or post a result back from the page.
 * Category: visible
 * Connection Type: single
 */
export interface WebViewParameters {
  /** URL to embed. NOTE: many public sites block iframe embedding (X-Frame-Options / CSP frame-ancestors). Electron desktop bypasses this; the web/PW preview cannot. */
  url: string;
  /** Optional instruction shown above the embedded page */
  prompt?: string | undefined;
  /** Optional regex — when the embedded page navigates to a URL matching this pattern, the beat advances automatically. Iframe origin restrictions may prevent detecting cross-origin navigation; Electron <webview> can observe it. */
  exitUrlPattern?: string | undefined;
  /** Story variable names to inject into the URL as a hash fragment (e.g. #userName=Alice). Lets the embedded page read story state without an API call. */
  passContext?: String[] | undefined;
  /** Variable to receive a value posted from the page via postMessage({asaps:'result', value: ...}). Empty = ignore postMessage. */
  saveTo?: string | undefined;
  /** Label for the manual exit button */
  doneButtonText?: string | undefined;
  /** Who speaks this beat's text */
  speaker?: string | undefined;
  /** Show speaker name to the interactor */
  showSpeaker?: boolean | undefined;
  /** Target beat after the player exits the web view */
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
  hyperlinks: Object[];
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
  /** Soft responsive layout intent for slot-mode rendering (per-slot preferredLines / anchor / gap). Visual-Editor managed; NEVER serialized as baked locations[] — a beat carrying slotIntent and no locations[] stays responsive (slot mode). Absent → pure flow. */
  slotIntent?: Object | undefined;
  /** Responsive motion intent for slot-mode rendering (P3-anim). Per-slot enter/exit/emphasis presets resolved against the slot's responsive box — survives reflow/orientation. Distinct from the legacy `animations` (AnimationPath[] over absolute x/y). Absent → no animation. P3-anim-1 supports the 'fade' enter preset; further presets land per the P3-anim phasing in project_responsive_layout_system memory. */
  slotAnimations?: Object | undefined;
  /** Data source type: 'api' for direct API calls, 'ai-query' for AI-powered search */
  sourceType: string;
  /** API URL to fetch (supports ${variable} interpolation) */
  apiUrl?: string | undefined;
  /** Query parameters for the API */
  apiParams?: Object | undefined;
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
  categories: Object[];
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
  /** How the dialog renders. 'stacked' keeps the NPC text on top with choices below (visual-novel). 'conversation' lays text on one side and choices on the other. 'chat-scroll' is a scrollable chat history. 'chat-bubble' shows one bubble at a time. 'custom' reads slotIntent anchors. Lives in the LEFT-side VE settings panel. */
  layoutTemplate?: string | undefined;
  /** Exit targets for conversation outcomes */
  exitTargets: Object[];
  /** Delay before showing choices */
  choiceDelay?: number | undefined;
}

/**
 * AI Summary - Generate a narrative summary of the player's journey
 * Category: visible
 * Connection Type: single
 */
export interface AiSummaryParameters {
  /** Soft responsive layout intent for slot-mode rendering (per-slot preferredLines / anchor / gap). Visual-Editor managed; NEVER serialized as baked locations[] — a beat carrying slotIntent and no locations[] stays responsive (slot mode). Absent → pure flow. */
  slotIntent?: Object | undefined;
  /** Responsive motion intent for slot-mode rendering (P3-anim). Per-slot enter/exit/emphasis presets resolved against the slot's responsive box — survives reflow/orientation. Distinct from the legacy `animations` (AnimationPath[] over absolute x/y). Absent → no animation. P3-anim-1 supports the 'fade' enter preset; further presets land per the P3-anim phasing in project_responsive_layout_system memory. */
  slotAnimations?: Object | undefined;
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
  /** Alias of restartTarget — accepted because AI generation commonly emits this name. Both shapes resolve to the restart target. */
  connection?: Connection | undefined;
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
  /** Soft responsive layout intent for slot-mode rendering (per-slot preferredLines / anchor / gap). Visual-Editor managed; NEVER serialized as baked locations[] — a beat carrying slotIntent and no locations[] stays responsive (slot mode). Absent → pure flow. */
  slotIntent?: Object | undefined;
  /** Responsive motion intent for slot-mode rendering (P3-anim). Per-slot enter/exit/emphasis presets resolved against the slot's responsive box — survives reflow/orientation. Distinct from the legacy `animations` (AnimationPath[] over absolute x/y). Absent → no animation. P3-anim-1 supports the 'fade' enter preset; further presets land per the P3-anim phasing in project_responsive_layout_system memory. */
  slotAnimations?: Object | undefined;
  /** Context/instruction for AI (e.g., "A merchant's reply when the player can't afford the item") */
  prompt: string;
  /** Specific variables to include in AI context (leave empty for all) */
  contextVariables?: String[] | undefined;
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
  contextVariables?: String[] | undefined;
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
  /** Minimum display duration in SECONDS. Legacy ms values (> 60) are auto-migrated to seconds on load. */
  minDuration?: number | undefined;
  /** Maximum display duration in SECONDS. Raised from the old 15s — a single dense paragraph (~55 words) needs ~25s, which the old ceiling clipped. Legacy ms values (> 60) are auto-migrated to seconds on load. */
  maxDuration?: number | undefined;
  /** Target beat after duration expires */
  connection?: Connection | undefined;
}

/**
 * AI Conversation - Real-time AI conversation with author-defined steering rules. Each NPC response is generated fresh based on full conversation history and active directions.
 * Category: visible
 * Connection Type: multiple
 */
export interface AiConversationParameters {
  /** How the conversation is shown. 'Chat' = a scrolling messaging-app panel (reflows, best for responsive/mobile). 'Dialog' = one exchange at a time in a positioned NPC dialog box with a text input below it, like a Dialog Tree — supports fixed-canvas placement. */
  presentation?: string | undefined;
  /** Scene description for the conversation */
  scenario: string;
  /** Name of the NPC the player is talking to */
  npcName: string;
  /** NPC personality traits and behavior guidelines */
  npcPersonality?: string | undefined;
  /** NPC's opening line (if empty, AI generates one) */
  openingLine?: string | undefined;
  /** Conversation directions: trigger + action pairs that steer the conversation dynamically */
  directions?: Object[] | undefined;
  /** Maximum conversation turns before fallback exit */
  maxTurns?: number | undefined;
  /** Target beat when max turns reached */
  fallbackExitTarget?: Connection | undefined;
  /** Include player variables in AI context */
  includeVariables?: boolean | undefined;
  /** Include player inventory in AI context */
  includeInventory?: boolean | undefined;
  /** Include visited beats in AI context */
  includeVisitedBeats?: boolean | undefined;
  /** Include rich choice history in AI context */
  includeChoiceHistory?: boolean | undefined;
  /** Show microphone button for voice input */
  enableVoiceInput?: boolean | undefined;
  /** Language for speech recognition (BCP 47, e.g., 'en-US') */
  language?: string | undefined;
  /** Custom system instructions for the AI */
  systemInstructions?: string | undefined;
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
  | 'multiChoice'
  | 'movementChoice'
  | 'pickProp'
  | 'videoBeat'
  | 'endScreen'
  | 'panorama'
  | 'setVariable'
  | 'setGpsLocation'
  | 'conditionBeat'
  | 'durScreen'
  | 'randomTarget'
  | 'setTimer'
  | 'addRemoveInventory'
  | 'updateAffect'
  | 'gpsLocation'
  | 'indoorLocation'
  | 'inputText'
  | 'inputImage'
  | 'keypad'
  | 'qrScan'
  | 'arBeat'
  | 'webView'
  | 'hyperText'
  | 'onlineContent'
  | 'aiCondition'
  | 'aiDialogTree'
  | 'aiSummary'
  | 'aiInfoText'
  | 'aiDurScreen'
  | 'aiConversation';

/**
 * Map of beat type name to its parameter interface
 */
export interface BeatParameterMap {
  'titleScreen': TitleScreenParameters;
  'infoText': InfoTextParameters;
  'dialogTree': DialogTreeParameters;
  'multiChoice': MultiChoiceParameters;
  'movementChoice': MovementChoiceParameters;
  'pickProp': PickPropParameters;
  'videoBeat': VideoBeatParameters;
  'endScreen': EndScreenParameters;
  'panorama': PanoramaParameters;
  'setVariable': SetVariableParameters;
  'setGpsLocation': SetGpsLocationParameters;
  'conditionBeat': ConditionBeatParameters;
  'durScreen': DurScreenParameters;
  'randomTarget': RandomTargetParameters;
  'setTimer': SetTimerParameters;
  'addRemoveInventory': AddRemoveInventoryParameters;
  'updateAffect': UpdateAffectParameters;
  'gpsLocation': GpsLocationParameters;
  'indoorLocation': IndoorLocationParameters;
  'inputText': InputTextParameters;
  'inputImage': InputImageParameters;
  'keypad': KeypadParameters;
  'qrScan': QrScanParameters;
  'arBeat': ArBeatParameters;
  'webView': WebViewParameters;
  'hyperText': HyperTextParameters;
  'onlineContent': OnlineContentParameters;
  'aiCondition': AiConditionParameters;
  'aiDialogTree': AiDialogTreeParameters;
  'aiSummary': AiSummaryParameters;
  'aiInfoText': AiInfoTextParameters;
  'aiDurScreen': AiDurScreenParameters;
  'aiConversation': AiConversationParameters;
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

