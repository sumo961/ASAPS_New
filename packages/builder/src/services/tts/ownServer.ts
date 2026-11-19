/**
 * Requests to a speech server the author runs (Local and Custom providers).
 *
 * Such a server can be off, crash on a line, or answer "200 OK" with no
 * sound at all (mlx-audio does when a voice's language support is missing).
 * In each case the line would stay silent. These helpers turn them into a
 * TTSUnavailableError, which TTSService answers by reading the line with
 * the browser's voice and telling the author once.
 */

import { TTSUnavailableError } from '../../types/tts';

/** `fetch`, with "the server can't be reached" as a TTSUnavailableError. */
export async function fetchFromOwnServer(url: string, init: RequestInit, what: string): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new TTSUnavailableError(`${what} can't be reached at ${new URL(url, 'http://localhost').origin}`, true);
  }
}

/** A server error (5xx) is the server failing, not a wrong setup: read the line another way. */
export async function refuseServerFailure(response: Response, what: string): Promise<void> {
  if (!(response.status >= 500)) return;
  const detail = await response.text().catch(() => '');
  throw new TTSUnavailableError(`${what} failed on this line (${response.status})${detail ? `: ${detail.slice(0, 200)}` : ''}`, true);
}

/**
 * The response, once its first sound has arrived; a TTSUnavailableError when
 * it ends without any. The rest still streams.
 */
export async function withSound(response: Response, what: string): Promise<Response> {
  const body = response.body;
  if (!body || typeof body.getReader !== 'function') return response; // can't look inside
  const reader = body.getReader();
  let first: Uint8Array | undefined;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value && value.length > 0) { first = value; break; }
  }
  if (!first) throw new TTSUnavailableError(`${what} answered without any sound`, true);
  const opening = first;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(opening); },
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) controller.close();
      else if (value) controller.enqueue(value);
    },
    cancel(reason) { return reader.cancel(reason); },
  });
  return new Response(stream, { status: response.status, statusText: response.statusText, headers: response.headers });
}
