/**
 * IndoorMapBeat (v0.9.49+) — multi-location renderer for IndoorLocationBeat.
 *
 * Each location entry references a beacon UUID; the renderer looks the
 * beacon up in the venue.beacons list (authored at the project level)
 * and places a halo + radius ring on the floor plan at that beacon's
 * x/y. In trigger modes the first crossing wins — its `id` is reported
 * back so the runtime can fire that location's specific Effects and
 * advance to its target.
 *
 * Player position is intentionally not rendered — without trilateration
 * we can't pinpoint the player on the floor plan reliably. The status
 * bar shows distance to the closest target as the primary feedback.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Wifi, ChevronRight, X } from 'lucide-react';

interface IndoorLocationEntry {
  id: string;
  name?: string;
  beaconUuid: string;
  /** Floor-plan position in metres from the top-left (v0.9.49+). */
  x: number;
  y: number;
  radiusMeters: number;
}

interface IndoorMapBeatProps {
  mode: 'display' | 'trigger-on-arrival' | 'trigger-on-departure';
  locations: IndoorLocationEntry[];
  text?: string;
  buttonText?: string;
  cancelButtonText?: string;
  timeoutMs?: number;
  venue?: {
    name?: string;
    floorPlanUrl?: string;
    floorWidth: number;
    floorHeight: number;
  };
  sensorService?: any;
  onResolve: (resolution: {
    path: 'arrived' | 'departed' | 'continue' | 'timeout' | 'skipped';
    locationId?: string;
  }) => void;
}

