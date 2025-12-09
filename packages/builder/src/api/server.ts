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
   */
  private createSchemaRoutes(ctx: APIContext): express.Router {
    const router = express.Router();

    /**
     * Get all beat type definitions
     * Used by Claude Desktop to understand ASAPS beat structure
     */
    router.get('/beats', async (req: Request, res: Response) => {
      try {
        // Return comprehensive beat schema for AI consumption
        const beatSchema = {
          version: '2.2.0',
          description: 'ASAPS Beat Types - Use these to create interactive narratives',

          beatTypes: {
            // Visible beats (user-facing)
            titleScreen: {
              category: 'visible',
              description: 'Opening title screen with start button',
              connectionType: 'single',
              parameters: {
                title: { type: 'string', required: true, description: 'Story title text' },
                author: { type: 'string', required: false, description: 'Author name' },
                buttonText: { type: 'string', required: false, default: 'Start', description: 'Start button text' },
                defaultTarget: { type: 'string', required: false, description: 'Beat ID for timed auto-advance (optional)' },
                defaultTargetTimeout: { type: 'number', required: false, description: 'Timeout in ms before auto-advance (optional)' },
              },
              example: {
                id: 'beat_0',
                type: 'titleScreen',
                name: 'Title',
                parameters: { title: 'My Story', author: 'Author Name', buttonText: 'Begin' },
                x: 100, y: 100,
              },
            },

            introText: {
              category: 'visible',
              description: 'Text display with continue button - use for narration. For branching, use movementChoice or dialogTree instead.',
              connectionType: 'single',
              parameters: {
                text: { type: 'string', required: true, description: 'Text content to display' },
                buttonText: { type: 'string', required: false, default: 'Continue', description: 'Continue button text' },
                defaultTarget: { type: 'string', required: false, description: 'Beat ID for timed auto-advance (optional)' },
                defaultTargetTimeout: { type: 'number', required: false, description: 'Timeout in ms before auto-advance (optional)' },
              },
              example: {
                id: 'beat_1',
                type: 'introText',
                name: 'Introduction',
                parameters: { text: 'Welcome to the story...', buttonText: 'Continue' },
                x: 400, y: 100,
              },
            },

            dialogTree: {
              category: 'visible',
              description: 'Branching conversation with character dialogue and player choices. Targets are in dialogTree.choices[].target, NOT in connections array.',
              connectionType: 'multiple',
              parameters: {
                dialogTree: {
                  type: 'object',
                  required: true,
                  description: 'Root dialog node with nested conversation tree',
                  schema: {
                    id: 'string',
                    speaker: 'string - character name',
                    text: 'string - what they say',
                    emotion: 'string? - optional emotion',
                    choices: 'array of { id, text, target (beatId or nested node) }',
                    next: 'string (beatId) or nested dialogNode',
                  },
                },
                defaultTarget: { type: 'string', required: false, description: 'Beat ID for timed auto-advance if no choice made (optional)' },
                defaultTargetTimeout: { type: 'number', required: false, description: 'Timeout in ms before auto-advance (optional)' },
              },
              example: {
                id: 'beat_2',
                type: 'dialogTree',
                name: 'Conversation',
                parameters: {
                  dialogTree: {
                    id: 'node_0',
                    speaker: 'Guard',
                    text: 'Halt! Who goes there?',
                    choices: [
                      { id: 'c1', text: 'I am a friend', target: 'beat_3' },
                      { id: 'c2', text: 'None of your business', target: 'beat_4' },
                    ],
                  },
                },
                x: 700, y: 100,
              },
            },

            movementChoice: {
              category: 'visible',
              description: 'Location-based navigation - player chooses where to go. Targets are in choices[].target, NOT in connections array.',
              connectionType: 'multiple',
              parameters: {
                question: { type: 'string', required: true, description: 'Prompt text' },
                choices: {
                  type: 'array',
                  required: true,
                  description: 'Array of movement options',
                  itemSchema: {
                    id: 'string',
                    text: 'string - choice text',
                    location: 'string - location name',
                    target: 'string - target beat ID',
                  },
                },
                defaultTarget: { type: 'string', required: false, description: 'Beat ID for timed auto-advance if no choice made (optional)' },
                defaultTargetTimeout: { type: 'number', required: false, description: 'Timeout in ms before auto-advance (optional)' },
              },
              example: {
                id: 'beat_3',
                type: 'movementChoice',
                name: 'Crossroads',
                parameters: {
                  question: 'Which path do you take?',
                  choices: [
                    { id: 'c1', text: 'Go left', location: 'Forest Path', target: 'beat_5' },
                    { id: 'c2', text: 'Go right', location: 'Mountain Road', target: 'beat_6' },
                  ],
                },
                x: 400, y: 300,
              },
            },

            pickProp: {
              category: 'visible',
              description: 'Interactive object selection - player picks up or interacts with items. Targets are in props[].target, NOT in connections array.',
              connectionType: 'multiple',
              parameters: {
                question: { type: 'string', required: true, description: 'Prompt text' },
                props: {
                  type: 'array',
                  required: true,
                  description: 'Array of interactive props',
                  itemSchema: {
                    id: 'string',
                    name: 'string - prop name',
                    description: 'string - prop description',
                    target: 'string - target beat ID',
                  },
                },
                defaultTarget: { type: 'string', required: false, description: 'Beat ID for timed auto-advance if no choice made (optional)' },
                defaultTargetTimeout: { type: 'number', required: false, description: 'Timeout in ms before auto-advance (optional)' },
              },
            },

            hyperText: {
              category: 'visible',
              description: 'Text with clickable hyperlinked words that branch to different beats. Targets are in hyperlinks[].targetBeatId, NOT in connections array.',
              connectionType: 'multiple',
              parameters: {
                text: { type: 'string', required: true, description: 'Main text with hyperlinked words' },
                hyperlinks: {
                  type: 'array',
                  required: true,
                  description: 'Array of hyperlink definitions',
                  itemSchema: {
                    word: 'string - the clickable word',
                    targetBeatId: 'string - target beat ID',
                  },
                },
                defaultTarget: { type: 'string', required: false, description: 'Beat ID for timed auto-advance if no link clicked (optional)' },
                defaultTargetTimeout: { type: 'number', required: false, description: 'Timeout in ms before auto-advance (optional)' },
              },
            },

            durScreen: {
              category: 'visible',
              description: 'Timed display that auto-advances after duration. Does NOT support defaultTarget (already auto-advances by design).',
              connectionType: 'single',
              parameters: {
                text: { type: 'string', required: true, description: 'Text to display' },
                duration: { type: 'number', required: true, description: 'Duration in milliseconds' },
              },
            },

            inputText: {
              category: 'visible',
              description: 'Prompts user for text input, stores in variable',
              connectionType: 'single',
              parameters: {
                prompt: { type: 'string', required: true, description: 'Question/prompt text' },
                saveToType: { type: 'string', required: true, enum: ['variable', 'characterName'] },
                variable: { type: 'string', required: false, description: 'Variable name to store input' },
                placeholder: { type: 'string', required: false, description: 'Placeholder text' },
                defaultTarget: { type: 'string', required: false, description: 'Beat ID for timed auto-advance if no input provided (optional)' },
                defaultTargetTimeout: { type: 'number', required: false, description: 'Timeout in ms before auto-advance (optional)' },
              },
            },

            videoBeat: {
              category: 'visible',
              description: 'Video playback',
              connectionType: 'single',
              parameters: {
                videoFile: { type: 'string', required: true, description: 'Path to video file' },
                autoplay: { type: 'boolean', required: false, default: true },
                controls: { type: 'boolean', required: false, default: false },
                defaultTarget: { type: 'string', required: false, description: 'Beat ID for timed auto-advance (optional)' },
                defaultTargetTimeout: { type: 'number', required: false, description: 'Timeout in ms before auto-advance (optional)' },
              },
            },

            endScreen: {
              category: 'visible',
              description: 'Story ending screen',
              connectionType: 'single',
              parameters: {
                message: { type: 'string', required: false, description: 'Ending message' },
                showRestart: { type: 'boolean', required: false, default: true },
                showCredits: { type: 'boolean', required: false, default: false },
                defaultTarget: { type: 'string', required: false, description: 'Beat ID for timed auto-advance (optional, rare for endings)' },
                defaultTargetTimeout: { type: 'number', required: false, description: 'Timeout in ms before auto-advance (optional)' },
              },
              example: {
                id: 'beat_end',
                type: 'endScreen',
                name: 'The End',
                parameters: { message: 'Thanks for playing!', showRestart: true },
                x: 700, y: 500,
              },
            },

            // Logic beats (invisible, for game logic)
            setVariable: {
              category: 'logic',
              description: 'Set or modify ONE story variable or counter per beat. IMPORTANT: Can only modify ONE variable at a time! To set multiple variables, use multiple consecutive setVariable beats chained together. Never name a beat with multiple operations (e.g., "Health +1, Score +2") - split into separate beats.',
              connectionType: 'single',
              parameters: {
                type: { type: 'string', required: true, enum: ['variable', 'counter'] },
                name: { type: 'string', required: true, description: 'Variable/counter name' },
                value: { type: 'any', required: true, description: 'New value' },
                operation: { type: 'string', required: false, enum: ['set', 'change', 'add', 'subtract'], default: 'set' },
              },
            },

            conditionBeat: {
              category: 'logic',
              description: 'Conditional branching based on variables/counters/inventory',
              connectionType: 'conditional',
              parameters: {
                conditionType: { type: 'string', required: true, enum: ['variable', 'counter', 'inventory', 'timer'] },
                variableName: { type: 'string', required: true, description: 'Variable/counter/item name' },
                operator: { type: 'string', required: true, enum: ['==', '!=', '>', '<', '>=', '<='] },
                value: { type: 'any', required: true, description: 'Value to compare against' },
                trueTarget: { type: 'string', required: true, description: 'Beat ID if condition is true' },
                falseTarget: { type: 'string', required: false, description: 'Beat ID if condition is false' },
              },
            },

            randomTarget: {
              category: 'logic',
              description: 'Randomly select next beat from choices',
              connectionType: 'multiple',
              parameters: {
                choices: {
                  type: 'array',
                  required: true,
                  description: 'Array of possible target beat IDs',
                },
              },
            },

            addRemoveInventory: {
              category: 'logic',
              description: 'Add, remove, or transfer inventory items',
              connectionType: 'single',
              parameters: {
                action: { type: 'string', required: true, enum: ['add', 'remove', 'transfer'] },
                item: { type: 'string', required: true, description: 'Item name' },
                character: { type: 'string', required: true, description: 'Character name' },
              },
            },

            setTimer: {
              category: 'logic',
              description: 'Set or clear a named timer',
              connectionType: 'single',
              parameters: {
                name: { type: 'string', required: true, description: 'Timer name' },
                value: { type: 'number', required: true, description: 'Duration in seconds (0 to clear)' },
                timerTarget: { type: 'string', required: true, description: 'Beat ID when timer expires' },
              },
            },
          },

          connectionFormat: {
            description: 'How to specify connections between beats',
            format: {
              source: 'string - source beat ID',
              target: 'string - target beat ID',
              label: 'string? - optional connection label',
            },
            rules: {
              single: 'Beats with connectionType="single" (titleScreen, introText, durScreen, videoBeat, endScreen, inputText, setVariable, addRemoveInventory, setTimer) can ONLY have ONE connection in the connections array.',
              multiple: 'Beats with connectionType="multiple" (dialogTree, movementChoice, pickProp, hyperText, randomTarget) define targets in their PARAMETERS (choices[].target, props[].target, etc.), NOT in the connections array.',
              conditional: 'conditionBeat uses trueTarget and falseTarget PARAMETERS, not connections array.',
            },
            note: 'IMPORTANT: Do NOT put multiple connections for single-type beats. For branching, use dialogTree or movementChoice instead of multiple connections from introText.',
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
            'Start with a titleScreen beat',
            'Use introText for narration and scene-setting (single connection only!)',
            'Use dialogTree for character conversations with choices',
            'Use movementChoice for exploration/navigation branching',
            'IMPORTANT: For branching story points, use dialogTree or movementChoice - NEVER multiple connections from introText',
            'End branches with endScreen beats',
            'Position beats using x, y coordinates (grid: ~300px horizontal, ~200px vertical spacing)',
            'Use meaningful beat IDs like "beat_0", "beat_1", etc.',
            'Most visible beats support optional defaultTarget/defaultTargetTimeout for timed auto-advance (except durScreen which already auto-advances)',
          ],
        };

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
            type: 'introText',
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
            type: 'introText',
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
            type: 'introText',
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
        const { baseUrl, apiKey, ...requestBody } = req.body;

        if (!baseUrl || !apiKey) {
          return res.status(400).json({
            error: 'Missing required parameters: baseUrl and apiKey'
          });
        }

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
        const { baseUrl, apiKey, ...requestBody } = req.body;

        if (!baseUrl || !apiKey) {
          return res.status(400).json({
            error: 'Missing required parameters: baseUrl and apiKey'
          });
        }

        // Determine the full endpoint URL
        // If baseUrl already contains '/completions', use it as-is
        // Otherwise, append '/chat/completions' (standard OpenAI path)
        let endpoint = baseUrl;
        if (!baseUrl.includes('/completions')) {
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
