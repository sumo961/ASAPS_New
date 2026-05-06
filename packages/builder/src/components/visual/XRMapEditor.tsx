/**
 * XRMapEditor (v0.9.49+) — Visual Editor for GpsLocationBeat.
 *
 * Leaflet-based authoring surface that lets the author drag locations
 * around a real map, click empty space to add a new location, and
 * click a marker to open an inline panel with name / target / radius
 * editing. Mirrors the runtime MapBeatLeaflet visual language so the
 * authoring view matches what the player sees.
 *
 * Effects bundles (counters, mood, sentiment, etc) stay in the
 * Properties tab — they don't have a spatial dimension and would
 * overwhelm the marker popover.
 *
 * Backward compat: legacy beats with single targetLat/targetLng but
 * no xrLocations array are surfaced as a one-element editable list.
 * The first edit migrates them into the multi-location array.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import leafletCss from 'leaflet/dist/leaflet.css?inline';
import { Plus, MapPin, Maximize2 } from 'lucide-react';

interface XRLocation {
  id: string;
  name?: string;
  lat?: number;
  lng?: number;
  radiusMeters?: number;
  target?: string;
  effects?: any[];
}

interface XRMapEditorProps {
  /** Current locations on the beat (xrLocations array). */
  locations: XRLocation[];
  /** Beat-level radius default — used when a location doesn't override. */
  beatRadiusMeters?: number;
  /** Project default radius from globalSettings.location.defaultProximityRadiusM. */
  projectDefaultRadius?: number;
  /** Map style passed through from the beat's parameters. */
  mapStyle?: 'streets' | 'satellite' | 'minimal';
  /** Project origin from LocationSettings, used as fallback for new locations. */
  storyOrigin?: { lat: number; lng: number };
  onChange: (next: XRLocation[]) => void;
}

/** Compute the next "Location N" auto-name based on existing entries. */
function nextLocationName(locations: XRLocation[]): string {
  let max = 0;
  for (const loc of locations) {
    const m = (loc.name || '').match(/^Location\s+(\d+)$/i);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return `Location ${max + 1}`;
}

const TILE_URLS: Record<string, { url: string; attribution: string; maxZoom: number }> = {
  streets: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles © Esri',
    maxZoom: 19,
  },
  minimal: {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '© OpenStreetMap contributors © CARTO',
    maxZoom: 19,
  },
};

const TARGET_ICON = L.divIcon({
  html: '<div style="width:24px;height:24px;background:#dc2626;border:3px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.4);cursor:grab"></div>',
  className: '',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});
