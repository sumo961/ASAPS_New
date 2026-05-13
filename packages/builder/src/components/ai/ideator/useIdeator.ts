/**
 * useIdeator — drives the Ideator conversation state machine.
 *
 * Responsibilities:
 *   - Kick off with an opening assistant message the first time the window
 *     loads with an empty transcript
 *   - Send user turns to Claude via the existing useAI pipeline, append the
 *     response to the store, detect the readiness marker
 *   - Run the synthesis step when the user (or the assistant) says "ready"
 *   - Post the final StoryGenerationRequest back to the main builder window
 */

import { useCallback, useEffect, useRef } from 'react';
import { useAI } from '../../../hooks/useAI';
import { useIdeatorStore } from './ideatorStore';
import { buildInterviewSystemPrompt, READINESS_MARKER } from './systemPrompt';
import { synthesizeStoryRequest } from './promptSynthesis';
import { getSavedBraveApiKey } from './braveConfig';
import {
  buildWebSearchExecutor,
  webSearchToolSpec,
  WEB_SEARCH_TOOL_NAME,
} from './webSearchTool';
import {
  loadSession,
  newSessionId,
  saveSession,
} from './ideatorSessionStore';
import type { IdeatorStatus, IdeatorWireMessage } from './types';
import type { StoryGenerationRequest } from '../../../types/ai';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface UseIdeatorOptions {
  // projectTitle was here for the now-removed system-prompt context line.
  // Kept the empty interface in case future options land.
}

const OPENING_TURN =
  "Hi — I'm Ideator. I'm here to help you figure out what you want to say with " +
  "your interactive story, before we hand anything off to the ASAPS story " +
  "generator. Don't worry about plot, beats, or technicalities yet.\n\n" +
  "To start: what's the issue, theme, or question you've been turning over in " +
  "your head — the one you'd like the audience to sit with?";

