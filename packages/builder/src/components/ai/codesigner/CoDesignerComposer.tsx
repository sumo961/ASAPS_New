/**
 * Bottom input area for the Co-Designer pop-out. Textarea + send button —
 * no synthesis call-to-action (the Co-Designer is a pure conversation in
 * this version).
 */

import React, { useCallback, useState, KeyboardEvent } from 'react';
import { Send } from 'lucide-react';
import type { IdeatorStatus } from '../ideator/types';

interface CoDesignerComposerProps {
  status: IdeatorStatus;
  onSend: (text: string) => void;
}

export const CoDesignerComposer: React.FC<CoDesignerComposerProps> = ({
  status,
  onSend,
}) => {
  const [draft, setDraft] = useState('');

  const canSend = draft.trim().length > 0 && status === 'interviewing';

  const submit = useCallback(() => {
    if (!canSend) return;
    onSend(draft);
    setDraft('');
  }, [canSend, draft, onSend]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="border-t bg-gray-50 px-4 py-3">
      <div className="flex items-end gap-2">
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder='Ask about your story… e.g. "I want the protagonist more sinister — what are my options?" (Enter to send)'
          rows={2}
          className="flex-1 resize-none rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
          disabled={status === 'awaiting_response'}
        />
        <button
          onClick={submit}
          disabled={!canSend}
          className="px-3 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
          title="Send message (Enter)"
        >
          <Send className="w-4 h-4" />
          <span className="text-sm font-medium">Send</span>
        </button>
      </div>
    </div>
  );
};
