import React from 'react';
import { Beat, Cluster } from '@asaps/core';
import { GraphEditor } from './graph/GraphEditor';
import { BeatPalette } from './graph/BeatPalette';

interface CanvasProps {
  beats: Beat[];
  connections: any[];
  clusters: Cluster[];
  selectedBeat: Beat | null;
  selectedCluster: Cluster | null;
  onBeatSelect: (beat: Beat) => void;
  onBeatMove: (beatId: string, position: { x: number; y: number }) => void;
  onClusterSelect: (cluster: Cluster | null) => void;
  onConnect: (sourceBeatId: string, targetBeatId: string) => void;
  onBeatAdd?: (type: string, position: { x: number; y: number }) => void;
  onClusterExpandCollapse?: (clusterId: string) => void;
  onClusterMove?: (clusterId: string, x: number, y: number) => void;
  paletteCollapsed?: boolean;
  onTogglePalette?: () => void;
  onBeatInContainerMove?: (beatId: string, clusterId: string, x: number, y: number) => void;
}

export const Canvas: React.FC<CanvasProps> = ({
  beats,
  connections,
  clusters,
  selectedBeat,
  selectedCluster,
  onBeatSelect,
  onBeatMove,
  onClusterSelect,
  onConnect,
  onBeatAdd,
  onClusterExpandCollapse,
  onClusterMove,
  paletteCollapsed = false,
  onTogglePalette,
  onBeatInContainerMove,
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
          selectedBeat={selectedBeat}
          selectedCluster={selectedCluster}
          onBeatSelect={onBeatSelect}
          onClusterSelect={handleClusterSelect}
          onBeatMove={handleBeatMove}
          onClusterMove={handleClusterMove}
          onConnect={onConnect}
          onBeatAdd={handleBeatAdd}
          onClusterExpandCollapse={handleClusterExpandCollapse}
          onBeatInContainerMove={handleBeatInContainerMove}
        />
      </div>
      
      {/* Beat Palette */}
      <div className={`${paletteCollapsed ? 'w-12' : 'w-80'} flex-shrink-0 bg-gray-100 border-l border-gray-300 overflow-y-auto transition-all duration-300`}>
        <BeatPalette 
          collapsed={paletteCollapsed}
          onToggleCollapse={onTogglePalette}
        />
      </div>
    </div>
  );
};
