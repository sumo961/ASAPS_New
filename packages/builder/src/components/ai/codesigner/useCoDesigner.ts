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
import { extractProposalsFromReply, describeProposal } from './proposalParsing';
import {
  GET_BEAT_CONTENT_TOOL_NAME,
  fetchBeatContent,
  getBeatContentToolSpec,
  resolveBeatContentReply,
} from './beatContentTool';
import type { ChangeProposal, CoDesignerWireMessage, ProposalApplyResult } from './types';

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
    pendingProposals,
    applying,
    addMessage,
    setStatus,
    setError,
    setContext,
    setPendingProposals,
    setApplying,
    setLastApplyResults,
    reset,
  } = useCoDesignerStore();
  const { isConfigured, currentProvider, generateConversationTurn, generateChatWithTools } = useAI();

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

  // Listen for APPLY_RESULT from the main window (web postMessage and
  // Electron bridge). Results land as a chat log line so the transcript
  // records what was actually applied.
  useEffect(() => {
    const handleWire = (message: CoDesignerWireMessage | undefined) => {
      if (!message) return;
      if (message.type === 'BEAT_CONTENT') {
        resolveBeatContentReply(message.payload);
        return;
      }
      if (message.type === 'CONTEXT_UPDATED') {
        // Main window wrote a fresh snapshot (refresh button, menu reopen,
        // or post-apply) — re-read and tell the author.
        const ctx = readContextFromStorage();
        useCoDesignerStore.getState().setContext(ctx);
        if (ctx) {
          addMessage({
            role: 'assistant',
            content: `(Story snapshot refreshed — now looking at "${ctx.projectTitle || 'your story'}" as of ${new Date(ctx.capturedAt).toLocaleTimeString()}.)`,
          });
        }
        return;
      }
      if (message.type !== 'APPLY_RESULT') return;
      const results = message.payload?.results ?? [];
      const store = useCoDesignerStore.getState();
      store.setApplying(false);
      store.setLastApplyResults(results);
      store.setPendingProposals(null);
      // index -1 entries are informational (e.g. the backup-copy line) and
      // don't count toward the applied-changes tally.
      const real = results.filter(r => r.index >= 0);
      const okCount = real.filter(r => r.ok).length;
      const lines = results.map(r => `${r.ok ? '✓' : '✗'} ${r.detail}`).join('\n');
      addMessage({
        role: 'assistant',
        content: `(Applied ${okCount} of ${real.length} change${real.length === 1 ? '' : 's'} in the main window — every change is undoable there.)\n${lines}`,
      });
      setStatus('interviewing');
    };

    const onWindowMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      handleWire(event.data as CoDesignerWireMessage);
    };
    window.addEventListener('message', onWindowMessage);
    const electronUnsub = (window as any).electronAPI?.onCoDesignerMessage?.(
      (message: CoDesignerWireMessage) => handleWire(message)
    );
    return () => {
      window.removeEventListener('message', onWindowMessage);
      if (typeof electronUnsub === 'function') electronUnsub();
    };
  }, [addMessage, setStatus]);

  /**
   * Ask the main window for a FRESH snapshot (it rebuilds the digest from
   * live state, rewrites localStorage, and answers CONTEXT_UPDATED — the
   * wire listener above re-reads). Falls back to re-reading the stored
   * snapshot when no main window is reachable.
   */
  const refreshContext = useCallback(() => {
    const message: CoDesignerWireMessage = { type: 'REQUEST_CONTEXT' };
    const electronApi = (window as any).electronAPI?.codesigner;
    if (electronApi?.sendToMain) {
      try { electronApi.sendToMain(message); return; } catch { /* fall through */ }
    }
    if (window.opener) {
      try {
        window.opener.postMessage(message, window.location.origin);
        return;
      } catch { /* fall through */ }
    }
    // Fallback: re-read whatever snapshot is stored.
    const ctx = readContextFromStorage();
    setContext(ctx);
    if (ctx) {
      addMessage({
        role: 'assistant',
        content: `(Story snapshot re-read — "${ctx.projectTitle || 'your story'}" as of ${new Date(ctx.capturedAt).toLocaleTimeString()}. Main window not reachable for a live refresh.)`,
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

      // Tool-calling providers get the get_beat_content tool so truncated
      // digest entries can be expanded on demand (crucial for big stories
      // where the digest could not carry full text). Others fall back to
      // the plain conversation turn — the prompt then steers the model to
      // ask the author instead of editing blind.
      const useTools = currentProvider === 'claude' || currentProvider === 'openai';
      const systemPrompt = buildCoDesignerSystemPrompt(state.context, { beatContentToolAvailable: useTools });

      let result: { text: string } | null = null;
      if (useTools) {
        try {
          result = await generateChatWithTools({
            systemPrompt,
            messages: transcript,
            tools: [getBeatContentToolSpec],
            executeTool: async (name: string, input: any) => {
              if (name !== GET_BEAT_CONTENT_TOOL_NAME) return `Unknown tool: ${name}`;
              const beatId = String(input?.beatId ?? '');
              addMessage({
                role: 'assistant',
                content: '',
                kind: 'tool_use',
                toolMeta: { type: 'get_beat_content', query: beatId, resultCount: 1 },
              });
              return fetchBeatContent(beatId);
            },
          });
        } catch (err) {
          console.warn('[CoDesigner] Tool path failed, falling back to plain turn:', err);
          result = null;
        }
      }
      if (result?.text == null) {
        result = await generateConversationTurn({
          systemPrompt,
          messages: transcript,
          // Concrete design advice with options runs longer than interview
          // turns; reasoning models also need headroom on top.
          maxTokens: 4000,
        });
      }

      if (result?.text == null) {
        setStatus('interviewing');
        return;
      }

      const { cleanText, proposalSet, droppedCount } = extractProposalsFromReply(result.text);
      addMessage({ role: 'assistant', content: cleanText || '(proposed changes below)' });
      if (proposalSet) {
        setPendingProposals(proposalSet);
        setLastApplyResults(null);
        // Discoverability: the review card sits between the chat and the
        // input box — point at it so the batch isn't overlooked.
        addMessage({
          role: 'assistant',
          content: `(${proposalSet.proposals.length} proposed change${proposalSet.proposals.length === 1 ? '' : 's'} waiting in the review card below ⬇ — tick the ones you want and press Apply. Nothing changes until you do.)`,
        });
        if (droppedCount > 0) {
          console.warn(`[CoDesigner] ${droppedCount} malformed proposal(s) dropped`);
        }
      }
      setStatus('interviewing');
      void persistCurrentSession();
    },
    [isConfigured, addMessage, setStatus, setError, generateConversationTurn, persistCurrentSession]
  );

  /**
   * Send the author-selected proposals to the main window for application.
   * Two transports, same as the Ideator handoff: Electron IPC bridge when
   * present (window.opener is null for BrowserWindows), else postMessage
   * to the opener.
   */
  const applyProposals = useCallback((selected: ChangeProposal[]) => {
    if (selected.length === 0) return;
    const storeState = useCoDesignerStore.getState();
    const message: CoDesignerWireMessage = {
      type: 'APPLY_PROPOSALS',
      payload: {
        proposals: selected,
        title: storeState.pendingProposals?.title,
        projectId: storeState.context?.projectId,
      },
    };

    const electronApi = (window as any).electronAPI?.codesigner;
    if (electronApi?.sendToMain) {
      try {
        electronApi.sendToMain(message);
        setApplying(true);
        return;
      } catch (err) {
        setError(`Failed to send changes via Electron IPC: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
    }
    if (!window.opener) {
      setError('Cannot apply: the main builder window is not available. Keep it open while using the Co-Designer.');
      return;
    }
    try {
      window.opener.postMessage(message, window.location.origin);
      setApplying(true);
    } catch (err) {
      setError(`Failed to send changes: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [setApplying, setError]);

  const dismissProposals = useCallback(() => {
    const set_ = useCoDesignerStore.getState().pendingProposals;
    setPendingProposals(null);
    if (set_) {
      addMessage({
        role: 'assistant',
        content: `(Proposal batch "${set_.title}" dismissed — nothing was changed: ${set_.proposals.map(describeProposal).join('; ')}.)`,
      });
    }
  }, [setPendingProposals, addMessage]);

  return {
    messages,
    status,
    error,
    context,
    pendingProposals,
    applying,
    isConfigured,
    sendMessage,
    applyProposals,
    dismissProposals,
    refreshContext,
    loadSavedSession,
    startNewSession,
  };
}
