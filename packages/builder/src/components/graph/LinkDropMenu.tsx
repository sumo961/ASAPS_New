/**
 * Where does this link go? Opens where a link drawn in the flowchart was let
 * go over empty space (author's request, 2026-11-26): before, nothing
 * happened there and the drag was lost.
 *
 *  - New beat ▸  a list of beat types; the beat is made where the link was
 *                dropped and linked to.
 *  - a search field and the story's beats, to link to one that is out of
 *    sight or far away.
 *  - Cancel.
 *
 * Typing goes to the search field. Arrow keys move, → opens the types,
 * ← closes them, Enter picks, Escape cancels (or closes the types first).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, Plus, Search } from 'lucide-react';
import { beatMatches, type BeatPickerBeat } from '../common/BeatPicker';
import { beatTypeLabel } from '../../utils/changeBeatType';
import type { BeatTypeChoice } from './BeatPalette';

interface Props {
  x: number;
  y: number;
  fromName: string;
  /** The beats a link can go to (the one it starts from left out). */
  beats: ReadonlyArray<BeatPickerBeat>;
  types: { common: ReadonlyArray<BeatTypeChoice>; others: ReadonlyArray<BeatTypeChoice> };
  onNewBeat: (type: string) => void;
  onPickBeat: (beatId: string) => void;
  onCancel: () => void;
}

const WIDTH = 320;
const TYPES_WIDTH = 240;
const SHOWN = 8;

export const LinkDropMenu: React.FC<Props> = ({ x, y, fromName, beats, types, onNewBeat, onPickBeat, onCancel }) => {
  const [query, setQuery] = useState('');
  const [typesOpen, setTypesOpen] = useState(false);
  // 0 is "New beat"; 1… are the beats found.
  const [active, setActive] = useState(0);
  const [activeType, setActiveType] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const found = useMemo(() => beats.filter((b) => beatMatches(b, query)), [beats, query]);
  const allTypes = useMemo(() => [...types.common, ...types.others], [types]);

  useEffect(() => {
    inputRef.current?.focus();
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onCancel(); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onCancel]);

  // Typing narrows the list: the first beat found is the one Enter takes.
  useEffect(() => { setActive(query.trim() && found.length > 0 ? 1 : 0); }, [query, found.length]);
  useEffect(() => {
    ref.current?.querySelector('[data-active="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [active, activeType, typesOpen]);

  const left = Math.max(8, Math.min(x, window.innerWidth - WIDTH - 8));
  const top = Math.max(8, Math.min(y, window.innerHeight - 420));
  // The types open to the right, or to the left where there is no room.
  const typesLeft = left + WIDTH + TYPES_WIDTH + 8 <= window.innerWidth;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      if (typesOpen) setTypesOpen(false); else onCancel();
      return;
    }
    if (typesOpen) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveType((a) => Math.min(allTypes.length - 1, a + 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveType((a) => Math.max(0, a - 1)); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); setTypesOpen(false); }
      else if (e.key === 'Enter') { e.preventDefault(); if (allTypes[activeType]) onNewBeat(allTypes[activeType].type); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(found.length, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'ArrowRight' && active === 0 && !query) { e.preventDefault(); setTypesOpen(true); setActiveType(0); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (active === 0) { setTypesOpen(true); setActiveType(0); }
      else if (found[active - 1]) onPickBeat(found[active - 1].id);
    }
  };

  const typeRow = (t: BeatTypeChoice, i: number) => (
    <button
      key={t.type}
      type="button"
      role="menuitem"
      data-active={i === activeType}
      onMouseEnter={() => setActiveType(i)}
      onClick={() => onNewBeat(t.type)}
      className={`w-full px-3 py-1.5 text-left flex items-center gap-2 ${i === activeType ? 'bg-blue-50' : ''}`}
    >
      <span className="w-5 text-center flex-shrink-0">{t.icon}</span>
      <span className="truncate text-gray-900">{t.name}</span>
    </button>
  );

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label="Where does this link go?"
      data-testid="link-drop-menu"
      className="fixed z-[10000] text-sm"
      style={{ left, top, width: WIDTH }}
      onKeyDown={onKeyDown}
    >
      <div className="bg-white border border-gray-300 rounded-lg shadow-xl py-1">
        <div className="px-3 pt-1.5 pb-1 text-xs text-gray-500 leading-snug">
          Link from <span className="font-medium text-gray-700">{fromName}</span> to…
        </div>
        <button
          type="button"
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={typesOpen}
          data-active={active === 0 && !typesOpen}
          onMouseEnter={() => setActive(0)}
          onClick={() => { setTypesOpen((o) => !o); setActiveType(0); inputRef.current?.focus(); }}
          className={`w-full px-3 py-1.5 text-left flex items-center gap-2 ${active === 0 || typesOpen ? 'bg-blue-50' : ''}`}
        >
          <Plus className="w-4 h-4 text-blue-600 flex-shrink-0" />
          <span className="text-gray-900">New beat</span>
          <ChevronRight className="w-4 h-4 text-gray-400 ml-auto flex-shrink-0" />
        </button>
        <div className="my-1 border-t border-gray-200" />
        <div className="px-3 pb-1 relative">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setTypesOpen(false); }}
            placeholder="Or link to a beat: type its name…"
            aria-label="Find a beat to link to"
            className="w-full pl-7 pr-2 py-1.5 border border-gray-300 rounded text-sm focus:border-blue-400 focus:outline-none"
          />
        </div>
        <div className="overflow-y-auto" style={{ maxHeight: SHOWN * 34 }}>
          {found.length === 0 && (
            <div className="px-3 py-2 text-xs text-gray-500">{beats.length === 0 ? 'There is no other beat yet.' : 'No beat matches.'}</div>
          )}
          {found.map((b, i) => (
            <button
              key={b.id}
              type="button"
              role="menuitem"
              data-active={active === i + 1 && !typesOpen}
              onMouseEnter={() => setActive(i + 1)}
              onClick={() => onPickBeat(b.id)}
              className={`w-full px-3 py-1.5 text-left flex items-baseline gap-2 ${active === i + 1 && !typesOpen ? 'bg-blue-50' : ''}`}
            >
              <span className="truncate min-w-0 text-gray-900" title={b.name || b.id}>{b.name || b.id}</span>
              <span className="ml-auto flex-shrink-0 text-xs text-gray-400">{b.type ? beatTypeLabel(b.type) : ''}</span>
            </button>
          ))}
        </div>
        <div className="mt-1 border-t border-gray-200" />
        <button type="button" role="menuitem" onClick={onCancel} className="w-full px-3 py-1.5 text-left text-gray-600 hover:bg-gray-50">
          Cancel
        </button>
      </div>
      {typesOpen && (
        <div
          role="menu"
          aria-label="New beat: which type?"
          data-testid="link-drop-types"
          className="absolute top-6 bg-white border border-gray-300 rounded-lg shadow-xl py-1 overflow-y-auto"
          style={{ width: TYPES_WIDTH, maxHeight: 360, ...(typesLeft ? { left: WIDTH + 4 } : { right: WIDTH + 4 }) }}
        >
          {types.common.map((t, i) => typeRow(t, i))}
          {types.others.length > 0 && <div className="my-1 border-t border-gray-200" />}
          {types.others.map((t, i) => typeRow(t, types.common.length + i))}
        </div>
      )}
    </div>,
    document.body,
  );
};
