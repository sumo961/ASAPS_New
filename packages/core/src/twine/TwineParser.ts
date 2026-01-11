/**
 * TwineParser - Parses Twine 2 HTML export files
 *
 * Extracts story metadata and passages from tw-storydata and tw-passagedata elements.
 * Supports SugarCube format primarily.
 */

export interface TwineStory {
  name: string;
  ifid: string;
  startNode: string;
  format: string;
  formatVersion: string;
  creator?: string;
  creatorVersion?: string;
  passages: TwinePassage[];
  styles?: string;
  scripts?: string;
  tags: string[];
}

export interface TwinePassage {
  pid: string;
  name: string;
  tags: string[];
  content: string;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
}

/**
 * Special passage names in SugarCube that have specific meanings
 */
export const SPECIAL_PASSAGES = {
  STORY_TITLE: 'StoryTitle',
  STORY_SUBTITLE: 'StorySubtitle',
  STORY_AUTHOR: 'StoryAuthor',
  STORY_BANNER: 'StoryBanner',
  STORY_INIT: 'StoryInit',
  STORY_MENU: 'StoryMenu',
  STORY_CAPTION: 'StoryCaption',
  PASSAGE_HEADER: 'PassageHeader',
  PASSAGE_FOOTER: 'PassageFooter',
  PASSAGE_DONE: 'PassageDone',
  PASSAGE_READY: 'PassageReady',
} as const;

export class TwineParser {
  /**
   * Parse a Twine 2 HTML file into a TwineStory object
   */
  static parse(html: string): TwineStory {
    // Create a DOM parser
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Find tw-storydata element
    const storyData = doc.querySelector('tw-storydata');
    if (!storyData) {
      throw new Error('Invalid Twine file: No tw-storydata element found');
    }

    // Extract story metadata
    const name = storyData.getAttribute('name') || 'Untitled';
    const ifid = storyData.getAttribute('ifid') || '';
    const startNode = storyData.getAttribute('startnode') || '1';
    const format = storyData.getAttribute('format') || 'Unknown';
    const formatVersion = storyData.getAttribute('format-version') || '';
    const creator = storyData.getAttribute('creator') || undefined;
    const creatorVersion = storyData.getAttribute('creator-version') || undefined;
    const tags = (storyData.getAttribute('tags') || '').split(' ').filter(t => t);

    // Extract styles
    const styleElement = doc.querySelector('style[type="text/twine-css"]');
    const styles = styleElement?.textContent || undefined;

    // Extract scripts
    const scriptElement = doc.querySelector('script[type="text/twine-javascript"]');
    const scripts = scriptElement?.textContent || undefined;

    // Parse all passages
    const passageElements = doc.querySelectorAll('tw-passagedata');
    const passages: TwinePassage[] = [];

    passageElements.forEach((passageEl) => {
      const passage = this.parsePassage(passageEl);
      passages.push(passage);
    });

    return {
      name,
      ifid,
      startNode,
      format,
      formatVersion,
      creator,
      creatorVersion,
      passages,
      styles,
      scripts,
      tags,
    };
  }

  /**
   * Parse a single tw-passagedata element
   */
  private static parsePassage(element: Element): TwinePassage {
    const pid = element.getAttribute('pid') || '';
    const name = element.getAttribute('name') || '';
    const tagsStr = element.getAttribute('tags') || '';
    const tags = tagsStr.split(' ').filter(t => t);

    // Parse position (format: "x,y")
    const positionStr = element.getAttribute('position');
    let position: { x: number; y: number } | undefined;
    if (positionStr) {
      const [x, y] = positionStr.split(',').map(Number);
      if (!isNaN(x) && !isNaN(y)) {
        position = { x, y };
      }
    }

    // Parse size (format: "width,height")
    const sizeStr = element.getAttribute('size');
    let size: { width: number; height: number } | undefined;
    if (sizeStr) {
      const [width, height] = sizeStr.split(',').map(Number);
      if (!isNaN(width) && !isNaN(height)) {
        size = { width, height };
      }
    }

    // Get content and decode HTML entities
    const content = this.decodeHtmlEntities(element.textContent || '');

    return {
      pid,
      name,
      tags,
      content,
      position,
      size,
    };
  }

