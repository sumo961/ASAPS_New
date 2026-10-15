import { describe, it, expect } from 'vitest';
import { assignSpeakerColorSlots, speakerColorKey } from '../speakerColors';

describe('assignSpeakerColorSlots', () => {
  it('gives speakers slots in the order they first speak', () => {
    const tree = {
      speaker: 'Bully',
      choices: [
        { dialogNode: { speaker: 'Victim', choices: [{ dialogNode: { speaker: 'Bully' } }] } },
        { dialogNode: { speaker: 'Teacher' } },
        { dialogNode: { speaker: '' } },
      ],
    };
    const slots = assignSpeakerColorSlots(tree);
    expect([...slots.entries()]).toEqual([['Bully', 0], ['Victim', 1], ['Teacher', 2], ['NPC', 3]]);
  });

  it('distinct speakers get distinct slots (the name hash could collide)', () => {
    const names = ['Mara', 'Jonas', 'Sam', 'Lea', 'Tom', 'Ana', 'Ben', 'Eli'];
    const tree = names.reduceRight<any>((child, speaker) => ({ speaker, choices: child ? [{ dialogNode: child }] : [] }), null);
    expect(new Set(assignSpeakerColorSlots(tree).values()).size).toBe(8);
  });

  it('treats blank speakers as NPC', () => {
    expect(speakerColorKey('  ')).toBe('NPC');
    expect(speakerColorKey(undefined)).toBe('NPC');
  });
});
