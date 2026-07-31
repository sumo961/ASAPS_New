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

import React, { useEffect, useRef, useState } from 'react';
import { Plus, X, MapPin, Wifi, Crosshair } from 'lucide-react';
import type { Effect } from '@asaps/core';
import { ChoiceEffectsEditor } from './ChoiceEffectsEditor';

export interface XRLocationEntry {
  id: string;
  name?: string;
  lat?: number;
  lng?: number;
  beaconUuid?: string;
  /** Indoor floor-plan position (metres from top-left). */
  x?: number;
  y?: number;
  radiusMeters?: number;
  target: string;
  effects?: Effect[];
  /**
   * Dynamic binding (GPS flavour): instead of a literal lat/lng, resolve
   * this entry at runtime to the geo-points stored under this name by a
   * Set GPS Location beat. Each stored point becomes a geofence
   * inheriting this entry's target/radius/effects.
   */
  pointName?: string;
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
  /**
   * Project origin (lat/lng for GPS) used as the default position for
   * newly-created locations so authors don't start at (0,0) in the ocean.
   */
  storyOrigin?: { lat: number; lng: number };
  /**
   * Point-set names written by the story's Set GPS Location beats (GPS
   * flavour only) — offered as suggestions for dynamic binding. Free
   * text is still allowed: a set may be created later or named
   * indirectly.
   */
  availablePointSets?: string[];
  // ChoiceEffectsEditor dependencies — pass through verbatim.
  availableCounters?: any[];
  availableVariables?: any[];
  availableInventoryItems?: any[];
  availableCharacters?: any[];
  emotionPalette?: ReadonlyArray<any>;
}

