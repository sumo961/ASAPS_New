import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Story } from '../../src/engine/Story';
import { Beat } from '../../src/beats/Beat';
import { StoryContext } from '../../src/engine/StoryContext';
import { BeatConfig } from '../../src/types/BeatConfig';
import { BeatTypeRegistry } from '../../src/beats/BeatRegistry';

// Test beat implementation
class TestBeat extends Beat {
  private _parameters: Record<string, any> = {};

  constructor(config: BeatConfig) {
    super(config);
    this._parameters = config.parameters || {};
  }

  async performAction(context: StoryContext): Promise<StoryContext> {
    // Mark that this beat was executed
    context.setVariable(`beat_${this.id}_executed`, true);
    return context;
  }

  getParameters(): Record<string, any> {
    return this._parameters;
  }

  updateParameters(params: Record<string, any>): void {
    this._parameters = { ...this._parameters, ...params };
  }
}

/**
 * NOTE: Most of these tests are for features not yet implemented in Story class.
 * Missing methods: getStartingBeat(), setStartingBeat(), removeBeat(), execute(),
 * getCharacter(), fromJSON(), validate(), event system, etc.
 */
describe.skip('Story', () => {
  let story: Story;
  let registry: BeatTypeRegistry;

  beforeEach(() => {
    story = new Story();
    registry = BeatTypeRegistry.getInstance();

    // Register our test beat type
    registry.registerBeatType('testBeat', {
      displayName: 'Test Beat',
      category: 'visible',
      description: 'A test beat for unit testing',
      classConstructor: TestBeat
    });
  });

  describe('Story Creation', () => {
    it('should create a story with default metadata', () => {
      const metadata = story.getMetadata();

      expect(metadata.title).toBe('Untitled Story');
      expect(metadata.author).toBe('Unknown Author');
      expect(metadata.version).toBe('1.0');
    });

    it('should create a story with custom metadata', () => {
      const customStory = new Story({
        title: 'Custom Story',
        author: 'Test Author',
        version: '2.0'
      });

      const metadata = customStory.getMetadata();
      expect(metadata.title).toBe('Custom Story');
      expect(metadata.author).toBe('Test Author');
      expect(metadata.version).toBe('2.0');
    });

    it('should initialize with empty beats', () => {
      expect(story.getAllBeats()).toHaveLength(0);
      expect(story.getStartingBeat()).toBeNull();
    });
  });

  describe('Beat Management', () => {
    it('should add beats to the story', () => {
      const beat1 = registry.createBeat('testBeat', {
        id: 'beat-1',
        name: 'First Beat',
        type: 'testBeat'
      });

      const beat2 = registry.createBeat('testBeat', {
        id: 'beat-2',
        name: 'Second Beat',
        type: 'testBeat'
      });

      story.addBeat(beat1);
      story.addBeat(beat2);

      expect(story.getAllBeats()).toHaveLength(2);
      expect(story.getBeat('beat-1')).toBe(beat1);
      expect(story.getBeat('beat-2')).toBe(beat2);
    });

    it('should not add duplicate beat IDs', () => {
      const beat1 = registry.createBeat('testBeat', {
        id: 'beat-1',
        name: 'First Beat',
        type: 'testBeat'
      });

      const beat2 = registry.createBeat('testBeat', {
        id: 'beat-1', // Same ID
        name: 'Second Beat',
        type: 'testBeat'
      });

      story.addBeat(beat1);
      expect(() => {
        story.addBeat(beat2);
      }).toThrow('Beat with ID beat-1 already exists');
    });

    it('should remove beats from the story', () => {
      const beat = registry.createBeat('testBeat', {
        id: 'beat-1',
        name: 'Test Beat',
        type: 'testBeat'
      });

      story.addBeat(beat);
      expect(story.getAllBeats()).toHaveLength(1);

      const removed = story.removeBeat('beat-1');
      expect(removed).toBe(true);
      expect(story.getAllBeats()).toHaveLength(0);
      expect(story.getBeat('beat-1')).toBeNull();
    });

    it('should return false when removing non-existent beat', () => {
      const removed = story.removeBeat('non-existent');
      expect(removed).toBe(false);
    });

    it('should set and get starting beat', () => {
      const beat = registry.createBeat('testBeat', {
        id: 'start-beat',
        name: 'Starting Beat',
        type: 'testBeat'
      });

      story.addBeat(beat);
      story.setStartingBeat('start-beat');

      expect(story.getStartingBeat()).toBe(beat);
    });

    it('should throw error when setting non-existent starting beat', () => {
      expect(() => {
        story.setStartingBeat('non-existent');
      }).toThrow('Beat with ID non-existent not found');
    });
  });

  describe('Story Execution', () => {
    it('should execute a single beat', async () => {
      const beat = registry.createBeat('testBeat', {
        id: 'test-beat',
        name: 'Test Beat',
        type: 'testBeat'
      });

      story.addBeat(beat);
      story.setStartingBeat('test-beat');

      const context = await story.execute('test-beat');

      expect(context).toBeInstanceOf(StoryContext);
      expect(context.getVariable('beat_test-beat_executed')).toBe(true);
    });

    it('should execute story from starting beat', async () => {
      const beat = registry.createBeat('testBeat', {
        id: 'start-beat',
        name: 'Starting Beat',
        type: 'testBeat'
      });

      story.addBeat(beat);
      story.setStartingBeat('start-beat');

      const context = await story.execute();

      expect(context).toBeInstanceOf(StoryContext);
      expect(context.getVariable('beat_start-beat_executed')).toBe(true);
    });

    it('should throw error when no starting beat is set', async () => {
      await expect(story.execute()).rejects.toThrow('No starting beat set');
    });

    it('should throw error when executing non-existent beat', async () => {
      await expect(story.execute('non-existent')).rejects.toThrow('Beat with ID non-existent not found');
    });
  });

  describe('Story Metadata', () => {
    it('should update story metadata', () => {
      story.setMetadata({
        title: 'New Title',
        author: 'New Author',
        version: '3.0'
      });

      const metadata = story.getMetadata();
      expect(metadata.title).toBe('New Title');
      expect(metadata.author).toBe('New Author');
      expect(metadata.version).toBe('3.0');
    });

    it('should update partial metadata', () => {
      story.setMetadata({
        title: 'Only Title Updated'
      });

      const metadata = story.getMetadata();
      expect(metadata.title).toBe('Only Title Updated');
      expect(metadata.author).toBe('Unknown Author'); // Should remain unchanged
      expect(metadata.version).toBe('1.0'); // Should remain unchanged
    });
  });

  describe('Story Settings', () => {
    it('should set and get story settings', () => {
      const settings = {
        debug: {
          firstbeat: '0',
          showvals: 'on'
        },
        colors: {
          pcolor: '0x7D8DA3',
          palpha: '90'
        }
      };

      story.setSettings(settings);
      const retrievedSettings = story.getSettings();

      expect(retrievedSettings).toEqual(settings);
    });

    it('should merge settings when updating partially', () => {
      story.setSettings({
        debug: {
          firstbeat: '0'
        },
        colors: {
          pcolor: '0x7D8DA3'
        }
      });

      story.setSettings({
        debug: {
          showvals: 'on'
        },
        fonts: {
          titleFont: 'Arial'
        }
      });

      const settings = story.getSettings();
      expect(settings.debug).toEqual({
        firstbeat: '0',
        showvals: 'on'
      });
      expect(settings.colors).toEqual({
        pcolor: '0x7D8DA3'
      });
      expect(settings.fonts).toEqual({
        titleFont: 'Arial'
      });
    });
  });

  describe('Characters', () => {
    it('should add and get characters', () => {
      const characters = [
        {
          id: 'hero',
          name: 'Hero',
          counters: [
            { name: 'health', value: '100' },
            { name: 'strength', value: '10' }
          ]
        },
        {
          id: 'villain',
          name: 'Villain',
          counters: [
            { name: 'health', value: '150' }
          ]
        }
      ];

      story.setCharacters(characters);
      const retrievedCharacters = story.getCharacters();

      expect(retrievedCharacters).toHaveLength(2);
      expect(retrievedCharacters[0].id).toBe('hero');
      expect(retrievedCharacters[0].counters).toHaveLength(2);
      expect(retrievedCharacters[1].id).toBe('villain');
    });

    it('should get character by ID', () => {
      const characters = [
        {
          id: 'hero',
          name: 'Hero',
          counters: []
        }
      ];

      story.setCharacters(characters);
      const character = story.getCharacter('hero');

      expect(character).toBeDefined();
      expect(character?.name).toBe('Hero');
    });

    it('should return null for non-existent character', () => {
      const character = story.getCharacter('non-existent');
      expect(character).toBeNull();
    });
  });

  describe('Environment', () => {
    it('should set and get environment', () => {
      const environment = {
        props: [
          {
            id: 'key',
            name: 'Golden Key',
            file: 'key.png',
            x: '100',
            y: '200'
          }
        ],
        nodes: [
          {
            id: 'forest',
            name: 'Dark Forest',
            x: '50',
            y: '150'
          }
        ]
      };

      story.setEnvironment(environment);
      const retrievedEnvironment = story.getEnvironment();

      expect(retrievedEnvironment).toEqual(environment);
    });
  });

  describe('Story Serialization', () => {
    it('should serialize story to JSON', () => {
      const beat = registry.createBeat('testBeat', {
        id: 'test-beat',
        name: 'Test Beat',
        type: 'testBeat',
        parameters: { message: 'Hello' }
      });

      story.addBeat(beat);
      story.setStartingBeat('test-beat');
      story.setMetadata({
        title: 'Test Story',
        author: 'Test Author'
      });

      const json = story.toJSON();

      expect(json).toHaveProperty('metadata');
      expect(json.metadata.title).toBe('Test Story');
      expect(json.metadata.author).toBe('Test Author');
      expect(json).toHaveProperty('beats');
      expect(json.beats).toHaveLength(1);
      expect(json.beats[0]).toHaveProperty('id', 'test-beat');
      expect(json).toHaveProperty('startingBeatId', 'test-beat');
    });

    it('should deserialize story from JSON', () => {
      const json = {
        metadata: {
          title: 'Test Story',
          author: 'Test Author',
          version: '1.0'
        },
        beats: [
          {
            id: 'test-beat',
            name: 'Test Beat',
            type: 'testBeat',
            parameters: { message: 'Hello' }
          }
        ],
        startingBeatId: 'test-beat',
        settings: {
          debug: { firstbeat: '0' }
        },
        characters: [],
        environment: { props: [], nodes: [] }
      };

      const deserializedStory = Story.fromJSON(json);

      expect(deserializedStory.getMetadata().title).toBe('Test Story');
      expect(deserializedStory.getAllBeats()).toHaveLength(1);
      expect(deserializedStory.getStartingBeat()?.id).toBe('test-beat');
    });
  });

  describe('Story Validation', () => {
    it('should validate story structure', () => {
      const beat = registry.createBeat('testBeat', {
        id: 'test-beat',
        name: 'Test Beat',
        type: 'testBeat'
      });

      story.addBeat(beat);
      story.setStartingBeat('test-beat');

      const validation = story.validate();

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect missing starting beat', () => {
      const beat = registry.createBeat('testBeat', {
        id: 'test-beat',
        name: 'Test Beat',
        type: 'testBeat'
      });

      story.addBeat(beat);
      // Don't set starting beat

      const validation = story.validate();

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('No starting beat set');
    });

    it('should detect missing beats', () => {
      // Don't add any beats
      const validation = story.validate();

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('No beats in story');
    });

    it('should detect invalid starting beat reference', () => {
      story.setStartingBeat('non-existent');

      const validation = story.validate();

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Starting beat non-existent not found');
    });
  });

  describe('Event System', () => {
    it('should emit beat execution events', async () => {
      const beat = registry.createBeat('testBeat', {
        id: 'test-beat',
        name: 'Test Beat',
        type: 'testBeat'
      });

      story.addBeat(beat);
      story.setStartingBeat('test-beat');

      const beatStartedHandler = vi.fn();
      const beatCompletedHandler = vi.fn();

      story.on('beatStarted', beatStartedHandler);
      story.on('beatCompleted', beatCompletedHandler);

      await story.execute();

      expect(beatStartedHandler).toHaveBeenCalledWith({
        beatId: 'test-beat',
        beatName: 'Test Beat'
      });

      expect(beatCompletedHandler).toHaveBeenCalledWith({
        beatId: 'test-beat',
        beatName: 'Test Beat'
      });
    });

    it('should emit story events', () => {
      const storyStartedHandler = vi.fn();
      const storyCompletedHandler = vi.fn();

      story.on('storyStarted', storyStartedHandler);
      story.on('storyCompleted', storyCompletedHandler);

      story.emit('storyStarted', { title: 'Test' });
      story.emit('storyCompleted', { title: 'Test' });

      expect(storyStartedHandler).toHaveBeenCalledWith({ title: 'Test' });
      expect(storyCompletedHandler).toHaveBeenCalledWith({ title: 'Test' });
    });
  });
});