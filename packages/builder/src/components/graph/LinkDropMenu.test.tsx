import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LinkDropMenu } from './LinkDropMenu';
import { beatTypeChoices } from './BeatPalette';

const beats = [
  { id: 'b1', name: 'The harbour', type: 'infoText' },
  { id: 'b2', name: 'On the stairs', type: 'multiChoice' },
  { id: 'b3', name: 'Ending', type: 'endScreen' },
];
const types = {
  common: [{ type: 'infoText', name: 'Info Text', icon: '📝', isAi: false }, { type: 'multiChoice', name: 'Multi Choice', icon: '🔘', isAi: false }],
  others: [{ type: 'panorama', name: '360° Panorama', icon: '🌐', isAi: false }],
};

function open() {
  const onNewBeat = vi.fn(); const onPickBeat = vi.fn(); const onCancel = vi.fn();
  render(<LinkDropMenu x={100} y={100} fromName="Boarding" beats={beats} types={types} onNewBeat={onNewBeat} onPickBeat={onPickBeat} onCancel={onCancel} />);
  return { onNewBeat, onPickBeat, onCancel, search: screen.getByLabelText('Find a beat to link to') as HTMLInputElement };
}

describe('LinkDropMenu (a link let go over empty space)', () => {
  it('offers a new beat, the story\'s beats and Cancel, with the search field ready for typing', () => {
    const { search } = open();
    expect(screen.getByText('New beat')).toBeTruthy();
    expect(screen.getByText('The harbour')).toBeTruthy();
    expect(screen.getByText('Cancel')).toBeTruthy();
    expect(document.activeElement).toBe(search);
    expect(screen.queryByTestId('link-drop-types')).toBeNull();
  });

  it('New beat opens the types; picking one makes that beat', () => {
    const { onNewBeat } = open();
    fireEvent.click(screen.getByText('New beat'));
    expect(screen.getByTestId('link-drop-types')).toBeTruthy();
    fireEvent.click(screen.getByText('360° Panorama'));
    expect(onNewBeat).toHaveBeenCalledWith('panorama');
  });

  it('typing narrows the beats and Enter links to the first one found', () => {
    const { search, onPickBeat } = open();
    fireEvent.change(search, { target: { value: 'stairs' } });
    expect(screen.queryByText('The harbour')).toBeNull();
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(onPickBeat).toHaveBeenCalledWith('b2');
  });

  it('with nothing typed, Enter opens the types and arrows choose among them', () => {
    const { search, onNewBeat, onPickBeat } = open();
    fireEvent.keyDown(search, { key: 'Enter' });
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(onNewBeat).toHaveBeenCalledWith('multiChoice');
    expect(onPickBeat).not.toHaveBeenCalled();
  });

  it('arrow keys reach a beat without typing', () => {
    const { search, onPickBeat } = open();
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(onPickBeat).toHaveBeenCalledWith('b2');
  });

  it('Escape closes the types first, then the menu; Cancel and a click outside close it', () => {
    const { search, onCancel } = open();
    fireEvent.click(screen.getByText('New beat'));
    fireEvent.keyDown(search, { key: 'Escape' });
    expect(screen.queryByTestId('link-drop-types')).toBeNull();
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.keyDown(search, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(2);
    fireEvent.mouseDown(document.body);
    expect(onCancel).toHaveBeenCalledTimes(3);
  });

  it('says so when no beat matches', () => {
    const { search } = open();
    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(screen.getByText('No beat matches.')).toBeTruthy();
  });
});

describe('beatTypeChoices', () => {
  it('lists the common types first and every other type once, without AI beats when AI is off', () => {
    const { common, others } = beatTypeChoices(false);
    expect(common[0].type).toBe('titleScreen');
    const all = [...common, ...others].map((t) => t.type);
    expect(new Set(all).size).toBe(all.length);
    expect(all.some((t) => t.startsWith('ai'))).toBe(false);
    expect(beatTypeChoices(true).others.some((t) => t.isAi)).toBe(true);
  });
});
