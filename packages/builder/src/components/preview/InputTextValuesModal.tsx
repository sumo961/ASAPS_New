/**
 * InputTextValuesModal - Modal for entering values for inputText beats before preview
 *
 * When a path contains inputText beats, this modal allows the creator to enter
 * meaningful values instead of using auto-generated placeholders.
 */

import React, { useState, useEffect, useRef } from 'react';
import { X, Type, Hash, Mail, Keyboard } from 'lucide-react';
import type { InputTextBeatInfo } from '../../services/PathBasedPresetGenerator';

interface InputTextValuesModalProps {
  inputTextBeats: InputTextBeatInfo[];
  onConfirm: (values: Record<string, string | number>) => void;
  onUsePlaceholders: () => void;
  onCancel: () => void;
}

/**
 * Get icon for validation type
 */
function getValidationIcon(validation: string) {
  switch (validation) {
    case 'numeric':
      return <Hash className="w-4 h-4" />;
    case 'email':
      return <Mail className="w-4 h-4" />;
    case 'alphanumeric':
      return <Keyboard className="w-4 h-4" />;
    default:
      return <Type className="w-4 h-4" />;
  }
}

/**
 * Get input type for validation
 */
function getInputType(validation: string): string {
  switch (validation) {
    case 'numeric':
      return 'number';
    case 'email':
      return 'email';
    default:
      return 'text';
  }
}

/**
 * Validate input based on validation type
 */
function validateInput(value: string, validation: string, minLength?: number, maxLength?: number): string | null {
  if (!value.trim()) {
    return 'This field is required';
  }

  if (minLength && value.length < minLength) {
    return `Minimum ${minLength} characters required`;
  }

  if (maxLength && value.length > maxLength) {
    return `Maximum ${maxLength} characters allowed`;
  }

  switch (validation) {
    case 'numeric':
      if (!/^\d+$/.test(value)) {
        return 'Please enter numbers only';
      }
      break;
    case 'email':
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        return 'Please enter a valid email address';
      }
      break;
    case 'alphanumeric':
      if (!/^[a-zA-Z0-9]+$/.test(value)) {
        return 'Please enter letters and numbers only';
      }
      break;
  }

  return null;
}

export const InputTextValuesModal: React.FC<InputTextValuesModalProps> = ({
  inputTextBeats,
  onConfirm,
  onUsePlaceholders,
  onCancel,
}) => {
  // Initialize values with simulated placeholders
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const beat of inputTextBeats) {
      initial[beat.variableName] = String(beat.simulatedValue);
    }
    return initial;
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Focus first input on mount
  useEffect(() => {
    if (firstInputRef.current) {
      firstInputRef.current.focus();
      firstInputRef.current.select();
    }
  }, []);

  const handleChange = (variableName: string, value: string) => {
    setValues(prev => ({ ...prev, [variableName]: value }));
    // Clear error when user starts typing
    if (errors[variableName]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[variableName];
        return next;
      });
    }
  };

  const handleConfirm = () => {
    // Validate all inputs
    const newErrors: Record<string, string> = {};
    for (const beat of inputTextBeats) {
      const value = values[beat.variableName] || '';
      const error = validateInput(value, beat.validation, beat.minLength, beat.maxLength);
      if (error) {
        newErrors[beat.variableName] = error;
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Convert values to appropriate types
    const typedValues: Record<string, string | number> = {};
    for (const beat of inputTextBeats) {
      const value = values[beat.variableName];
      if (beat.validation === 'numeric' || beat.saveToType === 'counter') {
        typedValues[beat.variableName] = parseFloat(value) || 0;
      } else {
        typedValues[beat.variableName] = value;
      }
    }

    onConfirm(typedValues);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleConfirm();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col"
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between bg-gray-50">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Enter Input Values</h2>
            <p className="text-sm text-gray-600">
              The selected path includes user input. Enter values or use placeholders.
            </p>
          </div>
          <button
            onClick={onCancel}
            className="p-1 hover:bg-gray-200 rounded"
            title="Cancel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {inputTextBeats.map((beat, index) => (
            <div
              key={beat.beatId}
              className="border border-gray-200 rounded-lg p-4 bg-gray-50"
            >
              {/* Beat info */}
              <div className="flex items-start gap-2 mb-3">
                <div className="p-1.5 bg-blue-100 rounded text-blue-700">
                  {getValidationIcon(beat.validation)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-800 truncate">{beat.beatName}</div>
                  <div className="text-sm text-gray-600 italic">"{beat.prompt}"</div>
                </div>
              </div>

              {/* Input field */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <span className="font-mono text-xs bg-gray-200 px-1.5 py-0.5 rounded">
                    {beat.saveToType === 'counter' ? beat.variableName : `$\{${beat.variableName}\}`}
                  </span>
                </label>
                <input
                  ref={index === 0 ? firstInputRef : undefined}
                  type={getInputType(beat.validation)}
                  value={values[beat.variableName] || ''}
                  onChange={(e) => handleChange(beat.variableName, e.target.value)}
                  placeholder={beat.placeholder || `Enter ${beat.variableName}`}
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors[beat.variableName]
                      ? 'border-red-500 bg-red-50'
                      : 'border-gray-300'
                  }`}
                  minLength={beat.minLength}
                  maxLength={beat.maxLength}
                />
                {errors[beat.variableName] && (
                  <div className="text-sm text-red-600 mt-1">
                    {errors[beat.variableName]}
                  </div>
                )}
                {beat.minLength || beat.maxLength ? (
                  <div className="text-xs text-gray-500 mt-1">
                    {beat.minLength && beat.maxLength
                      ? `${beat.minLength}-${beat.maxLength} characters`
                      : beat.minLength
                      ? `At least ${beat.minLength} characters`
                      : `Up to ${beat.maxLength} characters`}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
          <button
            onClick={onUsePlaceholders}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded"
          >
            Use Placeholders
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-2"
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InputTextValuesModal;
