/**
 * Which output is the new link? Opens where a link drawn in the flowchart
 * was dropped, when the beat it starts from has more than one output
 * (choices, If true / If false, …). Outputs not linked yet come first;
 * linked ones say where they lead now and are replaced when picked.
 * Arrow keys move, Enter picks, Escape cancels.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { LinkOutput } from '../../utils/linkOutputs';

interface Props {
  x: number;
  y: number;
  fromName: string;
  toName: string;
  outputs: LinkOutput[];
  /** Name of the beat an output leads to now. */
  nameOf: (beatId: string) => string;
  onPick: (output: LinkOutput) => void;
  onCancel: () => void;
}

export const LinkOutputMenu: React.FC<Props> = ({ x, y, fromName, toName, outputs, nameOf, onPick, onCancel }) => {
  const sorted = useMemo(() => [...outputs].sort((a, b) => Number(!!a.target) - Number(!!b.target)), [outputs]);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onCancel(); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onCancel]);

  const width = 380;
  const left = Math.max(8, Math.min(x, window.innerWidth - width - 8));
  const top = Math.max(8, Math.min(y, window.innerHeight - 60 - Math.min(sorted.length, 10) * 34));

  return createPortal(
    <div
      ref={ref}
      tabIndex={-1}
      role="menu"
      aria-label="Which output is the new link?"
      className="fixed z-[10000] bg-white border border-gray-300 rounded-lg shadow-xl py-1 text-sm outline-none"
      style={{ left, top, width }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(sorted.length - 1, a + 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
        else if (e.key === 'Enter') { e.preventDefault(); if (sorted[active]) onPick(sorted[active]); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel(); }
      }}
    >
      <div className="px-3 pt-1.5 pb-1 text-xs text-gray-500 leading-snug">
        Link from <span className="font-medium text-gray-700">{fromName}</span> to{' '}
        <span className="font-medium text-gray-700">{toName}</span> — which one?
      </div>
      <div className="max-h-[340px] overflow-y-auto">
        {sorted.map((o, i) => (
          <button
            key={o.key}
            type="button"
            role="menuitem"
            onMouseEnter={() => setActive(i)}
            onClick={() => onPick(o)}
            className={`w-full px-3 py-1.5 text-left flex items-baseline gap-2 ${i === active ? 'bg-blue-50' : ''}`}
          >
            <span className="truncate min-w-0 text-gray-900" title={o.label}>{o.label}</span>
            <span className={`ml-auto flex-shrink-0 max-w-[40%] truncate text-xs ${o.target ? 'text-gray-400' : 'text-amber-600'}`}>
              {!o.target ? 'not linked yet' : o.target === '__self__' ? '↩ back to the choices' : `→ ${nameOf(o.target)}`}
            </span>
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
};
