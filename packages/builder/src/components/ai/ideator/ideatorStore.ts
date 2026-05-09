/**
 * Ideator conversation store (Zustand).
 *
 * Lives inside the Ideator pop-out window only. The main builder window
 * never touches this store — it receives a finalized StoryGenerationRequest
 * through postMessage and hands off to the existing generator pipeline.
 */

import { create } from 'zustand';
import type { StoryGenerationRequest } from '../../../types/ai';
import type { IdeatorMessage, IdeatorStatus } from './types';

interface IdeatorState {
  messages: IdeatorMessage[];
  status: IdeatorStatus;
  /**
   * Draft request produced by the synthesis step. Non-null only in
   * 'previewing', 'submitting', 'handed_off'.
   */
  draftRequest: StoryGenerationRequest | null;
  error: string | null;
  /** ID of the saved session this state corresponds to (null until first user msg). */
  sessionId: string | null;
  /** Epoch ms the loaded/created session was first created. */
  sessionCreatedAt: number | null;

  addMessage: (msg: Omit<IdeatorMessage, 'id' | 'timestamp'>) => IdeatorMessage;
  setStatus: (status: IdeatorStatus) => void;
  setDraftRequest: (req: StoryGenerationRequest | null) => void;
  updateDraftRequest: (patch: Partial<StoryGenerationRequest>) => void;
  setError: (err: string | null) => void;
  reset: () => void;
  setSessionId: (id: string | null, createdAt?: number) => void;
  /** Replace the entire conversation (used when loading a saved session). */
  hydrateFromSession: (data: {
    sessionId: string;
    sessionCreatedAt: number;
    messages: IdeatorMessage[];
    status: IdeatorStatus;
    draftRequest: StoryGenerationRequest | null;
  }) => void;
}

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `ideator-${Date.now()}-${idCounter}`;
}

export const useIdeatorStore = create<IdeatorState>((set, get) => ({
  messages: [],
  status: 'idle',
  draftRequest: null,
  error: null,
  sessionId: null,
  sessionCreatedAt: null,

  addMessage: ({ role, content, readinessSignal, kind, toolMeta }) => {
    const msg: IdeatorMessage = {
      id: nextId(),
      role,
      content,
      timestamp: Date.now(),
      readinessSignal,
      kind,
      toolMeta,
    };
    set(state => ({ messages: [...state.messages, msg] }));
    return msg;
  },

  setStatus: status => set({ status }),

  setDraftRequest: draftRequest => set({ draftRequest }),

  updateDraftRequest: patch => {
    const current = get().draftRequest;
    if (!current) return;
    set({ draftRequest: { ...current, ...patch } });
  },

  setError: error => set({ error }),

  reset: () =>
    set({
      messages: [],
      status: 'idle',
      draftRequest: null,
      error: null,
      sessionId: null,
      sessionCreatedAt: null,
    }),

  setSessionId: (sessionId, createdAt) =>
    set({
      sessionId,
      sessionCreatedAt: createdAt ?? (sessionId ? Date.now() : null),
    }),

  hydrateFromSession: ({
    sessionId,
    sessionCreatedAt,
    messages,
    status,
    draftRequest,
  }) =>
    set({
      sessionId,
      sessionCreatedAt,
      messages,
      status,
      draftRequest,
      error: null,
    }),
}));
