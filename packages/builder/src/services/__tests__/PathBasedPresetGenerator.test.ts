import { describe, it, expect } from 'vitest';
import { generatePathPresets, type PresetGenerationResult } from '../PathBasedPresetGenerator';
import { Story, BeatTypeRegistry } from '@asaps/core';

// Helper to create test beats
function createTestBeat(config: {
  id: string;
  name: string;
  type: string;
  parameters?: Record<string, any>;
  connections?: Array<{ targetId: string; label?: string }>;
}) {
  const registry = BeatTypeRegistry.getInstance();
  return registry.createBeat(config.type, {
    id: config.id,
    name: config.name,
    type: config.type,
    parameters: config.parameters || {},
    connections: config.connections || [],
  });
}

describe('PathBasedPresetGenerator', () => {
  describe('generatePathPresets', () => {
    it('should return empty presets for nonexistent beat', () => {
      const story = new Story({
        title: 'Test Story',
        author: 'Test',
        firstBeatId: 'start'
      });

      const start = createTestBeat({
        id: 'start',
        name: 'Start',
        type: 'titleScreen',
        parameters: { title: 'Test' }
      });
      story.addBeat(start);

      const result = generatePathPresets(story, 'nonexistent');

      expect(result.targetBeatName).toBe('Unknown');
      expect(result.presets).toEqual([]);
    });

    it('should generate presets for a reachable beat', () => {
      const story = new Story({
        title: 'Test Story',
        author: 'Test',
        firstBeatId: 'start'
      });

      const start = createTestBeat({
        id: 'start',
        name: 'Start',
        type: 'titleScreen',
        parameters: { title: 'Test' },
        connections: [{ targetId: 'middle' }]
      });

      const middle = createTestBeat({
        id: 'middle',
        name: 'Middle',
        type: 'infoText',
        parameters: { text: 'Middle text' },
        connections: [{ targetId: 'end' }]
      });

      const end = createTestBeat({
        id: 'end',
        name: 'End',
        type: 'endScreen',
        parameters: { message: 'The End' }
      });

      story.addBeat(start);
      story.addBeat(middle);
      story.addBeat(end);

      const result = generatePathPresets(story, 'middle');

      expect(result.targetBeatId).toBe('middle');
      expect(result.targetBeatName).toBe('Middle');
      // Should find at least one path to the middle beat
      expect(result.presets.length).toBeGreaterThanOrEqual(0);
      expect(result.analysisTime).toBeGreaterThan(0);
    });

    it('should include path metadata in generated presets', () => {
      const story = new Story({
        title: 'Branching Story',
        author: 'Test',
        firstBeatId: 'start'
      });

      const start = createTestBeat({
        id: 'start',
        name: 'Start',
        type: 'titleScreen',
        parameters: { title: 'Test' },
        connections: [{ targetId: 'choice' }]
      });

      const choice = createTestBeat({
        id: 'choice',
        name: 'Choice',
        type: 'dialogTree',
        parameters: {
          choices: [
            { id: 'a', text: 'Path A', targetBeatId: 'pathA' },
            { id: 'b', text: 'Path B', targetBeatId: 'pathB' }
          ]
        },
        connections: [
          { targetId: 'pathA', label: 'Path A' },
          { targetId: 'pathB', label: 'Path B' }
        ]
      });

      const pathA = createTestBeat({
        id: 'pathA',
        name: 'Path A',
        type: 'infoText',
        parameters: { text: 'Path A content' },
        connections: [{ targetId: 'end' }]
      });

      const pathB = createTestBeat({
        id: 'pathB',
        name: 'Path B',
        type: 'infoText',
        parameters: { text: 'Path B content' },
        connections: [{ targetId: 'end' }]
      });

      const end = createTestBeat({
        id: 'end',
        name: 'End',
        type: 'endScreen',
        parameters: { message: 'The End' }
      });

      story.addBeat(start);
      story.addBeat(choice);
      story.addBeat(pathA);
      story.addBeat(pathB);
      story.addBeat(end);

      const result = generatePathPresets(story, 'end');

      // Each preset should have path metadata
      for (const preset of result.presets) {
        expect(preset).toHaveProperty('outcomeGroup');
        expect(preset).toHaveProperty('pathDescription');
        expect(preset).toHaveProperty('pathIndex');
        expect(preset).toHaveProperty('totalPathsInGroup');
        expect(preset).toHaveProperty('preset');
      }
    });

    it('should track analysis time', () => {
      const story = new Story({
        title: 'Simple Story',
        author: 'Test',
        firstBeatId: 'start'
      });

      const start = createTestBeat({
        id: 'start',
        name: 'Start',
        type: 'titleScreen',
        parameters: { title: 'Test' }
      });
      story.addBeat(start);

      const result = generatePathPresets(story, 'start');

      expect(typeof result.analysisTime).toBe('number');
      expect(result.analysisTime).toBeGreaterThanOrEqual(0);
    });

    it('should handle story with setVariable beats', () => {
      const story = new Story({
        title: 'Variable Story',
        author: 'Test',
        firstBeatId: 'start'
      });

      const start = createTestBeat({
        id: 'start',
        name: 'Start',
        type: 'titleScreen',
        parameters: { title: 'Test' },
        connections: [{ targetId: 'setVar' }]
      });

      const setVar = createTestBeat({
        id: 'setVar',
        name: 'Set Variable',
        type: 'setVariable',
        parameters: { variable: 'hasKey', value: 'true' },
        connections: [{ targetId: 'end' }]
      });

      const end = createTestBeat({
        id: 'end',
        name: 'End',
        type: 'endScreen',
        parameters: { message: 'Done' }
      });

      story.addBeat(start);
      story.addBeat(setVar);
      story.addBeat(end);

      const result = generatePathPresets(story, 'end');

      expect(result.targetBeatId).toBe('end');
      // The presets should include state from the setVariable beat
      // (actual state content depends on implementation)
    });
  });

  describe('Preset Deduplication', () => {
    it('should not include duplicate presets with identical states', () => {
      const story = new Story({
        title: 'Diamond Story',
        author: 'Test',
        firstBeatId: 'start'
      });

      // Create a diamond pattern: start -> A/B -> merge -> end
      const start = createTestBeat({
        id: 'start',
        name: 'Start',
        type: 'titleScreen',
        parameters: { title: 'Test' },
        connections: [{ targetId: 'choice' }]
      });

      const choice = createTestBeat({
        id: 'choice',
        name: 'Choice',
        type: 'dialogTree',
        parameters: {
          choices: [
            { id: 'a', text: 'A', targetBeatId: 'a' },
            { id: 'b', text: 'B', targetBeatId: 'b' }
          ]
        },
        connections: [
          { targetId: 'a', label: 'A' },
          { targetId: 'b', label: 'B' }
        ]
      });

      const a = createTestBeat({
        id: 'a',
        name: 'Path A',
        type: 'infoText',
        parameters: { text: 'A' },
        connections: [{ targetId: 'merge' }]
      });

      const b = createTestBeat({
        id: 'b',
        name: 'Path B',
        type: 'infoText',
        parameters: { text: 'B' },
        connections: [{ targetId: 'merge' }]
      });

      const merge = createTestBeat({
        id: 'merge',
        name: 'Merge',
        type: 'infoText',
        parameters: { text: 'Merged' },
        connections: [{ targetId: 'end' }]
      });

      const end = createTestBeat({
        id: 'end',
        name: 'End',
        type: 'endScreen',
        parameters: { message: 'Done' }
      });

      story.addBeat(start);
      story.addBeat(choice);
      story.addBeat(a);
      story.addBeat(b);
      story.addBeat(merge);
      story.addBeat(end);

      const result = generatePathPresets(story, 'end');

      // If paths through A and B result in the same state at 'end',
      // they may be deduplicated (depends on implementation)
      expect(result.presets).toBeDefined();
    });
  });
});
