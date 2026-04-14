/**
 * AI Helper for Story Generation
 *
 * Provides AI-powered story generation using Claude API or simulation mode
 */

/**
 * Beat type definitions for generation
 *
 * CONNECTION RULES:
 * - SINGLE CONNECTION beats: Can only connect to ONE target beat via the connections array
 *   titleScreen, infoText, durScreen, videoBeat, endScreen, setVariable, addRemoveInventory, setTimer, inputText, keypad
 *
 * - MULTIPLE CONNECTION beats: Support multiple targets via their parameters (NOT the connections array)
 *   - dialogTree: targets defined in dialogTree.choices[].target
 *   - movementChoice: targets defined in choices[].target
 *   - pickProp: targets defined in props[].target
 *   - hyperText: targets defined in hyperlinks[].targetBeatId
 *   - conditionBeat: uses condition, trueConnection, falseConnection parameters (nested format only!)
 *   - randomTarget: targets defined in choices[].target
 *
 * DEFAULT TARGET (Timed Auto-Advance):
 * Most visible beats (EXCEPT durScreen) can have an OPTIONAL defaultTarget parameter with a timeout.
 * This auto-advances to a different beat if the interactor doesn't act within the specified time.
 * - Set via parameters: defaultTarget (beat ID) and defaultTargetDelay (SECONDS, e.g., 30 = 30 seconds)
 * - showTimer: boolean - if true, displays a visual countdown bar at the top of the stage
 *   - The bar changes color as time runs out: green → yellow → red
 *   - Creates visible urgency for the player
 * - Example: { defaultTarget: "timeout", defaultTargetDelay: 30, showTimer: true }
 * - Useful for: creating urgency, time pressure, timed puzzles with visual feedback
 * - NOT available on durScreen (which already auto-advances by design)
 *
 * CLUSTERS (Organizational Containers):
 * Clusters help organize larger projects into logical sections (e.g., "In the House", "In the Forest").
 * - Add a "cluster" property to beats with the cluster name (string)
 * - All beats with the same cluster value will be grouped together
 * - Clusters appear as collapsible containers in the flowchart and folders in the sidebar
 * - Example: { cluster: "forest_section" } on multiple beats groups them together
 * - Use clusters when a story has 15+ beats or distinct geographical/thematic sections
 * - Beats without a cluster property remain ungrouped at the top level
 *
 * CLUSTER MAP FEATURES (for spatial clusters):
 * Spatial clusters can display a background map/floorplan image:
 * - mapAssetId: Asset ID referencing the background map image
 * - mapScale: Scale factor for the map (0.1-3.0, default 1.0)
 * - mapOpacity: Opacity of the map background (0-1, default 0.5)
 * - Only available for spatial cluster type (not organizational)
 *
 * CHOICE DELAY:
 * dialogTree, movementChoice, and pickProp beats support the "choiceDelay" parameter:
 * - Value is in SECONDS (e.g., 2 = 2 second delay before choices appear)
 * - Choices appear with a fade-in animation after the delay
 * - Useful for dramatic pauses or ensuring player reads text first
 * - Example: { "choiceDelay": 1.5 } waits 1.5 seconds before revealing choices
 *
 * DIALOGTREE PRESENTATION MODES:
 * DialogTree beats support different presentation styles via "presentationMode" parameter:
 * - "positioned" (default): Traditional positioned text boxes and choice buttons at fixed screen locations
 * - "chat-scroll": Scrollable chat history like a messaging app, showing all previous messages
 * - "chat-bubble": Single message bubble that replaces previous content (minimal UI)
 * Additional chat mode options:
 * - "showAvatars": boolean (default true) - Show character avatar images in chat mode
 * - "responseDelay": number (seconds) - Delay before NPC responds, shows "typing..." indicator
 * Example: { "presentationMode": "chat-scroll", "showAvatars": true, "responseDelay": 1.5 }
 *
 * COUNTER OPERATIONS IN CHOICES (dialogTree, movementChoice, pickProp):
 * All choice-type beats can modify counters directly:
 * - "counter": counter name (should match a counter defined on a character, e.g., "trust", "courage")
 * - "counterOperation": "set" (replace value) or "change" (increment/decrement)
 * - "counterValue": numeric value to set or add
 * - Example: { "text": "Help the merchant", "target": "helped", "counter": "trust", "counterOperation": "change", "counterValue": 1 }
 * - Best practice: Define counters on characters first (e.g., Player.courage, NPC.trust), then reference them in choices
 * - This allows tracking relationship values, skill points, or any numeric state throughout the story
 *
 * COUNTER COMPARISON CONDITIONS:
 * The "counterCompare" condition type compares two counters against each other:
 * - type: "counterCompare"
 * - counter1: first counter name
 * - counter2: second counter name
 * - operator: "==", "!=", ">", "<", ">=", "<="
 * - Example: { "type": "counterCompare", "counter1": "strength", "counter2": "threshold", "operator": ">=" }
 * - Useful for: skill checks, relationship comparisons, dynamic difficulty
 *
 * VISITED BEAT TRACKING:
 * - "markVisited" parameter (boolean): Block and dim choices leading to previously visited beats
 * - Per-choice visited tracking: choices are individually tracked (composite key: "beatId:choiceId")
 * - Supported on: dialogTree, movementChoice, pickProp
 * - Useful for: helping players find unexplored paths, achievement hunting
 * - "visitedBeat" condition type: Check if a specific beat has been visited
 *   Example: { "type": "visitedBeat", "beatId": "some_beat_id", "operator": "==" }
 *
 * RECURSIVE DIALOG TREES:
 * - DialogTree choices can use target: "__self__" to loop back to the SAME dialogTree beat
 * - Useful for: interrogation, shopping, asking multiple questions before leaving
 * - Combine with markVisited: true to block and dim already-selected choices
 * - At least one choice should have a real target to exit the loop
 *
 * FICTIONAL TIME SYSTEM:
 * Stories can track in-story date/time progression (separate from real-time timers):
 * - Set via setVariable with type "fictionalTime": operations "set", "advance", "subtract"
 * - Check via conditionBeat with type "fictionalTime": compare current time against a date/time
 * - Display: Shows automatically in Timer HUD when enabled in global settings
 * - Supports units: minutes, hours, days, months, years
 * - Display formats: time-12h, time-24h, date, datetime-12h, datetime-24h, day-number, year
 * - Per-beat timeDisplayMode: "fictionalTime" (default), "manual" (custom text), "none" (hide HUD)
 *
 * MOVEMENT CHOICE OPTIONS:
 * - "showTextOnHover" parameter (boolean): Only show choice text when hovering over the hotspot
 * - Useful for: exploration-focused gameplay, hidden options
 *
 * ANIMATIONS (informational):
 * Beats can have path animations for moving/transforming positioned elements:
 * - Trigger types: onLoad (automatic), onClick (user-initiated), onVariable (condition-based)
 * - Capabilities: position movement, scale, rotation, opacity, sprite frame cycling
 * - Complex animation paths are configured via Visual Editor, not generated by AI
 * - When generating stories, AI can note in beat labels where animations would enhance scenes
 *
 * ASSET REFERENCES (informational - AI doesn't typically generate these):
 * - backgroundAssetId, assetId, characterId/stateId are set by the author through the UI
 * - Character meter frames (HUD counters) are configured through the UI
 * - Story content works with any theme - visual styling is separate from narrative content
 *
 * BEAT NOTES (Author Annotations) - USE LIBERALLY!
 * All beats support an optional "notes" field for author comments:
 * - Notes are NOT shown to players - internal documentation only
 * - AI should actively use notes to help the human author, including:
 *   - Asset suggestions: "ASSET: Dark forest background, ominous lighting"
 *   - Character art: "CHARACTER: Show detective looking suspicious"
 *   - Audio: "AUDIO: Tense investigation music"
 *   - Review flags: "REVIEW: Verify clue doesn't reveal answer too early"
 *   - Design alternatives: "ALTERNATIVE: Could branch to romance path here"
 * - Example: { "notes": "ASSET: Throne room. CHARACTER: Villain menacing. REVIEW: Player needs enough clues here." }
 *
 * CHARACTERS AND SPEAKERS:
 * Stories include a "characters" array with character definitions:
 * - Each character: { id, name, displayName, role ("player"|"npc"|"companion"), counters, inventory }
 * - Visible beats have an optional "speaker" parameter set to a character's displayName
 * - Default speaker is "Narrator" when no speaker is specified
 * - The player character (role: "player") displayName is used as speaker for player-spoken beats
 * - dialogTree nodes support per-node speaker fields for multi-character conversations
 *
 * CHARACTER COUNTERS (Centralized System):
 * Counters should be defined on characters, then referenced consistently in choices:
 * - Define counters in the characters array: { "counters": [{ "name": "courage", "displayName": "Courage", "value": 50, "min": 0, "max": 100 }] }
 * - These counters become available in ALL choice-type beats (dialogTree, movementChoice, pickProp)
 * - Example character: { "id": "player", "name": "Hero", "displayName": "Hero", "role": "player", "counters": [{ "name": "courage", ... }] }
 * - Example choice with counter effect: { "text": "Stand your ground", "target": "fight", "counter": "courage", "counterOperation": "change", "counterValue": 10 }
 * - Best practice: Define all counters you plan to use on relevant characters first
 *
 * IMPORTANT: For branching story points, use dialogTree or movementChoice, NOT multiple connections from infoText!
 */
