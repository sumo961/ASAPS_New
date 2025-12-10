import React, { memo, useState, useCallback } from 'react';
import { NodeProps, Handle, Position, NodeToolbar } from 'reactflow';
import { Cluster, ContainerBeatStyle, DEFAULT_CONTAINER_DIMENSIONS, ContainerBeatPosition } from '@asaps/core';

interface ClusterContainerNodeData {
  cluster: Cluster;
  containedBeatCount: number;
  selected: boolean;
  color: string;
  onAddToContainer: (clusterId: string) => void;
  onRemoveContainer: (clusterId: string) => void;
  onExpandCollapse: (clusterId: string) => void;
  onBeatInContainerMove?: (beatId: string, clusterId: string, x: number, y: number) => void;
  containedBeats?: ContainerBeatPosition[]; // Beats positioned within this cluster
}

// Alignment utilities for beat positioning within container
const alignToGrid = (position: { x: number; y: number }, gridSize = 20): { x: number; y: number } => ({
  x: Math.round(position.x / gridSize) * gridSize,
  y: Math.round(position.y / gridSize) * gridSize
});

export const ClusterContainerNode = memo<NodeProps<ClusterContainerNodeData>>(({
  data,
  selected,
  id,
  xPos,
  yPos
}) => {
  const { cluster, containedBeatCount, onAddToContainer, onRemoveContainer, onExpandCollapse, onBeatInContainerMove, containedBeats } = data;
  const [isHovered, setIsHovered] = useState(false);
  const [draggingBeat, setDraggingBeat] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
  }, []);

  const handleExpandCollapse = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    console.log('[ClusterContainerNode] Expand/collapse requested for cluster:', cluster.id);
    onExpandCollapse(cluster.id);
  }, [cluster.id, onExpandCollapse]);

  // Handle beat drag start within container
  const handleBeatDragStart = useCallback((e: React.MouseEvent, beatId: string, currentX: number, currentY: number) => {
    e.stopPropagation();
    setDraggingBeat(beatId);
    setDragStart({ x: e.clientX - currentX, y: e.clientY - currentY });
  }, []);

  // Handle beat drag move
  const handleBeatDragMove = useCallback((e: React.MouseEvent) => {
    if (!draggingBeat || !onBeatInContainerMove) return;
    e.stopPropagation();

    const newX = e.clientX - dragStart.x;
    const newY = e.clientY - dragStart.y;

    // Snap to grid
    const snapped = alignToGrid({ x: newX, y: newY });
    onBeatInContainerMove(draggingBeat, cluster.id, snapped.x, snapped.y);
  }, [draggingBeat, dragStart, cluster.id, onBeatInContainerMove]);

  // Handle beat drag end
  const handleBeatDragEnd = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setDraggingBeat(null);
  }, []);

  // Calculate container dimensions based on content
  const containerStyle = {
    width: Math.max(cluster.containerBounds.width, DEFAULT_CONTAINER_DIMENSIONS.beatViewport.width),
    height: Math.max(cluster.containerBounds.height, DEFAULT_CONTAINER_DIMENSIONS.beatViewport.height),
    borderColor: selected ? '#3b82f6' : data.color,
    backgroundColor: cluster.isExpanded ? 'rgba(255, 255, 255, 0.95)' : 'rgba(255, 255, 255, 0.9)',
    backdropFilter: 'blur(10px)',
  } as React.CSSProperties;

  const typeIcon = cluster.type === 'spatial' ? '🗺️' : '📁';
  const backgroundIcon = cluster.mapAssetId ? '🖼️' : '📄';

  return (
    <div
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Connection handles at container edges */}
      <Handle
        type="target"
        position={Position.Left}
        className="left-handle"
        style={{
          background: '#3b82f6',
          border: '2px solid white',
          visibility: 'visible'
        }}
      />

      <Handle
        type="source"
        position={Position.Right}
        className="right-handle"
        style={{
          background: '#3b82f6',
          border: '2px solid white',
          visibility: 'visible'
        }}
      />

      {/* Main cluster container */}
      <div
        className={`
          rounded-lg border-2 overflow-hidden shadow-xl
          transition-all duration-300
          ${selected ? 'ring-4 ring-blue-400 ring-opacity-50' : ''}
          ${isHovered ? 'shadow-2xl' : ''}
        `}
        style={containerStyle}
      >
        {/* Container header */}
        <div
          className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-50 to-purple-50 border-b"
          style={{ backgroundColor: data.color, opacity: 0.1 }}
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">{typeIcon}</span>
            <div>
              <div className="font-bold text-gray-800 text-sm">
                {cluster.name}
              </div>
              <div className="text-xs text-gray-600">
                {cluster.type === 'spatial' ? '🏠 Spatial' : '📂 Organizational'}
                {cluster.mapAssetId && ' • 📄 With Map'}
                {containedBeatCount > 0 && ` • ${containedBeatCount} beats`}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Expand/Collapse button */}
            <button
              onClick={handleExpandCollapse}
              className="w-8 h-8 bg-white rounded-full shadow-md hover:bg-gray-100 transition-colors flex items-center justify-center"
              title={cluster.isExpanded ? "Collapse cluster" : "Expand cluster"}
            >
              <span className="text-gray-700">
                {cluster.isExpanded ? '▼' : '▶'}
              </span>
            </button>

            {/* Quick actions menu */}
            <button
              onClick={() => onAddToContainer(cluster.id)}
              className="w-8 h-8 bg-green-500 text-white rounded-full shadow-md hover:bg-green-600 transition-colors flex items-center justify-center"
              title="Add beat to cluster"
            >
              <span className="text-white font-bold">+</span>
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemoveContainer(cluster.id);
              }}
              className="w-8 h-8 bg-red-500 text-white rounded-full shadow-md hover:bg-red-600 transition-colors flex items-center justify-center"
              title="Remove container"
            >
              <span className="text-white">×</span>
            </button>
          </div>
        </div>

        {/* Map reference area (only for expanded spatial containers) */}
        {cluster.isExpanded && cluster.type === 'spatial' && cluster.mapAssetId && (
          <div className="relative p-4 bg-gray-50 border-b">
            <div className="w-full h-32 rounded overflow-hidden border border-gray-200 bg-white">
              {/* Map background placeholder - would render actual map asset here */}
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-50 to-green-50">
                <div className="text-center text-gray-500">
                  <div className="text-2xl mb-2">{backgroundIcon}</div>
                  <div className="text-sm font-medium">Map Reference</div>
                  <div className="text-xs">Click "Expand" to place beats</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Beat container zone */}
        {cluster.isExpanded && (
          <div
            className="relative p-4 overflow-hidden"
            style={{ minHeight: '180px' }}
            onMouseMove={handleBeatDragMove}
            onMouseUp={handleBeatDragEnd}
            onMouseLeave={handleBeatDragEnd}
          >
            {/* Container beat positions */}
            {containedBeats && containedBeats.length > 0 ? (
              <div className="relative w-full h-full">
                {containedBeats.map((beatPosition) => (
                  <div
                    key={beatPosition.beatId}
                    className={`absolute p-2 bg-blue-100 border-2 rounded shadow-lg hover:bg-blue-200 transition-colors cursor-grab ${
                      draggingBeat === beatPosition.beatId ? 'border-blue-500 cursor-grabbing shadow-xl' : 'border-blue-300'
                    }`}
                    style={{
                      left: `${beatPosition.position.x}px`,
                      top: `${beatPosition.position.y + 20}px`, // Add offset for header
                      minWidth: '100px',
                      zIndex: draggingBeat === beatPosition.beatId ? 1000 : beatPosition.position.z
                    }}
                    onMouseDown={(e) => handleBeatDragStart(e, beatPosition.beatId, beatPosition.position.x, beatPosition.position.y)}
                    onClick={(e) => {
                      e.stopPropagation();
                      console.log('Clicked positioned beat:', beatPosition.beatId);
                    }}
                  >
                    <div className="flex items-center gap-2 text-sm select-none">
                      <span className="text-lg">{beatPosition.mapStyle?.icon || '📖'}</span>
                      <span className="font-medium text-blue-800 text-xs truncate">
                        {beatPosition.beatId}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center text-gray-400">
                  <div className="text-4xl mb-2">{containedBeatCount > 0 ? '🎯' : '📍'}</div>
                  <div className="text-sm font-semibold mb-1">
                    {containedBeatCount > 0
                      ? `${containedBeatCount} beat${containedBeatCount === 1 ? '' : 's'} positioned`
                      : 'Empty cluster'}
                  </div>
                  <div className="text-xs text-gray-500">
                    {cluster.type === 'spatial'
                      ? `Place beats on ${cluster.type === 'spatial' ? 'map' : 'organized areas'}`
                      : 'Drag beats from sidebar to add them here'}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Measurement indicators when collapsed */}
        {!cluster.isExpanded && (
          <div className="flex justify-between items-center p-3 bg-blue-50/50">
            <div className="text-xs text-gray-600">
              📏 {cluster.containerBounds.width}×{cluster.containerBounds.height}px
            </div>
            <div className="text-xs text-blue-600 font-medium">
              {cluster.mapAssetId && '🖼️ With Reference'}
              {containedBeatCount > 0 && ` • ${containedBeatCount} positioned`}
            </div>
          </div>
        )}
      </div>

      {/* Bottom connection point */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="bottom-handle"
        style={{
          background: containedBeatCount > 0 ? '#10b981' : '#6b7280',
          border: '2px solid white',
          visibility: 'visible'
        }}
      />

      {/* Toolbar for cluster actions (appears on selection/hover) */}
      {(selected || isHovered) && (
        <NodeToolbar position={Position.Top} offset={8}>
          <div className="flex gap-1 bg-white shadow-lg rounded-full border p-1">
            <button
              onClick={handleExpandCollapse}
              className="px-3 py-1 text-sm hover:bg-gray-100 rounded-lg flex items-center gap-1"
              title={cluster.isExpanded ? "Collapse contents" : "Expand contents"}
            >
              <span>{cluster.isExpanded ? '▲' : '▼'}</span>
              <span>{cluster.isExpanded ? 'Collapse' : 'Expand'}</span>
            </button>
            <button
              onClick={() => onAddToContainer(cluster.id)}
              className="px-3 py-1 text-sm hover:bg-green-100 text-green-700 rounded-lg flex items-center gap-1"
              title="Add beat to cluster"
            >
              <span>+</span>
              <span>Add Beat</span>
            </button>
            <button
              onClick={() => onRemoveContainer(cluster.id)}
              className="px-3 py-1 text-sm hover:bg-red-100 text-red-700 rounded-lg flex items-center gap-1"
              title="Remove cluster container"
            >
              <span>×</span>
              <span>Remove</span>
            </button>
          </div>
        </NodeToolbar>
      )}
    </div>
  );
});

ClusterContainerNode.displayName = 'ClusterContainerNode';