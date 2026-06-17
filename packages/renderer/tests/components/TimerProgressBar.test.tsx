/**
 * Tests for TimerProgressBar — the top-of-stage countdown bar. Pure
 * presentational: covers the visibility/zero-time null guards, the clamped
 * progress width, the green→yellow→red zone color, the MM:SS vs Ns time
 * formatting (ceil), and the optional label / numeric toggle.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TimerProgressBar } from '../../src/components/TimerProgressBar';

const bar = (c: HTMLElement) => c.querySelector('.h-full') as HTMLElement | null;

describe('TimerProgressBar', () => {
  it('renders nothing when not visible', () => {
    const { container } = render(<TimerProgressBar totalTime={60} remainingTime={30} visible={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when totalTime <= 0', () => {
    const { container } = render(<TimerProgressBar totalTime={0} remainingTime={0} visible={true} />);
    expect(container.firstChild).toBeNull();
  });

  it('sets the bar width to the remaining percentage', () => {
    const { container } = render(<TimerProgressBar totalTime={100} remainingTime={50} visible={true} />);
    expect(bar(container)!.style.width).toBe('50%');
  });

  it('clamps the width to 0..100', () => {
    const over = render(<TimerProgressBar totalTime={100} remainingTime={150} visible={true} />);
    expect(bar(over.container)!.style.width).toBe('100%');
    const under = render(<TimerProgressBar totalTime={100} remainingTime={-10} visible={true} />);
    expect(bar(under.container)!.style.width).toBe('0%');
  });

  it('shifts color green → yellow → red as time runs out', () => {
    const green = render(<TimerProgressBar totalTime={100} remainingTime={80} visible={true} />);
    expect(bar(green.container)!.className).toContain('bg-green-500');
    const yellow = render(<TimerProgressBar totalTime={100} remainingTime={50} visible={true} />);
    expect(bar(yellow.container)!.className).toContain('bg-yellow-500');
    const red = render(<TimerProgressBar totalTime={100} remainingTime={20} visible={true} />);
    expect(bar(red.container)!.className).toContain('bg-red-500');
  });

  it('formats time as MM:SS above a minute and Ns below (ceil)', () => {
    expect(render(<TimerProgressBar totalTime={120} remainingTime={90} visible={true} />).getByText('1:30')).toBeTruthy();
    expect(render(<TimerProgressBar totalTime={120} remainingTime={5} visible={true} />).getByText('5s')).toBeTruthy();
    expect(render(<TimerProgressBar totalTime={120} remainingTime={5.2} visible={true} />).getByText('6s')).toBeTruthy(); // ceil
    expect(render(<TimerProgressBar totalTime={120} remainingTime={65} visible={true} />).getByText('1:05')).toBeTruthy(); // zero-padded
  });

  it('shows the label and can hide the numeric readout', () => {
    // Scope to each render's container — RTL queries default to document.body,
    // which would otherwise see text from the sibling render.
    const withLabel = render(<TimerProgressBar totalTime={60} remainingTime={30} visible={true} label="Bomb" />);
    expect(withLabel.container.textContent).toContain('Bomb');
    expect(withLabel.container.textContent).toContain('30s');

    const noNumeric = render(<TimerProgressBar totalTime={60} remainingTime={30} visible={true} showNumeric={false} />);
    expect(noNumeric.container.textContent).not.toContain('30s');
  });
});
