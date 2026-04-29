/**
 * EmotionPaletteEditor — modal for editing the project's emotion palette
 * (Step 5 polish). Each emotion has a name, weights into mood (valence /
 * arousal), and a decay rate. Authors can rename, reweight, add, remove,
 * or reset to the default Ekman 6 + pride/shame/interest palette.
 *
 * Pure presentational: caller passes the current palette in, gets the
 * edited palette out via onChange. No engine coupling — same pattern as
 * CharacterAffectPanel.
 */

import React, { useState } from 'react';
import { DEFAULT_EMOTION_PALETTE, type EmotionDefinition } from '@asaps/core';

export interface EmotionPaletteEditorProps {
  palette: ReadonlyArray<EmotionDefinition>;
  onChange: (palette: EmotionDefinition[]) => void;
  /** Optional close callback; when present, a header X button is rendered. */
  onClose?: () => void;
  /** Test id. */
  testId?: string;
}

export const EmotionPaletteEditor: React.FC<EmotionPaletteEditorProps> = ({
  palette, onChange, onClose, testId,
}) => {
  const update = (index: number, patch: Partial<EmotionDefinition>) => {
    const next = palette.map((e, i) => i === index ? { ...e, ...patch } : e);
    onChange(next);
  };

  const remove = (index: number) => {
    const next = palette.filter((_, i) => i !== index);
    onChange(next);
  };

  const add = () => {
    onChange([
      ...palette,
      { name: 'newEmotion', weightToValence: 0, weightToArousal: 0, decayRate: 0.2 },
    ]);
  };

  const resetToDefault = () => {
    onChange(DEFAULT_EMOTION_PALETTE.map((e) => ({ ...e })));
  };

  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div className="bg-white rounded-lg shadow-lg w-full max-w-3xl flex flex-col" data-testid={testId} style={{ maxHeight: '85vh' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b">
        <div>
          <h2 className="text-base font-semibold">Emotion palette</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Defines the emotions characters can feel and how each one nudges mood when fired.
          </p>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-700" aria-label="Close" style={{ fontSize: 18, lineHeight: 1 }}>
            ×
          </button>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-5 py-2 border-b bg-gray-50">
        <button
          onClick={add}
          className="flex items-center gap-1 text-xs text-blue-600 hover:bg-blue-50 px-2 py-1 rounded"
        >
          <span aria-hidden>+</span>
          Add emotion
        </button>
        {!confirmReset ? (
          <button
            onClick={() => setConfirmReset(true)}
            className="flex items-center gap-1 text-xs text-gray-600 hover:bg-gray-100 px-2 py-1 rounded ml-auto"
            title="Replace all emotions with the default Ekman 6 + pride/shame/interest palette"
          >
            <span aria-hidden>↺</span>
            Reset to default
          </button>
        ) : (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-gray-600">Replace the whole palette?</span>
            <button
              onClick={() => { resetToDefault(); setConfirmReset(false); }}
              className="text-xs px-2 py-1 bg-red-50 text-red-700 hover:bg-red-100 rounded"
            >
              Yes, reset
            </button>
            <button
              onClick={() => setConfirmReset(false)}
              className="text-xs px-2 py-1 hover:bg-gray-100 rounded"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Body — column headers + rows */}
      <div className="overflow-y-auto px-5 py-3 flex-1">
        {palette.length === 0 ? (
          <div className="text-sm text-gray-400 italic py-6 text-center">
            No emotions defined. Add one or reset to the default palette.
          </div>
        ) : (
          <>
            <div className="grid items-center gap-2 text-[10px] uppercase tracking-wide text-gray-500 font-medium pb-1 border-b" style={headerGridStyle}>
              <div>Name</div>
              <div className="text-center">Valence weight</div>
              <div className="text-center">Arousal weight</div>
              <div className="text-center">Decay rate</div>
              <div></div>
            </div>
            {palette.map((emotion, i) => (
              <div key={i} className="grid items-center gap-2 py-2 border-b last:border-b-0" style={rowGridStyle}>
                {/* Name */}
                <div>
                  <input
                    type="text"
                    value={emotion.name}
                    onChange={(e) => update(i, { name: e.target.value })}
                    className="w-full px-2 py-1 text-sm border rounded"
                    placeholder="emotion name"
                  />
                  <input
                    type="text"
                    value={emotion.description || ''}
                    onChange={(e) => update(i, { description: e.target.value || undefined })}
                    className="w-full px-2 py-1 mt-1 text-xs border rounded text-gray-600"
                    placeholder="description (optional)"
                  />
                </div>

                {/* Valence weight */}
                <WeightSlider
                  value={emotion.weightToValence}
                  onChange={(v) => update(i, { weightToValence: v })}
                  positiveLabel="happy"
                  negativeLabel="sad"
                />

                {/* Arousal weight */}
                <WeightSlider
                  value={emotion.weightToArousal}
                  onChange={(v) => update(i, { weightToArousal: v })}
                  positiveLabel="excited"
                  negativeLabel="calm"
                />

                {/* Decay rate */}
                <div className="flex flex-col items-center gap-0.5">
                  <input
                    type="range"
                    min={0} max={1} step={0.05}
                    value={emotion.decayRate}
                    onChange={(e) => update(i, { decayRate: parseFloat(e.target.value) })}
                    className="w-full"
                  />
                  <span className="text-xs font-mono text-gray-700">{(emotion.decayRate * 100).toFixed(0)}%/tick</span>
                </div>

                {/* Remove */}
                <button
                  onClick={() => remove(i)}
                  className="p-1 text-gray-400 hover:text-red-600 rounded"
                  title="Remove this emotion"
                  aria-label="Remove this emotion"
                  style={{ fontSize: 14, lineHeight: 1 }}
                >
                  ✕
                </button>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="border-t px-5 py-2 bg-gray-50 text-xs text-gray-500">
        Weights ∈ [-1, 1] per axis: positive moves the mood pleasanter / more excited; negative moves it the other way. Decay reduces the emotion each beat-entry.
      </div>
    </div>
  );
};

// ============================================================================
// Internal: weight slider with end-cap labels and signed numeric readout
// ============================================================================

const WeightSlider: React.FC<{
  value: number;
  onChange: (v: number) => void;
  positiveLabel: string;
  negativeLabel: string;
}> = ({ value, onChange, positiveLabel, negativeLabel }) => (
  <div className="flex flex-col items-stretch gap-0.5">
    <div className="flex items-center justify-between text-[10px] text-gray-500">
      <span>← {negativeLabel}</span>
      <span>{positiveLabel} →</span>
    </div>
    <input
      type="range"
      min={-1} max={1} step={0.05}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full"
    />
    <span className="text-xs font-mono text-gray-700 text-center">
      {value >= 0 ? '+' : ''}{value.toFixed(2)}
    </span>
  </div>
);

const headerGridStyle: React.CSSProperties = { gridTemplateColumns: '2fr 1.5fr 1.5fr 1fr 32px' };
const rowGridStyle: React.CSSProperties = { gridTemplateColumns: '2fr 1.5fr 1.5fr 1fr 32px' };
