#!/usr/bin/env node

/**
 * ASAPS MCP Server for Claude Desktop
 *
 * Model Context Protocol server that enables Claude Desktop to directly
 * create and inject stories into a running ASAPS Builder instance.
 *
 * Unlike the AI-powered MCP server, this one requires NO API keys.
 * Claude Desktop does all the reasoning - this server just provides:
 * - Beat schema documentation
 * - Example stories
 * - Story injection endpoint
 *
 * Architecture:
 * Claude Desktop <-> MCP Server <-> ASAPS Builder (localhost:3001)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

// Configuration
const ASAPS_API_URL = process.env.ASAPS_API_URL || 'http://localhost:3001';

/**
 * HTTP client for ASAPS Builder API
 */
async function fetchAPI(endpoint: string, options: RequestInit = {}): Promise<any> {
  const url = `${ASAPS_API_URL}${endpoint}`;
  console.error(`[ASAPS MCP Desktop] Fetching: ${url}`);

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error && error.message.includes('fetch failed')) {
      throw new Error(
        `Cannot connect to ASAPS Builder at ${ASAPS_API_URL}. ` +
        'Make sure the Builder is running with API server enabled.'
      );
    }
    throw error;
  }
}

// ============================================================================
// Tool Definitions
// ============================================================================

/**
 * Check if ASAPS Builder is running and accessible
 */
const checkConnectionTool: Tool = {
  name: 'asaps_check_connection',
  description:
    'Check if the ASAPS Builder is running and accessible. ' +
    'Call this first to verify the connection before creating stories.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

/**
 * Get comprehensive beat type schema
 */
const getBeatSchemaTool: Tool = {
  name: 'asaps_get_beat_schema',
  description:
    'Get the complete schema for all ASAPS beat types. ' +
    'This tells you what beat types are available, their parameters, ' +
    'and how to structure story data. Call this before creating a story.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

/**
 * Get an example story structure
 */
const getExampleStoryTool: Tool = {
  name: 'asaps_get_example_story',
  description:
    'Get an example story structure showing the correct format ' +
    'for beats, connections, and metadata. Use this as a template.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

/**
 * Inject a complete story into ASAPS Builder
 */
const injectStoryTool: Tool = {
  name: 'asaps_inject_story',
  description:
    'Inject a complete interactive story into the running ASAPS Builder. ' +
    'The story will immediately appear in the visual editor. ' +
    'Use the beat schema and example to structure your story correctly.',
  inputSchema: {
    type: 'object',
    properties: {
      metadata: {
        type: 'object',
        description: 'Story metadata',
        properties: {
          title: { type: 'string', description: 'Story title' },
          author: { type: 'string', description: 'Author name' },
          description: { type: 'string', description: 'Story description' },
        },
        required: ['title'],
      },
      beats: {
        type: 'array',
        description: 'Array of beat objects. Each beat needs: id, type, name, parameters, x, y',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Unique beat ID (e.g., "beat_0", "beat_1")' },
            type: {
              type: 'string',
              description: 'Beat type (titleScreen, introText, dialogTree, movementChoice, pickProp, endScreen, etc.)',
            },
            name: { type: 'string', description: 'Display name in editor' },
            parameters: {
              type: 'object',
              description: 'Beat-specific parameters (varies by type)',
            },
            x: { type: 'number', description: 'X position in editor (use ~300px spacing)' },
            y: { type: 'number', description: 'Y position in editor (use ~200px spacing)' },
          },
          required: ['id', 'type', 'parameters'],
        },
      },
      connections: {
        type: 'array',
        description: 'Array of connections between beats',
        items: {
          type: 'object',
          properties: {
            source: { type: 'string', description: 'Source beat ID' },
            target: { type: 'string', description: 'Target beat ID' },
            label: { type: 'string', description: 'Optional connection label' },
          },
          required: ['source', 'target'],
        },
      },
      characters: {
        type: 'array',
        description: 'Optional array of character definitions',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            displayName: { type: 'string' },
          },
        },
      },
    },
    required: ['metadata', 'beats'],
  },
};

// All tools
const tools: Tool[] = [
  checkConnectionTool,
  getBeatSchemaTool,
  getExampleStoryTool,
  injectStoryTool,
];

// ============================================================================
// Tool Handlers
// ============================================================================

async function handleCheckConnection(): Promise<any> {
  try {
    const health = await fetchAPI('/health');
    return {
      success: true,
      connected: true,
      status: health.status,
      websocket: health.websocket,
      message: 'ASAPS Builder is running and ready to receive stories.',
      apiUrl: ASAPS_API_URL,
    };
  } catch (error) {
    return {
      success: false,
      connected: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message:
        'Cannot connect to ASAPS Builder. Please start the builder with API server enabled:\n' +
        '  cd packages/builder && npm run api:start',
      apiUrl: ASAPS_API_URL,
    };
  }
}

