/**
 * SugarCubeParser - Parses SugarCube-specific syntax in passage content
 *
 * Extracts links, variables, macros, and conditionals from passage text.
 */

export interface ExtractedLink {
  /** The text displayed for the link */
  text: string;
  /** The target passage name */
  target: string;
  /** Position in the original text (start index) */
  startIndex: number;
  /** Position in the original text (end index) */
  endIndex: number;
  /** Original raw link syntax */
  raw: string;
  /** Optional setter expression (for links with setters) */
  setter?: string;
}

export interface SetOperation {
  /** Variable name (without $) */
  variable: string;
  /** The value being assigned (as string, may need evaluation) */
  value: string;
  /** Original raw syntax */
  raw: string;
  /** Position in original text */
  startIndex: number;
  endIndex: number;
}

export interface Conditional {
  /** The condition expression */
  condition: string;
  /** Content shown when condition is true */
  thenContent: string;
  /** Content shown when condition is false (optional) */
  elseContent?: string;
  /** Original raw syntax */
  raw: string;
  /** Position in original text */
  startIndex: number;
  endIndex: number;
  /** Whether this conditional contains links (branching) */
  hasBranchingLinks: boolean;
  /** Links in the then branch */
  thenLinks: ExtractedLink[];
  /** Links in the else branch */
  elseLinks: ExtractedLink[];
  /** Whether this is an else-if conditional (Harlowe) */
  isElseIf?: boolean;
}

export interface ParsedContent {
  /** Clean text with macros processed/removed */
  text: string;
  /** All extracted links */
  links: ExtractedLink[];
  /** Referenced variables (names without $) */
  variables: string[];
  /** Set operations found */
  setOperations: SetOperation[];
  /** Conditional blocks */
  conditionals: Conditional[];
  /** Macros that couldn't be processed */
  unsupportedMacros: string[];
  /** Warnings generated during parsing */
  warnings: string[];
}

// Regex patterns for SugarCube syntax
const PATTERNS = {
  // Links: [[text]] or [[text|target]] or [[text|target][$var = value]]
  LINK: /\[\[([^\]|[\]]+?)(?:\|([^\][\]]+?))?(?:\]\[([^\]]+))?\]\]/g,

  // Variables: $varName or $varName.property
  VARIABLE: /\$([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*)/g,

  // Set macro: <<set $var = value>> or <<set $var to value>>
  SET: /<<set\s+\$([a-zA-Z_]\w*)\s*(?:=|to)\s*(.+?)>>/gi,

  // If/else conditional: <<if condition>>...<<else>>...<<endif>> or <</if>>
  IF_ELSE: /<<if\s+(.+?)>>([\s\S]*?)(?:<<else>>([\s\S]*?))?<<(?:\/if|endif)>>/gi,

  // Print macro: <<print expr>> or <<= expr>> or <<- expr>>
  PRINT: /<<(?:print|=|-)\s*(.+?)>>/gi,

  // Include macro: <<include "passage">>
  INCLUDE: /<<include\s+["']([^"']+)["']>>/gi,

  // Link macro: <<link "text" "passage">>...<<endlink>> or <</link>>
  LINK_MACRO: /<<link\s+["']([^"']+)["'](?:\s+["']([^"']+)["'])?>>([\s\S]*?)<<(?:\/link|endlink)>>/gi,

  // Button macro: <<button "text" "passage">>...<<endbutton>> or <</button>>
  BUTTON_MACRO: /<<button\s+["']([^"']+)["'](?:\s+["']([^"']+)["'])?>>([\s\S]*?)<<(?:\/button|endbutton)>>/gi,

  // Generic macro (for detection of unsupported ones)
  ANY_MACRO: /<<(\/?[a-zA-Z_]\w*)(?:\s+[^>]*)?>>/g,

  // Goto macro: <<goto "passage">>
  GOTO: /<<goto\s+["']([^"']+)["']>>/gi,

  // Silently macro: <<silently>>...<<endsilently>>
  SILENTLY: /<<silently>>([\s\S]*?)<<(?:\/silently|endsilently)>>/gi,
};

// Macros that are known but not fully supported
const KNOWN_MACROS = new Set([
  'if', 'else', 'elseif', 'endif', '/if',
  'set', 'unset',
  'print', '=', '-',
  'include', 'display',
  'link', 'endlink', '/link',
  'button', 'endbutton', '/button',
  'goto',
  'silently', 'endsilently', '/silently',
  'nobr', 'endnobr', '/nobr',
  'run', 'script', 'endscript', '/script',
  'widget', 'endwidget', '/widget',
  'for', 'endfor', '/for', 'break', 'continue',
  'switch', 'case', 'default', 'endswitch', '/switch',
  'capture', 'endcapture', '/capture',
  'timed', 'endtimed', '/timed', 'next',
  'repeat', 'endrepeat', '/repeat', 'stop',
  'audio', 'cacheaudio', 'playlist',
  'addclass', 'removeclass', 'toggleclass',
  'append', 'prepend', 'replace', 'remove',
  'copy',
  'done', 'type',
  'checkbox', 'radiobutton', 'textbox', 'textarea', 'listbox', 'cycle', 'linkappend', 'linkprepend', 'linkreplace',
]);