/** Compute the next "Location N" auto-name. Same logic as XRMapEditor. */
function nextLocationName(locations: XRLocationEntry[]): string {
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
  storyOrigin,
  availablePointSets,
  availableCounters,
  availableVariables,
  availableInventoryItems,
  availableCharacters,
  emotionPalette,
}) => {
  // Currently-selected location id, kept in sync with the Visual Editor's
  // selection via window events. Selecting in either place highlights the
  // corresponding row / marker in the other.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());

  // VE → Inspector: a marker click in XRMapEditor / XRFloorPlanEditor
  // dispatches asaps:xr-location-selected. Highlight the matching row
  // and scroll it into view.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { id: string } | undefined;
      if (!detail?.id) return;
      setSelectedId(detail.id);
      const el = rowRefs.current.get(detail.id);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    window.addEventListener('asaps:xr-location-selected', handler);
    return () => window.removeEventListener('asaps:xr-location-selected', handler);
  }, []);

  // Inspector → VE: row click pans the map / floor plan to that location.
  const focusInVE = (id: string) => {
    setSelectedId(id);
    try {
      window.dispatchEvent(new CustomEvent('asaps:xr-focus-location', { detail: { id } }));
    } catch { /* ignore */ }
  };

  const updateLocation = (index: number, patch: Partial<XRLocationEntry>) => {
    const next = [...locations];
    next[index] = { ...next[index], ...patch };
    onChange(next);
  };
  const removeLocation = (index: number) => {
    onChange(locations.filter((_, i) => i !== index));
  };
  const addLocation = () => {
    const name = nextLocationName(locations);
    const id = makeLocationId();
    const seed: XRLocationEntry = flavour === 'gps'
      ? {
          id, name,
          // Default to story origin so authors don't start at (0,0) in
          // the ocean. Falls through to undefined → editor shows blanks.
          lat: storyOrigin?.lat,
          lng: storyOrigin?.lng,
          target: '',
        }
      : { id, name, beaconUuid: '', target: '' };
    onChange([...locations, seed]);
    setSelectedId(id);
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

      {locations.map((loc, index) => {
        const isSelected = loc.id === selectedId;
        return (
        <div
          key={loc.id}
          ref={(el) => { rowRefs.current.set(loc.id, el); }}
          onClick={() => focusInVE(loc.id)}
          className={`p-3 rounded-lg border space-y-2 transition-colors cursor-pointer ${
            isSelected
              ? 'bg-green-50 border-green-300 shadow-sm ring-1 ring-green-200'
              : 'bg-gray-50 border-gray-200 hover:bg-gray-100/80'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-700 inline-flex items-center gap-1">
              {flavour === 'gps' ? <MapPin className="w-3 h-3" /> : <Wifi className="w-3 h-3" />}
              {loc.name || `Location ${index + 1}`}
              {isSelected && <span className="text-[10px] uppercase tracking-wide text-green-700 font-semibold">selected</span>}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); focusInVE(loc.id); }}
                className="text-blue-600 hover:bg-blue-50 p-1 rounded"
                title="Focus this location on the map"
              >
                <Crosshair className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); removeLocation(index); }}
                className="text-red-600 hover:bg-red-50 p-1 rounded"
                title="Remove this location"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
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

          {/* Per-flavour position picker. GPS entries can either carry a
              fixed coordinate or bind to a runtime point set (written by a
              Set GPS Location beat) — one geofence per stored point,
              inheriting this entry's target/radius/effects. `pointName`
              defined (even '') marks dynamic mode so the choice survives
              while the name field is still empty. */}
          {flavour === 'gps' ? (
            <div className="space-y-1.5">
              <div className="flex gap-1 text-[11px]" role="radiogroup" aria-label="Position source">
                {([
                  ['fixed', 'Fixed coordinates'],
                  ['pointSet', 'Point set (dynamic)'],
                ] as const).map(([kind, label]) => {
                  const active = kind === 'pointSet' ? loc.pointName !== undefined : loc.pointName === undefined;
                  return (
                    <button
                      key={kind}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (kind === 'pointSet' && loc.pointName === undefined) {
                          updateLocation(index, { pointName: '' });
                        } else if (kind === 'fixed' && loc.pointName !== undefined) {
                          updateLocation(index, { pointName: undefined });
                        }
                      }}
                      className={`px-2 py-0.5 rounded border ${
                        active
                          ? 'bg-green-600 text-white border-green-600'
                          : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {loc.pointName === undefined ? (
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
                    Point set name (written by a Set GPS Location beat)
                  </label>
                  <input
                    type="text"
                    list={`xr-point-sets-${loc.id}`}
                    value={loc.pointName}
                    onChange={(e) => updateLocation(index, { pointName: e.target.value })}
                    placeholder="e.g. treasure_spots"
                    className="w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono"
                  />
                  <datalist id={`xr-point-sets-${loc.id}`}>
                    {(availablePointSets || []).map((n) => (
                      <option key={n} value={n} />
                    ))}
                  </datalist>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    At play time this entry becomes one geofence per stored point,
                    each inheriting the target, radius, and effects below.
                    {availablePointSets && availablePointSets.length > 0
                      ? '' : ' No Set GPS Location beat writes a point set yet — add one, or type the name it will use.'}
                  </p>
                </div>
              )}
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

          {/* Floor-plan position (indoor only — metres from top-left). */}
          {flavour === 'indoor' && (
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-[11px] text-gray-600">
                x (metres from left)
                <input
                  type="number"
                  step="0.1"
                  value={loc.x ?? ''}
                  onChange={(e) => updateLocation(index, {
                    x: e.target.value === '' ? undefined : parseFloat(e.target.value.replace(',', '.')),
                  })}
                  className="mt-0.5 w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono"
                />
              </label>
              <label className="block text-[11px] text-gray-600">
                y (metres from top)
                <input
                  type="number"
                  step="0.1"
                  value={loc.y ?? ''}
                  onChange={(e) => updateLocation(index, {
                    y: e.target.value === '' ? undefined : parseFloat(e.target.value.replace(',', '.')),
                  })}
                  className="mt-0.5 w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono"
                />
              </label>
            </div>
          )}

          {/* Per-location radius (optional override) */}
          <div>
            <label className="block text-[11px] font-medium text-gray-600 mb-0.5">
              Radius for this location (leave blank to inherit beat default)
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
        );
      })}
    </div>
  );
};
