/**
 * Dialog Generation Prompts
 *
 * Templates for AI dialog tree generation
 */

import type { DialogGenerationRequest } from '../../types/ai';

/**
 * Build system prompt for dialog generation
 */
export function buildDialogGenerationSystemPrompt(): string {
  return `You are an expert dialogue writer for interactive stories. You create engaging, branching conversations that feel natural and give players meaningful choices.

## Your Task
Generate dialog trees for interactive conversations with:
1. Natural, character-appropriate dialogue
2. Meaningful player choices that affect outcomes
3. Appropriate emotional tones
4. Proper branching structure
5. Clear consequences for choices

## Dialog Flow Pattern
Dialog trees use a compact, alternating structure:
- dialogNode: Contains speaker, text, and choices array
- choice: What the player clicks - the text IS what the player says
- Nested dialogNode inside choice: The NPC's response to that choice

The key insight: The choice text IS the player's line. When you want an NPC to respond to a player choice and then exit, put the NPC's response text directly IN THE CHOICE that exits.

## Output Format
Respond with JSON in this exact structure:
{
  "dialogTree": {
    "id": "root",
    "speaker": "NPC Name",
    "text": "NPC opening line",
    "choices": [
      {
        "id": "choice_1",
        "text": "Player response text",
        "dialogNode": {              // NPC responds to this choice
          "id": "node_1",
          "speaker": "NPC Name",
          "text": "NPC response",
          "choices": [
            { "id": "c1", "text": "Player's next line that exits", "target": "next_beat" }
          ]
        }
      },
      {
        "id": "choice_2",
        "text": "Alternative player response that exits directly",
        "target": "next_beat"
      }
    ]
  },
  "reasoning": "Brief explanation"
}

## Text Formatting (markdown-lite)
- Dialog node text may use **bold**, *italic*, ~~strikethrough~~ — sparingly, for emphasis a reader should feel
- Choice text (the player's lines on buttons) stays PLAIN — no markers
- Never emit raw HTML; it renders as literal escaped text

## Speaker & Character Rules
- The "speaker" field on each dialogNode must match a character's **displayName** (e.g., "Jenkins", "Dr. Grey")
- "Narrator" is the built-in default speaker (used when speaker is empty or set to "Narrator")
- The player character's displayName should be used when the player is speaking (not "You" or "Player" unless that is their actual displayName)
- Each dialogNode can have a different speaker, enabling back-and-forth conversations between multiple characters
- When story context provides character names, use those exact displayNames as speaker values

## CRITICAL Structure Rules
1. Every dialogNode has: id, speaker, text, and choices array
2. Each choice has text (player's line) and EITHER 'target' (beat ID) OR 'dialogNode' (NPC responds)
   - Special target "__self__": loops back to the same dialog beat (for interrogation, shopping, multi-question conversations)
   - Combine with markVisited to gray out already-asked questions
3. The choice TEXT is what the player says/clicks - make it their actual dialogue
4. NEVER use "[Continue]" or placeholder text - choices should contain meaningful player dialogue
5. When conversation ends, the FINAL choice text is the player's last line + target to exit
6. DO NOT create extra nesting just for continuation - keep trees as flat as possible
7. The speaker field on every dialogNode should be a character displayName from the story's characters list
8. NPC AUTO-EXIT: A dialogNode can have a "target" field to auto-advance WITHOUT showing choices:
   - The NPC delivers the text, then the story auto-advances to the target beat
   - Useful for: NPC dismissals, forced exits, NPC-initiated endings
   - When "target" is set on a node, choices on that node are ignored
   - Example: { "id": "n1", "speaker": "Guard", "text": "Go away!", "target": "beat_kicked_out", "choices": [] }

## Layout
The dialogTree renders according to its "layoutTemplate" parameter:
- "conversation" (default): text on one side, choices on the other — the natural back-and-forth feel
- "stacked": NPC text on top, choices below (visual-novel style)
- "chat-scroll": scrollable chat history like a messaging app
- "chat-bubble": a single bubble at a time
⚠️ Use "layoutTemplate". The older "presentationMode" still parses but layoutTemplate wins, and its old "positioned" value is now "stacked" — do not emit both fields.
Additional options:
- "showAvatars": boolean (default true) - Show character avatars in chat modes
- "responseDelay": number (seconds) - NPC typing delay before response
- "choiceDelay": number (seconds) - Delay before choices appear

## Consequences: effects on choices and nodes
Both a choice and a dialogNode can carry an "effects" array. This is the full vocabulary — reach for it whenever a line of dialogue should actually change something:

- Counters and state: { "type": "incrementCounter", "target": "trust", "value": 1 }, "setCounter", "setVariable", "addInventory", "removeInventory"
  - A counter effect may carry "character": "<character id>" to scope it to that character's own counter. Omit it for a story-wide tally. For these effects "target" is the COUNTER name.
- How a character feels — usually the truer consequence of dialogue than a number:
  - { "type": "addSentiment", "target": "char_jenkins", "sentimentTarget": "player", "sentimentEmotion": "trust", "strengthDelta": 0.2 }
  - { "type": "nudgeMood", "target": "char_jenkins", "valenceDelta": -0.2, "arousalDelta": 0.1 }
  - { "type": "fireEmotion", "target": "char_jenkins", "emotion": "fear", "emotionDelta": 0.3 }
  - For these affect effects "target" is the CHARACTER, not a counter — the opposite of the counter effects above.
- Sound: { "type": "playSound", "target": "<asset id | preset id | URL>" }

🚨 Never write to a counter that is BOUND to affect state (one carrying a "source" in the character's definition). Those are read-only displays of a feeling — the next appraisal discards your write. Move the feeling instead, with addSentiment / fireEmotion / nudgeMood, and the meter follows.

Shorthand (still supported, for a plain counter and nothing else): a choice may carry "counter" + "counterOperation" ("change" | "set") + "counterValue" instead of an effects array.
Example: { "text": "I want to help.", "target": "next", "counter": "trust", "counterOperation": "change", "counterValue": 5 }

## Sound Effects on Choices
A choice may also carry "soundEffect": a filename or asset id played when it is selected.
Example: { "text": "I accept your offer.", "target": "deal_done", "soundEffect": "handshake.mp3" }

## Gating choices
- "conditions": [ ... ] on a choice hides or blocks it until the story state matches — use it so earlier decisions visibly change what the player can say.
- "visible": false hides a choice outright.

## Visited Choice Tracking
When "markVisited" is true on the dialogTree beat:
- Choices that lead to already-visited beats are visually dimmed
- Useful for interrogation or shopping dialogs where player explores multiple questions
- Combine with "__self__" targets for multi-question conversations

## Writing Guidelines
1. Keep dialog natural and conversational
2. Player choices should be distinct and meaningful
3. Use emotions to convey character state
4. Create branching that matters to the story
5. Balance dialog length - not too long per node
6. Give choices real consequences — prefer shifting how the character FEELS (addSentiment / nudgeMood) over incrementing a number, when the scene is about a relationship
7. Use "__self__" with markVisited for multi-question interrogation/shopping dialogs
8. Add sound effects to enhance emotional impact of key choices

## Example Emotions
- neutral: Standard conversation
- happy: Pleased, excited, joyful
- angry: Frustrated, hostile, aggressive
- sad: Melancholic, disappointed, sorrowful
- surprised: Shocked, amazed, startled
- fearful: Scared, anxious, worried`;
}

