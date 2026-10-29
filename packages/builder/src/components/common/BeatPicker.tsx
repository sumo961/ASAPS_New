/**
 * Pick a beat by typing part of its name (2026-10-29, class feedback: with
 * a few hundred beats, finding a link target in a plain dropdown was "really
 * hard", and an Info Text and a Multi Choice can carry the same number).
 *
 * Looks like the select it replaces. Clicking opens a list with a search
 * field: every typed word must appear in the beat's name, id or type. The
 * beats picked last come first while nothing is typed. Arrow keys move,
 * Enter picks, Escape closes.
 *
 * The list is drawn in a portal so the Inspector's scrolling panel can't
 * clip it.
 */
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface BeatPickerBeat {
  id: string;
  name?: string;
  type?: string;
}

export interface BeatPickerOption {
  value: string;
  label: string;
}

interface Props {
  value: string | undefined;
  onChange: (value: string) => void;
  beats: ReadonlyArray<BeatPickerBeat>;
  /** The "nothing picked" row, e.g. "Select target beat...". Leave out for no such row. */
  emptyLabel?: string;
  /** Rows above the beats, such as "↩ Return to initial choices". */
  extraOptions?: ReadonlyArray<BeatPickerOption>;
  /** Shown after each beat's name: its type (default) or its id. */
  detail?: 'type' | 'id';
  className?: string;
  disabled?: boolean;
  title?: string;
  'data-testid'?: string;
}

// Beats picked recently, newest first, for this session.
const recent: string[] = [];
const RECENT_SHOWN = 5;
function remember(id: string) {
  const at = recent.indexOf(id);
  if (at >= 0) recent.splice(at, 1);
  recent.unshift(id);
  recent.length = Math.min(recent.length, 20);
}

