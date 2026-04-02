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

## Beat Types

### Visible Beats
- **titleScreen**: MUST be beat_0. Parameters: title, buttonText. Uses connections array.
- **infoText**: Narrative text + Continue. Uses connections array. ONE connection only.
- **durScreen**: Timed auto-advance. Uses connections array. ONE connection only.
- **dialogTree**: Branching conversation. Targets go in choices[].target INSIDE parameters. NO connections array.
- **movementChoice**: Location choices. Targets go in choices[].target INSIDE parameters. NO connections array.
- **pickProp**: Item selection (auto-adds to inventory). Targets go in props[].target INSIDE parameters. NO connections array.
- **inputText**: Text input. Uses connections array. ONE connection only.
- **endScreen**: Story ending. Parameters: message, showRestart: true. Connect to beat_0 for restart.

### Logic Beats
- **setVariable**: Set state. Uses connections array. ONE connection only.
- **conditionBeat**: Branch on state. Uses trueConnection/falseConnection in parameters. NO connections array.
- **addRemoveInventory**: Modify inventory. Uses connections array.

## CONNECTION RULES (CRITICAL — most common failure)

There are TWO connection patterns. Using the wrong one breaks the story:

**Pattern A — connections array** (for single-target beats):
\`\`\`json
{ "id": "beat_1", "type": "infoText", "parameters": { "text": "..." }, "connections": [{ "targetId": "beat_2" }] }
\`\`\`

**Pattern B — targets inside parameters** (for branching beats — NO connections array!):
\`\`\`json
{
  "id": "beat_2", "type": "dialogTree", "parameters": {
    "dialogTree": {
      "id": "root", "speaker": "Merchant", "text": "What would you like?",
      "choices": [
        { "id": "c1", "text": "Show me swords", "target": "beat_3" },
        { "id": "c2", "text": "Goodbye", "target": "beat_4" }
      ]
    }
  }
}
\`\`\`

\`\`\`json
{
  "id": "beat_5", "type": "movementChoice", "parameters": {
    "question": "Where to?",
    "choices": [
      { "id": "c1", "text": "Forest", "location": "Forest", "target": "beat_6" },
      { "id": "c2", "text": "Cave", "location": "Cave", "target": "beat_7" }
    ]
  }
}
\`\`\`

## VERIFICATION CHECKLIST (check before outputting)
1. beat_0 is titleScreen
2. Story ends with endScreen(s) that have showRestart: true
3. EVERY target ID (in choices[].target, connections[].targetId, trueConnection.target, falseConnection.target) references an actual beat ID in the beats array
4. EVERY beat (except beat_0) is reachable — some other beat must have it as a target
5. dialogTree parameters include: dialogTree.id, dialogTree.speaker, dialogTree.text, dialogTree.choices (array)
6. Sequential IDs: beat_0, beat_1, beat_2, ...

## Characters
Include: [{ "id": "char_player", "name": "Hero", "displayName": "Hero", "role": "player" }]

## Output
Respond with ONLY valid JSON. No explanation, no markdown fences, no code blocks.`;

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
