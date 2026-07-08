/**
 * AIConversationBeat
 *
 * Real-time AI conversation with author-defined steering rules ("conversation directions").
 * Unlike AIDialogTreeBeat (pre-generated tree), each NPC response is generated fresh
 * based on full conversation history + active directions.
 *
 * Turn loop:
 * 1. Build system prompt (scenario + NPC + directions as rules)
 * 2. Generate NPC opening message
 * 3. Render NPC message (chat-scroll) + TTS
 * 4. Loop:
 *    a. Wait for player input (text + mic via renderConversationInput)
 *    b. Evaluate directions against player input
 *    c. If exit direction triggered → return exit target
 *    d. Generate NPC response with active steering
 *    e. Render NPC response + TTS
 *    f. Check maxTurns
 * 5. Fallback exit on maxTurns
 */

import { Beat } from './Beat';
import type { BeatConfig, ConversationDirection, IRenderer } from '../types';
import { StoryContext } from '../engine/StoryContext';
import { PlayerContextBuilder } from '../utils/PlayerContextBuilder';
import {
  buildConversationSystemPrompt,
  buildDirectionEvaluationPrompt,
  parseDirectionEvaluationResponse,
  collectActions,
  buildExtractionPrompt,
  type ConversationTurn,
} from '../utils/ConversationPromptBuilder';
import { waitForTTS, waitForReadingTime } from '../utils/ttsWait';
import { buildDossierForRef, resolveCharacterDisplayName } from '../utils/dossier';

export interface AIConversationBeatParams {
  /** Scene description */
  scenario: string;

  /** NPC name */
  npcName: string;

  /** NPC personality traits */
  npcPersonality?: string;

  /** Include player variables in context */
  includeVariables?: boolean;

  /** Include player inventory in context */
  includeInventory?: boolean;

  /** Include visited beats in context */
  includeVisitedBeats?: boolean;

  /** Include choice history in context */
  includeChoiceHistory?: boolean;

  /** Maximum conversation turns before fallback exit */
  maxTurns?: number;

  /** Conversation directions — steering rules for the AI */
  directions: ConversationDirection[];

  /** Fallback exit target when maxTurns reached */
  fallbackExitTarget?: string;

  /** System instructions for the AI */
  systemInstructions?: string;

  /** Opening line for NPC (if empty, AI generates one) */
  openingLine?: string;

  /** Whether to show microphone button for voice input */
  enableVoiceInput?: boolean;

  /** Language for STT (BCP 47) */
  language?: string;
}

export class AIConversationBeat extends Beat {
  public scenario: string;
  public npcName: string;
  public npcPersonality?: string;
  public includeVariables: boolean;
  public includeInventory: boolean;
  public includeVisitedBeats: boolean;
  public includeChoiceHistory: boolean;
  public maxTurns: number;
  public directions: ConversationDirection[];
  public fallbackExitTarget?: string;
  public systemInstructions?: string;
  public openingLine?: string;
  public enableVoiceInput: boolean;
  public language?: string;

  constructor(config: BeatConfig & {
    parameters?: Partial<AIConversationBeatParams>;
  } & Partial<AIConversationBeatParams>) {
    super(config);
    const params = config.parameters || {};

    this.scenario = params.scenario || config.scenario || '';
    this.npcName = params.npcName || config.npcName || 'Character';
    this.npcPersonality = params.npcPersonality || config.npcPersonality;
    this.includeVariables = params.includeVariables ?? config.includeVariables ?? true;
    this.includeInventory = params.includeInventory ?? config.includeInventory ?? true;
    this.includeVisitedBeats = params.includeVisitedBeats ?? config.includeVisitedBeats ?? true;
    this.includeChoiceHistory = params.includeChoiceHistory ?? config.includeChoiceHistory ?? true;
    this.maxTurns = params.maxTurns || config.maxTurns || 10;
    const rawDirections = params.directions || config.directions || [];
    // Accept both flattened (from inspector/save) and nested (from code) formats
    this.directions = rawDirections.map((d: any) =>
      d.trigger ? d : AIConversationBeat.unflattenDirection(d)
    );
    this.fallbackExitTarget = params.fallbackExitTarget || config.fallbackExitTarget;
    this.systemInstructions = params.systemInstructions || config.systemInstructions;
    this.openingLine = params.openingLine || config.openingLine;
    this.enableVoiceInput = params.enableVoiceInput ?? config.enableVoiceInput ?? true;
    this.language = params.language || config.language;
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
      // Output directions in flattened format for the schema-driven inspector
      directions: this.directions.map(d => AIConversationBeat.flattenDirection(d)),
      fallbackExitTarget: this.fallbackExitTarget,
      systemInstructions: this.systemInstructions,
      openingLine: this.openingLine,
      enableVoiceInput: this.enableVoiceInput,
      language: this.language,
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
    if (params.directions !== undefined) {
      // Accept both flattened (from inspector) and nested (from code/import) formats
      this.directions = params.directions.map((d: any) =>
        d.trigger ? d : AIConversationBeat.unflattenDirection(d)
      );
      this.clearConnections();
    }
    if (params.fallbackExitTarget !== undefined) this.fallbackExitTarget = params.fallbackExitTarget;
    if (params.systemInstructions !== undefined) this.systemInstructions = params.systemInstructions;
    if (params.openingLine !== undefined) this.openingLine = params.openingLine;
    if (params.enableVoiceInput !== undefined) this.enableVoiceInput = params.enableVoiceInput;
    if (params.language !== undefined) this.language = params.language;
  }

