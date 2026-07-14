/**
 * Title bar for the Co-Designer pop-out. Shows which story this
 * conversation is grounded in (unlike the Ideator, the story IS the
 * subject here) plus conversation-level actions: refresh the story
 * snapshot, past sessions, new conversation.
 */

import React from 'react';
import { Compass, FilePlus, History, RefreshCw } from 'lucide-react';

interface CoDesignerHeaderProps {
  projectTitle?: string;
  /** Epoch ms of the current story snapshot (undefined = no context). */
  contextCapturedAt?: number;
  onRefreshContext: () => void;
  onNewSession: () => void;
  onOpenSessions: () => void;
  disableActions: boolean;
}

export const CoDesignerHeader: React.FC<CoDesignerHeaderProps> = ({
  projectTitle,
  contextCapturedAt,
  onRefreshContext,
  onNewSession,
  onOpenSessions,
  disableActions,
}) => {
  const handleNew = () => {
    if (disableActions) return;
    const confirmed = window.confirm(
      'Start a new conversation? The current one stays in Past Sessions — you can come back to it any time.'
    );
    if (confirmed) onNewSession();
  };

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-teal-600 to-emerald-600 text-white">
      <div className="flex items-center gap-2 min-w-0">
        <Compass className="w-5 h-5 flex-shrink-0" />
        <div className="min-w-0">
          <h1 className="font-semibold leading-tight">Co-Designer</h1>
          <div className="text-xs text-teal-100 truncate">
            {projectTitle ? `Working on "${projectTitle}"` : 'No story context'}
            {contextCapturedAt
              ? ` — snapshot ${new Date(contextCapturedAt).toLocaleTimeString()}`
              : ''}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          onClick={onRefreshContext}
          disabled={disableActions}
          className="p-1.5 rounded hover:bg-white/15 disabled:opacity-40"
          title="Re-read the story from the main window (use after editing beats)"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
        <button
          onClick={onOpenSessions}
          disabled={disableActions}
          className="p-1.5 rounded hover:bg-white/15 disabled:opacity-40"
          title="Past conversations for this story"
        >
          <History className="w-4 h-4" />
        </button>
        <button
          onClick={handleNew}
          disabled={disableActions}
          className="p-1.5 rounded hover:bg-white/15 disabled:opacity-40"
          title="Start a new conversation"
        >
          <FilePlus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
