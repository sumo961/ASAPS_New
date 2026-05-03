/**
 * Generate Story Tool
 *
 * MCP tool for generating complete interactive stories
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { generateStory } from '../utils/aiHelper.js';

/**
 * Tool definition
 */
export const generateStoryTool: Tool = {
  name: 'generate_story',
  description: 'Generate a complete interactive story from a natural language prompt. Creates beats, connections, and story structure using AI.',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: 'Description of the story to create (e.g., "A mystery in a haunted mansion")',
      },
      genre: {
        type: 'string',
        description: 'Story genre',
        enum: ['mystery', 'fantasy', 'scifi', 'romance', 'horror', 'adventure', 'drama'],
      },
      length: {
        type: 'string',
        description: 'Desired story length',
        enum: ['short', 'medium', 'long'],
      },
      complexity: {
        type: 'string',
        description: 'Branching complexity',
        enum: ['linear', 'moderate', 'complex'],
      },
      context: {
        type: 'string',
        description: 'Additional context or requirements',
      },
      affectDepth: {
        type: 'string',
        description: 'How much rich-character / affect (mood, traits, goals, etc.) to deploy. "auto" lets the AI pick based on the prompt; "sparse" produces lean output with no affect annotations; "standard" deploys mood seeds + affect Effects on key choices; "rich" uses the full affect system including traits, goals, variants, and bookmark-relative conditions. Default: "auto".',
        enum: ['auto', 'sparse', 'standard', 'rich'],
      },
    },
    required: ['prompt'],
  },
};

/**
 * Tool handler
 */
export async function handleGenerateStory(args: any): Promise<any> {
  const { prompt, genre, length, complexity, context, affectDepth } = args;

  // Validate prompt
  if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
    return {
      success: false,
      error: 'Prompt is required and must be a non-empty string',
      message: 'Invalid prompt provided',
    };
  }

  console.error(`[generateStory] Generating story: "${prompt}"`);
  console.error(`[generateStory] Parameters: genre=${genre}, length=${length}, complexity=${complexity}, affectDepth=${affectDepth ?? 'auto'}`);

  try {
    const story = await generateStory({
      prompt,
      genre,
      length,
      complexity,
      context,
      affectDepth,
    });

    console.error(`[generateStory] Generated ${story.beats.length} beats, ${story.connections.length} connections`);

    return {
      success: true,
      data: story,
      message: `Story "${story.metadata.title}" generated successfully with ${story.beats.length} beats`,
    };
  } catch (error) {
    console.error('[generateStory] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Failed to generate story',
    };
  }
}
