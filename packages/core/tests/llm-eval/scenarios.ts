/**
 * Test scenarios for LLM evaluation
 *
 * Each scenario mirrors a real AI beat generation task with the same
 * prompt structure the engine uses at runtime.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TestScenario {
  /** Unique test ID */
  id: string;
  /** Category for grouping */
  category: 'dialogTree' | 'conversation' | 'textGen' | 'classification' | 'extraction' | 'exitMessage';
  /** Human-readable description */
  description: string;
  /** System prompt */
  systemPrompt: string;
  /** User prompt */
  userPrompt: string;
  /** Optional conversation history for multi-turn tests */
  conversationHistory?: { role: string; content: string }[];
  /** Max tokens for generation */
  maxTokens?: number;
  /** Expected format of the response */
  expectedFormat: 'json' | 'text' | 'json-array';
  /** Validation rules */
  validation: ValidationRules;
}

export interface ValidationRules {
  /** Must parse as valid JSON */
  mustBeValidJSON?: boolean;
  /** Required top-level fields in JSON response */
  requiredFields?: string[];
  /** Required nested fields (dot notation, e.g. "choices.0.id") */
  requiredNestedFields?: string[];
  /** Maximum word count */
  maxWords?: number;
  /** Minimum word count */
  minWords?: number;
  /** Maximum sentence count */
  maxSentences?: number;
  /** Response must contain one of these strings (case-insensitive) */
  mustContainAny?: string[];
  /** Response must NOT contain these strings (case-insensitive) */
  mustNotContain?: string[];
  /** JSON response must have an array at this path with items */
  arrayFieldMinLength?: { path: string; min: number };
  /** Each item in array at path must have these fields */
  arrayItemFields?: { path: string; fields: string[] };
  /** Response must be one of these exact values (for classification) */
  mustBeOneOf?: string[];
  /** Custom validator function */
  custom?: (response: string) => { passed: boolean; message: string };
}

