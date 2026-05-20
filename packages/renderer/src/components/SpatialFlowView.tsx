import React, { useState, useCallback, useEffect, useRef } from 'react';
import type {
  SlotIntent,
  SlotIntentResolution,
  SlotAnimations,
  SpatialAnimations,
  SpatialAnimation,
  Hotspot,
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
  /**
   * P3-3c — normalized 0–1 clickable regions on the spatial IMAGE rect
   * (NOT the container). Tracks the image's actual letterboxed box, so
   * a hotspot drawn at (0.4, 0.3, 0.2, 0.1) lands on the same picture
   * pixels at any viewport. Click fires onAction(hotspot.id) — same
   * channel as button clicks in the flow layer.
   */
  hotspots?: Hotspot[];
  /**
   * Whether to render visible hotspot outlines (editor / debug). At
   * runtime the default is false — hotspots are invisible click regions.
   */
  showHotspotOutlines?: boolean;
  onResolve?: (resolutions: SlotIntentResolution[]) => void;
  onAction: (id: string) => void;
  previewWidth?: number;
  previewCoarse?: boolean;
}

/**
 * Resolve the letterboxed image rect within a container for objectFit:contain.
 * Returns inset percentages so we can position hotspots via CSS without
 * needing to know the container's pixel size at hotspot-render time.
 *
 * - imgAspect    = naturalWidth / naturalHeight
 * - boxAspect    = containerWidth / containerHeight
 * - if imgAspect > boxAspect: image is letterboxed top/bottom (vertical bars)
 *     scaledH = boxW / imgAspect, vertical bar = (boxH - scaledH) / 2
 *   else: image is letterboxed left/right (horizontal bars)
 *     scaledW = boxH * imgAspect, horizontal bar = (boxW - scaledW) / 2
 *
 * For objectFit:cover, the image fills the container and is clipped —
 * hotspots map to (x*containerW, y*containerH) directly. Returned inset
 * is then 0% on all sides.
 */
function imageRectInsets(
  imgAspect: number,
  boxW: number,
  boxH: number,
  fit: 'contain' | 'cover',
): { top: string; left: string; right: string; bottom: string } {
  if (fit === 'cover' || !imgAspect || !boxW || !boxH) {
    return { top: '0%', left: '0%', right: '0%', bottom: '0%' };
  }
  const boxAspect = boxW / boxH;
  if (imgAspect > boxAspect) {
    // Letterboxed top/bottom — bars are vertical, image is full width.
    const scaledH = boxW / imgAspect;
    const bar = (boxH - scaledH) / 2;
    const pct = (bar / boxH) * 100;
    return { top: `${pct}%`, bottom: `${pct}%`, left: '0%', right: '0%' };
  } else {
    // Letterboxed left/right — bars are horizontal, image is full height.
    const scaledW = boxH * imgAspect;
    const bar = (boxW - scaledW) / 2;
    const pct = (bar / boxW) * 100;
    return { left: `${pct}%`, right: `${pct}%`, top: '0%', bottom: '0%' };
  }
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
  hotspots,
  showHotspotOutlines = false,
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

  // P3-3c — track the container + image natural aspect so hotspots can be
  // positioned relative to the LETTERBOXED image rect (not the container).
  // The image's natural dimensions land on the load event; the container
  // box updates via ResizeObserver.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [imgAspect, setImgAspect] = useState<number>(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const imgInsets = imageRectInsets(imgAspect, containerSize.w, containerSize.h, objectFit);

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
      ref={containerRef}
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
            onLoad={(e) => {
              const img = e.currentTarget;
              if (img.naturalWidth && img.naturalHeight) {
                setImgAspect(img.naturalWidth / img.naturalHeight);
              }
            }}
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

      {/* P3-3c — hotspot overlay. Positioned inside the LETTERBOXED image
          rect (computed from imgInsets), so a hotspot at (0.5, 0.5) lands
          on the center of the picture, not the container. The wrapper
          has pointer-events:none so clicks pass to whatever's below
          (typically the flow layer's buttons); each individual hotspot
          opts in to receiving clicks. */}
      {hotspots && hotspots.length > 0 && (
        <div
          data-layer="hotspots"
          style={{
            position: 'absolute',
            top: imgInsets.top,
            left: imgInsets.left,
            right: imgInsets.right,
            bottom: imgInsets.bottom,
            zIndex: 2,
            pointerEvents: 'none',
          }}
        >
          {hotspots.map((h) => {
            const isEllipse = h.shape === 'ellipse';
            return (
              <button
                key={h.id}
                type="button"
                aria-label={h.label || h.id}
                onClick={() => onAction(h.id)}
                style={{
                  position: 'absolute',
                  left: `${h.x * 100}%`,
                  top: `${h.y * 100}%`,
                  width: `${h.width * 100}%`,
                  height: `${h.height * 100}%`,
                  pointerEvents: 'auto',
                  background: showHotspotOutlines
                    ? 'rgba(255, 200, 0, 0.18)'
                    : 'transparent',
                  border: showHotspotOutlines
                    ? '2px dashed rgba(255, 200, 0, 0.8)'
                    : 'none',
                  borderRadius: isEllipse ? '50%' : undefined,
                  clipPath: isEllipse ? 'ellipse(50% 50% at 50% 50%)' : undefined,
                  cursor: 'pointer',
                  padding: 0,
                  // Author-controlled label visibility for hover lands later;
                  // for now the aria-label provides a11y / screen-reader text.
                  font: 'inherit',
                  color: 'inherit',
                }}
              />
            );
          })}
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