export const BEAT_TYPES = {
  // Story structure - SINGLE CONNECTION (one Continue button)
  // 🚨🚨🚨 MANDATORY: beat_0 MUST be titleScreen - NEVER start with infoText! 🚨🚨🚨
  titleScreen: '🚨 MANDATORY FIRST BEAT (beat_0)! Start screen with title and author. SINGLE CONNECTION: only one target via connections array.',
  infoText: 'Narrative text with Continue button. SINGLE CONNECTION ONLY: can only connect to ONE target! ❌ WRONG: infoText with 2+ connections. ✓ For branching, use movementChoice or dialogTree instead. Optional: textVariations (array) for random text selection at runtime.',
  endScreen: 'End screen with message. 🚨 MUST be actual beats in beats array, NOT an "endings" metadata array! ALWAYS set showRestart: true AND add a connection back to beat_0 (titleScreen) so the restart button works: "connections": [{ "targetId": "beat_0" }]. Use "message" parameter (not "endMessage"). Optional credits page: showCredits (boolean), creditsPageTitle (default "Credits"), creditsPageBody (text content), creditsCloseText (default "Close"), creditsText (button label). Example: { "id": "end_bad", "type": "endScreen", "parameters": { "message": "You lost!", "showRestart": true, "showCredits": true, "creditsPageTitle": "Credits", "creditsPageBody": "Created by..." }, "connections": [{ "targetId": "beat_0" }] }',

  // Interactive content - MULTIPLE CONNECTIONS via parameters
  dialogTree: '🚨 DEFAULT CHOICE BEAT — use this for ANY multi-option choice (conversations, decisions, actions, story branches). Shows choices as visible buttons. For simple non-NPC branching, use a SHALLOW dialogTree: set speaker to "" (empty), text to the scene/question, and put 2-4 options as top-level choices. MULTIPLE TARGETS: define targets in dialogTree.choices[].target parameter, NOT in connections array. Supports: choiceDelay (seconds), presentationMode ("positioned"/"chat-scroll"/"chat-bubble"), showAvatars (boolean), responseDelay (seconds for NPC typing indicator), markVisited (boolean for per-choice visited tracking). Choices can modify counters via counter/counterOperation/counterValue properties. RECURSIVE DIALOGS: use target "__self__" to loop back to the same dialogTree (e.g., interrogation, shopping). NPC AUTO-EXIT: A dialog node can have a "target" field to auto-advance WITHOUT showing choices (NPC dismissals, forced exits). When "target" is set on a node, choices are ignored. Example shallow (general branching): { "dialogTree": { "id": "root", "speaker": "", "text": "You stand at a crossroads.", "choices": [{ "id": "c1", "text": "Take the forest path", "target": "beat_forest" }, { "id": "c2", "text": "Follow the river", "target": "beat_river" }] } }.',
  movementChoice: '🚨 SPECIALIZED — NOT the default multi-choice beat! Renders choices as INVISIBLE HOTSPOTS on a background scene. Only use when the scene has a background image AND each choice maps to a spatial location on that image (e.g., clicking the library door, staircase, garden gate). For abstract choices (actions, answers, decisions), use dialogTree instead. When in doubt: use dialogTree. MULTIPLE TARGETS: define targets in choices[].target parameter, NOT in connections array. Each choice needs { id, text, location, target } - always set "location" to same value as "text". Supports: choiceDelay (seconds), markVisited (boolean), showTextOnHover (boolean).',
  pickProp: 'Interactive prop/item selection. MULTIPLE TARGETS: define targets in props[].target parameter. IMPORTANT: prop "name" should be ITEM NAMES ONLY (e.g., "Silver Key", "Lantern"), NOT action descriptions (e.g., "Take the key" is WRONG). For actions, use movementChoice instead. Supports: choiceDelay (seconds), markVisited (boolean).',
  hyperText: 'Text with clickable words leading to different beats. MULTIPLE TARGETS: define in hyperlinks[].targetBeatId. Links can have custom styling (color, underline, bold). Supports optional defaultTarget for timed auto-advance.',
  inputText: 'Player text input. Save to: variable (default), characterName (update display name), or counter (numeric). Validation: none, numeric, email, alphanumeric. Properties: minLength, maxLength, required. SINGLE CONNECTION: only one target. Supports optional defaultTarget for timed auto-advance.',
  keypad: 'Numeric keypad input (PIN entry, safe locks, phone dialers). Parameters: prompt, layout ("numeric"|"phone"|"pin"), maxDigits, minDigits, correctCode (optional auto-validation), failTarget (beat on wrong code), maxAttempts (0=unlimited), maskInput (boolean), saveToType ("variable"|"counter"), variable, buttonText, clearButtonText, showDisplay. SINGLE CONNECTION: correct code or submit → next beat. If correctCode is set, validates automatically and routes to failTarget on wrong entry.',

  // Timed content - SINGLE CONNECTION (NO defaultTarget - already timed by design)
  durScreen: 'Timed screen that auto-advances after duration. SINGLE CONNECTION: only one target via connections array at beat level. ❌ WRONG: connection inside parameters. ✓ CORRECT: "connections": [{ "targetId": "beat_5" }] at beat level. Optional: textVariations (array) for random text selection at runtime.',
  videoBeat: 'Video playback. SINGLE CONNECTION: only one target after video ends. Supports optional defaultTarget for timed auto-advance.',

  // Logic beats (invisible - no defaultTarget needed)
  conditionBeat: 'Conditional branching. NESTED FORMAT ONLY: uses condition object + trueConnection/falseConnection objects. ❌ Do NOT use flat params like trueTarget, falseTarget, variableName, operator, value. Condition types: variable, inventory, counter, counterCompare, timer, visitedBeat, fictionalTime (compare in-story date/time).',
  setVariable: 'Set ONE variable/counter/fictionalTime per beat. Types: "variable" (text/boolean), "counter" (numeric ops), "fictionalTime" (set/advance/subtract in-story date/time). Operations: set, add, subtract, multiply, divide. IMPORTANT: Can only modify ONE variable at a time! To set multiple variables, chain multiple setVariable beats. SINGLE CONNECTION: executes then continues to one target.',
  addRemoveInventory: 'Modify inventory. Actions: add, remove, or transfer (move between characters). Use "character" parameter to specify which character\'s inventory (defaults to player). Examples: { "action": "add", "item": "key", "character": "merchant" }, { "action": "transfer", "item": "sword", "fromCharacter": "player", "toCharacter": "companion" }. SINGLE CONNECTION: executes then continues to one target.',
  randomTarget: 'Random branching. MULTIPLE TARGETS: define targets in choices[].target parameter.',
  setTimer: 'Set/check timers. Beat continues immediately to SINGLE CONNECTION target while timer runs in background. Optional timerTarget parameter: where story jumps when timer expires.',

  // AI-powered beats (require AI service at runtime)
  aiInfoText: 'AI-generated contextual text with Continue button. Parameters: prompt (context for AI), fallbackText (if AI unavailable), buttonText, includeVariables, includeInventory, includeHistory, maxSentences, contextVariables. SINGLE CONNECTION. Generates personalized 1-2 sentences based on player state.',
  aiDurScreen: 'AI-generated text with auto-advance based on reading speed. Parameters: prompt, fallbackText, includeVariables, includeInventory, includeHistory, maxSentences, contextVariables, wordsPerMinute (default 200), minDuration (ms), maxDuration (ms). SINGLE CONNECTION.',
  aiDialogTree: 'AI-generated branching dialogue at runtime. Creates personalized conversations based on player state. Parameters: scenario, npcName, npcPersonality, maxTurns, exitTargets (array of {id, description, npcExitMessage?}), includeVariables, includeInventory, includeVisitedBeats, includeChoiceHistory, systemInstructions, presentationMode, showAvatars. MULTIPLE CONNECTIONS via exitTargets. npcExitMessage: optional prompt for AI to generate a farewell that acknowledges the player\'s last choice.',
  aiConversation: 'Real-time AI conversation with author-defined steering rules. Each NPC response generated live based on conversation history + active directions. Parameters: scenario, npcName, npcPersonality, maxTurns, directions (array of steering rules with triggers and actions), fallbackExitTarget, openingLine, systemInstructions. MULTIPLE CONNECTIONS via exit directions + fallback. Directions can steer conversation, exit to a beat, set variables, or combine actions. Supports npcExitMessage for farewell responses.',
  aiSummary: 'AI-generated personalized summary of the player\'s journey — can REPLACE endScreen as story ending! Generates a recap based on the player\'s actual choices, variables, and inventory. Has ALL the same ending capabilities as endScreen. Parameters: prompt, title, summaryStyle ("narrative"|"bullet-points"|"reflection"), maxLength ("short"|"medium"|"long"), includeVariables, includeInventory, includeCounters, includeVisitedBeats, includeChoiceHistory, showRestart (boolean, ALWAYS true when used as ending), showCredits (boolean), resetOnRestart (boolean), resetVariables, resetCounters, resetInventory, resetTimers, resetFictionalTime, resetVisitedTracking, resetHistory (granular reset sub-options), creditsPageTitle, creditsPageBody, creditsCloseText, restartText, creditsText. Connect to beat_0 (titleScreen) for restart when used as ending.',
  aiCondition: 'AI-driven branching that analyzes player state to determine path. Parameters: prompt (what AI evaluates), categories (array of {name, description, targetId}), evaluateVariables, evaluateInventory, evaluateHistory, evaluateCounters, evaluateChoiceHistory, fallbackTarget, timeout. MULTIPLE CONNECTIONS via categories. AI classifies player state and routes to appropriate category target.',
  onlineContent: 'Fetch and display real-time data from web APIs or AI queries. Parameters: sourceType ("api" or "ai-query"), apiUrl, apiParams, jsonPath, query, title, maxWords, fallbackText, buttonText. SINGLE CONNECTION. For dynamic content like weather, news, or AI-generated facts.',
} as const;

