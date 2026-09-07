import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ScreenHudLayer, buildScreenHudLayout, type ScreenHudCharacter } from '../../src/components/ScreenHudLayer';

const chars = (value: number): ScreenHudCharacter[] => [{
  id: 'brandt', name: 'Tomas Brandt', color: '#93c5fd',
  meterFrame: { dockMode: 'screen', screenPosition: 'screen-top-left', style: { padding: 8 }, meterHeight: 12, meterSpacing: 6, showLabels: true } as any,
  counters: [{ name: 'suspBrandt', displayName: 'Suspicion: Brandt', value, min: 0, max: 5, color: '#3b82f6', showNumericValue: false, numericFormat: 'value', orientation: 'horizontal' }] as any,
}];
const stage = { width: 390, height: 740 };

describe('ScreenHudLayer — compact interaction', () => {
  it('renders a strip instead of the card, expands on tap, folds on scrim tap', () => {
    const layout = buildScreenHudLayout({ characters: chars(1), stage });
    render(<ScreenHudLayer layout={layout} stage={stage} collapseKey="beat_1" />);
    const strip = screen.getByTestId('compact-hud-strip');
    expect(strip.textContent).toContain('TB');
    expect(screen.queryByText('Suspicion: Brandt')).toBeNull(); // full card hidden
    fireEvent.click(strip);
    expect(screen.getByText('Suspicion: Brandt')).toBeTruthy();   // full card overlaid
    fireEvent.click(screen.getByTestId('compact-hud-scrim'));
    expect(screen.queryByText('Suspicion: Brandt')).toBeNull();
  });

  it('folds an open panel when the beat changes', () => {
    const layout = buildScreenHudLayout({ characters: chars(1), stage });
    const { rerender } = render(<ScreenHudLayer layout={layout} stage={stage} collapseKey="beat_1" />);
    fireEvent.click(screen.getByTestId('compact-hud-strip'));
    expect(screen.getByText('Suspicion: Brandt')).toBeTruthy();
    rerender(<ScreenHudLayer layout={layout} stage={stage} collapseKey="beat_2" />);
    expect(screen.queryByText('Suspicion: Brandt')).toBeNull();
  });

  it('pulses the delta when a value changes while collapsed', () => {
    vi.useFakeTimers();
    try {
      const { rerender } = render(<ScreenHudLayer layout={buildScreenHudLayout({ characters: chars(1), stage })} stage={stage} collapseKey="b" />);
      expect(screen.queryByTestId('compact-hud-pulse')).toBeNull();
      rerender(<ScreenHudLayer layout={buildScreenHudLayout({ characters: chars(2), stage })} stage={stage} collapseKey="b" />);
      expect(screen.getByTestId('compact-hud-pulse').textContent).toBe('Suspicion: Brandt +1');
      act(() => { vi.advanceTimersByTime(2500); });
      expect(screen.queryByTestId('compact-hud-pulse')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('draws the full card on desktop stages with no strip', () => {
    const desk = { width: 1024, height: 768 };
    render(<ScreenHudLayer layout={buildScreenHudLayout({ characters: chars(1), stage: desk })} stage={desk} />);
    expect(screen.queryByTestId('compact-hud-strip')).toBeNull();
    expect(screen.getByText('Suspicion: Brandt')).toBeTruthy();
  });
});
