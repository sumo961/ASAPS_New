import { Beat } from '../src/beats/Beat';
import { Story } from '../src/engine/Story';
import { StoryContext } from '../src/engine/StoryContext';
import { BeatConfig } from '../src/types/BeatConfig';
import { BeatTypeRegistry } from '../src/beats/BeatRegistry';

/**
 * Test utilities for core beat and story testing
 */

// Mock beat implementation for testing
export class MockBeat extends Beat {
  private _performActionCalled = false;
  private _parameters: Record<string, any> = {};

  constructor(config: BeatConfig) {
    super(config);
    this._parameters = config.parameters || {};
  }

  async performAction(context: StoryContext): Promise<StoryContext> {
    this._performActionCalled = true;
    return context;
  }

  getParameters(): Record<string, any> {
    return this._parameters;
  }

  updateParameters(params: Record<string, any>): void {
    this._parameters = { ...this._parameters, ...params };
  }

  wasPerformActionCalled(): boolean {
    return this._performActionCalled;
  }
}

// Test story factory
export function createTestStory(beats: BeatConfig[] = []): Story {
  const story = new Story();

  beats.forEach(beatConfig => {
    const beat = createTestBeat(beatConfig);
    story.addBeat(beat);
  });

  return story;
}

// Test beat factory
export function createTestBeat(config: Partial<BeatConfig> = {}): Beat {
  const defaultConfig: BeatConfig = {
    id: 'test-beat',
    name: 'Test Beat',
    type: 'titleScreen',
    parameters: {},
    ...config
  };

  const registry = BeatTypeRegistry.getInstance();
  return registry.createBeat(defaultConfig.type, defaultConfig);
}

// Test context factory
export function createTestContext(overrides: Partial<StoryContext> = {}): StoryContext {
  const context = new StoryContext();

  // Apply overrides
  Object.keys(overrides).forEach(key => {
    (context as any)[key] = overrides[key as keyof StoryContext];
  });

  return context;
}

// XML test data generators
export const TestXML = {
  minimalStory: `<?xml version="1.0" encoding="UTF-8"?>
<story title="Minimal Test" author="Test" version="1.0">
  <plot>
    <beat>
      <id id="0" name="Start" />
      <function kind="titleScreen" title="Test Story" author="Test" buttonText="Begin" />
    </beat>
  </plot>
</story>`,

  storyWithSettings: `<?xml version="1.0" encoding="UTF-8"?>
<story title="Settings Test" author="Test" version="1.0">
  <settings>
    <debug firstbeat="0" showvals="on" />
    <colors pcolor="0x7D8DA3" palpha="90" />
    <fonts titleFont="Gothic" textFont="Handwriting2" />
    <textbox radius="20" />
  </settings>
  <plot>
    <beat>
      <id id="0" name="Start" />
      <function kind="titleScreen" title="Test Story" author="Test" buttonText="Begin" />
    </beat>
  </plot>
</story>`,

  storyWithCharacters: `<?xml version="1.0" encoding="UTF-8"?>
<story title="Character Test" author="Test" version="1.0">
  <characters>
    <character id="hero" name="Hero">
      <counter name="health" value="100" />
      <counter name="strength" value="10" />
    </character>
  </characters>
  <plot>
    <beat>
      <id id="0" name="Start" />
      <function kind="titleScreen" title="Test Story" author="Test" buttonText="Begin" />
    </beat>
  </plot>
</story>`,

  storyWithEnvironment: `<?xml version="1.0" encoding="UTF-8"?>
<story title="Environment Test" author="Test" version="1.0">
  <environment>
    <prop id="key" name="Golden Key" file="key.png" x="100" y="200" />
    <node id="forest" name="Dark Forest" x="50" y="150" />
  </environment>
  <plot>
    <beat>
      <id id="0" name="Start" />
      <function kind="titleScreen" title="Test Story" author="Test" buttonText="Begin" />
    </beat>
  </plot>
</story>`,

  storyWithMultipleBeats: `<?xml version="1.0" encoding="UTF-8"?>
<story title="Multi Beat Test" author="Test" version="1.0">
  <plot>
    <beat>
      <id id="0" name="Title" />
      <function kind="titleScreen" title="Test Story" author="Test" buttonText="Begin" />
    </beat>
    <beat>
      <id id="1" name="Intro" />
      <function kind="introText" text="Welcome to the story..." buttonText="Continue" />
    </beat>
    <beat>
      <id id="2" name="Dialog" />
      <function kind="dialogTree">
        <dialogTree id="root" speaker="NPC" text="Hello traveler">
          <choice id="1" text="Hello" target="3" />
        </dialogTree>
      </function>
    </beat>
  </plot>
</story>`,

  legacyStory: `<?xml version="1.0" encoding="UTF-8"?>
<story title="Legacy Test" author="Test" version="1.0">
  <plot>
    <beat>
      <id id="0" name="Legacy" />
      <function kind="conversationChoice" questioner="Merchant" question="What would you like?">
        <choice id="1" text="Sword" targetBeat="1" />
      </function>
    </beat>
    <beat>
      <id id="1" name="Legacy Global" />
      <function kind="setGlobal" variable="gold" value="100" />
    </beat>
  </plot>
</story>`
};

