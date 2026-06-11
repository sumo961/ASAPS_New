/**
 * Tests for WebPermissionManager — browser/Electron-renderer
 * IPermissionManager implementation that all camera/AR/GPS beats
 * route through.
 *
 * Browser API quirks the implementation handles:
 *   - navigator.permissions.query is partially supported (no Safari
 *     for some types) — falls back to 'prompt' on absence
 *   - getUserMedia IS the request — request() calls it and stops
 *     the resulting tracks
 *   - HTTPS / localhost requirement leaks as NotAllowedError on
 *     plain http — we surface that as 'unavailable'
 *
 * Tests use vi.stubGlobal to swap `navigator` for each scenario so
 * each path can be exercised without a real browser.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebPermissionManager } from '../src/utils/webPermissionManager';

describe('WebPermissionManager', () => {
  let manager: WebPermissionManager;

  beforeEach(() => {
    manager = new WebPermissionManager();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('network permission', () => {
    it('query returns granted (no real permission gate)', async () => {
      expect(await manager.query('network' as any)).toBe('granted');
    });

    it('request returns granted', async () => {
      expect(await manager.request('network' as any)).toBe('granted');
    });
  });

  describe('query() with navigator.permissions API', () => {
    it('returns granted for state "granted"', async () => {
      vi.stubGlobal('navigator', {
        permissions: { query: vi.fn().mockResolvedValue({ state: 'granted' }) },
      });
      expect(await manager.query('camera' as any)).toBe('granted');
    });

    it('returns denied for state "denied"', async () => {
      vi.stubGlobal('navigator', {
        permissions: { query: vi.fn().mockResolvedValue({ state: 'denied' }) },
      });
      expect(await manager.query('camera' as any)).toBe('denied');
    });

    it('returns prompt for state "prompt"', async () => {
      vi.stubGlobal('navigator', {
        permissions: { query: vi.fn().mockResolvedValue({ state: 'prompt' }) },
      });
      expect(await manager.query('camera' as any)).toBe('prompt');
    });

    it('returns prompt for unknown state values (forward-compat)', async () => {
      // A future browser state we don't yet recognize — fall back
      // to prompt and let the actual request decide. Better than
      // 'denied' (would silently turn off the beat) or throwing.
      vi.stubGlobal('navigator', {
        permissions: { query: vi.fn().mockResolvedValue({ state: 'limited' as any }) },
      });
      expect(await manager.query('camera' as any)).toBe('prompt');
    });

    it('falls back to prompt when permissions.query throws (unknown name)', async () => {
      // Safari throws on camera/microphone names — should fall
      // through to the request() flow lazily, not stick the beat
      // in a denied state.
      vi.stubGlobal('navigator', {
        permissions: { query: vi.fn().mockRejectedValue(new Error('not supported')) },
      });
      expect(await manager.query('camera' as any)).toBe('prompt');
    });
  });

  describe('query() without navigator.permissions API', () => {
    it('returns prompt (Safari/older browsers)', async () => {
      // No permissions API at all — Safari historically lacked one.
      // We fall through to prompt so the actual request flow still
      // runs lazily.
      vi.stubGlobal('navigator', {});
      expect(await manager.query('camera' as any)).toBe('prompt');
    });

    it('returns prompt when permissions.query is not a function', async () => {
      // Defensive: navigator.permissions exists but query is missing.
      vi.stubGlobal('navigator', { permissions: {} });
      expect(await manager.query('camera' as any)).toBe('prompt');
    });
  });

  describe('request() — camera', () => {
    it('returns granted after getUserMedia resolves (and stops the stream)', async () => {
      const stopMock = vi.fn();
      const getUserMedia = vi.fn().mockResolvedValue({
        getTracks: () => [{ stop: stopMock }],
      });
      vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });

      expect(await manager.request('camera' as any)).toBe('granted');
      // Release-after-grant contract: request promises consent,
      // not a hot stream. Leaving the track running would hold
      // the camera open until GC.
      expect(stopMock).toHaveBeenCalledOnce();
    });

    it('returns denied for NotAllowedError', async () => {
      const getUserMedia = vi.fn().mockRejectedValue(
        Object.assign(new Error('user denied'), { name: 'NotAllowedError' })
      );
      vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
      expect(await manager.request('camera' as any)).toBe('denied');
    });

    it('returns denied for SecurityError (e.g. http:// page)', async () => {
      // The docstring calls out SecurityError as the "non-secure
      // context" path — same user-facing meaning as denied.
      const getUserMedia = vi.fn().mockRejectedValue(
        Object.assign(new Error('insecure'), { name: 'SecurityError' })
      );
      vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
      expect(await manager.request('camera' as any)).toBe('denied');
    });

    it('returns unavailable for NotFoundError (no camera hardware)', async () => {
      // Distinguishing "user said no" from "there's no camera at
      // all" matters — the beat may want to skip with a different
      // message in each case.
      const getUserMedia = vi.fn().mockRejectedValue(
        Object.assign(new Error('no camera'), { name: 'NotFoundError' })
      );
      vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
      expect(await manager.request('camera' as any)).toBe('unavailable');
    });

    it('returns unavailable when mediaDevices is missing', async () => {
      // Older browsers / iframes without secure context don't
      // expose mediaDevices at all.
      vi.stubGlobal('navigator', {});
      expect(await manager.request('camera' as any)).toBe('unavailable');
    });

    it('uses { video: true } constraints for camera', async () => {
      const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [] });
      vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
      await manager.request('camera' as any);
      expect(getUserMedia).toHaveBeenCalledWith({ video: true });
    });

    it('uses { audio: true } constraints for microphone', async () => {
      const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [] });
      vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
      await manager.request('microphone' as any);
      expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    });
  });

  describe('request() — geolocation', () => {
    it('returns granted on successful position fix', async () => {
      const getCurrentPosition = vi.fn((success: any) => {
        success({ coords: { latitude: 0, longitude: 0 } });
      });
      vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
      expect(await manager.request('geolocation' as any)).toBe('granted');
    });

    it('returns denied when error.code === PERMISSION_DENIED', async () => {
      const getCurrentPosition = vi.fn((_success: any, error: any) => {
        error({ code: 1, PERMISSION_DENIED: 1 });
      });
      vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
      expect(await manager.request('geolocation' as any)).toBe('denied');
    });

    it('returns unavailable for other geolocation errors (timeout, etc.)', async () => {
      // Source-comment distinction: code !== PERMISSION_DENIED is
      // 'unavailable', not 'denied'. A timeout shouldn't trick the
      // beat into thinking the user said no.
      const getCurrentPosition = vi.fn((_success: any, error: any) => {
        error({ code: 3, PERMISSION_DENIED: 1, TIMEOUT: 3 });
      });
      vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
      expect(await manager.request('geolocation' as any)).toBe('unavailable');
    });

    it('returns unavailable when navigator.geolocation is missing', async () => {
      vi.stubGlobal('navigator', {});
      expect(await manager.request('geolocation' as any)).toBe('unavailable');
    });
  });

  describe('request() — unknown permission', () => {
    it('returns unavailable for unrecognized permission types', async () => {
      // Future expansion — a permission name this version doesn't
      // know about (e.g. 'bluetooth-le') gracefully returns
      // unavailable rather than throwing.
      vi.stubGlobal('navigator', {});
      expect(await manager.request('bluetooth' as any)).toBe('unavailable');
    });
  });

  describe('declare()', () => {
    it('is a no-op on web (no batched prompt API)', () => {
      // Per the source comment — native runtimes use this hook to
      // pre-warm Info.plist / manifest permission flows. On web,
      // it shouldn't throw or do anything observable.
      expect(() => manager.declare(['camera', 'geolocation'] as any)).not.toThrow();
    });
  });
});
