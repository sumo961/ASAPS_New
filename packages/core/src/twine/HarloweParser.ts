/**
 * HarloweParser - Parses Harlowe-specific syntax in passage content
 *
 * Harlowe is Twine 2's default format with syntax like:
 * - (set: $var to value) - Variable assignment
 * - (if: condition)[content] - Conditionals
 * - [[text]] or [[text->target]] - Links
 * - (text-colour: color)[text] - Styling macros
 */

import type { ParsedContent, ExtractedLink, SetOperation, Conditional } from './SugarCubeParser';

// Re-export types for convenience
export type { ParsedContent, ExtractedLink, SetOperation, Conditional };

// Regex patterns for Harlowe syntax
const PATTERNS = {
  // Links: [[text]] or [[text->target]] or [[target<-text]] or [[text|target]]
  // Note: [^\[\]|] excludes [ and ] and | from link text to handle nested brackets like [[[link]]]
  LINK: /\[\[([^\[\]|]+?)->([^\[\]]+?)\]\]|\[\[([^\[\]|]+?)<-([^\[\]]+?)\]\]|\[\[([^\[\]|]+?)\|([^\[\]]+?)\]\]|\[\[([^\[\]|]+?)\]\]/g,

  // Variables: $varName
  VARIABLE: /\$([a-zA-Z_]\w*)/g,

  // Set macro: (set: $var to value)
  SET: /\(set:\s*\$([a-zA-Z_]\w*)\s+to\s+(.+?)\)/gi,

  // If conditional: (if: condition)[content]
  // Captures the condition and the hook content (allowing nested [[links]])
  IF: /\(if:\s*(.+?)\)\s*\[((?:[^\[\]]|\[\[[^\]]*\]\])*)\]/gi,

  // Unless conditional: (unless: condition)[content]
  UNLESS: /\(unless:\s*(.+?)\)\s*\[((?:[^\[\]]|\[\[[^\]]*\]\])*)\]/gi,

  // Else-if conditional: (else-if: condition)[content]
  ELSE_IF: /\(else-if:\s*(.+?)\)\s*\[((?:[^\[\]]|\[\[[^\]]*\]\])*)\]/gi,

  // Else: (else:)[content]
  ELSE: /\(else:\)\s*\[((?:[^\[\]]|\[\[[^\]]*\]\])*)\]/gi,

  // Styling macros to strip: (text-colour: x)[y], (color: x)[y], (text-style: x)[y], etc.
  STYLE_MACRO: /\((?:text-colour|text-color|color|colour|text-style|font|text-size|background|text-rotate|text-indent)\s*:\s*[^)]+\)\s*\[([^\]]*)\]/gi,

  // Print/display variable: (print: $var) or (display: $var)
  PRINT: /\((?:print|display):\s*(.+?)\)/gi,

  // Goto: (goto: "passage")
  GOTO: /\(go-to:\s*["']?([^"')]+)["']?\)/gi,

  // Link macro: (link: "text")[content] or (link-goto: "text", "passage")
  LINK_MACRO: /\(link:\s*["']([^"']+)["']\)\s*\[([^\]]*)\]/gi,
  LINK_GOTO: /\(link-goto:\s*["']([^"']+)["'](?:\s*,\s*["']([^"']+)["'])?\)/gi,

  // Generic macro (for detecting unsupported ones)
  ANY_MACRO: /\(([a-zA-Z_-]+):\s*[^)]*\)/g,
};

// Macros that are known but may not be fully supported
const KNOWN_MACROS = new Set([
  'set', 'put', 'move',
  'if', 'else', 'else-if', 'unless',
  'print', 'display',
  'link', 'link-goto', 'link-reveal', 'link-repeat', 'link-undo',
  'go-to', 'undo',
  'text-colour', 'text-color', 'color', 'colour',
  'text-style', 'font', 'text-size', 'text-rotate', 'text-indent',
  'background', 'box', 'float-box',
  'live', 'stop', 'event',
  'a', 'the', 'num', 'str',
  'alert', 'prompt', 'confirm',
  'for', 'each',
  'hidden', 'show', 'hide', 'replace', 'append', 'prepend',
  'transition', 'transition-time', 'transition-delay',
  'click', 'mouseover', 'mouseout',
  'audio', 'css',
]);

