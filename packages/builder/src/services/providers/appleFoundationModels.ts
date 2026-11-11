/**
 * Apple's Foundation Models through `fm serve` (macOS 27): a local Chat
 * Completions server whose models are named `system` (on the Mac) and `pcc`
 * (Private Cloud Compute).
 *
 * `fm serve` refuses every request a browser marks as coming from another
 * site — `Sec-Fetch-Site: same-site` or `cross-site` — with 403 "Cross-site
 * requests are not allowed". A page on localhost:5173 (or the desktop app's
 * own page) calling localhost:1976 is same-site, so the builder can't call it
 * directly as it does Ollama. Its calls go through the builder's own relay
 * (the Vite dev proxy, or the desktop app's API server), which sends no such
 * header.
 */
export const APPLE_FM_MODELS = ['system', 'pcc'] as const;

/** A local base URL serving one of Apple's models: `fm serve`. */
export function isAppleFmServe(baseUrl: string | undefined, ...models: Array<string | undefined>): boolean {
  if (!baseUrl) return false;
  let host: string;
  try {
    host = new URL(baseUrl).hostname;
  } catch {
    return false;
  }
  if (host !== 'localhost' && host !== '127.0.0.1' && host !== '[::1]') return false;
  return models.some((m) => !!m && (APPLE_FM_MODELS as readonly string[]).includes(m.trim().toLowerCase()));
}
