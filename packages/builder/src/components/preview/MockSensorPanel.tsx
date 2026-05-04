/**
 * MockSensorPanel — desktop authoring control surface for XR sensors.
 *
 * Mounted in the PreviewWindow when the active context's SensorService
 * is in mock mode (i.e. authors are testing on a desktop with no real
 * GPS / Bluetooth / device-orientation hardware). Provides:
 *
 *   - Lat/lng inputs + N/S/E/W "walk" nudge buttons (configurable step)
 *   - Three orientation sliders (alpha 0-360, beta -90..90, gamma -90..90)
 *   - A "Snap to story origin" button that jumps to the project's
 *     LocationSettings.originLat/Lng if set
 *
 * Calls sensorService.setMockLocation / setMockOrientation on every
 * change. XR beats subscribed via watchLocation / watchOrientation
 * receive the updates immediately and re-render.
 *
 * Visibility: this panel is always shown when a SensorService with
 * mock=true capability is provided. The eventual visibility-rule
 * "only show when the project has at least one XR beat" lands once
 * S4 (the beat execution model) gates it. Until then, authors of
 * non-XR projects just see an idle panel they can ignore.
 */

import React, { useEffect, useState } from 'react';
import type { SensorService, GpsReading, OrientationReading } from '@asaps/core';

interface MockSensorPanelProps {
  /** Active SensorService — should report mock=true. */
  sensorService: SensorService;
  /** Default lat/lng for the panel's "Snap to origin" button. */
  storyOrigin?: { lat: number; lng: number };
  /** Step size in metres for walk-direction nudge. Default 5m. */
  stepMeters?: number;
}

/**
 * Approximate metres-per-degree for casual nudging. At our latitudes
 * 1° latitude ≈ 111 km; 1° longitude shrinks with cos(lat). The exact
 * conversion isn't critical for authoring — within ±10% is fine.
 */
const METRES_PER_DEG_LAT = 111_000;

function metresPerDegLng(lat: number): number {
  return METRES_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
}

export const MockSensorPanel: React.FC<MockSensorPanelProps> = ({
  sensorService,
  storyOrigin,
  stepMeters = 5,
}) => {
  const caps = sensorService.getCapabilities();
  const [lat, setLat] = useState<number>(storyOrigin?.lat ?? 0);
  const [lng, setLng] = useState<number>(storyOrigin?.lng ?? 0);
  const [alpha, setAlpha] = useState<number>(0);
  const [beta, setBeta] = useState<number>(0);
  const [gamma, setGamma] = useState<number>(0);

  // Subscribe once on mount to seed the panel from whatever the service
  // already has cached (e.g., from project's mockLocation).
  useEffect(() => {
    const unsub = sensorService.watchLocation((r: GpsReading) => {
      setLat(r.lat);
      setLng(r.lng);
    });
    return unsub;
  }, [sensorService]);

  // Push lat/lng changes back to the service whenever the inputs change.
  // Skip the very first render — useEffect would otherwise re-emit the
  // initial 0,0 over the just-seeded value.
  useEffect(() => {
    const reading: GpsReading = { lat, lng, accuracy: 5, timestamp: Date.now() };
    sensorService.setMockLocation(reading);
    // Intentionally not depending on sensorService — it's stable for the
    // panel's lifetime and re-running on identity change would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);

  // Push orientation changes back to the service.
  useEffect(() => {
    sensorService.setMockOrientation({
      alpha, beta, gamma, absolute: true, timestamp: Date.now(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alpha, beta, gamma]);

  const walkNorth = () => setLat((l) => l + stepMeters / METRES_PER_DEG_LAT);
  const walkSouth = () => setLat((l) => l - stepMeters / METRES_PER_DEG_LAT);
  const walkEast = () => setLng((g) => g + stepMeters / metresPerDegLng(lat));
  const walkWest = () => setLng((g) => g - stepMeters / metresPerDegLng(lat));
  const snapToOrigin = () => {
    if (storyOrigin) {
      setLat(storyOrigin.lat);
      setLng(storyOrigin.lng);
    }
  };

  if (!caps.mock) {
    // Belt-and-suspenders — if a non-mock service is somehow passed in,
    // render nothing rather than send setMock* warnings to the console.
    return null;
  }

  return (
    <div className="rounded-lg border border-purple-300 bg-purple-50/40 p-3 space-y-3 text-sm">
      <div className="flex items-center justify-between">
        <div className="font-medium text-purple-900">Mock Sensors</div>
        {storyOrigin && (
          <button
            type="button"
            onClick={snapToOrigin}
            className="px-2 py-1 text-xs border border-purple-300 rounded hover:bg-purple-100 text-purple-800"
          >
            Snap to origin
          </button>
        )}
      </div>

      {/* Location */}
      <div className="space-y-1.5">
        <div className="text-xs font-medium text-gray-700">Location</div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-gray-600">
            lat
            <input
              type="number"
              step="0.000001"
              value={lat}
              onChange={(e) => setLat(parseFloat(e.target.value) || 0)}
              className="mt-0.5 w-full px-1.5 py-0.5 border border-gray-300 rounded text-xs font-mono"
            />
          </label>
          <label className="text-xs text-gray-600">
            lng
            <input
              type="number"
              step="0.000001"
              value={lng}
              onChange={(e) => setLng(parseFloat(e.target.value) || 0)}
              className="mt-0.5 w-full px-1.5 py-0.5 border border-gray-300 rounded text-xs font-mono"
            />
          </label>
        </div>
        <div className="flex items-center justify-center gap-1">
          <button type="button" onClick={walkNorth} className="px-2 py-0.5 text-xs border border-gray-300 rounded hover:bg-white" title={`Walk ${stepMeters}m N`}>↑ N</button>
          <button type="button" onClick={walkWest} className="px-2 py-0.5 text-xs border border-gray-300 rounded hover:bg-white" title={`Walk ${stepMeters}m W`}>← W</button>
          <button type="button" onClick={walkEast} className="px-2 py-0.5 text-xs border border-gray-300 rounded hover:bg-white" title={`Walk ${stepMeters}m E`}>E →</button>
          <button type="button" onClick={walkSouth} className="px-2 py-0.5 text-xs border border-gray-300 rounded hover:bg-white" title={`Walk ${stepMeters}m S`}>↓ S</button>
        </div>
      </div>

      {/* Orientation */}
      <div className="space-y-1.5">
        <div className="text-xs font-medium text-gray-700">Orientation</div>
        <label className="block text-xs text-gray-600">
          alpha (compass) <span className="font-mono">{alpha.toFixed(0)}°</span>
          <input
            type="range" min="0" max="360" step="1"
            value={alpha}
            onChange={(e) => setAlpha(parseFloat(e.target.value))}
            className="mt-0.5 w-full"
          />
        </label>
        <label className="block text-xs text-gray-600">
          beta (front-back tilt) <span className="font-mono">{beta.toFixed(0)}°</span>
          <input
            type="range" min="-90" max="90" step="1"
            value={beta}
            onChange={(e) => setBeta(parseFloat(e.target.value))}
            className="mt-0.5 w-full"
          />
        </label>
        <label className="block text-xs text-gray-600">
          gamma (left-right tilt) <span className="font-mono">{gamma.toFixed(0)}°</span>
          <input
            type="range" min="-90" max="90" step="1"
            value={gamma}
            onChange={(e) => setGamma(parseFloat(e.target.value))}
            className="mt-0.5 w-full"
          />
        </label>
      </div>
    </div>
  );
};
