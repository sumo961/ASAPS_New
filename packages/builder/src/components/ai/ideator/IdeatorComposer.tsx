/**
 * Bottom input area for the Ideator pop-out. Textarea + send button, plus a
 * "Generate Prompt" call-to-action that lights up when the assistant signals
 * readiness (or at any time the user decides they're ready themselves).
 */

import React, { useCallback, useState, KeyboardEvent } from 'react';
import { Send, Wand2 } from 'lucide-react';
import type { IdeatorStatus } from './types';

interface IdeatorComposerProps {
  status: IdeatorStatus;
  assistantSuggestsReady: boolean;
  onSend: (text: string) => void;
  onGeneratePrompt: () => void;
}

export const IdeatorComposer: React.FC<IdeatorComposerProps> = ({
  status,
  assistantSuggestsReady,
  onSend,
  onGeneratePrompt,
}) => {
  const [draft, setDraft] = useState('');

  const canSend =
    draft.trim().length > 0 &&
    (status === 'interviewing' || status === 'ready_to_synthesize');

  const submit = useCallback(() => {
    if (!canSend) return;
    onSend(draft);
    setDraft('');
  }, [canSend, draft, onSend]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter inserts a newline.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const canGenerate =
    status === 'interviewing' ||
    status === 'ready_to_synthesize';

  return (
    <div className="border-t bg-gray-50 px-4 py-3 space-y-2">
      {assistantSuggestsReady && (
        <div className="text-xs px-3 py-2 rounded bg-purple-50 border border-purple-200 text-purple-800">
          Ideator thinks there's enough to draft your prompt. Click
          "Generate Prompt" whenever you're ready — or keep talking.
        </div>
      )}

      <div className="flex items-end gap-2">
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your response… (Enter to send, Shift+Enter for newline)"
          rows={2}
          className="flex-1 resize-none rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
          disabled={status === 'awaiting_response' || status === 'synthesizing' || status === 'previewing' || status === 'submitting' || status === 'handed_off'}
        />
        <button
          onClick={submit}
          disabled={!canSend}
          className="px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
          title="Send message (Enter)"
        >
          <Send className="w-4 h-4" />
          <span className="text-sm font-medium">Send</span>
        </button>
      </div>

      <div className="flex justify-end">
        <button
          onClick={onGeneratePrompt}
          disabled={!canGenerate}
          className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 transition-colors ${
            assistantSuggestsReady
              ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600'
              : 'bg-white border border-purple-300 text-purple-700 hover:bg-purple-50'
          } disabled:opacity-40 disabled:cursor-not-allowed`}
          title="Synthesize the conversation so far into a prompt for the ASAPS story generator"
        >
          <Wand2 className="w-4 h-4" />
          Generate Prompt
        </button>
      </div>
    </div>
  );
};
