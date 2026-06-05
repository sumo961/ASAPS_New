/**
 * Web (browser / Electron renderer) implementation of IPermissionManager.
 *
 * Browser permission API quirks worth knowing:
 *  - `navigator.permissions.query({ name: 'camera' })` is partially
 *    supported (Chrome / Edge yes; Safari/Firefox have gaps). When
 *    unavailable we fall back to 'prompt' so the actual request flow
 *    still kicks in lazily.
 *  - `getUserMedia()` IS the request — there's no separate "ask now"
 *    API. So request() calls getUserMedia and immediately stops the
 *    returned track. This is the canonical pattern.
 *  - HTTPS or localhost is required. On http:// (other hosts) the
 *    API throws NotAllowedError; we surface 'unavailable'.
 *
 * Electron renderer follows the same browser API surface; the main
 * process arbitrates via session.setPermissionRequestHandler — that
 * machinery is invisible to this code.
 */
import type { IPermissionManager, Permission, PermissionStatus } from '@asaps/core';

export class WebPermissionManager implements IPermissionManager {
  async query(p: Permission): Promise<PermissionStatus> {
    if (p === 'network') {
      // Network has no permission gate in browsers; always granted.
      return 'granted';
    }
    if (!navigator.permissions || typeof navigator.permissions.query !== 'function') {
      return 'prompt';
    }
    try {
      const name = this.permissionToName(p);
      if (!name) return 'unavailable';
      // The PermissionName union doesn't include every browser-supported
      // value (e.g. 'camera' is missing in some TS lib versions). Cast
      // through `any` rather than fork the union per browser.
      const result = await navigator.permissions.query({ name } as any);
      switch (result.state) {
        case 'granted': return 'granted';
        case 'denied':  return 'denied';
        case 'prompt':  return 'prompt';
        default:        return 'prompt';
      }
    } catch {
      // Unknown name → not supported on this platform / browser.
      return 'prompt';
    }
  }

  async request(p: Permission): Promise<PermissionStatus> {
    if (p === 'network') return 'granted';
    if (p === 'camera' || p === 'microphone') {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return 'unavailable';
      }
      try {
        const constraints: MediaStreamConstraints = p === 'camera'
          ? { video: true }
          : { audio: true };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        // Immediately release — request() promises consent, not a stream.
        stream.getTracks().forEach(t => t.stop());
        return 'granted';
      } catch (err: any) {
        // NotAllowedError / SecurityError → user said no. Anything else
        // (e.g. NotFoundError when there's no camera at all) → unavailable.
        const name = String(err?.name || '');
        if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
        return 'unavailable';
      }
    }
    if (p === 'geolocation') {
      if (!navigator.geolocation) return 'unavailable';
      return new Promise<PermissionStatus>(resolve => {
        navigator.geolocation.getCurrentPosition(
          () => resolve('granted'),
          err => {
            if (err.code === err.PERMISSION_DENIED) resolve('denied');
            else resolve('unavailable');
          },
          { maximumAge: Infinity, timeout: 8000 }
        );
      });
    }
    return 'unavailable';
  }

  declare(_perms: Permission[]): void {
    // Web has no batched-prompt API. No-op; native runtimes can use
    // this hook to pre-warm Info.plist / runtime permission flows.
  }

  private permissionToName(p: Permission): string | null {
    switch (p) {
      case 'camera':      return 'camera';
      case 'microphone':  return 'microphone';
      case 'geolocation': return 'geolocation';
      default:            return null;
    }
  }
}

/** Singleton; the renderer mounts one. */
export const webPermissionManager = new WebPermissionManager();
