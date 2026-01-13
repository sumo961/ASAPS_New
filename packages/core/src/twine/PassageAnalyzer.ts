/**
 * PassageAnalyzer - Analyzes Twine passages to determine optimal ASAPS beat types
 *
 * Uses intelligent analysis of passage structure, link positions, and content
 * to classify each passage into the most appropriate beat type.
 */

import { TwinePassage } from './TwineParser';
import { SugarCubeParser, ParsedContent, ExtractedLink, Conditional } from './SugarCubeParser';
import { HarloweParser } from './HarloweParser';

export type TwineFormat = 'sugarcube' | 'harlowe' | 'unknown';

export type SuggestedBeatType =
  | 'introText'
  | 'dialogTree'
  | 'hyperText'
  | 'endScreen'
  | 'setVariable'
  | 'conditionBeat';

export type LinkPosition = 'none' | 'inline' | 'end' | 'mixed';

export interface AnalyzedPassage {
  /** Original passage data */
  passage: TwinePassage;
  /** Parsed SugarCube content */
  parsed: ParsedContent;
  /** Suggested ASAPS beat type */
  suggestedBeatType: SuggestedBeatType;
  /** Where links appear in the text */
  linkPosition: LinkPosition;
  /** Whether this passage has conditional branching */
  hasConditionalBranching: boolean;
  /** Whether this is primarily a variable-setting passage */
  isSetVariablePassage: boolean;
  /** Clean text for display */
  displayText: string;
  /** Choices for dialogTree or hyperText */
  choices: Array<{ text: string; target: string }>;
  /** Additional beats needed (e.g., SetVariable before main beat) */
  additionalBeats: AdditionalBeat[];
  /** Analysis notes/warnings */
  notes: string[];
}

export interface AdditionalBeat {
  type: 'setVariable' | 'conditionBeat';
  /** For setVariable: variable operations */
  setOperations?: Array<{ variable: string; value: string }>;
  /** For conditionBeat: condition and targets */
  condition?: {
    variableName: string;
    operator: string;
    value: string | number | boolean;
    thenTarget: string;
    elseTarget?: string;
  };
}

export interface AnalysisResult {
  passages: AnalyzedPassage[];
  stats: {
    total: number;
    byType: Record<SuggestedBeatType, number>;
    withWarnings: number;
    withConditionals: number;
  };
  warnings: string[];
}

export class PassageAnalyzer {
  /**
   * Analyze a single passage
   * @param passage The passage to analyze
   * @param format The Twine format (sugarcube, harlowe, or unknown)
   */
  static analyzePassage(passage: TwinePassage, format: TwineFormat = 'sugarcube'): AnalyzedPassage {
    // Use the appropriate parser based on format
    const parsed = format === 'harlowe'
      ? HarloweParser.parse(passage.content)
      : SugarCubeParser.parse(passage.content);
    const notes: string[] = [...parsed.warnings];
    const additionalBeats: AdditionalBeat[] = [];

    // Determine link positions
    const linkPosition = this.determineLinkPosition(passage.content, parsed, format);

    // Check for conditional branching
    const hasConditionalBranching = parsed.conditionals.some(c => c.hasBranchingLinks);

    // Check if this is primarily a set-variable passage
    const isSetVariablePassage = this.isSetVariablePassage(parsed);

    // Determine suggested beat type
    let suggestedBeatType = this.classifyBeatType(
      passage,
      parsed,
      linkPosition,
      hasConditionalBranching,
      isSetVariablePassage
    );

    // Handle set operations - create additional SetVariable beats if needed
    // Create one entry per set operation so each gets its own beat
    if (parsed.setOperations.length > 0 && suggestedBeatType !== 'setVariable') {
      for (const op of parsed.setOperations) {
        additionalBeats.push({
          type: 'setVariable',
          setOperations: [{
            variable: op.variable,
            value: op.value,
          }],
        });
      }
    }

    // Handle conditional branching - may need ConditionBeat
    if (hasConditionalBranching) {
      for (const conditional of parsed.conditionals) {
        if (conditional.hasBranchingLinks) {
          // Use appropriate parser for condition conversion
          const conditionData = format === 'harlowe'
            ? HarloweParser.convertCondition(conditional.condition)
            : SugarCubeParser.convertCondition(conditional.condition);
          if (conditionData) {
            const thenTarget = conditional.thenLinks[0]?.target;
            const elseTarget = conditional.elseLinks[0]?.target;

            if (thenTarget) {
              additionalBeats.push({
                type: 'conditionBeat',
                condition: {
                  ...conditionData,
                  thenTarget,
                  elseTarget,
                },
              });
            }
          } else {
            notes.push(`Complex conditional: ${conditional.condition}`);
          }
        }
      }
    }

    // Build choices array
    const choices = this.buildChoices(parsed, suggestedBeatType);

    // Get clean display text
    const displayText = parsed.text;

    return {
      passage,
      parsed,
      suggestedBeatType,
      linkPosition,
      hasConditionalBranching,
      isSetVariablePassage,
      displayText,
      choices,
      additionalBeats,
      notes,
    };
  }