export class HarloweParser {
  /**
   * Parse Harlowe content from a passage
   */
  static parse(content: string): ParsedContent {
    const result: ParsedContent = {
      text: content,
      links: [],
      variables: [],
      setOperations: [],
      conditionals: [],
      unsupportedMacros: [],
      warnings: [],
    };

    // Process in order
    this.extractSetOperations(content, result);
    this.extractConditionals(content, result);
    this.extractLinks(content, result);
    this.extractVariables(content, result);

    // Process macros and clean text
    result.text = this.processAndCleanText(content, result);

    // Find unsupported macros
    this.findUnsupportedMacros(content, result);

    return result;
  }

  /**
   * Extract (set: $var to value) operations
   */
  private static extractSetOperations(content: string, result: ParsedContent): void {
    PATTERNS.SET.lastIndex = 0;

    let match;
    while ((match = PATTERNS.SET.exec(content)) !== null) {
      const [raw, variable, value] = match;
      result.setOperations.push({
        variable,
        value: value.trim(),
        raw,
        startIndex: match.index,
        endIndex: match.index + raw.length,
      });
    }
  }

  /**
   * Extract (if: condition)[content] conditionals
   */
  private static extractConditionals(content: string, result: ParsedContent): void {
    PATTERNS.IF.lastIndex = 0;

    let match;
    while ((match = PATTERNS.IF.exec(content)) !== null) {
      const [raw, condition, thenContent] = match;

      // Extract links from the conditional content
      const thenLinks = this.extractLinksFromText(thenContent || '');

      result.conditionals.push({
        condition: condition.trim(),
        thenContent: (thenContent || '').trim(),
        elseContent: undefined, // Harlowe else is separate
        raw,
        startIndex: match.index,
        endIndex: match.index + raw.length,
        hasBranchingLinks: thenLinks.length > 0,
        thenLinks,
        elseLinks: [],
      });
    }

    // Also extract (unless:) which is negated if
    PATTERNS.UNLESS.lastIndex = 0;
    while ((match = PATTERNS.UNLESS.exec(content)) !== null) {
      const [raw, condition, thenContent] = match;
      const thenLinks = this.extractLinksFromText(thenContent || '');

      result.conditionals.push({
        condition: `not (${condition.trim()})`,
        thenContent: (thenContent || '').trim(),
        elseContent: undefined,
        raw,
        startIndex: match.index,
        endIndex: match.index + raw.length,
        hasBranchingLinks: thenLinks.length > 0,
        thenLinks,
        elseLinks: [],
      });
    }

    // Extract (else-if:) conditionals
    PATTERNS.ELSE_IF.lastIndex = 0;
    let elseIfMatch: RegExpExecArray | null;
    while ((elseIfMatch = PATTERNS.ELSE_IF.exec(content)) !== null) {
      const [raw, condition, thenContent] = elseIfMatch;
      const matchIndex = elseIfMatch.index;
      const thenLinks = this.extractLinksFromText(thenContent || '');

      // Find the preceding (if:) or (else-if:) to link them
      const precedingConditional = result.conditionals.find(c => {
        // Check if this else-if immediately follows another conditional
        // Allow for whitespace between them
        const gapContent = content.slice(c.endIndex, matchIndex).trim();
        return gapContent.length === 0;
      });

      if (precedingConditional && thenLinks.length > 0) {
        // Link the else-if's links as the "else" branch of the preceding conditional
        precedingConditional.elseLinks = thenLinks;
        precedingConditional.elseContent = (thenContent || '').trim();
      }

      result.conditionals.push({
        condition: condition.trim(),
        thenContent: (thenContent || '').trim(),
        elseContent: undefined,
        raw,
        startIndex: matchIndex,
        endIndex: matchIndex + raw.length,
        hasBranchingLinks: thenLinks.length > 0,
        thenLinks,
        elseLinks: [],
        isElseIf: true, // Mark as else-if for special handling
      });
    }

    // Extract (else:) blocks and link to preceding conditional
    PATTERNS.ELSE.lastIndex = 0;
    let elseMatch: RegExpExecArray | null;
    while ((elseMatch = PATTERNS.ELSE.exec(content)) !== null) {
      const [raw, elseContent] = elseMatch;
      const matchIndex = elseMatch.index;
      const elseLinks = this.extractLinksFromText(elseContent || '');

      // Find the preceding conditional
      const precedingConditional = result.conditionals.find(c => {
        const gapContent = content.slice(c.endIndex, matchIndex).trim();
        return gapContent.length === 0;
      });

      if (precedingConditional) {
        precedingConditional.elseLinks = elseLinks;
        precedingConditional.elseContent = (elseContent || '').trim();
        // Extend endIndex to include the else block so links inside are detected
        precedingConditional.endIndex = matchIndex + raw.length;
        if (elseLinks.length > 0) {
          precedingConditional.hasBranchingLinks = true;
        }
      }
    }
  }

