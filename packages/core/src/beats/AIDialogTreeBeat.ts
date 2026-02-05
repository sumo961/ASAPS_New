import { Beat } from './Beat';
import type { BeatConfig, Location } from '../types';
import type { IRenderer } from '../types';
import { StoryContext } from '../engine/StoryContext';
import { PlayerContextBuilder } from '../utils/PlayerContextBuilder';
import type { DialogNode, DialogChoice } from '../generated/beat-types';

export interface AIDialogExitTarget {
  /** Target beat ID */
  id: string;
  /** Description for AI to know when to use this exit */
  description: string;
}

export interface AIDialogTreeBeatParams {
  /** Scene description for context */
  scenario: string;

  /** NPC name the player is talking to */
  npcName: string;

  /** NPC personality traits (optional) */
  npcPersonality?: string;

  /** Include player variables in context */
  includeVariables?: boolean;

  /** Include player inventory in context */
  includeInventory?: boolean;

  /** Include visited beats in context */
  includeVisitedBeats?: boolean;

  /** Include rich choice history in context */
  includeChoiceHistory?: boolean;

  /** Maximum conversation turns */
  maxTurns?: number;

  /** Dialog presentation style */
  presentationMode?: 'positioned' | 'chat-scroll' | 'chat-bubble';

  /** Show character avatars in chat mode */
  showAvatars?: boolean;

  /** Exit targets with descriptions for AI */
  exitTargets: AIDialogExitTarget[];

  /** System instructions for the AI (optional) */
  systemInstructions?: string;

  /** Delay before showing choices */
  choiceDelay?: number;
}

/**
 * AIDialogTreeBeat - Generate personalized dialog trees at runtime using AI
 *
 * This beat generates a complete dialog tree based on:
 * - The scenario description
 * - NPC character information
 * - Player's current state (variables, inventory, history)
 *
 * The AI creates dialog that references the player's choices and personalizes
 * the conversation accordingly.
 */
export class AIDialogTreeBeat extends Beat {
  public scenario: string;
  public npcName: string;
  public npcPersonality?: string;
  public includeVariables: boolean;
  public includeInventory: boolean;
  public includeVisitedBeats: boolean;
  public includeChoiceHistory: boolean;
  public maxTurns: number;
  public presentationMode: 'positioned' | 'chat-scroll' | 'chat-bubble';
  public showAvatars: boolean;
  public exitTargets: AIDialogExitTarget[];
  public systemInstructions?: string;
  public choiceDelay?: number;

  private generatedTree: DialogNode | null = null;
  private currentNode: DialogNode | null = null;
  private lastContextHash: string | null = null; // Track context to detect changes

  constructor(config: BeatConfig & {
    parameters?: Partial<AIDialogTreeBeatParams>;
  } & Partial<AIDialogTreeBeatParams>) {
    super(config);
    const params = config.parameters || {};

    this.scenario = params.scenario || config.scenario || '';
    this.npcName = params.npcName || config.npcName || 'Character';
    this.npcPersonality = params.npcPersonality || config.npcPersonality;
    this.includeVariables = params.includeVariables ?? config.includeVariables ?? true;
    this.includeInventory = params.includeInventory ?? config.includeInventory ?? true;
    this.includeVisitedBeats = params.includeVisitedBeats ?? config.includeVisitedBeats ?? true;
    this.includeChoiceHistory = params.includeChoiceHistory ?? config.includeChoiceHistory ?? true;
    this.maxTurns = params.maxTurns || config.maxTurns || 3;
    this.presentationMode = params.presentationMode || config.presentationMode || 'positioned';
    this.showAvatars = params.showAvatars ?? config.showAvatars ?? true;
    this.exitTargets = params.exitTargets || config.exitTargets || [];
    this.systemInstructions = params.systemInstructions || config.systemInstructions;
    this.choiceDelay = params.choiceDelay || config.choiceDelay;
  }

  getParameters(): Record<string, any> {
    return {
      scenario: this.scenario,
      npcName: this.npcName,
      npcPersonality: this.npcPersonality,
      includeVariables: this.includeVariables,
      includeInventory: this.includeInventory,
      includeVisitedBeats: this.includeVisitedBeats,
      includeChoiceHistory: this.includeChoiceHistory,
      maxTurns: this.maxTurns,
      presentationMode: this.presentationMode,
      showAvatars: this.showAvatars,
      exitTargets: this.exitTargets,
      systemInstructions: this.systemInstructions,
      choiceDelay: this.choiceDelay,
    };
  }

