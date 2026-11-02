import React, { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SmartNameDropdown } from '../SmartNameDropdown';

const options = [
  { name: 'savedScreenshot', displayName: 'savedScreenshot' },
  { name: 'score1', displayName: 'score1' },
];

function Host({ start, spy }: { start: string; spy?: (v: string | undefined) => void }) {
  const [value, setValue] = useState(start);
  return <SmartNameDropdown value={value} options={options} onChange={(v) => { setValue(v ?? ''); spy?.(v); }} />;
}

describe('SmartNameDropdown', () => {
  it('asks about a new name close to an existing one, and uses it on a click', () => {
    const spy = vi.fn();
    render(<Host start="savedscreenshot" spy={spy} />);
    fireEvent.click(screen.getByText('Did you mean "savedScreenshot"?'));
    expect(spy).toHaveBeenCalledWith('savedScreenshot');
    expect(screen.queryByText(/Did you mean/)).toBeNull();
  });

  it('keeps out of the way of a name that is really new', () => {
    render(<Host start="trustInBirka" />);
    expect(screen.queryByText(/Did you mean/)).toBeNull();
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('trustInBirka');
  });

  it('does not stop the author keeping the new name', () => {
    const spy = vi.fn();
    render(<Host start="savedscreenshot" spy={spy} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'savedscreenshot2' } });
    expect(spy).toHaveBeenCalledWith('savedscreenshot2');
  });

  it('does not suggest across numbered names', () => {
    render(<Host start="score2" />);
    expect(screen.queryByText(/Did you mean/)).toBeNull();
  });
});
