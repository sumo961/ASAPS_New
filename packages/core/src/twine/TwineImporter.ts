/**
 * TwineImporter - Orchestrates the import of Twine stories into ASAPS
 *
 * Converts Twine passages to ASAPS beats using intelligent beat type mapping.
 */

import { TwineParser, TwineStory, TwinePassage, SPECIAL_PASSAGES } from './TwineParser';
import { SugarCubeParser } from './SugarCubeParser';
import { PassageAnalyzer, AnalyzedPassage, AnalysisResult, SuggestedBeatType } from './PassageAnalyzer';
import { BeatTypeRegistry } from '../beats/BeatRegistry';
import { Beat } from '../beats/Beat';
import type { BeatConfig, Connection, Condition } from '../types';

export interface ImportResult {
  /** Successfully imported beats */
  beats: Beat[];
  /** Story title */
  title: string;
  /** Story author (if found) */
  author?: string;
  /** ID of the first beat */
  firstBeatId: string;
  /** Warnings generated during import */
  warnings: string[];
  /** Analysis statistics */
  stats: AnalysisResult['stats'];
}

export interface ImportOptions {
  /** Prefix for generated beat IDs (default: 'twine_') */
  idPrefix?: string;
  /** Whether to include PassageHeader/Footer content */
  includeHeaderFooter?: boolean;
  /** Whether to flatten <<include>> passages */
  flattenIncludes?: boolean;
}

const DEFAULT_OPTIONS: Required<ImportOptions> = {
  idPrefix: 'twine_',
  includeHeaderFooter: true,
  flattenIncludes: true,
};

export class TwineImporter {
  private options: Required<ImportOptions>;
  private registry: BeatTypeRegistry;
  private passageNameToBeatId: Map<string, string> = new Map();
  private beatIdCounter: number = 0;
  private passageMap: Map<string, TwinePassage> = new Map();

  constructor(options: ImportOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.registry = BeatTypeRegistry.getInstance();
  }

  /**
   * Import a Twine HTML file into ASAPS beats
   */
  import(html: string): ImportResult {
    // Reset state
    this.passageNameToBeatId.clear();
    this.beatIdCounter = 0;
    this.passageMap.clear();

    // Parse Twine HTML
    const twineStory = TwineParser.parse(html);

    // Build passage map for includes
    this.passageMap = TwineParser.buildPassageMap(twineStory);

    // Get special passages
    const specialPassages = TwineParser.getSpecialPassages(twineStory);

    // Get header/footer content if enabled
    let headerContent = '';
    let footerContent = '';
    if (this.options.includeHeaderFooter) {
      const header = specialPassages.get(SPECIAL_PASSAGES.PASSAGE_HEADER);
      const footer = specialPassages.get(SPECIAL_PASSAGES.PASSAGE_FOOTER);
      if (header) headerContent = header.content + '\n\n';
      if (footer) footerContent = '\n\n' + footer.content;
    }

    // Get regular (non-special) passages
    const regularPassages = TwineParser.getRegularPassages(twineStory);

    // Pre-generate beat IDs for all passages (needed for connection resolution)
    for (const passage of regularPassages) {
      this.passageNameToBeatId.set(passage.name, this.generateBeatId());
    }

    // Analyze all passages
    const analysis = PassageAnalyzer.analyzeAll(regularPassages);

    // Create beats
    const beats: Beat[] = [];
    const warnings: string[] = [...analysis.warnings];

    // Handle StoryInit - create SetVariable beats
    const storyInit = specialPassages.get(SPECIAL_PASSAGES.STORY_INIT);
    let initBeatIds: string[] = [];
    if (storyInit) {
      const initBeats = this.createStoryInitBeats(storyInit);
      beats.push(...initBeats);
      initBeatIds = initBeats.map(b => b.id);
    }

    // Convert analyzed passages to beats
    for (const analyzed of analysis.passages) {
      // Apply header/footer
      if (headerContent || footerContent) {
        analyzed.parsed.text = headerContent + analyzed.parsed.text + footerContent;
      }

      // Create the main beat
      const beat = this.createBeat(analyzed);
      beats.push(beat);

      // Create additional beats (SetVariable, ConditionBeat) if needed
      for (const additional of analyzed.additionalBeats) {
        const additionalBeat = this.createAdditionalBeat(additional, analyzed);
        if (additionalBeat) {
          beats.push(additionalBeat);
        }
      }
    }

    // Resolve connections
    this.resolveConnections(beats);

    // Determine first beat
    const startPassage = TwineParser.getStartPassage(twineStory);
    let firstBeatId = '';

    if (initBeatIds.length > 0) {
      // If we have init beats, they come first
      firstBeatId = initBeatIds[0];
      // Chain init beats and connect last one to start passage
      for (let i = 0; i < initBeatIds.length - 1; i++) {
        const beat = beats.find(b => b.id === initBeatIds[i]);
        if (beat) {
          beat.defaultTarget = initBeatIds[i + 1];
        }
      }
      // Connect last init beat to start passage
      const lastInitBeat = beats.find(b => b.id === initBeatIds[initBeatIds.length - 1]);
      if (lastInitBeat && startPassage) {
        lastInitBeat.defaultTarget = this.passageNameToBeatId.get(startPassage.name) || '';
      }
    } else if (startPassage) {
      firstBeatId = this.passageNameToBeatId.get(startPassage.name) || '';
    } else if (beats.length > 0) {
      firstBeatId = beats[0].id;
    }

    // Extract metadata
    const title = TwineParser.getStoryTitle(twineStory);
    const author = TwineParser.getStoryAuthor(twineStory);

    // Add warning for JavaScript
    if (twineStory.scripts) {
      warnings.push('Story contains JavaScript which was not imported');
    }

    return {
      beats,
      title,
      author,
      firstBeatId,
      warnings,
      stats: analysis.stats,
    };
  }

