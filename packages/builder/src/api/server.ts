/**
 * ASAPS Builder HTTP API Server
 *
 * Provides REST API endpoints for MCP server and other external integrations.
 * Enables real-time story creation and editing through HTTP + WebSocket.
 *
 * Port: 3001 (default)
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createServer, Server as HTTPServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { getMemoryStorage } from '../storage/MemoryStorageAdapter';
import { getFilesystemStorage } from '../storage/FilesystemStorageAdapter';
import type { IStorageAdapter } from '../storage/IStorageAdapter';

// ============================================================================
// Types
// ============================================================================

export interface APIServerConfig {
  port?: number;
  host?: string;
  corsOrigin?: string | string[];
  enableWebSocket?: boolean;
  storageType?: 'memory' | 'filesystem';
  storagePath?: string;
}

export interface APIContext {
  storage: IStorageAdapter;
  wss?: WebSocketServer;
}

// ============================================================================
// API Server Class
// ============================================================================

export class APIServer {
  private app: Express;
  private httpServer: HTTPServer;
  private wss?: WebSocketServer;
  private storage: IStorageAdapter;
  private config: Required<APIServerConfig>;
  private isRunning: boolean = false;

  constructor(config: APIServerConfig = {}) {
    this.config = {
      port: config.port ?? 3001,
      host: config.host ?? 'localhost',
      corsOrigin: config.corsOrigin ?? '*',
      enableWebSocket: config.enableWebSocket ?? true,
      storageType: config.storageType ?? 'filesystem',
      storagePath: config.storagePath ?? '~/.asaps-storage',
    };

    this.app = express();
    this.httpServer = createServer(this.app);

    // Initialize storage based on type
    if (this.config.storageType === 'filesystem') {
      this.storage = getFilesystemStorage({
        filesystemBasePath: this.config.storagePath,
      });
    } else {
      this.storage = getMemoryStorage();
    }

    this.setupMiddleware();
    this.setupRoutes();

    if (this.config.enableWebSocket) {
      this.setupWebSocket();
    }
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    // CORS
    this.app.use(
      cors({
        origin: this.config.corsOrigin,
        credentials: true,
      })
    );

    // JSON body parser
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));

    // Request logging
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      console.log(`[API] ${req.method} ${req.path}`);
      next();
    });
  }

  /**
   * Setup API routes
   */
  private setupRoutes(): void {
    const ctx: APIContext = {
      storage: this.storage,
      wss: this.wss,
    };

    // Health check
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        storage: this.storage.isReady(),
        websocket: !!this.wss,
      });
    });

    // API info
    this.app.get('/api', (req: Request, res: Response) => {
      res.json({
        name: 'ASAPS Builder API',
        version: '1.0.0',
        endpoints: {
          projects: '/api/projects',
          beats: '/api/beats',
          assets: '/api/assets',
          stories: '/api/stories',
        },
      });
    });

    // Mount route modules
    this.app.use('/api/projects', this.createProjectRoutes(ctx));
    this.app.use('/api/beats', this.createBeatRoutes(ctx));
    this.app.use('/api/assets', this.createAssetRoutes(ctx));
    this.app.use('/api/stories', this.createStoryRoutes(ctx));
    this.app.use('/api/ai', this.createAIProxyRoutes(ctx));

    // Error handler
    this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      console.error('[API] Error:', err);
      res.status(500).json({
        error: 'Internal Server Error',
        message: err.message,
      });
    });

    // 404 handler
    this.app.use((req: Request, res: Response) => {
      res.status(404).json({
        error: 'Not Found',
        path: req.path,
      });
    });
  }

  /**
   * Create project routes
   */
  private createProjectRoutes(ctx: APIContext): express.Router {
    const router = express.Router();

    // List all projects
    router.get('/', async (req: Request, res: Response) => {
      try {
        const projects = await ctx.storage.listProjects();
        res.json({ projects });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // Get project by ID
    router.get('/:id', async (req: Request, res: Response) => {
      try {
        const project = await ctx.storage.loadProject(req.params.id);
        if (!project) {
          return res.status(404).json({ error: 'Project not found' });
        }
        res.json({ project });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // Create new project
    router.post('/', async (req: Request, res: Response) => {
      try {
        const project = req.body;
        await ctx.storage.saveProject(project);

        // Broadcast update via WebSocket
        this.broadcast('project:created', { projectId: project.id });

        res.status(201).json({ project });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // Update project
    router.put('/:id', async (req: Request, res: Response) => {
      try {
        const project = req.body;
        project.id = req.params.id;
        await ctx.storage.saveProject(project);

        // Broadcast update via WebSocket
        this.broadcast('project:updated', { projectId: project.id });

        res.json({ project });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // Delete project
    router.delete('/:id', async (req: Request, res: Response) => {
      try {
        await ctx.storage.deleteProject(req.params.id);

        // Broadcast update via WebSocket
        this.broadcast('project:deleted', { projectId: req.params.id });

        res.status(204).send();
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    return router;
  }

  /**
   * Create beat routes
   */
  private createBeatRoutes(ctx: APIContext): express.Router {
    const router = express.Router();

    // Add beat to project
    router.post('/:projectId', async (req: Request, res: Response) => {
      try {
        const { projectId } = req.params;
        const beat = req.body;

        const project = await ctx.storage.loadProject(projectId);
        if (!project) {
          return res.status(404).json({ error: 'Project not found' });
        }

        // Add beat to project (project structure needs to be extended)
        // For now, return the beat as-is
        // TODO: Implement beat addition logic based on project structure

        this.broadcast('beat:added', { projectId, beat });

        res.status(201).json({ beat });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    return router;
  }

  /**
   * Create asset routes
   */
  private createAssetRoutes(ctx: APIContext): express.Router {
    const router = express.Router();

    // List assets for project
    router.get('/:projectId', async (req: Request, res: Response) => {
      try {
        const assets = await ctx.storage.listAssets(req.params.projectId);
        res.json({ assets });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // Upload asset
    router.post('/:projectId', async (req: Request, res: Response) => {
      try {
        const { projectId } = req.params;
        const asset = req.body;

        const info = await ctx.storage.saveAsset(asset);

        this.broadcast('asset:uploaded', { projectId, assetId: info.id });

        res.status(201).json({ asset: info });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // Get asset
    router.get('/:projectId/:assetId', async (req: Request, res: Response) => {
      try {
        const info = await ctx.storage.loadAssetInfo(req.params.assetId);
        if (!info) {
          return res.status(404).json({ error: 'Asset not found' });
        }
        res.json({ asset: info });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // Delete asset
    router.delete('/:projectId/:assetId', async (req: Request, res: Response) => {
      try {
        await ctx.storage.deleteAsset(req.params.assetId);

        this.broadcast('asset:deleted', {
          projectId: req.params.projectId,
          assetId: req.params.assetId,
        });

        res.status(204).send();
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    return router;
  }

  /**
   * Create story routes
   */
  private createStoryRoutes(ctx: APIContext): express.Router {
    const router = express.Router();

    // Generate story (for AI integration)
    router.post('/generate', async (req: Request, res: Response) => {
      try {
        const { projectId, prompt, options } = req.body;

        // Placeholder for AI story generation
        // This will be connected to AIService in the future
        res.json({
          message: 'Story generation endpoint (to be implemented)',
          projectId,
          prompt,
        });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    return router;
  }

  /**
   * Create AI proxy routes
   */
  private createAIProxyRoutes(ctx: APIContext): express.Router {
    const router = express.Router();

    // Proxy for Claude/Anthropic-compatible APIs
    router.post('/claude', async (req: Request, res: Response) => {
      try {
        const { baseUrl, apiKey, ...requestBody } = req.body;

        if (!baseUrl || !apiKey) {
          return res.status(400).json({
            error: 'Missing required parameters: baseUrl and apiKey'
          });
        }

        // Make the actual request to the third-party API
        const response = await fetch(`${baseUrl}/v1/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(requestBody),
        });

        const data = await response.json();

        if (!response.ok) {
          return res.status(response.status).json(data);
        }

        res.json(data);
      } catch (error) {
        console.error('[AI Proxy] Claude error:', error);
        res.status(500).json({
          error: 'Proxy request failed',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Proxy for OpenAI-compatible APIs
    router.post('/openai', async (req: Request, res: Response) => {
      try {
        const { baseUrl, apiKey, ...requestBody } = req.body;

        if (!baseUrl || !apiKey) {
          return res.status(400).json({
            error: 'Missing required parameters: baseUrl and apiKey'
          });
        }

        // Make the actual request to the third-party API
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify(requestBody),
        });

        const data = await response.json();

        if (!response.ok) {
          return res.status(response.status).json(data);
        }

        res.json(data);
      } catch (error) {
        console.error('[AI Proxy] OpenAI error:', error);
        res.status(500).json({
          error: 'Proxy request failed',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    return router;
  }

  /**
   * Setup WebSocket server
   */
  private setupWebSocket(): void {
    this.wss = new WebSocketServer({ server: this.httpServer });

    this.wss.on('connection', (ws: WebSocket) => {
      console.log('[WebSocket] Client connected');

      ws.on('message', (message: string) => {
        try {
          const data = JSON.parse(message.toString());
          console.log('[WebSocket] Received:', data);

          // Echo back for now
          ws.send(JSON.stringify({ type: 'ack', data }));
        } catch (error) {
          console.error('[WebSocket] Error parsing message:', error);
        }
      });

      ws.on('close', () => {
        console.log('[WebSocket] Client disconnected');
      });

      // Send welcome message
      ws.send(
        JSON.stringify({
          type: 'connected',
          timestamp: new Date().toISOString(),
        })
      );
    });
  }

  /**
   * Broadcast message to all WebSocket clients
   */
  private broadcast(event: string, data: any): void {
    if (!this.wss) return;

    const message = JSON.stringify({ event, data, timestamp: new Date().toISOString() });

    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[API] Server already running');
      return;
    }

    // Initialize storage
    if (!this.storage.isReady()) {
      await this.storage.initialize();
    }

    return new Promise((resolve) => {
      this.httpServer.listen(this.config.port, this.config.host, () => {
        this.isRunning = true;
        console.log(`[API] Server running at http://${this.config.host}:${this.config.port}`);
        console.log(`[API] WebSocket: ${this.config.enableWebSocket ? 'enabled' : 'disabled'}`);
        resolve();
      });
    });
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    return new Promise((resolve, reject) => {
      // Close WebSocket server
      if (this.wss) {
        this.wss.close(() => {
          console.log('[WebSocket] Server closed');
        });
      }

      // Close HTTP server
      this.httpServer.close((err) => {
        if (err) {
          reject(err);
        } else {
          this.isRunning = false;
          console.log('[API] Server stopped');
          resolve();
        }
      });
    });
  }

  /**
   * Get server info
   */
  getInfo() {
    return {
      running: this.isRunning,
      port: this.config.port,
      host: this.config.host,
      websocket: this.config.enableWebSocket,
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let serverInstance: APIServer | null = null;

export function getAPIServer(config?: APIServerConfig): APIServer {
  if (!serverInstance) {
    serverInstance = new APIServer(config);
  }
  return serverInstance;
}

export function resetAPIServer(): void {
  serverInstance = null;
}
