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
  replyTextMaxWidth,
  placeOffstageBubble,
  speakerLocation,
  type BubbleHistory,
  type BubbleObstacle,
  type BubbleRect,
  hudFramesOver,
  HUD_LAYOUT_EVENT,
} from '../utils/speechBubble';
import { aimAtSpeaker, quoteAttr, type BubbleSpeakerLocation } from './SpeechBubbleLayer';

/**
 * A reply's words, for telling which button stands for it. Without any
 * whitespace: a reply written over two lines is drawn with a line break,
 * which a button's text content doesn't have ("you.Thanks"), so matching
 * on spaces missed every reply with a line break in it.
 */
const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, '');

/**
 * What a reply button looks like while its line is in the bubble. Without
 * its transition: theme buttons ease every property, visibility included,
 * so they would stay visible for the length of the easing first.
 */
/** On the stage root while the replies could not be put in a bubble and stay buttons (the line's bubble then keeps clear of them). */
export const REPLIES_AS_BUTTONS_ATTR = 'data-replies-as-buttons';
/** A reply bubble over more of another character's face than this stays buttons: it would hide who the player is answering. */
export const REPLY_MAX_FACE_COVER = 0.3;
/** After this many misses the same replies at the same size stay buttons. */
const MAX_MISSES = 4;
const HIDDEN: Record<string, string> = { transition: 'none', visibility: 'hidden' };
/** In the Visual Editor: nothing drawn, but still laid out where the editor can find it. */
const GHOST: Record<string, string> = {
  transition: 'none',
  color: 'transparent',
  'background-color': 'transparent',
  'background-image': 'none',
  'box-shadow': 'none',
  'text-shadow': 'none',
  'border-color': 'transparent',
  'outline-color': 'transparent',
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
  /** The player's character on the stage; null when it isn't there, and the replies come from off-stage. */
  player: BubbleSpeakerLocation | null;
  replies: string[];
  theme: RenderThemeSettings;
  avoidRects?: ReadonlyArray<{ x: number; y: number; width: number; height: number }>;
  editorMode?: boolean;
  onShown?: (shown: boolean) => void;
  zIndex: number;
}> = ({ player, replies, theme, avoidRects, editorMode, onShown, zIndex }) => {
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

  /** The replies and stage size for which these replies turned out to be no bubble. */
  const triesRef = React.useRef<{ key: string; misses: number; seen?: string }>({ key: '', misses: 0 });
  /** Looks again two frames on: after the line's bubble, told something new, has found its place. */
  const againRef = React.useRef<() => void>(() => {});

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

    const playerEl = player ? root.querySelector<HTMLElement>(`[data-character-name="${quoteAttr(player.name)}"]`) : null;
    const playerRect = playerEl ? toStage(playerEl.getBoundingClientRect()) : null;
    if (player && (!playerRect || playerRect.width <= 0 || playerRect.height <= 0)) return fail();
    // Off-stage replies answer a line that is in a bubble. Where the line
    // is in the text box (narration, a speaker who isn't shown either, a
    // bubble that didn't fit), the replies stay buttons under it.
    if (!player && !root.querySelector('[data-speech-bubble="current"]')) return fail();
    const buttons = findReplyButtons(root, replies);
    if (!buttons || buttons.length === 0) return fail();
    // From here on a failure means these replies are no bubble on this stage
    // (too big for one, nowhere to put it). The line's bubble is told, so it
    // keeps clear of the buttons, which stay. After a few misses it holds for
    // these replies at this size: the line moving aside must not start a
    // to-and-fro.
    const attempt = `${repliesKey}|${stageW}x${stageH}|${theme.speakerDisplay?.replyBubbleWidth ?? ''}|${theme.fonts?.textFontSize ?? ''}`;
    // Not on the first miss: the stage may still be settling (the line's
    // bubble finding its place, buttons sliding in).
    if (triesRef.current.key !== attempt) triesRef.current = { key: attempt, misses: 0 };
    // A miss counts once per situation: looking again at a stage that has
    // not changed (the stage is looked at often while it settles) used up
    // the tries before anything had moved.
    const staysButtons = (situation: string) => {
      if (triesRef.current.seen !== situation) {
        triesRef.current.seen = situation;
        triesRef.current.misses += 1;
      }
      if (!root.hasAttribute(REPLIES_AS_BUTTONS_ATTR)) root.setAttribute(REPLIES_AS_BUTTONS_ATTR, '');
      fail();
    };
    if (triesRef.current.misses >= MAX_MISSES) {
      if (!root.hasAttribute(REPLIES_AS_BUTTONS_ATTR)) root.setAttribute(REPLIES_AS_BUTTONS_ATTR, '');
      return fail();
    }

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
    Object.assign(measure.style, lettering, { maxWidth: `${replyTextMaxWidth(stageW, theme.speakerDisplay?.replyBubbleWidth)}px` });
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
    // Meters and inventories over the stage: a character's own, drawn on
    // the stage, and screen-docked ones, which the screen HUD layer draws
    // outside it (looking only inside the stage missed those).
    hudFramesOver(root, rootBox).forEach((r) => obstacles.push({ rect: toStage(r), weight: HEAVY }));
    root.querySelectorAll<HTMLElement>('[data-character-name]').forEach((el) => {
      if (el === playerEl) return;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) obstacles.push({ rect: toStage(r), weight: LIGHT });
    });
    // The line being answered stays readable.
    const lineBubbles: BubbleObstacle[] = [];
    root.querySelectorAll<HTMLElement>('[data-speech-bubble="current"]').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) lineBubbles.push({ rect: toStage(r), weight: HEAVY });
    });

    const aim = player && playerRect ? aimAtSpeaker(playerEl, playerRect, player.speakFrom, player.flipX, toStage, headFound) : null;
    const place = (around: BubbleObstacle[]) => (aim && playerRect
      ? placeSpeechBubble({
        stage: { width: stageW, height: stageH },
        size,
        mouth: aim.mouth,
        speaker: playerRect,
        obstacles: around,
        stopShort: aim.stopShort,
        shape: 'box',
        maxFaceCover: REPLY_MAX_FACE_COVER,
      })
      // The player is not shown: the replies come from this side of the screen.
      : placeOffstageBubble({ stage: { width: stageW, height: stageH }, size, obstacles: around }));
    const placement = place([...obstacles, ...lineBubbles]);
    if (!placement) {
      const box = (o: BubbleObstacle) => `${Math.round(o.rect.x)},${Math.round(o.rect.y)},${Math.round(o.rect.width)},${Math.round(o.rect.height)}`;
      const situation = [...obstacles, ...lineBubbles].map(box).join(';') + `|${aim ? `${Math.round(aim.mouth.x)},${Math.round(aim.mouth.y)}` : ''}`;
      // Only the line's bubble is in the way, and it is where it is because
      // the replies were buttons a moment ago: told to keep clear of them, it
      // moved into the one place this bubble has, and so they stayed buttons
      // for good. Take the word back and look again once it has gone back.
      if (lineBubbles.length > 0 && root.hasAttribute(REPLIES_AS_BUTTONS_ATTR) && place(obstacles)) {
        if (triesRef.current.seen !== situation) { triesRef.current.seen = situation; triesRef.current.misses += 1; }
        root.removeAttribute(REPLIES_AS_BUTTONS_ATTR);
        fail();
        againRef.current();
        return;
      }
      return staysButtons(situation);
    }
    if (root.hasAttribute(REPLIES_AS_BUTTONS_ATTR)) root.removeAttribute(REPLIES_AS_BUTTONS_ATTR);

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
  }, [player?.name, player?.speakFrom?.x, player?.speakFrom?.y, player?.flipX, repliesKey, stroke, avoidRects, theme.fonts?.textFont, theme.fonts?.textFontSize, theme.speakerDisplay?.replyBubbleWidth, conceal, restore, headFound, headTick]);

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
    let again = 0;
    againRef.current = () => {
      if (again) return;
      again = requestAnimationFrame(() => { again = requestAnimationFrame(() => { again = 0; compute(); }); });
    };
    const resize = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    resize?.observe(root);
    root.querySelectorAll('[data-character-name]').forEach((el) => resize?.observe(el));
    // At once, not on the next frame: a reply button the stage has just put
    // up (or drawn again) is hidden before it is ever painted. Hiding it is a
    // change too, but the next pass changes nothing and it stops there.
    const moves = typeof MutationObserver !== 'undefined' ? new MutationObserver((records) => {
      if (records.some((r) => !layerRef.current?.contains(r.target))) compute();
    }) : null;
    moves?.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'src', 'disabled'] });
    // What happens around the stage is a new situation: the misses counted
    // so far (some of them measured while things were still moving) no
    // longer say that these replies are no bubble here.
    const afresh = () => { triesRef.current.misses = 0; triesRef.current.seen = undefined; schedule(); };
    // Screen-docked panels are drawn outside the stage: they say when they have moved.
    window.addEventListener(HUD_LAYOUT_EVENT, afresh);
    // Something on the stage, or something the stage is inside (a preview
    // easing to another zoom), has come to rest: what was measured on the
    // way no longer holds. (Going from Desktop to a tablet in the Preview
    // left the replies over a face.)
    const doc = root.ownerDocument;
    const settled = (e: Event) => {
      const t = e.target as Node | null;
      if (!t || layerRef.current?.contains(t)) return;
      if (t !== root && t.contains(root)) afresh();
      else if (root.contains(t)) schedule();
    };
    doc.addEventListener('animationend', settled);
    doc.addEventListener('transitionend', settled);
    return () => {
      if (again) cancelAnimationFrame(again);
      againRef.current = () => {};
      doc.removeEventListener('animationend', settled);
      doc.removeEventListener('transitionend', settled);
      window.removeEventListener(HUD_LAYOUT_EVENT, afresh);
      if (frame) cancelAnimationFrame(frame);
      resize?.disconnect();
      moves?.disconnect();
    };
  }, [compute]);

  // Gone (a reply picked, the beat over): the buttons as they were.
  React.useEffect(() => () => restore(), [restore]);
  React.useEffect(() => {
    const root = layerRef.current?.parentElement;
    return () => root?.removeAttribute(REPLIES_AS_BUTTONS_ATTR);
  }, []);

  // The stage lights the player's character while their replies are up.
  const shown = !!layout;
  const onShownRef = React.useRef(onShown);
  onShownRef.current = onShown;
  React.useEffect(() => { onShownRef.current?.(shown); }, [shown]);
  React.useEffect(() => () => onShownRef.current?.(false), []);

  const textColor = theme.colors?.textColor || '#1f2937';
  const fill = theme.textBox?.backgroundColor || '#ffffff';
  const fillOpacity = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(fill) ? Math.max(0, Math.min(100, theme.textBox?.opacity ?? 100)) / 100 : 1;
  const outline = stroke > 0 ? (theme.textBox?.borderColor || '#1f2937') : 'none';

  // Each reply looks like the story's buttons (their colours, border and
  // corners, a little smaller), so it reads as something to click.
  const btn = theme.button;
  const btnBorder = Math.min(2, Math.max(1, btn?.borderWidth ?? 1));
  const lineStyle = (i: number): React.CSSProperties => ({
    display: 'block', boxSizing: 'border-box', width: '100%',
    margin: i > 0 ? '0.35em 0 0' : 0, padding: '0.25em 0.6em',
    border: `${btnBorder}px solid ${btn?.borderColor || 'rgba(127,127,127,0.6)'}`,
    borderRadius: Math.min(12, Math.max(4, btn?.borderRadius ?? 8)),
    backgroundColor: btn?.backgroundColor || 'rgba(127,127,127,0.15)',
    color: btn?.textColor || 'inherit',
    font: 'inherit', textAlign: 'start', lineHeight: 'inherit', letterSpacing: 'inherit',
    boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
  });
  const lines = (interactive: boolean) => replies.map((reply, i) => {
    const content = (
      <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'break-word', minWidth: 0 }} dangerouslySetInnerHTML={{ __html: renderMarkdownLite(reply) }} />
    );
    if (!interactive) return <div key={i} style={lineStyle(i)}>{content}</div>;
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
        style={{ ...lineStyle(i), cursor: off ? 'default' : 'pointer', ...(off ? { opacity: 0.45 } : null) }}
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
            <style>{`.asaps-reply-line:not(:disabled):hover{background-color:${btn?.hoverBackgroundColor || 'rgba(127,127,127,0.3)'}!important;filter:brightness(1.05)}.asaps-reply-line:focus-visible{outline:2px solid currentColor;outline-offset:1px}`}</style>
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
 * The player's replies in one bubble, when Speaker Display asks for it and
 * the stage is a Dialog Tree's with replies to pick. It points at the
 * player's character where that is on the stage. Where it isn't (many
 * stories never show the player), the bubble comes from this side of the
 * screen, along the bottom, as long as the line being answered is in a
 * bubble too: next to a text box, buttons stay buttons. Every stage view
 * mounts this beside StageBubbles.
 */
