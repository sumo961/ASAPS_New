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
 *
 * Save as Markdown writes what is shown to a .md file; Update from Markdown
 * reads one back (written in Obsidian, Google Docs …), shows the changes,
 * and applies them as one undo step (utils/scriptMarkdown.ts).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Beat, Cluster } from '@asaps/core';
import { scriptFields, scriptEdit, storyOrder, type ScriptField } from '../../utils/scriptFields';
import { exportScriptMarkdown, importScriptMarkdown, type ScriptImport } from '../../utils/scriptMarkdown';
import { setAtPath } from '../../utils/linkOutputs';
import { downloadMarkdown } from '../ai/ideator/exportTranscript';
import { notify } from '../../utils/notify';
import { usePersistedState } from '../../utils/persistedState';

interface Props {
  beats: Beat[];
  clusters: Cluster[];
  selectedBeat: Beat | null;
  firstBeatId?: string | null;
  onBeatSelect: (beat: Beat) => void;
  onBeatUpdate?: (beatId: string, updates: Partial<Beat>) => void;
  onBeatsUpdate?: (edits: Array<{ beatId: string; updates: Partial<Beat> }>, description: string) => void;
  storyTitle?: string;
  /** Written into the Markdown so a file can't be read into another project. */
  projectId?: string;
}

const ALL = '__all__';

export const ScriptView: React.FC<Props> = ({ beats, clusters, selectedBeat, firstBeatId, onBeatSelect, onBeatUpdate, onBeatsUpdate, storyTitle, projectId }) => {
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

  const fileRef = useRef<HTMLInputElement>(null);
  const [review, setReview] = useState<ScriptImport | null>(null);

  const scopeName = activeScope === ALL ? '' : clusters.find((c) => c.id === activeScope)?.name || '';
  const saveMarkdown = () => {
    const title = [storyTitle, scopeName].filter(Boolean).join(' — ') || 'Script';
    const file = `${title.replace(/[\\/:*?"<>|]+/g, '').trim() || 'Script'}.md`;
    downloadMarkdown(file, exportScriptMarkdown(rows, title, projectId));
  };
  const readMarkdown = async (file: File) => {
    const result = importScriptMarkdown(await file.text(), beats, projectId);
    if (result.otherProject) {
      notify.warning(`"${file.name}" was saved from another project, so nothing was changed.`, {
        detail: 'Open the project it came from to read it back. (Each project has its own id; beats in different projects can share the same beat ids.)',
      });
      return;
    }
    if (result.matched === 0 && result.changes.length === 0) {
      notify.warning(`No beat of this story found in "${file.name}".`, {
        detail: 'Update from Markdown reads files saved with Save as Markdown: each beat is a ## heading with its name.',
      });
      return;
    }
    setReview(result);
  };
  const applyReview = () => {
    if (!review || !onBeatsUpdate) return;
    const perBeat = new Map<string, Record<string, any>>();
    for (const c of review.changes) {
      const beat = beats.find((b) => b.id === c.beatId) as any;
      if (!beat) continue;
      const params = perBeat.get(c.beatId) ?? structuredClone(beat.getParameters ? beat.getParameters() : beat.parameters || {});
      setAtPath(params, c.path, c.after);
      perBeat.set(c.beatId, params);
    }
    const n = review.changes.length;
    onBeatsUpdate([...perBeat].map(([beatId, parameters]) => ({ beatId, updates: { parameters } as Partial<Beat> })), `Update ${n} text${n === 1 ? '' : 's'} from Markdown`);
    setReview(null);
    notify.success(`Updated ${n} text${n === 1 ? '' : 's'} from Markdown.`);
  };

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
        <button
          type="button"
          onClick={saveMarkdown}
          disabled={rows.length === 0}
          className="px-2.5 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
          title="Save the text shown here as a Markdown file, to write in Obsidian, Google Docs or any text editor"
        >
          Save as Markdown
        </button>
        {onBeatsUpdate && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="px-2.5 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
            title="Read back a Markdown file saved here and edited elsewhere — you see the changes before they are made"
          >
            Update from Markdown…
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".md,.markdown,.txt,text/markdown,text/plain"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void readMarkdown(f);
          }}
        />
      </div>
      {review && (
        <ScriptImportReview
          review={review}
          onApply={applyReview}
          onCancel={() => setReview(null)}
        />
      )}

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

/** The changes a Markdown file would make, to check before they are made. */
const ScriptImportReview: React.FC<{ review: ScriptImport; onApply: () => void; onCancel: () => void }> = ({ review, onApply, onCancel }) => {
  const n = review.changes.length;
  return (
    <div className="fixed inset-0 z-[10001] bg-black/40 flex items-center justify-center p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="script-import-title" className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="px-5 py-4 border-b">
          <h2 id="script-import-title" className="text-base font-semibold text-gray-900">Update from Markdown</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {n === 0 ? 'Nothing to change: the text is the same as in the story.' : `${n} text${n === 1 ? '' : 's'} will change in ${new Set(review.changes.map((c) => c.beatId)).size} beat${new Set(review.changes.map((c) => c.beatId)).size === 1 ? '' : 's'}. Undo takes it all back.`}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3 text-sm">
          {review.changes.map((c) => (
            <div key={`${c.beatId}:${c.path}`} className="border border-gray-200 rounded-lg p-3">
              <div className="text-xs text-gray-500 mb-1"><span className="font-medium text-gray-700">{c.beatName}</span> · {c.label}</div>
              <div className="text-red-700 bg-red-50 rounded px-2 py-1 whitespace-pre-wrap line-through decoration-red-300">{c.before || '(empty)'}</div>
              <div className="text-green-800 bg-green-50 rounded px-2 py-1 mt-1 whitespace-pre-wrap">{c.after || '(empty)'}</div>
            </div>
          ))}
          {review.mismatched.length > 0 && (
            <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <strong>Left as they are</strong> ({review.mismatched.length}): {review.mismatched.join(', ')}. Their lines in the file don't match the beat any more — a line or choice added or removed, or a label changed. Change those in the editor.
            </div>
          )}
          {review.unknown.length > 0 && (
            <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3">
              <strong>Not in this story</strong> ({review.unknown.length}): {review.unknown.join(', ')}. New beats aren't made from Markdown.
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
          <button type="button" onClick={onApply} disabled={n === 0} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
            {n === 0 ? 'Nothing to update' : `Update ${n} text${n === 1 ? '' : 's'}`}
          </button>
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

// Dialog Tree lines indent where the conversation branches; past a few
// branchings the indent stops growing and the label shows the level, so a
// deep conversation keeps a text box you can write in (a deep tree once
// squeezed it to one letter per line, 2026-10-29).
const INDENT_PX = 14;
const MAX_INDENT_LEVELS = 6;

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
    <div className="flex items-start gap-3" style={{ paddingLeft: Math.min(field.depth, MAX_INDENT_LEVELS) * INDENT_PX }}>
      <span
        className={`w-28 flex-shrink-0 pt-1.5 text-xs text-right truncate ${KIND_STYLE[field.kind]}`}
        title={field.depth > 0 ? `${field.label} — after ${field.depth} branching ${field.depth === 1 ? 'point' : 'points'}` : field.label}
      >
        {field.depth > MAX_INDENT_LEVELS && <span className="mr-1 text-[10px] text-gray-400">{field.depth} ›</span>}
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
        className="flex-1 min-w-0 resize-none overflow-hidden px-2 py-1 rounded border border-transparent hover:border-gray-200 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200 text-[15px] leading-relaxed text-gray-900 font-serif"
      />
    </div>
  );
};
