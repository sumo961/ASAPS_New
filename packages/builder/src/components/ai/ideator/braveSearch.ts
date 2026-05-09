/**
 * Brave Search API client (browser side).
 *
 * Posts the query through the same-origin proxy route — the API key never
 * lands in a URL or in browser history. Returns a small array of normalized
 * results that's easy to feed back to Claude as tool_result content.
 */

export interface BraveSearchResult {
  title: string;
  url: string;
  description: string;
}

export interface BraveSearchOptions {
  count?: number;
}

interface BraveApiWebResult {
  title?: string;
  url?: string;
  description?: string;
}

interface BraveApiResponse {
  web?: { results?: BraveApiWebResult[] };
  error?: string;
  message?: string;
}

/**
 * Resolve the proxy URL the same way ClaudeProvider does — prefer the
 * same-origin route (Vite dev plugin on any port, or a co-served prod
 * proxy) and only fall back to the standalone proxy on port 3001 when
 * there is no usable origin (file:// in Electron, or SSR).
 */
function resolveBraveProxyEndpoint(): string {
  if (typeof window === 'undefined') return 'http://localhost:3001/api/search/brave';
  return window.location?.protocol !== 'file:'
    ? '/api/search/brave'
    : 'http://localhost:3001/api/search/brave';
}

export async function braveSearch(
  apiKey: string,
  query: string,
  opts: BraveSearchOptions = {}
): Promise<BraveSearchResult[]> {
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error('Brave API key is not configured');
  }
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    throw new Error('Search query is empty');
  }

  const endpoint = resolveBraveProxyEndpoint();
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey: apiKey.trim(),
      query: trimmed,
      count: opts.count ?? 5,
    }),
  });

  if (!response.ok) {
    let detail = '';
    try {
      const body = (await response.json()) as { error?: string; message?: string };
      detail = body.message || body.error || '';
    } catch {
      /* ignore parse errors — surface the status alone */
    }
    throw new Error(
      `Brave search failed (${response.status})${detail ? `: ${detail}` : ''}`
    );
  }

  const data = (await response.json()) as BraveApiResponse;
  const raw = data.web?.results ?? [];
  return raw
    .filter(r => r.title && r.url)
    .map(r => ({
      title: String(r.title ?? ''),
      url: String(r.url ?? ''),
      description: stripHtml(String(r.description ?? '')),
    }));
}

/**
 * Brave returns descriptions with light HTML highlighting (<strong> tags
 * around matched terms). Strip them so the snippet reads cleanly when fed
 * back to Claude as tool_result content.
 */
function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '').trim();
}

/**
 * Render results as a compact text block suitable for a Claude tool_result.
 * Format: numbered list of "Title — URL\nDescription".
 */
export function formatBraveResultsForLLM(results: BraveSearchResult[]): string {
  if (results.length === 0) return 'No results found.';
  return results
    .map(
      (r, i) =>
        `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.description}`
    )
    .join('\n\n');
}
