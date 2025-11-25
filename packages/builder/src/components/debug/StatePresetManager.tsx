import React from 'react';
import type { StatePreset, Story } from '@asaps/core';

interface StatePresetManagerProps {
  story: Story;
  presets?: StatePreset[];
  selectedPresetId?: string;
  onLoad?: (preset: StatePreset) => void;
  onEdit?: (preset: StatePreset) => void;
  onCreate?: () => void;
  onDelete?: (presetId: string) => void;
}

export const StatePresetManager: React.FC<StatePresetManagerProps> = ({
  story,
  presets = [],
  selectedPresetId,
  onLoad,
  onEdit,
  onCreate,
  onDelete
}) => {
  const storyTitle = story && (story as any).title ? (story as any).title : 'Unknown Story';

  return (
    <div className="p-4 bg-gray-50 rounded-lg">
      <h3 className="text-lg font-semibold mb-4">State Preset Manager</h3>
      <div className="space-y-2">
        <p className="text-gray-600">State preset management UI - Story: {storyTitle}</p>
        {presets.length === 0 ? (
          <p className="text-sm text-gray-500">No presets available</p>
        ) : (
          <ul className="space-y-2">
            {presets.map((preset) => (
              <li key={preset.id} className="p-2 bg-white rounded border">
                <div className="font-medium">{preset.name}</div>
                <div className="text-sm text-gray-500">{preset.description}</div>
                {selectedPresetId === preset.id && (
                  <div className="text-xs text-blue-600 mt-1">Selected</div>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2 mt-4">
          {onCreate && (
            <button
              onClick={onCreate}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Create Preset
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
