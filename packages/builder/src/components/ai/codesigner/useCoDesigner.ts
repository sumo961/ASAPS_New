/**
 * useCoDesigner — drives the Co-Designer conversation.
 *
 * Much simpler than useIdeator: no synthesis, no handoff, no tools. Reads
 * the story context (digest) that the main window wrote to localStorage
 * before opening this pop-out, seeds an opening turn, and loops user ↔
 * assistant turns through useAI's generateConversationTurn with the
 * digest-grounded system prompt. Sessions autosave per project.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useAI } from '../../../hooks/useAI';
import { useCoDesignerStore, type CoDesignerContext } from './coDesignerStore';
import { buildCoDesignerSystemPrompt } from './systemPrompt';
import {
  loadSession,
  newSessionId,
  saveSession,
} from './coDesignerSessionStore';

/**
 * localStorage key the main builder writes the story snapshot to right
 * before opening the pop-out. Same-origin windows share localStorage in
 * both the web build and Electron, so no postMessage handshake is needed.
 */
export const CODESIGNER_CONTEXT_KEY = 'asaps_codesigner_context';

function readContextFromStorage(): CoDesignerContext | null {
  try {
    const raw = localStorage.getItem(CODESIGNER_CONTEXT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.digest !== 'string') return null;
    return parsed as CoDesignerContext;
  } catch {
    return null;
  }
}

function buildOpeningTurn(context: CoDesignerContext | null): string {
  const title = context?.projectTitle ? `"${context.projectTitle}"` : 'your story';
  return (
    `Hi — I'm your Co-Designer. I've read ${title} as it stands right now` +
    ` and I'm here to work on it with you: deepening characters, sharpening` +
    ` choices, finding where branches or state would earn their keep.\n\n` +
    `What would you like to work on? You can be broad ("the middle drags")` +
    ` or specific ("I want the protagonist more sinister — what are my options?").`
  );
}

export function useCoDesigner() {
  const {
    messages,
    status,
    error,
    context,
    addMessage,
    setStatus,
    setError,
    setContext,
    reset,
  } = useCoDesignerStore();
  const { isConfigured, generateConversationTurn } = useAI();

  const seededRef = useRef(false);

  // Read the story context once on mount, then seed the opening message.
  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    const ctx = readContextFromStorage();
    setContext(ctx);
    if (useCoDesignerStore.getState().messages.length === 0) {
      addMessage({ role: 'assistant', content: buildOpeningTurn(ctx) });
      setStatus('interviewing');
    }
  }, [addMessage, setContext, setStatus]);

  /** Re-read the snapshot (the main window rewrites it on demand). */
  const refreshContext = useCallback(() => {
    const ctx = readContextFromStorage();
    setContext(ctx);
    if (ctx) {
      addMessage({
        role: 'assistant',
        content: `(Story snapshot refreshed — I'm now looking at "${ctx.projectTitle || 'your story'}" as of ${new Date(ctx.capturedAt).toLocaleTimeString()}.)`,
      });
    }
  }, [addMessage, setContext]);

  const persistCurrentSession = useCallback(async () => {
    const state = useCoDesignerStore.getState();
    const hasRealUserMsg = state.messages.some(m => m.role === 'user');
    if (!hasRealUserMsg) return;

    let sessionId = state.sessionId;
    let createdAt = state.sessionCreatedAt;
    if (!sessionId) {
      sessionId = newSessionId();
      createdAt = Date.now();
      state.setSessionId(sessionId, createdAt);
    }
    try {
      await saveSession({
        id: sessionId,
        projectId: state.context?.projectId,
        projectTitle: state.context?.projectTitle,
        createdAt: createdAt ?? Date.now(),
        lastUpdatedAt: Date.now(),
        messages: state.messages,
      });
    } catch (err) {
      console.warn('[CoDesigner] Failed to save session:', err);
    }
  }, []);

  const loadSavedSession = useCallback(async (id: string): Promise<boolean> => {
    const session = await loadSession(id);
    if (!session) return false;
    useCoDesignerStore.getState().hydrateFromSession({
      sessionId: session.id,
      sessionCreatedAt: session.createdAt,
      messages: session.messages,
    });
    seededRef.current = true;
    return true;
  }, []);

  const startNewSession = useCallback(() => {
    reset();
    // Keep the current context; re-seed the opening turn against it.
    const ctx = useCoDesignerStore.getState().context;
    addMessage({ role: 'assistant', content: buildOpeningTurn(ctx) });
    setStatus('interviewing');
  }, [reset, addMessage, setStatus]);

  const sendMessage = useCallback(
    async (userText: string) => {
      const trimmed = userText.trim();
      if (!trimmed) return;
      if (!isConfigured) {
        setError(
          'AI service is not configured. Open the main builder window, click AI → Configure AI, then try again.'
        );
        return;
      }

      setError(null);
      addMessage({ role: 'user', content: trimmed });
      setStatus('awaiting_response');

      const state = useCoDesignerStore.getState();
      const transcript = state.messages
        .filter(m => m.kind !== 'tool_use')
        .map(m => ({ role: m.role, content: m.content }));
      // Anthropic requires the first message to be `user`; the seeded
      // opening assistant turn is UI scaffolding.
      while (transcript.length > 0 && transcript[0].role !== 'user') {
        transcript.shift();
      }

      const systemPrompt = buildCoDesignerSystemPrompt(state.context);

      const result = await generateConversationTurn({
        systemPrompt,
        messages: transcript,
        // Concrete design advice with options runs longer than interview
        // turns; reasoning models also need headroom on top.
        maxTokens: 4000,
      });

      if (result?.text == null) {
        setStatus('interviewing');
        return;
      }

      addMessage({ role: 'assistant', content: result.text.trim() });
      setStatus('interviewing');
      void persistCurrentSession();
    },
    [isConfigured, addMessage, setStatus, setError, generateConversationTurn, persistCurrentSession]
  );

  return {
    messages,
    status,
    error,
    context,
    isConfigured,
    sendMessage,
    refreshContext,
    loadSavedSession,
    startNewSession,
  };
}