  /**
   * Generate a unique beat ID
   */
  private generateBeatId(): string {
    return `${this.options.idPrefix}${this.beatIdCounter++}`;
  }

  /**
   * Create beats from StoryInit passage
   */
  private createStoryInitBeats(storyInit: TwinePassage): Beat[] {
    const beats: Beat[] = [];
    const parsed = SugarCubeParser.parse(storyInit.content);

    // Create a SetVariable beat for each set operation
    for (const setOp of parsed.setOperations) {
      const beatId = this.generateBeatId();
      const config: BeatConfig = {
        id: beatId,
        name: `Init: ${setOp.variable}`,
        type: 'setVariable',
        parameters: {
          variable: setOp.variable,
          value: SugarCubeParser.parseValue(setOp.value),
          type: this.inferVariableType(setOp.value),
        },
      };

      const beat = this.registry.createBeat('setVariable', config);
      beats.push(beat);
    }

    return beats;
  }

  /**
   * Infer variable type from value
   */
  private inferVariableType(value: string): 'variable' | 'counter' {
    const parsed = SugarCubeParser.parseValue(value);
    if (typeof parsed === 'number') {
      return 'counter';
    }
    return 'variable';
  }

  /**
   * Create a beat from an analyzed passage
   */
  private createBeat(analyzed: AnalyzedPassage): Beat {
    const beatId = this.passageNameToBeatId.get(analyzed.passage.name)!;
    const beatType = analyzed.suggestedBeatType;

    // Build config based on beat type
    const config: BeatConfig = {
      id: beatId,
      name: analyzed.passage.name,
      type: beatType,
      parameters: this.buildParameters(analyzed),
      connections: this.buildConnections(analyzed),
    };

    // Add position if available
    if (analyzed.passage.position) {
      config.x = analyzed.passage.position.x;
      config.y = analyzed.passage.position.y;
    }

    return this.registry.createBeat(beatType, config);
  }

  /**
   * Build beat parameters based on type
   */
  private buildParameters(analyzed: AnalyzedPassage): Record<string, any> {
    const { suggestedBeatType: beatType, displayText, choices, parsed } = analyzed;

    switch (beatType) {
      case 'introText':
        return {
          text: displayText,
          buttonText: choices.length > 0 ? choices[0].text : 'Continue',
        };

      case 'dialogTree':
        return {
          dialogTree: {
            id: 'root',
            speaker: '',
            text: displayText,
            choices: choices.map((c, i) => ({
              id: `choice_${i}`,
              text: c.text,
              target: c.target, // Will be resolved to beat ID later
            })),
          },
        };

      case 'hyperText':
        return {
          text: displayText,
          hyperlinks: choices.map(c => ({
            word: c.text,
            targetBeatId: c.target, // Will be resolved later
          })),
        };

      case 'endScreen':
        return {
          title: 'The End',
          text: displayText,
          buttonText: 'Restart',
        };

      case 'setVariable':
        if (parsed.setOperations.length > 0) {
          const op = parsed.setOperations[0];
          return {
            variable: op.variable,
            value: SugarCubeParser.parseValue(op.value),
            type: this.inferVariableType(op.value),
          };
        }
        return {};

      case 'conditionBeat':
        // ConditionBeat parameters are handled separately
        return {};

      default:
        return { text: displayText };
    }
  }

