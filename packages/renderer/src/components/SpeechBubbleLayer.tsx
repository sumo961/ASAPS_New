/**
 * Draws the current line as a speech bubble next to the character saying it
 * (Speaker Display ▸ "Show lines as: speech bubbles"), in every layout: the
 * fixed stage (PositionedBeatView) and the responsive ones (SlotFlowView,
 * SpatialFlowView). It is mounted inside the stage, finds the speaker's
 * picture there by its `data-character-name`, and copies the lettering of the
 * line's own text box (`data-speech-line`), which the host keeps in place but
 * hides while the bubble shows — so the buttons stay where they were and the
 * text box is still there when no bubble fits.
 *
 * The geometry is in utils/speechBubble.ts. When the bubble can't be placed
 * (the speaker's picture isn't on the stage yet, a phone screen too small, a
 * crowded stage), `onPlaced(false)` tells the host to show the text box.
 */
import React from 'react';
import type { RenderThemeSettings } from './PositionedBeatView';
import { renderMarkdownLite } from '../utils/markdownLite';
import { revealBoundary } from '../utils/typewriterGranularity';
import type { StageCharacterLike } from '../utils/speakerDimming';
import {
  bubblePath,
  bubbleSize,
  bubbleTextMaxWidth,
  HEAVY,
  LIGHT,
  placeSpeechBubble,
  speakPoint,
  THOUGHT_BUMP,
  thoughtPath,
  thoughtTrail,
  bubbleLineKey,
  earlierLineFor,
  speakerLocation,
  type BubbleHistory,
  type BubbleLine,
  type BubbleObstacle,
  type BubblePoint,
  type BubbleRect,
  type SpeakFrom,
} from '../utils/speechBubble';

export interface SpeechBubbleLayerProps {
  /** The line as written (markdown-lite). */
  text: string;
  /** The stage element (location name) showing the speaker. */
  speakerElementName: string;
  /** Where on the picture the speaker speaks from (fractions); unset: top middle. */
  speakFrom?: SpeakFrom;
  /** The speaker's picture is drawn mirrored. */
  flipX?: boolean;
  theme: RenderThemeSettings;
  /** Boxes the bubble keeps clear of (HUDs), in stage pixels. */
  avoidRects?: ReadonlyArray<{ x: number; y: number; width: number; height: number }>;
  /** Show the whole line at once (the player clicked through the typewriter). */
  skipAnimation?: boolean;
  /** Whether the bubble is showing; the host hides the text box while it is. */
  onPlaced?: (placed: boolean) => void;
  /** The bubble is showing this text (once per line): the renderer remembers it for the next line. */
  onShown?: () => void;
  /** A thought (an inner voice): a cloud with a trail of circles, in this colour when set. */
  thought?: { color?: string };
  /**
   * 'earlier': the line before, kept up beside the current one — whole at
   * once, a little faded, and out of the current bubble's way (it gives up
   * rather than cover it). It has no text box of its own to hide.
   */
  role?: 'current' | 'earlier';
  zIndex?: number;
}

interface Lettering {
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
  letterSpacing: string;
}

interface BubbleLayout {
  rect: BubbleRect;
  tip: BubblePoint;
  textWidth: number;
  textHeight: number;
  lettering: Lettering;
}

