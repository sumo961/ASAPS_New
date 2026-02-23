/**
 * Embedded API Server for ASAPS Builder Desktop
 *
 * Provides AI proxy routes to bypass CORS restrictions when calling
 * third-party AI APIs (Claude, OpenAI, etc.) from the renderer process.
 *
 * This is a simplified version of the full API server, focused on
 * the essential functionality needed for the desktop app.
 */

import { createServer, Server as HTTPServer, IncomingMessage, ServerResponse } from 'http';
import { request as httpsRequest } from 'https';
import { request as httpRequest } from 'http';
import { parse as parseUrl } from 'url';
import { join } from 'path';
import { readFileSync, existsSync } from 'fs';
import {
  resolveClaudeEndpoint,
  resolveOpenAIEndpoint,
  buildClaudeHeaders,
  buildOpenAIHeaders,
  CORS_HEADERS,
  DEFAULT_PROXY_PORT,
  DEFAULT_AI_TIMEOUT_MS,
} from '@asaps/core';

export interface EmbeddedAPIServerConfig {
  port?: number;
  host?: string;
}

// Callback for story injection (set by main process)
let storyInjectionCallback: ((data: any) => void) | null = null;

export function setStoryInjectionCallback(callback: (data: any) => void): void {
  storyInjectionCallback = callback;
}

/**
 * Lightweight embedded API server for Electron
 * Uses only Node.js built-in modules to avoid bundling issues
 */
export class EmbeddedAPIServer {
  private server: HTTPServer | null = null;
  private config: Required<EmbeddedAPIServerConfig>;
  private isRunning = false;
  private beatSchemaCache: any = null;

  constructor(config: EmbeddedAPIServerConfig = {}) {
    this.config = {
      port: config.port ?? DEFAULT_PROXY_PORT,
      host: config.host ?? 'localhost',
    };
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[API Server] Already running');
      return;
    }