  /**
   * Build initial connections (targets are passage names, resolved later)
   */
  private buildConnections(analyzed: AnalyzedPassage): Connection[] {
    const connections: Connection[] = [];

    // For most beat types, connections come from choices
    for (const choice of analyzed.choices) {
      connections.push({
        targetId: choice.target, // Passage name, resolved later
        label: choice.text,
      });
    }

    return connections;
  }

  /**
   * Create additional beats (SetVariable, ConditionBeat)
   */
  private createAdditionalBeat(
    additional: AnalyzedPassage['additionalBeats'][0],
    analyzed: AnalyzedPassage
  ): Beat | null {
    if (additional.type === 'setVariable' && additional.setOperations) {
      // Create SetVariable beat
      const beatId = this.generateBeatId();
      const op = additional.setOperations[0]; // Take first, rest will be chained

      const config: BeatConfig = {
        id: beatId,
        name: `Set: ${op.variable}`,
        type: 'setVariable',
        parameters: {
          variable: op.variable,
          value: SugarCubeParser.parseValue(op.value),
          type: this.inferVariableType(op.value),
        },
        defaultTarget: this.passageNameToBeatId.get(analyzed.passage.name),
      };

      return this.registry.createBeat('setVariable', config);
    }

    if (additional.type === 'conditionBeat' && additional.condition) {
      const { condition } = additional;
      const beatId = this.generateBeatId();

      // Build condition connections
      const connections: Connection[] = [];

      // True branch
      if (condition.thenTarget) {
        const conditionObj: Condition = {
          type: this.inferVariableType(condition.value) === 'counter' ? 'counter' : 'variable',
          variableName: condition.variableName,
          operator: condition.operator as any,
          value: condition.value,
        };

        connections.push({
          targetId: condition.thenTarget, // Resolved later
          condition: conditionObj,
        });
      }

      // Else branch (no condition = default)
      if (condition.elseTarget) {
        connections.push({
          targetId: condition.elseTarget, // Resolved later
        });
      }

      const config: BeatConfig = {
        id: beatId,
        name: `Condition: ${condition.variableName}`,
        type: 'conditionBeat',
        connections,
        parameters: {
          // ConditionBeat uses connections for conditions
        },
      };

      return this.registry.createBeat('conditionBeat', config);
    }

    return null;
  }

  /**
   * Resolve passage names to beat IDs in all connections
   */
  private resolveConnections(beats: Beat[]): void {
    for (const beat of beats) {
      const connections = beat.getConnections();
      const resolvedConnections: Connection[] = [];

      for (const conn of connections) {
        // Check if targetId is a passage name
        const beatId = this.passageNameToBeatId.get(conn.targetId);
        if (beatId) {
          resolvedConnections.push({
            ...conn,
            targetId: beatId,
          });
        } else {
          // Keep as-is (might already be a beat ID or invalid)
          resolvedConnections.push(conn);
        }
      }

      // Update beat's connections array with resolved IDs
      beat.connections = resolvedConnections;

      // Also update parameters for beat types that store connections there
      const params = beat.getParameters();

      if (beat.type === 'dialogTree' && params.dialogTree) {
        // Update DialogTree choices
        const dialogTree = params.dialogTree;
        if (dialogTree.choices) {
          for (const choice of dialogTree.choices) {
            const beatId = this.passageNameToBeatId.get(choice.target);
            if (beatId) {
              choice.target = beatId;
            }
          }
        }
        beat.updateParameters({ dialogTree });
      } else if (beat.type === 'hyperText' && params.hyperlinks) {
        // Update HyperText links
        for (const link of params.hyperlinks) {
          const beatId = this.passageNameToBeatId.get(link.targetBeatId);
          if (beatId) {
            link.targetBeatId = beatId;
          }
        }
        beat.updateParameters({ hyperlinks: params.hyperlinks });
      }

      // Update defaultTarget if it's a passage name
      if (beat.defaultTarget) {
        const beatId = this.passageNameToBeatId.get(beat.defaultTarget);
        if (beatId) {
          beat.defaultTarget = beatId;
        }
      }
    }
  }

  /**
   * Validate Twine HTML before import
   */
  static validate(html: string): { valid: boolean; errors: string[] } {
    return TwineParser.validate(html);
  }

  /**
   * Get a preview/analysis of what will be imported without creating beats
   */
  static preview(html: string): {
    story: TwineStory;
    analysis: AnalysisResult;
    title: string;
    author?: string;
  } {
    const story = TwineParser.parse(html);
    const regularPassages = TwineParser.getRegularPassages(story);
    const analysis = PassageAnalyzer.analyzeAll(regularPassages);

    return {
      story,
      analysis,
      title: TwineParser.getStoryTitle(story),
      author: TwineParser.getStoryAuthor(story),
    };
  }
}
