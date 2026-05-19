import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Effect, EmotionDefinition } from '@asaps/core';
import { SmartNameDropdown, type DropdownOption } from './SmartNameDropdown';
import { CounterOwnerPicker } from '../components/CounterOwnerPicker';
import type { AvailableCounter } from '../hooks/useAvailableCountersAndVariables';
import type { AvailableVariable } from '../hooks/useAvailableCountersAndVariables';
import type { AvailableInventoryItem } from '../hooks/useAvailableCountersAndVariables';
import { DEFAULT_EFFECT_TEMPLATES, findEffectTemplate } from './effectTemplates';
import { summarizeChoiceEffects } from './summarizeChoiceEffects';

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
  // Switch which variant is active for a character (player picks "play
  // as introvert / extrovert" etc., or author wires a default).
  setCharacterVariant: 'Set Character Variant',
  // v0.9.45 — snapshot mood / emotion / sentiment state under a name so
  // future condition baselines can compare against it.
  bookmarkAffectState: 'Bookmark Affect State',
};

interface ChoiceEffectsEditorProps {
  effects: Effect[];
  onChange: (effects: Effect[]) => void;
  availableCounters: AvailableCounter[];
  availableVariables: AvailableVariable[];
  availableInventoryItems?: AvailableInventoryItem[];
  /** Available characters in the project — used to populate the
   *  target dropdown for affect-style effects (mood, sentiment,
   *  emotion, reflection, goal, character variant). Optional so
   *  hosts that don't have characters in scope can still use the
   *  editor; the field falls back to a free-text input. */
  availableCharacters?: ReadonlyArray<{ id: string; name?: string; displayName?: string }>;
  /** Project emotion palette — when supplied, the `fireEmotion` and
   *  `addSentiment`'s emotion fields render as comboboxes backed by
   *  the palette's emotion names (case-insensitive lookup; free-text
   *  still works for custom story emotions). */
  emotionPalette?: ReadonlyArray<EmotionDefinition>;
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
  availableCharacters,
  emotionPalette,
  hideInventory = false,
  compact = false,
}) => {
  // Build a dropdown-friendly options array from the available characters.
  // The user-facing label is the display name (or the `name`/`id` fallback);
  // the underlying value is always the stable Character.id, since that's
  // what the runtime resolves against (free-text would silently break when
  // the displayName is renamed or translated). The "id" is also surfaced
  // as a small hint so authors learn the convention.
  const characterOptions: DropdownOption[] = (availableCharacters || []).map((c) => ({
    name: c.id,
    displayName: c.displayName || c.name || c.id,
  }));
  // Always allow `player` as a sentinel target — many projects use it
  // without a Character record (the runtime resolves it via getInventoryEntries
  // and per-character buckets keyed by 'player').
  if (!characterOptions.some((o) => o.name === 'player')) {
    characterOptions.unshift({ name: 'player', displayName: 'Player' });
  }
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

  // ---------------------------------------------------------------------------
  // Effect templates (preset-shaped expansions of common author intents)
  //
  // Picking a template appends a coherent set of affect-stack effects to the
  // current list. The default character target is pulled from the existing
  // affect effect's target if any (so author chains stay consistent within
  // one choice); otherwise falls back to the first non-player character in
  // the project, then to free-text 'player'. Templates are aware of which
  // counters exist in the project so they don't seed maxSupport / failedSupport
  // rows in stories that don't track them.
  // ---------------------------------------------------------------------------
  const counterNames = availableCounters.map((c) => c.name);
  const inferTargetForTemplate = (): string => {
    const existingAffect = effects.find((e) =>
      e.type === 'nudgeMood' || e.type === 'fireEmotion' || e.type === 'addSentiment'
      || e.type === 'addReflection' || e.type === 'setGoalStatus' || e.type === 'setCharacterVariant'
    );
    if (existingAffect?.target) return existingAffect.target;
    const firstNonPlayer = (availableCharacters || []).find((c) => c.id !== 'player');
    return firstNonPlayer?.id || 'player';
  };
  const applyTemplate = (templateId: string) => {
    const template = findEffectTemplate(templateId);
    if (!template) return;
    const target = inferTargetForTemplate();
    const newEffects = template.forge({ target, playerRef: 'player', counters: counterNames });
    onChange([...effects, ...newEffects]);
  };

  // Lookup palette emotion names for the combobox (case-insensitive
  // de-dup, sorted by canonical case from the palette).
  const paletteEmotionNames = (emotionPalette || []).map((e) => e.name);

  if (effects.length === 0) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={addEffect}
          className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
        >
          <Plus className="w-3 h-3" />
          Add Effect
        </button>
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) {
              applyTemplate(e.target.value);
              (e.target as HTMLSelectElement).value = '';
            }
          }}
          className="text-xs px-2 py-1 border rounded bg-white"
          title="Apply a preset bundle of affect effects (mood, emotion, sentiment, reflection) tuned for a common author intent. Tweak the values afterward to taste."
        >
          <option value="">— or apply a template —</option>
          {DEFAULT_EFFECT_TEMPLATES.map((t) => (
            <option key={t.id} value={t.id} title={t.description}>{t.name}</option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className={`space-y-1.5 ${compact ? '' : 'p-2 bg-gray-50 rounded'}`}>
      {effects.map((effect, index) => {
        const isAffect = effect.type === 'nudgeMood' || effect.type === 'addSentiment' || effect.type === 'fireEmotion' || effect.type === 'addReflection' || effect.type === 'setGoalStatus' || effect.type === 'setCharacterVariant'
          // bookmarkAffectState only takes a character target when scope='character'.
          || (effect.type === 'bookmarkAffectState' && (effect as any).scope === 'character');
        // Hide the target field entirely for scope='all' bookmark snapshots —
        // the snapshot covers every character so there's nothing to address.
        const hideTarget = effect.type === 'bookmarkAffectState' && (effect as any).scope !== 'character';
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
              } else if (newType === 'setCharacterVariant') {
                updates.value = undefined;
                (updates as any).variantId = (effect as any).variantId ?? '';
              } else if (newType === 'bookmarkAffectState') {
                // Bookmark snapshots mood / emotion / sentiment state under
                // an author-named handle. Default scope is 'all' (no target
                // needed); narrowing to a single character is opt-in.
                updates.value = undefined;
                updates.target = effect.target ?? '';
                (updates as any).bookmarkName = (effect as any).bookmarkName ?? '';
                (updates as any).scope = (effect as any).scope ?? 'all';
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
          {hideTarget ? null : isAffect ? (
            // Affect effects target a character — present a SmartNameDropdown
            // backed by the project's actual character roster (plus the
            // sentinel "player"). Falls back to a free-text input only when
            // the host didn't pass `availableCharacters`, e.g. compact
            // sub-editors that don't have the project state in scope.
            characterOptions.length > 0 ? (
              <SmartNameDropdown
                value={effect.target || ''}
                onChange={(val) => updateEffect(index, { target: val || '' })}
                options={characterOptions}
                placeholder="Character..."
                noSelectionLabel="Select character..."
                className="flex-shrink-0 min-w-[110px]"
              />
            ) : (
              <input
                type="text"
                value={effect.target || ''}
                onChange={(e) => updateEffect(index, { target: e.target.value })}
                placeholder="character"
                className="px-1.5 py-1 text-xs border rounded flex-shrink-0 w-24"
                title="Character whose affect changes (id, name, or 'player')"
              />
            )
          ) : effect.type === 'incrementCounter' || effect.type === 'setCounter' ? (
            // A counter is the (name, owner) pair — pick it atomically so the
            // selection can't be ambiguous between same-named per-character
            // counters (e.g. Player.Health vs Merchant.Health).
            <CounterOwnerPicker
              compact
              label="Counter"
              counters={availableCounters}
              characters={(availableCharacters || []).map((c) => ({
                id: c.id,
                name: c.name,
                displayName: c.displayName,
              }))}
              name={effect.target || ''}
              character={effect.character || ''}
              onChange={(n, ch) =>
                updateEffect(index, { target: n, character: ch || undefined })
              }
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
              <div className="flex items-center gap-1 flex-shrink-0" title="Valence delta — positive = happier, negative = sadder. Runtime clamps to [-1, 1].">
                <span className="text-[10px] text-gray-500 select-none">val</span>
                <input
                  type="number"
                  step={0.1}
                  value={effect.valenceDelta ?? 0}
                  onChange={(e) => updateEffect(index, { valenceDelta: parseFloat(e.target.value) || 0 })}
                  className="w-14 px-1.5 py-1 text-xs border rounded"
                  placeholder="±0.0"
                />
              </div>
              <div className="flex items-center gap-1 flex-shrink-0" title="Arousal delta — positive = more excited, negative = calmer. Runtime clamps to [-1, 1].">
                <span className="text-[10px] text-gray-500 select-none">aro</span>
                <input
                  type="number"
                  step={0.1}
                  value={effect.arousalDelta ?? 0}
                  onChange={(e) => updateEffect(index, { arousalDelta: parseFloat(e.target.value) || 0 })}
                  className="w-14 px-1.5 py-1 text-xs border rounded"
                  placeholder="±0.0"
                />
              </div>
            </>
          )}
          {effect.type === 'fireEmotion' && (
            <>
              <div className="flex-shrink-0" title="Emotion name. Pick from the project's palette or type a custom name. Palette emotions auto-nudge mood via their authored weights.">
                <input
                  type="text"
                  list={`fire-emotion-options-${index}`}
                  value={effect.emotion || ''}
                  onChange={(e) => updateEffect(index, { emotion: e.target.value })}
                  placeholder="emotion"
                  className="w-24 px-1.5 py-1 text-xs border rounded"
                />
                <datalist id={`fire-emotion-options-${index}`}>
                  {paletteEmotionNames.map((n) => <option key={n} value={n} />)}
                </datalist>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0" title="Intensity delta (typical -1 to +1). Positive bumps the emotion; mood is auto-nudged via palette weights.">
                <span className="text-[10px] text-gray-500 select-none">Δ</span>
                <input
                  type="number"
                  step={0.1}
                  value={effect.emotionDelta ?? 0}
                  onChange={(e) => updateEffect(index, { emotionDelta: parseFloat(e.target.value) || 0 })}
                  className="w-14 px-1.5 py-1 text-xs border rounded"
                  placeholder="±0.0"
                />
              </div>
            </>
          )}
          {effect.type === 'setCharacterVariant' && (
            <input
              type="text"
              value={(effect as any).variantId || ''}
              onChange={(e) => updateEffect(index, { variantId: e.target.value } as any)}
              placeholder="variant-id"
              className="w-32 px-1.5 py-1 text-xs border rounded font-mono flex-shrink-0"
              title="Authored variant id (must match Character.variants[].id). Empty clears the active variant."
            />
          )}
          {effect.type === 'bookmarkAffectState' && (
            <>
              <input
                type="text"
                value={(effect as any).bookmarkName || ''}
                onChange={(e) => updateEffect(index, { bookmarkName: e.target.value } as any)}
                placeholder="bookmark-name"
                className="w-40 px-1.5 py-1 text-xs border rounded font-mono flex-shrink-0"
                title="Author-named handle for this snapshot. Reference it later from a condition's 'Compared to: bookmark' switch."
              />
              <select
                value={(effect as any).scope || 'all'}
                onChange={(e) => updateEffect(index, { scope: e.target.value } as any)}
                className="px-1.5 py-1 text-xs border rounded bg-white flex-shrink-0"
                title="all = snapshot every character's mood/emotion/sentiment. character = snapshot only the target character."
              >
                <option value="all">scope: all characters</option>
                <option value="character">scope: target only</option>
              </select>
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
              <div className="flex items-center gap-1 flex-shrink-0" title="Salience 0–1. Higher entries survive longer when the per-character reflection cap (32 entries) fills up. Reserve > 0.7 for moments the character will never forget.">
                <span className="text-[10px] text-gray-500 select-none">sal</span>
                <input
                  type="number"
                  step={0.1}
                  min={0}
                  max={1}
                  value={effect.reflectionSalience ?? 0.5}
                  onChange={(e) => updateEffect(index, { reflectionSalience: parseFloat(e.target.value) || 0 })}
                  className="w-14 px-1.5 py-1 text-xs border rounded"
                  placeholder="0.5"
                />
              </div>
            </>
          )}
          {effect.type === 'addSentiment' && (
            <>
              <div className="flex items-center gap-1 flex-shrink-0" title="Entity the sentiment is directed at — character id, 'player', inventory item, or any tag. Pointing at the holder character ⇒ self-directed sentiment.">
                <span className="text-[10px] text-gray-500 select-none">→</span>
                <input
                  type="text"
                  list={`sentiment-target-options-${index}`}
                  value={effect.sentimentTarget || ''}
                  onChange={(e) => updateEffect(index, { sentimentTarget: e.target.value })}
                  placeholder="toward"
                  className="w-24 px-1.5 py-1 text-xs border rounded"
                />
                <datalist id={`sentiment-target-options-${index}`}>
                  <option value="player" />
                  {(availableCharacters || []).map((c) => (
                    <option key={c.id} value={c.id} label={c.displayName || c.name || c.id} />
                  ))}
                </datalist>
              </div>
              <div className="flex-shrink-0" title="Emotion label — pick from the project palette or type a custom one (trust, fear, anger, gratitude, …)">
                <input
                  type="text"
                  list={`sentiment-emotion-options-${index}`}
                  value={effect.sentimentEmotion || ''}
                  onChange={(e) => updateEffect(index, { sentimentEmotion: e.target.value })}
                  placeholder="emotion"
                  className="w-24 px-1.5 py-1 text-xs border rounded"
                />
                <datalist id={`sentiment-emotion-options-${index}`}>
                  {paletteEmotionNames.map((n) => <option key={n} value={n} />)}
                  {/* Common sentiment-only emotions that aren't typically in the palette */}
                  <option value="trust" />
                  <option value="gratitude" />
                </datalist>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0" title="Strength delta (typical -1 to +1). Positive strengthens the sentiment, negative weakens or inverts it. Trust and mistrust live on the same axis with opposite signs.">
                <span className="text-[10px] text-gray-500 select-none">Δ</span>
                <input
                  type="number"
                  step={0.1}
                  value={effect.strengthDelta ?? 0}
                  onChange={(e) => updateEffect(index, { strengthDelta: parseFloat(e.target.value) || 0 })}
                  className="w-14 px-1.5 py-1 text-xs border rounded"
                  placeholder="±0.0"
                />
              </div>
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

      <div className="flex items-center gap-2 flex-wrap pt-1">
        <button
          type="button"
          onClick={addEffect}
          className="flex items-center gap-1 px-2 py-0.5 text-xs text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
        >
          <Plus className="w-3 h-3" />
          Add Effect
        </button>
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) {
              applyTemplate(e.target.value);
              (e.target as HTMLSelectElement).value = '';
            }
          }}
          className="text-xs px-2 py-0.5 border rounded bg-white text-gray-600"
          title="Append a preset bundle of affect effects tuned for a common author intent. Tweak values afterward to taste."
        >
          <option value="">+ apply template…</option>
          {DEFAULT_EFFECT_TEMPLATES.map((t) => (
            <option key={t.id} value={t.id} title={t.description}>{t.name}</option>
          ))}
        </select>
      </div>

      {/* Live "what does this choice do?" summary — synthesises a one-line
          reading of every effect in plain language. Updates on every value
          change so authors can sanity-check that the numbers do what they
          think. Empty when there's nothing to say (no meaningful deltas). */}
      {(() => {
        const summary = summarizeChoiceEffects(effects, availableCharacters);
        if (!summary) return null;
        return (
          <div
            className="text-[11px] text-gray-600 italic bg-blue-50/40 border-l-2 border-blue-200 px-2 py-1 mt-1 rounded-r"
            title="Live reading of the cumulative effect of this choice — updates as you tweak values. The runtime applies these effects when the player selects this option."
          >
            <span className="not-italic text-blue-700 font-medium mr-1">→</span>
            {summary}
          </div>
        );
      })()}
    </div>
  );
};
