/**
 * The player's replies in a Dialog Tree as one bubble at the player's
 * character (Speaker Display ▸ "Show the player's replies as: one bubble"),
 * a line per reply, instead of as buttons. Like SpeechBubbleLayer it is
 * mounted inside the stage and works from what the stage shows: it finds
 * the reply buttons by their text and the player's picture by its
 * `data-character-name`. The buttons stay where they are, hidden while the
 * bubble shows (in the Visual Editor drawn as empty outlines, so they can
 * still be selected), and picking a line clicks its button — so whatever a
 * button does (conditions, visited replies, the reply staying up as the
 * player's line) a line does too. When a button can't be matched, the
 * player isn't on the stage, or the bubble doesn't fit, the buttons show.
 */
import React from 'react';
import type { RenderThemeSettings } from './PositionedBeatView';
import { renderMarkdownLite, markdownLiteToPlain } from '../utils/markdownLite';
import {
  boxBubblePath,
  HEAVY,
  LIGHT,
  placeSpeechBubble,
  replyBubbleSize,
  speakerLocation,
  type BubbleHistory,
  type BubbleObstacle,
  type BubbleRect,
} from '../utils/speechBubble';
import { aimAtSpeaker, quoteAttr, type BubbleSpeakerLocation } from './SpeechBubbleLayer';

const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

/** What a reply button looks like while its line is in the bubble. */
const HIDDEN: Record<string, string> = { visibility: 'hidden' };
/** In the Visual Editor: an empty outline, still there to select. */
const GHOST: Record<string, string> = {
  color: 'transparent',
  'background-color': 'transparent',
  'background-image': 'none',
  'box-shadow': 'none',
  'text-shadow': 'none',
  'border-style': 'dashed',
  'border-width': '1px',
  'border-color': 'rgba(128,128,128,0.6)',
};

/** The reply buttons on the stage, in reply order; undefined when any can't be found. */
function findReplyButtons(root: HTMLElement, replies: string[]): HTMLButtonElement[] | undefined {
  const candidates = Array.from(root.querySelectorAll<HTMLButtonElement>('button')).filter((b) => {
    if (b.closest('[data-speech-bubble-layer]')) return false;
    // A button laid out but not shown yet (a pinned group before the
    // player has read the line) doesn't count.
    const parent = b.parentElement as (HTMLElement & { checkVisibility?: (o?: object) => boolean }) | null;
    return !parent || typeof parent.checkVisibility !== 'function' || parent.checkVisibility({ visibilityProperty: true });
  });
  const used = new Set<HTMLButtonElement>();
  const found: HTMLButtonElement[] = [];
  for (const reply of replies) {
    const want = norm(markdownLiteToPlain(reply));
    if (!want) return undefined;
    const b = candidates.find((c) => !used.has(c) && (norm(c.textContent) === want || norm(c.getAttribute('aria-label')) === want));
    if (!b) return undefined;
    used.add(b);
    found.push(b);
  }
  return found;
}

interface ReplyLayout {
  rect: BubbleRect;
  tip: { x: number; y: number };
  textWidth: number;
  textHeight: number;
  lettering: React.CSSProperties;
}