  /**
   * Analyze all passages in a story
   * @param passages Array of passages to analyze
   * @param format The Twine format (sugarcube, harlowe, or unknown)
   */
  static analyzeAll(passages: TwinePassage[], format: TwineFormat = 'sugarcube'): AnalysisResult {
    const analyzed = passages.map(p => this.analyzePassage(p, format));

    // Collect stats
    const stats = {
      total: analyzed.length,
      byType: {
        introText: 0,
        dialogTree: 0,
        hyperText: 0,
        endScreen: 0,
        setVariable: 0,
        conditionBeat: 0,
      } as Record<SuggestedBeatType, number>,
      withWarnings: 0,
      withConditionals: 0,
    };

    const warnings: string[] = [];

    for (const a of analyzed) {
      stats.byType[a.suggestedBeatType]++;
      if (a.notes.length > 0) {
        stats.withWarnings++;
        warnings.push(...a.notes.map(n => `${a.passage.name}: ${n}`));
      }
      if (a.hasConditionalBranching) {
        stats.withConditionals++;
      }
    }

    return { passages: analyzed, stats, warnings };
  }

  /**
   * Determine where links appear in the passage content
   *
   * - 'inline': Links are embedded within narrative text (use HyperText)
   * - 'end': Links are separate choices at the end (use DialogTree)
   * - 'mixed': Both inline and end links present
   * - 'none': No links
   */
  private static determineLinkPosition(
    content: string,
    parsed: ParsedContent,
    format: TwineFormat = 'sugarcube'
  ): LinkPosition {
    if (parsed.links.length === 0) {
      return 'none';
    }

    // Get text without macros for position analysis
    // Handle both SugarCube (<<macro>>) and Harlowe ((macro:)) syntax
    const cleanContent = content
      .replace(/<<[^>]+>>/g, '') // Remove SugarCube macros
      .replace(/\([a-zA-Z-]+:[^)]*\)(\[[^\]]*\])?/g, '') // Remove Harlowe macros with optional hooks
      .trim();

    if (cleanContent.length === 0) {
      return 'end'; // Only macros/links, treat as end
    }

    // Remove all links to get pure text
    const textWithoutLinks = cleanContent.replace(/\[\[[^\]]+\]\]/g, '').trim();

    if (textWithoutLinks.length === 0) {
      return 'end'; // Only links, no text
    }

    let hasInlineLinks = false;
    let hasEndLinks = false;

    for (const link of parsed.links) {
      // Find link position in clean content
      const linkPos = cleanContent.indexOf(link.raw);
      if (linkPos === -1) continue;

      // Get text before and after the link
      const textBefore = cleanContent.slice(0, linkPos);
      const textAfter = cleanContent.slice(linkPos + link.raw.length);

      // Check what's after the link (ignoring other links and whitespace)
      const textAfterWithoutLinks = textAfter.replace(/\[\[[^\]]+\]\]/g, '').trim();
      const hasSubstantialTextAfter = textAfterWithoutLinks.length > 10;

      // Check if the link appears to be part of a sentence (inline)
      // Indicators of inline: preceded by lowercase letter or comma, followed by text
      const beforeTrimmed = textBefore.trimEnd();
      const lastCharBefore = beforeTrimmed.slice(-1);
      const isAfterSentenceEnd = /[.!?"\n]$/.test(beforeTrimmed) || beforeTrimmed.length === 0;
      const isOnOwnLine = /\n\s*$/.test(textBefore) || textBefore.trim().length === 0;

      // A link is "inline" if it's embedded within a sentence:
      // - Not at the start of a line
      // - Not after sentence-ending punctuation
      // - Has substantial narrative text after it (not just more links)
      const isInline = !isOnOwnLine && !isAfterSentenceEnd && hasSubstantialTextAfter;

      // A link is a "choice" (end) if:
      // - It's on its own line or after sentence-ending punctuation
      // - OR there's no substantial text after it (just more links or end of passage)
      const isChoice = isOnOwnLine || isAfterSentenceEnd || !hasSubstantialTextAfter;

      if (isInline) {
        hasInlineLinks = true;
      }
      if (isChoice) {
        hasEndLinks = true;
      }
    }

    // If all links look like choices (at end, on own lines), use 'end' for DialogTree
    // Only use 'inline' (HyperText) if links are truly embedded in narrative
    if (hasInlineLinks && hasEndLinks) {
      return 'mixed';
    } else if (hasInlineLinks) {
      return 'inline';
    } else {
      return 'end';
    }
  }

  /**
   * Check if a passage is primarily for setting variables
   */
  private static isSetVariablePassage(parsed: ParsedContent): boolean {
    // If there are set operations and minimal other content
    if (parsed.setOperations.length === 0) {
      return false;
    }

    // Check if text without variables is very short
    const textWithoutVars = parsed.text
      .replace(/\$\w+\$/g, '')
      .replace(/\[conditional branch\]/g, '')
      .trim();

    // If very little display text, it's a set-variable passage
    return textWithoutVars.length < 20 && parsed.links.length <= 1;
  }

  /**
   * Classify the beat type based on passage analysis
   */
  private static classifyBeatType(
    passage: TwinePassage,
    parsed: ParsedContent,
    linkPosition: LinkPosition,
    hasConditionalBranching: boolean,
    isSetVariablePassage: boolean
  ): SuggestedBeatType {
    // Check for ending tag
    const endingKeywords = ['ending', 'end', 'finale', 'gameover', 'the end'];
    const isEnding = passage.tags.some(t =>
      endingKeywords.includes(t.toLowerCase())
    ) || endingKeywords.some(keyword =>
      passage.name.toLowerCase().includes(keyword)
    );

    // If primarily setting variables with a single link out
    if (isSetVariablePassage) {
      return 'setVariable';
    }

    // Ending passages become EndScreen (even if they have a restart link)
    if (isEnding) {
      return 'endScreen';
    }

    // If has conditional branching, the passage itself might be simple
    // but we'll create additional ConditionBeat(s)
    if (hasConditionalBranching && parsed.conditionals.length > 0) {
      // The main passage content (without conditional) determines type
      const nonConditionalLinks = parsed.links.filter(link => {
        // Check if link is inside a conditional by comparing raw text
        return !parsed.conditionals.some(
          c => c.thenLinks.some(tl => tl.raw === link.raw) ||
               c.elseLinks.some(el => el.raw === link.raw)
        );
      });

      if (nonConditionalLinks.length === 0) {
        // All links are in conditionals - this becomes a conditionBeat
        return 'conditionBeat';
      }
    }

    // No links - terminal passage
    if (linkPosition === 'none' || parsed.links.length === 0) {
      return 'introText';
    }

    // Single link at end - narrative with continue
    if (parsed.links.length === 1 && linkPosition === 'end') {
      return 'introText';
    }

    // Multiple links at end (not inline) - choice-based
    if (parsed.links.length > 1 && (linkPosition === 'end' || linkPosition === 'mixed')) {
      return 'dialogTree';
    }

    // Links truly embedded in text - hypertext
    // Only use hyperText if links are genuinely inline within narrative sentences
    // AND the link text actually appears in the narrative (not just as a link destination)
    if (linkPosition === 'inline') {
      // For single links, verify the link text is actually embedded in the narrative
      if (parsed.links.length === 1) {
        const linkText = parsed.links[0].text;
        // Check if the link text appears in the narrative text (not just as the link)
        const textWithoutLinkMarkup = parsed.text.replace(/\[\[[^\]]+\]\]/g, '');
        if (!textWithoutLinkMarkup.includes(linkText)) {
          // Link text is NOT in the narrative - this should be introText with continue button
          return 'introText';
        }
      }
      return 'hyperText';
    }

    // Default to dialogTree for multiple links (safer than hyperText)
    if (parsed.links.length > 1) {
      return 'dialogTree';
    }

    // Single link somewhere - introText
    return 'introText';
  }

  /**
   * Build choices array for dialogTree or hyperText
   */
  private static buildChoices(
    parsed: ParsedContent,
    beatType: SuggestedBeatType
  ): Array<{ text: string; target: string }> {
    if (beatType === 'setVariable' || beatType === 'conditionBeat') {
      // For these types, there's typically one auto-continue link
      if (parsed.links.length > 0) {
        return [{ text: 'Continue', target: parsed.links[0].target }];
      }
      return [];
    }

    // For other types, use all non-conditional links
    return parsed.links
      .filter(link => {
        // Exclude links inside conditionals (they're handled separately)
        return !parsed.conditionals.some(
          c => c.thenLinks.some(l => l.raw === link.raw) ||
               c.elseLinks.some(l => l.raw === link.raw)
        );
      })
      .map(link => ({
        text: link.text,
        target: link.target,
      }));
  }

  /**
   * Get a summary of the analysis
   */
  static getSummary(result: AnalysisResult): string {
    const lines = [
      `Total passages: ${result.stats.total}`,
      '',
      'Beat type breakdown:',
      `  IntroText: ${result.stats.byType.introText}`,
      `  DialogTree: ${result.stats.byType.dialogTree}`,
      `  HyperText: ${result.stats.byType.hyperText}`,
      `  EndScreen: ${result.stats.byType.endScreen}`,
      `  SetVariable: ${result.stats.byType.setVariable}`,
      `  ConditionBeat: ${result.stats.byType.conditionBeat}`,
      '',
      `Passages with conditionals: ${result.stats.withConditionals}`,
      `Passages with warnings: ${result.stats.withWarnings}`,
    ];

    if (result.warnings.length > 0) {
      lines.push('', 'Warnings:', ...result.warnings.map(w => `  - ${w}`));
    }

    return lines.join('\n');
  }
}