/** Every word of the query appears somewhere in the beat's name, id or type. */
export function beatMatches(beat: BeatPickerBeat, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = `${beat.name ?? ''} ${beat.id} ${beat.type ?? ''}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}

type Row =
  | { kind: 'option'; value: string; label: string }
  | { kind: 'beat'; beat: BeatPickerBeat; recent?: boolean }
  | { kind: 'heading'; label: string };

export const BeatPicker: React.FC<Props> = ({
  value, onChange, beats, emptyLabel, extraOptions = [], detail = 'type', className, disabled, title, 'data-testid': testId,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; maxHeight: number; above: boolean } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const current = value ? beats.find((b) => b.id === value) : undefined;
  const currentOption = [...(emptyLabel !== undefined ? [{ value: '', label: emptyLabel }] : []), ...extraOptions]
    .find((o) => o.value === (value ?? ''));
  const shown = current
    ? beatLabel(current, detail)
    : currentOption?.label ?? (value ? `${value} (missing beat)` : '');

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    const q = query.trim();
    const options = [...(emptyLabel !== undefined ? [{ value: '', label: emptyLabel }] : []), ...extraOptions];
    for (const o of options) {
      if (!q || o.label.toLowerCase().includes(q.toLowerCase())) out.push({ kind: 'option', ...o });
    }
    const matching = beats.filter((b) => beatMatches(b, q));
    if (!q) {
      const recentBeats = recent.map((id) => beats.find((b) => b.id === id)).filter(Boolean).slice(0, RECENT_SHOWN) as BeatPickerBeat[];
      if (recentBeats.length > 0 && beats.length > RECENT_SHOWN * 2) {
        out.push({ kind: 'heading', label: 'Picked recently' });
        for (const b of recentBeats) out.push({ kind: 'beat', beat: b, recent: true });
        out.push({ kind: 'heading', label: 'All beats' });
      }
    }
    for (const b of matching) out.push({ kind: 'beat', beat: b });
    return out;
  }, [beats, query, emptyLabel, extraOptions]);

  const pickable = rows.map((r, i) => (r.kind === 'heading' ? -1 : i)).filter((i) => i >= 0);
  const rowValue = (r: Row) => (r.kind === 'beat' ? r.beat.id : r.kind === 'option' ? r.value : '');

  const place = () => {
    const el = buttonRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 8;
    const aboveSpace = r.top - 8;
    const above = below < 220 && aboveSpace > below;
    const maxHeight = Math.max(160, Math.min(380, above ? aboveSpace : below));
    const width = Math.max(r.width, 260);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    setPos({ left, top: above ? r.top - 4 : r.bottom + 4, width, maxHeight, above });
  };

  const openList = () => {
    if (disabled) return;
    setQuery('');
    place();
    setOpen(true);
  };

  // Start on the picked row.
  useEffect(() => {
    if (!open) return;
    const at = rows.findIndex((r) => r.kind !== 'heading' && !(r.kind === 'beat' && r.recent) && rowValue(r) === (value ?? ''));
    setActive(at >= 0 ? at : pickable[0] ?? 0);
    // Only when the list opens or the query changes.
  }, [open, query]);

  useLayoutEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || buttonRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onMove = (e: Event) => {
      if (popRef.current?.contains(e.target as Node)) return;
      place();
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-row="${active}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }, [active, open]);

  const pick = (r: Row) => {
    if (r.kind === 'heading') return;
    const v = rowValue(r);
    if (r.kind === 'beat') remember(v);
    setOpen(false);
    buttonRef.current?.focus();
    if (v !== (value ?? '')) onChange(v);
  };

  const step = (dir: 1 | -1) => {
    if (pickable.length === 0) return;
    const at = pickable.indexOf(active);
    const next = at < 0 ? 0 : Math.max(0, Math.min(pickable.length - 1, at + dir));
    setActive(pickable[next]);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); const r = rows[active]; if (r) pick(r); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); buttonRef.current?.focus(); }
    else if (e.key === 'Tab') setOpen(false);
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled}
        title={title ?? shown}
        data-testid={testId}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={(e) => {
          if (open) return;
          if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openList(); }
          else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); openList(); setQuery(e.key); }
        }}
        className={`${className ?? 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm'} flex items-center justify-between gap-1 bg-white text-left disabled:opacity-50`}
      >
        <span className={`truncate ${current ? '' : value ? 'text-red-600' : 'text-gray-500'}`}>{shown || ' '}</span>
        <svg width="12" height="12" viewBox="0 0 20 20" aria-hidden="true" className="flex-shrink-0 text-gray-500"><path fill="currentColor" d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4z" /></svg>
      </button>
      {open && pos && createPortal(
        <div
          ref={popRef}
          className="fixed z-[10000] bg-white border border-gray-300 rounded-lg shadow-xl flex flex-col overflow-hidden"
          style={{ left: pos.left, width: pos.width, maxHeight: pos.maxHeight, ...(pos.above ? { bottom: window.innerHeight - pos.top } : { top: pos.top }) }}
          onKeyDown={onKey}
        >
          <div className="p-1.5 border-b border-gray-200">
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${beats.length} beats…`}
              aria-label="Search beats"
              className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
          <div ref={listRef} role="listbox" className="overflow-y-auto py-1 text-sm">
            {rows.map((r, i) => r.kind === 'heading' ? (
              <div key={`h${i}`} className="px-2 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">{r.label}</div>
            ) : (
              <div
                key={r.kind === 'beat' ? `${r.recent ? 'r' : 'b'}${r.beat.id}` : `o${r.value}`}
                data-row={i}
                role="option"
                aria-selected={rowValue(r) === (value ?? '')}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(r)}
                className={`px-2 py-1 cursor-pointer flex items-baseline gap-1.5 ${i === active ? 'bg-blue-50' : ''} ${rowValue(r) === (value ?? '') ? 'font-semibold' : ''}`}
              >
                {r.kind === 'beat' ? (
                  <>
                    <span className="truncate text-gray-900">{r.beat.name || r.beat.id}</span>
                    <span className="ml-auto flex-shrink-0 text-xs text-gray-400">{detail === 'id' ? r.beat.id : r.beat.type}</span>
                  </>
                ) : (
                  <span className="truncate text-gray-600 italic">{r.label}</span>
                )}
              </div>
            ))}
            {pickable.length === 0 && <div className="px-2 py-2 text-gray-500">No beat matches “{query}”</div>}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
};

function beatLabel(b: BeatPickerBeat, detail: 'type' | 'id') {
  const d = detail === 'id' ? b.id : b.type;
  return b.name ? (d ? `${b.name} (${d})` : b.name) : b.id;
}