async function handleGetBeatSchema(): Promise<any> {
  try {
    const schema = await fetchAPI('/api/schema/beats');
    return {
      success: true,
      schema,
      message:
        'Beat schema retrieved. Use these beat types and parameters to create your story.',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Failed to get beat schema. Is ASAPS Builder running?',
    };
  }
}

async function handleGetExampleStory(): Promise<any> {
  try {
    const example = await fetchAPI('/api/schema/example');
    return {
      success: true,
      example,
      message:
        'Example story retrieved. Use this as a template for your story structure.',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Failed to get example story. Is ASAPS Builder running?',
    };
  }
}

async function handleInjectStory(args: any): Promise<any> {
  const { metadata, beats, connections, characters } = args;

  // Log injection attempt with timestamp for debugging duplicates
  const injectionTimestamp = new Date().toISOString();
  console.error(`[ASAPS MCP Desktop] handleInjectStory called at ${injectionTimestamp}`);
  console.error(`[ASAPS MCP Desktop] Story title: "${metadata?.title}", beats: ${beats?.length || 0}`);

  // Validate required fields
  if (!metadata?.title) {
    return {
      success: false,
      error: 'metadata.title is required',
      message: 'Please provide a title for your story.',
    };
  }

  if (!beats || !Array.isArray(beats) || beats.length === 0) {
    return {
      success: false,
      error: 'beats array is required and must not be empty',
      message: 'Please provide at least one beat for your story.',
    };
  }

  // Validate beat structure
  for (let i = 0; i < beats.length; i++) {
    const beat = beats[i];
    if (!beat.id) {
      return {
        success: false,
        error: `Beat at index ${i} is missing required field: id`,
        message: 'Every beat needs a unique ID (e.g., "beat_0", "beat_1").',
      };
    }
    if (!beat.type) {
      return {
        success: false,
        error: `Beat "${beat.id}" is missing required field: type`,
        message: 'Every beat needs a type (e.g., "titleScreen", "introText").',
      };
    }
  }

  try {
    console.error(`[ASAPS MCP Desktop] Sending POST to /api/stories/inject...`);
    const result = await fetchAPI('/api/stories/inject', {
      method: 'POST',
      body: JSON.stringify({
        metadata,
        beats,
        connections: connections || [],
        characters: characters || [],
      }),
    });

    console.error(`[ASAPS MCP Desktop] Injection API response:`, JSON.stringify(result));

    return {
      success: true,
      data: result,
      message:
        `Story "${metadata.title}" successfully injected into ASAPS Builder! ` +
        `Created ${beats.length} beats and ${connections?.length || 0} connections. ` +
        'Check the Builder window to see your story.',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message:
        'Failed to inject story. Make sure ASAPS Builder is running ' +
        'and the API server is enabled.',
    };
  }
}

// ============================================================================
// Main Server
// ============================================================================

async function main() {
  console.error('[ASAPS MCP Desktop] Starting server...');
  console.error(`[ASAPS MCP Desktop] API URL: ${ASAPS_API_URL}`);

  const server = new Server(
    {
      name: 'asaps-desktop',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    console.error('[ASAPS MCP Desktop] Listing tools');
    return { tools };
  });

  // Execute tools
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    console.error(`[ASAPS MCP Desktop] Executing: ${name}`);
    if (args && Object.keys(args).length > 0) {
      console.error(`[ASAPS MCP Desktop] Args: ${JSON.stringify(args, null, 2)}`);
    }

    try {
      let result: any;

      switch (name) {
        case 'asaps_check_connection':
          result = await handleCheckConnection();
          break;

        case 'asaps_get_beat_schema':
          result = await handleGetBeatSchema();
          break;

        case 'asaps_get_example_story':
          result = await handleGetExampleStory();
          break;

        case 'asaps_inject_story':
          result = await handleInjectStory(args);
          break;

        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      console.error(`[ASAPS MCP Desktop] Result: ${result.success ? 'success' : 'failed'}`);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      console.error(`[ASAPS MCP Desktop] Error:`, error);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
            }, null, 2),
          },
        ],
        isError: true,
      };
    }
  });

  // Start server
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('[ASAPS MCP Desktop] Server running');
}

main().catch((error) => {
  console.error('[ASAPS MCP Desktop] Fatal error:', error);
  process.exit(1);
});
