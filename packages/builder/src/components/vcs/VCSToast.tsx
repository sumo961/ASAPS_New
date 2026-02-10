/**
 * VCSToast - Toast notifications for VCS operation results
 *
 * - Success/info toasts auto-dismiss after 8 seconds
 * - Error toasts stay until manually dismissed (sticky)
 * - Push-rejection errors show a PushRejectedDialog instead of a toast
 * - Merge/rebase conflict errors show a MergeConflictDialog instead of a toast
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useVCSStatus, isPushRejected, type VCSEvent } from '../../vcs/VCSStatusProvider';
import { PushRejectedDialog } from './PushRejectedDialog';
import { MergeConflictDialog } from './MergeConflictDialog';

interface Toast {
  id: number;
  event: VCSEvent;
}

const TOAST_DURATION = 8000;
let toastId = 0;

/** Check if an error message indicates merge/rebase conflicts */
function hasConflicts(message: string): boolean {
  return message.includes('CONFLICT') || message.includes('Merge conflict') || message.includes('could not apply');
}

export const VCSToast: React.FC = () => {
  const vcs = useVCSStatus();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pushRejectedMessage, setPushRejectedMessage] = useState<string | null>(null);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const timersRef = useRef<Map<number, number>>(new Map());

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  useEffect(() => {
    if (!vcs) return;
    return vcs.onEvent((event: VCSEvent) => {
      // Log errors to console as fallback
      if (event.type === 'error') {
        console.warn('[VCS]', event.message);
      }

      // Intercept push-rejection errors → show dialog instead of toast
      if (event.type === 'error' && isPushRejected(event.message)) {
        setPushRejectedMessage(event.message);
        return;
      }

      // Intercept merge/rebase conflict errors → show conflict dialog
      if (event.type === 'error' && hasConflicts(event.message)) {
        setConflictMessage(event.message);
        return;
      }

      const id = ++toastId;
      setToasts(prev => [...prev.slice(-4), { id, event }]);

      // Only auto-dismiss success and info toasts; errors stay until closed
      if (event.type !== 'error') {
        const timer = window.setTimeout(() => removeToast(id), TOAST_DURATION);
        timersRef.current.set(id, timer);
      }
    });
  }, [vcs, removeToast]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) {
        clearTimeout(timer);
      }
    };
  }, []);

  return (
    <>
      {pushRejectedMessage && (
        <PushRejectedDialog
          errorMessage={pushRejectedMessage}
          onClose={() => setPushRejectedMessage(null)}
        />
      )}
      {conflictMessage && (
        <MergeConflictDialog
          errorMessage={conflictMessage}
          onClose={() => setConflictMessage(null)}
        />
      )}
      {toasts.length > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: 20,
            right: 20,
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            pointerEvents: 'none',
          }}
        >
          {toasts.map(toast => {
            const bgColor = toast.event.type === 'success' ? '#166534'
              : toast.event.type === 'error' ? '#991b1b'
              : '#1e40af';
            const borderColor = toast.event.type === 'success' ? '#22c55e'
              : toast.event.type === 'error' ? '#ef4444'
              : '#3b82f6';

            return (
              <div
                key={toast.id}
                style={{
                  backgroundColor: bgColor,
                  border: `1px solid ${borderColor}`,
                  color: '#e2e8f0',
                  padding: '8px 12px 8px 16px',
                  borderRadius: 6,
                  fontSize: '13px',
                  maxWidth: 400,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                  pointerEvents: 'auto',
                  animation: 'fadeIn 0.2s ease-out',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                }}
              >
                <span style={{ flex: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {toast.event.message}
                </span>
                <button
                  onClick={() => removeToast(toast.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#e2e8f0',
                    cursor: 'pointer',
                    padding: '0 2px',
                    fontSize: '14px',
                    lineHeight: 1,
                    opacity: 0.7,
                    flexShrink: 0,
                  }}
                  title="Dismiss"
                >
                  {'\u2715'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
};
