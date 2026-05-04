/**
 * XR permission helper (v0.9.48 / S3+).
 *
 * Probes a list of sensor permissions and returns a verdict that XR
 * beats use to route in their `onEnter`. The actual XR beats land in
 * v2 of the roadmap; this helper is the infrastructure they'll call
 * uniformly so per-beat permission handling stays consistent.
 *
 * The verdict shape is intentionally three-state:
 *   - 'granted'  — every requested permission is granted, beat proceeds
 *   - 'fallback' — at least one denied / unavailable, beat should
 *                  redirect to the project's fallbackBeatId
 *   - 'skip'     — at least one denied / unavailable AND the project
 *                  is configured for silent skip (no fallback target)
 *
 * The choice between 'fallback' and 'skip' comes from the project's
 * LocationSettings.onPermissionDenied — the helper takes the policy
 * as an argument rather than reading the project directly so it stays
 * easy to test in isolation.
 *
 * Side effect: the helper records every observed permission state into
 * the StoryContext's permissionStateCache so the synchronous
 * `permissionGranted` condition evaluator can branch on the result
 * later in the story without re-probing.
 */

import type { StoryContext } from '../engine/StoryContext';
import type { SensorPermissionName } from '../engine/SensorService';

/** Verdict from `ensureXRPermission`. See module docstring for semantics. */
export type XRPermissionVerdict = 'granted' | 'fallback' | 'skip';

export interface XRPermissionPolicy {
  /**
   * What to do when a required permission is denied or unavailable.
   * Mirrors LocationSettings.onPermissionDenied. Defaults to 'fallback'
   * when omitted — the helper assumes a fallback target exists; if
   * none does, the caller can map 'fallback' → 'skip' manually.
   */
  onDenied?: 'skip' | 'fallback';
  /**
   * If true, attempt to *prompt* for any 'prompt'-state permission
   * before failing. Default true — the entire point of probing is to
   * give the player a chance to grant permission. Set to false in
   * unit tests or contexts where you only want to read existing state.
   */
  prompt?: boolean;
}

/**
 * Probe the given permissions in order and return a verdict. Records
 * each observed state into the context's permission cache so later
 * `permissionGranted` conditions can read synchronously.
 *
 * Behaviour:
 *   1. For each permission, read the current state via
 *      sensorService.getPermissionState.
 *   2. If state is 'granted', record and continue.
 *   3. If state is 'prompt' and `prompt` is true (default), call
 *      sensorService.requestPermission to surface the platform UI.
 *      Record whatever post-prompt state results.
 *   4. If state is 'denied' or 'unavailable' (or remains 'prompt'
 *      after a refused request), record it and remember that we
 *      hit at least one deny.
 *   5. After processing the whole list, return 'granted' iff every
 *      permission ended up granted; otherwise return the policy's
 *      preferred fallback ('fallback' or 'skip').
 */
export async function ensureXRPermission(
  context: StoryContext,
  permissions: SensorPermissionName[],
  policy: XRPermissionPolicy = {},
): Promise<XRPermissionVerdict> {
  if (!permissions || permissions.length === 0) return 'granted';
  const sensor = context.getSensorService();
  const shouldPrompt = policy.prompt !== false;
  let allGranted = true;

  for (const name of permissions) {
    let state = await sensor.getPermissionState(name);
    if (state === 'prompt' && shouldPrompt) {
      state = await sensor.requestPermission(name);
    }
    context.recordPermissionState(name, state);
    if (state !== 'granted') allGranted = false;
  }

  if (allGranted) return 'granted';
  return policy.onDenied === 'skip' ? 'skip' : 'fallback';
}
