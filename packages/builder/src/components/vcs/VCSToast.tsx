/**
 * VCSToast - Toast notifications for VCS operation results
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useVCSStatus, type VCSEvent } from '../../vcs/VCSStatusProvider';

interface Toast {
  id: number;
  event: VCSEvent;
}

const TOAST_DURATION = 4000;
let toastId = 0;

export const VCSToast: React.FC = () => {
  const vcs = useVCSStatus();
  const [toasts, setToasts] = useState<Toast[]>([]);
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
      const id = ++toastId;
      setToasts(prev => [...prev.slice(-4), { id, event }]);
      const timer = window.setTimeout(() => removeToast(id), TOAST_DURATION);
      timersRef.current.set(id, timer);
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

  if (toasts.length === 0) return null;

  return (
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
              padding: '8px 16px',
              borderRadius: 6,
              fontSize: '13px',
              maxWidth: 400,
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              pointerEvents: 'auto',
              cursor: 'pointer',
              animation: 'fadeIn 0.2s ease-out',
            }}
            onClick={() => removeToast(toast.id)}
          >
            {toast.event.message}
          </div>
        );
      })}
    </div>
  );
};
