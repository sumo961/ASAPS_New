/**
 * Co-Designer conversation store — one Zustand store scoped to the pop-out
 * window. Mirrors ideatorStore but without the synthesis/handoff machinery:
 * the Co-Designer MVP is an advice-only conversation about the OPEN story.
 *
 * Reuses the IdeatorMessage/IdeatorStatus types so the ideator's chat
 * renderer works unchanged; only the 'idle' | 'interviewing' |
 * 'awaiting_response' states are used here.
 */

import { create } from 'zustand';
import type { IdeatorMessage, IdeatorStatus } from '../ideator/types';

/** The open-story context handed over from the main builder window. */
export interface CoDesignerContext {
  projectId?: string;
  projectTitle?: string;
  /** Plain-text story digest (see utils/storyDigest.ts). */
  digest: string;
  /** Epoch ms when the digest was captured. */
  capturedAt: number;
}

interface CoDesignerState {
  messages: IdeatorMessage[];
  status: IdeatorStatus;
  error: string | null;
  context: CoDesignerContext | null;
  sessionId: string | null;
  sessionCreatedAt: number | null;

  addMessage: (msg: Omit<IdeatorMessage, 'id' | 'timestamp'>) => void;
  setStatus: (status: IdeatorStatus) => void;
  setError: (error: string | null) => void;
  setContext: (context: CoDesignerContext | null) => void;
  setSessionId: (id: string, createdAt: number) => void;
  hydrateFromSession: (data: {
    sessionId: string;
    sessionCreatedAt: number;
    messages: IdeatorMessage[];
  }) => void;
  reset: () => void;
}

let messageCounter = 0;
function nextMessageId(): string {
  messageCounter += 1;
  return `cdmsg_${Date.now()}_${messageCounter}`;
}

export const useCoDesignerStore = create<CoDesignerState>((set) => ({
  messages: [],
  status: 'idle',
  error: null,
  context: null,
  sessionId: null,
  sessionCreatedAt: null,

  addMessage: (msg) =>
    set((state) => ({
      messages: [
        ...state.messages,
        { ...msg, id: nextMessageId(), timestamp: Date.now() },
      ],
    })),
  setStatus: (status) => set({ status }),
  setError: (error) => set({ error }),
  setContext: (context) => set({ context }),
  setSessionId: (id, createdAt) =>
    set({ sessionId: id, sessionCreatedAt: createdAt }),
  hydrateFromSession: (data) =>
    set({
      sessionId: data.sessionId,
      sessionCreatedAt: data.sessionCreatedAt,
      messages: data.messages,
      status: 'interviewing',
      error: null,
    }),
  reset: () =>
    set({
      messages: [],
      status: 'idle',
      error: null,
      sessionId: null,
      sessionCreatedAt: null,
    }),
}));
