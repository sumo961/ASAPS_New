import { describe, it, expect } from 'vitest';
import { PathAnalyzer } from '../../src/analysis/PathAnalyzer';
import { Story } from '../../src/engine/Story';
import { createTestBeat } from '../test-utils';

describe('PathAnalyzer', () => {

  describe('Simple Linear Story', () => {
    it('should find a single path in a linear story', () => {
      const story = new Story({
        title: 'Linear Test',
        author: 'Test',
        firstBeatId: 'beat1'
      });

      // Create linear path: beat1 -> beat2 -> beat3 (endScreen)
      const beat1 = createTestBeat({
        id: 'beat1',
        name: 'Start',
        type: 'titleScreen',
        parameters: { title: 'Start' },
        connections: [{ targetId: 'beat2' }]
      });

      const beat2 = createTestBeat({
        id: 'beat2',
        name: 'Middle',
        type: 'introText',
        parameters: { text: 'Middle' },
        connections: [{ targetId: 'beat3' }]
      });

      const beat3 = createTestBeat({
        id: 'beat3',
        name: 'End',
        type: 'endScreen',
        parameters: { message: 'The End' }
      });

      story.addBeat(beat1);
      story.addBeat(beat2);
      story.addBeat(beat3);

      const analyzer = new PathAnalyzer(story);
      const result = analyzer.analyze();

      expect(result.totalPaths).toBe(1);
      expect(result.uniquePaths.length).toBe(1);
      expect(result.uniquePaths[0].length).toBe(3);
      expect(result.uniquePaths[0].endType).toBe('endBeat');
      expect(result.shortestPath?.length).toBe(3);
      expect(result.longestPath?.length).toBe(3);
      expect(result.averagePathLength).toBe(3);
      expect(result.deadEnds.length).toBe(0);
    });
  });

  describe('Branching Story', () => {
    it('should find multiple paths in a branching story', () => {
      const story = new Story({
        title: 'Branching Test',
        author: 'Test',
        firstBeatId: 'start'
      });

      // Create branching story:
      //        start
      //       /     \
      //   choice1  choice2
      //       \     /
      //        end
      const start = createTestBeat({
        id: 'start',
        name: 'Start',
        type: 'titleScreen',
        parameters: { title: 'Start' },
        connections: [{ targetId: 'choice1' }, { targetId: 'choice2' }]
      });

      const choice1 = createTestBeat({
        id: 'choice1',
        name: 'Choice 1',
        type: 'introText',
        parameters: { text: 'Path 1' },
        connections: [{ targetId: 'end' }]
      });

      const choice2 = createTestBeat({
        id: 'choice2',
        name: 'Choice 2',
        type: 'introText',
        parameters: { text: 'Path 2' },
        connections: [{ targetId: 'end' }]
      });

      const end = createTestBeat({
        id: 'end',
        name: 'End',
        type: 'endScreen',
        parameters: { message: 'The End' }
      });

      story.addBeat(start);
      story.addBeat(choice1);
      story.addBeat(choice2);
      story.addBeat(end);

      const analyzer = new PathAnalyzer(story);
      const result = analyzer.analyze();

      expect(result.totalPaths).toBe(2);
      expect(result.uniquePaths.length).toBe(2);
      expect(result.shortestPath?.length).toBe(3);
      expect(result.longestPath?.length).toBe(3);
      expect(result.averagePathLength).toBe(3);
    });

    it('should find paths of different lengths', () => {
      const story = new Story({
        title: 'Different Length Test',
        author: 'Test',
        firstBeatId: 'start'
      });

      // Create story with different path lengths:
      //     start
      //    /     \
      //  short   long1 -> long2
      //    \       /
      //      end
      const start = createTestBeat({
        id: 'start',
        name: 'Start',
        type: 'titleScreen',
        parameters: { title: 'Start' },
        connections: [{ targetId: 'short' }, { targetId: 'long1' }]
      });

      const shortPath = createTestBeat({
        id: 'short',
        name: 'Short Path',
        type: 'introText',
        parameters: { text: 'Short' },
        connections: [{ targetId: 'end' }]
      });

      const long1 = createTestBeat({
        id: 'long1',
        name: 'Long 1',
        type: 'introText',
        parameters: { text: 'Long 1' },
        connections: [{ targetId: 'long2' }]
      });

      const long2 = createTestBeat({
        id: 'long2',
        name: 'Long 2',
        type: 'introText',
        parameters: { text: 'Long 2' },
        connections: [{ targetId: 'end' }]
      });

      const end = createTestBeat({
        id: 'end',
        name: 'End',
        type: 'endScreen',
        parameters: { message: 'The End' }
      });

      story.addBeat(start);
      story.addBeat(shortPath);
      story.addBeat(long1);
      story.addBeat(long2);
      story.addBeat(end);

      const analyzer = new PathAnalyzer(story);
      const result = analyzer.analyze();

      expect(result.totalPaths).toBe(2);
      expect(result.shortestPath?.length).toBe(3); // start -> short -> end
      expect(result.longestPath?.length).toBe(4); // start -> long1 -> long2 -> end
      expect(result.averagePathLength).toBe(3.5);
    });
  });

  describe('Conditional Paths', () => {
    it('should track conditional paths', () => {
      const story = new Story({
        title: 'Conditional Test',
        author: 'Test',
        firstBeatId: 'start'
      });

      const start = createTestBeat({
        id: 'start',
        name: 'Start',
        type: 'titleScreen',
        parameters: { title: 'Start' },
        connections: [
          { targetId: 'unconditional' },
          {
            targetId: 'conditional',
            condition: {
              type: 'counter',
              operator: '>=',
              left: 'score',
              right: 10
            }
          }
        ]
      });

      const unconditional = createTestBeat({
        id: 'unconditional',
        name: 'Unconditional',
        type: 'endScreen',
        parameters: { message: 'Unconditional End' }
      });

      const conditional = createTestBeat({
        id: 'conditional',
        name: 'Conditional',
        type: 'endScreen',
        parameters: { message: 'Conditional End' }
      });

      story.addBeat(start);
      story.addBeat(unconditional);
      story.addBeat(conditional);

      const analyzer = new PathAnalyzer(story);
      const result = analyzer.analyze();

      expect(result.totalPaths).toBe(2);

      // Find the conditional path
      const conditionalPath = result.uniquePaths.find(
        p => p.nodes.some(n => n.beatId === 'conditional')
      );

      expect(conditionalPath).toBeDefined();
      expect(conditionalPath?.hasConditionals).toBe(true);
      expect(conditionalPath?.conditions.length).toBeGreaterThan(0);
    });

    it('should optionally exclude conditional paths', () => {
      const story = new Story({
        title: 'Exclude Conditional Test',
        author: 'Test',
        firstBeatId: 'start'
      });

      const start = createTestBeat({
        id: 'start',
        name: 'Start',
        type: 'titleScreen',
        parameters: { title: 'Start' },
        connections: [
          { targetId: 'unconditional' },
          {
            targetId: 'conditional',
            condition: {
              type: 'counter',
              operator: '>=',
              left: 'score',
              right: 10
            }
          }
        ]
      });

      const unconditional = createTestBeat({
        id: 'unconditional',
        name: 'Unconditional',
        type: 'endScreen',
        parameters: { message: 'Unconditional End' }
      });

      const conditional = createTestBeat({
        id: 'conditional',
        name: 'Conditional',
        type: 'endScreen',
        parameters: { message: 'Conditional End' }
      });

      story.addBeat(start);
      story.addBeat(unconditional);
      story.addBeat(conditional);

      const analyzer = new PathAnalyzer(story, {
        includeConditionalPaths: false
      });
      const result = analyzer.analyze();

      // Should only find the unconditional path
      expect(result.totalPaths).toBe(1);
      expect(result.uniquePaths[0].nodes.every(n => n.beatId !== 'conditional')).toBe(true);
    });
  });

  describe('Cycle Detection', () => {
    it('should detect simple cycles', () => {
      const story = new Story({
        title: 'Cycle Test',
        author: 'Test',
        firstBeatId: 'beat1'
      });

      // Create cycle: beat1 -> beat2 -> beat1
      const beat1 = createTestBeat({
        id: 'beat1',
        name: 'Beat 1',
        type: 'introText',
        parameters: { text: 'Beat 1' },
        connections: [{ targetId: 'beat2' }]
      });

      const beat2 = createTestBeat({
        id: 'beat2',
        name: 'Beat 2',
        type: 'introText',
        parameters: { text: 'Beat 2' },
        connections: [{ targetId: 'beat1' }] // Cycle back
      });

      story.addBeat(beat1);
      story.addBeat(beat2);

      const analyzer = new PathAnalyzer(story);
      const result = analyzer.analyze();

      expect(result.cycles.length).toBeGreaterThan(0);
      expect(result.totalPaths).toBeGreaterThan(0);

      // Should have at least one path that ends in a cycle
      const cyclicPath = result.uniquePaths.find(p => p.endType === 'cycle');
      expect(cyclicPath).toBeDefined();
    });

    it('should use detectCycles method', () => {
      const story = new Story({
        title: 'Cycle Detection Test',
        author: 'Test',
        firstBeatId: 'beat1'
      });

      const beat1 = createTestBeat({
        id: 'beat1',
        name: 'Beat 1',
        type: 'introText',
        parameters: { text: 'Beat 1' },
        connections: [{ targetId: 'beat2' }]
      });

      const beat2 = createTestBeat({
        id: 'beat2',
        name: 'Beat 2',
        type: 'introText',
        parameters: { text: 'Beat 2' },
        connections: [{ targetId: 'beat3' }]
      });

      const beat3 = createTestBeat({
        id: 'beat3',
        name: 'Beat 3',
        type: 'introText',
        parameters: { text: 'Beat 3' },
        connections: [{ targetId: 'beat1' }] // Cycle
      });

      story.addBeat(beat1);
      story.addBeat(beat2);
      story.addBeat(beat3);

      const analyzer = new PathAnalyzer(story);
      const cycles = analyzer.detectCycles();

      expect(cycles.length).toBeGreaterThan(0);
      expect(cycles[0]).toContain('beat1');
      expect(cycles[0]).toContain('beat2');
      expect(cycles[0]).toContain('beat3');
    });
  });

  describe('Dead Ends', () => {
    it('should detect dead ends (beats with no connections)', () => {
      const story = new Story({
        title: 'Dead End Test',
        author: 'Test',
        firstBeatId: 'start'
      });

      const start = createTestBeat({
        id: 'start',
        name: 'Start',
        type: 'titleScreen',
        parameters: { title: 'Start' },
        connections: [{ targetId: 'deadEnd' }]
      });

      const deadEnd = createTestBeat({
        id: 'deadEnd',
        name: 'Dead End',
        type: 'introText',
        parameters: { text: 'Dead End' }
        // No connections!
      });

      story.addBeat(start);
      story.addBeat(deadEnd);

      const analyzer = new PathAnalyzer(story);
      const result = analyzer.analyze();

      expect(result.deadEnds.length).toBe(1);
      expect(result.deadEnds[0]).toBe('deadEnd');
      expect(result.uniquePaths[0].endType).toBe('deadEnd');
    });
  });

  describe('DefaultTarget', () => {
    it('should follow defaultTarget connections', () => {
      const story = new Story({
        title: 'DefaultTarget Test',
        author: 'Test',
        firstBeatId: 'start'
      });

      const start = createTestBeat({
        id: 'start',
        name: 'Start',
        type: 'titleScreen',
        parameters: { title: 'Start' },
        defaultTarget: 'end' // Using defaultTarget instead of connections
      });

      const end = createTestBeat({
        id: 'end',
        name: 'End',
        type: 'endScreen',
        parameters: { message: 'The End' }
      });

      story.addBeat(start);
      story.addBeat(end);

      const analyzer = new PathAnalyzer(story);
      const result = analyzer.analyze();

      expect(result.totalPaths).toBe(1);
      expect(result.uniquePaths[0].length).toBe(2);
      expect(result.uniquePaths[0].nodes[0].beatId).toBe('start');
      expect(result.uniquePaths[0].nodes[1].beatId).toBe('end');
    });
  });

  describe('Depth Limit', () => {
    it('should respect maxDepth configuration', () => {
      const story = new Story({
        title: 'Depth Limit Test',
        author: 'Test',
        firstBeatId: 'beat1'
      });

      // Create very long linear chain
      const beats: any[] = [];
      for (let i = 1; i <= 20; i++) {
        const beat = createTestBeat({
          id: `beat${i}`,
          name: `Beat ${i}`,
          type: 'introText',
          parameters: { text: `Beat ${i}` },
          connections: i < 20 ? [{ targetId: `beat${i + 1}` }] : []
        });
        beats.push(beat);
        story.addBeat(beat);
      }

      const analyzer = new PathAnalyzer(story, { maxDepth: 10 });
      const result = analyzer.analyze();

      // Path should be truncated at maxDepth
      expect(result.uniquePaths[0].length).toBeLessThanOrEqual(10);
      expect(result.uniquePaths[0].endType).toBe('depthLimit');
    });
  });

  describe('Empty Story', () => {
    it('should handle empty story gracefully', () => {
      const story = new Story({
        title: 'Empty Test',
        author: 'Test',
        firstBeatId: 'nonexistent'
      });

      const analyzer = new PathAnalyzer(story);
      const result = analyzer.analyze();

      expect(result.totalPaths).toBe(0);
      expect(result.uniquePaths.length).toBe(0);
      expect(result.shortestPath).toBeNull();
      expect(result.longestPath).toBeNull();
      expect(result.averagePathLength).toBe(0);
    });
  });

  describe('findPathsFromBeat', () => {
    it('should find paths starting from a specific beat', () => {
      const story = new Story({
        title: 'Specific Beat Test',
        author: 'Test',
        firstBeatId: 'beat1'
      });

      const beat1 = createTestBeat({
        id: 'beat1',
        name: 'Beat 1',
        type: 'introText',
        parameters: { text: 'Beat 1' },
        connections: [{ targetId: 'beat2' }]
      });

      const beat2 = createTestBeat({
        id: 'beat2',
        name: 'Beat 2',
        type: 'introText',
        parameters: { text: 'Beat 2' },
        connections: [{ targetId: 'beat3' }]
      });

      const beat3 = createTestBeat({
        id: 'beat3',
        name: 'Beat 3',
        type: 'endScreen',
        parameters: { message: 'End' }
      });

      story.addBeat(beat1);
      story.addBeat(beat2);
      story.addBeat(beat3);

      const analyzer = new PathAnalyzer(story);
      const pathsFromBeat2 = analyzer.findPathsFromBeat('beat2');

      expect(pathsFromBeat2.length).toBe(1);
      expect(pathsFromBeat2[0].nodes[0].beatId).toBe('beat2');
      expect(pathsFromBeat2[0].nodes[1].beatId).toBe('beat3');
      expect(pathsFromBeat2[0].length).toBe(2);
    });
  });

  describe('Ending Beats', () => {
    it('should identify all ending beats (endScreen type)', () => {
      const story = new Story({
        title: 'Multiple Endings Test',
        author: 'Test',
        firstBeatId: 'start'
      });

      const start = createTestBeat({
        id: 'start',
        name: 'Start',
        type: 'titleScreen',
        parameters: { title: 'Start' },
        connections: [{ targetId: 'end1' }, { targetId: 'end2' }]
      });

      const end1 = createTestBeat({
        id: 'end1',
        name: 'Good Ending',
        type: 'endScreen',
        parameters: { message: 'Good End' }
      });

      const end2 = createTestBeat({
        id: 'end2',
        name: 'Bad Ending',
        type: 'endScreen',
        parameters: { message: 'Bad End' }
      });

      story.addBeat(start);
      story.addBeat(end1);
      story.addBeat(end2);

      const analyzer = new PathAnalyzer(story);
      const result = analyzer.analyze();

      expect(result.endingBeats.length).toBe(2);
      expect(result.endingBeats).toContain('end1');
      expect(result.endingBeats).toContain('end2');
    });
  });
});