const TARGET_ICON_SELECTED = L.divIcon({
  html: '<div style="width:28px;height:28px;background:#16a34a;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.5);cursor:grab"></div>',
  className: '',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const CSS_STYLE_ID = 'asaps-leaflet-core';
const RESET_STYLE_ID = 'asaps-leaflet-reset';
function ensureLeafletCoreStyle() {
  if (typeof document === 'undefined' || document.getElementById(CSS_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = CSS_STYLE_ID;
  style.textContent = leafletCss;
  document.head.appendChild(style);
}
/**
 * Defeat host CSS resets (Tailwind preflight) that would scale leaflet's
 * 256×256 tiles arbitrarily and strip leaflet-bar button styling. Same
 * rules the runtime MapBeatLeaflet injects.
 */
function ensureLeafletResetStyle() {
  if (typeof document === 'undefined' || document.getElementById(RESET_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = RESET_STYLE_ID;
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

function makeId(): string {
  return `loc_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

export const XRMapEditor: React.FC<XRMapEditorProps> = ({
  locations,
  beatRadiusMeters,
  projectDefaultRadius,
  mapStyle = 'streets',
  storyOrigin,
  onChange,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, { marker: L.Marker; ring: L.Circle }>>(new Map());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Hold refs to the latest onChange and locations so the map's click
  // handler (registered once at mount) always sees the current values.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const locationsRef = useRef(locations);
  locationsRef.current = locations;
  // Effective radius for a location — per-loc > beat > project > 25m.
  const fallbackRadius = beatRadiusMeters ?? projectDefaultRadius ?? 25;

  // Initial centre/zoom: first *meaningfully positioned* location, else
  // story origin, else London. Locations at (0,0) are treated as
  // "unset" placeholders — centring there shows ocean tiles only and is
  // never what an author wants.
  const initialCentre = useMemo<[number, number]>(() => {
    const first = locations.find(
      (l) => l.lat !== undefined && l.lng !== undefined
        && !(Math.abs(l.lat) < 0.01 && Math.abs(l.lng) < 0.01),
    );
    if (first) return [first.lat!, first.lng!];
    if (storyOrigin) return [storyOrigin.lat, storyOrigin.lng];
    return [51.5074, -0.1278];
  }, []);  // intentionally blank — only on mount

  // Initialise map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    ensureLeafletCoreStyle();
    ensureLeafletResetStyle();
    const tile = TILE_URLS[mapStyle] || TILE_URLS.streets;
    const map = L.map(containerRef.current, {
      center: initialCentre,
      zoom: locations.length > 0 ? 16 : 13,
      zoomControl: true,
    });
    L.tileLayer(tile.url, { attribution: tile.attribution, maxZoom: tile.maxZoom }).addTo(map);
    mapRef.current = map;

    // Click empty map → add a new location at the click point with an
    // auto-name. Author can rename in the Inspector. The window event
    // notifies the Inspector so it scrolls to and highlights the new row.
    map.on('click', (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      const fresh: XRLocation = {
        id: makeId(),
        name: nextLocationName(locationsRef.current),
        lat,
        lng,
        target: '',
      };
      onChangeRef.current([...locationsRef.current, fresh]);
      setSelectedId(fresh.id);
      try {
        window.dispatchEvent(new CustomEvent('asaps:xr-location-selected', { detail: { id: fresh.id } }));
      } catch { /* ignore */ }
    });

    // Force a re-layout once container has its real size. Two timing
    // checkpoints (raf + 250ms) catch slow-arriving CSS / fonts; a
    // ResizeObserver picks up later resizes (workspace splits, sidebar
    // toggles, etc.).
    const raf = window.requestAnimationFrame(() => map.invalidateSize());
    const settle = window.setTimeout(() => map.invalidateSize(), 250);
    let resizeObserver: ResizeObserver | null = null;
    const onWindowResize = () => map.invalidateSize();
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      resizeObserver = new ResizeObserver(() => map.invalidateSize());
      resizeObserver.observe(containerRef.current);
    } else {
      window.addEventListener('resize', onWindowResize);
    }

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(settle);
      if (resizeObserver) resizeObserver.disconnect();
      else window.removeEventListener('resize', onWindowResize);
      try { map.remove(); } catch { /* ignore */ }
      mapRef.current = null;
      markersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render markers whenever locations change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove markers that are no longer in the list.
    const liveIds = new Set(locations.map((l) => l.id));
    for (const [id, { marker, ring }] of markersRef.current.entries()) {
      if (!liveIds.has(id)) {
        marker.remove();
        ring.remove();
        markersRef.current.delete(id);
      }
    }

    for (const loc of locations) {
      if (loc.lat === undefined || loc.lng === undefined) continue;
      const radius = loc.radiusMeters ?? fallbackRadius;
      const existing = markersRef.current.get(loc.id);
      if (existing) {
        existing.marker.setLatLng([loc.lat, loc.lng]);
        existing.marker.setIcon(loc.id === selectedId ? TARGET_ICON_SELECTED : TARGET_ICON);
        existing.ring.setLatLng([loc.lat, loc.lng]);
        existing.ring.setRadius(radius);
      } else {
        const marker = L.marker([loc.lat, loc.lng], {
          icon: loc.id === selectedId ? TARGET_ICON_SELECTED : TARGET_ICON,
          draggable: true,
          title: loc.name || loc.id,
        }).addTo(map);
        const ring = L.circle([loc.lat, loc.lng], {
          radius,
          color: '#dc2626',
          fillColor: '#dc2626',
          fillOpacity: 0.08,
          weight: 2,
        }).addTo(map);

        marker.on('click', (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          setSelectedId(loc.id);
          try {
            window.dispatchEvent(new CustomEvent('asaps:xr-location-selected', { detail: { id: loc.id } }));
          } catch { /* ignore */ }
        });
        marker.on('drag', (e: any) => {
          const ll = e.target.getLatLng();
          ring.setLatLng(ll);
        });
        marker.on('dragend', (e: any) => {
          const ll = e.target.getLatLng();
          const next = locations.map((x) => x.id === loc.id ? { ...x, lat: ll.lat, lng: ll.lng } : x);
          onChangeRef.current(next);
        });

        markersRef.current.set(loc.id, { marker, ring });
      }
    }
  }, [locations, fallbackRadius, selectedId]);

  // Update marker icon when selection changes (without re-creating markers).
  useEffect(() => {
    for (const [id, { marker }] of markersRef.current.entries()) {
      marker.setIcon(id === selectedId ? TARGET_ICON_SELECTED : TARGET_ICON);
    }
  }, [selectedId]);

  // Listen for "focus this location" events from the Inspector. When the
  // author clicks a location row in Properties, pan the map to that
  // marker and select it.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { id: string } | undefined;
      if (!detail?.id) return;
      const loc = locationsRef.current.find((l) => l.id === detail.id);
      if (!loc || loc.lat === undefined || loc.lng === undefined) {
        // Still highlight so the author sees the selection link visually,
        // even if the marker has no coords yet.
        setSelectedId(detail.id);
        return;
      }
      const map = mapRef.current;
      if (map) {
        // Use a closer zoom only if we're currently zoomed out very far.
        const target = map.getZoom() < 14 ? 17 : map.getZoom();
        map.setView([loc.lat, loc.lng], target, { animate: true });
      }
      setSelectedId(detail.id);
    };
    window.addEventListener('asaps:xr-focus-location', handler);
    return () => window.removeEventListener('asaps:xr-focus-location', handler);
  }, []);

  const selected = locations.find((l) => l.id === selectedId) || null;

  const addLocationAtCentre = () => {
    const map = mapRef.current;
    // Prefer the current map view's centre; fall back to storyOrigin /
    // London when the map isn't ready yet (component just mounted).
    const fallback = storyOrigin || { lat: 51.5074, lng: -0.1278 };
    const centre = map ? map.getCenter() : fallback;
    const fresh: XRLocation = {
      id: makeId(),
      name: nextLocationName(locations),
      lat: centre.lat,
      lng: centre.lng,
      target: '',
    };
    onChangeRef.current([...locations, fresh]);
    setSelectedId(fresh.id);
    try {
      window.dispatchEvent(new CustomEvent('asaps:xr-location-selected', { detail: { id: fresh.id } }));
    } catch { /* ignore */ }
  };

  const fitAllLocations = () => {
    const map = mapRef.current;
    if (!map) return;
    const valid = locations.filter(
      (l) => l.lat !== undefined && l.lng !== undefined
        && !(Math.abs(l.lat) < 0.01 && Math.abs(l.lng) < 0.01),
    );
    if (valid.length === 0) {
      // No valid markers — just centre on storyOrigin so we're not in the ocean.
      const fallback = storyOrigin || { lat: 51.5074, lng: -0.1278 };
      map.setView([fallback.lat, fallback.lng], 13, { animate: true });
      return;
    }
    if (valid.length === 1) {
      map.setView([valid[0].lat!, valid[0].lng!], 17, { animate: true });
      return;
    }
    try {
      map.fitBounds(
        L.latLngBounds(valid.map((l) => [l.lat!, l.lng!] as [number, number])).pad(0.3),
        { maxZoom: 17, animate: true },
      );
    } catch { /* ignore */ }
  };

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {/* Map fills the workspace edge to edge — no side panel. All
          location data lives in the Properties tab; this view is purely
          for spatial manipulation (drag, click-to-add, zoom). */}
      <div
        ref={containerRef}
        style={{ position: 'absolute', inset: 0 }}
      />

      {/* Top-left HUD — counts + action buttons. */}
      <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 1000 }}>
        <div className="bg-white/95 shadow-md rounded-lg px-3 py-2 text-xs space-y-1.5">
          <div className="flex items-center gap-2 font-medium text-gray-800">
            <MapPin className="w-3.5 h-3.5 text-red-600" />
            GPS locations ({locations.length})
          </div>
          <div className="text-gray-600">
            Click empty map to add. Drag markers to move. Edit names, targets, and effects in the Properties tab.
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={addLocationAtCentre}
              className="text-xs px-2 py-0.5 bg-blue-600 text-white rounded hover:bg-blue-700 inline-flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              Add at centre
            </button>
            <button
              type="button"
              onClick={fitAllLocations}
              className="text-xs px-2 py-0.5 border border-gray-300 bg-white text-gray-700 rounded hover:bg-gray-50 inline-flex items-center gap-1"
              title="Zoom out to show every location"
            >
              <Maximize2 className="w-3 h-3" />
              Fit all
            </button>
          </div>
        </div>
      </div>

      {/* Top-right HUD — current selection (read-only display so the
          author always knows which location they're editing in
          Properties). Vacant when nothing is selected. */}
      {selected && (
        <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 1000 }}>
          <div className="bg-green-50 border border-green-300 shadow-md rounded-lg px-3 py-1.5 text-xs">
            <span className="font-medium text-green-900">Selected:</span>{' '}
            <span className="text-green-800">{selected.name || '(unnamed)'}</span>
          </div>
        </div>
      )}

    </div>
  );
};
