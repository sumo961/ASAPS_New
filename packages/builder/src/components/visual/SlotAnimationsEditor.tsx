/**
 * SlotAnimationsEditor — author-side surface for the P3-anim responsive
 * motion intent. Renders one card per resolvable slot of the beat (from
 * the schema's getSlotSpec / getSpatialSpec); each card binds an enter
 * AND an exit preset + timing. Writes through to `beat.slotAnimations`
 * via the caller's onChange (which threads through the normal command
 * path).
 *
 * Mode-aware by construction: only mounts in the AnimationPanel's slot/
 * spatial branch, replacing the prior "responsive animation lands here"
 * explainer. The legacy AnimationPath editor is unchanged.
 */
import React from 'react';
import type {
  SlotAnimations,
  SlotAnimationEntry,
  SlotAnimation,
  SlotAnimationPreset,
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
}

const PRESETS: Array<{ value: SlotAnimationPreset | ''; label: string }> = [
  { value: '', label: 'Off (no animation)' },
  { value: 'fade', label: 'Fade' },
  { value: 'slide-in-left', label: 'Slide from left' },
  { value: 'slide-in-right', label: 'Slide from right' },
  { value: 'slide-in-top', label: 'Slide from top' },
  { value: 'slide-in-bottom', label: 'Slide from bottom' },
  { value: 'scale-in', label: 'Scale' },
];

function slotsForBeat(beatType: string, mode: 'slot' | 'spatial'): SlotSpec[] {
  if (mode === 'spatial') return getSpatialSpec(beatType)?.slots ?? [];
  return getSlotSpec(beatType) ?? [];
}

function roleLabel(role: SlotSpec['role']): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

interface PhaseControlsProps {
  label: string;
  defaultDuration: number;
  value: SlotAnimation | undefined;
  onChange: (next: Partial<SlotAnimation> | null) => void;
}

const PhaseControls: React.FC<PhaseControlsProps> = ({
  label,
  defaultDuration,
  value,
  onChange,
}) => {
  const preset = (value?.preset ?? '') as SlotAnimationPreset | '';
  const isSlide = preset.startsWith('slide-in-');
  return (
    <div>
      <label className="block text-[11px] text-gray-600 mb-1">{label}</label>
      <select
        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        value={preset}
        onChange={(e) => {
          const v = e.target.value as SlotAnimationPreset | '';
          if (!v) onChange(null);
          else onChange({ preset: v });
        }}
      >
        {PRESETS.map((p) => (
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

  if (slots.length === 0) {
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

  const handleReplay = () => {
    // Force the live preview's SlotFlowView to remount so all enter
    // animations play from scratch. The listener (VisualWorkspace) keys
    // the preview with a tick that increments on every event.
    window.dispatchEvent(new CustomEvent('asaps:slotAnimReplay'));
  };

  return (
    <div className="w-80 bg-white border-r border-gray-200 flex flex-col h-full">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">Animations</h2>
          <button
            type="button"
            onClick={handleReplay}
            className="text-xs px-2 py-1 rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-gray-700"
            title="Replay enter animations in the live preview"
          >
            Replay
          </button>
        </div>
        <p className="mt-1 text-xs text-gray-500 leading-relaxed">
          Responsive enter / exit animations — resolved against each slot's
          box at runtime, so they survive reflow and orientation changes.
          Exit plays before the next beat takes over.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
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
                <PhaseControls
                  label="Enter"
                  defaultDuration={400}
                  value={entry?.enter}
                  onChange={(patch) => updatePhase(slot.name, 'enter', patch)}
                />
                <PhaseControls
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
