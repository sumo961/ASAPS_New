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
import { request as httpRequest, type IncomingMessage, type ServerResponse } from 'http';

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
 * Streaming-mode proxy: opens a Server-Sent-Events connection to the
 * upstream provider, parses each SSE chunk, extracts the assistant's
 * content delta, and writes the plain content text to the client
 * response as a chunked text/plain stream.
 *
 * The two big wins versus the buffered path:
 *
 *   1. The connection stays warm. Long reasoning pauses on the model
 *      side don't get killed by intermediaries because chunks (or at
 *      worst SSE keepalive pings) keep flowing. This eliminates the
 *      504 timeouts seen with the buffered path on slow models.
 *   2. The client can show progress (chars received) without polling.
 *
 * The proxy writes only content tokens, NOT the OpenAI SSE wrapper —
 * the client's job is just to accumulate the text and parse it as
 * JSON at the end. That's the same shape the buffered path already
 * extracts via response.choices[0].message.content.
 */
function streamingProxyRequest(
  endpoint: string,
  headers: Record<string, string>,
  body: string,
  res: ServerResponse,
  provider: 'openai' | 'claude',
  timeoutMs: number,
): Promise<{ totalChars: number; status: number }> {
  return new Promise((resolve, reject) => {
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
          ...headers,
          'Content-Length': Buffer.byteLength(body),
          // Some upstreams (e.g. Cloudflare in front of OpenAI) only enable
          // chunked SSE when Accept includes text/event-stream.
          Accept: 'text/event-stream',
        },
      },
      (upstreamRes: IncomingMessage) => {
        const status = upstreamRes.statusCode || 500;

        // Upstream error — read the full body, return as JSON to the client
        if (status >= 400) {
          const chunks: Buffer[] = [];
          upstreamRes.on('data', (c: Buffer) => chunks.push(c));
          upstreamRes.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf-8');
            res.writeHead(status, { 'Content-Type': 'application/json' });
            // Pass the upstream body straight through. The client's error
            // handler tolerates both JSON and plaintext shapes.
            res.end(text || JSON.stringify({ error: `Upstream ${status}` }));
            resolve({ totalChars: 0, status });
          });
          upstreamRes.on('error', reject);
          return;
        }

        // Streaming success — open the response with chunked text/plain.
        res.writeHead(200, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Transfer-Encoding': 'chunked',
          'Cache-Control': 'no-cache, no-transform',
          'X-Accel-Buffering': 'no',
        });

        let lineBuffer = '';
        let totalChars = 0;
        // Diagnostic: track upstream chunk timing so we can tell whether
        // the model truly streams token-by-token or just sends one big
        // SSE frame at the end. Logs first/last chunk + chunk count to
        // the dev server console. Tells us if streaming is real-time or
        // upstream-buffered.
        const t0 = Date.now();
        let firstChunkAt: number | null = null;
        let upstreamChunkCount = 0;
        let lastChunkAt = 0;

        upstreamRes.on('data', (chunk: Buffer) => {
          const now = Date.now();
          if (firstChunkAt === null) firstChunkAt = now;
          upstreamChunkCount++;
          lastChunkAt = now;
          lineBuffer += chunk.toString('utf-8');
          // SSE framing: chunks are `data: <json>\n\n`. Process complete
          // lines; keep partial.
          const lines = lineBuffer.split('\n');
          lineBuffer = lines.pop() || '';
          for (const raw of lines) {
            const line = raw.trim();
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;
            try {
              const json = JSON.parse(payload);
              // OpenAI: { choices: [{ delta: { content: "..." } }] }
              // Anthropic: { type: 'content_block_delta', delta: { text: "..." } }
              const content =
                provider === 'openai'
                  ? json?.choices?.[0]?.delta?.content
                  : json?.delta?.text || json?.delta?.partial_json;
              if (content) {
                res.write(content);
                totalChars += (content as string).length;
              }
            } catch {
              // Malformed line — ignore (rare with well-formed SSE)
            }
          }
        });

        upstreamRes.on('end', () => {
          res.end();
          const totalMs = Date.now() - t0;
          const ttfbMs = firstChunkAt !== null ? firstChunkAt - t0 : -1;
          const streamSpanMs = firstChunkAt !== null ? lastChunkAt - firstChunkAt : 0;
          console.log(
            `[Vite AI Proxy] Stream timing: first chunk +${ttfbMs}ms, ` +
              `${upstreamChunkCount} upstream chunks over ${streamSpanMs}ms, ` +
              `total ${totalMs}ms — ${
                streamSpanMs > 1000 && upstreamChunkCount > 10
                  ? 'TRUE STREAMING (incremental)'
                  : streamSpanMs < 200
                    ? 'BATCHED (one big frame at end)'
                    : 'mixed / borderline'
              }`,
          );
          resolve({ totalChars, status });
        });
        upstreamRes.on('error', (err) => {
          res.end();
          reject(err);
        });
      },
    );

    upstream.on('error', reject);
    upstream.setTimeout(timeoutMs, () => {
      upstream.destroy(new Error('Request timeout'));
    });

    upstream.write(body);
    upstream.end();
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

const AI_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes (reasoning models like Kimi K2 need extra time)
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

          const isStreaming = requestBody?.stream === true;
          console.log(`[Vite AI Proxy] ${req.url === '/api/ai/openai' ? 'OpenAI' : 'Claude'} → ${endpoint}${isStreaming ? ' (streaming)' : ''}`);

          if (isStreaming) {
            const provider = req.url === '/api/ai/openai' ? 'openai' : 'claude';
            const { totalChars, status } = await streamingProxyRequest(
              endpoint,
              headers,
              requestBodyStr,
              res,
              provider,
              AI_TIMEOUT_MS,
            );
            console.log(`[Vite AI Proxy] Stream complete: ${status} (${totalChars} content chars)`);
          } else {
            const { status, text } = await nativeRequest(endpoint, headers, requestBodyStr, AI_TIMEOUT_MS);
            console.log(`[Vite AI Proxy] Response: ${status} (${text.length} chars)`);
            res.writeHead(status, { 'Content-Type': 'application/json' });
            res.end(text);
          }
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
