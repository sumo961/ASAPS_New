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
import { beatTypeReference } from '../../../utils/beatTypeReference';

export const GET_BEAT_TYPE_SCHEMA_TOOL_NAME = 'get_beat_type_schema';

/**
 * get_beat_type_schema — a beat type's parameters (names, types, required,
 * allowed values, nested item shapes) from the schema. Answered locally:
 * the schema ships with the app, so there is no main-window round-trip.
 */
export const getBeatTypeSchemaToolSpec = {
  name: GET_BEAT_TYPE_SCHEMA_TOOL_NAME,
  description:
    "Return one beat type's parameter reference from the app's schema: each " +
    'parameter\'s name, type, whether it is required, default, allowed values, ' +
    'and nested item shapes (e.g. aiConversation directions). Answered ' +
    'locally, so it does not fail for network reasons. Common aliases resolve ' +
    '("conversation" → aiConversation); an unknown type returns "No beat type …" ' +
    'followed by the valid type ids. Use it before proposing addBeat, ' +
    'replaceBeat or updateParams for a type whose parameters you have not seen ' +
    'in this conversation; the app rejects parameter names a type does not have.',
  input_schema: {
    type: 'object' as const,
    properties: {
      beatType: { type: 'string', description: 'Beat type id, e.g. "aiConversation".' },
    },
    required: ['beatType'],
  },
};

export function getBeatTypeSchema(beatType: string): string {
  return beatTypeReference(beatType);
}

export const GET_BEAT_CONTENT_TOOL_NAME = 'get_beat_content';

export const getBeatContentToolSpec = {
  name: GET_BEAT_CONTENT_TOOL_NAME,
  description:
    'Fetch the full current content of one beat in the open story: all ' +
    'parameters (untruncated text, choices, dialog trees), author notes, ' +
    'entry requirements and outgoing connections, as a text block. Use it ' +
    "when the digest truncates a beat ('…') or shortens its choice labels. " +
    'It reads live builder state, so it reflects edits made after the digest ' +
    'was captured. Fetch at most a handful of beats per turn. Returns a ' +
    '"Could not fetch <id>: …" message if the id is unknown or the main ' +
    'builder window does not answer within a few seconds.',
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
