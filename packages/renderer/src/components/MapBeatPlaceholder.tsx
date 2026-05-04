/**
 * MapBeatPlaceholder — placeholder UI for the GpsLocationBeat (S4).
 *
 * Renders a clean panel showing target lat/lng + radius, the player's
 * current cached position, distance-to-target in metres, and a status
 * indicator. In trigger modes the panel auto-resolves when the player
 * crosses the proximity threshold; in display mode the player advances
 * via the continue button.
 *
 * Deliberately a placeholder — the full Leaflet integration ships in
 * its own focused commit (see docs/XR-Roadmap.md). The placeholder is
 * functional: a story author can preview a GPS beat end-to-end with
 * the MockSensorPanel driving the player's simulated location, and
 * the runtime semantics (haversine distance, threshold crossing,
 * timeout, skip) are real. Only the visual map polish is missing.
 */

import React, { useEffect, useState, useRef } from 'react';

interface MapBeatPlaceholderProps {
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
  /**
   * SensorService reference — passed down via renderer state. The
   * placeholder subscribes to watchLocation for live distance updates.
   */
  sensorService?: any;
  /**
   * Resolution callback. The beat advances regardless of which path
   * fired — the string is informational and can be inspected via
   * the timeline event.
   */
  onResolve: (path: 'arrived' | 'departed' | 'continue' | 'timeout' | 'skipped') => void;
}

/** Haversine in metres — matches the engine's gpsProximity calculation. */
function haversineMeters(
  lat1: number, lng1: number, lat2: number, lng2: number,
): number {
  const R = 6_371_008.8;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export const MapBeatPlaceholder: React.FC<MapBeatPlaceholderProps> = ({
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
  const [playerLat, setPlayerLat] = useState<number | null>(null);
  const [playerLng, setPlayerLng] = useState<number | null>(null);
  const [resolved, setResolved] = useState(false);
  const resolvedRef = useRef(false);
  const onResolveRef = useRef(onResolve);
  onResolveRef.current = onResolve;

  // Subscribe to live location updates. In mock mode (PreviewWindow), the
  // MockSensorPanel's location nudges flow through here.
  useEffect(() => {
    if (!sensorService) return;
    const unsub = sensorService.watchLocation((reading: { lat: number; lng: number }) => {
      setPlayerLat(reading.lat);
      setPlayerLng(reading.lng);
    });
    return unsub;
  }, [sensorService]);

  // Threshold-crossing detection for trigger modes. Watch the distance
  // and resolve the moment the player crosses into / out of the radius.
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

  // Optional timeout. Fires regardless of the mode if no other resolution
  // happens within the window.
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

  // Status copy per mode + state.
  let statusText: string;
  let statusColour: string;
  if (mode === 'display') {
    statusText = 'Map view';
    statusColour = 'text-blue-700';
  } else if (distance === null) {
    statusText = 'Waiting for location…';
    statusColour = 'text-gray-500';
  } else if (mode === 'trigger-on-arrival') {
    statusText = within ? 'Arrived ✓' : `${Math.round(distance)} m away`;
    statusColour = within ? 'text-green-700' : 'text-amber-700';
  } else {
    statusText = within ? `${Math.round(distance)} m inside (waiting to depart)` : 'Departed ✓';
    statusColour = within ? 'text-amber-700' : 'text-green-700';
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
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        boxSizing: 'border-box',
        background: 'linear-gradient(135deg, #f0f4ff 0%, #e8eef9 100%)',
      }}
    >
      <div
        className="bg-white rounded-xl shadow-lg p-6 max-w-md w-full space-y-4"
        style={{ border: '2px dashed #9ca3af' }}
      >
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>📍 GPS Location Beat</span>
          <span className="italic">placeholder map ({mapStyle})</span>
        </div>

        {text && (
          <div className="text-base text-gray-800 leading-relaxed">{text}</div>
        )}

        <div className="bg-gray-50 rounded-lg p-3 space-y-2 font-mono text-xs">
          <div className="text-gray-600">
            <span className="text-gray-400">target:</span>{' '}
            {targetLat.toFixed(6)}, {targetLng.toFixed(6)}
          </div>
          <div className="text-gray-600">
            <span className="text-gray-400">radius:</span> {radiusMeters} m
          </div>
          {showPlayerMarker && (
            <div className="text-gray-600">
              <span className="text-gray-400">player:</span>{' '}
              {playerLat !== null && playerLng !== null
                ? `${playerLat.toFixed(6)}, ${playerLng.toFixed(6)}`
                : '(no reading yet)'}
            </div>
          )}
        </div>

        <div className={`text-center font-medium ${statusColour}`}>
          {statusText}
        </div>

        <div className="flex gap-2 pt-2">
          {mode === 'display' && (
            <button
              type="button"
              onClick={handleContinue}
              disabled={resolved}
              className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {buttonText}
            </button>
          )}
          {cancelButtonText && (
            <button
              type="button"
              onClick={handleSkip}
              disabled={resolved}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              {cancelButtonText}
            </button>
          )}
        </div>

        <div className="text-[10px] text-gray-400 italic text-center pt-1">
          Map UI is a placeholder; Leaflet integration ships in a follow-up commit.
        </div>
      </div>
    </div>
  );
};
