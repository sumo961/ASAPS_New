import React from 'react';

interface TimeDisplaySettingProps {
  mode?: 'fictionalTime' | 'manual' | 'none';
  text?: string;
  onChange: (field: 'timeDisplayMode' | 'timeDisplayText', value: string) => void;
}

/** What the clock (Timer HUD) shows on this beat. */
export const TimeDisplaySetting: React.FC<TimeDisplaySettingProps> = ({ mode, text, onChange }) => (
  <div className="border-t pt-3 mt-3" data-testid="time-display-setting">
    <h4 className="text-sm font-medium text-gray-700 mb-1">Time Display</h4>
    <select
      value={mode || 'fictionalTime'}
      onChange={(e) => {
        const next = e.target.value;
        onChange('timeDisplayMode', next);
        // Clear manual text when switching away from manual
        if (next !== 'manual') onChange('timeDisplayText', '');
      }}
      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
    >
      <option value="fictionalTime">Fictional Time (default)</option>
      <option value="manual">Manual text</option>
      <option value="none">None (hide on this beat)</option>
    </select>
    {mode === 'manual' && (
      <input
        type="text"
        value={text || ''}
        onChange={(e) => onChange('timeDisplayText', e.target.value)}
        placeholder="e.g. Meanwhile..., 2h later"
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mt-2"
      />
    )}
    <p className="text-xs text-gray-500 mt-1">
      Controls what the Timer HUD shows on this beat.
    </p>
  </div>
);
