/**
 * PanoramaCameraPanel Component
 * Compact collapsible panel for panorama camera settings + prompt.
 * Renders above the Elements/Animations tabs for panorama beats only.
 */

import React, { useState } from 'react';
import { Eye, Type, ChevronDown, ChevronRight, LayoutGrid, Play } from 'lucide-react';

export type PanoramaViewMode = 'layout' | 'preview';

interface PanoramaCameraPanelProps {
  initialPitch: number;
  initialYaw: number;
  hfov: number;
  prompt: string;
  projectionType?: 'equirectangular' | 'cylindrical';
  onCameraChange: (settings: { initialPitch?: number; initialYaw?: number; hfov?: number }) => void;
  onPromptChange: (prompt: string) => void;
  onProjectionTypeChange?: (type: 'equirectangular' | 'cylindrical') => void;
  viewMode?: PanoramaViewMode;
  onViewModeChange?: (mode: PanoramaViewMode) => void;
}

export const PanoramaCameraPanel: React.FC<PanoramaCameraPanelProps> = ({
  initialPitch,
  initialYaw,
  hfov,
  prompt,
  projectionType = 'equirectangular',
  onCameraChange,
  onPromptChange,
  onProjectionTypeChange,
  viewMode = 'layout',
  onViewModeChange,
}) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-gray-200">
      {/* View Mode Toggle */}
      {onViewModeChange && (
        <div className="px-3 py-2 flex items-center gap-2 border-b border-gray-100">
          <span className="text-xs text-gray-500 font-medium mr-1">View:</span>
          <div className="flex rounded-md overflow-hidden border border-gray-300 text-xs">
            <button
              onClick={() => onViewModeChange('layout')}
              className={`flex items-center gap-1 px-2.5 py-1 transition-colors ${
                viewMode === 'layout'
                  ? 'bg-blue-500 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              <LayoutGrid className="w-3 h-3" />
              Layout
            </button>
            <button
              onClick={() => onViewModeChange('preview')}
              className={`flex items-center gap-1 px-2.5 py-1 transition-colors border-l border-gray-300 ${
                viewMode === 'preview'
                  ? 'bg-blue-500 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Play className="w-3 h-3" />
              Preview
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setExpanded(prev => !prev)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wider hover:bg-gray-50 transition-colors"
      >
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <Eye className="w-3.5 h-3.5" />
        Panorama Settings
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          {/* Projection Type */}
          {onProjectionTypeChange && (
            <label className="block">
              <span className="text-xs text-gray-500">Projection</span>
              <select
                value={projectionType}
                onChange={(e) => onProjectionTypeChange(e.target.value as 'equirectangular' | 'cylindrical')}
                className="mt-0.5 w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="equirectangular">Equirectangular (2:1, e.g. 4096x2048)</option>
                <option value="cylindrical">Cylindrical (4:1–8:1, e.g. 8000x2000)</option>
              </select>
              <p className="text-xs text-blue-600 mt-1">
                {projectionType === 'equirectangular'
                  ? 'Use 2:1 images from 360° cameras.'
                  : 'Use wide panoramas from phone cameras (4:1 to 8:1 ratio).'}
              </p>
            </label>
          )}
          {/* Initial Pitch */}
          <label className="block">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Initial Pitch</span>
              <span className="text-xs text-gray-400">{initialPitch}°</span>
            </div>
            <input
              type="range"
              value={initialPitch}
              onChange={(e) => onCameraChange({ initialPitch: parseFloat(e.target.value) })}
              min={-90}
              max={90}
              step={1}
              className="mt-0.5 w-full h-1.5 accent-blue-500"
            />
          </label>

          {/* Initial Yaw */}
          <label className="block">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Initial Yaw</span>
              <span className="text-xs text-gray-400">{initialYaw}°</span>
            </div>
            <input
              type="range"
              value={initialYaw}
              onChange={(e) => onCameraChange({ initialYaw: parseFloat(e.target.value) })}
              min={-180}
              max={180}
              step={1}
              className="mt-0.5 w-full h-1.5 accent-blue-500"
            />
          </label>

          {/* HFOV */}
          <label className="block">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Field of View</span>
              <span className="text-xs text-gray-400">{hfov}°</span>
            </div>
            <input
              type="range"
              value={hfov}
              onChange={(e) => onCameraChange({ hfov: parseFloat(e.target.value) })}
              min={50}
              max={120}
              step={1}
              className="mt-0.5 w-full h-1.5 accent-blue-500"
            />
          </label>

          {/* Prompt */}
          <label className="block">
            <div className="flex items-center gap-1 mb-0.5">
              <Type className="w-3 h-3 text-gray-400" />
              <span className="text-xs text-gray-500">Prompt</span>
            </div>
            <input
              type="text"
              value={prompt}
              onChange={(e) => onPromptChange(e.target.value)}
              placeholder="Prompt overlay text..."
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </label>
        </div>
      )}
    </div>
  );
};
