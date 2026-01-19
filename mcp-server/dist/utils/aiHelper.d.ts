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
 *   titleScreen, introText, durScreen, videoBeat, endScreen, setVariable, addRemoveInventory, setTimer, inputText
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
 * - "markVisited" parameter (boolean): Show visual indication for choices leading to already-visited beats
 * - Supported on: dialogTree, movementChoice, pickProp
 * - Useful for: helping players find unexplored paths, achievement hunting
 * - "visitedBeat" condition type: Check if a specific beat has been visited
 *   Example: { "type": "visitedBeat", "beatId": "some_beat_id", "operator": "==" }
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
 * CHARACTER COUNTERS (Centralized System):
 * Counters should be defined on characters, then referenced consistently in choices:
 * - Define counters in the characters array: { "counters": [{ "name": "courage", "displayName": "Courage", "value": 50, "min": 0, "max": 100 }] }
 * - These counters become available in ALL choice-type beats (dialogTree, movementChoice, pickProp)
 * - Example character: { "id": "player", "name": "Hero", "counters": [{ "name": "courage", ... }, { "name": "health", ... }] }
 * - Example choice with counter effect: { "text": "Stand your ground", "target": "fight", "counter": "courage", "counterOperation": "change", "counterValue": 10 }
 * - Best practice: Define all counters you plan to use on relevant characters first
 *
 * IMPORTANT: For branching story points, use dialogTree or movementChoice, NOT multiple connections from introText!
 */
export declare const BEAT_TYPES: {
    readonly titleScreen: "🚨 MANDATORY FIRST BEAT (beat_0)! Start screen with title and author. SINGLE CONNECTION: only one target via connections array.";
    readonly introText: "Narrative text with Continue button. SINGLE CONNECTION ONLY: can only connect to ONE target! ❌ WRONG: introText with 2+ connections. ✓ For branching, use movementChoice or dialogTree instead.";
    readonly endScreen: "End screen with message. 🚨 MUST be actual beats in beats array, NOT an \"endings\" metadata array! ALWAYS set showRestart: true. Use \"message\" parameter (not \"endMessage\"). Example: { \"id\": \"end_bad\", \"type\": \"endScreen\", \"parameters\": { \"message\": \"You lost!\", \"showRestart\": true } }";
    readonly dialogTree: "Branching dialogue with character conversations. MULTIPLE TARGETS: define targets in dialogTree.choices[].target parameter, NOT in connections array. Supports: choiceDelay (seconds), presentationMode (\"positioned\"/\"chat-scroll\"/\"chat-bubble\"), showAvatars (boolean), responseDelay (seconds for NPC typing indicator), markVisited (boolean). Choices can modify counters via counter/counterOperation/counterValue properties.";
    readonly movementChoice: "Choice of locations/actions. MULTIPLE TARGETS: define targets in choices[].target parameter, NOT in connections array. IMPORTANT: Each choice needs { id, text, location, target } - always set \"location\" to same value as \"text\" for hover labels! Supports: choiceDelay (seconds), markVisited (boolean), showTextOnHover (boolean).";
    readonly pickProp: "Interactive prop/item selection. MULTIPLE TARGETS: define targets in props[].target parameter. IMPORTANT: prop \"name\" should be ITEM NAMES ONLY (e.g., \"Silver Key\", \"Lantern\"), NOT action descriptions (e.g., \"Take the key\" is WRONG). For actions, use movementChoice instead. Supports: choiceDelay (seconds), markVisited (boolean).";
    readonly hyperText: "Text with clickable words leading to different beats. MULTIPLE TARGETS: define in hyperlinks[].targetBeatId. Links can have custom styling (color, underline, bold). Supports optional defaultTarget for timed auto-advance.";
    readonly inputText: "Player text input. Save to: variable (default), characterName (update display name), or counter (numeric). Validation: none, numeric, email, alphanumeric. Properties: minLength, maxLength, required. SINGLE CONNECTION: only one target. Supports optional defaultTarget for timed auto-advance.";
    readonly durScreen: "Timed screen that auto-advances after duration. SINGLE CONNECTION: only one target via connections array at beat level. ❌ WRONG: connection inside parameters. ✓ CORRECT: \"connections\": [{ \"targetId\": \"beat_5\" }] at beat level.";
    readonly videoBeat: "Video playback. SINGLE CONNECTION: only one target after video ends. Supports optional defaultTarget for timed auto-advance.";
    readonly conditionBeat: "Conditional branching. NESTED FORMAT ONLY: uses condition object + trueConnection/falseConnection objects. ❌ Do NOT use flat params like trueTarget, falseTarget, variableName, operator, value. Condition types: variable, inventory, counter, counterCompare, timer, visitedBeat.";
    readonly setVariable: "Set ONE variable/counter per beat. Operations: set (replace), change (add/subtract), multiply, divide. IMPORTANT: Can only modify ONE variable at a time! To set multiple variables, chain multiple setVariable beats. SINGLE CONNECTION: executes then continues to one target.";
    readonly addRemoveInventory: "Modify inventory. Actions: add, remove, or transfer (move between characters). Use \"character\" parameter to specify which character's inventory (defaults to player). Examples: { \"action\": \"add\", \"item\": \"key\", \"character\": \"merchant\" }, { \"action\": \"transfer\", \"item\": \"sword\", \"fromCharacter\": \"player\", \"toCharacter\": \"companion\" }. SINGLE CONNECTION: executes then continues to one target.";
    readonly randomTarget: "Random branching. MULTIPLE TARGETS: define targets in choices[].target parameter.";
    readonly setTimer: "Set/check timers. Beat continues immediately to SINGLE CONNECTION target while timer runs in background. Optional timerTarget parameter: where story jumps when timer expires.";
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
    beats: GeneratedBeat[];
    connections: GeneratedConnection[];
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