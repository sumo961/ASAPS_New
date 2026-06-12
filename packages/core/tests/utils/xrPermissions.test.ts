/**
 * Tests for ensureXRPermission — the shared permission probe AR/GPS/
 * indoor beats use to gate their primary UI. Returns a three-state
 * verdict ('granted' | 'fallback' | 'skip') that the beat translates
 * to its own routing.
 *
 * Coverage focus:
 *   - empty permissions list short-circuits to 'granted'
 *   - all-granted path
 *   - one-denied path → policy default 'fallback'
 *   - one-denied path with onDenied:'skip' → 'skip'
 *   - 'prompt' state escalates to requestPermission (the actual
 *     consent flow); resulting state is what we record
 *   - 'prompt' state SKIPS the request when policy.prompt === false
 *     (unit-test / read-only mode)
 *   - records every observed state into the context's permission
 *     cache so the synchronous `permissionGranted` evaluator can
 *     branch later without re-probing
 *   - 'unavailable' is treated the same as 'denied' for verdict
 *     purposes (no camera = same routing as user-said-no)
 */
import { describe, it, expect, vi } from 'vitest';
import { ensureXRPermission } from '../../src/utils/xrPermissions';
import { StoryContext } from '../../src/engine/StoryContext';
import { Story } from '../../src/engine/Story';

/** Make a StoryContext with a sensorService whose get/request returns we control. */
function makeContext(opts: {
  getPermissionState: (name: any) => Promise<any>;
  requestPermission?: (name: any) => Promise<any>;
}): StoryContext {
  const ctx = new StoryContext();
  ctx.setStory(new Story({ title: 'T', author: 'T', firstBeatId: '' }));
  // Replace the sensor service with our test double. The interface
  // is { getPermissionState, requestPermission } — that's the only
  // surface ensureXRPermission touches.
  (ctx as any).sensorService = {
    getPermissionState: vi.fn(opts.getPermissionState),
    requestPermission: vi.fn(opts.requestPermission ?? (() => Promise.resolve('denied'))),
  };
  return ctx;
}

