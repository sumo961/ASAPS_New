/**
 * SlotFlowView — Phase 1 responsive slot renderer (test bed: endScreen).
 *
 * The deliberate departure from the absolute-position path: this component
 * renders OUTSIDE the ScaledStage uniform `transform: scale()`. Text is NOT
 * dragged by the stage-fit factor. Instead, font size is a clamped-fluid
 * value:
 *
 *     clamp( device-aware FLOOR , fluid-around-authored-size , CEILING )
 *
 * - At the authored 1024px stage width the body renders at exactly the
 *   theme's authored size (the fluid term is authored + (100vw-1024)*k, so
 *   the offset is 0 at 1024).
 * - It scales gently with viewport away from 1024 but can never cross the
 *   readability FLOOR (raised on coarse-pointer / touch where viewing
 *   distance is arm's length) or the comfortable-reading CEILING (this is
 *   what structurally retires the recurring giant-endScreen bug class).
 * - When content still overflows at the FLOOR, the body scrolls; the action
 *   row stays pinned and visible so buttons can never be overlapped.
 *
 * Layout: a full-viewport flex column, safe-area-inset padded (notches /
 * home indicator). Body = flex:1 scroll region with a readable max-width
 * column. Actions = fixed-height bottom bar, always visible.
 *
 * See project_responsive_layout_system memory for the full rationale.
 */

import React, { useState, useCallback, useEffect } from 'react';
import type { SlotIntent, SlotIntentResolution, SlotAnimations, SlotAnimation, SlotAnchor } from '@asaps/core';
import { slotIntentFor, slotAnimationsFor } from '@asaps/core';
import { DEFAULT_THEME, type RenderThemeSettings } from './PositionedBeatView';
import type { SlotSpec } from '../utils/slotLayout';

interface SlotFlowViewProps {
  beatType: string;
  slots: SlotSpec[];
  content: Record<string, any>;
  /** May be undefined (no theme set); falls back to DEFAULT_THEME like the absolute path. */
  theme?: RenderThemeSettings;
  backgroundUrl?: string | null;
  backgroundColor: string;
  /**
   * Soft author layout preferences. Currently consumed: `preferredLines`
   * (title). Anchors are carried but their repositioning is applied with
   * the VE handles in the next layer (authoring-driven). Absent → today's
   * pure-flow behavior, unchanged.
   */
  slotIntent?: SlotIntent;
  /**
   * Reports, per slot, which intents were applied vs overridden at the
   * resolved viewport (override-visibility). The runtime ignores it; the
   * Visual Editor consumes it to badge degraded preferences.
   */
  onResolve?: (resolutions: SlotIntentResolution[]) => void;
  /**
   * Responsive motion intent (P3-anim). Per-slot enter/exit/emphasis
   * presets resolved against the slot's responsive box. Absent → no
   * animation (unchanged rendering). P3-anim-1 supports the `fade` enter
   * preset; further presets land per the P3-anim phasing in
   * project_responsive_layout_system memory.
   */
  slotAnimations?: SlotAnimations;
  /** Resolve a button click to the action id the beat expects. */
  onAction: (id: string) => void;
  /**
   * P3-anim-4.5 — timer-driven exit for beats without a click (durScreen).
   * When set, SlotFlowView schedules its OWN phase flip at
   * `autoExitMs - maxExitMs` so the exit animation finishes precisely as
   * the renderer's own setTimeout-driven advance fires. The component
   * doesn't drive the advance — only the visual exit; the renderer still
   * resolves the render-method promise at `autoExitMs`. Unset → no
   * timer-driven exit (action beats use the click-driven path).
   */
  autoExitMs?: number;
  /**
   * P3-anim-7 — extra exit wait (ms) contributed by a wrapping layer
   * (e.g., SpatialFlowView's image-layer exit). Folded into dispatchAction's
   * wait so the longest exit across all layers finishes before the parent
   * `onAction` is fired. Absent → only slot exits dictate timing.
   */
  extraExitMs?: number;
  /**
   * P3-anim-7 — fires when dispatchAction starts an exit phase. A wrapping
   * layer (SpatialFlowView) listens to start its OWN exit in parallel
   * (image layer ⇄ flow layer). Absent → no-op.
   */
  onExitStart?: () => void;
  /**
   * Visual-Editor viewport simulation. When set, the fluid font term uses
   * this width instead of the live `100vw`, so a fixed-width preview box
   * reflows exactly as that device would at runtime (the editor renders the
   * REAL component, just told a different viewport). Unset at runtime.
   */
  previewWidth?: number;
  /**
   * VE viewport simulation for touch presets (phone/tablet): forces the
   * coarse-pointer narrative floor that `@media (pointer: coarse)` would
   * apply on the device, since the editor itself runs on a fine pointer.
   */
  previewCoarse?: boolean;
}

// Authored design width — the fluid font term is zero-offset here so a beat
// renders at the theme's authored size on the canvas it was designed for.
const DESIGN_WIDTH = 1024;
// Comfortable reading ceiling for body prose (px). Caps the giant-text case.
const BODY_CEILING = 28;
// Title ceiling — larger than body but still bounded so AI-generated long
// titles can't blow up the layout on wide displays.
const TITLE_CEILING = 44;
// Tap-target / button ceiling.
const BUTTON_CEILING = 22;
// Readable column width so body lines don't run edge-to-edge on wide screens.
const READABLE_MAX_WIDTH = 760;

let uidCounter = 0;

