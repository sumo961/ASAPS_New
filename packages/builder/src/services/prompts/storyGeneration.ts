/**
 * Story Generation Prompts
 *
 * Templates for AI story generation
 */

import type { StoryGenerationRequest } from '../../types/ai';

/**
 * Build system prompt for story generation
 */
export function buildStoryGenerationSystemPrompt(schema: any): string {
  const beatTypes = Object.keys(schema.beatTypes || {}).join(', ');

  return `You are an expert interactive story writer and game designer. You create engaging, branching narratives using the ASAPS beat system.

## Available Beat Types
${beatTypes}

## Beat Schema
Each beat has specific parameters and connection types. Here's the full schema:
${JSON.stringify(schema, null, 2)}

## Your Task
Generate complete interactive story structures with:
1. Engaging narrative that matches the user's request
2. Proper beat types for each story moment
3. Branching paths where appropriate
4. Clear connections between beats
5. Appropriate parameters for each beat
6. Logical story progression

## Output Format
Respond with JSON in this exact structure:
{
  "metadata": {
    "title": "Story Title",
    "author": "AI Assistant",
    "description": "Brief story description",
    "genre": "mystery|fantasy|scifi|romance|horror|adventure"
  },
  "beats": [
    {
      "id": "beat_0",
      "name": "Descriptive name",
      "type": "beatType",
      "position": { "x": 100, "y": 200 },
      "parameters": { /* type-specific parameters */ },
      "connections": [{ "targetId": "beat_1", "label": "Continue" }],
      "cluster": "optional-cluster-name"
    }
  ],
  "variables": [
    { "name": "clueFound", "initialValue": false, "description": "Whether player found the clue" }
  ],
  "characters": [
    { "id": "char_1", "name": "Detective Holmes", "description": "Sharp-witted investigator" }
  ],
  "reasoning": "Brief explanation of story structure choices"
}

## Important Rules
1. Always start with titleScreen beat
2. Use proper beat types from the schema
3. Ensure all targetIds reference existing beat IDs
4. Include all required parameters for each beat type
5. Position beats logically (100px spacing between beats)
6. Create meaningful branching where story allows
7. End with endScreen beat
8. Use variables to track player choices and state
9. **CRITICAL: Counter Threshold Reachability** - Before using a conditionBeat to check if a counter reaches a threshold (e.g., score >= 3), calculate the maximum value the counter can reach. Count ALL places where the counter is incremented (setVariable beats, choice effects). The threshold MUST be ≤ the sum of all possible increments. Example: if you have 2 choices that each add +1 to a counter, the maximum is 2, so checking >= 3 is IMPOSSIBLE and will make the true branch unreachable.`;
}

/**
 * Build user prompt for story generation
 */
export function buildStoryGenerationUserPrompt(request: StoryGenerationRequest): string {
  const parts: string[] = [];

  // Main prompt
  parts.push(`Create an interactive story: "${request.prompt}"`);

  // Genre
  if (request.genre) {
    parts.push(`Genre: ${request.genre}`);
  }

  // Length guidance
  const lengthGuide = {
    short: '5-10 beats, simple branching',
    medium: '10-20 beats, moderate branching',
    long: '20+ beats, complex branching with multiple paths'
  };
  if (request.length) {
    parts.push(`Length: ${lengthGuide[request.length]}`);
  }

  // Complexity
  const complexityGuide = {
    linear: 'Mostly linear story with few choices',
    moderate: 'Several branching points with 2-3 choices each',
    complex: 'Highly branching with many choices and paths'
  };
  if (request.complexity) {
    parts.push(`Branching: ${complexityGuide[request.complexity]}`);
  }

  // Additional context
  if (request.context) {
    parts.push(`Additional context: ${request.context}`);
  }

  parts.push('\nGenerate the complete story structure as JSON.');

  return parts.join('\n\n');
}

/**
 * Get example story generation for few-shot prompting
 */
export function getStoryGenerationExample(): { user: string; assistant: string } {
  return {
    user: 'Create an interactive story: "A mystery in a mansion with 3 suspects"\nGenre: mystery\nLength: 5-10 beats, simple branching',
    assistant: JSON.stringify({
      metadata: {
        title: "Murder at Blackwood Manor",
        author: "AI Assistant",
        description: "A classic whodunit set in a Victorian mansion",
        genre: "mystery"
      },
      beats: [
        {
          id: "beat_0",
          name: "Title Screen",
          type: "titleScreen",
          position: { x: 100, y: 100 },
          parameters: {
            title: "Murder at Blackwood Manor",
            author: "AI Assistant",
            startButtonText: "Begin Investigation"
          },
          connections: [{ targetId: "beat_1" }]
        },
        {
          id: "beat_1",
          name: "Discovery",
          type: "infoText",
          position: { x: 400, y: 100 },
          parameters: {
            text: "You arrive at Blackwood Manor as a detective. Lord Blackwood has been murdered, and three suspects remain.",
            buttonText: "Investigate"
          },
          connections: [{ targetId: "beat_2" }]
        },
        {
          id: "beat_2",
          name: "Choose Location",
          type: "movementChoice",
          position: { x: 700, y: 100 },
          parameters: {
            question: "Where do you want to investigate first?",
            choices: [
              { text: "Library", target: "beat_3" },
              { text: "Study", target: "beat_4" },
              { text: "Dining Room", target: "beat_5" }
            ]
          },
          connections: [
            { targetId: "beat_3", label: "Library" },
            { targetId: "beat_4", label: "Study" },
            { targetId: "beat_5", label: "Dining" }
          ]
        }
        // ... more beats ...
      ],
      variables: [
        { name: "cluesFound", "initialValue": 0, "description": "Number of clues discovered" }
      ],
      characters: [
        { id: "butler", name: "Mr. Jenkins", description: "The loyal butler" },
        { id: "maid", name: "Mrs. White", description: "The nervous maid" },
        { id: "guest", name: "Dr. Grey", description: "The mysterious guest" }
      ],
      reasoning: "Story uses movementChoice to let player explore different rooms and discover clues about the three suspects."
    }, null, 2)
  };
}
