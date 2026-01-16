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
import { parse as parseUrl } from 'url';
import { join, dirname } from 'path';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';

export interface EmbeddedAPIServerConfig {
  port?: number;
  host?: string;
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
      port: config.port ?? 3001,
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
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, anthropic-version');

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
        this.sendJson(res, 200, { status: 'ok', timestamp: new Date().toISOString() });
      } else if (path === '/api/schema/beats' && req.method === 'GET') {
        this.handleGetBeatSchema(res);
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

    // Use default Anthropic URL if not provided
    const effectiveBaseUrl = baseUrl || 'https://api.anthropic.com';

    // Determine endpoint URL
    let endpoint = effectiveBaseUrl;
    if (!effectiveBaseUrl.includes('/messages')) {
      endpoint = `${effectiveBaseUrl.replace(/\/$/, '')}/v1/messages`;
    }

    console.log(`[API Server] Claude proxy to: ${endpoint}`);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(requestBody),
      });

      const text = await response.text();

      if (!response.ok) {
        try {
          const errorData = JSON.parse(text);
          this.sendJson(res, response.status, errorData);
        } catch {
          this.sendJson(res, response.status, { error: text });
        }
        return;
      }

      try {
        const data = JSON.parse(text);
        this.sendJson(res, 200, data);
      } catch {
        this.sendJson(res, 500, {
          error: 'Failed to parse AI response',
          responsePreview: text.substring(0, 1000),
        });
      }
    } catch (error) {
      console.error('[API Server] Claude proxy error:', error);
      this.sendJson(res, 500, {
        error: 'Proxy request failed',
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

    // Use default OpenAI URL if not provided
    const effectiveBaseUrl = baseUrl || 'https://api.openai.com/v1';

    // Determine endpoint URL
    let endpoint = effectiveBaseUrl;
    if (!effectiveBaseUrl.includes('/completions')) {
      endpoint = `${effectiveBaseUrl.replace(/\/$/, '')}/chat/completions`;
    }

    console.log(`[API Server] OpenAI proxy to: ${endpoint}`);
    console.log(`[API Server] Making request (5 minute timeout)...`);

    // Create abort controller with 5 minute timeout for long AI requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      console.log(`[API Server] Response status: ${response.status}`);
      const text = await response.text();
      console.log(`[API Server] Response length: ${text.length} chars`);

      if (!response.ok) {
        console.log(`[API Server] Error response: ${text.substring(0, 500)}`);
        try {
          const errorData = JSON.parse(text);
          this.sendJson(res, response.status, errorData);
        } catch {
          this.sendJson(res, response.status, { error: text });
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
      clearTimeout(timeoutId);
      console.error('[API Server] OpenAI proxy error:', error);
      this.sendJson(res, 500, {
        error: 'Proxy request failed',
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