  /**
   * Convert nested ConversationDirection to flat inspector format
   */
  private static flattenDirection(d: ConversationDirection): Record<string, any> {
    // Extract variable name/value/extraction from action (may be in multi-action)
    let varName = d.action.variableName || '';
    let varValue = d.action.variableValue != null ? String(d.action.variableValue) : '';
    let extractionPrompt = d.action.extractionPrompt || '';
    if (d.action.type === 'multi' && d.action.actions) {
      const setVar = d.action.actions.find(a => a.type === 'set-variable');
      if (setVar) {
        varName = setVar.variableName || '';
        varValue = setVar.variableValue != null ? String(setVar.variableValue) : '';
        extractionPrompt = setVar.extractionPrompt || '';
      }
    }

    // Determine the primary action type (steer or exit)
    let primaryType = d.action.type;
    if (primaryType === 'multi' && d.action.actions) {
      const primary = d.action.actions.find(a => a.type === 'steer' || a.type === 'exit');
      primaryType = primary?.type || 'steer';
    }

    const flat: Record<string, any> = {
      id: d.id,
      triggerType: d.trigger.type,
      triggerNegate: d.trigger.negate ?? false,
      triggerKeywords: d.trigger.keywords?.join(', ') || '',
      triggerSentiment: d.trigger.sentiment || '',
      triggerTurnCount: d.trigger.turnCount,
      triggerVariableName: d.trigger.variableName || '',
      triggerVariableValue: d.trigger.variableValue != null ? String(d.trigger.variableValue) : '',
      triggerDescription: d.trigger.description || '',
      requiresVariable: d.requiresVariable || '',
      requiresVariableValue: d.requiresVariableValue != null ? String(d.requiresVariableValue) : '',
      actionType: primaryType === 'set-variable' ? 'steer' : primaryType,
      actionInstruction: d.action.instruction || (d.action.type === 'multi'
        ? d.action.actions?.find(a => a.type === 'steer')?.instruction || ''
        : ''),
      actionExitTarget: d.action.exitTarget || (d.action.type === 'multi'
        ? d.action.actions?.find(a => a.type === 'exit')?.exitTarget || ''
        : ''),
      actionExitMessage: d.action.exitMessage || (d.action.type === 'multi'
        ? d.action.actions?.find(a => a.type === 'exit')?.exitMessage || ''
        : ''),
      actionVariableName: varName,
      actionVariableValue: varValue,
      actionExtractionPrompt: extractionPrompt,
      once: d.once ?? false,
    };
    return flat;
  }

