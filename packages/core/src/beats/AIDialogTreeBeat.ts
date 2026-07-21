import { Beat } from './Beat';
import type { BeatConfig, Location } from '../types';
import type { IRenderer } from '../types';
import { StoryContext } from '../engine/StoryContext';
import { PlayerContextBuilder } from '../utils/PlayerContextBuilder';
import { waitForTTS, waitForReadingTime } from '../utils/ttsWait';
import { buildDossierForRef, resolveCharacterDisplayName } from '../utils/dossier';
import type { DialogNode, DialogChoice } from '../generated/beat-types';
import {
  type DialogTreeLayoutTemplate,
  normalizeDialogTreeLayoutTemplate,
  isChatLayoutTemplate,
} from './DialogTreeBeat';

export interface AIDialogExitTarget {
  /** Target beat ID */
  id: string;
  /** Description for AI to know when to use this exit */
  description: string;
  /** Prompt for AI to generate a farewell NPC message when exiting via this target */
  npcExitMessage?: string;
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

  /** Authoritative layout template (matches DialogTreeBeat). */
  layoutTemplate?: DialogTreeLayoutTemplate;

  /** @deprecated legacy dialog presentation style — migrated to layoutTemplate. */
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
  /** Transient: the NPC's resolved human display name for the current run.
   *  Set at the top of performAction (npcName may be a Character.id) and read
   *  by generateDialogTree / validateDialogTree / exit handling, which run in
   *  separate methods where the performAction local is out of scope. */
  private _npcDisplay = '';
  public includeVariables: boolean;
  public includeInventory: boolean;
  public includeVisitedBeats: boolean;
  public includeChoiceHistory: boolean;
  public maxTurns: number;
  /** Authoritative layout field, matching DialogTreeBeat (v0.9.62). The legacy
   *  presentationMode is migrated forward in the constructor / updateParameters
   *  and surfaced in getParameters for one release for round-trip compat. */
  public layoutTemplate: DialogTreeLayoutTemplate;
  /** @deprecated read from layoutTemplate. Kept for legacy round-trip. */
  public presentationMode: 'positioned' | 'chat-scroll' | 'chat-bubble';
  public showAvatars: boolean;
  public exitTargets: AIDialogExitTarget[];
  public systemInstructions?: string;
  public choiceDelay?: number;

  private generatedTree: DialogNode | null = null;
  private currentNode: DialogNode | null = null;
  private lastContextHash: string | null = null; // Track context to detect changes
  private lastRoutingPlan: string | null = null; // AI's exit routing reasoning

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
    // v0.9.62-style layout unification (was missing on aiDialogTree — the VE
    // dropdown read a non-existent layoutTemplate and always showed 'stacked'
    // while the beat rendered from the legacy presentationMode, so a chat-mode
    // beat looked stacked in the picker but ran as chat). Migrate:
    //   'positioned' → 'stacked'; 'chat-scroll'/'chat-bubble' kept verbatim.
    const legacyPM = (params.presentationMode ?? config.presentationMode) as
      | 'positioned' | 'chat-scroll' | 'chat-bubble' | undefined;
    const legacyMigrated: DialogTreeLayoutTemplate | undefined =
      legacyPM === 'positioned' ? 'stacked'
      : legacyPM === 'chat-scroll' ? 'chat-scroll'
      : legacyPM === 'chat-bubble' ? 'chat-bubble'
      : undefined;
    const rawTemplate = (config as any).layoutTemplate
      ?? (params as any).layoutTemplate
      ?? legacyMigrated;
    this.layoutTemplate = normalizeDialogTreeLayoutTemplate(rawTemplate);
    this.presentationMode = legacyPM ?? 'positioned';
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
      layoutTemplate: this.layoutTemplate,
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
    // layoutTemplate is authoritative; a stale presentationMode-only write
    // (legacy readers) still migrates forward. layoutTemplate wins if both set.
    if (params.layoutTemplate !== undefined) {
      this.layoutTemplate = normalizeDialogTreeLayoutTemplate(params.layoutTemplate);
      if (params.presentationMode !== undefined) this.presentationMode = params.presentationMode;
    } else if (params.presentationMode !== undefined) {
      this.presentationMode = params.presentationMode;
      this.layoutTemplate = params.presentationMode === 'chat-scroll'
        ? 'chat-scroll'
        : params.presentationMode === 'chat-bubble'
          ? 'chat-bubble'
          : 'stacked';
    }
    if (params.showAvatars !== undefined) this.showAvatars = params.showAvatars;
    if (params.exitTargets !== undefined) {
      this.exitTargets = params.exitTargets;
      // Clear stored connections — getConnections() derives them from exitTargets
      this.clearConnections();
    }
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