  /**
   * Extract all links from content
   */
  private static extractLinks(content: string, result: ParsedContent): void {
    PATTERNS.LINK.lastIndex = 0;

    let match;
    while ((match = PATTERNS.LINK.exec(content)) !== null) {
      const [raw] = match;
      const startIndex = match.index;
      const endIndex = startIndex + raw.length;

      // Check if this link is inside a conditional (already processed)
      const isInConditional = result.conditionals.some(
        c => startIndex >= c.startIndex && endIndex <= c.endIndex
      );

      if (!isInConditional) {
        let text: string;
        let target: string;

        if (match[1] && match[2]) {
          // [[text->target]]
          text = match[1].trim();
          target = match[2].trim();
        } else if (match[3] && match[4]) {
          // [[target<-text]]
          target = match[3].trim();
          text = match[4].trim();
        } else if (match[5] && match[6]) {
          // [[text|target]] - pipe format
          text = match[5].trim();
          target = match[6].trim();
        } else if (match[7]) {
          // [[text]] - text is also target
          text = match[7].trim();
          target = match[7].trim();
        } else {
          continue;
        }

        result.links.push({
          text,
          target,
          startIndex,
          endIndex,
          raw,
        });
      }
    }

    // Also extract (link-goto:) macros
    this.extractLinkMacros(content, result);
  }

  /**
   * Extract (link:) and (link-goto:) macros
   */
  private static extractLinkMacros(content: string, result: ParsedContent): void {
    // (link-goto: "text", "target")
    PATTERNS.LINK_GOTO.lastIndex = 0;
    let match;
    while ((match = PATTERNS.LINK_GOTO.exec(content)) !== null) {
      const [raw, text, target] = match;
      result.links.push({
        text,
        target: target || text, // If no target, use text as target
        startIndex: match.index,
        endIndex: match.index + raw.length,
        raw,
      });
    }

    // (go-to:) is auto-navigation
    PATTERNS.GOTO.lastIndex = 0;
    while ((match = PATTERNS.GOTO.exec(content)) !== null) {
      const [raw, target] = match;
      result.links.push({
        text: '(auto-navigate)',
        target,
        startIndex: match.index,
        endIndex: match.index + raw.length,
        raw,
      });
      result.warnings.push(`(go-to: "${target}") converted to link`);
    }
  }

