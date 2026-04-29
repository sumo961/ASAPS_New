import React, { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { EmotionPaletteEditor } from '../EmotionPaletteEditor';
import type { EmotionDefinition } from '@asaps/core';

const small: EmotionDefinition[] = [
  { name: 'joy', weightToValence: 0.7, weightToArousal: 0.4, decayRate: 0.2 },
  { name: 'fear', weightToValence: -0.6, weightToArousal: 0.6, decayRate: 0.2 },
];

// A tiny stateful wrapper so tests can drive onChange and observe re-renders.
const Harness: React.FC<{ initial: EmotionDefinition[] }> = ({ initial }) => {
  const [palette, setPalette] = useState(initial);
  return <EmotionPaletteEditor palette={palette} onChange={setPalette} />;
};

describe('EmotionPaletteEditor', () => {
  afterEach(() => cleanup());

  it('renders one row per emotion', () => {
    render(<Harness initial={small} />);
    expect(screen.getByDisplayValue('joy')).toBeTruthy();
    expect(screen.getByDisplayValue('fear')).toBeTruthy();
  });

  it('renders an empty-state hint when the palette is empty', () => {
    render(<Harness initial={[]} />);
    expect(screen.getByText(/No emotions defined/i)).toBeTruthy();
  });

  it('renames an emotion via the name input', () => {
    const onChange = vi.fn();
    render(<EmotionPaletteEditor palette={small} onChange={onChange} />);
    fireEvent.change(screen.getByDisplayValue('joy'), { target: { value: 'elation' } });
    expect(onChange).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ name: 'elation' }),
    ]));
  });

  it('updates description independently of name', () => {
    const onChange = vi.fn();
    render(<EmotionPaletteEditor palette={small} onChange={onChange} />);
    const descInputs = screen.getAllByPlaceholderText(/description/i);
    fireEvent.change(descInputs[0], { target: { value: 'pure delight' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.arrayContaining([
      expect.objectContaining({ name: 'joy', description: 'pure delight' }),
    ]));
  });

  it('clears description back to undefined when emptied', () => {
    const onChange = vi.fn();
    render(<EmotionPaletteEditor palette={[{ ...small[0], description: 'pure delight' }]} onChange={onChange} />);
    fireEvent.change(screen.getByDisplayValue('pure delight'), { target: { value: '' } });
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(last[0].description).toBeUndefined();
  });

  it('add emotion appends a new entry with sensible defaults', () => {
    const onChange = vi.fn();
    render(<EmotionPaletteEditor palette={small} onChange={onChange} />);
    fireEvent.click(screen.getByText('Add emotion'));
    const next = onChange.mock.calls[0][0];
    expect(next).toHaveLength(small.length + 1);
    expect(next[next.length - 1]).toMatchObject({
      name: 'newEmotion', weightToValence: 0, weightToArousal: 0, decayRate: 0.2,
    });
  });

  it('remove deletes the row at the right index', () => {
    const onChange = vi.fn();
    render(<EmotionPaletteEditor palette={small} onChange={onChange} />);
    const removeButtons = screen.getAllByTitle(/Remove this emotion/i);
    fireEvent.click(removeButtons[0]);
    expect(onChange).toHaveBeenCalledWith([small[1]]);
  });

  it('reset to default replaces the palette after explicit confirmation', () => {
    const onChange = vi.fn();
    render(<EmotionPaletteEditor palette={small} onChange={onChange} />);
    fireEvent.click(screen.getByText(/Reset to default/i));
    // No change yet — confirmation must be clicked
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText(/Yes, reset/i));
    const next = onChange.mock.calls[0][0];
    expect(next.map((e: any) => e.name)).toEqual([
      'joy', 'anger', 'fear', 'sadness', 'surprise', 'disgust',
      'pride', 'shame', 'interest',
    ]);
  });

  it('cancel reset closes the confirmation without changes', () => {
    const onChange = vi.fn();
    render(<EmotionPaletteEditor palette={small} onChange={onChange} />);
    fireEvent.click(screen.getByText(/Reset to default/i));
    fireEvent.click(screen.getByText(/^Cancel$/i));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByText(/Yes, reset/i)).toBeNull();
  });

  it('shows close button only when onClose prop is provided', () => {
    const { rerender } = render(<EmotionPaletteEditor palette={small} onChange={() => {}} />);
    expect(screen.queryByLabelText(/close/i)).toBeNull();
    rerender(<EmotionPaletteEditor palette={small} onChange={() => {}} onClose={() => {}} />);
    expect(screen.getByLabelText(/close/i)).toBeTruthy();
  });
});
