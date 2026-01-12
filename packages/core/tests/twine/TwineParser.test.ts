/**
 * Tests for TwineParser - HTML parsing of Twine 2 export files
 */

import { describe, it, expect } from 'vitest';
import { TwineParser, SPECIAL_PASSAGES } from '../../src/twine/TwineParser';

const basicTwineHtml = `<!DOCTYPE html>
<html>
<head><title>Test Story</title></head>
<body>
<tw-storydata name="My Test Story" startnode="1" creator="Twine" creator-version="2.9.2" format="SugarCube" format-version="2.36.1" ifid="test-uuid-1234">
<style type="text/twine-css">.test { color: red; }</style>
<script type="text/twine-javascript">console.log('test');</script>
<tw-passagedata pid="1" name="Start" tags="intro" position="100,200">Welcome to the story!

[[Continue|Chapter1]]</tw-passagedata>
<tw-passagedata pid="2" name="Chapter1" tags="" position="300,200" size="100,50">This is chapter 1.

[[Go to ending|Ending]]
[[Go back|Start]]</tw-passagedata>
<tw-passagedata pid="3" name="Ending" tags="ending" position="500,200">The End</tw-passagedata>
</tw-storydata>
</body>
</html>`;

const storyWithSpecialPassages = `<!DOCTYPE html>
<html>
<body>
<tw-storydata name="Special Story" startnode="1" format="SugarCube" format-version="2.36.1" ifid="test-special">
<tw-passagedata pid="1" name="Start" tags="" position="100,100">Starting passage</tw-passagedata>
<tw-passagedata pid="2" name="StoryTitle" tags="" position="0,0">My Amazing Story</tw-passagedata>
<tw-passagedata pid="3" name="StoryAuthor" tags="" position="0,50">John Doe</tw-passagedata>
<tw-passagedata pid="4" name="StoryInit" tags="" position="0,100"><<set $health to 100>>
<<set $gold to 0>></tw-passagedata>
</tw-storydata>
</body>
</html>`;

const harloweStoryHtml = `<!DOCTYPE html>
<html>
<body>
<tw-storydata name="Harlowe Story" startnode="1" format="Harlowe" format-version="3.3.9" ifid="harlowe-test">
<tw-passagedata pid="1" name="Start" tags="" position="100,100">Welcome!

[[Continue]]</tw-passagedata>
</tw-storydata>
</body>
</html>`;

