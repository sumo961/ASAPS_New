import React, { useState, useCallback, useEffect, useRef } from 'react';
import type {
  SlotIntent,
  SlotIntentResolution,
  SlotAnimations,
  SpatialAnimations,
  SpatialAnimation,
  Hotspot,
} from '@asaps/core';
import { resolveHotspotRect, resolveAssetVariant, detectDeviceClass, detectOrientation } from '@asaps/core';
import type { AssetVariant } from '@asaps/core';
import type { SpatialSpec } from '../utils/slotLayout';
import type { RenderThemeSettings } from './PositionedBeatView';
import { SlotFlowView, applyAlphaToHex } from './SlotFlowView';
import { runSpatialPath } from '../utils/pathAnimation';
import { ResponsiveCharacterLayer, type ResponsiveCharacterLayerHandle } from './ResponsiveCharacterLayer';
import { TimerProgressBar } from './TimerProgressBar';
import type { Location, AnimationPath } from '@asaps/core';
import type { SpriteSheetData } from './PositionedBeatView';

interface SpatialFlowViewProps {
  beatType: string;
  /** Image layer + flow slots (schema-driven, from getSpatialSpec). */
  spatial: SpatialSpec;
  content: Record<string, any>;
  theme?: RenderThemeSettings;
  /** Resolved spatial image URL (beat background / map asset). Falls back to
   *  content[spatial.source] when the renderer didn't resolve one. */
  imageUrl?: string | null;
  /**
   * Phase 3.3 — orientation / device-class variants for the spatial
   * image. The component picks the best match against its container's
   * current dimensions at render time (the SAME measurements that
   * drive hotspot orientation resolution, so the picture and its
   * clickable regions stay in sync). Each variant must carry a
   * resolved `url` because SpatialFlowView lives below the
   * asset-resolution layer and has no view onto the project's asset
   * list. Absent / empty → renders `imageUrl` (unchanged).
   */
  imageVariants?: ReadonlyArray<AssetVariant & { url: string }>;
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
  /**
   * Bug 19b — choices that ARE part of this turn but DON'T have a hotspot
   * (mixed dialogTree nodes). The schema's flow has no action slot for
   * dynamic per-turn choices, so SpatialFlowView renders them as a
   * themed button row at the bottom of the stage. Click fires onAction
   * with the supplied id — same channel as hotspots.
   */
  dynamicActions?: { id: string; text: string }[];
  onResolve?: (resolutions: SlotIntentResolution[]) => void;
  onAction: (id: string) => void;
  previewWidth?: number;
  /** Emulated viewport height — pairs with previewWidth (device-size preview). */
  previewHeight?: number;
  previewCoarse?: boolean;
  /**
   * Free-positioned sprite layer — character / prop locations that
   * the responsive slot/spatial routing has decided NOT to treat as
   * "author placed layout content". Mirrors the kind:'character' /
   * kind:'prop' rendering that PositionedBeatView does in fixed
   * mode, but uses xPercent / yPercent so positions track the live
   * stage at any viewport. The renderer also forwards
   * beat.parameters.animations so AnimationPath[] entries whose
   * elementId matches a character location drive the sprite's
   * transform each frame (via the shared AnimationEngine).
   */
  characterLocations?: Location[];
  animations?: AnimationPath[];
  characterResolver?: (characterId: string, stateId?: string) => string | undefined;
  assetResolver?: (assetId: string) => string | undefined;
  spriteDataResolver?: (characterId: string) => SpriteSheetData | null;
  /** Editor-only: makes free-positioned sprites + slot content clickable for selection. */
  editorMode?: boolean;
  /** For free-positioned sprite selection (location.name match). */
  selectedElementName?: string;
  onElementSelect?: (locationName: string) => void;
  /** For slot-content selection ("slot:title" / "slot:actions:continueButton"). */
  selectedSlotKey?: string;
  onSlotSelect?: (slotName: string, buttonId?: string) => void;
  /** Same timer hookup as SlotFlowView — see notes there. */
  timerState?: {
    totalTime: number;
    remainingTime: number;
    visible: boolean;
    label?: string;
  };
  onSubscribeTimerState?: (listener: (state: SpatialFlowViewProps['timerState']) => void) => () => void;
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
export function imageRectInsets(
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
    const scaledH = boxW / imgAspect;
    const bar = (boxH - scaledH) / 2;
    const pct = (bar / boxH) * 100;
    return { top: `${pct}%`, bottom: `${pct}%`, left: '0%', right: '0%' };
  } else {
    const scaledW = boxH * imgAspect;
    const bar = (boxW - scaledW) / 2;
    const pct = (bar / boxW) * 100;
    return { left: `${pct}%`, right: `${pct}%`, top: '0%', bottom: '0%' };
  }
}