describe('ensureXRPermission', () => {
  describe('empty permissions list', () => {
    it('short-circuits to "granted" when permissions is empty', async () => {
      const ctx = makeContext({ getPermissionState: () => Promise.resolve('denied') });
      const result = await ensureXRPermission(ctx, []);
      expect(result).toBe('granted');
    });

    it('short-circuits when permissions is undefined', async () => {
      const ctx = makeContext({ getPermissionState: () => Promise.resolve('denied') });
      const result = await ensureXRPermission(ctx, undefined as any);
      expect(result).toBe('granted');
    });
  });

  describe('all granted', () => {
    it('returns "granted" when every permission is granted', async () => {
      const ctx = makeContext({
        getPermissionState: () => Promise.resolve('granted'),
      });
      const result = await ensureXRPermission(ctx, ['camera', 'gps']);
      expect(result).toBe('granted');
    });

    it('records each granted state into the permission cache', async () => {
      // Critical side effect — later `permissionGranted` conditions
      // read this cache synchronously instead of re-probing.
      const ctx = makeContext({
        getPermissionState: () => Promise.resolve('granted'),
      });
      const spy = vi.spyOn(ctx, 'recordPermissionState');
      await ensureXRPermission(ctx, ['camera', 'gps']);
      expect(spy).toHaveBeenCalledWith('camera', 'granted');
      expect(spy).toHaveBeenCalledWith('gps', 'granted');
    });
  });

  describe('denied path', () => {
    it('returns "fallback" by default when at least one is denied', async () => {
      const ctx = makeContext({
        getPermissionState: (name) => Promise.resolve(name === 'camera' ? 'granted' : 'denied'),
      });
      const result = await ensureXRPermission(ctx, ['camera', 'gps']);
      expect(result).toBe('fallback');
    });

    it('returns "skip" when policy.onDenied is "skip"', async () => {
      // The project's LocationSettings.onPermissionDenied:'skip'
      // path — silently advance instead of routing to a fallback.
      const ctx = makeContext({
        getPermissionState: () => Promise.resolve('denied'),
      });
      const result = await ensureXRPermission(ctx, ['camera'], { onDenied: 'skip' });
      expect(result).toBe('skip');
    });

    it('returns "fallback" when policy.onDenied is "fallback" (explicit)', async () => {
      const ctx = makeContext({
        getPermissionState: () => Promise.resolve('denied'),
      });
      const result = await ensureXRPermission(ctx, ['camera'], { onDenied: 'fallback' });
      expect(result).toBe('fallback');
    });

    it('treats "unavailable" the same as denied for verdict purposes', async () => {
      // No-camera-on-this-device is reported as 'unavailable', but
      // the routing decision is the same as user-said-no: take the
      // configured fallback or skip path.
      const ctx = makeContext({
        getPermissionState: () => Promise.resolve('unavailable'),
      });
      const result = await ensureXRPermission(ctx, ['camera'], { onDenied: 'skip' });
      expect(result).toBe('skip');
    });
  });

  describe('prompt state escalation', () => {
    it('calls requestPermission when state is "prompt" and prompt is allowed', async () => {
      // Default behavior — the entire point of probing is to give
      // the player a chance to grant permission. Auto-request.
      const requestPermission = vi.fn().mockResolvedValue('granted');
      const ctx = makeContext({
        getPermissionState: () => Promise.resolve('prompt'),
        requestPermission,
      });
      const result = await ensureXRPermission(ctx, ['camera']);
      expect(requestPermission).toHaveBeenCalledWith('camera');
      expect(result).toBe('granted');
    });

    it('records the POST-PROMPT state, not the initial "prompt"', async () => {
      // Caching 'prompt' would defeat the cache — the next
      // `permissionGranted` check would think the user hasn't
      // chosen yet, when in fact they just denied.
      const ctx = makeContext({
        getPermissionState: () => Promise.resolve('prompt'),
        requestPermission: () => Promise.resolve('denied'),
      });
      const spy = vi.spyOn(ctx, 'recordPermissionState');
      await ensureXRPermission(ctx, ['camera']);
      expect(spy).toHaveBeenCalledWith('camera', 'denied');
    });

    it('does NOT call requestPermission when policy.prompt is false', async () => {
      // Read-only mode for unit tests or contexts that only want
      // to inspect existing state. The verdict is what the
      // current state implies — here, 'fallback'.
      const requestPermission = vi.fn();
      const ctx = makeContext({
        getPermissionState: () => Promise.resolve('prompt'),
        requestPermission,
      });
      const result = await ensureXRPermission(ctx, ['camera'], { prompt: false });
      expect(requestPermission).not.toHaveBeenCalled();
      // Still-in-prompt counts as not-granted; default policy is
      // fallback.
      expect(result).toBe('fallback');
    });
  });

  describe('mixed states', () => {
    it('processes permissions in order, recording every one', async () => {
      const ctx = makeContext({
        getPermissionState: (name) => {
          if (name === 'camera') return Promise.resolve('granted');
          if (name === 'gps') return Promise.resolve('denied');
          return Promise.resolve('granted');
        },
      });
      const spy = vi.spyOn(ctx, 'recordPermissionState');
      const result = await ensureXRPermission(ctx, ['camera', 'gps', 'microphone']);
      expect(result).toBe('fallback'); // at least one denied
      expect(spy).toHaveBeenCalledTimes(3);
    });

    it('one denied turns the whole result into the policy verdict, even if others granted', async () => {
      // The all-or-nothing rule: ALL requested permissions must
      // be granted for 'granted'. One denial taints the result.
      const ctx = makeContext({
        getPermissionState: (name) => Promise.resolve(name === 'camera' ? 'granted' : 'denied'),
      });
      expect(await ensureXRPermission(ctx, ['camera', 'gps'], { onDenied: 'skip' })).toBe('skip');
    });
  });
});
