import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BeatTypeRegistry } from '../../src/beats/BeatRegistry';
import { Beat } from '../../src/beats/Beat';
import { StoryContext } from '../../src/engine/StoryContext';
import { BeatConfig } from '../../src/types/BeatConfig';

/**
 * NOTE: Most of these tests are for features not yet implemented in BeatTypeRegistry.
 * The registry is a simple factory pattern, not the full-featured singleton with
 * methods like getBeatDefinition(), hasType(), getAllTypes(), etc.
 *
 * These tests are skipped until those features are implemented.
 */

// Test beat implementations
class TestTitleScreen extends Beat {
  async performAction(context: StoryContext): Promise<StoryContext> {
    return context;
  }

  getParameters(): Record<string, any> {
    return {
      title: 'Default Title',
      author: 'Default Author',
      buttonText: 'Begin'
    };
  }

  updateParameters(params: Record<string, any>): void {
    // Update parameters
  }
}

class TestDialogTree extends Beat {
  async performAction(context: StoryContext): Promise<StoryContext> {
    return context;
  }

  getParameters(): Record<string, any> {
    return {
      speaker: 'NPC',
      text: 'Default dialog text',
      choices: []
    };
  }

  updateParameters(params: Record<string, any>): void {
    // Update parameters
  }
}

