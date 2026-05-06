/**
 * SpatialPositionEditor — UI for Sound.spatialPosition (v0.9.48 / S4+).
 *
 * Surfaces the directional-sound configuration as an opt-in disclosure
 * underneath any sound config. Closed by default — sounds without
 * spatial positioning behave exactly as before. Clicking "Add directional
 * positioning" expands the form with mode-aware fields:
 *
 *   - Mode select (Geographic / Azimuth-only / None)
 *   - Geographic: lat/lng + maxDistance
 *   - Azimuth: azimuth (degrees)
 *   - Both: optional elevation
 *
 * Accepts the current spatialPosition value plus an onChange callback.
 * Keeps no internal state besides the disclosure flag — the parent owns
 * the data, this component is purely presentational.
 *
 * Where used: Background Sound block in Inspector. Reusable for any
 * other sound-config surface that wants to expose spatial positioning
 * (cluster sound, dialog sound, etc.).
 */

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, MapPin, Compass } from 'lucide-react';

export interface SpatialPosition {
  lat?: number;
  lng?: number;
  azimuth?: number;
  elevation?: number;
  maxDistanceMeters?: number;
}

type SpatialMode = 'none' | 'geographic' | 'azimuth';

interface SpatialPositionEditorProps {
  value: SpatialPosition | undefined;
  onChange: (next: SpatialPosition | undefined) => void;
  /** Optional default lat/lng to seed when switching into geographic mode (e.g. project origin). */
  defaultGeoSeed?: { lat: number; lng: number };
}

/** Detect which mode the current value represents. */
function inferMode(value: SpatialPosition | undefined): SpatialMode {
  if (!value) return 'none';
  if (value.lat !== undefined && value.lng !== undefined) return 'geographic';
  if (value.azimuth !== undefined) return 'azimuth';
  return 'none';
}

export const SpatialPositionEditor: React.FC<SpatialPositionEditorProps> = ({
  value,
  onChange,
  defaultGeoSeed,
}) => {
  const mode = inferMode(value);
  const isOn = mode !== 'none';
  // Open by default when a value already exists; otherwise collapsed so the
  // disclosure stays out of the way for non-spatial sounds.
  const [open, setOpen] = useState<boolean>(isOn);

  const setMode = (next: SpatialMode) => {
    if (next === 'none') {
      onChange(undefined);
      return;
    }
    if (next === 'geographic') {
      onChange({
        lat: value?.lat ?? defaultGeoSeed?.lat ?? 0,
        lng: value?.lng ?? defaultGeoSeed?.lng ?? 0,
        elevation: value?.elevation,
        maxDistanceMeters: value?.maxDistanceMeters ?? 100,
      });
      return;
    }
    // Azimuth-only mode — strip lat/lng.
    onChange({
      azimuth: value?.azimuth ?? 0,
      elevation: value?.elevation,
    });
  };

  const patch = (field: keyof SpatialPosition, raw: string) => {
    const next: SpatialPosition = { ...(value || {}) };
    if (raw === '') {
      delete (next as any)[field];
    } else {
      // Normalise locale comma → period before parseFloat. <input type="number">
      // can return the locale-formatted string ("51,50632") in some browsers
      // when the user's locale uses comma as decimal separator; parseFloat
      // reads only up to the first non-numeric, so the precision after the
      // comma is silently dropped (51,50632 → 51), placing the sound source
      // tens of km away and making it inaudible.
      const n = parseFloat(raw.replace(',', '.'));
      if (!Number.isFinite(n)) return;
      (next as any)[field] = n;
    }
    onChange(next);
  };

  return (
    <div className="mt-2 border border-purple-200 bg-purple-50/30 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-3 py-2 flex items-center gap-2 text-xs font-medium text-purple-900 hover:bg-purple-100/50"
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <MapPin className="w-3.5 h-3.5" />
        <span>{isOn ? 'Directional positioning' : 'Directional positioning (optional)'}</span>
        {isOn && (
          <span className="ml-auto text-[10px] uppercase tracking-wide text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded">
            {mode === 'geographic' ? 'GPS' : 'azimuth'}
          </span>
        )}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3 text-xs">
          <div>
            <label className="block font-medium text-gray-700 mb-1">Mode</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as SpatialMode)}
              className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
            >
              <option value="none">Off (non-spatial playback)</option>
              <option value="geographic">Geographic (lat/lng — bearing computed live)</option>
              <option value="azimuth">Azimuth-only (fixed compass direction)</option>
            </select>
            <p className="text-[11px] text-gray-500 mt-1">
              {mode === 'geographic' && 'Sound has a fixed lat/lng. Bearing recomputes as the player walks. Pair with a story origin in Project Settings → Location & XR.'}
              {mode === 'azimuth' && 'Sound comes from a fixed compass direction. Spinning the device pans the audio.'}
              {mode === 'none' && 'Standard non-spatial playback. No panning.'}
            </p>
          </div>

          {mode === 'geographic' && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-medium text-gray-700 mb-1">Source lat</label>
                  <input
                    type="number" step="0.000001"
                    value={value?.lat ?? ''}
                    onChange={(e) => patch('lat', e.target.value)}
                    placeholder="e.g. 51.5074"
                    className="w-full px-2 py-1 border border-gray-300 rounded font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-gray-700 mb-1">Source lng</label>
                  <input
                    type="number" step="0.000001"
                    value={value?.lng ?? ''}
                    onChange={(e) => patch('lng', e.target.value)}
                    placeholder="e.g. -0.1278"
                    className="w-full px-2 py-1 border border-gray-300 rounded font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block font-medium text-gray-700 mb-1">
                  Max distance (metres)
                  <span className="text-[10px] text-gray-500 ml-1">silence beyond this</span>
                </label>
                <input
                  type="number" min={1} step={1}
                  value={value?.maxDistanceMeters ?? ''}
                  onChange={(e) => patch('maxDistanceMeters', e.target.value)}
                  placeholder="100"
                  className="w-full px-2 py-1 border border-gray-300 rounded"
                />
              </div>
              {defaultGeoSeed && (
                <button
                  type="button"
                  onClick={() => onChange({
                    ...(value || {}),
                    lat: defaultGeoSeed.lat,
                    lng: defaultGeoSeed.lng,
                  })}
                  className="text-[11px] text-purple-700 hover:text-purple-900 underline"
                >
                  Snap source to story origin
                </button>
              )}
            </>
          )}

          {mode === 'azimuth' && (
            <div>
              <label className="block font-medium text-gray-700 mb-1 flex items-center gap-1">
                <Compass className="w-3 h-3" />
                Azimuth (degrees, 0=N)
              </label>
              <input
                type="number" min={0} max={360} step={1}
                value={value?.azimuth ?? ''}
                onChange={(e) => patch('azimuth', e.target.value)}
                placeholder="e.g. 90 = east"
                className="w-full px-2 py-1 border border-gray-300 rounded"
              />
              <p className="text-[11px] text-gray-500 mt-1">
                0=N, 90=E, 180=S, 270=W. Device orientation rotates the listener's frame.
              </p>
            </div>
          )}

          {mode !== 'none' && (
            <div>
              <label className="block font-medium text-gray-700 mb-1">
                Elevation (metres, optional)
                <span className="text-[10px] text-gray-500 ml-1">vertical offset</span>
              </label>
              <input
                type="number" step={0.1}
                value={value?.elevation ?? ''}
                onChange={(e) => patch('elevation', e.target.value)}
                placeholder="0"
                className="w-full px-2 py-1 border border-gray-300 rounded"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
