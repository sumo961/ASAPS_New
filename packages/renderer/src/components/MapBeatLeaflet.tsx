/**
 * MapBeatLeaflet — real interactive map for the GpsLocationBeat (S4+).
 *
 * Replaces the v0.9.48 MapBeatPlaceholder. Renders an OpenStreetMap
 * (or satellite, or minimal styling) tile layer with:
 *   - A target marker at the beat's targetLat/Lng
 *   - A radius circle around the target
 *   - A player marker that updates live from the SensorService
 *   - Auto-fit bounds when the player is known
 *
 * Same resolution semantics as the placeholder — resolves with
 * 'arrived' / 'departed' / 'continue' / 'timeout' / 'skipped' so the
 * GpsLocationBeat runtime is unchanged.
 *
 * Leaflet is loaded eagerly on mount (it's tiny — ~40KB) and torn
 * down on unmount. The CSS is imported here because Leaflet's
 * default tile rendering depends on it; importing the CSS pulls it
 * into the bundler's CSS chunk.
 */

import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
// Import as inline CSS string so the rules ship inside the JS bundle and
// get injected at component-mount time. Plain `import 'leaflet/dist/leaflet.css'`
// only emits a sibling stylesheet (`packages/renderer/dist/style.css`) that
// library consumers (builder, exported HTML, Electron) don't auto-load —
// without it Leaflet tiles fall back to position:static and scatter.
import leafletCss from 'leaflet/dist/leaflet.css?inline';

/**
 * Defeat host-CSS resets that target `img`. Tailwind's preflight (and
 * many other resets) ship `img { max-width: 100%; height: auto; }`,
 * which scales Leaflet's 256×256 tiles independently — they end up at
 * arbitrary sizes with gaps between them. The .leaflet-tile and
 * .leaflet-container scoping plus !important defeats those rules
 * without polluting other img elements in the host page. Injected
 * once on first mount; idempotent (we tag it with an id).
 *
 * Reference: https://github.com/Leaflet/Leaflet/issues/3575
 */
const LEAFLET_CORE_STYLE_ID = 'asaps-leaflet-core';
const LEAFLET_RESET_STYLE_ID = 'asaps-leaflet-reset';

/**
 * Inject leaflet's own CSS at runtime. The library-build sibling stylesheet
 * isn't loaded by consumers, so we ship the rules inside the JS bundle and
 * append them to <head> on first mount. Idempotent.
 */
function ensureLeafletCoreStyle() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(LEAFLET_CORE_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = LEAFLET_CORE_STYLE_ID;
  style.textContent = leafletCss;
  document.head.appendChild(style);
}

function ensureLeafletResetStyle() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(LEAFLET_RESET_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = LEAFLET_RESET_STYLE_ID;
  style.textContent = `
    .leaflet-container img.leaflet-tile,
    .leaflet-container .leaflet-marker-icon,
    .leaflet-container .leaflet-marker-shadow {
      max-width: none !important;
      max-height: none !important;
      height: auto;
      width: auto;
    }
    .leaflet-container img.leaflet-tile {
      width: 256px !important;
      height: 256px !important;
    }
    /* Tailwind preflight strips background/border/text-decoration from <a>
       elements — leaflet-bar buttons (zoom +/-, recenter) become invisible.
       Restore the defaults Leaflet's own CSS expects. */
    .leaflet-container .leaflet-bar a,
    .leaflet-container .leaflet-bar a:hover {
      background-color: #fff !important;
      color: #000 !important;
      text-decoration: none !important;
      display: block !important;
      width: 26px !important;
      height: 26px !important;
      line-height: 26px !important;
      text-align: center !important;
      border-bottom: 1px solid #ccc !important;
    }
    .leaflet-container .leaflet-bar a:hover {
      background-color: #f4f4f4 !important;
    }
    .leaflet-container .leaflet-bar a:last-child {
      border-bottom: none !important;
    }
  `;
  document.head.appendChild(style);
}

