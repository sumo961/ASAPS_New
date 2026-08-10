import React, { useState } from 'react';
import { Variable, Box, Timer, User, ChevronDown, ChevronRight, Plus, Trash2, Shuffle } from 'lucide-react';
import type { Beat } from '@asaps/core';
import { describeMoodAxis } from '@asaps/core';
import type { AvailableCounter, AvailableVariable } from '../hooks/useAvailableCountersAndVariables';
import { CharacterRefField, type UsedName } from './characters/CharacterRefField';
import { CounterOwnerPicker } from './CounterOwnerPicker';
import { GpsPointCurator } from './visual/GpsPointCurator';

// Type definitions for beat schema
interface ParameterDefinition {
  type: string;
  required?: boolean;
  default?: any;
  description?: string;
  minItems?: number;
  // For array<object> types - defines the schema for each item
  itemSchema?: Record<string, ParameterDefinition>;
  // For fields that reference beats (target selectors)
  targetField?: boolean;
  ui?: {
    control?: 'text' | 'textarea' | 'select' | 'number' | 'text-variations' | 'speaker' | 'speaker-visibility' | 'npc-character' | 'character-ref' | 'affect-slider' | 'counter-owner' | 'gps-point-curator';
    /** For 'affect-slider' control: end-cap labels — [low, high]. */
    axisLabels?: [string, string];
    /** For 'affect-slider' control: optional axis hint passed through to the
     * qualitative summary helper ('valence' / 'arousal'); when set, the live
     * preview shows what the resulting nudge "feels like" using describeMoodAxis. */
    affectAxis?: 'valence' | 'arousal';
    options?: (string | { value: string; label: string })[];
    label?: string;
    min?: number;
    max?: number;
    step?: number;
    rows?: number;
    // For arrays - label for add button
    addLabel?: string;
    // For arrays - label for each item
    itemLabel?: string;
    // Help text shown below the field
    help?: string;
    // Hint text shown below select fields (e.g. recommendations)
    hint?: string;
    // Conditional visibility - only show when another field has the specified value
    dependsOn?: { field: string; value: any };
    // Visual grouping - fields sharing the same group render inside a bordered container
    group?: string;
    // Scope:
    //   'beat'    — top-level beat property, not a parameter
    //   've-left' — owned by the Visual Editor's left sidebar (Inspector skips it)
    scope?: 'beat' | 've-left';
    // Hide field from the Inspector (managed elsewhere, e.g. in the Visual Editor)
    hidden?: boolean;
  };
}

interface BeatDefinition {
  category: 'visible' | 'invisible';
  displayName: string;
  icon: string;
  description: string;
  connectionType: 'single' | 'multiple' | 'conditional' | 'none';
  parameters: Record<string, ParameterDefinition>;
  locations?: string[];
}

interface SchemaFormGeneratorProps {
  beatType: string;
  beatDefinition: BeatDefinition;
  parameters: Record<string, any>;
  onParameterChange: (param: string, value: any) => void;
  /** Atomic multi-param update (used by CounterOwnerPicker which sets name +
   * owner together). Falls back to sequential onParameterChange if absent. */
  onParametersChange?: (patch: Record<string, any>) => void;
  availableTargets?: Beat[];
  characters?: any[];
  playerCharacterName?: string;
  // Available counters and variables for dropdowns
  availableCounters?: AvailableCounter[];
  availableVariables?: AvailableVariable[];
  // Callbacks for special cases
  customRenderers?: Record<string, (param: string, def: ParameterDefinition) => React.ReactNode>;
  // Translation mode: source parameter values to show as dimmed reference below text fields.
  // When set, indicates translation mode is active.
  translationSourceHints?: Record<string, any>;
  // Full character objects for npc-character control (sync personality, etc.)
  characterObjects?: Array<{ id: string; name: string; displayName?: string; role?: string; description?: string }>;
  // Callback to sync NPC name/personality back to character definitions
  onCharacterSync?: (npcName: string, updates: { description?: string }) => void;
  // Top-level beat properties (speaker, showSpeaker) — values read from here, not parameters
  beatProperties?: Record<string, any>;
  // Callback for top-level beat property changes (scope: 'beat' fields)
  onBeatPropertyChange?: (field: string, value: any) => void;
  /** Free-text speaker / character names used elsewhere in the project — drives
   * the "Used names" section of the new <CharacterRefField> combobox. */
  usedNames?: ReadonlyArray<UsedName>;
  /** Called when the user clicks "Define '<name>' as a Character" in the
   * speaker combobox. Parent typically opens the Character Manager prefilled. */
  onDefineAsCharacter?: (name: string) => void;
  /** Opens the AI "Develop character" dialog (rendered by the host app).
   * The npc-character control seeds it from the beat's scenario +
   * npcPersonality and links the accepted character back into the beat. */
  onDevelopCharacter?: (
    session: import('./characters/CharacterDevelopmentDialog').CharacterDevelopmentSession,
  ) => void;
}

// Map alias beat types to their canonical schema types
const BEAT_TYPE_ALIASES: Record<string, string> = {
  'variable': 'setVariable',
  'counter': 'setVariable',
  'setCounter': 'setVariable',
  'setGlobal': 'setVariable',
  'condition': 'conditionBeat',
  'conditionCheck': 'conditionBeat',
  'addInventory': 'addRemoveInventory',
  'removeInventory': 'addRemoveInventory',
};

/**
 * Collapsible editor for text variations
 * Shows variations in a collapsible section with add/remove functionality
 */
interface TextVariationsEditorProps {
  items: string[];
  label: string;
  addLabel: string;
  helpText: string;
  onChange: (items: string[]) => void;
}

