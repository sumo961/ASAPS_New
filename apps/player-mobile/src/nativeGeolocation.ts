/**
 * Route the web view's navigator.geolocation through the native
 * Geolocation plugin when the app runs natively.
 *
 * The story runtime (WebSensorService in @asaps/core) reads positions with
 * the standard browser API. Inside a native app that API is WebKit's own
 * location service, which proved unreliable (fixes arriving once, then
 * timing out). The plugin uses the platform's location service directly
 * (Core Location / Fused Location) under the permission the app already
 * asks for. Same interface, so no story code changes.
 */
import { Capacitor } from '@capacitor/core';
import { Geolocation, type Position } from '@capacitor/geolocation';

type Success = PositionCallback;
type Failure = PositionErrorCallback | null | undefined;

function toError(err: unknown): GeolocationPositionError {
  const message = err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err ?? 'Location unavailable');
  const code = /denied|permission/i.test(message) ? 1 : /time ?out/i.test(message) ? 3 : 2;
  return { code, message, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError;
}

function toPosition(p: Position): GeolocationPosition {
  return { timestamp: p.timestamp, coords: p.coords as unknown as GeolocationCoordinates } as GeolocationPosition;
}

export function installNativeGeolocation(): void {
  if (!Capacitor.isNativePlatform() || typeof navigator === 'undefined' || !navigator.geolocation) return;
  const geo = navigator.geolocation;
  const watches = new Map<number, Promise<string>>();
  let nextId = 1;

  geo.getCurrentPosition = (ok: Success, fail?: Failure, opts?: PositionOptions) => {
    Geolocation.getCurrentPosition({
      enableHighAccuracy: opts?.enableHighAccuracy ?? false,
      timeout: opts?.timeout,
      maximumAge: opts?.maximumAge,
    })
      .then((p) => ok(toPosition(p)))
      .catch((err) => fail?.(toError(err)));
  };

  // Live tracking. The plugin reads `timeout` as the longest gap between
  // updates, so a player standing still got a timeout after 30 s and the
  // watch went quiet for good — arriving at a pin then never registered.
  // No timeout here, and a native watch that errors is restarted.
  geo.watchPosition = (ok: Success, fail?: Failure, opts?: PositionOptions) => {
    const id = nextId++;
    const start = (): Promise<string> =>
      Geolocation.watchPosition(
        { enableHighAccuracy: opts?.enableHighAccuracy ?? false, maximumAge: opts?.maximumAge },
        (p, err) => {
          if (p) {
            ok(toPosition(p));
            return;
          }
          if (!err) return;
          const error = toError(err);
          fail?.(error);
          if (error.code === 1 || !watches.has(id)) return; // denied, or cleared meanwhile
          const old = watches.get(id)!;
          watches.set(id, old.then((cb) => Geolocation.clearWatch({ id: cb }).catch(() => {})).then(start));
        },
      );
    watches.set(id, start());
    return id;
  };

  geo.clearWatch = (id: number) => {
    const pending = watches.get(id);
    if (!pending) return;
    watches.delete(id);
    void pending.then((callbackId) => Geolocation.clearWatch({ id: callbackId })).catch(() => {});
  };

  console.log('[FieldPlayer] navigator.geolocation routed through the native Geolocation plugin');
}
