/**
 * Tests for AI Story Validator
 *
 * Tests the validation logic for AI-generated story structures
 */

import { describe, it, expect } from 'vitest';
import {
  validateAIStory,
  formatValidationResult,
  type ValidationResult,
} from '../aiStoryValidator';

describe('aiStoryValidator', () => {
  describe('validateAIStory', () => {
    it('should return invalid for non-object input', () => {
      const result = validateAIStory(null);
      expect(result.valid).toBe(false);
      expect(result.errors[0].category).toBe('invalid_structure');
    });

    it('should return invalid for missing beats array', () => {
      const result = validateAIStory({ metadata: {} });
      expect(result.valid).toBe(false);
      expect(result.errors[0].category).toBe('invalid_structure');
      expect(result.errors[0].message).toContain('beats array');
    });

    it('should validate a minimal valid story', () => {
      const story = {
        beats: [
          {
            id: 'beat_0',
            type: 'titleScreen',
            name: 'Start',
            parameters: { title: 'Test Story' },
          },
          {
            id: 'beat_1',
            type: 'endScreen',
            name: 'End',
            parameters: { endMessage: 'The End' },
          },
        ],
      };

      const result = validateAIStory(story);
      expect(result.valid).toBe(true);
      expect(result.beatCount).toBe(2);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing beat IDs', () => {
      const story = {
        beats: [
          { type: 'titleScreen', parameters: {} }, // missing id
          { id: 'beat_1', type: 'endScreen', parameters: {} },
        ],
      };

      const result = validateAIStory(story);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.category === 'missing_field' && e.field === 'id')).toBe(true);
    });

    it('should detect missing beat types', () => {
      const story = {
        beats: [
          { id: 'beat_0', parameters: {} }, // missing type
        ],
      };

      const result = validateAIStory(story);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.category === 'missing_field' && e.field === 'type')).toBe(true);
    });

    it('should detect duplicate beat IDs', () => {
      const story = {
        beats: [
          { id: 'beat_0', type: 'titleScreen', parameters: {} },
          { id: 'beat_0', type: 'introText', parameters: {} }, // duplicate
          { id: 'beat_1', type: 'endScreen', parameters: {} },
        ],
      };

      const result = validateAIStory(story);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.category === 'duplicate_id')).toBe(true);
    });

    it('should detect references to non-existent beats via connections array', () => {
      const story = {
        beats: [
          {
            id: 'beat_0',
            type: 'titleScreen',
            parameters: {},
            connections: [{ targetId: 'beat_missing' }], // references non-existent beat
          },
        ],
      };

      const result = validateAIStory(story);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.category === 'missing_beat')).toBe(true);
      expect(result.missingBeatIds).toContain('beat_missing');
    });

    it('should detect references to non-existent beats via choice targets', () => {
      const story = {
        beats: [
          {
            id: 'beat_0',
            type: 'movementChoice',
            parameters: {
              choices: [
                { id: 'c1', text: 'Go left', target: 'beat_left' }, // missing
                { id: 'c2', text: 'Go right', target: 'beat_right' }, // missing
              ],
            },
          },
        ],
      };

      const result = validateAIStory(story);
      expect(result.valid).toBe(false);
      expect(result.missingBeatIds).toContain('beat_left');
      expect(result.missingBeatIds).toContain('beat_right');
    });

    it('should extract targets from dialogTree choices', () => {
      const story = {
        beats: [
          { id: 'beat_0', type: 'titleScreen', parameters: {} },
          {
            id: 'beat_1',
            type: 'dialogTree',
            parameters: {
              dialogTree: {
                id: 'node_0',
                speaker: 'NPC',
                text: 'Hello!',
                choices: [
                  { id: 'c1', text: 'Hi', target: 'beat_2' },
                  { id: 'c2', text: 'Bye', target: 'beat_3' },
                ],
              },
            },
          },
          { id: 'beat_2', type: 'introText', parameters: {} },
          { id: 'beat_3', type: 'endScreen', parameters: {} },
        ],
      };

      const result = validateAIStory(story);
      expect(result.valid).toBe(true);
      expect(result.connectionCount).toBeGreaterThanOrEqual(2);
    });

    it('should extract targets from conditionBeat parameters', () => {
      const story = {
        beats: [
          { id: 'beat_0', type: 'titleScreen', parameters: {} },
          {
            id: 'beat_1',
            type: 'conditionBeat',
            parameters: {
              trueConnection: { target: 'beat_true' },
              falseConnection: { target: 'beat_false' },
            },
          },
        ],
      };

      const result = validateAIStory(story);
      expect(result.valid).toBe(false);
      expect(result.missingBeatIds).toContain('beat_true');
      expect(result.missingBeatIds).toContain('beat_false');
    });

    it('should warn about orphaned beats', () => {
      const story = {
        beats: [
          { id: 'beat_0', type: 'titleScreen', parameters: {} },
          { id: 'beat_1', type: 'introText', parameters: {} }, // orphaned
          { id: 'beat_2', type: 'introText', parameters: {} }, // orphaned
        ],
      };

      const result = validateAIStory(story);
      // Should have warnings for orphaned beats (beat_1 and beat_2)
      expect(result.warnings.some(w => w.category === 'orphaned_beat')).toBe(true);
    });

    it('should not warn about orphaned endScreen beats', () => {
      const story = {
        beats: [
          { id: 'beat_0', type: 'titleScreen', parameters: {} },
          { id: 'beat_end', type: 'endScreen', parameters: {} }, // orphaned but allowed
        ],
      };

      const result = validateAIStory(story);
      const orphanedWarnings = result.warnings.filter(
        w => w.category === 'orphaned_beat' && w.beatId === 'beat_end'
      );
      expect(orphanedWarnings).toHaveLength(0);
    });

    it('should warn if first beat is not titleScreen', () => {
      const story = {
        beats: [
          { id: 'beat_0', type: 'introText', parameters: {} },
          { id: 'beat_1', type: 'endScreen', parameters: {} },
        ],
      };

      const result = validateAIStory(story);
      expect(result.warnings.some(w =>
        w.category === 'invalid_structure' && w.message.includes('titleScreen')
      )).toBe(true);
    });

    it('should warn if no endScreen beat exists', () => {
      const story = {
        beats: [
          { id: 'beat_0', type: 'titleScreen', parameters: {} },
          { id: 'beat_1', type: 'introText', parameters: {} },
        ],
      };

      const result = validateAIStory(story);
      expect(result.warnings.some(w =>
        w.message.includes('no endScreen')
      )).toBe(true);
    });

    it('should count connections correctly', () => {
      const story = {
        beats: [
          {
            id: 'beat_0',
            type: 'titleScreen',
            parameters: {},
            connections: [{ targetId: 'beat_1' }],
          },
          {
            id: 'beat_1',
            type: 'movementChoice',
            parameters: {
              choices: [
                { id: 'c1', target: 'beat_2' },
                { id: 'c2', target: 'beat_3' },
              ],
            },
          },
          { id: 'beat_2', type: 'introText', parameters: {} },
          { id: 'beat_3', type: 'endScreen', parameters: {} },
        ],
      };

      const result = validateAIStory(story);
      expect(result.connectionCount).toBe(3); // 1 from titleScreen, 2 from movementChoice
    });
  });

  describe('formatValidationResult', () => {
    it('should format a valid result', () => {
      const result: ValidationResult = {
        valid: true,
        errors: [],
        warnings: [],
        beatCount: 5,
        connectionCount: 4,
        missingBeatIds: [],
      };

      const formatted = formatValidationResult(result);
      expect(formatted).toContain('VALID');
      expect(formatted).toContain('Beats: 5');
      expect(formatted).toContain('Connections: 4');
    });

    it('should format errors and warnings', () => {
      const result: ValidationResult = {
        valid: false,
        errors: [
          { type: 'error', category: 'missing_beat', message: 'Missing beat test_beat' },
        ],
        warnings: [
          { type: 'warning', category: 'orphaned_beat', message: 'Orphaned beat found' },
        ],
        beatCount: 3,
        connectionCount: 2,
        missingBeatIds: ['test_beat'],
      };

      const formatted = formatValidationResult(result);
      expect(formatted).toContain('INVALID');
      expect(formatted).toContain('Missing beat test_beat');
      expect(formatted).toContain('Orphaned beat found');
      expect(formatted).toContain('Missing Beat IDs: test_beat');
    });
  });
});
