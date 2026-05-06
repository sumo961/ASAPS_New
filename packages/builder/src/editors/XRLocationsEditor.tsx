/**
 * XRLocationsEditor (v0.9.49+) — multi-location authoring surface for
 * GpsLocationBeat and IndoorLocationBeat. Mirrors the shape of
 * MovementChoice's choices editor: list of entries, each with its own
 * target beat + Effects bundle. The list is the beat's `locations`
 * parameter; the runtime resolves on first crossing and routes to
 * that entry's target while applying its effects.
 *
 * GPS vs indoor differ only in how a target is picked — lat/lng for
 * GPS, beacon-UUID dropdown for indoor. Everything else is shared:
 * mode dispatch, default-target picker, per-entry radius override,
 * Effects bundle.
 */

import React from 'react';
import { Plus, X, MapPin, Wifi } from 'lucide-react';
import type { Effect } from '@asaps/core';
import { ChoiceEffectsEditor } from './ChoiceEffectsEditor';

export interface XRLocationEntry {
  id: string;
  name?: string;
  lat?: number;
  lng?: number;
  beaconUuid?: string;
  radiusMeters?: number;
  target: string;
  effects?: Effect[];
}

interface XRLocationsEditorProps {
  /** Which beat type drives the location-target picker (lat/lng vs beacon-uuid). */
  flavour: 'gps' | 'indoor';
  /** Current locations array on the beat. */
  locations: XRLocationEntry[];
  onChange: (next: XRLocationEntry[]) => void;
  /** Beats authors can target — same source the rest of Inspector uses. */
  availableTargets: Array<{ id: string; name?: string }>;
  /** Project-level beacons (only for indoor flavour). */
  venueBeacons?: Array<{ uuid: string; displayName?: string; x: number; y: number }>;
  // ChoiceEffectsEditor dependencies — pass through verbatim.
  availableCounters?: any[];
  availableVariables?: any[];
  availableInventoryItems?: any[];
  availableCharacters?: any[];
  emotionPalette?: ReadonlyArray<any>;
}

let __locationIdCounter = 0;
function makeLocationId(): string {
  __locationIdCounter += 1;
  return `loc_${Date.now()}_${__locationIdCounter}`;
}