/**
 * Same letterbox math but as absolute pixel rect (for hit-testing / drag
 * coordinate translation). Returns { x, y, width, height } in container
 * pixels. With objectFit:'cover' or unresolved aspect, returns the full
 * container rect.
 */
export function imageRectPx(
  imgAspect: number,
  boxW: number,
  boxH: number,
  fit: 'contain' | 'cover',
): { x: number; y: number; width: number; height: number } {
  if (fit === 'cover' || !imgAspect || !boxW || !boxH) {
    return { x: 0, y: 0, width: boxW, height: boxH };
  }
  const boxAspect = boxW / boxH;
  if (imgAspect > boxAspect) {
    const scaledH = boxW / imgAspect;
    return { x: 0, y: (boxH - scaledH) / 2, width: boxW, height: scaledH };
  } else {
    const scaledW = boxH * imgAspect;
    return { x: (boxW - scaledW) / 2, y: 0, width: scaledW, height: boxH };
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
  // Path preset is rAF-driven (see useEffect below). Returning an empty
  // patch leaves the spatial layer in its natural transform; runSpatialPath
  // then animates pan + zoom each frame.
  if (anim.preset === 'path') return {};
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
  imageVariants,
  backgroundColor,
  slotIntent,
  slotAnimations,
  spatialAnimations,
  hotspots,
  showHotspotOutlines = false,
  dynamicActions,
  onResolve,
  onAction,
  previewWidth,
  previewHeight,
  previewCoarse,
  characterLocations,
  animations,
  characterResolver,
  assetResolver,
  spriteDataResolver,
  editorMode,
  selectedElementName,
  onElementSelect,
  selectedSlotKey,
  onSlotSelect,
  timerState: initialTimerState,
  onSubscribeTimerState,
}) => {
  // Device-size emulation helpers — see SlotFlowView (keep in sync).
  const vwU = (n: number): string => previewWidth ? `${((n * previewWidth) / 100).toFixed(1)}px` : `${n}vw`;
  const vhU = (n: number): string => previewHeight ? `${((n * previewHeight) / 100).toFixed(1)}px` : `${n}vh`;
  const objectFit = spatial.fit === 'cover' ? 'cover' : 'contain';

  // Read-gate coordination for multi-choice spatial beats (dialogTree
  // with hotspots / dynamicActions, movementChoice, pickProp).
  // Counts every visible choice across the two surfaces; ≥ 2 → the
  // inner SlotFlowView runs phase-1 (body grows, outer scrolls,
  // sentinel earns the gate). While the gate is unearned, the
  // hotspots and the dynamicActions row are visually present but
  // pointer-events:none + dimmed so the player can SEE what awaits
  // without being able to commit. ≤ 1 → no gating (a beat with no
  // choices or one trivial Continue doesn't need it).
  // Whether this beat presents any per-turn choices that the spatial
  // composite owns. Hotspot-only beats (no dynamic action buttons)
  // skip the gate entirely — there's nothing to slide in. Otherwise
  // the action row is gated regardless of choice count: even a single
  // "Continue" should let the player read the body first.
  const hasDynamicActions = (dynamicActions?.length ?? 0) > 0;
  const [gateEarned, setGateEarned] = useState(!hasDynamicActions);
  const handleGateChange = React.useCallback((earned: boolean) => {
    if (earned) setGateEarned(true);
  }, []);

  // Reset the gate when the dialog content advances within the same
  // beat (dialogTree node transitions don't remount this component).
  // Inner SlotFlowView already re-arms its own gate on bodyText
  // change; we mirror that here so phase 1 (hidden choices) is
  // restored for the new node instead of inheriting the previous
  // node's "earned" state.
  const dialogBody = (content?.text ?? '') as string;
  React.useEffect(() => {
    if (hasDynamicActions) setGateEarned(false);
  }, [dialogBody, hasDynamicActions]);

  const scopeRef = React.useRef<string>('');
  if (!scopeRef.current) {
    scopeRef.current = `spatialflow-${++spatialUidCounter}`;
  }
  const scope = scopeRef.current;

  // onClick AnimationPath bridge — clicking a hotspot tells the
  // character layer to play any matching onClick path, awaits its
  // completion, then resolves the choice. While the path plays:
  //   - committedActionId !== null → all hotspots disable (gate)
  //   - the rest of the UI (question, timer) stays visible (per design)
  const rclRef = useRef<ResponsiveCharacterLayerHandle | null>(null);
  const [committedActionId, setCommittedActionId] = useState<string | null>(null);
  const handleHotspotClick = useCallback(async (hotspotId: string, triggerName?: string) => {
    if (committedActionId !== null) return; // already committed; ignore re-click
    setCommittedActionId(hotspotId);
    try {
      // Match the onClick AnimationPath by the LOGICAL name (the
      // source location's name — 'door' / 'bed' / …), not the choice
      // id. Fall back to id only when triggerName is absent (legacy
      // data with no location-name plumbing).
      if (rclRef.current) {
        await rclRef.current.triggerClickAnimation(triggerName || hotspotId);
      }
    } catch (err) {
      console.warn('[SpatialFlowView] triggerClickAnimation failed; resolving anyway', err);
    }
    onAction(hotspotId);
  }, [committedActionId, onAction]);

  // P3-anim-7 — local image-layer phase. Flips to 'exit' when SlotFlowView
  // reports its own exit start (onExitStart callback). The two layers
  // animate in parallel because they share the same flip moment.
  const [imagePhase, setImagePhase] = useState<'enter' | 'exit'>('enter');
  const handleExitStart = useCallback(() => setImagePhase('exit'), []);

  // Default-target countdown — mirror of SlotFlowView's subscription
  // wiring so a spatial beat (titleScreen, dialogTree spatial node,
  // etc.) shows the same green→red bar at the top when the beat
  // auto-advances.
  const [timerState, setTimerState] = useState(initialTimerState);
  useEffect(() => {
    setTimerState(initialTimerState);
  }, [initialTimerState]);
  useEffect(() => {
    if (onSubscribeTimerState) return onSubscribeTimerState(setTimerState);
  }, [onSubscribeTimerState]);

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
    // P3-3e — orientation changes typically also fire ResizeObserver
    // (W↔H swap), but on some devices the resize event lands a frame
    // before the layout actually flips. Explicitly handling
    // orientationchange + matchMedia('(orientation: portrait)') makes
    // the re-resolve deterministic and lets normalized hotspots track
    // the new letterboxed rect immediately.
    const onOrient = () => {
      // Defer one frame so clientWidth/Height reflect the post-rotation
      // layout, not the pre-rotation transient.
      requestAnimationFrame(() => {
        if (containerRef.current) update();
      });
    };
    window.addEventListener('orientationchange', onOrient);
    const mq = window.matchMedia?.('(orientation: portrait)');
    mq?.addEventListener?.('change', onOrient);
    return () => {
      ro.disconnect();
      window.removeEventListener('orientationchange', onOrient);
      mq?.removeEventListener?.('change', onOrient);
    };
  }, []);
  const imgInsets = imageRectInsets(imgAspect, containerSize.w, containerSize.h, objectFit);

  /**
   * Phase 3.3 — pick the best image source for this container.
   *
   * Base URL is `imageUrl` (already resolved by the caller from the
   * beat's background asset, falling back to `content[spatial.source]`).
   * When `imageVariants` are supplied, resolveAssetVariant scores each
   * candidate against the container's current orientation + the
   * width-derived device class and returns the most-specific match.
   * Constraint-violating variants are filtered out; if none qualify
   * the base URL stays in use (the documented fallback).
   *
   * Container dimensions must be measured before this resolves; until
   * the first ResizeObserver tick lands, containerSize.w is 0 and
   * deviceClass would mis-classify as 'phone'. We hold off on variant
   * lookup in that initial frame so the first paint uses the base
   * image; a re-render lands within a frame with the right context.
   */
  const baseSrc: string | null =
    imageUrl ?? (typeof content[spatial.source] === 'string' ? content[spatial.source] : null);
  const variantUrl: string | null = (() => {
    if (!imageVariants || imageVariants.length === 0) return null;
    if (containerSize.w === 0 || containerSize.h === 0) return null;
    const orientation = detectOrientation(containerSize.w, containerSize.h);
    const deviceClass = detectDeviceClass(containerSize.w);
    const picked = resolveAssetVariant(imageVariants, { orientation, deviceClass });
    if (!picked) return null;
    const found = imageVariants.find(v => v.assetId === picked.assetId);
    return found?.url ?? null;
  })();
  const src: string | null = variantUrl ?? baseSrc;

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

  // Path-preset spatial animation. Drives a JS-controlled pan + zoom
  // on the spatial-layer div via rAF, reading the current letterboxed
  // image rect each frame so the path tracks viewport / variant swaps.
  // Skipped when the active phase's preset is not 'path'.
  const spatialLayerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const event =
      imagePhase === 'exit' ? spatialAnimations?.exit : spatialAnimations?.enter;
    if (!event || event.preset !== 'path' || !event.path?.waypoints?.length) return;
    const el = spatialLayerRef.current;
    if (!el) return;
    const cleanup = runSpatialPath({
      el,
      getImageRect: () =>
        imageRectPx(imgAspect, containerSize.w, containerSize.h, objectFit),
      waypoints: event.path.waypoints,
      duration: event.duration ?? (imagePhase === 'exit' ? 1200 : 6000),
      delay: event.delay ?? 0,
      easing: event.easing,
      loop: !!event.path.loop,
    });
    return cleanup;
  }, [
    imagePhase,
    spatialAnimations,
    imgAspect,
    containerSize.w,
    containerSize.h,
    objectFit,
  ]);

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
      {/* Default-target countdown bar — mirrors PositionedBeatView /
          SlotFlowView placement so beats that auto-advance show the
          same green→red ticker pinned at the top of the stage. */}
      {timerState && timerState.visible && (
        <TimerProgressBar
          totalTime={timerState.totalTime}
          remainingTime={timerState.remainingTime}
          visible={timerState.visible}
          label={timerState.label}
        />
      )}
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

        /* === Enter keyframes (image arrives + settles) ===
            Bug 25 — keyframes that LEFT the image in a transformed rest
            state at animation-end (with fill-mode:both holding it there
            forever) produced an "off-center, zoomed" stage. ken-burns
            and zoom-out used to end at scale(1.1) + translate, so the
            image was permanently shifted and clipped by the stage
            frame. Both now SETTLE at scale(1) + translate(0,0) so the
            rest state is exactly the contain-fit rect the author
            expects. ken-burns starts drifted and resolves to centered;
            zoom-out starts wide and pulls in. */
        @keyframes spatialflow-ken-burns-in {
          from { transform: scale(var(--spatial-anim-scale, 1.1))
                            translate(calc(var(--spatial-anim-intensity, 10%) * -0.5),
                                      calc(var(--spatial-anim-intensity, 10%) * -0.5));
                 opacity: 0; }
          to   { transform: scale(1) translate(0, 0); opacity: 1; }
        }
        @keyframes spatialflow-zoom-in-in {
          from { transform: scale(var(--spatial-anim-scale, 1.1)); opacity: 0; }
          to   { transform: scale(1); opacity: 1; }
        }
        @keyframes spatialflow-zoom-out-in {
          from { transform: scale(calc(2 - var(--spatial-anim-scale, 1.1))); opacity: 0; }
          to   { transform: scale(1); opacity: 1; }
        }
        /* Bug 25 — pan-* enter keyframes used to end at translateX/Y(±10%)
            so the image stayed permanently shifted (with fill-mode:both
            holding the end state). Now they enter from the directional
            offset and settle to translate(0), so the rest state is
            centered. Pan-left = image comes IN from the right and
            settles; pan-right = comes in from the left; etc. */
        @keyframes spatialflow-pan-left-in {
          from { transform: translateX(var(--spatial-anim-intensity, 10%)); }
          to   { transform: translateX(0); }
        }
        @keyframes spatialflow-pan-right-in {
          from { transform: translateX(calc(-1 * var(--spatial-anim-intensity, 10%))); }
          to   { transform: translateX(0); }
        }
        @keyframes spatialflow-pan-up-in {
          from { transform: translateY(var(--spatial-anim-intensity, 10%)); }
          to   { transform: translateY(0); }
        }
        @keyframes spatialflow-pan-down-in {
          from { transform: translateY(calc(-1 * var(--spatial-anim-intensity, 10%))); }
          to   { transform: translateY(0); }
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
          ref={spatialLayerRef}
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
          opts in to receiving clicks.

          Bug 18 — respect theme.hotspot settings (highlightColor,
          opacity, showInPreview, labelDisplay). The editor's
          `showHotspotOutlines` prop still wins for VE overlay tooling
          (so authors always see hotspots while editing) — at runtime
          we defer to the theme. */}
      {hotspots && hotspots.length > 0 && (() => {
        const hs = theme?.hotspot;
        const hsColor = hs?.highlightColor || '#ffff00';
        const hsAlpha = hs?.opacity ?? 0.3;
        const hsVisible = hs?.visible ?? true;
        const hsShow = hs?.showInPreview ?? 'visible';
        const hsLabel = hs?.labelDisplay ?? 'hover';
        // showHotspotOutlines (editor) ALWAYS shows fills + dashed
        // outlines for authoring. Runtime visibility is:
        //   hsVisible=false              → invisible
        //   hsShow='invisible'           → invisible
        //   hsShow='onHover'             → fills only appear on hover
        //   hsShow='visible' (default)   → fills always shown at hsAlpha
        const baseVisible = showHotspotOutlines
          ? true
          : hsVisible && hsShow !== 'invisible';
        const fillsOnHover = !showHotspotOutlines && hsShow === 'onHover';
        // Same hex+AA pattern used elsewhere for opacity blends.
        const fillHex = applyAlphaToHex(hsColor, baseVisible && !fillsOnHover ? hsAlpha : 0);
        const hoverHex = applyAlphaToHex(hsColor, Math.min(1, hsAlpha * 1.5));
        const borderColor = showHotspotOutlines
          ? applyAlphaToHex(hsColor, 0.8)
          : 'transparent';
        return (
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
              // Read-gate — fade and de-activate the hotspot layer
              // until the player has scrolled past the body text.
              // Hotspots still draw their outlines (when the theme
              // shows them) so the player sees what's available;
              // they just can't be clicked yet.
              opacity: gateEarned ? 1 : 0.35,
              transition: 'opacity 200ms ease',
            }}
          >
            {/* Render prop-derived hotspots FIRST so author-drawn
                hotspots (door, bed, kitchen) land later in the DOM
                and sit on top — siblings stack last-on-top, and a
                prop-derived hotspot is often huge (whole image rect),
                so without this it would block clicks on small
                author-drawn hotspots that overlap it. */}
            {[...hotspots]
              .sort((a, b) => Number(!!(a as any).fromProp) - Number(!!(b as any).fromProp))
              .map((h) => {
              const isEllipse = h.shape === 'ellipse';
              const labelText = h.label || h.id;
              const showLabelAlways = hsLabel === 'always' && !!labelText;
              const showLabelOnHover = hsLabel === 'hover' && !!labelText;
              // P3-3e — pick the orientation-appropriate rect. The
              // container's current aspect ratio decides portrait vs
              // landscape (the LETTERBOXED image follows the container
              // here, and orientationchange + ResizeObserver above
              // refresh containerSize so this re-resolves immediately).
              const isPortrait = containerSize.h > containerSize.w;
              const rect = resolveHotspotRect(h, isPortrait);
              // Prop-derived hotspots are click targets only — no tint,
              // no outline, no hover swap; the prop image underneath is
              // the visual. Author-drawn hotspots keep the normal theme.
              const fromProp = (h as any).fromProp === true;
              const hSpotFill = fromProp ? 'transparent' : fillHex;
              const hSpotHover = fromProp ? 'transparent' : hoverHex;
              const hSpotBorder = fromProp ? 'none' : (showHotspotOutlines
                ? `2px dashed ${borderColor}`
                : 'none');
              // Rotation (degrees around hotspot center) applied via
              // CSS transform — purely visual, the click area itself
              // remains the axis-aligned rect (good enough for the
              // tilted-bed case; a true polygonal hit test would
              // require a clipPath).
              const rotation = typeof (h as any).rotation === 'number' ? (h as any).rotation : 0;
              return (
                <button
                  key={h.id}
                  type="button"
                  aria-label={labelText}
                  title={showLabelOnHover ? labelText : (!gateEarned ? 'Scroll to the bottom of the text to choose' : undefined)}
                  onClick={() => handleHotspotClick(h.id, (h as any).triggerName)}
                  disabled={!gateEarned || committedActionId !== null}
                  aria-disabled={!gateEarned || committedActionId !== null}
                  className="spatialflow-hotspot"
                  style={{
                    position: 'absolute',
                    left: `${rect.x * 100}%`,
                    top: `${rect.y * 100}%`,
                    width: `${rect.width * 100}%`,
                    height: `${rect.height * 100}%`,
                    pointerEvents: gateEarned ? 'auto' : 'none',
                    background: hSpotFill,
                    border: hSpotBorder,
                    borderRadius: isEllipse ? '50%' : undefined,
                    clipPath: isEllipse ? 'ellipse(50% 50% at 50% 50%)' : undefined,
                    cursor: 'pointer',
                    padding: 0,
                    font: 'inherit',
                    color: 'inherit',
                    transform: rotation ? `rotate(${rotation}deg)` : undefined,
                    transformOrigin: 'center center',
                    // CSS vars consumed by the :hover rule below so we
                    // can swap fills on hover without re-rendering.
                    ['--spatialflow-hotspot-hover-bg' as any]: hSpotHover,
                    ['--spatialflow-hotspot-onhover-bg' as any]: fromProp ? 'transparent' : (fillsOnHover ? hoverHex : fillHex),
                    transition: 'background 120ms ease-out',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {showLabelAlways && (
                    <span style={{
                      pointerEvents: 'none',
                      fontFamily: theme?.fonts.textFont || 'sans-serif',
                      fontWeight: 600,
                      fontSize: `clamp(12px, ${vwU(1.6)}, 18px)`,
                      color: theme?.colors?.textColor || '#fff',
                      textShadow: '0 1px 2px rgba(0,0,0,0.6)',
                      padding: '4px 8px',
                    }}>
                      {labelText}
                    </span>
                  )}
                </button>
              );
            })}
            <style>{`
              .spatialflow-hotspot:hover { background: var(--spatialflow-hotspot-hover-bg) !important; }
              .spatialflow-hotspot:focus-visible { outline: 2px solid var(--spatialflow-hotspot-hover-bg); outline-offset: 2px; }
            `}</style>
          </div>
        );
      })()}

      {/* Flow layer: SlotFlowView owns the single scrollable surface
          and we hand it the dynamicActions via extraInScrollAfterBody,
          so the choices live INSIDE the same scroller, below the body
          card. That makes the player's scroll gesture literally drag
          the choice list into view from below — no triggered slide-in.
          A choice is only clickable after the read-gate fires (= user
          has scrolled past the end-of-body sentinel). Before that the
          buttons are visible (scrolling reveals them) but disabled. */}
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
          editorMode={editorMode}
          selectedSlotKey={selectedSlotKey}
          onSlotSelect={onSlotSelect}
          previewWidth={previewWidth}
          previewHeight={previewHeight}
          previewCoarse={previewCoarse}
          extraExitMs={spatialExitMs}
          onExitStart={handleExitStart}
          forceMultiActionGate={hasDynamicActions}
          onGateChange={handleGateChange}
          extraInScrollAfterBody={
            dynamicActions && dynamicActions.length > 0 ? (
              <div
                data-layer="dynamic-actions"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: `clamp(10px, ${vwU(1.8)}, 18px)`,
                  padding: `clamp(12px, ${vhU(2.5)}, 20px) clamp(16px, ${vwU(3)}, 28px) clamp(20px, ${vhU(4)}, 32px)`,
                  width: '100%',
                  maxWidth: 760,
                  margin: '0 auto',
                }}
              >
                {dynamicActions.map(a => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => onAction(a.id)}
                    disabled={!gateEarned}
                    aria-disabled={!gateEarned}
                    style={{
                      width: '100%',
                      pointerEvents: gateEarned ? 'auto' : 'none',
                      fontFamily: theme?.fonts.buttonFont || theme?.fonts.textFont || 'sans-serif',
                      fontSize: `clamp(13px, ${vwU(1.4)}, 18px)`,
                      fontWeight: 600,
                      color: theme?.button?.textColor || '#fff',
                      background: theme?.button?.backgroundColor || 'rgba(255,255,255,0.12)',
                      border: `${theme?.button?.borderWidth ?? 1}px solid ${theme?.button?.borderColor || 'rgba(255,255,255,0.4)'}`,
                      borderRadius: `${theme?.button?.borderRadius ?? 8}px`,
                      padding: `10px clamp(14px, ${vwU(2.5)}, 24px)`,
                      minHeight: 44,
                      cursor: gateEarned ? 'pointer' : 'default',
                      opacity: gateEarned ? 1 : 0.55,
                      transition: 'opacity 200ms ease',
                    }}
                  >
                    {a.text}
                  </button>
                ))}
              </div>
            ) : null
          }
        />
      </div>

      {/* Character / prop sprite layer — free-positioned avatars on
          top of the spatial image but below the flow text/buttons.
          Picks up beat.parameters.animations for path-driven motion.
          Anchored to the LETTERBOXED image rect (imgInsets) — the
          authored character positions are relative to the spatial
          image, NOT the surrounding container, so a sprite drawn at
          (0.5, 0.95) of the original stage lands on the same picture
          pixel at any viewport. Without these insets the sprite would
          float above the actual scene whenever the container is wider
          or shorter than the image. */}
      {characterLocations && characterLocations.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: imgInsets.top,
            left: imgInsets.left,
            right: imgInsets.right,
            bottom: imgInsets.bottom,
            pointerEvents: 'none',
            zIndex: 2,
          }}
        >
          <ResponsiveCharacterLayer
            ref={rclRef}
            locations={characterLocations}
            animations={animations}
            characterResolver={characterResolver}
            assetResolver={assetResolver}
            spriteDataResolver={spriteDataResolver}
            editorMode={editorMode}
            selectedElementName={selectedElementName}
            onElementSelect={onElementSelect}
          />
        </div>
      )}
    </div>
  );
};
