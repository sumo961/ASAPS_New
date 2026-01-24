/**
 * TwineImporter - Orchestrates the import of Twine stories into ASAPS
 *
 * Converts Twine passages to ASAPS beats using intelligent beat type mapping.
 */

import { TwineParser, TwineStory, TwinePassage, SPECIAL_PASSAGES } from './TwineParser';
import { SugarCubeParser } from './SugarCubeParser';
import { HarloweParser } from './HarloweParser';
import { PassageAnalyzer, AnalyzedPassage, AnalysisResult, SuggestedBeatType, TwineFormat } from './PassageAnalyzer';
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
  /** Maps passage name to the first additional beat ID (SetVariable/etc that runs before the main beat) */
  private passageNameToFirstAdditionalBeatId: Map<string, string> = new Map();
  /** Maps "passageName:then" or "passageName:else" to intermediate IntroText beat ID */
  private conditionalContentBeatIds: Map<string, string> = new Map();
  private beatIdCounter: number = 0;
  private passageMap: Map<string, TwinePassage> = new Map();
  private format: TwineFormat = 'sugarcube';

  constructor(options: ImportOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.registry = BeatTypeRegistry.getInstance();
  }

  /**
   * Detect the Twine format from the story
   */
  private detectFormat(story: TwineStory): TwineFormat {
    if (TwineParser.isHarlowe(story)) {
      return 'harlowe';
    }
    if (TwineParser.isSugarCube(story)) {
      return 'sugarcube';
    }
    return 'unknown';
  }

  /**
   * Import a Twine HTML file into ASAPS beats
   */
  import(html: string): ImportResult {
    // Reset state
    this.passageNameToBeatId.clear();
    this.passageNameToFirstAdditionalBeatId.clear();
    this.conditionalContentBeatIds.clear();
    this.beatIdCounter = 0;
    this.passageMap.clear();

    // Parse Twine HTML
    const twineStory = TwineParser.parse(html);

    // Detect format
    this.format = this.detectFormat(twineStory);

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

    // Analyze all passages using the detected format
    const analysis = PassageAnalyzer.analyzeAll(regularPassages, this.format);

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

      // For conditionBeat, create intermediate IntroText beats for conditional content
      if (analyzed.suggestedBeatType === 'conditionBeat') {
        const conditionalBeats = this.createConditionalContentBeats(analyzed);
        beats.push(...conditionalBeats);

        // Update the conditionBeat's targets to point to intermediate beats if created
        const thenContentBeatId = this.conditionalContentBeatIds.get(`${analyzed.passage.name}:then`);
        const elseContentBeatId = this.conditionalContentBeatIds.get(`${analyzed.passage.name}:else`);
        if (thenContentBeatId || elseContentBeatId) {
          // Update parameters
          const updates: Record<string, string> = {};
          if (thenContentBeatId) {
            updates.trueTarget = thenContentBeatId;
          }
          if (elseContentBeatId) {
            updates.falseTarget = elseContentBeatId;
          }
          beat.updateParameters(updates);

          // Also update connections array so visual editor shows correct edges
          const connections = beat.getConnections();
          for (const conn of connections) {
            if (conn.condition && thenContentBeatId) {
              // This is the conditional (true) branch - update to intermediate beat
              conn.targetId = thenContentBeatId;
            } else if (!conn.condition && elseContentBeatId) {
              // This is the else (false) branch - update to intermediate beat
              conn.targetId = elseContentBeatId;
            }
          }
          beat.connections = connections;
        }
      }

      // Create additional beats (SetVariable, ConditionBeat) if needed
      // Skip creating additional ConditionBeats if the main beat is already a conditionBeat
      // (the connections are built directly into the main beat)
      const additionalBeatsCreated: Beat[] = [];
      for (const additional of analyzed.additionalBeats) {
        if (additional.type === 'conditionBeat' && analyzed.suggestedBeatType === 'conditionBeat') {
          // Skip - conditions are already in the main beat
          continue;
        }
        const additionalBeat = this.createAdditionalBeat(additional, analyzed);
        if (additionalBeat) {
          beats.push(additionalBeat);
          additionalBeatsCreated.push(additionalBeat);
        }
      }

      // Chain additional beats together: first → second → ... → last → main passage
      // Only the last additional beat should point to the main passage
      if (additionalBeatsCreated.length > 0) {
        const mainBeatId = this.passageNameToBeatId.get(analyzed.passage.name);
        for (let i = 0; i < additionalBeatsCreated.length; i++) {
          const currentBeat = additionalBeatsCreated[i];
          if (i < additionalBeatsCreated.length - 1) {
            // Chain to next additional beat
            currentBeat.defaultTarget = additionalBeatsCreated[i + 1].id;
          } else {
            // Last additional beat chains to main passage
            currentBeat.defaultTarget = mainBeatId;
          }
        }
        // Record the first additional beat so connections can be redirected
        this.passageNameToFirstAdditionalBeatId.set(analyzed.passage.name, additionalBeatsCreated[0].id);
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
      // Check if the start passage has additional beats that should run first
      const additionalBeatId = this.passageNameToFirstAdditionalBeatId.get(startPassage.name);
      if (additionalBeatId) {
        firstBeatId = additionalBeatId;
      } else {
        firstBeatId = this.passageNameToBeatId.get(startPassage.name) || '';
      }
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
    // Use appropriate parser based on format
    const parsed = this.format === 'harlowe'
      ? HarloweParser.parse(storyInit.content)
      : SugarCubeParser.parse(storyInit.content);

    // Create a SetVariable beat for each set operation
    for (const setOp of parsed.setOperations) {
      const beatId = this.generateBeatId();
      // Use format-appropriate parser for value
      const parsedValue = this.format === 'harlowe'
        ? HarloweParser.parseValue(setOp.value)
        : SugarCubeParser.parseValue(setOp.value);
      const config: BeatConfig = {
        id: beatId,
        name: `Init: ${setOp.variable}`,
        type: 'setVariable',
        parameters: {
          variable: setOp.variable,
          value: parsedValue,
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
  private inferVariableType(value: string | number | boolean): 'variable' | 'counter' {
    // If already a number, it's a counter
    if (typeof value === 'number') {
      return 'counter';
    }
    // If already a boolean, it's a variable
    if (typeof value === 'boolean') {
      return 'variable';
    }
    // Parse string values
    const parsed = this.format === 'harlowe'
      ? HarloweParser.parseValue(value)
      : SugarCubeParser.parseValue(value);
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
      case 'infoText':
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
        // Extract restart button text from any link in the passage (e.g., "Try again")
        // If no link, default to 'Play Again'
        const restartButtonText = choices.length > 0 ? choices[0].text : 'Play Again';
        return {
          message: displayText, // EndScreenBeat uses 'message' not 'text'
          showRestart: true,
          // Set both buttonText (legacy) and restartText (new) for compatibility
          buttonText: restartButtonText,
          restartText: restartButtonText,
        };

      case 'setVariable':
        if (parsed.setOperations.length > 0) {
          const op = parsed.setOperations[0];
          // Use format-appropriate parser for value
          const parsedValue = this.format === 'harlowe'
            ? HarloweParser.parseValue(op.value)
            : SugarCubeParser.parseValue(op.value);
          return {
            variable: op.variable,
            value: parsedValue,
            type: this.inferVariableType(op.value),
          };
        }
        return {};

      case 'conditionBeat':
        // Extract condition from the first branching conditional (skip else-if as they're part of preceding conditional)
        for (const conditional of parsed.conditionals) {
          if (!conditional.hasBranchingLinks || conditional.isElseIf) continue;
          const conditionData = this.format === 'harlowe'
            ? HarloweParser.convertCondition(conditional.condition)
            : SugarCubeParser.convertCondition(conditional.condition);

          if (conditionData) {
            const thenTarget = conditional.thenLinks[0]?.target || '';
            const elseTarget = conditional.elseLinks[0]?.target;
            const conditionType = this.inferVariableType(conditionData.value) === 'counter' ? 'counter' : 'variable';

            return {
              conditionType,
              variableName: conditionData.variableName,
              operator: conditionData.operator,
              value: conditionData.value,
              trueTarget: thenTarget,  // Passage name, resolved later (or intermediate beat ID)
              falseTarget: elseTarget, // Passage name, resolved later (or intermediate beat ID)
            };
          }
        }
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

    // For conditionBeat, build connections from conditionals (skip else-if as they're part of preceding conditional)
    if (analyzed.suggestedBeatType === 'conditionBeat' && analyzed.hasConditionalBranching) {
      for (const conditional of analyzed.parsed.conditionals) {
        if (!conditional.hasBranchingLinks || conditional.isElseIf) continue;
        // Use appropriate parser for condition conversion
        const conditionData = this.format === 'harlowe'
          ? HarloweParser.convertCondition(conditional.condition)
          : SugarCubeParser.convertCondition(conditional.condition);

        // Add connection for the "then" branch (with condition)
        if (conditional.thenLinks.length > 0) {
          const thenTarget = conditional.thenLinks[0].target;
          if (conditionData) {
            const conditionObj: Condition = {
              type: this.inferVariableType(conditionData.value) === 'counter' ? 'counter' : 'variable',
              variableName: conditionData.variableName,
              operator: conditionData.operator as Condition['operator'],
              value: conditionData.value,
            };
            connections.push({
              targetId: thenTarget,
              condition: conditionObj,
            });
          } else {
            // Couldn't parse condition, add without condition
            connections.push({
              targetId: thenTarget,
            });
          }
        }

        // Add connection for the "else" branch (no condition = default)
        if (conditional.elseLinks.length > 0) {
          const elseTarget = conditional.elseLinks[0].target;
          connections.push({
            targetId: elseTarget,
          });
        }
      }
      return connections;
    }

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

      // Use format-appropriate parser for value
      const parsedValue = this.format === 'harlowe'
        ? HarloweParser.parseValue(op.value)
        : SugarCubeParser.parseValue(op.value);

      const config: BeatConfig = {
        id: beatId,
        name: `Set: ${op.variable}`,
        type: 'setVariable',
        parameters: {
          variable: op.variable,
          value: parsedValue,
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

      const conditionType = this.inferVariableType(condition.value) === 'counter' ? 'counter' : 'variable';
      const config: BeatConfig = {
        id: beatId,
        name: `Condition: ${condition.variableName}`,
        type: 'conditionBeat',
        connections,
        parameters: {
          conditionType,
          variableName: condition.variableName,
          operator: condition.operator,
          value: condition.value,
          trueTarget: condition.thenTarget,
          falseTarget: condition.elseTarget,
        },
      };

      return this.registry.createBeat('conditionBeat', config);
    }

    return null;
  }

  /**
   * Create intermediate IntroText beats for conditional content
   * When a conditional has narrative text before a link, we need a separate beat for that text
   */
  private createConditionalContentBeats(analyzed: AnalyzedPassage): Beat[] {
    const beats: Beat[] = [];
    const linkRegex = this.format === 'harlowe'
      ? /\[\[([^\[\]|]+?)->([^\[\]]+?)\]\]|\[\[([^\[\]|]+?)<-([^\[\]]+?)\]\]|\[\[([^\[\]|]+?)\|([^\[\]]+?)\]\]|\[\[([^\[\]|]+?)\]\]/g
      : /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

    // Helper to strip links and get pure text
    const stripLinks = (content: string): string => {
      return (content || '').replace(linkRegex, '').trim();
    };

    // Helper to check if text is substantial (more than just whitespace or very short)
    const isSubstantialText = (text: string): boolean => {
      const stripped = text.replace(/\s+/g, ' ').trim();
      return stripped.length > 10;
    };

    for (const conditional of analyzed.parsed.conditionals) {
      if (!conditional.hasBranchingLinks) continue;
      // Skip else-if conditionals - they're already handled as part of the preceding conditional's else branch
      if (conditional.isElseIf) continue;

      // Check "then" content for substantial text
      const thenText = stripLinks(conditional.thenContent);
      if (isSubstantialText(thenText) && conditional.thenLinks.length > 0) {
        const beatId = this.generateBeatId();
        const finalTarget = conditional.thenLinks[0].target;
        const linkText = conditional.thenLinks[0].text;

        const config: BeatConfig = {
          id: beatId,
          name: `${analyzed.passage.name} (True)`,
          type: 'infoText',
          parameters: {
            text: thenText,
            buttonText: linkText || 'Continue', // Use link text for button
          },
          defaultTarget: finalTarget, // Passage name, resolved later
        };

        beats.push(this.registry.createBeat('infoText', config));

        // Store mapping so conditionBeat can point here instead of final target
        this.conditionalContentBeatIds.set(`${analyzed.passage.name}:then`, beatId);
      }

      // Check "else" content for substantial text
      const elseText = stripLinks(conditional.elseContent || '');
      if (isSubstantialText(elseText) && conditional.elseLinks.length > 0) {
        const beatId = this.generateBeatId();
        const finalTarget = conditional.elseLinks[0].target;
        const linkText = conditional.elseLinks[0].text;

        const config: BeatConfig = {
          id: beatId,
          name: `${analyzed.passage.name} (False)`,
          type: 'infoText',
          parameters: {
            text: elseText,
            buttonText: linkText || 'Continue', // Use link text for button
          },
          defaultTarget: finalTarget, // Passage name, resolved later
        };

        beats.push(this.registry.createBeat('infoText', config));

        // Store mapping so conditionBeat can point here instead of final target
        this.conditionalContentBeatIds.set(`${analyzed.passage.name}:else`, beatId);
      }
    }

    return beats;
  }

  /**
   * Resolve passage names to beat IDs in all connections
   * If a passage has additional beats (SetVariable, etc.), redirect to the first additional beat
   */
  private resolveConnections(beats: Beat[]): void {
    // Helper to resolve a passage name to the correct target beat ID
    // If the passage has additional beats, return the first additional beat ID instead
    const resolveTarget = (passageName: string): string | undefined => {
      // First check if there's an additional beat that should run first
      const firstAdditionalId = this.passageNameToFirstAdditionalBeatId.get(passageName);
      if (firstAdditionalId) {
        return firstAdditionalId;
      }
      // Otherwise return the main beat ID
      return this.passageNameToBeatId.get(passageName);
    };

    for (const beat of beats) {
      const connections = beat.getConnections();
      const resolvedConnections: Connection[] = [];

      for (const conn of connections) {
        // Check if targetId is a passage name
        const beatId = resolveTarget(conn.targetId);
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
            const beatId = resolveTarget(choice.target);
            if (beatId) {
              choice.target = beatId;
            }
          }
        }
        beat.updateParameters({ dialogTree });
      } else if (beat.type === 'hyperText' && params.hyperlinks) {
        // Update HyperText links
        for (const link of params.hyperlinks) {
          const beatId = resolveTarget(link.targetBeatId);
          if (beatId) {
            link.targetBeatId = beatId;
          }
        }
        beat.updateParameters({ hyperlinks: params.hyperlinks });
      } else if (beat.type === 'conditionBeat') {
        // Update ConditionBeat trueTarget and falseTarget
        const updates: Record<string, string> = {};
        if (params.trueTarget) {
          const beatId = resolveTarget(params.trueTarget);
          if (beatId) {
            updates.trueTarget = beatId;
          }
        }
        if (params.falseTarget) {
          const beatId = resolveTarget(params.falseTarget);
          if (beatId) {
            updates.falseTarget = beatId;
          }
        }
        if (Object.keys(updates).length > 0) {
          beat.updateParameters(updates);
        }
      }

      // Update defaultTarget if it's a passage name
      if (beat.defaultTarget) {
        const beatId = resolveTarget(beat.defaultTarget);
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
    format: TwineFormat;
  } {
    const story = TwineParser.parse(html);
    const regularPassages = TwineParser.getRegularPassages(story);

    // Detect format
    const format: TwineFormat = TwineParser.isHarlowe(story)
      ? 'harlowe'
      : TwineParser.isSugarCube(story)
        ? 'sugarcube'
        : 'unknown';

    const analysis = PassageAnalyzer.analyzeAll(regularPassages, format);

    return {
      story,
      analysis,
      title: TwineParser.getStoryTitle(story),
      author: TwineParser.getStoryAuthor(story),
      format,
    };
  }
}
