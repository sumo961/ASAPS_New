import { describe, it, expect } from 'vitest';
import { translateBeatParameters } from '../StoryTranslator';
import { translationKeyFor } from '../../components/script/ScriptView';

const resource: any = {
  languageCode: 'af',
  strings: {
    'beat:b1.parameters.text': { value: 'Sy sukkel', status: 'translated' },
    'beat:b1.parameters.buttonText': { value: 'Verder', status: 'translated' },
    'beat:b1.parameters.choices.0.displayText': { value: 'Links', status: 'translated' },
    'beat:b1.parameters.question': { value: 'Which way?', status: 'untranslated' },
    'beat:b2.parameters.text': { value: 'Ander', status: 'translated' },
  },
};

describe('translateBeatParameters (editor display in the chosen language)', () => {
  const params = { text: 'She struggles', buttonText: 'Continue', question: 'Which way?', choices: [{ id: 'c', text: 'Left' }] };

  it('puts this beat\'s translated strings in a copy, leaving the beat alone', () => {
    const out = translateBeatParameters(params, resource, 'b1');
    expect(out.text).toBe('Sy sukkel');
    expect(out.buttonText).toBe('Verder');
    expect((out.choices[0] as any).displayText).toBe('Links');
    expect(out.choices[0].text).toBe('Left');
    expect(out.question).toBe('Which way?');
    expect(params.text).toBe('She struggles');
  });

  it('returns the same object with no language or nothing translated', () => {
    expect(translateBeatParameters(params, null, 'b1')).toBe(params);
    expect(translateBeatParameters(params, resource, 'b9')).toBe(params);
  });
});

describe('Script field translation keys', () => {
  it('turns a script path into the translation key', () => {
    expect(translationKeyFor('b1', 'dialogTree.choices[0].dialogNode.text')).toBe('beat:b1.parameters.dialogTree.choices.0.dialogNode.text');
  });
});
