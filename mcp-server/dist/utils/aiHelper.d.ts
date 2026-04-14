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
export declare const BEAT_TYPES: {
    readonly titleScreen: "🚨 MANDATORY FIRST BEAT (beat_0)! Start screen with title and author. SINGLE CONNECTION: only one target via connections array.";
    readonly infoText: "Narrative text with Continue button. SINGLE CONNECTION ONLY: can only connect to ONE target! ❌ WRONG: infoText with 2+ connections. ✓ For branching, use movementChoice or dialogTree instead. Optional: textVariations (array) for random text selection at runtime.";
    readonly endScreen: "End screen with message. 🚨 MUST be actual beats in beats array, NOT an \"endings\" metadata array! ALWAYS set showRestart: true AND add a connection back to beat_0 (titleScreen) so the restart button works: \"connections\": [{ \"targetId\": \"beat_0\" }]. Use \"message\" parameter (not \"endMessage\"). Optional credits page: showCredits (boolean), creditsPageTitle (default \"Credits\"), creditsPageBody (text content), creditsCloseText (default \"Close\"), creditsText (button label). Example: { \"id\": \"end_bad\", \"type\": \"endScreen\", \"parameters\": { \"message\": \"You lost!\", \"showRestart\": true, \"showCredits\": true, \"creditsPageTitle\": \"Credits\", \"creditsPageBody\": \"Created by...\" }, \"connections\": [{ \"targetId\": \"beat_0\" }] }";
    readonly dialogTree: "🚨 DEFAULT CHOICE BEAT — use this for ANY multi-option choice (conversations, decisions, actions, story branches). Shows choices as visible buttons. For simple non-NPC branching, use a SHALLOW dialogTree: set speaker to \"\" (empty), text to the scene/question, and put 2-4 options as top-level choices. MULTIPLE TARGETS: define targets in dialogTree.choices[].target parameter, NOT in connections array. Supports: choiceDelay (seconds), presentationMode (\"positioned\"/\"chat-scroll\"/\"chat-bubble\"), showAvatars (boolean), responseDelay (seconds for NPC typing indicator), markVisited (boolean for per-choice visited tracking). Choices can modify counters via counter/counterOperation/counterValue properties. RECURSIVE DIALOGS: use target \"__self__\" to loop back to the same dialogTree (e.g., interrogation, shopping). NPC AUTO-EXIT: A dialog node can have a \"target\" field to auto-advance WITHOUT showing choices (NPC dismissals, forced exits). When \"target\" is set on a node, choices are ignored. Example shallow (general branching): { \"dialogTree\": { \"id\": \"root\", \"speaker\": \"\", \"text\": \"You stand at a crossroads.\", \"choices\": [{ \"id\": \"c1\", \"text\": \"Take the forest path\", \"target\": \"beat_forest\" }, { \"id\": \"c2\", \"text\": \"Follow the river\", \"target\": \"beat_river\" }] } }.";
    readonly movementChoice: "🚨 SPECIALIZED — NOT the default multi-choice beat! Renders choices as INVISIBLE HOTSPOTS on a background scene. Only use when the scene has a background image AND each choice maps to a spatial location on that image (e.g., clicking the library door, staircase, garden gate). For abstract choices (actions, answers, decisions), use dialogTree instead. When in doubt: use dialogTree. MULTIPLE TARGETS: define targets in choices[].target parameter, NOT in connections array. Each choice needs { id, text, location, target } - always set \"location\" to same value as \"text\". Supports: choiceDelay (seconds), markVisited (boolean), showTextOnHover (boolean).";
    readonly pickProp: "Interactive prop/item selection. MULTIPLE TARGETS: define targets in props[].target parameter. IMPORTANT: prop \"name\" should be ITEM NAMES ONLY (e.g., \"Silver Key\", \"Lantern\"), NOT action descriptions (e.g., \"Take the key\" is WRONG). For actions, use movementChoice instead. Supports: choiceDelay (seconds), markVisited (boolean).";
    readonly hyperText: "Text with clickable words leading to different beats. MULTIPLE TARGETS: define in hyperlinks[].targetBeatId. Links can have custom styling (color, underline, bold). Supports optional defaultTarget for timed auto-advance.";
    readonly inputText: "Player text input. Save to: variable (default), characterName (update display name), or counter (numeric). Validation: none, numeric, email, alphanumeric. Properties: minLength, maxLength, required. SINGLE CONNECTION: only one target. Supports optional defaultTarget for timed auto-advance.";
    readonly keypad: "Numeric keypad input (PIN entry, safe locks, phone dialers). Parameters: prompt, layout (\"numeric\"|\"phone\"|\"pin\"), maxDigits, minDigits, correctCode (optional auto-validation), failTarget (beat on wrong code), maxAttempts (0=unlimited), maskInput (boolean), saveToType (\"variable\"|\"counter\"), variable, buttonText, clearButtonText, showDisplay. SINGLE CONNECTION: correct code or submit → next beat. If correctCode is set, validates automatically and routes to failTarget on wrong entry.";
    readonly durScreen: "Timed screen that auto-advances after duration. SINGLE CONNECTION: only one target via connections array at beat level. ❌ WRONG: connection inside parameters. ✓ CORRECT: \"connections\": [{ \"targetId\": \"beat_5\" }] at beat level. Optional: textVariations (array) for random text selection at runtime.";
    readonly videoBeat: "Video playback. SINGLE CONNECTION: only one target after video ends. Supports optional defaultTarget for timed auto-advance.";
    readonly conditionBeat: "Conditional branching. NESTED FORMAT ONLY: uses condition object + trueConnection/falseConnection objects. ❌ Do NOT use flat params like trueTarget, falseTarget, variableName, operator, value. Condition types: variable, inventory, counter, counterCompare, timer, visitedBeat, fictionalTime (compare in-story date/time).";
    readonly setVariable: "Set ONE variable/counter/fictionalTime per beat. Types: \"variable\" (text/boolean), \"counter\" (numeric ops), \"fictionalTime\" (set/advance/subtract in-story date/time). Operations: set, add, subtract, multiply, divide. IMPORTANT: Can only modify ONE variable at a time! To set multiple variables, chain multiple setVariable beats. SINGLE CONNECTION: executes then continues to one target.";
    readonly addRemoveInventory: "Modify inventory. Actions: add, remove, or transfer (move between characters). Use \"character\" parameter to specify which character's inventory (defaults to player). Examples: { \"action\": \"add\", \"item\": \"key\", \"character\": \"merchant\" }, { \"action\": \"transfer\", \"item\": \"sword\", \"fromCharacter\": \"player\", \"toCharacter\": \"companion\" }. SINGLE CONNECTION: executes then continues to one target.";
    readonly randomTarget: "Random branching. MULTIPLE TARGETS: define targets in choices[].target parameter.";
    readonly setTimer: "Set/check timers. Beat continues immediately to SINGLE CONNECTION target while timer runs in background. Optional timerTarget parameter: where story jumps when timer expires.";
    readonly aiInfoText: "AI-generated contextual text with Continue button. Parameters: prompt (context for AI), fallbackText (if AI unavailable), buttonText, includeVariables, includeInventory, includeHistory, maxSentences, contextVariables. SINGLE CONNECTION. Generates personalized 1-2 sentences based on player state.";
    readonly aiDurScreen: "AI-generated text with auto-advance based on reading speed. Parameters: prompt, fallbackText, includeVariables, includeInventory, includeHistory, maxSentences, contextVariables, wordsPerMinute (default 200), minDuration (ms), maxDuration (ms). SINGLE CONNECTION.";
    readonly aiDialogTree: "AI-generated branching dialogue at runtime. Creates personalized conversations based on player state. Parameters: scenario, npcName, npcPersonality, maxTurns, exitTargets (array of {id, description, npcExitMessage?}), includeVariables, includeInventory, includeVisitedBeats, includeChoiceHistory, systemInstructions, presentationMode, showAvatars. MULTIPLE CONNECTIONS via exitTargets. npcExitMessage: optional prompt for AI to generate a farewell that acknowledges the player's last choice.";
    readonly aiConversation: "Real-time AI conversation with author-defined steering rules. Each NPC response generated live based on conversation history + active directions. Parameters: scenario, npcName, npcPersonality, maxTurns, directions (array of steering rules with triggers and actions), fallbackExitTarget, openingLine, systemInstructions. MULTIPLE CONNECTIONS via exit directions + fallback. Directions can steer conversation, exit to a beat, set variables, or combine actions. Supports npcExitMessage for farewell responses.";
    readonly aiSummary: "AI-generated personalized summary of the player's journey — can REPLACE endScreen as story ending! Generates a recap based on the player's actual choices, variables, and inventory. Has ALL the same ending capabilities as endScreen. Parameters: prompt, title, summaryStyle (\"narrative\"|\"bullet-points\"|\"reflection\"), maxLength (\"short\"|\"medium\"|\"long\"), includeVariables, includeInventory, includeCounters, includeVisitedBeats, includeChoiceHistory, showRestart (boolean, ALWAYS true when used as ending), showCredits (boolean), resetOnRestart (boolean), resetVariables, resetCounters, resetInventory, resetTimers, resetFictionalTime, resetVisitedTracking, resetHistory (granular reset sub-options), creditsPageTitle, creditsPageBody, creditsCloseText, restartText, creditsText. Connect to beat_0 (titleScreen) for restart when used as ending.";
    readonly aiCondition: "AI-driven branching that analyzes player state to determine path. Parameters: prompt (what AI evaluates), categories (array of {name, description, targetId}), evaluateVariables, evaluateInventory, evaluateHistory, evaluateCounters, evaluateChoiceHistory, fallbackTarget, timeout. MULTIPLE CONNECTIONS via categories. AI classifies player state and routes to appropriate category target.";
    readonly onlineContent: "Fetch and display real-time data from web APIs or AI queries. Parameters: sourceType (\"api\" or \"ai-query\"), apiUrl, apiParams, jsonPath, query, title, maxWords, fallbackText, buttonText. SINGLE CONNECTION. For dynamic content like weather, news, or AI-generated facts.";
};
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
    position?: {
        x: number;
        y: number;
    };
    cluster?: string;
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
export declare function generateStory(config: StoryConfig): Promise<GeneratedStory>;
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
export declare function generateDialog(config: DialogConfig): Promise<GeneratedDialog>;
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
export declare function suggestBeats(config: SuggestBeatsConfig): Promise<BeatSuggestion>;
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
export declare function createBeatFromDescription(config: CreateBeatConfig): Promise<GeneratedBeat>;
//# sourceMappingURL=aiHelper.d.ts.map