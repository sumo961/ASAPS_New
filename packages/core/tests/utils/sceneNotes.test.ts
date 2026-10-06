import { describe, it, expect } from 'vitest';
import { isCopiedCharacterDescription, sceneNotesFor } from '../../src/utils/dossier';
import { npcIdentityBlock, buildConversationSystemPrompt } from '../../src/utils/ConversationPromptBuilder';

const characters = [
  {
    id: 'char_mara',
    name: 'Mara',
    displayName: 'Mara Lind',
    description: 'A retired ferry captain who distrusts officials.',
    variants: [{ id: 'v1', name: 'Warm', description: 'Mara on a good day: chatty and generous.' }],
  },
];

describe('isCopiedCharacterDescription', () => {
  it('recognises a copy of the linked character description, ignoring case and spacing', () => {
    expect(isCopiedCharacterDescription('  a retired ferry captain who\ndistrusts officials. ', 'char_mara', characters)).toBe(true);
  });

  it('matches the character by name or display name too', () => {
    expect(isCopiedCharacterDescription(characters[0].description, 'Mara Lind', characters)).toBe(true);
    expect(isCopiedCharacterDescription(characters[0].description, 'mara', characters)).toBe(true);
  });

  it('recognises a copy of a variant description', () => {
    expect(isCopiedCharacterDescription('Mara on a good day: chatty and generous.', 'char_mara', characters)).toBe(true);
  });

  it('keeps edited text and free-text NPCs', () => {
    expect(isCopiedCharacterDescription('In a hurry; the ferry leaves in five minutes.', 'char_mara', characters)).toBe(false);
    expect(isCopiedCharacterDescription(characters[0].description, 'Some Stranger', characters)).toBe(false);
    expect(isCopiedCharacterDescription('', 'char_mara', characters)).toBe(false);
  });
});

describe('sceneNotesFor', () => {
  it('drops a copy and keeps real scene notes', () => {
    expect(sceneNotesFor(characters[0].description, 'char_mara', characters)).toBe('');
    expect(sceneNotesFor(' In a hurry. ', 'char_mara', characters)).toBe('In a hurry.');
  });
});

describe('npcIdentityBlock', () => {
  it('labels the field as scene notes when a dossier gives the identity', () => {
    const block = npcIdentityBlock('CHARACTER: Mara Lind\nDescription: …', 'In a hurry.');
    expect(block).toContain('CHARACTER: Mara Lind');
    expect(block).toContain('IN THIS SCENE: In a hurry.');
    expect(block).not.toContain('PERSONALITY:');
  });

  it('keeps PERSONALITY for a free-text NPC without a dossier', () => {
    expect(npcIdentityBlock('', 'A grumpy innkeeper.')).toBe('PERSONALITY: A grumpy innkeeper.');
  });

  it('is empty when there is neither', () => {
    expect(npcIdentityBlock(undefined, '  ')).toBe('');
  });

  it('feeds the conversation system prompt', () => {
    const prompt = buildConversationSystemPrompt({
      npcName: 'Mara Lind',
      npcPersonality: 'In a hurry.',
      characterDossier: 'CHARACTER: Mara Lind',
      scenario: 'At the pier',
      playerContext: '',
      directions: [],
      history: [],
      turnNumber: 1,
      maxTurns: 5,
    });
    expect(prompt).toContain('IN THIS SCENE: In a hurry.');
  });
});
