import React from 'react';
import { Variable, Box, Timer, User } from 'lucide-react';
import type { Beat } from '@asaps/core';

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
  // Callbacks for special cases
  customRenderers?: Record<string, (param: string, def: ParameterDefinition) => React.ReactNode>;
}

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
  customRenderers = {},
}) => {

  // Skip parameters that should be handled elsewhere (connections, complex types)
  const skipParameters = ['connection', 'defaultConnection', 'trueConnection', 'falseConnection',
    'dialogTree', 'choices', 'props', 'hyperlinks', 'restartConnection'];

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
                  // Clear the other field when switching
                  if (e.target.value === 'variable') {
                    onParameterChange('characterId', undefined);
                    if (!parameters.variable) {
                      onParameterChange('variable', 'userInput');
                    }
                  } else {
                    onParameterChange('variable', undefined);
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="variable">Variable</option>
                <option value="characterName">Character Display Name</option>
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

        // Handle variable name fields
        if (paramName === 'variable' || paramName === 'timer' || paramName === 'item' ||
            paramName === 'timerName' || paramName === 'character' ||
            paramName === 'fromChar' || paramName === 'toChar' || paramName === 'name') {
          const IconComponent = paramName.includes('timer') || paramName.includes('Timer') ? Timer :
                      paramName.includes('item') || paramName.includes('char') || paramName.includes('Char') ? Box :
                      Variable;

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
              />
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