export function useIdeator(_opts: UseIdeatorOptions = {}) {
  const {
    messages,
    status,
    draftRequest,
    error,
    addMessage,
    setStatus,
    setDraftRequest,
    updateDraftRequest,
    setError,
    reset,
  } = useIdeatorStore();
  const {
    isConfigured,
    currentProvider,
    error: aiError,
    generateConversationTurn,
    generateChatWithTools,
  } = useAI();

  // Guard so the opening message is only added once even under StrictMode
  // double-invocation in dev.
  const seededOpeningRef = useRef(false);

  // Seed the opening assistant message on first load.
  useEffect(() => {
    if (seededOpeningRef.current) return;
    if (messages.length > 0) {
      seededOpeningRef.current = true;
      return;
    }
    seededOpeningRef.current = true;
    addMessage({ role: 'assistant', content: OPENING_TURN });
    setStatus('interviewing');
  }, [messages.length, addMessage, setStatus]);

  /**
   * Save the current conversation to IndexedDB. Generates a session id on
   * first save. Called after every save-worthy state change (assistant turn
   * lands, draft synthesized, handed-off). Failures are logged but never
   * thrown — losing a save shouldn't disrupt the live conversation.
   */
  const persistCurrentSession = useCallback(async () => {
    const state = useIdeatorStore.getState();
    const hasRealUserMsg = state.messages.some(
      m => m.role === 'user' && m.kind !== 'tool_use'
    );
    if (!hasRealUserMsg) return; // nothing meaningful to persist yet

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
        createdAt: createdAt ?? Date.now(),
        lastUpdatedAt: Date.now(),
        messages: state.messages,
        draftRequest: state.draftRequest ?? undefined,
        handedOff: state.status === 'handed_off',
      });
    } catch (err) {
      console.warn('[Ideator] Failed to save session:', err);
    }
  }, []);

  /**
   * Load a previously saved session into the live store. The seeded opening
   * effect won't re-fire because `messages` is non-empty after hydration.
   */
  const loadSavedSession = useCallback(async (id: string): Promise<boolean> => {
    const session = await loadSession(id);
    if (!session) return false;
    // Resume in the state that best matches what was saved. Most loaded
    // sessions land in 'interviewing'; only those with a stored draft come
    // back to the preview pane.
    const resumedStatus: IdeatorStatus = session.handedOff
      ? 'handed_off'
      : session.draftRequest
        ? 'previewing'
        : 'interviewing';
    useIdeatorStore.getState().hydrateFromSession({
      sessionId: session.id,
      sessionCreatedAt: session.createdAt,
      messages: session.messages,
      status: resumedStatus,
      draftRequest: session.draftRequest ?? null,
    });
    seededOpeningRef.current = true;
    return true;
  }, []);

  /**
   * Start a new conversation from scratch, clearing the live store. The
   * current saved session (if any) remains in IndexedDB and can be loaded
   * again from the SessionsPanel.
   */
  const startNewSession = useCallback(() => {
    reset();
    seededOpeningRef.current = false;
  }, [reset]);

  /**
   * Send a user turn, then call Claude with the full transcript so far and
   * append the assistant's response. Claude sees the system prompt with the
   * IDN-complexity framing every turn, but the transcript is authoritative —
   * we do not filter or summarize it.
   *
   * If a Brave API key is saved AND the active provider is Claude, the
   * call routes through generateChatWithTools so Claude can invoke the
   * web_search tool mid-turn. Otherwise we fall back to the plain
   * conversation turn — Ideator still works without web research.
   */
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

      const history = useIdeatorStore.getState().messages;
      // Tool_use chips are display-only — strip them before sending to the
      // model. Empty assistant content (the chip placeholder) would also
      // confuse Claude.
      const transcript = history
        .filter(m => m.kind !== 'tool_use')
        .map(m => ({ role: m.role, content: m.content }));
      // Anthropic requires the first message to be `user`. The seeded opening
      // assistant turn is UI scaffolding, not a real model output — drop any
      // leading assistant turns before sending.
      while (transcript.length > 0 && transcript[0].role !== 'user') {
        transcript.shift();
      }

      const braveKey = getSavedBraveApiKey();
      // Brave-via-tool-use works on any provider that supports function
      // calling. Claude uses Anthropic's tool-use schema; OpenAI / Kimi /
      // Moonshot / OpenAI-compatible endpoints use OpenAI function-calling.
      // Both flavours are implemented in their respective providers'
      // generateChatWithTools (translation between schemas happens inside
      // OpenAIProvider). Local-only providers (Ollama variants without
      // tool-call support) will fall back at AIService.generateChatWithTools
      // which throws; we catch and surface to the user. Until then —
      // anyone with a Brave key and a Claude OR OpenAI-compatible
      // provider gets web search.
      const useTools = !!braveKey && (currentProvider === 'claude' || currentProvider === 'openai');

      const systemPrompt = buildInterviewSystemPrompt({
        webSearchAvailable: useTools,
      });

      let rawText: string | null = null;

      if (useTools && braveKey) {
        const executor = buildWebSearchExecutor(braveKey);
        const result = await generateChatWithTools({
          systemPrompt,
          messages: transcript,
          tools: [webSearchToolSpec],
          executeTool: async (name, input) => {
            if (name !== WEB_SEARCH_TOOL_NAME) {
              return `Unknown tool: ${name}`;
            }
            const r = await executor(input);
            // Append a chip BEFORE returning the text to the model — the
            // user sees the search land in the transcript regardless of
            // whether the model's eventual reply mentions it.
            addMessage({
              role: 'assistant',
              content: '',
              kind: 'tool_use',
              toolMeta: {
                type: 'web_search',
                query: r.query,
                resultCount: r.resultCount,
              },
            });
            return r.text;
          },
        });
        rawText = result?.text ?? null;
      } else {
        const result = await generateConversationTurn({
          systemPrompt,
          messages: transcript,
        });
        rawText = result?.text ?? null;
      }

      if (rawText == null) {
        // useAI has set an error string; move back so the user can retry.
        setStatus('interviewing');
        return;
      }

      // Pull the readiness marker off the text but keep the message readable.
      const hasSignal = rawText.includes(READINESS_MARKER);
      const cleaned = hasSignal
        ? rawText.replace(READINESS_MARKER, '').trim()
        : rawText.trim();

      addMessage({
        role: 'assistant',
        content: cleaned,
        readinessSignal: hasSignal,
      });

      setStatus(hasSignal ? 'ready_to_synthesize' : 'interviewing');
      void persistCurrentSession();
    },
    [
      addMessage,
      currentProvider,
      generateChatWithTools,
      generateConversationTurn,
      isConfigured,
      persistCurrentSession,
      setError,
      setStatus,
    ]
  );

  /**
   * User clicked "Generate Prompt". Runs synthesis on the full transcript
   * and moves the UI to the preview pane.
   */
  const generatePrompt = useCallback(async () => {
    setError(null);
    setStatus('synthesizing');
    try {
      const history = useIdeatorStore.getState().messages;
      const { request } = await synthesizeStoryRequest(history);
      setDraftRequest(request);
      setStatus('previewing');
      void persistCurrentSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('ready_to_synthesize');
    }
  }, [persistCurrentSession, setDraftRequest, setError, setStatus]);

  /**
   * Send the final request to the opener window. We move to 'generating'
   * once the postMessage is in flight; the terminal 'handed_off' state is
   * only reached when the main window posts back GENERATION_COMPLETE (see
   * the listener effect below). Until then the preview panel shows a
   * progress block so the author knows work is happening.
   */
  const submitRequest = useCallback((req: StoryGenerationRequest) => {
    setStatus('submitting');
    const message: IdeatorWireMessage = {
      type: 'SUBMIT_REQUEST',
      payload: { request: req },
    };
    // Two transports — choose by environment:
    //   1. Electron desktop: window.opener is null because the pop-out
    //      was launched via BrowserWindow, not window.open. Route via the
    //      ideator IPC bridge exposed in the preload.
    //   2. Web build: standard postMessage to window.opener with origin
    //      check on the receiving side.
    const electronApi = (window as any).electronAPI?.ideator;
    if (electronApi?.sendToMain) {
      try {
        electronApi.sendToMain(message);
        setStatus('generating');
        return;
      } catch (err) {
        setError(
          `Failed to hand off request via Electron IPC: ${err instanceof Error ? err.message : String(err)}`
        );
        setStatus('previewing');
        return;
      }
    }
    if (!window.opener) {
      setError('Cannot hand off: the main builder window is not available.');
      return;
    }
    try {
      window.opener.postMessage(message, window.location.origin);
      setStatus('generating');
    } catch (err) {
      setError(
        `Failed to hand off request: ${err instanceof Error ? err.message : String(err)}`
      );
      setStatus('previewing');
    }
  }, [setError, setStatus]);

  /**
   * Listen for completion / failure messages from the main builder. These
   * arrive after aiService.generateStory() resolves on the opener side.
   * In Electron we listen via the ideator IPC bridge instead of window
   * postMessage; in the web build we use the standard postMessage path.
   * Plus PING the main on mount so the manager knows we're ready and
   * can flush any pending state.
   */
  useEffect(() => {
    const electronApi = (window as any).electronAPI?.ideator;

    const handleWireMessage = (message: IdeatorWireMessage | undefined) => {
      if (!message || typeof message.type !== 'string') return;
      if (message.type === 'GENERATION_COMPLETE') {
        setStatus('handed_off');
        void persistCurrentSession();
      } else if (message.type === 'GENERATION_FAILED') {
        setError(message.payload?.error ?? 'Story generation failed.');
        setStatus('previewing');
      }
    };

    if (electronApi?.ping && (window as any).electronAPI?.onIdeatorMessage) {
      // Electron: subscribe via IPC bridge, ping main once we're ready.
      const unsubscribe = (window as any).electronAPI.onIdeatorMessage(
        (message: IdeatorWireMessage) => handleWireMessage(message),
      );
      try {
        electronApi.ping();
      } catch {
        /* not fatal */
      }
      return unsubscribe;
    }

    // Web build: postMessage path with origin check.
    const handler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      handleWireMessage(event.data as IdeatorWireMessage | undefined);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [persistCurrentSession, setError, setStatus]);

  /**
   * Leave the preview and return to the conversation without discarding
   * anything. The transcript is preserved so the user can keep ideating and
   * re-synthesize with an extended conversation if they want.
   */
  const backToChat = useCallback(() => {
    setDraftRequest(null);
    setError(null);
    setStatus('interviewing');
  }, [setDraftRequest, setError, setStatus]);

  return {
    messages,
    status,
    draftRequest,
    error: error ?? aiError,
    isConfigured,
    sendMessage,
    generatePrompt,
    submitRequest,
    updateDraftRequest,
    backToChat,
    resetConversation: reset,
    loadSavedSession,
    startNewSession,
  };
}
