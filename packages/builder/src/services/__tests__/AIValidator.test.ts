import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AIValidator, getAIValidator } from '../AIValidator';
import type { GeneratedBeat, StoryGenerationResponse, DialogGenerationResponse } from '../../types/ai';

describe('AIValidator', () => {
  let validator: AIValidator;
  const mockSchema = {
    schema: 'asaps-beat-definitions-v2.2',
    beatTypes: {
      titleScreen: {
        name: 'Title Screen',
        category: 'visible',
        connectionType: 'single',
        parameters: {
          title: { type: 'string', required: true },
          subtitle: { type: 'string', required: false },
          backgroundImage: { type: 'string', required: false },
        },
      },
      introText: {
        name: 'Intro Text',
        category: 'visible',
        connectionType: 'single',
        parameters: {
          text: { type: 'string', required: true },
          duration: { type: 'number', required: false },
        },
      },
      dialogTree: {
        name: 'Dialog Tree',
        category: 'visible',
        connectionType: 'single',
        parameters: {
          dialogTree: { type: 'object', required: true },
        },
      },
      movementChoice: {
        name: 'Movement Choice',
        category: 'visible',
        connectionType: 'multiple',
        parameters: {
          question: { type: 'string', required: true },
          choices: { type: 'array', required: true },
        },
      },
      setVariable: {
        name: 'Set Variable',
        category: 'invisible',
        connectionType: 'single',
        parameters: {
          variable: { type: 'string', required: true },
          value: { type: 'any', required: true },
        },
      },
      conditionBeat: {
        name: 'Condition Beat',
        category: 'invisible',
        connectionType: 'multiple',
        parameters: {
          condition: { type: 'object', required: true },
          targets: { type: 'object', required: false },
        },
      },
    },
  };

  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    // Store original fetch
    originalFetch = global.fetch;

    // Mock fetch to return schema
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockSchema),
      } as Response)
    );

    // Create new validator instance
    validator = new AIValidator();
  });

  afterEach(() => {
    // Restore original fetch
    global.fetch = originalFetch;
  });

  describe('Schema Loading', () => {
    it('should load schema successfully', async () => {
      await validator.ensureSchemaLoaded();
      const schema = validator.getSchema();

      expect(schema).toBeDefined();
      expect(schema.beatTypes).toBeDefined();
      expect(Object.keys(schema.beatTypes).length).toBeGreaterThan(0);
    });

    it('should cache schema after first load', async () => {
      await validator.ensureSchemaLoaded();
      await validator.ensureSchemaLoaded();

      // Fetch should only be called once
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should handle schema load failure with fallback', async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: false,
          statusText: 'Not Found',
        } as Response)
      );

      const newValidator = new AIValidator();
      await newValidator.ensureSchemaLoaded();
      const schema = newValidator.getSchema();

      // Should return fallback schema with empty beatTypes
      expect(schema).toBeDefined();
      expect(schema.beatTypes).toBeDefined();
      expect(Object.keys(schema.beatTypes).length).toBe(0);
    });
  });

  describe('Beat Validation', () => {
    beforeEach(async () => {
      await validator.ensureSchemaLoaded();
    });

    it('should validate a correct beat', async () => {
      const beat: GeneratedBeat = {
        id: 'beat_1',
        name: 'Opening Title',
        type: 'titleScreen',
        position: { x: 100, y: 100 },
        parameters: {
          title: 'My Story',
          subtitle: 'An Interactive Adventure',
        },
        connections: [],
      };

      const result = await validator.validateBeat(beat);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject unknown beat type', async () => {
      const beat: GeneratedBeat = {
        id: 'beat_1',
        name: 'Invalid Beat',
        type: 'unknownBeatType',
        position: { x: 100, y: 100 },
        parameters: {},
        connections: [],
      };

      const result = await validator.validateBeat(beat);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('Unknown beat type');
    });

    it('should detect missing required parameters', async () => {
      const beat: GeneratedBeat = {
        id: 'beat_1',
        name: 'Incomplete Beat',
        type: 'titleScreen',
        position: { x: 100, y: 100 },
        parameters: {
          // Missing required 'title' parameter
          subtitle: 'A subtitle',
        },
        connections: [],
      };

      const result = await validator.validateBeat(beat);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('Required parameter');
      expect(result.errors[0].message).toContain('title');
    });

    it('should allow optional parameters to be missing', async () => {
      const beat: GeneratedBeat = {
        id: 'beat_1',
        name: 'Title',
        type: 'titleScreen',
        position: { x: 100, y: 100 },
        parameters: {
          title: 'My Story',
          // subtitle is optional, so it's okay to omit
        },
        connections: [],
      };

      const result = await validator.validateBeat(beat);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate beat with all required fields', async () => {
      const beat: GeneratedBeat = {
        id: 'beat_2',
        name: 'Introduction',
        type: 'introText',
        position: { x: 200, y: 100 },
        parameters: {
          text: 'Once upon a time...',
          duration: 3000,
        },
        connections: [{ targetId: 'beat_3', label: 'Continue' }],
      };

      const result = await validator.validateBeat(beat);

      expect(result.valid).toBe(true);
    });
  });

  describe('Story Generation Validation', () => {
    beforeEach(async () => {
      await validator.ensureSchemaLoaded();
    });

    it('should validate complete story structure', async () => {
      const story: StoryGenerationResponse = {
        metadata: {
          title: 'Test Story',
          author: 'AI',
          genre: 'adventure',
          description: 'A test story',
        },
        beats: [
          {
            id: 'beat_1',
            name: 'Title',
            type: 'titleScreen',
            position: { x: 100, y: 100 },
            parameters: {
              title: 'Test Story',
            },
            connections: [{ targetId: 'beat_2' }],
          },
          {
            id: 'beat_2',
            name: 'Intro',
            type: 'introText',
            position: { x: 100, y: 200 },
            parameters: {
              text: 'Welcome!',
            },
            connections: [],
          },
        ],
        startBeat: 'beat_1',
        reasoning: 'Test story for validation',
      };

      const result = await validator.validateStoryGeneration(story);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing metadata title', async () => {
      const story = {
        metadata: { author: 'AI' }, // Missing title
        beats: [
          {
            id: 'beat_1',
            name: 'Test',
            type: 'titleScreen',
            position: { x: 0, y: 0 },
            parameters: { title: 'Test' },
            connections: [],
          },
        ],
        startBeat: 'beat_1',
        reasoning: 'Test',
      } as any;

      const result = await validator.validateStoryGeneration(story);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.message.includes('title'))).toBe(true);
    });

    it('should detect missing author as warning', async () => {
      const story: StoryGenerationResponse = {
        metadata: { title: 'Test' } as any, // Missing author
        beats: [
          {
            id: 'beat_1',
            name: 'Test',
            type: 'titleScreen',
            position: { x: 0, y: 0 },
            parameters: { title: 'Test' },
            connections: [],
          },
        ],
        startBeat: 'beat_1',
        reasoning: 'Test',
      };

      const result = await validator.validateStoryGeneration(story);

      expect(result.warnings.some((w) => w.includes('author'))).toBe(true);
    });

    it('should detect invalid beat connections', async () => {
      const story: StoryGenerationResponse = {
        metadata: { title: 'Test', author: 'AI' },
        beats: [
          {
            id: 'beat_1',
            name: 'Test',
            type: 'titleScreen',
            position: { x: 0, y: 0 },
            parameters: { title: 'Test' },
            connections: [{ targetId: 'beat_999' }], // Non-existent target
          },
        ],
        startBeat: 'beat_1',
        reasoning: 'Test',
      };

      const result = await validator.validateStoryGeneration(story);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.message.includes('non-existent beat'))).toBe(true);
    });

    it('should validate story with multiple beats and connections', async () => {
      const story: StoryGenerationResponse = {
        metadata: {
          title: 'Branching Story',
          author: 'AI',
        },
        beats: [
          {
            id: 'beat_1',
            name: 'Start',
            type: 'titleScreen',
            position: { x: 100, y: 100 },
            parameters: { title: 'Story' },
            connections: [{ targetId: 'beat_2' }],
          },
          {
            id: 'beat_2',
            name: 'Choice',
            type: 'movementChoice',
            position: { x: 100, y: 200 },
            parameters: {
              question: 'Where to go?',
              choices: [
                { text: 'Left', target: 'beat_3' },
                { text: 'Right', target: 'beat_4' },
              ],
            },
            connections: [{ targetId: 'beat_3' }, { targetId: 'beat_4' }],
          },
          {
            id: 'beat_3',
            name: 'Left Path',
            type: 'introText',
            position: { x: 50, y: 300 },
            parameters: { text: 'You went left' },
            connections: [],
          },
          {
            id: 'beat_4',
            name: 'Right Path',
            type: 'introText',
            position: { x: 150, y: 300 },
            parameters: { text: 'You went right' },
            connections: [],
          },
        ],
        startBeat: 'beat_1',
        reasoning: 'Branching narrative',
      };

      const result = await validator.validateStoryGeneration(story);

      expect(result.valid).toBe(true);
    });
  });

  describe('Dialog Generation Validation', () => {
    beforeEach(async () => {
      await validator.ensureSchemaLoaded();
    });

    it('should validate simple dialog generation', async () => {
      const dialogResponse: DialogGenerationResponse = {
        dialogTree: {
          id: 'node_1',
          text: 'Halt! Who goes there?',
          choices: [
            {
              id: 'choice_1',
              text: 'I am a traveler',
            },
          ],
        },
        reasoning: 'Simple guard dialog',
      };

      const result = await validator.validateDialogGeneration(dialogResponse);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing dialog tree', async () => {
      const dialogResponse = {
        reasoning: 'Test',
      } as any;

      const result = await validator.validateDialogGeneration(dialogResponse);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.message.includes('Dialog tree is required'))).toBe(true);
    });

    it('should detect missing required fields in dialog node', async () => {
      const dialogResponse: DialogGenerationResponse = {
        dialogTree: {
          id: 'node_1',
          // Missing text
          choices: [],
        } as any,
        reasoning: 'Test',
      };

      const result = await validator.validateDialogGeneration(dialogResponse);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.message.includes('must have text'))).toBe(true);
    });

    it('should validate nested dialog structure', async () => {
      const dialogResponse: DialogGenerationResponse = {
        dialogTree: {
          id: 'node_1',
          text: 'Hello!',
          choices: [
            {
              id: 'choice_1',
              text: 'Hello back',
              target: {
                id: 'node_2',
                text: 'How are you?',
                choices: [],
              },
            },
          ],
        },
        reasoning: 'Nested dialog test',
      };

      const result = await validator.validateDialogGeneration(dialogResponse);

      expect(result.valid).toBe(true);
    });

    it('should detect invalid nested nodes', async () => {
      const dialogResponse: DialogGenerationResponse = {
        dialogTree: {
          id: 'node_1',
          text: 'Hello!',
          choices: [
            {
              id: 'choice_1',
              text: 'Response',
              target: {
                id: 'node_2',
                // Missing text
                choices: [],
              } as any,
            },
          ],
        },
        reasoning: 'Test',
      };

      const result = await validator.validateDialogGeneration(dialogResponse);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.message.includes('must have text'))).toBe(true);
    });

    it('should detect missing choice IDs', async () => {
      const dialogResponse: DialogGenerationResponse = {
        dialogTree: {
          id: 'node_1',
          text: 'Choose!',
          choices: [
            {
              // Missing id
              text: 'Option 1',
            } as any,
          ],
        },
        reasoning: 'Test',
      };

      const result = await validator.validateDialogGeneration(dialogResponse);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.message.includes('Choice must have an ID'))).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    beforeEach(async () => {
      await validator.ensureSchemaLoaded();
    });

    it('should handle beat with empty parameters', async () => {
      const beat: GeneratedBeat = {
        id: 'beat_1',
        name: 'Test',
        type: 'titleScreen',
        position: { x: 0, y: 0 },
        parameters: {}, // Empty but required parameter missing
        connections: [],
      };

      const result = await validator.validateBeat(beat);

      expect(result.valid).toBe(false);
    });

    it('should handle beat with extra parameters', async () => {
      const beat: GeneratedBeat = {
        id: 'beat_1',
        name: 'Test',
        type: 'titleScreen',
        position: { x: 0, y: 0 },
        parameters: {
          title: 'Test',
          extraParam: 'This should not break validation',
        },
        connections: [],
      };

      const result = await validator.validateBeat(beat);

      // Should still be valid (extra params are allowed)
      expect(result.valid).toBe(true);
    });

    it('should handle story with no beats', async () => {
      const story: StoryGenerationResponse = {
        metadata: { title: 'Empty', author: 'AI' },
        beats: [],
        startBeat: 'beat_1',
        reasoning: 'Empty story',
      };

      const result = await validator.validateStoryGeneration(story);

      expect(result.valid).toBe(false);
    });

    it('should handle circular connections gracefully', async () => {
      const story: StoryGenerationResponse = {
        metadata: { title: 'Circular', author: 'AI' },
        beats: [
          {
            id: 'beat_1',
            name: 'A',
            type: 'introText',
            position: { x: 0, y: 0 },
            parameters: { text: 'A' },
            connections: [{ targetId: 'beat_2' }],
          },
          {
            id: 'beat_2',
            name: 'B',
            type: 'introText',
            position: { x: 0, y: 100 },
            parameters: { text: 'B' },
            connections: [{ targetId: 'beat_1' }], // Circular
          },
        ],
        startBeat: 'beat_1',
        reasoning: 'Circular test',
      };

      const result = await validator.validateStoryGeneration(story);

      // Circular connections are technically valid (might be intentional loops)
      expect(result.valid).toBe(true);
    });
  });

  describe('Singleton Pattern', () => {
    it('should return same instance', () => {
      const instance1 = getAIValidator();
      const instance2 = getAIValidator();

      expect(instance1).toBe(instance2);
    });
  });
});