describe('TwineParser', () => {
  describe('parse', () => {
    it('should parse basic story metadata', () => {
      const story = TwineParser.parse(basicTwineHtml);

      expect(story.name).toBe('My Test Story');
      expect(story.ifid).toBe('test-uuid-1234');
      expect(story.startNode).toBe('1');
      expect(story.format).toBe('SugarCube');
      expect(story.formatVersion).toBe('2.36.1');
      expect(story.creator).toBe('Twine');
      expect(story.creatorVersion).toBe('2.9.2');
    });

    it('should parse all passages', () => {
      const story = TwineParser.parse(basicTwineHtml);

      expect(story.passages).toHaveLength(3);
      expect(story.passages.map(p => p.name)).toEqual(['Start', 'Chapter1', 'Ending']);
    });

    it('should parse passage metadata correctly', () => {
      const story = TwineParser.parse(basicTwineHtml);

      const startPassage = story.passages.find(p => p.name === 'Start');
      expect(startPassage).toBeDefined();
      expect(startPassage!.pid).toBe('1');
      expect(startPassage!.tags).toEqual(['intro']);
      expect(startPassage!.position).toEqual({ x: 100, y: 200 });
    });

    it('should parse passage size when provided', () => {
      const story = TwineParser.parse(basicTwineHtml);

      const chapter1 = story.passages.find(p => p.name === 'Chapter1');
      expect(chapter1).toBeDefined();
      expect(chapter1!.size).toEqual({ width: 100, height: 50 });
    });

    it('should extract styles', () => {
      const story = TwineParser.parse(basicTwineHtml);

      expect(story.styles).toBe('.test { color: red; }');
    });

    it('should extract scripts', () => {
      const story = TwineParser.parse(basicTwineHtml);

      expect(story.scripts).toBe("console.log('test');");
    });

    it('should decode HTML entities in content', () => {
      const htmlWithEntities = `<tw-storydata name="Test" startnode="1" format="SugarCube" format-version="2.0" ifid="test">
<tw-passagedata pid="1" name="Test" tags="">He said &quot;hello&quot; &amp; &lt;goodbye&gt;</tw-passagedata>
</tw-storydata>`;

      const story = TwineParser.parse(htmlWithEntities);
      expect(story.passages[0].content).toBe('He said "hello" & <goodbye>');
    });

    it('should throw error for invalid HTML without tw-storydata', () => {
      const invalidHtml = '<html><body>No story data here</body></html>';

      expect(() => TwineParser.parse(invalidHtml)).toThrow('Invalid Twine file');
    });
  });

  describe('format detection', () => {
    it('should detect SugarCube format', () => {
      const story = TwineParser.parse(basicTwineHtml);

      expect(TwineParser.isSugarCube(story)).toBe(true);
      expect(TwineParser.isHarlowe(story)).toBe(false);
    });

    it('should detect Harlowe format', () => {
      const story = TwineParser.parse(harloweStoryHtml);

      expect(TwineParser.isHarlowe(story)).toBe(true);
      expect(TwineParser.isSugarCube(story)).toBe(false);
    });
  });

  describe('passage retrieval', () => {
    it('should get passage by name', () => {
      const story = TwineParser.parse(basicTwineHtml);

      const passage = TwineParser.getPassageByName(story, 'Chapter1');
      expect(passage).toBeDefined();
      expect(passage!.name).toBe('Chapter1');
    });

    it('should get passage by PID', () => {
      const story = TwineParser.parse(basicTwineHtml);

      const passage = TwineParser.getPassageByPid(story, '2');
      expect(passage).toBeDefined();
      expect(passage!.name).toBe('Chapter1');
    });

    it('should get start passage', () => {
      const story = TwineParser.parse(basicTwineHtml);

      const startPassage = TwineParser.getStartPassage(story);
      expect(startPassage).toBeDefined();
      expect(startPassage!.name).toBe('Start');
    });

    it('should return undefined for non-existent passage', () => {
      const story = TwineParser.parse(basicTwineHtml);

      expect(TwineParser.getPassageByName(story, 'NonExistent')).toBeUndefined();
      expect(TwineParser.getPassageByPid(story, '999')).toBeUndefined();
    });
  });

  describe('special passages', () => {
    it('should get special passages map', () => {
      const story = TwineParser.parse(storyWithSpecialPassages);

      const special = TwineParser.getSpecialPassages(story);
      expect(special.size).toBe(3);
      expect(special.has('StoryTitle')).toBe(true);
      expect(special.has('StoryAuthor')).toBe(true);
      expect(special.has('StoryInit')).toBe(true);
    });

    it('should get regular (non-special) passages', () => {
      const story = TwineParser.parse(storyWithSpecialPassages);

      const regular = TwineParser.getRegularPassages(story);
      expect(regular).toHaveLength(1);
      expect(regular[0].name).toBe('Start');
    });

    it('should extract story title from StoryTitle passage', () => {
      const story = TwineParser.parse(storyWithSpecialPassages);

      const title = TwineParser.getStoryTitle(story);
      expect(title).toBe('My Amazing Story');
    });

    it('should fall back to story name when no StoryTitle passage', () => {
      const story = TwineParser.parse(basicTwineHtml);

      const title = TwineParser.getStoryTitle(story);
      expect(title).toBe('My Test Story');
    });

    it('should extract story author from StoryAuthor passage', () => {
      const story = TwineParser.parse(storyWithSpecialPassages);

      const author = TwineParser.getStoryAuthor(story);
      expect(author).toBe('John Doe');
    });
  });

  describe('utility methods', () => {
    it('should build passage map', () => {
      const story = TwineParser.parse(basicTwineHtml);

      const map = TwineParser.buildPassageMap(story);
      expect(map.size).toBe(3);
      expect(map.get('Start')).toBeDefined();
      expect(map.get('Chapter1')).toBeDefined();
      expect(map.get('Ending')).toBeDefined();
    });
  });

  describe('validation', () => {
    it('should validate correct Twine HTML', () => {
      const result = TwineParser.validate(basicTwineHtml);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing tw-storydata', () => {
      const invalidHtml = '<html><body>No story</body></html>';

      const result = TwineParser.validate(invalidHtml);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing tw-storydata element');
    });

    it('should detect missing passages', () => {
      const noPassages = `<tw-storydata name="Empty" startnode="1" format="SugarCube" format-version="2.0" ifid="test"></tw-storydata>`;

      const result = TwineParser.validate(noPassages);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('No passages found');
    });

    it('should detect invalid start node', () => {
      const invalidStart = `<tw-storydata name="Test" startnode="99" format="SugarCube" format-version="2.0" ifid="test">
<tw-passagedata pid="1" name="Start" tags="">Content</tw-passagedata>
</tw-storydata>`;

      const result = TwineParser.validate(invalidStart);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Start node'))).toBe(true);
    });
  });

  describe('SPECIAL_PASSAGES constant', () => {
    it('should export all special passage names', () => {
      expect(SPECIAL_PASSAGES.STORY_TITLE).toBe('StoryTitle');
      expect(SPECIAL_PASSAGES.STORY_AUTHOR).toBe('StoryAuthor');
      expect(SPECIAL_PASSAGES.STORY_INIT).toBe('StoryInit');
      expect(SPECIAL_PASSAGES.PASSAGE_HEADER).toBe('PassageHeader');
      expect(SPECIAL_PASSAGES.PASSAGE_FOOTER).toBe('PassageFooter');
    });
  });
});
