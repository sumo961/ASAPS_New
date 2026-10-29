import { describe, it, expect } from 'vitest';
import { BeatTypeRegistry } from '@asaps/core';
import { scriptFields, scriptEdit, storyOrder } from '../scriptFields';

const registry = BeatTypeRegistry.getInstance();
const make = (id: string, type: string, extra: Record<string, any> = {}) =>
  registry.createBeat(type, { id, name: id, type, ...extra } as any) as any;

describe('scriptFields', () => {
  it('Info Text: its text', () => {
    const beat = make('a', 'infoText', { parameters: { text: 'Rain on the roof.' } });
    expect(scriptFields(beat).map((f) => [f.path, f.label, f.value])).toEqual([['text', 'Text', 'Rain on the roof.']]);
  });

  it('Multi Choice: question and choices, the shown label where one is set apart', () => {
    const beat = make('m', 'multiChoice', { parameters: { question: 'Now what?', choices: [
      { id: 'a', text: 'Run', target: 'x' },
      { id: 'b', text: 'hide_key', displayText: 'Hide', target: 'y' },
    ] } });
    expect(scriptFields(beat).map((f) => [f.path, f.label, f.value, f.kind])).toEqual([
      ['question', 'Question', 'Now what?', 'text'],
      ['choices[0].text', 'Choice 1', 'Run', 'choice'],
      ['choices[1].displayText', 'Choice 2', 'Hide', 'choice'],
    ]);
  });

  it('Dialog Tree: every line with who says it; a single reply stays at the line\'s level', () => {
    const beat = make('d', 'dialogTree', { parameters: { dialogTree: {
      id: 'r', speaker: 'Ann', text: 'Hi.',
      choices: [{ id: 'c', text: 'Why?', dialogNode: { id: 'n', speaker: 'Ann', text: 'Because.', choices: [] } }],
    } } });
    expect(scriptFields(beat).map((f) => [f.path, f.label, f.depth, f.kind])).toEqual([
      ['dialogTree.text', 'Ann', 0, 'line'],
      ['dialogTree.choices[0].text', 'Reply', 0, 'reply'],
      ['dialogTree.choices[0].dialogNode.text', 'Ann', 0, 'line'],
    ]);
  });

  it('Dialog Tree: replies indent where the conversation branches, with what follows them', () => {
    const beat = make('d', 'dialogTree', { parameters: { dialogTree: {
      id: 'r', speaker: 'Ann', text: 'Tea or coffee?',
      choices: [
        { id: 'a', text: 'Tea', dialogNode: { id: 'n1', speaker: 'Ann', text: 'Good.', choices: [{ id: 'a2', text: 'Thanks' }] } },
        { id: 'b', text: 'Coffee' },
      ],
    } } });
    expect(scriptFields(beat).map((f) => [f.value, f.depth])).toEqual([
      ['Tea or coffee?', 0], ['Tea', 1], ['Good.', 1], ['Thanks', 1], ['Coffee', 1],
    ]);
  });

  it('Dialog Tree: a continue step has no reply line; the next line follows at the same level', () => {
    const beat = make('d', 'dialogTree', { parameters: { dialogTree: {
      id: 'r', speaker: 'Ann', text: 'Listen.',
      choices: [{ id: 'k', text: '', continue: true, dialogNode: { id: 'n', speaker: 'Bo', text: 'I am.', choices: [] } }],
    } } });
    expect(scriptFields(beat).map((f) => [f.label, f.depth, f.kind])).toEqual([['Ann', 0, 'line'], ['Bo', 0, 'line']]);
  });

  it('an AI beat\'s prompt is not script text', () => {
    expect(scriptFields(make('ai', 'aiInfoText', { parameters: { prompt: 'Describe the room' } }))).toEqual([]);
  });
});

describe('scriptEdit', () => {
  it('changes only that text, and the beat keeps its links', () => {
    const beat = make('m', 'multiChoice', { parameters: { question: 'Q', choices: [{ id: 'a', text: 'Run', target: 'x' }] } });
    const { parameters } = scriptEdit(beat, 'choices[0].text', 'Run away');
    beat.updateParameters(parameters);
    expect(beat.getParameters().choices[0]).toMatchObject({ id: 'a', text: 'Run away', target: 'x' });
    expect(beat.getParameters().question).toBe('Q');
  });
});

describe('storyOrder', () => {
  it('reads from the start along the links, a branch to its end first; unreached beats last', () => {
    const beats = [
      make('end', 'endScreen'),
      make('b2', 'infoText', { connections: [{ targetId: 'end' }] }),
      make('choice', 'multiChoice', { parameters: { choices: [{ id: 'x', text: 'A', target: 'b1' }, { id: 'y', text: 'B', target: 'b2' }] } }),
      make('stray', 'infoText'),
      make('b1', 'infoText', { connections: [{ targetId: 'end' }] }),
      make('title', 'titleScreen', { connections: [{ targetId: 'choice' }] }),
    ];
    expect(storyOrder(beats).map((b) => b.id)).toEqual(['title', 'choice', 'b1', 'end', 'b2', 'stray']);
  });
});
