/**
 * GpsPointCurator — authoring-time map curation for the Set GPS Location beat's
 * `preset` mode.
 *
 * A Leaflet map (OSM tiles, matching the runtime map) where the author sets a
 * center + radius, auto-generates points snapped onto real streets/parks via
 * OpenStreetMap ("Generate on streets & parks"), then reviews them: drag a pin
 * to nudge it, click a pin to remove it, click the map to add one. The curated
 * points are baked into the beat and written verbatim at play time — no network
 * or sensor needed. Reuses the Leaflet setup from XRMapEditor.
 */

import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import leafletCss from 'leaflet/dist/leaflet.css?inline';
import { sampleWalkablePoints, type GeoPoint } from '@asaps/core';

interface GpsPointCuratorProps {
  points: GeoPoint[];
  onChange: (next: GeoPoint[]) => void;
  /** Fallback center when there are no points yet (project origin, etc.). */
  defaultCenter?: { lat: number; lng: number };
}

const STYLE_ID = 'asaps-leaflet-core';
function ensureLeafletStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = leafletCss;
  document.head.appendChild(el);
}

const CENTER_ICON = L.divIcon({
  html: '<div style="width:22px;height:22px;background:#2563eb;border:3px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.4);cursor:grab"></div>',
  className: '', iconSize: [22, 22], iconAnchor: [11, 11],
});
const POINT_ICON = L.divIcon({
  html: '<div style="width:16px;height:16px;background:#f59e0b;border:2px solid white;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.4);cursor:grab"></div>',
  className: '', iconSize: [16, 16], iconAnchor: [8, 8],
});

