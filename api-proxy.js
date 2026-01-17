/**
 * Simple API proxy server to handle CORS for AI provider requests
 * Run with: node api-proxy.js
 */

const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');

const PORT = 3001;

// Parse JSON body from request
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

// Make HTTP/HTTPS request
function makeRequest(targetUrl, options, body) {
  return new Promise((resolve, reject) => {
    const parsed = url.parse(targetUrl);
    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;

    const reqOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.path,
      method: options.method || 'POST',
      headers: options.headers || {},
    };

    const req = lib.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
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
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const pathname = url.parse(req.url).pathname;

  try {
    // OpenAI-compatible proxy (for Moonshot, DeepSeek, etc.)
    if (pathname === '/api/ai/openai') {
      const body = await parseBody(req);
      const { baseUrl, apiKey, ...requestBody } = body;

      // Determine endpoint
      const targetBaseUrl = baseUrl || 'https://api.openai.com/v1';
      const targetUrl = `${targetBaseUrl}/chat/completions`;

      console.log(`[Proxy] OpenAI request to: ${targetUrl}`);

      const response = await makeRequest(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
      }, JSON.stringify(requestBody));

      res.writeHead(response.status, { 'Content-Type': 'application/json' });
      res.end(response.body);
      return;
    }

    // Claude proxy
    if (pathname === '/api/ai/claude') {
      const body = await parseBody(req);
      const { baseUrl, apiKey, ...requestBody } = body;

      const targetBaseUrl = baseUrl || 'https://api.anthropic.com';

      // Determine endpoint URL - append /v1/messages if not already present
      let targetUrl = targetBaseUrl;
      if (!targetBaseUrl.includes('/messages')) {
        targetUrl = `${targetBaseUrl.replace(/\/$/, '')}/v1/messages`;
      }

      console.log(`[Proxy] Claude request to: ${targetUrl}`);

      const response = await makeRequest(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
      }, JSON.stringify(requestBody));

      res.writeHead(response.status, { 'Content-Type': 'application/json' });
      res.end(response.body);
      return;
    }

    // Beat schema endpoint
    if (pathname === '/api/schema/beats') {
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
    console.error('[Proxy] Error:', error.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
});

server.listen(PORT, () => {
  console.log(`[API Proxy] Running on http://localhost:${PORT}`);
  console.log('[API Proxy] Endpoints:');
  console.log('  POST /api/ai/openai - OpenAI-compatible proxy');
  console.log('  POST /api/ai/claude - Claude proxy');
  console.log('  GET  /api/schema/beats - Beat definitions schema');
});
