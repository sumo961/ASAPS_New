/**
 * ConversationPromptBuilder
 *
 * Abstracts prompt construction for AIConversationBeat.
 * This is the key architectural seam for future knowledge graphs:
 * today it formats directions as prompt rules, tomorrow it queries a graph.
 */

import type { ConversationDirection, ConversationAction } from '../types';

export interface ConversationTurn {
  role: 'npc' | 'player';
  text: string;
  turnNumber: number;
}

export interface ConversationPromptContext {
  /** NPC name */
  npcName: string;
  /** NPC personality description */
  npcPersonality?: string;
  /**
   * Pre-built character dossier (Step 2 of the rich-character roadmap).
   * When the AI beat's NPC has a characterRef linked to a defined Character,
   * the beat builds the dossier via buildDossier() and passes it here.
   * Rendered as a re-anchor block at the top of the system prompt — the LLM
   * always sees the canonical character data, preventing personality drift
   * across long conversations or beat-to-beat state changes.
   */
  characterDossier?: string;
  /** Scene/scenario description */
  scenario: string;
  /** Player context string (from PlayerContextBuilder) */
  playerContext: string;
  /** Active conversation directions */
  directions: ConversationDirection[];
  /** Conversation history so far */
  history: ConversationTurn[];
  /** Current turn number */
  turnNumber: number;
  /** Max turns allowed */
  maxTurns: number;
  /** Custom system instructions from author */
  systemInstructions?: string;
  /** Active steering instructions from triggered directions */
  activeSteeringInstructions?: string[];
}

/**
 * Build the system prompt for an AI conversation turn
 */
export function buildConversationSystemPrompt(ctx: ConversationPromptContext): string {
  const parts: string[] = [];

  parts.push(`You are ${ctx.npcName}, a character in an interactive narrative.`);

  // Re-anchor block (Mode A policy): when the NPC is linked to a defined
  // Character, the dossier is rebuilt fresh on every turn from structured
  // state and prepended here. The LLM always sees the canonical identity,
  // so it can't drift away from who the character is — directly addresses
  // the personality-drift problem flagged in the rich-character design.
  if (ctx.characterDossier && ctx.characterDossier.trim()) {
    parts.push(`\n${ctx.characterDossier}`);
  }
  if (ctx.npcPersonality) {
    parts.push(`\nPERSONALITY: ${ctx.npcPersonality}`);
  }

  parts.push(`\nSCENARIO: ${ctx.scenario}`);

  if (ctx.playerContext) {
    parts.push(`\nPLAYER CONTEXT:\n${ctx.playerContext}`);
  }

  // Format directions as conversational goals — only include steering instructions,
  // not action metadata (exits, variable-setting) which the NPC shouldn't know about.
  // Those are evaluated separately by the direction evaluation system.
  if (ctx.directions.length > 0) {
    const goals: string[] = [];
    for (const dir of ctx.directions) {
      // Only include directions that have steering instructions
      if (dir.action.type === 'steer' && dir.action.instruction) {
        goals.push(`- ${formatTriggerDescription(dir)}: ${dir.action.instruction}`);
      } else if (dir.action.type === 'multi' && dir.action.actions) {
        const steer = dir.action.actions.find(a => a.type === 'steer');
        if (steer?.instruction) {
          goals.push(`- ${formatTriggerDescription(dir)}: ${steer.instruction}`);
        }
      }
    }
    if (goals.length > 0) {
      parts.push('\nCONVERSATION GOALS (guide the conversation toward these):');
      goals.forEach(g => parts.push(g));
    }
  }

  // Active steering from triggered directions
  if (ctx.activeSteeringInstructions && ctx.activeSteeringInstructions.length > 0) {
    parts.push('\nACTIVE INSTRUCTIONS (follow these NOW in your next response):');
    for (const instruction of ctx.activeSteeringInstructions) {
      parts.push(`- ${instruction}`);
    }
  }

  if (ctx.systemInstructions) {
    parts.push(`\nADDITIONAL INSTRUCTIONS: ${ctx.systemInstructions}`);
  }

  parts.push(`\nTurn ${ctx.turnNumber} of ${ctx.maxTurns}. Respond in character as ${ctx.npcName}.`);
  parts.push('Respond with ONLY the NPC dialog text — no stage directions, no JSON, no metadata.');
  parts.push('PERSONALIZATION: Use the player\'s actual name and details from context. Never use placeholder syntax like {playerName}.');

  return parts.join('\n');
}

/**
 * Build the direction evaluation prompt.
 * Given a player's input, determine which directions are triggered.
 */
export function buildDirectionEvaluationPrompt(
  playerInput: string,
  directions: ConversationDirection[],
  history: ConversationTurn[],
  turnNumber: number,
): string {
  // Only show trigger conditions to the evaluator — actions are internal
  const directionDescriptions = directions.map((d, i) => {
    const triggerDesc = formatTriggerDescription(d);
    return `  ${i}: ${triggerDesc}${d.once ? ' (once only)' : ''}`;
  });

  return `Evaluate which conversation directions are triggered based on the player's latest input and the full conversation history.

PLAYER INPUT: "${playerInput}"

CONVERSATION HISTORY (${history.length} turns so far):
${history.map(t => `  ${t.role === 'npc' ? 'NPC' : 'Player'}: ${t.text}`).join('\n')}

CURRENT TURN: ${turnNumber}

DIRECTIONS TO EVALUATE:
${directionDescriptions.join('\n')}

MATCHING RULES:
- Keyword matching is CASE-INSENSITIVE: "goddess" counts as a mention of "Goddess" and vice versa.
- Singular/plural and inflected forms count ("spirit" matches "Spirits").
- A clear paraphrase of a keyword's topic counts as mentioning it; an unrelated word that merely shares letters does not.
- For NOT conditions, apply the same rules first, then invert.

Return a JSON array of triggered direction indices. Example: [0, 2]
If none are triggered, return: []
Only return the JSON array, nothing else.`;
}

