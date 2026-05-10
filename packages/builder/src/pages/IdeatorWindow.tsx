/**
 * IdeatorWindow — standalone pop-out page for the Ideator ideation tool.
 *
 * Loaded when the URL hash is `#/ideator-window[?title=...]`. Runs its own
 * Zustand conversation store (scoped to this window), talks to Claude via
 * the existing useAI pipeline, and posts a final StoryGenerationRequest
 * back to the opener window for handoff to the main story generator.
 */

import React, { useMemo } from 'react';
import { IdeatorHeader } from '../components/ai/ideator/IdeatorHeader';
import { IdeatorChat } from '../components/ai/ideator/IdeatorChat';
import { IdeatorComposer } from '../components/ai/ideator/IdeatorComposer';
import { PromptPreviewPanel } from '../components/ai/ideator/PromptPreviewPanel';
import { useIdeator } from '../components/ai/ideator/useIdeator';

/**
 * Read the optional ?title=... parameter from the hash so the pop-out can
 * show context (e.g. "Shaping ideas for 'My Project'"). The title is purely
 * cosmetic; the transcript is the only real input to synthesis.
 */
function readProjectTitleFromHash(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const hash = window.location.hash ?? '';
  const qIdx = hash.indexOf('?');
  if (qIdx < 0) return undefined;
  const params = new URLSearchParams(hash.slice(qIdx + 1));
  const title = params.get('title');
  return title ? title : undefined;
}

export const IdeatorWindow: React.FC = () => {
  const projectTitle = useMemo(readProjectTitleFromHash, []);
  const {
    messages,
    status,
    draftRequest,
    error,
    isConfigured,
    sendMessage,
    generatePrompt,
    submitRequest,
    backToChat,
    resetConversation,
  } = useIdeator({ projectTitle });

  const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
  const assistantSuggestsReady = Boolean(lastAssistant?.readinessSignal);

  const showPreview =
    status === 'previewing' ||
    status === 'submitting' ||
    status === 'generating' ||
    status === 'handed_off';

  const resetDisabled =
    status === 'awaiting_response' ||
    status === 'synthesizing' ||
    status === 'submitting' ||
    status === 'generating';

  return (
    <div className="flex flex-col h-screen bg-white">
      <IdeatorHeader
        onReset={resetConversation}
        disableReset={resetDisabled}
      />

      {!isConfigured && (
        <div className="px-4 py-2 text-sm text-amber-800 bg-amber-50 border-b border-amber-200">
          No AI provider is configured. Open the main builder window, go to
          <strong> AI → Configure AI</strong>, and save an Anthropic Claude API
          key. Then come back to this window and start talking.
        </div>
      )}

      {showPreview && draftRequest ? (
        <PromptPreviewPanel
          draft={draftRequest}
          status={status}
          error={error}
          onBackToChat={backToChat}
          onConfirm={submitRequest}
        />
      ) : (
        <>
          <IdeatorChat messages={messages} status={status} />

          {error && (
            <div className="px-4 py-2 text-sm text-red-800 bg-red-50 border-t border-red-200">
              {error}
            </div>
          )}

          <IdeatorComposer
            status={status}
            assistantSuggestsReady={assistantSuggestsReady}
            onSend={sendMessage}
            onGeneratePrompt={generatePrompt}
          />
        </>
      )}
    </div>
  );
};

export default IdeatorWindow;
