import { describe, it, expect } from 'vitest';
import { autoSpeakerVoices, autoVoicesApply, speakerGenders, speakerNameGroups, voicesUnderAllNames } from '../autoVoices';

const voices = [
  { id: 'alloy', gender: 'neutral' as const }, { id: 'ash', gender: 'male' as const }, { id: 'coral', gender: 'female' as const },
  { id: 'marin', gender: 'female' as const }, { id: 'verse', gender: 'male' as const },
];

describe('a voice of their own for speakers nobody chose one for', () => {
  it('the narrator keeps the default voice, a character gets another', () => {
    const auto = autoSpeakerVoices({ speakers: ['Narrator', 'Interactor', 'Karin Lindqvist'], voices, defaultVoiceId: 'marin' });
    expect(auto).toEqual({ 'Karin Lindqvist': 'alloy' });
  });

  it('every character a different one, in the story\'s order, and the same every time', () => {
    const input = { speakers: ['Narrator', 'Mara', 'Jonas', 'Ingrid', 'Tomas'], voices, defaultVoiceId: 'alloy' };
    const auto = autoSpeakerVoices(input);
    expect(auto).toEqual({ Mara: 'ash', Jonas: 'coral', Ingrid: 'marin', Tomas: 'verse' });
    expect(autoSpeakerVoices(input)).toEqual(auto);
  });

  it('leaves what the author chose, and does not hand that voice to someone else', () => {
    const auto = autoSpeakerVoices({ speakers: ['Narrator', 'Mara', 'Jonas'], assigned: { Mara: 'ash' }, voices, defaultVoiceId: 'alloy' });
    expect(auto).toEqual({ Jonas: 'coral' });
  });

  it('the player\'s own character stays silent until given a voice', () => {
    const auto = autoSpeakerVoices({ speakers: ['Narrator', 'Mara', 'Jonas'], voices, playerKeys: ['Mara'] });
    expect(auto).toEqual({ Jonas: 'ash' });
  });

  it('goes by she and he where a character says so', () => {
    const genders = speakerGenders([{ name: 'ingrid', displayName: 'Ingrid', pronouns: 'she' }, { name: 'sven', displayName: 'Sven', pronouns: 'he' }, { name: 'tomas', displayName: 'Tomas', pronouns: 'they' }]);
    expect(genders).toMatchObject({ Ingrid: 'female', Sven: 'male' });
    expect(genders.Tomas).toBeUndefined();
    const auto = autoSpeakerVoices({ speakers: ['Narrator', 'Sven', 'Ingrid', 'Tomas'], voices, defaultVoiceId: 'alloy', genders });
    expect(auto).toEqual({ Sven: 'ash', Ingrid: 'coral', Tomas: 'marin' });
  });

  it('more speakers than voices: they come round again, never the narrator\'s first', () => {
    const few = voices.slice(0, 3);
    const auto = autoSpeakerVoices({ speakers: ['Narrator', 'A', 'B', 'C', 'D'], voices: few, defaultVoiceId: 'alloy' });
    expect(auto).toEqual({ A: 'ash', B: 'coral', C: 'ash', D: 'coral' });
  });

  it('only for OpenAI; nothing without voices', () => {
    expect(autoVoicesApply('openai')).toBe(true);
    for (const other of ['elevenlabs', 'web-speech', 'local', 'custom', undefined, null]) expect(autoVoicesApply(other)).toBe(false);
    expect(autoSpeakerVoices({ speakers: ['Mara'], voices: [] })).toEqual({});
  });

  it('a character\'s names share one voice (a story may use the display name or the name)', () => {
    const sameSpeaker = speakerNameGroups([{ id: 'karin', name: 'karin', displayName: 'Karin Lindqvist' }, { id: 'char_mara', name: 'mara', displayName: 'Mara' }]);
    expect(sameSpeaker).toEqual([['Karin Lindqvist', 'karin'], ['Mara', 'mara', 'char_mara']]);
    const auto = autoSpeakerVoices({ speakers: ['Narrator', 'Interactor', 'Karin Lindqvist', 'karin', 'Sven'], voices, defaultVoiceId: 'marin', sameSpeaker });
    expect(auto).toEqual({ 'Karin Lindqvist': 'alloy', karin: 'alloy', Sven: 'ash' });
    // The author chose for one of the names: the other follows.
    expect(autoSpeakerVoices({ speakers: ['karin', 'Karin Lindqvist'], assigned: { 'Karin Lindqvist': 'coral' }, voices, sameSpeaker })).toEqual({ karin: 'coral' });
    // The player's character under another name stays silent too.
    expect(autoSpeakerVoices({ speakers: ['mara', 'Sven'], voices, playerKeys: ['Mara'], sameSpeaker })).toEqual({ Sven: 'ash' });
  });

  it('a chosen voice goes for the character\'s other names too, unless one has its own', () => {
    const groups = [['Karin Lindqvist', 'karin'], ['Mara', 'mara', 'char_mara']];
    expect(voicesUnderAllNames({ 'Karin Lindqvist': 'laura', Sven: 'roger', Mara: '' }, groups)).toEqual({ 'Karin Lindqvist': 'laura', karin: 'laura', Sven: 'roger' });
    // A voice once chosen under the internal name still counts, for the shown name as well.
    expect(voicesUnderAllNames({ karin: 'old' }, groups)).toEqual({ karin: 'old', 'Karin Lindqvist': 'old' });
    expect(voicesUnderAllNames({ karin: 'old', 'Karin Lindqvist': 'laura' }, groups)).toEqual({ karin: 'old', 'Karin Lindqvist': 'laura' });
    expect(voicesUnderAllNames(undefined, groups)).toEqual({});
  });
});

