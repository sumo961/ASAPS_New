import React, { useState, useCallback, useEffect } from 'react';
import type {
  SlotIntent,
  SlotIntentResolution,
  SlotAnimations,
  SpatialAnimations,
  SpatialAnimation,
} from '@asaps/core';
import type { SpatialSpec } from '../utils/slotLayout';
import type { RenderThemeSettings } from './PositionedBeatView';
import { SlotFlowView } from './SlotFlowView';

interface SpatialFlowViewProps {
  beatType: string;
  /** Image layer + flow slots (schema-driven, from getSpatialSpec). */
  spatial: SpatialSpec;
  content: Record<string, any>;
  theme?: RenderThemeSettings;
  /** Resolved spatial image URL (beat background / map asset). Falls back to
   *  content[spatial.source] when the renderer didn't resolve one. */
  imageUrl?: string | null;
  /** Painted only when there is no image (true letterbox backdrop). */
  backgroundColor: string;
  slotIntent?: SlotIntent;
  /** Responsive motion intent (P3-anim). Forwarded into the flow layer. */
  slotAnimations?: SlotAnimations;
  /**
   * P3-anim-6 / P3-anim-7 — spatial-layer motion intent (enter + exit).
   * Drives a CSS transform animation on the image-layer subtree only;
   * the flow layer is unaffected (deliberate decoupling — text/buttons
   * must not be uniformly scaled with the picture).
   */
  spatialAnimations?: SpatialAnimations;
  onResolve?: (resolutions: SlotIntentResolution[]) => void;
  onAction: (id: string) => void;
  previewWidth?: number;
  previewCoarse?: boolean;
}

let spatialUidCounter = 0;

/**
 * Resolve a spatial preset to its CSS class + per-animation style
 * (duration / delay / easing / intensity via custom property). Used for
 * BOTH enter and exit — the preset names are the same, the keyframes
 * differ in start/end states so the same preset reads as a coherent
 * arrival vs. departure.
 */
function spatialPhaseStyles(
  anim: SpatialAnimation | undefined,
  phase: 'enter' | 'exit',
): { className?: string; style?: React.CSSProperties } {
  if (!anim) return {};
  const suffix = phase === 'exit' ? 'out' : 'in';
  // Pan/ken-burns names don't suffix with -in/-out; we share keyframes
  // for those across phases since the motion is naturally continuous.
  const presetToClass: Record<string, string | undefined> = {
    'ken-burns': `spatialflow-anim-ken-burns-${suffix}`,
    'zoom-in': `spatialflow-anim-zoom-${suffix === 'in' ? 'in-in' : 'in-out'}`,
    'zoom-out': `spatialflow-anim-zoom-${suffix === 'in' ? 'out-in' : 'out-out'}`,
    'pan-left': `spatialflow-anim-pan-left-${suffix}`,
    'pan-right': `spatialflow-anim-pan-right-${suffix}`,
    'pan-up': `spatialflow-anim-pan-up-${suffix}`,
    'pan-down': `spatialflow-anim-pan-down-${suffix}`,
  };
  const className = presetToClass[anim.preset];
  if (!className) return {};
  const isZoom = anim.preset === 'zoom-in' || anim.preset === 'zoom-out' || anim.preset === 'ken-burns';
  const defaultEasing = isZoom ? 'ease-out' : 'linear';
  const intensity = typeof anim.intensity === 'number' ? anim.intensity : 10;
  const style: React.CSSProperties & Record<string, string | undefined> = {
    animationDuration: `${anim.duration ?? (phase === 'exit' ? 1200 : 6000)}ms`,
    animationDelay: anim.delay ? `${anim.delay}ms` : undefined,
    animationTimingFunction: anim.easing ?? defaultEasing,
    '--spatial-anim-intensity': `${intensity}%`,
    '--spatial-anim-scale': `${1 + intensity / 100}`,
  };
  return { className, style };
}

/**
 * Phase 3 — the spatial composite (Option A).
 *
 * Two DECOUPLED, independently-wrappable layers:
 *
 *  1. **spatial layer** — uniformly-scaled image; P3-anim-6/7 wraps this
 *     subtree with enter/exit CSS transform animations (ken-burns / zoom /
 *     pan) — text/buttons are not affected.
 *  2. **flow layer** — the responsive SlotFlowView; slot-level
 *     enter/exit live here, with their own coordination (P3-anim-4).
 *
 * P3-anim-7: spatial EXIT plays in PARALLEL with the slot exits. We
 * pass `extraExitMs` (the spatial exit duration) AND an `onExitStart`
 * callback into SlotFlowView; when the user clicks, SlotFlowView
 * dispatchAction flips its own phase, calls onExitStart (we flip our
 * local image phase, image-layer exit starts), and the final advance
 * fires after max(slotMax, spatialMax).
 */
