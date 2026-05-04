/**
 * sensorAdapter — bridge from `@asaps/core` SensorService to the
 * `subscribeToSensor` shape that `AudioManager.playSpatialSound`
 * expects.
 *
 * The AudioManager doesn't import from core; it takes a small adapter
 * callback so it can stay decoupled. This module is the canonical
 * adapter — combines watchLocation + watchOrientation into a single
 * `(state) => void` stream that the panner update path consumes.
 *
 * Pattern: maintain a small in-memory snapshot of the latest readings,
 * call the updater on every change with the merged snapshot. Returns
 * an unsubscribe that tears down both underlying watchers.
 */

interface SensorService {
  watchLocation(cb: (r: { lat: number; lng: number }) => void): () => void;
  watchOrientation(cb: (r: { alpha: number | null }) => void): () => void;
}

/**
 * Build the `subscribeToSensor` adapter for a given SensorService.
 * The returned function matches the signature
 * `AudioManager.playSpatialSound` expects — pass it directly as the
 * fourth argument.
 */
export function buildSensorAdapter(sensorService: SensorService) {
  return (
    updater: (state: {
      playerLat?: number;
      playerLng?: number;
      compassAlpha?: number | null;
    }) => void,
  ): (() => void) => {
    const snapshot: {
      playerLat?: number;
      playerLng?: number;
      compassAlpha?: number | null;
    } = {};

    const emit = () => updater({ ...snapshot });

    const unsubLoc = sensorService.watchLocation((r) => {
      snapshot.playerLat = r.lat;
      snapshot.playerLng = r.lng;
      emit();
    });
    const unsubOri = sensorService.watchOrientation((r) => {
      snapshot.compassAlpha = r.alpha;
      emit();
    });

    return () => {
      unsubLoc();
      unsubOri();
    };
  };
}