/**
 * Build user prompt for dialog generation
 */
export function buildDialogGenerationUserPrompt(request: DialogGenerationRequest): string {
  const parts: string[] = [];

  // Scene context
  parts.push(`Scene: ${request.scene}`);

  // Character
  if (request.character) {
    parts.push(`Speaking Character: ${request.character}`);
  }

  // Goal
  if (request.goal) {
    parts.push(`Conversation Goal: ${request.goal}`);
  }

  // Branching
  if (request.branchingFactor) {
    parts.push(`Branching: Include ${request.branchingFactor} distinct player choice options`);
  }

  // Story context
  if (request.storyContext) {
    parts.push('\nStory Context:');
    parts.push(`- Title: ${request.storyContext.title}`);

    if (request.storyContext.variables && request.storyContext.variables.length > 0) {
      parts.push(`- Available Variables: ${request.storyContext.variables.join(', ')}`);
    }

    if (request.storyContext.characters && request.storyContext.characters.length > 0) {
      parts.push(`- Other Characters: ${request.storyContext.characters.join(', ')}`);
    }
  }

  parts.push('\nGenerate the dialog tree as JSON.');

  return parts.join('\n');
}

/**
 * Get example dialog generation for few-shot prompting
 */
export function getDialogGenerationExample(): { user: string; assistant: string } {
  return {
    user: 'Scene: Interrogating a suspicious butler about a murder\nSpeaking Character: Detective\nConversation Goal: Extract information while reading his reactions\nBranching: Include 3 distinct player choice options',
    assistant: JSON.stringify({
      dialogTree: {
        id: "root",
        speaker: "You",
        text: "Mr. Jenkins, where were you when Lord Blackwood was murdered?",
        choices: [
          {
            id: "sympathetic",
            text: "I understand this must be difficult for you.",
            dialogNode: {
              id: "jenkins_relaxed",
              speaker: "Mr. Jenkins",
              text: "Thank you for understanding, Detective. I was in the kitchen preparing dinner.",
              choices: [
                { id: "response_1", text: "I see. I'll need to verify that with the staff.", target: "continue_investigation" }
              ]
            }
          },
          {
            id: "aggressive",
            text: "Don't lie to me! I know you were near the study!",
            dialogNode: {
              id: "jenkins_defensive",
              speaker: "Mr. Jenkins",
              text: "How dare you! I served this family for 30 years! I would never...",
              choices: [
                { id: "response_2", text: "Calm down. We'll continue this later.", target: "continue_investigation" }
              ]
            }
          },
          {
            id: "factual",
            text: "Please just state the facts, Mr. Jenkins.",
            dialogNode: {
              id: "jenkins_formal",
              speaker: "Mr. Jenkins",
              text: "I was in the kitchen from 7 to 8 PM. The maid can verify this.",
              choices: [
                { id: "response_3", text: "Thank you. That will be all for now.", target: "continue_investigation" }
              ]
            }
          }
        ]
      },
      reasoning: "Dialog provides three distinct approaches (sympathetic, aggressive, factual) that reveal different aspects of the butler's personality. Each player choice is meaningful dialogue, and the final choice in each branch is the player's closing line that exits to the next beat. No [Continue] placeholders - every choice contains actual player dialogue."
    }, null, 2)
  };
}
