/**
 * Tests for IndoorMapBeat — the beacon-proximity location renderer. lucide-react
 * is mocked (renderer has no barrel-direct-import plugin → would be slow/hang),
 * and sensorService is injected as a fake whose scanBeacons callback we drive.
 * Covers the empty-locations notice, the Continue/Skip exit paths (exit-once),
 * timeout resolution, the rssi→distance conversion, and the arrival/departure/
 * display trigger modes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';

vi.mock('lucide-react', () => ({ Wifi: () => null, ChevronRight: () => null, X: () => null }));

import { IndoorMapBeat } from '../../src/components/IndoorMapBeat';

let pushReadings: ((r: Array<{ uuid: string; distance?: number; rssi?: number }>) => void) | null = null;
const sensor = () => ({
  scanBeacons: vi.fn((cb: any) => {
    pushReadings = cb;
    return () => {};
  }),
});

const loc = (over: any = {}) => ({ id: 'L1', name: 'Desk', beaconUuid: 'uuid-1', x: 5, y: 5, radiusMeters: 2, ...over });

beforeEach(() => {
  vi.useFakeTimers();
  pushReadings = null;
});
afterEach(() => {
  vi.useRealTimers();
});

const base = (over: any = {}) => ({
  mode: 'display' as const,
  locations: [loc()],
  buttonText: 'Continue',
  cancelButtonText: 'Skip',
  sensorService: sensor(),
  onResolve: vi.fn(),
  ...over,
});

describe('IndoorMapBeat', () => {
  it('shows a notice when no locations are configured', () => {
    const { getByText } = render(<IndoorMapBeat {...base({ locations: [] })} />);
    expect(getByText(/No locations configured/i)).toBeTruthy();
  });

  it('Continue resolves with path "continue" (and only once)', () => {
    const onResolve = vi.fn();
    const { getByText } = render(<IndoorMapBeat {...base({ onResolve })} />);
    const btn = getByText('Continue');
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onResolve).toHaveBeenCalledWith({ path: 'continue' });
  });

  it('Skip resolves with path "skipped"', () => {
    const onResolve = vi.fn();
    const { getByText } = render(<IndoorMapBeat {...base({ onResolve })} />);
    fireEvent.click(getByText('Skip'));
    expect(onResolve).toHaveBeenCalledWith({ path: 'skipped' });
  });

  it('resolves "timeout" after timeoutMs', () => {
    const onResolve = vi.fn();
    render(<IndoorMapBeat {...base({ timeoutMs: 5000, onResolve })} />);
    act(() => vi.advanceTimersByTime(5000));
    expect(onResolve).toHaveBeenCalledWith({ path: 'timeout' });
  });

  it('trigger-on-arrival fires when a beacon comes within radius', () => {
    const onResolve = vi.fn();
    render(<IndoorMapBeat {...base({ mode: 'trigger-on-arrival', onResolve })} />);
    act(() => pushReadings!([{ uuid: 'uuid-1', distance: 1.5 }])); // < radius 2
    expect(onResolve).toHaveBeenCalledWith({ path: 'arrived', locationId: 'L1' });
  });

  it('does not fire arrival while still outside radius', () => {
    const onResolve = vi.fn();
    render(<IndoorMapBeat {...base({ mode: 'trigger-on-arrival', onResolve })} />);
    act(() => pushReadings!([{ uuid: 'uuid-1', distance: 5 }])); // > radius
    expect(onResolve).not.toHaveBeenCalled();
  });

  it('trigger-on-departure fires when a known beacon goes beyond radius', () => {
    const onResolve = vi.fn();
    render(<IndoorMapBeat {...base({ mode: 'trigger-on-departure', onResolve })} />);
    act(() => pushReadings!([{ uuid: 'uuid-1', distance: 9 }])); // outside → departed
    expect(onResolve).toHaveBeenCalledWith({ path: 'departed', locationId: 'L1' });
  });

  it('converts rssi to distance via log-distance path loss (-59dBm ≈ 1m)', () => {
    const onResolve = vi.fn();
    render(<IndoorMapBeat {...base({ mode: 'trigger-on-arrival', onResolve })} />);
    act(() => pushReadings!([{ uuid: 'uuid-1', rssi: -59 }])); // ≈ 1m < radius 2 → arrival
    expect(onResolve).toHaveBeenCalledWith({ path: 'arrived', locationId: 'L1' });
  });

  it('display mode never auto-resolves on readings', () => {
    const onResolve = vi.fn();
    render(<IndoorMapBeat {...base({ mode: 'display', onResolve })} />);
    act(() => pushReadings!([{ uuid: 'uuid-1', distance: 0.1 }]));
    expect(onResolve).not.toHaveBeenCalled();
  });

  it('unmounts (renders null) after resolving', () => {
    const { getByText, queryByText } = render(<IndoorMapBeat {...base()} />);
    fireEvent.click(getByText('Continue'));
    expect(queryByText('Continue')).toBeNull();
  });
});
