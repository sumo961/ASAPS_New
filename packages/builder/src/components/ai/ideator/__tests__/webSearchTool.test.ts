/**
 * Tests for webSearchTool — Anthropic tool spec + executor that
 * bridges Claude's tool_use blocks to braveSearch. The executor
 * MUST never throw (Anthropic SDK expects a tool_result on success
 * AND on failure; an unhandled rejection breaks the turn).
 *
 * Coverage focus:
 *   - webSearchToolSpec shape (Anthropic API contract: name,
 *     description, input_schema with type/properties/required)
 *   - input schema constraints (query required, count 1..10)
 *   - executor name constant matches the spec
 *   - executor returns tool_result-shaped object on success +
 *     on validation failure + on braveSearch throw (NEVER throws
 *     to caller)
 *   - missing query produces "Tool error: missing query" message
 *   - braveSearch failure surfaces error.message into the text
 *     field so Claude sees what went wrong
 *   - count defaults to 5; passes through user-provided count
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  WEB_SEARCH_TOOL_NAME,
  webSearchToolSpec,
  buildWebSearchExecutor,
} from '../webSearchTool';
import * as braveSearchModule from '../braveSearch';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('WEB_SEARCH_TOOL_NAME', () => {
  it('is "web_search" (the canonical Anthropic-tool name)', () => {
    // The tool name is the join key between the spec and the
    // executor; changing it desyncs every existing system
    // prompt that references it by name.
    expect(WEB_SEARCH_TOOL_NAME).toBe('web_search');
  });
});

describe('webSearchToolSpec', () => {
  it('uses the canonical tool name', () => {
    expect(webSearchToolSpec.name).toBe(WEB_SEARCH_TOOL_NAME);
  });

  it('has a non-empty description (Claude uses it for tool selection)', () => {
    // A blank or trivial description makes Claude pick the
    // wrong tool. Pin a non-trivial length.
    expect(webSearchToolSpec.description.length).toBeGreaterThan(80);
  });

  describe('input_schema', () => {
    it('is type:"object" (Anthropic tool schema contract)', () => {
      expect(webSearchToolSpec.input_schema.type).toBe('object');
    });

    it('marks query as required', () => {
      expect(webSearchToolSpec.input_schema.required).toContain('query');
    });

    it('has a string query property with a description', () => {
      const q = webSearchToolSpec.input_schema.properties.query;
      expect(q.type).toBe('string');
      expect(q.description.length).toBeGreaterThan(0);
    });

    it('count is integer, optional, with min 1 / max 10', () => {
      // Bounds matter — Brave's API charges per result, and the
      // tool description promises 1..10.
      const c = webSearchToolSpec.input_schema.properties.count;
      expect(c.type).toBe('integer');
      expect(c.minimum).toBe(1);
      expect(c.maximum).toBe(10);
      expect(webSearchToolSpec.input_schema.required).not.toContain('count');
    });
  });
});

describe('buildWebSearchExecutor', () => {
  it('returns a function (executor closure)', () => {
    const exec = buildWebSearchExecutor('test-key');
    expect(typeof exec).toBe('function');
  });

  describe('happy path', () => {
    it('calls braveSearch with the api key + query + count', async () => {
      const spy = vi.spyOn(braveSearchModule, 'braveSearch')
        .mockResolvedValue([
          { title: 'A', url: 'https://a.com', description: 'about A' },
        ]);
      const exec = buildWebSearchExecutor('test-key');
      await exec({ query: 'climate', count: 3 });
      expect(spy).toHaveBeenCalledWith('test-key', 'climate', { count: 3 });
    });

    it('returns the expected tool_result shape', async () => {
      vi.spyOn(braveSearchModule, 'braveSearch').mockResolvedValue([
        { title: 'A', url: 'https://a.com', description: 'about A' },
        { title: 'B', url: 'https://b.com', description: 'about B' },
      ]);
      const exec = buildWebSearchExecutor('k');
      const result = await exec({ query: 'climate' });
      expect(result.query).toBe('climate');
      expect(result.resultCount).toBe(2);
      // text is the LLM-formatted block; pin shape (numbered).
      expect(result.text).toContain('1.');
      expect(result.text).toContain('2.');
    });

    it('defaults count to 5 when not provided', async () => {
      const spy = vi.spyOn(braveSearchModule, 'braveSearch').mockResolvedValue([]);
      const exec = buildWebSearchExecutor('k');
      await exec({ query: 'x' });
      expect(spy).toHaveBeenCalledWith('k', 'x', { count: 5 });
    });

    it('ignores non-numeric count (defaults to 5)', async () => {
      // Defensive — Claude could in theory emit a string count.
      // The type-check in the executor falls back to 5 rather
      // than passing junk down to Brave.
      const spy = vi.spyOn(braveSearchModule, 'braveSearch').mockResolvedValue([]);
      const exec = buildWebSearchExecutor('k');
      await exec({ query: 'x', count: 'lots' as any });
      expect(spy).toHaveBeenCalledWith('k', 'x', { count: 5 });
    });

    it('trims whitespace from the query', async () => {
      const spy = vi.spyOn(braveSearchModule, 'braveSearch').mockResolvedValue([]);
      const exec = buildWebSearchExecutor('k');
      await exec({ query: '  climate  ' });
      expect(spy).toHaveBeenCalledWith('k', 'climate', { count: 5 });
    });
  });

  describe('error paths', () => {
    it('returns "Tool error: missing query" when query is empty', async () => {
      // Validation MUST happen before reaching Brave. An empty
      // query would otherwise throw inside braveSearch with a
      // less-helpful message.
      const exec = buildWebSearchExecutor('k');
      const result = await exec({ query: '' });
      expect(result.resultCount).toBe(0);
      expect(result.text).toMatch(/Tool error: missing query/);
    });

    it('returns "Tool error: missing query" when query is missing entirely', async () => {
      const exec = buildWebSearchExecutor('k');
      const result = await exec({});
      expect(result.text).toMatch(/Tool error: missing query/);
    });

    it('returns "Tool error: missing query" when query is whitespace only', async () => {
      const exec = buildWebSearchExecutor('k');
      const result = await exec({ query: '   ' });
      expect(result.text).toMatch(/Tool error: missing query/);
    });

    it('returns a tool_result (does NOT throw) when braveSearch throws', async () => {
      // Critical contract: the Anthropic SDK expects a tool_result
      // for every tool_use. An unhandled rejection breaks the
      // entire turn — the assistant never sees the failure and
      // can't recover. Pin "never throws to caller".
      vi.spyOn(braveSearchModule, 'braveSearch')
        .mockRejectedValue(new Error('Brave search failed (401): bad key'));
      const exec = buildWebSearchExecutor('k');
      // Should NOT reject; should resolve with an error message.
      const result = await exec({ query: 'x' });
      expect(result.resultCount).toBe(0);
      expect(result.text).toContain('Tool error:');
      expect(result.text).toContain('Brave search failed');
    });

    it('preserves the original error message verbatim in the text field', async () => {
      // The Ideator system prompt instructs Claude to surface
      // actual error messages verbatim (the "error honesty"
      // policy). The executor must NOT paraphrase.
      vi.spyOn(braveSearchModule, 'braveSearch')
        .mockRejectedValue(new Error('Rate limited — retry in 60s'));
      const exec = buildWebSearchExecutor('k');
      const result = await exec({ query: 'x' });
      expect(result.text).toContain('Rate limited — retry in 60s');
    });

    it('handles non-Error throw values (string, plain object)', async () => {
      vi.spyOn(braveSearchModule, 'braveSearch')
        .mockRejectedValue('something broke');
      const exec = buildWebSearchExecutor('k');
      const result = await exec({ query: 'x' });
      expect(result.text).toContain('something broke');
    });

    it('still records the query string when the search fails', async () => {
      // UI surfaces "Web search: \"<query>\" (0 results)" — needs
      // the query in the response shape regardless of outcome.
      vi.spyOn(braveSearchModule, 'braveSearch')
        .mockRejectedValue(new Error('boom'));
      const exec = buildWebSearchExecutor('k');
      const result = await exec({ query: 'climate' });
      expect(result.query).toBe('climate');
    });
  });
});
