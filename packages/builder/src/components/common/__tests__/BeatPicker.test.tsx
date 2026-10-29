import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import { BeatPicker, beatMatches } from '../BeatPicker';

const beats = [
  { id: 'b1', name: 'Hallway 3', type: 'infoText' },
  { id: 'b2', name: 'Hallway 3', type: 'multiChoice' },
  { id: 'b3', name: 'Cafeteria', type: 'dialogTree' },
];

describe('beatMatches', () => {
  it('needs every typed word somewhere in the name, id or type', () => {
    expect(beatMatches(beats[1], 'hall multi')).toBe(true);
    expect(beatMatches(beats[0], 'hall multi')).toBe(false);
    expect(beatMatches(beats[2], 'B3')).toBe(true);
    expect(beatMatches(beats[2], '  ')).toBe(true);
  });
});

describe('BeatPicker', () => {
  it('shows the picked beat with its type, so two beats with one name can be told apart', () => {
    render(<BeatPicker value="b2" onChange={() => {}} beats={beats} emptyLabel="Select target beat..." />);
    expect(screen.getByRole('combobox').textContent).toBe('Hallway 3 (multiChoice)');
  });

  it('narrows the list as you type and picks with Enter', () => {
    const onChange = vi.fn();
    render(<BeatPicker value="" onChange={onChange} beats={beats} emptyLabel="Select target beat..." />);
    fireEvent.click(screen.getByRole('combobox'));
    const search = screen.getByLabelText('Search beats');
    fireEvent.change(search, { target: { value: 'cafe' } });
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Cafeteria' + 'dialogTree']);
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('b3');
    expect(screen.queryByLabelText('Search beats')).toBeNull();
  });

  it('offers the empty row and extra rows, and moves with the arrow keys', () => {
    const onChange = vi.fn();
    render(
      <BeatPicker value="b1" onChange={onChange} beats={beats} emptyLabel="None"
        extraOptions={[{ value: '__self__', label: '↩ Return to initial choices' }]} />,
    );
    fireEvent.click(screen.getByRole('combobox'));
    const labels = screen.getAllByRole('option').map((o) => o.textContent);
    expect(labels.slice(0, 2)).toEqual(['None', '↩ Return to initial choices']);
    // Starts on the picked beat; up twice reaches the extra row.
    const search = screen.getByLabelText('Search beats');
    fireEvent.keyDown(search, { key: 'ArrowUp' });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('__self__');
  });

  it('typing on the closed field opens it with that letter as the search', () => {
    render(<BeatPicker value="" onChange={() => {}} beats={beats} />);
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'c' });
    expect((screen.getByLabelText('Search beats') as HTMLInputElement).value).toBe('c');
  });

  it('names a linked beat that no longer exists', () => {
    render(<BeatPicker value="gone" onChange={() => {}} beats={beats} emptyLabel="None" />);
    expect(screen.getByRole('combobox').textContent).toBe('gone (missing beat)');
  });

  it('Escape closes without changing anything', () => {
    const onChange = vi.fn();
    render(<BeatPicker value="b1" onChange={onChange} beats={beats} />);
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.keyDown(screen.getByLabelText('Search beats'), { key: 'Escape' });
    expect(screen.queryByLabelText('Search beats')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});
