/**
 * Tests for QRScanElement — live camera QR scanner. Covers the permission
 * lifecycle and resolution sentinels without a real camera: the
 * WebPermissionManager, navigator.mediaDevices.getUserMedia, and jsQR are
 * all mocked.
 *
 * Out of scope (would need a real video frame + canvas pixels): the per-frame
 * jsQR decode + matchPatterns matching. We verify the granted path reaches
 * the scanning UI and acquires a stream; the decode loop itself is a no-op in
 * jsdom (video.readyState stays 0).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('jsqr', () => ({ default: vi.fn(() => null) }));
vi.mock('../../src/utils/webPermissionManager', () => ({
  webPermissionManager: { request: vi.fn() },
}));

import { QRScanElement } from '../../src/components/QRScanElement';
import { webPermissionManager } from '../../src/utils/webPermissionManager';

const requestMock = webPermissionManager.request as ReturnType<typeof vi.fn>;
let getUserMedia: ReturnType<typeof vi.fn>;

beforeEach(() => {
  requestMock.mockReset();
  getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] });
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia },
    configurable: true,
  });
  // jsdom doesn't implement HTMLMediaElement.play() — without this the
  // component's video.play() throws and it falls into the "unavailable"
  // branch instead of reaching "scanning".
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('permission denied', () => {
  it('shows the denied message and resolves "permission_denied" on cancel', async () => {
    requestMock.mockResolvedValue('denied');
    const onDecode = vi.fn();
    render(<QRScanElement onDecode={onDecode} />);

    await screen.findByText(/Camera access was denied/i);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onDecode).toHaveBeenCalledWith('permission_denied');
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('uses a custom cancel button label', async () => {
    requestMock.mockResolvedValue('denied');
    render(<QRScanElement onDecode={vi.fn()} cancelButtonText="Skip scan" />);
    await screen.findByText(/Camera access was denied/i);
    expect(screen.getByRole('button', { name: 'Skip scan' })).toBeDefined();
  });
});

describe('camera unavailable', () => {
  it('shows the unavailable reason and resolves "permission_denied" on cancel', async () => {
    requestMock.mockResolvedValue('unavailable');
    const onDecode = vi.fn();
    render(<QRScanElement onDecode={onDecode} />);

    await screen.findByText(/Camera not available/i);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onDecode).toHaveBeenCalledWith('permission_denied');
  });
});

describe('granted → scanning', () => {
  it('acquires a stream, renders the video, and resolves "cancelled" on cancel', async () => {
    requestMock.mockResolvedValue('granted');
    const onDecode = vi.fn();
    const { container } = render(<QRScanElement onDecode={onDecode} facing="rear" helperText="Aim at the code" />);

    // permission granted → it requests the actual camera stream
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));
    expect(getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({ video: { facingMode: { ideal: 'environment' } }, audio: false }),
    );
    expect(container.querySelector('video')).not.toBeNull();
    expect(screen.getByText('Aim at the code')).toBeDefined();

    // cancel from a non-denied state → 'cancelled' sentinel
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onDecode).toHaveBeenCalledWith('cancelled');
  });

  it("requests the front camera for facing='front'", async () => {
    requestMock.mockResolvedValue('granted');
    render(<QRScanElement onDecode={vi.fn()} facing="front" />);
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    expect(getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({ video: { facingMode: { ideal: 'user' } } }),
    );
  });
});

describe('robustness', () => {
  it('does not crash when matchPatterns contains an invalid regex', async () => {
    requestMock.mockResolvedValue('granted');
    const { container } = render(<QRScanElement onDecode={vi.fn()} matchPatterns={['(unclosed', 'valid.*']} />);
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    expect(container.querySelector('video')).not.toBeNull();
  });

  it('treats a getUserMedia NotAllowedError as denied', async () => {
    requestMock.mockResolvedValue('granted');
    const err = Object.assign(new Error('no'), { name: 'NotAllowedError' });
    getUserMedia.mockRejectedValue(err);
    render(<QRScanElement onDecode={vi.fn()} />);
    await screen.findByText(/Camera access was denied/i);
  });
});
