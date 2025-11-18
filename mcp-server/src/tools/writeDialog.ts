/**
 * Write Dialog Tool
 *
 * MCP tool for generating dialogue trees
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const writeDialogTool: Tool = {
  name: 'write_dialog',
  description: 'Generate a branching dialogue tree for character conversations',
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
    },
    required: ['scene'],
  },
};

export async function handleWriteDialog(args: any): Promise<any> {
  const { scene, character, goal, branchingFactor = 3 } = args;

  if (!scene || typeof scene !== 'string') {
    throw new Error('Scene description is required');
  }

  console.error(`[writeDialog] Generating dialog for scene: "${scene}"`);

  // Placeholder response
  const response = {
    dialogTree: {
      id: 'root',
      speaker: character || 'Character',
      text: `[Dialog about: ${scene}]`,
      emotion: 'neutral',
      choices: Array.from({ length: branchingFactor }, (_, i) => ({
        id: `choice_${i + 1}`,
        text: `Response option ${i + 1}`,
        target: `end_${i + 1}`,
      })),
    },
    reasoning: `Generated ${branchingFactor}-choice dialog for scene: ${scene}`,
  };

  return {
    success: true,
    data: response,
    message: 'Dialog generated successfully (placeholder)',
  };
}
