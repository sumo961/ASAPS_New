import { describe, it, expect } from 'vitest';
import { migrateCopiedNpcDescriptions, deserializeBeats } from '../projectDeserializer';

const characters = [{ id: 'char_mara', name: 'Mara', displayName: 'Mara', description: 'A retired ferry captain.' }];

function aiBeat(type: string, id: string, npcPersonality: string, npcName = 'char_mara') {
  return deserializeBeats([{ id, name: id, type, parameters: { npcName, npcPersonality, scenario: 'At the pier' } }])[0];
}

describe('migrateCopiedNpcDescriptions', () => {
  it('clears a copy of the linked character description in both AI beat types', () => {
    const beats = [
      aiBeat('aiConversation', 'b1', 'A retired ferry captain.'),
      aiBeat('aiDialogTree', 'b2', 'a retired  ferry captain.'),
    ];
    expect(migrateCopiedNpcDescriptions(beats as any, characters)).toBe(2);
    for (const b of beats) expect((b as any).getParameters().npcPersonality || '').toBe('');
  });

  it('keeps edited scene notes and free-text NPCs', () => {
    const beats = [
      aiBeat('aiConversation', 'b1', 'In a hurry; the ferry leaves soon.'),
      aiBeat('aiConversation', 'b2', 'A retired ferry captain.', 'Old Sailor'),
    ];
    expect(migrateCopiedNpcDescriptions(beats as any, characters)).toBe(0);
    expect((beats[0] as any).getParameters().npcPersonality).toBe('In a hurry; the ferry leaves soon.');
    expect((beats[1] as any).getParameters().npcPersonality).toBe('A retired ferry captain.');
  });
});
