/**
 * The message history: every conversation (dialog tree) the player has been
 * through, listed like chats in a messenger, each opening as its transcript.
 * History only — nothing here moves the story. Shared by the Preview Window
 * and the exported players; the host decides when to show it (project
 * setting hudOverlays.messageHistory) and supplies the speaker pictures.
 */
import React, { useEffect, useRef, useState } from 'react';
import { uiString } from '@asaps/core';
import type { ConversationLine, ConversationRecord } from '@asaps/core';

export interface ConversationHistoryPanelProps {
  conversations: ConversationRecord[];
  onClose: () => void;
  /** Picture for a line's speaker (portrait, or the state the line showed). */
  resolvePicture?: (line: ConversationLine) => string | undefined;
  /** Panel colours; defaults suit the dark player chrome. */
  colors?: { background?: string; panel?: string; text?: string; accent?: string; playerBubble?: string; npcBubble?: string };
}

/** Who the chat is with: the people who spoke in it, not the player. */
export function conversationTitle(conversation: ConversationRecord): string {
  const names: string[] = [];
  for (const line of conversation.lines) {
    if (line.fromPlayer || !line.speaker) continue;
    if (!names.includes(line.speaker)) names.push(line.speaker);
  }
  if (names.length === 0) return '…';
  return names.length > 3 ? `${names.slice(0, 3).join(', ')} …` : names.join(', ');
}

const NARROW = 560;

export const ConversationHistoryPanel: React.FC<ConversationHistoryPanelProps> = ({
  conversations,
  onClose,
  resolvePicture,
  colors = {},
}) => {
  const c = {
    background: colors.background ?? 'rgba(0,0,0,0.55)',
    panel: colors.panel ?? '#1b1f2b',
    text: colors.text ?? '#eae7de',
    accent: colors.accent ?? '#d9a441',
    playerBubble: colors.playerBubble ?? '#d9a441',
    npcBubble: colors.npcBubble ?? '#2a3040',
  };
  const rootRef = useRef<HTMLDivElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  // 0 until measured (and in environments without layout): treat as wide.
  const [width, setWidth] = useState(0);
  const narrow = width > 0 && width < NARROW;
  // Wide: the latest chat is open beside the list. Narrow: the list first.
  const [openId, setOpenId] = useState<string | null>(null);
  const open = conversations.find((conv) => conv.beatId === openId) ?? (narrow ? undefined : conversations[0]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const read = () => setWidth(el.clientWidth);
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // A transcript opens at its latest line, like a messenger.
  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [open?.beatId, narrow]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const avatar = (line: ConversationLine, size: number) => {
    const url = resolvePicture?.(line);
    const base: React.CSSProperties = {
      width: size, height: size, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
      background: '#3d4356', color: c.text, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.45, fontWeight: 600,
    };
    return url
      ? <img src={url} alt="" style={{ ...base, objectFit: 'cover' }} />
      : <div style={base} aria-hidden>{(line.speaker || '?').trim().charAt(0).toUpperCase()}</div>;
  };

  const list = (
    <div style={{ overflowY: 'auto', flex: narrow ? '1 1 auto' : '0 0 36%', borderRight: narrow ? 'none' : '1px solid rgba(255,255,255,0.08)' }} data-testid="messages-list">
      {conversations.map((conv) => {
        const last = conv.lines[conv.lines.length - 1];
        const firstNpc = conv.lines.find((l) => !l.fromPlayer) ?? last;
        const selected = !narrow && open?.beatId === conv.beatId;
        return (
          <button
            key={conv.beatId}
            type="button"
            onClick={() => setOpenId(conv.beatId)}
            style={{
              display: 'flex', gap: 10, alignItems: 'center', width: '100%', textAlign: 'left',
              padding: '10px 12px', border: 'none', cursor: 'pointer', color: c.text,
              background: selected ? 'rgba(255,255,255,0.08)' : 'transparent',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
            }}
          >
            {firstNpc && avatar(firstNpc, 36)}
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: 'block', fontWeight: 600, fontSize: 14 }}>{conversationTitle(conv)}</span>
              {last && (
                <span style={{ display: 'block', fontSize: 12, opacity: 0.7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {last.fromPlayer ? `${last.speaker}: ` : ''}{last.text}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );

  const transcript = open && (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
      {narrow && (
        <button
          type="button"
          onClick={() => setOpenId(null)}
          style={{ alignSelf: 'flex-start', margin: '8px 10px 0', background: 'transparent', border: 'none', color: c.accent, cursor: 'pointer', fontSize: 13 }}
        >
          ‹ {uiString('messagesBack')}
        </button>
      )}
      <div style={{ padding: '10px 14px', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{conversationTitle(open)}</div>
      <div ref={transcriptRef} style={{ overflowY: 'auto', flex: 1, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }} data-testid="messages-transcript">
        {open.lines.map((line, i) => (
          <React.Fragment key={i}>
            {line.newVisit && <div aria-hidden style={{ textAlign: 'center', opacity: 0.45, fontSize: 12, margin: '6px 0' }}>· · ·</div>}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexDirection: line.fromPlayer ? 'row-reverse' : 'row' }}>
              {!line.fromPlayer && avatar(line, 28)}
              <div style={{ maxWidth: '75%' }}>
                {!line.fromPlayer && (i === 0 || open.lines[i - 1].speaker !== line.speaker || line.newVisit) && (
                  <div style={{ fontSize: 11, opacity: 0.7, margin: '0 0 2px 4px' }}>{line.speaker}</div>
                )}
                <div
                  style={{
                    padding: '8px 12px', borderRadius: 14, fontSize: 14, lineHeight: 1.4, whiteSpace: 'pre-wrap',
                    background: line.fromPlayer ? c.playerBubble : c.npcBubble,
                    color: line.fromPlayer ? '#201607' : c.text,
                  }}
                >
                  {line.text}
                </div>
              </div>
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
  );

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label={uiString('messagesTitle')}
      data-testid="messages-panel"
      onClick={onClose}
      // pointerEvents: hosts may mount it inside a click-through overlay.
      style={{ position: 'absolute', inset: 0, zIndex: 9000, pointerEvents: 'auto', background: c.background, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: narrow ? 8 : 24 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 920, height: '100%', maxHeight: 640, display: 'flex', flexDirection: 'column',
          background: c.panel, color: c.text, borderRadius: 12, overflow: 'hidden', boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <span style={{ fontWeight: 700, fontSize: 16, flex: 1 }}>{uiString('messagesTitle')}</span>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.25)', color: c.text, borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 13 }}
          >
            {uiString('messagesClose')}
          </button>
        </div>
        {conversations.length === 0 ? (
          <div style={{ padding: 24, opacity: 0.75, textAlign: 'center' }}>{uiString('messagesEmpty')}</div>
        ) : (
          <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
            {(!narrow || !open) && list}
            {transcript}
          </div>
        )}
      </div>
    </div>
  );
};
