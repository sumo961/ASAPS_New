import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DialogTreeEditor } from '../DialogTreeEditor';

const lone = { id: 'n0', speaker: 'Mara', text: "We can't stay here.", choices: [] };
const chained = {
  ...lone,
  choices: [{ id: 'k', text: '', continue: true, dialogNode: { id: 'n1', speaker: 'Jonas', text: 'And go where?', choices: [] } }],
};

describe('DialogTreeEditor continue step', () => {
  it('"Then another character speaks" adds the next line for a different character', () => {
    const onChange = vi.fn();
    render(<DialogTreeEditor dialogTree={lone as any} onChange={onChange} characters={['Mara', 'Jonas']} />);
    fireEvent.click(screen.getByText('Then another character speaks'));
    const tree = onChange.mock.calls[0][0];
    expect(tree.choices).toHaveLength(1);
    expect(tree.choices[0]).toMatchObject({ continue: true, text: '' });
    expect(tree.choices[0].dialogNode.speaker).toBe('Jonas');
  });

  it('shows the next line under the first, not as a player reply', () => {
    render(<DialogTreeEditor dialogTree={chained as any} onChange={vi.fn()} characters={['Mara', 'Jonas']} />);
    expect(screen.getByText('then')).toBeTruthy();
    expect(screen.queryByText('Player says:')).toBeNull();
    expect(screen.getByDisplayValue('And go where?')).toBeTruthy();
    // Only the last line in the chain takes player responses.
    expect(screen.getAllByText('Add Player Response')).toHaveLength(1);
  });

  const defended = { type: 'variable', operator: '==', variableName: 'defended', value: true };
  const branching = {
    id: 'n0', speaker: 'Bully', text: 'Nice shoes.',
    choices: [
      { id: 'ifHelped', text: '', continue: true, conditions: [defended], effects: [{ type: 'setVariable', variable: 'tension', value: 2 }],
        dialogNode: { id: 'n1', speaker: 'Bystander', text: 'Leave her alone.', choices: [] } },
      { id: 'reply', text: 'Stop it.' },
    ],
  };

  it('a conditional line reads "then, if …" and the player answers otherwise', () => {
    render(<DialogTreeEditor dialogTree={branching as any} onChange={vi.fn()} characters={['Bully', 'Bystander']} />);
    expect(screen.getByText(/^then, if .*defended/)).toBeTruthy();
    expect(screen.getByText('Unless one of the lines below plays, the player answers:')).toBeTruthy();
    expect(screen.getByDisplayValue('Stop it.')).toBeTruthy();
    expect(screen.getByDisplayValue('Leave her alone.')).toBeTruthy();
    // Badge counts: one condition, one effect.
    expect(screen.getByTestId('dialog-continue-settings').textContent).toMatch(/◇ 1.*⚡ 1/);
  });

  it('opens conditions & effects on a continue step and edits the step', () => {
    const onChange = vi.fn();
    render(<DialogTreeEditor dialogTree={chained as any} onChange={onChange} characters={['Mara', 'Jonas']} />);
    fireEvent.click(screen.getByTestId('dialog-continue-settings'));
    expect(screen.getByText('This line plays only if…')).toBeTruthy();
    expect(screen.getByText('When this line plays:')).toBeTruthy();
    fireEvent.click(screen.getByTitle(/this line plays only when every condition holds/));
    const tree = onChange.mock.calls.at(-1)![0];
    expect(tree.choices[0].continue).toBe(true);
    expect(tree.choices[0].conditions).toHaveLength(1);
  });

  it('"Or a different line, if…" goes before the line that always plays', () => {
    const onChange = vi.fn();
    render(<DialogTreeEditor dialogTree={chained as any} onChange={onChange} characters={['Mara', 'Jonas']} />);
    fireEvent.click(screen.getByTestId('dialog-add-alternative'));
    const tree = onChange.mock.calls[0][0];
    expect(tree.choices).toHaveLength(2);
    expect(tree.choices.every((c: any) => c.continue)).toBe(true);
    expect(tree.choices[1].id).toBe('k'); // the unconditional one stays last
  });

  it('warns about a line that can never play', () => {
    const shadowed = { ...lone, choices: [chained.choices[0], { ...chained.choices[0], id: 'k2', conditions: [defended] }] };
    render(<DialogTreeEditor dialogTree={shadowed as any} onChange={vi.fn()} characters={['Mara', 'Jonas']} />);
    expect(screen.getByTestId('dialog-continue-unreachable')).toBeTruthy();
  });

  it('a line with replies offers "Or another character speaks, if…"', () => {
    const onChange = vi.fn();
    const withReply = { ...lone, choices: [{ id: 'r', text: 'Fine.' }] };
    render(<DialogTreeEditor dialogTree={withReply as any} onChange={onChange} characters={['Mara', 'Jonas']} />);
    fireEvent.click(screen.getByText('Or another character speaks, if…'));
    const tree = onChange.mock.calls[0][0];
    expect(tree.choices.map((c: any) => c.id)).toEqual(['r', expect.stringMatching(/^continue_/)]);
  });
});
