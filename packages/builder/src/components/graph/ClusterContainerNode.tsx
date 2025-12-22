import React, { memo, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { NodeProps, Handle, Position } from 'reactflow';
import { Beat, Cluster, ContainerBeatPosition } from '@asaps/core';

// Extended position info including beat data
interface ClusterBeatInfo extends ContainerBeatPosition {
  beat: Beat;
}

interface ClusterContainerNodeData {
  cluster: Cluster;
  containedBeatCount: number;
  selected: boolean;
  color: string;
  onAddToContainer: (clusterId: string) => void;
  onRemoveContainer: (clusterId: string) => void;
  onExpandCollapse: (clusterId: string) => void;
  onBeatInContainerMove?: (beatId: string, clusterId: string, x: number, y: number) => void;
  onDropBeatToCluster?: (beatId: string, clusterId: string) => void;
  onClusterResize?: (clusterId: string, width: number, height: number) => void;
  onAutoLayoutCluster?: (clusterId: string) => void;
  containedBeats?: ClusterBeatInfo[];
  onBeatSelect?: (beat: Beat) => void;
  allBeats?: Beat[];
  // Map/background image
  mapAssetUrl?: string;
  onSetClusterMap?: (clusterId: string, assetId: string | null, scale?: number, opacity?: number) => void;
  // Getter function for assets to avoid embedding array in node data (prevents render issues)
  getAssets?: () => Array<{ id: string; url: string; type: string; name?: string }>;
  // Path highlighting - beats to highlight in the debug path
  highlightedBeatIds?: Set<string>;
}

// Beat type colors (same as main flowchart)
const beatTypeColors: Record<string, string> = {
  titleScreen: '#3b82f6',
  introText: '#10b981',
  dialogTree: '#8b5cf6',
  conversationChoice: '#a855f7',
  movementChoice: '#f59e0b',
  pickProp: '#ef4444',
  videoBeat: '#ec4899',
  endScreen: '#6366f1',
  setVariable: '#64748b',
  conditionBeat: '#06b6d4',
  durScreen: '#f97316',
  hyperText: '#14b8a6',
  inputText: '#8b5cf6',
};

// Beat type icons (same as BeatNode)
const beatTypeIcons: Record<string, string> = {
  titleScreen: '🎬',
  introText: '📝',
  dialogTree: '🌳',
  conversationChoice: '💬',
  movementChoice: '🚶',
  pickProp: '🎒',
  videoBeat: '🎥',
  endScreen: '🏁',
  setVariable: '🔧',
  conditionBeat: '❓',
  durScreen: '⏳',
  hyperText: '🔗',
  inputText: '✍️',
};

// Grid snap utility
const alignToGrid = (position: { x: number; y: number }, gridSize = 20): { x: number; y: number } => ({
  x: Math.round(position.x / gridSize) * gridSize,
  y: Math.round(position.y / gridSize) * gridSize
});

// Node dimensions
const NODE_WIDTH = 160;
const NODE_HEIGHT = 80;
const HEADER_HEIGHT = 40;
const MIN_CONTAINER_WIDTH = 500;
const MIN_CONTAINER_HEIGHT = 300;

export const ClusterContainerNode = memo<NodeProps<ClusterContainerNodeData>>(({
  data,
  selected,
}) => {
  const {
    cluster,
    containedBeatCount,
    onAddToContainer,
    onRemoveContainer,
    onExpandCollapse,
    onBeatInContainerMove,
    onDropBeatToCluster,
    onClusterResize,
    onAutoLayoutCluster,
    containedBeats,
    onBeatSelect,
    allBeats,
    mapAssetUrl,
    onSetClusterMap,
    getAssets,
    highlightedBeatIds
  } = data;

  // Get assets via getter function to avoid embedding array in node data
  const assets = getAssets ? getAssets() : [];

  // Calculate internal connections between beats in this cluster
  const internalConnections = useMemo(() => {
    if (!containedBeats || containedBeats.length < 2) return [];

    const beatIds = new Set(containedBeats.map(b => b.beatId));
    const connections: Array<{ from: string; to: string; label?: string; color?: string; dashed?: boolean }> = [];

    containedBeats.forEach(({ beat, beatId }) => {
      const params = typeof beat.getParameters === 'function' ? beat.getParameters() : {};
      const beatConnections = typeof beat.getConnections === 'function'
        ? beat.getConnections()
        : (beat.connections || []);

      beatConnections.forEach((conn: any) => {
        if (beatIds.has(conn.targetId)) {
          connections.push({
            from: beatId,
            to: conn.targetId,
            label: conn.label,
            color: conn.condition ? '#fbbf24' : '#64748b',
            dashed: !!conn.condition,
          });
        }
      });

      if (beat.defaultTarget && beatIds.has(beat.defaultTarget)) {
        connections.push({
          from: beatId,
          to: beat.defaultTarget,
          label: 'default',
          color: '#22c55e',
          dashed: true,
        });
      }

      if (beat.type === 'conditionBeat') {
        if (params.trueTarget && beatIds.has(params.trueTarget)) {
          connections.push({ from: beatId, to: params.trueTarget, label: 'True', color: '#22c55e' });
        }
        if (params.falseTarget && beatIds.has(params.falseTarget)) {
          connections.push({ from: beatId, to: params.falseTarget, label: 'False', color: '#ef4444' });
        }
      }

      if (beat.type === 'movementChoice' && params.choices) {
        params.choices.forEach((choice: any) => {
          if (choice.target && beatIds.has(choice.target)) {
            connections.push({
              from: beatId,
              to: choice.target,
              label: choice.text || choice.location,
              color: '#f59e0b',
              dashed: true,
            });
          }
        });
      }

      if (beat.type === 'dialogTree' && params.dialogTree) {
        const extractTarget = (choice: any): string | null => {
          if (!choice) return null;
          if (typeof choice.target === 'string') return choice.target;
          if (choice.target?.next) return choice.target.next;
          if (choice.target?.target) return choice.target.target;
          return null;
        };

        if (params.dialogTree.choices) {
          params.dialogTree.choices.forEach((choice: any) => {
            const target = extractTarget(choice);
            if (target && beatIds.has(target)) {
              connections.push({ from: beatId, to: target, label: choice.text, color: '#3b82f6' });
            }
          });
        }
      }
    });

    return connections;
  }, [containedBeats]);

  // Calculate external connections
  const externalConnections = useMemo(() => {
    if (!containedBeats || !allBeats) return { incoming: new Map<string, string[]>(), outgoing: new Map<string, string[]>() };

    const clusterBeatIds = new Set(containedBeats.map(b => b.beatId));
    const incoming = new Map<string, string[]>();
    const outgoing = new Map<string, string[]>();

    allBeats.forEach(beat => {
      const beatConnections = typeof beat.getConnections === 'function'
        ? beat.getConnections()
        : (beat.connections || []);

      beatConnections.forEach((conn: any) => {
        const sourceInCluster = clusterBeatIds.has(beat.id);
        const targetInCluster = clusterBeatIds.has(conn.targetId);

        if (!sourceInCluster && targetInCluster) {
          const existing = incoming.get(conn.targetId) || [];
          existing.push(beat.name);
          incoming.set(conn.targetId, existing);
        }

        if (sourceInCluster && !targetInCluster) {
          const targetBeat = allBeats.find(b => b.id === conn.targetId);
          if (targetBeat) {
            const existing = outgoing.get(beat.id) || [];
            existing.push(targetBeat.name);
            outgoing.set(beat.id, existing);
          }
        }
      });

      if (beat.defaultTarget) {
        const sourceInCluster = clusterBeatIds.has(beat.id);
        const targetInCluster = clusterBeatIds.has(beat.defaultTarget);

        if (!sourceInCluster && targetInCluster) {
          const existing = incoming.get(beat.defaultTarget) || [];
          existing.push(beat.name);
          incoming.set(beat.defaultTarget, existing);
        }

        if (sourceInCluster && !targetInCluster) {
          const targetBeat = allBeats.find(b => b.id === beat.defaultTarget);
          if (targetBeat) {
            const existing = outgoing.get(beat.id) || [];
            existing.push(targetBeat.name);
            outgoing.set(beat.id, existing);
          }
        }
      }
    });

    return { incoming, outgoing };
  }, [containedBeats, allBeats]);

  const [draggingBeat, setDraggingBeat] = useState<string | null>(null);
  const [dragStartMouse, setDragStartMouse] = useState({ x: 0, y: 0 });
  const [dragStartBeatPos, setDragStartBeatPos] = useState({ x: 0, y: 0 });
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedBeatId, setSelectedBeatId] = useState<string | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [showMapSettings, setShowMapSettings] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapSettingsRef = useRef<HTMLDivElement>(null);

  // Use cluster bounds or defaults
  const containerWidth = Math.max(cluster.containerBounds?.width || MIN_CONTAINER_WIDTH, MIN_CONTAINER_WIDTH);
  const containerHeight = Math.max(cluster.containerBounds?.height || MIN_CONTAINER_HEIGHT, MIN_CONTAINER_HEIGHT);
  const contentHeight = containerHeight - HEADER_HEIGHT;

  // Zoom controls
  const handleZoomIn = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setZoom(z => Math.min(2, z + 0.1));
  }, []);

  const handleZoomOut = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setZoom(z => Math.max(0.5, z - 0.1));
  }, []);

  // Fit view - calculate zoom and pan to fit all beats
  const handleFitView = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!containedBeats || containedBeats.length === 0) {
      setZoom(1);
      setPanOffset({ x: 0, y: 0 });
      return;
    }

    const padding = 40;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    containedBeats.forEach(b => {
      if (b.position) {
        minX = Math.min(minX, b.position.x);
        minY = Math.min(minY, b.position.y);
        maxX = Math.max(maxX, b.position.x + NODE_WIDTH);
        maxY = Math.max(maxY, b.position.y + NODE_HEIGHT);
      }
    });

    if (minX === Infinity) {
      setZoom(1);
      setPanOffset({ x: 0, y: 0 });
      return;
    }

    const contentW = maxX - minX + padding * 2;
    const contentH = maxY - minY + padding * 2;
    const availableW = containerWidth - 20;
    const availableH = contentHeight - 20;

    const scaleX = availableW / contentW;
    const scaleY = availableH / contentH;
    const newZoom = Math.min(1.5, Math.max(0.5, Math.min(scaleX, scaleY)));

    // Center the content
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const newPanX = (availableW / 2) / newZoom - centerX;
    const newPanY = (availableH / 2) / newZoom - centerY;

    setZoom(newZoom);
    setPanOffset({ x: newPanX, y: newPanY });
  }, [containedBeats, containerWidth, contentHeight]);

  // Auto-layout within cluster
  const handleAutoLayout = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (onAutoLayoutCluster) {
      onAutoLayoutCluster(cluster.id);
    }
  }, [cluster.id, onAutoLayoutCluster]);

  // Global mouse event handlers for drag and resize
  useEffect(() => {
    if (!draggingBeat && !isResizing) return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isResizing && onClusterResize) {
        const deltaX = e.clientX - resizeStart.x;
        const deltaY = e.clientY - resizeStart.y;
        const newWidth = Math.max(MIN_CONTAINER_WIDTH, resizeStart.width + deltaX);
        const newHeight = Math.max(MIN_CONTAINER_HEIGHT, resizeStart.height + deltaY);
        onClusterResize(cluster.id, newWidth, newHeight);
        return;
      }

      if (draggingBeat && onBeatInContainerMove) {
        const deltaX = e.clientX - dragStartMouse.x;
        const deltaY = e.clientY - dragStartMouse.y;
        const newX = dragStartBeatPos.x + deltaX;
        const newY = dragStartBeatPos.y + deltaY;
        const snapped = alignToGrid({ x: Math.max(0, newX), y: Math.max(0, newY) });
        onBeatInContainerMove(draggingBeat, cluster.id, snapped.x, snapped.y);
      }
    };

    const handleGlobalMouseUp = () => {
      setDraggingBeat(null);
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleGlobalMouseMove);
    document.addEventListener('mouseup', handleGlobalMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [draggingBeat, isResizing, dragStartMouse, dragStartBeatPos, resizeStart, cluster.id, onBeatInContainerMove, onClusterResize]);

  const handleExpandCollapse = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onExpandCollapse(cluster.id);
  }, [cluster.id, onExpandCollapse]);

  const handleRemove = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onRemoveContainer(cluster.id);
  }, [cluster.id, onRemoveContainer]);

  const handleAddBeat = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onAddToContainer(cluster.id);
  }, [cluster.id, onAddToContainer]);

  // Beat drag within container
  const handleBeatMouseDown = useCallback((e: React.MouseEvent, beatId: string, beatX: number, beatY: number) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();

    setDraggingBeat(beatId);
    setDragStartMouse({ x: e.clientX, y: e.clientY });
    setDragStartBeatPos({ x: beatX, y: beatY });
  }, []);

  // Mouse up handler - no longer needed as we use global listeners
  const handleContainerMouseUp = useCallback(() => {
    // Handled by global listeners now
  }, []);

  // Resize handling
  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(true);
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: containerWidth,
      height: containerHeight,
    });
  }, [containerWidth, containerHeight]);

  // Drag-drop from outside (sidebar)
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const beatId = e.dataTransfer.getData('text/beatId') || e.dataTransfer.getData('beatId');
    if (beatId && onDropBeatToCluster) {
      onDropBeatToCluster(beatId, cluster.id);
    }
  }, [cluster.id, onDropBeatToCluster]);

  const isExpanded = cluster.isExpanded;
  const hasMap = !!cluster.mapAssetId;

  // COLLAPSED VIEW
  if (!isExpanded) {
    return (
      <div className="relative">
        <Handle type="target" position={Position.Left} style={{ background: '#6366f1', border: '2px solid white', width: 12, height: 12 }} />
        <Handle type="source" position={Position.Right} style={{ background: '#6366f1', border: '2px solid white', width: 12, height: 12 }} />

        <div
          className={`
            flex items-center gap-3 px-4 py-3 rounded-lg border-2 shadow-lg
            bg-gradient-to-r from-indigo-50 to-purple-50
            ${selected ? 'border-blue-500 ring-2 ring-blue-300' : 'border-indigo-300'}
            ${isDragOver ? 'border-green-500 bg-green-50' : ''}
            hover:shadow-xl transition-all
          `}
          style={{ minWidth: '280px' }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <button
            onClick={handleExpandCollapse}
            className="w-8 h-8 bg-indigo-500 text-white rounded-lg shadow hover:bg-indigo-600 transition-colors flex items-center justify-center flex-shrink-0"
            title="Expand cluster"
          >
            <span className="text-lg">▶</span>
          </button>

          <div className="flex-1 min-w-0">
            <div className="font-semibold text-gray-800 truncate">{cluster.name}</div>
            <div className="text-xs text-gray-500">
              {containedBeatCount} beat{containedBeatCount !== 1 ? 's' : ''}
              {hasMap && ' • Has map'}
            </div>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={handleAddBeat}
              className="w-7 h-7 bg-green-500 text-white rounded-md shadow hover:bg-green-600 transition-colors flex items-center justify-center text-sm"
              title="Add beat to cluster"
            >
              +
            </button>
            <button
              onClick={handleRemove}
              className="w-7 h-7 bg-red-500 text-white rounded-md shadow hover:bg-red-600 transition-colors flex items-center justify-center text-sm"
              title="Delete cluster"
            >
              ×
            </button>
          </div>
        </div>
      </div>
    );
  }

  // EXPANDED VIEW - Mini flowchart
  return (
    <div className="relative">
      <Handle type="target" position={Position.Left} style={{ background: '#6366f1', border: '2px solid white', width: 12, height: 12 }} />
      <Handle type="source" position={Position.Right} style={{ background: '#6366f1', border: '2px solid white', width: 12, height: 12 }} />

      <div
        className={`
          rounded-xl border-2 shadow-xl overflow-visible
          ${selected ? 'border-blue-500 ring-2 ring-blue-300' : 'border-indigo-300'}
          ${isDragOver ? 'border-green-500' : ''}
        `}
        style={{ width: containerWidth, backgroundColor: 'white' }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Header - Compact with controls */}
        <div className="flex items-center justify-between px-3 py-2 bg-gradient-to-r from-indigo-100 to-purple-100 border-b border-indigo-200 cursor-move" style={{ height: HEADER_HEIGHT }}>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExpandCollapse}
              className="w-6 h-6 bg-indigo-500 text-white rounded shadow hover:bg-indigo-600 transition-colors flex items-center justify-center nodrag"
              title="Collapse cluster"
            >
              <span className="text-sm">▼</span>
            </button>

            <div className="min-w-0">
              <div className="font-semibold text-sm text-gray-800 truncate">{cluster.name}</div>
              <div className="text-xs text-gray-500">
                {containedBeatCount} beat{containedBeatCount !== 1 ? 's' : ''}
                {zoom !== 1 && ` • ${Math.round(zoom * 100)}%`}
              </div>
            </div>
          </div>

          {/* Control buttons - zoom, fit, auto-layout */}
          <div className="flex items-center gap-1 nodrag">
            <button
              onClick={handleZoomOut}
              className="w-6 h-6 bg-gray-200 text-gray-700 rounded shadow-sm hover:bg-gray-300 transition-colors flex items-center justify-center text-sm font-bold"
              title="Zoom out"
            >
              −
            </button>
            <button
              onClick={handleZoomIn}
              className="w-6 h-6 bg-gray-200 text-gray-700 rounded shadow-sm hover:bg-gray-300 transition-colors flex items-center justify-center text-sm font-bold"
              title="Zoom in"
            >
              +
            </button>
            <button
              onClick={handleFitView}
              className="w-6 h-6 bg-gray-200 text-gray-700 rounded shadow-sm hover:bg-gray-300 transition-colors flex items-center justify-center text-xs"
              title="Fit view"
            >
              ⊡
            </button>
            {onAutoLayoutCluster && (
              <button
                onClick={handleAutoLayout}
                className="w-6 h-6 bg-gray-200 text-gray-700 rounded shadow-sm hover:bg-gray-300 transition-colors flex items-center justify-center text-xs"
                title="Auto-arrange"
              >
                ⋮⋮
              </button>
            )}

            {/* Map settings button */}
            {onSetClusterMap && (
              <div className="relative" ref={mapSettingsRef}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMapSettings(!showMapSettings);
                  }}
                  className={`w-6 h-6 rounded shadow-sm transition-colors flex items-center justify-center text-xs ${
                    mapAssetUrl ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                  title="Map settings"
                >
                  🗺️
                </button>

                {/* Map settings popover */}
                {showMapSettings && (
                  <div
                    className="absolute top-8 right-0 bg-white rounded-lg shadow-xl border border-gray-200 p-3 z-50 min-w-[200px]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="text-sm font-medium text-gray-700 mb-2">Background Image</div>

                    {mapAssetUrl ? (
                      <>
                        <div className="mb-3">
                          <img src={mapAssetUrl} alt="" className="w-full h-20 object-cover rounded border" />
                        </div>

                        <div className="mb-3">
                          <label className="text-xs text-gray-600 block mb-1">
                            Scale: {Math.round((cluster.mapScale || 1) * 100)}%
                          </label>
                          <input
                            type="range"
                            min="0.1"
                            max="3"
                            step="0.1"
                            value={cluster.mapScale || 1}
                            onChange={(e) => {
                              onSetClusterMap(cluster.id, cluster.mapAssetId || null, parseFloat(e.target.value), cluster.mapOpacity);
                            }}
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>

                        <div className="mb-3">
                          <label className="text-xs text-gray-600 block mb-1">
                            Opacity: {Math.round((cluster.mapOpacity ?? 0.5) * 100)}%
                          </label>
                          <input
                            type="range"
                            min="0.1"
                            max="1"
                            step="0.1"
                            value={cluster.mapOpacity ?? 0.5}
                            onChange={(e) => {
                              onSetClusterMap(cluster.id, cluster.mapAssetId || null, cluster.mapScale, parseFloat(e.target.value));
                            }}
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>

                        <button
                          onClick={() => {
                            onSetClusterMap(cluster.id, null);
                            setShowMapSettings(false);
                          }}
                          className="w-full px-2 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600"
                        >
                          Remove Background
                        </button>
                      </>
                    ) : (
                      <div className="text-xs text-gray-500">
                        {/* Filter to only image assets */}
                        {(() => {
                          const imageAssets = assets.filter(a => a.type === 'image');
                          if (imageAssets.length === 0) {
                            return (
                              <div className="py-4 text-center">
                                <div className="mb-2">No images available</div>
                                <div className="text-gray-400">
                                  Add images in the Asset Manager first
                                </div>
                              </div>
                            );
                          }
                          return (
                            <div>
                              <div className="mb-2 text-gray-600">Select an image:</div>
                              <div className="grid grid-cols-3 gap-1 max-h-[150px] overflow-y-auto">
                                {imageAssets.map(asset => (
                                  <button
                                    key={asset.id}
                                    onClick={() => {
                                      if (onSetClusterMap) {
                                        onSetClusterMap(cluster.id, asset.id, 1, 0.5);
                                      }
                                    }}
                                    className="w-12 h-12 rounded border border-gray-200 overflow-hidden hover:border-blue-500 hover:ring-2 hover:ring-blue-200 transition-all"
                                    title={asset.name || asset.id}
                                  >
                                    <img
                                      src={asset.url}
                                      alt={asset.name || 'Asset'}
                                      className="w-full h-full object-cover"
                                    />
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="w-px h-4 bg-gray-300 mx-1" />

            <button
              onClick={handleAddBeat}
              className="px-2 py-1 bg-green-500 text-white rounded shadow hover:bg-green-600 transition-colors text-xs font-medium"
              title="Add beat to cluster"
            >
              + Beat
            </button>
            <button
              onClick={handleRemove}
              className="w-6 h-6 bg-red-500 text-white rounded shadow hover:bg-red-600 transition-colors flex items-center justify-center text-sm"
              title="Delete cluster"
            >
              ×
            </button>
          </div>
        </div>

        {/* Flowchart Content Area - nodrag prevents cluster from moving when interacting here */}
        <div
          ref={containerRef}
          className={`nodrag relative overflow-hidden ${isDragOver ? 'bg-green-50' : 'bg-gray-50'}`}
          style={{
            height: contentHeight,
            backgroundImage: mapAssetUrl ? 'none' : 'radial-gradient(circle, #d1d5db 1px, transparent 1px)',
            backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
            cursor: draggingBeat || isResizing ? 'grabbing' : 'default',
          }}
        >
          {/* Background map image */}
          {mapAssetUrl && (
            <img
              src={mapAssetUrl}
              alt=""
              className="absolute pointer-events-none select-none"
              draggable={false}
              style={{
                top: 0,
                left: 0,
                transformOrigin: '0 0',
                transform: `scale(${cluster.mapScale || 1})`,
                opacity: cluster.mapOpacity ?? 0.5,
                zIndex: 0,
              }}
            />
          )}

          {/* Grid overlay when map is present */}
          {mapAssetUrl && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.15) 1px, transparent 1px)',
                backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
                zIndex: 1,
              }}
            />
          )}

          {/* External connections SVG - OUTSIDE transform wrapper, uses transformed coordinates */}
          <svg
            className="absolute inset-0 pointer-events-none"
            style={{ width: '100%', height: '100%', overflow: 'visible', zIndex: 5 }}
          >
            <defs>
              <marker id={`arrow-entry-${cluster.id}`} markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                <polygon points="0 0, 6 2, 0 4" fill="#6366f1" />
              </marker>
            </defs>

            {/* External incoming connections - from cluster's left edge to beat's left handle center */}
            {(() => {
              // ReactFlow Handle is at vertical center of entire cluster (including header)
              // In content area coordinates, we need to offset by header height
              const handleY = (containerHeight / 2) - HEADER_HEIGHT;
              const entryX = 0; // Start at cluster edge

              return containedBeats && Array.from(externalConnections.incoming.entries()).map(([beatId, sources]) => {
                const beat = containedBeats.find(b => b.beatId === beatId);
                if (!beat || !beat.position) return null;

                // Transform beat position by zoom and pan - connect to center of left handle (at beat left edge)
                const beatHandleX = ((beat.position.x || 0) + panOffset.x) * zoom;
                const beatCenterY = ((beat.position.y || 0) + NODE_HEIGHT / 2 + panOffset.y) * zoom;

                if (isNaN(beatHandleX) || isNaN(beatCenterY)) return null;

                const controlOffsetX = Math.max(30, Math.abs(beatHandleX - entryX) * 0.4);

                return (
                  <g key={`entry-${beatId}`}>
                    <path
                      d={`M ${entryX} ${handleY} C ${entryX + controlOffsetX} ${handleY}, ${beatHandleX - controlOffsetX} ${beatCenterY}, ${beatHandleX} ${beatCenterY}`}
                      fill="none"
                      stroke="#6366f1"
                      strokeWidth="1.5"
                      strokeDasharray="3 3"
                      markerEnd={`url(#arrow-entry-${cluster.id})`}
                    />
                  </g>
                );
              });
            })()}

            {/* External outgoing connections - from beat's right handle center to cluster's right edge */}
            {(() => {
              // ReactFlow Handle is at vertical center of entire cluster (including header)
              // In content area coordinates, we need to offset by header height
              const handleY = (containerHeight / 2) - HEADER_HEIGHT;
              const exitX = containerWidth; // End at cluster edge

              return containedBeats && Array.from(externalConnections.outgoing.entries()).map(([beatId, targets]) => {
                const beat = containedBeats.find(b => b.beatId === beatId);
                if (!beat || !beat.position) return null;

                // Transform beat position by zoom and pan - connect from center of right handle (at beat right edge)
                const beatHandleX = ((beat.position.x || 0) + NODE_WIDTH + panOffset.x) * zoom;
                const beatCenterY = ((beat.position.y || 0) + NODE_HEIGHT / 2 + panOffset.y) * zoom;

                if (isNaN(beatHandleX) || isNaN(beatCenterY)) return null;

                const controlOffsetX = Math.max(30, Math.abs(exitX - beatHandleX) * 0.4);

                return (
                  <g key={`exit-${beatId}`}>
                    <path
                      d={`M ${beatHandleX} ${beatCenterY} C ${beatHandleX + controlOffsetX} ${beatCenterY}, ${exitX - controlOffsetX} ${handleY}, ${exitX} ${handleY}`}
                      fill="none"
                      stroke="#6366f1"
                      strokeWidth="1.5"
                      strokeDasharray="3 3"
                    />
                  </g>
                );
              });
            })()}
          </svg>

          {/* Transform wrapper for zoom and pan */}
          <div
            style={{
              transform: `scale(${zoom}) translate(${panOffset.x}px, ${panOffset.y}px)`,
              transformOrigin: '0 0',
              width: containerWidth / zoom,
              height: contentHeight / zoom,
              position: 'relative',
            }}
          >
          {/* Internal connections SVG - inside transform wrapper */}
          <svg
            className="absolute inset-0 pointer-events-none"
            style={{ width: '100%', height: '100%', overflow: 'visible' }}
          >
            <defs>
              <marker id={`arrow-${cluster.id}`} markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                <polygon points="0 0, 6 2, 0 4" fill="#64748b" />
              </marker>
              <marker id={`arrow-green-${cluster.id}`} markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                <polygon points="0 0, 6 2, 0 4" fill="#22c55e" />
              </marker>
              <marker id={`arrow-red-${cluster.id}`} markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                <polygon points="0 0, 6 2, 0 4" fill="#ef4444" />
              </marker>
              <marker id={`arrow-yellow-${cluster.id}`} markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                <polygon points="0 0, 6 2, 0 4" fill="#f59e0b" />
              </marker>
              <marker id={`arrow-blue-${cluster.id}`} markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                <polygon points="0 0, 6 2, 0 4" fill="#3b82f6" />
              </marker>
            </defs>

            {/* Internal connections */}
            {containedBeats && internalConnections.map((conn, idx) => {
              const fromBeat = containedBeats.find(b => b.beatId === conn.from);
              const toBeat = containedBeats.find(b => b.beatId === conn.to);
              if (!fromBeat || !toBeat || !fromBeat.position || !toBeat.position) return null;

              // Handle positions account for 2px border:
              // - Handles are positioned relative to padding-box (inside border)
              // - With -left/right-1.5 (6px) and w-3 (12px), handle CENTER is at padding-box edge
              // - Padding-box edge is 2px inside border-box edge
              // - But we want connections at handle centers, which ARE at padding-box edges
              // Connect from center of right handle
              const fromX = (fromBeat.position.x || 0) + NODE_WIDTH;
              const fromY = (fromBeat.position.y || 0) + NODE_HEIGHT / 2;
              // Connect to center of left handle
              const toX = toBeat.position.x || 0;
              const toY = (toBeat.position.y || 0) + NODE_HEIGHT / 2;

              if (isNaN(fromX) || isNaN(fromY) || isNaN(toX) || isNaN(toY)) return null;

              const dx = Math.abs(toX - fromX);
              const controlOffset = Math.max(20, dx * 0.3);

              const color = conn.color || '#64748b';
              const markerColor = color === '#22c55e' ? 'green' :
                                 color === '#ef4444' ? 'red' :
                                 color === '#f59e0b' ? 'yellow' :
                                 color === '#3b82f6' ? 'blue' : '';
              const markerId = markerColor ? `arrow-${markerColor}-${cluster.id}` : `arrow-${cluster.id}`;

              return (
                <g key={`${conn.from}-${conn.to}-${idx}`}>
                  <path
                    d={`M ${fromX} ${fromY} C ${fromX + controlOffset} ${fromY}, ${toX - controlOffset} ${toY}, ${toX} ${toY}`}
                    fill="none"
                    stroke={color}
                    strokeWidth="1.5"
                    strokeDasharray={conn.dashed ? '4 4' : 'none'}
                    markerEnd={`url(#${markerId})`}
                  />
                  {conn.label && (
                    <text
                      x={(fromX + toX) / 2}
                      y={(fromY + toY) / 2 - 6}
                      textAnchor="middle"
                      fontSize="9"
                      fill={color}
                      className="select-none pointer-events-none"
                      style={{ fontWeight: 500 }}
                    >
                      {conn.label.length > 12 ? conn.label.substring(0, 12) + '...' : conn.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Beat Nodes */}
          {containedBeats && containedBeats.length > 0 ? (
            containedBeats.map((beatInfo) => {
              const beat = beatInfo.beat;
              const icon = beatTypeIcons[beat.type] || '📄';
              const color = beatTypeColors[beat.type] || '#94a3b8';
              const isSelected = selectedBeatId === beatInfo.beatId;
              const isDragging = draggingBeat === beatInfo.beatId;
              const hasIncoming = externalConnections.incoming.has(beatInfo.beatId);
              const hasOutgoing = externalConnections.outgoing.has(beatInfo.beatId);
              const isHighlighted = highlightedBeatIds?.has(beatInfo.beatId);

              return (
                <div
                  key={beatInfo.beatId}
                  className={`
                    absolute rounded-lg border-2 bg-white shadow-lg
                    transition-shadow
                    ${isDragging ? 'shadow-2xl z-50 cursor-grabbing' : 'hover:shadow-xl cursor-grab'}
                    ${isSelected ? 'ring-4 ring-blue-400 ring-opacity-50' : ''}
                    ${isHighlighted && !isSelected ? 'ring-4 ring-amber-400 ring-opacity-70' : ''}
                  `}
                  style={{
                    left: beatInfo.position.x,
                    top: beatInfo.position.y,
                    width: NODE_WIDTH,
                    height: NODE_HEIGHT,
                    borderColor: isSelected ? color : '#d1d5db',
                    overflow: 'visible', // Allow handles to extend outside
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!draggingBeat) {
                      setSelectedBeatId(beatInfo.beatId);
                      if (onBeatSelect) {
                        onBeatSelect(beat);
                      }
                    }
                  }}
                  onMouseDown={(e) => handleBeatMouseDown(e, beatInfo.beatId, beatInfo.position.x, beatInfo.position.y)}
                >
                  {/* Left Handle (Target) - positioned at border edge, not padding edge */}
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white"
                    style={{ backgroundColor: color, left: '-8px' }}
                  />

                  {/* Node Content */}
                  <div className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xl" title={beat.type}>{icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm text-gray-800 truncate">
                          {beat.name || 'Unnamed'}
                        </div>
                        <div className="text-xs text-gray-500">{beat.type}</div>
                      </div>
                    </div>

                    {/* External connection indicators */}
                    {(hasIncoming || hasOutgoing) && (
                      <div className="flex gap-1 mt-1.5">
                        {hasIncoming && (
                          <span
                            className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded flex items-center gap-0.5"
                            title={`From: ${externalConnections.incoming.get(beatInfo.beatId)?.join(', ')}`}
                          >
                            ← {externalConnections.incoming.get(beatInfo.beatId)?.length}
                          </span>
                        )}
                        {hasOutgoing && (
                          <span
                            className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded flex items-center gap-0.5"
                            title={`To: ${externalConnections.outgoing.get(beatInfo.beatId)?.join(', ')}`}
                          >
                            {externalConnections.outgoing.get(beatInfo.beatId)?.length} →
                          </span>
                        )}
                      </div>
                    )}

                    {/* Beat indicators */}
                    {(beat.defaultTarget || beat.sound) && (
                      <div className="flex gap-1 mt-1">
                        {beat.defaultTarget && (
                          <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded" title="Has default target">D</span>
                        )}
                        {beat.sound && (
                          <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded" title="Has sound">S</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right Handle (Source) - positioned at border edge, not padding edge */}
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white"
                    style={{ backgroundColor: color, right: '-8px' }}
                  />
                </div>
              );
            })
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className={`text-center p-6 rounded-xl border-2 border-dashed ${isDragOver ? 'border-green-400 bg-green-100' : 'border-gray-300'}`}>
                <div className="text-4xl mb-2">{isDragOver ? '📥' : '📍'}</div>
                <div className="text-sm font-medium text-gray-600 mb-1">
                  {isDragOver ? 'Drop beat here!' : 'Empty cluster'}
                </div>
                <div className="text-xs text-gray-400">
                  Drag beats from sidebar to add them
                </div>
              </div>
            </div>
          )}
          </div>
          {/* End of transform wrapper */}

          {/* Resize Handle - outside transform wrapper */}
          <div
            className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
            style={{
              background: 'linear-gradient(135deg, transparent 50%, #6366f1 50%)',
              borderBottomRightRadius: '0.5rem',
            }}
            onMouseDown={handleResizeMouseDown}
            title="Drag to resize"
          />
        </div>
      </div>
    </div>
  );
});

ClusterContainerNode.displayName = 'ClusterContainerNode';
