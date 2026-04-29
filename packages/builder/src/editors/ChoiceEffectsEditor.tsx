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
  // Step 4 / Phase A — character affect inline on choices and dialog nodes.
  nudgeMood: 'Nudge Mood',
  addSentiment: 'Add Sentiment',
  // Step 5 — fire an emotion at a character (auto-nudges mood per palette).
  fireEmotion: 'Fire Emotion',
  // Step 7 — append a reflection to a character's memory (Mode B only).
  addReflection: 'Add Reflection',
  // Step 8 — change a character's runtime goal status; auto-fires
  // pride/joy/shame/sadness unless suppressEmotion is set.
  setGoalStatus: 'Set Goal Status',
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
      {effects.map((effect, index) => {
        const isAffect = effect.type === 'nudgeMood' || effect.type === 'addSentiment' || effect.type === 'fireEmotion' || effect.type === 'addReflection' || effect.type === 'setGoalStatus';
        return (
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
              } else if (newType === 'nudgeMood') {
                // Mood deltas live on the effect record itself, not in `value`.
                updates.value = undefined;
                updates.valenceDelta = effect.valenceDelta ?? 0;
                updates.arousalDelta = effect.arousalDelta ?? 0;
              } else if (newType === 'addSentiment') {
                updates.value = undefined;
                updates.sentimentTarget = effect.sentimentTarget ?? '';
                updates.sentimentEmotion = effect.sentimentEmotion ?? '';
                updates.strengthDelta = effect.strengthDelta ?? 0.3;
              } else if (newType === 'fireEmotion') {
                updates.value = undefined;
                updates.emotion = effect.emotion ?? '';
                updates.emotionDelta = effect.emotionDelta ?? 0.3;
              } else if (newType === 'addReflection') {
                updates.value = undefined;
                updates.reflectionText = effect.reflectionText ?? '';
                updates.reflectionSalience = effect.reflectionSalience ?? 0.5;
              } else if (newType === 'setGoalStatus') {
                updates.value = undefined;
                (updates as any).goalId = (effect as any).goalId ?? '';
                (updates as any).goalStatus = (effect as any).goalStatus ?? 'met';
              }
              updateEffect(index, updates);
            }}
            className="px-1.5 py-1 text-xs border rounded bg-white flex-shrink-0"
          >
            {availableTypes.map(([type, label]) => (
              <option key={type} value={type}>{label}</option>
            ))}
          </select>

          {/* Target field */}
          {isAffect ? (
            // For affect effects, target = character (free-text input matching
            // the existing character-ref string convention used elsewhere).
            <input
              type="text"
              value={effect.target || ''}
              onChange={(e) => updateEffect(index, { target: e.target.value })}
              placeholder="character"
              className="px-1.5 py-1 text-xs border rounded flex-shrink-0 w-24"
              title="Character whose affect changes (id, name, or 'player')"
            />
          ) : (
            <SmartNameDropdown
              value={effect.target || ''}
              onChange={(val) => updateEffect(index, { target: val || '' })}
              options={getTargetOptions(effect.type)}
              placeholder="Name..."
              newItemLabel="+ New..."
              noSelectionLabel="Select..."
              className="flex-1 min-w-[80px]"
            />
          )}

          {/* Type-specific extra fields */}
          {effect.type === 'nudgeMood' && (
            <>
              <input
                type="number"
                step={0.1}
                value={effect.valenceDelta ?? 0}
                onChange={(e) => updateEffect(index, { valenceDelta: parseFloat(e.target.value) || 0 })}
                className="w-14 px-1.5 py-1 text-xs border rounded flex-shrink-0"
                placeholder="±valence"
                title="Valence delta — positive = happier, negative = sadder. Runtime clamps to [-1, 1]."
              />
              <input
                type="number"
                step={0.1}
                value={effect.arousalDelta ?? 0}
                onChange={(e) => updateEffect(index, { arousalDelta: parseFloat(e.target.value) || 0 })}
                className="w-14 px-1.5 py-1 text-xs border rounded flex-shrink-0"
                placeholder="±arousal"
                title="Arousal delta — positive = more excited, negative = calmer. Runtime clamps to [-1, 1]."
              />
            </>
          )}
          {effect.type === 'fireEmotion' && (
            <>
              <input
                type="text"
                value={effect.emotion || ''}
                onChange={(e) => updateEffect(index, { emotion: e.target.value })}
                placeholder="emotion"
                className="w-24 px-1.5 py-1 text-xs border rounded flex-shrink-0"
                title="Emotion name (e.g. joy, anger, fear). Looked up against the project's emotion palette."
              />
              <input
                type="number"
                step={0.1}
                value={effect.emotionDelta ?? 0}
                onChange={(e) => updateEffect(index, { emotionDelta: parseFloat(e.target.value) || 0 })}
                className="w-14 px-1.5 py-1 text-xs border rounded flex-shrink-0"
                placeholder="±intensity"
                title="Intensity delta (0–1 typical). Positive bumps the emotion; mood is auto-nudged via palette weights."
              />
            </>
          )}
          {effect.type === 'setGoalStatus' && (
            <>
              <input
                type="text"
                value={(effect as any).goalId || ''}
                onChange={(e) => updateEffect(index, { goalId: e.target.value } as any)}
                placeholder="goal-id"
                className="w-28 px-1.5 py-1 text-xs border rounded font-mono flex-shrink-0"
                title="Authored goal id (must match Character.goals[].id)"
              />
              <select
                value={(effect as any).goalStatus || 'met'}
                onChange={(e) => updateEffect(index, { goalStatus: e.target.value } as any)}
                className="px-1.5 py-1 text-xs border rounded bg-white flex-shrink-0"
                title="Status to flip the goal to. 'met' fires pride/joy; 'failed' fires shame/sadness; 'abandoned' is silent."
              >
                <option value="met">met</option>
                <option value="failed">failed</option>
                <option value="abandoned">abandoned</option>
                <option value="open">open</option>
              </select>
            </>
          )}
          {effect.type === 'addReflection' && (
            <>
              <input
                type="text"
                value={effect.reflectionText || ''}
                onChange={(e) => updateEffect(index, { reflectionText: e.target.value })}
                placeholder="reflection text"
                className="flex-1 min-w-[140px] px-1.5 py-1 text-xs border rounded"
                title="Short narrative note in the character's voice. Mode B only — characters with the default 'reAnchor' policy ignore reflections in their dossier."
              />
              <input
                type="number"
                step={0.1}
                min={0}
                max={1}
                value={effect.reflectionSalience ?? 0.5}
                onChange={(e) => updateEffect(index, { reflectionSalience: parseFloat(e.target.value) || 0 })}
                className="w-14 px-1.5 py-1 text-xs border rounded flex-shrink-0"
                placeholder="salience"
                title="0–1. Higher salience entries survive eviction longer when the per-character cap fills up."
              />
            </>
          )}
          {effect.type === 'addSentiment' && (
            <>
              <input
                type="text"
                value={effect.sentimentTarget || ''}
                onChange={(e) => updateEffect(index, { sentimentTarget: e.target.value })}
                placeholder="toward"
                className="w-20 px-1.5 py-1 text-xs border rounded flex-shrink-0"
                title="Entity the sentiment is directed at (character id, item, or any tag)"
              />
              <input
                type="text"
                value={effect.sentimentEmotion || ''}
                onChange={(e) => updateEffect(index, { sentimentEmotion: e.target.value })}
                placeholder="emotion"
                className="w-20 px-1.5 py-1 text-xs border rounded flex-shrink-0"
                title="Emotion label (trust, fear, anger, …)"
              />
              <input
                type="number"
                step={0.1}
                value={effect.strengthDelta ?? 0}
                onChange={(e) => updateEffect(index, { strengthDelta: parseFloat(e.target.value) || 0 })}
                className="w-14 px-1.5 py-1 text-xs border rounded flex-shrink-0"
                placeholder="±strength"
                title="Strength delta — positive strengthens the sentiment, negative weakens or inverts it."
              />
            </>
          )}

          {/* Standard value input */}
          {!isAffect && needsValue(effect.type) && (
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
        );
      })}

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
