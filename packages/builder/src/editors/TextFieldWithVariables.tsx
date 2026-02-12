import React, { useRef, useState } from 'react';
import type { AvailableVariable } from '../hooks/useAvailableCountersAndVariables';

interface TextFieldWithVariablesProps {
  value: string;
  onChange: (value: string) => void;
  availableVariables: AvailableVariable[];
  placeholder?: string;
  multiline?: boolean;
  className?: string;
  rows?: number;
}

/**
 * Text input/textarea with a ${x} button that opens a dropdown to insert variable references.
 */
export const TextFieldWithVariables: React.FC<TextFieldWithVariablesProps> = ({
  value,
  onChange,
  availableVariables,
  placeholder,
  multiline = false,
  className = '',
  rows = 3,
}) => {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const [showMenu, setShowMenu] = useState(false);

  const insertVariable = (varName: string) => {
    const el = inputRef.current;
    if (!el) {
      onChange(value + `\${${varName}}`);
      setShowMenu(false);
      return;
    }

    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const insertion = `\${${varName}}`;
    const newValue = value.substring(0, start) + insertion + value.substring(end);
    onChange(newValue);
    setShowMenu(false);

    // Restore cursor position after insertion
    requestAnimationFrame(() => {
      const newPos = start + insertion.length;
      el.setSelectionRange(newPos, newPos);
      el.focus();
    });
  };

  return (
    <div className="relative">
      <div className="flex items-start gap-1">
        {multiline ? (
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={`flex-1 ${className}`}
            rows={rows}
          />
        ) : (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={`flex-1 ${className}`}
          />
        )}
        {availableVariables.length > 0 && (
          <button
            type="button"
            onClick={() => setShowMenu(!showMenu)}
            className="px-1.5 py-1 text-xs font-mono text-gray-500 hover:text-blue-600 hover:bg-blue-50 border rounded flex-shrink-0 transition-colors"
            title="Insert variable reference"
          >
            {'${x}'}
          </button>
        )}
      </div>

      {showMenu && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto min-w-[160px]">
          <div className="px-2 py-1 text-xs font-medium text-gray-500 border-b">
            Insert Variable
          </div>
          {availableVariables.map((v) => (
            <button
              key={v.name}
              type="button"
              onClick={() => insertVariable(v.name)}
              className="w-full px-3 py-1.5 text-left text-xs hover:bg-blue-50 flex items-center gap-2"
            >
              <span className="font-mono text-blue-600">${'{'}{ v.name }{'}'}</span>
              {v.description && (
                <span className="text-gray-400 truncate">{v.description}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
