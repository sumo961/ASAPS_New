/**
 * PanoramaPropertiesPanel Component
 * Left-side panel for the 360° Panorama visual editor.
 * Provides hotspot management, camera settings, and prompt editing.
 */

import React, { useState } from 'react';
import {
  Image as ImageIcon,
  MapPin,
  Trash2,
  Eye,
  Crosshair,
  Settings,
  Type,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import type { PanoramaHotspotData } from './PanoramaEditor';
import type { Beat } from '@asaps/core';
import type { Asset } from '../assets/AssetManager';

interface PanoramaPropertiesPanelProps {
  panoramaAssetId?: string;
  hotspots: PanoramaHotspotData[];
  selectedHotspotId: string | null;
  initialPitch: number;
  initialYaw: number;
  hfov: number;
  minHfov: number;
  maxHfov: number;
  zoomSpeed: number;
  prompt: string;
  beats: Beat[];
  assets: Asset[];
  placementMode: boolean;
  onSelectPanoramaImage: () => void;
  onHotspotsChange: (hotspots: PanoramaHotspotData[]) => void;
  onSelectHotspot: (id: string | null) => void;
  onTogglePlacementMode: () => void;
  onCameraChange: (settings: { initialPitch?: number; initialYaw?: number; hfov?: number; minHfov?: number; maxHfov?: number; zoomSpeed?: number }) => void;
  onPromptChange: (prompt: string) => void;
  onLookAtHotspot?: (pitch: number, yaw: number) => void;
  onSetFromCurrentView?: () => void;
}

export const PanoramaPropertiesPanel: React.FC<PanoramaPropertiesPanelProps> = ({
  panoramaAssetId,
  hotspots,
  selectedHotspotId,
  initialPitch,
  initialYaw,
  hfov,
  minHfov,
  maxHfov,
  zoomSpeed,
  prompt,
  beats,
  assets,
  placementMode,
  onSelectPanoramaImage,
  onHotspotsChange,
  onSelectHotspot,
  onTogglePlacementMode,
  onCameraChange,
  onPromptChange,
  onLookAtHotspot,
  onSetFromCurrentView,
}) => {
  const [expandedSections, setExpandedSections] = useState({
    image: true,
    hotspots: true,
    properties: true,
    camera: true,
    prompt: true,
  });

  const selectedHotspot = hotspots.find(h => h.id === selectedHotspotId);

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const updateHotspot = (id: string, updates: Partial<PanoramaHotspotData>) => {
    onHotspotsChange(hotspots.map(h => h.id === id ? { ...h, ...updates } : h));
  };

  const deleteHotspot = (id: string) => {
    onHotspotsChange(hotspots.filter(h => h.id !== id));
    if (selectedHotspotId === id) {
      onSelectHotspot(null);
    }
  };

  // Get panorama image thumbnail
  const panoramaAsset = panoramaAssetId ? assets.find(a => a.id === panoramaAssetId) : null;

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Section: Panorama Image */}
      <SectionHeader
        title="Panorama Image"
        expanded={expandedSections.image}
        onToggle={() => toggleSection('image')}
        icon={<ImageIcon className="w-3.5 h-3.5" />}
      />
      {expandedSections.image && (
        <div className="px-3 pb-3">
          {panoramaAsset ? (
            <div className="space-y-2">
              <div
                className="w-full h-20 rounded border border-gray-200 overflow-hidden cursor-pointer hover:border-blue-400 transition-colors"
                onClick={onSelectPanoramaImage}
              >
                <img
                  src={panoramaAsset.url}
                  alt="Panorama"
                  className="w-full h-full object-cover"
                />
              </div>
              <p className="text-xs text-gray-500 truncate">{panoramaAsset.name}</p>
            </div>
          ) : (
            <button
              onClick={onSelectPanoramaImage}
              className="w-full py-6 border-2 border-dashed border-gray-300 rounded-lg text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors text-sm"
            >
              Select Panorama Image
            </button>
          )}
        </div>
      )}

      {/* Section: Hotspots */}
      <SectionHeader
        title={`Hotspots (${hotspots.length})`}
        expanded={expandedSections.hotspots}
        onToggle={() => toggleSection('hotspots')}
        icon={<MapPin className="w-3.5 h-3.5" />}
      />
      {expandedSections.hotspots && (
        <div className="px-3 pb-3 space-y-1">
          <button
            onClick={onTogglePlacementMode}
            className={`w-full flex items-center justify-center gap-1 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              placementMode
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <MapPin className="w-3 h-3" />
            {placementMode ? 'Click on Panorama...' : 'Add Hotspot'}
          </button>

          {hotspots.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-2">No hotspots yet</p>
          ) : (
            <div className="space-y-0.5 mt-2">
              {hotspots.map((hs) => (
                <div
                  key={hs.id}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs cursor-pointer transition-colors group ${
                    selectedHotspotId === hs.id
                      ? 'bg-blue-50 ring-1 ring-blue-300 text-blue-900'
                      : 'hover:bg-gray-50 text-gray-700'
                  }`}
                  onClick={() => onSelectHotspot(hs.id)}
                >
                  <span className="text-sm shrink-0 w-5 text-center text-blue-500">→</span>
                  <span className="flex-1 truncate">{hs.text || 'Untitled'}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteHotspot(hs.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-500 transition-all"
                    title="Delete hotspot"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Section: Selected Hotspot Properties */}
      {selectedHotspot && (
        <>
          <SectionHeader
            title="Hotspot Properties"
            expanded={expandedSections.properties}
            onToggle={() => toggleSection('properties')}
            icon={<Settings className="w-3.5 h-3.5" />}
          />
          {expandedSections.properties && (
            <div className="px-3 pb-3 space-y-2">
              {/* Text */}
              <label className="block">
                <span className="text-xs text-gray-500">Label</span>
                <input
                  type="text"
                  value={selectedHotspot.text}
                  onChange={(e) => updateHotspot(selectedHotspot.id, { text: e.target.value })}
                  className="mt-0.5 w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </label>

              {/* Display Text */}
              <label className="block">
                <span className="text-xs text-gray-500">Display Text</span>
                <input
                  type="text"
                  value={selectedHotspot.displayText || ''}
                  onChange={(e) => updateHotspot(selectedHotspot.id, { displayText: e.target.value })}
                  placeholder="Text shown to player"
                  className="mt-0.5 w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </label>

              {/* Pitch / Yaw */}
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-xs text-gray-500">Pitch</span>
                  <input
                    type="number"
                    value={selectedHotspot.pitch}
                    onChange={(e) => updateHotspot(selectedHotspot.id, { pitch: parseFloat(e.target.value) || 0 })}
                    min={-90}
                    max={90}
                    step={0.1}
                    className="mt-0.5 w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-gray-500">Yaw</span>
                  <input
                    type="number"
                    value={selectedHotspot.yaw}
                    onChange={(e) => updateHotspot(selectedHotspot.id, { yaw: parseFloat(e.target.value) || 0 })}
                    min={-180}
                    max={180}
                    step={0.1}
                    className="mt-0.5 w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </label>
              </div>

              {/* Target Beat */}
              <label className="block">
                <span className="text-xs text-gray-500">Target Beat</span>
                <select
                  value={selectedHotspot.target || ''}
                  onChange={(e) => updateHotspot(selectedHotspot.id, { target: e.target.value })}
                  className="mt-0.5 w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">— None —</option>
                  {beats.map(b => (
                    <option key={b.id} value={b.id}>{b.name || b.id}</option>
                  ))}
                </select>
              </label>

              {/* Look At button */}
              {onLookAtHotspot && (
                <button
                  onClick={() => onLookAtHotspot(selectedHotspot.pitch, selectedHotspot.yaw)}
                  className="w-full flex items-center justify-center gap-1 px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                >
                  <Crosshair className="w-3 h-3" />
                  Look at Hotspot
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* Section: Camera Settings */}
      <SectionHeader
        title="Camera Settings"
        expanded={expandedSections.camera}
        onToggle={() => toggleSection('camera')}
        icon={<Eye className="w-3.5 h-3.5" />}
      />
      {expandedSections.camera && (
        <div className="px-3 pb-3 space-y-2">
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
              min={30}
              max={120}
              step={1}
              className="mt-0.5 w-full h-1.5 accent-blue-500"
            />
          </label>

          {/* Min HFOV (Max Zoom In) */}
          <label className="block">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Min FOV (Max Zoom In)</span>
              <span className="text-xs text-gray-400">{minHfov}°</span>
            </div>
            <input
              type="range"
              value={minHfov}
              onChange={(e) => onCameraChange({ minHfov: parseFloat(e.target.value) })}
              min={10}
              max={120}
              step={5}
              className="mt-0.5 w-full h-1.5 accent-blue-500"
            />
          </label>

          {/* Max HFOV (Max Zoom Out) */}
          <label className="block">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Max FOV (Max Zoom Out)</span>
              <span className="text-xs text-gray-400">{maxHfov}°</span>
            </div>
            <input
              type="range"
              value={maxHfov}
              onChange={(e) => onCameraChange({ maxHfov: parseFloat(e.target.value) })}
              min={30}
              max={180}
              step={5}
              className="mt-0.5 w-full h-1.5 accent-blue-500"
            />
          </label>

          {/* Zoom Speed */}
          <label className="block">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Zoom Speed</span>
              <span className="text-xs text-gray-400">{zoomSpeed.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              value={zoomSpeed}
              onChange={(e) => onCameraChange({ zoomSpeed: parseFloat(e.target.value) })}
              min={0.1}
              max={3.0}
              step={0.1}
              className="mt-0.5 w-full h-1.5 accent-blue-500"
            />
          </label>

          {/* Set from current view */}
          {onSetFromCurrentView && (
            <button
              onClick={onSetFromCurrentView}
              className="w-full flex items-center justify-center gap-1 px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-colors"
            >
              <Crosshair className="w-3 h-3" />
              Set from Current View
            </button>
          )}
        </div>
      )}

      {/* Section: Prompt */}
      <SectionHeader
        title="Prompt"
        expanded={expandedSections.prompt}
        onToggle={() => toggleSection('prompt')}
        icon={<Type className="w-3.5 h-3.5" />}
      />
      {expandedSections.prompt && (
        <div className="px-3 pb-3">
          <input
            type="text"
            value={prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            placeholder="Prompt overlay text..."
            className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      )}
    </div>
  );
};

/** Collapsible section header */
const SectionHeader: React.FC<{
  title: string;
  expanded: boolean;
  onToggle: () => void;
  icon: React.ReactNode;
}> = ({ title, expanded, onToggle, icon }) => (
  <button
    onClick={onToggle}
    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wider border-b border-gray-100 hover:bg-gray-50 transition-colors"
  >
    {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
    {icon}
    {title}
  </button>
);
