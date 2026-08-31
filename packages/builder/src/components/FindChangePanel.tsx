/**
 * Find & Change — the one bulk-edit surface (UX eval B10, decided 2026-08-21).
 *
 * Search & Replace and Transformations were two right-docked panels doing
 * halves of the same job under different names and shortcuts. This shell
 * hosts both as tabs: Find (search & replace, no AI) and Change with AI
 * (natural-language bulk transformations). ⌘F opens Find, ⌘⇧F opens Change —
 * both learned habits keep working, they just land in the same place.
 *
 * The tab bodies are the existing SearchPanel / HelperCommandInput rendered
 * in `embedded` mode (no own shell or title row). Both stay mounted while
 * the panel exists so tab switches and even close/reopen keep their state
 * (an in-flight AI conversation survives, exactly as it did pre-merge).
 */

import React from 'react';
import { X, Search, Wand2 } from 'lucide-react';

export type FindChangeTab = 'find' | 'change';

interface FindChangePanelProps {
  isOpen: boolean;
  tab: FindChangeTab;
  onTabChange: (tab: FindChangeTab) => void;
  onClose: () => void;
  /** The Find tab body (SearchPanel in embedded mode). */
  findContent: React.ReactNode;
  /** The Change tab body (HelperCommandInput in embedded mode). */
  changeContent: React.ReactNode;
}

export const FindChangePanel: React.FC<FindChangePanelProps> = ({
  isOpen,
  tab,
  onTabChange,
  onClose,
  findContent,
  changeContent,
}) => {
  const tabBtn = (value: FindChangeTab, icon: React.ReactNode, label: string) => (
    <button
      onClick={() => onTabChange(value)}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg text-sm font-medium border-b-2 transition-colors ${
        tab === value
          ? 'border-blue-500 text-blue-700 bg-white'
          : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}
      role="tab"
      aria-selected={tab === value}
    >
      {icon}
      {label}
    </button>
  );

  return (
    // Keep the children mounted even while closed (hidden, not unmounted) so
    // panel state — query, results, AI conversation — survives close/reopen.
    <div
      className={
        isOpen
          ? 'fixed right-0 top-0 bottom-0 w-[480px] bg-white shadow-xl border-l border-gray-200 z-50 flex flex-col'
          : 'hidden'
      }
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      role="dialog"
      aria-label="Find & Change"
    >
      {/* pt-10 pushes below Electron's macOS title-bar drag region */}
      <div className="flex-shrink-0 px-4 pt-10 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Find &amp; Change</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded" title="Close (Esc)">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex gap-1 mt-2" role="tablist">
          {tabBtn('find', <Search className="w-4 h-4" />, 'Find')}
          {tabBtn('change', <Wand2 className="w-4 h-4" />, 'Change with AI')}
        </div>
      </div>
      <div className={tab === 'find' ? 'flex-1 min-h-0 flex flex-col' : 'hidden'}>{findContent}</div>
      <div className={tab === 'change' ? 'flex-1 min-h-0 flex flex-col' : 'hidden'}>{changeContent}</div>
    </div>
  );
};
