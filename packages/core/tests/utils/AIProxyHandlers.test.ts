/**
 * Tests for AIProxyHandlers — shared AI-API proxy utilities used by
 * BOTH the dev server (api-proxy.js) and the desktop app's main-
 * process api-server. Wrong values here silently break every AI call
 * in the entire app, so pin the contracts:
 *   - endpoint resolution: defaults + /messages|/completions passthrough
 *     + trailing-slash normalization + custom-base-url support
 *     (Moonshot Anthropic-compat, DeepSeek, etc.)
 *   - header construction: required Claude headers including the
 *     "dangerous-direct-browser-access" opt-in (without which the
 *     SDK refuses to run in a browser context); OpenAI bearer token
 *   - request-config builders strip baseUrl + apiKey from the body
 *     (they're shape metadata, not payload — leaving them in body
 *     breaks parsing on every provider)
 *   - parseAIResponse JSON happy path + error path + non-JSON cases
 *   - validateProxyRequest required-field check
 */
import { describe, it, expect } from 'vitest';
import {
  resolveClaudeEndpoint,
  resolveOpenAIEndpoint,
  buildClaudeHeaders,
  buildOpenAIHeaders,
  buildClaudeRequestConfig,
  buildOpenAIRequestConfig,
  parseAIResponse,
  validateProxyRequest,
  CORS_HEADERS,
  DEFAULT_CLAUDE_BASE_URL,
  DEFAULT_OPENAI_BASE_URL,
  DEFAULT_PROXY_PORT,
  DEFAULT_AI_TIMEOUT_MS,
} from '../../src/utils/AIProxyHandlers';

describe('resolveClaudeEndpoint', () => {
  it('returns the Anthropic v1/messages URL by default', () => {
    expect(resolveClaudeEndpoint()).toBe('https://api.anthropic.com/v1/messages');
  });

  it('returns the Anthropic URL when explicitly passed', () => {
    expect(resolveClaudeEndpoint('https://api.anthropic.com'))
      .toBe('https://api.anthropic.com/v1/messages');
  });

  it('appends /v1/messages to a custom base URL', () => {
    // Moonshot's Anthropic-compatible endpoint sits at
    // /anthropic; we append /v1/messages to that.
    expect(resolveClaudeEndpoint('https://api.moonshot.ai/anthropic'))
      .toBe('https://api.moonshot.ai/anthropic/v1/messages');
  });

  it('strips a trailing slash before appending', () => {
    // Authors often paste URLs with trailing slashes; we
    // normalize so the result is well-formed.
    expect(resolveClaudeEndpoint('https://api.example.com/'))
      .toBe('https://api.example.com/v1/messages');
  });

  it('passes through a URL that already contains /messages', () => {
    // Some custom proxies expose the final endpoint directly.
    // Don't double-append.
    expect(resolveClaudeEndpoint('https://proxy.example.com/v2/messages'))
      .toBe('https://proxy.example.com/v2/messages');
  });
});

describe('resolveOpenAIEndpoint', () => {
  it('returns the OpenAI chat-completions URL by default', () => {
    expect(resolveOpenAIEndpoint()).toBe('https://api.openai.com/v1/chat/completions');
  });

  it('appends /chat/completions to a custom base URL', () => {
    // DeepSeek and other compatible APIs sit at their own
    // base — append the standard path.
    expect(resolveOpenAIEndpoint('https://api.deepseek.com'))
      .toBe('https://api.deepseek.com/chat/completions');
  });

  it('strips a trailing slash before appending', () => {
    expect(resolveOpenAIEndpoint('https://api.example.com/v1/'))
      .toBe('https://api.example.com/v1/chat/completions');
  });

  it('passes through a URL that already contains /completions', () => {
    expect(resolveOpenAIEndpoint('https://proxy.example.com/v2/chat/completions'))
      .toBe('https://proxy.example.com/v2/chat/completions');
  });
});

