/**
 * Tests for ARSceneElement — the AR beat's permission/camera lifecycle wrapper.
 * ARMarkerScene (mind-ar/Three) and webPermissionManager are mocked; the camera
 * APIs are stubbed (jsdom lacks getUserMedia + HTMLMediaElement.play). Covers
 * the marker-tracking delegate branch, the camera permission states
 * (granted→scanning, denied, unavailable), the cancel-button exit values, and
 * the resolve-once guard.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';

vi.mock('../../src/utils/webPermissionManager', () => ({ webPermissionManager: { request: vi.fn() } }));
vi.mock('../../src/components/ARMarkerScene', () => ({
  ARMarkerScene: ({ onAction, onFallback }: any) => (
    <div data-testid="marker-scene">
      <button onClick={() => onAction('marker-done')}>finish-ar</button>
      <button onClick={() => onFallback()}>fallback</button>
    </div>
  ),
}));

import { ARSceneElement } from '../../src/components/ARSceneElement';
import { webPermissionManager } from '../../src/utils/webPermissionManager';

const request = webPermissionManager.request as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  (HTMLMediaElement.prototype as any).play = vi.fn().mockResolvedValue(undefined);
  (navigator as any).mediaDevices = {
    getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }),
  };
});

const props = (over: any = {}) => ({ anchors: [], onAction: vi.fn(), ...over });

describe('ARSceneElement', () => {
  it('delegates to ARMarkerScene when marker tracking is configured (no camera request)', () => {
    const onAction = vi.fn();
    const { getByTestId, getByText } = render(
      <ARSceneElement {...props({ trackingMode: 'marker', markerUrl: 'm.mind', onAction })} />,
    );
    expect(getByTestId('marker-scene')).toBeTruthy();
    expect(request).not.toHaveBeenCalled(); // ARMarkerScene owns the camera
    fireEvent.click(getByText('finish-ar'));
    expect(onAction).toHaveBeenCalledWith('marker-done');
  });

  it('falls back to the screen-space flow when ARMarkerScene requests it', async () => {
    request.mockResolvedValue('granted');
    const { getByText } = render(<ARSceneElement {...props({ trackingMode: 'marker', markerUrl: 'm.mind' })} />);
    await act(async () => {
      fireEvent.click(getByText('fallback'));
    });
    // now in fallback → camera permission flow kicks in
    await waitFor(() => expect(request).toHaveBeenCalledWith('camera'));
  });

  it('requests camera and reaches scanning when permission is granted', async () => {
    request.mockResolvedValue('granted');
    const { container } = render(<ARSceneElement {...props({ trackingMode: 'world' })} />);
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled());
    await waitFor(() => expect(container.querySelector('video')).not.toBeNull());
  });

  it('shows the denied message and exits with permission_denied', async () => {
    request.mockResolvedValue('denied');
    const onAction = vi.fn();
    const { getByText } = render(<ARSceneElement {...props({ trackingMode: 'world', onAction, cancelButtonText: 'Skip' })} />);
    await waitFor(() => expect(getByText(/Camera access was denied/i)).toBeTruthy());
    fireEvent.click(getByText('Skip'));
    expect(onAction).toHaveBeenCalledWith('permission_denied');
  });

  it('shows an unavailable message when the camera is unavailable', async () => {
    request.mockResolvedValue('unavailable');
    const { getByText } = render(<ARSceneElement {...props({ trackingMode: 'world' })} />);
    await waitFor(() => expect(getByText(/not available/i)).toBeTruthy());
  });

  it('cancel during scanning resolves with "cancelled"', async () => {
    request.mockResolvedValue('granted');
    const onAction = vi.fn();
    const { getByText } = render(<ARSceneElement {...props({ trackingMode: 'world', onAction, cancelButtonText: 'Stop' })} />);
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled());
    fireEvent.click(getByText('Stop'));
    expect(onAction).toHaveBeenCalledWith('cancelled');
  });

  it('resolves only once', async () => {
    request.mockResolvedValue('denied');
    const onAction = vi.fn();
    const { getByText } = render(<ARSceneElement {...props({ trackingMode: 'world', onAction, cancelButtonText: 'X' })} />);
    await waitFor(() => expect(getByText('X')).toBeTruthy());
    fireEvent.click(getByText('X'));
    fireEvent.click(getByText('X'));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