export class SugarCubeParser {
  /**
   * Parse SugarCube content from a passage
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

    // Process in order: conditionals first (they may contain links)
    this.extractConditionals(content, result);

    // Extract links (excluding those already in conditionals)
    this.extractLinks(content, result);

    // Extract set operations
    this.extractSetOperations(content, result);

    // Extract variable references
    this.extractVariables(content, result);

    // Process macros and clean text
    result.text = this.processAndCleanText(content, result);

    // Find unsupported macros
    this.findUnsupportedMacros(content, result);

    return result;
  }

  /**
   * Extract all links from content
   */
  private static extractLinks(content: string, result: ParsedContent): void {
    // Reset regex
    PATTERNS.LINK.lastIndex = 0;

    let match;
    while ((match = PATTERNS.LINK.exec(content)) !== null) {
      const [raw, textOrTarget, target, setter] = match;
      const startIndex = match.index;
      const endIndex = startIndex + raw.length;

      // Check if this link is inside a conditional (already processed)
      const isInConditional = result.conditionals.some(
        c => startIndex >= c.startIndex && endIndex <= c.endIndex
      );

      if (!isInConditional) {
        result.links.push({
          text: target ? textOrTarget : textOrTarget,
          target: target || textOrTarget,
          startIndex,
          endIndex,
          raw,
          setter: setter || undefined,
        });
      }
    }

    // Also extract <<link>> and <<button>> macros
    this.extractLinkMacros(content, result);
  }

