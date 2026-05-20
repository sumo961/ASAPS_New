import React from 'react';
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
   * P3-anim-6 — spatial-layer motion intent. Drives a CSS transform
   * animation on the image-layer subtree only; the flow layer is
   * unaffected (deliberate decoupling — text/buttons must not be
   * uniformly scaled with the picture).
   */
  spatialAnimations?: SpatialAnimations;
  onResolve?: (resolutions: SlotIntentResolution[]) => void;
  onAction: (id: string) => void;
  previewWidth?: number;
  previewCoarse?: boolean;
}

// Stable, low-collision id for the scoped <style> tag below.
let spatialUidCounter = 0;

/**
 * Resolve a spatial enter preset to its CSS class + per-animation style
 * (duration / delay / easing / intensity via custom property). Mirrors
 * SlotFlowView's enterAnim but operates on the IMAGE layer.
 */
function spatialEnterStyles(
  enter: SpatialAnimation | undefined,
): { className?: string; style?: React.CSSProperties } {
  if (!enter) return {};
  const presetToClass: Record<string, string | undefined> = {
    'ken-burns': 'spatialflow-anim-ken-burns',
    'zoom-in': 'spatialflow-anim-zoom-in',
    'zoom-out': 'spatialflow-anim-zoom-out',
    'pan-left': 'spatialflow-anim-pan-left',
    'pan-right': 'spatialflow-anim-pan-right',
    'pan-up': 'spatialflow-anim-pan-up',
    'pan-down': 'spatialflow-anim-pan-down',
  };
  const className = presetToClass[enter.preset];
  if (!className) return {};
  const isZoom = enter.preset === 'zoom-in' || enter.preset === 'zoom-out' || enter.preset === 'ken-burns';
  const defaultEasing = isZoom ? 'ease-out' : 'linear';
  const intensity = typeof enter.intensity === 'number' ? enter.intensity : 10; // % drift / scale delta
  const style: React.CSSProperties & Record<string, string | undefined> = {
    animationDuration: `${enter.duration ?? 6000}ms`,
    animationDelay: enter.delay ? `${enter.delay}ms` : undefined,
    animationTimingFunction: enter.easing ?? defaultEasing,
    // CSS vars consumed by keyframes — survive reflow because they're
    // percent / scale, never pixel-keyed.
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
 *  1. **spatial layer** — a uniformly-scaled image (background / map). With
 *     `fit:'contain'` the whole image shows, letterboxed, so normalized 0–1
 *     hotspot coords (Phase 3c) map onto its rendered rect exactly. This is
 *     the "uniform scale is correct for pictorial content" half. P3-anim-6
 *     wraps THIS subtree with CSS transform animations (ken-burns / zoom /
 *     pan) — text/buttons in the flow layer are not affected.
 *  2. **flow layer** — the real `SlotFlowView` composited over it with a
 *     transparent background, so text/buttons flow + clamp responsively and
 *     are NEVER uniformly scaled with the picture (the load-bearing reason
 *     slot mode exists). Slot-level animations (P3-anim-1..4) live here.
 *
 * The two layers are separate DOM subtrees on purpose — the animation
 * model can wrap each independently without architectural rework.
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

  // Scoped style — one per mount so concurrent SpatialFlowViews don't
  // collide on keyframe names that share global scope.
  const scopeRef = React.useRef<string>('');
  if (!scopeRef.current) {
    scopeRef.current = `spatialflow-${++spatialUidCounter}`;
  }
  const scope = scopeRef.current;
  const spatialAnim = spatialEnterStyles(spatialAnimations?.enter);

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
        /* P3-anim-6 — spatial-layer motion. The image-layer subtree is the
           animation target; the flow layer above is deliberately untouched. */
        .${scope} .spatialflow-anim-ken-burns,
        .${scope} .spatialflow-anim-zoom-in,
        .${scope} .spatialflow-anim-zoom-out,
        .${scope} .spatialflow-anim-pan-left,
        .${scope} .spatialflow-anim-pan-right,
        .${scope} .spatialflow-anim-pan-up,
        .${scope} .spatialflow-anim-pan-down {
          animation-fill-mode: both;
        }
        .${scope} .spatialflow-anim-ken-burns { animation-name: spatialflow-ken-burns; }
        .${scope} .spatialflow-anim-zoom-in   { animation-name: spatialflow-zoom-in; }
        .${scope} .spatialflow-anim-zoom-out  { animation-name: spatialflow-zoom-out; }
        .${scope} .spatialflow-anim-pan-left  { animation-name: spatialflow-pan-left; }
        .${scope} .spatialflow-anim-pan-right { animation-name: spatialflow-pan-right; }
        .${scope} .spatialflow-anim-pan-up    { animation-name: spatialflow-pan-up; }
        .${scope} .spatialflow-anim-pan-down  { animation-name: spatialflow-pan-down; }
        @keyframes spatialflow-ken-burns {
          from { transform: scale(1) translate(0, 0); }
          to   { transform: scale(var(--spatial-anim-scale, 1.1))
                            translate(calc(var(--spatial-anim-intensity, 10%) * -0.5),
                                      calc(var(--spatial-anim-intensity, 10%) * -0.5)); }
        }
        @keyframes spatialflow-zoom-in {
          from { transform: scale(var(--spatial-anim-scale, 1.1)); }
          to   { transform: scale(1); }
        }
        @keyframes spatialflow-zoom-out {
          from { transform: scale(1); }
          to   { transform: scale(var(--spatial-anim-scale, 1.1)); }
        }
        @keyframes spatialflow-pan-left {
          from { transform: translateX(var(--spatial-anim-intensity, 10%)); }
          to   { transform: translateX(calc(-1 * var(--spatial-anim-intensity, 10%))); }
        }
        @keyframes spatialflow-pan-right {
          from { transform: translateX(calc(-1 * var(--spatial-anim-intensity, 10%))); }
          to   { transform: translateX(var(--spatial-anim-intensity, 10%)); }
        }
        @keyframes spatialflow-pan-up {
          from { transform: translateY(var(--spatial-anim-intensity, 10%)); }
          to   { transform: translateY(calc(-1 * var(--spatial-anim-intensity, 10%))); }
        }
        @keyframes spatialflow-pan-down {
          from { transform: translateY(calc(-1 * var(--spatial-anim-intensity, 10%))); }
          to   { transform: translateY(var(--spatial-anim-intensity, 10%)); }
        }
      `}</style>

      {/* Layer 1 — uniformly-scaled image (wrappable later for pan/zoom). */}
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
          {/* Normalized 0–1 hotspot overlay lands in Phase 3c. */}
        </div>
      )}

      {/* Layer 2 — responsive flow, transparent so the image shows through
          (wrappable later for per-slot enter/exit). */}
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
        />
      </div>
    </div>
  );
};