export const ReplyBubble: React.FC<{
  locations: ReadonlyArray<BubbleSpeakerLocation> | undefined;
  history?: BubbleHistory;
  theme: RenderThemeSettings;
  avoidRects?: ReadonlyArray<{ x: number; y: number; width: number; height: number }>;
  editorMode?: boolean;
  /** The bubble is up (true) or gone (false): the stage lights the player's character meanwhile. */
  onShown?: (shown: boolean) => void;
  zIndex?: number;
}> = ({ locations, history, theme, avoidRects, editorMode, onShown, zIndex = 151 }) => {
  if (theme?.speakerDisplay?.replyStyle !== 'bubble') return null;
  const replies = history?.replies?.filter((r) => typeof r === 'string' && r.trim());
  if (!replies || replies.length === 0) return null;
  const player = speakerLocation(locations, history?.player) ?? null;
  // Off-stage replies only in a conversation of bubbles.
  if (!player && theme?.speakerDisplay?.lineStyle !== 'bubble') return null;
  return (
    <ReplyBubbleLayer
      key={replies.join('\u0000')}
      player={player}
      replies={replies}
      theme={theme}
      avoidRects={avoidRects}
      editorMode={editorMode}
      onShown={onShown}
      zIndex={zIndex}
    />
  );
};
