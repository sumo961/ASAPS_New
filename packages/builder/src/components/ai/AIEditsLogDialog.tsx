/**
 * "AI changes" — the project's AI edits ledger, read-only: every proposal an
 * AI surface made (generator review, Ask AI, Co-Designer) and what the
 * author decided, newest first, with a jump to each beat.
 */
import React from 'react';
import { X, Sparkles, Compass, Wrench, Check, Ban, SkipForward, AlertTriangle } from 'lucide-react';
import type { AIEditLedger, AIEditEntry, AIEditSource, AIEditDecision } from '../../types/aiEdits';

interface AIEditsLogDialogProps {
  ledger: AIEditLedger | null | undefined;
  onClose: () => void;
  /** Focus a beat in the graph (closes the dialog). */
  onSelectBeat?: (beatId: string) => void;
}

const SOURCE_LABEL: Record<AIEditSource, { label: string; icon: React.ReactNode; cls: string }> = {
  'co-designer': { label: 'Co-Designer', icon: <Compass className="w-3 h-3" />, cls: 'bg-teal-100 text-teal-900' },
  'ask-ai': { label: 'Ask AI', icon: <Sparkles className="w-3 h-3" />, cls: 'bg-violet-100 text-violet-900' },
  'generator-review': { label: 'Review', icon: <Wrench className="w-3 h-3" />, cls: 'bg-amber-100 text-amber-900' },
};
const DECISION_LABEL: Record<AIEditDecision, { label: string; icon: React.ReactNode; cls: string }> = {
  accepted: { label: 'accepted', icon: <Check className="w-3 h-3" />, cls: 'text-emerald-800' },
  rejected: { label: 'declined', icon: <Ban className="w-3 h-3" />, cls: 'text-gray-600' },
  skipped: { label: 'skipped', icon: <SkipForward className="w-3 h-3" />, cls: 'text-gray-600' },
  failed: { label: 'failed', icon: <AlertTriangle className="w-3 h-3" />, cls: 'text-red-700' },
};

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

export function AIEditsLogDialog({ ledger, onClose, onSelectBeat }: AIEditsLogDialogProps) {
  const entries: AIEditEntry[] = [...(ledger?.entries ?? [])].reverse();
  const accepted = entries.filter((e) => e.decision === 'accepted').length;
  const declined = entries.filter((e) => e.decision === 'rejected' || e.decision === 'skipped').length;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="dialog" aria-label="AI changes">
      <div className="bg-white rounded-xl shadow-2xl w-[720px] max-w-[95vw] max-h-[85vh] flex flex-col">
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">AI changes</h2>
            <p className="text-xs text-gray-600 mt-0.5">
              Every edit an AI proposed for this project and what you decided. Kept with the project.
              {entries.length > 0 && ` ${accepted} accepted · ${declined} declined or skipped.`}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-gray-100" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-3">
          {entries.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">No AI edits recorded yet. Proposals from the review banner, Ask AI and the Co-Designer will appear here as you accept or decline them.</p>
          ) : (
            <ul className="space-y-2">
              {entries.map((e) => {
                const src = SOURCE_LABEL[e.source] ?? SOURCE_LABEL['co-designer'];
                const dec = DECISION_LABEL[e.decision] ?? DECISION_LABEL.rejected;
                return (
                  <li key={e.id} className="rounded-lg border border-gray-200 px-3 py-2 text-sm" data-testid="ai-edit-entry">
                    <div className="flex items-center gap-2 text-xs">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${src.cls}`}>{src.icon}{src.label}</span>
                      <span className={`inline-flex items-center gap-1 font-medium ${dec.cls}`}>{dec.icon}{dec.label}</span>
                      {e.batch && <span className="text-gray-500 truncate" title={e.batch}>· {e.batch}</span>}
                      <span className="ml-auto text-gray-400">{when(e.at)}</span>
                    </div>
                    <div className="mt-1 text-gray-900">{e.summary}</div>
                    {e.detail && <div className="mt-0.5 text-xs text-gray-600">{e.detail}</div>}
                    {e.beatIds.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {e.beatIds.map((id) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() => { onSelectBeat?.(id); onClose(); }}
                            className="text-xs px-1.5 py-0.5 rounded bg-gray-100 hover:bg-gray-200 font-mono"
                            title="Show this beat in the graph"
                          >
                            {id}
                          </button>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