/**
 * Story generation configuration
 */
export interface StoryConfig {
  prompt: string;
  genre?: string;
  length?: 'short' | 'medium' | 'long';
  complexity?: 'linear' | 'moderate' | 'complex';
  context?: string;
}

/**
 * Generated beat structure
 */
export interface GeneratedBeat {
  id: string;
  type: string;
  label: string;
  parameters: Record<string, any>;
  position?: { x: number; y: number };
  cluster?: string; // Optional cluster name to group beats into sections
}

/**
 * Generated connection structure
 */
export interface GeneratedConnection {
  id: string;
  sourceId: string;
  targetId: string;
  label?: string;
}

/**
 * Complete story generation result
 */
export interface GeneratedStory {
  metadata: {
    title: string;
    author: string;
    description: string;
    genre: string;
  };
  suggestedTheme?: {
    themeId: string;
    reason: string;
  };
  beats: GeneratedBeat[];
  connections: GeneratedConnection[];
  variables?: Array<{
    name: string;
    initialValue: any;
    description: string;
  }>;
  characters?: Array<{
    id: string;
    name: string;
    displayName: string;
    role: 'player' | 'npc' | 'companion';
    description: string;
    counters?: Array<{
      name: string;
      displayName: string;
      value: number;
      min: number;
      max: number;
    }>;
  }>;
  reasoning: string;
}

/**
 * Generate a complete story using AI or simulation
 */
export async function generateStory(config: StoryConfig): Promise<GeneratedStory> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.error('[AI] No ANTHROPIC_API_KEY found, using simulation mode');
    return generateStorySimulation(config);
  }

  try {
    return await generateStoryWithAI(config, apiKey);
  } catch (error) {
    console.error('[AI] Failed to generate with AI, falling back to simulation:', error);
    return generateStorySimulation(config);
  }
}

/**
 * Auto-fix ending beats (endScreen, aiSummary) missing their restart connection back
 * to the title screen. AI models often create these with showRestart:true but no
 * outgoing connection. The engine has a fallback, but the connection should be explicit
 * so it renders as a graph edge in the visual editor.
 */
function autoFixEndingRestartConnections(generated: any): void {
  if (!generated?.beats || !Array.isArray(generated.beats)) return;

  const titleScreen = generated.beats.find((b: any) => b.type === 'titleScreen');
  if (!titleScreen) return;

  const endingBeatTypes = new Set(['endScreen', 'aiSummary']);
  let fixCount = 0;

  for (const beat of generated.beats) {
    if (!endingBeatTypes.has(beat.type)) continue;

    const showRestart = beat.parameters?.showRestart ?? true;
    if (!showRestart) continue;

    const hasConnection = beat.connections && Array.isArray(beat.connections) && beat.connections.length > 0;
    if (hasConnection) continue;

    if (!beat.connections) beat.connections = [];
    beat.connections.push({ targetId: titleScreen.id });
    console.error(`[aiHelper.autoFix] ✓ Added restart connection: ${beat.type} ${beat.id} → ${titleScreen.id}`);
    fixCount++;
  }

  if (fixCount > 0) {
    console.error(`[aiHelper.autoFix] Auto-fixed ${fixCount} ending beats missing restart connections`);
  }
}

/**
 * Generate story using Claude API
 */
