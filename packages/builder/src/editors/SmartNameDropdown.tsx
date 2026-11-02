import React, { useState } from 'react';
import { looksLikeSameName } from '@asaps/core';

export interface DropdownOption {
  name: string;
  displayName: string;
  characterName?: string;
}

interface SmartNameDropdownProps {
  value: string;
  onChange: (value: string | undefined) => void;
  options: DropdownOption[];
  placeholder?: string;
  newItemLabel?: string;
  noSelectionLabel?: string;
  className?: string;
}

/**
 * Reusable dropdown with options grouped by character and a "+ New..." custom entry mode.
 * Extracted from the DialogTreeEditor counter dropdown pattern.
 */
export const SmartNameDropdown: React.FC<SmartNameDropdownProps> = ({
  value,
  onChange,
  options,
  placeholder = 'Custom name',
  newItemLabel = '+ New...',
  noSelectionLabel = 'None',
  className = '',
}) => {
  // Check if current value is custom (not in options list)
  const isCustom = value && !options.some(o => o.name === value);
  const [forceCustom, setForceCustom] = useState(false);

  // Group options by character name
  const grouped = new Map<string, DropdownOption[]>();
  for (const opt of options) {
    const group = opt.characterName || 'General';
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group)!.push(opt);
  }

  if (isCustom || forceCustom) {
    // A new name this close to one that exists is usually that one, mistyped:
    // a variable isn't checked when it's written, so the slip goes unnoticed.
    const similar = value ? options.find((o) => o.name !== value && looksLikeSameName(o.name, value)) : undefined;
    return (
      <div className={`flex flex-col gap-0.5 ${className}`}>
      <div className="flex gap-1 items-center">
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value || undefined)}
          placeholder={placeholder}
          className="flex-1 min-w-0 px-2 py-1 text-xs border rounded"
        />
        <button
          type="button"
          onClick={() => {
            setForceCustom(false);
            onChange(undefined);
          }}
          className="px-1.5 py-0.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded flex-shrink-0"
          title="Clear"
        >
          &times;
        </button>
      </div>
      {similar && (
        <button
          type="button"
          onClick={() => {
            setForceCustom(false);
            onChange(similar.name);
          }}
          className="text-left text-xs text-amber-700 hover:underline"
          title="Use the existing name. Ignore this if you do mean a new one."
        >
          Did you mean "{similar.displayName || similar.name}"?
        </button>
      )}
      </div>
    );
  }

  return (
    <select
      value={value || ''}
      onChange={(e) => {
        const v = e.target.value;
        if (v === '__custom__') {
          setForceCustom(true);
          onChange('');
        } else {
          onChange(v || undefined);
        }
      }}
      className={`px-2 py-1 text-xs border rounded bg-white ${className}`}
    >
      <option value="">{noSelectionLabel}</option>
      <option value="__custom__">{newItemLabel}</option>
      {grouped.size === 1 && grouped.has('General') ? (
        // No grouping needed
        options.map(opt => (
          <option key={opt.name} value={opt.name}>
            {opt.displayName}
          </option>
        ))
      ) : (
        Array.from(grouped.entries()).map(([groupName, groupOpts]) => (
          <optgroup key={groupName} label={groupName}>
            {groupOpts.map(opt => (
              <option key={opt.name} value={opt.name}>
                {opt.displayName}
              </option>
            ))}
          </optgroup>
        ))
      )}
    </select>
  );
};
