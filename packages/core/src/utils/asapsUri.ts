/**
 * ASAPS URI scheme — `asaps://` URIs that encode story-level intent.
 *
 * Designed to ride through any string-carrying channel: QR codes, hyperText
 * link hrefs, postMessage payloads from embedded webViews, AR marker
 * payloads, deep-link launches on native iOS/Android. A single parser keeps
 * the semantics consistent across all consumers.
 *
 * Grammar (informal):
 *   asaps://beat/<beatId>
 *   asaps://variable/<name>/<value>
 *   asaps://inventory/add/<item>
 *   asaps://inventory/remove/<item>
 *   asaps://event/<eventName>
 *
 * All segments are URL-encoded; the parser decodes them. Unknown verbs
 * return null so callers fall back to their default behavior (e.g.
 * qrScan saves the raw string as a variable). null is also returned
 * for any non-`asaps://` input, so callers can pipe arbitrary strings
 * through without pre-filtering.
 */

export type AsapsAction =
  | { kind: 'beat'; target: string }
  | { kind: 'variable'; name: string; value: string }
  | { kind: 'inventory'; op: 'add' | 'remove'; item: string }
  | { kind: 'event'; name: string };

const SCHEME = 'asaps://';

/**
 * Parse a raw string as an ASAPS URI. Returns null for anything that
 * isn't a recognized ASAPS action — including non-`asaps://` strings
 * and well-formed URIs with unknown verbs. Callers use null as the
 * "fall through to default behavior" signal.
 */
export function parseAsapsUri(raw: string): AsapsAction | null {
  if (typeof raw !== 'string') return null;
  if (!raw.startsWith(SCHEME)) return null;

  // Strip scheme; split on / but treat the verb (first segment) as
  // the discriminator. The remaining segments are verb-specific.
  // We don't use `new URL(...)` because non-http schemes are parsed
  // inconsistently across browsers — Safari refuses to expose the
  // pathname of an unrecognized scheme. Manual split is portable.
  const body = raw.slice(SCHEME.length);
  const segments = body.split('/').map(safeDecode);
  const verb = segments[0];

  switch (verb) {
    case 'beat': {
      const target = segments[1];
      if (!target) return null;
      return { kind: 'beat', target };
    }
    case 'variable': {
      const name = segments[1];
      const value = segments.slice(2).join('/'); // values may contain slashes
      if (!name) return null;
      return { kind: 'variable', name, value: value ?? '' };
    }
    case 'inventory': {
      const op = segments[1];
      const item = segments[2];
      if ((op !== 'add' && op !== 'remove') || !item) return null;
      return { kind: 'inventory', op, item };
    }
    case 'event': {
      const name = segments[1];
      if (!name) return null;
      return { kind: 'event', name };
    }
    default:
      return null;
  }
}

/**
 * Encode an ASAPS action back into a `asaps://` URI. Inverse of
 * parseAsapsUri. Useful for the editor's "Generate QR" panel.
 */
export function formatAsapsUri(action: AsapsAction): string {
  switch (action.kind) {
    case 'beat':
      return `${SCHEME}beat/${encodeURIComponent(action.target)}`;
    case 'variable':
      return `${SCHEME}variable/${encodeURIComponent(action.name)}/${encodeURIComponent(action.value)}`;
    case 'inventory':
      return `${SCHEME}inventory/${action.op}/${encodeURIComponent(action.item)}`;
    case 'event':
      return `${SCHEME}event/${encodeURIComponent(action.name)}`;
  }
}

function safeDecode(s: string): string {
  try { return decodeURIComponent(s); }
  catch { return s; }
}