const quoteAttr = (s: string) => s.replace(/["\\]/g, '\\$&');

function sameLayout(a: BubbleLayout | null, b: BubbleLayout | null): boolean {
  if (!a || !b) return a === b;
  const near = (p: number, q: number) => Math.abs(p - q) < 0.5;
  return near(a.rect.x, b.rect.x) && near(a.rect.y, b.rect.y) && near(a.rect.width, b.rect.width)
    && near(a.rect.height, b.rect.height) && near(a.tip.x, b.tip.x) && near(a.tip.y, b.tip.y)
    && near(a.textWidth, b.textWidth) && near(a.textHeight, b.textHeight)
    && a.lettering.fontSize === b.lettering.fontSize && a.lettering.fontFamily === b.lettering.fontFamily;
}

/** #rrggbb (or #rgb) and a 0–100 opacity → fill + fill-opacity. */
function fillOf(color: string | undefined, opacity: number | undefined): { fill: string; fillOpacity: number } {
  const c = color || '#ffffff';
  return { fill: c, fillOpacity: /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(c) ? Math.max(0, Math.min(100, opacity ?? 100)) / 100 : 1 };
}

/** The line's own reveal: as the text box's typewriter, so both finish together. */
function useReveal(text: string, theme: RenderThemeSettings, skip: boolean): number {
  // Players who asked for less motion get the whole line at once, as in the text box.
  const reducedMotion = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const animation = reducedMotion ? 'none' : theme.textEffects?.animation || 'none';
  const speed = theme.textEffects?.typewriterSpeed || 30;
  const [count, setCount] = React.useState(animation === 'typewriter' && !skip ? 0 : text.length);
  React.useEffect(() => {
    if (animation !== 'typewriter' || skip) { setCount(text.length); return; }
    setCount(0);
    let i = 0;
    const handle = setInterval(() => {
      i += 1;
      setCount(i);
      if (i >= text.length) clearInterval(handle);
    }, 1000 / Math.max(1, speed));
    return () => clearInterval(handle);
  }, [text, animation, speed, skip]);
  return count;
}

export const SpeechBubbleLayer: React.FC<SpeechBubbleLayerProps> = ({
  text,
  speakerElementName,
  speakFrom,
  flipX,
  theme,
  avoidRects,
  skipAnimation = false,
  onPlaced,
  onShown,
  thought,
  role = 'current',
  zIndex = 150,
}) => {
  const earlier = role === 'earlier';
  const layerRef = React.useRef<HTMLDivElement>(null);
  const measureRef = React.useRef<HTMLDivElement>(null);
  const [layout, setLayout] = React.useState<BubbleLayout | null>(null);
  const layoutRef = React.useRef<BubbleLayout | null>(null);
  const placedRef = React.useRef<boolean | null>(null);
  const onPlacedRef = React.useRef(onPlaced);
  onPlacedRef.current = onPlaced;
  const onShownRef = React.useRef(onShown);
  onShownRef.current = onShown;

  const stroke = Math.max(0, theme.textBox?.borderWidth ?? 2);

  const report = React.useCallback((placed: boolean) => {
    if (placedRef.current === placed) return;
    placedRef.current = placed;
    onPlacedRef.current?.(placed);
  }, []);

  const compute = React.useCallback(() => {
    const layer = layerRef.current;
    const measure = measureRef.current;
    const root = layer?.parentElement;
    const fail = () => {
      if (layoutRef.current) { layoutRef.current = null; setLayout(null); }
      report(false);
    };
    if (!layer || !measure || !root) return fail();

    const stageW = root.offsetWidth || root.clientWidth;
    const stageH = root.offsetHeight || root.clientHeight;
    const rootBox = root.getBoundingClientRect();
    if (!(stageW > 0 && stageH > 0 && rootBox.width > 0)) return fail();
    // The stage may be drawn scaled (fixed stages fit the window); work in its own pixels.
    const scale = rootBox.width / stageW || 1;
    const toStage = (r: DOMRect): BubbleRect => ({
      x: (r.left - rootBox.left) / scale,
      y: (r.top - rootBox.top) / scale,
      width: r.width / scale,
      height: r.height / scale,
    });

    const speakerEl = root.querySelector<HTMLElement>(`[data-character-name="${quoteAttr(speakerElementName)}"]`);
    const speakerRect = speakerEl ? toStage(speakerEl.getBoundingClientRect()) : null;
    if (!speakerRect || speakerRect.width <= 0 || speakerRect.height <= 0) return fail();

    // Lettering from the line's own text box, so the bubble reads like the
    // rest of the story (per-beat and per-element fonts included).
    const line = root.querySelector<HTMLElement>('[data-speech-line]');
    const cs = line && typeof getComputedStyle === 'function' ? getComputedStyle(line) : null;
    const lettering: Lettering = {
      fontFamily: cs?.fontFamily || theme.fonts?.textFont || 'sans-serif',
      fontSize: cs?.fontSize || `${theme.fonts?.textFontSize || 18}px`,
      fontWeight: cs?.fontWeight || '500',
      lineHeight: cs?.lineHeight && cs.lineHeight !== 'normal' ? cs.lineHeight : '1.4',
      letterSpacing: cs?.letterSpacing || 'normal',
    };
    Object.assign(measure.style, lettering, { maxWidth: `${bubbleTextMaxWidth(stageW)}px`, fontStyle: thought ? 'italic' : '' });
    const m = measure.getBoundingClientRect();
    const textWidth = Math.ceil(m.width / scale) + 1;
    const textHeight = Math.ceil(m.height / scale);
    if (!(textWidth > 1 && textHeight > 0)) return fail();
    const fontPx = parseFloat(lettering.fontSize) || 18;
    const oval = bubbleSize(textWidth, textHeight, fontPx, stroke);
    // A cloud's bumps sit outside the oval the text fits in.
    const size = thought ? { width: oval.width + 2 * THOUGHT_BUMP, height: oval.height + 2 * THOUGHT_BUMP } : oval;

    const obstacles: BubbleObstacle[] = [];
    for (const r of avoidRects ?? []) obstacles.push({ rect: { x: r.x, y: r.y, width: r.width, height: r.height }, weight: HEAVY });
    root.querySelectorAll<HTMLElement>('button, [role="button"]').forEach((el) => {
      if (layer.contains(el)) return;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) obstacles.push({ rect: toStage(r), weight: HEAVY });
    });
    root.querySelectorAll<HTMLElement>('[data-character-name]').forEach((el) => {
      if (el === speakerEl) return;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) obstacles.push({ rect: toStage(r), weight: LIGHT });
    });
    // The line before makes way for the current one.
    if (earlier) {
      root.querySelectorAll<HTMLElement>('[data-speech-bubble="current"]').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) obstacles.push({ rect: toStage(r), weight: HEAVY });
      });
    }

    const placement = placeSpeechBubble({
      stage: { width: stageW, height: stageH },
      size,
      mouth: speakPoint(speakerRect, speakFrom, flipX),
      speaker: speakerRect,
      obstacles,
    });
    if (!placement) return fail();
    const next: BubbleLayout = { ...placement, textWidth, textHeight, lettering };
    if (!sameLayout(layoutRef.current, next)) { layoutRef.current = next; setLayout(next); }
    report(true);
  }, [speakerElementName, speakFrom?.x, speakFrom?.y, flipX, stroke, avoidRects, theme.fonts?.textFont, theme.fonts?.textFontSize, report, !!thought, earlier]);

  // Place it before the first paint (no flash of the text box), then follow
  // the stage: a resized window, a picture that finished loading, a speaker
  // walking along an animation path.
  React.useLayoutEffect(() => {
    compute();
    const root = layerRef.current?.parentElement;
    if (!root) return;
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; compute(); });
    };
    const resize = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    resize?.observe(root);
    root.querySelectorAll('[data-character-name]').forEach((el) => resize?.observe(el));
    const moves = typeof MutationObserver !== 'undefined' ? new MutationObserver((records) => {
      if (records.some((r) => !layerRef.current?.contains(r.target))) schedule();
    }) : null;
    moves?.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'src'] });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      resize?.disconnect();
      moves?.disconnect();
    };
  }, [compute, text]);

  // Gone: the text box shows again. Forget what was reported, so a remount
  // (React's development double-mount, a beat change) reports afresh.
  React.useEffect(() => () => {
    placedRef.current = null;
    onPlacedRef.current?.(false);
  }, []);

  // Tell the renderer which line is up, once it shows (and again for the
  // next line, when the same speaker keeps the same bubble).
  const shown = !!layout;
  React.useEffect(() => {
    if (shown && !earlier) onShownRef.current?.();
  }, [shown, text, earlier]);

  const revealed = useReveal(text, theme, skipAnimation || earlier);
  const typing = revealed < text.length;
  const cut = typing ? revealBoundary(text, revealed, theme.textEffects?.typewriterGranularity) : text.length;
  const fade = !earlier && theme.textEffects?.animation === 'fade'
    && !(typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const { fill, fillOpacity } = fillOf(theme.textBox?.backgroundColor, theme.textBox?.opacity);
  const textColor = theme.colors?.textColor || '#1f2937';
  const textAlpha = (theme.colors?.textAlpha ?? 100) / 100;
  const outline = stroke > 0 ? (thought?.color || theme.textBox?.borderColor || '#1f2937') : 'none';

  return (
    <div
      ref={layerRef}
      data-speech-bubble-layer={role}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex }}
    >
      <div
        ref={measureRef}
        aria-hidden
        style={{
          position: 'absolute', left: 0, top: 0, visibility: 'hidden', display: 'inline-block',
          whiteSpace: 'pre-wrap', overflowWrap: 'break-word', textAlign: 'center',
        }}
        dangerouslySetInnerHTML={{ __html: renderMarkdownLite(text) }}
      />
      {layout && (() => {
        const { rect, tip, textWidth, textHeight, lettering } = layout;
        const localTip = { x: tip.x - rect.x, y: tip.y - rect.y };
        return (
          <div
            data-speech-bubble={role}
            {...(thought ? { 'data-thought': '' } : null)}
            style={{
              position: 'absolute', left: rect.x, top: rect.y, width: rect.width, height: rect.height,
              ...(earlier ? { opacity: 0.8 } : null),
              ...(fade ? { animation: `asaps-bubble-in ${theme.textEffects?.fadeInDuration || 500}ms ease-in both` } : null),
            }}
          >
            {fade && <style>{'@keyframes asaps-bubble-in { from { opacity: 0 } to { opacity: 1 } }'}</style>}
            <svg
              width={rect.width}
              height={rect.height}
              aria-hidden
              style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', ...(earlier ? null : { filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.25))' }) }}
            >
              <path
                d={thought ? thoughtPath(rect.width, rect.height, stroke) : bubblePath(rect.width, rect.height, localTip, stroke)}
                fill={fill}
                fillOpacity={fillOpacity}
                stroke={outline}
                strokeWidth={stroke}
                strokeLinejoin="round"
              />
              {thought && thoughtTrail(rect.width, rect.height, localTip).map((c, i) => (
                <circle key={i} cx={c.cx} cy={c.cy} r={c.r} fill={fill} fillOpacity={fillOpacity} stroke={outline} strokeWidth={Math.min(stroke, 2)} />
              ))}
            </svg>
            <div
              style={{
                position: 'absolute',
                left: (rect.width - textWidth) / 2,
                top: (rect.height - textHeight) / 2,
                width: textWidth,
                ...lettering,
                color: textColor,
                opacity: textAlpha,
                textAlign: 'center',
                whiteSpace: 'pre-wrap',
                overflowWrap: 'break-word',
                ...(thought ? { fontStyle: 'italic' } : null),
              }}
            >
              {typing ? (
                <>
                  <span>{text.substring(0, cut)}</span>
                  <span style={{ color: 'transparent' }}>{text.substring(cut)}</span>
                </>
              ) : (
                <span dangerouslySetInnerHTML={{ __html: renderMarkdownLite(text) }} />
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
};

/** A character placed on the stage, as the bubbles need it. */
export type BubbleSpeakerLocation = StageCharacterLike & {
  name: string;
  speakFrom?: SpeakFrom;
  flipX?: boolean;
};

/**
 * The bubbles on a stage: the current line's, and beside it the line before
 * (BubbleHistory) while the current one shows — when its speaker is on this
 * stage too and isn't the one speaking now. Every stage view mounts this.
 */
export const StageBubbles: React.FC<{
  text: string;
  speaker: BubbleSpeakerLocation;
  /** Every character placed on the stage (the earlier speaker is looked up here). */
  locations: ReadonlyArray<BubbleSpeakerLocation> | undefined;
  thought?: { color?: string };
  history?: BubbleHistory;
  /** The current bubble is showing (the host's onPlaced state). */
  placed: boolean;
  onPlaced: (placed: boolean) => void;
  theme: RenderThemeSettings;
  avoidRects?: SpeechBubbleLayerProps['avoidRects'];
  skipAnimation?: boolean;
  zIndex?: number;
}> = ({ text, speaker, locations, thought, history, placed, onPlaced, theme, avoidRects, skipAnimation, zIndex = 150 }) => {
  const current: BubbleLine = {
    speaker: speaker.characterId || speaker.characterName || speaker.name,
    text,
    ...(thought ? { thought } : null),
  };
  const earlier = placed ? earlierLineFor(history, current) : undefined;
  const earlierAt = earlier ? speakerLocation(locations, earlier.speaker) : undefined;
  const onShownRef = React.useRef(history?.onShown);
  onShownRef.current = history?.onShown;
  const currentRef = React.useRef(current);
  currentRef.current = current;
  const onShown = React.useCallback(() => onShownRef.current?.(currentRef.current), []);
  return (
    <>
      {earlier && earlierAt && earlierAt.name !== speaker.name && (
        <SpeechBubbleLayer
          key={`earlier:${bubbleLineKey(earlier)}`}
          role="earlier"
          text={earlier.text}
          speakerElementName={earlierAt.name}
          speakFrom={earlierAt.speakFrom}
          flipX={earlierAt.flipX}
          thought={earlier.thought}
          theme={theme}
          avoidRects={avoidRects}
          zIndex={zIndex - 1}
        />
      )}
      <SpeechBubbleLayer
        text={text}
        speakerElementName={speaker.name}
        speakFrom={speaker.speakFrom}
        flipX={speaker.flipX}
        thought={thought}
        theme={theme}
        avoidRects={avoidRects}
        skipAnimation={skipAnimation}
        onPlaced={onPlaced}
        onShown={onShown}
        zIndex={zIndex}
      />
    </>
  );
};

