/**
 * Modal overlay listing previously saved Ideator sessions. Triggered from
 * the History button in IdeatorHeader. Sessions live in IndexedDB on this
 * machine — they are not synced and not scoped to a project (Ideator's
 * output creates a new project on handoff anyway).
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Download, History, Loader2, Trash2, X } from 'lucide-react';
import {
  deleteSession,
  listSessions,
  type IdeatorSession,
} from './ideatorSessionStore';
import { exportSessionMarkdown } from './exportTranscript';

interface SessionsPanelProps {
  open: boolean;
  onClose: () => void;
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
  const formatted = sameYear
    ? d.toLocaleString(undefined, { month: 'short', day: 'numeric' })
    : d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return formatted;
}

function firstUserPreview(session: IdeatorSession): string {
  const first = session.messages.find(m => m.role === 'user' && m.kind !== 'tool_use');
  if (!first) return '(no user messages yet)';
  const trimmed = first.content.trim().replace(/\s+/g, ' ');
  return trimmed.length > 90 ? trimmed.slice(0, 87) + '…' : trimmed;
}

function statusBadge(session: IdeatorSession): { label: string; tone: string } {
  if (session.handedOff) return { label: 'Handed off', tone: 'bg-green-50 text-green-700 border-green-200' };
  if (session.draftRequest) return { label: 'Has draft prompt', tone: 'bg-amber-50 text-amber-700 border-amber-200' };
  return { label: 'In progress', tone: 'bg-blue-50 text-blue-700 border-blue-200' };
}

export const SessionsPanel: React.FC<SessionsPanelProps> = ({
  open,
  onClose,
  currentSessionId,
  onLoad,
}) => {
  const [sessions, setSessions] = useState<IdeatorSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all = await listSessions();
      setSessions(all);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void reload();
  }, [open, reload]);

  const handleDelete = useCallback(
    async (id: string) => {
      const confirmed = window.confirm(
        'Delete this saved session? The transcript will be permanently removed from this machine.'
      );
      if (!confirmed) return;
      try {
        await deleteSession(id);
        await reload();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-purple-50 to-pink-50 rounded-t-lg">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-purple-600" />
            <h2 className="text-base font-semibold text-gray-900">Past Ideator sessions</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/60 text-gray-600"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-12 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Loading sessions…
            </div>
          )}

          {!loading && error && (
            <div className="px-4 py-3 text-sm text-red-800 bg-red-50 border-b border-red-200">
              Couldn't load sessions: {error}
            </div>
          )}

          {!loading && !error && sessions.length === 0 && (
            <div className="px-6 py-10 text-center text-sm text-gray-500">
              No saved sessions yet. As you talk to Ideator, your conversation
              is auto-saved on this machine and will show up here.
            </div>
          )}

          {!loading && !error && sessions.length > 0 && (
            <ul className="divide-y divide-gray-100">
              {sessions.map(s => {
                const isCurrent = s.id === currentSessionId;
                const badge = statusBadge(s);
                return (
                  <li key={s.id} className={`px-4 py-3 ${isCurrent ? 'bg-purple-50/40' : 'hover:bg-gray-50'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-xs text-gray-500">
                            {relativeTime(s.lastUpdatedAt)}
                          </span>
                          <span
                            className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${badge.tone}`}
                          >
                            {badge.label}
                          </span>
                          {isCurrent && (
                            <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border bg-purple-100 text-purple-800 border-purple-300">
                              Current
                            </span>
                          )}
                          <span className="text-xs text-gray-400">
                            {s.messages.filter(m => m.kind !== 'tool_use').length} turns
                          </span>
                        </div>
                        <div className="text-sm text-gray-800 truncate">
                          {firstUserPreview(s)}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {!isCurrent && (
                          <button
                            onClick={() => handleLoad(s.id)}
                            className="px-2 py-1 text-xs font-medium text-purple-700 bg-white border border-purple-300 rounded hover:bg-purple-50"
                            title="Load this session into the active window"
                          >
                            Load
                          </button>
                        )}
                        <button
                          onClick={() => exportSessionMarkdown(s)}
                          className="p-1.5 text-gray-600 hover:text-purple-700 hover:bg-purple-50 rounded"
                          title="Export this session as Markdown"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(s.id)}
                          className="p-1.5 text-gray-600 hover:text-red-700 hover:bg-red-50 rounded"
                          title="Delete this session permanently"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="px-4 py-2 border-t bg-gray-50 text-xs text-gray-500 rounded-b-lg">
          Sessions are saved to this machine only. They are not synced or
          shared between machines.
        </div>
      </div>
    </div>
  );
};
