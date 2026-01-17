import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { StatePreset, Story } from '@asaps/core';
import type { StoryContext } from '@asaps/core';
import { BackwardAnalyzer } from '@asaps/core';
import { Plus, Trash2, Save, X, Wand2, AlertCircle } from 'lucide-react';

interface StatePresetEditorProps {
  story: Story;
  preset?: StatePreset;
  currentContext?: StoryContext;
  onSave?: (presetData: Omit<StatePreset, 'id' | 'modifiedAt' | 'createdAt'>) => void;
  onCancel?: () => void;
}

/**
 * Enhanced State Preset Editor
 * Allows editing variables, counters, inventory, and visited beats
 * for testing story playback from specific states
 */
export const StatePresetEditor: React.FC<StatePresetEditorProps> = ({
  story,
  preset,
  currentContext,
  onSave,
  onCancel
}) => {
  const [name, setName] = useState(preset?.name || '');
  const [description, setDescription] = useState(preset?.description || '');
  const [startBeatId, setStartBeatId] = useState(preset?.beatId || '');

  // State values
  const [variables, setVariables] = useState<Record<string, string>>(
    preset?.state.variables || {}
  );
  const [counters, setCounters] = useState<Record<string, number>>(
    preset?.state.counters || {}
  );
  const [inventory, setInventory] = useState<string[]>(
    preset?.state.inventory || []
  );
  const [visitedBeats, setVisitedBeats] = useState<string[]>(
    preset?.state.visitedBeats || []
  );

  // New item inputs
  const [newVarName, setNewVarName] = useState('');
  const [newVarValue, setNewVarValue] = useState('');
  const [newCounterName, setNewCounterName] = useState('');
  const [newCounterValue, setNewCounterValue] = useState(0);
  const [newInventoryItem, setNewInventoryItem] = useState('');

  // Get all beats for dropdown
  const allBeats = useMemo(() => story.getAllBeats(), [story]);

  // Get inputText variables specifically (player input like name, gender, etc.)
  const inputTextVariables = useMemo(() => {
    const vars: Array<{ name: string; beatName: string; beatId: string }> = [];
    allBeats.forEach(beat => {
      const params = beat.getParameters?.() || {};
      if (beat.type === 'inputText' && params.variableName) {
        vars.push({
          name: params.variableName,
          beatName: beat.name,
          beatId: beat.id
        });
      }
    });
    return vars;
  }, [allBeats]);

  // Get other variables used in the story (from setVariable beats, not inputText)
  const storyVariables = useMemo(() => {
    const vars = new Set<string>();
    const inputTextVarNames = new Set(inputTextVariables.map(v => v.name));
    allBeats.forEach(beat => {
      const params = beat.getParameters?.() || {};
      // SetVariable beats (exclude inputText variables)
      if (beat.type === 'setVariable' && params.variableName && !inputTextVarNames.has(params.variableName)) {
        vars.add(params.variableName);
      }
    });
    return Array.from(vars);
  }, [allBeats, inputTextVariables]);

  // Get counters used in the story (from setVariable beats)
  const storyCounters = useMemo(() => {
    const countersSet = new Set<string>();
    allBeats.forEach(beat => {
      const params = beat.getParameters?.() || {};
      if (beat.type === 'setVariable' && params.counterName) {
        countersSet.add(params.counterName);
      }
    });
    return Array.from(countersSet);
  }, [allBeats]);

  useEffect(() => {
    if (preset) {
      setName(preset.name);
      setDescription(preset.description || '');
      setStartBeatId(preset.beatId || '');
      setVariables(preset.state.variables || {});
      setCounters(preset.state.counters || {});
      setInventory(preset.state.inventory || []);
      setVisitedBeats(preset.state.visitedBeats || []);
    }
  }, [preset]);

  // Capture current context state if available
  const captureFromContext = () => {
    if (currentContext) {
      setVariables(currentContext.getVariables() || {});
      setCounters(currentContext.getCounters() || {});
      setInventory(currentContext.getInventory() || []);
      setVisitedBeats(currentContext.getVisitedBeats() || []);
    }
  };

  // State for path analysis
  const [analysisStatus, setAnalysisStatus] = useState<'idle' | 'analyzing' | 'success' | 'no-paths'>('idle');

  // Auto-populate from backward path analysis
  const populateFromPathAnalysis = useCallback(() => {
    if (!startBeatId) {
      setAnalysisStatus('no-paths');
      return;
    }

    setAnalysisStatus('analyzing');

    try {
      const analyzer = new BackwardAnalyzer(story);
      const result = analyzer.analyzeBackward(startBeatId);

      if (result.requirements.length === 0) {
        setAnalysisStatus('no-paths');
        return;
      }

      // Use the first (shortest) path's requirements
      const firstPath = result.requirements[0];
      const constraints = firstPath.constraints;

      // Extract variables and counters from constraints
      const newVariables: Record<string, string> = { ...variables };
      const newCounters: Record<string, number> = { ...counters };

      for (const [varName, constraint] of constraints.variables) {
        if (constraint.type === 'numeric') {
          // For numeric constraints, use exact value if available, otherwise use min or max
          if (constraint.exact !== undefined) {
            newCounters[varName] = constraint.exact;
          } else if (constraint.min !== undefined) {
            newCounters[varName] = constraint.min;
          } else if (constraint.max !== undefined) {
            newCounters[varName] = constraint.max;
          }
        } else if (constraint.type === 'value') {
          // For value constraints, use exact equals value if available
          if (constraint.equals !== undefined) {
            newVariables[varName] = String(constraint.equals);
          }
        }
      }

      // Extract inventory items from constraints
      const newInventory = new Set(inventory);
      for (const [_character, inv] of constraints.inventory) {
        // Add items that must be present
        for (const item of inv.has) {
          newInventory.add(item);
        }
        // Remove items that must NOT be present
        for (const item of inv.notHas) {
          newInventory.delete(item);
        }
      }

      // Extract visited beats from constraints
      const newVisitedBeats = new Set(visitedBeats);
      for (const beatId of constraints.requiredVisits) {
        newVisitedBeats.add(beatId);
      }
      // Also add all beats on the path as visited (they would have been visited to reach the start beat)
      for (const pathBeat of firstPath.pathBeats) {
        // Don't add the target beat itself as visited
        if (pathBeat.beatId !== startBeatId) {
          newVisitedBeats.add(pathBeat.beatId);
        }
      }

      // Update state
      setVariables(newVariables);
      setCounters(newCounters);
      setInventory(Array.from(newInventory));
      setVisitedBeats(Array.from(newVisitedBeats));
      setAnalysisStatus('success');

      // Reset status after a short delay
      setTimeout(() => setAnalysisStatus('idle'), 2000);
    } catch (error) {
      console.error('Path analysis error:', error);
      setAnalysisStatus('no-paths');
    }
  }, [story, startBeatId, variables, counters, inventory, visitedBeats]);

  const handleSave = () => {
    if (onSave && name.trim()) {
      onSave({
        name: name.trim(),
        description: description.trim(),
        beatId: startBeatId || allBeats[0]?.id || 'default-beat',
        state: {
          variables,
          counters,
          inventory,
          visitedBeats
        }
      });
    }
  };

  // Variable handlers
  const addVariable = () => {
    if (newVarName.trim()) {
      setVariables(prev => ({ ...prev, [newVarName.trim()]: newVarValue }));
      setNewVarName('');
      setNewVarValue('');
    }
  };

  const updateVariable = (key: string, value: string) => {
    setVariables(prev => ({ ...prev, [key]: value }));
  };

  const removeVariable = (key: string) => {
    setVariables(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  // Counter handlers
  const addCounter = () => {
    if (newCounterName.trim()) {
      setCounters(prev => ({ ...prev, [newCounterName.trim()]: newCounterValue }));
      setNewCounterName('');
      setNewCounterValue(0);
    }
  };

  const updateCounter = (key: string, value: number) => {
    setCounters(prev => ({ ...prev, [key]: value }));
  };

  const removeCounter = (key: string) => {
    setCounters(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  // Inventory handlers
  const addInventoryItem = () => {
    if (newInventoryItem.trim() && !inventory.includes(newInventoryItem.trim())) {
      setInventory(prev => [...prev, newInventoryItem.trim()]);
      setNewInventoryItem('');
    }
  };

  const removeInventoryItem = (item: string) => {
    setInventory(prev => prev.filter(i => i !== item));
  };

  // Visited beats handlers
  const toggleVisitedBeat = (beatId: string) => {
    setVisitedBeats(prev =>
      prev.includes(beatId)
        ? prev.filter(id => id !== beatId)
        : [...prev, beatId]
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold">
            {preset ? 'Edit State Preset' : 'Create State Preset'}
          </h3>
          <button
            onClick={onCancel}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Basic Info */}
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., After Introduction"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Optional description"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Start from Beat</label>
              <select
                value={startBeatId}
                onChange={(e) => setStartBeatId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">-- Select starting beat --</option>
                {allBeats.map(beat => (
                  <option key={beat.id} value={beat.id}>
                    {beat.name} ({beat.type})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Capture from current context */}
          {currentContext && (
            <div className="bg-blue-50 p-3 rounded-lg">
              <button
                onClick={captureFromContext}
                className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
              >
                Capture Current State
              </button>
              <p className="text-xs text-blue-700 mt-1">
                Copy variables, counters, inventory, and visited beats from the running preview
              </p>
            </div>
          )}

          {/* Auto-populate from path analysis */}
          <div className="bg-purple-50 p-3 rounded-lg">
            <div className="flex items-center gap-2">
              <button
                onClick={populateFromPathAnalysis}
                disabled={!startBeatId || analysisStatus === 'analyzing'}
                className="px-3 py-1.5 bg-purple-600 text-white text-sm rounded hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                <Wand2 className="w-4 h-4" />
                {analysisStatus === 'analyzing' ? 'Analyzing...' : 'Auto-populate from Path'}
              </button>
              {analysisStatus === 'success' && (
                <span className="text-sm text-green-600">State populated!</span>
              )}
              {analysisStatus === 'no-paths' && (
                <span className="text-sm text-amber-600 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  No path found to this beat
                </span>
              )}
            </div>
            <p className="text-xs text-purple-700 mt-1">
              Analyze story paths to auto-fill required variables, counters, inventory, and visited beats to reach the selected start beat
            </p>
          </div>

          {/* Player Input Variables Section (from inputText beats) */}
          {inputTextVariables.length > 0 && (
            <div className="border border-green-200 bg-green-50 rounded-lg p-3">
              <h4 className="font-medium mb-2 flex items-center gap-2 text-green-800">
                Player Input Variables
                <span className="text-xs text-green-600">({inputTextVariables.length} from inputText beats)</span>
              </h4>
              <p className="text-xs text-green-700 mb-3">
                These variables are set by player input during the story. Fill in test values for them.
              </p>

              <div className="space-y-2">
                {inputTextVariables.map(({ name, beatName }) => (
                  <div key={name} className="flex items-center gap-2">
                    <span className="text-sm font-mono text-green-800 w-32 truncate" title={`From: ${beatName}`}>
                      {name}
                    </span>
                    <input
                      type="text"
                      value={variables[name] || ''}
                      onChange={(e) => updateVariable(name, e.target.value)}
                      placeholder={`Enter test value for ${name}...`}
                      className="flex-1 px-2 py-1 text-sm border border-green-300 rounded bg-white focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                    <span className="text-xs text-green-600 truncate max-w-[120px]" title={beatName}>
                      ({beatName})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Other Variables Section */}
          <div className="border rounded-lg p-3">
            <h4 className="font-medium mb-2 flex items-center gap-2">
              Other Variables
              <span className="text-xs text-gray-500">({Object.keys(variables).filter(k => !inputTextVariables.some(v => v.name === k)).length})</span>
            </h4>

            {/* Existing variables (excluding inputText variables) */}
            <div className="space-y-2 mb-3">
              {Object.entries(variables)
                .filter(([key]) => !inputTextVariables.some(v => v.name === key))
                .map(([key, value]) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="text-sm font-mono text-gray-600 w-32 truncate">{key}</span>
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => updateVariable(key, e.target.value)}
                    className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded"
                  />
                  <button
                    onClick={() => removeVariable(key)}
                    className="p-1 text-red-500 hover:bg-red-50 rounded"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add new variable */}
            <div className="flex items-center gap-2 border-t pt-2">
              <select
                value={newVarName}
                onChange={(e) => setNewVarName(e.target.value)}
                className="w-32 px-2 py-1 text-sm border border-gray-300 rounded"
              >
                <option value="">Select or type...</option>
                {storyVariables.filter(v => !variables[v]).map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
              <input
                type="text"
                value={newVarName}
                onChange={(e) => setNewVarName(e.target.value)}
                placeholder="Variable name"
                className="w-32 px-2 py-1 text-sm border border-gray-300 rounded"
              />
              <input
                type="text"
                value={newVarValue}
                onChange={(e) => setNewVarValue(e.target.value)}
                placeholder="Value"
                className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded"
              />
              <button
                onClick={addVariable}
                disabled={!newVarName.trim()}
                className="p-1 text-blue-500 hover:bg-blue-50 rounded disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Counters Section */}
          <div className="border rounded-lg p-3">
            <h4 className="font-medium mb-2 flex items-center gap-2">
              Counters
              <span className="text-xs text-gray-500">({Object.keys(counters).length})</span>
            </h4>

            {/* Existing counters */}
            <div className="space-y-2 mb-3">
              {Object.entries(counters).map(([key, value]) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="text-sm font-mono text-gray-600 w-32 truncate">{key}</span>
                  <input
                    type="number"
                    value={value}
                    onChange={(e) => updateCounter(key, parseInt(e.target.value) || 0)}
                    className="w-24 px-2 py-1 text-sm border border-gray-300 rounded"
                  />
                  <button
                    onClick={() => removeCounter(key)}
                    className="p-1 text-red-500 hover:bg-red-50 rounded"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add new counter */}
            <div className="flex items-center gap-2 border-t pt-2">
              <select
                value={newCounterName}
                onChange={(e) => setNewCounterName(e.target.value)}
                className="w-32 px-2 py-1 text-sm border border-gray-300 rounded"
              >
                <option value="">Select or type...</option>
                {storyCounters.filter(c => !counters[c]).map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <input
                type="text"
                value={newCounterName}
                onChange={(e) => setNewCounterName(e.target.value)}
                placeholder="Counter name"
                className="w-32 px-2 py-1 text-sm border border-gray-300 rounded"
              />
              <input
                type="number"
                value={newCounterValue}
                onChange={(e) => setNewCounterValue(parseInt(e.target.value) || 0)}
                placeholder="Value"
                className="w-24 px-2 py-1 text-sm border border-gray-300 rounded"
              />
              <button
                onClick={addCounter}
                disabled={!newCounterName.trim()}
                className="p-1 text-blue-500 hover:bg-blue-50 rounded disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Inventory Section */}
          <div className="border rounded-lg p-3">
            <h4 className="font-medium mb-2 flex items-center gap-2">
              Inventory
              <span className="text-xs text-gray-500">({inventory.length} items)</span>
            </h4>

            {/* Existing items */}
            <div className="flex flex-wrap gap-2 mb-3">
              {inventory.map(item => (
                <span
                  key={item}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-sm"
                >
                  {item}
                  <button
                    onClick={() => removeInventoryItem(item)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              {inventory.length === 0 && (
                <span className="text-sm text-gray-400">No items</span>
              )}
            </div>

            {/* Add new item */}
            <div className="flex items-center gap-2 border-t pt-2">
              <input
                type="text"
                value={newInventoryItem}
                onChange={(e) => setNewInventoryItem(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addInventoryItem()}
                placeholder="Item name"
                className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded"
              />
              <button
                onClick={addInventoryItem}
                disabled={!newInventoryItem.trim()}
                className="p-1 text-blue-500 hover:bg-blue-50 rounded disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Visited Beats Section */}
          <div className="border rounded-lg p-3">
            <h4 className="font-medium mb-2 flex items-center gap-2">
              Mark Beats as Visited
              <span className="text-xs text-gray-500">({visitedBeats.length} selected)</span>
            </h4>
            <p className="text-xs text-gray-500 mb-2">
              Select beats that should be marked as already visited when starting from this preset
            </p>

            <div className="max-h-40 overflow-y-auto space-y-1">
              {allBeats.map(beat => (
                <label
                  key={beat.id}
                  className="flex items-center gap-2 p-1 hover:bg-gray-50 rounded cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={visitedBeats.includes(beat.id)}
                    onChange={() => toggleVisitedBeat(beat.id)}
                    className="rounded"
                  />
                  <span className="text-sm">{beat.name}</span>
                  <span className="text-xs text-gray-400">({beat.type})</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t bg-gray-50">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            {preset ? 'Update Preset' : 'Create Preset'}
          </button>
        </div>
      </div>
    </div>
  );
};
