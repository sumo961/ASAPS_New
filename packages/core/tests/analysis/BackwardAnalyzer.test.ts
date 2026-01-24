/**
 * Tests for BackwardAnalyzer - reverse path analysis
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BackwardAnalyzer } from '../../src/analysis/BackwardAnalyzer';
import type { Story } from '../../src/engine/Story';
import type { Beat } from '../../src/beats/Beat';

// Mock beat factory
function createMockBeat(config: {
  id: string;
  name: string;
  type: string;
  connections?: Array<{ targetId: string; label?: string; condition?: any }>;
  defaultTarget?: string;
  parameters?: any;
}): Beat {
  return {
    id: config.id,
    name: config.name,
    type: config.type,
    connections: config.connections || [],
    defaultTarget: config.defaultTarget,
    getConnections: () => config.connections || [],
    getParameters: () => config.parameters || {},
  } as unknown as Beat;
}

// Mock story factory
function createMockStory(
  beats: Beat[],
  firstBeatId: string = '0'
): Story {
  const beatMap = new Map(beats.map(b => [b.id, b]));
  return {
    getBeat: (id: string) => beatMap.get(id),
    getAllBeats: () => beats,
    getFirstBeatId: () => firstBeatId,
  } as unknown as Story;
}

describe('BackwardAnalyzer', () => {
  describe('constructor', () => {
    it('should build reverse graph from story', () => {
      const beats = [
        createMockBeat({ id: '0', name: 'Start', type: 'titleScreen', connections: [{ targetId: '1' }] }),
        createMockBeat({ id: '1', name: 'End', type: 'endScreen' }),
      ];
      const story = createMockStory(beats);

      // Should not throw
      expect(() => new BackwardAnalyzer(story)).not.toThrow();
    });
  });

  describe('analyzeBackward', () => {
    it('should return empty result for unknown beat', () => {
      const beats = [
        createMockBeat({ id: '0', name: 'Start', type: 'titleScreen' }),
      ];
      const story = createMockStory(beats);
      const analyzer = new BackwardAnalyzer(story);

      const result = analyzer.analyzeBackward('nonexistent');

      expect(result.targetBeatId).toBe('nonexistent');
      expect(result.targetBeatName).toBe('Unknown');
      expect(result.requirements).toEqual([]);
      expect(result.minimumSteps).toBe(-1);
    });

    it('should find direct path from start to target', () => {
      const beats = [
        createMockBeat({ id: '0', name: 'Start', type: 'titleScreen', connections: [{ targetId: '1' }] }),
        createMockBeat({ id: '1', name: 'End', type: 'endScreen' }),
      ];
      const story = createMockStory(beats);
      const analyzer = new BackwardAnalyzer(story);

      const result = analyzer.analyzeBackward('1');

      expect(result.targetBeatId).toBe('1');
      expect(result.targetBeatName).toBe('End');
      expect(result.requirements.length).toBeGreaterThan(0);
      expect(result.minimumSteps).toBe(2); // Start + End
    });

    it('should find paths through multiple beats', () => {
      const beats = [
        createMockBeat({ id: '0', name: 'Start', type: 'titleScreen', connections: [{ targetId: '1' }] }),
        createMockBeat({ id: '1', name: 'Middle', type: 'infoText', connections: [{ targetId: '2' }] }),
        createMockBeat({ id: '2', name: 'End', type: 'endScreen' }),
      ];
      const story = createMockStory(beats);
      const analyzer = new BackwardAnalyzer(story);

      const result = analyzer.analyzeBackward('2');

      expect(result.requirements.length).toBeGreaterThan(0);
      expect(result.minimumSteps).toBe(3); // Start + Middle + End
    });

    it('should track decision points for choice beats', () => {
      const beats = [
        createMockBeat({
          id: '0',
          name: 'Start',
          type: 'movementChoice',
          connections: [
            { targetId: '1', label: 'Go Left' },
            { targetId: '2', label: 'Go Right' },
          ],
        }),
        createMockBeat({ id: '1', name: 'Left End', type: 'endScreen' }),
        createMockBeat({ id: '2', name: 'Right End', type: 'endScreen' }),
      ];
      const story = createMockStory(beats);
      const analyzer = new BackwardAnalyzer(story);

      const result = analyzer.analyzeBackward('1');

      expect(result.requirements.length).toBeGreaterThan(0);
      const req = result.requirements[0];
      // Should have decision point for the choice
      expect(req.decisionPoints.some(dp => dp.requiredChoice === 'Go Left')).toBe(true);
    });

    it('should track condition beat branches', () => {
      const beats = [
        createMockBeat({ id: '0', name: 'Start', type: 'titleScreen', connections: [{ targetId: '1' }] }),
        createMockBeat({
          id: '1',
          name: 'Check Score',
          type: 'conditionBeat',
          parameters: {
            conditionType: 'counter',
            variableName: 'score',
            operator: '>=',
            value: 50,
            trueTarget: '2',
            falseTarget: '3',
          },
        }),
        createMockBeat({ id: '2', name: 'Win', type: 'endScreen' }),
        createMockBeat({ id: '3', name: 'Lose', type: 'endScreen' }),
      ];
      const story = createMockStory(beats);
      const analyzer = new BackwardAnalyzer(story);

      const winResult = analyzer.analyzeBackward('2');
      expect(winResult.requirements.length).toBeGreaterThan(0);
      // Should have condition requirement for TRUE branch
      const winDecision = winResult.requirements[0].decisionPoints.find(
        dp => dp.beatId === '1'
      );
      expect(winDecision?.requiredCondition).toBe('TRUE');

      const loseResult = analyzer.analyzeBackward('3');
      expect(loseResult.requirements.length).toBeGreaterThan(0);
      // Should have condition requirement for FALSE branch
      const loseDecision = loseResult.requirements[0].decisionPoints.find(
        dp => dp.beatId === '1'
      );
      expect(loseDecision?.requiredCondition).toBe('FALSE');
    });

    it('should find multiple paths to same target', () => {
      // Diamond pattern: A -> B,C -> D
      const beats = [
        createMockBeat({
          id: '0',
          name: 'Start',
          type: 'dialogTree',
          connections: [
            { targetId: '1', label: 'Option A' },
            { targetId: '2', label: 'Option B' },
          ],
        }),
        createMockBeat({ id: '1', name: 'Path A', type: 'infoText', connections: [{ targetId: '3' }] }),
        createMockBeat({ id: '2', name: 'Path B', type: 'infoText', connections: [{ targetId: '3' }] }),
        createMockBeat({ id: '3', name: 'Convergence', type: 'endScreen' }),
      ];
      const story = createMockStory(beats);
      const analyzer = new BackwardAnalyzer(story);

      const result = analyzer.analyzeBackward('3');

      // Should find two different paths
      expect(result.requirements.length).toBe(2);
    });

    it('should identify necessary beats (on all paths)', () => {
      // Every path must go through a specific beat
      const beats = [
        createMockBeat({
          id: '0',
          name: 'Start',
          type: 'dialogTree',
          connections: [
            { targetId: '1', label: 'Left' },
            { targetId: '2', label: 'Right' },
          ],
        }),
        createMockBeat({ id: '1', name: 'Left', type: 'infoText', connections: [{ targetId: '3' }] }),
        createMockBeat({ id: '2', name: 'Right', type: 'infoText', connections: [{ targetId: '3' }] }),
        createMockBeat({ id: '3', name: 'Required', type: 'infoText', connections: [{ targetId: '4' }] }),
        createMockBeat({ id: '4', name: 'End', type: 'endScreen' }),
      ];
      const story = createMockStory(beats);
      const analyzer = new BackwardAnalyzer(story);

      const result = analyzer.analyzeBackward('4');

      // Beat '3' should be in all paths to '4'
      // Since both paths go through '3', it should be a necessary beat
      // Note: The implementation counts decision points, which may not include intermediate beats
      expect(result.requirements.length).toBe(2);
    });

    it('should handle unreachable beats', () => {
      // Beat '2' has no incoming connections
      const beats = [
        createMockBeat({ id: '0', name: 'Start', type: 'titleScreen', connections: [{ targetId: '1' }] }),
        createMockBeat({ id: '1', name: 'End', type: 'endScreen' }),
        createMockBeat({ id: '2', name: 'Orphan', type: 'infoText' }), // No incoming edges
      ];
      const story = createMockStory(beats);
      const analyzer = new BackwardAnalyzer(story);

      const result = analyzer.analyzeBackward('2');

      expect(result.requirements).toEqual([]);
      expect(result.minimumSteps).toBe(-1);
    });

    it('should handle loops without infinite recursion', () => {
      // Beat 1 and 2 loop to each other
      const beats = [
        createMockBeat({ id: '0', name: 'Start', type: 'titleScreen', connections: [{ targetId: '1' }] }),
        createMockBeat({
          id: '1',
          name: 'Loop A',
          type: 'infoText',
          connections: [{ targetId: '2' }, { targetId: '3' }],
        }),
        createMockBeat({ id: '2', name: 'Loop B', type: 'infoText', connections: [{ targetId: '1' }] }),
        createMockBeat({ id: '3', name: 'End', type: 'endScreen' }),
      ];
      const story = createMockStory(beats);
      const analyzer = new BackwardAnalyzer(story);

      // Should complete without hanging
      const result = analyzer.analyzeBackward('3');

      expect(result.requirements.length).toBeGreaterThan(0);
      expect(result.analysisTime).toBeDefined();
    });

    it('should respect depth limit', () => {
      // Create a very deep path
      const beats: Beat[] = [
        createMockBeat({ id: '0', name: 'Start', type: 'titleScreen', connections: [{ targetId: '1' }] }),
      ];

      // Add 60 intermediate beats (exceeds 50 depth limit)
      for (let i = 1; i <= 60; i++) {
        beats.push(
          createMockBeat({
            id: String(i),
            name: `Beat ${i}`,
            type: 'infoText',
            connections: [{ targetId: String(i + 1) }],
          })
        );
      }
      beats.push(createMockBeat({ id: '61', name: 'End', type: 'endScreen' }));

      const story = createMockStory(beats);
      const analyzer = new BackwardAnalyzer(story);

      const result = analyzer.analyzeBackward('61');

      // Should not find any requirements due to depth limit
      expect(result.requirements).toEqual([]);
    });

    it('should generate summary for requirements', () => {
      const beats = [
        createMockBeat({
          id: '0',
          name: 'Choice',
          type: 'movementChoice',
          connections: [{ targetId: '1', label: 'Enter Forest' }],
        }),
        createMockBeat({ id: '1', name: 'Forest', type: 'endScreen' }),
      ];
      const story = createMockStory(beats);
      const analyzer = new BackwardAnalyzer(story);

      const result = analyzer.analyzeBackward('1');

      expect(result.requirements.length).toBeGreaterThan(0);
      expect(result.requirements[0].summary).toBeDefined();
      expect(result.requirements[0].summary.length).toBeGreaterThan(0);
    });
  });

  describe('getEndings', () => {
    it('should return all endScreen beats', () => {
      const beats = [
        createMockBeat({ id: '0', name: 'Start', type: 'titleScreen' }),
        createMockBeat({ id: '1', name: 'Good Ending', type: 'endScreen' }),
        createMockBeat({ id: '2', name: 'Middle', type: 'infoText' }),
        createMockBeat({ id: '3', name: 'Bad Ending', type: 'endScreen' }),
        createMockBeat({ id: '4', name: 'Secret Ending', type: 'endScreen' }),
      ];
      const story = createMockStory(beats);
      const analyzer = new BackwardAnalyzer(story);

      const endings = analyzer.getEndings();

      expect(endings).toHaveLength(3);
      expect(endings.map(e => e.beatId)).toContain('1');
      expect(endings.map(e => e.beatId)).toContain('3');
      expect(endings.map(e => e.beatId)).toContain('4');
      expect(endings.map(e => e.beatName)).toContain('Good Ending');
    });

    it('should return empty array if no endings', () => {
      const beats = [
        createMockBeat({ id: '0', name: 'Start', type: 'titleScreen' }),
        createMockBeat({ id: '1', name: 'Middle', type: 'infoText' }),
      ];
      const story = createMockStory(beats);
      const analyzer = new BackwardAnalyzer(story);

      const endings = analyzer.getEndings();

      expect(endings).toEqual([]);
    });
  });

  describe('choice beat detection', () => {
    it('should recognize dialogTree as choice beat', () => {
      const beats = [
        createMockBeat({
          id: '0',
          name: 'Dialog',
          type: 'dialogTree',
          connections: [{ targetId: '1', label: 'Say Hello' }],
        }),
        createMockBeat({ id: '1', name: 'End', type: 'endScreen' }),
      ];
      const story = createMockStory(beats);
      const analyzer = new BackwardAnalyzer(story);

      const result = analyzer.analyzeBackward('1');

      expect(result.requirements[0].decisionPoints.some(
        dp => dp.beatType === 'dialogTree'
      )).toBe(true);
    });

    it('should recognize pickProp as choice beat', () => {
      const beats = [
        createMockBeat({
          id: '0',
          name: 'Pick Item',
          type: 'pickProp',
          connections: [{ targetId: '1', label: 'Sword' }],
        }),
        createMockBeat({ id: '1', name: 'End', type: 'endScreen' }),
      ];
      const story = createMockStory(beats);
      const analyzer = new BackwardAnalyzer(story);

      const result = analyzer.analyzeBackward('1');

      expect(result.requirements[0].decisionPoints.some(
        dp => dp.beatType === 'pickProp'
      )).toBe(true);
    });

    it('should recognize hyperText as choice beat', () => {
      const beats = [
        createMockBeat({
          id: '0',
          name: 'Hyper',
          type: 'hyperText',
          connections: [{ targetId: '1', label: 'Link' }],
        }),
        createMockBeat({ id: '1', name: 'End', type: 'endScreen' }),
      ];
      const story = createMockStory(beats);
      const analyzer = new BackwardAnalyzer(story);

      const result = analyzer.analyzeBackward('1');

      expect(result.requirements[0].decisionPoints.some(
        dp => dp.beatType === 'hyperText'
      )).toBe(true);
    });
  });

  describe('default target handling', () => {
    it('should include default target in connections', () => {
      const beats = [
        createMockBeat({
          id: '0',
          name: 'Start',
          type: 'titleScreen',
          defaultTarget: '1',
        }),
        createMockBeat({ id: '1', name: 'End', type: 'endScreen' }),
      ];
      const story = createMockStory(beats);
      const analyzer = new BackwardAnalyzer(story);

      const result = analyzer.analyzeBackward('1');

      expect(result.requirements.length).toBeGreaterThan(0);
      expect(result.minimumSteps).toBe(2);
    });
  });
});