    // Check if port is already in use
    const portInUse = await this.isPortInUse(this.config.port);
    if (portInUse) {
      console.log(`[API Server] Port ${this.config.port} already in use, assuming external server is running`);
      return;
    }

    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => this.handleRequest(req, res));

      this.server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          console.log(`[API Server] Port ${this.config.port} in use, skipping`);
          resolve();
        } else {
          reject(err);
        }
      });

      this.server.listen(this.config.port, this.config.host, () => {
        this.isRunning = true;
        console.log(`[API Server] Running at http://${this.config.host}:${this.config.port}`);
        resolve();
      });
    });
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    if (!this.server || !this.isRunning) {
      return;
    }

    return new Promise((resolve) => {
      this.server!.close(() => {
        this.isRunning = false;
        this.server = null;
        console.log('[API Server] Stopped');
        resolve();
      });
    });
  }

  /**
   * Check if port is in use
   */
  private isPortInUse(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const testServer = createServer();
      testServer.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          resolve(true);
        } else {
          resolve(false);
        }
      });
      testServer.once('listening', () => {
        testServer.close(() => resolve(false));
      });
      testServer.listen(port, this.config.host);
    });
  }

  /**
   * Handle incoming requests
   */
  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Enable CORS using shared headers
    Object.entries(CORS_HEADERS).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = parseUrl(req.url || '', true);
    const path = url.pathname || '';

    console.log(`[API Server] ${req.method} ${path}`);

    try {
      // Route handling
      if (path === '/health') {
        this.sendJson(res, 200, { status: 'ok', timestamp: new Date().toISOString(), websocket: false });
      } else if (path === '/api/schema/beats' && req.method === 'GET') {
        this.handleGetBeatSchema(res);
      } else if (path === '/api/schema/example' && req.method === 'GET') {
        this.handleGetExampleStory(res);
      } else if (path === '/api/stories/inject' && req.method === 'POST') {
        await this.handleStoryInject(req, res);
      } else if (path === '/api/ai/claude' && req.method === 'POST') {
        await this.handleClaudeProxy(req, res);
      } else if (path === '/api/ai/openai' && req.method === 'POST') {
        await this.handleOpenAIProxy(req, res);
      } else {
        this.sendJson(res, 404, { error: 'Not found', path });
      }
    } catch (error) {
      console.error('[API Server] Error:', error);
      this.sendJson(res, 500, {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Handle Claude/Anthropic API proxy
   */
  private async handleClaudeProxy(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const { baseUrl, apiKey, ...requestBody } = JSON.parse(body);

    if (!apiKey) {
      this.sendJson(res, 400, { error: 'Missing required parameter: apiKey' });
      return;
    }

    // Use shared endpoint resolution (handles Moonshot /anthropic case)
    const endpoint = resolveClaudeEndpoint(baseUrl);

    console.log(`[API Server] Claude proxy to: ${endpoint}`);
    console.log(`[API Server] Making request (${DEFAULT_AI_TIMEOUT_MS / 1000}s timeout)...`);

    try {
      // Use shared header construction
      const headers = buildClaudeHeaders(apiKey);
      const requestBodyStr = JSON.stringify(requestBody);

      // Use Node.js native https to bypass Electron's Chromium networking
      const { status, text } = await this.nativeRequest(endpoint, headers, requestBodyStr, DEFAULT_AI_TIMEOUT_MS);

      console.log(`[API Server] Response status: ${status}`);
      console.log(`[API Server] Response length: ${text.length} chars`);

      if (status >= 400) {
        console.log(`[API Server] Error response: ${text.substring(0, 500)}`);
        try {
          const errorData = JSON.parse(text);
          this.sendJson(res, status, errorData);
        } catch {
          this.sendJson(res, status, { error: text });
        }
        return;
      }

      try {
        const data = JSON.parse(text);
        console.log(`[API Server] Success - sending response`);
        this.sendJson(res, 200, data);
      } catch {
        this.sendJson(res, 500, {
          error: 'Failed to parse AI response',
          responsePreview: text.substring(0, 1000),
        });
      }
    } catch (error) {
      console.error('[API Server] Claude proxy error:', error);
      const isTimeout = error instanceof Error && error.message === 'Request timeout';
      this.sendJson(res, isTimeout ? 504 : 500, {
        error: isTimeout ? 'Request timeout' : 'Proxy request failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Handle OpenAI API proxy
   */
  private async handleOpenAIProxy(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const { baseUrl, apiKey, ...requestBody } = JSON.parse(body);

    if (!apiKey) {
      this.sendJson(res, 400, { error: 'Missing required parameter: apiKey' });
      return;
    }

    // Use shared endpoint resolution
    const endpoint = resolveOpenAIEndpoint(baseUrl);

    console.log(`[API Server] OpenAI proxy to: ${endpoint}`);
    console.log(`[API Server] Making request (${DEFAULT_AI_TIMEOUT_MS / 1000}s timeout)...`);

    try {
      // Use shared header construction
      const headers = buildOpenAIHeaders(apiKey);
      const requestBodyStr = JSON.stringify(requestBody);

      // Use Node.js native https to bypass Electron's Chromium networking
      // Electron's fetch() goes through Chromium's network stack which can
      // abort long-running AI requests prematurely
      const { status, text } = await this.nativeRequest(endpoint, headers, requestBodyStr, DEFAULT_AI_TIMEOUT_MS);

      console.log(`[API Server] Response status: ${status}`);
      console.log(`[API Server] Response length: ${text.length} chars`);

      if (status >= 400) {
        console.log(`[API Server] Error response: ${text.substring(0, 500)}`);
        try {
          const errorData = JSON.parse(text);
          this.sendJson(res, status, errorData);
        } catch {
          this.sendJson(res, status, { error: text });
        }
        return;
      }

      try {
        const data = JSON.parse(text);
        console.log(`[API Server] Success - sending response`);
        this.sendJson(res, 200, data);
      } catch {
        this.sendJson(res, 500, {
          error: 'Failed to parse AI response',
          responsePreview: text.substring(0, 1000),
        });
      }
    } catch (error) {
      console.error('[API Server] OpenAI proxy error:', error);
      const isTimeout = error instanceof Error && error.message === 'Request timeout';
      this.sendJson(res, isTimeout ? 504 : 500, {
        error: isTimeout ? 'Request timeout' : 'Proxy request failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Handle GET /api/schema/beats - return beat definitions
   */
  private handleGetBeatSchema(res: ServerResponse): void {
    const schema = this.loadBeatSchema();
    this.sendJson(res, 200, schema);
  }

  /**
   * Handle GET /api/schema/example - return example story structure
   */
  private handleGetExampleStory(res: ServerResponse): void {
    const exampleStory = {
      metadata: {
        title: 'The Crossroads Decision',
        author: 'Claude Desktop',
        description: 'A short interactive narrative demonstrating ASAPS beat types',
      },
      beats: [
        {
          id: 'beat_0',
          type: 'titleScreen',
          name: 'Title',
          parameters: {
            title: 'The Crossroads Decision',
            author: 'Claude Desktop',
            buttonText: 'Begin',
          },
          x: 100,
          y: 200,
        },
        {
          id: 'beat_1',
          type: 'infoText',
          name: 'Introduction',
          parameters: {
            text: 'You stand at a crossroads. The morning mist swirls around your feet as you consider your options.',
            buttonText: 'Look around',
          },
          x: 400,
          y: 200,
        },
        {
          id: 'beat_2',
          type: 'movementChoice',
          name: 'The Choice',
          parameters: {
            question: 'Which path will you take?',
            choices: [
              { id: 'c1', text: 'Take the forest path', location: 'Dark Forest', target: 'beat_3' },
              { id: 'c2', text: 'Follow the mountain road', location: 'Mountain Pass', target: 'beat_4' },
            ],
          },
          x: 700,
          y: 200,
        },
        {
          id: 'beat_3',
          type: 'infoText',
          name: 'Forest Path',
          parameters: {
            text: 'The forest path leads you through ancient trees. Shafts of sunlight pierce the canopy above.',
            buttonText: 'Continue',
          },
          x: 550,
          y: 400,
        },
        {
          id: 'beat_4',
          type: 'infoText',
          name: 'Mountain Road',
          parameters: {
            text: 'The mountain road climbs steadily upward. The air grows thin but the view is breathtaking.',
            buttonText: 'Continue',
          },
          x: 850,
          y: 400,
        },
        {
          id: 'beat_5',
          type: 'endScreen',
          name: 'Journey End',
          parameters: {
            message: 'Your journey continues...\n\nThank you for exploring this demonstration.',
            showRestart: true,
          },
          x: 700,
          y: 600,
        },
      ],
      connections: [
        { source: 'beat_0', target: 'beat_1', label: 'Begin' },
        { source: 'beat_1', target: 'beat_2', label: 'Continue' },
        { source: 'beat_3', target: 'beat_5', label: 'Continue' },
        { source: 'beat_4', target: 'beat_5', label: 'Continue' },
      ],
    };

    this.sendJson(res, 200, exampleStory);
  }

  /**
   * Handle POST /api/stories/inject - inject story into the running Builder
   */
  private async handleStoryInject(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const body = await this.readBody(req);
      const { metadata, beats, connections, characters, environment, suggestedTheme } = JSON.parse(body);

      // Validate required fields
      if (!beats || !Array.isArray(beats)) {
        this.sendJson(res, 400, {
          error: 'Invalid request: beats array is required',
        });
        return;
      }

      const injectionId = `inject_${Date.now()}`;
      console.log(`[API Server] Injecting story: "${metadata?.title || 'Untitled'}" with ${beats.length} beats (id: ${injectionId})`);

      // Send to main window via callback
      if (storyInjectionCallback) {
        storyInjectionCallback({
          metadata: metadata || { title: 'Injected Story', author: 'Claude Desktop' },
          beats,
          connections: connections || [],
          characters: characters || [],
          environment: environment || { props: [], nodes: [] },
          suggestedTheme: suggestedTheme || undefined,
          injectedAt: new Date().toISOString(),
        });

        this.sendJson(res, 200, {
          success: true,
          message: `Story "${metadata?.title || 'Untitled'}" injected successfully`,
          beatsCount: beats.length,
          connectionsCount: connections?.length || 0,
        });
      } else {
        console.warn('[API Server] No injection callback registered - main window may not be ready');
        this.sendJson(res, 503, {
          error: 'Service not ready',
          message: 'The ASAPS Builder window is not ready to receive stories. Please wait and try again.',
        });
      }
    } catch (error) {
      console.error('[API Server] Story injection failed:', error);
      this.sendJson(res, 500, {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Load beat schema from core-beats.json
   */
  private loadBeatSchema(): any {
    if (this.beatSchemaCache) {
      return this.beatSchemaCache;
    }

    try {
      // Get the directory where this file is located
      const currentDir = __dirname;

      // Try multiple paths to find the schema file
      const possiblePaths = [
        // Production: relative to dist-electron/main
        join(currentDir, '../../builder/beat-definitions/core-beats.json'),
        // Alternative paths
        join(currentDir, '../../../builder/beat-definitions/core-beats.json'),
        join(currentDir, '../../../../beat-definitions/core-beats.json'),
        // Development: relative to project root
        join(process.cwd(), 'beat-definitions/core-beats.json'),
        join(process.cwd(), 'builder/beat-definitions/core-beats.json'),
      ];

      let rawSchema: any = null;
      let foundPath = '';

      for (const schemaPath of possiblePaths) {
        if (existsSync(schemaPath)) {
          const content = readFileSync(schemaPath, 'utf-8');
          rawSchema = JSON.parse(content);
          foundPath = schemaPath;
          console.log(`[API Server] Loaded beat schema from: ${schemaPath}`);
          break;
        }
      }

      if (!rawSchema) {
        console.error('[API Server] Could not find beat-definitions/core-beats.json');
        console.error('[API Server] Tried paths:', possiblePaths);
        return this.getFallbackSchema();
      }

      // Transform and cache the schema
      this.beatSchemaCache = this.transformSchemaForAPI(rawSchema, foundPath);
      return this.beatSchemaCache;

    } catch (error) {
      console.error('[API Server] Failed to load beat schema:', error);
      return this.getFallbackSchema();
    }
  }

  /**
   * Transform the raw beat schema into the API format
   */
  private transformSchemaForAPI(rawSchema: any, sourcePath: string): any {
    const beatTypes: Record<string, any> = {};

    // Transform each beat type from the schema
    for (const [beatType, beatDef] of Object.entries(rawSchema.beatTypes || {})) {
      const def = beatDef as any;
      beatTypes[beatType] = {
        category: def.category || 'visible',
        description: def.description || '',
        connectionType: def.connectionType || 'single',
        parameters: def.parameters || {},
      };

      if (def.example) {
        beatTypes[beatType].example = def.example;
      }
    }

    return {
      version: rawSchema.schema || '2.2.0',
      description: 'ASAPS Beat Types - Use these to create interactive narratives',
      source: 'Loaded from beat-definitions/core-beats.json',
      loadedFrom: sourcePath,
      beatTypes,
      customTypes: rawSchema.customTypes || {},
    };
  }

  /**
   * Fallback schema when file cannot be loaded
   */
  private getFallbackSchema(): any {
    return {
      version: '2.2.0',
      description: 'ASAPS Beat Types (fallback - could not load from file)',
      error: 'Could not load beat-definitions/core-beats.json',
      beatTypes: {},
    };
  }

  /**
   * Read request body
   */
  private readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  }

  /**
   * Send JSON response
   */
  private sendJson(res: ServerResponse, status: number, data: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  /**
   * Make an outgoing HTTPS/HTTP request using Node.js native modules.
   *
   * Electron's main-process fetch() goes through Chromium's networking stack,
   * which can abort long-running AI requests. Using Node.js native https/http
   * modules bypasses Chromium entirely and handles large, slow responses reliably.
   */
  private nativeRequest(
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
        (response) => {
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
   * Check if server is running
   */
  getStatus() {
    return {
      running: this.isRunning,
      port: this.config.port,
      host: this.config.host,
    };
  }
}

// Singleton instance
let serverInstance: EmbeddedAPIServer | null = null;

export function getEmbeddedAPIServer(config?: EmbeddedAPIServerConfig): EmbeddedAPIServer {
  if (!serverInstance) {
    serverInstance = new EmbeddedAPIServer(config);
  }
  return serverInstance;
}
