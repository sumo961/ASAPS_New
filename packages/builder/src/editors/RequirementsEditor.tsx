/**
 * RequirementsEditor — universal UI for a beat's state prerequisites.
 *
 * A requirement has a condition, a human-readable explanation, a severity used
 * by the path analyzer, and an optional `fallbackTarget` beat. At runtime, when
 * a beat is entered and a requirement is unmet, the engine redirects to the
 * fallbackTarget (or just logs a warning if none is set).
 */

import React from 'react';
import { Plus, Trash2, ShieldCheck } from 'lucide-react';
import type { Beat } from '@asaps/core';
import type { StateRequirement, Condition } from '@asaps/core';
import { SmartNameDropdown } from './SmartNameDropdown';

interface AvailableOption {
  name: string;
  displayName: string;
  characterName?: string;
}

interface RequirementsEditorProps {
  value: StateRequirement[] | undefined;
  onChange: (value: StateRequirement[]) => void;
  /** How multiple requirements combine: 'all' (AND) or 'any' (OR). */
  mode?: 'all' | 'any';
  onModeChange?: (mode: 'all' | 'any') => void;
  allBeats: Beat[];
  availableCounters: AvailableOption[];
  availableVariables: AvailableOption[];
  availableInventoryItems: AvailableOption[];
}

type CondType = 'inventory' | 'counter' | 'variable' | 'visitedBeat';

function emptyRequirement(): StateRequirement {
  return {
    condition: { type: 'inventory', operator: '==', item: '', value: true } as any,
    explanation: '',
    severity: 'error',
  };
}

/** Narrow guard so we can read the `type` field off any Condition shape. */
function condType(c: Condition): CondType {
  const t = (c as any).type;
  if (t === 'counter' || t === 'variable' || t === 'inventory' || t === 'visitedBeat') return t;
  return 'inventory';
}