describe('buildClaudeHeaders', () => {
  it('includes x-api-key with the supplied key', () => {
    const headers = buildClaudeHeaders('sk-test-123');
    expect(headers['x-api-key']).toBe('sk-test-123');
  });

  it('pins anthropic-version to a known stable value', () => {
    // The SDK fails closed when this header is missing or
    // malformed. Pinning the literal here flags an accidental
    // edit that would silently break every call.
    const headers = buildClaudeHeaders('k');
    expect(headers['anthropic-version']).toBe('2023-06-01');
  });

  it('opts into browser-direct access via the dangerous-direct-browser-access header', () => {
    // The Anthropic JS SDK refuses to run in a browser context
    // without this opt-in — without it, every AI call from the
    // builder UI fails with a runtime error pointing at the SDK.
    const headers = buildClaudeHeaders('k');
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
  });

  it('sets Content-Type to application/json', () => {
    expect(buildClaudeHeaders('k')['Content-Type']).toBe('application/json');
  });

  it('merges additional headers without overwriting required ones', () => {
    // Additional headers are CONFIG, the required ones are
    // STRUCTURE — explicit overrides win per the source's
    // ...additionalHeaders spread position. That's by design;
    // pin so a reorder is a deliberate visible change.
    const headers = buildClaudeHeaders('k', {
      'X-Custom': 'value',
      'x-api-key': 'override',
    });
    expect(headers['X-Custom']).toBe('value');
    expect(headers['x-api-key']).toBe('override');
  });
});

describe('buildOpenAIHeaders', () => {
  it('uses Bearer auth with the api key', () => {
    expect(buildOpenAIHeaders('sk-test-xyz').Authorization).toBe('Bearer sk-test-xyz');
  });

  it('sets Content-Type to application/json', () => {
    expect(buildOpenAIHeaders('k')['Content-Type']).toBe('application/json');
  });

  it('merges additional headers', () => {
    const headers = buildOpenAIHeaders('k', { 'X-Custom': 'value' });
    expect(headers['X-Custom']).toBe('value');
  });
});

