import React, { useState } from 'react';
import { Variable, Box, Timer, User, ChevronDown, ChevronRight, Plus, Trash2, Shuffle } from 'lucide-react';
import type { Beat } from '@asaps/core';
import type { AvailableCounter, AvailableVariable } from '../hooks/useAvailableCountersAndVariables';

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
    control?: 'text' | 'textarea' | 'select' | 'number' | 'text-variations' | 'speaker';
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
  availableTargets?: Beat[];
  characters?: any[];
  // Available counters and variables for dropdowns
  availableCounters?: AvailableCounter[];
  availableVariables?: AvailableVariable[];
  // Callbacks for special cases
  customRenderers?: Record<string, (param: string, def: ParameterDefinition) => React.ReactNode>;
  // Translation mode: source parameter values to show as dimmed reference below text fields.
  // When set, indicates translation mode is active.
  translationSourceHints?: Record<string, any>;
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
  availableTargets = [],
  characters = [],
  availableCounters = [],
  availableVariables = [],
  customRenderers = {},
  translationSourceHints,
}) => {
  // Map alias types to canonical types for schema lookup
  const canonicalType = BEAT_TYPE_ALIASES[beatType] || beatType;

  // Skip parameters that should be handled elsewhere (connections, complex types)
  // Note: 'operation' is handled inside the 'value' case for setVariable beats
  const skipParameters = ['connection', 'defaultConnection', 'trueConnection', 'falseConnection',
    'dialogTree', 'choices', 'props', 'hyperlinks', 'restartConnection', 'operation',
    'speaker', 'showSpeaker']; // Rendered in Inspector's common Speaker section

  const renderField = (paramName: string, paramDef: ParameterDefinition): React.ReactNode => {
    // Check for custom renderer first
    if (customRenderers[paramName]) {
      return customRenderers[paramName](paramName, paramDef);
    }

    // Skip complex types that need special handling
    if (skipParameters.includes(paramName)) {
      return null;
    }

    const value = parameters[paramName];
    const isRequired = paramDef.required ?? false;
    const label = paramName.charAt(0).toUpperCase() + paramName.slice(1).replace(/([A-Z])/g, ' $1');

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

        // Speaker control - dropdown populated from characters + Narrator + Custom
        if (paramDef.ui?.control === 'speaker') {
          const speakerOptions: { value: string; label: string }[] = [
            { value: '', label: '(Default — Narrator)' },
            { value: 'Narrator', label: 'Narrator' },
          ];
          if (characters) {
            for (const char of characters) {
              const name = char.displayName || char.name || char.id;
              if (name && !speakerOptions.some(o => o.value === name)) {
                speakerOptions.push({ value: name, label: name });
              }
            }
          }
          const isCustom = value && !speakerOptions.some(o => o.value === value);
          return (
            <div key={paramName}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {paramDef.ui.label || label}
              </label>
              <select
                value={isCustom ? '__custom__' : (value || '')}
                onChange={(e) => {
                  if (e.target.value === '__custom__') {
                    onParameterChange(paramName, value || '');
                  } else {
                    onParameterChange(paramName, e.target.value);
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                {speakerOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
                <option value="__custom__">Custom...</option>
              </select>
              {(isCustom || value === '__custom__') && (
                <input
                  type="text"
                  value={isCustom ? value : ''}
                  onChange={(e) => onParameterChange(paramName, e.target.value)}
                  placeholder="Enter speaker name..."
                  className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-lg text-sm"
                />
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
          const hasCounters = availableCounters.length > 0;
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
                  {availableCounters.map((c) => (
                    <option key={`${c.characterId}-${c.name}`} value={c.name}>
                      {c.fullName}
                    </option>
                  ))}
                </datalist>
              )}
              {hasCounters ? (
                <p className="text-xs text-gray-500 mt-1">
                  {availableCounters.length} counter(s) available from characters
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

        // Handle character selection fields
        if (paramName === 'characterId') {
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
                {characters && characters.length > 0 ? (
                  characters.map((char: any) => (
                    <option key={char.id} value={char.id}>
                      {char.name || char.displayName || char.id}
                    </option>
                  ))
                ) : (
                  <option disabled>No characters defined</option>
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

        // Handle variable/counter name field with dropdowns for setVariable beat
        if (paramName === 'name' && beatType === 'setVariable') {
          // Fictional time doesn't use a variable name
          if (parameters.type === 'fictionalTime') return null;
          const isCounter = parameters.type === 'counter';
          const options = isCounter ? availableCounters : availableVariables;
          const hasOptions = options.length > 0;

          return (
            <div key={paramName}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Variable className="w-4 h-4 inline mr-1" />
                {isCounter ? 'Counter' : 'Variable'} Name {isRequired && <span className="text-red-500">*</span>}
              </label>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={value || paramDef.default || ''}
                    onChange={(e) => onParameterChange(paramName, e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm pr-8"
                    placeholder={hasOptions ? `Type or select ${isCounter ? 'counter' : 'variable'}...` : `Enter ${isCounter ? 'counter' : 'variable'} name`}
                    required={isRequired}
                    list={`${paramName}-datalist`}
                  />
                  {hasOptions && (
                    <datalist id={`${paramName}-datalist`}>
                      {isCounter
                        ? availableCounters.map((c) => (
                            <option key={`${c.characterId}-${c.name}`} value={c.name}>
                              {c.fullName}
                            </option>
                          ))
                        : availableVariables.map((v) => (
                            <option key={v.name} value={v.name}>
                              {v.description || v.name}
                            </option>
                          ))}
                    </datalist>
                  )}
                </div>
              </div>
              {hasOptions ? (
                <p className="text-xs text-gray-500 mt-1">
                  {isCounter
                    ? `${availableCounters.length} counter(s) available from characters`
                    : `${availableVariables.length} variable(s) defined in Global Settings`}
                </p>
              ) : (
                <p className="text-xs text-gray-500 mt-1">
                  {isCounter
                    ? 'No counters defined. Add counters to characters first.'
                    : 'No variables defined. Add variables in Global Settings.'}
                </p>
              )}
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

                      // Default: text input
                      return (
                        <div key={fieldName}>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            {fieldLabel}
                            {fieldDef.required && <span className="text-red-500 ml-1">*</span>}
                          </label>
                          <input
                            type={fieldDef.type === 'number' ? 'number' : 'text'}
                            value={fieldValue ?? fieldDef.default ?? ''}
                            onChange={(e) => {
                              const newItems = [...items];
                              const newValue = fieldDef.type === 'number'
                                ? parseFloat(e.target.value)
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
