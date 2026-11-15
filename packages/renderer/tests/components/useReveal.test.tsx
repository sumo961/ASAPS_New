/**
 * A bubble that stays up for the next line types that line from its first
 * frame: it showed the new line whole for a frame, then typed it again
 * (user report, 2026-11-16: "a bubble flickers, replaced by another with the
 * same content").
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, act } from '@testing-library/react';
import { useReveal } from '../../src/components/SpeechBubbleLayer';

afterEach(() => vi.useRealTimers());

const theme = { textEffects: { animation: 'typewriter', typewriterSpeed: 100 } } as any;

function Probe({ text, skip = false, seen }: { text: string; skip?: boolean; seen: Array<[string, number]> }) {
  const n = useReveal(text, theme, skip);
  seen.push([text, n]);
  return <span>{text.slice(0, n)}</span>;
}

describe('useReveal', () => {
  it('starts the next line at 0 in its first render, then types it', () => {
    vi.useFakeTimers();
    const seen: Array<[string, number]> = [];
    const { rerender, container } = render(<Probe text="Hello there." seen={seen} />);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(container.textContent).toBe('Hello there.');

    seen.length = 0;
    rerender(<Probe text="Seymour. Seymour Whiskers." seen={seen} />);
    expect(seen.filter(([t]) => t === 'Seymour. Seymour Whiskers.').every(([, n]) => n === 0)).toBe(true);
    act(() => { vi.advanceTimersByTime(100); });
    expect(container.textContent).toBe('Seymour. S');
    act(() => { vi.advanceTimersByTime(2000); });
    expect(container.textContent).toBe('Seymour. Seymour Whiskers.');
  });

  it('shows the whole line when skipped', () => {
    const seen: Array<[string, number]> = [];
    const { container } = render(<Probe text="Hi." skip seen={seen} />);
    expect(container.textContent).toBe('Hi.');
    expect(seen.every(([, n]) => n === 3)).toBe(true);
  });
});
