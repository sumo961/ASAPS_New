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

## Output Format
Respond with JSON in this exact structure:
{
  "dialogTree": {
    "id": "root",
    "speaker": "Character Name",
    "text": "What they say",
    "emotion": "neutral|happy|angry|sad|surprised|fearful",
    "choices": [
      {
        "id": "choice_1",
        "text": "Player response option",
        "target": "node_id" or { nested dialog node },
        "conditions": [],
        "effects": []
      }
    ],
    "next": "node_id" or { nested dialog node } // for linear continuation
  },
  "reasoning": "Brief explanation of dialog structure"
}

## Dialog Node Structure Rules
1. Every node must have: id, text
2. Speaker is optional (defaults to same as previous)
3. Emotion affects how dialog is presented
4. Choices are for player responses
5. Next is for NPC continuing to speak
6. Target can be another beat ID (string) or nested dialog node (object)

## Writing Guidelines
1. Keep dialog natural and conversational
2. Player choices should be distinct and meaningful
3. Use emotions to convey character state
4. Create branching that matters to the story
5. Balance dialog length - not too long per node
6. Consider adding conditions/effects for consequences

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
        emotion: "neutral",
        choices: [
          {
            id: "sympathetic",
            text: "I understand this must be difficult for you.",
            target: {
              id: "jenkins_relaxed",
              speaker: "Mr. Jenkins",
              text: "Thank you for understanding, Detective. I was in the kitchen preparing dinner.",
              emotion: "sad",
              next: "continue_investigation"
            }
          },
          {
            id: "aggressive",
            text: "Don't lie to me! I know you were near the study!",
            target: {
              id: "jenkins_defensive",
              speaker: "Mr. Jenkins",
              text: "How dare you! I served this family for 30 years! I would never...",
              emotion: "angry",
              next: "continue_investigation"
            }
          },
          {
            id: "factual",
            text: "Please just state the facts, Mr. Jenkins.",
            target: {
              id: "jenkins_formal",
              speaker: "Mr. Jenkins",
              text: "I was in the kitchen from 7 to 8 PM. The maid can verify this.",
              emotion: "neutral",
              next: "continue_investigation"
            }
          }
        ]
      },
      reasoning: "Dialog provides three distinct approaches (sympathetic, aggressive, factual) that reveal different aspects of the butler's personality and potentially different information. Each choice leads to a unique emotional response."
    }, null, 2)
  };
}
