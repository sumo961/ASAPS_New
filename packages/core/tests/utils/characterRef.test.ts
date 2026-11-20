import { describe, it, expect } from 'vitest';
import { resolveCharacter, resolveCharacterKey, isKnownCharacter, speakerLabel } from '../../src/utils/characterRef';

const characters = [
  { id: 'char_1', name: 'Granny', displayName: 'Grandma' },
  { id: 'char_2', name: 'Wolf', displayName: 'Big Bad Wolf' },
  { id: 'char_3', name: 'red', displayName: 'Little Red' },
];

describe('resolveCharacter', () => {
  it('matches by id (canonical case)', () => {
    expect(resolveCharacter('char_1', characters)?.id).toBe('char_1');
  });

  it('matches by name case-insensitively', () => {
    expect(resolveCharacter('granny', characters)?.id).toBe('char_1');
    expect(resolveCharacter('GRANNY', characters)?.id).toBe('char_1');
  });

  it('matches by displayName case-insensitively', () => {
    expect(resolveCharacter('grandma', characters)?.id).toBe('char_1');
    expect(resolveCharacter('Big Bad Wolf', characters)?.id).toBe('char_2');
  });

  it('prefers id over name when both match different characters', () => {
    // 'red' is char_3's name, but if 'red' were also char_1's id we'd want id to win.
    const tricky = [
      { id: 'red', name: 'Different' },
      { id: 'char_3', name: 'red' },
    ];
    expect(resolveCharacter('red', tricky)?.id).toBe('red');
  });

  it('returns null for unknown ref', () => {
    expect(resolveCharacter('nonexistent', characters)).toBeNull();
  });

  it('returns null for empty inputs', () => {
    expect(resolveCharacter('', characters)).toBeNull();
    expect(resolveCharacter(null, characters)).toBeNull();
    expect(resolveCharacter('Granny', null)).toBeNull();
    expect(resolveCharacter('Granny', [])).toBeNull();
  });
});

describe('resolveCharacterKey', () => {
  it('returns the canonical id for a known character', () => {
    expect(resolveCharacterKey('Granny', characters)).toBe('char_1');
    expect(resolveCharacterKey('grandma', characters)).toBe('char_1');
    expect(resolveCharacterKey('char_2', characters)).toBe('char_2');
  });

  it('returns the original ref unchanged for unknown characters (legacy / inline)', () => {
    expect(resolveCharacterKey('SomeUnknownNPC', characters)).toBe('SomeUnknownNPC');
  });

  it('returns null only for empty refs', () => {
    expect(resolveCharacterKey('', characters)).toBeNull();
    expect(resolveCharacterKey(null, characters)).toBeNull();
  });

  it('passes through ref unchanged when no characters list is provided', () => {
    expect(resolveCharacterKey('Granny', undefined)).toBe('Granny');
  });
});

describe('isKnownCharacter', () => {
  it('true when a defined character matches', () => {
    expect(isKnownCharacter('Granny', characters)).toBe(true);
    expect(isKnownCharacter('char_1', characters)).toBe(true);
  });

  it('false for inline / unknown refs', () => {
    expect(isKnownCharacter('Stranger', characters)).toBe(false);
  });

  it('false for empty refs', () => {
    expect(isKnownCharacter(null, characters)).toBe(false);
    expect(isKnownCharacter('Granny', null)).toBe(false);
  });
});

describe('resolveCharacter: a character played in translation', () => {
  // The story's lines say "Old Sven"; in German the character is "Der alte Sven".
  const cast = [
    { id: 'c1', name: 'Der alte Sven', displayName: 'Der alte Sven', alsoKnownAs: ['Old Sven'] },
    { id: 'c2', name: 'Kapitänin Ingrid', displayName: 'Kapitänin Ingrid', alsoKnownAs: ['Captain Ingrid', 'Ingrid'] },
    { id: 'c3', name: 'Tomas', displayName: 'Tomas' },
  ];
  it('is still found by the names its lines use', () => {
    expect(resolveCharacter('Old Sven', cast)?.id).toBe('c1');
    expect(resolveCharacter('ingrid', cast)?.id).toBe('c2');
    expect(resolveCharacter('Captain Ingrid', cast)?.id).toBe('c2');
  });
  it('and by its translated names, which win over a former name of someone else', () => {
    expect(resolveCharacter('Der alte Sven', cast)?.id).toBe('c1');
    const clash = [{ id: 'a', name: 'Ingrid', displayName: 'Ingrid' }, { id: 'b', name: 'Inga', alsoKnownAs: ['Ingrid'] }];
    expect(resolveCharacter('Ingrid', clash)?.id).toBe('a');
  });
  it('a stranger is still nobody', () => {
    expect(resolveCharacter('Narrator', cast)).toBeNull();
  });
});

describe('speakerLabel: the name above a line', () => {
  const german = [
    { id: 'c1', name: 'Der alte Sven', displayName: 'Der alte Sven', alsoKnownAs: ['Old Sven'] },
    { id: 'c2', name: 'Kapitänin Ingrid', displayName: 'Kapitänin Ingrid', alsoKnownAs: ['Captain Ingrid', 'Ingrid'] },
    { id: 'c3', name: 'Tomas', displayName: 'Tomas' },
  ];
  it('follows the translation for a character of the story', () => {
    expect(speakerLabel('Ingrid', german)).toBe('Kapitänin Ingrid');
    expect(speakerLabel('Captain Ingrid', german)).toBe('Kapitänin Ingrid');
    expect(speakerLabel('Old Sven', german)).toBe('Der alte Sven');
    expect(speakerLabel('Tomas', german)).toBe('Tomas');
  });
  it('shows a free-text speaker as written', () => {
    expect(speakerLabel('Narrator', german)).toBe('Narrator');
    expect(speakerLabel('A voice', undefined)).toBe('A voice');
  });
  it('changes nothing in the language the story was written in', () => {
    const source = [{ id: 'c2', name: 'Captain Ingrid', displayName: 'Ingrid' }];
    expect(speakerLabel('Captain Ingrid', source)).toBe('Captain Ingrid');
    expect(speakerLabel('Ingrid', source)).toBe('Ingrid');
  });
});

