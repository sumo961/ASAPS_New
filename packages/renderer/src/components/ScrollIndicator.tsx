import React from 'react';

interface ScrollIndicatorProps {
  position: 'bottom' | 'top';
  /** Custom message to display */
  message?: string;
  /** Whether to show the text message (default: true in preview, false in editor) */
  showMessage?: boolean;
  /** Font scale multiplier (default 1.0) */
  fontScale?: number;
}

/**
 * Visual indicator showing that content extends beyond visible area.
 * Displays a gradient fade with optional directional message.
 */
export const ScrollIndicator: React.FC<ScrollIndicatorProps> = ({
  position,
  message,
  showMessage = true,
  fontScale = 1.0,
}) => {
  const defaultMessage = position === 'bottom' ? '↓ Scroll for more' : '↑ Scroll up';
  const displayMessage = message ?? defaultMessage;

  return (
    <div
      style={{
        position: 'absolute',
        [position]: 0,
        left: 0,
        right: 0,
        height: 30,
        background:
          position === 'bottom'
            ? 'linear-gradient(to bottom, transparent, rgba(0, 0, 0, 0.3))'
            : 'linear-gradient(to top, transparent, rgba(0, 0, 0, 0.3))',
        pointerEvents: 'none',
        display: 'flex',
        alignItems: position === 'bottom' ? 'flex-end' : 'flex-start',
        justifyContent: 'center',
        paddingBottom: position === 'bottom' ? 4 : 0,
        paddingTop: position === 'top' ? 4 : 0,
        zIndex: 10,
      }}
    >
      {showMessage && (
        <span
          style={{
            fontSize: Math.round(11 * fontScale),
            color: 'white',
            textShadow: '0 1px 2px rgba(0, 0, 0, 0.5)',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          {displayMessage}
        </span>
      )}
    </div>
  );
};

/**
 * Small badge indicator for editor mode showing that content is scrollable.
 * Less intrusive than the full gradient overlay.
 */
export const ScrollBadge: React.FC<{ visible: boolean; fontScale?: number }> = ({ visible, fontScale = 1.0 }) => {
  if (!visible) return null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 4,
        right: 4,
        background: 'rgba(0, 0, 0, 0.6)',
        color: 'white',
        padding: '2px 6px',
        borderRadius: 4,
        fontSize: Math.round(10 * fontScale),
        fontFamily: 'system-ui, sans-serif',
        pointerEvents: 'none',
        zIndex: 10,
      }}
    >
      Scrollable
    </div>
  );
};

/** Set on the stage's root while replies wait or stay buttons (SpeechBubbleLayer, ReplyBubbleLayer). */
const STAGE_REPLY_ATTRS = ['data-replies-wait', 'data-replies-as-buttons', 'style', 'class'];

/**
 * "There is more below", for a list that scrolls inside the stage (the
 * player's replies on a phone). Put it last inside the scrolling element: it
 * takes no room, stays at the bottom edge of what is visible, and shows a
 * fade and a round ▾ while there is something further down. A tap on the ▾
 * scrolls on. No words, so nothing to translate.
 */
