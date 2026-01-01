import React from 'react';
import { Variable, Box, Timer, User, ChevronDown } from 'lucide-react';
import type { Beat } from '@asaps/core';
import type { AvailableCounter, AvailableVariable } from '../hooks/useAvailableCountersAndVariables';

// Type definitions for beat schema
interface ParameterDefinition {
  type: string;
  required?: boolean;
  default?: any;
  description?: string;
  minItems?: number;
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

    const value = parameters[paramName];
    const isRequired = paramDef.required ?? false;
    const label = paramName.charAt(0).toUpperCase() + paramName.slice(1).replace(/([A-Z])/g, ' $1');

    // Determine field type based on parameter type
    switch (paramDef.type) {
      case 'string':
        // Check if it's a multi-line text field
        if (paramName === 'text' || paramName === 'message' || paramName === 'prompt') {
          return (
            <div key={paramName}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {label} {isRequired && <span className="text-red-500">*</span>}
              </label>
              <textarea
                value={value || paramDef.default || ''}
                onChange={(e) => onParameterChange(paramName, e.target.value)}
                rows={paramName === 'message' ? 2 : 4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder={paramDef.description || `Enter ${paramName}`}
              />
              {paramDef.description && (
                <p className="text-xs text-gray-500 mt-1">{paramDef.description}</p>
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
        return (
          <div key={paramName}>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {label} {isRequired && <span className="text-red-500">*</span>}
            </label>
            <input
              type="text"
              value={value || paramDef.default || ''}
              onChange={(e) => onParameterChange(paramName, e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              placeholder={paramDef.description || `Enter ${paramName}`}
            />
            {paramDef.description && (
              <p className="text-xs text-gray-500 mt-1">{paramDef.description}</p>
            )}
          </div>
        );

      case 'number':
        return (
          <div key={paramName}>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {label} {isRequired && <span className="text-red-500">*</span>}
            </label>
            <input
              type="number"
              value={value ?? paramDef.default ?? 0}
              onChange={(e) => onParameterChange(paramName, paramName === 'duration' && beatType === 'durScreen' ?
                parseInt(e.target.value) : parseInt(e.target.value))}
              min={paramDef.type === 'number' ? 0 : undefined}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            {paramDef.description && (
              <p className="text-xs text-gray-500 mt-1">{paramDef.description}</p>
            )}
          </div>
        );

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
          if (parameters.type === 'counter') {
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
            return (
              <div key={paramName}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Value
                </label>
                <input
                  type="text"
                  value={value || ''}
                  onChange={(e) => onParameterChange(paramName, e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="Variable value"
                />
              </div>
            );
          }
        }

        // Default: text input for any type
        return (
          <div key={paramName}>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {label} {isRequired && <span className="text-red-500">*</span>}
            </label>
            <input
              type="text"
              value={value || paramDef.default || ''}
              onChange={(e) => onParameterChange(paramName, e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              placeholder={paramDef.description}
            />
          </div>
        );

      default:
        // For unknown types, render nothing (they'll be handled by custom renderers)
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

  return (
    <div className="space-y-4">
      {Object.entries(beatDefinition.parameters).map(([paramName, paramDef]) =>
        renderField(paramName, paramDef)
      )}
    </div>
  );
};

// Export types for use in other components
export type { BeatDefinition, ParameterDefinition };