  /**
   * Prefetch AI content in the background so it's cached when the beat executes.
   * Called by StoryEngine when this beat is the next beat to be executed.
   * Does NOT render anything - only generates and caches the dialog tree.
   */
  async prefetch(context: StoryContext, renderer: IRenderer): Promise<void> {
    try {
      const aiService = renderer.getState('aiService');
      if (!aiService || typeof aiService.generateDialog !== 'function') return;

      const contextHash = this.createContextHash(context);
      if (this.generatedTree && this.lastContextHash === contextHash) return; // already cached

      console.log(`[AIDialogTreeBeat ${this.id}] Prefetching dialog tree...`);
      try {
        this.generatedTree = await this.generateDialogTree(context, aiService);
      } catch (firstErr) {
        // JSON parse errors are common with complex dialog trees — retry once
        console.log(`[AIDialogTreeBeat ${this.id}] Prefetch attempt 1 failed (${(firstErr as Error).message}), retrying...`);
        this.generatedTree = await this.generateDialogTree(context, aiService);
      }
      this.lastContextHash = contextHash;
      console.log(`[AIDialogTreeBeat ${this.id}] Prefetch complete`);
    } catch (err) {
      // Prefetch failure is non-fatal - will retry on execute
      console.log(`[AIDialogTreeBeat ${this.id}] Prefetch failed (will retry on execute):`, err);
    }
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

    // Set presentation for consistent styling with regular DialogTreeBeat.
    // layoutTemplate is authoritative; presentationMode is derived for any
    // renderer reader still on the legacy field.
    const isChatMode = isChatLayoutTemplate(this.layoutTemplate);
    renderer.setState('layoutTemplate', this.layoutTemplate);
    renderer.setState('presentationMode', isChatMode ? this.layoutTemplate : 'positioned');
    renderer.setState('showAvatars', this.showAvatars ?? true);
    // Mark this as an AI dialog tree for centering in PositionedBeatView
    renderer.setState('currentBeatType', 'aiDialogTree');
    // Default responseDelay to 1.5s for chat modes if not explicitly set
    const defaultDelay = isChatMode ? 1.5 : 0;
    renderer.setState('responseDelay', defaultDelay);

    // Set player name for chat display (try common variable names)
    const variables = context.getVariables();
    const playerName = variables.playerName || variables.name || variables.player || 'You';
    renderer.setState('playerName', playerName);

    // Resolve the NPC field (a canonical Character.id when linked in the
    // inspector) to a human display name for all rendering + LLM-prompt uses.
    // The raw ref is kept for buildDossierForRef, which matches by id.
    this._npcDisplay =
      resolveCharacterDisplayName(this.npcName, (context.getStory() as any)?.getCharacters?.() || [])
      || 'the character';

    // Clear chat history when starting a new dialog in chat mode
    if (isChatMode) {
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
          const npcName = this._npcDisplay;
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

        try {
          this.generatedTree = await this.generateDialogTree(context, aiService);
        } catch (firstErr) {
          // JSON parse errors are common — retry once
          console.log(`[AIDialogTreeBeat ${this.id}] Generation attempt 1 failed (${(firstErr as Error).message}), retrying...`);
          this.generatedTree = await this.generateDialogTree(context, aiService);
        }
        this.lastContextHash = contextHash;
      }

      // Always log routing plan and tree (even when prefetched)
      if (this.lastRoutingPlan) {
        context.recordTimelineEvent({
          type: 'ai-output',
          beatId: this.id,
          beatName: this.name || this.id,
          beatType: 'aiDialogTree',
          text: `[Routing Plan] ${this.lastRoutingPlan}`,
        });
      }

      context.recordTimelineEvent({
        type: 'ai-output',
        beatId: this.id,
        beatName: this.name || this.id,
        beatType: 'aiDialogTree',
        text: JSON.stringify(this.generatedTree),
      });

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
      .map(t => {
        let desc = `- "${t.id}": ${t.description}`;
        if (t.npcExitMessage) desc += ` [NPC will deliver a personalized farewell/response upon exit — the exit choice text should set up a natural lead-in for this]`;
        return desc;
      })
      .join('\n');

    // Re-anchor dossier (Step 2 / Layer 5). When npcName resolves to a defined
    // Character.id, the dossier is built from the authored description + tags +
    // current character-scoped state and prepended to the prompt. The LLM
    // generates dialog grounded in the canonical character data instead of
    // re-imagining the NPC from scratch each beat.
    const characters = (story as any)?.getCharacters?.() || [];
    const characterDossier = buildDossierForRef(this.npcName, characters, context);

    // Build the generation prompt
    const prompt = `Generate a dialog tree for the following scenario:
${characterDossier ? `\n${characterDossier}\n` : ''}
SCENARIO: ${this.scenario}

NPC: ${this._npcDisplay}
${this.npcPersonality ? `PERSONALITY: ${this.npcPersonality}` : ''}

PLAYER CONTEXT:
${playerContext}

EXIT CONDITIONS (treat these as rules — route to an exit when the condition is clearly met):
${exitDescriptions}

${this.systemInstructions ? `ADDITIONAL INSTRUCTIONS: ${this.systemInstructions}` : ''}

REQUIREMENTS:
1. Build a genuinely MULTI-LEVEL branching tree that runs the FULL ${this.maxTurns} conversation turns deep. Turn 1 is the root node; EACH of its choices must lead into a nested "dialogNode" (the NPC's turn-2 reply); EACH turn-2 choice must lead into a further nested "dialogNode" (turn 3); continue nesting until turn ${this.maxTurns}. A flat, single-level tree is WRONG.
2. The NPC should respond based on the player's known state (name, choices, inventory)
3. Each dialog node has: speaker, text, and 2-4 player choices
4. A choice either CONTINUES the conversation with a nested "dialogNode", or EXITS with a "target". Use "target" ONLY when a specific exit condition is genuinely satisfied by that choice. For a turn-limit exit (e.g. "after ${this.maxTurns} turns"), ONLY the choices at the DEEPEST turn (turn ${this.maxTurns}) may use "target" — every earlier-turn choice MUST use "dialogNode". NEVER put a "target" on a turn-1 or turn-2 choice for a turn-limit exit; that collapses the whole tree to a single level.
5. PERSONALIZATION IS CRITICAL: Use the player's actual name, location, profession, and other details from the PLAYER CONTEXT above. Write them directly into the NPC's dialog text (e.g., "Welcome to Stockholm, Mirjam!" not "Welcome to your city!"). Never use placeholder syntax like {playerName}. If you don't know a value, omit it gracefully
6. Make the conversation feel natural and engaging
7. For every choice that has a "target" (exits the conversation), include an "exitReason" field — a concrete explanation of what the player said or expressed that satisfies the exit condition. Be specific, not vague.
8. IMPORTANT: Include a top-level "routingPlan" field that explains your reasoning: how you mapped each exit condition to conversation branches, what player signals you look for, and which context (variables, history) influenced your decisions. This helps authors debug and refine the conversation design.

CRITICAL STRUCTURE RULES:
- The "text" field contains EVERYTHING the NPC says, including greetings AND follow-up questions
- The "choices" array contains ONLY what the PLAYER would say in response
- If the NPC asks a question, put the question IN THE TEXT FIELD, then put possible player ANSWERS in choices

Return a JSON object with this structure. The example below is a 3-turn tree — NEST TO ${this.maxTurns} TURNS. Notice that ONLY the deepest (final-turn) choices carry a "target"; every earlier choice nests a "dialogNode":
{
  "routingPlan": "Explain how you designed the routing and depth. E.g.: 'The only exit is a turn-limit (after 3 turns). So turns 1 and 2 always nest a dialogNode; only the turn-3 choices carry target=beat_69. Branches diverge by the player's attitude (skeptical / curious / dismissive).'",
  "id": "root",
  "speaker": "NPC Name",
  "text": "NPC's complete TURN-1 speech, including the question they ask",
  "choices": [
    {
      "id": "c1",
      "text": "Player's turn-1 response",
      "dialogNode": {
        "id": "n2a",
        "speaker": "NPC Name",
        "text": "NPC's TURN-2 reply that reacts to this choice",
        "choices": [
          {
            "id": "c1a",
            "text": "Player's turn-2 response",
            "dialogNode": {
              "id": "n3a",
              "speaker": "NPC Name",
              "text": "NPC's TURN-3 reply (final turn)",
              "choices": [
                { "id": "c1a1", "text": "Player's final response", "target": "exit_target_id", "exitReason": "Concrete reason the exit condition is now satisfied" }
              ]
            }
          }
        ]
      }
    }
  ]
}
(Give the root 2-4 choices, and likewise at each deeper turn — the example shows one branch for brevity, but you must expand every choice.)`;

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

    // Extract and store routing plan before validation strips it
    // The AI response includes routingPlan as a top-level field alongside DialogNode fields
    const rawTree = dialogTree as DialogNode & { routingPlan?: string };
    if (rawTree.routingPlan) {
      this.lastRoutingPlan = rawTree.routingPlan;
      console.log(`[AIDialogTreeBeat ${this.id}] Routing plan: ${this.lastRoutingPlan}`);
    }

    // Validate and fix the dialog tree
    const validated = this.validateDialogTree(dialogTree);

    // Diagnostic: report the actual shape so a flat tree (model didn't nest)
    // is distinguishable from a nested-but-target-stamped one.
    const measure = (node: DialogNode, depth = 1): { maxDepth: number; nested: number; targets: number } => {
      let maxDepth = depth, nested = 0, targets = 0;
      for (const c of node.choices || []) {
        if (c.dialogNode) { nested++; const s = measure(c.dialogNode, depth + 1); maxDepth = Math.max(maxDepth, s.maxDepth); nested += s.nested; targets += s.targets; }
        if (c.target) targets++;
      }
      return { maxDepth, nested, targets };
    };
    const shape = measure(validated);
    console.log(`[AIDialogTreeBeat ${this.id}] Tree shape: maxDepth=${shape.maxDepth} (maxTurns=${this.maxTurns}), nested dialogNodes=${shape.nested}, choices-with-target=${shape.targets}`);
    if (this.maxTurns > 1 && shape.nested === 0) {
      console.warn(`[AIDialogTreeBeat ${this.id}] ⚠ Model produced a FLAT tree (no nested dialogNodes) despite maxTurns=${this.maxTurns}. The conversation will end after one turn.`);
    }

    return validated;
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
      speaker: node.speaker || this._npcDisplay,
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
          // Preserve the AI-generated exit reason
          if (choice.exitReason) {
            (validChoice as any).exitReason = choice.exitReason;
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
    const aiService = renderer.getState('aiService');

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

      // Find the chosen choice. renderChoices resolves with the button's
      // action id when set, but falls back to the choice TEXT when it isn't —
      // so match by id first, then by text (raw or processed), mirroring
      // DialogTreeBeat. Without the text fallback, chosen was undefined and the
      // beat exited at turn 1 even though the tree was fully nested.
      const chosen: DialogChoice | undefined =
        visibleChoices.find((c: DialogChoice) => c.id === chosenId)
        || visibleChoices.find((c: DialogChoice) =>
          c.text === chosenId || this.processText(c.text, context) === chosenId);
      if (!chosen) {
        // Fallback
        return this.exitTargets[0]?.id || this.getNextBeat(context);
      }

      // Record the player's choice for AI context and session logging
      context.recordChoice({
        beatId: this.id,
        beatName: this.name || this.id,
        beatType: 'aiDialogTree',
        choiceText: chosen.text,
        choiceContext: `${processedSpeaker}: ${processedText}`,
      });

      // Record the NPC's dialog as AI output for session logging
      context.recordAIOutput({
        beatId: this.id,
        beatName: this.name || this.id,
        beatType: 'aiDialogTree',
        text: `${processedSpeaker}: ${processedText}`,
      });

      // Apply any effects from the choice
      if (chosen.effects) {
        for (const effect of chosen.effects) {
          context.applyEffect(effect);
        }
      }

      // A nested dialog node means "continue the conversation", and it takes
      // PRECEDENCE over any exit target on the same choice. Models frequently
      // stamp target=beat_69 on every choice (because "all branches eventually
      // exit") while ALSO nesting the next turn — a target-first check would
      // then collapse the whole multi-turn tree to a single level.
      if (chosen.dialogNode) {
        this.currentNode = chosen.dialogNode;
        continue;
      }

      // Check if this choice exits to a beat
      if (chosen.target) {
        // Generate NPC farewell message if exit target has npcExitMessage prompt
        const exitConfig = this.exitTargets.find(t => t.id === chosen.target);
        if (exitConfig?.npcExitMessage && aiService) {
          try {
            const exitPrompt = `You are ${this._npcDisplay}. ${this.npcPersonality || ''}\n\n` +
              `SCENARIO: ${this.scenario}\n\n` +
              `The NPC just said: "${processedText}"\n` +
              `The player responded: "${chosen.text}"\n\n` +
              `Generate a brief farewell/response that DIRECTLY acknowledges what the player just said. Instruction: ${exitConfig.npcExitMessage}\n` +
              `Keep it to 1-2 sentences. Respond in the SAME LANGUAGE as the scenario above.\n` +
              `Respond with ONLY the dialog text — no JSON, no metadata, no stage directions.`;
            const exitResponse = await aiService.generateDialog({
              prompt: exitPrompt,
              format: 'text',
            });
            const exitText = typeof exitResponse === 'string' ? exitResponse : (exitResponse as any)?.text || '';
            if (exitText.trim()) {
              await renderer.renderDialog(this._npcDisplay, exitText.trim(), undefined, locations);
              console.log(`[AIDialogTreeBeat ${this.id}] NPC exit message: "${exitText.trim().substring(0, 80)}..."`);
              await waitForTTS(renderer);
              await waitForReadingTime(renderer, exitText.trim());
            }
          } catch (err) {
            console.warn(`[AIDialogTreeBeat ${this.id}] NPC exit message generation failed:`, err);
          }
        }

        const exitReason = (chosen as any).exitReason;
        const targetBeat = context.getStory().getBeat(chosen.target);
        context.recordTimelineEvent({
          type: 'branch',
          beatId: this.id,
          beatName: this.name || this.id,
          beatType: 'aiDialogTree',
          targetBeatId: chosen.target,
          targetBeatName: targetBeat?.name || chosen.target,
          reason: exitReason || `Player chose: "${chosen.text}"`,
        });
        return chosen.target;
      }

      // No nested node and no target — fall back to the first exit.
      return this.exitTargets[0]?.id || this.getNextBeat(context);
    }

    return this.getNextBeat(context);
  }
}
