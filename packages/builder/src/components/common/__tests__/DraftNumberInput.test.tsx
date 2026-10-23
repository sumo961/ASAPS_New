import { describe, it, expect, vi } from 'vitest';
import React, { useState } from 'react';
import { render, fireEvent } from '@testing-library/react';
import { DraftNumberInput } from '../DraftNumberInput';

function Harness({ onCommit, ...props }: { onCommit: (v: number) => void; min?: number; max?: number; step?: number }) {
  const [value, setValue] = useState(10);
  return <DraftNumberInput value={value} onCommit={(v) => { setValue(v); onCommit(v); }} {...props} />;
}

describe('DraftNumberInput', () => {
  it('lets a negative number be typed one key at a time', () => {
    const onCommit = vi.fn();
    const { getByRole } = render(<Harness onCommit={onCommit} />);
    const input = getByRole('textbox') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '-' } });
    expect(input.value).toBe('-');
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '-2' } });
    fireEvent.change(input, { target: { value: '-20' } });
    expect(input.value).toBe('-20');
    expect(onCommit).toHaveBeenLastCalledWith(-20);
    fireEvent.blur(input);
    expect(input.value).toBe('-20');
  });

  it('clamps to min and max, and steps with the arrow keys', () => {
    const onCommit = vi.fn();
    const { getByRole } = render(<Harness onCommit={onCommit} min={-5} max={50} step={0.5} />);
    const input = getByRole('textbox') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '-80' } });
    expect(onCommit).toHaveBeenLastCalledWith(-5);
    fireEvent.blur(input);
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(onCommit).toHaveBeenLastCalledWith(-4.5);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(onCommit).toHaveBeenLastCalledWith(-5);
  });

  it('reads a decimal comma', () => {
    const onCommit = vi.fn();
    const { getByRole } = render(<Harness onCommit={onCommit} />);
    const input = getByRole('textbox') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '-2,5' } });
    expect(onCommit).toHaveBeenLastCalledWith(-2.5);
  });
});
