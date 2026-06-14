/**
 * Tests for MapBeatPlaceholder — the GPS-location beat UI. It tracks the
 * player's position via a sensorService, computes haversine distance to a
 * target, and resolves the beat on arrival/departure threshold crossing, a
 * timeout, or a button press.
 *
 * sensorService is mocked to feed a single location reading synchronously on
 * subscribe. Fake timers cover the optional timeout path.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MapBeatPlaceholder } from '../../src/components/MapBeatPlaceholder';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** A sensor that pushes one reading to its subscriber immediately. */
const sensorAt = (lat: number, lng: number) => ({
  watchLocation: vi.fn((cb: (r: { lat: number; lng: number }) => void) => {
    cb({ lat, lng });
    return vi.fn(); // unsubscribe
  }),
});

const props = (over: any = {}) => ({
  mode: 'display' as const,
  targetLat: 1.5,
  targetLng: 2.5,
  radiusMeters: 50,
  onResolve: vi.fn(),
  ...over,
});

describe('display mode', () => {
  it('shows the map-view status and resolves "continue" on the button', () => {
    const onResolve = vi.fn();
    render(<MapBeatPlaceholder {...props({ onResolve, buttonText: 'Go on' })} />);
    expect(screen.getByText('Map view')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Go on' }));
    expect(onResolve).toHaveBeenCalledWith('continue');
  });

  it('resolves only once even if the button is clicked twice', () => {
    const onResolve = vi.fn();
    render(<MapBeatPlaceholder {...props({ onResolve, buttonText: 'Go' })} />);
    const btn = screen.getByRole('button', { name: 'Go' });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(onResolve).toHaveBeenCalledTimes(1);
  });

  it('renders the target coordinates and radius', () => {
    render(<MapBeatPlaceholder {...props({ targetLat: 1.5, targetLng: 2.5, radiusMeters: 75 })} />);
    expect(screen.getByText(/1\.500000, 2\.500000/)).toBeDefined();
    expect(screen.getByText(/75 m/)).toBeDefined();
  });

  it('shows "(no reading yet)" until a location arrives', () => {
    render(<MapBeatPlaceholder {...props()} />);
    expect(screen.getByText(/\(no reading yet\)/)).toBeDefined();
  });
});

describe('trigger-on-arrival', () => {
  it('waits for location when no sensor is attached', () => {
    render(<MapBeatPlaceholder {...props({ mode: 'trigger-on-arrival', sensorService: undefined })} />);
    expect(screen.getByText('Waiting for location…')).toBeDefined();
  });

  it('resolves "arrived" once the player is inside the radius', () => {
    const onResolve = vi.fn();
    render(
      <MapBeatPlaceholder
        {...props({ mode: 'trigger-on-arrival', targetLat: 0, targetLng: 0, radiusMeters: 100000, onResolve, sensorService: sensorAt(0, 0) })}
      />,
    );
    expect(onResolve).toHaveBeenCalledWith('arrived');
  });
});

describe('trigger-on-departure', () => {
  it('resolves "departed" when the player is outside the radius', () => {
    const onResolve = vi.fn();
    render(
      <MapBeatPlaceholder
        {...props({ mode: 'trigger-on-departure', targetLat: 0, targetLng: 0, radiusMeters: 1, onResolve, sensorService: sensorAt(10, 10) })}
      />,
    );
    expect(onResolve).toHaveBeenCalledWith('departed');
  });

  it('keeps waiting (no resolve) while still inside the radius', () => {
    const onResolve = vi.fn();
    render(
      <MapBeatPlaceholder
        {...props({ mode: 'trigger-on-departure', targetLat: 0, targetLng: 0, radiusMeters: 100000, onResolve, sensorService: sensorAt(0, 0) })}
      />,
    );
    expect(onResolve).not.toHaveBeenCalled();
    expect(screen.getByText(/inside \(waiting to depart\)/)).toBeDefined();
  });
});

describe('timeout + skip', () => {
  it('resolves "timeout" after timeoutMs elapses', () => {
    const onResolve = vi.fn();
    render(<MapBeatPlaceholder {...props({ onResolve, timeoutMs: 1000 })} />);
    expect(onResolve).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(onResolve).toHaveBeenCalledWith('timeout');
  });

  it('resolves "skipped" via the cancel button', () => {
    const onResolve = vi.fn();
    render(<MapBeatPlaceholder {...props({ onResolve, cancelButtonText: 'Skip' })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(onResolve).toHaveBeenCalledWith('skipped');
  });
});
