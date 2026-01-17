/**
 * Shared AI Proxy Handlers
 *
 * Common logic for AI API proxying used by both:
 * - Development server (api-proxy.js)
 * - Desktop app (apps/builder-desktop/src/main/api-server.ts)
 *
 * These utilities handle endpoint resolution, header construction,
 * and response processing for various AI providers.
 */

// ============================================================================
// Types
// ============================================================================

export interface AIProxyRequest {
  baseUrl?: string;
  apiKey: string;
  [key: string]: unknown;
}

export interface AIProxyResponse {
  status: number;
  data?: unknown;
  error?: string;
  responsePreview?: string;
}

export interface ClaudeRequestConfig {
  endpoint: string;
  headers: Record<string, string>;
  body: string;
}

export interface OpenAIRequestConfig {
  endpoint: string;
  headers: Record<string, string>;
  body: string;
}

// ============================================================================
// Endpoint Resolution
// ============================================================================

/**
 * Resolve the Claude/Anthropic API endpoint URL.
 *
 * Handles various base URL formats including:
 * - Standard Anthropic: https://api.anthropic.com
 * - Moonshot Anthropic: https://api.moonshot.ai/anthropic
 * - Custom endpoints that already include /messages
 *
 * @param baseUrl - Optional base URL (defaults to Anthropic)
 * @returns Resolved endpoint URL for the messages API
 */
export function resolveClaudeEndpoint(baseUrl?: string): string {
  const effectiveBaseUrl = baseUrl || 'https://api.anthropic.com';

  // If the URL already includes /messages, use it as-is
  if (effectiveBaseUrl.includes('/messages')) {
    return effectiveBaseUrl;
  }

  // Remove trailing slash and append /v1/messages
  return `${effectiveBaseUrl.replace(/\/$/, '')}/v1/messages`;
}

/**
 * Resolve the OpenAI API endpoint URL.
 *
 * Handles various base URL formats including:
 * - Standard OpenAI: https://api.openai.com/v1
 * - Moonshot: https://api.moonshot.ai/v1
 * - DeepSeek: https://api.deepseek.com
 * - Custom endpoints that already include /completions
 *
 * @param baseUrl - Optional base URL (defaults to OpenAI)
 * @returns Resolved endpoint URL for chat completions
 */
export function resolveOpenAIEndpoint(baseUrl?: string): string {
  const effectiveBaseUrl = baseUrl || 'https://api.openai.com/v1';

  // If the URL already includes /completions, use it as-is
  if (effectiveBaseUrl.includes('/completions')) {
    return effectiveBaseUrl;
  }

  // Remove trailing slash and append /chat/completions
  return `${effectiveBaseUrl.replace(/\/$/, '')}/chat/completions`;
}

// ============================================================================
// Header Construction
// ============================================================================

/**
 * Build headers for Claude/Anthropic API requests.
 *
 * @param apiKey - The API key for authentication
 * @param additionalHeaders - Optional additional headers to include
 * @returns Headers object for the request
 */
export function buildClaudeHeaders(
  apiKey: string,
  additionalHeaders?: Record<string, string>
): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
    ...additionalHeaders,
  };
}

/**
 * Build headers for OpenAI API requests.
 *
 * @param apiKey - The API key for authentication
 * @param additionalHeaders - Optional additional headers to include
 * @returns Headers object for the request
 */
export function buildOpenAIHeaders(
  apiKey: string,
  additionalHeaders?: Record<string, string>
): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    ...additionalHeaders,
  };
}

// ============================================================================
// Request Configuration Builders
// ============================================================================

/**
 * Build complete request configuration for Claude API.
 *
 * @param request - The proxy request containing baseUrl, apiKey, and body
 * @returns Configuration object with endpoint, headers, and body
 */
export function buildClaudeRequestConfig(request: AIProxyRequest): ClaudeRequestConfig {
  const { baseUrl, apiKey, ...requestBody } = request;

  return {
    endpoint: resolveClaudeEndpoint(baseUrl),
    headers: buildClaudeHeaders(apiKey),
    body: JSON.stringify(requestBody),
  };
}

/**
 * Build complete request configuration for OpenAI API.
 *
 * @param request - The proxy request containing baseUrl, apiKey, and body
 * @returns Configuration object with endpoint, headers, and body
 */
export function buildOpenAIRequestConfig(request: AIProxyRequest): OpenAIRequestConfig {
  const { baseUrl, apiKey, ...requestBody } = request;

  return {
    endpoint: resolveOpenAIEndpoint(baseUrl),
    headers: buildOpenAIHeaders(apiKey),
    body: JSON.stringify(requestBody),
  };
}

// ============================================================================
// Response Processing
// ============================================================================

/**
 * Parse AI response text, handling both success and error cases.
 *
 * @param responseText - Raw response text from the API
 * @param statusCode - HTTP status code
 * @returns Parsed response object
 */
export function parseAIResponse(responseText: string, statusCode: number): AIProxyResponse {
  // Try to parse as JSON
  try {
    const data = JSON.parse(responseText);

    if (statusCode >= 200 && statusCode < 300) {
      return { status: statusCode, data };
    } else {
      // Error response - data might contain error details
      return {
        status: statusCode,
        error: data.error?.message || data.error || 'Request failed',
        data,
      };
    }
  } catch {
    // Non-JSON response
    if (statusCode >= 200 && statusCode < 300) {
      return {
        status: 500,
        error: 'Failed to parse AI response',
        responsePreview: responseText.substring(0, 1000),
      };
    } else {
      return {
        status: statusCode,
        error: responseText || 'Request failed',
      };
    }
  }
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate that required parameters are present in the request.
 *
 * @param request - The proxy request to validate
 * @returns Error message if validation fails, undefined if valid
 */
export function validateProxyRequest(request: Partial<AIProxyRequest>): string | undefined {
  if (!request.apiKey) {
    return 'Missing required parameter: apiKey';
  }
  return undefined;
}

// ============================================================================
// CORS Headers
// ============================================================================

/**
 * Standard CORS headers for API proxy responses.
 */
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, anthropic-version',
} as const;

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_CLAUDE_BASE_URL = 'https://api.anthropic.com';
export const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
export const DEFAULT_PROXY_PORT = 3001;

/**
 * Default timeout for AI requests (5 minutes for long-running models like thinking models)
 */
export const DEFAULT_AI_TIMEOUT_MS = 5 * 60 * 1000;