// Async test helpers
export async function expectAsyncError(
  asyncFn: () => Promise<any>,
  expectedError?: string | RegExp
): Promise<void> {
  try {
    await asyncFn();
    throw new Error('Expected function to throw an error');
  } catch (error) {
    if (expectedError) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (typeof expectedError === 'string') {
        expect(errorMessage).toContain(expectedError);
      } else {
        expect(errorMessage).toMatch(expectedError);
      }
    }
  }
}

// Event testing utilities
export class MockEventTarget {
  private listeners: Map<string, Function[]> = new Map();

  addEventListener(event: string, listener: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);
  }

  removeEventListener(event: string, listener: Function): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      const index = eventListeners.indexOf(listener);
      if (index > -1) {
        eventListeners.splice(index, 1);
      }
    }
  }

  dispatchEvent(event: string, data?: any): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(listener => listener(data));
    }
  }

  getListenerCount(event: string): number {
    return this.listeners.get(event)?.length || 0;
  }
}

// Timer utilities for async testing
export function createDelayedPromise<T>(value: T, delay: number): Promise<T> {
  return new Promise(resolve => {
    setTimeout(() => resolve(value), delay);
  });
}

export function createRejectingPromise(error: Error, delay: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(error), delay);
  });
}

// Registry testing utilities
export function resetBeatRegistry(): void {
  const registry = BeatTypeRegistry.getInstance();
  // Reset to default state
  (registry as any).beatTypes.clear();
  registry.registerDefaultBeats();
}

// Story flow testing
export class StoryFlowTester {
  private story: Story;
  private visitedBeats: Set<string> = new Set();
  private currentBeatId: string | null = null;

  constructor(story: Story) {
    this.story = story;
  }

  async visitBeat(beatId: string): Promise<StoryContext> {
    this.visitedBeats.add(beatId);
    this.currentBeatId = beatId;
    const beat = this.story.getBeat(beatId);
    if (!beat) {
      throw new Error(`Beat ${beatId} not found`);
    }

    const context = new StoryContext();
    return beat.execute(context);
  }

  getVisitedBeats(): string[] {
    return Array.from(this.visitedBeats);
  }

  getCurrentBeatId(): string | null {
    return this.currentBeatId;
  }

  hasVisitedBeat(beatId: string): boolean {
    return this.visitedBeats.has(beatId);
  }

  async followPath(path: string[]): Promise<StoryContext> {
    let context = new StoryContext();
    for (const beatId of path) {
      context = await this.visitBeat(beatId);
    }
    return context;
  }
}

// Export all utilities
export const TestUtils = {
  createTestStory,
  createTestBeat,
  createTestContext,
  TestXML,
  expectAsyncError,
  MockEventTarget,
  createDelayedPromise,
  createRejectingPromise,
  resetBeatRegistry,
  StoryFlowTester
};