  /**
   * Convert flat inspector format back to nested ConversationDirection
   */
  private static unflattenDirection(flat: Record<string, any>): ConversationDirection {
    const trigger: any = { type: flat.triggerType || 'topic-mention' };
    if (flat.triggerNegate) trigger.negate = true;
    switch (trigger.type) {
      case 'topic-mention':
        trigger.keywords = (flat.triggerKeywords || '').split(',').map((k: string) => k.trim()).filter(Boolean);
        break;
      case 'sentiment':
        trigger.sentiment = flat.triggerSentiment || 'negative';
        break;
      case 'turn-count':
        trigger.turnCount = flat.triggerTurnCount || 3;
        break;
      case 'variable':
        trigger.variableName = flat.triggerVariableName || '';
        trigger.variableValue = flat.triggerVariableValue || '';
        break;
      case 'custom':
        trigger.description = flat.triggerDescription || '';
        break;
    }

    // Build action — compose multi-action if variable set alongside steer/exit
    const hasVariable = flat.actionVariableName && flat.actionVariableName.trim();
    const primaryType = flat.actionType || 'steer';

    let action: any;
    const primaryAction: any = { type: primaryType };
    if (primaryType === 'steer') {
      primaryAction.instruction = flat.actionInstruction || '';
    } else if (primaryType === 'exit') {
      primaryAction.exitTarget = flat.actionExitTarget || '';
      if (flat.actionExitMessage?.trim()) {
        primaryAction.exitMessage = flat.actionExitMessage;
      }
    }

    if (hasVariable) {
      // Compose multi-action: primary + set-variable
      const setVarAction: any = {
        type: 'set-variable',
        variableName: flat.actionVariableName,
        variableValue: flat.actionVariableValue || '',
      };
      // If extraction prompt is set, use AI extraction instead of static value
      if (flat.actionExtractionPrompt?.trim()) {
        setVarAction.extractionPrompt = flat.actionExtractionPrompt;
        delete setVarAction.variableValue; // extraction takes precedence
      }
      action = {
        type: 'multi',
        actions: [primaryAction, setVarAction],
      };
    } else {
      action = primaryAction;
    }

    const dir: ConversationDirection = {
      id: flat.id || `dir_${Date.now()}`,
      trigger,
      action,
      once: flat.once ?? false,
    };
    if (flat.requiresVariable) dir.requiresVariable = flat.requiresVariable;
    if (flat.requiresVariableValue) dir.requiresVariableValue = flat.requiresVariableValue;
    return dir;
  }

  /**
   * Override getConnections to derive from direction exit targets + fallback
   */
  getConnections(): Array<{ targetId: string; label?: string; condition?: any }> {
    const connections: Array<{ targetId: string; label?: string; condition?: any }> = [];
    const seenTargets = new Set<string>();

    // Add connections from exit-type directions
    for (const dir of this.directions) {
      this.collectExitTargets(dir.action, connections, seenTargets, dir);
    }

    // Add fallback exit
    if (this.fallbackExitTarget && !seenTargets.has(this.fallbackExitTarget)) {
      connections.push({
        targetId: this.fallbackExitTarget,
        label: 'fallback (max turns)',
      });
    }

    // Include base connections
    const baseConnections = super.getConnections();
    for (const conn of baseConnections) {
      if (!seenTargets.has(conn.targetId)) {
        connections.push(conn);
        seenTargets.add(conn.targetId);
      }
    }

    return connections;
  }

  private collectExitTargets(
    action: import('../types').ConversationAction,
    connections: Array<{ targetId: string; label?: string }>,
    seen: Set<string>,
    dir: ConversationDirection,
  ): void {
    if (action.type === 'exit' && action.exitTarget && !seen.has(action.exitTarget)) {
      seen.add(action.exitTarget);
      const label = dir.trigger.type === 'custom'
        ? dir.trigger.description?.slice(0, 25)
        : dir.trigger.keywords?.join(', ') || dir.trigger.type;
      connections.push({
        targetId: action.exitTarget,
        label: label ? label + (label.length >= 25 ? '...' : '') : undefined,
      });
    }
    if (action.type === 'multi' && action.actions) {
      for (const sub of action.actions) {
        this.collectExitTargets(sub, connections, seen, dir);
      }
    }
  }