export const GpsPointCurator: React.FC<GpsPointCuratorProps> = ({ points, onChange, defaultCenter }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const centerMarkerRef = useRef<L.Marker | null>(null);
  const ringRef = useRef<L.Circle | null>(null);
  const pointMarkersRef = useRef<L.Marker[]>([]);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const pointsRef = useRef(points);
  pointsRef.current = points;

  const [radius, setRadius] = useState(300);
  const [count, setCount] = useState(8);
  const [pointRadius, setPointRadius] = useState(15);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [center, setCenter] = useState<{ lat: number; lng: number }>(() => {
    const first = points.find(p => typeof p.lat === 'number' && typeof p.lng === 'number');
    return first ? { lat: first.lat, lng: first.lng } : (defaultCenter ?? { lat: 51.5074, lng: -0.1278 });
  });
  const centerRef = useRef(center);
  centerRef.current = center;
  const radiusRef = useRef(radius);
  radiusRef.current = radius;

  // Init map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    ensureLeafletStyle();
    const map = L.map(containerRef.current, { center: [center.lat, center.lng], zoom: 15, zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors', maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;

    const ring = L.circle([center.lat, center.lng], { radius, color: '#2563eb', fillColor: '#2563eb', fillOpacity: 0.06, weight: 1.5, dashArray: '4 4' }).addTo(map);
    ringRef.current = ring;
    const cm = L.marker([center.lat, center.lng], { icon: CENTER_ICON, draggable: true, title: 'Scatter center' }).addTo(map);
    cm.on('drag', (e: any) => ringRef.current?.setLatLng(e.target.getLatLng()));
    cm.on('dragend', (e: any) => { const ll = e.target.getLatLng(); setCenter({ lat: ll.lat, lng: ll.lng }); });
    centerMarkerRef.current = cm;

    // Click empty map → add a point there.
    map.on('click', (e: L.LeafletMouseEvent) => {
      onChangeRef.current([...pointsRef.current, { lat: e.latlng.lat, lng: e.latlng.lng }]);
    });

    const raf = window.requestAnimationFrame(() => map.invalidateSize());
    const settle = window.setTimeout(() => map.invalidateSize(), 250);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => map.invalidateSize()) : null;
    if (ro && containerRef.current) ro.observe(containerRef.current);
    return () => {
      window.cancelAnimationFrame(raf); window.clearTimeout(settle); ro?.disconnect();
      try { map.remove(); } catch { /* ignore */ }
      mapRef.current = null; pointMarkersRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep center marker + ring in sync with state.
  useEffect(() => {
    centerMarkerRef.current?.setLatLng([center.lat, center.lng]);
    ringRef.current?.setLatLng([center.lat, center.lng]);
  }, [center]);
  useEffect(() => { ringRef.current?.setRadius(radius); }, [radius]);

  // Re-render point markers whenever the points change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const m of pointMarkersRef.current) m.remove();
    pointMarkersRef.current = [];
    points.forEach((p, i) => {
      if (typeof p.lat !== 'number' || typeof p.lng !== 'number') return;
      const marker = L.marker([p.lat, p.lng], { icon: POINT_ICON, draggable: true, title: `Point ${i + 1} — click to remove` }).addTo(map);
      marker.on('dragend', (e: any) => {
        const ll = e.target.getLatLng();
        onChangeRef.current(pointsRef.current.map((x, j) => (j === i ? { ...x, lat: ll.lat, lng: ll.lng } : x)));
      });
      marker.on('click', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        onChangeRef.current(pointsRef.current.filter((_, j) => j !== i));
      });
      pointMarkersRef.current.push(marker);
    });
  }, [points]);

  const generate = async () => {
    setBusy(true);
    setStatus('Looking up streets & parks…');
    try {
      const pts = await sampleWalkablePoints(centerRef.current, radiusRef.current, count, {
        perPointRadius: pointRadius > 0 ? pointRadius : undefined,
      });
      if (pts.length === 0) {
        setStatus('No walkable streets/parks found nearby (or the lookup failed). Try a bigger radius or add points by clicking the map.');
      } else {
        onChange(pts);
        setStatus(pts.length < count
          ? `Placed ${pts.length} of ${count} on streets/parks — OSM coverage here is thin. Add the rest by clicking the map.`
          : `Placed ${pts.length} points on streets/parks. Drag to nudge, click to remove.`);
      }
    } catch {
      setStatus('Lookup failed — check your connection, or add points by clicking the map.');
    } finally {
      setBusy(false);
    }
  };

  const numInput = 'w-14 px-1 py-0.5 text-xs border border-gray-300 rounded tabular-nums';
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
        <label className="flex items-center gap-1">Radius (m)
          <input type="number" min="10" step="10" value={radius} onChange={e => setRadius(Math.max(10, parseInt(e.target.value) || 0))} className={numInput} />
        </label>
        <label className="flex items-center gap-1">Count
          <input type="number" min="1" step="1" value={count} onChange={e => setCount(Math.max(1, parseInt(e.target.value) || 1))} className={numInput} />
        </label>
        <label className="flex items-center gap-1">Point radius (m)
          <input type="number" min="0" step="5" value={pointRadius} onChange={e => setPointRadius(Math.max(0, parseInt(e.target.value) || 0))} className={numInput} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={generate} disabled={busy}
          className="px-2 py-1 text-xs rounded bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50">
          {busy ? 'Generating…' : '📍 Generate on streets & parks'}
        </button>
        <button onClick={() => onChange([...points, { lat: center.lat, lng: center.lng }])}
          className="px-2 py-1 text-xs rounded border border-gray-300 hover:bg-gray-50">+ Add at center</button>
        {points.length > 0 && (
          <button onClick={() => onChange([])} className="px-2 py-1 text-xs rounded border border-gray-300 text-gray-500 hover:bg-gray-50">Clear</button>
        )}
        <span className="text-xs text-gray-500 ml-auto">{points.length} point{points.length === 1 ? '' : 's'}</span>
      </div>
      <div ref={containerRef} style={{ height: 260, width: '100%', borderRadius: 6, overflow: 'hidden', border: '1px solid #e5e7eb' }} />
      {status && <p className="text-xs text-gray-500">{status}</p>}
      <p className="text-[11px] text-gray-400">Drag the blue center to move the scatter area. Drag a point to nudge it, click a point to remove it, or click empty map to add one.</p>
    </div>
  );
};
