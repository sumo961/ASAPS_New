/**
 * IdeatorWindow — standalone pop-out page for the Ideator ideation tool.
 *
 * Loaded when the URL hash is `#/ideator-window[?title=...]`. Runs its own
 * Zustand conversation store (scoped to this window), talks to Claude via
 * the existing useAI pipeline, and posts a final StoryGenerationRequest
 * back to the opener window for handoff to the main story generator.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { IdeatorHeader } from '../components/ai/ideator/IdeatorHeader';
import { IdeatorChat } from '../components/ai/ideator/IdeatorChat';
import { IdeatorComposer } from '../components/ai/ideator/IdeatorComposer';
import { PromptPreviewPanel } from '../components/ai/ideator/PromptPreviewPanel';
import { SessionsPanel } from '../components/ai/ideator/SessionsPanel';
import { useIdeator } from '../components/ai/ideator/useIdeator';
import { useIdeatorStore } from '../components/ai/ideator/ideatorStore';
import { exportSessionMarkdown } from '../components/ai/ideator/exportTranscript';

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
    loadSavedSession,
    startNewSession,
  } = useIdeator();

  const sessionId = useIdeatorStore(s => s.sessionId);
  const sessionCreatedAt = useIdeatorStore(s => s.sessionCreatedAt);

  const [sessionsOpen, setSessionsOpen] = useState(false);

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

  // A conversation is worth exporting once the user has spoken at least once.
  const canExport = messages.some(m => m.role === 'user' && m.kind !== 'tool_use');

  const handleExport = useCallback(() => {
    exportSessionMarkdown({
      messages,
      createdAt: sessionCreatedAt ?? Date.now(),
      lastUpdatedAt: Date.now(),
      handedOff: status === 'handed_off',
      draftRequest: draftRequest ?? undefined,
    });
  }, [messages, sessionCreatedAt, status, draftRequest]);

  return (
    <div className="flex flex-col h-screen bg-white">
      <IdeatorHeader
        onReset={resetConversation}
        onNewSession={startNewSession}
        onOpenSessions={() => setSessionsOpen(true)}
        onExport={handleExport}
        disableReset={resetDisabled}
        canExport={canExport}
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

      <SessionsPanel
        open={sessionsOpen}
        onClose={() => setSessionsOpen(false)}
        currentSessionId={sessionId}
        onLoad={loadSavedSession}
      />
    </div>
  );
};

export default IdeatorWindow;
