/**
 * Review card for a ChangeProposalSet. Renders between the chat and the
 * composer when the assistant has emitted proposals: one checkbox row per
 * proposal (all selected by default), Apply Selected + Dismiss.
 *
 * Nothing here mutates the story — Apply sends the selection to the main
 * window, which validates against live state and applies through the
 * undoable command system.
 */

import React, { useMemo, useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import type { ChangeProposalSet, ChangeProposal } from './types';
import type { ProposalPreviewEntry } from './coDesignerStore';
import { describeProposal } from './proposalParsing';

interface ProposalCardProps {
  proposalSet: ChangeProposalSet;
  applying: boolean;
  /** Current values from the dry-run round-trip (old→new diff); null until it lands. */
  preview?: ProposalPreviewEntry[] | null;
  onApply: (selected: ChangeProposal[]) => void;
  onDismiss: () => void;
}

const clip = (s: string, n = 220) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/** Compact old→new block shown when the dry-run supplied a current value. */
const OldNew: React.FC<{ current: string; next: string }> = ({ current, next }) => (
  <span className="block mt-1 space-y-0.5">
    <span className="block text-xs px-1.5 py-0.5 rounded bg-red-50 text-red-800 border border-red-100 line-through decoration-red-300 break-words">
      {current.trim() ? clip(current) : '(empty)'}
    </span>
    <span className="block text-xs px-1.5 py-0.5 rounded bg-green-50 text-green-800 border border-green-100 break-words">
      {clip(next)}
    </span>
  </span>
);

function proposalDetail(p: ChangeProposal): string | null {
  switch (p.kind) {
    case 'editText':
      return `→ "${p.newValue.length > 160 ? p.newValue.slice(0, 157) + '…' : p.newValue}"`;
    case 'updateParams':
      return Object.entries(p.params)
        .map(([k, v]) => `${k}: ${JSON.stringify(v).slice(0, 80)}`)
        .join(' · ');
    case 'addBeat': {
      const text = (p.parameters as any)?.text;
      return typeof text === 'string' ? `→ "${text.length > 160 ? text.slice(0, 157) + '…' : text}"` : null;
    }
    case 'addNote':
      return `"${p.note.length > 160 ? p.note.slice(0, 157) + '…' : p.note}"`;
    case 'updateCharacter':
      return Object.entries(p.updates)
        .map(([k, v]) => `${k}: ${JSON.stringify(v).slice(0, 80)}`)
        .join(' · ');
  }
}

export const ProposalCard: React.FC<ProposalCardProps> = ({
  proposalSet,
  applying,
  preview,
  onApply,
  onDismiss,
}) => {
  const [selected, setSelected] = useState<boolean[]>(
    () => proposalSet.proposals.map(() => true)
  );

  const selectedCount = useMemo(() => selected.filter(Boolean).length, [selected]);

  const toggle = (i: number) =>
    setSelected(prev => prev.map((v, idx) => (idx === i ? !v : v)));

  const handleApply = () => {
    const chosen = proposalSet.proposals.filter((_, i) => selected[i]);
    onApply(chosen);
  };

  return (
    <div className="border-t border-teal-200 bg-teal-50/60 px-4 py-3 max-h-[45%] overflow-y-auto">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-teal-900 text-sm">{proposalSet.title}</div>
          {proposalSet.rationale && (
            <div className="text-xs text-teal-800/80 mt-0.5">{proposalSet.rationale}</div>
          )}
        </div>
        <button
          onClick={onDismiss}
          disabled={applying}
          className="p-1 rounded hover:bg-teal-100 text-teal-700 disabled:opacity-40 flex-shrink-0"
          title="Dismiss without applying"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="mt-2 space-y-1.5">
        {proposalSet.proposals.map((p, i) => {
          const detail = proposalDetail(p);
          const pv = preview?.find(e => e.index === i);
          // old→new when the dry-run gave a current value and the proposal
          // carries a comparable new value.
          const nextValue =
            p.kind === 'editText' ? p.newValue :
            p.kind === 'updateParams' ? JSON.stringify(p.params) :
            p.kind === 'updateCharacter' ? JSON.stringify(p.updates) :
            null;
          const showDiff = pv && pv.current !== null && nextValue !== null;
          return (
            <label
              key={i}
              className={`flex items-start gap-2 rounded-md border px-2.5 py-2 cursor-pointer text-sm ${
                selected[i] ? 'bg-white border-teal-300' : 'bg-gray-50 border-gray-200 opacity-70'
              }`}
            >
              <input
                type="checkbox"
                checked={selected[i]}
                onChange={() => toggle(i)}
                disabled={applying}
                className="mt-0.5 accent-teal-600"
              />
              <span className="min-w-0">
                <span className="font-medium text-gray-900">{describeProposal(p)}</span>
                {p.kind !== 'addNote' && p.note && (
                  <span className="text-gray-500"> — {p.note}</span>
                )}
                {showDiff ? (
                  <OldNew current={pv!.current as string} next={nextValue as string} />
                ) : detail ? (
                  <span className="block text-xs text-gray-600 mt-0.5 break-words">{detail}</span>
                ) : null}
                {pv?.error && (
                  <span className="block text-xs text-amber-700 mt-0.5">⚠ {pv.error}</span>
                )}
              </span>
            </label>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          onClick={onDismiss}
          disabled={applying}
          className="px-3 py-1.5 rounded-md text-sm border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-40"
        >
          Dismiss
        </button>
        <button
          onClick={handleApply}
          disabled={applying || selectedCount === 0}
          className="px-3 py-1.5 rounded-md text-sm font-medium bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40 flex items-center gap-1.5"
          title="Apply the selected changes in the main window (each change is undoable there)"
        >
          {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Apply {selectedCount} selected
        </button>
      </div>
    </div>
  );
};
