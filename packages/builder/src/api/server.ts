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
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
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
  private beatSchemaCache: any = null;

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
    this.app.use('/api/schema', this.createSchemaRoutes(ctx));
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
   * Load beat schema from core-beats.json (single source of truth)
   * Caches the result for subsequent requests
   */
  private loadBeatSchema(): any {
    if (this.beatSchemaCache) {
      return this.beatSchemaCache;
    }

    try {
      // Get __dirname equivalent for ESM
      const currentFileUrl = import.meta.url;
      const currentFilePath = fileURLToPath(currentFileUrl);
      const currentDir = path.dirname(currentFilePath);

      // Try multiple paths to find the schema file
      const possiblePaths = [
        // Development: relative to project root
        path.resolve(process.cwd(), 'beat-definitions/core-beats.json'),
        path.resolve(process.cwd(), '../beat-definitions/core-beats.json'),
        path.resolve(process.cwd(), '../../beat-definitions/core-beats.json'),
        // Production: relative to built files (ESM compatible)
        path.resolve(currentDir, '../../../../beat-definitions/core-beats.json'),
        path.resolve(currentDir, '../../../../../beat-definitions/core-beats.json'),
        // Fallback: public directory
        path.resolve(process.cwd(), 'public/beat-definitions/core-beats.json'),
        path.resolve(currentDir, '../../public/beat-definitions/core-beats.json'),
      ];

      let rawSchema: any = null;
      let foundPath = '';

      for (const schemaPath of possiblePaths) {
        if (fs.existsSync(schemaPath)) {
          const content = fs.readFileSync(schemaPath, 'utf-8');
          rawSchema = JSON.parse(content);
          foundPath = schemaPath;
          console.log(`[API] Loaded beat schema from: ${schemaPath}`);
          break;
        }
      }

      if (!rawSchema) {
        console.error('[API] Could not find beat-definitions/core-beats.json');
        return this.getFallbackSchema();
      }

      // Transform the raw schema into the API format for AI consumption
      this.beatSchemaCache = this.transformSchemaForAPI(rawSchema, foundPath);
      return this.beatSchemaCache;

    } catch (error) {
      console.error('[API] Failed to load beat schema:', error);
      return this.getFallbackSchema();
    }
  }

  /**
   * Transform the raw beat-definitions schema into the API format
   * that Claude Desktop and other AI assistants expect
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
        parameters: this.transformParameters(def.parameters || {}),
      };

      // Add example if available
      if (def.example) {
        beatTypes[beatType].example = def.example;
      }

      // Preserve v2.3 normalize/validate metadata. Without this, the
      // schema-driven pipeline (packages/core/src/normalize/) sees the
      // slimmed view and can't flatten nested condition objects, apply
      // aliases, or coerce primitives. The web AIValidator falls back
      // to the static file first, but Claude Desktop and other clients
      // hitting /api/schema/beats need the full metadata too.
      if (def.nested) beatTypes[beatType].nested = def.nested;
    }

    // Include custom types documentation
    const customTypes: Record<string, any> = {};
    for (const [typeName, typeDef] of Object.entries(rawSchema.customTypes || {})) {
      const def = typeDef as any;
      customTypes[typeName] = {
        description: def.description || '',
        schema: def.schema || {},
        notes: def.notes || '',
      };
    }

    return {
      version: rawSchema.schema || '2.2.0',
      description: 'ASAPS Beat Types - Use these to create interactive narratives',
      source: 'Loaded from beat-definitions/core-beats.json (single source of truth)',
      loadedFrom: sourcePath,

      beatTypes,
      customTypes,

      // v0.9.51+ — per-condition-type required/optional/aliases used by
      // the schema-driven normalize pipeline. Pass through verbatim.
      conditionTypes: rawSchema.conditionTypes || undefined,

      connectionFormat: {
        description: 'How to specify connections between beats',
        format: {
          source: 'string - source beat ID',
          target: 'string - target beat ID',
          label: 'string? - optional connection label',
        },
        rules: {
          single: 'Beats with connectionType="single" can ONLY have ONE connection in the connections array.',
          multiple: 'Beats with connectionType="multiple" define targets in their PARAMETERS (choices[].target, props[].target, etc.), NOT in the connections array.',
          conditional: 'conditionBeat uses trueTarget and falseTarget PARAMETERS, not connections array.',
        },
        note: 'IMPORTANT: Do NOT put multiple connections for single-type beats. For branching, use dialogTree or movementChoice instead of multiple connections from infoText.',
      },

      storyStructure: {
        description: 'Complete story structure for injection',
        format: {
          metadata: {
            title: 'string',
            author: 'string',
            description: 'string?',
          },
          beats: 'array of beat objects (see beatTypes above)',
          connections: 'array of { source, target, label? }',
          characters: 'array of { id, name, displayName? }?',
          environment: '{ props: [], nodes: [] }?',
        },
      },

      tips: [
        'CRITICAL: Start with a titleScreen beat as beat_0 - NEVER start with infoText!',
        'Use infoText for narration and scene-setting (single connection only!)',
        'Use dialogTree for character conversations with choices',
        'dialogTree, movementChoice, and pickProp support "choiceDelay" parameter (seconds before showing choices)',
        'DialogTree choices can modify counters directly with counter/counterOperation/counterValue',
        'Use movementChoice for exploration/navigation branching',
        'IMPORTANT: For branching story points, use dialogTree or movementChoice - NEVER multiple connections from infoText',
        'End branches with endScreen beats - ALWAYS set showRestart: true so player can replay!',
        'Position beats using x, y coordinates (grid: ~300px horizontal, ~200px vertical spacing)',
        'Use meaningful beat IDs like "beat_0", "beat_1", etc.',
        'CRITICAL - Counter Threshold Reachability: Before using conditionBeat to check a counter threshold (e.g., score >= 3), count ALL places where that counter can be increased and ensure the threshold is reachable. If you have 2 choices that each add +1, max is 2, so >= 3 is IMPOSSIBLE. Always provide 1-2 MORE increment opportunities than the highest threshold requires.',
        'CRITICAL - NO DUPLICATE CONNECTIONS: For dialogTree, movementChoice, pickProp - targets are ONLY in choices[].target or props[].target. Do NOT also add a "connections" array - that creates duplicates!',
        'CRITICAL - inputText is for GETTING player input (names, passwords). To DISPLAY text, use infoText instead!',
        'CRITICAL - Never chain identical single-item pickProps (e.g., Shovel → Shovel → Shovel). One pickProp to pick up an item is fine, then move to different content.',
        'CRITICAL - GENERATE ALL BEATS: Every target ID you reference MUST have a beat with that ID. If a choice targets "beat_22", you MUST include beat_22. Never stop generating early!',
        'All beats support an optional "notes" field for author annotations (not shown to players). Use notes to: suggest visual assets, mark areas needing review, explain narrative intent, or flag TODOs for the human author.',
      ],
    };
  }

  /**
   * Transform parameters from schema format to API format
   */
  private transformParameters(params: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};

    for (const [paramName, paramDef] of Object.entries(params)) {
      const def = paramDef as any;
      result[paramName] = {
        type: def.type || 'string',
        required: def.required !== false && !def.type?.endsWith('?'),
        description: def.description || '',
      };

      if (def.default !== undefined) {
        result[paramName].default = def.default;
      }
      if (def.enum) {
        result[paramName].enum = def.enum;
      }
      // Preserve v2.3 normalize/validate metadata so the schema-driven
      // pipeline can flatten / alias / coerce when reading from the
      // API endpoint.
      if (def.aliases) {
        result[paramName].aliases = def.aliases;
      }
      if (def.coerce) {
        result[paramName].coerce = def.coerce;
      }
      if (def.references) {
        result[paramName].references = def.references;
      }
    }

    return result;
  }

  /**
   * Fallback schema if file cannot be loaded
   */
  private getFallbackSchema(): any {
    return {
      version: '2.2.0',
      description: 'ASAPS Beat Types (fallback - could not load from file)',
      error: 'Could not load beat-definitions/core-beats.json',
      beatTypes: {},
      tips: ['Schema file not found - please check installation'],
    };
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
        // @types/express 5 widens req.params.X to string | string[] —
        // URL path params can never actually be arrays in Express
        // (only repeated query params can), so the cast is safe.
        const project = await ctx.storage.loadProject(req.params.id as string);
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
        await ctx.storage.deleteProject(req.params.id as string);

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

        const project = await ctx.storage.loadProject(projectId as string);
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
        const assets = await ctx.storage.listAssets(req.params.projectId as string);
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
        const info = await ctx.storage.loadAssetInfo(req.params.assetId as string);
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
        await ctx.storage.deleteAsset(req.params.assetId as string);

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

    /**
     * Inject story structure into the running ASAPS Builder
     * This is the main endpoint for Claude Desktop MCP integration
     *
     * POST /api/stories/inject
     * Body: {
     *   metadata: { title, author, description },
     *   beats: [{ id, type, name, parameters, x, y }],
     *   connections: [{ source, target, label }],
     *   characters?: [...],
     *   environment?: { props: [], nodes: [] }
     * }
     */
    router.post('/inject', async (req: Request, res: Response) => {
      try {
        const { metadata, beats, connections, characters, environment } = req.body;

        // Validate required fields
        if (!beats || !Array.isArray(beats)) {
          return res.status(400).json({
            error: 'Invalid request: beats array is required',
          });
        }

        const injectionId = `inject_${Date.now()}`;
        console.log(`[API] Injecting story: "${metadata?.title || 'Untitled'}" with ${beats.length} beats (id: ${injectionId})`);
        console.log(`[API] WebSocket clients connected: ${this.wss?.clients?.size || 0}`);

        // Broadcast the story to all connected WebSocket clients
        // The ASAPS Builder will receive this and update its state
        this.broadcast('story:inject', {
          metadata: metadata || { title: 'Injected Story', author: 'Claude Desktop' },
          beats,
          connections: connections || [],
          characters: characters || [],
          environment: environment || { props: [], nodes: [] },
          injectedAt: new Date().toISOString(),
        });

        res.status(200).json({
          success: true,
          message: `Story "${metadata?.title || 'Untitled'}" injected successfully`,
          beatsCount: beats.length,
          connectionsCount: connections?.length || 0,
        });
      } catch (error) {
        console.error('[API] Story injection failed:', error);
        res.status(500).json({ error: (error as Error).message });
      }
    });

    /**
     * Get current story state from connected Builder
     * Broadcasts a request and waits for response
     */
    router.get('/current', async (req: Request, res: Response) => {
      try {
        // Request current state from connected clients
        this.broadcast('story:request-state', {
          requestId: Date.now().toString(),
        });

        // For now, return a message - actual implementation would use
        // a request/response pattern with WebSocket
        res.json({
          message: 'State request broadcast to connected clients',
          note: 'Connect via WebSocket to receive real-time state updates',
        });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    return router;
  }

  /**
   * Create schema routes - provides beat type documentation for AI assistants
   * Now loads from beat-definitions/core-beats.json as single source of truth
   */
  private createSchemaRoutes(ctx: APIContext): express.Router {
    const router = express.Router();

    /**
     * Get all beat type definitions
     * Used by Claude Desktop to understand ASAPS beat structure
     * Loads from beat-definitions/core-beats.json (single source of truth)
     */
    router.get('/beats', async (req: Request, res: Response) => {
      try {
        const beatSchema = this.loadBeatSchema();
        res.json(beatSchema);
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    /**
     * Get example story structure
     */
    router.get('/example', async (req: Request, res: Response) => {
      const exampleStory = {
        metadata: {
          title: 'The Crossroads Decision',
          author: 'Claude Desktop',
          description: 'A short interactive narrative demonstrating ASAPS beat types with characters and speakers',
        },
        characters: [
          {
            id: 'char_traveler',
            name: 'Traveler',
            displayName: 'Traveler',
            role: 'player',
            counters: [],
            inventory: [],
          },
          {
            id: 'char_guide',
            name: 'Old Guide',
            displayName: 'Old Guide',
            role: 'npc',
            counters: [],
            inventory: [],
          },
        ],
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
            speaker: 'Old Guide',
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
            speaker: 'Old Guide',
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

      res.json(exampleStory);
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
        const { baseUrl: providedBaseUrl, apiKey, ...requestBody } = req.body;

        if (!apiKey) {
          return res.status(400).json({
            error: 'Missing required parameter: apiKey'
          });
        }

        // Use default Anthropic URL if not provided
        const baseUrl = providedBaseUrl || 'https://api.anthropic.com';

        // Determine the full endpoint URL
        // If baseUrl already contains '/messages', use it as-is
        // Otherwise, append '/v1/messages' (standard Anthropic path)
        let endpoint = baseUrl;
        if (!baseUrl.includes('/messages')) {
          endpoint = `${baseUrl.replace(/\/$/, '')}/v1/messages`;
        }

        console.log(`[AI Proxy] Claude request to: ${endpoint}`);

        // Use AbortController with generous timeout for AI generation (5 minutes)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000);

        try {
          // Make the actual request to the third-party API
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          // Read the response as text first, then parse
          // This handles large responses better than response.json()
          const text = await response.text();

          if (!response.ok) {
            try {
              const errorData = JSON.parse(text);
              return res.status(response.status).json(errorData);
            } catch {
              return res.status(response.status).json({ error: text });
            }
          }

          try {
            const data = JSON.parse(text);
            res.json(data);
          } catch (parseError) {
            console.error('[AI Proxy] Failed to parse response:', text.substring(0, 500));
            res.status(500).json({
              error: 'Failed to parse AI response',
              message: 'The response could not be parsed as JSON',
              responsePreview: text.substring(0, 1000),
            });
          }
        } finally {
          clearTimeout(timeoutId);
        }
      } catch (error) {
        console.error('[AI Proxy] Claude error:', error);
        const isTimeout = error instanceof Error && error.name === 'AbortError';
        res.status(isTimeout ? 504 : 500).json({
          error: isTimeout ? 'Request timeout' : 'Proxy request failed',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Proxy for OpenAI-compatible APIs
    router.post('/openai', async (req: Request, res: Response) => {
      try {
        // _endpoint: 'responses' routes to OpenAI's Responses API
        // (pro-mode reasoning, GPT-5.6). Proxy metadata — stripped here.
        const { baseUrl: providedBaseUrl, apiKey, _endpoint, ...requestBody } = req.body;

        if (!apiKey) {
          return res.status(400).json({
            error: 'Missing required parameter: apiKey'
          });
        }

        // Use default OpenAI URL if not provided
        const baseUrl = providedBaseUrl || 'https://api.openai.com/v1';

        // Determine the full endpoint URL
        // If baseUrl already contains '/completions', use it as-is
        // Otherwise, append '/chat/completions' (standard OpenAI path)
        let endpoint = baseUrl;
        if (_endpoint === 'responses') {
          endpoint = `${baseUrl.replace(/\/$/, '')}/responses`;
        } else if (!baseUrl.includes('/completions')) {
          endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
        }

        console.log(`[AI Proxy] OpenAI request to: ${endpoint}`);

        // Use AbortController with generous timeout for AI generation (5 minutes)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000);

        try {
          // Make the actual request to the third-party API
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

          // Read the response as text first, then parse
          // This handles large responses better than response.json()
          const text = await response.text();

          if (!response.ok) {
            try {
              const errorData = JSON.parse(text);
              return res.status(response.status).json(errorData);
            } catch {
              return res.status(response.status).json({ error: text });
            }
          }

          try {
            const data = JSON.parse(text);
            res.json(data);
          } catch (parseError) {
            console.error('[AI Proxy] Failed to parse response:', text.substring(0, 500));
            res.status(500).json({
              error: 'Failed to parse AI response',
              message: 'The response could not be parsed as JSON',
              responsePreview: text.substring(0, 1000),
            });
          }
        } finally {
          clearTimeout(timeoutId);
        }
      } catch (error) {
        console.error('[AI Proxy] OpenAI error:', error);
        const isTimeout = error instanceof Error && error.name === 'AbortError';
        res.status(isTimeout ? 504 : 500).json({
          error: isTimeout ? 'Request timeout' : 'Proxy request failed',
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

    let clientCount = 0;
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
        clientCount++;
      }
    });

    console.log(`[API] Broadcast '${event}' to ${clientCount} client(s)`);
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
