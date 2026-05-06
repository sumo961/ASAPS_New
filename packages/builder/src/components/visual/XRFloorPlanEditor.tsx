/**
 * XRFloorPlanEditor (v0.9.49+) — Visual Editor for IndoorLocationBeat.
 *
 * SVG-based authoring surface that renders the project's floor plan
 * with venue beacons as draggable dots. Beacons referenced by this
 * beat's locations are highlighted (red halo + radius ring); other
 * venue beacons are grey "available" dots.
 *
 * Two scopes mixed in one canvas:
 *   - Beacon positions (x/y in metres) are venue-level — dragging
 *     a beacon updates globalSettings.location.venue.beacons[i] and
 *     affects every indoor beat that references that beacon.
 *   - Location selection + per-location radius are beat-level — only
 *     this beat changes when the author edits them.
 *
 * Click a grey beacon → adds it to this beat's locations.
 * Click a red beacon → opens the inline panel (name / target / radius / delete).
 * Drag any beacon → updates venue position (with a small "venue-level" badge).
 * "Add new beacon" button → creates a venue beacon at the floor-plan
 *   centre with a generated UUID and adds it as a location.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Wifi, Plus } from 'lucide-react';

/** Compute the next "Location N" auto-name. Same logic as the GPS editor. */
function nextLocationName(locations: Array<{ name?: string }>): string {
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

interface XRLocation {
  id: string;
  name?: string;
  beaconUuid?: string;
  radiusMeters?: number;
  target?: string;
  effects?: any[];
}

interface VenueBeacon {
  uuid: string;
  displayName?: string;
  x: number;
  y: number;
}

interface XRFloorPlanEditorProps {
  /** This beat's location entries. */
  locations: XRLocation[];
  /** Beat-level radius default. */
  beatRadiusMeters?: number;
  projectDefaultRadius?: number;
  /** All venue beacons (project-level). */
  venueBeacons: VenueBeacon[];
  /** Floor-plan dimensions in metres + resolved image URL. */
  venue?: { name?: string; floorPlanUrl?: string; floorWidth: number; floorHeight: number };
  /** Update this beat's locations. */
  onLocationsChange: (next: XRLocation[]) => void;
  /** Update the venue's beacons array (project-level). */
  onVenueBeaconsChange: (next: VenueBeacon[]) => void;
}

function makeLocId(): string {
  return `loc_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}
function makeUuid(): string {
  if (typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function') {
    return (crypto as any).randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const XRFloorPlanEditor: React.FC<XRFloorPlanEditorProps> = ({
  locations,
  beatRadiusMeters,
  projectDefaultRadius,
  venueBeacons,
  venue,
  onLocationsChange,
  onVenueBeaconsChange,
}) => {
  const fallbackRadius = beatRadiusMeters ?? projectDefaultRadius ?? 5;
  const floorWidth = venue?.floorWidth ?? 20;
  const floorHeight = venue?.floorHeight ?? 20;

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [selectedLocId, setSelectedLocId] = useState<string | null>(null);
  // Drag state — null when not dragging.
  const [dragging, setDragging] = useState<{ uuid: string; pointerId: number } | null>(null);
  // Latest locations + venueBeacons in refs so window-event handlers always
  // see the current values without re-binding.
  const locationsRef = useRef(locations);
  locationsRef.current = locations;

  const targetBeaconUuids = useMemo(
    () => new Set(locations.map((l) => l.beaconUuid).filter((x): x is string => !!x)),
    [locations],
  );

  const selectedLoc = locations.find((l) => l.id === selectedLocId) || null;
  const selectedBeacon = selectedLoc?.beaconUuid
    ? venueBeacons.find((b) => b.uuid === selectedLoc.beaconUuid)
    : null;

  // Inspector → VE focus events. Same protocol as XRMapEditor.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { id: string } | undefined;
      if (!detail?.id) return;
      setSelectedLocId(detail.id);
    };
    window.addEventListener('asaps:xr-focus-location', handler);
    return () => window.removeEventListener('asaps:xr-focus-location', handler);
  }, []);

  // Helper to dispatch VE → Inspector selection.
  const announceSelection = (id: string | null) => {
    setSelectedLocId(id);
    if (id) {
      try {
        window.dispatchEvent(new CustomEvent('asaps:xr-location-selected', { detail: { id } }));
      } catch { /* ignore */ }
    }
  };

  // Convert mouse-event client coords to floor-plan metric coords.
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

  // Pointer-move while dragging — update venue beacon position live.
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const pos = eventToMetres(e);
      if (!pos) return;
      const clamped = {
        x: Math.max(0, Math.min(floorWidth, pos.x)),
        y: Math.max(0, Math.min(floorHeight, pos.y)),
      };
      onVenueBeaconsChange(
        venueBeacons.map((b) => b.uuid === dragging.uuid ? { ...b, ...clamped } : b),
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
  }, [dragging, venueBeacons, onVenueBeaconsChange, floorWidth, floorHeight]);

  const onBeaconPointerDown = (e: React.PointerEvent, uuid: string) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDragging({ uuid, pointerId: e.pointerId });
  };
  const onBeaconClick = (e: React.MouseEvent, beacon: VenueBeacon) => {
    e.stopPropagation();
    if (targetBeaconUuids.has(beacon.uuid)) {
      // Already a location — select it (and broadcast to Inspector)
      const loc = locations.find((l) => l.beaconUuid === beacon.uuid);
      if (loc) announceSelection(loc.id);
    } else {
      // Add as a new location with auto-name; the beacon's display name
      // is preferred over a generic "Location N" so the row is recognizable.
      const fresh: XRLocation = {
        id: makeLocId(),
        name: beacon.displayName || nextLocationName(locationsRef.current),
        beaconUuid: beacon.uuid,
        target: '',
      };
      onLocationsChange([...locations, fresh]);
      announceSelection(fresh.id);
    }
  };
  const addNewBeaconAtCentre = () => {
    const uuid = makeUuid();
    const newBeacon: VenueBeacon = {
      uuid,
      displayName: `Beacon ${venueBeacons.length + 1}`,
      x: floorWidth / 2,
      y: floorHeight / 2,
    };
    onVenueBeaconsChange([...venueBeacons, newBeacon]);
    const fresh: XRLocation = {
      id: makeLocId(),
      name: newBeacon.displayName,
      beaconUuid: uuid,
      target: '',
    };
    onLocationsChange([...locations, fresh]);
    announceSelection(fresh.id);
  };

  const radiusFor = (loc: XRLocation) => loc.radiusMeters ?? fallbackRadius;

  // Stroke widths scale with floor width so they look consistent at any aspect.
  const strokeMain = Math.max(0.05, floorWidth / 400);
  const strokeFine = Math.max(0.03, floorWidth / 600);
  const dotR = Math.max(0.2, floorWidth / 150);
  const haloR = Math.max(0.4, floorWidth / 80);
  const greyDotR = Math.max(0.15, floorWidth / 200);
  const labelSize = Math.max(0.4, floorWidth / 50);

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
      <div style={{ flex: 1, minWidth: 0, height: '100%', position: 'relative', background: '#0f172a' }}>
        {/* Floor plan + beacons SVG */}
        <div
          style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
          }}
        >
          {venueBeacons.length === 0 ? (
            <div className="text-center text-amber-50 bg-amber-900/40 border border-amber-600 rounded-lg p-6 max-w-md">
              <div className="font-medium mb-2">No venue beacons configured yet</div>
              <div className="text-xs text-amber-100">
                Add beacons here or in Project Settings → Location & XR → Indoor venue.
              </div>
              <button
                type="button"
                onClick={addNewBeaconAtCentre}
                className="mt-3 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 inline-flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                Add first beacon
              </button>
            </div>
          ) : (
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
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'default' }}
                preserveAspectRatio="xMidYMid meet"
              >
                {/* Per-target radius rings */}
                {locations.map((loc) => {
                  const beacon = venueBeacons.find((b) => b.uuid === loc.beaconUuid);
                  if (!beacon) return null;
                  return (
                    <circle
                      key={`ring-${loc.id}`}
                      cx={beacon.x}
                      cy={beacon.y}
                      r={radiusFor(loc)}
                      fill={loc.id === selectedLocId ? 'rgba(22,163,74,0.10)' : 'rgba(220,38,38,0.10)'}
                      stroke={loc.id === selectedLocId ? '#16a34a' : '#dc2626'}
                      strokeWidth={strokeMain}
                      strokeDasharray={`${floorWidth / 100} ${floorWidth / 200}`}
                      pointerEvents="none"
                    />
                  );
                })}

                {/* Beacons. Order: grey first, red on top so they're easier to grab. */}
                {venueBeacons.filter((b) => !targetBeaconUuids.has(b.uuid)).map((beacon) => (
                  <g key={`grey-${beacon.uuid}`}>
                    <circle
                      cx={beacon.x}
                      cy={beacon.y}
                      r={greyDotR}
                      fill="#94a3b8"
                      stroke="#fff"
                      strokeWidth={strokeFine}
                      style={{ cursor: dragging ? 'grabbing' : 'grab' }}
                      onPointerDown={(e) => onBeaconPointerDown(e, beacon.uuid)}
                      onClick={(e) => onBeaconClick(e, beacon)}
                    />
                    {beacon.displayName && (
                      <text
                        x={beacon.x}
                        y={beacon.y - greyDotR - labelSize * 0.3}
                        fontSize={labelSize * 0.7}
                        fill="#475569"
                        textAnchor="middle"
                        style={{ paintOrder: 'stroke', stroke: 'white', strokeWidth: floorWidth / 400, pointerEvents: 'none' }}
                      >
                        {beacon.displayName}
                      </text>
                    )}
                  </g>
                ))}
                {venueBeacons.filter((b) => targetBeaconUuids.has(b.uuid)).map((beacon) => {
                  const loc = locations.find((l) => l.beaconUuid === beacon.uuid);
                  const isSelected = loc?.id === selectedLocId;
                  return (
                    <g key={`target-${beacon.uuid}`}>
                      <circle
                        cx={beacon.x}
                        cy={beacon.y}
                        r={haloR}
                        fill={isSelected ? 'rgba(22,163,74,0.25)' : 'rgba(220,38,38,0.25)'}
                        pointerEvents="none"
                      />
                      <circle
                        cx={beacon.x}
                        cy={beacon.y}
                        r={dotR}
                        fill={isSelected ? '#16a34a' : '#dc2626'}
                        stroke="#fff"
                        strokeWidth={strokeMain}
                        style={{ cursor: dragging ? 'grabbing' : 'grab' }}
                        onPointerDown={(e) => onBeaconPointerDown(e, beacon.uuid)}
                        onClick={(e) => onBeaconClick(e, beacon)}
                      />
                      {(loc?.name || beacon.displayName) && (
                        <text
                          x={beacon.x}
                          y={beacon.y - haloR - labelSize * 0.2}
                          fontSize={labelSize}
                          fill="#1f2937"
                          textAnchor="middle"
                          style={{ paintOrder: 'stroke', stroke: 'white', strokeWidth: floorWidth / 200, pointerEvents: 'none' }}
                        >
                          {loc?.name || beacon.displayName}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
          )}
        </div>

        {/* Top-left HUD: counts + add beacon button */}
        <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 10 }}>
          <div className="bg-white/95 shadow-md rounded-lg px-3 py-2 text-xs space-y-1">
            <div className="flex items-center gap-2 font-medium text-gray-800">
              <Wifi className="w-3.5 h-3.5 text-red-600" />
              {locations.length} location{locations.length === 1 ? '' : 's'}
              <span className="text-gray-400">·</span>
              <span className="text-gray-600">{venueBeacons.length} venue beacon{venueBeacons.length === 1 ? '' : 's'}</span>
            </div>
            <div className="text-gray-600">
              Click a grey beacon to add it. Drag any beacon to reposition.
            </div>
            <button
              type="button"
              onClick={addNewBeaconAtCentre}
              className="text-xs px-2 py-0.5 bg-blue-600 text-white rounded hover:bg-blue-700 inline-flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              Add new beacon
            </button>
          </div>
        </div>
      </div>

      {/* Top-right HUD — selection indicator. The full edit form lives in
          the Properties tab; this is just a "you're editing X" pill. */}
      {selectedLoc && (
        <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 10 }}>
          <div className="bg-green-50 border border-green-300 shadow-md rounded-lg px-3 py-1.5 text-xs">
            <span className="font-medium text-green-900">Selected:</span>{' '}
            <span className="text-green-800">
              {selectedLoc.name || selectedBeacon?.displayName || '(unnamed)'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