interface MapBeatLeafletProps {
  mode: 'display' | 'trigger-on-arrival' | 'trigger-on-departure';
  targetLat: number;
  targetLng: number;
  radiusMeters: number;
  text?: string;
  buttonText?: string;
  cancelButtonText?: string;
  timeoutMs?: number;
  mapStyle?: 'streets' | 'satellite' | 'minimal';
  showPlayerMarker?: boolean;
  /** SensorService — passed via renderer state. */
  sensorService?: any;
  onResolve: (path: 'arrived' | 'departed' | 'continue' | 'timeout' | 'skipped') => void;
}

/** Haversine in metres — same formula as the engine's gpsProximity. */
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_008.8;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Tile URL templates per author-chosen mapStyle. */
const TILE_URLS: Record<string, { url: string; attribution: string; maxZoom: number }> = {
  streets: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
  },
  satellite: {
    // Esri's free World Imagery layer. Free for non-commercial use, which fits
    // the PolyForm-Noncommercial license; commercial users should swap providers.
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    maxZoom: 19,
  },
  minimal: {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '© OpenStreetMap contributors © CARTO',
    maxZoom: 19,
  },
};

// Leaflet's default marker icon assumes images live at /images/...; with
// bundler-driven assets that path is wrong by default. Override via inline
// data URIs so the markers always render. Players can override later.
const DEFAULT_TARGET_ICON = L.divIcon({
  html: '<div style="width: 24px; height: 24px; background: #dc2626; border: 3px solid white; border-radius: 50%; box-shadow: 0 2px 6px rgba(0,0,0,0.4);"></div>',
  className: '',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});