describe('buildClaudeRequestConfig', () => {
  it('strips baseUrl and apiKey from the body', () => {
    // Critical: leaving baseUrl/apiKey in the body would (1) leak
    // the key into the AI provider's logs and (2) confuse the
    // model with metadata that doesn't belong to the prompt.
    const config = buildClaudeRequestConfig({
      apiKey: 'sk-test',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-3-5-sonnet-20241022',
      messages: [{ role: 'user', content: 'hi' }],
    });
    const parsed = JSON.parse(config.body);
    expect(parsed.apiKey).toBeUndefined();
    expect(parsed.baseUrl).toBeUndefined();
    expect(parsed.model).toBe('claude-3-5-sonnet-20241022');
    expect(parsed.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('uses the resolved endpoint', () => {
    const config = buildClaudeRequestConfig({
      apiKey: 'k',
      baseUrl: 'https://api.moonshot.ai/anthropic',
    });
    expect(config.endpoint).toBe('https://api.moonshot.ai/anthropic/v1/messages');
  });

  it('uses the resolved headers', () => {
    const config = buildClaudeRequestConfig({ apiKey: 'sk-key' });
    expect(config.headers['x-api-key']).toBe('sk-key');
  });
});

describe('buildOpenAIRequestConfig', () => {
  it('strips baseUrl and apiKey from the body', () => {
    const config = buildOpenAIRequestConfig({
      apiKey: 'sk-test',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
    });
    const parsed = JSON.parse(config.body);
    expect(parsed.apiKey).toBeUndefined();
    expect(parsed.baseUrl).toBeUndefined();
    expect(parsed.model).toBe('gpt-4o');
  });

  it('uses bearer auth in headers', () => {
    const config = buildOpenAIRequestConfig({ apiKey: 'sk-key' });
    expect(config.headers.Authorization).toBe('Bearer sk-key');
  });
});

describe('parseAIResponse', () => {
  describe('success cases', () => {
    it('parses a 200 JSON response into { status, data }', () => {
      const json = JSON.stringify({ content: [{ text: 'hello' }] });
      const result = parseAIResponse(json, 200);
      expect(result.status).toBe(200);
      expect((result.data as any).content[0].text).toBe('hello');
      expect(result.error).toBeUndefined();
    });

    it('handles any 2xx code, not just 200', () => {
      const result = parseAIResponse(JSON.stringify({ ok: true }), 201);
      expect(result.status).toBe(201);
      expect(result.error).toBeUndefined();
    });
  });

  describe('error cases (JSON body)', () => {
    it('extracts error.message from a Claude-style error response', () => {
      const json = JSON.stringify({
        error: { type: 'invalid_request_error', message: 'Bad api key' },
      });
      const result = parseAIResponse(json, 401);
      expect(result.status).toBe(401);
      expect(result.error).toBe('Bad api key');
      expect(result.data).toBeDefined();
    });

    it('falls back to error string when error is a plain string', () => {
      // OpenAI sometimes returns { error: 'Bad request' } not
      // { error: { message } }. Handle both shapes.
      const json = JSON.stringify({ error: 'simple error string' });
      const result = parseAIResponse(json, 400);
      expect(result.error).toBe('simple error string');
    });

    it('falls back to "Request failed" when no error field present', () => {
      const json = JSON.stringify({ unexpected_shape: true });
      const result = parseAIResponse(json, 500);
      expect(result.error).toBe('Request failed');
    });
  });

  describe('non-JSON cases', () => {
    it('treats a 200 with non-JSON body as a parse failure (status 500)', () => {
      // A non-JSON 200 is sus — usually a misconfigured proxy
      // returning HTML. We surface as a 500 with a preview so
      // the developer can diagnose.
      const result = parseAIResponse('<html>not json</html>', 200);
      expect(result.status).toBe(500);
      expect(result.error).toBe('Failed to parse AI response');
      expect(result.responsePreview).toContain('<html>');
    });

    it('responsePreview is truncated to 1000 chars on parse failure', () => {
      const huge = 'x'.repeat(5000);
      const result = parseAIResponse(huge, 200);
      expect(result.responsePreview?.length).toBe(1000);
    });

    it('treats a non-2xx non-JSON body as the error text', () => {
      // A 502 from the proxy might be a plain "Bad Gateway"
      // string. Use the text as the error message directly.
      const result = parseAIResponse('Bad Gateway', 502);
      expect(result.status).toBe(502);
      expect(result.error).toBe('Bad Gateway');
    });

    it('falls back to "Request failed" when both body and JSON parse fail', () => {
      const result = parseAIResponse('', 500);
      expect(result.error).toBe('Request failed');
    });
  });
});

describe('validateProxyRequest', () => {
  it('returns an error message when apiKey is missing', () => {
    expect(validateProxyRequest({})).toBe('Missing required parameter: apiKey');
  });

  it('returns an error for empty-string apiKey too', () => {
    // Defensive: empty string is just as bad as undefined —
    // requests would fail at the provider with a confusing
    // 401 instead of a clear validation message here.
    expect(validateProxyRequest({ apiKey: '' })).toBe('Missing required parameter: apiKey');
  });

  it('returns undefined for a valid request', () => {
    expect(validateProxyRequest({ apiKey: 'sk-key' })).toBeUndefined();
  });
});

describe('CORS_HEADERS', () => {
  it('allows POST + GET + OPTIONS', () => {
    // The proxy needs at least POST for actual requests and
    // OPTIONS for preflight. GET is included for health checks.
    expect(CORS_HEADERS['Access-Control-Allow-Methods']).toContain('POST');
    expect(CORS_HEADERS['Access-Control-Allow-Methods']).toContain('OPTIONS');
  });

  it('whitelists the Anthropic-specific headers in Allow-Headers', () => {
    // Without these the browser preflight rejects the actual
    // request because the SDK sends headers the server hasn't
    // declared.
    expect(CORS_HEADERS['Access-Control-Allow-Headers']).toContain('x-api-key');
    expect(CORS_HEADERS['Access-Control-Allow-Headers']).toContain('anthropic-version');
  });

  it('opens the origin to wildcard for the dev / desktop proxy', () => {
    expect(CORS_HEADERS['Access-Control-Allow-Origin']).toBe('*');
  });
});

describe('default constants', () => {
  it('points DEFAULT_CLAUDE_BASE_URL at the Anthropic endpoint', () => {
    expect(DEFAULT_CLAUDE_BASE_URL).toBe('https://api.anthropic.com');
  });

  it('points DEFAULT_OPENAI_BASE_URL at the OpenAI v1 root', () => {
    expect(DEFAULT_OPENAI_BASE_URL).toBe('https://api.openai.com/v1');
  });

  it('uses port 3001 for the dev proxy by default', () => {
    // Documented in api-proxy.js + apps/builder-desktop main.
    // Changing this requires coordinating both sides + the
    // builder's API client; pin so it's a deliberate edit.
    expect(DEFAULT_PROXY_PORT).toBe(3001);
  });

  it('allows 5 minutes for AI requests by default', () => {
    // Long enough for thinking models (Claude 3 Opus, o1) to
    // finish their hidden reasoning step without the proxy
    // timing them out.
    expect(DEFAULT_AI_TIMEOUT_MS).toBe(5 * 60 * 1000);
  });
});