  updateParameters(params: Record<string, any>): void {
    if (params.scenario !== undefined) this.scenario = params.scenario;
    if (params.npcName !== undefined) this.npcName = params.npcName;
    if (params.npcPersonality !== undefined) this.npcPersonality = params.npcPersonality;
    if (params.includeVariables !== undefined) this.includeVariables = params.includeVariables;
    if (params.includeInventory !== undefined) this.includeInventory = params.includeInventory;
    if (params.includeVisitedBeats !== undefined) this.includeVisitedBeats = params.includeVisitedBeats;
    if (params.includeChoiceHistory !== undefined) this.includeChoiceHistory = params.includeChoiceHistory;
    if (params.maxTurns !== undefined) this.maxTurns = params.maxTurns;
    if (params.presentationMode !== undefined) this.presentationMode = params.presentationMode;
    if (params.showAvatars !== undefined) this.showAvatars = params.showAvatars;
    if (params.exitTargets !== undefined) this.exitTargets = params.exitTargets;
    if (params.systemInstructions !== undefined) this.systemInstructions = params.systemInstructions;
    if (params.choiceDelay !== undefined) this.choiceDelay = params.choiceDelay;
  }

  /**
   * Override getConnections to return connections from exit targets
   */
  getConnections(): Array<{ targetId: string; label?: string; condition?: any }> {
    const connections: Array<{ targetId: string; label?: string; condition?: any }> = [];

    // Add connections from exit targets
    for (const target of this.exitTargets) {
      connections.push({
        targetId: target.id,
        label: target.description.slice(0, 20) + (target.description.length > 20 ? '...' : ''),
      });
    }

    // Also include any base connections
    const baseConnections = super.getConnections();
    for (const conn of baseConnections) {
      if (!connections.some(c => c.targetId === conn.targetId)) {
        connections.push(conn);
      }
    }

    return connections;
  }

  protected async performAction(
    context: StoryContext,
    renderer: IRenderer
  ): Promise<string | null> {
    // Check if AI service is available
    const aiService = renderer.getState('aiService');
    if (!aiService || typeof aiService.generateDialog !== 'function') {
      console.warn(`[AIDialogTreeBeat ${this.id}] AI service not configured`);
      // Fall back to showing a simple message
      await renderer.renderText(
        'AI features require configuration. Please set up AI in settings.',
        'Continue',
        Array.from(this.locations.values())
      );
      return this.exitTargets[0]?.id || this.getNextBeat(context);
    }

    // Set presentation mode for consistent styling with regular DialogTreeBeat
    renderer.setState('presentationMode', this.presentationMode || 'positioned');
    renderer.setState('showAvatars', this.showAvatars ?? true);
    // Mark this as an AI dialog tree for centering in PositionedBeatView
    renderer.setState('currentBeatType', 'aiDialogTree');
    // Default responseDelay to 1.5s for chat modes if not explicitly set
    const isChatMode = this.presentationMode && this.presentationMode !== 'positioned';
    const defaultDelay = isChatMode ? 1.5 : 0;
    renderer.setState('responseDelay', defaultDelay);

    // Set player name for chat display (try common variable names)
    const variables = context.getVariables();
    const playerName = variables.playerName || variables.name || variables.player || 'You';
    renderer.setState('playerName', playerName);

    // Clear chat history when starting a new dialog in chat mode
    if (this.presentationMode && this.presentationMode !== 'positioned') {
      if (renderer.clearChatHistory) {
        renderer.clearChatHistory();
      }
    }

    try {
      // Create a hash of key context to detect if we need to regenerate
      const contextHash = this.createContextHash(context);
      const needsRegeneration = !this.generatedTree || this.lastContextHash !== contextHash;

      // Generate dialog tree if not already generated OR if context has changed
      if (needsRegeneration) {
        // Clear any existing tree from previous playthrough
        this.generatedTree = null;
        this.currentNode = null;

        // Show loading indicator while generating dialog tree
        if (renderer.renderLoading) {
          const npcName = this.npcName || 'the character';
          const loadingMessages = [
            `Preparing conversation with ${npcName}...`,
            `${npcName} is getting ready to speak...`,
            `Setting up the conversation...`,
            `Let me connect you with ${npcName}...`,
          ];
          const message = loadingMessages[Math.floor(Math.random() * loadingMessages.length)];
          renderer.renderLoading(message, {
            subMessage: 'Generating personalized dialog',
            spinnerType: 'dots',
          });
        }

        this.generatedTree = await this.generateDialogTree(context, aiService);
        this.lastContextHash = contextHash;
      }

      // Execute the dialog tree
      const result = await this.executeDialogTree(context, renderer);
      return result;
    } catch (error) {
      console.error(`[AIDialogTreeBeat ${this.id}] Error:`, error);
      await renderer.renderText(
        'An error occurred during the conversation.',
        'Continue',
        Array.from(this.locations.values())
      );
      return this.exitTargets[0]?.id || this.getNextBeat(context);
    }
  }

