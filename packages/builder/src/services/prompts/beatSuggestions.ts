/**
 * Beat Suggestion Prompts
 *
 * Templates for AI beat suggestions
 */

import type { BeatSuggestionRequest } from '../../types/ai';
import type { BeatConfig } from '@asaps/core';

/**
 * Build system prompt for beat suggestions
 */
export function buildBeatSuggestionsSystemPrompt(schema: any): string {
  return `You are an expert story structure advisor. You suggest logical next beats in an interactive story based on the current context.

## Beat Schema
${JSON.stringify(schema, null, 2)}

## Your Task
Analyze the current beat and story context, then suggest 3-5 logical next beats that would:
1. Advance the story naturally
2. Provide player agency and choices
3. Match the genre and tone
4. Create engaging narrative flow
5. Use appropriate beat types

## Output Format
Respond with JSON in this structure:
{
  "suggestions": [
    {
      "beatType": "validBeatType",
      "name": "Descriptive beat name",
      "reasoning": "Why this makes sense as the next beat",
      "parameters": { /* pre-filled parameters */ },
      "connections": [{ "targetId": "..." }],
      "confidence": 0.85,
      "position": { "x": 100, "y": 200 }
    }
  ]
}

## Suggestion Guidelines
1. Suggest beats that logically follow the current beat
2. Consider the beat's connection type (single, multiple, conditional, none)
3. Provide variety - different beat types when appropriate
4. Pre-fill parameters with sensible defaults
5. Order suggestions by confidence (most likely first)
6. Confidence scores: 0.8-1.0 = highly likely, 0.6-0.8 = good option, 0.4-0.6 = possible
7. Position beats to the right of current beat with vertical spacing

## Common Patterns
- After titleScreen → infoText or dialogTree (setup story)
- After infoText → movementChoice or pickProp (give player agency)
- After choice beats → durScreen or dialogTree (show consequences)
- After pickProp → infoText describing the item (MANDATORY - player needs narrative payoff)
- Before endScreen → conditionBeat checking accumulated state (counters, variables, inventory)
- Use setVariable before conditional branches
- Use conditionBeat to create branching based on variables, counters, inventory, or fictional time
- Use addRemoveInventory to REMOVE items or add from non-pickProp sources (pickProp auto-adds!)

## Timing and Pressure Features
All beats support advanced timing features to create pressure or self-running stories:
- **defaultTarget**: A beat ID to automatically advance to after a delay (creates time pressure)
- **defaultTargetDelay**: Seconds before auto-advancing to defaultTarget (default: 5)
- **showTimer**: Whether to display a countdown timer to the player (boolean)

Choice beats (dialogTree, movementChoice, pickProp) also support:
- **choiceDelay**: Delay in seconds before choices appear (creates dramatic pauses)
- **markVisited**: Block and dim choices leading to previously visited beats

Use these features when suggesting beats that should:
- Create tension and urgency (e.g., escape sequences, timed decisions)
- Build dramatic effect (delay choices for impact)
- Create self-running story sections (cutscenes with auto-advance)
- Force quick decisions under pressure

## Counter Effects on Choices
Choice beats (dialogTree, movementChoice, pickProp) support counter modifications:
- "counter": name of counter to modify
- "counterOperation": "change" (add/subtract) or "set" (replace)
- "counterValue": numeric value
- "soundEffect": filename to play when selected
Suggest adding counter effects to choices when the story needs state tracking.

## Fictional Time System
Stories can track in-story date/time progression:
- **setVariable** with type "fictionalTime" to set/advance/subtract time
- **conditionBeat** with type "fictionalTime" to branch based on date/time
- Supports units: minutes, hours, days, months, years
- Useful for: historical fiction, day counters, time-of-day mechanics, time travel stories
Suggest fictional time beats when the story involves date/time progression.

## AI Runtime Beats
When suggesting beats, consider AI-powered options:
- **aiInfoText**: AI-generated contextual text (needs fallbackText)
- **aiDurScreen**: AI-generated auto-advance text (needs fallbackText)
- **aiDialogTree**: AI-generated branching dialogue with exit targets and optional NPC farewell messages
- **aiConversation**: Real-time AI conversation with author-defined steering rules and free-form player input
- **aiCondition**: AI-driven branching based on accumulated player behavior
- **aiSummary**: AI-generated narrative summary of player's journey
- **onlineContent**: Fetch real-time data from APIs or AI search
Suggest AI runtime beats when dynamic, context-aware content would enhance the experience.

## NPC Auto-Exit on DialogTree
DialogTree nodes can have a "target" field for NPC-initiated exits (auto-advance without choices).
Useful after dialogTree when the NPC dismisses the player or forces an exit.`;
}