  /**
   * Extract <<link>> and <<button>> macros
   */
  private static extractLinkMacros(content: string, result: ParsedContent): void {
    // <<link>> macro
    PATTERNS.LINK_MACRO.lastIndex = 0;
    let match;
    while ((match = PATTERNS.LINK_MACRO.exec(content)) !== null) {
      const [raw, text, target] = match;
      if (target) {
        result.links.push({
          text,
          target,
          startIndex: match.index,
          endIndex: match.index + raw.length,
          raw,
        });
      }
    }

    // <<button>> macro
    PATTERNS.BUTTON_MACRO.lastIndex = 0;
    while ((match = PATTERNS.BUTTON_MACRO.exec(content)) !== null) {
      const [raw, text, target] = match;
      if (target) {
        result.links.push({
          text,
          target,
          startIndex: match.index,
          endIndex: match.index + raw.length,
          raw,
        });
      }
    }

    // <<goto>> macro (implicit navigation)
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
      result.warnings.push(`<<goto "${target}">> converted to link`);
    }
  }

  /**
   * Extract <<set>> operations
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
   * Extract <<if>>...<<else>>...<<endif>> conditionals
   */
  private static extractConditionals(content: string, result: ParsedContent): void {
    PATTERNS.IF_ELSE.lastIndex = 0;

    let match;
    while ((match = PATTERNS.IF_ELSE.exec(content)) !== null) {
      const [raw, condition, thenContent, elseContent] = match;

      // Extract links from each branch
      const thenLinks = this.extractLinksFromText(thenContent || '');
      const elseLinks = this.extractLinksFromText(elseContent || '');

      const hasBranchingLinks =
        thenLinks.length > 0 || elseLinks.length > 0;

      result.conditionals.push({
        condition: condition.trim(),
        thenContent: (thenContent || '').trim(),
        elseContent: elseContent?.trim(),
        raw,
        startIndex: match.index,
        endIndex: match.index + raw.length,
        hasBranchingLinks,
        thenLinks,
        elseLinks,
      });
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
      const [raw, textOrTarget, target, setter] = match;
      links.push({
        text: target ? textOrTarget : textOrTarget,
        target: target || textOrTarget,
        startIndex: match.index,
        endIndex: match.index + raw.length,
        raw,
        setter: setter || undefined,
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

    // Replace <<print $var>> and <<= $var>> with variable syntax
    text = text.replace(PATTERNS.PRINT, (_, expr) => {
      // Convert $var to $var$ for ASAPS
      const converted = expr.trim().replace(/\$(\w+)/g, '$$$1$$');
      return converted;
    });

    // Remove links entirely from display text (they become choices)
    text = text.replace(PATTERNS.LINK, '');

    // Remove <<link>> and <<button>> macros (they become choices)
    text = text.replace(PATTERNS.LINK_MACRO, '');
    text = text.replace(PATTERNS.BUTTON_MACRO, '');

    // Remove <<set>> macros (they become separate beats or are processed)
    text = text.replace(PATTERNS.SET, '');

    // Process <<if>> blocks - for simple text conditionals, keep both options
    // For branching conditionals, this will be handled differently
    text = text.replace(PATTERNS.IF_ELSE, (_, condition, thenContent, elseContent) => {
      // Check if this contains links (branching)
      const hasLinks =
        PATTERNS.LINK.test(thenContent || '') ||
        PATTERNS.LINK.test(elseContent || '');

      if (hasLinks) {
        // Branching conditional - will be converted to ConditionBeat
        // For now, return placeholder
        return '[conditional branch]';
      } else {
        // Simple conditional text - keep as ASAPS conditional
        // TODO: ASAPS doesn't have inline conditionals, so we show both
        const thenText = (thenContent || '').trim();
        const elseText = (elseContent || '').trim();
        if (elseText) {
          return `${thenText} / ${elseText}`;
        }
        return thenText;
      }
    });

    // Remove <<include>> (will be handled by flattening)
    text = text.replace(PATTERNS.INCLUDE, '[included content]');

    // Remove <<goto>> (already converted to link)
    text = text.replace(PATTERNS.GOTO, '');

    // Remove <<silently>> blocks
    text = text.replace(PATTERNS.SILENTLY, '');

    // Convert $var to $var$ for ASAPS variable syntax
    text = text.replace(/\$([a-zA-Z_]\w*)/g, '$$$1$$');

    // Clean up whitespace
    text = text.replace(/\n{3,}/g, '\n\n').trim();

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
      const macroName = match[1].toLowerCase().replace(/^\//, '');

      // Skip known/supported macros
      if (KNOWN_MACROS.has(macroName)) {
        // Check if it's a macro we warn about
        if (['audio', 'cacheaudio', 'playlist', 'widget', 'script'].includes(macroName)) {
          if (!seen.has(macroName)) {
            seen.add(macroName);
            result.unsupportedMacros.push(macroName);
            result.warnings.push(`<<${macroName}>> macro not supported`);
          }
        }
        continue;
      }

      // Unknown macro
      if (!seen.has(macroName)) {
        seen.add(macroName);
        result.unsupportedMacros.push(macroName);
        result.warnings.push(`Unknown macro <<${macroName}>>`);
      }
    }
  }

  /**
   * Convert a SugarCube condition to ASAPS condition format
   */
  static convertCondition(condition: string): {
    variableName: string;
    operator: string;
    value: string | number | boolean;
  } | null {
    // Simple patterns: $var, $var == value, $var != value, etc.
    const patterns = [
      // $var == value or $var === value
      /\$(\w+)\s*(===?|!==?|>=?|<=?)\s*(.+)/,
      // $var (truthy check)
      /^\$(\w+)$/,
      // not $var
      /^not\s+\$(\w+)$/i,
      // !$var
      /^!\$(\w+)$/,
    ];

    for (const pattern of patterns) {
      const match = condition.trim().match(pattern);
      if (match) {
        if (match.length === 2) {
          // Simple truthy check: $var
          return {
            variableName: match[1],
            operator: '!=',
            value: false,  // Use actual boolean
          };
        } else if (match.length === 4) {
          // Comparison: $var op value
          const rawValue = match[3].trim().replace(/^["']|["']$/g, '');
          return {
            variableName: match[1],
            operator: match[2].replace('===', '==').replace('!==', '!='),
            value: this.parseConditionValue(rawValue),
          };
        }
      }
    }

    // Handle "not $var" or "!$var"
    const notMatch = condition.trim().match(/^(?:not\s+|!)\$(\w+)$/i);
    if (notMatch) {
      return {
        variableName: notMatch[1],
        operator: '==',
        value: false,  // Use actual boolean
      };
    }

    return null;
  }

  /**
   * Parse a condition value to proper type
   */
  private static parseConditionValue(value: string): string | number | boolean {
    const trimmed = value.trim();

    // Boolean
    if (trimmed.toLowerCase() === 'true') return true;
    if (trimmed.toLowerCase() === 'false') return false;

    // Number
    const num = Number(trimmed);
    if (!isNaN(num) && trimmed !== '') return num;

    return trimmed;
  }

  /**
   * Parse a SugarCube value expression
   */
  static parseValue(valueExpr: string): string | number | boolean {
    const trimmed = valueExpr.trim();

    // Boolean
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;

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
           PATTERNS.LINK_MACRO.test(content) ||
           PATTERNS.BUTTON_MACRO.test(content) ||
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