  /**
   * Create a hash of key context values to detect if we need to regenerate
   * This ensures we regenerate when player name, location, or key variables change
   */
  private createContextHash(context: StoryContext): string {
    const variables = context.getVariables();
    const counters = context.getCounters();

    // Key values that should trigger regeneration if changed
    const keyValues = [
      variables.playerName || variables.name || '',
      variables.location || variables.city || '',
      variables.gender || '',
      variables.profession || variables.role || '',
      // Include all variable values when includeVariables is true
      ...(this.includeVariables
        ? Object.entries(variables).map(([k, v]) => `${k}:${String(v)}`)
        : []),
      // Include counter values as they may affect dialog
      ...Object.entries(counters).map(([k, v]) => `${k}:${v}`),
    ];

    // Include choice history if enabled
    if (this.includeChoiceHistory) {
      const choiceHistory = context.getChoiceHistory();
      if (choiceHistory.length > 0) {
        const choiceKeys = choiceHistory.map(c => `${c.beatId}:${c.choiceText}`);
        keyValues.push(`choices:${choiceKeys.join(',')}`);
      }
    }

    return keyValues.join('|');
  }

  /**
   * Generate a dialog tree using AI
   */
  private async generateDialogTree(context: StoryContext, aiService: any): Promise<DialogNode> {
    // Build player context
    const story = context.getStory();
    const contextBuilder = new PlayerContextBuilder(context, story);
    const playerContext = contextBuilder.buildPromptContext({
      includeVariables: this.includeVariables,
      includeInventory: this.includeInventory,
      includeHistory: this.includeVisitedBeats,
      includeChoiceHistory: this.includeChoiceHistory,
    });

    // Build exit target descriptions
    const exitDescriptions = this.exitTargets
      .map(t => `- "${t.id}": ${t.description}`)
      .join('\n');

    // Build the generation prompt
    const prompt = `Generate a dialog tree for the following scenario:

SCENARIO: ${this.scenario}

NPC: ${this.npcName}
${this.npcPersonality ? `PERSONALITY: ${this.npcPersonality}` : ''}

PLAYER CONTEXT:
${playerContext}

EXIT TARGETS (when the conversation should end):
${exitDescriptions}

${this.systemInstructions ? `ADDITIONAL INSTRUCTIONS: ${this.systemInstructions}` : ''}

REQUIREMENTS:
1. Generate a branching dialog tree with up to ${this.maxTurns} conversation turns
2. The NPC should respond based on the player's known state (name, choices, inventory)
3. Each dialog node has: speaker, text, and 2-4 player choices
4. Each choice should lead to either another dialog node OR an exit target
5. Personalize the dialog based on player variables (e.g., use their name, reference their profession)
6. Make the conversation feel natural and engaging

CRITICAL STRUCTURE RULES:
- The "text" field contains EVERYTHING the NPC says, including greetings AND follow-up questions
- The "choices" array contains ONLY what the PLAYER would say in response
- If the NPC asks a question, put the question IN THE TEXT FIELD, then put possible player ANSWERS in choices

WRONG EXAMPLE (NPC question in choices):
{
  "text": "Hello! Nice to meet you.",
  "choices": [{ "text": "What brings you here today?" }]  // WRONG! This is NPC asking, not player!
}

CORRECT EXAMPLE (NPC question in text, player answers in choices):
{
  "text": "Hello! Nice to meet you. What brings you here today?",
  "choices": [
    { "text": "I'm looking for information about transportation." },  // Player's answer
    { "text": "Just browsing, thanks." }  // Player's answer
  ]
}

Return a JSON object with this structure:
{
  "id": "root",
  "speaker": "NPC Name",
  "text": "NPC's complete speech including any questions they ask",
  "choices": [
    {
      "id": "c1",
      "text": "What the PLAYER says in response",
      "dialogNode": { /* nested dialog node with NPC's next speech */ }
    },
    {
      "id": "c2",
      "text": "Alternative PLAYER response",
      "target": "exit_target_id"
    }
  ]
}`;

    console.log(`[AIDialogTreeBeat ${this.id}] Generating dialog tree...`);

    const response = await aiService.generateDialog({
      prompt,
      format: 'dialogTree',
      maxTurns: this.maxTurns,
    });

    // Parse and validate the response
    let dialogTree: DialogNode;
    if (typeof response === 'string') {
      // First, try to repair/extract JSON from the response
      // This handles cases where AI includes extra content before or after JSON
      const jsonStr = this.repairJSON(response);

      try {
        dialogTree = JSON.parse(jsonStr);
      } catch (parseError) {
        console.error(`[AIDialogTreeBeat] JSON parse failed after repair:`, parseError);
        console.error(`[AIDialogTreeBeat] Attempted to parse: ${jsonStr.substring(0, 500)}...`);
        throw new Error(`Could not parse AI response as JSON: ${(parseError as Error).message}`);
      }
    } else {
      dialogTree = response;
    }

    // Validate and fix the dialog tree
    return this.validateDialogTree(dialogTree);
  }