const TextVariationsEditor: React.FC<TextVariationsEditorProps> = ({
  items,
  label,
  addLabel,
  helpText,
  onChange,
}) => {
  const [isExpanded, setIsExpanded] = useState(items.length > 0);

  const handleAdd = () => {
    onChange([...items, '']);
    setIsExpanded(true);
  };

  const handleRemove = (index: number) => {
    const newItems = items.filter((_, i) => i !== index);
    onChange(newItems);
  };

  const handleUpdate = (index: number, value: string) => {
    const newItems = [...items];
    newItems[index] = value;
    onChange(newItems);
  };

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-500" />
          )}
          <Shuffle className="w-4 h-4 text-purple-500" />
          <span className="text-sm font-medium text-gray-700">{label}</span>
          {items.length > 0 && (
            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
              {items.length} variation{items.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="p-3 space-y-2 bg-white">
          {items.length === 0 && (
            <p className="text-xs text-gray-500 italic py-1">
              No variations defined. Only the main text will be shown.
            </p>
          )}

          {items.map((item, index) => (
            <div key={index} className="flex gap-2">
              <textarea
                value={item}
                onChange={(e) => handleUpdate(index, e.target.value)}
                placeholder={`Variation ${index + 1}`}
                className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm resize-none"
                rows={2}
              />
              <button
                type="button"
                onClick={() => handleRemove(index)}
                className="text-red-500 hover:text-red-700 p-1 self-start mt-1"
                title="Remove variation"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={handleAdd}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-purple-500 text-white rounded hover:bg-purple-600"
          >
            <Plus className="w-3 h-3" />
            {addLabel}
          </button>

          <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
            <Shuffle className="w-3 h-3" />
            {helpText}
          </p>
        </div>
      )}
    </div>
  );
};

/**
 * Schema-driven form field generator
 * Reads beat definitions and generates appropriate form fields
 */
export const SchemaFormGenerator: React.FC<SchemaFormGeneratorProps> = ({
  beatType,
  beatDefinition,
  parameters,
  onParameterChange,
  onParametersChange,
  availableTargets = [],
  characters = [],
  playerCharacterName,
  availableCounters = [],
  availableVariables = [],
  customRenderers = {},
  translationSourceHints,
  characterObjects = [],
  onCharacterSync,
  beatProperties = {},
  onBeatPropertyChange,
  usedNames = [],
  onDefineAsCharacter,
  onDevelopCharacter,
}) => {
  // Map alias types to canonical types for schema lookup
  const canonicalType = BEAT_TYPE_ALIASES[beatType] || beatType;

  // Skip parameters that should be handled elsewhere (connections, complex types)
  // Note: 'operation' is handled inside the 'value' case for setVariable beats
  const skipParameters = ['connection', 'defaultConnection', 'trueConnection', 'falseConnection',
    'dialogTree', 'choices', 'props', 'hyperlinks', 'restartConnection', 'operation'];

  const renderField = (paramName: string, paramDef: ParameterDefinition): React.ReactNode => {
    // Check for custom renderer first
    if (customRenderers[paramName]) {
      return customRenderers[paramName](paramName, paramDef);
    }

    // Skip complex types that need special handling
    if (skipParameters.includes(paramName)) {
      return null;
    }

    // Skip fields marked as hidden in schema
    if (paramDef.ui?.hidden) {
      return null;
    }

    // Skip fields scoped to the Visual Editor's left sidebar — they live
    // in VisualPropertiesPanel, not here.
    if (paramDef.ui?.scope === 've-left') {
      return null;
    }

    // For scope: 'beat' fields, read from beatProperties and use onBeatPropertyChange
    const isBeatScope = paramDef.ui?.scope === 'beat';
    const value = isBeatScope ? beatProperties[paramName] : parameters[paramName];
    const handleChange = isBeatScope && onBeatPropertyChange
      ? (v: any) => onBeatPropertyChange(paramName, v)
      : (v: any) => onParameterChange(paramName, v);
    const isRequired = paramDef.required ?? false;
    // Honour the schema's own label when it declares one — deriving from the
    // param name mangles acronyms ("explainHuds" → "Explain Huds") and ignores
    // wording the schema author chose deliberately. Special-cased controls
    // already read ui.label; the generic path silently didn't.
    const label = paramDef.ui?.label
      || (paramName.charAt(0).toUpperCase() + paramName.slice(1).replace(/([A-Z])/g, ' $1'));

    // Speaker visibility - tri-state select (default / show / hide)
    // Checked before the type switch since showSpeaker is type "boolean" but needs custom rendering
    if (paramDef.ui?.control === 'speaker-visibility') {
      return (
        <div key={paramName}>
          <label className="block text-sm font-medium text-gray-600 mb-1">
            {paramDef.ui.label || label}
          </label>
          <select
            value={value == null ? 'default' : value ? 'show' : 'hide'}
            onChange={(e) => {
              const val = e.target.value;
              handleChange(val === 'default' ? undefined : val === 'show');
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="default">Default (use global setting)</option>
            <option value="show">Always show</option>
            <option value="hide">Always hide</option>
          </select>
          {paramDef.description && (
            <p className="text-xs text-gray-500 mt-1">{paramDef.description}</p>
          )}
        </div>
      );
    }

    // Custom map-curation control — overrides the default array<object> editor
    // for the Set GPS Location beat's presetPoints. Placed before the type
    // switch so the array type doesn't claim it first.
    if (paramDef.ui?.control === 'gps-point-curator') {
      const pts = Array.isArray(parameters.presetPoints) ? parameters.presetPoints : [];
      return (
        <div key={paramName} className="space-y-1">
          <label className="block text-xs font-medium text-gray-700">{paramDef.ui.label || 'Points'}</label>
          <GpsPointCurator points={pts} onChange={(next) => onParameterChange('presetPoints', next)} />
        </div>
      );
    }

    // Determine field type based on parameter type
    switch (paramDef.type) {
      case 'string':
        // Check for targetField - show beat selector
        if (paramDef.targetField) {
          return (
            <div key={paramName}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {paramDef.ui?.label || label} {isRequired && <span className="text-red-500">*</span>}
              </label>
              <select
                value={value || ''}
                onChange={(e) => onParameterChange(paramName, e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="">-- Select target (optional) --</option>
                {availableTargets.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.name || target.id}
                  </option>
                ))}
              </select>
              {paramDef.description && (
                <p className="text-xs text-gray-500 mt-1">{paramDef.description}</p>
              )}
            </div>
          );
        }

        // Check for explicit textarea control or known multi-line fields
        const isTextarea = paramDef.ui?.control === 'textarea' ||
          paramName === 'text' || paramName === 'message' || paramName === 'prompt';

        if (isTextarea) {
          const rows = paramDef.ui?.rows || (paramName === 'message' ? 2 : 4);
          const sourceHint = translationSourceHints?.[paramName];
          const showSourceHint = sourceHint != null && typeof sourceHint === 'string' && sourceHint !== value;
          return (
            <div key={paramName}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {paramDef.ui?.label || label} {isRequired && <span className="text-red-500">*</span>}
              </label>
              <textarea
                value={value || paramDef.default || ''}
                onChange={(e) => onParameterChange(paramName, e.target.value)}
                onBlur={paramName === 'npcPersonality' && onCharacterSync && parameters.npcName
                  ? () => {
                      const npcName = parameters.npcName;
                      if (npcName && value) {
                        onCharacterSync(npcName, { description: value });
                      }
                    }
                  : undefined}
                rows={rows}
                className={`w-full px-3 py-2 border rounded-lg text-sm ${
                  translationSourceHints ? 'border-blue-300 bg-blue-50/30' : 'border-gray-300'
                }`}
                placeholder={translationSourceHints ? 'Enter translation...' : (paramDef.description || `Enter ${paramName}`)}
              />
              {showSourceHint && (
                <p className="text-xs text-gray-400 mt-1 italic truncate" title={sourceHint}>
                  Source: {sourceHint}
                </p>
              )}
              {!showSourceHint && paramDef.description && (
                <p className="text-xs text-gray-500 mt-1">{paramDef.description}</p>
              )}
            </div>
          );
        }

        // Check for explicit select control
        if (paramDef.ui?.control === 'select' && paramDef.ui.options) {
          return (
            <div key={paramName}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {paramDef.ui.label || label} {isRequired && <span className="text-red-500">*</span>}
              </label>
              <select
                value={value || paramDef.default || ''}
                onChange={(e) => onParameterChange(paramName, e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                {paramDef.ui.options.map((option: string | { value: string; label: string }) => {
                  const optValue = typeof option === 'string' ? option : option.value;
                  const optLabel = typeof option === 'string' ? option : option.label;
                  return <option key={optValue} value={optValue}>{optLabel}</option>;
                })}
              </select>
              {paramDef.ui.hint && (
                <p className="text-xs text-blue-600 mt-1">{paramDef.ui.hint}</p>
              )}
              {!paramDef.ui.hint && paramDef.description && (
                <p className="text-xs text-gray-500 mt-1">{paramDef.description}</p>
              )}
            </div>
          );
        }

        // Speaker control — combobox-style CharacterRefField that stores both
        // the canonical Character.id (when linked) and the free-text speaker
        // string. Pinned options at the top cover the special-case
        // story-level speakers ("(Default — Narrator)", "Narrator", "Player").
        if (paramDef.ui?.control === 'speaker') {
          const playerSpeakerValue = playerCharacterName || 'Interactor';
          const playerSpeakerLabel = playerCharacterName ? `${playerCharacterName} (Player)` : 'Interactor';
          // Materialise the defined-Character list. The combobox accepts
          // `Character` shape; map string-only entries to a minimal record
          // keyed by name so they still appear in the dropdown.
          const definedCharacters = (characters || [])
            .map((c: any) => {
              if (typeof c === 'string') {
                return { id: c, name: c, displayName: c, role: 'npc', visual: { type: 'static' }, states: [], defaultState: '', counters: [], inventory: [], createdAt: '', updatedAt: '' } as any;
              }
              return c;
            })
            .filter((c: any) => c && c.id);

          const setSpeaker = (next: { characterRef?: string; freeText?: string }) => {
            const newSpeaker = next.freeText ?? '';
            handleChange(newSpeaker);
            if (onBeatPropertyChange) {
              onBeatPropertyChange('characterRef', next.characterRef || undefined);
              // Auto-enable showSpeaker when an explicit speaker is selected
              // (preserves prior behaviour of the legacy select control).
              if (newSpeaker && newSpeaker !== '' && beatProperties.showSpeaker == null) {
                onBeatPropertyChange('showSpeaker', true);
              }
            }
          };

          return (
            <div key={paramName}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {paramDef.ui.label || label}
              </label>
              <CharacterRefField
                value={{
                  characterRef: beatProperties.characterRef,
                  freeText: typeof value === 'string' ? value : (value || ''),
                }}
                onChange={setSpeaker}
                characters={definedCharacters}
                usedNames={usedNames}
                onDefineAsCharacter={onDefineAsCharacter}
                pinnedOptions={[
                  { value: '', label: '(Default — Narrator)' },
                  { value: 'Narrator', label: 'Narrator' },
                  { value: playerSpeakerValue, label: playerSpeakerLabel },
                ]}
                placeholder="Type or pick a speaker…"
              />
              {paramDef.description && (
                <p className="text-xs text-gray-500 mt-1">{paramDef.description}</p>
              )}
            </div>
          );
        }

        // Generic character-ref control — used wherever a beat parameter
        // points at a character (AddRemoveInventory.character / fromChar /
        // toChar, future PickProp interactor, etc.). Stores plain strings:
        // either the canonical Character.id (when linked) or a free-text
        // name. The "Player" pinned option preserves the special routing
        // semantics of the AddRemoveInventory runtime ('player' / empty
        // routes to the global single inventory).
        if (paramDef.ui?.control === 'counter-owner') {
          // Schema-driven: a counter is the (name, owner) pair. This control
          // owns both `parameters.name` and `parameters.character` and writes
          // them atomically. Visibility (type='counter' only) is the schema's
          // dependsOn, not a hardcoded branch here.
          const charList = (characterObjects && characterObjects.length > 0
            ? characterObjects
            : (characters || []).map((c: any) => (typeof c === 'string' ? { id: c, name: c } : c))
          ).map((c: any) => ({ id: c.id, name: c.name, displayName: c.displayName }));
          const setNameAndOwner = (n: string, ch: string) => {
            if (onParametersChange) onParametersChange({ name: n, character: ch });
            else {
              onParameterChange('name', n);
              onParameterChange('character', ch);
            }
          };
          return (
            <CounterOwnerPicker
              key={paramName}
              label={paramDef.ui.label || 'Counter'}
              counters={availableCounters}
              characters={charList}
              name={typeof parameters.name === 'string' ? parameters.name : (parameters.name || '')}
              character={parameters.character || ''}
              onChange={setNameAndOwner}
              // setVariable assigns to the chosen counter, so derived ones
              // are offered but not selectable.
              forWriting
            />
          );
        }

        if (paramDef.ui?.control === 'character-ref') {
          const definedCharacters = (characters || [])
            .map((c: any) => {
              if (typeof c === 'string') {
                return { id: c, name: c, displayName: c, role: 'npc', visual: { type: 'static' }, states: [], defaultState: '', counters: [], inventory: [], createdAt: '', updatedAt: '' } as any;
              }
              return c;
            })
            .filter((c: any) => c && c.id);

          // The character-ref control writes a single string into the
          // beat's parameter (no companion field). When a defined Character
          // is picked, we store the canonical Character.id; otherwise we
          // store the free-text name. The runtime resolver (Step 1.b)
          // accepts both.
          const setRef = (next: { characterRef?: string; freeText?: string }) => {
            handleChange(next.characterRef || next.freeText || '');
          };
          // Reconstruct the combobox's tuple from the single stored string:
          // if the string matches a defined character's id, treat it as
          // characterRef; otherwise it's free text.
          const stringValue = typeof value === 'string' ? value : (value || '');
          const matchesId = definedCharacters.some((c: any) => c.id === stringValue);

          return (
            <div key={paramName}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {paramDef.ui.label || label}
              </label>
              <CharacterRefField
                value={
                  matchesId
                    ? { characterRef: stringValue, freeText: stringValue }
                    : { characterRef: undefined, freeText: stringValue }
                }
                onChange={setRef}
                characters={definedCharacters}
                usedNames={usedNames}
                onDefineAsCharacter={onDefineAsCharacter}
                pinnedOptions={[{ value: 'player', label: 'Player' }]}
                placeholder="Player, a defined character, or type a name…"
              />
              {paramDef.description && (
                <p className="text-xs text-gray-500 mt-1">{paramDef.description}</p>
              )}
            </div>
          );
        }

        // Affect slider — range input with end-cap labels. Used by the
        // UpdateAffect beat for mood-axis deltas and sentiment strength
        // delta. The qualitative preview ("Will feel: happier") leans on
        // describeMoodAxis from @asaps/core so the LLM dossier and the
        // Inspector show the same words for the same numbers.
        if (paramDef.ui?.control === 'affect-slider') {
          const min = paramDef.ui.min ?? -1;
          const max = paramDef.ui.max ?? 1;
          const step = paramDef.ui.step ?? 0.1;
          const numericValue = typeof value === 'number'
            ? value
            : (typeof value === 'string' && value !== '' ? parseFloat(value) : 0);
          const labels = paramDef.ui.axisLabels;
          const axis = paramDef.ui.affectAxis;
          // Resulting-feel preview applies the *delta* to a hypothetical
          // neutral mood, so authors see the direction of effect, not a
          // committed mood (which depends on the character's current state).
          const previewWord = axis ? describeMoodAxis(numericValue, axis) : null;

          return (
            <div key={paramName}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {paramDef.ui.label || label}
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {labels && <span style={{ fontSize: 11, color: '#6b7280', flexShrink: 0 }}>{labels[0]}</span>}
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={step}
                  value={numericValue}
                  onChange={(e) => handleChange(parseFloat(e.target.value))}
                  style={{ flex: 1 }}
                />
                {labels && <span style={{ fontSize: 11, color: '#6b7280', flexShrink: 0 }}>{labels[1]}</span>}
                <span style={{ fontFamily: 'monospace', fontSize: 12, minWidth: 44, textAlign: 'right', color: '#374151' }}>
                  {numericValue >= 0 ? '+' : ''}{numericValue.toFixed(2)}
                </span>
              </div>
              {previewWord && Math.abs(numericValue) > 0.05 && (
                <p className="text-xs text-gray-500 mt-1">
                  Direction: <span className="font-medium">{previewWord}</span>
                </p>
              )}
              {paramDef.description && (
                <p className="text-xs text-gray-500 mt-1">{paramDef.description}</p>
              )}
            </div>
          );
        }

        // NPC Character control — combobox for AIDialogTree / AIConversation's
        // npcName field. Filters defined characters to non-player roles (the
        // NPC is whom the player talks *to*). When a defined Character is
        // linked, the linked character's description is auto-loaded into
        // npcPersonality (preserves the prior behaviour and is the small win
        // that drove this Step). Free-text names work unchanged — typing a
        // new NPC name and clicking "Define as Character" opens the Manager.
        if (paramDef.ui?.control === 'npc-character') {
          // Non-player Characters only — the player is never the NPC.
          const npcCharacters = characterObjects
            .filter((c) => c.role !== 'player')
            .map((c) => ({
              ...c,
              // Default minimums so the combobox has the shape it expects.
              displayName: c.displayName || c.name || c.id,
              visual: (c as any).visual || { type: 'static' },
              states: (c as any).states || [],
              defaultState: (c as any).defaultState || '',
              counters: (c as any).counters || [],
              inventory: (c as any).inventory || [],
              createdAt: (c as any).createdAt || '',
              updatedAt: (c as any).updatedAt || '',
            })) as any[];

          // Reconstruct combobox tuple from the single stored string.
          const stringValue = typeof value === 'string' ? value : (value || '');
          const matchedChar = npcCharacters.find((c: any) =>
            c.id === stringValue
            || (c.name || '').toLowerCase() === stringValue.toLowerCase()
            || (c.displayName || '').toLowerCase() === stringValue.toLowerCase()
          );
          const matched = !!matchedChar;

          const setNpc = (next: { characterRef?: string; freeText?: string }) => {
            const newValue = next.characterRef || next.freeText || '';
            handleChange(newValue);

            // When the user links to a defined Character (newValue is the
            // canonical id), auto-fill npcPersonality from that Character's
            // description IF the personality slot is currently empty. This
            // is the dossier-prefill that justifies promoting NPCs to real
            // Characters in the first place — the LLM context now reuses
            // the same description across every beat that links to this NPC.
            if (next.characterRef) {
              const linked = npcCharacters.find((c: any) => c.id === next.characterRef);
              if (linked?.description && !parameters.npcPersonality) {
                onParameterChange('npcPersonality', linked.description);
              }
            }
          };

          return (
            <div key={paramName}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {paramDef.ui.label || label}
                {paramDef.required && <span className="text-red-500 ml-1">*</span>}
              </label>
              <CharacterRefField
                value={
                  matched
                    ? { characterRef: matchedChar.id, freeText: matchedChar.displayName || matchedChar.name }
                    : { characterRef: undefined, freeText: stringValue }
                }
                onChange={setNpc}
                characters={npcCharacters}
                usedNames={usedNames}
                onDefineAsCharacter={onDefineAsCharacter}
                placeholder="Pick or name an NPC…"
              />
              {onDevelopCharacter && (
                <button
                  type="button"
                  onClick={() =>
                    onDevelopCharacter({
                      seed: {
                        name: matched
                          ? matchedChar.displayName || matchedChar.name
                          : stringValue || undefined,
                        brief: parameters.npcPersonality || '',
                        scenario: parameters.scenario || undefined,
                      },
                      existingCharacterId: matchedChar?.id,
                      // Beat entry: rich context already — generate right away,
                      // "Refine with questions first" stays available inside.
                      askFirst: false,
                      onAccepted: (character) => {
                        // Link the beat to the accepted character and load the
                        // generated personality into the beat's context field.
                        handleChange(character.id);
                        if (character.description) {
                          onParameterChange('npcPersonality', character.description);
                        }
                      },
                    })
                  }
                  className="mt-1 text-xs text-purple-600 hover:bg-purple-50 px-1.5 py-1 rounded flex items-center gap-1"
                  title="AI drafts a full character profile (personality, mood, speaking style, optional disposition variants) from this beat's scenario and personality text"
                >
                  ✨ Develop character with AI…
                </button>
              )}
              {paramDef.description && (
                <p className="mt-1 text-xs text-gray-500">{paramDef.description}</p>
              )}
            </div>
          );
        }

        // Handle select fields based on parameter name/type
        if (paramName === 'type' && beatType === 'setVariable') {
          return (
            <div key={paramName}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {label}
              </label>
              <select
                value={value || paramDef.default || 'variable'}
                onChange={(e) => onParameterChange(paramName, e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="variable">Variable (Text/Boolean)</option>
                <option value="counter">Counter (Number)</option>
                <option value="fictionalTime">Fictional Time</option>
              </select>
            </div>
          );
        }

        if (paramName === 'action' && beatType === 'addRemoveInventory') {
          return (
            <div key={paramName}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Box className="w-4 h-4 inline mr-1" />
                {label}
              </label>
              <select
                value={value || paramDef.default || 'add'}
                onChange={(e) => onParameterChange(paramName, e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="add">Add to Inventory</option>
                <option value="remove">Remove from Inventory</option>
                <option value="transfer">Transfer Between Characters</option>
              </select>
            </div>
          );
        }

        if (paramName === 'saveToType' && beatType === 'inputText') {
          return (
            <div key={paramName}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {label} {isRequired && <span className="text-red-500">*</span>}
              </label>
              <select
                value={value || paramDef.default || 'variable'}
                onChange={(e) => {
                  onParameterChange(paramName, e.target.value);
                  // Clear the other fields when switching
                  if (e.target.value === 'variable') {
                    onParameterChange('characterId', undefined);
                    onParameterChange('counter', undefined);
                    onParameterChange('counterOperation', undefined);
                    if (!parameters.variable) {
                      onParameterChange('variable', 'userInput');
                    }
                  } else if (e.target.value === 'characterName') {
                    onParameterChange('variable', undefined);
                    onParameterChange('counter', undefined);
                    onParameterChange('counterOperation', undefined);
                  } else if (e.target.value === 'counter') {
                    onParameterChange('variable', undefined);
                    onParameterChange('characterId', undefined);
                    // Auto-set validation to numeric for counter
                    onParameterChange('validation', 'numeric');
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="variable">Variable</option>
                <option value="characterName">Character Display Name</option>
                <option value="counter">Counter (Numeric)</option>
              </select>
            </div>
          );
        }

        // Counter name field for inputText when saveToType is 'counter'
        if (paramName === 'counter' && beatType === 'inputText') {
          // Only show if saveToType is 'counter'
          if (parameters.saveToType !== 'counter') {
            return null;
          }
          // This field *writes* the input into a counter, so derived counters
          // are not offered — assigning to one is undone by the next appraisal
          // tick. The field stays free text, so an author can still type one;
          // that case gets an explicit warning rather than silent failure.
          const writableCounters = availableCounters.filter((c) => !c.derived);
          const hasCounters = writableCounters.length > 0;
          const derivedHit = availableCounters.find((c) => c.derived && c.name === value);
          return (
            <div key={paramName}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Variable className="w-4 h-4 inline mr-1" />
                Counter Name {isRequired && <span className="text-red-500">*</span>}
              </label>
              <input
                type="text"
                value={value || ''}
                onChange={(e) => onParameterChange(paramName, e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder={hasCounters ? 'Type or select counter...' : 'Enter counter name'}
                list="inputtext-counter-datalist"
              />
              {hasCounters && (
                <datalist id="inputtext-counter-datalist">
                  {writableCounters.map((c) => (
                    <option key={`${c.characterId}-${c.name}`} value={c.name}>
                      {c.fullName}
                    </option>
                  ))}
                </datalist>
              )}
              {derivedHit ? (
                <p className="text-xs text-amber-700 mt-1">
                  {derivedHit.derivedWriteReason} — a value saved here would be overwritten.
                </p>
              ) : hasCounters ? (
                <p className="text-xs text-gray-500 mt-1">
                  {writableCounters.length} counter(s) available from characters
                </p>
              ) : (
                <p className="text-xs text-gray-500 mt-1">
                  No counters defined. Add counters to characters first.
                </p>
              )}
            </div>
          );
        }

        // Counter operation for inputText when saveToType is 'counter'
        if (paramName === 'counterOperation' && beatType === 'inputText') {
          // Only show if saveToType is 'counter'
          if (parameters.saveToType !== 'counter') {
            return null;
          }
          return (
            <div key={paramName}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Counter Operation
              </label>
              <select
                value={value || 'set'}
                onChange={(e) => onParameterChange(paramName, e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="set">Set To (replace value)</option>
                <option value="change">Add To (change by amount)</option>
              </select>
            </div>
          );
        }

        if (paramName === 'validation' && beatType === 'inputText') {
          return (
            <div key={paramName}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {label}
              </label>
              <select
                value={value || paramDef.default || 'none'}
                onChange={(e) => onParameterChange(paramName, e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="none">None</option>
                <option value="numeric">Numeric Only</option>
                <option value="email">Email Address</option>
                <option value="alphanumeric">Alphanumeric Only</option>
              </select>
            </div>
          );
        }

        // Handle character selection fields — for inputText saving to a
        // characterName. Uses `characterObjects` (the real Character[]), NOT
        // `characters` (which is a string[] of NPC names from
        // getAvailableCharacters). inputText should offer ALL characters
        // including the player, since changing the player's display name is a
        // primary use of this feature ("What should I call you?").
        if (paramName === 'characterId') {
          const opts = Array.isArray(characterObjects) ? characterObjects : [];
          return (
            <div key={paramName}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <User className="w-4 h-4 inline mr-1" />
                Character {isRequired && <span className="text-red-500">*</span>}
              </label>
              <select
                value={value || ''}
                onChange={(e) => onParameterChange(paramName, e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="">Select character...</option>
                {opts.length > 0 ? (
                  opts.map((char) => (
                    <option key={char.id} value={char.id}>
                      {char.displayName || char.name || char.id}
                      {char.role ? ` (${char.role})` : ''}
                    </option>
                  ))
                ) : (
                  <option disabled>No characters defined — add one in the Character Manager</option>
                )}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Updates character's display name only (ID stays stable)
              </p>
            </div>
          );
        }

        // Conditional visibility for addRemoveInventory fields
        if (beatType === 'addRemoveInventory') {
          const action = parameters.action || 'add';
          // Hide 'character' when action is 'transfer' (use fromChar/toChar instead)
          if (paramName === 'character' && action === 'transfer') {
            return null;
          }
          // Hide 'fromChar' and 'toChar' when action is NOT 'transfer'
          if ((paramName === 'fromChar' || paramName === 'toChar') && action !== 'transfer') {
            return null;
          }
        }

        // Variable-name field for setVariable. Only reached for type='variable'
        // — the schema's dependsOn gates this param (counter uses the
        // 'counter-owner' control on `character`; fictionalTime has no name).
        if (paramName === 'name' && beatType === 'setVariable') {
          const hasOptions = availableVariables.length > 0;

          return (
            <div key={paramName}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Variable className="w-4 h-4 inline mr-1" />
                Variable Name {isRequired && <span className="text-red-500">*</span>}
              </label>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={value || paramDef.default || ''}
                    onChange={(e) => onParameterChange(paramName, e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm pr-8"
                    placeholder={hasOptions ? 'Type or select variable...' : 'Enter variable name'}
                    required={isRequired}
                    list={`${paramName}-datalist`}
                  />
                  {hasOptions && (
                    <datalist id={`${paramName}-datalist`}>
                      {availableVariables.map((v) => (
                        <option key={v.name} value={v.name}>
                          {v.description || v.name}
                        </option>
                      ))}
                    </datalist>
                  )}
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {hasOptions
                  ? `${availableVariables.length} variable(s) defined in Global Settings`
                  : 'No variables defined. Add variables in Global Settings.'}
              </p>
            </div>
          );
        }

        // Handle other variable name fields (timer, item, character, etc.)
        if (paramName === 'variable' || paramName === 'timer' || paramName === 'item' ||
            paramName === 'timerName' || paramName === 'character' ||
            paramName === 'fromChar' || paramName === 'toChar' || paramName === 'name') {
          const IconComponent = paramName.includes('timer') || paramName.includes('Timer') ? Timer :
                      paramName.includes('item') || paramName.includes('char') || paramName.includes('Char') ? Box :
                      Variable;

          // For 'variable' field in inputText, show dropdown if available
          const showVariableDropdown = paramName === 'variable' && beatType === 'inputText' && availableVariables.length > 0;

          return (
            <div key={paramName}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <IconComponent className="w-4 h-4 inline mr-1" />
                {label} {isRequired && <span className="text-red-500">*</span>}
              </label>
              <input
                type="text"
                value={value || paramDef.default || ''}
                onChange={(e) => onParameterChange(paramName, e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder={paramDef.description || `e.g., ${paramDef.default || paramName}`}
                required={isRequired}
                list={showVariableDropdown ? `${paramName}-var-datalist` : undefined}
              />
              {showVariableDropdown && (
                <datalist id={`${paramName}-var-datalist`}>
                  {availableVariables.map((v) => (
                    <option key={v.name} value={v.name}>
                      {v.description || v.name}
                    </option>
                  ))}
                </datalist>
              )}
              {paramDef.description && (
                <p className="text-xs text-gray-500 mt-1">{paramDef.description}</p>
              )}
            </div>
          );
        }

        // Default string input
        {
          const sourceHintDefault = translationSourceHints?.[paramName];
          const showSourceHintDefault = sourceHintDefault != null && typeof sourceHintDefault === 'string' && sourceHintDefault !== value;
          return (
            <div key={paramName}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {label} {isRequired && <span className="text-red-500">*</span>}
              </label>
              <input
                type="text"
                value={value || paramDef.default || ''}
                onChange={(e) => onParameterChange(paramName, e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg text-sm ${
                  translationSourceHints ? 'border-blue-300 bg-blue-50/30' : 'border-gray-300'
                }`}
                placeholder={translationSourceHints ? 'Enter translation...' : (paramDef.description || `Enter ${paramName}`)}
              />
              {showSourceHintDefault && (
                <p className="text-xs text-gray-400 mt-1 italic truncate" title={sourceHintDefault}>
                  Source: {sourceHintDefault}
                </p>
              )}
              {!showSourceHintDefault && paramDef.description && (
                <p className="text-xs text-gray-500 mt-1">{paramDef.description}</p>
              )}
            </div>
          );
        }

      case 'number': {
        const numMin = paramDef.ui?.min ?? 0;
        const numMax = paramDef.ui?.max;
        const numStep = paramDef.ui?.step ?? 1;
        const useFloat = numStep < 1 || (numMin !== undefined && !Number.isInteger(numMin));
        return (
          <div key={paramName}>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {label} {isRequired && <span className="text-red-500">*</span>}
            </label>
            <input
              type="number"
              value={value ?? paramDef.default ?? 0}
              onChange={(e) => onParameterChange(paramName, useFloat ? parseFloat(e.target.value) : parseInt(e.target.value))}
              min={numMin}
              max={numMax}
              step={numStep}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            {paramDef.description && (
              <p className="text-xs text-gray-500 mt-1">{paramDef.description}</p>
            )}
          </div>
        );
      }

      case 'boolean':
        return (
          <div key={paramName}>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={value ?? paramDef.default ?? false}
                onChange={(e) => onParameterChange(paramName, e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-sm text-gray-700">{label}</span>
            </label>
            {paramDef.description && (
              <p className="text-xs text-gray-500 mt-1 ml-6">{paramDef.description}</p>
            )}
          </div>
        );

      case 'connection':
        // Render a beat-picker select for named connection parameters that are not
        // covered by the generic connection section (e.g. fallbackExitTarget on aiConversation).
        return (
          <div key={paramName}>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {paramDef.ui?.label || label} {isRequired && <span className="text-red-500">*</span>}
            </label>
            <select
              value={value || ''}
              onChange={(e) => onParameterChange(paramName, e.target.value || undefined)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">None (optional)</option>
              {availableTargets.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.name || target.id} ({target.type})
                </option>
              ))}
            </select>
            {paramDef.description && (
              <p className="text-xs text-gray-500 mt-1">{paramDef.description}</p>
            )}
          </div>
        );

      case 'any':
        // For setVariable 'value' parameter, determine type based on 'type' parameter
        if (paramName === 'value' && beatType === 'setVariable') {
          if (parameters.type === 'fictionalTime') {
            // Show fictional time operation and date/time fields
            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
              'July', 'August', 'September', 'October', 'November', 'December'];
            return (
              <React.Fragment key={paramName}>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Operation
                  </label>
                  <select
                    value={parameters.operation || 'set'}
                    onChange={(e) => onParameterChange('operation', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="set">Set to date/time</option>
                    <option value="advance">Advance</option>
                    <option value="subtract">Subtract (time travel)</option>
                  </select>
                </div>
                {parameters.operation === 'set' || !parameters.operation ? (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          value={parameters.timeDay ?? 1}
                          onChange={(e) => onParameterChange('timeDay', Math.max(1, Math.min(31, parseInt(e.target.value) || 1)))}
                          className="w-16 px-2 py-1 border border-gray-300 rounded text-sm"
                          min={1} max={31}
                          title="Day"
                        />
                        <select
                          value={parameters.timeMonth ?? 1}
                          onChange={(e) => onParameterChange('timeMonth', parseInt(e.target.value))}
                          className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                        >
                          {monthNames.map((name, i) => (
                            <option key={i + 1} value={i + 1}>{name}</option>
                          ))}
                        </select>
                        <input
                          type="number"
                          value={parameters.timeYear ?? 2024}
                          onChange={(e) => onParameterChange('timeYear', parseInt(e.target.value) || 2024)}
                          className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                          title="Year"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
                      <div className="flex gap-2 items-center">
                        <input
                          type="number"
                          value={parameters.timeHour ?? 0}
                          onChange={(e) => onParameterChange('timeHour', Math.max(0, Math.min(23, parseInt(e.target.value) || 0)))}
                          className="w-16 px-2 py-1 border border-gray-300 rounded text-sm"
                          min={0} max={23}
                          title="Hour (0-23)"
                        />
                        <span className="text-gray-500">:</span>
                        <input
                          type="number"
                          value={parameters.timeMinute ?? 0}
                          onChange={(e) => onParameterChange('timeMinute', Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                          className="w-16 px-2 py-1 border border-gray-300 rounded text-sm"
                          min={0} max={59}
                          title="Minute (0-59)"
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                      <input
                        type="number"
                        value={value || 0}
                        onChange={(e) => onParameterChange(paramName, parseInt(e.target.value) || 0)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        min={0}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                      <select
                        value={parameters.timeUnit || 'hours'}
                        onChange={(e) => onParameterChange('timeUnit', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      >
                        <option value="minutes">Minutes</option>
                        <option value="hours">Hours</option>
                        <option value="days">Days</option>
                        <option value="weeks">Weeks</option>
                        <option value="months">Months</option>
                        <option value="years">Years</option>
                      </select>
                    </div>
                  </>
                )}
              </React.Fragment>
            );
          } else if (parameters.type === 'counter') {
            // Show operation selector for counters
            return (
              <React.Fragment key={paramName}>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Operation
                  </label>
                  <select
                    value={parameters.operation || 'set'}
                    onChange={(e) => onParameterChange('operation', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="set">Set To</option>
                    <option value="add">Add</option>
                    <option value="subtract">Subtract</option>
                    <option value="multiply">Multiply</option>
                    <option value="divide">Divide</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Value
                  </label>
                  <input
                    type="number"
                    value={value || 0}
                    onChange={(e) => onParameterChange(paramName, parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
              </React.Fragment>
            );
          } else {
            // Show text input for variables
            // Handle boolean false properly - don't treat it as empty
            const displayValue = value !== undefined && value !== null ? String(value) : '';
            return (
              <div key={paramName}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Value
                </label>
                <input
                  type="text"
                  value={displayValue}
                  onChange={(e) => onParameterChange(paramName, e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="Variable value"
                />
              </div>
            );
          }
        }

        // Default: text input for any type
        // Handle boolean false properly - don't treat it as empty
        const defaultDisplayValue = value !== undefined && value !== null
          ? String(value)
          : (paramDef.default !== undefined ? String(paramDef.default) : '');
        return (
          <div key={paramName}>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {label} {isRequired && <span className="text-red-500">*</span>}
            </label>
            <input
              type="text"
              value={defaultDisplayValue}
              onChange={(e) => onParameterChange(paramName, e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              placeholder={paramDef.description}
            />
          </div>
        );

      default:
        // Handle array types (array<string>, array<object>)
        if (paramDef.type.startsWith('array<')) {
          const itemType = paramDef.type.slice(6, -1); // Extract type from array<...>
          const items = (value as any[]) || [];
          const addLabel = paramDef.ui?.addLabel || `Add ${label.replace(/s$/, '')}`;
          const itemLabel = paramDef.ui?.itemLabel || label.replace(/s$/, '');

          // Special handling for textVariations with collapsible UI
          if (paramName === 'textVariations' && itemType === 'string') {
            return (
              <TextVariationsEditor
                key={paramName}
                items={items}
                label={paramDef.ui?.label || 'Text Variations (optional)'}
                addLabel={addLabel}
                helpText={paramDef.ui?.help || 'One variation (including main text) selected randomly each time'}
                onChange={(newItems) => onParameterChange(paramName, newItems)}
              />
            );
          }

          // For array<object> with itemSchema
          if (itemType === 'object' && paramDef.itemSchema) {
            return (
              <div key={paramName} className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-gray-700">
                    {paramDef.ui?.label || label}
                    {paramDef.required && <span className="text-red-500 ml-1">*</span>}
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      // Create new item with defaults from itemSchema
                      const newItem: Record<string, any> = {};
                      Object.entries(paramDef.itemSchema!).forEach(([key, def]) => {
                        if (def.default !== undefined) {
                          newItem[key] = def.default;
                        } else if (def.type === 'string') {
                          newItem[key] = '';
                        } else if (def.type === 'boolean') {
                          newItem[key] = false;
                        }
                      });
                      onParameterChange(paramName, [...items, newItem]);
                    }}
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                  >
                    <Plus className="w-3 h-3" />
                    {addLabel}
                  </button>
                </div>

                {paramDef.description && (
                  <p className="text-xs text-gray-500">{paramDef.description}</p>
                )}

                {items.length === 0 && (
                  <p className="text-xs text-gray-400 italic py-2">
                    No {label.toLowerCase()} defined. Click "{addLabel}" to add one.
                  </p>
                )}

                {items.map((item, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-3 bg-gray-50 space-y-2">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-gray-600">
                        {itemLabel} {index + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const newItems = items.filter((_, i) => i !== index);
                          onParameterChange(paramName, newItems);
                        }}
                        className="text-red-500 hover:text-red-700 p-1"
                        title="Remove"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {Object.entries(paramDef.itemSchema!).map(([fieldName, fieldDef]) => {
                      const fieldValue = item[fieldName];
                      const fieldLabel = fieldDef.ui?.label ||
                        fieldName.charAt(0).toUpperCase() + fieldName.slice(1).replace(/([A-Z])/g, ' $1');

                      // Check dependsOn within array items (references other fields on the same item)
                      if (fieldDef.ui?.dependsOn) {
                        const { field, value: depValue } = fieldDef.ui.dependsOn;
                        const actualValue = item[field];
                        if (Array.isArray(depValue)) {
                          if (!depValue.includes(actualValue)) return null;
                        } else if (actualValue !== depValue) {
                          return null;
                        }
                      }

                      // Handle targetField - show beat selector
                      if (fieldDef.targetField) {
                        return (
                          <div key={fieldName}>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              {fieldLabel}
                              {fieldDef.required && <span className="text-red-500 ml-1">*</span>}
                            </label>
                            <select
                              value={fieldValue || ''}
                              onChange={(e) => {
                                const newItems = [...items];
                                newItems[index] = { ...item, [fieldName]: e.target.value };
                                onParameterChange(paramName, newItems);
                              }}
                              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                            >
                              <option value="">Select target...</option>
                              {availableTargets.map((target) => (
                                <option key={target.id} value={target.id}>
                                  {target.name || target.id}
                                </option>
                              ))}
                            </select>
                          </div>
                        );
                      }

                      // Handle select control
                      if (fieldDef.ui?.control === 'select' && fieldDef.ui.options) {
                        return (
                          <div key={fieldName}>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              {fieldLabel}
                            </label>
                            <select
                              value={fieldValue || fieldDef.default || ''}
                              onChange={(e) => {
                                const newItems = [...items];
                                newItems[index] = { ...item, [fieldName]: e.target.value };
                                onParameterChange(paramName, newItems);
                              }}
                              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                            >
                              {fieldDef.ui.options.map((opt: string | { value: string; label: string }) => {
                                const optValue = typeof opt === 'string' ? opt : opt.value;
                                const optLabel = typeof opt === 'string' ? opt : opt.label;
                                return <option key={optValue} value={optValue}>{optLabel}</option>;
                              })}
                            </select>
                          </div>
                        );
                      }

                      // Handle textarea control
                      if (fieldDef.ui?.control === 'textarea') {
                        return (
                          <div key={fieldName}>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              {fieldLabel}
                              {fieldDef.required && <span className="text-red-500 ml-1">*</span>}
                            </label>
                            <textarea
                              value={fieldValue || ''}
                              onChange={(e) => {
                                const newItems = [...items];
                                newItems[index] = { ...item, [fieldName]: e.target.value };
                                onParameterChange(paramName, newItems);
                              }}
                              rows={fieldDef.ui?.rows || 2}
                              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                              placeholder={fieldDef.description}
                            />
                          </div>
                        );
                      }

                      // Handle boolean
                      if (fieldDef.type === 'boolean') {
                        return (
                          <label key={fieldName} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={fieldValue ?? fieldDef.default ?? false}
                              onChange={(e) => {
                                const newItems = [...items];
                                newItems[index] = { ...item, [fieldName]: e.target.checked };
                                onParameterChange(paramName, newItems);
                              }}
                              className="rounded border-gray-300"
                            />
                            <span className="text-xs text-gray-600">{fieldLabel}</span>
                          </label>
                        );
                      }

                      // Default: text or number input
                      return (
                        <div key={fieldName}>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            {fieldLabel}
                            {fieldDef.required && <span className="text-red-500 ml-1">*</span>}
                          </label>
                          <input
                            type={fieldDef.type === 'number' ? 'number' : 'text'}
                            value={fieldValue ?? fieldDef.default ?? ''}
                            min={fieldDef.ui?.min}
                            max={fieldDef.ui?.max}
                            step={fieldDef.ui?.step}
                            onChange={(e) => {
                              const newItems = [...items];
                              const newValue = fieldDef.type === 'number'
                                ? (e.target.value === '' ? undefined : parseFloat(e.target.value))
                                : e.target.value;
                              newItems[index] = { ...item, [fieldName]: newValue };
                              onParameterChange(paramName, newItems);
                            }}
                            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                            placeholder={fieldDef.description}
                          />
                        </div>
                      );
                    })}
                  </div>
                ))}

                {paramDef.minItems && items.length < paramDef.minItems && (
                  <p className="text-xs text-amber-600">
                    Minimum {paramDef.minItems} {label.toLowerCase()} required
                  </p>
                )}
              </div>
            );
          }

          // For array<string> - simple list of strings
          if (itemType === 'string') {
            return (
              <div key={paramName} className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-gray-700">
                    {paramDef.ui?.label || label}
                  </label>
                  <button
                    type="button"
                    onClick={() => onParameterChange(paramName, [...items, ''])}
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                  >
                    <Plus className="w-3 h-3" />
                    Add
                  </button>
                </div>
                {items.map((item, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      value={item || ''}
                      onChange={(e) => {
                        const newItems = [...items];
                        newItems[index] = e.target.value;
                        onParameterChange(paramName, newItems);
                      }}
                      className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm"
                      placeholder={`${itemLabel} ${index + 1}`}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const newItems = items.filter((_, i) => i !== index);
                        onParameterChange(paramName, newItems);
                      }}
                      className="text-red-500 hover:text-red-700 p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            );
          }
        }

        // For truly unknown types, render nothing (they'll be handled by custom renderers)
        return null;
    }
  };

  // Handle undefined beatDefinition gracefully
  if (!beatDefinition || !beatDefinition.parameters) {
    console.warn(`[SchemaFormGenerator] No beat definition found for type: ${beatType}`);
    return (
      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <p className="text-sm text-yellow-700">
          Unknown beat type: <code className="bg-yellow-100 px-1 rounded">{beatType}</code>
        </p>
        <p className="text-xs text-yellow-600 mt-1">
          This beat type may not be supported or the schema is outdated.
        </p>
      </div>
    );
  }

  // Build render list: skip dependsOn fields whose condition isn't met, group fields sharing a group key
  const entries = Object.entries(beatDefinition.parameters);
  const rendered: React.ReactNode[] = [];
  const groupsRendered = new Set<string>();

  for (const [paramName, paramDef] of entries) {
    // Check dependsOn condition
    if (paramDef.ui?.dependsOn) {
      const { field, value } = paramDef.ui.dependsOn;
      if (parameters[field] !== value) continue;
    }

    const groupKey = paramDef.ui?.group;

    if (groupKey) {
      // Only render the group container once
      if (groupsRendered.has(groupKey)) continue;
      groupsRendered.add(groupKey);

      // Collect all visible fields in this group
      const groupFields = entries.filter(([, def]) => {
        if (def.ui?.group !== groupKey) return false;
        if (def.ui?.dependsOn) {
          const { field, value } = def.ui.dependsOn;
          if (parameters[field] !== value) return false;
        }
        return true;
      });

      // Render group label from the group key
      const groupLabel = groupKey.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());

      rendered.push(
        <div key={`group-${groupKey}`} className="border border-gray-200 rounded-lg p-3 space-y-2">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{groupLabel}</span>
          {groupFields.map(([name, def]) => renderField(name, def))}
        </div>
      );
    } else {
      rendered.push(renderField(paramName, paramDef));
    }
  }

  return (
    <div className="space-y-4">
      {rendered}
    </div>
  );
};

// Export types for use in other components
export type { BeatDefinition, ParameterDefinition };
