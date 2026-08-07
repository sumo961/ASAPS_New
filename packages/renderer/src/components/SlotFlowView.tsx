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
import type { SlotIntent, SlotIntentResolution, SlotAnimations, SlotAnimation, SlotAnchor, Location, AnimationPath } from '@asaps/core';
import { slotIntentFor, slotAnimationsFor, uiString } from '@asaps/core';
import { DEFAULT_THEME, type RenderThemeSettings, type SpriteSheetData } from './PositionedBeatView';
import type { SlotSpec } from '../utils/slotLayout';
import { KeypadElement } from './KeypadElement';
import { QRScanElement } from './QRScanElement';
import { ImageInputElement } from './ImageInputElement';
import { WebViewElement } from './WebViewElement';
import { ARSceneElement } from './ARSceneElement';
import { runSlotPath } from '../utils/pathAnimation';
import { ResponsiveCharacterLayer } from './ResponsiveCharacterLayer';
import { TimerProgressBar } from './TimerProgressBar';

interface SlotFlowViewProps {
  beatType: string;
  slots: SlotSpec[];
  content: Record<string, any>;
  /** May be undefined (no theme set); falls back to DEFAULT_THEME like the absolute path. */
  theme?: RenderThemeSettings;
  backgroundUrl?: string | null;
  /** How the background image fills the stage: 'cover' (fill, crop edges —
   *  default) or 'contain' (show the whole image, letterboxed). */
  backgroundFit?: 'cover' | 'contain';
  backgroundColor: string;
  /**
   * Video that fills the stage behind the slot composition (videoBeat).
   * When present, a `<video>` element is mounted at z-index:0 with the
   * slots layered on top. Native fluid sizing handles responsiveness.
   * onEnded fires onAction('continue') so the beat resolves at video end.
   */
  videoUrl?: string | null;
  videoAutoplay?: boolean;
  videoControls?: boolean;
  /** WebVTT blob URL for the video's captions/subtitles (already language-resolved). */
  captionsVttUrl?: string;
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
  /** Emulated viewport height (device-size preview) — pairs with previewWidth. */
  previewHeight?: number;
  /**
   * VE viewport simulation for touch presets (phone/tablet): forces the
   * coarse-pointer narrative floor that `@media (pointer: coarse)` would
   * apply on the device, since the editor itself runs on a fine pointer.
   */
  previewCoarse?: boolean;
  /**
   * Read-gate model — two-phase layout for multi-action beats and
   * dimmed-Continue for single-action beats. When `requireFullRead`
   * is true (default for slot/spatial beats), the action area is
   * unreachable until the player has seen the bottom of the body.
   *
   *  - Single-action beats (Continue / Start / Restart-only): the
   *    body grows naturally, the outer container scrolls when
   *    needed, the action button is rendered in-flow at the end of
   *    the body. While the button is off-screen it's dimmed and
   *    pointer-events:none; it becomes active as soon as it enters
   *    the viewport (IntersectionObserver on the button itself).
   *
   *  - Multi-action beats (restart+credits, dialogTree choices via
   *    dynamicActions, etc.): PHASE 1 has the body growing naturally
   *    with outer-scroll and the action area hidden. When the body's
   *    end-sentinel enters the viewport, the gate is "earned":
   *    PHASE 2 flips the body to a fixed flex:1 region with internal
   *    scroll and pins the action area at the bottom of the stage,
   *    where it activates. Once earned, the gate is sticky — going
   *    back into PHASE 1 doesn't happen.
   *
   *  - `requireFullRead: false` opts out: gate starts earned, layout
   *    is PHASE 2 from the first frame, classic always-visible
   *    action area. For authors who don't want to gate reading.
   */
  requireFullRead?: boolean;
  /**
   * Fires when the read-gate transitions. Parent layers (SpatialFlowView
   * for dialogTree dynamicActions and hotspots) listen so they can
   * dim/disable their own interactive elements while phase 1 holds.
   * Single-shot per mount (sticky once earned).
   */
  onGateChange?: (earned: boolean) => void;
  /**
   * Forces the multi-action two-phase model even when the slot spec
   * has no action buttons. Used by SpatialFlowView to gate the OUTER
   * choice layer (dynamicActions / hotspots) when the beat has
   * multiple choices — the inner slot spec only carries body /
   * speaker, so SlotFlowView can't detect "multi-action" on its own
   * for those beats. Parent passes true when its own action shape is
   * multi-choice.
   */
  forceMultiActionGate?: boolean;
  /**
   * Optional content rendered INSIDE the inner scroll surface, after
   * the body card. Used by SpatialFlowView for dialogTree's
   * dynamicActions: putting the choices in the same scroller as the
   * body means the player's scroll gesture literally drags them into
   * view from below — they're already in the DOM, just below the
   * viewport at scrollTop=0. The body wrapper above is sized to
   * `min-height: 100%` of the scroller so the body fills the stage on
   * arrival, and scrolling reveals this content one row at a time.
   */
  extraInScrollAfterBody?: React.ReactNode;
  /**
   * Free-positioned sprite layer (mirror of SpatialFlowView's). When
   * a slot-mode beat carries character / prop locations (e.g. an
   * infoText with a player avatar), we mount a ResponsiveCharacterLayer
   * over the slot content so the sprites and their AnimationPath
   * motion travel through the responsive renderer alongside the slot
   * elements. Layer is absolutely positioned and pointer-events:none,
   * so it never blocks the slot UI underneath.
   */
  characterLocations?: Location[];
  animations?: AnimationPath[];
  characterResolver?: (characterId: string, stateId?: string) => string | undefined;
  assetResolver?: (assetId: string) => string | undefined;
  spriteDataResolver?: (characterId: string) => SpriteSheetData | null;
  /**
   * Default-target countdown — when present and visible, a green
   * progress bar pinned to the top of the stage shows the remaining
   * time before auto-advance. The wrapping renderer publishes this
   * state (it owns the timer); we subscribe so the bar smoothly
   * tracks each tick instead of re-mounting per re-render.
   */
  timerState?: {
    totalTime: number;
    remainingTime: number;
    visible: boolean;
    label?: string;
  };
  onSubscribeTimerState?: (listener: (state: SlotFlowViewProps['timerState']) => void) => () => void;
  /**
   * Dynamic action-row buttons. When set, the action slot uses these
   * choices INSTEAD of the schema-defined fixed buttons (continueButton /
   * restartButton / etc.). Each button's `id` is what gets passed to
   * onAction when clicked. MultiChoice is the first consumer; DialogTree
   * positioned-mode-in-responsive will follow once it migrates to
   * layoutTemplate. The schema's `actionSlot.buttons` is still honoured
   * when dynamicChoices is absent (e.g. infoText's Continue).
   */
  dynamicChoices?: { id: string; text: string }[];
  /**
   * Visual layout template for the slot composition. Drives the high-
   * level flex direction at the root:
   *   'stacked'      — speaker above body, body above action (default)
   *   'conversation' — body scroller and action row sit SIDE-BY-SIDE,
   *                    creating the back-and-forth "NPC says X / player
   *                    picks" look. Read-gate is implicitly bypassed
   *                    (the conversational layout is short and snappy;
   *                    nothing to scroll past).
   * Other templates ('chat-bubble' / 'chat-scroll' / 'custom') do NOT
   * route through SlotFlowView yet — chat modes use ChatDialogView;
   * 'custom' will read slotIntent anchors in a later commit. Unset →
   * 'stacked'.
   */
  layoutTemplate?: 'stacked' | 'conversation' | 'custom';
  /** Editor mode — when true, slot wrappers (title / body / action
   *  buttons) become clickable so the host Visual Editor can select
   *  a slot from the stage. In runtime mode (default) clicks pass
   *  through to onAction etc. */
  editorMode?: boolean;
  /** Slot row key currently selected in the left panel.
   *  Shape: "slot:{slotName}" or "slot:{slotName}:{buttonId}".
   *  The matching slot/button renders with a yellow outline. */
  selectedSlotKey?: string;
  /** Fired when the author clicks a slot or button in editor mode.
   *  buttonId is set for action-button clicks, omitted otherwise. */
  onSlotSelect?: (slotName: string, buttonId?: string) => void;
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
  beatType,
  slots,
  content,
  theme: themeProp,
  backgroundUrl,
  backgroundFit = 'cover',
  backgroundColor,
  videoUrl,
  videoAutoplay,
  videoControls,
  captionsVttUrl,
  slotIntent,
  slotAnimations,
  onResolve,
  onAction,
  previewWidth,
  previewHeight,
  previewCoarse,
  autoExitMs,
  extraExitMs,
  onExitStart,
  requireFullRead = true,
  onGateChange,
  forceMultiActionGate = false,
  extraInScrollAfterBody,
  characterLocations,
  animations,
  characterResolver,
  assetResolver,
  spriteDataResolver,
  editorMode,
  selectedSlotKey,
  onSlotSelect,
  timerState: initialTimerState,
  onSubscribeTimerState,
  dynamicChoices,
  layoutTemplate = 'stacked',
}) => {
  const isConversation = layoutTemplate === 'conversation';
  const isCustom = layoutTemplate === 'custom';
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
  // inputText's single-line text field. Submit on Enter or via the
  // paired action button — both fire onAction(currentValue) so the
  // beat resolves with the user's typed string.
  const inputSlot = slots.find(s => s.role === 'input');
  const [inputValue, setInputValue] = React.useState('');
  // keypad beat — virtual numeric/PIN/phone keypad. KeypadElement
  // manages its own display + submit; onSubmit(code) → onAction(code)
  // so the beat resolves with the entered code (same pattern as input).
  const keypadSlot = slots.find(s => s.role === 'keypad');
  // qrScan beat — live camera with QR decode. QRScanElement owns the
  // permission flow + decode loop; onDecode(code) → onAction(code).
  // Reserved sentinels 'cancelled' / 'permission_denied' propagate so
  // the beat can branch on the no-scan path.
  const cameraSlot = slots.find(s => s.role === 'camera');
  // inputImage beat — photo picker / camera capture. ImageInputElement
  // owns pick + preview + downscale + its own submit/skip buttons;
  // onSubmit(dataUrl) / onCancel → onAction with the data URL or the
  // reserved 'cancelled' sentinel.
  const imageInputSlot = slots.find(s => s.role === 'imageInput');
  // webView beat — embedded external page. WebViewElement picks
  // iframe vs Electron <webview> at runtime. Resolves with 'done',
  // a matched URL, or a postMessage value via onAction.
  const webViewSlot = slots.find(s => s.role === 'webview');
  // arBeat — AR scene. ARSceneElement owns camera + (Phase 1b) marker
  // tracking; onAction receives the tapped anchor's onTap value, or
  // 'cancelled' / 'permission_denied' sentinels.
  const arSlot = slots.find(s => s.role === 'ar');

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
  // Device-size emulation: when the preview clamps the stage to preset
  // pixels, raw vw/vh still reference the WINDOW — sizes computed from
  // them overflow the emulated frame. These helpers substitute emulated
  // dimensions when provided (the real player passes nothing → true units).
  const vwU = (n: number): string => previewWidth ? `${((n * previewWidth) / 100).toFixed(1)}px` : `${n}vw`;
  const vhU = (n: number): string => previewHeight ? `${((n * previewHeight) / 100).toFixed(1)}px` : `${n}vh`;
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
    // Subtract vertical chrome (padding + border) so we measure text
    // height, not box height. Without this, a 1-line title in a card
    // with 20px padding + 3px border reads as offsetHeight ≈ 94px and
    // rounds to 2 lines.
    const padTop = parseFloat(cs.paddingTop) || 0;
    const padBottom = parseFloat(cs.paddingBottom) || 0;
    const borderTop = parseFloat(cs.borderTopWidth) || 0;
    const borderBottom = parseFloat(cs.borderBottomWidth) || 0;
    const textHeight = Math.max(0, el.offsetHeight - padTop - padBottom - borderTop - borderBottom);
    const measuredLines = Math.max(1, Math.round(textHeight / lineHeightPx));

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

    // Threshold probe: at what stage width does the preferred line
    // count first hold? Clone the title offscreen, sweep widths via
    // binary search, find the smallest column width that produces
    // `titlePreferredLines`. Stage width ≈ column width + a constant
    // accounting for the body scroller's clamp(20px, 5vw, 48px)
    // padding and the title card's internal padding. Useful to
    // surface as "holds ≥ Xpx" in the override badge so authors
    // know what viewport size their intent kicks back in at.
    let holdsAboveWidth: number | undefined;
    try {
      const clone = el.cloneNode(true) as HTMLElement;
      clone.style.position = 'absolute';
      clone.style.visibility = 'hidden';
      clone.style.pointerEvents = 'none';
      clone.style.left = '-99999px';
      clone.style.top = '0';
      // Remove the title's max-width bias so the clone can be probed
      // freely; preserve font + textbox style by using cloneNode.
      clone.style.maxWidth = '';
      clone.style.marginLeft = '0';
      clone.style.marginRight = '0';
      clone.style.display = 'block';
      // Pin computed font properties — cloneNode preserves inline
      // styles + classes but NOT inherited values. Reparenting to
      // document.body drops the title's inherited font-size, font-
      // family, weight, etc., so the clone would measure at the body
      // defaults (typically 16px sans-serif) instead of the on-page
      // 38px Cinzel. That produces a wildly wrong threshold.
      clone.style.fontFamily = cs.fontFamily;
      clone.style.fontSize = cs.fontSize;
      clone.style.fontWeight = cs.fontWeight;
      clone.style.fontStyle = cs.fontStyle;
      clone.style.fontVariant = cs.fontVariant;
      clone.style.letterSpacing = cs.letterSpacing;
      clone.style.wordSpacing = cs.wordSpacing;
      clone.style.lineHeight = cs.lineHeight;
      clone.style.textTransform = cs.textTransform;
      clone.style.whiteSpace = cs.whiteSpace;
      // Strip padding/border — we're measuring pure text geometry,
      // not the title card's visual chrome. Otherwise offsetHeight
      // includes the box chrome and a 1-line title looks like 2 lines
      // after dividing by lineHeight.
      clone.style.padding = '0';
      clone.style.border = '0';
      clone.style.boxSizing = 'content-box';
      document.body.appendChild(clone);
      const linesAt = (width: number): number => {
        clone.style.width = `${width}px`;
        return Math.max(1, Math.round(clone.offsetHeight / lineHeightPx));
      };
      // Single-line width = the title's natural unwrapped width.
      // Pad by a few px to absorb subpixel quantization — max-content
      // sometimes rounds down past the actual fit width, which would
      // make linesAt(singleLineW) return 2 lines instead of 1.
      clone.style.width = 'max-content';
      const singleLineW = Math.max(40, clone.offsetWidth) + 8;
      // Binary search for the smallest column width where the line
      // count drops to ≤ preferredLines. Search range bracketed by
      // singleLineWidth / preferredLines (lower) and singleLineWidth
      // (upper — at full width, lines == 1 ≤ preferred).
      let lo = Math.max(40, Math.floor(singleLineW / titlePreferredLines));
      let hi = singleLineW;
      // If even the full single-line width doesn't satisfy, bail.
      if (linesAt(hi) <= titlePreferredLines) {
        // Binary search: find smallest width with lines <= preferred.
        while (lo < hi) {
          const mid = Math.floor((lo + hi) / 2);
          if (linesAt(mid) <= titlePreferredLines) {
            hi = mid;
          } else {
            lo = mid + 1;
          }
        }
        const columnW = lo;
        // Stage threshold = title's column width + an offset for the
        // body scroller's outer padding + the title card's internal
        // padding. Empirically ~96 (2 × 48 scroller padding at the
        // clamp ceiling) + 40 (card padding) = ~136. Slightly generous
        // so the badge underclaims rather than overclaims.
        holdsAboveWidth = Math.round(columnW + 150);
      }
      document.body.removeChild(clone);
    } catch {
      // DOM clone can fail in headless / SSR contexts. Silent skip —
      // the badge still works without the threshold value.
    }

    const res: SlotIntentResolution = {
      slot: titleSlotName!,
      requested: { preferredLines: titlePreferredLines },
      applied,
      holdsAboveWidth,
      overrideReason: applied
        ? undefined
        : measuredLines > titlePreferredLines
          ? `Title needs ${measuredLines} lines at this width to stay legible (wanted ${titlePreferredLines}).${holdsAboveWidth ? ` Holds ≥ ${holdsAboveWidth}px.` : ''}`
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
  // Body anchor — drives horizontal alignment of the card within the
  // column flow. Custom-template authoring writes this from the 3×3
  // picker in VisualPropertiesPanel. (Speaker rides along with the
  // body card; there's no separate speaker anchor.) Only read for the
  // custom template so anchors set during a custom session don't leak
  // into stacked / conversation when the author switches templates.
  const bodyAnchor = isCustom && bodySlot
    ? slotIntentFor(slotIntent, bodySlot.name)?.anchor
    : undefined;
  const horizontalAlignSelf = (h?: 'left' | 'center' | 'right') =>
    h === 'left' ? 'flex-start' : h === 'right' ? 'flex-end' : 'center';
  // Custom-template absolute placement. Each anchored slot becomes a
  // position:absolute wrapper inside the root, anchored to one of the 9
  // (h × v) zones with a small stage margin. transform handles centering
  // for the 'center' / 'middle' values. Returns null when there's no
  // anchor (slot keeps the default flow layout).
  const customSlotStyle = (anchor?: { h?: 'left' | 'center' | 'right'; v?: 'top' | 'middle' | 'bottom' }): React.CSSProperties | null => {
    if (!isCustom || !anchor || (!anchor.h && !anchor.v)) return null;
    const inset = `clamp(16px, ${vwU(4)}, 48px)`;
    const style: React.CSSProperties = { position: 'absolute' };
    const tx: string[] = [];
    if (anchor.h === 'left') style.left = inset;
    else if (anchor.h === 'right') style.right = inset;
    else { style.left = '50%'; tx.push('translateX(-50%)'); }
    if (anchor.v === 'top') style.top = inset;
    else if (anchor.v === 'bottom') style.bottom = inset;
    else { style.top = '50%'; tx.push('translateY(-50%)'); }
    if (tx.length > 0) style.transform = tx.join(' ');
    return style;
  };
  // Speaker rides along with the body card — it's a small label above
  // the prompt, not an independently positioned element. We omit a custom
  // anchor here so the speaker always stays inside the body scroller and
  // moves wherever the body moves.
  const customBodyStyle = customSlotStyle(bodyAnchor);
  const customActionStyle = customSlotStyle(actionAnchor);
  const belowBody = actionAnchor?.relativeTo === 'element';
  // h-derived positioning of the action panel is custom-template only —
  // otherwise an anchor set during a custom session keeps left/right
  // pulling buttons around in stacked / conversation when the author
  // switches templates. gap and relativeTo stay live across all
  // templates because they're orthogonal layout signals.
  const actionAnchorH = isCustom ? actionAnchor?.h : undefined;
  const actionJustify =
    actionAnchorH === 'left'
      ? 'flex-start'
      : actionAnchorH === 'right'
        ? 'flex-end'
        : 'center';
  const actionGap =
    typeof actionAnchor?.gap === 'number' ? actionAnchor.gap : undefined;

  // dynamicChoices (MultiChoice etc.) override the schema-fixed
  // button catalog. When set, isContinueAction is false (a multi-
  // choice beat with 1 dynamic choice is still gated like a multi-
  // action beat — the choice is a fork, not a Continue).
  const hasDynamicChoices = (dynamicChoices?.length ?? 0) > 0;
  const isContinueAction = !hasDynamicChoices && actionButtons.includes('continueButton');
  const continueText = content.buttonText || uiString('continue');
  const showRestart = content.showRestart !== false;
  const showCredits = content.showCredits === true;
  const restartText = content.restartText || uiString('playAgain');
  const creditsText = content.creditsText || uiString('credits');

  // Read-gate model — count VISIBLE action items to decide the layout
  // shape. Single (1 forward path) uses Option A — body grows, outer
  // scrolls, action in-flow at the end, dimmed until visible in
  // viewport. Multi (2+ choices) uses two-phase Option B — phase 1
  // is identical to single-action with action area hidden; phase 2
  // activates once the body's end-sentinel has been seen, flipping
  // the body to fixed flex:1 with internal scroll and revealing the
  // action area pinned at the bottom.
  const visibleActionCount = hasDynamicChoices
    ? dynamicChoices!.length
    : isContinueAction
      ? 1
      : (actionButtons.includes('creditsButton') && showCredits ? 1 : 0)
        + (actionButtons.includes('restartButton') && showRestart ? 1 : 0);
  const isMultiAction = visibleActionCount > 1 || forceMultiActionGate;

  // Sticky once true — earned by either the content fitting on its
  // own or by the player scrolling to the end-sentinel. Conversation
  // layout bypasses the gate entirely: it's a short snappy back-and-
  // forth, the action row sits beside the body from the start.
  const [gateEarned, setGateEarned] = useState(isConversation || !requireFullRead);

  // Stage-root + end-of-body sentinel for the gate.
  // Detection uses the ACTUAL scrolling element's scrollTop /
  // scrollHeight / clientHeight (whichever element is currently
  // scrolling — phase-1's slot-root or phase-2's inner body card).
  // This is more robust than rect-comparing the sentinel: the
  // sentinel-rect approach fires its first check on a layout that
  // doesn't yet include the (still-loading) body content, false-
  // earning the gate. The scroll-metrics approach naturally reflects
  // overflow because both scrollHeight and clientHeight come from
  // the live box; if scrollHeight grows when content arrives, the
  // gate stays unearned until the player actually scrolls to the end.
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (gateEarned) return;
    const root = rootRef.current;
    if (!root) return;

    // Single inner scroller owns scroll in BOTH phases — phase 1
    // (no action row) has the card at full stage height; phase 2 (action
    // row visible) has the card at constrained height, but it's still
    // the same scroll surface, so scrollTop carries naturally across.
    const scrollEl: HTMLElement = (root.querySelector('.slotflow-scroll') as HTMLElement) || root;

    const check = () => {
      if (gateEarned) return;
      const sh = scrollEl.scrollHeight;
      const ch = scrollEl.clientHeight;
      const st = scrollEl.scrollTop;
      let contentChild: HTMLElement | null = null;
      for (const c of Array.from(scrollEl.children) as HTMLElement[]) {
        if (c.tagName !== 'STYLE' && c.tagName !== 'SCRIPT') {
          contentChild = c;
          break;
        }
      }
      const childH = contentChild?.offsetHeight ?? 0;
      if (childH === 0) return;
      // No overflow → content fits → gate earned immediately.
      if (sh <= ch + 1) {
        setGateEarned(true);
        return;
      }
      // Overflow + scrolled to (or near) the end → gate earned.
      // Allow a 4px tolerance for fractional rounding on Retina.
      if (st + ch >= sh - 4) {
        setGateEarned(true);
      }
    };

    const raf = requestAnimationFrame(check);
    const ro = new ResizeObserver(check);
    ro.observe(scrollEl);
    // Observe each non-style/script child so the check re-runs when the
    // body grows (typewriter reveal, font load, theme swap). Observing
    // only firstElementChild misses content when a <style> tag sits at
    // index 0 (a common scope-class setup in this view).
    for (const c of Array.from(scrollEl.children) as HTMLElement[]) {
      if (c.tagName !== 'STYLE' && c.tagName !== 'SCRIPT') ro.observe(c);
    }
    const onScroll = () => check();
    scrollEl.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      scrollEl.removeEventListener('scroll', onScroll);
    };
  }, [gateEarned, isMultiAction]);

  React.useEffect(() => {
    onGateChange?.(gateEarned);
  }, [gateEarned, onGateChange]);

  // When the beat's body/title text changes, reset scroll back to the top
  // and re-arm the gate. Otherwise the previous beat's scrollTop persists
  // (player has read to the end → next beat starts mid-text instead of
  // at the start of the new content).
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.scrollTo({ top: 0 });
    const scroller = root.querySelector('.slotflow-scroll') as HTMLElement | null;
    if (scroller) scroller.scrollTo({ top: 0 });
    if (requireFullRead) {
      // Re-arm: the new body might have its own overflow profile, and we
      // want the player to see its start before the gate fires.
      setGateEarned(false);
    }
  }, [titleText, bodyText, requireFullRead]);

  const rootStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: isConversation ? 'row' : 'column',
    alignItems: isConversation ? 'flex-start' : undefined,
    justifyContent: isConversation ? 'space-between' : undefined,
    gap: isConversation ? `clamp(20px, ${vwU(4)}, 64px)` : undefined,
    overflow: 'hidden',
    // NEVER the `background` SHORTHAND here. The VE renders this component
    // first without the background URL (asset still resolving) and then
    // with it; removing a shorthand between renders makes the browser clear
    // EVERY background longhand, and React's style diff does not re-set the
    // ones whose values "didn't change" — background-size/repeat/position
    // silently vanished while background-image survived. Longhands only:
    // gradients are images, plain colors are colors.
    backgroundColor: backgroundUrl
      ? (backgroundFit === 'contain' && !String(backgroundColor).includes('gradient')
          // Letterbox bars for 'contain' pick up the theme background color
          // so they don't read as dead black unless the theme wants that.
          ? backgroundColor
          : undefined)
      : (String(backgroundColor).includes('gradient') ? undefined : backgroundColor),
    backgroundImage: backgroundUrl
      ? `url(${backgroundUrl})`
      : (String(backgroundColor).includes('gradient') ? backgroundColor : undefined),
    backgroundSize: backgroundFit === 'contain' ? 'contain' : 'cover',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'center',
    paddingTop: 'env(safe-area-inset-top, 0px)',
    paddingRight: isConversation
      ? `max(env(safe-area-inset-right, 0px), clamp(20px, ${vwU(4)}, 48px))`
      : 'env(safe-area-inset-right, 0px)',
    paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    paddingLeft: isConversation
      ? `max(env(safe-area-inset-left, 0px), clamp(20px, ${vwU(4)}, 48px))`
      : 'env(safe-area-inset-left, 0px)',
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

  // Default-target countdown — subscribed live so the progress bar
  // tracks each tick of the renderer's timer without re-mounting.
  // Initial value comes from the prop; updates flow through the
  // subscription callback. Unsubscribes on unmount.
  const [timerState, setTimerState] = useState(initialTimerState);
  React.useEffect(() => {
    setTimerState(initialTimerState);
  }, [initialTimerState]);
  React.useEffect(() => {
    if (onSubscribeTimerState) return onSubscribeTimerState(setTimerState);
  }, [onSubscribeTimerState]);

  // Path-preset slot animations. Scans slotAnimations for entries whose
  // enter/exit preset === 'path' and runs the rAF translator for each
  // matching slot wrapper. The wrappers are tagged with
  // `data-slotflow-slot="{name}"` so we can find them inside the root
  // without threading a refs map through every slot render. Re-runs
  // when the slotAnimations object identity changes (new beat / new
  // values from the editor) and when the phase flips so exits replace
  // enters cleanly.
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root || !slotAnimations) return;
    const cleanups: Array<() => void> = [];
    const entries = Object.entries(slotAnimations as Record<string, any>);
    for (const [slotName, entry] of entries) {
      const event = phase === 'exit' ? entry?.exit : entry?.enter;
      if (!event || event.preset !== 'path' || !event.path?.waypoints?.length) continue;
      const el = root.querySelector<HTMLElement>(
        `[data-slotflow-slot="${CSS.escape(slotName)}"]`
      );
      if (!el) continue;
      cleanups.push(
        runSlotPath({
          el,
          stage: root,
          waypoints: event.path.waypoints,
          duration: event.duration ?? (phase === 'exit' ? 300 : 400),
          delay: event.delay ?? 0,
          easing: event.easing,
          loop: !!event.path.loop,
        }),
      );
    }
    return () => cleanups.forEach(fn => fn());
  }, [slotAnimations, phase]);

  // P3-anim — per-slot enter animation. Returns the className + style
  // patch to merge into a slot wrapper. Absent / unsupported preset → no-op.
  // Slide `distance` is PERCENT OF SLOT BOX (default 100 = one slot-box) —
  // never absolute px — so it survives reflow / viewport. Threaded through
  // a `--slotflow-anim-distance` CSS variable on the wrapper.
  const enterAnim = (slotName?: string): { className?: string; style?: React.CSSProperties } => {
    if (!slotName) return {};
    const enter: SlotAnimation | undefined = slotAnimationsFor(slotAnimations, slotName)?.enter;
    if (!enter) return {};
    // Path preset is handled by a per-slot rAF driver below — no CSS
    // animation, no class. Returning an empty patch leaves the slot
    // in its natural layout position; runSlotPath then translates it
    // through the waypoints once the wrapper is in the DOM.
    if (enter.preset === 'path') return {};
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
    if (exit.preset === 'path') return {}; // driven by rAF below
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
  // inputText resolves with the typed value (not a static action id).
  // When an input slot is present, the continue button submits the
  // current input string; otherwise it falls through to the legacy
  // 'continue' marker every other beat type uses.
  const handleContinue = () => dispatchAction(inputSlot ? inputValue : 'continue');

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
    <div
      ref={rootRef}
      className={`${scope} slotflow-root`}
      style={{
        ...rootStyle,
        // Single inner scrollable surface (.slotflow-scroll). The action
        // area is in the same flex column but conditionally rendered: in
        // phase 1 it's absent → the body card fills the full stage; in
        // phase 2 it slides in from the bottom and the body card shrinks
        // to share space. The body's scroll position is preserved across
        // the swap, so the player doesn't see a "jump back to the top"
        // when the gate fires.
        overflowY: 'hidden',
        overflowX: 'hidden',
      }}
    >
      {/* Video layer — videoBeat plays as the stage background, sized
          via native CSS so it fluidly fits any viewport. onEnded fires
          onAction('continue') so the beat resolves when playback completes;
          a skip button (if shown in the action slot) fires the same id. */}
      {videoUrl && (
        <video
          key={videoUrl}
          src={videoUrl}
          autoPlay={videoAutoplay !== false}
          controls={videoControls === true}
          onEnded={() => onAction('continue')}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            background: 'black',
            zIndex: 0,
          }}
        >
          {captionsVttUrl && (
            <track kind="captions" src={captionsVttUrl} default />
          )}
        </video>
      )}
      {/* Default-target countdown bar — pinned to the top of the
          stage. Mirrors the same TimerProgressBar PositionedBeatView
          uses, so a beat that auto-advances after defaultTargetDelay
          shows the same green→yellow→red ticker in responsive mode. */}
      {timerState && timerState.visible && (
        <TimerProgressBar
          totalTime={timerState.totalTime}
          remainingTime={timerState.remainingTime}
          visible={timerState.visible}
          label={timerState.label}
        />
      )}
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
        /* Gate-earned reveal for the action row. Used on every action
           area that becomes visible when phase 2 fires — single Continue
           on infoText AND the dynamicActions row on dialogTree (same
           class is applied at the SpatialFlowView level). Short enough
           that the player still feels the click responsiveness, long
           enough to read as a deliberate transition. */
        @keyframes slotflow-action-slide-in {
          from { opacity: 0; transform: translateY(40%); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .${scope} .slotflow-action-slide-in {
          animation-name: slotflow-action-slide-in;
          animation-duration: 280ms;
          animation-timing-function: ease-out;
          animation-fill-mode: both;
        }
      `}</style>

      {/* Body slot — one scrollable surface in BOTH phases. In phase 1
          the action row isn't rendered, so this card has the full stage
          height (body either fits → centered, or overflows → internal
          scroll). In phase 2 the action row joins the flex column and
          this card flexes down to share space; its scrollTop carries
          across the swap so the player keeps their reading position.
          The read-gate watches THIS element's overflow state. */}
      <div
        className="slotflow-scroll"
        style={{
          // In stacked mode with dynamic choices the body sits at natural
          // height so the action row follows right below it (not pinned
          // to the stage bottom with a void in between). Long content
          // still scrolls internally via the maxHeight cap.
          // With an embedded-surface slot (webView) the body also hugs its
          // natural height — the SURFACE is the star and takes the rest
          // (the old 1:1 grow split gave the frame only half the stage).
          flex: (belowBody || (hasDynamicChoices && !isConversation) || !!webViewSlot || !!inputSlot) ? '0 1 auto' : 1,
          // Conversation: cap the body scroller so the NPC card hugs the
          // left half of the stage (with the action panel on the right).
          // Without a cap, flex:1 lets the scroller fill all leftover
          // width, dragging the card mid-stage and leaving an oversized
          // left margin next to a too-tight right margin.
          maxWidth: isConversation ? 'clamp(280px, 50%, 560px)' : undefined,
          maxHeight: (belowBody || (hasDynamicChoices && !isConversation) || !!webViewSlot || !!inputSlot) ? '100%' : undefined,
          minHeight: 0,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-start',
          alignItems: isConversation ? 'flex-start' : 'center',
          // Custom-template absolute placement: when an author anchors
          // the body slot, lift its scroller out of the column flow and
          // pin it to the requested anchor zone on the stage.
          ...(customBodyStyle ?? {}),
        }}
      >
        <div
          style={{
            // When a custom-template author has anchored the body to a
            // side, cap the card narrower so the move actually reads as
            // a position change instead of being absorbed by the
            // READABLE_MAX_WIDTH (760) covering most of the stage.
            maxWidth: bodyAnchor?.h ? 'clamp(280px, 45%, 520px)' : READABLE_MAX_WIDTH,
            width: '100%',
            padding: `clamp(24px, ${vhU(5)}, 64px) clamp(20px, ${vwU(5)}, 48px)`,
            // Conversation: scroller is capped on the left half of the
            // stage; the card aligns to its left edge so the NPC text
            // reads from the stage's left padding, not floated mid-card.
            // Custom template (and any other slotIntent author): honor
            // bodyAnchor.h to push the card left / center / right within
            // its scroller.
            margin: isConversation
              ? '0 auto 0 0'
              : bodyAnchor?.h === 'left'
                ? '0 auto 0 0'
                : bodyAnchor?.h === 'right'
                  ? '0 0 0 auto'
                  : '0 auto',
            // Body wrapper always uses its natural content height. With
            // extraInScrollAfterBody (dialogTree choices) rendered
            // below it inside the same scroller during pre-earn, this
            // means the gate-fit check sees a TRUE measurement: if the
            // body + choices fit the viewport, scrollHeight equals
            // clientHeight and the gate fires immediately — no
            // synthetic "drag the choices in" requirement on a stage
            // with plenty of room. Only when the combined content
            // genuinely overflows do we get the drag-in behavior.
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-start',
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
                data-slotflow-slot={speakerSlot.name}
                style={{
                  fontFamily: theme.fonts.textFont || 'sans-serif',
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  // Honor the speaker-display accent color (matches the
                  // fixed-mode label); unset falls through to inherited text.
                  color: theme.speakerDisplay?.nameColor || undefined,
                  // Conversation: left-align the speaker label so it
                  // sits above the (left-aligned) body card. Stacked /
                  // custom keep the centered label above the centered
                  // body for the visual-novel feel.
                  textAlign: isConversation ? 'left' : 'center',
                  alignSelf: isConversation ? 'flex-start' : 'center',
                  opacity: 0.78,
                  marginBottom: `clamp(6px, ${vhU(1)}, 12px)`,
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
            const isSelected = !!editorMode && selectedSlotKey === `slot:${titleSlotName}`;
            const editorClick = editorMode && onSlotSelect && titleSlotName
              ? (e: React.MouseEvent) => { e.stopPropagation(); onSlotSelect(titleSlotName, undefined); }
              : undefined;
            // Per-slot type/transform overrides (font / fontSize / rotation
            // / widthPercent). Falls through to theme defaults when absent.
            const slotOv = titleSlotName ? slotIntentFor(slotIntent, titleSlotName) : undefined;
            const ovFont = slotOv?.font;
            const ovFontSizePx = typeof slotOv?.fontSize === 'number' ? slotOv.fontSize : undefined;
            const ovRotation = typeof slotOv?.rotation === 'number' ? slotOv.rotation : undefined;
            const ovWidthPx = typeof slotOv?.widthPercent === 'number' && previewWidth
              ? Math.round((slotOv.widthPercent / 100) * previewWidth)
              : undefined;
            return (
              <div
                ref={titleRef}
                className={a.className}
                data-slotflow-slot={titleSlotName}
                onClick={editorClick}
                style={{
                  fontFamily: ovFont || theme.fonts.titleFont || theme.fonts.textFont || 'serif',
                  fontWeight: 700,
                  ...(editorMode ? { cursor: 'pointer' } : null),
                  ...(isSelected ? { outline: '2px solid #fbbf24', outlineOffset: 2 } : null),
                  lineHeight: 1.25,
                  textAlign: 'center',
                  marginBottom: `clamp(16px, ${vhU(3)}, 32px)`,
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
                  // Per-slot overrides win over theme + fluid defaults.
                  ...(ovFontSizePx ? { fontSize: `${ovFontSizePx}px` } : null),
                  ...(ovRotation ? { transform: `rotate(${ovRotation}deg)`, transformOrigin: 'center center' } : null),
                  ...(ovWidthPx ? { maxWidth: ovWidthPx } : null),
                }}
              >
                {titleReveal.rendered}
              </div>
            );
          })()}
          {bodyText && (() => {
            const a = phaseAnim(bodySlot?.name);
            const bodyName = bodySlot?.name;
            const isSelected = !!editorMode && bodyName && selectedSlotKey === `slot:${bodyName}`;
            const editorClick = editorMode && onSlotSelect && bodyName
              ? (e: React.MouseEvent) => { e.stopPropagation(); onSlotSelect(bodyName, undefined); }
              : undefined;
            // Per-slot overrides — see title block for the contract.
            const slotOv = bodyName ? slotIntentFor(slotIntent, bodyName) : undefined;
            const ovFont = slotOv?.font;
            const ovFontSizePx = typeof slotOv?.fontSize === 'number' ? slotOv.fontSize : undefined;
            const ovRotation = typeof slotOv?.rotation === 'number' ? slotOv.rotation : undefined;
            const ovWidthPx = typeof slotOv?.widthPercent === 'number' && previewWidth
              ? Math.round((slotOv.widthPercent / 100) * previewWidth)
              : undefined;
            return (
              <div
                className={a.className}
                data-slotflow-slot={bodySlot?.name}
                onClick={editorClick}
                style={{
                  whiteSpace: 'pre-wrap',
                  ...(editorMode ? { cursor: 'pointer' } : null),
                  ...(isSelected ? { outline: '2px solid #fbbf24', outlineOffset: 2 } : null),
                  lineHeight: 1.6,
                  textAlign: 'center',
                  fontSize: `clamp(var(--slotflow-body-floor), ${bodyFluid}, ${BODY_CEILING}px)`,
                  ...(ovFont ? { fontFamily: ovFont } : null),
                  // Bug 14 — wrap body text in the theme's card. Card
                  // hugs short text but wraps long paragraphs at the
                  // readable column width (max-width on a fit-content
                  // box). Without this, a one-word subtitle (e.g. the
                  // titleScreen author) gets stretched to the full
                  // readable column and looks oversized.
                  width: 'fit-content',
                  maxWidth: '100%',
                  // Conversation: left-align the body card so it sits
                  // near the stage's left padding instead of floating
                  // mid-scroller. Stacked / custom keep the centered
                  // visual-novel feel.
                  alignSelf: isConversation ? 'flex-start' : 'center',
                  ...textBoxCardStyle(theme, { isTitle: false }),
                  ...bodyReveal.fadeStyle,
                  ...a.style,
                  // Per-slot overrides win over theme + fluid defaults.
                  ...(ovFontSizePx ? { fontSize: `${ovFontSizePx}px` } : null),
                  ...(ovRotation ? { transform: `rotate(${ovRotation}deg)`, transformOrigin: 'center center' } : null),
                  ...(ovWidthPx ? { maxWidth: ovWidthPx } : null),
                }}
              >
                {beatType === 'hyperText' && Array.isArray((content as any).links) && (content as any).links.length > 0
                  ? <HyperTextBody
                      text={bodyText}
                      links={(content as any).links}
                      onLinkClick={onAction}
                      linkColor={theme.button?.backgroundColor}
                    />
                  : bodyReveal.rendered}
              </div>
            );
          })()}
          {/* Read-gate sentinel — rendered AFTER the body text inside
              the same scroll/flow container so it sits at the bottom
              of the readable content. The rect-based observer above
              earns the gate when this element's bottom enters the
              visible area of the stage root. */}
          <div ref={sentinelRef} aria-hidden style={{ height: 1, width: '100%' }} />
        </div>
        {/* Pre-earn: extra content lives INSIDE the scroller so the
            player's scroll naturally drags it into view from below.
            Post-earn: it moves OUT of this scroller (rendered below
            in the flex column) so the body card gets its own internal
            scroll like an infoText body. */}
        {extraInScrollAfterBody && !gateEarned ? extraInScrollAfterBody : null}
      </div>
      {/* Post-earn placement of the extra content: outside the
          scroller, in the slot-root flex column. The body above now
          has natural height and its own internal scroll, while these
          choices sit in their own row at the bottom of the stage. */}
      {extraInScrollAfterBody && gateEarned ? extraInScrollAfterBody : null}

      {/* Input slot — single-line text field for inputText beats.
          Sits between body and action row. Enter submits via the
          paired continue button (handleContinue picks up inputValue
          when inputSlot is present). */}
      {inputSlot && (() => {
        const placeholder = inputSlot.placeholderSource
          ? (content[inputSlot.placeholderSource] ?? '')
          : '';
        const isSelected = !!editorMode && selectedSlotKey === `slot:${inputSlot.name}`;
        const editorClick = editorMode && onSlotSelect
          ? (e: React.MouseEvent) => { e.stopPropagation(); onSlotSelect(inputSlot.name, undefined); }
          : undefined;
        return (
          <div
            data-slotflow-slot={inputSlot.name}
            onClick={editorClick}
            style={{
              display: 'flex',
              justifyContent: 'center',
              padding: `clamp(8px, ${vhU(2)}, 16px) 16px`,
              ...(editorMode ? { cursor: 'pointer' } : null),
              ...(isSelected ? { outline: '2px solid #fbbf24', outlineOffset: 2 } : null),
            }}
          >
            <input
              type="text"
              value={inputValue}
              placeholder={String(placeholder)}
              disabled={!!editorMode}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleContinue();
                }
              }}
              style={{
                fontFamily: theme.fonts.textFont || 'sans-serif',
                fontSize: `clamp(var(--slotflow-body-floor), ${bodyFluid}, ${BODY_CEILING}px)`,
                padding: `clamp(6px, ${vhU(1.2)}, 12px) clamp(10px, ${vwU(2)}, 16px)`,
                borderRadius: theme.textBox?.borderRadius ?? 4,
                border: `2px solid ${theme.textBox?.borderColor ?? 'rgba(255,255,255,0.4)'}`,
                background: 'rgba(0,0,0,0.6)',
                color: '#ffffff',
                width: 'clamp(200px, 60%, 480px)',
                textAlign: 'center',
                outline: 'none',
              }}
            />
          </div>
        );
      })()}

      {/* Keypad slot — virtual numeric/PIN/phone keypad for keypad
          beats. KeypadElement owns its display + submit button, so we
          just route onSubmit → onAction(code) like the input slot. */}
      {keypadSlot && (() => {
        const isSelected = !!editorMode && selectedSlotKey === `slot:${keypadSlot.name}`;
        const editorClick = editorMode && onSlotSelect
          ? (e: React.MouseEvent) => { e.stopPropagation(); onSlotSelect(keypadSlot.name, undefined); }
          : undefined;
        return (
          <div
            data-slotflow-slot={keypadSlot.name}
            onClick={editorClick}
            style={{
              display: 'flex',
              justifyContent: 'center',
              padding: `clamp(8px, ${vhU(2)}, 16px) 16px`,
              ...(editorMode ? { cursor: 'pointer' } : null),
              ...(isSelected ? { outline: '2px solid #fbbf24', outlineOffset: 2 } : null),
            }}
          >
            <KeypadElement
              layout={(content.layout as 'numeric' | 'phone' | 'pin') ?? 'numeric'}
              maxDigits={(content.maxDigits as number) ?? 4}
              minDigits={(content.minDigits as number) ?? 1}
              correctCode={content.correctCode as string | undefined}
              maxAttempts={(content.maxAttempts as number) ?? 0}
              maskInput={!!content.maskInput}
              buttonText={(content.buttonText as string) ?? 'Submit'}
              clearButtonText={(content.clearButtonText as string) ?? 'Clear'}
              showDisplay={content.showDisplay !== false}
              onSubmit={(code) => dispatchAction(code)}
              theme={{
                buttonBg: theme.button?.backgroundColor,
                buttonText: theme.button?.textColor,
                buttonBorder: theme.button?.borderColor,
                displayBg: theme.textBox?.backgroundColor,
                // Display digits sit on the TEXT BOX ground — they need the
                // narrator text color, not the button text color (dark
                // button text on a dark display was unreadable).
                displayText: theme.colors?.textColor,
                frameBg: theme.backgroundColor,
              }}
            />
          </div>
        );
      })()}

      {/* Camera slot — QR-scan (Phase 1) and AR (Phase 3) ride here.
          QRScanElement handles permission flow + decode loop and emits
          either the decoded value or a reserved sentinel via
          dispatchAction. The slot has no editor-mode preview yet — the
          camera UI is intrinsically a runtime concept; in the VE we
          leave a placeholder so the slot still anchors layout. */}
      {cameraSlot && (() => {
        const isSelected = !!editorMode && selectedSlotKey === `slot:${cameraSlot.name}`;
        const editorClick = editorMode && onSlotSelect
          ? (e: React.MouseEvent) => { e.stopPropagation(); onSlotSelect(cameraSlot.name, undefined); }
          : undefined;
        return (
          <div
            data-slotflow-slot={cameraSlot.name}
            onClick={editorClick}
            style={{
              display: 'flex',
              justifyContent: 'center',
              padding: `clamp(8px, ${vhU(2)}, 16px) 16px`,
              ...(editorMode ? { cursor: 'pointer' } : null),
              ...(isSelected ? { outline: '2px solid #fbbf24', outlineOffset: 2 } : null),
            }}
          >
            {editorMode ? (
              <div
                style={{
                  width: 'min(80%, 480px)',
                  aspectRatio: '4 / 3',
                  borderRadius: 12,
                  border: '2px dashed rgba(255,255,255,0.35)',
                  background: 'rgba(0,0,0,0.4)',
                  color: 'rgba(255,255,255,0.7)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: `clamp(12px, ${vwU(1.4)}, 16px)`,
                }}
              >
                📷 Camera preview (runtime)
              </div>
            ) : (
              <QRScanElement
                facing={(content.facing as 'rear' | 'front') ?? 'rear'}
                matchPatterns={Array.isArray(content.matchPatterns) ? content.matchPatterns : undefined}
                helperText={typeof content.helperText === 'string' ? content.helperText : undefined}
                cancelButtonText={typeof content.cancelButtonText === 'string' ? content.cancelButtonText : 'Cancel'}
                onDecode={(value) => dispatchAction(value)}
                theme={{
                  buttonBg: theme.button?.backgroundColor,
                  buttonText: theme.button?.textColor,
                  buttonBorder: theme.button?.borderColor,
                  pageText: theme.colors?.textColor,
                }}
              />
            )}
          </div>
        );
      })()}

      {/* Image-input slot — photo picker / camera capture for the
          inputImage beat. ImageInputElement owns pick, preview,
          downscale, and its own submit/skip buttons (like KeypadElement
          owns its keypad). In editor mode we show a static placeholder
          so authoring never opens a file dialog. */}
      {imageInputSlot && (() => {
        const isSelected = !!editorMode && selectedSlotKey === `slot:${imageInputSlot.name}`;
        const editorClick = editorMode && onSlotSelect
          ? (e: React.MouseEvent) => { e.stopPropagation(); onSlotSelect(imageInputSlot.name, undefined); }
          : undefined;
        return (
          <div
            data-slotflow-slot={imageInputSlot.name}
            onClick={editorClick}
            style={{
              display: 'flex',
              justifyContent: 'center',
              padding: `clamp(8px, ${vhU(2)}, 16px) 16px`,
              ...(editorMode ? { cursor: 'pointer' } : null),
              ...(isSelected ? { outline: '2px solid #fbbf24', outlineOffset: 2 } : null),
            }}
          >
            {editorMode ? (
              <div
                style={{
                  width: 'min(80%, 480px)',
                  aspectRatio: '4 / 3',
                  borderRadius: 12,
                  border: '2px dashed rgba(255,255,255,0.35)',
                  background: 'rgba(0,0,0,0.4)',
                  color: 'rgba(255,255,255,0.7)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: `clamp(12px, ${vwU(1.4)}, 16px)`,
                }}
              >
                📸 Image input (runtime)
              </div>
            ) : (
              <ImageInputElement
                imageSource={(content.imageSource as 'upload' | 'camera' | 'both') ?? 'both'}
                buttonText={typeof content.buttonText === 'string' ? content.buttonText : 'Analyze'}
                cancelButtonText={typeof content.cancelButtonText === 'string' ? content.cancelButtonText : 'Skip'}
                onSubmit={(dataUrl) => dispatchAction(dataUrl)}
                onCancel={() => dispatchAction('cancelled')}
                theme={{
                  buttonBg: theme.button?.backgroundColor,
                  buttonText: theme.button?.textColor,
                  buttonBorder: theme.button?.borderColor,
                  pageText: theme.colors?.textColor,
                }}
              />
            )}
          </div>
        );
      })()}

      {/* WebView slot — embedded external page. WebViewElement handles
          the iframe vs <webview> branch and exit conditions; in editor
          mode we show a placeholder so the URL doesn't actually load
          during authoring. */}
      {webViewSlot && (() => {
        const isSelected = !!editorMode && selectedSlotKey === `slot:${webViewSlot.name}`;
        const editorClick = editorMode && onSlotSelect
          ? (e: React.MouseEvent) => { e.stopPropagation(); onSlotSelect(webViewSlot.name, undefined); }
          : undefined;
        // Author-sized frame: slotIntent[webview].heightPercent (percent of
        // the stage) pins the frame height; unset = grow into the remaining
        // space after speaker/prompt.
        const wvIntent = slotIntentFor(slotIntent, webViewSlot.name) as { heightPercent?: number } | undefined;
        const wvHeightPercent = typeof wvIntent?.heightPercent === 'number' ? wvIntent.heightPercent : undefined;
        return (
          <div
            data-slotflow-slot={webViewSlot.name}
            onClick={editorClick}
            style={{
              display: 'flex',
              justifyContent: 'center',
              // Grow to the REMAINING stage height (after speaker/prompt).
              // The old fixed 16:10 frame could exceed the stage and clip
              // the prompt above it — found during the Web View round.
              flex: wvHeightPercent != null ? `0 0 ${wvHeightPercent}%` : '1 1 0',
              minHeight: 0,
              padding: `clamp(8px, ${vhU(2)}, 16px) 16px`,
              ...(editorMode ? { cursor: 'pointer' } : null),
              ...(isSelected ? { outline: '2px solid #fbbf24', outlineOffset: 2 } : null),
            }}
          >
            {editorMode ? (
              <div
                style={{
                  width: 'min(95%, 1200px)',
                  height: '100%',
                  minHeight: 120,
                  borderRadius: 12,
                  border: '2px dashed rgba(255,255,255,0.35)',
                  background: 'rgba(0,0,0,0.4)',
                  color: 'rgba(255,255,255,0.7)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: `clamp(12px, ${vwU(1.4)}, 16px)`,
                  textAlign: 'center',
                  padding: 16,
                }}
              >
                🌐 Web view (runtime)
                <br />
                <span style={{ fontSize: '0.85em', opacity: 0.7 }}>
                  {typeof content.url === 'string' ? content.url : ''}
                </span>
              </div>
            ) : (
              <WebViewElement
                url={typeof content.url === 'string' ? content.url : ''}
                exitUrlPattern={typeof content.exitUrlPattern === 'string' ? content.exitUrlPattern : undefined}
                contextHash={typeof content.contextHash === 'string' ? content.contextHash : undefined}
                doneButtonText={typeof content.doneButtonText === 'string' ? content.doneButtonText : 'Done'}
                fill
                onExit={(value) => dispatchAction(value)}
                theme={{
                  buttonBg: theme.button?.backgroundColor,
                  buttonText: theme.button?.textColor,
                  buttonBorder: theme.button?.borderColor,
                  pageText: theme.colors?.textColor,
                }}
              />
            )}
          </div>
        );
      })()}

      {/* AR slot — Phase 1a renders a camera + tappable anchor cards
          in screen space (no real marker tracking yet). Phase 1b
          swaps the inside for MindAR-driven marker pinning. The slot
          prop shape stays stable across phases. Editor-mode shows a
          placeholder so the AR camera isn't requested during
          authoring. */}
      {arSlot && (() => {
        const isSelected = !!editorMode && selectedSlotKey === `slot:${arSlot.name}`;
        const editorClick = editorMode && onSlotSelect
          ? (e: React.MouseEvent) => { e.stopPropagation(); onSlotSelect(arSlot.name, undefined); }
          : undefined;
        return (
          <div
            data-slotflow-slot={arSlot.name}
            onClick={editorClick}
            style={{
              display: 'flex',
              justifyContent: 'center',
              padding: `clamp(8px, ${vhU(2)}, 16px) 16px`,
              ...(editorMode ? { cursor: 'pointer' } : null),
              ...(isSelected ? { outline: '2px solid #fbbf24', outlineOffset: 2 } : null),
            }}
          >
            {editorMode ? (
              <div
                style={{
                  width: 'min(95%, 720px)',
                  aspectRatio: '4 / 3',
                  borderRadius: 12,
                  border: '2px dashed rgba(255,255,255,0.35)',
                  background: 'rgba(0,0,0,0.4)',
                  color: 'rgba(255,255,255,0.7)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: `clamp(12px, ${vwU(1.4)}, 16px)`,
                  textAlign: 'center',
                  padding: 16,
                }}
              >
                🥽 AR scene (runtime)
                <br />
                <span style={{ fontSize: '0.85em', opacity: 0.7 }}>
                  {Array.isArray(content.anchors) ? `${content.anchors.length} anchor(s)` : '0 anchors'}
                </span>
              </div>
            ) : (
              <ARSceneElement
                trackingMode={(content.trackingMode as 'marker' | 'world' | 'face') ?? 'marker'}
                markerUrl={typeof content.markerUrl === 'string' ? content.markerUrl : undefined}
                anchors={Array.isArray(content.anchors) ? content.anchors : []}
                cancelButtonText={typeof content.cancelButtonText === 'string' ? content.cancelButtonText : 'Skip'}
                onAction={(value) => dispatchAction(value)}
                theme={{
                  buttonBg: theme.button?.backgroundColor,
                  buttonText: theme.button?.textColor,
                  buttonBorder: theme.button?.borderColor,
                  pageText: theme.colors?.textColor,
                }}
              />
            )}
          </div>
        );
      })()}

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
        }> = dynamicChoices && dynamicChoices.length > 0
          // MultiChoice (and any future beat with dynamic choice buttons)
          // uses runtime-supplied choices instead of the schema's fixed
          // button names. Each choice id is what we pass to dispatchAction
          // so the parent (ReactRenderer) can resolve the awaiting
          // Promise with the player's pick.
          ? dynamicChoices.map(c => ({
              id: c.id,
              text: c.text,
              onClick: () => dispatchAction(c.id),
              show: true,
            }))
          : isContinueAction
            ? [{ id: 'continueButton', text: continueText, onClick: handleContinue, show: true }]
            : [
                // Only render the endScreen-style buttons when the schema
                // actually declares them. Beats with embedded-surface slots
                // (webView/qrScan/arBeat: buttons like doneButton /
                // cancelButton) own their exit buttons INSIDE the surface
                // element — the old unconditional fallback rendered a
                // phantom "Play Again" for them.
                ...(actionButtons.includes('creditsButton')
                  ? [{ id: 'creditsButton', text: creditsText, onClick: handleCredits, show: showCredits }]
                  : []),
                ...(actionButtons.includes('restartButton')
                  ? [{ id: 'restartButton', text: restartText, onClick: handleRestart, show: showRestart }]
                  : []),
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
        // The action row is hidden in phase 1 (single AND multi-action):
        // the body card occupies the full stage and the player reads
        // first. Once the gate fires (content scrolled to its end, or
        // fit-in-viewport from the start), the row joins the flex column
        // and slides up from the bottom. No "dimmed but visible" state —
        // per the design diagram, choices/Continue simply aren't there
        // until they're earned.
        if (!gateEarned) return null;
        return (
          <>
            <div
              className={`${a.className ?? ''} ${(isConversation || customActionStyle) ? '' : 'slotflow-action-slide-in'}`}
              data-slotflow-slot={actionSlot.name}
              style={{
                // Position + zIndex so this row stacks ABOVE the
                // ResponsiveCharacterLayer (which has position:absolute
                // and zIndex:1, putting it in the positioned-stacking
                // tier above static siblings regardless of DOM order).
                // Without this, an animated player walks IN FRONT of
                // the Continue button.
                position: 'relative',
                zIndex: 5,
                flexShrink: 0,
                display: 'flex',
                // Stack buttons VERTICALLY whenever dynamicChoices are
                // present (MultiChoice + DialogTree-conversation). Reads as
                // a list of player responses, not a horizontal toolbar —
                // matches the convention the rest of the app uses for
                // choice menus. System-action rows (Continue, restart +
                // credits) keep the horizontal flex they always had.
                flexDirection: (isConversation || hasDynamicChoices) ? 'column' : undefined,
                // Conversation right-aligns buttons at their NATURAL
                // widths inside the panel — the panel sizes to the
                // widest button + padding, and each button fits its
                // text on one line. Stacked / custom stretches buttons
                // to a common width for the centered visual-novel look.
                alignItems: hasDynamicChoices
                  ? (isConversation ? 'flex-end' : 'stretch')
                  : undefined,
                // Move the whole action panel left/center/right based on
                // the anchor. In conversation the panel is row-aligned
                // (top-of-row) to keep buttons next to the body; in
                // stacked/custom the anchor controls cross-axis
                // positioning so "right" actually puts the buttons at
                // the right edge of the stage.
                alignSelf: isConversation
                  ? 'flex-start'
                  : (hasDynamicChoices
                      ? horizontalAlignSelf(actionAnchorH)
                      : undefined),
                // In conversation mode the action panel claims a fixed
                // width fraction of the stage; body scroller flexes to
                // fill the rest. Without flex-basis the empty-buttons
                // row collapses to zero width. Widened from 28%/280
                // because the previous max squeezed longer button text
                // ("Your name is Kim, right?") onto 2-3 lines even when
                // there was plenty of horizontal room on stage.
                flexBasis: isConversation ? 'clamp(200px, 34%, 380px)' : undefined,
                // Conversation: top-align with the body card so the
                // buttons sit at the same Y as the NPC text, not floated
                // mid-stage. paddingTop matches the body card's top
                // padding so the first button visually aligns with the
                // first line of the prompt. (Stacked alignSelf is set
                // above to 'stretch' when dynamicChoices are present.)
                justifyContent: isConversation ? 'flex-start' : actionJustify,
                gap: `clamp(12px, ${vwU(2)}, 24px)`,
                paddingTop: isConversation
                  ? `clamp(24px, ${vhU(5)}, 64px)`
                  : (actionGap != null ? actionGap : `clamp(16px, ${vhU(3)}, 28px)`),
                paddingBottom: `clamp(16px, ${vhU(3)}, 28px)`,
                // Match the body card's horizontal padding in conversation
                // so buttons aren't packed tighter against the panel edge
                // than text is against the card edge — the visible
                // content edges end up the same distance from the stage
                // margin on both sides.
                paddingLeft: isConversation ? `clamp(20px, ${vwU(5)}, 48px)` : 16,
                paddingRight: isConversation ? `clamp(20px, ${vwU(5)}, 48px)` : 16,
                // Custom-template absolute placement: lift the action
                // panel out of the column flow and pin it to the anchor.
                ...(customActionStyle ?? {}),
                // When every button is individually anchored the row is
                // empty; collapse its vertical inset so it doesn't leave
                // a phantom stripe at the bottom.
                ...(flowButtons.length === 0
                  ? { paddingTop: 0, paddingBottom: 0 }
                  : {}),
                ...a.style,
              }}
            >
              {flowButtons.map(b => {
                const actionSlotName = actionSlot?.name;
                const editorSelected = !!editorMode && actionSlotName && selectedSlotKey === `slot:${actionSlotName}:${b.id}`;
                const handleClick = editorMode && onSlotSelect && actionSlotName
                  ? (e: React.MouseEvent) => { e.stopPropagation(); onSlotSelect(actionSlotName, b.id); }
                  : b.onClick;
                // Per-slot type/transform overrides apply to the whole
                // action slot — all buttons inherit the same font,
                // fontSize, rotation, width.
                const slotOv = actionSlotName ? slotIntentFor(slotIntent, actionSlotName) : undefined;
                const ovFont = slotOv?.font;
                const ovFontSizePx = typeof slotOv?.fontSize === 'number' ? slotOv.fontSize : undefined;
                const ovRotation = typeof slotOv?.rotation === 'number' ? slotOv.rotation : undefined;
                const ovWidthPx = typeof slotOv?.widthPercent === 'number' && previewWidth
                  ? Math.round((slotOv.widthPercent / 100) * previewWidth)
                  : undefined;
                return (
                  <button
                    key={b.id}
                    className="slotflow-btn"
                    onClick={handleClick}
                    style={{
                      ...buttonStyle(theme, buttonFluid, `clamp(20px, ${vwU(3)}, 36px)`),
                      ...(editorMode ? { cursor: 'pointer' } : null),
                      ...(editorSelected ? { outline: '2px solid #fbbf24', outlineOffset: 2 } : null),
                      ...(ovFont ? { fontFamily: ovFont } : null),
                      ...(ovFontSizePx ? { fontSize: `${ovFontSizePx}px` } : null),
                      ...(ovRotation ? { transform: `rotate(${ovRotation}deg)` } : null),
                      ...(ovWidthPx ? { maxWidth: ovWidthPx } : null),
                    }}
                  >
                    {b.text}
                  </button>
                );
              })}
            </div>
            {anchoredButtons.map(b => {
              const anchor = buttonAnchors![b.id];
              const actionSlotName = actionSlot?.name;
              const editorSelected = !!editorMode && actionSlotName && selectedSlotKey === `slot:${actionSlotName}:${b.id}`;
              const handleClick = editorMode && onSlotSelect && actionSlotName
                ? (e: React.MouseEvent) => { e.stopPropagation(); onSlotSelect(actionSlotName, b.id); }
                : b.onClick;
              return (
                <button
                  key={`anchored-${b.id}`}
                  className={`slotflow-btn ${a.className ?? ''}`}
                  onClick={handleClick}
                  style={{
                    ...buttonStyle(theme, buttonFluid, `clamp(20px, ${vwU(3)}, 36px)`),
                    position: 'absolute',
                    ...anchoredButtonPlacement(anchor),
                    zIndex: 4,
                    ...a.style,
                    ...(editorMode ? { cursor: 'pointer' } : null),
                    ...(editorSelected ? { outline: '2px solid #fbbf24', outlineOffset: 2 } : null),
                  }}
                >
                  {b.text}
                </button>
              );
            })}
          </>
        );
      })()}

      {/* Character / prop sprite layer — same component as
          SpatialFlowView mounts. Renders absolute-positioned sprites
          on top of the slot content; pointer-events:none so it never
          intercepts clicks. */}
      {characterLocations && characterLocations.length > 0 && (
        <ResponsiveCharacterLayer
          locations={characterLocations}
          animations={animations}
          characterResolver={characterResolver}
          assetResolver={assetResolver}
          spriteDataResolver={spriteDataResolver}
        />
      )}
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

function buttonStyle(theme: RenderThemeSettings, fluid: string, hPad?: string): React.CSSProperties {
  // 'hideAll' box visibility strips button boxes too — bare labels.
  const bare = theme.textBox?.boxVisibility === 'hideAll';
  return {
    fontFamily: theme.fonts.buttonFont || theme.fonts.textFont || 'serif',
    fontSize: `clamp(var(--slotflow-btn-floor), ${fluid}, ${BUTTON_CEILING}px)`,
    color: theme.button?.textColor || '#fff',
    background: bare ? 'transparent' : (theme.button?.backgroundColor || 'rgba(255,255,255,0.12)'),
    border: bare ? 'none' : `${theme.button?.borderWidth ?? 1}px solid ${theme.button?.borderColor || 'rgba(255,255,255,0.4)'}`,
    borderRadius: `${theme.button?.borderRadius ?? 8}px`,
    padding: `0 ${hPad ?? 'clamp(20px, 3vw, 36px)'}`,
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
  // Settings → Text Box → Box Visibility: hideText/hideAll strip the
  // text/dialog card everywhere (matches the absolute path's
  // hideTextBoxes prop semantics).
  const hiddenBySetting = tb?.boxVisibility === 'hideText' || tb?.boxVisibility === 'hideAll';
  if (!tb || hideForTitle || hiddenBySetting) {
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

/**
 * HyperTextBody — body slot renderer for hyperText beats. Splits the
 * authored text around each link word and wraps it in a clickable span
 * that fires onLinkClick(targetBeatId). Text reveal (typewriter/fade)
 * isn't applied here so links are clickable from the first paint.
 */
const HyperTextBody: React.FC<{
  text: string;
  links: Array<{
    word: string;
    targetBeatId: string;
    style?: { color?: string; hoverColor?: string; underline?: boolean; bold?: boolean };
  }>;
  onLinkClick: (targetBeatId: string) => void;
  /** Theme accent for links (button color) — reads on the dark stage where
   *  a conventional #3b82f6 blue is low-contrast. Per-link style still wins. */
  linkColor?: string;
}> = ({ text, links, onLinkClick, linkColor }) => {
  const [hoveredWord, setHoveredWord] = React.useState<string | null>(null);
  const accentLink = linkColor || '#3b82f6';

  const sortedLinks = links
    .map(link => ({ ...link, index: text.indexOf(link.word) }))
    .filter(link => link.index >= 0)
    .sort((a, b) => a.index - b.index);

  if (sortedLinks.length === 0) {
    return <>{text}</>;
  }

  const segments: React.ReactNode[] = [];
  let lastIndex = 0;
  sortedLinks.forEach((link, i) => {
    if (link.index > lastIndex) {
      segments.push(<span key={`text-${i}`}>{text.substring(lastIndex, link.index)}</span>);
    }
    const isHovered = hoveredWord === link.word;
    const linkStyle: React.CSSProperties = {
      color: isHovered && link.style?.hoverColor
        ? link.style.hoverColor
        : ((link.style?.color && !['#0066cc', '#3b82f6'].includes(link.style.color.toLowerCase()))
            ? link.style.color
            : accentLink),
      textDecoration: link.style?.underline !== false ? 'underline' : 'none',
      fontWeight: link.style?.bold ? 'bold' : 'inherit',
      cursor: 'pointer',
    };
    segments.push(
      <span
        key={`link-${i}`}
        style={linkStyle}
        onClick={(e) => {
          e.stopPropagation();
          onLinkClick(link.targetBeatId);
        }}
        onMouseEnter={() => setHoveredWord(link.word)}
        onMouseLeave={() => setHoveredWord(null)}
        role="link"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onLinkClick(link.targetBeatId);
          }
        }}
      >
        {link.word}
      </span>
    );
    lastIndex = link.index + link.word.length;
  });
  if (lastIndex < text.length) {
    segments.push(<span key="text-end">{text.substring(lastIndex)}</span>);
  }
  return <>{segments}</>;
};
