/**
 * graphStyle — the single source of the graph's per-beat-type accents and
 * layout constants.
 *
 * These tables were previously duplicated (with drift) across BeatNode,
 * GraphEditor and ClusterContainerNode; the drift was one of the reasons the
 * hand-rendered cluster interior looked subtly different from the real graph.
 * BeatPalette keeps its own schema-driven scheme (per-type overrides +
 * category fallback) — that one is the author-facing legend, not a node
 * accent table.
 */

/** Node accent color per beat type (left border / handles). */
export const beatTypeColors: Record<string, string> = {
  titleScreen: '#3b82f6',
  infoText: '#10b981',
  dialogTree: '#8b5cf6',
  conversationChoice: '#a855f7',
  movementChoice: '#f59e0b',
  pickProp: '#ef4444',
  videoBeat: '#ec4899',
  endScreen: '#6366f1',
  setVariable: '#64748b',
  conditionBeat: '#06b6d4',
};

/** Fallback accent for beat types without an entry above. */
export const DEFAULT_BEAT_COLOR = '#94a3b8';

/** Node icon per beat type. */
export const beatTypeIcons: Record<string, string> = {
  // Visible beats
  titleScreen: '🎬',
  infoText: '📝',
  dialogTree: '🌳',
  conversationChoice: '💬',
  multiChoice: '🔘',
  chooseCharacter: '🎭',
  freeLayout: '🧩',
  movementChoice: '🚶',
  pickProp: '🎒',
  videoBeat: '🎥',
  durScreen: '⏳',
  inputText: '✏️',
  hyperText: '🔗',
  endScreen: '🏁',
  panorama: '🌐',
  // Logic beats
  setVariable: '🔧',
  conditionBeat: '❓',
  condition: '❓',
  randomTarget: '🎲',
  setTimer: '⏱️',
  addRemoveInventory: '📦',
  // AI beats
  onlineContent: '🌐',
  aiDialogTree: '🤖',
  aiCondition: '🧠',
  aiSummary: '📊',
};

export const DEFAULT_BEAT_ICON = '📄';

/** Beat node footprint on the graph canvas. */
export const NODE_WIDTH = 160;
export const NODE_HEIGHT = 80;

/** Height of the cluster frame's header bar. Stored in-container beat
 *  positions are relative to the CONTENT area below this bar. */
export const CLUSTER_HEADER_H = 40;

/** Grid snap for in-cluster beat positions. */
export const GRID_SNAP = 20;

/** Minimum cluster frame size. One constant for the frame's clamp AND
 *  clusterAutosize's grow-only floor — they disagreed (500 vs 400) before
 *  the unification. */
export const MIN_CLUSTER_W = 400;
export const MIN_CLUSTER_H = 300;

/**
 * How a link looks in the flowchart, by its kind: the `via` the shared link
 * walk (core utils/storyLinks) gives it. The one table for link looks; the
 * edge builder has no beat types of its own. A kind without an entry is drawn
 * as a plain link.
 */
export interface LinkLook {
  stroke: string;
  /** Dash pattern; solid when left out. */
  dash?: string;
  /** Arrowhead colour, when it differs from the default. */
  markerColor?: string;
  animated?: boolean;
  /** A fixed label for the kind, used instead of the link's own. */
  label?: string;
}

export const DEFAULT_LINK_LOOK: LinkLook = { stroke: '#64748b' };

export const linkStyles: Record<string, Partial<LinkLook>> = {
  'condition-true': { stroke: '#22c55e', label: 'True' },
  'condition-false': { stroke: '#ef4444', label: 'False' },
  timer: { stroke: '#ef4444', dash: '5 5', label: 'Timer Target' },
  prop: { stroke: '#10b981' },
  dialog: { stroke: '#3b82f6' },
  hyperlink: { stroke: '#06b6d4' },
  restart: { stroke: '#0d9488', dash: '8 4', markerColor: '#0d9488', label: '↺ Restart' },
  'default-target': { stroke: '#22c55e', dash: '5 5', markerColor: '#22c55e', animated: true },
  requires: { stroke: '#d97706', dash: '3 3', markerColor: '#d97706', label: 'requires' },
  'qr-jump': { stroke: '#a855f7', dash: '4 4', markerColor: '#a855f7', label: 'QR' },
};

/** A link shown only under conditions (a guarded choice): dashed violet. */
export const GUARD_LINK_LOOK: Partial<LinkLook> = { stroke: '#8b5cf6', dash: '6 3' };

/** An old-style condition stored on the link itself. */
export const LEGACY_CONDITION_LINK_LOOK: Partial<LinkLook> = { stroke: '#fbbf24', animated: true };

/** Beat types whose plain links and choices have a look of their own. */
export const beatTypeLinkLooks: Record<string, Partial<LinkLook>> = {
  movementChoice: { stroke: '#f59e0b', dash: '5 5' },
};

/**
 * Kinds that are their own mechanism beside a beat's links (the auto-advance,
 * a requirement's way out, a scanned code): drawn next to a link to the same
 * beat, never merged with it.
 */
export const STANDALONE_LINK_KINDS: ReadonlySet<string> = new Set(['default-target', 'requires', 'qr-jump']);
