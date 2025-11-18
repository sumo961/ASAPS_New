/**
 * Get Story Context Tool
 *
 * MCP tool for reading current story state
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const getStoryContextTool: Tool = {
  name: 'get_story_context',
  description: 'Get the current story state including beats, variables, and metadata',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

export async function handleGetStoryContext(args: any): Promise<any> {
  console.error(`[getStoryContext] Retrieving story context`);

  // TODO: Read from IndexedDB
  // For now, return placeholder

  return {
    success: true,
    data: {
      metadata: {
        title: 'Current Story',
        author: 'User',
      },
      beats: [],
      variables: [],
      characters: [],
      beatCount: 0,
    },
    message: 'Story context retrieved (placeholder)',
  };
}
