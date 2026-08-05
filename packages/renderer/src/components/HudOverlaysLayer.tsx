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
          counterValue={countdownMeterValue!.value}
          counterMin={countdownMeterValue!.min}
          counterMax={countdownMeterValue!.max}
          fontScale={fontScale}
        />
      )}
    </div>
  );
};
