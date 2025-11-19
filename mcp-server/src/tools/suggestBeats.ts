/**
 * Suggest Beats Tool
 *
 * MCP tool for suggesting next beats using AI
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { suggestBeats } from '../utils/aiHelper.js';

export const suggestBeatsTool: Tool = {
  name: 'suggest_beats',
  description: 'Suggest logical next beats based on current story context using AI',
  inputSchema: {
    type: 'object',
    properties: {
      currentBeatId: {
        type: 'string',
        description: 'ID of the current beat to suggest from',
      },
      count: {
        type: 'number',
        description: 'Number of suggestions to generate',
        minimum: 1,
        maximum: 10,
      },
    },
    required: ['currentBeatId'],
  },
};

export async function handleSuggestBeats(args: any): Promise<any> {
  const { currentBeatId, count = 3 } = args;

  if (!currentBeatId || typeof currentBeatId !== 'string') {
    return {
      success: false,
      error: 'Current beat ID is required',
      message: 'Invalid currentBeatId provided',
    };
  }

  console.error(`[suggestBeats] Suggesting ${count} beats after: ${currentBeatId}`);

  try {
    const result = await suggestBeats({
      currentBeatId,
      storyContext: {}, // TODO: Fetch from API in future enhancement
      count,
    });

    console.error(`[suggestBeats] Generated ${result.beats.length} suggestions`);

    return {
      success: true,
      data: result,
      message: `Generated ${result.beats.length} beat suggestions`,
    };
  } catch (error) {
    console.error('[suggestBeats] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Failed to suggest beats',
    };
  }
}