  /**
   * Attempt to repair common JSON issues from AI-generated content
   */
  private repairJSON(jsonStr: string): string {
    let repaired = jsonStr;

    // Remove any thinking/reasoning that might be before the JSON
    const jsonStart = repaired.indexOf('{');
    if (jsonStart === -1) {
      console.error(`[AIDialogTreeBeat] No JSON object found in response`);
      throw new Error('No JSON object found in AI response');
    }
    if (jsonStart > 0) {
      console.log(`[AIDialogTreeBeat] Removing ${jsonStart} chars before JSON`);
      repaired = repaired.slice(jsonStart);
    }

    // Remove trailing content after the JSON by finding the matching closing brace
    let braceCount = 0;
    let inString = false;
    let escaped = false;
    let jsonEnd = repaired.length;
    let foundEnd = false;

    for (let i = 0; i < repaired.length; i++) {
      const char = repaired[i];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '{') braceCount++;
        if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            jsonEnd = i + 1;
            foundEnd = true;
            break;
          }
        }
      }
    }

    if (foundEnd && jsonEnd < repaired.length) {
      console.log(`[AIDialogTreeBeat] Removing ${repaired.length - jsonEnd} chars after JSON`);
    }
    repaired = repaired.slice(0, jsonEnd);

    // Fix trailing commas before ] or }
    repaired = repaired.replace(/,(\s*[}\]])/g, '$1');

    // Fix missing commas between array elements (common issue)
    // Look for patterns like: } { or } " or " { without commas
    repaired = repaired.replace(/}(\s*){/g, '},$1{');
    repaired = repaired.replace(/}(\s*)"/g, '},$1"');
    repaired = repaired.replace(/"(\s*){/g, '",$1{');

    // Fix unescaped newlines in strings (replace with space)
    repaired = repaired.replace(/("(?:[^"\\]|\\.)*")/g, (match) => {
      return match.replace(/[\n\r]/g, ' ');
    });

    // Remove any control characters
    repaired = repaired.replace(/[\x00-\x1F\x7F]/g, (char) => {
      if (char === '\n' || char === '\r' || char === '\t') {
        return char; // Keep these for structure
      }
      return ' '; // Replace others with space
    });

    return repaired;
  }

  /**
   * Validate and fix the dialog tree structure
   */
  private validateDialogTree(node: any): DialogNode {
    const validNode: DialogNode = {
      id: node.id || `node_${Date.now()}`,
      speaker: node.speaker || this.npcName,
      text: node.text || '',
      emotion: node.emotion,
      choices: [],
    };

    if (node.choices && Array.isArray(node.choices)) {
      validNode.choices = node.choices.map((choice: any, index: number) => {
        const validChoice: DialogChoice = {
          id: choice.id || `choice_${index}`,
          text: choice.text || 'Continue',
        };

        // Handle target (string = exit beat ID)
        if (typeof choice.target === 'string') {
          // Validate that the target is a valid exit target
          const isValidExit = this.exitTargets.some(t => t.id === choice.target);
          if (isValidExit) {
            validChoice.target = choice.target;
          } else {
            // If not a valid exit, treat as the first exit target
            validChoice.target = this.exitTargets[0]?.id;
          }
        }

        // Handle nested dialog node
        if (choice.dialogNode && typeof choice.dialogNode === 'object') {
          validChoice.dialogNode = this.validateDialogTree(choice.dialogNode);
        }

        // Ensure choice has either target or dialogNode
        if (!validChoice.target && !validChoice.dialogNode) {
          validChoice.target = this.exitTargets[0]?.id;
        }

        return validChoice;
      });
    }

    // Ensure there's at least one choice
    if (validNode.choices.length === 0) {
      validNode.choices = [{
        id: 'default_exit',
        text: 'Continue',
        target: this.exitTargets[0]?.id,
      }];
    }

    return validNode;
  }

  /**
   * Execute the dialog tree interactively
   * Uses the same rendering approach as DialogTreeBeat for consistent styling
   */
  private async executeDialogTree(
    context: StoryContext,
    renderer: IRenderer
  ): Promise<string | null> {
    if (!this.generatedTree) {
      return this.getNextBeat(context);
    }

    // Start with the root node
    this.currentNode = this.generatedTree;
    const locations = Array.from(this.locations.values());

    while (this.currentNode) {
      const node: DialogNode = this.currentNode;

      // Process text with variable interpolation
      const processedSpeaker = this.processText(node.speaker, context);
      const processedText = this.processText(node.text, context);

      // Render the NPC/system dialog (this shows the speaker's text)
      await renderer.renderDialog(
        processedSpeaker,
        processedText,
        node.emotion,
        locations
      );

      // Filter visible choices
      const visibleChoices: DialogChoice[] = node.choices.filter((choice: DialogChoice) => {
        if (choice.visible === false) return false;
        // Check conditions if present
        if (choice.conditions) {
          return choice.conditions.every(cond => context.checkCondition(cond));
        }
        return true;
      });

      if (visibleChoices.length === 0) {
        // No choices, end dialog
        return this.exitTargets[0]?.id || this.getNextBeat(context);
      }

      // Apply delay if configured (before showing choices)
      if (this.choiceDelay && this.choiceDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, this.choiceDelay! * 1000));
      }

      // Process choice text with variable interpolation and render choices
      // Use renderChoices (same as DialogTreeBeat) for consistent styling
      // Include isExit flag to indicate if choice exits to another beat (skip typing animation)
      const choiceOptions = visibleChoices.map((c: DialogChoice) => ({
        id: c.id,
        text: this.processText(c.text, context),
        isExit: !!c.target && !c.dialogNode, // Exit if has target but no nested dialog
      }));

      const chosenId = await renderer.renderChoices(choiceOptions, locations);

      // Find the chosen choice
      const chosen: DialogChoice | undefined = visibleChoices.find((c: DialogChoice) => c.id === chosenId);
      if (!chosen) {
        // Fallback
        return this.exitTargets[0]?.id || this.getNextBeat(context);
      }

      // Apply any effects from the choice
      if (chosen.effects) {
        for (const effect of chosen.effects) {
          context.applyEffect(effect);
        }
      }

      // Check if this choice exits to a beat
      if (chosen.target) {
        return chosen.target;
      }

      // Continue to nested dialog node
      if (chosen.dialogNode) {
        this.currentNode = chosen.dialogNode;
      } else {
        // No more nodes, exit
        return this.exitTargets[0]?.id || this.getNextBeat(context);
      }
    }

    return this.getNextBeat(context);
  }
}
