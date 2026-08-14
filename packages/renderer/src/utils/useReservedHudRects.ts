/**
 * Reserved HUD rects, delivered as a subscription rather than a prop read.
 *
 * The host computes its screen-HUD layout in a React effect — after the paint
 * that triggered it — while the renderer paints a beat the moment the beat
 * changes. A plain setter therefore stores the rects *after* the render that
 * needed them, and nothing re-renders afterwards: the reservation silently
 * applies one beat late, or never. It looked like it worked whenever some
 * unrelated state change happened to force a second render, which is the worst
 * kind of bug to test — it passes when you poke at it.
 *
 * `ReactRenderer` already solved this shape for timer-HUD state with an
 * initial-value-plus-subscribe pair; this is the same contract for HUD rects.
 */
import { useEffect, useState } from 'react';
import type { ReservedHudRect } from '../components/PositionedBeatView';

export function useReservedHudRects(
  initial: ReservedHudRect[] | undefined,
  onSubscribe: ((listener: (rects: ReservedHudRect[] | undefined) => void) => () => void) | undefined,
): ReservedHudRect[] | undefined {
  const [rects, setRects] = useState<ReservedHudRect[] | undefined>(initial);

  // Without a subscription the prop is the only source, so track it directly.
  useEffect(() => {
    if (!onSubscribe) setRects(initial);
  }, [initial, onSubscribe]);

  useEffect(() => {
    if (!onSubscribe) return;
    return onSubscribe(setRects);
  }, [onSubscribe]);

  return onSubscribe ? rects : initial;
}
