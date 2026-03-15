/**
 * Vite Dev Server AI Proxy Plugin
 *
 * Provides /api/ai/openai and /api/ai/claude endpoints directly on the
 * Vite dev server (port 5173) using Node.js native https module.
 *
 * This allows AI story generation to work during development without
 * needing the Electron desktop app or standalone API server running.
 * The Electron app's fetch() goes through Chromium's networking stack
 * which can abort long-running AI requests; Node.js native https avoids this.
 */

import type { Plugin } from 'vite';
import { request as httpsRequest } from 'https';
import { request as httpRequest, type IncomingMessage } from 'http';

/**
 * Make an outgoing request using Node.js native https/http modules
 */
function nativeRequest(
  endpoint: string,
  headers: Record<string, string>,
  body: string,
  timeoutMs: number
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint);
    const isHttps = url.protocol === 'https:';
    const requestFn = isHttps ? httpsRequest : httpRequest;

    const req = requestFn(
      {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          ...headers,
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (response: IncomingMessage) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf-8');
          resolve({ status: response.statusCode || 500, text });
        });
        response.on('error', reject);
      }
    );

    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('Request timeout'));
    });

    req.write(body);
    req.end();
  });
}

/**
 * Read request body from an IncomingMessage
 */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: string) => (body += chunk));
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

/**
 * Make an outgoing request that returns raw binary data (for TTS audio)
 */
function nativeBinaryRequest(
  endpoint: string,
  method: 'GET' | 'POST',
  headers: Record<string, string>,
  body?: string,
  timeoutMs: number = TTS_TIMEOUT_MS
): Promise<{ status: number; buffer: Buffer; contentType: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint);
    const isHttps = url.protocol === 'https:';
    const requestFn = isHttps ? httpsRequest : httpRequest;

    const reqHeaders: Record<string, string | number> = { ...headers };
    if (body) {
      reqHeaders['Content-Length'] = Buffer.byteLength(body);
    }

    const req = requestFn(
      {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method,
        headers: reqHeaders,
      },
      (response: IncomingMessage) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          const buffer = Buffer.concat(chunks);
          resolve({
            status: response.statusCode || 500,
            buffer,
            contentType: response.headers['content-type'] || 'application/octet-stream',
          });
        });
        response.on('error', reject);
      }
    );

    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('Request timeout'));
    });

    if (body) req.write(body);
    req.end();
  });
}

const AI_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const TTS_TIMEOUT_MS = 30 * 1000; // 30 seconds

/**
 * Vite plugin that adds AI proxy middleware to the dev server
 */
