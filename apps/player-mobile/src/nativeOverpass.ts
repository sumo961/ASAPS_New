/**
 * Send the story runtime's Overpass (OpenStreetMap) queries natively.
 *
 * "Walkable" scatter placement asks the public Overpass instance for nearby
 * streets and paths. That instance answers 406 to requests carrying a
 * browser user agent — which is what the web view sends — so in the app
 * every placement fell back to uniform scatter (pins in rivers and
 * buildings). Natively we can identify the app, as the Overpass usage
 * policy asks. Only these queries go this way; everything else (AI
 * streaming in particular) stays on the web view's fetch.
 */
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { setOverpassFetch } from '@asaps/core';

const USER_AGENT = 'ASAPS-Player/1.0 (+https://github.com/sumo961/ASAPS_New)';

export function installNativeOverpass(): void {
  if (!Capacitor.isNativePlatform()) return;
  setOverpassFetch(async (url, init) => {
    const res = await CapacitorHttp.request({
      url,
      method: init?.method ?? 'GET',
      headers: { ...(init?.headers ?? {}), 'User-Agent': USER_AGENT },
      data: init?.body,
      connectTimeout: 15_000,
      readTimeout: 30_000,
    });
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      json: async () => (typeof res.data === 'string' ? JSON.parse(res.data) : res.data),
    };
  });
}
