/**
 * Tests for AI Helper functions
 *
 * Tests the simulation mode functions that generate story structures
 * without requiring API keys
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  generateStory,
  generateDialog,
  suggestBeats,
  createBeatFromDescription,
  BEAT_TYPES,
  type StoryConfig,
  type DialogConfig,
  type GeneratedStory,
} from '../src/utils/aiHelper.js';

// Mock environment to ensure no API key is used
beforeEach(() => {
  vi.stubEnv('ANTHROPIC_API_KEY', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('BEAT_TYPES', () => {
  it('should define all required beat types', () => {
    const requiredTypes = [
      'titleScreen',
      'infoText',
      'endScreen',
      'dialogTree',
      'movementChoice',
      'pickProp',
      'hyperText',
      'inputText',
      'durScreen',
      'videoBeat',
      'conditionBeat',
      'setVariable',
      'addRemoveInventory',
      'randomTarget',
      'setTimer',
    ];

    requiredTypes.forEach(type => {
      expect(BEAT_TYPES).toHaveProperty(type);
      expect(typeof BEAT_TYPES[type as keyof typeof BEAT_TYPES]).toBe('string');
    });
  });
});

describe('generateStory (simulation mode)', () => {
  it('should generate a story with required structure', async () => {
    const config: StoryConfig = {
      prompt: 'A mysterious forest adventure',
      genre: 'adventure',
      length: 'short',
      complexity: 'linear',
    };

    const story = await generateStory(config);

    expect(story).toBeDefined();
    expect(story.metadata).toBeDefined();
    expect(story.metadata.title).toBeDefined();
    expect(story.metadata.author).toContain('Simulation');
    expect(story.metadata.genre).toBe('adventure');
    expect(story.beats).toBeDefined();
    expect(Array.isArray(story.beats)).toBe(true);
    expect(story.connections).toBeDefined();
    expect(Array.isArray(story.connections)).toBe(true);
    expect(story.reasoning).toBeDefined();
  });

  it('should generate a titleScreen as first beat', async () => {
    const config: StoryConfig = {
      prompt: 'Test story',
      length: 'short',
    };

    const story = await generateStory(config);

    expect(story.beats.length).toBeGreaterThan(0);
    expect(story.beats[0].type).toBe('titleScreen');
    expect(story.beats[0].id).toBe('beat-0');
  });

  it('should generate an endScreen as last beat', async () => {
    const config: StoryConfig = {
      prompt: 'Test story',
      length: 'short',
    };

    const story = await generateStory(config);

    const lastBeat = story.beats[story.beats.length - 1];
    expect(lastBeat.type).toBe('endScreen');
  });

  it('should generate beats with positions', async () => {
    const config: StoryConfig = {
      prompt: 'Test story',
      length: 'short',
    };

    const story = await generateStory(config);

    story.beats.forEach(beat => {
      expect(beat.position).toBeDefined();
      expect(typeof beat.position?.x).toBe('number');
      expect(typeof beat.position?.y).toBe('number');
    });
  });

  it('should generate connections between beats', async () => {
    const config: StoryConfig = {
      prompt: 'Test story',
      length: 'short',
    };

    const story = await generateStory(config);

    expect(story.connections.length).toBeGreaterThan(0);

    story.connections.forEach(conn => {
      expect(conn.id).toBeDefined();
      expect(conn.sourceId).toBeDefined();
      expect(conn.targetId).toBeDefined();
    });
  });

  it('should adjust beat count based on length', async () => {
    const shortConfig: StoryConfig = { prompt: 'Test', length: 'short' };
    const mediumConfig: StoryConfig = { prompt: 'Test', length: 'medium' };
    const longConfig: StoryConfig = { prompt: 'Test', length: 'long' };

    const shortStory = await generateStory(shortConfig);
    const mediumStory = await generateStory(mediumConfig);
    const longStory = await generateStory(longConfig);

    expect(shortStory.beats.length).toBeLessThan(mediumStory.beats.length);
    expect(mediumStory.beats.length).toBeLessThan(longStory.beats.length);
  });

  it('should include choice beats for non-linear complexity', async () => {
    const config: StoryConfig = {
      prompt: 'Adventure story',
      length: 'medium',
      complexity: 'moderate',
    };

    const story = await generateStory(config);

    const hasChoiceBeat = story.beats.some(
      beat => beat.type === 'movementChoice' || beat.type === 'dialogTree'
    );
    expect(hasChoiceBeat).toBe(true);
  });

  it('should extract title from prompt', async () => {
    const config: StoryConfig = {
      prompt: 'brave knight saves princess',
      length: 'short',
    };

    const story = await generateStory(config);

    expect(story.metadata.title).toBeDefined();
    // Should capitalize words
    expect(story.metadata.title).toMatch(/[A-Z]/);
  });
});

describe('generateDialog (simulation mode)', () => {
  it('should generate a dialog beat', async () => {
    const config: DialogConfig = {
      scene: 'Meeting a mysterious stranger',
      character: 'Old Wizard',
      branchingFactor: 3,
    };

    const result = await generateDialog(config);

    expect(result).toBeDefined();
    expect(result.beat).toBeDefined();
    expect(result.beat.type).toBe('dialogTree');
    expect(result.reasoning).toBeDefined();
  });

  it('should include correct number of choices', async () => {
    const config: DialogConfig = {
      scene: 'Test conversation',
      character: 'NPC',
      branchingFactor: 4,
    };

    const result = await generateDialog(config);

    const rootNode = result.beat.parameters?.rootNode;
    expect(rootNode).toBeDefined();
    expect(rootNode.choices).toBeDefined();
    expect(rootNode.choices.length).toBe(4);
  });

  it('should include speaker in dialog', async () => {
    const config: DialogConfig = {
      scene: 'Test scene',
      character: 'Guard Captain',
    };

    const result = await generateDialog(config);

    const rootNode = result.beat.parameters?.rootNode;
    expect(rootNode.speaker).toBe('Guard Captain');
  });

  it('should default to NPC if no character specified', async () => {
    const config: DialogConfig = {
      scene: 'Anonymous encounter',
    };

    const result = await generateDialog(config);

    const rootNode = result.beat.parameters?.rootNode;
    expect(rootNode.speaker).toBe('NPC');
  });
});

describe('suggestBeats (simulation mode)', () => {
  it('should suggest beats based on context', async () => {
    const config = {
      currentBeatId: 'beat_1',
      storyContext: { beats: [], metadata: { title: 'Test' } },
      count: 3,
    };

    const result = await suggestBeats(config);

    expect(result).toBeDefined();
    expect(result.beats).toBeDefined();
    expect(result.beats.length).toBe(3);
    expect(result.reasoning).toBeDefined();
  });

  it('should include diverse beat types', async () => {
    const config = {
      currentBeatId: 'beat_1',
      storyContext: {},
      count: 3,
    };

    const result = await suggestBeats(config);

    const types = result.beats.map(b => b.type);
    const uniqueTypes = [...new Set(types)];
    expect(uniqueTypes.length).toBeGreaterThanOrEqual(2);
  });

  it('should include rationale for each suggestion', async () => {
    const config = {
      currentBeatId: 'beat_1',
      storyContext: {},
      count: 2,
    };

    const result = await suggestBeats(config);

    result.beats.forEach(beat => {
      expect(beat.type).toBeDefined();
      expect(beat.label).toBeDefined();
      expect(beat.description).toBeDefined();
      expect(beat.rationale).toBeDefined();
    });
  });
});

describe('createBeatFromDescription (simulation mode)', () => {
  it('should create a beat from description', async () => {
    const config = {
      description: 'The hero enters a dark cave',
    };

    const beat = await createBeatFromDescription(config);

    expect(beat).toBeDefined();
    expect(beat.id).toBeDefined();
    expect(beat.type).toBe('infoText');
    expect(beat.label).toBe('New Beat');
  });

  it('should include description in parameters', async () => {
    const config = {
      description: 'A tense standoff with the villain',
    };

    const beat = await createBeatFromDescription(config);

    expect(beat.parameters).toBeDefined();
    expect(beat.parameters.text).toBe('A tense standoff with the villain');
    expect(beat.parameters.buttonText).toBe('Continue');
  });

  it('should generate unique IDs', async () => {
    const config = { description: 'Test beat' };

    const beat1 = await createBeatFromDescription(config);
    // Small delay to ensure different timestamp
    await new Promise(resolve => setTimeout(resolve, 10));
    const beat2 = await createBeatFromDescription(config);

    expect(beat1.id).not.toBe(beat2.id);
  });
});

describe('Story Structure Integrity', () => {
  it('should generate valid beat IDs in simulation mode', async () => {
    const config: StoryConfig = {
      prompt: 'Test',
      length: 'medium',
    };

    const story = await generateStory(config);
    const beatIds = story.beats.map(b => b.id);
    const connectionTargets = story.connections.map(c => c.targetId);

    // All connection targets should reference existing beats
    connectionTargets.forEach(target => {
      expect(beatIds).toContain(target);
    });
  });

  it('should generate proper connection chain', async () => {
    const config: StoryConfig = {
      prompt: 'Test',
      length: 'short',
      complexity: 'linear',
    };

    const story = await generateStory(config);

    // First connection should come from titleScreen
    if (story.connections.length > 0) {
      expect(story.connections[0].sourceId).toBe('beat-0');
    }
  });
});
