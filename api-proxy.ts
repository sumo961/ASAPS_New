/**
 * Simple API proxy server to handle CORS for AI provider requests
 * Run with: npx tsx api-proxy.ts
 *
 * Uses shared AIProxyHandlers from @asaps/core for endpoint resolution
 * and header construction.
 */

import http from 'http';
import https from 'https';
import { URL, fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';
import { gunzipSync } from 'zlib';
import {
  resolveClaudeEndpoint,
  resolveOpenAIEndpoint,
  buildClaudeHeaders,
  buildOpenAIHeaders,
  CORS_HEADERS,
  DEFAULT_PROXY_PORT,
} from '@asaps/core';

const PORT = DEFAULT_PROXY_PORT;

// Parse JSON body from request
function parseBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString()));
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

// Make HTTP/HTTPS request
interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
}

interface ProxyResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

function makeRequest(
  targetUrl: string,
  options: RequestOptions,
  body?: string
): Promise<ProxyResponse> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;

    const reqOptions: http.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: options.method || 'POST',
      headers: options.headers || {},
    };

    const req = lib.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => (data += chunk.toString()));
      res.on('end', () => {
        resolve({
          status: res.statusCode || 500,
          headers: res.headers,
          body: data,
        });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  // CORS headers from shared module
  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const pathname = new URL(req.url || '', `http://localhost:${PORT}`).pathname;

  try {
    // OpenAI-compatible proxy (for Moonshot, DeepSeek, etc.)
    if (pathname === '/api/ai/openai') {
      const body = await parseBody(req);
      const { baseUrl, apiKey, ...requestBody } = body;

      // Use shared endpoint resolution
      const targetUrl = resolveOpenAIEndpoint(baseUrl as string | undefined);

      console.log(`[Proxy] OpenAI request to: ${targetUrl}`);

      // Use shared header construction
      const headers = buildOpenAIHeaders(apiKey as string);

      const response = await makeRequest(
        targetUrl,
        {
          method: 'POST',
          headers,
        },
        JSON.stringify(requestBody)
      );

      res.writeHead(response.status, { 'Content-Type': 'application/json' });
      res.end(response.body);
      return;
    }

    // Claude proxy
    if (pathname === '/api/ai/claude') {
      const body = await parseBody(req);
      const { baseUrl, apiKey, ...requestBody } = body;

      // Use shared endpoint resolution (handles Moonshot /anthropic case)
      const targetUrl = resolveClaudeEndpoint(baseUrl as string | undefined);

      console.log(`[Proxy] Claude request to: ${targetUrl}`);

      // Use shared header construction
      const headers = buildClaudeHeaders(apiKey as string);

      const response = await makeRequest(
        targetUrl,
        {
          method: 'POST',
          headers,
        },
        JSON.stringify(requestBody)
      );

      res.writeHead(response.status, { 'Content-Type': 'application/json' });
      res.end(response.body);
      return;
    }

    // Brave Search proxy (used by Ideator's web_search tool).
    // Brave does not enable CORS, so the browser cannot call it directly —
    // the apiKey travels in the JSON body, never in the URL or in logs.
    if (pathname === '/api/search/brave') {
      const body = await parseBody(req);
      const apiKey = body.apiKey as string | undefined;
      const query = body.query as string | undefined;
      const count = (body.count as number | undefined) ?? 5;

      if (!apiKey) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing required parameter: apiKey' }));
        return;
      }
      if (!query) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing required parameter: query' }));
        return;
      }

      const params = new URLSearchParams({
        q: query,
        count: String(Math.max(1, Math.min(20, count))),
      });
      const targetUrl = `https://api.search.brave.com/res/v1/web/search?${params}`;

      console.log(`[Proxy] Brave search request: "${query}" (count=${count})`);

      // Binary-safe path with gzip handling. The generic makeRequest helper
      // collects chunks via toString() which corrupts compressed bodies, so
      // Brave needs its own request — Brave returns gzip when we send the
      // Accept-Encoding header and the browser would then choke on the
      // bytes ("malformed (non-UTF8) data").
      const braveResult = await new Promise<{
        status: number;
        buffer: Buffer;
        encoding: string;
      }>((resolve, reject) => {
        const url = new URL(targetUrl);
        const upstream = https.request(
          {
            hostname: url.hostname,
            port: 443,
            path: url.pathname + url.search,
            method: 'GET',
            headers: {
              'Accept': 'application/json',
              'Accept-Encoding': 'gzip',
              'X-Subscription-Token': apiKey,
            },
          },
          (upstreamRes) => {
            const chunks: Buffer[] = [];
            upstreamRes.on('data', (chunk: Buffer) => chunks.push(chunk));
            upstreamRes.on('end', () =>
              resolve({
                status: upstreamRes.statusCode || 500,
                buffer: Buffer.concat(chunks),
                encoding: String(
                  upstreamRes.headers['content-encoding'] || ''
                ),
              })
            );
            upstreamRes.on('error', reject);
          }
        );
        upstream.on('error', reject);
        upstream.end();
      });

      let bodyBuf = braveResult.buffer;
      if (braveResult.encoding.toLowerCase().includes('gzip')) {
        try {
          bodyBuf = gunzipSync(bodyBuf);
        } catch (err) {
          console.error('[Proxy] Brave gunzip failed:', err);
        }
      }

      res.writeHead(braveResult.status, { 'Content-Type': 'application/json' });
      res.end(bodyBuf);
      return;
    }

    // Beat schema endpoint
    if (pathname === '/api/schema/beats') {
      const __dirname = path.dirname(fileURLToPath(import.meta.url));
      const schemaPath = path.join(__dirname, 'beat-definitions', 'core-beats.json');
      if (fs.existsSync(schemaPath)) {
        const schema = fs.readFileSync(schemaPath, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(schema);
        return;
      }
    }

    // 404 for unknown routes
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  } catch (error) {
    console.error('[Proxy] Error:', (error as Error).message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: (error as Error).message }));
  }
});

server.listen(PORT, () => {
  console.log(`[API Proxy] Running on http://localhost:${PORT}`);
  console.log('[API Proxy] Endpoints:');
  console.log('  POST /api/ai/openai - OpenAI-compatible proxy');
  console.log('  POST /api/ai/claude - Claude proxy');
  console.log('  POST /api/search/brave - Brave Search proxy (Ideator)');
  console.log('  GET  /api/schema/beats - Beat definitions schema');
});
