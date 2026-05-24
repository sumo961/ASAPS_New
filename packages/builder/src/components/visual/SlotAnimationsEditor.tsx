/**
 * SlotAnimationsEditor — author-side surface for the P3-anim responsive
 * motion intent. Renders one card per resolvable slot of the beat (from
 * the schema's getSlotSpec / getSpatialSpec); each card binds enter AND
 * exit. Writes through to `beat.slotAnimations`.
 *
 * P3-anim-6: in spatial mode, also renders a "Background" card at the
 * top for the SPATIAL layer (image-layer) animation — sibling of slot
 * animations, written through to `beat.spatialAnimations` (its own
 * change handle).
 *
 * Mode-aware by construction: only mounts in the AnimationPanel's slot/
 * spatial branch, replacing the legacy AnimationPath editor (path
 * keyframes are meaningless when there are no authored x/y at runtime).
 */
import React from 'react';
import type {
  SlotAnimations,
  SlotAnimationEntry,
  SlotAnimation,
  SlotAnimationPreset,
  SlotPath,
  SlotWaypoint,
  SpatialAnimations,
  SpatialAnimation,
  SpatialAnimationPreset,
  SpatialPath,
  SpatialWaypoint,
} from '@asaps/core';
import {
  getSlotSpec,
  getSpatialSpec,
  type SlotSpec,
} from '@asaps/renderer';
import { mergeSlotAnimations } from '../../utils/slotAnimationsEdit';

interface Props {
  beatType: string;
  layoutMode: 'slot' | 'spatial';
  value: SlotAnimations | undefined;
  onChange: (next: SlotAnimations | undefined) => void;
  /** Spatial-layer animation (image). Only consulted in spatial mode. */
  spatialValue?: SpatialAnimations;
  onSpatialChange?: (next: SpatialAnimations | undefined) => void;
}

const SLOT_PRESETS: Array<{ value: SlotAnimationPreset | ''; label: string }> = [
  { value: '', label: 'Off (no animation)' },
  { value: 'fade', label: 'Fade' },
  { value: 'slide-in-left', label: 'Slide from left' },
  { value: 'slide-in-right', label: 'Slide from right' },
  { value: 'slide-in-top', label: 'Slide from top' },
  { value: 'slide-in-bottom', label: 'Slide from bottom' },
  { value: 'scale-in', label: 'Scale' },
  { value: 'path', label: 'Path (custom waypoints)' },
];

const SPATIAL_PRESETS: Array<{ value: SpatialAnimationPreset | ''; label: string }> = [
  { value: '', label: 'Off (static image)' },
  { value: 'ken-burns', label: 'Ken Burns (zoom + drift)' },
  { value: 'zoom-in', label: 'Zoom in (settle to fit)' },
  { value: 'zoom-out', label: 'Zoom out (slow push)' },
  { value: 'pan-left', label: 'Pan left' },
  { value: 'pan-right', label: 'Pan right' },
  { value: 'pan-up', label: 'Pan up' },
  { value: 'pan-down', label: 'Pan down' },
  { value: 'path', label: 'Path (custom waypoints)' },
];

/**
 * Default starter paths so the author can see motion immediately after
 * picking the Path preset. The renderer happily handles 1-waypoint
 * paths as static end-states, but 2 waypoints actually move.
 */
const DEFAULT_SLOT_PATH: SlotPath = {
  type: 'linear',
  waypoints: [
    { anchor: { h: 'left', v: 'center' }, dxPercent: 0, dyPercent: 0, t: 0 },
    { anchor: { h: 'center', v: 'center' }, dxPercent: 0, dyPercent: 0, t: 1 },
  ],
};

const DEFAULT_SPATIAL_PATH: SpatialPath = {
  type: 'linear',
  waypoints: [
    { x: 0.2, y: 0.5, zoom: 1.1, t: 0 },
    { x: 0.8, y: 0.5, zoom: 1.1, t: 1 },
  ],
};

const ANCHOR_H: Array<'left' | 'center' | 'right'> = ['left', 'center', 'right'];
const ANCHOR_V: Array<'top' | 'center' | 'bottom'> = ['top', 'center', 'bottom'];

/* ─────────────────── Path waypoint editors ─────────────────── */

interface SlotPathEditorProps {
  value: SlotPath | undefined;
  onChange: (next: SlotPath) => void;
}