export interface TestResult {
  scenario: string;
  category: string;
  model: string;
  rawResponse: string;
  cleanResponse: string;
  latencyMs: number;
  tokensPerSec?: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Reusable prompt fragments (mirrors real beat prompts)
// ---------------------------------------------------------------------------

const DIALOG_TREE_SYSTEM = `You are helping create interactive dialog for a story game. Generate a dialog tree in JSON format.`;

const DIALOG_TREE_JSON_STRUCTURE = `Return a JSON object with this structure:
{
  "routingPlan": "Brief explanation of exit routing",
  "id": "root",
  "speaker": "NPC Name",
  "text": "NPC's complete speech including any questions",
  "choices": [
    {
      "id": "c1",
      "text": "What the PLAYER says in response",
      "dialogNode": { "id": "n1", "speaker": "NPC Name", "text": "NPC response", "choices": [...] }
    },
    {
      "id": "c2",
      "text": "Alternative PLAYER response",
      "target": "exit_target_id",
      "exitReason": "Why this choice exits"
    }
  ]
}`;

const CONVERSATION_SYSTEM = (npcName: string, personality: string, scenario: string) =>
  `You are ${npcName}, a character in an interactive narrative.

PERSONALITY: ${personality}

SCENARIO: ${scenario}

Respond in character as ${npcName}.
Respond with ONLY the NPC dialog text — no stage directions, no JSON, no metadata.
PERSONALIZATION: Use the player's actual name and details from context. Never use placeholder syntax like {playerName}.`;

// ---------------------------------------------------------------------------
// Test Scenarios
// ---------------------------------------------------------------------------

export const scenarios: TestScenario[] = [
  // =========================================================================
  // DIALOG TREE GENERATION (JSON structure)
  // =========================================================================
  {
    id: 'dt-simple',
    category: 'dialogTree',
    description: 'Generate a simple 2-choice dialog tree',
    systemPrompt: DIALOG_TREE_SYSTEM,
    userPrompt: `Generate a dialog tree for the following scenario:

SCENARIO: A player meets a merchant in a medieval market.

NPC: Merchant
PERSONALITY: Friendly but shrewd trader

PLAYER CONTEXT:
Player name: Erik. Has 50 gold coins.

EXIT CONDITIONS:
- "beat_shop": Player wants to browse wares
- "beat_leave": Player wants to leave

REQUIREMENTS:
1. Generate a branching dialog tree with up to 2 conversation turns
2. Each dialog node has: speaker, text, and 2-3 player choices
3. Each choice leads to either another dialog node OR an exit target

${DIALOG_TREE_JSON_STRUCTURE}`,
    maxTokens: 2048,
    expectedFormat: 'json',
    validation: {
      mustBeValidJSON: true,
      requiredFields: ['id', 'speaker', 'text', 'choices'],
      arrayFieldMinLength: { path: 'choices', min: 2 },
      arrayItemFields: { path: 'choices', fields: ['id', 'text'] },
      mustNotContain: ['{playerName}', '${', '{{'],
    },
  },

  {
    id: 'dt-nested',
    category: 'dialogTree',
    description: 'Generate a dialog tree with nested dialog nodes',
    systemPrompt: DIALOG_TREE_SYSTEM,
    userPrompt: `Generate a dialog tree for the following scenario:

SCENARIO: A detective interrogates a nervous witness at a crime scene.

NPC: Mrs. Henderson
PERSONALITY: Anxious, hides something, speaks in short sentences

PLAYER CONTEXT:
Detective Sarah Chen. Investigating a burglary at the Henderson estate.

EXIT CONDITIONS:
- "beat_arrest": Witness confesses or reveals critical information
- "beat_continue": Detective decides to move on to next witness

REQUIREMENTS:
1. Generate a branching dialog tree with up to 3 conversation turns
2. At least one choice should lead to a nested dialogNode (NPC responds, then more choices)
3. Include exitReason for exit choices

CRITICAL STRUCTURE RULES:
- The "text" field contains EVERYTHING the NPC says
- The "choices" array contains ONLY what the PLAYER says

${DIALOG_TREE_JSON_STRUCTURE}`,
    maxTokens: 4096,
    expectedFormat: 'json',
    validation: {
      mustBeValidJSON: true,
      requiredFields: ['id', 'speaker', 'text', 'choices'],
      arrayFieldMinLength: { path: 'choices', min: 2 },
      custom: (response: string) => {
        try {
          const obj = JSON.parse(response);
          const hasNested = obj.choices?.some((c: any) => c.dialogNode && c.dialogNode.text);
          return {
            passed: !!hasNested,
            message: hasNested ? 'Has nested dialogNode' : 'Missing nested dialogNode — all choices exit directly',
          };
        } catch {
          return { passed: false, message: 'Could not parse JSON' };
        }
      },
    },
  },

  {
    id: 'dt-personalization',
    category: 'dialogTree',
    description: 'Check if the model personalizes dialog with player context',
    systemPrompt: DIALOG_TREE_SYSTEM,
    userPrompt: `Generate a dialog tree for the following scenario:

SCENARIO: Player visits a fortune teller in a carnival tent.

NPC: Madame Zelda
PERSONALITY: Mysterious, dramatic, uses player's personal details in predictions

PLAYER CONTEXT:
Player name: Mirjam. Lives in Stockholm. Profession: Marine biologist. Has visited the old lighthouse.

EXIT CONDITIONS:
- "beat_prediction": The fortune teller gives a prediction
- "beat_leave": Player leaves

REQUIREMENTS:
1. Generate a dialog tree with 2 turns
2. PERSONALIZATION IS CRITICAL: Use Mirjam's name, Stockholm, marine biology, and the lighthouse visit directly in the NPC's text
3. Never use placeholder syntax like {playerName}

${DIALOG_TREE_JSON_STRUCTURE}`,
    maxTokens: 2048,
    expectedFormat: 'json',
    validation: {
      mustBeValidJSON: true,
      requiredFields: ['id', 'speaker', 'text', 'choices'],
      mustContainAny: ['Mirjam', 'Stockholm', 'marine', 'lighthouse'],
      mustNotContain: ['{playerName}', '{name}', '${', '{{'],
    },
  },

  // =========================================================================
  // CONVERSATION TURNS (text responses)
  // =========================================================================
  {
    id: 'conv-opening',
    category: 'conversation',
    description: 'Generate an NPC opening line for a conversation',
    systemPrompt: CONVERSATION_SYSTEM(
      'Professor Aldric',
      'Wise, patient academic who loves sharing knowledge. Slightly absent-minded.',
      'The player visits a university professor to learn about ancient ruins.'
    ) + '\n\nTurn 1 of 5. Generate the NPC opening line.',
    userPrompt: 'Generate the NPC\'s opening line to start the conversation. The player just entered the professor\'s office.',
    maxTokens: 512,
    expectedFormat: 'text',
    validation: {
      maxWords: 80,
      minWords: 10,
      mustNotContain: ['{', '}', '"choices"', '"target"', '"speaker"'],
    },
  },

  {
    id: 'conv-response',
    category: 'conversation',
    description: 'Generate an NPC response to player input',
    systemPrompt: CONVERSATION_SYSTEM(
      'Captain Rivera',
      'Stern but fair ship captain. Speaks directly, values loyalty.',
      'The player is a new crew member on a merchant vessel.'
    ) + '\n\nTurn 3 of 5. Respond in character.',
    userPrompt: 'Generate the NPC response.',
    conversationHistory: [
      { role: 'assistant', content: 'Welcome aboard. I hope you know starboard from port, because I don\'t have time to teach basics.' },
      { role: 'user', content: 'I\'ve sailed before, Captain. What\'s our heading?' },
      { role: 'assistant', content: 'Good to hear. We\'re bound for Port Savanna — three days if the wind holds. You\'ll be on night watch tonight.' },
      { role: 'user', content: 'I noticed some damage to the hull. Should I report it?' },
    ],
    maxTokens: 512,
    expectedFormat: 'text',
    validation: {
      maxWords: 80,
      minWords: 8,
      mustNotContain: ['{', '}', '"choices"', 'JSON', '"text"'],
    },
  },

  {
    id: 'conv-language',
    category: 'conversation',
    description: 'Generate response in the same language as scenario (German)',
    systemPrompt: CONVERSATION_SYSTEM(
      'Herr Schmidt',
      'Freundlicher Bäcker in einem kleinen deutschen Dorf. Spricht warmherzig.',
      'Der Spieler besucht eine Bäckerei in einem deutschen Dorf und möchte Brot kaufen.'
    ) + '\n\nTurn 1 of 3. Respond in the SAME LANGUAGE as the scenario.',
    userPrompt: 'Generate the NPC\'s opening line. The player just entered the bakery.',
    maxTokens: 512,
    expectedFormat: 'text',
    validation: {
      maxWords: 60,
      minWords: 5,
      mustNotContain: ['{', '}', '"choices"'],
      // Basic German detection: common German words
      mustContainAny: ['und', 'der', 'die', 'das', 'ich', 'Sie', 'Willkommen', 'Guten', 'Brot', 'Bäcker', 'haben', 'heute', 'möchten', 'gerne'],
    },
  },

  // =========================================================================
  // TEXT GENERATION (aiInfoText / aiDurScreen)
  // =========================================================================
  {
    id: 'text-concise',
    category: 'textGen',
    description: 'Generate concise contextual text (1-2 sentences)',
    systemPrompt: 'You are a narrator for an interactive story. Generate atmospheric text based on context. Respond with ONLY the narrative text — no JSON, no metadata.',
    userPrompt: `Generate 1-2 sentences of atmospheric narrative.

CONTEXT: The player (named Alex) enters a dark cave after escaping from bandits. They have a torch and a rusty sword.

INSTRUCTION: Describe the cave entrance. Keep it to 1-2 sentences maximum.`,
    maxTokens: 256,
    expectedFormat: 'text',
    validation: {
      maxSentences: 3,
      maxWords: 60,
      minWords: 8,
      mustNotContain: ['{', '}', '"text"', 'JSON'],
    },
  },

  {
    id: 'text-personalized',
    category: 'textGen',
    description: 'Generate personalized narrative using player variables',
    systemPrompt: 'You are a narrator for an interactive story. Generate text that references the player\'s specific details. Respond with ONLY the narrative text.',
    userPrompt: `Generate 1-2 sentences.

PLAYER STATE:
- Name: Yuki
- Location: Tokyo
- Profession: Chef
- Has item: Golden whisk

INSTRUCTION: The player arrives at a cooking competition. Reference their name and the golden whisk.`,
    maxTokens: 256,
    expectedFormat: 'text',
    validation: {
      maxSentences: 3,
      maxWords: 60,
      minWords: 8,
      mustContainAny: ['Yuki'],
      mustNotContain: ['{playerName}', '${', '{{'],
    },
  },

  // =========================================================================
  // CLASSIFICATION (aiCondition)
  // =========================================================================
  {
    id: 'classify-personality',
    category: 'classification',
    description: 'Classify player personality based on choice history',
    systemPrompt: `You are an AI evaluator for an interactive story. Analyze the player's behavior and classify them into exactly ONE category. Respond with ONLY the category name, nothing else.`,
    userPrompt: `PLAYER CHOICES:
- Helped the old woman carry groceries
- Gave gold to the beggar
- Refused to fight the dragon, tried to negotiate
- Shared food with the prisoner

CATEGORIES:
- "aggressive": Player makes combative, hostile choices
- "diplomatic": Player prefers peaceful solutions and helping others
- "cautious": Player avoids risk, self-preserving choices

Respond with ONLY one category name.`,
    maxTokens: 32,
    expectedFormat: 'text',
    validation: {
      mustBeOneOf: ['diplomatic', '"diplomatic"', 'aggressive', '"aggressive"', 'cautious', '"cautious"'],
      maxWords: 3,
    },
  },

  {
    id: 'classify-state',
    category: 'classification',
    description: 'Classify game state for branching',
    systemPrompt: `Analyze the player's state and classify into exactly ONE category. Respond with ONLY the category name.`,
    userPrompt: `PLAYER STATE:
- Clues found: 4 out of 5
- Has key evidence: murder weapon, witness testimony
- Visited: crime scene, suspect's house, police station
- Missing: motive evidence

CATEGORIES:
- "ready_to_solve": Player has enough evidence (3+ clues including key evidence)
- "needs_more_clues": Player is missing critical evidence
- "wrong_track": Player has mostly wrong leads

Respond with ONLY one category name.`,
    maxTokens: 32,
    expectedFormat: 'text',
    validation: {
      mustBeOneOf: ['ready_to_solve', '"ready_to_solve"', 'needs_more_clues', '"needs_more_clues"', 'wrong_track', '"wrong_track"'],
      maxWords: 3,
    },
  },

  // =========================================================================
  // VARIABLE EXTRACTION
  // =========================================================================
  {
    id: 'extract-simple',
    category: 'extraction',
    description: 'Extract variables from conversation',
    systemPrompt: 'Extract values from the conversation and return them as a JSON object. Only return the JSON object, nothing else.',
    userPrompt: `CONVERSATION:
  NPC: Welcome to the tavern! What's your name, traveler?
  Player: I'm Marcus, from the Northern Isles.
  NPC: Marcus! A long way from home. What brings you here?
  Player: I'm looking for a blacksmith who can forge a dragon-scale shield.

EXTRACT:
  0. Variable "player_name": The player's name
  1. Variable "origin": Where the player is from
  2. Variable "quest_item": What item the player is seeking

Return a JSON object mapping variable names to extracted values.
Example: {"player_name": "value", "origin": "value", "quest_item": "value"}`,
    maxTokens: 256,
    expectedFormat: 'json',
    validation: {
      mustBeValidJSON: true,
      requiredFields: ['player_name', 'origin', 'quest_item'],
      custom: (response: string) => {
        try {
          const obj = JSON.parse(response);
          const nameOk = obj.player_name?.toLowerCase().includes('marcus');
          const originOk = obj.origin?.toLowerCase().includes('northern');
          const questOk = obj.quest_item?.toLowerCase().includes('shield') || obj.quest_item?.toLowerCase().includes('dragon');
          const score = [nameOk, originOk, questOk].filter(Boolean).length;
          return {
            passed: score >= 2,
            message: `Extracted ${score}/3 correctly: name=${nameOk}, origin=${originOk}, quest=${questOk}`,
          };
        } catch {
          return { passed: false, message: 'Could not parse JSON' };
        }
      },
    },
  },

  // =========================================================================
  // NPC EXIT MESSAGES
  // =========================================================================
  {
    id: 'exit-farewell',
    category: 'exitMessage',
    description: 'Generate contextual NPC farewell acknowledging player choice',
    systemPrompt: 'You are Captain Rivera, a stern but fair ship captain. Respond with ONLY dialog text — no JSON, no metadata.',
    userPrompt: `SCENARIO: The player is a crew member on a merchant vessel.

The NPC just said: "We need someone to scout the island. It could be dangerous, but the reward is worth it."
The player responded: "I'll volunteer for the scouting mission."

Generate a brief farewell/response that DIRECTLY acknowledges what the player just said. Instruction: Thank them for volunteering and wish them luck.
Keep it to 1-2 sentences. Respond with ONLY the dialog text.`,
    maxTokens: 256,
    expectedFormat: 'text',
    validation: {
      maxSentences: 3,
      maxWords: 50,
      minWords: 5,
      mustNotContain: ['{', '}', '"text"', 'JSON'],
      // Should reference volunteering/scouting/luck
      mustContainAny: ['volunteer', 'scout', 'luck', 'brave', 'mission', 'careful', 'safe', 'proud', 'good'],
    },
  },

  {
    id: 'exit-dismissal',
    category: 'exitMessage',
    description: 'Generate NPC dismissal message',
    systemPrompt: 'You are a grumpy shopkeeper named Old Gregor. You are impatient and rude. Respond with ONLY dialog text.',
    userPrompt: `SCENARIO: A player visits a potion shop but can't afford anything.

The NPC just said: "Everything here costs at least 100 gold. No exceptions."
The player responded: "I only have 10 gold..."

Generate a brief farewell/response that DIRECTLY acknowledges what the player just said. Instruction: Dismiss them rudely.
Keep it to 1-2 sentences. Respond with ONLY the dialog text.`,
    maxTokens: 256,
    expectedFormat: 'text',
    validation: {
      maxSentences: 3,
      maxWords: 40,
      minWords: 3,
      mustNotContain: ['{', '}', '"text"', 'JSON'],
    },
  },

  // =========================================================================
  // DIRECTION EVALUATION (for aiConversation)
  // =========================================================================
  {
    id: 'direction-eval',
    category: 'classification',
    description: 'Evaluate which conversation directions are triggered',
    systemPrompt: 'Evaluate which conversation directions are triggered based on the player\'s input. Return a JSON array of triggered direction indices. If none are triggered, return []. Only return the JSON array, nothing else.',
    userPrompt: `PLAYER INPUT: "I'm really worried about the pollution in my neighborhood. The factory smoke is getting worse."

CONVERSATION HISTORY:
  NPC: Welcome! I'm here to discuss environmental issues in your area.
  Player: Hi, I live near the industrial district.

CURRENT TURN: 2

DIRECTIONS TO EVALUATE:
  0: Player mentions pollution, air quality, or environmental health concerns
  1: Player asks about economic impacts or job market
  2: Player wants to end the conversation or says goodbye
  3: Player mentions water quality or drinking water

Return a JSON array of triggered direction indices.`,
    maxTokens: 64,
    expectedFormat: 'json-array',
    validation: {
      mustBeValidJSON: true,
      custom: (response: string) => {
        try {
          const arr = JSON.parse(response);
          if (!Array.isArray(arr)) return { passed: false, message: 'Not an array' };
          const has0 = arr.includes(0);
          const noFalsePositives = !arr.includes(2); // player didn't say goodbye
          return {
            passed: has0 && noFalsePositives,
            message: `Triggered: [${arr}]. ${has0 ? '✓ Detected pollution' : '✗ Missed pollution'}. ${noFalsePositives ? '✓ No false positives' : '✗ False positive on goodbye'}`,
          };
        } catch {
          return { passed: false, message: 'Could not parse JSON array' };
        }
      },
    },
  },
];