  protected async performAction(
    context: StoryContext,
    renderer: IRenderer,
  ): Promise<string | null> {
    // Check if AI service is available
    const aiService = renderer.getState('aiService');
    if (!aiService || typeof aiService.generateConversationTurn !== 'function') {
      // Fall back to simple message if generateConversationTurn not implemented
      if (!aiService || typeof aiService.generateDialog !== 'function') {
        console.warn(`[AIConversationBeat ${this.id}] AI service not configured`);
        await renderer.renderText(
          'AI features require configuration. Please set up AI in settings.',
          'Continue',
          Array.from(this.locations.values()),
        );
        return this.fallbackExitTarget || this.getNextBeat(context);
      }
    }

    // Set up chat presentation mode
    renderer.setState('presentationMode', 'chat-scroll');
    renderer.setState('showAvatars', true);
    renderer.setState('currentBeatType', 'aiConversation');
    renderer.setState('responseDelay', 1.0);

    // Set player name
    const variables = context.getVariables();
    const playerName = variables.playerName || variables.name || variables.player || 'You';
    renderer.setState('playerName', playerName);

    // Clear chat history for fresh conversation
    if (renderer.clearChatHistory) {
      renderer.clearChatHistory();
    }

    // Clear any previous STT context prompt.
    // Context prompts cause Whisper to hallucinate scenario keywords into the output
    // (e.g., user says "ok let's do wings" → Whisper outputs "ok let's go. and wings. and sauces.")
    // so we deliberately leave it empty. The AI conversation handles fuzzy matching anyway.
    const sttService = renderer.getState('sttService') as any;
    if (sttService) {
      const provider = sttService.getActiveProvider?.();
      if (provider && typeof provider.setContextPrompt === 'function') {
        provider.setContextPrompt('');
      }
    }

    // Build player context
    const story = context.getStory();
    const contextBuilder = new PlayerContextBuilder(context, story);
    const playerContext = contextBuilder.buildPromptContext({
      includeVariables: this.includeVariables,
      includeInventory: this.includeInventory,
      includeHistory: this.includeVisitedBeats,
      includeChoiceHistory: this.includeChoiceHistory,
    });

    // Re-anchor dossier (Step 2 / Layer 5). When the NPC field stores a
    // canonical Character.id, build a dossier from authored description +
    // character-scoped state (counters, variables, flags) and pass it into
    // the system prompt. Mode A "rebuild every turn" — the LLM never drifts.
    // No-op when the npcName field stores a free-text name.
    const characters = (story as any)?.getCharacters?.() || [];
    // The NPC field stores a canonical Character.id when the author links a
    // defined character (so the dossier + personality auto-fill work). Resolve
    // it to a human name for everything the player/LLM sees; buildDossierForRef
    // keeps using the raw ref because it matches by id.
    const npcDisplayName = resolveCharacterDisplayName(this.npcName, characters);
    const characterDossier = buildDossierForRef(this.npcName, characters, context);

    const conversationHistory: ConversationTurn[] = [];
    const firedOnceDirections = new Set<string>();
    let turnNumber = 0;

    try {
      // Generate or use NPC opening message
      let openingText: string;
      if (this.openingLine) {
        openingText = this.processText(this.openingLine, context);
      } else {
        // Show loading for initial message
        if (renderer.renderLoading) {
          renderer.renderLoading(`${npcDisplayName} is getting ready...`, {
            spinnerType: 'dots',
          });
        }

        const systemPrompt = buildConversationSystemPrompt({
          npcName: npcDisplayName,
          npcPersonality: this.npcPersonality,
          characterDossier,
          scenario: this.scenario,
          playerContext,
          directions: this.directions,
          history: [],
          turnNumber: 0,
          maxTurns: this.maxTurns,
          systemInstructions: this.systemInstructions,
        });

        openingText = await this.generateNPCResponse(aiService, systemPrompt, []);

        if (renderer.hideLoading) {
          renderer.hideLoading();
        }
      }

      // Render NPC opening
      conversationHistory.push({ role: 'npc', text: openingText, turnNumber: 0 });
      await renderer.renderDialog(npcDisplayName, openingText, undefined, Array.from(this.locations.values()));

      // Record opening in timeline
      context.recordTimelineEvent({
        type: 'ai-output',
        beatId: this.id,
        beatName: this.name || this.id,
        beatType: 'aiConversation',
        text: `${npcDisplayName}: ${openingText}`,
      });

      // Main conversation loop
      while (turnNumber < this.maxTurns) {
        turnNumber++;

        // Wait for player input
        const playerInput = await this.getPlayerInput(renderer);
        if (!playerInput.trim()) continue; // Skip empty input

        // Record player turn
        conversationHistory.push({ role: 'player', text: playerInput, turnNumber });

        // Record player choice in context
        context.recordChoice({
          beatId: this.id,
          beatName: this.name || this.id,
          beatType: 'aiConversation',
          choiceText: playerInput,
          choiceContext: `Turn ${turnNumber} of conversation with ${npcDisplayName}`,
        });

        // Evaluate directions against player input
        const activeDirections = this.directions.filter(d => {
          if (d.once && firedOnceDirections.has(d.id)) {
            console.log(`[AIConversationBeat ${this.id}] Direction ${d.id} skipped (already fired once)`);
            return false;
          }
          // Check variable guard — filter out directions whose guard isn't met
          if (d.requiresVariable) {
            const actualVal = context.getVariable(d.requiresVariable);
            if (d.requiresVariableValue !== undefined && d.requiresVariableValue !== '') {
              if (String(actualVal) !== String(d.requiresVariableValue)) {
                console.log(`[AIConversationBeat ${this.id}] Direction ${d.id} skipped (${d.requiresVariable}="${actualVal}" ≠ "${d.requiresVariableValue}")`);
                return false;
              }
            } else {
              if (!actualVal) {
                console.log(`[AIConversationBeat ${this.id}] Direction ${d.id} skipped (${d.requiresVariable} not set)`);
                return false;
              }
            }
          }
          return true;
        });

        console.log(`[AIConversationBeat ${this.id}] Active directions: ${activeDirections.length}/${this.directions.length} (${activeDirections.map(d => d.id).join(', ')})`);

        let steeringInstructions: string[] = [];
        let exitTarget: string | null = null;
        let exitMessagePrompt: string | null = null;
        const variableSets: Array<{ name: string; value: any }> = [];

        if (activeDirections.length > 0) {
          // Use AI to evaluate which directions are triggered
          const evalPrompt = buildDirectionEvaluationPrompt(
            playerInput,
            activeDirections,
            conversationHistory,
            turnNumber,
          );

          try {
            const evalResponse = await this.callAI(aiService, evalPrompt, 'Evaluate which directions triggered');
            const triggeredIndices = parseDirectionEvaluationResponse(evalResponse);

            if (triggeredIndices.length > 0) {
              const actions = collectActions(activeDirections, triggeredIndices);
              steeringInstructions = actions.steeringInstructions;
              exitTarget = actions.exitTarget;
              exitMessagePrompt = actions.exitMessage;
              variableSets.push(...actions.variableSets);

              // Resolve AI-extracted variable values
              if (actions.extractions.length > 0) {
                try {
                  const extractPrompt = buildExtractionPrompt(actions.extractions, conversationHistory);
                  const extractResponse = await this.callAI(aiService, extractPrompt, 'Extract variable values');
                  const match = extractResponse.match(/\{[\s\S]*\}/);
                  if (match) {
                    const extracted = JSON.parse(match[0]);
                    for (const ext of actions.extractions) {
                      if (extracted[ext.name] !== undefined) {
                        variableSets.push({ name: ext.name, value: extracted[ext.name] });
                        console.log(`[AIConversationBeat ${this.id}] Extracted ${ext.name} = "${extracted[ext.name]}"`);
                      }
                    }
                  }
                } catch (extractErr) {
                  console.warn(`[AIConversationBeat ${this.id}] Variable extraction failed:`, extractErr);
                }
              }

              // Mark once-only directions as fired
              for (const idx of triggeredIndices) {
                const dir = activeDirections[idx];
                if (dir?.once) firedOnceDirections.add(dir.id);
              }

              console.log(`[AIConversationBeat ${this.id}] Triggered directions: ${triggeredIndices.join(', ')}`);
            }
          } catch (err) {
            console.warn(`[AIConversationBeat ${this.id}] Direction evaluation failed:`, err);
            // Continue without direction steering
          }
        }

        // Apply variable sets (static + extracted)
        for (const { name, value } of variableSets) {
          context.setVariable(name, value);
          console.log(`[AIConversationBeat ${this.id}] Set variable: ${name} = "${value}"`);
        }

        // Re-evaluate: if variables changed, check if previously-guarded directions
        // are now active and should fire in the same turn.
        if (variableSets.length > 0 && !exitTarget) {
          const newlyActive = this.directions.filter(d => {
            if (activeDirections.includes(d)) return false;
            if (d.once && firedOnceDirections.has(d.id)) return false;
            if (d.requiresVariable) {
              const actualVal = context.getVariable(d.requiresVariable);
              if (d.requiresVariableValue !== undefined && d.requiresVariableValue !== '') {
                if (String(actualVal) !== String(d.requiresVariableValue)) return false;
              } else {
                if (!actualVal) return false;
              }
            }
            return true;
          });

          if (newlyActive.length > 0) {
            console.log(`[AIConversationBeat ${this.id}] Re-evaluating ${newlyActive.length} newly-active directions`);
            try {
              const reEvalPrompt = buildDirectionEvaluationPrompt(
                playerInput, newlyActive, conversationHistory, turnNumber,
              );
              const reEvalResponse = await this.callAI(aiService, reEvalPrompt, 'Re-evaluate directions');
              const reTriggered = parseDirectionEvaluationResponse(reEvalResponse);

              if (reTriggered.length > 0) {
                const reActions = collectActions(newlyActive, reTriggered);
                steeringInstructions.push(...reActions.steeringInstructions);
                if (reActions.exitTarget) {
                  exitTarget = reActions.exitTarget;
                  exitMessagePrompt = reActions.exitMessage;
                }

                // Handle extractions
                if (reActions.extractions.length > 0) {
                  try {
                    const extractPrompt = buildExtractionPrompt(reActions.extractions, conversationHistory);
                    const extractResponse = await this.callAI(aiService, extractPrompt, 'Extract variable values');
                    const match = extractResponse.match(/\{[\s\S]*\}/);
                    if (match) {
                      const extracted = JSON.parse(match[0]);
                      for (const ext of reActions.extractions) {
                        if (extracted[ext.name] !== undefined) {
                          context.setVariable(ext.name, extracted[ext.name]);
                          console.log(`[AIConversationBeat ${this.id}] Extracted ${ext.name} = "${extracted[ext.name]}"`);
                        }
                      }
                    }
                  } catch (extractErr) {
                    console.warn(`[AIConversationBeat ${this.id}] Re-eval extraction failed:`, extractErr);
                  }
                }

                for (const { name, value } of reActions.variableSets) {
                  context.setVariable(name, value);
                }

                for (const idx of reTriggered) {
                  const dir = newlyActive[idx];
                  if (dir?.once) firedOnceDirections.add(dir.id);
                }
                console.log(`[AIConversationBeat ${this.id}] Re-eval triggered: ${reTriggered.join(', ')}`);
              }
            } catch (err) {
              console.warn(`[AIConversationBeat ${this.id}] Re-evaluation failed:`, err);
            }
          }
        }

        // Check for exit
        if (exitTarget) {
          // Generate NPC exit message if a prompt is provided
          if (exitMessagePrompt) {
            try {
              const exitSystemPrompt = `You are ${npcDisplayName}. ${this.npcPersonality || ''}\n\n` +
                `SCENARIO: ${this.scenario}\n\n` +
                `Generate a brief farewell/response that DIRECTLY acknowledges what the player just said. Instruction: ${exitMessagePrompt}\n` +
                `Keep it to 1-2 sentences. Respond in the SAME LANGUAGE as the conversation.\n` +
                `Respond with ONLY the dialog text — no JSON, no metadata, no stage directions.`;
              const exitMsg = await this.generateNPCResponse(aiService, exitSystemPrompt, conversationHistory);
              if (exitMsg.trim()) {
                conversationHistory.push({ role: 'npc', text: exitMsg, turnNumber });
                await renderer.renderDialog(npcDisplayName, exitMsg, undefined, Array.from(this.locations.values()));
                console.log(`[AIConversationBeat ${this.id}] NPC exit message: "${exitMsg.substring(0, 80)}..."`);
                await waitForTTS(renderer);
                await waitForReadingTime(renderer, exitMsg);
              }
            } catch (err) {
              console.warn(`[AIConversationBeat ${this.id}] Exit message generation failed:`, err);
            }
          }

          context.recordTimelineEvent({
            type: 'branch',
            beatId: this.id,
            beatName: this.name || this.id,
            beatType: 'aiConversation',
            targetBeatId: exitTarget,
            reason: `Direction exit triggered by player input: "${playerInput.slice(0, 50)}"`,
          });
          return exitTarget;
        }

        // Generate NPC response with active steering. Re-anchor dossier is
        // rebuilt on every turn (Mode A) so character-scoped state changes
        // (e.g. counters set by a previous direction firing) feed back into
        // the LLM's understanding of who the NPC currently is.
        const turnDossier = buildDossierForRef(this.npcName, characters, context);
        const systemPrompt = buildConversationSystemPrompt({
          npcName: npcDisplayName,
          npcPersonality: this.npcPersonality,
          characterDossier: turnDossier,
          scenario: this.scenario,
          playerContext,
          directions: this.directions,
          history: conversationHistory,
          turnNumber,
          maxTurns: this.maxTurns,
          systemInstructions: this.systemInstructions,
          activeSteeringInstructions: steeringInstructions,
        });

        const npcResponse = await this.generateNPCResponse(
          aiService,
          systemPrompt,
          conversationHistory,
        );

        // Record NPC response
        conversationHistory.push({ role: 'npc', text: npcResponse, turnNumber });

        // Render NPC response
        await renderer.renderDialog(
          npcDisplayName,
          npcResponse,
          undefined,
          Array.from(this.locations.values()),
        );

        // Record in timeline
        context.recordTimelineEvent({
          type: 'ai-output',
          beatId: this.id,
          beatName: this.name || this.id,
          beatType: 'aiConversation',
          text: `${npcDisplayName}: ${npcResponse}`,
        });

        context.recordAIOutput({
          beatId: this.id,
          beatName: this.name || this.id,
          beatType: 'aiConversation',
          text: `${npcDisplayName}: ${npcResponse}`,
        });
      }

      // Max turns reached — fallback exit
      console.log(`[AIConversationBeat ${this.id}] Max turns (${this.maxTurns}) reached`);
      context.recordTimelineEvent({
        type: 'branch',
        beatId: this.id,
        beatName: this.name || this.id,
        beatType: 'aiConversation',
        targetBeatId: this.fallbackExitTarget || '',
        reason: `Max turns (${this.maxTurns}) reached`,
      });

      return this.fallbackExitTarget || this.getNextBeat(context);
    } catch (error) {
      console.error(`[AIConversationBeat ${this.id}] Error:`, error);
      await renderer.renderText(
        'An error occurred during the conversation.',
        'Continue',
        Array.from(this.locations.values()),
      );
      return this.fallbackExitTarget || this.getNextBeat(context);
    }
  }

