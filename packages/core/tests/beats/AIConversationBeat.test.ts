/**
 * Tests for AIConversationBeat
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIConversationBeat } from '../../src/beats/AIConversationBeat';
import { StoryContext } from '../../src/engine/StoryContext';
import { Story } from '../../src/engine/Story';
import type { IRenderer, ConversationDirection } from '../../src/types';

// Mock renderer factory
function createMockRenderer(aiService?: any): IRenderer {
  return {
    initialize: vi.fn(),
    clear: vi.fn(),
    playSound: vi.fn(),
    stopSound: vi.fn(),
    setState: vi.fn(),
    getState: vi.fn().mockImplementation((key: string) => {
      if (key === 'aiService') return aiService || null;
      return null;
    }),
    renderTitleScreen: vi.fn().mockResolvedValue(undefined),
    renderText: vi.fn().mockResolvedValue(undefined),
    renderDialog: vi.fn().mockResolvedValue(undefined),
    renderChoices: vi.fn().mockResolvedValue(''),
    renderMovement: vi.fn().mockResolvedValue(''),
    renderPropSelection: vi.fn().mockResolvedValue(''),
    renderVideo: vi.fn().mockResolvedValue(undefined),
    renderEndScreen: vi.fn().mockResolvedValue(undefined),
    renderDurScreen: vi.fn().mockResolvedValue(undefined),
    renderInputText: vi.fn().mockResolvedValue('player input'),
    renderHyperText: vi.fn().mockResolvedValue(''),
    renderLoading: vi.fn(),
    hideLoading: vi.fn(),
    clearChatHistory: vi.fn(),
    renderConversationInput: vi.fn().mockResolvedValue('player input'),
    showChoices: vi.fn().mockResolvedValue(''),
    applyTransition: vi.fn().mockResolvedValue(undefined),
    waitForUserInput: vi.fn().mockResolvedValue(undefined),
  } as unknown as IRenderer;
}

// Mock AI service with generateConversationTurn
function createMockAIService(
  responses: string[] = ['Hello! How can I help you?'],
  evaluationResponses: string[] = ['[]'],
) {
  let turnCall = 0;
  let evalCall = 0;

  return {
    generateConversationTurn: vi.fn().mockImplementation((request: any) => {
      // If this looks like an evaluation request, return evaluation response
      if (request.systemPrompt.includes('conversation analyzer')) {
        const response = evaluationResponses[evalCall % evaluationResponses.length];
        evalCall++;
        return Promise.resolve({ text: response });
      }
      // Otherwise return NPC dialog
      const response = responses[turnCall % responses.length];
      turnCall++;
      return Promise.resolve({ text: response });
    }),
    generateDialog: vi.fn().mockResolvedValue('Fallback response'),
  };
}

describe('AIConversationBeat', () => {
  let context: StoryContext;
  let story: Story;

  beforeEach(() => {
    context = new StoryContext();
    story = new Story({ title: 'Test Story', firstBeatId: 'conv1' });
    context.setStory(story);
  });

  // -------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------
  describe('constructor', () => {
    it('should create with default parameters', () => {
      const beat = new AIConversationBeat({
        id: 'conv1',
        name: 'Conversation',
        type: 'aiConversation',
      });

      const params = beat.getParameters();
      expect(params.scenario).toBe('');
      expect(params.npcName).toBe('Character');
      expect(params.maxTurns).toBe(10);
      expect(params.includeVariables).toBe(true);
      expect(params.includeInventory).toBe(true);
      expect(params.includeVisitedBeats).toBe(true);
      expect(params.includeChoiceHistory).toBe(true);
      expect(params.enableVoiceInput).toBe(true);
      expect(params.directions).toEqual([]);
    });

    it('should create with custom parameters', () => {
      const directions: ConversationDirection[] = [
        {
          id: 'd1',
          trigger: { type: 'topic-mention', keywords: ['sword'] },
          action: { type: 'steer', instruction: 'Show weapons' },
        },
      ];

      const beat = new AIConversationBeat({
        id: 'conv1',
        name: 'Merchant Chat',
        type: 'aiConversation',
        parameters: {
          scenario: 'A weapon shop',
          npcName: 'Blacksmith',
          npcPersonality: 'Gruff but fair',
          maxTurns: 5,
          directions,
          fallbackExitTarget: 'exit_beat',
          openingLine: 'Welcome to my forge!',
          enableVoiceInput: false,
          language: 'de-DE',
        },
      });

      const params = beat.getParameters();
      expect(params.scenario).toBe('A weapon shop');
      expect(params.npcName).toBe('Blacksmith');
      expect(params.npcPersonality).toBe('Gruff but fair');
      expect(params.maxTurns).toBe(5);
      expect(params.directions).toHaveLength(1);
      expect(params.fallbackExitTarget).toBe('exit_beat');
      expect(params.openingLine).toBe('Welcome to my forge!');
      expect(params.enableVoiceInput).toBe(false);
      expect(params.language).toBe('de-DE');
    });

    it('should support direct parameters (not in parameters object)', () => {
      const beat = new AIConversationBeat({
        id: 'conv1',
        name: 'Chat',
        type: 'aiConversation',
        scenario: 'Direct scenario',
        npcName: 'Direct NPC',
      } as any);

      const params = beat.getParameters();
      expect(params.scenario).toBe('Direct scenario');
      expect(params.npcName).toBe('Direct NPC');
    });
  });

  // -------------------------------------------------------------------------
  // getParameters / updateParameters
  // -------------------------------------------------------------------------
  describe('getParameters / updateParameters', () => {
    it('should return all parameters', () => {
      const beat = new AIConversationBeat({
        id: 'conv1',
        type: 'aiConversation',
        parameters: {
          scenario: 'Test',
          npcName: 'NPC',
        },
      });

      const params = beat.getParameters();
      expect(params).toHaveProperty('scenario');
      expect(params).toHaveProperty('npcName');
      expect(params).toHaveProperty('maxTurns');
      expect(params).toHaveProperty('directions');
      expect(params).toHaveProperty('enableVoiceInput');
    });

    it('should update parameters', () => {
      const beat = new AIConversationBeat({
        id: 'conv1',
        type: 'aiConversation',
      });

      beat.updateParameters({
        scenario: 'Updated scenario',
        npcName: 'Updated NPC',
        maxTurns: 20,
        enableVoiceInput: false,
      });

      const params = beat.getParameters();
      expect(params.scenario).toBe('Updated scenario');
      expect(params.npcName).toBe('Updated NPC');
      expect(params.maxTurns).toBe(20);
      expect(params.enableVoiceInput).toBe(false);
    });

    // Regression: the topic-mention "Keywords" field takes a comma-separated
    // list, but the getParameters/updateParameters round-trip used to trim +
    // filter the value, stripping a mid-edit trailing "," / space — so the
    // author could never start a second keyword (input stuck on one word).
    it('preserves the raw comma-separated keywords string across the round-trip', () => {
      const beat = new AIConversationBeat({ id: 'conv1', type: 'aiConversation' });

      // Author has just typed a trailing comma+space to begin a second keyword.
      beat.updateParameters({
        directions: [{
          id: 'd1',
          triggerType: 'topic-mention',
          triggerKeywords: 'religion, ',
          actionType: 'steer',
          actionInstruction: 'Discuss it',
        }],
      });
      const mid = beat.getParameters();
      // Verbatim — NOT normalized back to "religion".
      expect(mid.directions[0].triggerKeywords).toBe('religion, ');
      // Runtime array stays clean (no empty entry that would match everything).
      expect(beat.directions[0].trigger.keywords).toEqual(['religion']);

      // Finishing the second keyword round-trips losslessly + cleans the array.
      beat.updateParameters({
        directions: [{ ...mid.directions[0], triggerKeywords: 'religion, war' }],
      });
      const done = beat.getParameters();
      expect(done.directions[0].triggerKeywords).toBe('religion, war');
      expect(beat.directions[0].trigger.keywords).toEqual(['religion', 'war']);
    });
  });

  // -------------------------------------------------------------------------
  // getConnections
  // -------------------------------------------------------------------------
  describe('getConnections()', () => {
    it('should derive connections from exit-type directions', () => {
      const beat = new AIConversationBeat({
        id: 'conv1',
        type: 'aiConversation',
        parameters: {
          directions: [
            {
              id: 'd1',
              trigger: { type: 'topic-mention', keywords: ['sword'] },
              action: { type: 'exit', exitTarget: 'weapon_beat' },
            },
            {
              id: 'd2',
              trigger: { type: 'sentiment', sentiment: 'angry' },
              action: { type: 'exit', exitTarget: 'fight_beat' },
            },
          ],
        },
      });

      const connections = beat.getConnections();
      expect(connections).toHaveLength(2);
      expect(connections.map(c => c.targetId)).toContain('weapon_beat');
      expect(connections.map(c => c.targetId)).toContain('fight_beat');
    });

    it('should include fallback exit target', () => {
      const beat = new AIConversationBeat({
        id: 'conv1',
        type: 'aiConversation',
        parameters: {
          fallbackExitTarget: 'fallback_beat',
          directions: [],
        },
      });

      const connections = beat.getConnections();
      expect(connections.some(c => c.targetId === 'fallback_beat')).toBe(true);
    });

    it('should not duplicate targets', () => {
      const beat = new AIConversationBeat({
        id: 'conv1',
        type: 'aiConversation',
        parameters: {
          fallbackExitTarget: 'same_beat',
          directions: [
            {
              id: 'd1',
              trigger: { type: 'topic-mention', keywords: ['test'] },
              action: { type: 'exit', exitTarget: 'same_beat' },
            },
          ],
        },
      });

      const connections = beat.getConnections();
      const sameTargets = connections.filter(c => c.targetId === 'same_beat');
      expect(sameTargets.length).toBe(1);
    });

    it('should handle multi-action directions with exit', () => {
      const beat = new AIConversationBeat({
        id: 'conv1',
        type: 'aiConversation',
        parameters: {
          directions: [
            {
              id: 'd1',
              trigger: { type: 'custom', description: 'test' },
              action: {
                type: 'multi',
                actions: [
                  { type: 'set-variable', variableName: 'x', variableValue: 1 },
                  { type: 'exit', exitTarget: 'nested_exit' },
                ],
              },
            },
          ],
        },
      });

      const connections = beat.getConnections();
      expect(connections.some(c => c.targetId === 'nested_exit')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // performAction — no AI service
  // -------------------------------------------------------------------------
  describe('performAction — no AI service', () => {
    it('should show error message when AI service is missing', async () => {
      const renderer = createMockRenderer(null);
      const beat = new AIConversationBeat({
        id: 'conv1',
        type: 'aiConversation',
        parameters: {
          scenario: 'test',
          npcName: 'NPC',
          fallbackExitTarget: 'exit1',
        },
      });

      const result = await beat.execute(context, renderer);

      expect(renderer.renderText).toHaveBeenCalledWith(
        expect.stringContaining('AI features require configuration'),
        expect.any(String),
        expect.any(Array),
      );
      expect(result).toBe('exit1');
    });
  });

  // -------------------------------------------------------------------------
  // performAction — with AI service
  // -------------------------------------------------------------------------
  describe('performAction — with AI service', () => {
    it('should set chat presentation mode', async () => {
      // Create a service that exits on first turn
      const aiService = createMockAIService(
        ['Opening line'],
        ['[0]'], // Trigger exit direction on first player input
      );

      const renderer = createMockRenderer(aiService);

      const beat = new AIConversationBeat({
        id: 'conv1',
        type: 'aiConversation',
        parameters: {
          scenario: 'test',
          npcName: 'NPC',
          maxTurns: 1,
          directions: [
            {
              id: 'd1',
              trigger: { type: 'topic-mention', keywords: ['anything'] },
              action: { type: 'exit', exitTarget: 'exit_beat' },
            },
          ],
        },
      });

      await beat.execute(context, renderer);

      expect(renderer.setState).toHaveBeenCalledWith('presentationMode', 'chat-scroll');
      expect(renderer.setState).toHaveBeenCalledWith('currentBeatType', 'aiConversation');
    });

    it('should use openingLine when provided', async () => {
      const aiService = createMockAIService();
      const renderer = createMockRenderer(aiService);

      const beat = new AIConversationBeat({
        id: 'conv1',
        type: 'aiConversation',
        parameters: {
          scenario: 'test',
          npcName: 'Gandalf',
          openingLine: 'You shall not pass!',
          maxTurns: 0, // Exit immediately after opening
          fallbackExitTarget: 'exit1',
        },
      });

      await beat.execute(context, renderer);

      expect(renderer.renderDialog).toHaveBeenCalledWith(
        'Gandalf',
        'You shall not pass!',
        undefined,
        expect.any(Array),
      );
    });

    it('should clear chat history', async () => {
      const aiService = createMockAIService();
      const renderer = createMockRenderer(aiService);

      const beat = new AIConversationBeat({
        id: 'conv1',
        type: 'aiConversation',
        parameters: {
          scenario: 'test',
          npcName: 'NPC',
          maxTurns: 0,
          fallbackExitTarget: 'exit1',
        },
      });

      await beat.execute(context, renderer);

      expect(renderer.clearChatHistory).toHaveBeenCalled();
    });

    it('should return fallback exit when maxTurns reached', async () => {
      const aiService = createMockAIService(
        ['NPC response'],
        ['[]'], // No directions triggered
      );
      const renderer = createMockRenderer(aiService);

      const beat = new AIConversationBeat({
        id: 'conv1',
        type: 'aiConversation',
        parameters: {
          scenario: 'test',
          npcName: 'NPC',
          openingLine: 'Hello',
          maxTurns: 1,
          fallbackExitTarget: 'fallback_beat',
          directions: [],
        },
      });

      const result = await beat.execute(context, renderer);
      expect(result).toBe('fallback_beat');
    });

    it('should exit when exit direction is triggered', async () => {
      const aiService = createMockAIService(
        ['Opening line'],
        ['[0]'], // First direction triggered (exit)
      );
      const renderer = createMockRenderer(aiService);

      const beat = new AIConversationBeat({
        id: 'conv1',
        type: 'aiConversation',
        parameters: {
          scenario: 'test',
          npcName: 'NPC',
          openingLine: 'Hello',
          maxTurns: 10,
          directions: [
            {
              id: 'd1',
              trigger: { type: 'topic-mention', keywords: ['goodbye'] },
              action: { type: 'exit', exitTarget: 'goodbye_beat' },
            },
          ],
        },
      });

      const result = await beat.execute(context, renderer);
      expect(result).toBe('goodbye_beat');
    });

    it('should use renderConversationInput when available', async () => {
      const aiService = createMockAIService(
        ['Opening'],
        ['[]'],
      );
      const renderer = createMockRenderer(aiService);

      const beat = new AIConversationBeat({
        id: 'conv1',
        type: 'aiConversation',
        parameters: {
          scenario: 'test',
          npcName: 'NPC',
          openingLine: 'Hi',
          maxTurns: 1,
          fallbackExitTarget: 'exit1',
          directions: [],
        },
      });

      await beat.execute(context, renderer);

      expect(renderer.renderConversationInput).toHaveBeenCalledWith(
        expect.objectContaining({
          placeholder: 'Type your response...',
        }),
      );
    });

    it('should fall back to renderInputText when renderConversationInput not available', async () => {
      const aiService = createMockAIService(
        ['Opening'],
        ['[]'],
      );
      const renderer = createMockRenderer(aiService);
      // Remove renderConversationInput
      (renderer as any).renderConversationInput = undefined;

      const beat = new AIConversationBeat({
        id: 'conv1',
        type: 'aiConversation',
        parameters: {
          scenario: 'test',
          npcName: 'NPC',
          openingLine: 'Hi',
          maxTurns: 1,
          fallbackExitTarget: 'exit1',
          directions: [],
        },
      });

      await beat.execute(context, renderer);

      expect(renderer.renderInputText).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------
  describe('Error handling', () => {
    it('should render error message on AI failure', async () => {
      const aiService = {
        generateConversationTurn: vi.fn().mockRejectedValue(new Error('API error')),
        generateDialog: vi.fn().mockRejectedValue(new Error('API error')),
      };
      const renderer = createMockRenderer(aiService);

      const beat = new AIConversationBeat({
        id: 'conv1',
        type: 'aiConversation',
        parameters: {
          scenario: 'test',
          npcName: 'NPC',
          fallbackExitTarget: 'exit1',
        },
      });

      const result = await beat.execute(context, renderer);

      expect(renderer.renderText).toHaveBeenCalledWith(
        expect.stringContaining('error'),
        expect.any(String),
        expect.any(Array),
      );
      expect(result).toBe('exit1');
    });
  });
});
