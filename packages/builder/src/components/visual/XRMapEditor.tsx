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
import { X, Plus, MapPin, Trash2 } from 'lucide-react';

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
  /** Beats authors can target. */
  availableTargets: Array<{ id: string; name?: string }>;
  /** Project origin from LocationSettings, used as the centre when no locations exist yet. */
  storyOrigin?: { lat: number; lng: number };
  onChange: (next: XRLocation[]) => void;
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
  availableTargets,
  storyOrigin,
  onChange,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, { marker: L.Marker; ring: L.Circle }>>(new Map());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Hold a ref to the latest onChange so click handlers see the current callback.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  // Effective radius for a location — per-loc > beat > project > 25m.
  const fallbackRadius = beatRadiusMeters ?? projectDefaultRadius ?? 25;

  // Initial centre/zoom: first location, else story origin, else London.
  const initialCentre = useMemo<[number, number]>(() => {
    const first = locations.find((l) => l.lat !== undefined && l.lng !== undefined);
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

    // Click empty map → add a new location at the click point.
    map.on('click', (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      const fresh: XRLocation = {
        id: makeId(),
        name: '',
        lat,
        lng,
        target: '',
      };
      onChangeRef.current([...locations, fresh]);
      setSelectedId(fresh.id);
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

  const selected = locations.find((l) => l.id === selectedId) || null;

  const updateSelected = (patch: Partial<XRLocation>) => {
    if (!selected) return;
    onChangeRef.current(locations.map((l) => l.id === selected.id ? { ...l, ...patch } : l));
  };
  const removeSelected = () => {
    if (!selected) return;
    onChangeRef.current(locations.filter((l) => l.id !== selected.id));
    setSelectedId(null);
  };
  const addLocationAtCentre = () => {
    const map = mapRef.current;
    if (!map) return;
    const centre = map.getCenter();
    const fresh: XRLocation = {
      id: makeId(),
      name: '',
      lat: centre.lat,
      lng: centre.lng,
      target: '',
    };
    onChangeRef.current([...locations, fresh]);
    setSelectedId(fresh.id);
  };

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
      {/* Map fills the workspace */}
      <div
        ref={containerRef}
        style={{ flex: 1, minWidth: 0, height: '100%' }}
      />

      {/* Top-left: instructions + add button */}
      <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 1000 }}>
        <div className="bg-white/95 shadow-md rounded-lg px-3 py-2 text-xs space-y-1">
          <div className="flex items-center gap-2 font-medium text-gray-800">
            <MapPin className="w-3.5 h-3.5 text-red-600" />
            GPS locations ({locations.length})
          </div>
          <div className="text-gray-600">
            Click the map to add a location, drag markers to reposition.
          </div>
          <button
            type="button"
            onClick={addLocationAtCentre}
            className="text-xs px-2 py-0.5 bg-blue-600 text-white rounded hover:bg-blue-700 inline-flex items-center gap-1"
          >
            <Plus className="w-3 h-3" />
            Add at centre
          </button>
        </div>
      </div>

      {/* Right-side panel for the selected location */}
      {selected && (
        <div
          style={{
            width: 320,
            height: '100%',
            background: 'white',
            borderLeft: '1px solid #e5e7eb',
            zIndex: 1001,
          }}
          className="flex flex-col"
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-green-50">
            <div className="text-sm font-medium text-green-900">Selected location</div>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="p-1 text-gray-500 hover:text-gray-700"
              title="Close panel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3 text-sm">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-0.5">Name</label>
              <input
                type="text"
                value={selected.name || ''}
                onChange={(e) => updateSelected({ name: e.target.value })}
                placeholder="e.g. Front gate"
                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs text-gray-600">
                Latitude
                <input
                  type="number"
                  step="0.000001"
                  value={selected.lat ?? ''}
                  onChange={(e) => updateSelected({
                    lat: e.target.value === '' ? undefined : parseFloat(e.target.value.replace(',', '.')),
                  })}
                  className="mt-0.5 w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono"
                />
              </label>
              <label className="block text-xs text-gray-600">
                Longitude
                <input
                  type="number"
                  step="0.000001"
                  value={selected.lng ?? ''}
                  onChange={(e) => updateSelected({
                    lng: e.target.value === '' ? undefined : parseFloat(e.target.value.replace(',', '.')),
                  })}
                  className="mt-0.5 w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono"
                />
              </label>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-0.5">
                Radius — {(selected.radiusMeters ?? fallbackRadius).toFixed(1)} m
                {selected.radiusMeters === undefined && (
                  <span className="ml-1 text-[10px] italic text-gray-500">(beat default)</span>
                )}
              </label>
              <input
                type="range"
                min={1}
                max={500}
                step={1}
                value={selected.radiusMeters ?? fallbackRadius}
                onChange={(e) => updateSelected({ radiusMeters: parseFloat(e.target.value) })}
                className="w-full"
              />
              {selected.radiusMeters !== undefined && (
                <button
                  type="button"
                  onClick={() => updateSelected({ radiusMeters: undefined })}
                  className="mt-1 text-[11px] text-blue-600 hover:underline"
                >
                  Reset to beat default ({fallbackRadius}m)
                </button>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-0.5">Target beat</label>
              <select
                value={selected.target || ''}
                onChange={(e) => updateSelected({ target: e.target.value })}
                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
              >
                <option value="">— select a beat —</option>
                {availableTargets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name ? `${t.name} (${t.id})` : t.id}
                  </option>
                ))}
              </select>
            </div>
            <div className="text-[11px] text-gray-500 italic pt-1 border-t border-gray-100">
              Effects (counters, mood, sentiment, etc) live in the
              Properties tab — they don't have a spatial dimension.
            </div>
          </div>
          <div className="flex-shrink-0 px-3 py-2 border-t border-gray-200">
            <button
              type="button"
              onClick={removeSelected}
              className="w-full px-2 py-1.5 text-xs text-red-600 border border-red-300 rounded hover:bg-red-50 inline-flex items-center justify-center gap-1"
            >
              <Trash2 className="w-3 h-3" />
              Remove location
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
