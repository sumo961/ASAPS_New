import React, { memo, useState, useCallback, useEffect, useRef } from 'react';
import { NodeProps, Handle, Position } from 'reactflow';
import { Cluster, SharedVisualContent } from '@asaps/core';
import { CLUSTER_HEADER_H, MIN_CLUSTER_W, MIN_CLUSTER_H } from './graphStyle';

/**
 * ClusterContainerNode — the cluster FRAME.
 *
 * Since the cluster unification (Phase 2), beats inside a cluster are real
 * ReactFlow child nodes (BeatNode with parentNode/extent, built in
 * graphBuild.ts) and every connection is a real ReactFlow edge. This
 * component renders only what the frame owns: the header bar with its
 * popovers, the map background, the resize handle, the drop target and the
 * collapsed pill. It must NOT render beats or edges — that dual rendering
 * path is exactly what the unification removed (clustered beats missed the
 * B1b ▸, PW trace, broken marks, context menu, multi-select, and dragged
 * wrong at zoom ≠ 1).
 *
 * ReactFlow v11 note: child nodes are NOT DOM descendants of this node —
 * parentNode only affects transform math — so nothing here can clip or
 * swallow their events. The node's dragHandle ('.cluster-drag-handle') is
 * set in graphBuild.ts so only the header moves the frame.
 */

interface ClusterContainerNodeData {
  cluster: Cluster;
  containedBeatCount: number;
  selected: boolean;
  color: string;
  onRemoveContainer: (clusterId: string) => void;
  onExpandCollapse: (clusterId: string) => void;
  onDropBeatToCluster?: (beatId: string, clusterId: string) => void;
  onClusterResize?: (clusterId: string, width: number, height: number) => void;
  onAutoLayoutCluster?: (clusterId: string) => void;
  mapAssetUrl?: string;
  onSetClusterMap?: (clusterId: string, assetId: string | null, scale?: number, opacity?: number) => void;
  onSetClusterSound?: (clusterId: string, soundAssetId: string | null, volume?: number) => void;
  onSetClusterSharedVisuals?: (clusterId: string, sharedVisuals: SharedVisualContent | undefined) => void;
  /** Live getter so the map/sound popovers see the current asset list. */
  getAssets?: () => Array<{ id: string; url: string; type: string; name?: string }>;
}

const HEADER_HEIGHT = CLUSTER_HEADER_H;
const MIN_CONTAINER_WIDTH = MIN_CLUSTER_W;
const MIN_CONTAINER_HEIGHT = MIN_CLUSTER_H;