export function viteAIProxyPlugin(): Plugin {
  return {
    name: 'asaps-ai-proxy',
    configureServer(server) {
      // Add middleware BEFORE Vite's own middleware
      server.middlewares.use(async (req, res, next) => {
        // Only handle AI proxy routes
        if (req.method !== 'POST') return next();
        if (req.url !== '/api/ai/openai' && req.url !== '/api/ai/claude') return next();

        // Set CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        try {
          const body = await readBody(req);
          const parsed = JSON.parse(body);
          const { baseUrl, apiKey, ...requestBody } = parsed;

          if (!apiKey) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing required parameter: apiKey' }));
            return;
          }

          const requestBodyStr = JSON.stringify(requestBody);
          let endpoint: string;
          let headers: Record<string, string>;

          if (req.url === '/api/ai/openai') {
            const effectiveBaseUrl = baseUrl || 'https://api.openai.com/v1';
            endpoint = effectiveBaseUrl.includes('/completions')
              ? effectiveBaseUrl
              : `${effectiveBaseUrl.replace(/\/$/, '')}/chat/completions`;
            headers = {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            };
          } else {
            const effectiveBaseUrl = baseUrl || 'https://api.anthropic.com';
            endpoint = effectiveBaseUrl.includes('/messages')
              ? effectiveBaseUrl
              : `${effectiveBaseUrl.replace(/\/$/, '')}/v1/messages`;
            headers = {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
              'anthropic-dangerous-direct-browser-access': 'true',
            };
          }

          console.log(`[Vite AI Proxy] ${req.url === '/api/ai/openai' ? 'OpenAI' : 'Claude'} → ${endpoint}`);

          const { status, text } = await nativeRequest(endpoint, headers, requestBodyStr, AI_TIMEOUT_MS);

          console.log(`[Vite AI Proxy] Response: ${status} (${text.length} chars)`);

          res.writeHead(status, { 'Content-Type': 'application/json' });
          res.end(text);
        } catch (error) {
          console.error('[Vite AI Proxy] Error:', error);
          const isTimeout = error instanceof Error && error.message === 'Request timeout';
          res.writeHead(isTimeout ? 504 : 500, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              error: isTimeout ? 'Request timeout' : 'Proxy request failed',
              message: error instanceof Error ? error.message : 'Unknown error',
            })
          );
        }
      });

      // -----------------------------------------------------------------------
      // TTS proxy routes (binary audio)
      // -----------------------------------------------------------------------
      server.middlewares.use(async (req, res, next) => {
        if (req.method !== 'POST') return next();

        const TTS_ROUTES = ['/api/tts/openai', '/api/tts/elevenlabs', '/api/tts/elevenlabs/voices'];
        if (!TTS_ROUTES.includes(req.url || '')) return next();

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        try {
          const body = await readBody(req);
          const parsed = JSON.parse(body);
          const { apiKey, baseUrl, voiceId, streamUrl: clientStreamUrl, ...requestBody } = parsed;

          if (!apiKey) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing required parameter: apiKey' }));
            return;
          }

          if (req.url === '/api/tts/openai') {
            // OpenAI TTS — stream audio chunks directly to client
            const effectiveBaseUrl = (baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
            const endpoint = `${effectiveBaseUrl}/audio/speech`;
            const bodyStr = JSON.stringify(requestBody);

            console.log(`[Vite TTS Proxy] OpenAI TTS (streaming) → ${endpoint}`);

            const url = new URL(endpoint);
            const isHttps = url.protocol === 'https:';
            const requestFn = isHttps ? httpsRequest : httpRequest;

            const upstream = requestFn(
              {
                hostname: url.hostname,
                port: url.port || (isHttps ? 443 : 80),
                path: url.pathname + url.search,
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${apiKey}`,
                  'Content-Length': Buffer.byteLength(bodyStr),
                },
              },
              (upstreamRes: IncomingMessage) => {
                const status = upstreamRes.statusCode || 500;
                if (status !== 200) {
                  // Error: buffer and forward
                  const chunks: Buffer[] = [];
                  upstreamRes.on('data', (chunk: Buffer) => chunks.push(chunk));
                  upstreamRes.on('end', () => {
                    console.error(`[Vite TTS Proxy] OpenAI TTS error: ${status}`);
                    res.writeHead(status, { 'Content-Type': 'application/json' });
                    res.end(Buffer.concat(chunks).toString('utf-8'));
                  });
                  return;
                }
                // Stream audio chunks directly to client
                res.writeHead(200, {
                  'Content-Type': upstreamRes.headers['content-type'] || 'audio/mpeg',
                  'Transfer-Encoding': 'chunked',
                });
                upstreamRes.pipe(res);
              }
            );

            upstream.on('error', (err) => {
              console.error('[Vite TTS Proxy] OpenAI TTS upstream error:', err);
              if (!res.headersSent) {
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Upstream request failed', message: err.message }));
              }
            });
            upstream.setTimeout(TTS_TIMEOUT_MS, () => {
              upstream.destroy(new Error('Request timeout'));
            });
            upstream.write(bodyStr);
            upstream.end();
            return; // Don't fall through

          } else if (req.url === '/api/tts/elevenlabs') {
            // ElevenLabs TTS — stream audio chunks directly to client
            const vid = voiceId || 'EXAVITQu4vr4xnSDxMaL';
            // Use streaming endpoint (client provides URL with appropriate latency params)
            const endpoint = clientStreamUrl || `https://api.elevenlabs.io/v1/text-to-speech/${vid}/stream`;
            const bodyStr = JSON.stringify(requestBody);

            console.log(`[Vite TTS Proxy] ElevenLabs TTS (streaming) → ${endpoint}`);

            const url = new URL(endpoint);
            const upstream = httpsRequest(
              {
                hostname: url.hostname,
                port: 443,
                path: url.pathname + url.search,
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'xi-api-key': apiKey,
                  'Content-Length': Buffer.byteLength(bodyStr),
                },
              },
              (upstreamRes: IncomingMessage) => {
                const status = upstreamRes.statusCode || 500;
                if (status !== 200) {
                  // Error: buffer and forward
                  const chunks: Buffer[] = [];
                  upstreamRes.on('data', (chunk: Buffer) => chunks.push(chunk));
                  upstreamRes.on('end', () => {
                    console.error(`[Vite TTS Proxy] ElevenLabs TTS error: ${status}`);
                    res.writeHead(status, { 'Content-Type': 'application/json' });
                    res.end(Buffer.concat(chunks).toString('utf-8'));
                  });
                  return;
                }
                // Stream audio chunks directly to client
                res.writeHead(200, {
                  'Content-Type': upstreamRes.headers['content-type'] || 'audio/mpeg',
                  'Transfer-Encoding': 'chunked',
                });
                upstreamRes.pipe(res);
              }
            );

            upstream.on('error', (err) => {
              console.error('[Vite TTS Proxy] ElevenLabs TTS upstream error:', err);
              if (!res.headersSent) {
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Upstream request failed', message: err.message }));
              }
            });
            upstream.setTimeout(TTS_TIMEOUT_MS, () => {
              upstream.destroy(new Error('Request timeout'));
            });
            upstream.write(bodyStr);
            upstream.end();
            return; // Don't fall through

          } else if (req.url === '/api/tts/elevenlabs/voices') {
            // ElevenLabs voices list — returns JSON
            const endpoint = 'https://api.elevenlabs.io/v1/voices';

            console.log('[Vite TTS Proxy] ElevenLabs voices → GET', endpoint);

            const result = await nativeBinaryRequest(endpoint, 'GET', {
              'xi-api-key': apiKey,
            });

            res.writeHead(result.status, { 'Content-Type': 'application/json' });
            res.end(result.buffer);
          }
        } catch (error) {
          console.error('[Vite TTS Proxy] Error:', error);
          const isTimeout = error instanceof Error && error.message === 'Request timeout';
          res.writeHead(isTimeout ? 504 : 500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: isTimeout ? 'Request timeout' : 'TTS proxy request failed',
            message: error instanceof Error ? error.message : 'Unknown error',
          }));
        }
      });

      // Handle OPTIONS preflight for AI and TTS routes
      server.middlewares.use((req, res, next) => {
        if (req.method !== 'OPTIONS') return next();
        const PREFLIGHT_ROUTES = [
          '/api/ai/openai', '/api/ai/claude',
          '/api/tts/openai', '/api/tts/elevenlabs', '/api/tts/elevenlabs/voices',
        ];
        if (!PREFLIGHT_ROUTES.includes(req.url || '')) return next();

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.writeHead(204);
        res.end();
      });
    },
  };
}