/**
 * Build user prompt for beat suggestions
 */
export function buildBeatSuggestionsUserPrompt(request: BeatSuggestionRequest): string {
  const parts: string[] = [];

  // Current beat info
  parts.push(`Current Beat:`);
  parts.push(`- Type: ${request.currentBeat.type}`);
  parts.push(`- Name: ${request.currentBeat.name}`);
  parts.push(`- Parameters: ${JSON.stringify(request.currentBeat.parameters || {}, null, 2)}`);

  // Connection info
  const currentConnections = request.currentBeat.connections || [];
  if (currentConnections.length > 0) {
    parts.push(`- Existing Connections: ${currentConnections.length} connection(s)`);
  } else {
    parts.push(`- No connections yet`);
  }

  // Story context
  if (request.storyMetadata) {
    parts.push(`\nStory Context:`);
    parts.push(`- Title: ${request.storyMetadata.title}`);
    if (request.storyMetadata.genre) {
      parts.push(`- Genre: ${request.storyMetadata.genre}`);
    }
  }

  // Existing beats summary
  if (request.existingBeats && request.existingBeats.length > 0) {
    parts.push(`\nExisting Story Structure:`);
    parts.push(`- Total Beats: ${request.existingBeats.length}`);

    const beatTypes = request.existingBeats.reduce((acc, beat) => {
      acc[beat.type] = (acc[beat.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    parts.push(`- Beat Types: ${Object.entries(beatTypes).map(([type, count]) => `${type}(${count})`).join(', ')}`);
  }

  // Number of suggestions
  const count = request.count || 3;
  parts.push(`\nSuggest ${count} logical next beats.`);

  return parts.join('\n');
}

/**
 * Format beat context summary
 */
function formatBeatSummary(beat: BeatConfig): string {
  const parts = [
    `${beat.type}: "${beat.name}"`
  ];

  if (beat.parameters) {
    const keyParams = Object.entries(beat.parameters)
      .slice(0, 2)
      .map(([key, val]) => `${key}=${JSON.stringify(val)}`)
      .join(', ');
    if (keyParams) {
      parts.push(`(${keyParams})`);
    }
  }

  return parts.join(' ');
}

/**
 * Get example beat suggestions for few-shot prompting
 */
export function getBeatSuggestionsExample(): { user: string; assistant: string } {
  return {
    user: `Current Beat:
- Type: movementChoice
- Name: Choose Investigation Location
- Parameters: {
  "question": "Where do you want to investigate?",
  "choices": [
    { "text": "Library", "target": "beat_3" },
    { "text": "Study", "target": "beat_4" }
  ]
}
- No connections yet

Story Context:
- Title: Murder at Blackwood Manor
- Genre: mystery

Suggest 3 logical next beats.`,
    assistant: JSON.stringify({
      suggestions: [
        {
          beatType: "dialogTree",
          name: "Interview Suspect in Library",
          reasoning: "After choosing a location, encountering and questioning a suspect creates tension and provides clues. DialogTree allows branching conversation with multiple questioning approaches.",
          parameters: {
            dialogTree: {
              id: "root",
              speaker: "Mr. Jenkins (Butler)",
              text: "Oh, Detective! I was just... organizing the books.",
              emotion: "fearful",
              choices: [
                { id: "accuse", text: "That seems suspicious...", target: "beat_accuse" },
                { id: "sympathize", text: "I understand. Where were you last night?", target: "beat_alibi" }
              ]
            }
          },
          connections: [{ targetId: "beat_accuse" }, { targetId: "beat_alibi" }],
          confidence: 0.9,
          position: { x: 1000, y: 50 }
        },
        {
          beatType: "pickProp",
          name: "Search for Clues",
          reasoning: "Investigating a location should allow finding evidence. PickProp lets player discover important items that advance the mystery.",
          parameters: {
            question: "You search the room carefully. What catches your attention?",
            props: [
              { id: "letter", name: "Mysterious Letter", target: "beat_clue1" },
              { id: "photo", name: "Old Photograph", target: "beat_clue2" },
              { id: "nothing", name: "Nothing useful", target: "beat_continue" }
            ]
          },
          connections: [],
          confidence: 0.85,
          position: { x: 1000, y: 200 }
        },
        {
          beatType: "setVariable",
          name: "Mark Location as Visited",
          reasoning: "Track which locations the player has investigated to unlock conditional content later or prevent re-visiting.",
          parameters: {
            variableName: "libraryVisited",
            value: true
          },
          connections: [{ targetId: "beat_next_location" }],
          confidence: 0.7,
          position: { x: 1000, y: 350 }
        }
      ]
    }, null, 2)
  };
}
