/**
 * CoDesignerWindow — standalone pop-out page for the Co-Designer, the
 * design-phase counterpart to the Ideator. Loaded when the URL hash is
 * `#/co-designer-window`. The main builder writes the open story's digest
 * to localStorage right before opening this window (see
 * CODESIGNER_CONTEXT_KEY); the conversation is grounded in that snapshot.
 *
 * Advice-only in this version: the Co-Designer proposes concrete changes
 * (referencing beats by name/id) and the author applies them in the main
 * window. Structured change proposals are the planned next step.
 */

import React, { useEffect, useState } from 'react';
import { CoDesignerHeader } from '../components/ai/codesigner/CoDesignerHeader';
import { IdeatorChat } from '../components/ai/ideator/IdeatorChat';
import { CoDesignerComposer } from '../components/ai/codesigner/CoDesignerComposer';
import { CoDesignerSessionsPanel } from '../components/ai/codesigner/CoDesignerSessionsPanel';
import { useCoDesigner } from '../components/ai/codesigner/useCoDesigner';
import { useCoDesignerStore } from '../components/ai/codesigner/coDesignerStore';

export const CoDesignerWindow: React.FC = () => {
  const {
    messages,
    status,
    error,
    context,
    isConfigured,
    sendMessage,
    refreshContext,
    loadSavedSession,
    startNewSession,
  } = useCoDesigner();

  const sessionId = useCoDesignerStore(s => s.sessionId);
  const [sessionsOpen, setSessionsOpen] = useState(false);

  // Electron: announce readiness so the main window's manager reflects
  // open state (window.open/Window.closed don't exist in the IPC world).
  useEffect(() => {
    try {
      (window as any).electronAPI?.codesigner?.ping?.();
    } catch { /* web build — nothing to do */ }
  }, []);

  return (
    <div className="flex flex-col h-screen bg-white">
      <CoDesignerHeader
        projectTitle={context?.projectTitle}
        contextCapturedAt={context?.capturedAt}
        onRefreshContext={refreshContext}
        onNewSession={startNewSession}
        onOpenSessions={() => setSessionsOpen(true)}
        disableActions={status === 'awaiting_response'}
      />

      {!isConfigured && (
        <div className="px-4 py-2 text-sm text-amber-800 bg-amber-50 border-b border-amber-200">
          No AI provider is configured. Open the main builder window, go to
          <strong> AI → Configure AI</strong>, save a provider, then come back
          here.
        </div>
      )}

      {!context && (
        <div className="px-4 py-2 text-sm text-amber-800 bg-amber-50 border-b border-amber-200">
          No story snapshot found. Close this window and reopen the
          Co-Designer from the main builder (AI menu) with your project open.
        </div>
      )}

      <IdeatorChat messages={messages} status={status} />

      {error && (
        <div className="px-4 py-2 text-sm text-red-800 bg-red-50 border-t border-red-200">
          {error}
        </div>
      )}

      <CoDesignerComposer status={status} onSend={sendMessage} />

      <CoDesignerSessionsPanel
        open={sessionsOpen}
        onClose={() => setSessionsOpen(false)}
        projectId={context?.projectId}
        currentSessionId={sessionId}
        onLoad={loadSavedSession}
      />
    </div>
  );
};

export default CoDesignerWindow;