  /**
   * Helper to extract links from a text fragment
   */
  private static extractLinksFromText(text: string): ExtractedLink[] {
    const links: ExtractedLink[] = [];
    const regex = new RegExp(PATTERNS.LINK.source, 'g');

    let match;
    while ((match = regex.exec(text)) !== null) {
      const [raw] = match;
      let linkText: string;
      let target: string;

      if (match[1] && match[2]) {
        // [[text->target]]
        linkText = match[1].trim();
        target = match[2].trim();
      } else if (match[3] && match[4]) {
        // [[target<-text]]
        target = match[3].trim();
        linkText = match[4].trim();
      } else if (match[5] && match[6]) {
        // [[text|target]] - pipe format
        linkText = match[5].trim();
        target = match[6].trim();
      } else if (match[7]) {
        // [[text]] - text is also target
        linkText = match[7].trim();
        target = match[7].trim();
      } else {
        continue;
      }

      links.push({
        text: linkText,
        target,
        startIndex: match.index,
        endIndex: match.index + raw.length,
        raw,
      });
    }

    return links;
  }

  /**
   * Extract all variable references
   */
  private static extractVariables(content: string, result: ParsedContent): void {
    PATTERNS.VARIABLE.lastIndex = 0;

    const seen = new Set<string>();
    let match;
    while ((match = PATTERNS.VARIABLE.exec(content)) !== null) {
      const varName = match[1];
      if (!seen.has(varName)) {
        seen.add(varName);
        result.variables.push(varName);
      }
    }
  }

  /**
   * Process macros and generate clean display text
   */
  private static processAndCleanText(content: string, result: ParsedContent): string {
    let text = content;

    // Remove (set:) macros
    text = text.replace(PATTERNS.SET, '');

    // Remove styling macros but keep their content
    // e.g., (text-colour: green)[text] -> text
    text = text.replace(PATTERNS.STYLE_MACRO, '$1');

    // Helper to strip links from content (links become choices/branches, not display text)
    const stripLinks = (content: string): string => {
      const linkRegex = new RegExp(PATTERNS.LINK.source, 'g');
      return (content || '').replace(linkRegex, '');
    };

    // Handle (if:)[content] - keep the text content, strip any links
    // The links become condition branches, the text is displayed
    text = text.replace(PATTERNS.IF, (full, condition, hookContent) => {
      return stripLinks(hookContent);
    });

    // Handle (unless:) - same as (if:), keep text and strip links
    text = text.replace(PATTERNS.UNLESS, (full, condition, hookContent) => {
      return stripLinks(hookContent);
    });

    // Handle (else-if:) - keep text content, strip links
    text = text.replace(PATTERNS.ELSE_IF, (full, condition, hookContent) => {
      return stripLinks(hookContent);
    });

    // Handle (else:)[content] - keep the text content, strip links
    text = text.replace(PATTERNS.ELSE, (full, elseContent) => {
      return stripLinks(elseContent);
    });

    // Replace (print:) and (display:) with the variable
    text = text.replace(PATTERNS.PRINT, (_, expr) => {
      // Convert $var to $var$ for ASAPS
      return expr.trim().replace(/\$(\w+)/g, '$$$1$$');
    });

    // Remove links entirely from display text (they become choices)
    text = text.replace(PATTERNS.LINK, '');

    // Remove (link:) macros
    text = text.replace(PATTERNS.LINK_MACRO, '');
    text = text.replace(PATTERNS.LINK_GOTO, '');

    // Remove (go-to:)
    text = text.replace(PATTERNS.GOTO, '');

    // Convert remaining $var to $var$ for ASAPS variable syntax
    text = text.replace(/\$([a-zA-Z_]\w*)/g, '$$$1$$');

    // Clean up whitespace - multiple newlines become two
    text = text.replace(/\n{3,}/g, '\n\n');

    // Clean up multiple spaces
    text = text.replace(/  +/g, ' ');

    // Trim each line and remove empty lines at start/end
    text = text.split('\n').map(line => line.trim()).join('\n').trim();

    return text;
  }