const ReplyBubbleLayer: React.FC<{
  player: BubbleSpeakerLocation;
  replies: string[];
  theme: RenderThemeSettings;
  avoidRects?: ReadonlyArray<{ x: number; y: number; width: number; height: number }>;
  editorMode?: boolean;
  zIndex: number;
}> = ({ player, replies, theme, avoidRects, editorMode, zIndex }) => {
  const layerRef = React.useRef<HTMLDivElement>(null);
  const measureRef = React.useRef<HTMLDivElement>(null);
  const [layout, setLayout] = React.useState<ReplyLayout | null>(null);
  const layoutRef = React.useRef<ReplyLayout | null>(null);
  const buttonsRef = React.useRef<HTMLButtonElement[]>([]);
  const [disabled, setDisabled] = React.useState<boolean[]>([]);
  // What each button's style was before we hid it, to put back.
  const savedRef = React.useRef(new Map<HTMLElement, Array<[string, string, string]>>());
  const [headTick, setHeadTick] = React.useState(0);
  const headFound = React.useCallback(() => setHeadTick((t) => t + 1), []);
  const repliesKey = replies.join('\u0000');
  const stroke = Math.max(0, theme.textBox?.borderWidth ?? 2);

  const restore = React.useCallback((keep?: Set<HTMLElement>) => {
    for (const [el, saved] of savedRef.current) {
      if (keep?.has(el)) continue;
      for (const [prop, value, priority] of saved) {
        if (value) el.style.setProperty(prop, value, priority);
        else el.style.removeProperty(prop);
      }
      savedRef.current.delete(el);
    }
  }, []);

  const conceal = React.useCallback((buttons: HTMLElement[]) => {
    const look = editorMode ? GHOST : HIDDEN;
    restore(new Set(buttons));
    for (const el of buttons) {
      if (!savedRef.current.has(el)) {
        savedRef.current.set(el, Object.keys(look).map((p) => [p, el.style.getPropertyValue(p), el.style.getPropertyPriority(p)]));
      }
      // Only what differs: setting a style is itself a change the stage's observers see.
      for (const [p, v] of Object.entries(look)) if (el.style.getPropertyValue(p) !== v) el.style.setProperty(p, v);
    }
  }, [editorMode, restore]);

  const compute = React.useCallback(() => {
    const layer = layerRef.current;
    const measure = measureRef.current;
    const root = layer?.parentElement;
    const fail = () => {
      restore();
      buttonsRef.current = [];
      if (layoutRef.current) { layoutRef.current = null; setLayout(null); }
    };
    if (!layer || !measure || !root) return fail();
    const stageW = root.offsetWidth || root.clientWidth;
    const stageH = root.offsetHeight || root.clientHeight;
    const rootBox = root.getBoundingClientRect();
    if (!(stageW > 0 && stageH > 0 && rootBox.width > 0)) return fail();
    const scale = rootBox.width / stageW || 1;
    const toStage = (r: DOMRect): BubbleRect => ({
      x: (r.left - rootBox.left) / scale,
      y: (r.top - rootBox.top) / scale,
      width: r.width / scale,
      height: r.height / scale,
    });

    const playerEl = root.querySelector<HTMLElement>(`[data-character-name="${quoteAttr(player.name)}"]`);
    const playerRect = playerEl ? toStage(playerEl.getBoundingClientRect()) : null;
    if (!playerRect || playerRect.width <= 0 || playerRect.height <= 0) return fail();
    const buttons = findReplyButtons(root, replies);
    if (!buttons || buttons.length === 0) return fail();

    // The lettering of the spoken lines (their text box), so the player's
    // replies read like the rest of the conversation.
    const line = root.querySelector<HTMLElement>('[data-speech-line]');
    const cs = line && typeof getComputedStyle === 'function' ? getComputedStyle(line) : null;
    const lettering: React.CSSProperties = {
      fontFamily: cs?.fontFamily || theme.fonts?.textFont || 'sans-serif',
      fontSize: cs?.fontSize || `${theme.fonts?.textFontSize || 18}px`,
      fontWeight: cs?.fontWeight || '500',
      lineHeight: cs?.lineHeight && cs.lineHeight !== 'normal' ? cs.lineHeight : '1.4',
      letterSpacing: cs?.letterSpacing || 'normal',
    };
    Object.assign(measure.style, lettering, { maxWidth: `${Math.round(Math.min(380, Math.max(160, stageW * 0.34)))}px` });
    const m = measure.getBoundingClientRect();
    const textWidth = Math.ceil(m.width / scale) + 1;
    const textHeight = Math.ceil(m.height / scale);
    if (!(textWidth > 1 && textHeight > 0)) return fail();
    const fontPx = parseFloat(String(lettering.fontSize)) || 18;
    const size = replyBubbleSize(textWidth, textHeight, fontPx, stroke);

    const mine = new Set<HTMLElement>(buttons);
    const obstacles: BubbleObstacle[] = [];
    for (const r of avoidRects ?? []) obstacles.push({ rect: { x: r.x, y: r.y, width: r.width, height: r.height }, weight: HEAVY });
    root.querySelectorAll<HTMLElement>('button, [role="button"]').forEach((el) => {
      if (mine.has(el) || el.closest('[data-speech-bubble-layer]')) return;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) obstacles.push({ rect: toStage(r), weight: HEAVY });
    });
    root.querySelectorAll<HTMLElement>('[data-character-name]').forEach((el) => {
      if (el === playerEl) return;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) obstacles.push({ rect: toStage(r), weight: LIGHT });
    });
    // The line being answered stays readable.
    root.querySelectorAll<HTMLElement>('[data-speech-bubble="current"]').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) obstacles.push({ rect: toStage(r), weight: HEAVY });
    });

    const { mouth, stopShort } = aimAtSpeaker(playerEl, playerRect, player.speakFrom, player.flipX, toStage, headFound);
    const placement = placeSpeechBubble({
      stage: { width: stageW, height: stageH },
      size,
      mouth,
      speaker: playerRect,
      obstacles,
      stopShort,
      shape: 'box',
    });
    if (!placement) return fail();

    buttonsRef.current = buttons;
    const nowDisabled = buttons.map((b) => b.disabled);
    setDisabled((d) => (d.length === nowDisabled.length && d.every((x, i) => x === nowDisabled[i]) ? d : nowDisabled));
    conceal(buttons);
    const next: ReplyLayout = { ...placement, textWidth, textHeight, lettering };
    const prev = layoutRef.current;
    const near = (p: number, q: number) => Math.abs(p - q) < 0.5;
    if (!prev || !near(prev.rect.x, next.rect.x) || !near(prev.rect.y, next.rect.y) || !near(prev.rect.width, next.rect.width)
      || !near(prev.rect.height, next.rect.height) || !near(prev.tip.x, next.tip.x) || !near(prev.tip.y, next.tip.y)
      || prev.lettering.fontSize !== next.lettering.fontSize || prev.lettering.fontFamily !== next.lettering.fontFamily) {
      layoutRef.current = next;
      setLayout(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.name, player.speakFrom?.x, player.speakFrom?.y, player.flipX, repliesKey, stroke, avoidRects, theme.fonts?.textFont, theme.fonts?.textFontSize, conceal, restore, headFound, headTick]);

  // Place it before the first paint, then follow the stage: the buttons
  // arriving once the line has been read, a resized window, the other
  // bubbles moving.
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
    moves?.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'src', 'disabled'] });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      resize?.disconnect();
      moves?.disconnect();
    };
  }, [compute]);

  // Gone (a reply picked, the beat over): the buttons as they were.
  React.useEffect(() => () => restore(), [restore]);

  const textColor = theme.colors?.textColor || '#1f2937';
  const fill = theme.textBox?.backgroundColor || '#ffffff';
  const fillOpacity = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(fill) ? Math.max(0, Math.min(100, theme.textBox?.opacity ?? 100)) / 100 : 1;
  const outline = stroke > 0 ? (theme.textBox?.borderColor || '#1f2937') : 'none';

  const lineStyle: React.CSSProperties = {
    display: 'flex', gap: '0.4em', alignItems: 'baseline', boxSizing: 'border-box', width: '100%',
    margin: 0, padding: '0.15em 0.35em', border: 0, borderRadius: 6, background: 'transparent',
    font: 'inherit', color: 'inherit', textAlign: 'start', lineHeight: 'inherit', letterSpacing: 'inherit',
  };
  const lines = (interactive: boolean) => replies.map((reply, i) => {
    const content = (
      <>
        <span aria-hidden style={{ opacity: 0.55, flex: 'none' }}>▸</span>
        <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'break-word', minWidth: 0 }} dangerouslySetInnerHTML={{ __html: renderMarkdownLite(reply) }} />
      </>
    );
    if (!interactive) return <div key={i} style={lineStyle}>{content}</div>;
    // In the Visual Editor the stage's buttons are inert; the lines stay readable.
    const off = !editorMode && !!disabled[i];
    return (
      <button
        key={i}
        type="button"
        className="asaps-reply-line"
        data-reply-line={i}
        disabled={off}
        onClick={(e) => { e.stopPropagation(); buttonsRef.current[i]?.click(); }}
        style={{ ...lineStyle, cursor: off ? 'default' : 'pointer', ...(off ? { opacity: 0.45 } : null) }}
      >
        {content}
      </button>
    );
  });

  return (
    <div ref={layerRef} data-speech-bubble-layer="replies" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex }}>
      <div
        ref={measureRef}
        aria-hidden
        style={{ position: 'absolute', left: 0, top: 0, visibility: 'hidden', display: 'inline-block' }}
      >
        {lines(false)}
      </div>
      {layout && (() => {
        const { rect, tip, textWidth, textHeight, lettering } = layout;
        return (
          <div
            data-speech-bubble="replies"
            role="group"
            aria-label="Your reply"
            style={{ position: 'absolute', left: rect.x, top: rect.y, width: rect.width, height: rect.height, pointerEvents: 'auto' }}
          >
            <style>{'.asaps-reply-line:not(:disabled):hover{background:rgba(127,127,127,0.2)!important}.asaps-reply-line:focus-visible{outline:2px solid currentColor;outline-offset:1px}'}</style>
            <svg
              width={rect.width}
              height={rect.height}
              aria-hidden
              style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.25))' }}
            >
              <path
                d={boxBubblePath(rect.width, rect.height, { x: tip.x - rect.x, y: tip.y - rect.y }, stroke)}
                fill={fill}
                fillOpacity={fillOpacity}
                stroke={outline}
                strokeWidth={stroke}
                strokeLinejoin="round"
              />
            </svg>
            <div
              style={{
                position: 'absolute',
                left: (rect.width - textWidth) / 2,
                top: (rect.height - textHeight) / 2,
                width: textWidth,
                ...lettering,
                color: textColor,
              }}
            >
              {lines(true)}
            </div>
          </div>
        );
      })()}
    </div>
  );
};

/**
 * The player's replies in one bubble, when Speaker Display asks for it, the
 * stage is a Dialog Tree's with replies to pick, and the player's character
 * is on the stage. Every stage view mounts this beside StageBubbles.
 */
export const ReplyBubble: React.FC<{
  locations: ReadonlyArray<BubbleSpeakerLocation> | undefined;
  history?: BubbleHistory;
  theme: RenderThemeSettings;
  avoidRects?: ReadonlyArray<{ x: number; y: number; width: number; height: number }>;
  editorMode?: boolean;
  zIndex?: number;
}> = ({ locations, history, theme, avoidRects, editorMode, zIndex = 151 }) => {
  if (theme?.speakerDisplay?.replyStyle !== 'bubble') return null;
  const replies = history?.replies?.filter((r) => r.trim());
  if (!replies || replies.length === 0) return null;
  const player = speakerLocation(locations, history?.player);
  if (!player) return null;
  return (
    <ReplyBubbleLayer
      key={replies.join('\u0000')}
      player={player}
      replies={replies}
      theme={theme}
      avoidRects={avoidRects}
      editorMode={editorMode}
      zIndex={zIndex}
    />
  );
};
