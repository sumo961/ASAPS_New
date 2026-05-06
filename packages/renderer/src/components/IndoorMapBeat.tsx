/**
 * IndoorMapBeat (v0.9.49+) — renderer for IndoorLocationBeat.
 *
 * Shows an indoor floor plan with all authored beacons rendered as dots
 * (the target beacon highlighted with a halo + radius ring). Distance
 * to the target beacon is read from the SensorService's beacon-cache
 * and displayed live; in trigger modes the beat resolves automatically
 * when the player walks within / out of the radius.
 *
 * Player position is intentionally not rendered — without trilateration
 * we can't pinpoint the player on the floor plan accurately. Future
 * v3 work could derive a player position from the closest beacon's
 * coordinates or a weighted centroid; for v2 the distance number is
 * the primary feedback.
 *
 * Coordinate system: floor plan x/y are in metres from the top-left
 * corner. We render into a fixed-aspect SVG viewBox sized to the
 * venue's floorWidth × floorHeight, so all beacon positions map
 * directly to viewBox units. The SVG scales to fit its container.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Wifi, ChevronRight, X } from 'lucide-react';

interface IndoorMapBeatProps {
  mode: 'display' | 'trigger-on-arrival' | 'trigger-on-departure';
  targetBeaconUuid: string;
  radiusMeters: number;
  text?: string;
  buttonText?: string;
  cancelButtonText?: string;
  timeoutMs?: number;
  venue?: {
    name?: string;
    floorPlanUrl?: string;          // resolved blob/http URL of the floor-plan image
    floorWidth: number;
    floorHeight: number;
  };
  beacons?: Array<{ uuid: string; displayName?: string; x: number; y: number }>;
  /** SensorService — passed via renderer state. */
  sensorService?: any;
  onResolve: (path: 'arrived' | 'departed' | 'continue' | 'timeout' | 'skipped') => void;
}

export const IndoorMapBeat: React.FC<IndoorMapBeatProps> = ({
  mode,
  targetBeaconUuid,
  radiusMeters,
  text,
  buttonText = 'Continue',
  cancelButtonText,
  timeoutMs,
  venue,
  beacons = [],
  sensorService,
  onResolve,
}) => {
  const [resolved, setResolved] = useState(false);
  const resolvedRef = useRef(false);
  const onResolveRef = useRef(onResolve);
  onResolveRef.current = onResolve;

  // Latest distance reading to the target beacon (m, or null when unknown).
  const [targetDistance, setTargetDistance] = useState<number | null>(null);

  const targetBeacon = useMemo(
    () => beacons.find((b) => b.uuid === targetBeaconUuid),
    [beacons, targetBeaconUuid],
  );

  // Subscribe to live beacon scan readings.
  useEffect(() => {
    if (!sensorService?.scanBeacons) return;
    const unsub = sensorService.scanBeacons((readings: Array<{ uuid: string; distance?: number; rssi?: number }>) => {
      const r = readings.find((x) => x.uuid === targetBeaconUuid);
      if (!r) {
        setTargetDistance(null);
        return;
      }
      // Prefer pre-computed distance; fall back to RSSI-based estimate.
      // Standard log-distance path-loss with n=2 (free space) and
      // refRssi -59dBm @ 1m (typical iBeacon calibration). RSSI is
      // negative dBm; closer to 0 = stronger.
      if (typeof r.distance === 'number') {
        setTargetDistance(r.distance);
      } else if (typeof r.rssi === 'number') {
        const refRssi = -59;
        const n = 2;
        const d = Math.pow(10, (refRssi - r.rssi) / (10 * n));
        setTargetDistance(d);
      } else {
        setTargetDistance(null);
      }
    });
    return unsub;
  }, [sensorService, targetBeaconUuid]);

  // Threshold-crossing detection for trigger modes.
  useEffect(() => {
    if (mode === 'display' || resolvedRef.current) return;
    if (targetDistance === null) return;
    const within = targetDistance <= radiusMeters;
    if (mode === 'trigger-on-arrival' && within) {
      resolvedRef.current = true;
      setResolved(true);
      onResolveRef.current('arrived');
    } else if (mode === 'trigger-on-departure' && !within) {
      resolvedRef.current = true;
      setResolved(true);
      onResolveRef.current('departed');
    }
  }, [targetDistance, radiusMeters, mode]);

  // Optional timeout.
  useEffect(() => {
    if (!timeoutMs || resolvedRef.current) return;
    const handle = window.setTimeout(() => {
      if (resolvedRef.current) return;
      resolvedRef.current = true;
      setResolved(true);
      onResolveRef.current('timeout');
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
    onResolveRef.current('continue');
  };
  const handleSkip = () => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    setResolved(true);
    onResolveRef.current('skipped');
  };

  return (
    <div className="w-full h-full flex flex-col bg-gray-50">
      {text && (
        <div className="px-4 py-3 bg-slate-900 text-white text-sm font-medium text-center">
          {text}
        </div>
      )}

      <div className="flex-1 relative flex items-center justify-center p-4 overflow-hidden">
        {!targetBeacon ? (
          <div className="text-center text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-6 max-w-md">
            <div className="font-medium mb-2">Target beacon not configured</div>
            <div className="text-xs">
              Beacon UUID <code className="font-mono bg-white/60 px-1 py-0.5 rounded">{targetBeaconUuid}</code> isn't
              defined in Project Settings → Location & XR → Indoor venue → Beacons.
            </div>
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
              {/* Radius ring around target beacon */}
              <circle
                cx={targetBeacon.x}
                cy={targetBeacon.y}
                r={radiusMeters}
                fill="rgba(220, 38, 38, 0.10)"
                stroke="#dc2626"
                strokeWidth={Math.max(0.05, floorWidth / 400)}
                strokeDasharray={`${floorWidth / 100} ${floorWidth / 200}`}
              />
              {/* All non-target beacons as small grey dots */}
              {beacons.filter((b) => b.uuid !== targetBeaconUuid).map((b) => (
                <g key={b.uuid}>
                  <circle
                    cx={b.x}
                    cy={b.y}
                    r={Math.max(0.15, floorWidth / 200)}
                    fill="#94a3b8"
                    stroke="#fff"
                    strokeWidth={Math.max(0.03, floorWidth / 600)}
                  />
                </g>
              ))}
              {/* Target beacon — bigger red dot with halo */}
              <circle
                cx={targetBeacon.x}
                cy={targetBeacon.y}
                r={Math.max(0.4, floorWidth / 80)}
                fill="rgba(220, 38, 38, 0.25)"
              />
              <circle
                cx={targetBeacon.x}
                cy={targetBeacon.y}
                r={Math.max(0.2, floorWidth / 150)}
                fill="#dc2626"
                stroke="#fff"
                strokeWidth={Math.max(0.04, floorWidth / 500)}
              />
            </svg>
          </div>
        )}
      </div>

      {/* Status / distance indicator */}
      <div className="px-4 py-2 bg-white border-t flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 text-gray-700">
          <Wifi className="w-4 h-4 text-red-600" />
          {targetDistance === null ? (
            <span className="text-gray-500">Searching for {targetBeacon?.displayName || 'beacon'}…</span>
          ) : (
            <span>
              <span className="font-medium">{targetBeacon?.displayName || 'Target'}:</span>{' '}
              <span className={targetDistance <= radiusMeters ? 'text-green-700 font-medium' : 'text-gray-700'}>
                {targetDistance.toFixed(1)} m away
              </span>
              {targetDistance <= radiusMeters && (
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
