#!/usr/bin/env node
/**
 * ASAPS MCP Server
 *
 * Model Context Protocol server for AI-assisted story creation
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, } from '@modelcontextprotocol/sdk/types.js';
import { generateStoryTool, handleGenerateStory } from './tools/generateStory.js';
import { writeDialogTool, handleWriteDialog } from './tools/writeDialog.js';
import { suggestBeatsTool, handleSuggestBeats } from './tools/suggestBeats.js';
import { createBeatTool, handleCreateBeat } from './tools/createBeat.js';
import { getStoryContextTool, handleGetStoryContext } from './tools/getStoryContext.js';
import { applyStoryChangesTool, handleApplyStoryChanges } from './tools/applyStoryChanges.js';
/**
 * All available tools
 */
const tools = [
    generateStoryTool,
    writeDialogTool,
    suggestBeatsTool,
    createBeatTool,
    getStoryContextTool,
    applyStoryChangesTool,
];
/**
 * Initialize MCP server
 */
async function main() {
    console.error('[ASAPS MCP] Starting server...');
    // Create server instance
    const server = new Server({
        name: 'asaps-ai',
        version: '1.0.0',
    }, {
        capabilities: {
            tools: {},
        },
    });
    // Handle tool listing
    server.setRequestHandler(ListToolsRequestSchema, async () => {
        console.error('[ASAPS MCP] Listing tools');
        return { tools };
    });
    // Handle tool execution
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        console.error(`[ASAPS MCP] Executing tool: ${name}`);
        console.error(`[ASAPS MCP] Arguments:`, JSON.stringify(args, null, 2));
        try {
            let result;
            switch (name) {
                case 'generate_story':
                    result = await handleGenerateStory(args);
                    break;
                case 'write_dialog':
                    result = await handleWriteDialog(args);
                    break;
                case 'suggest_beats':
                    result = await handleSuggestBeats(args);
                    break;
                case 'create_beat':
                    result = await handleCreateBeat(args);
                    break;
                case 'get_story_context':
                    result = await handleGetStoryContext(args);
                    break;
                case 'apply_story_changes':
                    result = await handleApplyStoryChanges(args);
                    break;
                default:
                    throw new Error(`Unknown tool: ${name}`);
            }
            console.error(`[ASAPS MCP] Tool execution successful`);
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(result, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            console.error(`[ASAPS MCP] Tool execution failed:`, error);
            return {
                content: [
                    {
                        type: 'text',
                        text: `Error: ${error instanceof Error ? error.message : String(error)}`,
                    },
                ],
                isError: true,
            };
        }
    });
    // Start server with stdio transport
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('[ASAPS MCP] Server running');
}
// Run server
main().catch((error) => {
    console.error('[ASAPS MCP] Fatal error:', error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map