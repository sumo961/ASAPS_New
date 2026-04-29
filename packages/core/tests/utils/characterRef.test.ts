import { describe, it, expect } from 'vitest';
import { resolveCharacter, resolveCharacterKey, isKnownCharacter } from '../../src/utils/characterRef';

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
