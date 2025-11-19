/**
 * Write Dialog Tool
 *
 * MCP tool for generating dialogue trees
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { generateDialog } from '../utils/aiHelper.js';

export const writeDialogTool: Tool = {
  name: 'write_dialog',
  description: 'Generate a branching dialogue tree for character conversations using AI',
  inputSchema: {
    type: 'object',
    properties: {
      scene: {
        type: 'string',
        description: 'Description of the scene or conversation context',
      },
      character: {
        type: 'string',
        description: 'Name of the speaking character',
      },
      goal: {
        type: 'string',
        description: 'Goal or purpose of the conversation',
      },
      branchingFactor: {
        type: 'number',
        description: 'Number of player choices to include',
        minimum: 2,
        maximum: 5,
      },
      context: {
        type: 'string',
        description: 'Additional context or requirements',
      },
    },
    required: ['scene'],
  },
};

export async function handleWriteDialog(args: any): Promise<any> {
  const { scene, character, goal, branchingFactor = 3, context } = args;

  if (!scene || typeof scene !== 'string') {
    return {
      success: false,
      error: 'Scene description is required',
      message: 'Invalid scene description',
    };
  }

  console.error(`[writeDialog] Generating dialog for scene: "${scene}"`);

  try {
    const dialog = await generateDialog({
      scene,
      character,
      goal,
      branchingFactor,
      context,
    });

    console.error(`[writeDialog] Generated dialog beat`);

    return {
      success: true,
      data: dialog,
      message: `Dialog generated successfully for scene: ${scene}`,
    };
  } catch (error) {
    console.error('[writeDialog] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Failed to generate dialog',
    };
  }
}
