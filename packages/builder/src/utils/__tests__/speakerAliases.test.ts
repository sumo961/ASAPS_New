import { describe, it, expect } from 'vitest';
import { speakerAliasesBetween } from '../speakerAliases';

describe('speakerAliasesBetween', () => {
  it('maps translated speaker and character names back to the originals', () => {
    const source = {
      characters: [{ id: 'c1', name: 'captain', displayName: 'The Captain' }],
      beats: [
        { id: 'b1', name: 'Boarding', speaker: 'The Captain', parameters: { text: 'Welcome aboard.' } },
        { id: 'b2', parameters: { dialogTree: { speaker: 'Mara', text: 'Hello', choices: [{ text: 'Hi', next: { speaker: 'Narrator', text: '…' } }] } } },
      ],
    };
    const translated = {
      characters: [{ id: 'c1', name: 'captain', displayName: 'Der Kapitän' }],
      beats: [
        { id: 'b1', name: 'Einsteigen', speaker: 'Der Kapitän', parameters: { text: 'Willkommen an Bord.' } },
        { id: 'b2', parameters: { dialogTree: { speaker: 'Mara', text: 'Hallo', choices: [{ text: 'Hi', next: { speaker: 'Erzähler', text: '…' } }] } } },
      ],
    };
    expect(speakerAliasesBetween(source, translated)).toEqual({
      'Der Kapitän': 'The Captain',
      'Einsteigen': 'Boarding',
      'Erzähler': 'Narrator',
    });
  });

  it('is empty when nothing was translated', () => {
    const story = { beats: [{ speaker: 'Mara' }] };
    expect(speakerAliasesBetween(story, story)).toEqual({});
  });
});
