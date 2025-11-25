import { describe, it, expect } from 'vitest';
import { ReachabilityAnalyzer } from '../../src/analysis/ReachabilityAnalyzer';
import { Story } from '../../src/engine/Story';
import { createTestBeat } from '../test-utils';

describe('ReachabilityAnalyzer', () => {

  describe('Basic Reachability', () => {
    it('should mark all beats as reachable in a linear story', () => {
      const story = new Story({
        title: 'Linear Test',
        author: 'Test',
        firstBeatId: 'beat1'
      });

      const beat1 = createTestBeat({
        id: 'beat1',
        name: 'Beat 1',
        type: 'titleScreen',
        parameters: { title: 'Start' },
        connections: [{ targetId: 'beat2' }]
      });

      const beat2 = createTestBeat({
        id: 'beat2',
        name: 'Beat 2',
        type: 'introText',
        parameters: { text: 'Middle' },
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

      const analyzer = new ReachabilityAnalyzer(story);
      const result = analyzer.analyze();

      expect(result.analysis.totalBeats).toBe(3);
      expect(result.analysis.reachableCount).toBe(3);
      expect(result.analysis.unreachableCount).toBe(0);
      expect(result.reachableBeats.has('beat1')).toBe(true);
      expect(result.reachableBeats.has('beat2')).toBe(true);
      expect(result.reachableBeats.has('beat3')).toBe(true);
    });

    it('should detect unreachable beats', () => {
      const story = new Story({
        title: 'Unreachable Test',
        author: 'Test',
        firstBeatId: 'beat1'
      });

      const beat1 = createTestBeat({
        id: 'beat1',
        name: 'Beat 1',
        type: 'titleScreen',
        parameters: { title: 'Start' },
        connections: [{ targetId: 'beat2' }]
      });

      const beat2 = createTestBeat({
        id: 'beat2',
        name: 'Beat 2',
        type: 'endScreen',
        parameters: { message: 'End' }
      });

      // Orphaned beat with no incoming connections
      const beat3 = createTestBeat({
        id: 'beat3',
        name: 'Orphaned Beat',
        type: 'introText',
        parameters: { text: 'Orphaned' }
      });

      story.addBeat(beat1);
      story.addBeat(beat2);
      story.addBeat(beat3);

      const analyzer = new ReachabilityAnalyzer(story);
      const result = analyzer.analyze();

      expect(result.analysis.reachableCount).toBe(2);
      expect(result.analysis.unreachableCount).toBe(1);
      expect(result.reachableBeats.has('beat1')).toBe(true);
      expect(result.reachableBeats.has('beat2')).toBe(true);
      expect(result.reachableBeats.has('beat3')).toBe(false);

      const unreachable = result.unreachableBeats.find(b => b.beatId === 'beat3');
      expect(unreachable).toBeDefined();
      expect(unreachable?.reason).toBe('orphaned');
    });
  });

  describe('Orphaned Beats', () => {
    it('should detect orphaned beats (no incoming connections)', () => {
      const story = new Story({
        title: 'Orphan Test',
        author: 'Test',
        firstBeatId: 'start'
      });

      const start = createTestBeat({
        id: 'start',
        name: 'Start',
        type: 'titleScreen',
        parameters: { title: 'Start' },
        connections: [{ targetId: 'end' }]
      });

      const end = createTestBeat({
        id: 'end',
        name: 'End',
        type: 'endScreen',
        parameters: { message: 'End' }
      });

      const orphan = createTestBeat({
        id: 'orphan',
        name: 'Orphan',
        type: 'introText',
        parameters: { text: 'Orphan' }
      });

      story.addBeat(start);
      story.addBeat(end);
      story.addBeat(orphan);

      const analyzer = new ReachabilityAnalyzer(story);
      const result = analyzer.analyze();

      expect(result.orphanedBeats.length).toBe(1);
      expect(result.orphanedBeats[0]).toBe('orphan');
    });

    it('should not mark first beat as orphaned', () => {
      const story = new Story({
        title: 'First Beat Test',
        author: 'Test',
        firstBeatId: 'start'
      });

      const start = createTestBeat({
        id: 'start',
        name: 'Start',
        type: 'titleScreen',
        parameters: { title: 'Start' }
        // No connections - but it's the first beat
      });

      story.addBeat(start);

      const analyzer = new ReachabilityAnalyzer(story);
      const result = analyzer.analyze();

      expect(result.orphanedBeats.length).toBe(0);
    });
  });

  describe('Impossible Conditions', () => {
    it('should detect impossible counter conditions', () => {
      const story = new Story({
        title: 'Impossible Counter Test',
        author: 'Test',
        firstBeatId: 'start'
      });

      const start = createTestBeat({
        id: 'start',
        name: 'Start',
        type: 'titleScreen',
        parameters: { title: 'Start' },
        connections: [
          {
            targetId: 'impossible',
            condition: {
              type: 'counter',
              operator: '>=',
              left: 'score',
              right: 100 // Impossible to achieve
            }
          }
        ]
      });

      const impossible = createTestBeat({
        id: 'impossible',
        name: 'Impossible',
        type: 'endScreen',
        parameters: { message: 'Impossible End' }
      });

      // Add a beat that sets score to 50 (max achievable)
      const setter = createTestBeat({
        id: 'setter',
        name: 'Setter',
        type: 'setVariable',
        parameters: {
          type: 'counter',
          name: 'score',
          value: 50,
          operation: 'set'
        }
      });

      story.addBeat(start);
      story.addBeat(impossible);
      story.addBeat(setter);

      const analyzer = new ReachabilityAnalyzer(story);
      const result = analyzer.analyze();

      expect(result.reachableBeats.has('impossible')).toBe(false);

      const unreachable = result.unreachableBeats.find(b => b.beatId === 'impossible');
      expect(unreachable).toBeDefined();
      expect(unreachable?.reason).toBe('impossibleCondition');
      expect(unreachable?.blockingConditions).toBeDefined();
      expect(unreachable?.blockingConditions?.[0].isSatisfiable).toBe(false);
    });

    it('should detect impossible variable conditions', () => {
      const story = new Story({
        title: 'Impossible Variable Test',
        author: 'Test',
        firstBeatId: 'start'
      });

      const start = createTestBeat({
        id: 'start',
        name: 'Start',
        type: 'titleScreen',
        parameters: { title: 'Start' },
        connections: [
          {
            targetId: 'impossible',
            condition: {
              type: 'variable',
              operator: '==',
              left: 'playerChoice',
              right: 'impossible' // Never set to this value
            }
          }
        ]
      });

      const impossible = createTestBeat({
        id: 'impossible',
        name: 'Impossible',
        type: 'endScreen',
        parameters: { message: 'Impossible End' }
      });

      // Variable is set to different value
      const setter = createTestBeat({
        id: 'setter',
        name: 'Setter',
        type: 'setVariable',
        parameters: {
          type: 'variable',
          name: 'playerChoice',
          value: 'possible'
        }
      });

      story.addBeat(start);
      story.addBeat(impossible);
      story.addBeat(setter);

      const analyzer = new ReachabilityAnalyzer(story);
      const result = analyzer.analyze();

      const unreachable = result.unreachableBeats.find(b => b.beatId === 'impossible');
      expect(unreachable).toBeDefined();
      expect(unreachable?.blockingConditions?.[0].isSatisfiable).toBe(false);
    });

    it('should allow satisfiable counter conditions', () => {
      const story = new Story({
        title: 'Satisfiable Counter Test',
        author: 'Test',
        firstBeatId: 'start'
      });

      const start = createTestBeat({
        id: 'start',
        name: 'Start',
        type: 'titleScreen',
        parameters: { title: 'Start' },
        connections: [
          {
            targetId: 'reachable',
            condition: {
              type: 'counter',
              operator: '>=',
              left: 'score',
              right: 50 // Achievable
            }
          }
        ]
      });

      const reachable = createTestBeat({
        id: 'reachable',
        name: 'Reachable',
        type: 'endScreen',
        parameters: { message: 'Reachable End' }
      });

      // Counter can reach 100
      const setter = createTestBeat({
        id: 'setter',
        name: 'Setter',
        type: 'setVariable',
        parameters: {
          type: 'counter',
          name: 'score',
          value: 100,
          operation: 'set'
        }
      });

      story.addBeat(start);
      story.addBeat(reachable);
      story.addBeat(setter);

      const analyzer = new ReachabilityAnalyzer(story);
      const result = analyzer.analyze();

      expect(result.reachableBeats.has('reachable')).toBe(true);
    });
  });

  describe('Counter Range Analysis', () => {
    it('should analyze counter modifications', () => {
      const story = new Story({
        title: 'Counter Analysis Test',
        author: 'Test',
        firstBeatId: 'start'
      });

      const start = createTestBeat({
        id: 'start',
        name: 'Start',
        type: 'titleScreen',
        parameters: { title: 'Start' }
      });

      // Beat that sets counter to 10
      const setter1 = createTestBeat({
        id: 'setter1',
        name: 'Setter 1',
        type: 'setVariable',
        parameters: {
          type: 'counter',
          name: 'score',
          value: 10,
          operation: 'set'
        }
      });

      // Beat that increments counter by 5
      const setter2 = createTestBeat({
        id: 'setter2',
        name: 'Setter 2',
        type: 'setVariable',
        parameters: {
          type: 'counter',
          name: 'score',
          value: 5,
          operation: 'change'
        }
      });

      story.addBeat(start);
      story.addBeat(setter1);
      story.addBeat(setter2);

      const analyzer = new ReachabilityAnalyzer(story);

      // Analyze a condition
      const condition = {
        type: 'counter' as const,
        operator: '>=' as const,
        left: 'score',
        right: 15
      };

      const analysis = analyzer.analyzeCondition(condition);

      expect(analysis.isSatisfiable).toBe(true); // max is 10 + 5 = 15
      expect(analysis.possibleValues).toBeDefined();
    });
  });

  describe('Warnings', () => {
    it('should warn about beats with single incoming path', () => {
      const story = new Story({
        title: 'Single Path Test',
        author: 'Test',
        firstBeatId: 'start'
      });

      const start = createTestBeat({
        id: 'start',
        name: 'Start',
        type: 'titleScreen',
        parameters: { title: 'Start' },
        connections: [{ targetId: 'middle' }]
      });

      const middle = createTestBeat({
        id: 'middle',
        name: 'Middle',
        type: 'introText',
        parameters: { text: 'Middle' },
        connections: [{ targetId: 'end' }]
      });

      const end = createTestBeat({
        id: 'end',
        name: 'End',
        type: 'endScreen',
        parameters: { message: 'End' }
      });

      story.addBeat(start);
      story.addBeat(middle);
      story.addBeat(end);

      const analyzer = new ReachabilityAnalyzer(story);
      const result = analyzer.analyze();

      const middleWarning = result.warnings.find(w => w.beatId === 'middle');
      expect(middleWarning).toBeDefined();
      expect(middleWarning?.type).toBe('single-path');
    });

    it('should warn about conditional-only reachable beats', () => {
      const story = new Story({
        title: 'Conditional Only Test',
        author: 'Test',
        firstBeatId: 'start'
      });

      const start = createTestBeat({
        id: 'start',
        name: 'Start',
        type: 'titleScreen',
        parameters: { title: 'Start' },
        connections: [
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

      const conditional = createTestBeat({
        id: 'conditional',
        name: 'Conditional',
        type: 'endScreen',
        parameters: { message: 'Conditional End' }
      });

      // Make condition satisfiable
      const setter = createTestBeat({
        id: 'setter',
        name: 'Setter',
        type: 'setVariable',
        parameters: {
          type: 'counter',
          name: 'score',
          value: 20,
          operation: 'set'
        }
      });

      story.addBeat(start);
      story.addBeat(conditional);
      story.addBeat(setter);

      const analyzer = new ReachabilityAnalyzer(story);
      const result = analyzer.analyze();

      const conditionalWarning = result.warnings.find(w => w.beatId === 'conditional');
      expect(conditionalWarning).toBeDefined();
      expect(conditionalWarning?.type).toBe('conditional-only');
    });
  });

  describe('DefaultTarget', () => {
    it('should follow defaultTarget for reachability', () => {
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
        defaultTarget: 'end'
      });

      const end = createTestBeat({
        id: 'end',
        name: 'End',
        type: 'endScreen',
        parameters: { message: 'End' }
      });

      story.addBeat(start);
      story.addBeat(end);

      const analyzer = new ReachabilityAnalyzer(story);
      const result = analyzer.analyze();

      expect(result.reachableBeats.has('end')).toBe(true);
      expect(result.analysis.reachableCount).toBe(2);
    });
  });

  describe('Configuration Options', () => {
    it('should skip condition analysis when disabled', () => {
      const story = new Story({
        title: 'No Condition Analysis Test',
        author: 'Test',
        firstBeatId: 'start'
      });

      const start = createTestBeat({
        id: 'start',
        name: 'Start',
        type: 'titleScreen',
        parameters: { title: 'Start' },
        connections: [
          {
            targetId: 'conditional',
            condition: {
              type: 'counter',
              operator: '>=',
              left: 'score',
              right: 100
            }
          }
        ]
      });

      const conditional = createTestBeat({
        id: 'conditional',
        name: 'Conditional',
        type: 'endScreen',
        parameters: { message: 'Conditional' }
      });

      story.addBeat(start);
      story.addBeat(conditional);

      const analyzer = new ReachabilityAnalyzer(story, {
        analyzeConditions: false
      });
      const result = analyzer.analyze();

      // Should still mark beat as reachable even though condition is impossible
      expect(result.reachableBeats.has('conditional')).toBe(true);
    });

    it('should skip orphan detection when disabled', () => {
      const story = new Story({
        title: 'No Orphan Detection Test',
        author: 'Test',
        firstBeatId: 'start'
      });

      const start = createTestBeat({
        id: 'start',
        name: 'Start',
        type: 'titleScreen',
        parameters: { title: 'Start' }
      });

      const orphan = createTestBeat({
        id: 'orphan',
        name: 'Orphan',
        type: 'introText',
        parameters: { text: 'Orphan' }
      });

      story.addBeat(start);
      story.addBeat(orphan);

      const analyzer = new ReachabilityAnalyzer(story, {
        detectOrphans: false
      });
      const result = analyzer.analyze();

      expect(result.orphanedBeats.length).toBe(0);
    });
  });

  describe('Fix Suggestions', () => {
    it('should suggest fixes for unreachable beats', () => {
      const story = new Story({
        title: 'Fix Suggestions Test',
        author: 'Test',
        firstBeatId: 'start'
      });

      const start = createTestBeat({
        id: 'start',
        name: 'Start',
        type: 'titleScreen',
        parameters: { title: 'Start' }
      });

      const orphan = createTestBeat({
        id: 'orphan',
        name: 'Orphan',
        type: 'introText',
        parameters: { text: 'Orphan' }
      });

      story.addBeat(start);
      story.addBeat(orphan);

      const analyzer = new ReachabilityAnalyzer(story, {
        suggestFixes: true
      });
      const result = analyzer.analyze();

      const unreachable = result.unreachableBeats.find(b => b.beatId === 'orphan');
      expect(unreachable?.suggestedFixes).toBeDefined();
      expect(unreachable?.suggestedFixes?.length).toBeGreaterThan(0);
    });

    it('should suggest counter modifications for impossible conditions', () => {
      const story = new Story({
        title: 'Counter Fix Test',
        author: 'Test',
        firstBeatId: 'start'
      });

      const start = createTestBeat({
        id: 'start',
        name: 'Start',
        type: 'titleScreen',
        parameters: { title: 'Start' },
        connections: [
          {
            targetId: 'impossible',
            condition: {
              type: 'counter',
              operator: '>=',
              left: 'score',
              right: 100
            }
          }
        ]
      });

      const impossible = createTestBeat({
        id: 'impossible',
        name: 'Impossible',
        type: 'endScreen',
        parameters: { message: 'Impossible' }
      });

      const setter = createTestBeat({
        id: 'setter',
        name: 'Setter',
        type: 'setVariable',
        parameters: {
          type: 'counter',
          name: 'score',
          value: 50,
          operation: 'set'
        }
      });

      story.addBeat(start);
      story.addBeat(impossible);
      story.addBeat(setter);

      const analyzer = new ReachabilityAnalyzer(story, {
        suggestFixes: true
      });
      const result = analyzer.analyze();

      const unreachable = result.unreachableBeats.find(b => b.beatId === 'impossible');
      expect(unreachable?.suggestedFixes).toBeDefined();
      expect(unreachable?.suggestedFixes?.some(fix => fix.includes('score'))).toBe(true);
    });
  });

  describe('Empty Story', () => {
    it('should handle empty story gracefully', () => {
      const story = new Story({
        title: 'Empty Test',
        author: 'Test',
        firstBeatId: 'nonexistent'
      });

      const analyzer = new ReachabilityAnalyzer(story);
      const result = analyzer.analyze();

      expect(result.analysis.totalBeats).toBe(0);
      expect(result.analysis.reachableCount).toBe(0);
      expect(result.analysis.unreachableCount).toBe(0);
      expect(result.unreachableBeats.length).toBe(0);
    });
  });
});
