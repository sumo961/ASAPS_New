/**
 * Suggest Beats Tool
 *
 * MCP tool for suggesting next beats
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const suggestBeatsTool: Tool = {
  name: 'suggest_beats',
  description: 'Suggest logical next beats based on current story context',
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

  if (!currentBeatId) {
    throw new Error('Current beat ID is required');
  }

  console.error(`[suggestBeats] Suggesting beats after: ${currentBeatId}`);

  // Placeholder response
  const suggestions = Array.from({ length: count }, (_, i) => ({
    beatType: ['dialogTree', 'movementChoice', 'pickProp'][i % 3],
    name: `Suggested Beat ${i + 1}`,
    reasoning: `This beat would logically follow ${currentBeatId}`,
    parameters: {},
    connections: [],
    confidence: 0.8 - i * 0.1,
    position: { x: 100 * (i + 1), y: 200 },
  }));

  return {
    success: true,
    data: { suggestions },
    message: `Generated ${count} beat suggestions`,
  };
}