export const RequirementsEditor: React.FC<RequirementsEditorProps> = ({
  value,
  onChange,
  mode = 'all',
  onModeChange,
  allBeats,
  availableCounters,
  availableVariables,
  availableInventoryItems,
}) => {
  const items = value ?? [];

  const update = (idx: number, patch: Partial<StateRequirement>) => {
    const next = items.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    onChange(next);
  };

  const updateCondition = (idx: number, patch: Partial<Condition>) => {
    const current = items[idx]?.condition ?? ({} as Condition);
    const next = items.map((r, i) =>
      i === idx ? { ...r, condition: { ...current, ...patch } as Condition } : r,
    );
    onChange(next);
  };

  const remove = (idx: number) => onChange(items.filter((_, i) => i !== idx));
  const add = () => onChange([...items, emptyRequirement()]);

  /** Swap the condition type and reset shape-specific fields so we don't leave
   *  stale properties from the previous type. */
  const changeType = (idx: number, newType: CondType) => {
    let newCond: Condition;
    switch (newType) {
      case 'counter':
        newCond = { type: 'counter', operator: '>=', variableName: '', value: 1 } as any;
        break;
      case 'variable':
        newCond = { type: 'variable', operator: '==', variableName: '', value: true } as any;
        break;
      case 'inventory':
        newCond = { type: 'inventory', operator: '==', item: '', value: true } as any;
        break;
      case 'visitedBeat':
        newCond = { type: 'visitedBeat', beatId: '', value: true } as any;
        break;
    }
    update(idx, { condition: newCond });
  };

  return (
    <div className="space-y-3">
      {items.length === 0 && (
        <p className="text-xs text-gray-500 italic">
          No requirements declared. Use Requirements to gate a beat behind state — e.g. "player
          must have the lantern", "code has been discovered", "counter ≥ 3". When unmet at
          runtime, the engine redirects to the requirement's fallback beat.
        </p>
      )}

      {/* Combination mode — only shown when there are 2+ requirements */}
      {items.length >= 2 && onModeChange && (
        <div className="flex items-center gap-2 text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1.5">
          <span className="font-medium text-gray-700">Combine with:</span>
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="radio"
              checked={mode === 'all'}
              onChange={() => onModeChange('all')}
              className="accent-amber-600"
            />
            <span>AND (all must hold)</span>
          </label>
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="radio"
              checked={mode === 'any'}
              onChange={() => onModeChange('any')}
              className="accent-amber-600"
            />
            <span>OR (any is enough)</span>
          </label>
        </div>
      )}

      {items.map((req, idx) => {
        const cond = req.condition;
        const t = condType(cond);

        return (
          <div
            key={idx}
            className="border border-amber-300 bg-amber-50/40 rounded-lg p-3 space-y-2"
          >
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span className="text-xs font-medium text-amber-800">Requirement {idx + 1}</span>
              <button
                type="button"
                onClick={() => remove(idx)}
                className="ml-auto p-1 text-gray-500 hover:text-red-600 rounded"
                title="Remove this requirement"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Condition type */}
            <div>
              <label className="block text-[11px] font-medium text-gray-700 mb-0.5">
                Condition
              </label>
              <select
                value={t}
                onChange={e => changeType(idx, e.target.value as CondType)}
                className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
              >
                <option value="inventory">Has item</option>
                <option value="counter">Counter compared to value</option>
                <option value="variable">Variable equals value</option>
                <option value="visitedBeat">Visited beat</option>
              </select>
            </div>

            {/* Per-type condition body */}
            {t === 'inventory' && (
              <div className="grid grid-cols-2 gap-2">
                <SmartNameDropdown
                  value={(cond as any).item || ''}
                  onChange={v => updateCondition(idx, { item: v || '' } as any)}
                  options={availableInventoryItems}
                  placeholder="item name"
                  newItemLabel="+ New item…"
                  noSelectionLabel="Select item…"
                  className="w-full"
                />
                <select
                  value={(cond as any).operator || '=='}
                  onChange={e => updateCondition(idx, { operator: e.target.value } as any)}
                  className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                >
                  <option value="==">Has</option>
                  <option value="!=">Does not have</option>
                </select>
              </div>
            )}

            {t === 'counter' && (
              <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
                <SmartNameDropdown
                  value={(cond as any).variableName || ''}
                  onChange={v => updateCondition(idx, { variableName: v || '' } as any)}
                  options={availableCounters}
                  placeholder="counter"
                  newItemLabel="+ New counter…"
                  noSelectionLabel="Select counter…"
                  className="w-full"
                />
                <select
                  value={(cond as any).operator || '>='}
                  onChange={e => updateCondition(idx, { operator: e.target.value } as any)}
                  className="px-2 py-1 border border-gray-300 rounded text-xs"
                >
                  <option value=">=">≥</option>
                  <option value=">">&gt;</option>
                  <option value="<=">≤</option>
                  <option value="<">&lt;</option>
                  <option value="==">=</option>
                  <option value="!=">≠</option>
                </select>
                <input
                  type="number"
                  value={(cond as any).value ?? 0}
                  onChange={e =>
                    updateCondition(idx, { value: parseInt(e.target.value, 10) || 0 } as any)
                  }
                  className="w-16 px-2 py-1 border border-gray-300 rounded text-xs"
                />
              </div>
            )}

            {t === 'variable' && (
              <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
                <SmartNameDropdown
                  value={(cond as any).variableName || ''}
                  onChange={v => updateCondition(idx, { variableName: v || '' } as any)}
                  options={availableVariables}
                  placeholder="variable"
                  newItemLabel="+ New variable…"
                  noSelectionLabel="Select variable…"
                  className="w-full"
                />
                <select
                  value={(cond as any).operator || '=='}
                  onChange={e => updateCondition(idx, { operator: e.target.value } as any)}
                  className="px-2 py-1 border border-gray-300 rounded text-xs"
                >
                  <option value="==">=</option>
                  <option value="!=">≠</option>
                </select>
                <input
                  type="text"
                  value={String((cond as any).value ?? '')}
                  onChange={e => {
                    const raw = e.target.value;
                    // Best-effort type coercion: true/false → boolean, number-ish → number
                    let coerced: any = raw;
                    if (raw === 'true') coerced = true;
                    else if (raw === 'false') coerced = false;
                    else if (raw !== '' && !isNaN(Number(raw))) coerced = Number(raw);
                    updateCondition(idx, { value: coerced } as any);
                  }}
                  placeholder="value (true/false/number/text)"
                  className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                />
              </div>
            )}

            {t === 'visitedBeat' && (
              <select
                value={(cond as any).beatId || ''}
                onChange={e => updateCondition(idx, { beatId: e.target.value } as any)}
                className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
              >
                <option value="">Select beat…</option>
                {allBeats.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.name || b.id} ({b.id})
                  </option>
                ))}
              </select>
            )}

            {/* Explanation */}
            <div>
              <label className="block text-[11px] font-medium text-gray-700 mb-0.5">
                Explanation (shown to authors; drives AI + analyzer messages)
              </label>
              <textarea
                value={req.explanation}
                onChange={e => update(idx, { explanation: e.target.value })}
                placeholder="e.g. Player must have discovered the crypt code."
                className="w-full px-2 py-1 border border-gray-300 rounded text-xs resize-y min-h-[44px]"
                rows={2}
              />
            </div>

            {/* Fallback target */}
            <div>
              <label className="block text-[11px] font-medium text-gray-700 mb-0.5">
                If unmet, redirect to
              </label>
              <select
                value={req.fallbackTarget || ''}
                onChange={e =>
                  update(idx, { fallbackTarget: e.target.value || undefined })
                }
                className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
              >
                <option value="">— no redirect (log warning only) —</option>
                {allBeats.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.name || b.id} ({b.id})
                  </option>
                ))}
              </select>
            </div>

            {/* Severity */}
            <div>
              <label className="block text-[11px] font-medium text-gray-700 mb-0.5">
                Analyzer severity when no path satisfies this requirement
              </label>
              <select
                value={req.severity || 'error'}
                onChange={e =>
                  update(idx, { severity: e.target.value as 'warn' | 'error' })
                }
                className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
              >
                <option value="error">Error (soft-lock)</option>
                <option value="warn">Warning</option>
              </select>
            </div>
          </div>
        );
      })}

      <button
        type="button"
        onClick={add}
        className="w-full py-1.5 px-3 border border-dashed border-amber-400 text-amber-700 rounded-lg text-xs hover:bg-amber-50 flex items-center justify-center gap-1.5"
      >
        <Plus className="w-3.5 h-3.5" />
        Add requirement
      </button>
    </div>
  );
};