async function generateStoryWithAI(config: StoryConfig, apiKey: string): Promise<GeneratedStory> {
  const { prompt, genre = 'adventure', length = 'medium', complexity = 'moderate', context } = config;

  // Determine beat count based on length
  const beatCount = length === 'short' ? '8-15' : length === 'medium' ? '15-30' : '30+';
  const branchingDesc = complexity === 'linear' ? 'mostly linear with few choices' :
                        complexity === 'moderate' ? 'moderate branching with 2-3 choices per decision point' :
                        'complex branching with multiple paths and consequences';

  const systemPrompt = `You are a creative interactive story author. Generate complete interactive story structures in JSON format.

Available beat types:
${Object.entries(BEAT_TYPES).map(([type, desc]) => `- ${type}: ${desc}`).join('\n')}

Return a JSON object with this structure:
{
  "metadata": {
    "title": "Story Title",
    "author": "AI Assistant",
    "description": "Brief description",
    "genre": "mystery|fantasy|scifi|romance|horror|adventure"
  },
  "suggestedTheme": {
    "themeId": "builtin-visual-novel | builtin-twine | builtin-point-and-click",
    "reason": "Brief explanation of why this theme fits the story"
  },
  "beats": [
    {
      "id": "beat_0",
      "type": "titleScreen",  // 🚨 MANDATORY: First beat MUST be titleScreen, NEVER infoText!
      "label": "Title",
      "parameters": { "title": "...", "author": "...", "buttonText": "Begin" },
      "speaker": "optional character displayName (default: Narrator)",
      "notes": "Optional author annotations (not shown to player)",
      "cluster": "optional-cluster-name"
    }
  ],
  "connections": [
    { "id": "conn-0", "sourceId": "beat_0", "targetId": "beat_1", "label": "Continue" }
  ],
  "variables": [
    { "name": "cluesFound", "initialValue": 0, "description": "Number of clues discovered" }
  ],
  "characters": [
    {
      "id": "char_player", "name": "Hero", "displayName": "Hero", "role": "player",
      "description": "The protagonist",
      "counters": [
        { "name": "courage", "displayName": "Courage", "value": 50, "min": 0, "max": 100 }
      ]
    },
    {
      "id": "char_guide", "name": "Old Guide", "displayName": "Old Guide", "role": "npc",
      "description": "A mysterious guide",
      "counters": []
    }
  ],
  "reasoning": "Explain story structure, branching strategy, and how beat types work together"
}

🚨 IMPORTANT: ALL beats including endings go in the "beats" array! Do NOT create a separate "endings" array!

CRITICAL CONNECTION RULES:
- SINGLE CONNECTION beats (titleScreen, infoText, durScreen, videoBeat, endScreen, inputText, keypad, setVariable, addRemoveInventory, setTimer): Can ONLY have ONE connection in the connections array. For branching, use dialogTree or movementChoice instead.
- MULTIPLE CONNECTION beats (dialogTree, movementChoice, pickProp, hyperText, randomTarget): Define targets in their PARAMETERS (choices[].target, props[].target, etc.), NOT in the connections array.
  🚫 FORBIDDEN: Do NOT add a "connection" parameter to these beats - it triggers validation errors!
- conditionBeat: EXACTLY 3 parameters allowed: "condition", "trueConnection", "falseConnection"
  🚫 FORBIDDEN parameters that trigger validation errors:
  - "connection" ❌
  - "conditionType" ❌
  - "variableName" ❌
  - "operator" (at top level) ❌
  - "value" (at top level) ❌
  - "trueTarget" ❌
  - "falseTarget" ❌

  🚨🚨🚨 USE "target" NOT "targetId" in trueConnection/falseConnection! 🚨🚨🚨
  ❌ WRONG: "trueConnection": { "targetId": "beat_5", "label": "Yes" }
  ✓ CORRECT: "trueConnection": { "target": "beat_5", "label": "Yes" }

CRITICAL setVariable LIMITATION:
- setVariable beats can ONLY modify ONE variable/counter per beat!
- If you need to set multiple variables (e.g., "Creative +1, Temper -1"), you MUST create SEPARATE setVariable beats chained together.
- Example: Instead of one beat named "Creative +1, Temper -1", create TWO beats:
  1. "Creative +1" (setVariable for creative_energy) → connects to →
  2. "Temper -1" (setVariable for temper_control) → connects to next story beat
- NEVER name a setVariable beat with multiple operations - split them into multiple beats!

CLUSTERS (Organizational Containers):
For larger stories (15+ beats) with distinct sections, use clusters to organize beats:
- Add a "cluster" property (string) to each beat that belongs to a group
- All beats with the same cluster value will be grouped together in the UI
- Example: beats in "In the House" section all have { cluster: "house_section" }
- Clusters make large flowcharts more navigable and help authors understand story structure
- Use clusters for: geographical areas, time periods, character arcs, or thematic sections
- Beats without a cluster property remain at the top level ungrouped

CHOICE DELAY:
- dialogTree, movementChoice, and pickProp beats support "choiceDelay" parameter
- Value in SECONDS (e.g., 1.5 = 1.5 seconds before choices appear)
- Useful for dramatic pauses or ensuring player reads text first
- Example: { "choiceDelay": 2 } waits 2 seconds before showing choices

DIALOGTREE PRESENTATION MODES:
- "presentationMode": "positioned" (default) | "chat-scroll" | "chat-bubble"
  - "positioned": Traditional positioned text boxes at fixed locations
  - "chat-scroll": Scrollable chat history like a messaging app
  - "chat-bubble": Single message bubble that replaces previous
- "showAvatars": boolean (default true) - Show character avatars in chat modes
- "responseDelay": number (seconds) - NPC typing delay before response
- Example: { "presentationMode": "chat-scroll", "responseDelay": 1.5 }

COUNTER OPERATIONS IN DIALOGTREE:
- Dialogue choices can modify counters directly via choice properties:
  - "counter": counter name (any name, e.g., "trust", "fear")
  - "counterOperation": "set" or "change" (increment)
  - "counterValue": numeric value
- Example choice: { "text": "Be friendly", "target": "next", "counter": "trust", "counterOperation": "change", "counterValue": 1 }
- This allows tracking relationships, skills, or any numeric game state

VISITED TRACKING:
- "markVisited": boolean - Block and dim choices leading to previously visited beats
- Per-choice visited tracking: choices are individually tracked (composite key: "beatId:choiceId")
- Supported on dialogTree, movementChoice, pickProp
- "visitedBeat" condition type for conditionBeat: check if beat was visited

RECURSIVE DIALOG TREES:
- DialogTree choices can use target: "__self__" to loop back to the SAME dialogTree beat
- Useful for: interrogation, shopping, asking multiple questions before leaving
- Combine with markVisited: true to block and dim already-selected choices
- At least one choice should have a real target to exit the loop

MOVEMENT CHOICE OPTIONS:
- "showTextOnHover": boolean - Only reveal choice text on hover (for exploration gameplay)

THEME PRESETS:
ASAPS includes built-in themes. Recommend the most appropriate theme via "suggestedTheme" in output.

- **builtin-visual-novel**: Best for romance, drama, character-driven. Semi-transparent text box, golden names, serif fonts. Use when: dialog focus, relationships, emotional.
- **builtin-twine**: Best for interactive fiction, literary, mystery (text-based). Blue hyperlinks, serif typography, dark bg. Use when: text-heavy, literary, minimal UI.
- **builtin-point-and-click**: Best for adventure, exploration, puzzles. Golden text on dark blue, prominent hotspots, pixelated. Use when: exploration, items, location puzzles.

Theme recommendations by genre:
Romance/Drama → visual-novel | Mystery (text) → twine | Mystery (exploration) → point-and-click | Horror → twine or visual-novel | Fantasy (epic) → visual-novel | Fantasy (adventure) → point-and-click | Sci-Fi → twine or visual-novel | Adventure → point-and-click | Literary → twine

Color contrast rule: Text/background must have 4.5:1+ contrast ratio. Avoid yellow on white, light gray on white, dark blue on black.

CONTENT GUIDELINES:
- Content should work with any visual theme - avoid hardcoding colors or fonts in narrative text
- Write content that adapts to different presentation styles (Visual Novel, Twine, Point-and-Click)

BEAT NOTES - USE LIBERALLY:
- All beats support optional "notes" field for author annotations
- Notes are NOT shown to players - internal documentation only
- Use notes actively to help the human author: suggest assets, flag review areas, explain intent, propose alternatives
- Example: { "notes": "ASSET: Spooky library background. AUDIO: Creaking sounds. REVIEW: Pacing might feel slow here." }

TIMER VISUALIZATION:
- When using defaultTarget with defaultTargetDelay, add "showTimer": true
- This displays a countdown bar to give players visual time pressure
- Example: { "defaultTarget": "fail", "defaultTargetDelay": 10, "showTimer": true }

FICTIONAL TIME SYSTEM:
- Track in-story date/time progression (separate from real-time timers)
- Set via setVariable: type "fictionalTime", operations "set"/"advance"/"subtract"
  - Set: { "type": "fictionalTime", "operation": "set", "timeYear": 1929, "timeMonth": 1, "timeDay": 15, "timeHour": 9, "timeMinute": 0 }
  - Advance: { "type": "fictionalTime", "operation": "advance", "value": 3, "timeUnit": "hours" }
  - Subtract (time travel): { "type": "fictionalTime", "operation": "subtract", "value": 2, "timeUnit": "days" }
- Check via conditionBeat: type "fictionalTime" with compareTime
  - { "condition": { "type": "fictionalTime", "operator": ">", "compareTime": { "year": 1969, "month": 1, "day": 1, "hour": 0, "minute": 0 } } }
- Display: Shows in Timer HUD when enabled in global settings
- Display formats: time-12h, time-24h, date, datetime-12h, datetime-24h, day-number, year

CHARACTERS AND SPEAKERS:
- The "characters" array defines all characters in the story
- Each character has: id, name, displayName, role ("player"|"npc"|"companion"), counters, inventory
- The player character (role: "player") represents the interactor/reader
- Visible beats have an optional "speaker" parameter (string) set to a character's displayName
- If no speaker is set, "Narrator" is used as the default speaker
- The player character's displayName is used as speaker for beats spoken by the player
- dialogTree nodes have per-node speaker fields: each dialogTree.choices[] entry and the root dialogTree object can have a "speaker" field
- Use speakers to attribute narration and dialogue to specific characters
- Example beat with speaker: { "type": "infoText", "parameters": { "text": "Welcome to my shop!", "speaker": "Merchant" } }
- Example character: { "id": "char_merchant", "name": "merchant", "displayName": "Merchant", "role": "npc", "counters": [], "inventory": [] }

CHARACTER COUNTERS:
- Define counters on characters first, then reference them in choices
- Counter effects work on dialogTree, movementChoice, AND pickProp
- Example character: { "counters": [{ "name": "trust", "displayName": "Trust", "value": 50, "min": 0, "max": 100 }] }
- Example choice: { "text": "Be friendly", "counter": "trust", "counterOperation": "change", "counterValue": 5 }

SOUND EFFECTS ON CHOICES:
- dialogTree, movementChoice, and pickProp choices support "soundEffect" parameter
- Value: filename of sound to play when choice is selected (e.g., "click.mp3", "coin_pickup.wav")
- Example: { "text": "Pick up coins", "target": "next", "soundEffect": "coin_pickup.mp3" }

ADVANCED BRANCHING PATTERNS:
1. Hub-and-Spoke: Central hub (movementChoice) → explore locations → find clues → return to hub → conditionBeat unlocks finale
2. Critical Path + Optional Content: Main story + side content that reconverges at checkpoint
3. State Accumulation → Branching Finale: Multiple counter-modifying choices → conditionBeat checks scores → different endings
4. Parallel Tracks + Forced Merge: Major choice splits into completely different experiences, merge at plot point
5. Conditional Unlocks (Metroidvania): Locked options unlock after finding items/variables
6. Timed Branching: setTimer + choices under pressure → conditionBeat checks timer → success/failure
7. Inventory-Gated Puzzles: conditionBeat checks inventory → has tool: proceed | no tool: explore first
8. Code/Password Puzzle: infoText (clue) → keypad or inputText (enter code) → conditionBeat (verify) → success/failure
   - Prefer keypad for numeric codes (visual keypad, auto-validation with correctCode/failTarget)
   - Use inputText for text-based passwords
9. Reputation System: Multiple interactions modify relationship counter → conditionBeat determines NPC behavior

PROCEDURAL GAME ELEMENTS (REQUIRED for engaging stories):
Stories MUST include at least 2-3 of these mechanics:
1. Counters - Track numeric values (clues, trust, suspicion). ADD counter effects to choices! Check with conditionBeat.
2. Variables - Track boolean/string state (hasKey, doorUnlocked). Check with conditionBeat.
3. Inventory - Track collected items. Check with conditionBeat type "inventory".
4. Visited Beats - conditionBeat type "visitedBeat" to unlock content after exploration.
5. Fictional Time - setVariable type "fictionalTime" for historical fiction, day counters.
6. Conditional Endings - Endings depend on ACCUMULATED state, not just final choice.

Genre-specific requirements:
- Mystery/Detective: Track clues (counter), evidence (inventory), suspect trust (counter)
- Adventure: Track items (inventory), visited locations (variables), puzzle progress (counters)
- Romance/Drama: Track relationship values (counters), conversation choices (variables)
- Horror: Track sanity/fear (counter), items (inventory), knowledge gained (variables)

🚨 CRITICAL RULE: If you use counters, you MUST include a conditionBeat to check them!
- Every counter that gets incremented MUST be checked before endings
- Route ALL paths through the conditionBeat before reaching endScreen
- Without a conditionBeat, counters are POINTLESS

COUNTER THRESHOLD REACHABILITY (CRITICAL):
🚨 If you create a conditionBeat checking a counter, you MUST modify that counter somewhere earlier!

4 WAYS TO MODIFY COUNTERS:
1. dialogTree choices: { "text": "Be brave", "target": "beat_5", "counter": "courage", "counterOperation": "add", "counterValue": 10 }
2. movementChoice choices: { "text": "Search", "location": "Lab", "target": "beat_5", "counter": "cluesFound", "counterOperation": "add", "counterValue": 1 }
3. pickProp props: { "name": "Letter", "target": "beat_5", "counter": "cluesFound", "counterOperation": "add", "counterValue": 1 }
4. setVariable beat: { "type": "setVariable", "parameters": { "type": "counter", "name": "cluesFound", "value": 1, "operation": "add" } }

Before using a conditionBeat to check if a counter reaches a threshold (e.g., cluesFound >= 3), you MUST:
1. Count ALL places where that counter can be increased (choices with counter effects, setVariable beats)
2. Calculate the maximum value the counter can reach on any playthrough
3. Ensure the threshold is ≤ the maximum reachable value

Example - WRONG (Unreachable):
- Story has NO choices with counter effects and NO setVariable beats
- Maximum cluesFound = 0
- Condition checks: cluesFound >= 3  ❌ IMPOSSIBLE! Counter is never modified!

Example - CORRECT (Reachable):
- Story has 4 dialogTree/pickProp choices with counter: "cluesFound", counterOperation: "add", counterValue: 1
- Maximum cluesFound = 4
- Condition checks: cluesFound >= 3  ✓ Player needs 3 of 4 opportunities

Rule: NEVER create a conditionBeat checking a counter without ALSO adding counter modifications to choices!
Always provide 1-2 MORE increment opportunities than the highest threshold requires.

CRITICAL ANTI-PATTERNS TO AVOID:

1. DUPLICATE CONNECTIONS - DO NOT define targets twice!
   For dialogTree, movementChoice, pickProp - targets are ONLY in the choices/props.
   ❌ WRONG: choices have "target" AND beat has "connections" array (duplicates!)
   ✓ CORRECT: choices have "target", NO "connections" array on the beat

2. inputText MISUSE - inputText is for GETTING player input only!
   ❌ WRONG: inputText with "Read the note:" - nothing for player to type!
   ✓ CORRECT: Use infoText to DISPLAY text
   ✓ CORRECT: Use inputText only when player must TYPE something (names, passwords)

3. Chains of identical single-item pickProps - avoid repetitive patterns!
   ❌ WRONG: pickProp "Shovel" → pickProp "Shovel" → pickProp "Shovel" (pointless chain!)
   ✓ CORRECT: Single pickProp to pick up item, then move on to different content
   ✓ BETTER: pickProp with 2-4 items when player has a choice of what to take

4. MISSING BEAT REFERENCES - EVERY target must have a corresponding beat!
   ❌ WRONG: Dialog choice targets "beat_22" but you stopped generating at beat_21
   ✓ CORRECT: If any target references "beat_22", you MUST include beat_22 in your output
   - Plan your beat count BEFORE generating
   - NEVER stop generating early - complete ALL referenced beats
   - Missing beat references cause import FAILURE!

5. HUB BEATS WITH STATE-DEPENDENT TEXT (NARRATIVE LOGIC ERROR):
   Hub beats (reachable from multiple paths) should NOT assume player state!
   ❌ WRONG: Hub text says "You have enough clues..." without checking counter
   ✓ CORRECT: Generic hub text "What's next?" → conditionBeat checks state → different outcomes

6. ORPHAN BEATS - Every beat must be connected:
   ❌ WRONG: Creating a beat that nothing connects to
   ✓ CORRECT: For EVERY beat, verify another beat targets it (except titleScreen)

7. pickProp + addRemoveInventory (DUPLICATE ITEMS):
   pickProp AUTOMATICALLY adds the selected item to inventory!
   ❌ WRONG: pickProp "Key" → addRemoveInventory add "key" (creates duplicate!)
   ✓ CORRECT: pickProp "Key" → infoText describing the key
   ✓ Use addRemoveInventory ONLY for items from non-pickProp sources (NPC gifts, events)

8. pickProp props MUST have descriptions:
   ❌ WRONG: { "name": "Letter" } (no description)
   ✓ CORRECT: { "name": "Letter", "description": "A sealed envelope with a wax seal" }

9. MANDATORY: DESCRIBE ITEMS AFTER PICKUP!
   Every pickProp choice MUST lead to an infoText that describes what the player learns from the item!
   ❌ WRONG: pickProp "Old Photo" → movementChoice (photo never described!)
   ✓ CORRECT: pickProp "Old Photo" → infoText "The photograph shows a family portrait..." → next beat
   Good item descriptions should: reveal story details, hint at mysteries, give useful information, create atmosphere.

10. NO DUPLICATE DATA - Put beat data in parameters ONLY:
   ❌ WRONG: dialogTree data at both top level AND in parameters
   ✓ CORRECT: dialogTree data ONLY inside parameters.dialogTree

CORRECT PARAMETER NAMES (MUST use exactly these):
- endScreen: { message (NOT "endText"), showRestart: true (ALWAYS), showCredits, creditsPageTitle, creditsPageBody, creditsCloseText, creditsText }
  🚨 CRITICAL: When showRestart is true, endScreen MUST have a connection back to the titleScreen (beat_0). Example: "connections": [{ "targetId": "beat_0" }]. Same rule applies to aiSummary when used as an ending.
- keypad: { prompt, layout ("numeric"|"phone"|"pin"), maxDigits, minDigits, correctCode, failTarget, maxAttempts, maskInput, saveToType, variable, buttonText, clearButtonText }
- inputText: { prompt, variable (NOT "variableName"), saveToType: "variable" (REQUIRED), submitButtonText }
- setVariable: { type: "variable"|"counter"|"fictionalTime", name (variable name, NOT "variableName"), value, operation }
  ⚠️ Two different "name" fields: beat.name = display label, beat.parameters.name = VARIABLE name
- addRemoveInventory: { action, item (NOT "itemName"), character (default "player"), quantity }
- setTimer: { name (NOT "timerName"), value in seconds (NOT "duration"), timerTarget }
- videoBeat: { videoFile (NOT "videoUrl" or "videoAssetId"), autoplay, controls, skipButton }
- pickProp: { question, props: [{ id, name, description (REQUIRED), target }] }
  ⚠️ pickProp "name" should be ITEM NAMES (e.g., "Silver Key"), NOT actions (e.g., "Take the key")

CONCRETE BEAT EXAMPLES:

titleScreen: { "id": "beat_0", "type": "titleScreen", "label": "Title", "parameters": { "title": "My Story", "author": "Author", "buttonText": "Start" }, "connections": [{ "targetId": "beat_1" }] }

movementChoice: { "id": "beat_2", "type": "movementChoice", "label": "Choice", "parameters": { "choices": [{ "id": "c1", "text": "Go left", "location": "Go left", "target": "beat_3" }, { "id": "c2", "text": "Go right", "location": "Go right", "target": "beat_4" }] } }

conditionBeat (counter): { "id": "beat_5", "type": "conditionBeat", "label": "Check Clues", "parameters": { "condition": { "type": "counter", "variable": "cluesFound", "operator": ">=", "value": 3 }, "trueConnection": { "target": "beat_good_end" }, "falseConnection": { "target": "beat_bad_end" } } }

conditionBeat (inventory has): { "parameters": { "condition": { "type": "inventory", "item": "lantern", "character": "player", "checkType": "has" }, "trueConnection": { "target": "beat_light" }, "falseConnection": { "target": "beat_dark" } } }

conditionBeat (inventory quantity): { "parameters": { "condition": { "type": "inventory", "item": "gold_coin", "character": "player", "checkType": "quantity", "quantityOperator": ">=", "quantityValue": 10 }, "trueConnection": { "target": "beat_afford" }, "falseConnection": { "target": "beat_poor" } } }
Note: quantityValue can also reference a variable with $ prefix: "$requiredAmount"

conditionBeat (counterCompare): { "parameters": { "condition": { "type": "counterCompare", "counter1": "strength", "counter2": "threshold", "operator": ">=" }, "trueConnection": { "target": "beat_pass" }, "falseConnection": { "target": "beat_fail" } } }

endScreen: { "id": "beat_end", "type": "endScreen", "label": "The End", "parameters": { "message": "Victory!", "showRestart": true, "showCredits": true, "creditsPageTitle": "Credits", "creditsPageBody": "Written by...\nDesigned by..." }, "connections": [{ "targetId": "beat_0" }] }

keypad: { "id": "beat_safe", "type": "keypad", "label": "Safe Lock", "parameters": { "prompt": "Enter the combination:", "layout": "numeric", "maxDigits": 4, "correctCode": "1847", "failTarget": "beat_wrong_code", "maxAttempts": 3, "maskInput": true }, "connections": [{ "targetId": "beat_safe_open" }] }

inputText + conditionBeat (code puzzle): inputText { "variable": "code", "saveToType": "variable", "prompt": "Enter the vault code:" } → conditionBeat { "condition": { "type": "variable", "variable": "code", "operator": "==", "value": "8192" }, "trueConnection": { "target": "success" }, "falseConnection": { "target": "retry" } }

Important:
- Use descriptive labels for beats
- Create engaging, coherent narrative flow
- Use appropriate beat types for each story moment
- NEVER put multiple connections from infoText - use movementChoice or dialogTree for branching
- For dialogTree beats, targets go in dialogTree.choices[].target parameter - NO connections array!
- For movementChoice beats, targets go in choices[].target parameter - NO connections array!
- For pickProp beats, targets go in props[].target parameter - NO connections array!
- Only titleScreen and infoText need a "connections" array (single target beats)
- Ensure all beat IDs are unique and all connections reference valid beat IDs
- Include "suggestedTheme" with a theme ID and reason based on genre/style
- EVERY beat must be reachable - some other beat must connect TO it (except titleScreen)
- Don't artificially truncate long stories - let the story develop naturally
- When AI beats are available, consider using aiSummary instead of endScreen for richer endings

VERIFICATION CHECKLIST (check each before outputting):
1. beat_0 is titleScreen
2. Story ends with endScreen or aiSummary beats, each with showRestart: true
3. EVERY target ID references an actual beat ID in the beats array — no dangling references
4. EVERY beat (except beat_0) is reachable — at least one other beat has it as a target
5. dialogTree.id, dialogTree.speaker, dialogTree.text, dialogTree.choices are all present
6. Single-connection beats use connections array; multi-connection beats have targets INSIDE parameters`;

  const userPrompt = `Create an interactive story with these requirements:

Prompt: ${prompt}
Genre: ${genre}
Length: ${beatCount} beats
Complexity: ${branchingDesc}
${context ? `Additional context: ${context}` : ''}

Generate a complete, engaging interactive story structure.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 32000, // Modern models have 128k+ context - allow room for complex stories
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: userPrompt,
      }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as any;
  const content = data.content[0].text;

  // Extract JSON from response (handle markdown code blocks)
  const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/) || [null, content];
  const jsonStr = jsonMatch[1] || content;

  const generated = JSON.parse(jsonStr);

  // Auto-fix: ensure ending beats (endScreen, aiSummary) with showRestart:true have
  // an explicit connection back to the titleScreen so the restart edge appears in the graph.
  autoFixEndingRestartConnections(generated);

  // Add placeholder positions to beats if not present
  // Note: The builder's TreeLayoutAlgorithm will recalculate proper tree positions
  // based on connections when the story is injected
  const beatsWithPositions = generated.beats.map((beat: any, index: number) => ({
    ...beat,
    position: beat.position || {
      x: 100 + (index % 4) * 300,
      y: 100 + Math.floor(index / 4) * 200,
    },
  }));

  return {
    ...generated,
    beats: beatsWithPositions,
  };
}

/**
 * Generate story using simulation (fallback when no API key)
 */
function generateStorySimulation(config: StoryConfig): GeneratedStory {
  const { prompt, genre = 'adventure', length = 'medium', complexity = 'moderate' } = config;

  const title = extractTitleFromPrompt(prompt);
  const beatCount = length === 'short' ? 5 : length === 'medium' ? 10 : 20;

  const beats: GeneratedBeat[] = [];
  const connections: GeneratedConnection[] = [];

  // Title screen
  beats.push({
    id: 'beat-0',
    type: 'titleScreen',
    label: 'Title Screen',
    parameters: {
      title,
      subtitle: genre.charAt(0).toUpperCase() + genre.slice(1),
      buttonText: 'Begin',
    },
    position: { x: 100, y: 100 },
  });

  // Introduction
  beats.push({
    id: 'beat-1',
    type: 'infoText',
    label: 'Introduction',
    parameters: {
      text: `${prompt}\n\nYour adventure begins here...`,
      buttonText: 'Continue',
    },
    position: { x: 400, y: 100 },
  });

  connections.push({
    id: 'conn-0',
    sourceId: 'beat-0',
    targetId: 'beat-1',
    label: 'Start',
  });

  // Middle beats - vary based on complexity
  const middleCount = beatCount - 3;
  for (let i = 0; i < middleCount; i++) {
    const beatId = `beat-${i + 2}`;
    const isChoice = complexity !== 'linear' && i % 3 === 0;

    if (isChoice && i < middleCount - 1) {
      // Add a choice beat
      beats.push({
        id: beatId,
        type: 'movementChoice',
        label: `Choice ${Math.floor(i / 3) + 1}`,
        parameters: {
          prompt: `What do you do next?`,
          choices: [
            { id: `choice-${i}-a`, text: 'Take the left path', location: 'Left Path', target: `beat-${i + 3}` },
            { id: `choice-${i}-b`, text: 'Take the right path', location: 'Right Path', target: `beat-${i + 3}` },
          ],
        },
        position: { x: 100 + (i % 4) * 300, y: 300 + Math.floor(i / 4) * 200 },
      });
    } else {
      // Add narrative beat
      beats.push({
        id: beatId,
        type: 'infoText',
        label: `Scene ${i + 1}`,
        parameters: {
          text: `Part ${i + 1} of your ${genre} adventure continues...`,
          buttonText: 'Continue',
        },
        position: { x: 100 + (i % 4) * 300, y: 300 + Math.floor(i / 4) * 200 },
      });

      connections.push({
        id: `conn-${i + 1}`,
        sourceId: `beat-${i + 1}`,
        targetId: beatId,
      });
    }
  }

  // End screen
  const endBeatId = `beat-${beatCount - 1}`;
  beats.push({
    id: endBeatId,
    type: 'endScreen',
    label: 'The End',
    parameters: {
      message: `The End\n\nThank you for experiencing this ${genre} adventure!`,
      showRestart: true,
      showCredits: false,
    },
    position: { x: 400, y: 500 + Math.floor(middleCount / 4) * 200 },
  });

  connections.push({
    id: `conn-end`,
    sourceId: `beat-${beatCount - 2}`,
    targetId: endBeatId,
  });

  return {
    metadata: {
      title,
      author: 'AI Assistant (Simulation Mode)',
      description: prompt,
      genre,
    },
    beats,
    connections,
    reasoning: `Generated ${beatCount} beats with ${complexity} complexity (simulation mode - no AI API key provided)`,
  };
}

/**
 * Extract a title from the prompt
 */
function extractTitleFromPrompt(prompt: string): string {
  const words = prompt.trim().split(/\s+/).slice(0, 5);
  return words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Dialog generation configuration
 */
export interface DialogConfig {
  scene: string;
  character?: string;
  goal?: string;
  branchingFactor?: number;
  context?: string;
}

/**
 * Generated dialog tree result
 */
export interface GeneratedDialog {
  beat: GeneratedBeat;
  reasoning: string;
}

/**
 * Generate a dialog tree using AI or simulation
 */
export async function generateDialog(config: DialogConfig): Promise<GeneratedDialog> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.error('[AI] No ANTHROPIC_API_KEY found, using simulation mode');
    return generateDialogSimulation(config);
  }

  try {
    return await generateDialogWithAI(config, apiKey);
  } catch (error) {
    console.error('[AI] Failed to generate with AI, falling back to simulation:', error);
    return generateDialogSimulation(config);
  }
}

/**
 * Generate dialog using Claude API
 */
async function generateDialogWithAI(config: DialogConfig, apiKey: string): Promise<GeneratedDialog> {
  const { scene, character, goal, branchingFactor = 3, context } = config;

  const systemPrompt = `You are a creative dialogue writer for interactive fiction. Generate branching dialogue trees in JSON format.

Dialog tree structure uses the "dialogTree" beat type with nested dialogue nodes and choices.

Return a JSON object with this structure:
{
  "beat": {
    "id": "dialog-1",
    "type": "dialogTree",
    "label": "Conversation Title",
    "parameters": {
      "dialogTree": {
        "id": "node-0",
        "speaker": "Character Name",
        "text": "Opening dialogue...",
        "choices": [
          {
            "id": "choice-0",
            "text": "Player response option",
            "dialogNode": { ... } OR "target": "beat_id"
          }
        ]
      },
      "presentationMode": "positioned" | "chat-scroll" | "chat-bubble",
      "showAvatars": true,
      "responseDelay": 1.5,
      "choiceDelay": 0,
      "markVisited": false
    }
  },
  "reasoning": "Explanation of dialogue structure"
}

Presentation modes:
- "positioned" (default): Traditional positioned text boxes at fixed screen locations
- "chat-scroll": Scrollable chat history like a messaging app - great for modern/casual tone
- "chat-bubble": Single message bubble that replaces previous - minimal, focused UI

Dialog Flow Pattern:
- dialogNode: Contains speaker, text, and choices array
- choice: What the player clicks - the text IS what the player says
- Nested dialogNode inside choice: The NPC's response to that choice
- Key insight: The choice text IS the player's line. To have NPC respond and exit, put NPC response in dialogNode and exit target on the nested choice.

Writing Guidelines:
1. Keep dialog natural and conversational
2. Player choices should be distinct and meaningful
3. Use emotions to convey character state
4. Create branching that matters to the story
5. Balance dialog length - not too long per node
6. Consider adding conditions/effects for consequences

Example Emotions: neutral, happy, angry, sad, surprised, fearful

Important:
- Create ${branchingFactor} meaningful choices per decision point
- Write natural, engaging dialogue
- Include character emotions and motivations
- Create consequences for choices when appropriate
- Use nested nodes (dialogNode) for multi-turn conversations within same beat
- Use "target" to exit to a different beat; use "__self__" to loop back to the same dialog (interrogation, shopping)
- Choice text IS the player's spoken dialogue - never use "[Continue]" placeholders
- Choices can modify counters: { "counter": "trust", "counterOperation": "change", "counterValue": 1 }
- Choices can play sound effects: { "soundEffect": "click.mp3" }
- markVisited: true enables per-choice visited tracking (blocks and dims already-selected choices)
- NEVER use "[Continue]" or placeholder text - choices should contain meaningful player dialogue`;

  const userPrompt = `Create a branching dialogue for this scene:

Scene: ${scene}
${character ? `Speaking Character: ${character}` : ''}
${goal ? `Conversation Goal: ${goal}` : ''}
${context ? `Additional Context: ${context}` : ''}

Generate an engaging, branching dialogue tree with ${branchingFactor} choices.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: userPrompt,
      }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as any;
  const content = data.content[0].text;

  const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/) || [null, content];
  const jsonStr = jsonMatch[1] || content;

  return JSON.parse(jsonStr);
}