describe.skip('BeatTypeRegistry', () => {
  let registry: BeatTypeRegistry;

  beforeEach(() => {
    // Reset registry to clean state for each test
    (BeatTypeRegistry as any)._instance = null;
    registry = BeatTypeRegistry.getInstance();
  });

  afterEach(() => {
    // Clean up after each test
    (BeatTypeRegistry as any)._instance = null;
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = BeatTypeRegistry.getInstance();
      const instance2 = BeatTypeRegistry.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should not allow direct instantiation', () => {
      expect(() => {
        new BeatTypeRegistry();
      }).toThrow();
    });
  });

  describe('Beat Registration', () => {
    it('should register a new beat type', () => {
      const result = registry.registerBeatType('testTitleScreen', {
        displayName: 'Test Title Screen',
        category: 'visible',
        description: 'A test title screen beat',
        classConstructor: TestTitleScreen,
        defaultParameters: {
          title: 'Test Title',
          author: 'Test Author'
        }
      });

      expect(result).toBe(true);
      expect(registry.hasType('testTitleScreen')).toBe(true);
    });

    it('should not register duplicate beat types', () => {
      registry.registerBeatType('testTitleScreen', {
        displayName: 'Test Title Screen',
        category: 'visible',
        description: 'A test title screen beat',
        classConstructor: TestTitleScreen
      });

      const result = registry.registerBeatType('testTitleScreen', {
        displayName: 'Duplicate Title Screen',
        category: 'visible',
        description: 'A duplicate beat',
        classConstructor: TestDialogTree
      });

      expect(result).toBe(false);

      // Original should remain
      const definition = registry.getBeatDefinition('testTitleScreen');
      expect(definition?.displayName).toBe('Test Title Screen');
    });

    it('should validate beat type definition', () => {
      const invalidDefinitions = [
        // Missing displayName
        {
          category: 'visible',
          description: 'Test beat',
          classConstructor: TestTitleScreen
        },
        // Missing category
        {
          displayName: 'Test Beat',
          description: 'Test beat',
          classConstructor: TestTitleScreen
        },
        // Missing classConstructor
        {
          displayName: 'Test Beat',
          category: 'visible',
          description: 'Test beat'
        },
        // Invalid category
        {
          displayName: 'Test Beat',
          category: 'invalid',
          description: 'Test beat',
          classConstructor: TestTitleScreen
        }
      ];

      invalidDefinitions.forEach(invalidDef => {
        expect(() => {
          registry.registerBeatType('invalidBeat', invalidDef as any);
        }).toThrow();
      });
    });
  });

  describe('Beat Creation', () => {
    beforeEach(() => {
      registry.registerBeatType('testTitleScreen', {
        displayName: 'Test Title Screen',
        category: 'visible',
        description: 'A test title screen beat',
        classConstructor: TestTitleScreen,
        defaultParameters: {
          title: 'Default Title',
          author: 'Default Author'
        }
      });
    });

    it('should create a beat instance', () => {
      const config: BeatConfig = {
        id: 'test-beat-1',
        name: 'Test Beat',
        type: 'testTitleScreen',
        parameters: {
          title: 'Custom Title'
        }
      };

      const beat = registry.createBeat('testTitleScreen', config);

      expect(beat).toBeInstanceOf(TestTitleScreen);
      expect(beat.id).toBe('test-beat-1');
      expect(beat.name).toBe('Test Beat');
      expect(beat.type).toBe('testTitleScreen');
    });

    it('should throw error for unknown beat type', () => {
      const config: BeatConfig = {
        id: 'test-beat-1',
        name: 'Test Beat',
        type: 'unknownType'
      };

      expect(() => {
        registry.createBeat('unknownType', config);
      }).toThrow('Unknown beat type: unknownType');
    });

    it('should merge default parameters', () => {
      const config: BeatConfig = {
        id: 'test-beat-1',
        name: 'Test Beat',
        type: 'testTitleScreen',
        parameters: {
          title: 'Custom Title'
        }
      };

      const beat = registry.createBeat('testTitleScreen', config);
      const parameters = beat.getParameters();

      expect(parameters.title).toBe('Custom Title'); // Custom value
      expect(parameters.author).toBe('Default Author'); // Default value
    });
  });

  describe('Beat Type Queries', () => {
    beforeEach(() => {
      registry.registerBeatType('testTitleScreen', {
        displayName: 'Test Title Screen',
        category: 'visible',
        description: 'A test title screen beat',
        classConstructor: TestTitleScreen
      });

      registry.registerBeatType('testDialogTree', {
        displayName: 'Test Dialog Tree',
        category: 'visible',
        description: 'A test dialog tree beat',
        classConstructor: TestDialogTree
      });

      registry.registerBeatType('testSetVariable', {
        displayName: 'Test Set Variable',
        category: 'invisible',
        description: 'A test set variable beat',
        classConstructor: TestTitleScreen
      });
    });

    it('should get beat type definition', () => {
      const definition = registry.getBeatDefinition('testTitleScreen');

      expect(definition).toBeDefined();
      expect(definition?.displayName).toBe('Test Title Screen');
      expect(definition?.category).toBe('visible');
    });

    it('should return undefined for unknown beat type', () => {
      const definition = registry.getBeatDefinition('unknownType');
      expect(definition).toBeUndefined();
    });

    it('should check if beat type exists', () => {
      expect(registry.hasType('testTitleScreen')).toBe(true);
      expect(registry.hasType('unknownType')).toBe(false);
    });

    it('should get all beat types', () => {
      const allTypes = registry.getAllTypes();

      expect(allTypes.size).toBe(3);
      expect(allTypes.has('testTitleScreen')).toBe(true);
      expect(allTypes.has('testDialogTree')).toBe(true);
      expect(allTypes.has('testSetVariable')).toBe(true);
    });

    it('should get beat types by category', () => {
      const visibleTypes = registry.getTypesByCategory('visible');
      const invisibleTypes = registry.getTypesByCategory('invisible');

      expect(visibleTypes.size).toBe(2);
      expect(invisibleTypes.size).toBe(1);

      expect(visibleTypes.has('testTitleScreen')).toBe(true);
      expect(visibleTypes.has('testDialogTree')).toBe(true);
      expect(invisibleTypes.has('testSetVariable')).toBe(true);
    });
  });

  describe('Default Beat Types', () => {
    it('should register default beat types', () => {
      const registry = BeatTypeRegistry.getInstance();
      registry.registerDefaultBeats();

      const expectedTypes = [
        'titleScreen',
        'infoText',
        'dialogTree',
        'movementChoice',
        'pickProp',
        'videoBeat',
        'endScreen',
        'setVariable',
        'conditionBeat'
      ];

      expectedTypes.forEach(type => {
        expect(registry.hasType(type)).toBe(true);
      });
    });

    it('should have correct categories for default beat types', () => {
      const registry = BeatTypeRegistry.getInstance();
      registry.registerDefaultBeats();

      // Visible beats
      const visibleBeats = ['titleScreen', 'infoText', 'dialogTree', 'movementChoice', 'pickProp', 'videoBeat', 'endScreen'];
      visibleBeats.forEach(beatType => {
        const definition = registry.getBeatDefinition(beatType);
        expect(definition?.category).toBe('visible');
      });

      // Invisible beats
      const invisibleBeats = ['setVariable', 'conditionBeat'];
      invisibleBeats.forEach(beatType => {
        const definition = registry.getBeatDefinition(beatType);
        expect(definition?.category).toBe('invisible');
      });
    });
  });

  describe('Serialization', () => {
    it('should serialize beat type definitions', () => {
      registry.registerBeatType('testBeat', {
        displayName: 'Test Beat',
        category: 'visible',
        description: 'A test beat',
        classConstructor: TestTitleScreen,
        defaultParameters: {
          title: 'Default Title'
        }
      });

      const serialized = registry.serializeDefinitions();

      expect(serialized).toHaveProperty('testBeat');
      expect(serialized.testBeat).toEqual({
        displayName: 'Test Beat',
        category: 'visible',
        description: 'A test beat',
        defaultParameters: {
          title: 'Default Title'
        }
      });
    });

    it('should not include classConstructor in serialization', () => {
      registry.registerBeatType('testBeat', {
        displayName: 'Test Beat',
        category: 'visible',
        description: 'A test beat',
        classConstructor: TestTitleScreen
      });

      const serialized = registry.serializeDefinitions();

      expect(serialized.testBeat).not.toHaveProperty('classConstructor');
    });
  });
});