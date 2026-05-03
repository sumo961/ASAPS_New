/**
 * Tests for ConversationPromptBuilder utility
 */

import { describe, it, expect } from 'vitest';
import {
  buildConversationSystemPrompt,
  buildDirectionEvaluationPrompt,
  parseDirectionEvaluationResponse,
  collectActions,
} from '../../src/utils/ConversationPromptBuilder';
import type { ConversationDirection } from '../../src/types';

describe('ConversationPromptBuilder', () => {
  // -------------------------------------------------------------------------
  // buildConversationSystemPrompt
  // -------------------------------------------------------------------------
  describe('buildConversationSystemPrompt()', () => {
    it('should include NPC name', () => {
      const prompt = buildConversationSystemPrompt({
        npcName: 'Gandalf',
        scenario: 'A tavern',
        playerContext: '',
        directions: [],
        history: [],
        turnNumber: 0,
        maxTurns: 10,
      });

      expect(prompt).toContain('Gandalf');
    });

    it('should include personality when provided', () => {
      const prompt = buildConversationSystemPrompt({
        npcName: 'Gandalf',
        npcPersonality: 'Wise and mysterious wizard',
        scenario: 'A tavern',
        playerContext: '',
        directions: [],
        history: [],
        turnNumber: 0,
        maxTurns: 10,
      });

      expect(prompt).toContain('Wise and mysterious wizard');
    });

    it('should include scenario', () => {
      const prompt = buildConversationSystemPrompt({
        npcName: 'NPC',
        scenario: 'A dark cave filled with treasure',
        playerContext: '',
        directions: [],
        history: [],
        turnNumber: 0,
        maxTurns: 10,
      });

      expect(prompt).toContain('A dark cave filled with treasure');
    });

    it('should include player context', () => {
      const prompt = buildConversationSystemPrompt({
        npcName: 'NPC',
        scenario: 'test',
        playerContext: 'Player name: Alice\nInventory: sword, shield',
        directions: [],
        history: [],
        turnNumber: 0,
        maxTurns: 10,
      });

      expect(prompt).toContain('Player name: Alice');
      expect(prompt).toContain('sword, shield');
    });

    it('should format directions as rules', () => {
      const directions: ConversationDirection[] = [
        {
          id: 'd1',
          trigger: { type: 'topic-mention', keywords: ['weapons', 'sword'] },
          action: { type: 'steer', instruction: 'Mention the enchanted blade' },
        },
      ];

      const prompt = buildConversationSystemPrompt({
        npcName: 'NPC',
        scenario: 'test',
        playerContext: '',
        directions,
        history: [],
        turnNumber: 0,
        maxTurns: 10,
      });

      // The section header is "CONVERSATION GOALS" — directions with
      // `action.type === 'steer'` are framed as goals to guide the
      // conversation toward, not hard rules. Test was authored against
      // an earlier "CONVERSATION RULES" label; the label changed, the
      // semantics didn't.
      expect(prompt).toContain('CONVERSATION GOALS');
      expect(prompt).toContain('weapons');
      expect(prompt).toContain('enchanted blade');
    });

    it('should include active steering instructions', () => {
      const prompt = buildConversationSystemPrompt({
        npcName: 'NPC',
        scenario: 'test',
        playerContext: '',
        directions: [],
        history: [],
        turnNumber: 3,
        maxTurns: 10,
        activeSteeringInstructions: ['Press them about Helena', 'Be more aggressive'],
      });

      expect(prompt).toContain('ACTIVE INSTRUCTIONS');
      expect(prompt).toContain('Press them about Helena');
      expect(prompt).toContain('Be more aggressive');
    });

    it('should include system instructions', () => {
      const prompt = buildConversationSystemPrompt({
        npcName: 'NPC',
        scenario: 'test',
        playerContext: '',
        directions: [],
        history: [],
        turnNumber: 0,
        maxTurns: 10,
        systemInstructions: 'Always speak in riddles',
      });

      expect(prompt).toContain('Always speak in riddles');
    });

    it('should include turn number', () => {
      const prompt = buildConversationSystemPrompt({
        npcName: 'NPC',
        scenario: 'test',
        playerContext: '',
        directions: [],
        history: [],
        turnNumber: 5,
        maxTurns: 10,
      });

      expect(prompt).toContain('Turn 5 of 10');
    });
  });

  // -------------------------------------------------------------------------
  // buildDirectionEvaluationPrompt
  // -------------------------------------------------------------------------
  describe('buildDirectionEvaluationPrompt()', () => {
    it('should include player input', () => {
      const prompt = buildDirectionEvaluationPrompt(
        'I want to buy a sword',
        [],
        [],
        1,
      );

      expect(prompt).toContain('I want to buy a sword');
    });

    it('should list directions with indices', () => {
      const directions: ConversationDirection[] = [
        {
          id: 'd1',
          trigger: { type: 'topic-mention', keywords: ['weapon'] },
          action: { type: 'steer', instruction: 'Show weapons' },
        },
        {
          id: 'd2',
          trigger: { type: 'sentiment', sentiment: 'angry' },
          action: { type: 'exit', exitTarget: 'fight_beat' },
        },
      ];

      const prompt = buildDirectionEvaluationPrompt('test', directions, [], 1);

      expect(prompt).toContain('0:');
      expect(prompt).toContain('1:');
      expect(prompt).toContain('weapon');
      expect(prompt).toContain('angry');
    });

    it('should include conversation history', () => {
      const history = [
        { role: 'npc' as const, text: 'Welcome!', turnNumber: 0 },
        { role: 'player' as const, text: 'Hello', turnNumber: 1 },
      ];

      const prompt = buildDirectionEvaluationPrompt('test', [], history, 2);

      expect(prompt).toContain('NPC: Welcome!');
      expect(prompt).toContain('Player: Hello');
    });
  });

  // -------------------------------------------------------------------------
  // parseDirectionEvaluationResponse
  // -------------------------------------------------------------------------
  describe('parseDirectionEvaluationResponse()', () => {
    it('should parse valid JSON array', () => {
      expect(parseDirectionEvaluationResponse('[0, 2]')).toEqual([0, 2]);
    });

    it('should parse empty array', () => {
      expect(parseDirectionEvaluationResponse('[]')).toEqual([]);
    });

    it('should extract array from surrounding text', () => {
      expect(parseDirectionEvaluationResponse('The triggered directions are: [1, 3]')).toEqual([1, 3]);
    });

    it('should return empty on invalid input', () => {
      expect(parseDirectionEvaluationResponse('no array here')).toEqual([]);
    });

    it('should filter non-number values', () => {
      expect(parseDirectionEvaluationResponse('[0, "foo", 2]')).toEqual([0, 2]);
    });

    it('should handle malformed JSON gracefully', () => {
      expect(parseDirectionEvaluationResponse('{')).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // collectActions
  // -------------------------------------------------------------------------
  describe('collectActions()', () => {
    const directions: ConversationDirection[] = [
      {
        id: 'd1',
        trigger: { type: 'topic-mention', keywords: ['sword'] },
        action: { type: 'steer', instruction: 'Show the enchanted sword' },
      },
      {
        id: 'd2',
        trigger: { type: 'sentiment', sentiment: 'angry' },
        action: { type: 'exit', exitTarget: 'fight_scene' },
      },
      {
        id: 'd3',
        trigger: { type: 'turn-count', turnCount: 5 },
        action: { type: 'set-variable', variableName: 'talkedToMerchant', variableValue: true },
      },
      {
        id: 'd4',
        trigger: { type: 'custom', description: 'Player asks about Helena' },
        action: {
          type: 'multi',
          actions: [
            { type: 'steer', instruction: 'Reveal Helena is in danger' },
            { type: 'set-variable', variableName: 'knowsAboutHelena', variableValue: true },
          ],
        },
      },
    ];

    it('should collect steering instructions', () => {
      const result = collectActions(directions, [0]);
      expect(result.steeringInstructions).toEqual(['Show the enchanted sword']);
      expect(result.exitTarget).toBeNull();
    });

    it('should collect exit target', () => {
      const result = collectActions(directions, [1]);
      expect(result.exitTarget).toBe('fight_scene');
    });

    it('should collect variable sets', () => {
      const result = collectActions(directions, [2]);
      expect(result.variableSets).toEqual([{ name: 'talkedToMerchant', value: true }]);
    });

    it('should handle multi-action directions', () => {
      const result = collectActions(directions, [3]);
      expect(result.steeringInstructions).toEqual(['Reveal Helena is in danger']);
      expect(result.variableSets).toEqual([{ name: 'knowsAboutHelena', value: true }]);
    });

    it('should combine multiple triggered directions', () => {
      const result = collectActions(directions, [0, 2]);
      expect(result.steeringInstructions).toEqual(['Show the enchanted sword']);
      expect(result.variableSets).toEqual([{ name: 'talkedToMerchant', value: true }]);
    });

    it('should ignore out-of-range indices', () => {
      const result = collectActions(directions, [99, -1]);
      expect(result.steeringInstructions).toEqual([]);
      expect(result.exitTarget).toBeNull();
      expect(result.variableSets).toEqual([]);
    });

    it('should handle empty triggered indices', () => {
      const result = collectActions(directions, []);
      expect(result.steeringInstructions).toEqual([]);
      expect(result.exitTarget).toBeNull();
    });
  });
});
