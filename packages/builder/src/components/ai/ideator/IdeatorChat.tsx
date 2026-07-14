/**
 * Message list for the Ideator conversation. Renders user turns right-aligned,
 * assistant turns left-aligned, shows a thinking indicator while waiting on
 * Claude, and auto-scrolls to the bottom as new turns arrive.
 */

import React, { useEffect, useRef } from 'react';
import { Sparkles, User, Loader2, Search } from 'lucide-react';
import type { IdeatorMessage, IdeatorStatus } from './types';

interface IdeatorChatProps {
  messages: IdeatorMessage[];
  status: IdeatorStatus;
}

export const IdeatorChat: React.FC<IdeatorChatProps> = ({ messages, status }) => {
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  const isThinking = status === 'awaiting_response' || status === 'synthesizing';

  return (
    <div
      ref={scrollerRef}
      className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-white"
    >
      {messages.map(msg =>
        msg.kind === 'tool_use' ? (
          <ToolUseChip key={msg.id} message={msg} />
        ) : (
          <MessageBubble key={msg.id} message={msg} />
        )
      )}

      {isThinking && (
        <div className="flex items-center gap-2 text-sm text-gray-500 pl-10">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>
            {status === 'synthesizing' ? 'Drafting your prompt…' : 'Thinking…'}
          </span>
        </div>
      )}
    </div>
  );
};

/**
 * Inline chip that records a tool invocation. Sits between regular bubbles
 * so the user can see exactly what Ideator searched for and how many results
 * came back — important for thesis documentation of the AI's research path.
 */
const ToolUseChip: React.FC<{ message: IdeatorMessage }> = ({ message }) => {
  const meta = message.toolMeta;
  if (!meta) return null;
  if (meta.type === 'get_beat_content') {
    return (
      <div className="flex items-center gap-2 pl-10 text-xs text-gray-600">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-teal-50 border border-teal-200 text-teal-800">
          <Search className="w-3 h-3" />
          <span className="font-medium">Read full beat:</span>
          <span className="italic">{meta.query}</span>
        </div>
      </div>
    );
  }
  if (meta.type !== 'web_search') return null;
  return (
    <div className="flex items-center gap-2 pl-10 text-xs text-gray-600">
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-50 border border-purple-200 text-purple-800">
        <Search className="w-3 h-3" />
        <span className="font-medium">Searched:</span>
        <span className="italic">"{meta.query}"</span>
        <span className="text-purple-500">
          ({meta.resultCount} {meta.resultCount === 1 ? 'result' : 'results'})
        </span>
      </div>
    </div>
  );
};

const MessageBubble: React.FC<{ message: IdeatorMessage }> = ({ message }) => {
  const isUser = message.role === 'user';
  return (
    <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
          isUser
            ? 'bg-blue-500 text-white'
            : 'bg-gradient-to-br from-purple-500 to-pink-500 text-white'
        }`}
      >
        {isUser ? <User className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
      </div>
      <div
        className={`max-w-[80%] rounded-lg px-3.5 py-2 whitespace-pre-wrap text-sm leading-relaxed ${
          isUser
            ? 'bg-blue-500 text-white'
            : 'bg-gray-100 text-gray-900 border border-gray-200'
        }`}
      >
        {message.content}
      </div>
    </div>
  );
};
