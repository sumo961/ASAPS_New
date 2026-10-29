/**
 * Script — the story's text as one page to read and write (2026-10-29,
 * class feedback: groups wrote their text in Google Docs or Obsidian because
 * the Properties panel felt cramped and showed everything at once).
 *
 * Beats come in reading order (utils/scriptFields.storyOrder); each shows
 * only the text an author writes: info text, questions, choices, every
 * Dialog Tree line with who says it. A field saves when you leave it — one
 * undo step, through the same update the Properties panel uses. Escape puts
 * back what was there. Clicking a beat's name selects it.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Beat, Cluster } from '@asaps/core';
import { scriptFields, scriptEdit, storyOrder, type ScriptField } from '../../utils/scriptFields';
import { usePersistedState } from '../../utils/persistedState';

interface Props {
  beats: Beat[];
  clusters: Cluster[];
  selectedBeat: Beat | null;
  firstBeatId?: string | null;
  onBeatSelect: (beat: Beat) => void;
  onBeatUpdate?: (beatId: string, updates: Partial<Beat>) => void;
}

const ALL = '__all__';

export const ScriptView: React.FC<Props> = ({ beats, clusters, selectedBeat, firstBeatId, onBeatSelect, onBeatUpdate }) => {
  const [scope, setScope] = usePersistedState<string>('asaps_ui_script_scope', ALL);
  const [showEmpty, setShowEmpty] = usePersistedState('asaps_ui_script_show_empty', false);
  const scopeValid = scope === ALL || clusters.some((c) => c.id === scope);
  const activeScope = scopeValid ? scope : ALL;

  const ordered = useMemo(() => storyOrder(beats, firstBeatId), [beats, firstBeatId]);
  const rows = useMemo(() => ordered
    .filter((b) => activeScope === ALL || (b as any).cluster === activeScope)
    .map((b) => ({ beat: b, fields: scriptFields(b) }))
    .filter((r) => showEmpty || r.fields.length > 0),
  // _version changes when a beat's parameters change.
  [ordered, activeScope, showEmpty, beats.map((b) => (b as any)._version).join(',')]);

  const listRef = useRef<HTMLDivElement>(null);
  // Follow a beat picked elsewhere (Story Beats, flowchart).
  useEffect(() => {
    if (!selectedBeat) return;
    listRef.current?.querySelector(`[data-script-beat="${CSS.escape(selectedBeat.id)}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }, [selectedBeat?.id]);

  const words = useMemo(() => rows.reduce((n, r) => n + r.fields.reduce((m, f) => m + (f.value.trim() ? f.value.trim().split(/\s+/).length : 0), 0), 0), [rows]);

  return (
    <div className="h-full flex flex-col bg-gray-50">
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2 border-b border-gray-200 bg-white text-sm">
        <label className="flex items-center gap-2 text-gray-600">
          Show
          <select
            value={activeScope}
            onChange={(e) => setScope(e.target.value)}
            className="px-2 py-1 border border-gray-300 rounded text-sm"
            aria-label="Which beats"
          >
            <option value={ALL}>The whole story</option>
            {clusters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-gray-600">
          <input type="checkbox" checked={showEmpty} onChange={(e) => setShowEmpty(e.target.checked)} />
          Beats without text
        </label>
        <div className="flex-1" />
        <span className="text-xs text-gray-500">{rows.length} beats · {words.toLocaleString()} words</span>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
          {rows.length === 0 && (
            <p className="text-center text-gray-500 text-sm py-12">No beats with text here yet.</p>
          )}
          {rows.map(({ beat, fields }) => {
            const selected = selectedBeat?.id === beat.id;
            const speaker = typeof (beat as any).speaker === 'string' && beat.type !== 'dialogTree' ? (beat as any).speaker : '';
            return (
              <section
                key={beat.id}
                data-script-beat={beat.id}
                className={`bg-white rounded-lg border px-5 py-4 ${selected ? 'border-blue-400 ring-1 ring-blue-200' : 'border-gray-200'}`}
              >
                <header className="flex items-baseline gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => onBeatSelect(beat)}
                    className="font-semibold text-gray-900 hover:text-blue-700 hover:underline text-left"
                    title="Select this beat"
                  >
                    {beat.name || beat.id}
                  </button>
                  <span className="text-xs text-gray-400">{beat.type}</span>
                  {speaker && <span className="ml-auto text-xs text-gray-500">Speaker: {speaker}</span>}
                </header>
                {fields.length === 0 && <p className="text-xs text-gray-400 italic">No text in this beat.</p>}
                <div className="space-y-1.5">
                  {fields.map((f) => (
                    <ScriptLine
                      key={f.path}
                      field={f}
                      onCommit={(value) => onBeatUpdate?.(beat.id, scriptEdit(beat, f.path, value) as Partial<Beat>)}
                      readOnly={!onBeatUpdate}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const KIND_STYLE: Record<ScriptField['kind'], string> = {
  text: 'text-gray-500',
  line: 'text-indigo-700 font-medium',
  reply: 'text-emerald-700',
  choice: 'text-amber-700',
};

/** One field: its label and a text area that grows with the text. */
const ScriptLine: React.FC<{ field: ScriptField; onCommit: (value: string) => void; readOnly: boolean }> = ({ field, onCommit, readOnly }) => {
  const [draft, setDraft] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  // Escape blurs the field too; the blur must not save what Escape threw away.
  const cancelledRef = useRef(false);
  const shown = draft ?? field.value;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [shown]);

  const commit = () => {
    if (!cancelledRef.current && draft !== null && draft !== field.value) onCommit(draft);
    cancelledRef.current = false;
    setDraft(null);
  };

  return (
    <div className="flex items-start gap-3" style={{ paddingLeft: field.depth * 20 }}>
      <span className={`w-28 flex-shrink-0 pt-1.5 text-xs text-right truncate ${KIND_STYLE[field.kind]}`} title={field.label}>
        {field.kind === 'reply' ? '→ ' : ''}{field.label}
      </span>
      <textarea
        ref={ref}
        rows={1}
        value={shown}
        readOnly={readOnly}
        aria-label={field.label}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { cancelledRef.current = true; setDraft(null); e.currentTarget.blur(); }
        }}
        placeholder="(empty)"
        className="flex-1 resize-none overflow-hidden px-2 py-1 rounded border border-transparent hover:border-gray-200 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200 text-[15px] leading-relaxed text-gray-900 font-serif"
      />
    </div>
  );
};
