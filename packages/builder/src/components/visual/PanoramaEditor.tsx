/**
 * PanoramaEditor Component
 * Specialized visual editor for 360° Panorama beats.
 * Renders the panorama image using Pannellum and allows hotspot placement.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { PanoramaView } from '@asaps/renderer';
import { MapPin, Plus, Trash2, Move, Eye } from 'lucide-react';

export interface PanoramaHotspotData {
  id: string;
  pitch: number;
  yaw: number;
  text: string;
  displayText?: string;
  target: string;
  icon?: string;
}

interface PanoramaEditorProps {
  panoramaUrl: string;
  hotspots: PanoramaHotspotData[];
  initialPitch?: number;
  initialYaw?: number;
  hfov?: number;
  autoRotate?: number;
  prompt?: string;
  selectedHotspotId?: string;
  onHotspotsChange: (hotspots: PanoramaHotspotData[]) => void;
  onSelectHotspot: (hotspotId: string | null) => void;
}

export const PanoramaEditor: React.FC<PanoramaEditorProps> = ({
  panoramaUrl,
  hotspots,
  initialPitch = 0,
  initialYaw = 0,
  hfov = 100,
  prompt,
  selectedHotspotId,
  onHotspotsChange,
  onSelectHotspot,
}) => {
  const [placementMode, setPlacementMode] = useState(false);

  const handleEditorClick = useCallback((pitch: number, yaw: number) => {
    if (!placementMode) return;

    const newHotspot: PanoramaHotspotData = {
      id: `hotspot_${Date.now()}`,
      pitch: Math.round(pitch * 10) / 10,
      yaw: Math.round(yaw * 10) / 10,
      text: `Hotspot ${hotspots.length + 1}`,
      target: '',
    };
    onHotspotsChange([...hotspots, newHotspot]);
    onSelectHotspot(newHotspot.id);
    setPlacementMode(false);
  }, [placementMode, hotspots, onHotspotsChange, onSelectHotspot]);

  const handleHotspotClick = useCallback((hotspotId: string) => {
    onSelectHotspot(hotspotId);
  }, [onSelectHotspot]);

  // Convert hotspots to the format PanoramaView expects
  const viewHotspots = useMemo(() =>
    hotspots.map(hs => ({
      id: hs.id,
      pitch: hs.pitch,
      yaw: hs.yaw,
      text: hs.text,
      icon: hs.icon,
    })),
    [hotspots]
  );

  if (!panoramaUrl) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-100 text-gray-500">
        <div className="text-center">
          <Eye className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-sm">No panorama image selected</p>
          <p className="text-xs text-gray-400 mt-1">Select a panorama image in the inspector panel</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-800 border-b border-gray-700">
        <button
          onClick={() => setPlacementMode(!placementMode)}
          className={`flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
            placementMode
              ? 'bg-blue-500 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
          title="Click on the panorama to place a new hotspot"
        >
          <MapPin className="w-3.5 h-3.5" />
          {placementMode ? 'Click to Place...' : 'Place Hotspot'}
        </button>

        <div className="flex-1" />

        <span className="text-xs text-gray-400">
          {hotspots.length} hotspot{hotspots.length !== 1 ? 's' : ''}
        </span>
        {placementMode && (
          <span className="text-xs text-blue-400 animate-pulse">
            Click on the panorama to place a hotspot
          </span>
        )}
      </div>

      {/* Panorama Viewer */}
      <div className="flex-1 relative" style={{ cursor: placementMode ? 'crosshair' : 'grab' }}>
        <PanoramaView
          panoramaUrl={panoramaUrl}
          hotspots={placementMode ? [] : viewHotspots}
          initialPitch={initialPitch}
          initialYaw={initialYaw}
          hfov={hfov}
          prompt={prompt}
          onHotspotClick={handleHotspotClick}
          editorMode={placementMode}
          onEditorClick={handleEditorClick}
        />

        {/* Selected hotspot indicator */}
        {selectedHotspotId && (
          <div className="absolute top-2 left-2 bg-blue-500 text-white px-2 py-1 rounded text-xs">
            Selected: {hotspots.find(h => h.id === selectedHotspotId)?.text || selectedHotspotId}
          </div>
        )}
      </div>
    </div>
  );
};
