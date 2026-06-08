/**
 * NewProjectPicker — the in-editor "+ New" entry point. Mirrors the
 * three create paths from the Project Browser (Empty / Build from a
 * prompt / Co-write with AI) so authors get the same choice points
 * whether they're at the Browser or already editing. Import is
 * intentionally absent here — importing a zip is not a "new project"
 * flow conceptually; it lives in the Browser and the toolbar import
 * menu.
 *
 * Each card is a thin wrapper around a callback the host wires to
 * the same handlers the Browser uses (setShowNewProjectDialog /
 * setShowStoryGenerator / handleOpenIdeator), so we don't grow a
 * parallel state machine for the same destinations.
 */
import React from 'react';
import { FileText, Wand2, Sparkles, X } from 'lucide-react';

export interface NewProjectPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onPickEmpty: () => void;
  /** Undefined when no AI provider is wired; card renders disabled. */
  onPickPrompt?: () => void;
  /** Undefined when no Ideator handler is wired; card renders disabled. */
  onPickIdeator?: () => void;
}

export const NewProjectPicker: React.FC<NewProjectPickerProps> = ({
  isOpen,
  onClose,
  onPickEmpty,
  onPickPrompt,
  onPickIdeator,
}) => {
  if (!isOpen) return null;

  const pick = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">Start a new project</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            title="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <button
            type="button"
            onClick={() => pick(onPickEmpty)}
            className="flex flex-col items-start gap-2 p-5 bg-white border-2 border-gray-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition text-left group"
          >
            <FileText className="w-7 h-7 text-blue-600 group-hover:scale-110 transition-transform" />
            <div className="text-base font-semibold text-gray-900">Empty project</div>
            <div className="text-sm text-gray-600 leading-snug">
              Pick layout up front, then start adding beats
            </div>
          </button>

          <button
            type="button"
            onClick={() => onPickPrompt && pick(onPickPrompt)}
            disabled={!onPickPrompt}
            className="flex flex-col items-start gap-2 p-5 bg-white border-2 border-gray-200 rounded-xl hover:border-purple-400 hover:bg-purple-50 transition text-left group disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:border-gray-200 disabled:hover:bg-white relative"
            title={onPickPrompt
              ? 'Describe your idea in a sentence and the AI drafts the rest'
              : 'Configure an AI provider first (AI → Configure AI)'}
          >
            <Wand2 className="w-7 h-7 text-purple-500 group-hover:scale-110 transition-transform" />
            <div className="text-base font-semibold text-gray-900">Build from a prompt</div>
            <div className="text-sm text-gray-600 leading-snug">
              Your prompt → AI drafts the rest
            </div>
            {!onPickPrompt && (
              <span className="absolute top-2 right-2 text-[10px] font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">SOON</span>
            )}
          </button>

          <button
            type="button"
            onClick={() => onPickIdeator && pick(onPickIdeator)}
            disabled={!onPickIdeator}
            className="flex flex-col items-start gap-2 p-5 bg-white border-2 border-gray-200 rounded-xl hover:border-emerald-400 hover:bg-emerald-50 transition text-left group disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:border-gray-200 disabled:hover:bg-white relative"
            title={onPickIdeator
              ? 'Develop your idea in a conversation with an AI agent'
              : 'Configure an AI provider first (AI → Configure AI)'}
          >
            <Sparkles className="w-7 h-7 text-emerald-500 group-hover:scale-110 transition-transform" />
            <div className="text-base font-semibold text-gray-900">Co-write with AI</div>
            <div className="text-sm text-gray-600 leading-snug">
              Develop your idea in conversation
            </div>
            {!onPickIdeator && (
              <span className="absolute top-2 right-2 text-[10px] font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">SOON</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
