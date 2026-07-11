import React from 'react';
import { Beat, Cluster, ContainerBeatPosition } from '@asaps/core';
import { GraphEditor } from './graph/GraphEditor';
import { BeatPalette } from './graph/BeatPalette';

// Asset type for cluster backgrounds
interface Asset {
  id: string;
  url: string;
  type: string;
}

interface CanvasProps {
  beats: Beat[];
  connections: any[];
  clusters: Cluster[];
  containerBeatPositions?: ContainerBeatPosition[];
  selectedBeat: Beat | null;
  selectedCluster: Cluster | null;
  onBeatSelect: (beat: Beat) => void;
  onBeatMove: (beatId: string, position: { x: number; y: number }) => void;
  onClusterSelect: (cluster: Cluster | null) => void;
  onBeatAdd?: (type: string, position: { x: number; y: number }) => void;
  onClusterExpandCollapse?: (clusterId: string) => void;
  onClusterMove?: (clusterId: string, x: number, y: number) => void;
  paletteCollapsed?: boolean;
  onTogglePalette?: () => void;
  onBeatInContainerMove?: (beatId: string, clusterId: string, x: number, y: number) => void;
  onDropBeatToCluster?: (beatId: string, clusterId: string) => void;
  onRemoveBeatFromCluster?: (beatId: string) => void;
  onClusterResize?: (clusterId: string, width: number, height: number) => void;
  onAutoLayoutCluster?: (clusterId: string) => void;
  highlightedBeatIds?: string[];
  pwVisitedBeatIds?: string[];
  pwCurrentBeatId?: string | null;
  onAutoLayout?: () => void;
  onAddToContainer?: (clusterId: string) => void;
  onRemoveCluster?: (clusterId: string) => void;
  // Cluster background images
  assets?: Asset[];
  onSetClusterMap?: (clusterId: string, assetId: string | null, scale?: number, opacity?: number) => void;
  onSetClusterSound?: (clusterId: string, soundAssetId: string | null, volume?: number) => void;
  onSetClusterSharedVisuals?: (clusterId: string, sharedVisuals: any) => void;
  // Beat actions for context menu
  onBeatDuplicate?: (beatId: string) => void;
  onBeatsDuplicate?: (beatIds: string[]) => void;
  onBeatDelete?: (beatId: string) => void;
  onBeatsDelete?: (beatIds: string[]) => void;
  onBeatCopy?: (beatId: string) => void;
  onBeatPaste?: (position: { x: number; y: number }) => void;
  hasBeatClipboard?: boolean;
  // VCS context menu actions
  onViewBeatDiff?: (beatId: string) => void;
  onViewBeatHistory?: (beatId: string) => void;
  onRevertBeat?: (beatId: string) => void;
}

export const Canvas: React.FC<CanvasProps> = ({
  beats,
  connections,
  clusters,
  containerBeatPositions = [],
  selectedBeat,
  selectedCluster,
  onBeatSelect,
  onBeatMove,
  onClusterSelect,
  onBeatAdd,
  onClusterExpandCollapse,
  onClusterMove,
  paletteCollapsed = false,
  onTogglePalette,
  onBeatInContainerMove,
  onDropBeatToCluster,
  onRemoveBeatFromCluster,
  onClusterResize,
  onAutoLayoutCluster,
  highlightedBeatIds = [],
  pwVisitedBeatIds = [],
  pwCurrentBeatId,
  onAutoLayout,
  onAddToContainer,
  onRemoveCluster,
  assets = [],
  onSetClusterMap,
  onSetClusterSound,
  onSetClusterSharedVisuals,
  onBeatDuplicate,
  onBeatsDuplicate,
  onBeatDelete,
  onBeatsDelete,
  onBeatCopy,
  onBeatPaste,
  hasBeatClipboard = false,
  onViewBeatDiff,
  onViewBeatHistory,
  onRevertBeat,
}) => {
  const handleBeatMove = (beatId: string, x: number, y: number) => {
    onBeatMove(beatId, { x, y });
  };

  const handleBeatAdd = (type: string, position: { x: number; y: number }) => {
    if (onBeatAdd) {
      onBeatAdd(type, position);
    }
  };

  const handleClusterSelect = (cluster: Cluster | null) => {
    onClusterSelect(cluster);
  };

  const handleClusterExpandCollapse = (clusterId: string) => {
    if (onClusterExpandCollapse) {
      onClusterExpandCollapse(clusterId);
    }
  };

  const handleClusterMove = (clusterId: string, x: number, y: number) => {
    if (onClusterMove) {
      onClusterMove(clusterId, x, y);
    }
  };

  const handleBeatInContainerMove = (beatId: string, clusterId: string, x: number, y: number) => {
    if (onBeatInContainerMove) {
      onBeatInContainerMove(beatId, clusterId, x, y);
    }
  };

  return (
    <div className="flex flex-1 h-full">
      {/* Main Canvas - Fixed height issue */}
      <div className="flex-1 h-full bg-gray-50">
        <GraphEditor
          beats={beats}
          clusters={clusters}
          containerBeatPositions={containerBeatPositions}
          selectedBeat={selectedBeat}
          selectedCluster={selectedCluster}
          onBeatSelect={onBeatSelect}
          onClusterSelect={handleClusterSelect}
          onBeatMove={handleBeatMove}
          onClusterMove={handleClusterMove}
          onBeatAdd={handleBeatAdd}
          onClusterExpandCollapse={handleClusterExpandCollapse}
          onBeatInContainerMove={handleBeatInContainerMove}
          onDropBeatToCluster={onDropBeatToCluster}
          onRemoveBeatFromCluster={onRemoveBeatFromCluster}
          onClusterResize={onClusterResize}
          onAutoLayoutCluster={onAutoLayoutCluster}
          highlightedBeatIds={highlightedBeatIds}
          pwVisitedBeatIds={pwVisitedBeatIds}
          pwCurrentBeatId={pwCurrentBeatId}
          onAutoLayout={onAutoLayout}
          onAddToContainer={onAddToContainer}
          onRemoveCluster={onRemoveCluster}
          assets={assets}
          onSetClusterMap={onSetClusterMap}
          onSetClusterSound={onSetClusterSound}
          onSetClusterSharedVisuals={onSetClusterSharedVisuals}
          onBeatDuplicate={onBeatDuplicate}
          onBeatsDuplicate={onBeatsDuplicate}
          onBeatDelete={onBeatDelete}
          onBeatsDelete={onBeatsDelete}
          onBeatCopy={onBeatCopy}
          onBeatPaste={onBeatPaste}
          hasBeatClipboard={hasBeatClipboard}
          onViewBeatDiff={onViewBeatDiff}
          onViewBeatHistory={onViewBeatHistory}
          onRevertBeat={onRevertBeat}
        />
      </div>
      
      {/* Beat Palette */}
      <div className={`${paletteCollapsed ? 'w-12' : 'w-56'} flex-shrink-0 bg-gray-100 border-l border-gray-300 overflow-y-auto transition-all duration-300`}>
        <BeatPalette 
          collapsed={paletteCollapsed}
          onToggleCollapse={onTogglePalette}
        />
      </div>
    </div>
  );
};