const SlotPathEditor: React.FC<SlotPathEditorProps> = ({ value, onChange }) => {
  const waypoints: SlotWaypoint[] = value?.waypoints ?? [];

  const update = (i: number, patch: Partial<SlotWaypoint>) => {
    const next = waypoints.map((w, idx) => (idx === i ? { ...w, ...patch } : w));
    onChange({ type: value?.type ?? 'linear', loop: value?.loop, waypoints: next });
  };
  const remove = (i: number) => {
    onChange({
      type: value?.type ?? 'linear',
      loop: value?.loop,
      waypoints: waypoints.filter((_, idx) => idx !== i),
    });
  };
  const add = () => {
    const last = waypoints[waypoints.length - 1] ?? { anchor: { h: 'center', v: 'center' }, dxPercent: 0, dyPercent: 0 };
    onChange({
      type: value?.type ?? 'linear',
      loop: value?.loop,
      waypoints: [...waypoints, { ...last, t: undefined }],
    });
  };

  return (
    <div className="col-span-2 mt-1 rounded border border-gray-200 bg-white p-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-medium text-gray-700">Waypoints</span>
        <label className="text-[11px] text-gray-600 flex items-center gap-1">
          <input
            type="checkbox"
            checked={!!value?.loop}
            onChange={(e) => onChange({ ...(value ?? { type: 'linear', waypoints: [] }), loop: e.target.checked })}
          />
          Loop
        </label>
      </div>
      <div className="space-y-1.5">
        {waypoints.map((wp, i) => (
          <div key={i} className="grid grid-cols-12 gap-1 items-center text-[11px]">
            <span className="col-span-1 text-gray-500 text-center">{i + 1}</span>
            <select
              className="col-span-2 px-1 py-0.5 border border-gray-300 rounded text-[11px]"
              value={wp.anchor?.h ?? 'center'}
              onChange={(e) =>
                update(i, { anchor: { h: e.target.value as 'left' | 'center' | 'right', v: wp.anchor?.v } })
              }
            >
              {ANCHOR_H.map((h) => <option key={h} value={h}>{h[0]}</option>)}
            </select>
            <select
              className="col-span-2 px-1 py-0.5 border border-gray-300 rounded text-[11px]"
              value={wp.anchor?.v ?? 'center'}
              onChange={(e) =>
                update(i, { anchor: { h: wp.anchor?.h, v: e.target.value as 'top' | 'center' | 'bottom' } })
              }
            >
              {ANCHOR_V.map((v) => <option key={v} value={v}>{v[0]}</option>)}
            </select>
            <input
              type="number"
              step={1}
              className="col-span-2 px-1 py-0.5 border border-gray-300 rounded text-[11px]"
              placeholder="dx%"
              value={wp.dxPercent ?? 0}
              onChange={(e) => update(i, { dxPercent: Number(e.target.value) })}
            />
            <input
              type="number"
              step={1}
              className="col-span-2 px-1 py-0.5 border border-gray-300 rounded text-[11px]"
              placeholder="dy%"
              value={wp.dyPercent ?? 0}
              onChange={(e) => update(i, { dyPercent: Number(e.target.value) })}
            />
            <input
              type="number"
              step={0.05}
              min={0}
              max={1}
              className="col-span-2 px-1 py-0.5 border border-gray-300 rounded text-[11px]"
              placeholder="t"
              value={wp.t ?? ''}
              onChange={(e) => update(i, { t: e.target.value === '' ? undefined : Number(e.target.value) })}
            />
            <button
              type="button"
              className="col-span-1 text-red-600 hover:bg-red-50 rounded"
              onClick={() => remove(i)}
              title="Remove waypoint"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="mt-2 text-[11px] px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-700"
        onClick={add}
      >
        + Add waypoint
      </button>
      <p className="mt-1 text-[10px] text-gray-500 leading-tight">
        Each waypoint picks an anchor on the stage (h, v) and a percent offset.
        The slot's center is moved to that target. `t` is the normalized time
        (0–1) the waypoint is reached; leave blank for even spacing.
      </p>
    </div>
  );
};

interface SpatialPathEditorProps {
  value: SpatialPath | undefined;
  onChange: (next: SpatialPath) => void;
}

const SpatialPathEditor: React.FC<SpatialPathEditorProps> = ({ value, onChange }) => {
  const waypoints: SpatialWaypoint[] = value?.waypoints ?? [];

  const update = (i: number, patch: Partial<SpatialWaypoint>) => {
    const next = waypoints.map((w, idx) => (idx === i ? { ...w, ...patch } : w));
    onChange({ type: value?.type ?? 'linear', loop: value?.loop, waypoints: next });
  };
  const remove = (i: number) => {
    onChange({
      type: value?.type ?? 'linear',
      loop: value?.loop,
      waypoints: waypoints.filter((_, idx) => idx !== i),
    });
  };
  const add = () => {
    const last = waypoints[waypoints.length - 1] ?? { x: 0.5, y: 0.5, zoom: 1 };
    onChange({
      type: value?.type ?? 'linear',
      loop: value?.loop,
      waypoints: [...waypoints, { ...last, t: undefined }],
    });
  };

  return (
    <div className="col-span-2 mt-1 rounded border border-gray-200 bg-white p-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-medium text-gray-700">Waypoints (0–1 on image)</span>
        <label className="text-[11px] text-gray-600 flex items-center gap-1">
          <input
            type="checkbox"
            checked={!!value?.loop}
            onChange={(e) => onChange({ ...(value ?? { type: 'linear', waypoints: [] }), loop: e.target.checked })}
          />
          Loop
        </label>
      </div>
      <div className="space-y-1.5">
        {waypoints.map((wp, i) => (
          <div key={i} className="grid grid-cols-12 gap-1 items-center text-[11px]">
            <span className="col-span-1 text-gray-500 text-center">{i + 1}</span>
            <input
              type="number"
              step={0.05}
              min={0}
              max={1}
              className="col-span-3 px-1 py-0.5 border border-gray-300 rounded text-[11px]"
              placeholder="x"
              value={wp.x ?? 0}
              onChange={(e) => update(i, { x: Number(e.target.value) })}
            />
            <input
              type="number"
              step={0.05}
              min={0}
              max={1}
              className="col-span-3 px-1 py-0.5 border border-gray-300 rounded text-[11px]"
              placeholder="y"
              value={wp.y ?? 0}
              onChange={(e) => update(i, { y: Number(e.target.value) })}
            />
            <input
              type="number"
              step={0.1}
              min={0.1}
              className="col-span-2 px-1 py-0.5 border border-gray-300 rounded text-[11px]"
              placeholder="zoom"
              value={wp.zoom ?? 1}
              onChange={(e) => update(i, { zoom: Number(e.target.value) })}
            />
            <input
              type="number"
              step={0.05}
              min={0}
              max={1}
              className="col-span-2 px-1 py-0.5 border border-gray-300 rounded text-[11px]"
              placeholder="t"
              value={wp.t ?? ''}
              onChange={(e) => update(i, { t: e.target.value === '' ? undefined : Number(e.target.value) })}
            />
            <button
              type="button"
              className="col-span-1 text-red-600 hover:bg-red-50 rounded"
              onClick={() => remove(i)}
              title="Remove waypoint"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="mt-2 text-[11px] px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-700"
        onClick={add}
      >
        + Add waypoint
      </button>
      <p className="mt-1 text-[10px] text-gray-500 leading-tight">
        Coordinates are 0–1 on the letterboxed image (same as hotspots).
        `zoom` is the scale factor at the waypoint (1 = fit, &gt;1 zooms in).
        Leave `t` blank for even spacing.
      </p>
    </div>
  );
};

function slotsForBeat(beatType: string, mode: 'slot' | 'spatial'): SlotSpec[] {
  if (mode === 'spatial') return getSpatialSpec(beatType)?.slots ?? [];
  return getSlotSpec(beatType) ?? [];
}

function roleLabel(role: SlotSpec['role']): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

interface SlotPhaseControlsProps {
  label: string;
  defaultDuration: number;
  value: SlotAnimation | undefined;
  onChange: (next: Partial<SlotAnimation> | null) => void;
}

const SlotPhaseControls: React.FC<SlotPhaseControlsProps> = ({
  label,
  defaultDuration,
  value,
  onChange,
}) => {
  const preset = (value?.preset ?? '') as SlotAnimationPreset | '';
  const isSlide = preset.startsWith('slide-in-');
  const isPath = preset === 'path';
  return (
    <div>
      <label className="block text-[11px] text-gray-600 mb-1">{label}</label>
      <select
        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        value={preset}
        onChange={(e) => {
          const v = e.target.value as SlotAnimationPreset | '';
          if (!v) onChange(null);
          // Seed a starter path when the author picks Path — the renderer
          // expects at least one waypoint, and an empty list reads as
          // "no animation" which would silently swallow the selection.
          else if (v === 'path') onChange({ preset: v, path: DEFAULT_SLOT_PATH });
          else onChange({ preset: v });
        }}
      >
        {SLOT_PRESETS.map((p) => (
          <option key={p.value} value={p.value}>{p.label}</option>
        ))}
      </select>

      {value && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[11px] text-gray-600 mb-1">Duration (ms)</label>
            <input
              type="number"
              min={0}
              step={50}
              placeholder={String(defaultDuration)}
              value={value.duration ?? ''}
              onChange={(e) => {
                const raw = e.target.value;
                const num = raw === '' ? undefined : Math.max(0, Number(raw));
                onChange({ duration: num });
              }}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md bg-white"
            />
          </div>
          <div>
            <label className="block text-[11px] text-gray-600 mb-1">Delay (ms)</label>
            <input
              type="number"
              min={0}
              step={50}
              placeholder="0"
              value={value.delay ?? ''}
              onChange={(e) => {
                const raw = e.target.value;
                const num = raw === '' ? undefined : Math.max(0, Number(raw));
                onChange({ delay: num });
              }}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md bg-white"
            />
          </div>
          {isSlide && (
            <div className="col-span-2">
              <label className="block text-[11px] text-gray-600 mb-1">
                Distance (% of slot box)
              </label>
              <input
                type="number"
                min={0}
                step={10}
                placeholder="100"
                value={value.distance ?? ''}
                onChange={(e) => {
                  const raw = e.target.value;
                  const num = raw === '' ? undefined : Math.max(0, Number(raw));
                  onChange({ distance: num });
                }}
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md bg-white"
              />
            </div>
          )}
          {isPath && (
            <SlotPathEditor
              value={value.path}
              onChange={(nextPath) => onChange({ path: nextPath })}
            />
          )}
        </div>
      )}
    </div>
  );
};

interface SpatialControlsProps {
  label: string;
  defaultDuration: number;
  value: SpatialAnimation | undefined;
  onChange: (next: Partial<SpatialAnimation> | null) => void;
}

const SpatialControls: React.FC<SpatialControlsProps> = ({
  label,
  defaultDuration,
  value,
  onChange,
}) => {
  const preset = (value?.preset ?? '') as SpatialAnimationPreset | '';
  const isPath = preset === 'path';
  return (
    <div>
      <label className="block text-[11px] text-gray-600 mb-1">{label}</label>
      <select
        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        value={preset}
        onChange={(e) => {
          const v = e.target.value as SpatialAnimationPreset | '';
          if (!v) onChange(null);
          else if (v === 'path') onChange({ preset: v, path: DEFAULT_SPATIAL_PATH });
          else onChange({ preset: v });
        }}
      >
        {SPATIAL_PRESETS.map((p) => (
          <option key={p.value} value={p.value}>{p.label}</option>
        ))}
      </select>

      {value && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[11px] text-gray-600 mb-1">Duration (ms)</label>
            <input
              type="number"
              min={0}
              step={500}
              placeholder={String(defaultDuration)}
              value={value.duration ?? ''}
              onChange={(e) => {
                const raw = e.target.value;
                const num = raw === '' ? undefined : Math.max(0, Number(raw));
                onChange({ duration: num });
              }}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md bg-white"
            />
          </div>
          <div>
            <label className="block text-[11px] text-gray-600 mb-1">Delay (ms)</label>
            <input
              type="number"
              min={0}
              step={50}
              placeholder="0"
              value={value.delay ?? ''}
              onChange={(e) => {
                const raw = e.target.value;
                const num = raw === '' ? undefined : Math.max(0, Number(raw));
                onChange({ delay: num });
              }}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md bg-white"
            />
          </div>
          {!isPath && (
            <div className="col-span-2">
              <label className="block text-[11px] text-gray-600 mb-1">
                Intensity (% pan / scale delta)
              </label>
              <input
                type="number"
                min={0}
                step={5}
                placeholder="10"
                value={value.intensity ?? ''}
                onChange={(e) => {
                  const raw = e.target.value;
                  const num = raw === '' ? undefined : Math.max(0, Number(raw));
                  onChange({ intensity: num });
                }}
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md bg-white"
              />
            </div>
          )}
          {isPath && (
            <SpatialPathEditor
              value={value.path}
              onChange={(nextPath) => onChange({ path: nextPath })}
            />
          )}
        </div>
      )}
    </div>
  );
};

export const SlotAnimationsEditor: React.FC<Props> = ({
  beatType,
  layoutMode,
  value,
  onChange,
  spatialValue,
  onSpatialChange,
}) => {
  const slots = slotsForBeat(beatType, layoutMode);

  const updatePhase = (
    slotName: string,
    phaseKey: 'enter' | 'exit',
    patch: Partial<SlotAnimation> | null,
  ) => {
    const existing: SlotAnimationEntry | undefined = value?.[slotName];
    if (patch === null) {
      onChange(mergeSlotAnimations(value, slotName, { [phaseKey]: undefined } as Partial<SlotAnimationEntry>));
      return;
    }
    const prevPhase = existing?.[phaseKey];
    const merged: SlotAnimation = { ...(prevPhase ?? { preset: 'fade' }), ...patch } as SlotAnimation;
    onChange(mergeSlotAnimations(value, slotName, { [phaseKey]: merged } as Partial<SlotAnimationEntry>));
  };

  const updateSpatial = (
    phaseKey: 'enter' | 'exit',
    patch: Partial<SpatialAnimation> | null,
  ) => {
    if (!onSpatialChange) return;
    const cur: SpatialAnimations = spatialValue ?? {};
    if (patch === null) {
      const next: SpatialAnimations = { ...cur };
      delete next[phaseKey];
      onSpatialChange(Object.keys(next).length > 0 ? next : undefined);
      return;
    }
    const prevPhase = cur[phaseKey];
    const merged: SpatialAnimation = { ...(prevPhase ?? { preset: 'ken-burns' }), ...patch } as SpatialAnimation;
    onSpatialChange({ ...cur, [phaseKey]: merged });
  };

  const handleReplay = () => {
    window.dispatchEvent(new CustomEvent('asaps:slotAnimReplay'));
  };
  // P3-anim-9 — preview the exit without clicking through. SlotFlowView
  // and SpatialFlowView both listen and flip to exit phase in parallel.
  const handleTestExit = () => {
    window.dispatchEvent(new CustomEvent('asaps:slotAnimTestExit'));
  };

  if (slots.length === 0 && layoutMode !== 'spatial') {
    return (
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col h-full">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">Animations</h2>
        </div>
        <div className="p-4 text-sm text-gray-600">
          This beat type has no slots declared in the schema, so there are
          no responsive animation slots to author.
        </div>
      </div>
    );
  }

  return (
    <div className="w-80 bg-white border-r border-gray-200 flex flex-col h-full">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-gray-800">Animations</h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleReplay}
              className="text-xs px-2 py-1 rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-gray-700"
              title="Replay enter animations in the live preview"
            >
              Replay
            </button>
            <button
              type="button"
              onClick={handleTestExit}
              className="text-xs px-2 py-1 rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-gray-700"
              title="Play the exit animation once in the live preview (without advancing)"
            >
              Test exit
            </button>
          </div>
        </div>
        <p className="mt-1 text-xs text-gray-500 leading-relaxed">
          Responsive enter / exit animations — resolved against each slot's
          box at runtime, so they survive reflow and orientation changes.
          Exit plays before the next beat takes over.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {layoutMode === 'spatial' && onSpatialChange && (
          <div className="rounded-md border border-gray-200 bg-amber-50/40 p-3">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium text-gray-800">background</div>
              <span className="text-[10px] uppercase tracking-wide text-gray-500 bg-white border border-gray-200 px-1.5 py-0.5 rounded">
                Image
              </span>
            </div>
            <div className="space-y-3">
              <SpatialControls
                label="Enter"
                defaultDuration={6000}
                value={spatialValue?.enter}
                onChange={(patch) => updateSpatial('enter', patch)}
              />
              <SpatialControls
                label="Exit"
                defaultDuration={1200}
                value={spatialValue?.exit}
                onChange={(patch) => updateSpatial('exit', patch)}
              />
            </div>
          </div>
        )}

        {slots.map((slot) => {
          const entry = value?.[slot.name];
          return (
            <div
              key={slot.name}
              className="rounded-md border border-gray-200 bg-gray-50 p-3"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-medium text-gray-800">
                  {slot.name}
                </div>
                <span className="text-[10px] uppercase tracking-wide text-gray-500 bg-white border border-gray-200 px-1.5 py-0.5 rounded">
                  {roleLabel(slot.role)}
                </span>
              </div>

              <div className="space-y-3">
                <SlotPhaseControls
                  label="Enter"
                  defaultDuration={400}
                  value={entry?.enter}
                  onChange={(patch) => updatePhase(slot.name, 'enter', patch)}
                />
                <SlotPhaseControls
                  label="Exit"
                  defaultDuration={300}
                  value={entry?.exit}
                  onChange={(patch) => updatePhase(slot.name, 'exit', patch)}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
