/**
 * get_beat_content — Co-Designer tool that fetches a beat's FULL content
 * from the main window on demand. This is the fallback for big stories:
 * when the digest had to truncate beat text ('…'), the model calls this
 * before proposing edits, so recommendations never rest on partial text.
 *
 * The executor does a wire round-trip: GET_BEAT_CONTENT → main window
 * looks the beat up in live state → BEAT_CONTENT back. Same dual
 * transport as the rest of the Co-Designer messages.
 */

import type { CoDesignerWireMessage } from './types';

export const GET_BEAT_CONTENT_TOOL_NAME = 'get_beat_content';

export const getBeatContentToolSpec = {
  name: GET_BEAT_CONTENT_TOOL_NAME,
  description:
    'Fetch the FULL current content of one beat from the open story ' +
    '(all parameters, notes, and connections). Use whenever the story ' +
    "digest shows truncated text ('…') for a beat you want to discuss in " +
    'detail or propose edits to — never propose editText over text you ' +
    'have only partially seen.',
  input_schema: {
    type: 'object' as const,
    properties: {
      beatId: {
        type: 'string',
        description: 'The beat id exactly as it appears in the digest (e.g. "beat_12").',
      },
    },
    required: ['beatId'],
  },
};

const REPLY_TIMEOUT_MS = 8000;

/** Pending round-trips keyed by requestId. */
const pending = new Map<string, (result: { content?: string; error?: string }) => void>();

let requestCounter = 0;

/** Called by the pop-out's wire listener when BEAT_CONTENT arrives. */
export function resolveBeatContentReply(payload: {
  requestId: string;
  content?: string;
  error?: string;
}): void {
  const resolver = pending.get(payload.requestId);
  if (resolver) {
    pending.delete(payload.requestId);
    resolver({ content: payload.content, error: payload.error });
  }
}

/**
 * Request a beat's full content from the main window. Resolves with a
 * text block for the model (or an error description — never rejects, so a
 * failed fetch degrades into an honest tool answer instead of a crash).
 */
export function fetchBeatContent(beatId: string): Promise<string> {
  return new Promise(resolve => {
    const requestId = `bc_${Date.now()}_${++requestCounter}`;
    const message: CoDesignerWireMessage = {
      type: 'GET_BEAT_CONTENT',
      payload: { requestId, beatId },
    };

    const timeout = setTimeout(() => {
      pending.delete(requestId);
      resolve(`Could not fetch ${beatId}: the main builder window did not answer. Ask the author to paste the text.`);
    }, REPLY_TIMEOUT_MS);

    pending.set(requestId, ({ content, error }) => {
      clearTimeout(timeout);
      resolve(error ? `Could not fetch ${beatId}: ${error}` : (content ?? `No content for ${beatId}.`));
    });

    const electronApi = (window as any).electronAPI?.codesigner;
    if (electronApi?.sendToMain) {
      try { electronApi.sendToMain(message); return; } catch { /* fall through */ }
    }
    if (window.opener) {
      try { window.opener.postMessage(message, window.location.origin); return; } catch { /* fall through */ }
    }
    clearTimeout(timeout);
    pending.delete(requestId);
    resolve(`Could not fetch ${beatId}: no main builder window is reachable.`);
  });
}
