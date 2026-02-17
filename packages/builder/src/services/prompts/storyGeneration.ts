/**
 * Story Generation Prompts
 *
 * Lightweight templates for AI story generation.
 * NOTE: Both ClaudeProvider and OpenAIProvider use the enhanced prompts from
 * storyGenerationEnhanced.ts for full story generation. This module is kept
 * as a simpler alternative for lighter-weight use cases (e.g., MCP server).
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
7. Procedural game elements (counters, variables, inventory, conditions)

## Key Beat Type Notes
- **titleScreen**: MUST be beat_0 (first beat)
- **infoText**: Single connection only. For branching, use movementChoice or dialogTree
  - Supports textVariations (array of alternative texts randomly selected at runtime)
- **durScreen**: Timed auto-advance. Supports textVariations. Does NOT support backgroundAssetId
- **dialogTree**: Use for conversations. Supports choiceDelay, markVisited, presentationMode
  - Choices can have counter/counterOperation/counterValue and soundEffect
  - Use target "__self__" for recursive dialogs (interrogation, shopping)
- **movementChoice**: For navigation. Include id, text, location, target on each choice
  - Supports choiceDelay, markVisited, showTextOnHover
  - Choices can have counter effects and sound effects
- **pickProp**: For item selection (noun phrases only, no verbs!)
  - AUTO-ADDS selected item to inventory - DO NOT follow with addRemoveInventory!
  - MANDATORY: Every pickProp choice MUST lead to an infoText describing the item
  - Props: {id, name, displayName, description, target} - displayName is the player-visible label (translatable)
  - Supports choiceDelay, markVisited. Props can have counter effects and sound effects
- **endScreen**: Use "message" (not "endMessage"). ALWAYS set showRestart: true
  - Must be in the main "beats" array, NEVER a separate "endings" array
- **setVariable**: Supports type "variable", "counter", and "fictionalTime"
  - Fictional time: set/advance/subtract with timeYear/timeMonth/timeDay/timeHour/timeMinute
- **conditionBeat**: ONLY 3 parameters: condition, trueConnection, falseConnection
  - Condition types: counter, variable, inventory, timer, visitedBeat, fictionalTime
- **addRemoveInventory**: Only for removing items or adding from non-pickProp sources
- **inputText**: Use "variable" not "variableName". Connection goes inside parameters
- **hyperText**: Word in hyperlinks must EXACTLY match text in the "text" field

## Counter Effects on Choices
dialogTree, movementChoice, and pickProp choices can modify counters:
- "counter": counter name, "counterOperation": "change" or "set", "counterValue": number
- "soundEffect": filename to play when choice is selected

## Output Format
Respond with JSON in this exact structure:
{
  "metadata": {
    "title": "Story Title",
    "author": "AI Assistant",
    "description": "Brief story description",
    "genre": "mystery|fantasy|scifi|romance|horror|adventure"
  },
  "suggestedTheme": {
    "themeId": "builtin-visual-novel | builtin-twine | builtin-point-and-click",
    "reason": "Brief explanation of why this theme fits"
  },
  "beats": [
    {
      "id": "beat_0",
      "name": "Descriptive name",
      "type": "beatType",
      "position": { "x": 100, "y": 200 },
      "notes": "Optional author notes (not shown to player)",
      "parameters": { /* type-specific parameters */ },
      "connections": [{ "targetId": "beat_1", "label": "Continue" }],
      "cluster": "optional-cluster-name"
    }
  ],
  "variables": [
    { "name": "clueFound", "initialValue": false, "description": "Whether player found the clue" }
  ],
  "characters": [
    {
      "id": "char_1", "name": "Detective Holmes", "description": "Sharp-witted investigator",
      "counters": [{ "name": "trust", "displayName": "Trust", "value": 0, "min": 0, "max": 100 }]
    }
  ],
  "translations": [
    {
      "languageCode": "de",
      "languageName": "German",
      "strings": { "project.story.metadata.title": "Translated Title", "beat:beat_0.parameters.title": "..." }
    }
  ],
  "reasoning": "Brief explanation of story structure choices"
}

Note: "translations" is OPTIONAL - only include when multiple languages are requested.

## Multi-Language Support
When the user requests a story in multiple languages:
1. Write the story in the primary language (first in the list)
2. Include a "translations" array with translations for additional languages
3. Use "displayName" on pickProp props and "displayText" on movementChoice choices (these are the translatable labels)
4. Translation keys use format: "beat:{beatId}.parameters.{field}" for beat text, "project.story.metadata.title" for story title
5. Translate ALL player-visible text. Do NOT translate: beat IDs, variable names, counter internal names, conditions

## Important Rules
1. beat_0 MUST be type "titleScreen"
2. Use proper beat types from the schema (case-sensitive!)
3. Ensure all targetIds reference existing beat IDs
4. Include all required parameters for each beat type
5. Position beats logically (x += 300 for linear, y += 150 for branches)
6. Create meaningful branching where story allows
7. End with endScreen beat(s) - always with showRestart: true
8. Use variables and counters to track player choices and state
9. If you use counters, you MUST include conditionBeat(s) to check them before endings
10. Choice-based beats (dialogTree, movementChoice, pickProp) define targets in their choices - do NOT add a separate "connections" array
11. Single-path beats (infoText, durScreen, setVariable, etc.) use "connections" array with "targetId"
12. **CRITICAL: Counter Threshold Reachability** - Before using a conditionBeat to check if a counter reaches a threshold (e.g., score >= 3), calculate the maximum value the counter can reach. The threshold MUST be ≤ the sum of all possible increments.
13. Every beat (except titleScreen) must be reachable - some other beat must connect to it`;
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

  // Multi-language
  if (request.languages && request.languages.length > 0) {
    const primary = request.languages[0];
    const additional = request.languages.slice(1);
    if (additional.length > 0) {
      parts.push(`Languages: Write story in ${primary}. Include translations for: ${additional.join(', ')}.`);
    } else {
      parts.push(`Language: Write all content in ${primary}.`);
    }
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