export const SpatialFlowView: React.FC<SpatialFlowViewProps> = ({
  beatType,
  spatial,
  content,
  theme,
  imageUrl,
  backgroundColor,
  slotIntent,
  slotAnimations,
  spatialAnimations,
  onResolve,
  onAction,
  previewWidth,
  previewCoarse,
}) => {
  const src: string | null =
    imageUrl ?? (typeof content[spatial.source] === 'string' ? content[spatial.source] : null);
  const objectFit = spatial.fit === 'cover' ? 'cover' : 'contain';

  const scopeRef = React.useRef<string>('');
  if (!scopeRef.current) {
    scopeRef.current = `spatialflow-${++spatialUidCounter}`;
  }
  const scope = scopeRef.current;

  // P3-anim-7 — local image-layer phase. Flips to 'exit' when SlotFlowView
  // reports its own exit start (onExitStart callback). The two layers
  // animate in parallel because they share the same flip moment.
  const [imagePhase, setImagePhase] = useState<'enter' | 'exit'>('enter');
  const handleExitStart = useCallback(() => setImagePhase('exit'), []);

  // P3-anim-9 — editor Test Exit. SlotAnimationsEditor dispatches this
  // CustomEvent so authors can preview the exit without clicking through
  // the beat. SlotFlowView listens to the same event in parallel; both
  // layers flip together, just like the click path.
  useEffect(() => {
    const handler = () => setImagePhase('exit');
    window.addEventListener('asaps:slotAnimTestExit', handler);
    return () => window.removeEventListener('asaps:slotAnimTestExit', handler);
  }, []);

  // Compute spatial exit duration to forward into SlotFlowView so its
  // wait factors in both layers (max of slot exits vs. spatial exit).
  const spatialExit = spatialAnimations?.exit;
  const spatialExitMs = spatialExit
    ? (spatialExit.duration ?? 1200) + (spatialExit.delay ?? 0)
    : 0;

  const spatialAnim =
    imagePhase === 'exit'
      ? spatialPhaseStyles(spatialAnimations?.exit, 'exit')
      : spatialPhaseStyles(spatialAnimations?.enter, 'enter');

  return (
    <div
      data-layer="spatial-composite"
      className={scope}
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        background: src ? '#000' : backgroundColor,
      }}
    >
      <style>{`
        /* P3-anim-6 / 7 — spatial-layer motion. Enter and exit share a
           class-suffix convention: -in, -out, plus pan/ken-burns variants. */
        .${scope} [class*="spatialflow-anim-"] {
          animation-fill-mode: both;
        }
        /* P3-anim-8 — respect prefers-reduced-motion. Spatial animations
           are LONG by design (6000ms ken-burns dwell) so leaving them at
           full duration would be especially hostile to motion-sensitive
           users. Collapse to ~1ms; fill-mode:both holds the end-state. */
        @media (prefers-reduced-motion: reduce) {
          .${scope} [class*="spatialflow-anim-"] {
            animation-duration: 1ms !important;
            animation-delay: 0ms !important;
          }
        }
        /* Enter */
        .${scope} .spatialflow-anim-ken-burns-in { animation-name: spatialflow-ken-burns-in; }
        .${scope} .spatialflow-anim-zoom-in-in   { animation-name: spatialflow-zoom-in-in; }
        .${scope} .spatialflow-anim-zoom-out-in  { animation-name: spatialflow-zoom-out-in; }
        .${scope} .spatialflow-anim-pan-left-in  { animation-name: spatialflow-pan-left-in; }
        .${scope} .spatialflow-anim-pan-right-in { animation-name: spatialflow-pan-right-in; }
        .${scope} .spatialflow-anim-pan-up-in    { animation-name: spatialflow-pan-up-in; }
        .${scope} .spatialflow-anim-pan-down-in  { animation-name: spatialflow-pan-down-in; }
        /* Exit */
        .${scope} .spatialflow-anim-ken-burns-out { animation-name: spatialflow-ken-burns-out; }
        .${scope} .spatialflow-anim-zoom-in-out   { animation-name: spatialflow-zoom-in-out; }
        .${scope} .spatialflow-anim-zoom-out-out  { animation-name: spatialflow-zoom-out-out; }
        .${scope} .spatialflow-anim-pan-left-out  { animation-name: spatialflow-pan-left-out; }
        .${scope} .spatialflow-anim-pan-right-out { animation-name: spatialflow-pan-right-out; }
        .${scope} .spatialflow-anim-pan-up-out    { animation-name: spatialflow-pan-up-out; }
        .${scope} .spatialflow-anim-pan-down-out  { animation-name: spatialflow-pan-down-out; }

        /* === Enter keyframes (image arrives + settles) === */
        @keyframes spatialflow-ken-burns-in {
          from { transform: scale(1) translate(0, 0); opacity: 0; }
          to   { transform: scale(var(--spatial-anim-scale, 1.1))
                            translate(calc(var(--spatial-anim-intensity, 10%) * -0.5),
                                      calc(var(--spatial-anim-intensity, 10%) * -0.5));
                 opacity: 1; }
        }
        @keyframes spatialflow-zoom-in-in {
          from { transform: scale(var(--spatial-anim-scale, 1.1)); opacity: 0; }
          to   { transform: scale(1); opacity: 1; }
        }
        @keyframes spatialflow-zoom-out-in {
          from { transform: scale(1); opacity: 0; }
          to   { transform: scale(var(--spatial-anim-scale, 1.1)); opacity: 1; }
        }
        @keyframes spatialflow-pan-left-in {
          from { transform: translateX(var(--spatial-anim-intensity, 10%)); }
          to   { transform: translateX(calc(-1 * var(--spatial-anim-intensity, 10%))); }
        }
        @keyframes spatialflow-pan-right-in {
          from { transform: translateX(calc(-1 * var(--spatial-anim-intensity, 10%))); }
          to   { transform: translateX(var(--spatial-anim-intensity, 10%)); }
        }
        @keyframes spatialflow-pan-up-in {
          from { transform: translateY(var(--spatial-anim-intensity, 10%)); }
          to   { transform: translateY(calc(-1 * var(--spatial-anim-intensity, 10%))); }
        }
        @keyframes spatialflow-pan-down-in {
          from { transform: translateY(calc(-1 * var(--spatial-anim-intensity, 10%))); }
          to   { transform: translateY(var(--spatial-anim-intensity, 10%)); }
        }

        /* === Exit keyframes (image departs) ===
           Pans continue the drift direction; zoom-in pushes further in,
           zoom-out pulls back; ken-burns continues the slow drift + fades. */
        @keyframes spatialflow-ken-burns-out {
          from { transform: scale(var(--spatial-anim-scale, 1.1))
                            translate(calc(var(--spatial-anim-intensity, 10%) * -0.5),
                                      calc(var(--spatial-anim-intensity, 10%) * -0.5));
                 opacity: 1; }
          to   { transform: scale(calc(var(--spatial-anim-scale, 1.1) * 1.05))
                            translate(calc(var(--spatial-anim-intensity, 10%) * -1),
                                      calc(var(--spatial-anim-intensity, 10%) * -1));
                 opacity: 0; }
        }
        @keyframes spatialflow-zoom-in-out {
          from { transform: scale(1); opacity: 1; }
          to   { transform: scale(var(--spatial-anim-scale, 1.1)); opacity: 0; }
        }
        @keyframes spatialflow-zoom-out-out {
          from { transform: scale(1); opacity: 1; }
          to   { transform: scale(calc(2 - var(--spatial-anim-scale, 1.1))); opacity: 0; }
        }
        @keyframes spatialflow-pan-left-out {
          from { transform: translateX(0); opacity: 1; }
          to   { transform: translateX(calc(-1 * var(--spatial-anim-intensity, 10%))); opacity: 0; }
        }
        @keyframes spatialflow-pan-right-out {
          from { transform: translateX(0); opacity: 1; }
          to   { transform: translateX(var(--spatial-anim-intensity, 10%)); opacity: 0; }
        }
        @keyframes spatialflow-pan-up-out {
          from { transform: translateY(0); opacity: 1; }
          to   { transform: translateY(calc(-1 * var(--spatial-anim-intensity, 10%))); opacity: 0; }
        }
        @keyframes spatialflow-pan-down-out {
          from { transform: translateY(0); opacity: 1; }
          to   { transform: translateY(var(--spatial-anim-intensity, 10%)); opacity: 0; }
        }
      `}</style>

      {src && (
        <div
          data-layer="spatial"
          className={spatialAnim.className}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 0,
            ...(spatialAnim.style ?? {}),
          }}
        >
          <img
            src={src}
            alt=""
            draggable={false}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit,
              objectPosition: 'center',
              userSelect: 'none',
              pointerEvents: 'none',
            }}
          />
        </div>
      )}

      <div
        data-layer="flow"
        style={{ position: 'absolute', inset: 0, zIndex: 1 }}
      >
        <SlotFlowView
          beatType={beatType}
          slots={spatial.slots}
          content={content}
          theme={theme}
          backgroundUrl={null}
          backgroundColor="transparent"
          slotIntent={slotIntent}
          slotAnimations={slotAnimations}
          onResolve={onResolve}
          onAction={onAction}
          previewWidth={previewWidth}
          previewCoarse={previewCoarse}
          extraExitMs={spatialExitMs}
          onExitStart={handleExitStart}
        />
      </div>
    </div>
  );
};
