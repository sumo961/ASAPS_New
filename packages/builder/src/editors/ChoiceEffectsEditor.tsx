import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Effect } from '@asaps/core';
import { SmartNameDropdown, type DropdownOption } from './SmartNameDropdown';
import type { AvailableCounter } from '../hooks/useAvailableCountersAndVariables';
import type { AvailableVariable } from '../hooks/useAvailableCountersAndVariables';
import type { AvailableInventoryItem } from '../hooks/useAvailableCountersAndVariables';

type EffectType = Effect['type'];

const EFFECT_TYPE_LABELS: Record<EffectType, string> = {
  incrementCounter: 'Change Counter',
  setCounter: 'Set Counter',
  setVariable: 'Set Variable',
  addInventory: 'Add Inventory',
  removeInventory: 'Remove Inventory',
};

interface ChoiceEffectsEditorProps {
  effects: Effect[];
  onChange: (effects: Effect[]) => void;
  availableCounters: AvailableCounter[];
  availableVariables: AvailableVariable[];
  availableInventoryItems?: AvailableInventoryItem[];
  /** Hide inventory effect types (for pickProp which handles inventory inherently) */
  hideInventory?: boolean;
  compact?: boolean;
}

export const ChoiceEffectsEditor: React.FC<ChoiceEffectsEditorProps> = ({
  effects,
  onChange,
  availableCounters,
  availableVariables,
  availableInventoryItems = [],
  hideInventory = false,
  compact = false,
}) => {
  const counterOptions: DropdownOption[] = availableCounters.map(c => ({
    name: c.name,
    displayName: c.displayName,
    characterName: c.characterName,
  }));

  const variableOptions: DropdownOption[] = availableVariables.map(v => ({
    name: v.name,
    displayName: v.description ? `${v.name} (${v.description})` : v.name,
  }));

  const inventoryOptions: DropdownOption[] = availableInventoryItems.map(i => ({
    name: i.name,
    displayName: i.displayName,
    characterName: i.characterName,
  }));

  const getTargetOptions = (type: EffectType): DropdownOption[] => {
    switch (type) {
      case 'incrementCounter':
      case 'setCounter':
        return counterOptions;
      case 'setVariable':
        return variableOptions;
      case 'addInventory':
      case 'removeInventory':
        return inventoryOptions;
      default:
        return [];
    }
  };

  const needsValue = (type: EffectType): boolean => {
    return type === 'incrementCounter' || type === 'setCounter' || type === 'setVariable';
  };

  const isNumericValue = (type: EffectType): boolean => {
    return type === 'incrementCounter' || type === 'setCounter';
  };

  const updateEffect = (index: number, updates: Partial<Effect>) => {
    const newEffects = [...effects];
    newEffects[index] = { ...newEffects[index], ...updates } as Effect;
    onChange(newEffects);
  };

  const removeEffect = (index: number) => {
    onChange(effects.filter((_, i) => i !== index));
  };

  const addEffect = () => {
    onChange([...effects, { type: 'incrementCounter', target: '', value: 1 }]);
  };

  const availableTypes = Object.entries(EFFECT_TYPE_LABELS).filter(
    ([type]) => !hideInventory || (type !== 'addInventory' && type !== 'removeInventory')
  );

  if (effects.length === 0) {
    return (
      <button
        type="button"
        onClick={addEffect}
        className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
      >
        <Plus className="w-3 h-3" />
        Add Effect
      </button>
    );
  }

  return (
    <div className={`space-y-1.5 ${compact ? '' : 'p-2 bg-gray-50 rounded'}`}>
      {effects.map((effect, index) => (
        <div key={index} className="flex flex-wrap gap-1 items-center">
          {/* Type dropdown */}
          <select
            value={effect.type}
            onChange={(e) => {
              const newType = e.target.value as EffectType;
              const updates: Partial<Effect> = { type: newType };
              // Reset value for inventory types (no value needed)
              if (newType === 'addInventory' || newType === 'removeInventory') {
                updates.value = undefined;
              } else if (newType === 'incrementCounter' || newType === 'setCounter') {
                updates.value = effect.value ?? 1;
              } else if (newType === 'setVariable') {
                updates.value = effect.value ?? '';
              }
              updateEffect(index, updates);
            }}
            className="px-1.5 py-1 text-xs border rounded bg-white flex-shrink-0"
          >
            {availableTypes.map(([type, label]) => (
              <option key={type} value={type}>{label}</option>
            ))}
          </select>

          {/* Target dropdown */}
          <SmartNameDropdown
            value={effect.target || ''}
            onChange={(val) => updateEffect(index, { target: val || '' })}
            options={getTargetOptions(effect.type)}
            placeholder="Name..."
            newItemLabel="+ New..."
            noSelectionLabel="Select..."
            className="flex-1 min-w-[80px]"
          />

          {/* Value input */}
          {needsValue(effect.type) && (
            isNumericValue(effect.type) ? (
              <input
                type="number"
                value={effect.value ?? 0}
                onChange={(e) => updateEffect(index, { value: parseInt(e.target.value) || 0 })}
                className="w-14 px-1.5 py-1 text-xs border rounded flex-shrink-0"
                placeholder="0"
              />
            ) : (
              <input
                type="text"
                value={effect.value ?? ''}
                onChange={(e) => updateEffect(index, { value: e.target.value })}
                className="w-20 px-1.5 py-1 text-xs border rounded flex-shrink-0"
                placeholder="value"
              />
            )
          )}

          {/* Remove button */}
          <button
            type="button"
            onClick={() => removeEffect(index)}
            className="p-0.5 text-gray-400 hover:text-red-500 rounded flex-shrink-0"
            title="Remove effect"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={addEffect}
        className="flex items-center gap-1 px-2 py-0.5 text-xs text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
      >
        <Plus className="w-3 h-3" />
        Add Effect
      </button>
    </div>
  );
};