/**
 * Generate dialog using simulation
 */
function generateDialogSimulation(config: DialogConfig): GeneratedDialog {
  const { scene, character = 'NPC', branchingFactor = 3 } = config;

  return {
    beat: {
      id: `dialog-${Date.now()}`,
      type: 'dialogTree',
      label: `Conversation: ${character}`,
      parameters: {
        rootNode: {
          id: 'node-0',
          speaker: character,
          text: `${scene}\n\nHow do you respond?`,
          choices: Array.from({ length: branchingFactor }, (_, i) => ({
            id: `choice-${i}`,
            text: `Response option ${i + 1}`,
            target: `node-${i + 1}`,
          })),
        },
      },
    },
    reasoning: `Generated ${branchingFactor}-choice dialogue (simulation mode)`,
  };
}

/**
 * Beat suggestion configuration
 */
export interface SuggestBeatsConfig {
  currentBeatId: string;
  storyContext: any;
  count?: number;
}

/**
 * Beat suggestion result
 */
export interface BeatSuggestion {
  beats: Array<{
    type: string;
    label: string;
    description: string;
    rationale: string;
  }>;
  reasoning: string;
}

/**
 * Suggest next beats based on context
 */
export async function suggestBeats(config: SuggestBeatsConfig): Promise<BeatSuggestion> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.error('[AI] No ANTHROPIC_API_KEY found, using simulation mode');
    return suggestBeatsSimulation(config);
  }

  try {
    return await suggestBeatsWithAI(config, apiKey);
  } catch (error) {
    console.error('[AI] Failed to suggest with AI, falling back to simulation:', error);
    return suggestBeatsSimulation(config);
  }
}

