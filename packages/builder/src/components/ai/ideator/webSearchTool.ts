/**
 * Anthropic tool spec for the Ideator web_search tool, plus its executor.
 *
 * The tool spec is what we send to Claude in the `tools` array. The executor
 * is bound to the user's saved Brave API key and runs in the browser when
 * Claude returns a tool_use block referencing this tool.
 */

import { braveSearch, formatBraveResultsForLLM } from './braveSearch';

export const WEB_SEARCH_TOOL_NAME = 'web_search';

export interface WebSearchToolInput {
  query: string;
  count?: number;
}

export interface WebSearchToolResult {
  /** Number of result rows returned by Brave. */
  resultCount: number;
  /** Pre-formatted text block we hand to Claude as tool_result content. */
  text: string;
  /** Raw query used (echoed for UI display). */
  query: string;
}

/** Anthropic-format tool spec describing the tool and its input schema. */
export const webSearchToolSpec = {
  name: WEB_SEARCH_TOOL_NAME,
  description:
    "Search the web with Brave Search to bring in real-world context " +
    "about the issue or theme the author is discussing. Use when you " +
    "want recent facts, examples, statistics, news, or stakeholder " +
    "perspectives that would deepen the conversation. Do NOT use for " +
    "trivia or to fetch story plots — only when external context would " +
    "genuinely help the author articulate a complex issue.",
  input_schema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'Plain-English search query, 3–10 words.',
      },
      count: {
        type: 'integer',
        description: 'Number of results to return (1–10). Default 5.',
        minimum: 1,
        maximum: 10,
      },
    },
    required: ['query'],
  },
};

/**
 * Build an executor closure that runs the search using the configured
 * Brave API key. The returned function accepts the loosely-typed input
 * Claude's tool_use block carries (Record<string, unknown>) and validates
 * shape internally.
 */
export function buildWebSearchExecutor(braveApiKey: string) {
  return async function executeWebSearch(
    input: Record<string, unknown>
  ): Promise<WebSearchToolResult> {
    const query = String((input?.query as string | undefined) ?? '').trim();
    const count =
      typeof input?.count === 'number' ? (input.count as number) : 5;
    if (!query) {
      return {
        query: '',
        resultCount: 0,
        text: 'Tool error: missing query parameter.',
      };
    }
    try {
      const results = await braveSearch(braveApiKey, query, { count });
      return {
        query,
        resultCount: results.length,
        text: formatBraveResultsForLLM(results),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        query,
        resultCount: 0,
        text: `Tool error: ${msg}`,
      };
    }
  };
}
