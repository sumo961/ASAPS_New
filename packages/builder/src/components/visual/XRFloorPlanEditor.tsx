/**
 * XRFloorPlanEditor (v0.9.49+) — Visual Editor for IndoorLocationBeat.
 *
 * Beat-level model: each indoor beat carries its own floor plan + dimensions,
 * and each location has its own (x, y) on that floor plan. Locations
 * reference physical beacons by UUID (for runtime proximity matching),
 * but the visual position is per-beat — the same beacon can appear at
 * different x/y on different beats' floor plans.
 *
 * Interactions:
 *   - Click empty floor plan → adds a new location at that point with
 *     an auto-name and empty beaconUuid; author picks the beacon in
 *     Properties.
 *   - Drag a location marker → updates its x/y on this beat.
 *   - Click a location marker → selects it; Inspector pans to its row.
 *   - Selection sync via window CustomEvents (matches XRMapEditor).
 *
 * Data scope is purely beat-level. Project-venue settings provide the
 * floor plan / dimensions when this beat hasn't overridden them.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Wifi, Plus, Maximize2 } from 'lucide-react';

interface XRLocation {
  id: string;
  name?: string;
  beaconUuid?: string;
  x?: number;
  y?: number;
  radiusMeters?: number;
  target?: string;
  effects?: any[];
}

/** Compute the next "Location N" auto-name. */
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

