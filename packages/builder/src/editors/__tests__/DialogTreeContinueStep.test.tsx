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
    expect(screen.getByText('then, after the reading time')).toBeTruthy();
    expect(screen.queryByText('Player says:')).toBeNull();
    expect(screen.getByDisplayValue('And go where?')).toBeTruthy();
    // Only the last line in the chain takes player responses.
    expect(screen.getAllByText('Add Player Response')).toHaveLength(1);
  });
});