export const SlotFlowView: React.FC<SlotFlowViewProps> = ({
  slots,
  content,
  theme: themeProp,
  backgroundUrl,
  backgroundColor,
  slotIntent,
  slotAnimations,
  onResolve,
  onAction,
  previewWidth,
  previewCoarse,
  autoExitMs,
  extraExitMs,
  onExitStart,
}) => {
  const theme = themeProp ?? DEFAULT_THEME;
  // Stable unique class so the scoped <style> (media-query font floor,
  // scrollbar) doesn't leak to other mounts.
  const scopeRef = React.useRef<string>('');
  if (!scopeRef.current) {
    uidCounter += 1;
    scopeRef.current = `slotflow-${uidCounter}`;
  }
  const scope = scopeRef.current;

  const titleSlot = slots.find(s => s.role === 'title');
  const bodySlot = slots.find(s => s.role === 'body');
  const actionSlot = slots.find(s => s.role === 'action');
  // Bug 19a — speaker role (small label above the body). Used by
  // dialogTree spatial so "Character" isn't styled as a giant title.
  const speakerSlot = slots.find(s => s.role === 'speaker');

  const authoredBody = theme.fonts.textFontSize ?? 18;
  const authoredTitle = theme.fonts.titleFontSize ?? 32;
  const authoredButton = theme.fonts.buttonFontSize ?? 16;

  // Fluid term: authored size at DESIGN_WIDTH, growing on wider viewports.
  // The downward side is clamped to 0 via max() so a NARROW window never
  // shrinks the font below the authored size — narrowing should rewrap the
  // text at a readable size, not shrink it. (Aggressive downward scaling was
  // the "AI Info Text too small / unbounded" bug.) clamp()'s floor var is
  // the comfortable narrative minimum; the ceiling caps the giant case.
  // `100vw` at runtime; a fixed simulated width in the VE viewport preview
  // so a narrow preview box reflows like the real device.
  const vwTerm = previewWidth ? `${previewWidth}px` : '100vw';
  const grow = (k: number) => `max(0px, (${vwTerm} - ${DESIGN_WIDTH}px)) * ${k}`;
  const bodyFluid = `calc(${authoredBody}px + ${grow(0.012)})`;
  const titleFluid = `calc(${authoredTitle}px + ${grow(0.016)})`;
  const buttonFluid = `calc(${authoredButton}px + ${grow(0.008)})`;

  const titleText: string = titleSlot?.source ? (content[titleSlot.source] ?? '') : '';
  const bodyText: string = bodySlot?.source ? (content[bodySlot.source] ?? '') : '';
  const speakerText: string = speakerSlot?.source ? (content[speakerSlot.source] ?? '') : '';

  // Bug 17 — honour theme.textEffects in slot mode. Three modes match
  // the absolute path:
  //   none       → text shows immediately
  //   typewriter → reveal one character per (1000/speed) ms
  //   fade       → render full text immediately under a CSS fade-in
  // The slot's enter animation (slotAnimations) still runs in parallel
  // around the card; this controls how the TEXT inside reveals.
  // prefers-reduced-motion suppresses both (the user already opted out
  // of motion globally; the typewriter is just slower motion).
  const textAnim = (theme.textEffects?.animation as 'none' | 'typewriter' | 'fade' | undefined) ?? 'none';
  const typewriterSpeed = theme.textEffects?.typewriterSpeed ?? 30; // chars/sec
  const fadeInMs = theme.textEffects?.fadeInDuration ?? 500;
  const reducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const effectiveTextAnim = reducedMotion ? 'none' : textAnim;
  const titleReveal = useTextReveal(titleText, effectiveTextAnim, typewriterSpeed, fadeInMs);
  const bodyReveal = useTextReveal(bodyText, effectiveTextAnim, typewriterSpeed, fadeInMs);

  // ── preferredLines honoring for the title (soft) ──────────────────────
  // The author can ask a title to be N lines. We bias toward it with a
  // measured max-width, then check the ACTUAL rendered line count and
  // report applied/overridden so the VE can surface degradation. Legibility
  // and available width always win — this only nudges, never forces text
  // under the floor or off-stage.
  const titleSlotName = titleSlot?.name;
  const titlePreferredLines =
    titleSlotName != null
      ? slotIntentFor(slotIntent, titleSlotName)?.preferredLines
      : undefined;
  const titleRef = React.useRef<HTMLDivElement | null>(null);
  const [titleMaxWidth, setTitleMaxWidth] = React.useState<number | undefined>(undefined);
  const onResolveRef = React.useRef(onResolve);
  onResolveRef.current = onResolve;

  // P2.5-3 — re-resolve on viewport/orientation change. CSS clamp/vw/vh +
  // media queries recompute automatically, but the JS-MEASURED title
  // preferredLines bias + the onResolve report below do not — after a
  // rotate the width-specific bias is wrong and the override badge stale.
  // A coalesced tick re-runs the measurement (and resets the stale bias).
  const [viewportTick, setViewportTick] = React.useState(0);
  const lastTickRef = React.useRef(0);
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    let raf = 0;
    const bump = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setViewportTick(t => t + 1));
    };
    window.addEventListener('resize', bump);
    window.addEventListener('orientationchange', bump);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', bump);
      window.removeEventListener('orientationchange', bump);
    };
  }, []);

  React.useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el || !titleText) return;
    if (!titlePreferredLines || titlePreferredLines < 1) {
      // No preference for this title — clear any prior bias, report nothing.
      if (titleMaxWidth !== undefined) setTitleMaxWidth(undefined);
      return;
    }
    // Viewport/orientation changed → the width-specific bias is now wrong.
    // Discard it and let the next pass re-run the two-pass measurement
    // fresh at the new size (also refreshes the override report).
    if (lastTickRef.current !== viewportTick) {
      lastTickRef.current = viewportTick;
      if (titleMaxWidth !== undefined) {
        setTitleMaxWidth(undefined);
        return;
      }
    }

    const cs = window.getComputedStyle(el);
    const fontPx = parseFloat(cs.fontSize) || 16;
    const lineHeightPx = fontPx * 1.25; // matches the title lineHeight below
    const measuredLines = Math.max(1, Math.round(el.offsetHeight / lineHeightPx));

    // First pass (no bias yet): if the title naturally renders on FEWER
    // lines than wanted, narrow the box to coax it toward the target.
    if (titleMaxWidth === undefined) {
      if (measuredLines < titlePreferredLines) {
        // scrollWidth at the current (wrapped) width underestimates the
        // single-line width; approximate single-line width from content.
        const singleLine = el.scrollWidth || el.offsetWidth;
        // A touch generous so we don't overshoot to preferred+1.
        const biased = Math.ceil((singleLine / titlePreferredLines) * 1.06);
        setTitleMaxWidth(biased);
        return; // re-measure next layout pass with the bias applied
      }
    }

    // Report the outcome (applied vs overridden) for override-visibility.
    const applied = measuredLines === titlePreferredLines;
    const res: SlotIntentResolution = {
      slot: titleSlotName!,
      requested: { preferredLines: titlePreferredLines },
      applied,
      overrideReason: applied
        ? undefined
        : measuredLines > titlePreferredLines
          ? `Title needs ${measuredLines} lines at this width to stay legible (wanted ${titlePreferredLines}).`
          : `Title only fills ${measuredLines} line(s) here (wanted ${titlePreferredLines}); not enough text for the target at this width.`,
    };
    onResolveRef.current?.([res]);
    // Depend on the inputs that change the measurement (incl. viewport tick
    // so a rotate / resize re-resolves).
  }, [titleText, titlePreferredLines, titleMaxWidth, titleSlotName, authoredTitle, viewportTick]);

  // Two action shapes: a single "continue" button (aiInfoText / onlineContent
  // — the beat ignores the returned value, any click advances), or the
  // restart/credits pair (endScreen / aiSummary — value is interpreted by
  // EndScreenBeat's substring contract).
  const actionButtons = actionSlot?.buttons ?? [];

  // 3d-3 — consume the action slot's anchor intent.
  //  • h               → row alignment (left / center / right)
  //  • relativeTo:'element' (edge:'below' body) → buttons hug the body
  //    instead of being pinned to the stage bottom (body stops growing)
  //  • gap             → space under the body (below-body) / row padding
  // Absent → today's behavior (centered, pinned to the stage bottom).
  const actionAnchor = actionSlot
    ? slotIntentFor(slotIntent, actionSlot.name)?.anchor
    : undefined;
  const belowBody = actionAnchor?.relativeTo === 'element';
  const actionJustify =
    actionAnchor?.h === 'left'
      ? 'flex-start'
      : actionAnchor?.h === 'right'
        ? 'flex-end'
        : 'center';
  const actionGap =
    typeof actionAnchor?.gap === 'number' ? actionAnchor.gap : undefined;

  const isContinueAction = actionButtons.includes('continueButton');
  const continueText = content.buttonText || 'Continue';
  const showRestart = content.showRestart !== false;
  const showCredits = content.showCredits === true;
  const restartText = content.restartText || 'Play Again';
  const creditsText = content.creditsText || 'Credits';

  const rootStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    background: backgroundUrl ? undefined : backgroundColor,
    backgroundImage: backgroundUrl ? `url(${backgroundUrl})` : undefined,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    // Safe-area insets (notch / Dynamic Island / home indicator). env()
    // resolves to 0 on desktop, so this is free there.
    paddingTop: 'env(safe-area-inset-top, 0px)',
    paddingRight: 'env(safe-area-inset-right, 0px)',
    paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    paddingLeft: 'env(safe-area-inset-left, 0px)',
    // Bug 16 — apply theme.colors.textAlpha (0-100) to the inherited
    // text color using the same #RRGGBB+AA hex pattern used elsewhere.
    // This colors only TEXT (buttons override `color` via buttonStyle),
    // matching the absolute path which applies textAlpha at the text
    // element level, not the container.
    color: applyAlphaToHex(
      theme.colors?.textColor || '#fff',
      Math.max(0, Math.min(1, (theme.colors?.textAlpha ?? 100) / 100))
    ),
    fontFamily: theme.fonts.textFont || 'serif',
  };

  // P3-anim-4 — local exit phase. Defaults to 'enter' so the existing
  // enter-on-mount path is unchanged. The wrapped action handler flips
  // to 'exit', the exit animation plays, then the parent's onAction
  // fires after the longest configured exit duration — so the next
  // beat doesn't take over while the current one is still leaving.
  const [phase, setPhase] = useState<'enter' | 'exit'>('enter');

  // P3-anim — per-slot enter animation. Returns the className + style
  // patch to merge into a slot wrapper. Absent / unsupported preset → no-op.
  // Slide `distance` is PERCENT OF SLOT BOX (default 100 = one slot-box) —
  // never absolute px — so it survives reflow / viewport. Threaded through
  // a `--slotflow-anim-distance` CSS variable on the wrapper.
  const enterAnim = (slotName?: string): { className?: string; style?: React.CSSProperties } => {
    if (!slotName) return {};
    const enter: SlotAnimation | undefined = slotAnimationsFor(slotAnimations, slotName)?.enter;
    if (!enter) return {};
    const presetToClass: Record<string, string | undefined> = {
      'fade': 'slotflow-anim-fade-in',
      'slide-in-left': 'slotflow-anim-slide-in-left',
      'slide-in-right': 'slotflow-anim-slide-in-right',
      'slide-in-top': 'slotflow-anim-slide-in-top',
      'slide-in-bottom': 'slotflow-anim-slide-in-bottom',
      'scale-in': 'slotflow-anim-scale-in',
    };
    const className = presetToClass[enter.preset];
    if (!className) return {}; // graceful no-op for unsupported presets (pulse/shake later)
    const isSlide = enter.preset.startsWith('slide-in-');
    const style: React.CSSProperties & Record<string, string | undefined> = {
      animationDuration: `${enter.duration ?? 400}ms`,
      animationDelay: enter.delay ? `${enter.delay}ms` : undefined,
      animationTimingFunction: enter.easing ?? 'ease-out',
    };
    if (isSlide) {
      const d = typeof enter.distance === 'number' ? enter.distance : 100;
      (style as any)['--slotflow-anim-distance'] = `${d}%`;
    }
    return { className, style };
  };

  // P3-anim-4 — per-slot exit animation. Mirrors enterAnim — same preset
  // vocabulary, just the reverse direction. The slide-out keyframes start
  // from the post-enter resting state (translate:0, opacity:1) and move
  // OUT to the configured distance.
  const exitAnim = (slotName?: string): { className?: string; style?: React.CSSProperties } => {
    if (!slotName) return {};
    const exit: SlotAnimation | undefined = slotAnimationsFor(slotAnimations, slotName)?.exit;
    if (!exit) return {};
    const presetToClass: Record<string, string | undefined> = {
      'fade': 'slotflow-anim-fade-out',
      'slide-in-left': 'slotflow-anim-slide-out-left',
      'slide-in-right': 'slotflow-anim-slide-out-right',
      'slide-in-top': 'slotflow-anim-slide-out-top',
      'slide-in-bottom': 'slotflow-anim-slide-out-bottom',
      'scale-in': 'slotflow-anim-scale-out',
    };
    const className = presetToClass[exit.preset];
    if (!className) return {};
    const isSlide = exit.preset.startsWith('slide-in-');
    const style: React.CSSProperties & Record<string, string | undefined> = {
      animationDuration: `${exit.duration ?? 300}ms`,
      animationDelay: exit.delay ? `${exit.delay}ms` : undefined,
      animationTimingFunction: exit.easing ?? 'ease-in',
    };
    if (isSlide) {
      const d = typeof exit.distance === 'number' ? exit.distance : 100;
      (style as any)['--slotflow-anim-distance'] = `${d}%`;
    }
    return { className, style };
  };

  // P3-anim-4 — pick the phase's animation. Phase swap happens AFTER the
  // user click, so on mount this is always enter; flipping to 'exit'
  // re-evaluates and the exit keyframes start from the resting state.
  const phaseAnim = (slotName?: string) =>
    phase === 'exit' ? exitAnim(slotName) : enterAnim(slotName);

  // Longest exit duration (+delay) across all slots — how long the parent
  // onAction must be deferred so the leaving animation actually completes.
  const computeMaxExitMs = (): number => {
    if (!slotAnimations) return 0;
    let max = 0;
    for (const s of slots) {
      const ex = slotAnimationsFor(slotAnimations, s.name)?.exit;
      if (!ex) continue;
      const dur = (ex.duration ?? 300) + (ex.delay ?? 0);
      if (dur > max) max = dur;
    }
    return max;
  };

  // Wrapped action: if any slot has an exit animation, flip phase, wait
  // for the longest exit to complete, then resolve the parent action.
  // No exits configured → behaves exactly like raw onAction (no delay).
  const dispatchAction = useCallback(
    (id: string) => {
      // P3-anim-7 — wait = max(slot exits, spatial exit forwarded by an
      // outer SpatialFlowView). Both layers play in parallel; neither
      // gets cut off mid-animation. P3-anim-8 — when the OS reports
      // prefers-reduced-motion:reduce, advance ~immediately so the
      // user doesn't wait through an invisible exit. We still call
      // onExitStart and fill-mode:both leaves the slots in the
      // exit-end state for the brief moment before unmount.
      const reduced =
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const wait = reduced
        ? 0
        : Math.max(computeMaxExitMs(), extraExitMs ?? 0);
      if (wait <= 0) {
        if (reduced && (computeMaxExitMs() > 0 || (extraExitMs ?? 0) > 0)) {
          // Still phase-flip so the CSS keyframes' end-state applies
          // (fill-mode:both) — visually a snap rather than a hang.
          setPhase('exit');
          onExitStart?.();
        }
        onAction(id);
        return;
      }
      setPhase('exit');
      onExitStart?.();
      window.setTimeout(() => onAction(id), wait);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onAction, slotAnimations, slots, extraExitMs, onExitStart]
  );

  const handleRestart = () => dispatchAction('restart');
  const handleCredits = () => dispatchAction('credits');
  const handleContinue = () => dispatchAction('continue');

  // P3-anim-4.5 — timer-driven exit for click-less beats (durScreen). Wait
  // (autoExitMs - maxExitMs) ms, then flip to 'exit' so the leaving
  // animation finishes precisely as the renderer's own setTimeout-driven
  // advance fires. If maxExitMs >= autoExitMs (or no exits configured),
  // skip — the beat will simply unmount on advance with no exit.
  useEffect(() => {
    if (!autoExitMs || autoExitMs <= 0) return;
    const wait = computeMaxExitMs();
    if (wait <= 0) return; // no exit configured
    const triggerAfter = autoExitMs - wait;
    if (triggerAfter <= 0) return; // not enough time to play exit
    const id = window.setTimeout(() => setPhase('exit'), triggerAfter);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoExitMs, slotAnimations, slots]);

  // P3-anim-9 — editor Test Exit. SlotAnimationsEditor dispatches this
  // CustomEvent so authors can preview the exit without clicking through
  // the beat (which advances and unmounts). Never fired at runtime.
  useEffect(() => {
    const handler = () => setPhase('exit');
    window.addEventListener('asaps:slotAnimTestExit', handler);
    return () => window.removeEventListener('asaps:slotAnimTestExit', handler);
  }, []);

  return (
    <div className={`${scope} slotflow-root`} style={rootStyle}>
      <style>{`
        /* Comfortable NARRATIVE minimum — not the 16px absolute-legibility
           floor. Long-form story prose below ~18px reads as cramped/lost
           even though it's technically legible. */
        .${scope} { --slotflow-body-floor: ${previewCoarse ? 20 : 18}px; --slotflow-btn-floor: ${previewCoarse ? 18 : 16}px; }
        @media (pointer: coarse) {
          .${scope} { --slotflow-body-floor: 20px; --slotflow-btn-floor: 18px; }
        }
        .${scope} .slotflow-scroll::-webkit-scrollbar { width: 8px; }
        .${scope} .slotflow-scroll::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.25); border-radius: 4px;
        }
        .${scope} .slotflow-btn { transition: background-color 0.15s ease; }
        .${scope} .slotflow-btn:hover { background: ${theme.button?.hoverBackgroundColor || theme.button?.backgroundColor || '#333'}; }
        /* P3-anim — enter preset palette. animationDuration / delay /
           easing come from the per-slot inline style merged at the
           wrapper; slide distance comes from --slotflow-anim-distance
           (percent of slot box). All survive reflow because the keyframe
           targets are relative (% / scale), not pixel-keyed. */
        .${scope} .slotflow-anim-fade-in,
        .${scope} .slotflow-anim-slide-in-left,
        .${scope} .slotflow-anim-slide-in-right,
        .${scope} .slotflow-anim-slide-in-top,
        .${scope} .slotflow-anim-slide-in-bottom,
        .${scope} .slotflow-anim-scale-in,
        .${scope} .slotflow-anim-fade-out,
        .${scope} .slotflow-anim-slide-out-left,
        .${scope} .slotflow-anim-slide-out-right,
        .${scope} .slotflow-anim-slide-out-top,
        .${scope} .slotflow-anim-slide-out-bottom,
        .${scope} .slotflow-anim-scale-out {
          animation-fill-mode: both;
        }
        /* P3-anim-8 — respect prefers-reduced-motion. We collapse the
           animation to ~1ms rather than disabling it entirely so the
           exit timing in dispatchAction (which uses configured duration)
           still resolves and the slot visibly snaps to its target state
           via fill-mode:both. Authors who configured motion still get
           the layout result; users opted-out of motion just don't see
           the in-between frames. */
        @media (prefers-reduced-motion: reduce) {
          .${scope} .slotflow-anim-fade-in,
          .${scope} .slotflow-anim-slide-in-left,
          .${scope} .slotflow-anim-slide-in-right,
          .${scope} .slotflow-anim-slide-in-top,
          .${scope} .slotflow-anim-slide-in-bottom,
          .${scope} .slotflow-anim-scale-in,
          .${scope} .slotflow-anim-fade-out,
          .${scope} .slotflow-anim-slide-out-left,
          .${scope} .slotflow-anim-slide-out-right,
          .${scope} .slotflow-anim-slide-out-top,
          .${scope} .slotflow-anim-slide-out-bottom,
          .${scope} .slotflow-anim-scale-out {
            animation-duration: 1ms !important;
            animation-delay: 0ms !important;
          }
        }
        .${scope} .slotflow-anim-fade-in { animation-name: slotflow-fade-in; }
        .${scope} .slotflow-anim-slide-in-left { animation-name: slotflow-slide-in-left; }
        .${scope} .slotflow-anim-slide-in-right { animation-name: slotflow-slide-in-right; }
        .${scope} .slotflow-anim-slide-in-top { animation-name: slotflow-slide-in-top; }
        .${scope} .slotflow-anim-slide-in-bottom { animation-name: slotflow-slide-in-bottom; }
        .${scope} .slotflow-anim-scale-in { animation-name: slotflow-scale-in; }
        .${scope} .slotflow-anim-fade-out { animation-name: slotflow-fade-out; }
        .${scope} .slotflow-anim-slide-out-left { animation-name: slotflow-slide-out-left; }
        .${scope} .slotflow-anim-slide-out-right { animation-name: slotflow-slide-out-right; }
        .${scope} .slotflow-anim-slide-out-top { animation-name: slotflow-slide-out-top; }
        .${scope} .slotflow-anim-slide-out-bottom { animation-name: slotflow-slide-out-bottom; }
        .${scope} .slotflow-anim-scale-out { animation-name: slotflow-scale-out; }
        @keyframes slotflow-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        /* Bug 17 — text-level fade-in for theme.textEffects.animation='fade'.
           Global keyframes (not scoped) because each text element references
           it by name through inline animation; matches the absolute path. */
        @keyframes slotflow-text-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes slotflow-slide-in-left {
          from { opacity: 0; transform: translateX(calc(-1 * var(--slotflow-anim-distance, 100%))); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes slotflow-slide-in-right {
          from { opacity: 0; transform: translateX(var(--slotflow-anim-distance, 100%)); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes slotflow-slide-in-top {
          from { opacity: 0; transform: translateY(calc(-1 * var(--slotflow-anim-distance, 100%))); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes slotflow-slide-in-bottom {
          from { opacity: 0; transform: translateY(var(--slotflow-anim-distance, 100%)); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes slotflow-scale-in {
          from { opacity: 0; transform: scale(0.7); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes slotflow-fade-out {
          from { opacity: 1; }
          to   { opacity: 0; }
        }
        @keyframes slotflow-slide-out-left {
          from { opacity: 1; transform: translateX(0); }
          to   { opacity: 0; transform: translateX(calc(-1 * var(--slotflow-anim-distance, 100%))); }
        }
        @keyframes slotflow-slide-out-right {
          from { opacity: 1; transform: translateX(0); }
          to   { opacity: 0; transform: translateX(var(--slotflow-anim-distance, 100%)); }
        }
        @keyframes slotflow-slide-out-top {
          from { opacity: 1; transform: translateY(0); }
          to   { opacity: 0; transform: translateY(calc(-1 * var(--slotflow-anim-distance, 100%))); }
        }
        @keyframes slotflow-slide-out-bottom {
          from { opacity: 1; transform: translateY(0); }
          to   { opacity: 0; transform: translateY(var(--slotflow-anim-distance, 100%)); }
        }
        @keyframes slotflow-scale-out {
          from { opacity: 1; transform: scale(1); }
          to   { opacity: 0; transform: scale(0.7); }
        }
      `}</style>

      {/* Body slot — grows & scrolls (stage-bottom action), or sizes to
          content so the action row hugs it (below-body anchor). Either way
          it scrolls internally when content exceeds the column. */}
      <div
        className="slotflow-scroll"
        style={{
          flex: belowBody ? '0 1 auto' : 1,
          maxHeight: belowBody ? '100%' : undefined,
          minHeight: 0,
          overflowY: 'auto',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
        }}
      >
        <div
          style={{
            maxWidth: READABLE_MAX_WIDTH,
            width: '100%',
            padding: 'clamp(24px, 5vh, 64px) clamp(20px, 5vw, 48px)',
            margin: '0 auto',
            // Vertically center short endings; long ones top-align + scroll.
            minHeight: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          {speakerSlot && speakerText && (() => {
            // Bug 19a — small label above the body. No card behind it
            // (it's an attribution, not a content card). Centered, slight
            // opacity to recede next to the body. dialogTree spatial
            // uses this for the NPC name.
            const a = phaseAnim(speakerSlot.name);
            return (
              <div
                className={a.className}
                style={{
                  fontFamily: theme.fonts.textFont || 'sans-serif',
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  textAlign: 'center',
                  opacity: 0.78,
                  marginBottom: 'clamp(6px, 1vh, 12px)',
                  // ~70% of body font size — sits as a label, not a heading.
                  fontSize: `clamp(calc(var(--slotflow-body-floor) - 2px), calc(${bodyFluid} * 0.78), 22px)`,
                  ...a.style,
                }}
              >
                {speakerText}
              </div>
            );
          })()}
          {titleSlot && titleText && (() => {
            const a = phaseAnim(titleSlotName);
            return (
              <div
                ref={titleRef}
                className={a.className}
                style={{
                  fontFamily: theme.fonts.titleFont || theme.fonts.textFont || 'serif',
                  fontWeight: 700,
                  lineHeight: 1.25,
                  textAlign: 'center',
                  marginBottom: 'clamp(16px, 3vh, 32px)',
                  fontSize: `clamp(calc(var(--slotflow-body-floor) + 4px), ${titleFluid}, ${TITLE_CEILING}px)`,
                  // Bug 14 — apply theme.textBox so titles match the absolute
                  // path's card styling (background, border, radius, padding,
                  // opacity). Skipped when hideTitleTextBox is true (VN-style
                  // splash titles float on the spatial image).
                  ...textBoxCardStyle(theme, { isTitle: true }),
                  // preferredLines bias: a measured max-width that coaxes the
                  // title toward the author's target line count. Stays
                  // centered; never exceeds the readable column. Sized
                  // around the text — `inline-block` so the card hugs the
                  // text instead of stretching to the column width.
                  ...(titleMaxWidth
                    ? { maxWidth: titleMaxWidth, marginLeft: 'auto', marginRight: 'auto' }
                    : { marginLeft: 'auto', marginRight: 'auto' }),
                  display: 'inline-block',
                  alignSelf: 'center',
                  ...titleReveal.fadeStyle,
                  ...a.style,
                }}
              >
                {titleReveal.rendered}
              </div>
            );
          })()}
          {bodyText && (() => {
            const a = phaseAnim(bodySlot?.name);
            return (
              <div
                className={a.className}
                style={{
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.6,
                  textAlign: 'center',
                  fontSize: `clamp(var(--slotflow-body-floor), ${bodyFluid}, ${BODY_CEILING}px)`,
                  // Bug 14 — wrap body text in the theme's card. Card
                  // hugs short text but wraps long paragraphs at the
                  // readable column width (max-width on a fit-content
                  // box). Without this, a one-word subtitle (e.g. the
                  // titleScreen author) gets stretched to the full
                  // readable column and looks oversized.
                  width: 'fit-content',
                  maxWidth: '100%',
                  alignSelf: 'center',
                  ...textBoxCardStyle(theme, { isTitle: false }),
                  ...bodyReveal.fadeStyle,
                  ...a.style,
                }}
              >
                {bodyReveal.rendered}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Action slot — pinned, always visible, overlap-proof.
          Single continue (aiInfoText/onlineContent) vs restart/credits
          (endScreen/aiSummary).
          Per-button anchors (slotIntent[action].buttonAnchors[buttonId])
          lift a button OUT of the flex row and position it absolutely
          against the stage; un-anchored buttons stay in the row. */}
      {actionSlot && (() => {
        const a = phaseAnim(actionSlot.name);
        // Catalogue every button the beat exposes here, paired with the
        // identifier the schema uses in `actionSlot.buttons` so the
        // anchor map keys line up with what the VE writes.
        const buttonCatalog: Array<{
          id: string;
          text: string;
          onClick: () => void;
          show: boolean;
        }> = isContinueAction
          ? [{ id: 'continueButton', text: continueText, onClick: handleContinue, show: true }]
          : [
              { id: 'creditsButton', text: creditsText, onClick: handleCredits, show: showCredits },
              { id: 'restartButton', text: restartText, onClick: handleRestart, show: showRestart },
            ];
        const buttonAnchors = (actionSlot
          ? slotIntentFor(slotIntent, actionSlot.name)?.buttonAnchors
          : undefined) as Record<string, SlotAnchor> | undefined;
        const flowButtons = buttonCatalog.filter(
          b => b.show && !buttonAnchors?.[b.id]
        );
        const anchoredButtons = buttonCatalog.filter(
          b => b.show && buttonAnchors?.[b.id]
        );
        return (
          <>
            <div
              className={a.className}
              style={{
                flexShrink: 0,
                display: 'flex',
                justifyContent: actionJustify,
                gap: 'clamp(12px, 2vw, 24px)',
                // gap intent controls the space above the row (under the body in
                // below-body mode; bottom inset stays comfortable either way).
                paddingTop: actionGap != null ? actionGap : 'clamp(16px, 3vh, 28px)',
                paddingBottom: 'clamp(16px, 3vh, 28px)',
                paddingLeft: 16,
                paddingRight: 16,
                // When every button is individually anchored the row is
                // empty; collapse its vertical inset so it doesn't leave
                // a phantom stripe at the bottom.
                ...(flowButtons.length === 0
                  ? { paddingTop: 0, paddingBottom: 0 }
                  : {}),
                ...a.style,
              }}
            >
              {flowButtons.map(b => (
                <button
                  key={b.id}
                  className="slotflow-btn"
                  onClick={b.onClick}
                  style={buttonStyle(theme, buttonFluid)}
                >
                  {b.text}
                </button>
              ))}
            </div>
            {anchoredButtons.map(b => {
              const anchor = buttonAnchors![b.id];
              return (
                <button
                  key={`anchored-${b.id}`}
                  className={`slotflow-btn ${a.className ?? ''}`}
                  onClick={b.onClick}
                  style={{
                    ...buttonStyle(theme, buttonFluid),
                    position: 'absolute',
                    ...anchoredButtonPlacement(anchor),
                    zIndex: 4,
                    ...a.style,
                  }}
                >
                  {b.text}
                </button>
              );
            })}
          </>
        );
      })()}
    </div>
  );
};

/**
 * Resolve a SlotAnchor into the `position: absolute` placement for a
 * per-button anchor. Stage-relative (the slot/element forms are not
 * supported here — per-button anchors always pin against the root). Gap
 * is the inset from the chosen edges; offset.x / offset.y nudge from the
 * resolved point. Falls back to bottom-center when ambiguous so a
 * partially-configured anchor still renders somewhere visible.
 */
function anchoredButtonPlacement(anchor: SlotAnchor): React.CSSProperties {
  const inset = typeof anchor.gap === 'number' ? anchor.gap : 16;
  const ox = anchor.offset?.x ?? 0;
  const oy = anchor.offset?.y ?? 0;
  const out: React.CSSProperties = {};
  // Horizontal.
  if (anchor.h === 'left') {
    out.left = `calc(${inset + ox}px + env(safe-area-inset-left, 0px))`;
  } else if (anchor.h === 'right') {
    out.right = `calc(${inset - ox}px + env(safe-area-inset-right, 0px))`;
  } else {
    // center (or unset) — center on the stage with optional offset
    out.left = `calc(50% + ${ox}px)`;
    out.transform = (out.transform ?? '') + ' translateX(-50%)';
  }
  // Vertical.
  if (anchor.v === 'top') {
    out.top = `calc(${inset + oy}px + env(safe-area-inset-top, 0px))`;
  } else if (anchor.v === 'middle') {
    out.top = `calc(50% + ${oy}px)`;
    out.transform = (out.transform ?? '') + ' translateY(-50%)';
  } else {
    // bottom (default)
    out.bottom = `calc(${inset - oy}px + env(safe-area-inset-bottom, 0px))`;
  }
  if (typeof out.transform === 'string') {
    out.transform = out.transform.trim();
    if (out.transform === '') delete out.transform;
  }
  return out;
}

function buttonStyle(theme: RenderThemeSettings, fluid: string): React.CSSProperties {
  return {
    fontFamily: theme.fonts.buttonFont || theme.fonts.textFont || 'serif',
    fontSize: `clamp(var(--slotflow-btn-floor), ${fluid}, ${BUTTON_CEILING}px)`,
    color: theme.button?.textColor || '#fff',
    background: theme.button?.backgroundColor || 'rgba(255,255,255,0.12)',
    border: `${theme.button?.borderWidth ?? 1}px solid ${theme.button?.borderColor || 'rgba(255,255,255,0.4)'}`,
    borderRadius: `${theme.button?.borderRadius ?? 8}px`,
    padding: '0 clamp(20px, 3vw, 36px)',
    minHeight: 44, // Apple HIG minimum tap target
    minWidth: 120,
    cursor: 'pointer',
    fontWeight: 600,
  };
}

/**
 * Bug 14 — wire theme.textBox into the responsive flow.
 *
 * The absolute path wraps every dialog/text element in a "card" with
 * background, border, padding, border-radius, and opacity from
 * `theme.textBox`. The responsive flow used to bare-render text on
 * the stage background, so a project theme like ASAPS's default
 * (dark blue surface + blue border + 90% opacity) was invisible — text
 * just floated. This helper produces the same card styling so slot
 * mode matches the absolute mode's visual contract.
 *
 * Bug 16 — when the theme provides a `textboxFrameUrl` (typically a
 * 9-slice-style frame image imported from a Ren'Py theme), the absolute
 * path uses it as a stretched background-image with no border or radius.
 * Match that here so themed projects don't suddenly lose their frame.
 *
 * Returns `{ background:'transparent', border:'none', padding:0 }` when
 * the card is hidden (titles with `hideTitleTextBox:true`, or no
 * effective theme.textBox). Callers should spread the result into the
 * text element's inline style.
 */
function textBoxCardStyle(
  theme: RenderThemeSettings,
  opts: { isTitle: boolean }
): React.CSSProperties {
  const tb = theme.textBox;
  // Title slot honours `hideTitleTextBox` (VN splash style — title text
  // floats on the spatial image without a card).
  const hideForTitle = opts.isTitle && tb?.hideTitleTextBox === true;
  if (!tb || hideForTitle) {
    return { background: 'transparent', border: 'none', padding: 0 };
  }
  // Frame-image branch: the image carries its own border/radius/shadow,
  // so we suppress the CSS border + radius and let the bitmap own the
  // look. Padding still applies — the frame is sized 100% × 100% of
  // the card so its safe area must match the inner padding.
  if (theme.textboxFrameUrl) {
    return {
      backgroundImage: `url(${theme.textboxFrameUrl})`,
      backgroundSize: '100% 100%',
      backgroundRepeat: 'no-repeat',
      backgroundColor: 'transparent',
      border: 'none',
      borderRadius: 0,
      padding: `${tb.padding ?? 16}px`,
    };
  }
  const opacityFrac = Math.max(0, Math.min(1, (tb.opacity ?? 100) / 100));
  // Same #RRGGBB + AA hex append the absolute path uses, so colors
  // resolve identically. Non-hex (rgb()/named) values pass through.
  const bg = applyAlphaToHex(tb.backgroundColor, opacityFrac);
  return {
    background: bg,
    border: `${tb.borderWidth ?? 0}px solid ${tb.borderColor || 'transparent'}`,
    borderRadius: `${tb.borderRadius ?? 0}px`,
    // theme.textBox.padding is the AUTHORED inner padding. Apply on all
    // sides so the card breathes. The outer flow container already
    // provides margin between title and body via marginBottom.
    padding: `${tb.padding ?? 16}px`,
  };
}

/**
 * Bug 17 — text reveal hook for theme.textEffects in slot mode.
 *
 * Returns the reveal state for a piece of text: which characters to
 * show, whether a fade-in should be active, and the CSS animation
 * description for the wrapper.
 *
 * Mirrors the absolute path (PositionedBeatView.tsx:2855) but lighter:
 * we don't need skip-on-click here because slot mode never blocks on
 * the reveal — the action row stays clickable, and a click on a choice
 * naturally advances past the reveal.
 */
function useTextReveal(
  text: string,
  animation: 'none' | 'typewriter' | 'fade',
  speed: number,
  fadeInMs: number
): { rendered: string; fadeStyle: React.CSSProperties } {
  const [shown, setShown] = React.useState<string>(
    animation === 'typewriter' ? '' : text
  );
  // Re-run when text or mode changes. Intervals are cleared in cleanup
  // so a beat change mid-reveal doesn't leak.
  React.useEffect(() => {
    if (animation !== 'typewriter') {
      setShown(text);
      return;
    }
    setShown('');
    let i = 0;
    const msPerChar = 1000 / Math.max(1, speed);
    const handle = window.setInterval(() => {
      i += 1;
      setShown(text.slice(0, i));
      if (i >= text.length) window.clearInterval(handle);
    }, msPerChar);
    return () => window.clearInterval(handle);
  }, [text, animation, speed]);
  const fadeStyle: React.CSSProperties =
    animation === 'fade' && text
      ? { animation: `slotflow-text-fade-in ${fadeInMs}ms ease-in both` }
      : {};
  return { rendered: shown, fadeStyle };
}

/** #RRGGBB → #RRGGBBAA blended at `alpha` (0..1). Non-hex inputs pass through. */
export function applyAlphaToHex(color: string | undefined, alpha: number): string {
  if (!color) return 'transparent';
  if (!color.startsWith('#') || (color.length !== 7 && color.length !== 4)) {
    return color;
  }
  const hex = color.length === 4
    ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
    : color;
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
}