  /**
   * Decode HTML entities in passage content
   */
  private static decodeHtmlEntities(text: string): string {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
  }

  /**
   * Get a passage by name
   */
  static getPassageByName(story: TwineStory, name: string): TwinePassage | undefined {
    return story.passages.find(p => p.name === name);
  }

  /**
   * Get a passage by PID
   */
  static getPassageByPid(story: TwineStory, pid: string): TwinePassage | undefined {
    return story.passages.find(p => p.pid === pid);
  }

  /**
   * Get the start passage
   */
  static getStartPassage(story: TwineStory): TwinePassage | undefined {
    return this.getPassageByPid(story, story.startNode);
  }

  /**
   * Get special passages (StoryInit, StoryTitle, etc.)
   */
  static getSpecialPassages(story: TwineStory): Map<string, TwinePassage> {
    const special = new Map<string, TwinePassage>();
    const specialNames = Object.values(SPECIAL_PASSAGES);

    for (const passage of story.passages) {
      if (specialNames.includes(passage.name as any)) {
        special.set(passage.name, passage);
      }
    }

    return special;
  }

  /**
   * Get regular (non-special) passages
   */
  static getRegularPassages(story: TwineStory): TwinePassage[] {
    const specialNames = Object.values(SPECIAL_PASSAGES);
    return story.passages.filter(p => !specialNames.includes(p.name as any));
  }

  /**
   * Check if the story uses SugarCube format
   */
  static isSugarCube(story: TwineStory): boolean {
    return story.format.toLowerCase().includes('sugarcube');
  }

  /**
   * Check if the story uses Harlowe format
   */
  static isHarlowe(story: TwineStory): boolean {
    return story.format.toLowerCase().includes('harlowe');
  }

  /**
   * Build a map of passage names to passages for quick lookup
   */
  static buildPassageMap(story: TwineStory): Map<string, TwinePassage> {
    const map = new Map<string, TwinePassage>();
    for (const passage of story.passages) {
      map.set(passage.name, passage);
    }
    return map;
  }

  /**
   * Extract story title from StoryTitle passage or story name attribute
   */
  static getStoryTitle(story: TwineStory): string {
    const titlePassage = this.getPassageByName(story, SPECIAL_PASSAGES.STORY_TITLE);
    if (titlePassage) {
      // Strip any markup from the title
      return titlePassage.content.replace(/<<[^>]+>>/g, '').trim();
    }
    return story.name;
  }

  /**
   * Extract story author from StoryAuthor passage
   */
  static getStoryAuthor(story: TwineStory): string | undefined {
    const authorPassage = this.getPassageByName(story, SPECIAL_PASSAGES.STORY_AUTHOR);
    if (authorPassage) {
      return authorPassage.content.replace(/<<[^>]+>>/g, '').trim();
    }
    return undefined;
  }

  /**
   * Validate Twine HTML structure
   */
  static validate(html: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      // Check for tw-storydata
      const storyData = doc.querySelector('tw-storydata');
      if (!storyData) {
        errors.push('Missing tw-storydata element');
        return { valid: false, errors };
      }

      // Check required attributes
      if (!storyData.getAttribute('name')) {
        errors.push('Missing story name attribute');
      }

      // Check for passages
      const passages = doc.querySelectorAll('tw-passagedata');
      if (passages.length === 0) {
        errors.push('No passages found');
      }

      // Check startnode references valid passage
      const startNode = storyData.getAttribute('startnode');
      if (startNode) {
        const startExists = Array.from(passages).some(
          p => p.getAttribute('pid') === startNode
        );
        if (!startExists) {
          errors.push(`Start node (pid=${startNode}) not found`);
        }
      }

      return { valid: errors.length === 0, errors };
    } catch (e) {
      errors.push(`Parse error: ${e instanceof Error ? e.message : String(e)}`);
      return { valid: false, errors };
    }
  }
}