export const ClusterContainerNode = memo<NodeProps<ClusterContainerNodeData>>(({
  data,
  selected,
}) => {
  const {
    cluster,
    containedBeatCount,
    onRemoveContainer,
    onExpandCollapse,
    onDropBeatToCluster,
    onClusterResize,
    onAutoLayoutCluster,
    mapAssetUrl,
    onSetClusterMap,
    onSetClusterSound,
    onSetClusterSharedVisuals,
    getAssets,
  } = data;

  // Get assets via getter function to avoid embedding array in node data
  const assets = getAssets ? getAssets() : [];

  const [isDragOver, setIsDragOver] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [showMapSettings, setShowMapSettings] = useState(false);
  const [showSoundSettings, setShowSoundSettings] = useState(false);
  const [showSharedVisualsSettings, setShowSharedVisualsSettings] = useState(false);
  const mapSettingsRef = useRef<HTMLDivElement>(null);
  const soundSettingsRef = useRef<HTMLDivElement>(null);

  // Use cluster bounds or defaults
  const containerWidth = Math.max(cluster.containerBounds?.width || MIN_CONTAINER_WIDTH, MIN_CONTAINER_WIDTH);
  const containerHeight = Math.max(cluster.containerBounds?.height || MIN_CONTAINER_HEIGHT, MIN_CONTAINER_HEIGHT);
  const contentHeight = containerHeight - HEADER_HEIGHT;

  // Auto-layout within cluster
  const handleAutoLayout = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (onAutoLayoutCluster) {
      onAutoLayoutCluster(cluster.id);
    }
  }, [cluster.id, onAutoLayoutCluster]);

  // Global mouse handlers for the manual resize drag
  useEffect(() => {
    if (!isResizing) return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (onClusterResize) {
        const deltaX = e.clientX - resizeStart.x;
        const deltaY = e.clientY - resizeStart.y;
        const newWidth = Math.max(MIN_CONTAINER_WIDTH, resizeStart.width + deltaX);
        const newHeight = Math.max(MIN_CONTAINER_HEIGHT, resizeStart.height + deltaY);
        onClusterResize(cluster.id, newWidth, newHeight);
      }
    };

    const handleGlobalMouseUp = () => setIsResizing(false);

    document.addEventListener('mousemove', handleGlobalMouseMove);
    document.addEventListener('mouseup', handleGlobalMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isResizing, resizeStart, cluster.id, onClusterResize]);

  const handleExpandCollapse = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onExpandCollapse(cluster.id);
  }, [cluster.id, onExpandCollapse]);

  const handleRemove = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onRemoveContainer(cluster.id);
  }, [cluster.id, onRemoveContainer]);

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
        <Handle type="target" position={Position.Left} isConnectable={false} style={{ background: '#6366f1', border: '2px solid white', width: 12, height: 12 }} />
        <Handle type="source" position={Position.Right} isConnectable={false} style={{ background: '#6366f1', border: '2px solid white', width: 12, height: 12 }} />

        <div
          className={`
            cluster-drag-handle
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
            className="cluster-collapse-btn nodrag w-8 h-8 bg-indigo-500 text-white rounded-lg shadow hover:bg-indigo-600 transition-colors flex items-center justify-center flex-shrink-0"
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
            {/* "+ Beat" button removed — beat creation happens via the sidebar palette. */}
            <button
              onClick={handleRemove}
              className="nodrag w-7 h-7 bg-red-500 text-white rounded-md shadow hover:bg-red-600 transition-colors flex items-center justify-center text-sm"
              title="Delete cluster"
            >
              ×
            </button>
          </div>
        </div>
      </div>
    );
  }

  // EXPANDED VIEW — frame only; the beats render as ReactFlow child nodes.
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
        {/* Header — the frame's drag handle (see dragHandle in graphBuild.ts) */}
        <div className="cluster-drag-handle flex items-center justify-between px-3 py-2 bg-gradient-to-r from-indigo-100 to-purple-100 border-b border-indigo-200 cursor-move" style={{ height: HEADER_HEIGHT }}>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExpandCollapse}
              className="cluster-collapse-btn nodrag w-6 h-6 bg-indigo-500 text-white rounded shadow hover:bg-indigo-600 transition-colors flex items-center justify-center"
              title="Collapse cluster"
            >
              <span className="text-sm">▼</span>
            </button>

            <div className="min-w-0">
              <div className="font-semibold text-sm text-gray-800 truncate">{cluster.name}</div>
              <div className="text-xs text-gray-500">
                {containedBeatCount} beat{containedBeatCount !== 1 ? 's' : ''}
              </div>
            </div>
          </div>

          {/* Control buttons */}
          <div className="flex items-center gap-1 nodrag">
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

            {/* Sound settings button */}
            {onSetClusterSound && (
              <div className="relative" ref={soundSettingsRef}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowSoundSettings(!showSoundSettings);
                  }}
                  className={`w-6 h-6 rounded shadow-sm transition-colors flex items-center justify-center text-xs ${
                    cluster.sound?.file ? 'bg-purple-500 text-white hover:bg-purple-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                  title="Ambient sound settings"
                >
                  🔊
                </button>

                {/* Sound settings popover */}
                {showSoundSettings && (
                  <div
                    className="absolute top-8 right-0 bg-white rounded-lg shadow-xl border border-gray-200 p-3 z-50 min-w-[200px]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="text-sm font-medium text-gray-700 mb-2">Ambient Sound</div>
                    <div className="text-xs text-gray-500 mb-3">
                      Plays while in this cluster
                    </div>

                    {cluster.sound?.file ? (
                      <>
                        <div className="mb-3 p-2 bg-gray-100 rounded text-xs text-gray-700 truncate">
                          🔊 {cluster.sound.file.split('/').pop()?.substring(0, 20) || 'Sound assigned'}
                        </div>

                        <div className="mb-3">
                          <label className="text-xs text-gray-600 block mb-1">
                            Volume: {Math.round((cluster.sound.volume ?? 0.5) * 100)}%
                          </label>
                          <input
                            type="range"
                            min="0.1"
                            max="1"
                            step="0.1"
                            value={cluster.sound.volume ?? 0.5}
                            onChange={(e) => {
                              // Keep same sound, update volume
                              const newVolume = parseFloat(e.target.value);
                              // We need to get the assetId - this is a simplification
                              // In reality, we'd store assetId separately
                              onSetClusterSound(cluster.id, cluster.sound?.file || null, newVolume);
                            }}
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>

                        <button
                          onClick={() => {
                            onSetClusterSound(cluster.id, null);
                            setShowSoundSettings(false);
                          }}
                          className="w-full px-2 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600"
                        >
                          Remove Sound
                        </button>
                      </>
                    ) : (
                      <div className="text-xs text-gray-500">
                        {(() => {
                          const audioAssets = assets.filter(a => a.type === 'audio');
                          if (audioAssets.length === 0) {
                            return (
                              <div className="py-4 text-center">
                                <div className="mb-2">No audio files available</div>
                                <div className="text-gray-400">
                                  Add audio files in the Asset Manager first
                                </div>
                              </div>
                            );
                          }
                          return (
                            <div>
                              <div className="mb-2 text-gray-600">Select a sound:</div>
                              <div className="grid grid-cols-1 gap-1 max-h-32 overflow-y-auto">
                                {audioAssets.map((asset) => (
                                  <button
                                    key={asset.id}
                                    onClick={() => {
                                      onSetClusterSound(cluster.id, asset.id, 0.5);
                                      setShowSoundSettings(false);
                                    }}
                                    className="p-2 rounded hover:bg-purple-100 transition-colors text-left"
                                    title={asset.name || asset.id}
                                  >
                                    <div className="flex items-center gap-2">
                                      <span>🔊</span>
                                      <span className="truncate">{asset.name || asset.id}</span>
                                    </div>
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

            {/* Shared visuals button */}
            {onSetClusterSharedVisuals && (
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowSharedVisualsSettings(!showSharedVisualsSettings);
                  }}
                  className={`w-6 h-6 rounded shadow-sm transition-colors flex items-center justify-center text-xs ${
                    cluster.sharedVisuals?.locations?.length ? 'bg-teal-500 text-white hover:bg-teal-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                  title="Shared visuals (inherited by all beats)"
                >
                  👁
                </button>

                {/* Shared visuals settings popover */}
                {showSharedVisualsSettings && (
                  <div
                    className="absolute top-8 right-0 bg-white rounded-lg shadow-xl border border-gray-200 p-3 z-50 min-w-[220px]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="text-sm font-medium text-gray-700 mb-2">Shared Visual Content</div>
                    <div className="text-xs text-gray-500 mb-3">
                      Elements shared by all beats in this cluster
                    </div>

                    {cluster.sharedVisuals?.locations?.length ? (
                      <>
                        <div className="mb-3 p-2 bg-gray-100 rounded text-xs text-gray-700">
                          {cluster.sharedVisuals.locations.length} shared element{cluster.sharedVisuals.locations.length !== 1 ? 's' : ''}
                          {cluster.sharedVisuals.background && ' + background'}
                        </div>

                        <button
                          onClick={() => {
                            onSetClusterSharedVisuals(cluster.id, undefined);
                            setShowSharedVisualsSettings(false);
                          }}
                          className="w-full px-2 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600"
                        >
                          Clear Shared Visuals
                        </button>
                      </>
                    ) : (
                      <div className="text-xs text-gray-500 py-4 text-center">
                        <div className="mb-2">No shared visuals</div>
                        <div className="text-gray-400">
                          Use the Visual Editor to add shared elements when editing a beat in this cluster
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="w-px h-4 bg-gray-300 mx-1" />

            {/* "+ Beat" button removed — single-type beat creation didn't
                make sense in practice. Authors add beats via the sidebar
                palette and either drop them onto a cluster from the
                flowchart or assign them via the cluster folder in the
                sidebar. */}
            <button
              onClick={handleRemove}
              className="w-6 h-6 bg-red-500 text-white rounded shadow hover:bg-red-600 transition-colors flex items-center justify-center text-sm"
              title="Delete cluster"
            >
              ×
            </button>
          </div>
        </div>

        {/* Content area — pure backdrop. The beats over this area are
            sibling ReactFlow nodes, not children of this DOM tree. */}
        <div
          className={`relative overflow-hidden ${isDragOver ? 'bg-green-50' : 'bg-gray-50'}`}
          style={{
            height: contentHeight,
            backgroundImage: mapAssetUrl ? 'none' : 'radial-gradient(circle, #d1d5db 1px, transparent 1px)',
            backgroundSize: '20px 20px',
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
                backgroundSize: '20px 20px',
                zIndex: 1,
              }}
            />
          )}

          {/* Empty state */}
          {containedBeatCount === 0 && (
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

          {/* Resize Handle */}
          <div
            className="nodrag absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
            style={{
              background: 'linear-gradient(135deg, transparent 50%, #6366f1 50%)',
              borderBottomRightRadius: '0.5rem',
              zIndex: 2,
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
