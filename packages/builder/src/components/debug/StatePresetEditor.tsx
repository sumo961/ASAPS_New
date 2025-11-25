import React, { useState, useEffect } from 'react';
import type { StatePreset, Story } from '@asaps/core';
import type { StoryContext } from '@asaps/core';

interface StatePresetEditorProps {
  story: Story;
  preset?: StatePreset;
  currentContext?: StoryContext;
  onSave?: (presetData: Omit<StatePreset, 'id' | 'modifiedAt' | 'createdAt'>) => void;
  onCancel?: () => void;
}

export const StatePresetEditor: React.FC<StatePresetEditorProps> = ({
  story,
  preset,
  currentContext,
  onSave,
  onCancel
}) => {
  const [name, setName] = useState(preset?.name || '');
  const [description, setDescription] = useState(preset?.description || '');

  useEffect(() => {
    if (preset) {
      setName(preset.name);
      setDescription(preset.description || '');
    }
  }, [preset]);

  const handleSave = () => {
    if (onSave) {
      // Create a valid StatePreset structure
      const storyId = (story as any).id || 'default-story';

      onSave({
        name,
        description,
        beatId: preset?.beatId || 'default-beat',
        state: preset?.state || {
          variables: {},
          counters: {},
          inventory: [],
          visitedBeats: []
        }
      });
    }
  };

  return (
    <div className="p-4 bg-gray-50 rounded-lg">
      <h3 className="text-lg font-semibold mb-4">
        {preset ? 'Edit Preset' : 'Create Preset'}
      </h3>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Enter preset name"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Description (optional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            rows={3}
            placeholder="Enter preset description"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {preset ? 'Update' : 'Create'}
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};