/**
 * Suggest beats using Claude API
 */
async function suggestBeatsWithAI(config: SuggestBeatsConfig, apiKey: string): Promise<BeatSuggestion> {
  const { currentBeatId, storyContext, count = 3 } = config;

  const systemPrompt = `You are a story structure consultant for interactive fiction. Suggest logical next beats based on story context.

Available beat types:
${Object.entries(BEAT_TYPES).map(([type, desc]) => `- ${type}: ${desc}`).join('\n')}

Return a JSON object with this structure:
{
  "beats": [
    {
      "type": "beatType",
      "label": "Beat Name",
      "description": "What this beat does",
      "rationale": "Why this beat makes sense here"
    }
  ],
  "reasoning": "Overall strategic thinking"
}`;

  const userPrompt = `Suggest ${count} logical next beats after beat "${currentBeatId}".

Current Story Context:
${JSON.stringify(storyContext, null, 2)}

Provide ${count} diverse, story-appropriate beat suggestions.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: userPrompt,
      }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as any;
  const content = data.content[0].text;

  const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/) || [null, content];
  const jsonStr = jsonMatch[1] || content;

  return JSON.parse(jsonStr);
}

/**
 * Suggest beats using simulation
 */
function suggestBeatsSimulation(config: SuggestBeatsConfig): BeatSuggestion {
  const { count = 3 } = config;

  const suggestions = [
    { type: 'dialogTree', label: 'Conversation', description: 'Add a dialogue with choices', rationale: 'Engage player with character interaction' },
    { type: 'movementChoice', label: 'Location Choice', description: 'Player chooses where to go', rationale: 'Provide exploration options' },
    { type: 'infoText', label: 'Narrative', description: 'Continue the story', rationale: 'Advance the plot' },
  ];

  return {
    beats: suggestions.slice(0, count),
    reasoning: `Suggested ${count} diverse beat types (simulation mode)`,
  };
}

/**
 * Beat creation configuration
 */
export interface CreateBeatConfig {
  description: string;
  context?: string;
}

/**
 * Create a beat from natural language
 */
export async function createBeatFromDescription(config: CreateBeatConfig): Promise<GeneratedBeat> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.error('[AI] No ANTHROPIC_API_KEY found, using simulation mode');
    return createBeatSimulation(config);
  }

  try {
    return await createBeatWithAI(config, apiKey);
  } catch (error) {
    console.error('[AI] Failed to create with AI, falling back to simulation:', error);
    return createBeatSimulation(config);
  }
}

/**
 * Create beat using Claude API
 */
async function createBeatWithAI(config: CreateBeatConfig, apiKey: string): Promise<GeneratedBeat> {
  const { description, context } = config;

  const systemPrompt = `You are a beat creation assistant. Convert natural language descriptions into properly structured beat objects.

Available beat types:
${Object.entries(BEAT_TYPES).map(([type, desc]) => `- ${type}: ${desc}`).join('\n')}

Return a JSON beat object:
{
  "id": "beat-id",
  "type": "beatType",
  "label": "Beat Name",
  "parameters": { /* appropriate parameters for the beat type */ }
}`;

  const userPrompt = `Create a beat from this description:

${description}
${context ? `\nContext: ${context}` : ''}

Generate the appropriate beat with proper parameters.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: userPrompt,
      }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as any;
  const content = data.content[0].text;

  const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/) || [null, content];
  const jsonStr = jsonMatch[1] || content;

  return JSON.parse(jsonStr);
}

/**
 * Create beat using simulation
 */
function createBeatSimulation(config: CreateBeatConfig): GeneratedBeat {
  const { description } = config;

  return {
    id: `beat-${Date.now()}`,
    type: 'infoText',
    label: 'New Beat',
    parameters: {
      text: description,
      buttonText: 'Continue',
    },
  };
}