/**
 * Format a conversation direction as a human-readable rule for the system prompt
 */
function formatDirectionAsRule(dir: ConversationDirection): string {
  const trigger = formatTriggerDescription(dir);
  const action = formatActionDescription(dir.action);
  return `${trigger}: ${action}`;
}

function formatTriggerDescription(dir: ConversationDirection): string {
  const t = dir.trigger;
  const neg = t.negate ? ' does NOT' : '';
  let desc: string;
  switch (t.type) {
    case 'topic-mention':
      desc = t.negate
        ? `If the player does NOT mention ${t.keywords?.join(', ')}`
        : `If the player mentions ${t.keywords?.join(', ')}`;
      break;
    case 'sentiment':
      desc = `If the player${neg} seem${neg ? '' : 's'} ${t.sentiment}`;
      break;
    case 'turn-count':
      desc = `After ${t.turnCount} turns`;
      break;
    case 'variable':
      desc = t.negate
        ? `If variable "${t.variableName}" does NOT equal ${JSON.stringify(t.variableValue)}`
        : `If variable "${t.variableName}" equals ${JSON.stringify(t.variableValue)}`;
      break;
    case 'silence':
      desc = `If the player doesn't respond`;
      break;
    case 'custom':
      desc = t.negate ? `If NOT: ${t.description}` : `If: ${t.description}`;
      break;
    default:
      desc = `Unknown trigger: ${t.type}`;
  }

  // Append variable guard if present
  if (dir.requiresVariable) {
    const guardVal = dir.requiresVariableValue;
    desc += guardVal
      ? ` AND variable "${dir.requiresVariable}" equals ${JSON.stringify(guardVal)}`
      : ` AND variable "${dir.requiresVariable}" is set`;
  }

  return desc;
}

function formatActionDescription(action: ConversationAction): string {
  switch (action.type) {
    case 'steer':
      return action.instruction || 'adjust conversation';
    case 'exit':
      return `end conversation (exit to ${action.exitTarget})`;
    case 'set-variable':
      return `set ${action.variableName} = ${JSON.stringify(action.variableValue)}`;
    case 'multi':
      return (action.actions || []).map(formatActionDescription).join(', then ');
    default:
      return `unknown action: ${action.type}`;
  }
}

/**
 * Parse direction evaluation response from AI
 */
export function parseDirectionEvaluationResponse(response: string): number[] {
  try {
    // Extract JSON array from response
    const match = response.match(/\[[\s\S]*?\]/);
    if (!match) return [];
    const indices = JSON.parse(match[0]);
    if (!Array.isArray(indices)) return [];
    return indices.filter((i: any) => typeof i === 'number');
  } catch {
    return [];
  }
}

/**
 * Collect all actions from triggered directions, handling 'multi' composition
 */
export interface CollectedActions {
  steeringInstructions: string[];
  exitTarget: string | null;
  /** Optional prompt for NPC farewell message before exiting */
  exitMessage: string | null;
  variableSets: Array<{ name: string; value: any }>;
  /** Variables that need AI extraction — resolved separately via extractVariableValues() */
  extractions: Array<{ name: string; prompt: string }>;
}

export function collectActions(directions: ConversationDirection[], triggeredIndices: number[]): CollectedActions {
  const result: CollectedActions = {
    steeringInstructions: [],
    exitTarget: null,
    exitMessage: null,
    variableSets: [],
    extractions: [],
  };

  for (const idx of triggeredIndices) {
    if (idx < 0 || idx >= directions.length) continue;
    processAction(directions[idx].action, result);
  }

  return result;
}

function processAction(action: ConversationAction, result: CollectedActions): void {
  switch (action.type) {
    case 'steer':
      if (action.instruction) result.steeringInstructions.push(action.instruction);
      break;
    case 'exit':
      if (action.exitTarget) result.exitTarget = action.exitTarget;
      if (action.exitMessage) result.exitMessage = action.exitMessage;
      break;
    case 'set-variable':
      if (action.variableName !== undefined) {
        if (action.extractionPrompt) {
          // Dynamic: AI extracts the value from conversation
          result.extractions.push({ name: action.variableName, prompt: action.extractionPrompt });
        } else {
          // Static: use the fixed value
          result.variableSets.push({ name: action.variableName, value: action.variableValue });
        }
      }
      break;
    case 'multi':
      if (action.actions) {
        for (const sub of action.actions) {
          processAction(sub, result);
        }
      }
      break;
  }
}

/**
 * Build a prompt to extract variable values from conversation history.
 * Used when directions have extractionPrompt set on set-variable actions.
 */
export function buildExtractionPrompt(
  extractions: Array<{ name: string; prompt: string }>,
  history: ConversationTurn[],
): string {
  const extractionDescs = extractions.map((e, i) =>
    `  ${i}. Variable "${e.name}": ${e.prompt}`
  ).join('\n');

  return `Extract values from this conversation and return them as a JSON object.

CONVERSATION:
${history.map(t => `  ${t.role === 'npc' ? 'NPC' : 'Player'}: ${t.text}`).join('\n')}

EXTRACT:
${extractionDescs}

Return a JSON object mapping variable names to extracted values. Be concise but complete.
Example: {"order_content": "2 dozen fried boneless chicken wings with hot sauce"}
Only return the JSON object, nothing else.`;
}
