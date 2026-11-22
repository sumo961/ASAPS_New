import { describe, it, expect } from 'vitest';
import { genderFromName, genderFromText, genderOfCharacter, guessSpeakerGenders } from '../guessGender';
import { autoSpeakerVoices, speakerGenders } from '../autoVoices';

describe('woman or man, as far as the story says', () => {
  it('the pronouns the author set come first', () => {
    expect(genderOfCharacter({ displayName: 'Karin', pronouns: 'he' })).toBe('male');
    expect(genderOfCharacter({ displayName: 'Sven', pronouns: 'she' })).toBe('female');
    // "They", or pronouns of the author's own: nothing is guessed over that.
    expect(genderOfCharacter({ displayName: 'Karin', pronouns: 'they', description: 'She is tired.' })).toBeUndefined();
    expect(genderOfCharacter({ displayName: 'Karin', pronouns: { they: 'xe' } })).toBeUndefined();
  });

  it('then what the character\'s own texts call them', () => {
    // The Rehearsal template's Karin: no pronouns set.
    expect(genderOfCharacter({ name: 'karin', displayName: 'Karin Lindqvist', description: 'Karin Lindqvist, 48, recently divorced. She missed two payments on her rent support.' })).toBe('female');
    expect(genderOfCharacter({ displayName: 'Robin', variants: [{ characterDescription: 'He keeps his notebook close.' }] })).toBe('male');
    // Text about two people settles nothing; the name does.
    expect(genderFromText('She told him that he was late and she left.')).toBeUndefined();
    expect(genderOfCharacter({ displayName: 'Ingrid', description: 'She argues with him; he shrugs; she insists; his loss.' })).toBe('female');
  });

  it('then what they are called: a role word, or a common first name', () => {
    for (const n of ['Mom', 'Grandma', 'Mrs Holm', 'The Queen', 'Karin Lindqvist', 'Captain Ingrid', 'Mara\'s mother']) expect(genderFromName(n)).toBe('female');
    for (const n of ['Dad', 'Grandpa', 'Mr. Berg', 'the old King', 'Tomas', 'Old Sven', 'Huntsman']) expect(genderFromName(n)).toBe('male');
    // No answer where there is none: an animal, a job, a name used for both, both at once.
    for (const n of ['Wolf', 'Narrator', 'The Doctor', 'Alex', 'Robin', 'Mr and Mrs Berg', '', undefined]) expect(genderFromName(n as any)).toBeUndefined();
  });

  it('speakers who are no character go by their name; a character by all they are known by', () => {
    const g = guessSpeakerGenders([{ id: 'char_k', name: 'karin', displayName: 'Karin Lindqvist', description: 'She waits.' }], ['Narrator', 'Mom', 'Wolf', 'karin']);
    expect(g).toEqual({ 'Karin Lindqvist': 'female', karin: 'female', char_k: 'female', Mom: 'female' });
  });
});

describe('a voice that suits', () => {
  const voices = [
    { id: 'alloy', gender: 'neutral' as const }, { id: 'ash', gender: 'male' as const }, { id: 'coral', gender: 'female' as const },
    { id: 'echo', gender: 'male' as const }, { id: 'marin', gender: 'female' as const },
  ];
  const karin = [{ id: 'karin', name: 'karin', displayName: 'Karin Lindqvist', description: 'She missed two payments.' }];

  it('Karin is read by a woman, not by the first free voice', () => {
    const auto = autoSpeakerVoices({ speakers: ['Narrator', 'Interactor', 'Karin Lindqvist', 'karin'], voices, defaultVoiceId: 'marin', genders: speakerGenders(karin, ['Karin Lindqvist', 'karin']), sameSpeaker: [['Karin Lindqvist', 'karin']] });
    expect(auto).toEqual({ 'Karin Lindqvist': 'coral', karin: 'coral' });
  });

  it('when the women\'s voices are all taken, women share one rather than get a man\'s', () => {
    const auto = autoSpeakerVoices({ speakers: ['Narrator', 'Anna', 'Eva', 'Ida', 'Sven'], voices, defaultVoiceId: 'alloy', genders: speakerGenders([], ['Anna', 'Eva', 'Ida', 'Sven']) });
    expect(auto).toEqual({ Anna: 'coral', Eva: 'marin', Ida: 'coral', Sven: 'ash' });
  });

  it('someone the story says nothing about gets any free voice', () => {
    const auto = autoSpeakerVoices({ speakers: ['Narrator', 'Wolf'], voices, defaultVoiceId: 'marin', genders: speakerGenders([], ['Wolf']) });
    expect(auto).toEqual({ Wolf: 'alloy' });
  });
});
