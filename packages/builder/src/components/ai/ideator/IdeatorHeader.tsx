/**
 * Title bar for the Ideator pop-out. Shows the tool name, the project
 * context, and a reset action. Close is handled by the browser chrome —
 * the window was opened with window.open so the user has a standard
 * close button.
 */

import React from 'react';
import { Sparkles, RotateCcw } from 'lucide-react';

interface IdeatorHeaderProps {
  projectTitle?: string;
  onReset: () => void;
  disableReset: boolean;
}

export const IdeatorHeader: React.FC<IdeatorHeaderProps> = ({
  projectTitle,
  onReset,
  disableReset,
}) => {
  const handleReset = () => {
    if (disableReset) return;
    const confirmed = window.confirm(
      'Reset the conversation? The current transcript will be discarded.'
    );
    if (confirmed) onReset();
  };

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-purple-50 to-pink-50">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <div>
          <h1 className="text-base font-semibold text-gray-900">Ideator</h1>
          <p className="text-xs text-gray-500">
            {projectTitle
              ? `Shaping ideas for "${projectTitle}"`
              : 'Shape the idea before generating the story'}
          </p>
        </div>
      </div>

      <button
        onClick={handleReset}
        disabled={disableReset}
        className="px-2.5 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
        title="Discard the current conversation and start over"
      >
        <RotateCcw className="w-3.5 h-3.5" />
        Reset
      </button>
    </div>
  );
};
