/**
 * What the debug tools follow out of a beat, and which beats branch.
 *
 * Reachability, Path Analysis (the simulator, the constraint and backward
 * analyzers, the path tree) and the Preview's path presets each had their own
 * copy of both answers. The copies drifted from the graph, which draws what
 * utils/storyLinks finds: a Free Layout's buttons were followed first-button-
 * only, a Set Timer's "time runs out" link and a QR scan's codes not at all,
 * so beats the graph showed as connected read as unreachable or never ended a
 * path (2026-10-31). tests/utils/storyLinksParity.test.ts holds the two
 * together, and tests/analysis/choiceBeatTypes.test.ts makes every beat type
 * in the catalogue say whether it branches.
 */
import type { Beat } from '../beats/Beat';
import type { Connection } from '../types';

/**
 * Beats where the player (or the AI, or chance) picks one of several links.
 * The analyzers branch on every link of these; any other beat follows its
 * one link (conditionBeat has its own true/false handling).
 */
export const CHOICE_BEAT_TYPES: ReadonlySet<string> = new Set([
  'multiChoice',
  'chooseCharacter',
  'freeLayout',
  'movementChoice',
  'pickProp',
  'dialogTree',
  'hyperText',
  'panorama',
  'keypad',
  'qrScan',
  'gpsLocation',
  'indoorLocation',
  'arBeat',
  'randomTarget',
  'aiCondition',
  'aiDialogTree',
  'aiConversation',
  // The timer runs out, or the story goes on before it does.
  'setTimer',
  // Legacy (ASML 1.0 imports).
  'conversationChoice',
]);

/** Beats with a single way on (or none). conditionBeat is decided by state, not chosen. */
export const SINGLE_LINK_BEAT_TYPES: ReadonlySet<string> = new Set([
  'titleScreen',
  'infoText',
  'explanation',
  'videoBeat',
  'endScreen',
  'setVariable',
  'setGpsLocation',
  'conditionBeat',
  'durScreen',
  'addRemoveInventory',
  'updateAffect',
  'inputText',
  'inputImage',
  'webView',
  'onlineContent',
  'aiSummary',
  'aiInfoText',
  'aiDurScreen',
]);

export function isChoiceBeatType(type: string | null | undefined): boolean {
  return !!type && CHOICE_BEAT_TYPES.has(type);
}

/** Labels of the links analysisLinks adds beyond a beat's own connections. */
export const EXTRA_LINK = {
  default: 'default',
  requiresFallback: 'requires-fallback',
  timer: 'Timer runs out',
  qr: 'QR code',
} as const;
export const EXTRA_LINK_LABELS: ReadonlySet<string> = new Set(Object.values(EXTRA_LINK));

const hasCondition = (c: Connection): boolean =>
  Array.isArray(c.condition) ? c.condition.length > 0 : !!c.condition;

/**
 * Every link the debug tools follow out of a beat: its own connections, then
 * the auto-advance target, requirement fallbacks, a Set Timer's "time runs
 * out" target and a QR scan's codes. One of these is skipped only when an
 * unconditional link already goes to the same beat.
 */
/**
 * The exits a Dialog Tree reaches with no reply condition on the way. Its
 * links don't carry the replies' conditions (those live in the tree), so a
 * link alone can't say whether it is always offered.
 */
function dialogOpenTargets(tree: any): Set<string> {
  const open = new Set<string>();
  const hasConds = (c: any): boolean => Array.isArray(c?.conditions) && c.conditions.length > 0;
  const walk = (node: any, gated: boolean, depth: number): void => {
    if (!node || typeof node !== 'object' || depth > 20) return;
    if (typeof node.target === 'string' && node.target && !gated) open.add(node.target);
    for (const choice of Array.isArray(node.choices) ? node.choices : []) {
      if (!choice) continue;
      const g = gated || hasConds(choice);
      if (typeof choice.target === 'string' && choice.target && !g) open.add(choice.target);
      if (choice.dialogNode) walk(choice.dialogNode, g, depth + 1);
    }
  };
  walk(tree, false, 0);
  return open;
}

export function analysisLinks(beat: Beat): Connection[] {
  const out: Connection[] = [...beat.getConnections()];
  const dialogOpen = beat.type === 'dialogTree' ? dialogOpenTargets(beat.getParameters?.()?.dialogTree) : null;
  const always = (c: Connection): boolean => !hasCondition(c) && (!dialogOpen || dialogOpen.has(c.targetId));
  const add = (targetId: unknown, label: string): void => {
    if (typeof targetId !== 'string' || !targetId || out.some((c) => c.targetId === targetId && always(c))) return;
    out.push({ targetId, label });
  };
  add(beat.defaultTarget, EXTRA_LINK.default);
  const requires = (beat as any).requires as any[] | undefined;
  if (Array.isArray(requires)) for (const req of requires) add(req?.fallbackTarget, EXTRA_LINK.requiresFallback);
  if (beat.type === 'setTimer' || beat.type === 'qrScan') {
    const params = beat.getParameters?.() ?? {};
    add(params.timerTarget, EXTRA_LINK.timer);
    if (Array.isArray(params.qrJumpTargets)) for (const t of params.qrJumpTargets) add(t, EXTRA_LINK.qr);
  }
  return out;
}
