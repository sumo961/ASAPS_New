/**
 * Tests for TimerHudDisplay — the corner HUD that shows either a live
 * countdown or static narrative time text. Pure presentational component;
 * rendered with React Testing Library and asserted via text + inline styles.
 *
 * Covers: the content-priority ladder (timer > displayText > fictionalTime >
 * staticText > inactive placeholder > hidden), time formatting (MM:SS /
 * HH:MM:SS / ceil / clamp), the countdown color shift (normal → yellow →
 * red), visibility gating, the optional label, and hex→rgba background.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TimerHudDisplay, type TimerHudConfig } from '../../src/components/TimerHudDisplay';

const cfg = (over: Partial<TimerHudConfig> = {}): TimerHudConfig => ({
  enabled: true,
  timerName: 'clock',
  staticText: '',
  position: 'top-right',
  style: 'digital',
  fontSize: 24,
  textColor: '#ffffff',
  backgroundColor: '#000000',
  backgroundOpacity: 80,
  borderRadius: 8,
  padding: 8,
  showLabel: false,
  label: '',
  showWhenInactive: false,
  ...over,
});

describe('visibility gating', () => {
  it('renders nothing when not visible', () => {
    const { container } = render(<TimerHudDisplay visible={false} config={cfg()} remainingTime={30} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when config is disabled', () => {
    const { container } = render(
      <TimerHudDisplay visible config={cfg({ enabled: false })} remainingTime={30} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when there is no content to show', () => {
    const { container } = render(<TimerHudDisplay visible config={cfg()} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('time formatting (timer mode)', () => {
  it('formats sub-hour times as MM:SS', () => {
    render(<TimerHudDisplay visible config={cfg()} remainingTime={65} />);
    expect(screen.getByText('01:05')).toBeDefined();
  });

  it('formats >= 1 hour as HH:MM:SS', () => {
    render(<TimerHudDisplay visible config={cfg()} remainingTime={3661} />);
    expect(screen.getByText('01:01:01')).toBeDefined();
  });

  it('ceils fractional seconds and clamps at zero', () => {
    const { rerender } = render(<TimerHudDisplay visible config={cfg()} remainingTime={0.1} />);
    expect(screen.getByText('00:01')).toBeDefined();
    rerender(<TimerHudDisplay visible config={cfg()} remainingTime={0} />);
    expect(screen.getByText('00:00')).toBeDefined();
  });
});

describe('content priority ladder', () => {
  it('an active timer wins over displayText / fictionalTime / staticText', () => {
    render(
      <TimerHudDisplay
        visible
        config={cfg({ staticText: 'STATIC' })}
        remainingTime={5}
        displayText="OVERRIDE"
        fictionalTimeText="9:00 AM"
      />,
    );
    expect(screen.getByText('00:05')).toBeDefined();
    expect(screen.queryByText('OVERRIDE')).toBeNull();
  });

  it('falls back to displayText when no timer', () => {
    render(<TimerHudDisplay visible config={cfg({ staticText: 'STATIC' })} displayText="Day 3" fictionalTimeText="9:00 AM" />);
    expect(screen.getByText('Day 3')).toBeDefined();
  });

  it('falls back to fictionalTimeText when no timer/displayText', () => {
    render(<TimerHudDisplay visible config={cfg({ staticText: 'STATIC' })} fictionalTimeText="9:00 AM" />);
    expect(screen.getByText('9:00 AM')).toBeDefined();
  });

  it('falls back to config.staticText', () => {
    render(<TimerHudDisplay visible config={cfg({ staticText: 'Chapter One' })} />);
    expect(screen.getByText('Chapter One')).toBeDefined();
  });

  it('shows the 00:00 placeholder when showWhenInactive and nothing else', () => {
    render(<TimerHudDisplay visible config={cfg({ showWhenInactive: true })} />);
    expect(screen.getByText('00:00')).toBeDefined();
  });
});

describe('countdown color shift', () => {
  const colorOf = (remainingTime: number) => {
    const { unmount } = render(
      <TimerHudDisplay visible config={cfg({ textColor: '#ffffff' })} remainingTime={remainingTime} totalTime={100} />,
    );
    const text = screen.getByText(/\d\d:\d\d/);
    const color = text.style.color;
    unmount();
    return color;
  };

  it('stays normal above 50% remaining', () => {
    expect(colorOf(80)).toBe('rgb(255, 255, 255)');
  });

  it('turns yellow between 25% and 50%', () => {
    expect(colorOf(40)).toBe('rgb(234, 179, 8)'); // #EAB308
  });

  it('turns red at or below 25%', () => {
    expect(colorOf(10)).toBe('rgb(239, 68, 68)'); // #EF4444
  });

  it('keeps the configured color when totalTime is missing', () => {
    render(<TimerHudDisplay visible config={cfg({ textColor: '#ffffff' })} remainingTime={5} />);
    expect(screen.getByText('00:05').style.color).toBe('rgb(255, 255, 255)');
  });
});

describe('label + background', () => {
  it('renders the label when showLabel and label are set', () => {
    render(<TimerHudDisplay visible config={cfg({ showLabel: true, label: 'Time Left', staticText: 'X' })} />);
    expect(screen.getByText('Time Left')).toBeDefined();
  });

  it('omits the label when showLabel is false', () => {
    render(<TimerHudDisplay visible config={cfg({ showLabel: false, label: 'Time Left', staticText: 'X' })} />);
    expect(screen.queryByText('Time Left')).toBeNull();
  });

  it('converts a hex backgroundColor + opacity into rgba on the container', () => {
    const { container } = render(
      <TimerHudDisplay visible config={cfg({ backgroundColor: '#112233', backgroundOpacity: 50, staticText: 'X' })} />,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.style.backgroundColor).toBe('rgba(17, 34, 51, 0.5)');
  });
});
