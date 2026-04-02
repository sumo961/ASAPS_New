/**
 * Story generation test scenarios for LLM evaluation
 *
 * Tests whether small LLMs can generate complete, structurally valid
 * ASAPS stories from natural language prompts.
 */

export interface StoryScenario {
  id: string;
  description: string;
  prompt: string;
  genre?: string;
  length: 'short' | 'medium';
  complexity: 'linear' | 'moderate';
  /** Expected minimum beat count */
  minBeats: number;
  /** Expected maximum beat count */
  maxBeats: number;
  /** Beat types that MUST appear */
  requiredBeatTypes: string[];
  /** Should the story have multiple endings? */
  multipleEndings?: boolean;
  /** Should it use counters? */
  expectCounters?: boolean;
  /** Should it use inventory? */
  expectInventory?: boolean;
}

export interface StoryResult {
  scenario: string;
  model: string;
  rawResponse: string;
  cleanResponse: string;
  latencyMs: number;
  tokensPerSec?: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Condensed system prompt for story generation
// (mirrors storyGenerationEnhanced.ts but sized for small LLMs)
// ---------------------------------------------------------------------------

export const STORY_GENERATION_SYSTEM = `You are an expert interactive story designer. Generate a complete interactive story as JSON.

## Available Beat Types

### Visible Beats (player sees these)
- **titleScreen**: MUST be beat_0. Parameters: title, author, subtitle, buttonText
- **infoText**: Narrative text + Continue button. SINGLE CONNECTION only. Parameters: text, buttonText, speaker
- **durScreen**: Timed auto-advance text. SINGLE CONNECTION. Parameters: text, duration (ms)
- **dialogTree**: Branching conversation. Parameters: dialogTree with {id, speaker, text, choices: [{id, text, target|dialogNode}]}. Dialog nodes can have a "target" field for NPC auto-exit (no choices shown). Targets go in choices, NOT in connections array.
- **movementChoice**: Location choices. Parameters: question, choices: [{id, text, location, target}]. Targets in choices, NOT connections.
- **pickProp**: Item selection. Parameters: question, props: [{id, name, description, target}]. AUTO-ADDS to inventory. Targets in props, NOT connections.
- **inputText**: Text input. SINGLE CONNECTION. Parameters: prompt, placeholder, variable
- **endScreen**: Story ending. Parameters: message, showRestart (ALWAYS true)

### Invisible Beats (logic)
- **setVariable**: Set state. SINGLE CONNECTION. Parameters: type ("variable"|"counter"), name, value, operation
- **conditionBeat**: Branch on state. Parameters: condition {type, variable/counter, operator, value}, trueConnection {target}, falseConnection {target}
- **addRemoveInventory**: Modify inventory. Parameters: action ("add"|"remove"), item

## Critical Rules
1. beat_0 MUST be titleScreen
2. End with endScreen (showRestart: true)
3. SINGLE CONNECTION beats: titleScreen, infoText, durScreen, endScreen, setVariable, inputText, addRemoveInventory — use "connections" array with ONE entry
4. MULTIPLE CONNECTION beats: dialogTree, movementChoice, pickProp — put targets IN parameters (choices[].target), do NOT add connections array
5. conditionBeat: uses trueConnection/falseConnection in parameters, no connections array
6. Every beat must be reachable from beat_0
7. Every target ID must reference an actual beat
8. Use sequential IDs: beat_0, beat_1, beat_2...

## Characters
Include a "characters" array: [{id, name, displayName, role: "player"|"npc"}]
Use character displayName as "speaker" on visible beats.

## Output Format
\`\`\`json
{
  "metadata": { "title": "...", "author": "AI Assistant", "description": "...", "genre": "..." },
  "beats": [
    { "id": "beat_0", "name": "Title", "type": "titleScreen", "parameters": { "title": "...", "buttonText": "Start" }, "connections": [{ "targetId": "beat_1" }] },
    { "id": "beat_1", "name": "...", "type": "infoText", "parameters": { "text": "...", "speaker": "Narrator" }, "connections": [{ "targetId": "beat_2" }] }
  ],
  "characters": [{ "id": "char_player", "name": "Hero", "displayName": "Hero", "role": "player" }]
}
\`\`\`

Respond with ONLY valid JSON. No explanation, no markdown fences.`;

// ---------------------------------------------------------------------------
// Test scenarios
// ---------------------------------------------------------------------------

export const storyScenarios: StoryScenario[] = [
  {
    id: 'story-linear',
    description: 'Simple linear story with narration and one choice',
    prompt: 'Create a short interactive story: "The Lost Letter". A student finds a mysterious letter in a library book. They can choose to open it or return it to the librarian. Each path leads to a different ending.',
    genre: 'mystery',
    length: 'short',
    complexity: 'linear',
    minBeats: 5,
    maxBeats: 12,
    requiredBeatTypes: ['titleScreen', 'endScreen'],
    multipleEndings: true,
  },

  {
    id: 'story-dialog',
    description: 'Story with a dialog tree conversation',
    prompt: 'Create a short story: "The Merchant\'s Deal". A traveler arrives at a market and must negotiate with a merchant to buy a map. The dialog should have at least 2 player choices. The story ends after the negotiation.',
    genre: 'adventure',
    length: 'short',
    complexity: 'moderate',
    minBeats: 4,
    maxBeats: 12,
    requiredBeatTypes: ['titleScreen', 'dialogTree', 'endScreen'],
  },

  {
    id: 'story-inventory',
    description: 'Story with item selection and inventory',
    prompt: 'Create a short story: "Escape the Tower". A prisoner must pick one of three tools (rope, lockpick, hammer) from a table, then use it to escape. Different tools lead to different outcomes.',
    genre: 'adventure',
    length: 'short',
    complexity: 'moderate',
    minBeats: 5,
    maxBeats: 15,
    requiredBeatTypes: ['titleScreen', 'pickProp', 'endScreen'],
    expectInventory: true,
  },

  {
    id: 'story-movement',
    description: 'Story with location choices',
    prompt: 'Create a short story: "The Crossroads". A hiker reaches a fork in the trail with three paths: forest, mountain, river. Each path has a brief encounter and leads to an ending.',
    genre: 'adventure',
    length: 'short',
    complexity: 'moderate',
    minBeats: 6,
    maxBeats: 15,
    requiredBeatTypes: ['titleScreen', 'movementChoice', 'endScreen'],
  },

  {
    id: 'story-condition',
    description: 'Story with variables and conditional branching',
    prompt: 'Create a story: "The Interview". A job candidate answers questions in a dialog. Track a "confidence" counter — friendly answers add to it, nervous answers subtract. At the end, a condition check determines if they get the job (confidence >= 10) or not.',
    genre: 'drama',
    length: 'short',
    complexity: 'moderate',
    minBeats: 6,
    maxBeats: 15,
    requiredBeatTypes: ['titleScreen', 'dialogTree', 'conditionBeat', 'endScreen'],
    expectCounters: true,
    multipleEndings: true,
  },

  {
    id: 'story-medium',
    description: 'Medium-length story with mixed beat types',
    prompt: 'Create a medium-length story: "Mystery at the Lighthouse". A journalist investigates strange lights at an abandoned lighthouse. Include: arriving at the location (movement choice), talking to a local fisherman (dialog), finding a clue (pick prop), and two possible endings based on choices made.',
    genre: 'mystery',
    length: 'medium',
    complexity: 'moderate',
    minBeats: 10,
    maxBeats: 25,
    requiredBeatTypes: ['titleScreen', 'movementChoice', 'dialogTree', 'endScreen'],
    multipleEndings: true,
  },
];
