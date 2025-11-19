/**
 * Create Beat Tool
 *
 * MCP tool for creating beats from natural language using AI
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { createBeatFromDescription } from '../utils/aiHelper.js';

export const createBeatTool: Tool = {
  name: 'create_beat',
  description: 'Create a beat from a natural language description using AI',
  inputSchema: {
    type: 'object',
    properties: {
      description: {
        type: 'string',
        description: 'Natural language description of the beat to create',
      },
    },
    required: ['description'],
  },
};

export async function handleCreateBeat(args: any): Promise<any> {
  const { description } = args;

  if (!description || typeof description !== 'string' || description.trim() === '') {
    return {
      success: false,
      error: 'Description is required and must be a non-empty string',
      message: 'Invalid description provided',
    };
  }

  console.error(`[createBeat] Creating beat from: "${description}"`);

  try {
    const beat = await createBeatFromDescription({
      description,
      context: undefined, // TODO: Add story context in future enhancement
    });

    console.error(`[createBeat] Generated beat of type: ${beat.type}`);

    return {
      success: true,
      data: {
        beat,
        interpretation: `Created ${beat.type} beat: ${beat.label}`,
      },
      message: `Beat created successfully: ${beat.label}`,
    };
  } catch (error) {
    console.error('[createBeat] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Failed to create beat',
    };
  }
}
