// Type declarations for @asaps/core
// This is a temporary workaround for the build issue

declare module '@asaps/core' {
  // Types
  export interface BeatConfig {
    id: string;
    name: string;
    type: string;
    cluster?: string;
    transition?: Transition;
    sound?: Sound;
    locations?: Location[];
    parameters?: Record<string, any>;
    defaultTarget?: string;
    x?: number;
    y?: number;
  }

  export interface Connection {
    targetId: string;
    label?: string;
    condition?: Condition;
  }

  export interface Location {
    kind: 'text' | 'image' | 'button' | 'video';
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    zIndex?: number;
  }

  export interface Transition {
    type: 'none' | 'fade' | 'slide' | 'zoom' | 'dissolve';
    duration: number;
    direction?: 'in' | 'out' | 'both';
    easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
  }

  export interface Sound {
    file: string;
    volume?: number;
    loop?: boolean;
    fadeIn?: number;
    fadeOut?: number;
  }

  export interface Condition {
    type: 'variable' | 'inventory' | 'counter' | 'timer';
    operator: '==' | '!=' | '>' | '<' | '>=' | '<=' | 'contains';
    left: string;
    right: any;
  }

  export interface Effect {
    type: 'setVariable' | 'addInventory' | 'removeInventory' | 'incrementCounter';
    target: string;
    value?: any;
  }

  export interface IRenderer {
    renderTitleScreen(title: string, author: string, buttonText: string): Promise<void>;
    renderText(text: string, buttonText: string): Promise<void>;
    renderDialog(speaker: string, text: string, emotion?: string): Promise<void>;
    renderChoices(choices: { id: string; text: string }[]): Promise<string>;
    renderMovement(question: string, options: { id: string; text: string; location: string }[]): Promise<string>;
    renderProps(question: string, props: { id: string; name: string; description: string }[]): Promise<string>;
    renderVideo(file: string, autoplay: boolean, controls: boolean): Promise<void>;
    renderEndScreen(message: string, showRestart: boolean, showCredits: boolean): Promise<void>;
    applyTransition(transition: Transition): Promise<void>;
    playSound(sound: Sound): Promise<void>;
    clear(): void;
  }

  // Classes
  export class Beat {
    id: string;
    name: string;
    type: string;
    cluster?: string;
    transition?: Transition;
    sound?: Sound;
    locations: Map<string, Location>;
    connections: Connection[];
    defaultTarget?: string;
    x?: number;
    y?: number;

    constructor(config: BeatConfig);
    execute(context: StoryContext, renderer: IRenderer): Promise<string | null>;
    addConnection(connection: Connection): void;
    getConnections(): Connection[];
    getNextBeat(context: StoryContext): string | null;
    toJSON(): any;
  }

  export class StoryContext {
    constructor(initialState?: any, story?: Story);
    getVariable(name: string): any;
    setVariable(name: string, value: any): void;
    incrementCounter(name: string, value?: number): void;
    addToInventory(item: string): void;
    removeFromInventory(item: string): void;
    hasInInventory(item: string): boolean;
    checkCondition(condition: Condition): boolean;
    applyEffect(effect: Effect): void;
    markBeatVisited(beatId: string): void;
    getState(): any;
    getVisitedBeats(): string[];
    getVariables(): Record<string, any>;
    getInventory(): string[];
    reset(): void;
    getStory(): Story;
    setStory(story: Story): void;
  }

  export class Story {
    constructor(config?: any);
    addBeat(beat: Beat): void;
    removeBeat(beatId: string): void;
    getBeat(beatId: string): Beat | undefined;
    getAllBeats(): Beat[];
    getFirstBeat(): Beat | undefined;
    setMetadata(metadata: any): void;
    getMetadata(): any;
    setSettings(settings: any): void;
    getSettings(): any;
    setEnvironment(environment: any): void;
    getEnvironment(): any;
    setCharacters(characters: any[]): void;
    getCharacters(): any[];
    getClusters(): any[];
    validate(): { valid: boolean; errors: string[] };
    reset(): void;
  }

  export class StoryEngine {
    constructor(renderer: IRenderer);
    loadStory(story: Story): Promise<void>;
    start(): Promise<void>;
    stop(): void;
    getContext(): StoryContext;
    getCurrentBeat(): Beat | null;
    goToBeat(beatId: string): Promise<void>;
  }

  export class BeatTypeRegistry {
    static getInstance(): BeatTypeRegistry;
    registerBeatType(type: string, beatClass: typeof Beat): void;
    createBeat(type: string, config: BeatConfig): Beat;
    getAllTypes(): string[];
  }

  // Specific Beat Classes
  export class TitleScreenBeat extends Beat {}
  export class IntroTextBeat extends Beat {}
  export class EndScreenBeat extends Beat {}
  export class MovementChoiceBeat extends Beat {}
  export class PickPropBeat extends Beat {}
  export class DialogTreeBeat extends Beat {}
  export class SetVariableBeat extends Beat {}
  export class ConditionBeat extends Beat {}
  export class ConversationChoiceBeat extends Beat {}
  export class DurScreenBeat extends Beat {}
  export class VideoBeat extends Beat {}
  export class SWFBeat extends Beat {}

  // XML Processing
  export class ASMLParser {
    parse(xml: string): Promise<any>;
  }

  export class ASMLGenerator {
    generate(story: Story): string;
  }

  export class ASMLProcessor {
    parseASML(xml: string): Promise<{
      success: boolean;
      story?: Story;
      errors: string[];
      warnings: string[];
    }>;
    generateASML(story: Story): string;
  }
}