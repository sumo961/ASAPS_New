/**
 * NoticeHost — renders the app-wide notice stack and confirm dialogs raised
 * through utils/notify.ts. Mounted once per window in main.tsx (the editor,
 * the Preview Window and every pop-out share the same entry point).
 *
 * Notices stack bottom-right (newest last, max 5); success/info/warning
 * auto-dismiss, errors stay until closed. Hovering a notice pauses its
 * timer so a long message can be read. Confirms are queued and shown one at
 * a time: Escape or the backdrop cancels, Enter presses the focused button.
 * The confirm button holds focus, except for destructive confirms, where
 * Cancel does — a reflexive Enter never deletes anything.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeNotices, type ConfirmRequest, type Notice } from '../../utils/notify';

const MAX_VISIBLE = 5;

const PALETTE: Record<Notice['kind'], { bg: string; border: string; icon: string }> = {
  success: { bg: '#14532d', border: '#22c55e', icon: '✓' },
  info: { bg: '#1e3a8a', border: '#3b82f6', icon: 'i' },
  warning: { bg: '#713f12', border: '#f59e0b', icon: '!' },
  error: { bg: '#7f1d1d', border: '#ef4444', icon: '✕' },
};

const NoticeItem: React.FC<{ notice: Notice; onClose: (id: number) => void }> = ({ notice, onClose }) => {
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (notice.sticky || paused) return;
    const timer = window.setTimeout(() => onClose(notice.id), notice.durationMs);
    return () => window.clearTimeout(timer);
  }, [notice, paused, onClose]);

  const colors = PALETTE[notice.kind];
  return (
    <div
      role={notice.kind === 'error' ? 'alert' : 'status'}
      data-notice-kind={notice.kind}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      style={{
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        color: '#f1f5f9',
        padding: '10px 12px',
        borderRadius: 8,
        fontSize: 13,
        lineHeight: 1.4,
        width: 380,
        maxWidth: 'calc(100vw - 40px)',
        boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
        pointerEvents: 'auto',
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
      }}
    >
      <span aria-hidden style={{ fontWeight: 700, color: colors.border, minWidth: 12, textAlign: 'center' }}>
        {colors.icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{notice.message}</div>
        {notice.detail && (
          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.8, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {notice.detail}
          </div>
        )}
        {notice.action && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await notice.action!.run();
              } finally {
                onClose(notice.id);
              }
            }}
            style={{
              marginTop: 8,
              background: 'rgba(255,255,255,0.12)',
              border: `1px solid ${colors.border}`,
              color: '#fff',
              borderRadius: 5,
              padding: '3px 10px',
              fontSize: 12,
              fontWeight: 600,
              cursor: busy ? 'default' : 'pointer',
            }}
          >
            {notice.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => onClose(notice.id)}
        title="Dismiss"
        aria-label="Dismiss"
        style={{ background: 'none', border: 'none', color: '#f1f5f9', opacity: 0.7, cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 2 }}
      >
        {'✕'}
      </button>
    </div>
  );
};

const ConfirmDialog: React.FC<{ request: ConfirmRequest; onAnswer: (ok: boolean) => void }> = ({ request, onAnswer }) => {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    (request.destructive ? cancelRef : confirmRef).current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onAnswer(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [request, onAnswer]);

  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) onAnswer(false); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(15,23,42,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`confirm-title-${request.id}`}
        style={{
          background: '#fff', color: '#0f172a', borderRadius: 10, width: 440, maxWidth: '100%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.35)', padding: '18px 20px 16px',
        }}
      >
        <h2 id={`confirm-title-${request.id}`} style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
          {request.title}
        </h2>
        {request.message && (
          <p style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.5, color: '#334155', whiteSpace: 'pre-wrap' }}>
            {request.message}
          </p>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <button
            ref={cancelRef}
            type="button"
            onClick={() => onAnswer(false)}
            style={{ padding: '7px 14px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontSize: 13, cursor: 'pointer' }}
          >
            {request.cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => onAnswer(true)}
            style={{
              padding: '7px 14px', borderRadius: 6, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              background: request.destructive ? '#dc2626' : '#2563eb', color: '#fff',
            }}
          >
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export const NoticeHost: React.FC = () => {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [confirms, setConfirms] = useState<ConfirmRequest[]>([]);

  const close = useCallback((id: number) => {
    setNotices((prev) => prev.filter((n) => n.id !== id));
  }, []);

  useEffect(() => subscribeNotices(
    (notice) => setNotices((prev) => [...prev, notice].slice(-MAX_VISIBLE)),
    (request) => setConfirms((prev) => [...prev, request]),
  ), []);

  const current = confirms[0];
  const answer = useCallback((ok: boolean) => {
    if (!current) return;
    current.resolve(ok);
    setConfirms((prev) => prev.filter((r) => r.id !== current.id));
  }, [current]);

  return (
    <>
      {notices.length > 0 && (
        <div
          data-notice-host
          style={{
            position: 'fixed', bottom: 20, right: 20, zIndex: 9999,
            display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none',
          }}
        >
          {notices.map((n) => <NoticeItem key={n.id} notice={n} onClose={close} />)}
        </div>
      )}
      {current && <ConfirmDialog key={current.id} request={current} onAnswer={answer} />}
    </>
  );
};
