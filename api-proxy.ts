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
  console.log('  GET  /api/schema/beats - Beat definitions schema');
});
