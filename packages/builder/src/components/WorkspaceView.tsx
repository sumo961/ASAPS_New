import React from 'react';
import { Beat, Cluster } from '@asaps/core';
import { Canvas } from './Canvas';
import { VisualWorkspace } from './visual/VisualWorkspace';
import { Map, Palette } from 'lucide-react';
import type { Character } from '../types/character';
import type { GlobalSettings } from './settings/GlobalSettingsInspector';

interface WorkspaceViewProps {
  beats: Beat[];
  connections: any[];
  clusters: Cluster[];
  selectedBeat: Beat | null;
  selectedCluster: Cluster | null;
  onBeatSelect: (beat: Beat) => void;
  onBeatMove: (beatId: string, position: { x: number; y: number }) => void;
  onBeatUpdate?: (beatId: string, updates: Partial<Beat>) => void;
  onClusterSelect: (cluster: Cluster | null) => void;
  onConnect: (sourceBeatId: string, targetBeatId: string) => void;
  onBeatAdd: (type: string, position: { x: number; y: number }) => void;
  onClusterExpandCollapse: (clusterId: string) => void;
  onClusterMove: (clusterId: string, x: number, y: number) => void;
  onBeatInContainerMove?: (beatId: string, clusterId: string, x: number, y: number) => void;
  paletteCollapsed: boolean;
  onTogglePalette: () => void;
  assets?: any[];
  onAssetSelect?: (type: 'background' | 'character' | 'prop' | 'sound', callback: (asset: any) => void) => void;
  onAssetAdd?: (asset: any) => Promise<boolean>;
  onAssetRemove?: (assetId: string) => void;
  onAssetUpdate?: (assetId: string, updates: Partial<any>) => void;
  onOpenCharacterManager?: (callback?: (character: Character) => void) => void;
  projectSettings?: {
    width: number;
    height: number;
    aspectRatio: string;
    scalingMode: string;
    boxVisibility: 'all' | 'hideText' | 'hideAll';
  };
  globalSettings?: GlobalSettings;
}

export const WorkspaceView: React.FC<WorkspaceViewProps> = ({
  beats,
  connections,
  clusters,
  selectedBeat,
  selectedCluster,
  onBeatSelect,
  onBeatMove,
  onBeatUpdate,
  onClusterSelect,
  onConnect,
  onBeatAdd,
  onClusterExpandCollapse,
  onClusterMove,
  onBeatInContainerMove,
  paletteCollapsed,
  onTogglePalette,
  assets = [],
  onAssetSelect,
  onAssetAdd,
  onAssetRemove,
  onAssetUpdate,
  onOpenCharacterManager,
  projectSettings,
  globalSettings,
}) => {
  const [activeView, setActiveView] = React.useState<'flowchart' | 'visual'>('flowchart');

  // Check if selected beat supports visual editing
  const supportsVisualEditor = (beat: Beat | null) => {
    if (!beat) return false;
    const visualBeatTypes = [
      'titleScreen',
      'introText',
      'durScreen',
      'pickProp',
      'movementChoice',
      'dialogTree',
      'endScreen',
      'videoBeat',
      'inputText',
      'hyperText'
    ];
    return visualBeatTypes.includes(beat.type);
  };

  const showVisualTab = supportsVisualEditor(selectedBeat);

  return (
    <div className="flex-1 flex flex-col bg-gray-50 overflow-hidden" style={{ minHeight: 0 }}>
      {/* Tab Navigation */}
      <div className="flex-shrink-0 flex border-b border-gray-300 bg-white shadow-sm">
        <button
          onClick={() => setActiveView('flowchart')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-all ${
            activeView === 'flowchart'
              ? 'border-blue-500 text-blue-600 bg-blue-50'
              : 'border-transparent text-gray-600 hover:text-gray-800 hover:bg-gray-50'
          }`}
        >
          <Map className="w-4 h-4 inline mr-2" />
          Flowchart
        </button>
        
        {showVisualTab && (
          <button
            onClick={() => setActiveView('visual')}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-all ${
              activeView === 'visual'
                ? 'border-blue-500 text-blue-600 bg-blue-50'
                : 'border-transparent text-gray-600 hover:text-gray-800 hover:bg-gray-50'
            }`}
          >
            <Palette className="w-4 h-4 inline mr-2" />
            Visual Editor
          </button>
        )}
        
        {!showVisualTab && activeView === 'visual' && (
          <div className="px-6 py-3 text-sm text-gray-400 italic">
            Select a visual beat to enable the Visual Editor
          </div>
        )}

        {/* View-specific controls can go here */}
        <div className="flex-1" />

        {activeView === 'flowchart' && (
          <div className="flex items-center px-4 text-xs text-gray-500">
            <span>Beats: {beats.length}</span>
            <span className="mx-2">•</span>
            <span>Clusters: {clusters.length}</span>
            <span className="mx-2">•</span>
            <span>Connections: {connections.length}</span>
          </div>
        )}
      </div>

      {/* Content Area - Fixed to use full available height */}
      <div className="flex-1 overflow-hidden relative" style={{ minHeight: 0 }}>
        {activeView === 'flowchart' ? (
          <div className="h-full w-full">
            <Canvas
              beats={beats}
              connections={connections}
              clusters={clusters}
              selectedBeat={selectedBeat}
              selectedCluster={selectedCluster}
              onBeatSelect={onBeatSelect}
              onBeatMove={onBeatMove}
              onClusterSelect={onClusterSelect}
              onConnect={onConnect}
              onBeatAdd={onBeatAdd}
              onClusterExpandCollapse={onClusterExpandCollapse}
              onClusterMove={onClusterMove}
              onBeatInContainerMove={onBeatInContainerMove}
              paletteCollapsed={paletteCollapsed}
              onTogglePalette={onTogglePalette}
            />
          </div>
        ) : (
          <div className="h-full w-full">
            <VisualWorkspace
              beat={selectedBeat}
              beats={beats}
              assets={assets}
              onAssetSelect={onAssetSelect}
              onAssetAdd={onAssetAdd}
              onAssetRemove={onAssetRemove}
              onAssetUpdate={onAssetUpdate}
              onOpenCharacterManager={onOpenCharacterManager}
              onBeatUpdate={onBeatUpdate}
              projectSettings={projectSettings}
              globalSettings={globalSettings}
            />
          </div>
        )}
      </div>
    </div>
  );
};
