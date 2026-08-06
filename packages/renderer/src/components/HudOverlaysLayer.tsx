/**
 * HudOverlaysLayer — the screen-docked HUD overlays (timer / time display +
 * countdown meter) as a standalone layer.
 *
 * PositionedBeatView mounts these HUDs inline for the ABSOLUTE path; the
 * responsive SLOT branch in ReactRenderer renders SlotFlowView directly and
 * historically mounted no HUDs at all — enabled HUDs silently never showed
 * on slot-mode beats. This layer wraps the same components + the same
 * subscription pattern so the slot branch can overlay them.
 *
 * Rendering/gating mirrors PositionedBeatView exactly (keep in sync):
 *   - timer: config && config.enabled
 *   - meter: config && config.enabled && value && showByDefault/override logic
 */
import React from 'react';
import { TimerHudDisplay } from './TimerHudDisplay';
import type { TimerHudConfig } from './TimerHudDisplay';
import { CountdownMeterHud } from './CountdownMeterHud';
import type { CountdownMeterConfig } from './CountdownMeterHud';

/**
 * When the timer HUD and the countdown meter are BOTH docked to the same
 * top/bottom band, the meter auto-stacks past the timer instead of
 * overlapping it (the wide meter used to obscure the time display).
 * Returns the extra edge offset (px) for the meter.
 */
export function meterEdgeOffset(
  timer: TimerHudConfig | undefined,
  meter: CountdownMeterConfig | undefined
): number {
  if (!timer?.enabled || !meter?.enabled) return 0;
  const timerRow = timer.position?.startsWith('top') ? 'top' : 'bottom';
  const meterRow = meter.position?.startsWith('top') ? 'top' : 'bottom';
  if (timerRow !== meterRow) return 0;
  // Same band ≠ collision. Compute the actual horizontal spans (in % of
  // stage width) and offset only when they intersect. The timer's footprint
  // is estimated at ~30% from its corner — a false positive just parks the
  // meter a little lower, a false negative hides the time display.
  const span = (pos: string | undefined, width: number): [number, number] => {
    const side = pos?.split('-')[1] ?? 'center';
    if (side === 'left') return [0, width];
    if (side === 'right') return [100 - width, 100];
    return [50 - width / 2, 50 + width / 2];
  };
  const meterW = Math.min(Math.max(meter.meterWidth ?? 60, 10), 90);
  const [m0, m1] = span(meter.position, meterW);
  const [t0, t1] = span(timer.position, 30);
  if (m1 <= t0 || t1 <= m0) return 0;
  // Approximate rendered timer height: text line + padding + docked gap.
  return Math.round((timer.fontSize ?? 24) * 1.3 + (timer.padding ?? 12) * 2 + 12);
}

export interface HudOverlaysLayerProps {
  timerHudConfig?: TimerHudConfig;
  initialTimerHudState?: { remainingTime: number; totalTime: number };
  onSubscribeTimerHudState?: (
    listener: (state: { remainingTime: number; totalTime: number } | undefined) => void
  ) => () => void;
  initialTimerHudOverrideText?: string;
  onSubscribeTimerHudOverrideText?: (listener: (text: string | undefined) => void) => () => void;
  initialFictionalTimeText?: string;
  onSubscribeFictionalTimeText?: (listener: (text: string | undefined) => void) => () => void;
  countdownMeterConfig?: CountdownMeterConfig;
  countdownMeterValue?: { value: number; min: number; max: number };
  overrideCountdownMeter?: boolean;
  fontScale?: number;
}

export const HudOverlaysLayer: React.FC<HudOverlaysLayerProps> = ({
  timerHudConfig,
  initialTimerHudState,
  onSubscribeTimerHudState,
  initialTimerHudOverrideText,
  onSubscribeTimerHudOverrideText,
  initialFictionalTimeText,
  onSubscribeFictionalTimeText,
  countdownMeterConfig,
  countdownMeterValue,
  overrideCountdownMeter,
  fontScale = 1.0,
}) => {
  const [timerHudTime, setTimerHudTime] = React.useState(initialTimerHudState);
  React.useEffect(() => {
    if (onSubscribeTimerHudState) return onSubscribeTimerHudState(setTimerHudTime);
  }, [onSubscribeTimerHudState]);

  const [overrideText, setOverrideText] = React.useState(initialTimerHudOverrideText);
  React.useEffect(() => {
    if (onSubscribeTimerHudOverrideText) return onSubscribeTimerHudOverrideText(setOverrideText);
  }, [onSubscribeTimerHudOverrideText]);

  const [fictionalTimeText, setFictionalTimeText] = React.useState(initialFictionalTimeText);
  React.useEffect(() => {
    if (onSubscribeFictionalTimeText) return onSubscribeFictionalTimeText(setFictionalTimeText);
  }, [onSubscribeFictionalTimeText]);

  const showTimer = !!(timerHudConfig && timerHudConfig.enabled);
  const showMeter = !!(
    countdownMeterConfig &&
    countdownMeterConfig.enabled &&
    countdownMeterValue &&
    (countdownMeterConfig.showByDefault !== false ? !overrideCountdownMeter : !!overrideCountdownMeter)
  );

  if (!showTimer && !showMeter) return null;

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 90 }}>
      {showTimer && (
        <TimerHudDisplay
          config={timerHudConfig!}
          visible={true}
          remainingTime={timerHudTime?.remainingTime}
          totalTime={timerHudTime?.totalTime}
          displayText={overrideText}
          fictionalTimeText={fictionalTimeText}
          fontScale={fontScale}
        />
      )}
      {showMeter && (
        <CountdownMeterHud
          config={countdownMeterConfig!}
          visible={true}
          edgeOffsetPx={meterEdgeOffset(timerHudConfig, countdownMeterConfig)}
          counterValue={countdownMeterValue!.value}
          counterMin={countdownMeterValue!.min}
          counterMax={countdownMeterValue!.max}
          fontScale={fontScale}
        />
      )}
    </div>
  );
};
