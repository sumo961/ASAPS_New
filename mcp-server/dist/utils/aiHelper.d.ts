/**
 * AI Helper for Story Generation
 *
 * Provides AI-powered story generation using Claude API or simulation mode
 */
/**
 * Beat type definitions for generation
 */
export declare const BEAT_TYPES: {
    readonly titleScreen: "Start screen with title and author";
    readonly introText: "Introductory text or narration";
    readonly endScreen: "End screen with message";
    readonly dialogTree: "Branching dialogue with character conversations";
    readonly movementChoice: "Choice of locations to move to";
    readonly pickProp: "Interactive prop selection";
    readonly hyperText: "Text with embedded hyperlinks";
    readonly inputText: "Player text input";
    readonly durScreen: "Timed screen that auto-advances";
    readonly videoBeat: "Video playback";
    readonly conditionBeat: "Conditional branching based on variables";
    readonly setVariable: "Set story variables";
    readonly addRemoveInventory: "Modify player inventory";
    readonly randomTarget: "Random branching";
    readonly setTimer: "Set/check timers";
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