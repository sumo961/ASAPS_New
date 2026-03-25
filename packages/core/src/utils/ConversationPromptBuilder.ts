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
  if (ctx.npcPersonality) {
    parts.push(`\nPERSONALITY: ${ctx.npcPersonality}`);
  }

  parts.push(`\nSCENARIO: ${ctx.scenario}`);

  if (ctx.playerContext) {
    parts.push(`\nPLAYER CONTEXT:\n${ctx.playerContext}`);
  }

  // Format directions as rules
  if (ctx.directions.length > 0) {
    parts.push('\nCONVERSATION RULES (follow these during the conversation):');
    const sorted = [...ctx.directions].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    for (const dir of sorted) {
      parts.push(`- ${formatDirectionAsRule(dir)}`);
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
  const directionDescriptions = directions.map((d, i) => {
    const triggerDesc = formatTriggerDescription(d);
    const actionDesc = formatActionDescription(d.action);
    return `  ${i}: ${triggerDesc} → ${actionDesc} ${d.once ? '(once only)' : ''}`;
  });

  return `Evaluate which conversation directions are triggered by the player's latest input.

PLAYER INPUT: "${playerInput}"

CONVERSATION HISTORY (${history.length} turns so far):
${history.map(t => `  ${t.role === 'npc' ? 'NPC' : 'Player'}: ${t.text}`).join('\n')}

CURRENT TURN: ${turnNumber}

DIRECTIONS TO EVALUATE:
${directionDescriptions.join('\n')}

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
export function collectActions(directions: ConversationDirection[], triggeredIndices: number[]): {
  steeringInstructions: string[];
  exitTarget: string | null;
  variableSets: Array<{ name: string; value: any }>;
} {
  const result = {
    steeringInstructions: [] as string[],
    exitTarget: null as string | null,
    variableSets: [] as Array<{ name: string; value: any }>,
  };

  for (const idx of triggeredIndices) {
    if (idx < 0 || idx >= directions.length) continue;
    processAction(directions[idx].action, result);
  }

  return result;
}

function processAction(
  action: ConversationAction,
  result: { steeringInstructions: string[]; exitTarget: string | null; variableSets: Array<{ name: string; value: any }> },
): void {
  switch (action.type) {
    case 'steer':
      if (action.instruction) result.steeringInstructions.push(action.instruction);
      break;
    case 'exit':
      if (action.exitTarget) result.exitTarget = action.exitTarget;
      break;
    case 'set-variable':
      if (action.variableName !== undefined) {
        result.variableSets.push({ name: action.variableName, value: action.variableValue });
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
