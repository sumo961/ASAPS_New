/**
 * Value field for a story variable. A variable declared boolean in Project
 * Settings gets a true / false picker that stores a real boolean; every
 * other variable keeps a text field. Typed "false" never equalled the
 * variable's boolean default at runtime, so the picker is the authoring-side
 * half of that fix (the engine also converts text for declared types).
 */
import React from 'react';

export type VariableType = 'string' | 'number' | 'boolean';

interface VariableValueInputProps {
  variableType: VariableType | undefined;
  value: unknown;
  onChange: (value: unknown) => void;
  className?: string;
  placeholder?: string;
}

export const VariableValueInput: React.FC<VariableValueInputProps> = ({
  variableType,
  value,
  onChange,
  className,
  placeholder,
}) => {
  if (variableType === 'boolean') {
    return (
      <select
        value={String(value).trim().toLowerCase() === 'true' ? 'true' : 'false'}
        onChange={(e) => onChange(e.target.value === 'true')}
        className={`${className ?? ''} bg-white`}
      >
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }
  return (
    <input
      type="text"
      value={value === undefined || value === null ? '' : String(value)}
      onChange={(e) => onChange(e.target.value)}
      className={className}
      placeholder={placeholder}
    />
  );
};

/** The value to store when a boolean variable is picked: the picker shows
 *  "false" for an empty or text value, so store what it shows. */
export function valueForPickedVariable(variableType: VariableType | undefined, current: unknown): unknown {
  if (variableType !== 'boolean' || typeof current === 'boolean') return current;
  return String(current).trim().toLowerCase() === 'true';
}
