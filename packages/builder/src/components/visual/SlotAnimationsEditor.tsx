/**
 * SlotAnimationsEditor — author-side surface for the P3-anim responsive
 * motion intent. Renders one card per resolvable slot of the beat (from
 * the schema's getSlotSpec / getSpatialSpec); each card binds an enter
 * preset + timing. Writes through to `beat.slotAnimations` via the
 * caller's onChange (which threads through the normal command path).
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

const ENTER_PRESETS: Array<{ value: SlotAnimationPreset | ''; label: string }> = [
  { value: '', label: 'Off (no animation)' },
  { value: 'fade', label: 'Fade' },
  { value: 'slide-in-left', label: 'Slide in from left' },
  { value: 'slide-in-right', label: 'Slide in from right' },
  { value: 'slide-in-top', label: 'Slide in from top' },
  { value: 'slide-in-bottom', label: 'Slide in from bottom' },
  { value: 'scale-in', label: 'Scale in' },
];

function slotsForBeat(beatType: string, mode: 'slot' | 'spatial'): SlotSpec[] {
  if (mode === 'spatial') return getSpatialSpec(beatType)?.slots ?? [];
  return getSlotSpec(beatType) ?? [];
}

function roleLabel(role: SlotSpec['role']): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export const SlotAnimationsEditor: React.FC<Props> = ({
  beatType,
  layoutMode,
  value,
  onChange,
}) => {
  const slots = slotsForBeat(beatType, layoutMode);

  const updateEnter = (slotName: string, patch: Partial<SlotAnimation> | null) => {
    const existing: SlotAnimationEntry | undefined = value?.[slotName];
    if (patch === null) {
      onChange(mergeSlotAnimations(value, slotName, { enter: undefined }));
      return;
    }
    const merged: SlotAnimation = { ...(existing?.enter ?? { preset: 'fade' }), ...patch } as SlotAnimation;
    onChange(mergeSlotAnimations(value, slotName, { enter: merged }));
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

  return (
    <div className="w-80 bg-white border-r border-gray-200 flex flex-col h-full">
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800">Animations</h2>
        <p className="mt-1 text-xs text-gray-500 leading-relaxed">
          Responsive enter animations — resolved against each slot's box at
          runtime, so they survive reflow and orientation changes.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {slots.map((slot) => {
          const entry = value?.[slot.name];
          const enter = entry?.enter;
          const preset = (enter?.preset ?? '') as SlotAnimationPreset | '';
          const isSlide = preset.startsWith('slide-in-');
          return (
            <div
              key={slot.name}
              className="rounded-md border border-gray-200 bg-gray-50 p-3"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium text-gray-800">
                  {slot.name}
                </div>
                <span className="text-[10px] uppercase tracking-wide text-gray-500 bg-white border border-gray-200 px-1.5 py-0.5 rounded">
                  {roleLabel(slot.role)}
                </span>
              </div>

              <label className="block text-[11px] text-gray-600 mb-1">Enter</label>
              <select
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={preset}
                onChange={(e) => {
                  const v = e.target.value as SlotAnimationPreset | '';
                  if (!v) updateEnter(slot.name, null);
                  else updateEnter(slot.name, { preset: v });
                }}
              >
                {ENTER_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>

              {enter && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-gray-600 mb-1">Duration (ms)</label>
                    <input
                      type="number"
                      min={0}
                      step={50}
                      placeholder="400"
                      value={enter.duration ?? ''}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const num = raw === '' ? undefined : Math.max(0, Number(raw));
                        updateEnter(slot.name, { duration: num });
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
                      value={enter.delay ?? ''}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const num = raw === '' ? undefined : Math.max(0, Number(raw));
                        updateEnter(slot.name, { delay: num });
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
                        value={enter.distance ?? ''}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const num = raw === '' ? undefined : Math.max(0, Number(raw));
                          updateEnter(slot.name, { distance: num });
                        }}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md bg-white"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