export const XRLocationsEditor: React.FC<XRLocationsEditorProps> = ({
  flavour,
  locations,
  onChange,
  availableTargets,
  venueBeacons,
  availableCounters,
  availableVariables,
  availableInventoryItems,
  availableCharacters,
  emotionPalette,
}) => {
  const updateLocation = (index: number, patch: Partial<XRLocationEntry>) => {
    const next = [...locations];
    next[index] = { ...next[index], ...patch };
    onChange(next);
  };
  const removeLocation = (index: number) => {
    onChange(locations.filter((_, i) => i !== index));
  };
  const addLocation = () => {
    const seed: XRLocationEntry = flavour === 'gps'
      ? { id: makeLocationId(), name: '', lat: 0, lng: 0, target: '' }
      : { id: makeLocationId(), name: '', beaconUuid: '', target: '' };
    onChange([...locations, seed]);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">
          Locations
          <span className="ml-2 text-xs font-normal text-gray-500">
            ({locations.length} {locations.length === 1 ? 'entry' : 'entries'})
          </span>
        </span>
        <button
          type="button"
          onClick={addLocation}
          className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700"
        >
          <Plus className="w-3 h-3 inline mr-0.5" />
          Add location
        </button>
      </div>

      {locations.length === 0 && (
        <p className="text-xs text-gray-500 italic px-2 py-3 bg-gray-50 rounded border border-gray-200">
          No locations yet. Click <strong>Add location</strong> to author one — the player will
          resolve the beat by walking to whichever location they reach first.
        </p>
      )}

      {locations.map((loc, index) => (
        <div key={loc.id} className="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-700 inline-flex items-center gap-1">
              {flavour === 'gps' ? <MapPin className="w-3 h-3" /> : <Wifi className="w-3 h-3" />}
              Location {index + 1}
            </span>
            <button
              type="button"
              onClick={() => removeLocation(index)}
              className="text-red-600 hover:bg-red-50 p-1 rounded"
              title="Remove this location"
            >
              <X className="w-3 h-3" />
            </button>
          </div>

          {/* Display name */}
          <div>
            <label className="block text-[11px] font-medium text-gray-600 mb-0.5">
              Name (shown to author + as marker tooltip)
            </label>
            <input
              type="text"
              value={loc.name || ''}
              onChange={(e) => updateLocation(index, { name: e.target.value })}
              placeholder={flavour === 'gps' ? 'e.g. Front gate' : 'e.g. Reception desk'}
              className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
            />
          </div>

          {/* Per-flavour position picker */}
          {flavour === 'gps' ? (
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-[11px] text-gray-600">
                Latitude
                <input
                  type="number"
                  step="0.000001"
                  value={loc.lat ?? ''}
                  onChange={(e) => updateLocation(index, {
                    lat: e.target.value === '' ? undefined : parseFloat(e.target.value.replace(',', '.')),
                  })}
                  placeholder="51.5074"
                  className="mt-0.5 w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono"
                />
              </label>
              <label className="block text-[11px] text-gray-600">
                Longitude
                <input
                  type="number"
                  step="0.000001"
                  value={loc.lng ?? ''}
                  onChange={(e) => updateLocation(index, {
                    lng: e.target.value === '' ? undefined : parseFloat(e.target.value.replace(',', '.')),
                  })}
                  placeholder="-0.1278"
                  className="mt-0.5 w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono"
                />
              </label>
            </div>
          ) : (
            <div>
              <label className="block text-[11px] font-medium text-gray-600 mb-0.5">
                Target beacon
              </label>
              {venueBeacons && venueBeacons.length > 0 ? (
                <select
                  value={loc.beaconUuid || ''}
                  onChange={(e) => updateLocation(index, { beaconUuid: e.target.value })}
                  className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                >
                  <option value="">— select a beacon —</option>
                  {venueBeacons.map((b) => (
                    <option key={b.uuid} value={b.uuid}>
                      {b.displayName ? `${b.displayName} — ${b.uuid.slice(0, 8)}…` : b.uuid}
                    </option>
                  ))}
                </select>
              ) : (
                <>
                  <input
                    type="text"
                    value={loc.beaconUuid || ''}
                    onChange={(e) => updateLocation(index, { beaconUuid: e.target.value.trim() })}
                    placeholder="UUID"
                    className="w-full px-2 py-1 border border-amber-300 rounded text-xs font-mono"
                  />
                  <p className="text-[11px] text-amber-700 mt-0.5">
                    No beacons configured. Add some in Project Settings →
                    Location & XR → Indoor venue → Beacons for a picker.
                  </p>
                </>
              )}
            </div>
          )}

          {/* Per-location radius (optional override) */}
          <div>
            <label className="block text-[11px] font-medium text-gray-600 mb-0.5">
              Radius override (metres) — leave blank to inherit beat default
            </label>
            <input
              type="number"
              min={0.5}
              step={0.5}
              value={loc.radiusMeters ?? ''}
              onChange={(e) => updateLocation(index, {
                radiusMeters: e.target.value === '' ? undefined : parseFloat(e.target.value.replace(',', '.')),
              })}
              placeholder={flavour === 'gps' ? '25' : '5'}
              className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
            />
          </div>

          {/* Target beat */}
          <div>
            <label className="block text-[11px] font-medium text-gray-600 mb-0.5">
              Target beat (where to advance when this location resolves) *
            </label>
            <select
              value={loc.target || ''}
              onChange={(e) => updateLocation(index, { target: e.target.value })}
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

          {/* Effects bundle */}
          <div className="p-2 bg-blue-50 rounded space-y-1.5 border border-blue-100">
            <div className="text-[11px] font-medium text-blue-700">Effects (optional)</div>
            <ChoiceEffectsEditor
              effects={loc.effects || []}
              onChange={(next) => updateLocation(index, { effects: next })}
              availableCounters={availableCounters || []}
              availableVariables={availableVariables || []}
              availableInventoryItems={availableInventoryItems || []}
              availableCharacters={availableCharacters || []}
              emotionPalette={emotionPalette}
              compact
            />
          </div>
        </div>
      ))}
    </div>
  );
};