  /**
   * Get player input via renderConversationInput or fallback to renderInputText
   */
  private async getPlayerInput(renderer: IRenderer): Promise<string> {
    if (renderer.renderConversationInput) {
      return renderer.renderConversationInput({
        placeholder: 'Type your response...',
        showMic: this.enableVoiceInput,
        language: this.language,
      });
    }

    // Fallback: use standard text input
    return renderer.renderInputText(
      '',
      'Type your response...',
      'Send',
      { required: true },
      Array.from(this.locations.values()),
    );
  }

  /**
   * Generate an NPC response using the AI service
   */
  private async generateNPCResponse(
    aiService: any,
    systemPrompt: string,
    history: ConversationTurn[],
  ): Promise<string> {
    // Use generateConversationTurn if available (purpose-built)
    if (typeof aiService.generateConversationTurn === 'function') {
      const response = await aiService.generateConversationTurn({
        systemPrompt,
        messages: history.map(t => ({
          role: t.role === 'npc' ? 'assistant' : 'user',
          content: t.text,
        })),
      });
      return typeof response === 'string' ? response : response.text || response.content || '';
    }

    // Fallback: use generateDialog with a prompt that requests a single response
    const prompt = `${systemPrompt}\n\nConversation so far:\n${history.map(t =>
      `${t.role === 'npc' ? 'NPC' : 'Player'}: ${t.text}`
    ).join('\n')}\n\nGenerate the NPC's next response. Return ONLY the dialog text.`;

    const response = await aiService.generateDialog({ prompt, format: 'text' });
    return typeof response === 'string' ? response : response.text || '';
  }

  /**
   * Generic AI call for direction evaluation etc.
   */
  private async callAI(aiService: any, prompt: string, _purpose: string): Promise<string> {
    if (typeof aiService.generateConversationTurn === 'function') {
      const response = await aiService.generateConversationTurn({
        systemPrompt: 'You are a conversation analyzer. Follow the instructions exactly.',
        messages: [{ role: 'user', content: prompt }],
      });
      return typeof response === 'string' ? response : response.text || response.content || '';
    }

    // Fallback
    const response = await aiService.generateDialog({ prompt, format: 'text' });
    return typeof response === 'string' ? response : response.text || '';
  }
}