  /**
   * Find unsupported macros
   */
  private static findUnsupportedMacros(content: string, result: ParsedContent): void {
    PATTERNS.ANY_MACRO.lastIndex = 0;

    const seen = new Set<string>();
    let match;
    while ((match = PATTERNS.ANY_MACRO.exec(content)) !== null) {
      const macroName = match[1].toLowerCase();

      if (!KNOWN_MACROS.has(macroName)) {
        if (!seen.has(macroName)) {
          seen.add(macroName);
          result.unsupportedMacros.push(macroName);
          result.warnings.push(`Unknown macro (${macroName}:)`);
        }
      } else if (['audio', 'css'].includes(macroName)) {
        if (!seen.has(macroName)) {
          seen.add(macroName);
          result.warnings.push(`(${macroName}:) macro not supported`);
        }
      }
    }
  }

  /**
   * Convert a Harlowe condition to ASAPS condition format
   */
  static convertCondition(condition: string): {
    variableName: string;
    operator: string;
    value: string;
  } | null {
    // Harlowe patterns:
    // $var is value
    // $var is not value
    // $var > value
    // $var < value
    // $var >= value
    // $var <= value
    // $var (truthy)
    // not $var

    const patterns = [
      // $var is not value
      /\$(\w+)\s+is\s+not\s+(.+)/i,
      // $var is value
      /\$(\w+)\s+is\s+(.+)/i,
      // $var >= value
      /\$(\w+)\s*(>=|<=|>|<)\s*(.+)/,
      // $var (truthy)
      /^\$(\w+)$/,
      // not $var
      /^not\s+\$(\w+)$/i,
    ];

    const trimmed = condition.trim();

    // $var is not value
    let match = trimmed.match(/\$(\w+)\s+is\s+not\s+(.+)/i);
    if (match) {
      return {
        variableName: match[1],
        operator: '!=',
        value: this.parseConditionValue(match[2]),
      };
    }

    // $var is value
    match = trimmed.match(/\$(\w+)\s+is\s+(.+)/i);
    if (match) {
      return {
        variableName: match[1],
        operator: '==',
        value: this.parseConditionValue(match[2]),
      };
    }

    // Comparison operators
    match = trimmed.match(/\$(\w+)\s*(>=|<=|>|<|==|!=)\s*(.+)/);
    if (match) {
      return {
        variableName: match[1],
        operator: match[2],
        value: this.parseConditionValue(match[3]),
      };
    }

    // Simple truthy: $var
    match = trimmed.match(/^\$(\w+)$/);
    if (match) {
      return {
        variableName: match[1],
        operator: '==',
        value: 'true',
      };
    }

    // Negation: not $var
    match = trimmed.match(/^not\s+\$(\w+)$/i);
    if (match) {
      return {
        variableName: match[1],
        operator: '==',
        value: 'false',
      };
    }

    return null;
  }

  /**
   * Parse a condition value (strip quotes, handle booleans)
   */
  private static parseConditionValue(value: string): string {
    const trimmed = value.trim();

    // Boolean
    if (trimmed.toLowerCase() === 'true') return 'true';
    if (trimmed.toLowerCase() === 'false') return 'false';

    // Remove quotes
    if (/^["'].*["']$/.test(trimmed)) {
      return trimmed.slice(1, -1);
    }

    return trimmed;
  }

  /**
   * Parse a Harlowe value expression
   */
  static parseValue(valueExpr: string): string | number | boolean {
    const trimmed = valueExpr.trim();

    // Boolean
    if (trimmed.toLowerCase() === 'true') return true;
    if (trimmed.toLowerCase() === 'false') return false;

    // Number
    const num = Number(trimmed);
    if (!isNaN(num)) return num;

    // String (with or without quotes)
    if (/^["'].*["']$/.test(trimmed)) {
      return trimmed.slice(1, -1);
    }

    // Variable reference or expression - return as string
    return trimmed;
  }

  /**
   * Check if content has any links
   */
  static hasLinks(content: string): boolean {
    return PATTERNS.LINK.test(content) ||
           PATTERNS.LINK_GOTO.test(content) ||
           PATTERNS.GOTO.test(content);
  }

  /**
   * Count links in content
   */
  static countLinks(content: string): number {
    const parsed = this.parse(content);
    return parsed.links.length;
  }
}
