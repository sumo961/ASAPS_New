/**
 * Tests for MockSensorPanel — the preview-window panel that pushes synthesized
 * GPS / orientation / beacon readings into an injected mock SensorService.
 * Covers the non-mock-service null guard, the seed-on-mount location push, the
 * walk-nudge + snap-to-origin buttons, the orientation sliders, and the
 * per-beacon distance → setMockBeacons synthesis.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { MockSensorPanel } from '../MockSensorPanel';

const svc = (over: any = {}) => ({
  getCapabilities: () => ({ mock: true, ...over.caps }),
  getLastKnownLocation: () => over.last ?? null,
  watchLocation: vi.fn(() => () => {}),
  setMockLocation: vi.fn(),
  setMockOrientation: vi.fn(),
  setMockBeacons: vi.fn(),
});

describe('MockSensorPanel', () => {
  it('renders nothing for a non-mock sensor service', () => {
    const { container } = render(<MockSensorPanel sensorService={svc({ caps: { mock: false } }) as any} />);
    expect(container.firstChild).toBeNull();
  });

  it('pushes the seeded/origin location to the service on mount', () => {
    const s = svc();
    render(<MockSensorPanel sensorService={s as any} storyOrigin={{ lat: 60.39, lng: 5.32 }} />);
    expect(s.setMockLocation).toHaveBeenCalledWith(expect.objectContaining({ lat: 60.39, lng: 5.32 }));
  });

  it('prefers the service last-known location over storyOrigin', () => {
    const s = svc({ last: { lat: 1.5, lng: 2.5 } });
    render(<MockSensorPanel sensorService={s as any} storyOrigin={{ lat: 60, lng: 5 }} />);
    expect(s.setMockLocation).toHaveBeenCalledWith(expect.objectContaining({ lat: 1.5, lng: 2.5 }));
  });

  it('walk-north nudges latitude north and re-pushes', () => {
    const s = svc();
    const { getByTitle } = render(<MockSensorPanel sensorService={s as any} storyOrigin={{ lat: 10, lng: 10 }} stepMeters={5} />);
    s.setMockLocation.mockClear();
    fireEvent.click(getByTitle('Walk 5m N'));
    const lat = s.setMockLocation.mock.calls.at(-1)![0].lat;
    expect(lat).toBeGreaterThan(10);
  });

  it('snap-to-origin resets to the story origin', () => {
    const s = svc();
    const { getByText, getByTitle } = render(<MockSensorPanel sensorService={s as any} storyOrigin={{ lat: 42, lng: 7 }} />);
    // Move away first — snapping while already at origin wouldn't change state.
    fireEvent.click(getByTitle('Walk 5m N'));
    s.setMockLocation.mockClear();
    fireEvent.click(getByText('Snap to origin'));
    expect(s.setMockLocation).toHaveBeenLastCalledWith(expect.objectContaining({ lat: 42, lng: 7 }));
  });

  it('orientation slider pushes setMockOrientation', () => {
    const s = svc();
    const { getByLabelText } = render(<MockSensorPanel sensorService={s as any} />);
    s.setMockOrientation.mockClear();
    fireEvent.change(getByLabelText(/alpha/i), { target: { value: '180' } });
    expect(s.setMockOrientation).toHaveBeenLastCalledWith(expect.objectContaining({ alpha: 180 }));
  });

  it('beacon distance slider synthesizes a BeaconReading via setMockBeacons', () => {
    const s = svc();
    const { container } = render(
      <MockSensorPanel
        sensorService={s as any}
        venueBeacons={[{ uuid: 'beacon-uuid-1', displayName: 'Lobby', x: 0, y: 0 }]}
      />,
    );
    const slider = container.querySelector('input[min="0.5"]') as HTMLInputElement;
    expect(slider).not.toBeNull();
    s.setMockBeacons.mockClear();
    fireEvent.change(slider, { target: { value: '3' } });
    expect(s.setMockBeacons).toHaveBeenLastCalledWith([
      expect.objectContaining({ uuid: 'beacon-uuid-1', distance: 3 }),
    ]);
  });
});