export const ScrollMoreHint: React.FC = () => {
  const ref = React.useRef<HTMLDivElement>(null);
  const [more, setMore] = React.useState(false);
  // The list's own padding under its last entry: "sticky" stops above it,
  // which left the hint floating a strip above the edge.
  const [inset, setInset] = React.useState(0);
  React.useLayoutEffect(() => {
    const scroller = ref.current?.parentElement;
    if (!scroller) return;
    const check = () => {
      const pad = typeof getComputedStyle === 'function' ? parseFloat(getComputedStyle(scroller).paddingBottom) || 0 : 0;
      setInset((was) => (Math.abs(was - pad) < 0.5 ? was : pad));
      const left = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop;
      // Not for a list that isn't shown: replies drawn in a bubble leave
      // their buttons in place, hidden.
      const shown = Array.from(scroller.children).some((el) => el !== ref.current
        && (typeof getComputedStyle !== 'function' || getComputedStyle(el).visibility !== 'hidden'));
      // Something of the list itself is out of sight below, not only the
      // empty strip under its last entry (a single Continue button in a
      // tight row "scrolled" by its padding and got a hint it didn't need).
      const entries = Array.from(scroller.children).filter((el) => el !== ref.current);
      const last = entries[entries.length - 1];
      const cut = last ? last.getBoundingClientRect().bottom - scroller.getBoundingClientRect().bottom : 0;
      const measured = !!last && last.getBoundingClientRect().height > 0;
      setMore(shown && left > 6 && (!measured || cut > 2));
    };
    check();
    // Now, and again once it has been drawn: replies that have just been
    // made visible still read as hidden in the instant of the change (their
    // own easing starts from "hidden"), and the hint stayed off for good.
    let frame = 0;
    const settled = () => {
      check();
      if (typeof requestAnimationFrame !== 'function') return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { frame = requestAnimationFrame(check); });
    };
    scroller.addEventListener('scroll', check, { passive: true });
    const resize = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(check) : null;
    // The list and each of its entries: a reply that grows after it arrived
    // (its words wrapping once the stage has settled) makes the list longer
    // without the list's own box changing, and the hint stayed off.
    const watch = () => {
      if (!resize) return;
      resize.disconnect();
      resize.observe(scroller);
      Array.from(scroller.children).forEach((el) => { if (el !== ref.current) resize.observe(el); });
    };
    watch();
    // Replies arriving, a reply wrapping onto another line.
    const changes = typeof MutationObserver !== 'undefined' ? new MutationObserver((records) => {
      if (records.some((r) => r.type === 'childList' && r.target === scroller)) watch();
      if (records.some((r) => !ref.current?.contains(r.target))) settled();
    }) : null;
    changes?.observe(scroller, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['style'] });
    // Replies kept back while the line is read, or while they stand in a
    // bubble, are hidden from the stage's root: nothing inside the list
    // changes when they are shown, and the hint never looked again.
    const shownAgain = typeof MutationObserver !== 'undefined' ? new MutationObserver(settled) : null;
    for (let up = scroller.parentElement; up; up = up.parentElement) {
      shownAgain?.observe(up, { attributes: true, attributeFilter: STAGE_REPLY_ATTRS });
    }
    // Entries easing in, or the stage easing to another size.
    scroller.addEventListener('transitionend', check);
    scroller.addEventListener('animationend', check);
    return () => {
      scroller.removeEventListener('scroll', check);
      scroller.removeEventListener('transitionend', check);
      scroller.removeEventListener('animationend', check);
      resize?.disconnect();
      changes?.disconnect();
      shownAgain?.disconnect();
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
    };
  }, []);
  const onward = (e: React.MouseEvent) => {
    e.stopPropagation();
    const scroller = ref.current?.parentElement;
    if (!scroller) return;
    const top = scroller.scrollTop + scroller.clientHeight * 0.8;
    if (typeof scroller.scrollTo === 'function') scroller.scrollTo({ top, behavior: 'smooth' });
    else scroller.scrollTop = top;
  };
  return (
    <div
      ref={ref}
      data-scroll-more={more ? 'yes' : 'no'}
      style={{
        position: 'sticky', bottom: -inset, height: 0, width: '100%', flex: '0 0 0px', gridColumn: '1 / -1',
        alignSelf: 'stretch', overflow: 'visible', pointerEvents: 'none', zIndex: 6,
        // A flex or grid gap before an element without height would add a strip of nothing to scroll.
        margin: 0,
      }}
    >
      {more && (
        <div
          style={{
            position: 'absolute', left: 0, right: 0, bottom: 0, height: 44,
            background: 'linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,0.5))',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 4,
          }}
        >
          <button
            type="button"
            aria-label="More below"
            onClick={onward}
            style={{
              pointerEvents: 'auto', width: 28, height: 28, borderRadius: 14, padding: 0,
              border: '1px solid rgba(255,255,255,0.6)', background: 'rgba(0,0,0,0.65)', color: '#fff',
              fontSize: 16, lineHeight: '26px', textAlign: 'center', cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
            }}
          >
            ▾
          </button>
        </div>
      )}
    </div>
  );
};

export default ScrollIndicator;