function makeLocId(): string {
  return `loc_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

interface XRFloorPlanEditorProps {
  /** This beat's location entries. */
  locations: XRLocation[];
  /** Beat-level radius default. */
  beatRadiusMeters?: number;
  projectDefaultRadius?: number;
  /** Floor-plan dimensions in metres + resolved image URL. */
  venue?: { name?: string; floorPlanUrl?: string; floorWidth: number; floorHeight: number };
  /** Update this beat's locations. */
  onLocationsChange: (next: XRLocation[]) => void;
}

export const XRFloorPlanEditor: React.FC<XRFloorPlanEditorProps> = ({
  locations,
  beatRadiusMeters,
  projectDefaultRadius,
  venue,
  onLocationsChange,
}) => {
  const fallbackRadius = beatRadiusMeters ?? projectDefaultRadius ?? 5;
  const floorWidth = venue?.floorWidth ?? 20;
  const floorHeight = venue?.floorHeight ?? 20;

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [selectedLocId, setSelectedLocId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ locId: string; pointerId: number } | null>(null);

  // Refs so window-event handlers see the latest values.
  const locationsRef = useRef(locations);
  locationsRef.current = locations;
  const onLocationsChangeRef = useRef(onLocationsChange);
  onLocationsChangeRef.current = onLocationsChange;

  const selectedLoc = useMemo(
    () => locations.find((l) => l.id === selectedLocId) || null,
    [locations, selectedLocId],
  );

  // Inspector → VE focus events.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { id: string } | undefined;
      if (!detail?.id) return;
      setSelectedLocId(detail.id);
    };
    window.addEventListener('asaps:xr-focus-location', handler);
    return () => window.removeEventListener('asaps:xr-focus-location', handler);
  }, []);

  const announceSelection = (id: string | null) => {
    setSelectedLocId(id);
    if (id) {
      try {
        window.dispatchEvent(new CustomEvent('asaps:xr-location-selected', { detail: { id } }));
      } catch { /* ignore */ }
    }
  };

  // Convert a pointer event to floor-plan metric coords.
  const eventToMetres = (e: React.PointerEvent | PointerEvent): { x: number; y: number } | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = (e as any).clientX;
    pt.y = (e as any).clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const transformed = pt.matrixTransform(ctm.inverse());
    return { x: transformed.x, y: transformed.y };
  };

  // Pointer-move while dragging a marker — update the location's own x/y.
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const pos = eventToMetres(e);
      if (!pos) return;
      const clamped = {
        x: Math.max(0, Math.min(floorWidth, pos.x)),
        y: Math.max(0, Math.min(floorHeight, pos.y)),
      };
      onLocationsChangeRef.current(
        locationsRef.current.map((l) => l.id === dragging.locId ? { ...l, ...clamped } : l),
      );
    };
    const onUp = () => setDragging(null);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragging, floorWidth, floorHeight]);

  const onMarkerPointerDown = (e: React.PointerEvent, locId: string) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDragging({ locId, pointerId: e.pointerId });
  };
  const onMarkerClick = (e: React.MouseEvent, locId: string) => {
    e.stopPropagation();
    announceSelection(locId);
  };

  /** Click empty floor plan → add new location at click point. */
  const onSvgClick = (e: React.MouseEvent) => {
    if (dragging) return;
    const pos = eventToMetres(e as any);
    if (!pos) return;
    const fresh: XRLocation = {
      id: makeLocId(),
      name: nextLocationName(locationsRef.current),
      x: Math.max(0, Math.min(floorWidth, pos.x)),
      y: Math.max(0, Math.min(floorHeight, pos.y)),
      target: '',
    };
    onLocationsChange([...locations, fresh]);
    announceSelection(fresh.id);
  };

  const addAtCentre = () => {
    const fresh: XRLocation = {
      id: makeLocId(),
      name: nextLocationName(locationsRef.current),
      x: floorWidth / 2,
      y: floorHeight / 2,
      target: '',
    };
    onLocationsChange([...locations, fresh]);
    announceSelection(fresh.id);
  };

  // Stroke widths scale with floor dimensions for consistent look.
  const strokeMain = Math.max(0.05, floorWidth / 400);
  const strokeFine = Math.max(0.03, floorWidth / 600);
  const dotR = Math.max(0.2, floorWidth / 150);
  const haloR = Math.max(0.4, floorWidth / 80);
  const labelSize = Math.max(0.4, floorWidth / 50);

  const radiusFor = (loc: XRLocation) => loc.radiusMeters ?? fallbackRadius;

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16, background: '#0f172a',
        }}
      >
        <div
          style={{
            background: 'white',
            aspectRatio: `${floorWidth} / ${floorHeight}`,
            width: 'min(95%, 1200px)',
            maxHeight: '100%',
            position: 'relative',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            borderRadius: 8,
            overflow: 'hidden',
          }}
        >
          {venue?.floorPlanUrl && (
            <img
              src={venue.floorPlanUrl}
              alt={venue.name || 'Floor plan'}
              style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%',
                objectFit: 'contain', pointerEvents: 'none',
              }}
            />
          )}
          <svg
            ref={svgRef}
            viewBox={`0 0 ${floorWidth} ${floorHeight}`}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'crosshair' }}
            preserveAspectRatio="xMidYMid meet"
            onClick={onSvgClick}
          >
            {locations.map((loc) => {
              if (loc.x === undefined || loc.y === undefined) return null;
              const isSelected = loc.id === selectedLocId;
              return (
                <g key={loc.id}>
                  <circle
                    cx={loc.x}
                    cy={loc.y}
                    r={radiusFor(loc)}
                    fill={isSelected ? 'rgba(22,163,74,0.10)' : 'rgba(220,38,38,0.10)'}
                    stroke={isSelected ? '#16a34a' : '#dc2626'}
                    strokeWidth={strokeMain}
                    strokeDasharray={`${floorWidth / 100} ${floorWidth / 200}`}
                    pointerEvents="none"
                  />
                  <circle
                    cx={loc.x}
                    cy={loc.y}
                    r={haloR}
                    fill={isSelected ? 'rgba(22,163,74,0.25)' : 'rgba(220,38,38,0.25)'}
                    pointerEvents="none"
                  />
                  <circle
                    cx={loc.x}
                    cy={loc.y}
                    r={dotR}
                    fill={isSelected ? '#16a34a' : '#dc2626'}
                    stroke="#fff"
                    strokeWidth={strokeFine}
                    style={{ cursor: dragging ? 'grabbing' : 'grab' }}
                    onPointerDown={(e) => onMarkerPointerDown(e, loc.id)}
                    onClick={(e) => onMarkerClick(e, loc.id)}
                  />
                  {loc.name && (
                    <text
                      x={loc.x}
                      y={loc.y - haloR - labelSize * 0.2}
                      fontSize={labelSize}
                      fill={isSelected ? '#15803d' : '#1f2937'}
                      textAnchor="middle"
                      style={{
                        paintOrder: 'stroke',
                        stroke: 'white',
                        strokeWidth: floorWidth / 200,
                        pointerEvents: 'none',
                      }}
                    >
                      {loc.name}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Top-left HUD */}
      <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 10 }}>
        <div className="bg-white/95 shadow-md rounded-lg px-3 py-2 text-xs space-y-1.5">
          <div className="flex items-center gap-2 font-medium text-gray-800">
            <Wifi className="w-3.5 h-3.5 text-red-600" />
            {locations.length} location{locations.length === 1 ? '' : 's'}
            <span className="text-gray-400">·</span>
            <span className="text-gray-600">
              {floorWidth}m × {floorHeight}m
            </span>
          </div>
          <div className="text-gray-600">
            Click empty floor to add. Drag markers to move. Edit names, beacon UUIDs, targets, and effects in Properties.
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={addAtCentre}
              className="text-xs px-2 py-0.5 bg-blue-600 text-white rounded hover:bg-blue-700 inline-flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              Add at centre
            </button>
          </div>
        </div>
      </div>

      {/* Top-right selection pill */}
      {selectedLoc && (
        <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 10 }}>
          <div className="bg-green-50 border border-green-300 shadow-md rounded-lg px-3 py-1.5 text-xs">
            <span className="font-medium text-green-900">Selected:</span>{' '}
            <span className="text-green-800">{selectedLoc.name || '(unnamed)'}</span>
          </div>
        </div>
      )}
    </div>
  );
};