const DEFAULT_PLAYER_ICON = L.divIcon({
  html: '<div style="width: 18px; height: 18px; background: #2563eb; border: 3px solid white; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>',
  className: '',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

export const MapBeatLeaflet: React.FC<MapBeatLeafletProps> = ({
  mode,
  targetLat,
  targetLng,
  radiusMeters,
  text,
  buttonText = 'Continue',
  cancelButtonText,
  timeoutMs,
  mapStyle = 'streets',
  showPlayerMarker = true,
  sensorService,
  onResolve,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const playerMarkerRef = useRef<L.Marker | null>(null);
  // Latest known player coords kept in a ref so the "Recenter on me" Leaflet
  // control (registered once at map-init time) reads the current value
  // without having to re-register on every player move.
  const playerPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const [playerLat, setPlayerLat] = useState<number | null>(null);
  const [playerLng, setPlayerLng] = useState<number | null>(null);
  // Auto-follow state: the first time the player position changes after the
  // initial overview fit, zoom in to street level. After that, just pan to
  // keep the player in view at whatever zoom the user (or first zoom-in) set.
  const hasZoomedInRef = useRef(false);
  const initialPlayerPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const [resolved, setResolved] = useState(false);
  const resolvedRef = useRef(false);
  const onResolveRef = useRef(onResolve);
  onResolveRef.current = onResolve;

  // Initialise the Leaflet map once on mount.
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    // Inject leaflet's own CSS first (library build doesn't auto-load it),
    // then our scoped reset to defeat host img-resets.
    ensureLeafletCoreStyle();
    ensureLeafletResetStyle();

    const tile = TILE_URLS[mapStyle] || TILE_URLS.streets;
    const map = L.map(mapContainerRef.current, {
      center: [targetLat, targetLng],
      zoom: 17,
      zoomControl: true,
      attributionControl: true,
    });
    L.tileLayer(tile.url, {
      attribution: tile.attribution,
      maxZoom: tile.maxZoom,
    }).addTo(map);

    // Target marker + radius ring.
    L.marker([targetLat, targetLng], { icon: DEFAULT_TARGET_ICON, title: 'Target' }).addTo(map);
    L.circle([targetLat, targetLng], {
      radius: radiusMeters,
      color: '#dc2626',
      fillColor: '#dc2626',
      fillOpacity: 0.1,
      weight: 2,
    }).addTo(map);

    mapRef.current = map;

    // "Recenter on me" control — top-right of the map. Reads the latest
    // player position from playerPosRef, so it stays correct without the
    // control needing to re-register on every move. Disabled (greyed out)
    // until we have a player position to recenter on.
    const RecenterControl = L.Control.extend({
      options: { position: 'topright' },
      onAdd: () => {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
        const button = L.DomUtil.create('a', '', container);
        button.href = '#';
        button.title = 'Recenter on me';
        button.setAttribute('role', 'button');
        button.setAttribute('aria-label', 'Recenter on me');
        // Inline SVG crosshair so we don't need an asset pipeline.
        button.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
               stroke-linejoin="round" style="display:block;margin:5px auto;">
            <circle cx="12" cy="12" r="8"/>
            <circle cx="12" cy="12" r="2" fill="currentColor"/>
            <line x1="12" y1="2" x2="12" y2="5"/>
            <line x1="12" y1="19" x2="12" y2="22"/>
            <line x1="2" y1="12" x2="5" y2="12"/>
            <line x1="19" y1="12" x2="22" y2="12"/>
          </svg>
        `;
        L.DomEvent.on(button, 'click', (e) => {
          L.DomEvent.preventDefault(e);
          L.DomEvent.stopPropagation(e);
          const pos = playerPosRef.current;
          if (!pos) return;
          // Use current zoom unless we're still at overview — then go to 18.
          const targetZoom = map.getZoom() < 15 ? 18 : map.getZoom();
          map.setView([pos.lat, pos.lng], targetZoom, { animate: true });
        });
        L.DomEvent.disableClickPropagation(container);
        return container;
      },
    });
    map.addControl(new RecenterControl());

    // The container's flex layout often hasn't settled when L.map() runs,
    // so Leaflet's initial tile grid is computed against the wrong size.
    // Recompute on the next animation frame, and again after a beat to
    // catch slow-arriving CSS / fonts. Both calls are cheap.
    const rafHandle = window.requestAnimationFrame(() => map.invalidateSize());
    const settleHandle = window.setTimeout(() => map.invalidateSize(), 250);

    // Also re-invalidate whenever the host viewport resizes (e.g. window
    // resize, fullscreen toggle, mobile rotation). ResizeObserver where
    // available; fallback to window resize event.
    let resizeObserver: ResizeObserver | null = null;
    const onWindowResize = () => map.invalidateSize();
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => map.invalidateSize());
      resizeObserver.observe(mapContainerRef.current);
    } else {
      window.addEventListener('resize', onWindowResize);
    }

    return () => {
      window.cancelAnimationFrame(rafHandle);
      window.clearTimeout(settleHandle);
      if (resizeObserver) resizeObserver.disconnect();
      else window.removeEventListener('resize', onWindowResize);
      try { map.remove(); } catch { /* already removed */ }
      mapRef.current = null;
      playerMarkerRef.current = null;
    };
  }, [mapStyle, targetLat, targetLng, radiusMeters]);

  // Subscribe to live location updates.
  useEffect(() => {
    if (!sensorService) return;
    const unsub = sensorService.watchLocation((reading: { lat: number; lng: number }) => {
      setPlayerLat(reading.lat);
      setPlayerLng(reading.lng);
    });
    return unsub;
  }, [sensorService]);

  // Update / create the player marker when the player position changes.
  useEffect(() => {
    if (!mapRef.current || !showPlayerMarker) return;
    if (playerLat === null || playerLng === null) return;
    const map = mapRef.current;
    playerPosRef.current = { lat: playerLat, lng: playerLng };

    if (!playerMarkerRef.current) {
      // First time we know where the player is — drop the marker and fit
      // bounds to show both target and player ("overview").
      playerMarkerRef.current = L.marker([playerLat, playerLng], {
        icon: DEFAULT_PLAYER_ICON,
        title: 'You',
      }).addTo(map);
      initialPlayerPosRef.current = { lat: playerLat, lng: playerLng };
      try {
        map.fitBounds(
          L.latLngBounds([
            [targetLat, targetLng],
            [playerLat, playerLng],
          ]).pad(0.4),
          { maxZoom: 18 },
        );
      } catch { /* invalid bounds (e.g. identical points) — ignore */ }
      return;
    }

    playerMarkerRef.current.setLatLng([playerLat, playerLng]);

    // First *movement* (player position differs from where they were
    // initially seeded) — zoom in to street level so individual steps
    // are visible. At overview zoom (~11) a 5m step is sub-pixel and
    // looks like the marker isn't moving at all.
    const initial = initialPlayerPosRef.current;
    const moved = !initial || initial.lat !== playerLat || initial.lng !== playerLng;
    if (moved && !hasZoomedInRef.current) {
      hasZoomedInRef.current = true;
      map.setView([playerLat, playerLng], 18, { animate: true });
      return;
    }

    // After the first zoom-in, keep the player in view by panning if they
    // drift outside the current viewport. Don't change zoom — respects
    // any manual zoom the user has applied.
    if (hasZoomedInRef.current) {
      const bounds = map.getBounds().pad(-0.15); // shrink 15% so we recenter before edge
      if (!bounds.contains([playerLat, playerLng])) {
        map.panTo([playerLat, playerLng], { animate: true });
      }
    }
  }, [playerLat, playerLng, targetLat, targetLng, showPlayerMarker]);

  // Threshold-crossing detection for trigger modes.
  useEffect(() => {
    if (mode === 'display' || resolvedRef.current) return;
    if (playerLat === null || playerLng === null) return;
    const distance = haversineMeters(playerLat, playerLng, targetLat, targetLng);
    const within = distance <= radiusMeters;
    if (mode === 'trigger-on-arrival' && within) {
      resolvedRef.current = true;
      setResolved(true);
      onResolveRef.current('arrived');
    } else if (mode === 'trigger-on-departure' && !within) {
      resolvedRef.current = true;
      setResolved(true);
      onResolveRef.current('departed');
    }
  }, [mode, playerLat, playerLng, targetLat, targetLng, radiusMeters]);

  // Optional timeout.
  useEffect(() => {
    if (!timeoutMs || timeoutMs <= 0 || resolvedRef.current) return;
    const handle = window.setTimeout(() => {
      if (resolvedRef.current) return;
      resolvedRef.current = true;
      setResolved(true);
      onResolveRef.current('timeout');
    }, timeoutMs);
    return () => window.clearTimeout(handle);
  }, [timeoutMs]);

  const distance = playerLat !== null && playerLng !== null
    ? haversineMeters(playerLat, playerLng, targetLat, targetLng)
    : null;
  const within = distance !== null && distance <= radiusMeters;

  let statusText: string;
  let statusColour: string;
  if (mode === 'display') {
    statusText = 'Map view';
    statusColour = '#1d4ed8';
  } else if (distance === null) {
    statusText = 'Waiting for location…';
    statusColour = '#6b7280';
  } else if (mode === 'trigger-on-arrival') {
    statusText = within ? 'Arrived ✓' : `${Math.round(distance)} m away`;
    statusColour = within ? '#15803d' : '#b45309';
  } else {
    statusText = within ? `${Math.round(distance)} m inside (waiting to depart)` : 'Departed ✓';
    statusColour = within ? '#b45309' : '#15803d';
  }

  const handleContinue = () => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    setResolved(true);
    onResolveRef.current('continue');
  };
  const handleSkip = () => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    setResolved(true);
    onResolveRef.current('skipped');
  };

  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      background: '#0f172a',
    }}>
      {text && (
        <div style={{
          background: 'rgba(15, 23, 42, 0.95)', color: 'white', padding: '12px 16px',
          fontSize: 14, lineHeight: 1.4, textAlign: 'center',
        }}>
          {text}
        </div>
      )}
      <div ref={mapContainerRef} style={{ flex: 1, minHeight: 0 }} />
      <div style={{
        background: 'white', padding: '12px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, borderTop: '1px solid #e5e7eb',
      }}>
        <div style={{ fontWeight: 600, color: statusColour, flex: 1 }}>
          📍 {statusText}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {mode === 'display' && (
            <button
              type="button"
              onClick={handleContinue}
              disabled={resolved}
              style={{
                background: '#2563eb', color: 'white', border: 'none',
                padding: '8px 16px', borderRadius: 8, fontSize: 14,
                cursor: resolved ? 'default' : 'pointer', opacity: resolved ? 0.5 : 1,
              }}
            >
              {buttonText}
            </button>
          )}
          {cancelButtonText && (
            <button
              type="button"
              onClick={handleSkip}
              disabled={resolved}
              style={{
                background: 'white', color: '#374151',
                border: '1px solid #d1d5db', padding: '8px 16px',
                borderRadius: 8, fontSize: 14,
                cursor: resolved ? 'default' : 'pointer', opacity: resolved ? 0.5 : 1,
              }}
            >
              {cancelButtonText}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
