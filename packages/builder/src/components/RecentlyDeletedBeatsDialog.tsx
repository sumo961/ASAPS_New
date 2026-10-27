/**
 * Tools ▸ Recently deleted beats… — beats this project's saves no longer
 * had, kept on this computer for 30 days (utils/deletedBeats.ts). Grouped
 * by when they went and what removed them; tick and bring back.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { listDeletedBeats, type DeletedBeat } from '../utils/deletedBeats';

function when(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function typeWords(type: string): string {
  return type.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}

export const RecentlyDeletedBeatsDialog: React.FC<{
  isOpen: boolean;
  projectId: string | null;
  /** Ids of the beats the project has now: those can't come back under the same id. */
  existingBeatIds: string[];
  onClose: () => void;
  /** Brings the rows back; resolves when done. */
  onRestore: (rows: DeletedBeat[]) => Promise<void>;
}> = ({ isOpen, projectId, existingBeatIds, onClose, onRestore }) => {
  const [rows, setRows] = useState<DeletedBeat[] | null>(null);
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !projectId) return;
    setRows(null);
    setChosen(new Set());
    setError(null);
    listDeletedBeats(projectId).then(setRows).catch((e) => { setRows([]); setError(e instanceof Error ? e.message : String(e)); });
  }, [isOpen, projectId]);

  const existing = useMemo(() => new Set(existingBeatIds), [existingBeatIds]);
  const groups = useMemo(() => {
    const out: Array<{ at: number; cause: string; rows: DeletedBeat[] }> = [];
    for (const row of rows ?? []) {
      const last = out[out.length - 1];
      if (last && last.at === row.deletedAt && last.cause === row.cause) last.rows.push(row);
      else out.push({ at: row.deletedAt, cause: row.cause, rows: [row] });
    }
    return out;
  }, [rows]);

  if (!isOpen) return null;
  const restorable = (row: DeletedBeat) => !existing.has(row.beatId);
  const toggle = (key: number) => setChosen((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const toggleGroup = (keys: number[], on: boolean) => setChosen((prev) => { const next = new Set(prev); keys.forEach((k) => (on ? next.add(k) : next.delete(k))); return next; });

  const restore = async () => {
    const picked = (rows ?? []).filter((r) => r.key !== undefined && chosen.has(r.key));
    // One version per beat: the most recent one ticked.
    const seen = new Set<string>();
    const unique = picked.filter((r) => (seen.has(r.beatId) ? false : (seen.add(r.beatId), true)));
    setBusy(true);
    setError(null);
    try {
      await onRestore(unique);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not bring the beats back.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] bg-black/40 flex items-center justify-center p-5" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="deleted-beats-title" className="bg-white rounded-lg shadow-xl w-[560px] max-w-full max-h-[calc(100vh-40px)] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 id="deleted-beats-title" className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-gray-600" /> Recently deleted beats
          </h2>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <p className="px-5 text-xs text-gray-500">
          Beats that left this project in the last 30 days, kept on this computer — whatever removed them. They come back as they were when last saved, with their links.
        </p>
        <div className="px-5 py-3 overflow-y-auto text-sm">
          {rows === null && <div className="text-gray-500">Loading…</div>}
          {rows !== null && rows.length === 0 && <div className="text-gray-500">No beats were deleted from this project in the last 30 days.</div>}
          {groups.map((g) => {
            const keys = g.rows.filter(restorable).map((r) => r.key!).filter((k) => k !== undefined);
            const all = keys.length > 0 && keys.every((k) => chosen.has(k));
            return (
              <section key={`${g.at}-${g.cause}`} className="py-2 border-b border-gray-100 last:border-0">
                <label className="flex items-start gap-2 font-medium text-gray-800">
                  <input type="checkbox" className="mt-1" disabled={keys.length === 0} checked={all} onChange={() => toggleGroup(keys, !all)} />
                  <span>
                    {when(g.at)} · {g.rows.length} beat{g.rows.length === 1 ? '' : 's'}
                    <span className="block text-xs font-normal text-gray-500">{g.cause}</span>
                  </span>
                </label>
                {g.rows.map((row) => (
                  <label key={row.key} className={`flex items-center gap-2 pl-6 py-0.5 ${restorable(row) ? 'text-gray-700' : 'text-gray-400'}`}>
                    <input type="checkbox" disabled={!restorable(row)} checked={row.key !== undefined && chosen.has(row.key)} onChange={() => row.key !== undefined && toggle(row.key)} />
                    <span>{row.name} <span className="text-xs text-gray-400">{typeWords(row.type)}{restorable(row) ? '' : ' · in the project again'}</span></span>
                  </label>
                ))}
              </section>
            );
          })}
          {error && <div className="mt-3 text-sm text-red-700">{error}</div>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100">
          <button type="button" onClick={onClose} disabled={busy} className="px-3 py-1.5 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50">Close</button>
          <button type="button" disabled={busy || chosen.size === 0} onClick={() => void restore()}
            className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {busy ? 'Bringing back…' : `Bring back ${chosen.size} beat${chosen.size === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
};
