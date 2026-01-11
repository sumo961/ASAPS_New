/**
 * PassageAnalyzer - Analyzes Twine passages to determine optimal ASAPS beat types
 *
 * Uses intelligent analysis of passage structure, link positions, and content
 * to classify each passage into the most appropriate beat type.
 */

import { TwinePassage } from './TwineParser';
import { SugarCubeParser, ParsedContent, ExtractedLink, Conditional } from './SugarCubeParser';

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
    value: string;
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
   */
  static analyzePassage(passage: TwinePassage): AnalyzedPassage {
    const parsed = SugarCubeParser.parse(passage.content);
    const notes: string[] = [...parsed.warnings];
    const additionalBeats: AdditionalBeat[] = [];

    // Determine link positions
    const linkPosition = this.determineLinkPosition(passage.content, parsed);

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
    if (parsed.setOperations.length > 0 && suggestedBeatType !== 'setVariable') {
      additionalBeats.push({
        type: 'setVariable',
        setOperations: parsed.setOperations.map(op => ({
          variable: op.variable,
          value: op.value,
        })),
      });
    }

    // Handle conditional branching - may need ConditionBeat
    if (hasConditionalBranching) {
      for (const conditional of parsed.conditionals) {
        if (conditional.hasBranchingLinks) {
          const conditionData = SugarCubeParser.convertCondition(conditional.condition);
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
   */
  static analyzeAll(passages: TwinePassage[]): AnalysisResult {
    const analyzed = passages.map(p => this.analyzePassage(p));

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
   */
  private static determineLinkPosition(
    content: string,
    parsed: ParsedContent
  ): LinkPosition {
    if (parsed.links.length === 0) {
      return 'none';
    }

    // Get text without macros for position analysis
    const cleanContent = content
      .replace(/<<[^>]+>>/g, '') // Remove macros
      .trim();

    if (cleanContent.length === 0) {
      return 'end'; // Only macros/links, treat as end
    }

    // Find the position of text content (excluding links)
    const textWithoutLinks = cleanContent.replace(/\[\[[^\]]+\]\]/g, '').trim();
    const textEndPosition = cleanContent.lastIndexOf(textWithoutLinks) + textWithoutLinks.length;
    const contentLength = cleanContent.length;

    // Check if all links are in the last 25% of content
    const threshold = contentLength * 0.75;

    let hasInlineLinks = false;
    let hasEndLinks = false;

    for (const link of parsed.links) {
      // Find link position in clean content
      const linkPos = cleanContent.indexOf(link.raw);
      if (linkPos === -1) continue;

      // Check if this link is embedded in narrative text
      // A link is "inline" if there's significant text after it
      const textAfterLink = cleanContent.slice(linkPos + link.raw.length).trim();
      const hasTextAfter = textAfterLink.length > 20 && !/^\[\[/.test(textAfterLink);

      if (hasTextAfter || linkPos < threshold) {
        hasInlineLinks = true;
      } else {
        hasEndLinks = true;
      }
    }

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
    const isEnding = passage.tags.some(t =>
      ['ending', 'end', 'finale', 'gameover'].includes(t.toLowerCase())
    );

    // If primarily setting variables with a single link out
    if (isSetVariablePassage) {
      return 'setVariable';
    }

    // If has conditional branching, the passage itself might be simple
    // but we'll create additional ConditionBeat(s)
    if (hasConditionalBranching && parsed.conditionals.length > 0) {
      // The main passage content (without conditional) determines type
      const nonConditionalLinks = parsed.links.filter(link => {
        // Check if link is inside a conditional
        return !parsed.conditionals.some(
          c => c.thenLinks.includes(link) || c.elseLinks.includes(link)
        );
      });

      if (nonConditionalLinks.length === 0) {
        // All links are in conditionals - this becomes a conditionBeat
        return 'conditionBeat';
      }
    }

    // No links - terminal passage
    if (linkPosition === 'none' || parsed.links.length === 0) {
      return isEnding ? 'endScreen' : 'introText';
    }

    // Single link at end - narrative with continue
    if (parsed.links.length === 1 && linkPosition === 'end') {
      return 'introText';
    }

    // Multiple links at end (not inline) - choice-based
    if (parsed.links.length > 1 && linkPosition === 'end') {
      return 'dialogTree';
    }

    // Links embedded in text - hypertext
    if (linkPosition === 'inline' || linkPosition === 'mixed') {
      return 'hyperText';
    }

    // Default to dialogTree for multiple links
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
