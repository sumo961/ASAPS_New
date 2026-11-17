/**
 * Story Data ▸ Variables: the story's declared variables, their starting
 * values and whether they survive a restart. Stored in the project's
 * settings (`variables`); edited here because they are story content the
 * author returns to while writing, not a setting made once.
 */
import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Variable } from 'lucide-react';
import type { GlobalSettings } from '../../storage/types';

export type StoryVariable = NonNullable<GlobalSettings['variables']>[number];

interface Props {
  variables: StoryVariable[];
  onChange: (variables: StoryVariable[]) => void;
  /** Drawn under each variable: where it is set and tested. */
  renderUsage?: (name: string) => React.ReactNode;
}

/**
 * A text field that takes effect when it is left (or on Enter), so one
 * edit is one Undo step instead of one per keystroke.
 */
const CommitInput: React.FC<{
  value: string;
  onCommit: (value: string) => void;
  type?: 'text' | 'number';
  placeholder?: string;
  className?: string;
  'aria-label'?: string;
}> = ({ value, onCommit, type = 'text', placeholder, className, ...rest }) => {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      type={type}
      value={draft}
      placeholder={placeholder}
      aria-label={rest['aria-label']}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (draft !== value) onCommit(draft); }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      className={className ?? 'w-full px-2 py-1 text-sm border rounded'}
    />
  );
};

export const VariablesPanel: React.FC<Props> = ({ variables, onChange, renderUsage }) => {
  const update = (index: number, patch: Partial<StoryVariable>) =>
    onChange(variables.map((v, i) => (i === index ? { ...v, ...patch } : v)));

  const add = () => {
    const taken = new Set(variables.map((v) => v.name));
    let n = variables.length + 1;
    while (taken.has(`variable_${n}`)) n++;
    onChange([...variables, { name: `variable_${n}`, type: 'string', defaultValue: '', description: '' }]);
  };

  return (
    <div className="space-y-4" data-testid="story-data-variables">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-gray-700">Variables</h3>
        <button
          onClick={add}
          className="flex items-center gap-1 px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          <Plus className="w-4 h-4" />
          Add Variable
        </button>
      </div>

      <p className="text-sm text-gray-600">
        Variables remember what happened: a door unlocked, a name the player typed, a score. Each starts at its
        starting value and goes back to it when an ending's Restart resets variables, unless you tick{' '}
        <em>Keep across restarts</em>. Built in:{' '}
        <code className="font-mono text-xs bg-gray-100 px-1 rounded">playthrough</code> counts the runs (1, 2, …).
      </p>

      {variables.length === 0 ? (
        <div className="text-center py-8 text-gray-500 border-2 border-dashed rounded-lg">
          <Variable className="w-12 h-12 mx-auto mb-2 opacity-30" />
          <p>No variables yet.</p>
          <p className="text-sm">Add one here, or name a new one in a Set Variable beat or a choice's effect.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {variables.map((variable, index) => (
            <div key={index} className="p-3 border rounded-lg bg-white" data-testid={`variable-${variable.name}`}>
              <div className="flex items-start gap-3">
                <div className="flex-1 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                      <CommitInput
                        value={variable.name}
                        aria-label="Variable name"
                        placeholder="variableName"
                        onCommit={(name) => { if (name.trim()) update(index, { name: name.trim() }); }}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                      <select
                        value={variable.type}
                        onChange={(e) => {
                          const type = e.target.value as StoryVariable['type'];
                          update(index, { type, defaultValue: type === 'number' ? 0 : type === 'boolean' ? false : '' });
                        }}
                        className="w-full px-2 py-1 text-sm border rounded"
                      >
                        <option value="string">Text</option>
                        <option value="number">Number</option>
                        <option value="boolean">True / false</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Starts as</label>
                      {variable.type === 'boolean' ? (
                        <select
                          value={String(variable.defaultValue ?? false)}
                          onChange={(e) => update(index, { defaultValue: e.target.value === 'true' })}
                          className="w-full px-2 py-1 text-sm border rounded"
                        >
                          <option value="false">False</option>
                          <option value="true">True</option>
                        </select>
                      ) : (
                        <CommitInput
                          type={variable.type === 'number' ? 'number' : 'text'}
                          aria-label="Starting value"
                          value={variable.type === 'number'
                            ? String(typeof variable.defaultValue === 'number' ? variable.defaultValue : 0)
                            : (typeof variable.defaultValue === 'string' ? variable.defaultValue : '')}
                          placeholder={variable.type === 'number' ? '0' : 'starting value'}
                          onCommit={(raw) => update(index, {
                            defaultValue: variable.type === 'number' ? (parseFloat(raw) || 0) : raw,
                          })}
                        />
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                      <CommitInput
                        value={variable.description || ''}
                        aria-label="Description"
                        placeholder="What is this variable for?"
                        onCommit={(description) => update(index, { description })}
                      />
                    </div>
                  </div>
                  <label
                    className="flex items-start gap-2 text-xs text-gray-600 cursor-pointer"
                    title="When the player presses Restart on an ending, this variable keeps its value, e.g. a character the player chose, or something they unlocked."
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={!!variable.keepOnRestart}
                      onChange={(e) => update(index, { keepOnRestart: e.target.checked || undefined })}
                    />
                    <span>Keep across restarts</span>
                  </label>
                  {renderUsage?.(variable.name)}
                </div>
                <button
                  onClick={() => onChange(variables.filter((_, i) => i !== index))}
                  className="p-1 text-red-500 hover:bg-red-50 rounded"
                  title="Delete variable"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
