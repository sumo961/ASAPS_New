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

const hasCondition = (c: Connection): boolean =>
  Array.isArray(c.condition) ? c.condition.length > 0 : !!c.condition;

/**
 * Every link the debug tools follow out of a beat: its own connections, then
 * the auto-advance target, requirement fallbacks, a Set Timer's "time runs
 * out" target and a QR scan's codes. One of these is skipped only when an
 * unconditional link already goes to the same beat.
 */
export function analysisLinks(beat: Beat): Connection[] {
  const out: Connection[] = [...beat.getConnections()];
  const add = (targetId: unknown, label: string): void => {
    if (typeof targetId !== 'string' || !targetId || out.some((c) => c.targetId === targetId && !hasCondition(c))) return;
    out.push({ targetId, label });
  };
  add(beat.defaultTarget, 'default');
  const requires = (beat as any).requires as any[] | undefined;
  if (Array.isArray(requires)) for (const req of requires) add(req?.fallbackTarget, 'requires-fallback');
  if (beat.type === 'setTimer' || beat.type === 'qrScan') {
    const params = beat.getParameters?.() ?? {};
    add(params.timerTarget, 'Timer runs out');
    if (Array.isArray(params.qrJumpTargets)) for (const t of params.qrJumpTargets) add(t, 'QR code');
  }
  return out;
}
