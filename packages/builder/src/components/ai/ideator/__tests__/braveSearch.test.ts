/**
 * Tests for braveSearch — the browser-side Brave Search client used
 * by the Ideator's web_search tool. The API key never lands in URLs
 * (proxy-routed) so the request shape is load-bearing.
 *
 * Coverage focus:
 *   - input validation: empty/whitespace api key + query throw
 *   - POSTs JSON body to the proxy endpoint with apiKey, query,
 *     count (default 5); trims both apiKey and query
 *   - normalizes BraveApiResponse → BraveSearchResult[]:
 *     filters entries missing title or url; strips <strong>
 *     highlighting from descriptions
 *   - HTTP error path: surfaces status + body.message/error,
 *     gracefully handles non-JSON error body
 *   - formatBraveResultsForLLM compact format with empty-results
 *     fallback
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { braveSearch, formatBraveResultsForLLM } from '../braveSearch';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Mock window.location + fetch in one go. */
function setupFetch(response: {
  ok?: boolean;
  status?: number;
  json: () => Promise<unknown>;
}) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: response.ok ?? true,
    status: response.status ?? 200,
    json: response.json,
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('window', { location: { protocol: 'https:' } });
  return fetchMock;
}

describe('braveSearch', () => {
  describe('input validation', () => {
    it('throws when apiKey is empty', async () => {
      await expect(braveSearch('', 'q')).rejects.toThrow(/api key.*not configured/i);
    });

    it('throws when apiKey is whitespace only', async () => {
      // Author may have a leading space in their settings input —
      // surface as "not configured" rather than as a confusing
      // Brave 401 from the proxy.
      await expect(braveSearch('   ', 'q')).rejects.toThrow(/api key.*not configured/i);
    });

    it('throws when query is empty', async () => {
      await expect(braveSearch('key', '')).rejects.toThrow(/empty/i);
    });

    it('throws when query is whitespace only', async () => {
      await expect(braveSearch('key', '   ')).rejects.toThrow(/empty/i);
    });
  });

  describe('request shape', () => {
    it('POSTs to the same-origin /api/search/brave proxy endpoint', async () => {
      const fetchMock = setupFetch({ json: async () => ({ web: { results: [] } }) });
      await braveSearch('k', 'q');
      expect(fetchMock).toHaveBeenCalledOnce();
      const [endpoint, init] = fetchMock.mock.calls[0];
      expect(endpoint).toBe('/api/search/brave');
      expect(init.method).toBe('POST');
      expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' });
    });

    it('falls back to localhost:3001 endpoint on file:// origins (Electron)', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true, status: 200,
        json: async () => ({ web: { results: [] } }),
      });
      vi.stubGlobal('fetch', fetchMock);
      vi.stubGlobal('window', { location: { protocol: 'file:' } });
      await braveSearch('k', 'q');
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/search/brave',
        expect.any(Object),
      );
    });

    it('falls back to localhost:3001 when there is no window (SSR)', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true, status: 200,
        json: async () => ({ web: { results: [] } }),
      });
      vi.stubGlobal('fetch', fetchMock);
      vi.stubGlobal('window', undefined);
      await braveSearch('k', 'q');
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/search/brave',
        expect.any(Object),
      );
    });

    it('body includes apiKey + query + default count=5', async () => {
      const fetchMock = setupFetch({ json: async () => ({ web: { results: [] } }) });
      await braveSearch('mykey', 'climate change');
      const [, init] = fetchMock.mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body).toEqual({ apiKey: 'mykey', query: 'climate change', count: 5 });
    });

    it('respects custom count', async () => {
      const fetchMock = setupFetch({ json: async () => ({ web: { results: [] } }) });
      await braveSearch('k', 'q', { count: 10 });
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.count).toBe(10);
    });

    it('trims whitespace from apiKey and query in the body', async () => {
      const fetchMock = setupFetch({ json: async () => ({ web: { results: [] } }) });
      await braveSearch('  k  ', '  q  ');
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.apiKey).toBe('k');
      expect(body.query).toBe('q');
    });
  });

  describe('result normalization', () => {
    it('returns title/url/description for each valid result', async () => {
      setupFetch({ json: async () => ({
        web: { results: [
          { title: 'A', url: 'https://a.com', description: 'desc-a' },
          { title: 'B', url: 'https://b.com', description: 'desc-b' },
        ] },
      }) });
      const results = await braveSearch('k', 'q');
      expect(results).toEqual([
        { title: 'A', url: 'https://a.com', description: 'desc-a' },
        { title: 'B', url: 'https://b.com', description: 'desc-b' },
      ]);
    });

    it('filters out entries missing title', async () => {
      // Critical contract: the LLM tool_result format assumes title
      // is non-empty. A missing title would produce "1. \n  https://..."
      // in formatBraveResultsForLLM — confusing for the model.
      setupFetch({ json: async () => ({
        web: { results: [
          { title: 'A', url: 'https://a.com', description: '' },
          { url: 'https://noTitle.com', description: '' },
          { title: '', url: 'https://emptyTitle.com', description: '' },
        ] },
      }) });
      const results = await braveSearch('k', 'q');
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('A');
    });

    it('filters out entries missing url', async () => {
      setupFetch({ json: async () => ({
        web: { results: [
          { title: 'A', url: 'https://a.com' },
          { title: 'NoUrl' },
          { title: 'EmptyUrl', url: '' },
        ] },
      }) });
      const results = await braveSearch('k', 'q');
      expect(results).toHaveLength(1);
    });

    it('strips <strong> HTML highlighting from descriptions', async () => {
      // Brave returns descriptions with light HTML highlighting
      // around matched terms; strip so the snippet reads cleanly
      // when fed back as tool_result.
      setupFetch({ json: async () => ({
        web: { results: [
          { title: 'A', url: 'https://a.com',
            description: 'Climate <strong>change</strong> impacts <em>everything</em>.' },
        ] },
      }) });
      const results = await braveSearch('k', 'q');
      expect(results[0].description).toBe('Climate change impacts everything.');
    });

    it('returns empty array when API returns no web results', async () => {
      setupFetch({ json: async () => ({}) });
      const results = await braveSearch('k', 'q');
      expect(results).toEqual([]);
    });
  });

  describe('error path', () => {
    it('throws with status + body.message on HTTP error', async () => {
      setupFetch({
        ok: false,
        status: 401,
        json: async () => ({ message: 'Invalid API key' }),
      });
      await expect(braveSearch('k', 'q'))
        .rejects.toThrow(/Brave search failed.*401.*Invalid API key/);
    });

    it('throws with status alone when body is not JSON', async () => {
      // Defensive — if proxy returns plain text, surface the
      // status code; don't bury it in a confusing parse error.
      setupFetch({
        ok: false,
        status: 502,
        json: async () => { throw new Error('Unexpected token'); },
      });
      await expect(braveSearch('k', 'q'))
        .rejects.toThrow(/Brave search failed.*502/);
    });

    it('falls back to error field when message is missing', async () => {
      setupFetch({
        ok: false,
        status: 429,
        json: async () => ({ error: 'Rate limited' }),
      });
      await expect(braveSearch('k', 'q'))
        .rejects.toThrow(/Rate limited/);
    });
  });
});

describe('formatBraveResultsForLLM', () => {
  it('returns the placeholder when there are no results', () => {
    expect(formatBraveResultsForLLM([])).toBe('No results found.');
  });

  it('formats as a numbered list "title — url\\n   description"', () => {
    const out = formatBraveResultsForLLM([
      { title: 'A', url: 'https://a.com', description: 'About A' },
      { title: 'B', url: 'https://b.com', description: 'About B' },
    ]);
    // Numbered (1., 2.) with the title.
    expect(out).toContain('1. A');
    expect(out).toContain('2. B');
    expect(out).toContain('https://a.com');
    expect(out).toContain('About A');
  });

  it('separates entries with blank lines', () => {
    const out = formatBraveResultsForLLM([
      { title: 'A', url: 'https://a.com', description: 'a' },
      { title: 'B', url: 'https://b.com', description: 'b' },
    ]);
    // Double-newline between entries so the LLM reads them as
    // discrete results, not one long paragraph.
    expect(out).toContain('\n\n');
  });
});
