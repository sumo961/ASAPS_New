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