export const IndoorMapBeat: React.FC<IndoorMapBeatProps> = ({
  mode,
  locations,
  text,
  buttonText = 'Continue',
  cancelButtonText,
  timeoutMs,
  venue,
  sensorService,
  onResolve,
}) => {
  const [resolved, setResolved] = useState(false);
  const resolvedRef = useRef(false);
  const onResolveRef = useRef(onResolve);
  onResolveRef.current = onResolve;

  /** Map of beaconUuid → live distance (m) or null when not seen. */
  const [distances, setDistances] = useState<Record<string, number | null>>({});

  // The set of UUIDs we care about for distance tracking.
  const watchedUuids = useMemo(
    () => new Set(locations.map((l) => l.beaconUuid)),
    [locations],
  );

  // Subscribe to live beacon scan readings.
  useEffect(() => {
    if (!sensorService?.scanBeacons) return;
    const unsub = sensorService.scanBeacons((readings: Array<{ uuid: string; distance?: number; rssi?: number }>) => {
      const next: Record<string, number | null> = {};
      for (const uuid of watchedUuids) {
        const r = readings.find((x) => x.uuid === uuid);
        if (!r) {
          next[uuid] = null;
          continue;
        }
        if (typeof r.distance === 'number') {
          next[uuid] = r.distance;
        } else if (typeof r.rssi === 'number') {
          // Standard log-distance path-loss with n=2 and refRssi -59dBm @ 1m.
          next[uuid] = Math.pow(10, (-59 - r.rssi) / 20);
        } else {
          next[uuid] = null;
        }
      }
      setDistances(next);
    });
    return unsub;
  }, [sensorService, watchedUuids]);

  // Threshold-crossing detection: first matching location wins.
  useEffect(() => {
    if (mode === 'display' || resolvedRef.current) return;
    for (const loc of locations) {
      const d = distances[loc.beaconUuid];
      if (d === null || d === undefined) continue;
      const within = d <= loc.radiusMeters;
      if (mode === 'trigger-on-arrival' && within) {
        resolvedRef.current = true;
        setResolved(true);
        onResolveRef.current({ path: 'arrived', locationId: loc.id });
        return;
      }
      if (mode === 'trigger-on-departure' && !within) {
        resolvedRef.current = true;
        setResolved(true);
        onResolveRef.current({ path: 'departed', locationId: loc.id });
        return;
      }
    }
  }, [distances, locations, mode]);

  useEffect(() => {
    if (!timeoutMs || resolvedRef.current) return;
    const handle = window.setTimeout(() => {
      if (resolvedRef.current) return;
      resolvedRef.current = true;
      setResolved(true);
      onResolveRef.current({ path: 'timeout' });
    }, timeoutMs);
    return () => window.clearTimeout(handle);
  }, [timeoutMs]);

  if (resolved) return null;

  const floorWidth = venue?.floorWidth ?? 20;
  const floorHeight = venue?.floorHeight ?? 20;

  const handleContinue = () => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    setResolved(true);
    onResolveRef.current({ path: 'continue' });
  };
  const handleSkip = () => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    setResolved(true);
    onResolveRef.current({ path: 'skipped' });
  };

  // Find the closest in-distance location for the status bar.
  const closest = locations
    .map((l) => ({ loc: l, distance: distances[l.beaconUuid] ?? null }))
    .filter((x) => x.distance !== null)
    .sort((a, b) => (a.distance! - b.distance!))[0];

  return (
    <div className="w-full h-full flex flex-col bg-gray-50">
      {text && (
        <div className="px-4 py-3 bg-slate-900 text-white text-sm font-medium text-center">
          {text}
        </div>
      )}

      <div className="flex-1 relative flex items-center justify-center p-4 overflow-hidden">
        {locations.length === 0 ? (
          <div className="text-center text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-6 max-w-md">
            <div className="font-medium mb-2">No locations configured</div>
            <div className="text-xs">Add locations to this beat in the Properties tab.</div>
          </div>
        ) : (
          <div
            className="relative bg-white shadow-md rounded-lg overflow-hidden"
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              aspectRatio: `${floorWidth} / ${floorHeight}`,
              width: 'min(80vw, 800px)',
            }}
          >
            {venue?.floorPlanUrl && (
              <img
                src={venue.floorPlanUrl}
                alt={venue.name || 'Floor plan'}
                className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                style={{ imageRendering: 'auto' }}
              />
            )}
            <svg
              viewBox={`0 0 ${floorWidth} ${floorHeight}`}
              className="absolute inset-0 w-full h-full"
              preserveAspectRatio="xMidYMid meet"
            >
              {/* Per-target: radius ring + halo + dot. Each location
                  carries its own (x, y) on this beat's floor plan. */}
              {locations.map((loc) => (
                <g key={loc.id}>
                  <circle
                    cx={loc.x}
                    cy={loc.y}
                    r={loc.radiusMeters}
                    fill="rgba(220, 38, 38, 0.10)"
                    stroke="#dc2626"
                    strokeWidth={Math.max(0.05, floorWidth / 400)}
                    strokeDasharray={`${floorWidth / 100} ${floorWidth / 200}`}
                  />
                  <circle
                    cx={loc.x}
                    cy={loc.y}
                    r={Math.max(0.4, floorWidth / 80)}
                    fill="rgba(220, 38, 38, 0.25)"
                  />
                  <circle
                    cx={loc.x}
                    cy={loc.y}
                    r={Math.max(0.2, floorWidth / 150)}
                    fill="#dc2626"
                    stroke="#fff"
                    strokeWidth={Math.max(0.04, floorWidth / 500)}
                  />
                  {loc.name && (
                    <text
                      x={loc.x}
                      y={loc.y - Math.max(0.6, floorWidth / 60)}
                      fontSize={Math.max(0.4, floorWidth / 50)}
                      fill="#1f2937"
                      textAnchor="middle"
                      style={{ paintOrder: 'stroke', stroke: 'white', strokeWidth: floorWidth / 200 }}
                    >
                      {loc.name}
                    </text>
                  )}
                </g>
              ))}
            </svg>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="px-4 py-2 bg-white border-t flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 text-gray-700">
          <Wifi className="w-4 h-4 text-red-600" />
          {!closest ? (
            <span className="text-gray-500">Searching for beacons…</span>
          ) : (
            <span>
              <span className="font-medium">
                {closest.loc.name || 'Target'}:
              </span>{' '}
              <span className={closest.distance! <= closest.loc.radiusMeters ? 'text-green-700 font-medium' : 'text-gray-700'}>
                {closest.distance!.toFixed(1)} m away
              </span>
              {closest.distance! <= closest.loc.radiusMeters && (
                <span className="ml-2 text-xs text-green-700">in range</span>
              )}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {cancelButtonText && (
            <button
              type="button"
              onClick={handleSkip}
              className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 text-gray-700 inline-flex items-center gap-1"
            >
              <X className="w-3 h-3" />
              {cancelButtonText}
            </button>
          )}
          {mode === 'display' && (
            <button
              type="button"
              onClick={handleContinue}
              className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 inline-flex items-center gap-1"
            >
              {buttonText}
              <ChevronRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
