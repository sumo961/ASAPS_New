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
 *   - conditionBeat: uses trueTarget and falseTarget parameters
 *   - randomTarget: targets defined in choices[].target
 *
 * DEFAULT TARGET (Timed Auto-Advance):
 * Most visible beats (EXCEPT durScreen) can have an OPTIONAL defaultTarget parameter with a timeout.
 * This auto-advances to a different beat if the interactor doesn't act within the specified time.
 * - Set via parameters: defaultTarget (beat ID) and defaultTargetTimeout (milliseconds)
 * - Example: { defaultTarget: "beat_timeout", defaultTargetTimeout: 30000 } = auto-advance after 30 seconds
 * - Useful for: creating urgency, handling inactive users, timed puzzles
 * - NOT available on durScreen (which already auto-advances by design)
 *
 * IMPORTANT: For branching story points, use dialogTree or movementChoice, NOT multiple connections from introText!
 */
export declare const BEAT_TYPES: {
    readonly titleScreen: "Start screen with title and author. SINGLE CONNECTION: only one target via connections array. Supports optional defaultTarget for timed auto-advance.";
    readonly introText: "Narrative text with Continue button. SINGLE CONNECTION: only one target via connections array. For branching, use movementChoice or dialogTree instead. Supports optional defaultTarget for timed auto-advance.";
    readonly endScreen: "End screen with message. SINGLE CONNECTION or no connections (story ends here). Supports optional defaultTarget for timed auto-advance.";
    readonly dialogTree: "Branching dialogue with character conversations. MULTIPLE TARGETS: define targets in dialogTree.choices[].target parameter, NOT in connections array. Supports optional defaultTarget for timed auto-advance if no choice is made.";
    readonly movementChoice: "Choice of locations/actions. MULTIPLE TARGETS: define targets in choices[].target parameter, NOT in connections array. Supports optional defaultTarget for timed auto-advance if no choice is made.";
    readonly pickProp: "Interactive prop selection. MULTIPLE TARGETS: define targets in props[].target parameter. Supports optional defaultTarget for timed auto-advance.";
    readonly hyperText: "Text with clickable words leading to different beats. MULTIPLE TARGETS: define in hyperlinks[].targetBeatId. Supports optional defaultTarget for timed auto-advance.";
    readonly inputText: "Player text input with validation. SINGLE CONNECTION: only one target. Supports optional defaultTarget for timed auto-advance if no input is provided.";
    readonly durScreen: "Timed screen that auto-advances after duration. SINGLE CONNECTION: only one target. NO defaultTarget (already auto-advances by design).";
    readonly videoBeat: "Video playback. SINGLE CONNECTION: only one target after video ends. Supports optional defaultTarget for timed auto-advance.";
    readonly conditionBeat: "Conditional branching. TWO TARGETS: uses trueTarget and falseTarget parameters, NOT connections array.";
    readonly setVariable: "Set ONE variable/counter per beat. IMPORTANT: Can only modify ONE variable at a time! To set multiple variables, use multiple consecutive setVariable beats chained together. SINGLE CONNECTION: executes then continues to one target.";
    readonly addRemoveInventory: "Modify player inventory. SINGLE CONNECTION: executes then continues to one target.";
    readonly randomTarget: "Random branching. MULTIPLE TARGETS: define targets in choices[].target parameter.";
    readonly setTimer: "Set/check timers. SINGLE CONNECTION: plus optional timerTarget parameter for timeout.";
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