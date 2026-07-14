/**
 * Modal overlay listing saved Co-Designer sessions for the current project.
 * Adapted from the Ideator SessionsPanel; filtered by projectId because
 * Co-Designer conversations are about a specific story.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { History, Loader2, Trash2, X } from 'lucide-react';
import {
  deleteSession,
  listSessions,
  type CoDesignerSession,
} from './coDesignerSessionStore';

interface CoDesignerSessionsPanelProps {
  open: boolean;
  onClose: () => void;
  projectId?: string;
  currentSessionId: string | null;
  onLoad: (id: string) => Promise<boolean>;
}

function relativeTime(ms: number): string {
  const delta = Date.now() - ms;
  if (delta < 60_000) return 'just now';
  const m = Math.floor(delta / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = new Date(ms);
  const today = new Date();
  const sameYear = d.getFullYear() === today.getFullYear();
  return sameYear
    ? d.toLocaleString(undefined, { month: 'short', day: 'numeric' })
    : d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function firstUserPreview(session: CoDesignerSession): string {
  const first = session.messages.find(m => m.role === 'user');
  if (!first) return '(no user messages yet)';
  const trimmed = first.content.trim().replace(/\s+/g, ' ');
  return trimmed.length > 90 ? trimmed.slice(0, 87) + '…' : trimmed;
}

export const CoDesignerSessionsPanel: React.FC<CoDesignerSessionsPanelProps> = ({
  open,
  onClose,
  projectId,
  currentSessionId,
  onLoad,
}) => {
  const [sessions, setSessions] = useState<CoDesignerSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSessions(await listSessions(projectId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (open) void reload();
  }, [open, reload]);

  const handleDelete = useCallback(
    async (id: string) => {
      if (!window.confirm('Delete this conversation permanently?')) return;
      await deleteSession(id);
      void reload();
    },
    [reload]
  );

  const handleLoad = useCallback(
    async (id: string) => {
      const ok = await onLoad(id);
      if (ok) onClose();
    },
    [onLoad, onClose]
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2 font-semibold text-gray-800">
            <History className="w-4 h-4 text-teal-600" />
            Past conversations{projectId ? ' for this story' : ''}
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-gray-500 p-3">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          )}
          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">
              {error}
            </div>
          )}
          {!loading && sessions.length === 0 && (
            <div className="text-sm text-gray-500 p-3">
              No saved conversations yet. They save automatically once you send
              a message.
            </div>
          )}
          {sessions.map(s => (
            <div
              key={s.id}
              className={`border rounded-lg p-3 ${
                s.id === currentSessionId ? 'border-teal-400 bg-teal-50/50' : 'border-gray-200'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-gray-500">
                  {relativeTime(s.lastUpdatedAt)} ·{' '}
                  {s.messages.filter(m => m.role === 'user').length} turns
                  {s.id === currentSessionId ? ' · current' : ''}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleLoad(s.id)}
                    className="text-xs px-2 py-1 rounded bg-teal-600 text-white hover:bg-teal-700"
                  >
                    Load
                  </button>
                  <button
                    onClick={() => handleDelete(s.id)}
                    className="p-1 rounded hover:bg-red-50 text-red-500"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="text-sm text-gray-800 mt-1">{firstUserPreview(s)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
