/**
 * Generate Story Tool
 *
 * MCP tool for generating complete interactive stories
 */
import { generateStory } from '../utils/aiHelper.js';
/**
 * Tool definition
 */
export const generateStoryTool = {
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
        },
        required: ['prompt'],
    },
};
/**
 * Tool handler
 */
export async function handleGenerateStory(args) {
    const { prompt, genre, length, complexity, context } = args;
    // Validate prompt
    if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
        return {
            success: false,
            error: 'Prompt is required and must be a non-empty string',
            message: 'Invalid prompt provided',
        };
    }
    console.error(`[generateStory] Generating story: "${prompt}"`);
    console.error(`[generateStory] Parameters: genre=${genre}, length=${length}, complexity=${complexity}`);
    try {
        const story = await generateStory({
            prompt,
            genre,
            length,
            complexity,
            context,
        });
        console.error(`[generateStory] Generated ${story.beats.length} beats, ${story.connections.length} connections`);
        return {
            success: true,
            data: story,
            message: `Story "${story.metadata.title}" generated successfully with ${story.beats.length} beats`,
        };
    }
    catch (error) {
        console.error('[generateStory] Error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            message: 'Failed to generate story',
        };
    }
}
//# sourceMappingURL=generateStory.js.map