/**
 * Tests for PassageAnalyzer - Twine passage analysis and beat type classification
 */

import { describe, it, expect } from 'vitest';
import { PassageAnalyzer } from '../../src/twine/PassageAnalyzer';
import type { TwinePassage } from '../../src/twine/TwineParser';

const createPassage = (name: string, content: string, tags: string[] = []): TwinePassage => ({
  pid: '1',
  name,
  tags,
  content,
  position: { x: 0, y: 0 },
});

describe('PassageAnalyzer', () => {
  describe('analyzePassage', () => {
    describe('beat type classification', () => {
      it('should classify terminal passage without links as introText', () => {
        const passage = createPassage('Test', 'Just some text with no links.');
        const result = PassageAnalyzer.analyzePassage(passage);

        expect(result.suggestedBeatType).toBe('introText');
        expect(result.linkPosition).toBe('none');
      });

      it('should classify passage with single link as introText', () => {
        const passage = createPassage('Test', 'Some text.\n\n[[Continue]]');
        const result = PassageAnalyzer.analyzePassage(passage);

        expect(result.suggestedBeatType).toBe('introText');
      });

      it('should classify passage with multiple end links as dialogTree', () => {
        const passage = createPassage('Test', 'What do you do?\n\n[[Go left]]\n[[Go right]]');
        const result = PassageAnalyzer.analyzePassage(passage);

        expect(result.suggestedBeatType).toBe('dialogTree');
        expect(result.choices).toHaveLength(2);
      });

      it('should classify passage tagged "ending" as endScreen', () => {
        const passage = createPassage('The End', 'You have completed the story!', ['ending']);
        const result = PassageAnalyzer.analyzePassage(passage);

        expect(result.suggestedBeatType).toBe('endScreen');
      });

      it('should classify passage with name containing "end" as endScreen', () => {
        const passage = createPassage('Story End', 'Fin.', []);
        const result = PassageAnalyzer.analyzePassage(passage);

        expect(result.suggestedBeatType).toBe('endScreen');
      });

      it('should classify set-only passage as setVariable', () => {
        const passage = createPassage('Init', '<<set $gold = 100>>[[Continue|Start]]');
        const result = PassageAnalyzer.analyzePassage(passage);

        expect(result.suggestedBeatType).toBe('setVariable');
        expect(result.isSetVariablePassage).toBe(true);
      });

      it('should classify inline links as hyperText', () => {
        const passage = createPassage(
          'Test',
          'You can [[open the door]] and walk through, or [[look around]] the room before making a decision.'
        );
        const result = PassageAnalyzer.analyzePassage(passage);

        expect(result.suggestedBeatType).toBe('hyperText');
        expect(result.linkPosition).toBe('inline');
      });

      it('should classify conditional branching as conditionBeat', () => {
        const passage = createPassage(
          'Test',
          '<<if $hasKey>>[[Enter|Room]]<<else>>[[Find key|Garden]]<<endif>>'
        );
        const result = PassageAnalyzer.analyzePassage(passage);

        expect(result.suggestedBeatType).toBe('conditionBeat');
        expect(result.hasConditionalBranching).toBe(true);
      });
    });

    describe('link position detection', () => {
      it('should detect no links', () => {
        const passage = createPassage('Test', 'No links here');
        const result = PassageAnalyzer.analyzePassage(passage);

        expect(result.linkPosition).toBe('none');
      });

      it('should detect links at end of passage', () => {
        const passage = createPassage('Test', 'Some narrative text.\n\n[[Option 1]]\n[[Option 2]]');
        const result = PassageAnalyzer.analyzePassage(passage);

        expect(result.linkPosition).toBe('end');
      });

      it('should detect inline links', () => {
        // For truly inline links, they need substantial text after them
        const passage = createPassage(
          'Test',
          'You see a [[mysterious door]] in the wall and decide to explore further. The path leads deeper into the darkness.'
        );
        const result = PassageAnalyzer.analyzePassage(passage);

        expect(result.linkPosition).toBe('inline');
      });

      it('should detect mixed links', () => {
        const passage = createPassage(
          'Test',
          'You see a [[door]] in the wall.\n\n[[Go back]]\n[[Leave]]'
        );
        const result = PassageAnalyzer.analyzePassage(passage);

        expect(result.linkPosition).toBe('mixed');
      });
    });

    describe('conditional branching', () => {
      it('should detect branching links in conditionals', () => {
        const passage = createPassage(
          'Test',
          '<<if $hasKey>>[[Unlock door|Room]]<<else>>[[Try to break in|Fail]]<<endif>>'
        );
        const result = PassageAnalyzer.analyzePassage(passage);

        expect(result.hasConditionalBranching).toBe(true);
        expect(result.additionalBeats.some(b => b.type === 'conditionBeat')).toBe(true);
      });

      it('should not mark simple conditional text as branching', () => {
        const passage = createPassage(
          'Test',
          '<<if $hasKey>>You have the key.<<else>>You need a key.<<endif>>\n\n[[Continue]]'
        );
        const result = PassageAnalyzer.analyzePassage(passage);

        expect(result.hasConditionalBranching).toBe(false);
      });
    });

    describe('set variable handling', () => {
      it('should create additional SetVariable beats when needed', () => {
        const passage = createPassage(
          'Test',
          '<<set $gold = 100>>You found some gold!\n\n[[Continue]]'
        );
        const result = PassageAnalyzer.analyzePassage(passage);

        // This passage has both text and set operation, so it should create additional beat
        expect(result.suggestedBeatType).toBe('introText');
        expect(result.additionalBeats.some(b => b.type === 'setVariable')).toBe(true);
      });
    });

    describe('choices extraction', () => {
      it('should extract choices from dialogTree passages', () => {
        const passage = createPassage(
          'Test',
          'What do you choose?\n\n[[Left path|LeftRoom]]\n[[Right path|RightRoom]]'
        );
        const result = PassageAnalyzer.analyzePassage(passage);

        expect(result.choices).toHaveLength(2);
        expect(result.choices[0].text).toBe('Left path');
        expect(result.choices[0].target).toBe('LeftRoom');
      });

      it('should exclude conditional links from main choices', () => {
        const passage = createPassage(
          'Test',
          '<<if $hasKey>>[[Enter|Room]]<<else>>[[Leave|Exit]]<<endif>>'
        );
        const result = PassageAnalyzer.analyzePassage(passage);

        // Conditional links should be in additionalBeats, not main choices
        expect(result.choices).toHaveLength(0);
      });
    });

    describe('display text', () => {
      it('should provide cleaned display text', () => {
        const passage = createPassage(
          'Test',
          '<<set $gold = 100>>You have $gold coins.\n\n[[Continue]]'
        );
        const result = PassageAnalyzer.analyzePassage(passage);

        expect(result.displayText).not.toContain('<<set');
        expect(result.displayText).toContain('$gold$');
        expect(result.displayText).not.toContain('[[');
      });
    });

    describe('Harlowe format', () => {
      it('should analyze Harlowe passages correctly', () => {
        const passage = createPassage(
          'Test',
          '(set: $gold to 100)You have some gold.\n\n[[Continue->Next]]'
        );
        const result = PassageAnalyzer.analyzePassage(passage, 'harlowe');

        expect(result.parsed.setOperations).toHaveLength(1);
        expect(result.parsed.setOperations[0].variable).toBe('gold');
      });

      it('should handle Harlowe conditionals', () => {
        const passage = createPassage(
          'Test',
          '(if: $hasKey)[[[Enter->Room]]]'
        );
        const result = PassageAnalyzer.analyzePassage(passage, 'harlowe');

        expect(result.hasConditionalBranching).toBe(true);
      });
    });
  });

  describe('analyzeAll', () => {
    it('should analyze multiple passages', () => {
      const passages = [
        createPassage('Start', 'Welcome!\n\n[[Begin]]'),
        createPassage('Choice', 'What do you do?\n\n[[Go left]]\n[[Go right]]'),
        createPassage('End', 'The End', ['ending']),
      ];

      const result = PassageAnalyzer.analyzeAll(passages);

      expect(result.passages).toHaveLength(3);
      expect(result.stats.total).toBe(3);
      expect(result.stats.byType.introText).toBe(1);
      expect(result.stats.byType.dialogTree).toBe(1);
      expect(result.stats.byType.endScreen).toBe(1);
    });

    it('should collect warnings from all passages', () => {
      const passages = [
        createPassage('Test1', '<<audio "bgm" play>>Some text [[Continue]]'),
        createPassage('Test2', '<<customMacro>>More text [[Continue]]'),
      ];

      const result = PassageAnalyzer.analyzeAll(passages);

      expect(result.stats.withWarnings).toBe(2);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should track conditional passages', () => {
      const passages = [
        createPassage('Test1', '<<if $hasKey>>[[Enter|Room]]<<else>>[[Leave|Exit]]<<endif>>'),
        createPassage('Test2', 'Normal passage [[Continue]]'),
      ];

      const result = PassageAnalyzer.analyzeAll(passages);

      expect(result.stats.withConditionals).toBe(1);
    });
  });

  describe('getSummary', () => {
    it('should generate human-readable summary', () => {
      const passages = [
        createPassage('Start', 'Welcome!\n\n[[Begin]]'),
        createPassage('End', 'The End', ['ending']),
      ];

      const result = PassageAnalyzer.analyzeAll(passages);
      const summary = PassageAnalyzer.getSummary(result);

      expect(summary).toContain('Total passages: 2');
      expect(summary).toContain('IntroText:');
      expect(summary).toContain('EndScreen:');
    });

    it('should include warnings in summary', () => {
      const passages = [
        createPassage('Test', '<<unknownMacro>>[[Continue]]'),
      ];

      const result = PassageAnalyzer.analyzeAll(passages);
      const summary = PassageAnalyzer.getSummary(result);

      expect(summary).toContain('Warnings:');
    });
  });
});
