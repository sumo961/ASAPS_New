/**
 * Story Data: variables with the beats that set, test and show them;
 * counters listed as the story's own or a character's.
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { StoryDataWindow } from '../StoryDataWindow';

const beats = [
  { id: 'b1', name: 'Find the key', type: 'multiChoice', parameters: { choices: [{ text: 'Take it', effects: [
    { type: 'setVariable', target: 'hasKey', value: true },
    { type: 'incrementCounter', target: 'score', value: 1 },
    { type: 'incrementCounter', target: 'trust', value: 1, character: '@confidant' },
  ] }] } },
  { id: 'b2', name: 'The door', type: 'conditionBeat', parameters: { condition: { type: 'variable', variable: 'hasKey', operator: '==', value: true } } },
  { id: 'b3', name: 'Outside', type: 'infoText', parameters: { text: 'Hello ${playerName}.' } },
];
const characters = [
  { id: 'char_mara', name: 'mara', displayName: 'Mara', counters: [{ name: 'trust', displayName: 'Trust', value: 2 }] },
  { id: 'char_jonas', name: 'jonas', displayName: 'Jonas', counters: [{ name: 'mood', value: 0, source: { kind: 'sentiment' } }] },
];
const roles = [{ id: 'confidant', candidates: ['char_mara'] }];

function open(variables: any[] = [{ name: 'hasKey', type: 'boolean', defaultValue: false }]) {
  const onVariablesChange = vi.fn();
  const onGoToBeat = vi.fn();
  render(<StoryDataWindow variables={variables} onVariablesChange={onVariablesChange} beats={beats} characters={characters} roles={roles} onGoToBeat={onGoToBeat} />);
  return { onVariablesChange, onGoToBeat };
}

describe('Story Data', () => {
  it('lists where a variable is set and tested, and goes to a beat on click', () => {
    const { onGoToBeat } = open();
    const usage = screen.getByTestId('usage-hasKey');
    expect(usage.textContent).toContain('Find the key');
    expect(usage.textContent).toContain('The door');
    fireEvent.click(within(usage).getByText('The door'));
    expect(onGoToBeat).toHaveBeenCalledWith('b2');
  });

  it('offers a variable the story uses but the list lacks', () => {
    const { onVariablesChange } = open();
    const section = screen.getByTestId('story-data-undeclared');
    expect(section.textContent).toContain('playerName');
    fireEvent.click(within(section).getByText('Add to the list'));
    expect(onVariablesChange.mock.calls[0][0].map((v: any) => v.name)).toEqual(['hasKey', 'playerName']);
  });

  it('applies a renamed variable when the field is left, not per key', () => {
    const { onVariablesChange } = open();
    const name = screen.getByLabelText('Variable name');
    fireEvent.change(name, { target: { value: 'hasBrassKey' } });
    expect(onVariablesChange).not.toHaveBeenCalled();
    fireEvent.blur(name);
    expect(onVariablesChange.mock.calls[0][0][0].name).toBe('hasBrassKey');
  });

  it('tells story counters from a character’s, following a role to who can play it', () => {
    open();
    fireEvent.click(screen.getByRole('tab', { name: /Counters/ }));
    expect(screen.getByTestId('counter-score').textContent).toContain('Find the key');
    expect(screen.getByTestId('counter-mara-trust').textContent).toContain('Find the key');
    expect(screen.queryByTestId('counter-trust')).toBeNull();
    expect(screen.getByTestId('counter-jonas-mood').textContent).toContain('Follows the character');
  });
});
