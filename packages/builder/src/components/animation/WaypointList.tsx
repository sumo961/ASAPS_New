import React, { useState } from 'react';
import type { AnimationPath, AnimationWaypoint } from '@asaps/core';
import { Trash2, Plus, ChevronUp, ChevronDown, Film } from 'lucide-react';
import type { SpriteAnimation } from '../../types/character';

/** Spritesheet data for the target character */
interface SpriteSheetData {
  url: string;
  frameWidth: number;
  frameHeight: number;
  animations: SpriteAnimation[];
}

/**
 * WaypointList - List view and property editor for animation waypoints
 *
 * Features:
 * - List all waypoints with properties
 * - Edit waypoint timing and easing
 * - Add/remove waypoints
 * - Reorder waypoints
 */

interface WaypointListProps {
  /** Current animation path */
  animation: AnimationPath;

  /** Callback when animation is modified */
  onAnimationChange: (animation: AnimationPath) => void;

  /** Currently selected waypoint index */
  selectedWaypointIndex: number | null;

  /** Callback when waypoint selection changes */
  onWaypointSelect: (index: number | null) => void;

  /** Target element's initial position (for first waypoint default) */
  elementPosition?: { x: number; y: number };

  /** Spritesheet data for the target character (if applicable) */
  spriteSheet?: SpriteSheetData;
}

const EASING_OPTIONS = [
  { value: 'linear', label: 'Linear' },
  { value: 'ease', label: 'Ease' },
  { value: 'ease-in', label: 'Ease In' },
  { value: 'ease-out', label: 'Ease Out' },
  { value: 'ease-in-out', label: 'Ease In-Out' },
];

export const WaypointList: React.FC<WaypointListProps> = ({
  animation,
  onAnimationChange,
  selectedWaypointIndex,
  onWaypointSelect,
  elementPosition,
  spriteSheet,
}) => {
  // State for frame selector modal
  const [showFrameSelector, setShowFrameSelector] = useState<number | null>(null);
  const updateWaypoint = (index: number, updates: Partial<AnimationWaypoint>) => {
    const newWaypoints = [...animation.waypoints];
    newWaypoints[index] = { ...newWaypoints[index], ...updates };
    onAnimationChange({ ...animation, waypoints: newWaypoints });
  };

  const deleteWaypoint = (index: number) => {
    const newWaypoints = animation.waypoints.filter((_, i) => i !== index);
    onAnimationChange({ ...animation, waypoints: newWaypoints });

    // Update selection
    if (selectedWaypointIndex === index) {
      onWaypointSelect(null);
    } else if (selectedWaypointIndex !== null && selectedWaypointIndex > index) {
      onWaypointSelect(selectedWaypointIndex - 1);
    }
  };

  const moveWaypoint = (index: number, direction: 'up' | 'down') => {
    const newWaypoints = [...animation.waypoints];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= newWaypoints.length) return;

    // Swap waypoints
    [newWaypoints[index], newWaypoints[targetIndex]] = [
      newWaypoints[targetIndex],
      newWaypoints[index],
    ];

    onAnimationChange({ ...animation, waypoints: newWaypoints });

    // Update selection to follow the moved waypoint
    if (selectedWaypointIndex === index) {
      onWaypointSelect(targetIndex);
    } else if (selectedWaypointIndex === targetIndex) {
      onWaypointSelect(index);
    }
  };

  const addWaypoint = () => {
    const lastWaypoint = animation.waypoints[animation.waypoints.length - 1];
    // First waypoint uses element's position, subsequent waypoints offset from previous
    const defaultX = elementPosition?.x ?? 100;
    const defaultY = elementPosition?.y ?? 100;
    const newWaypoint: AnimationWaypoint = {
      x: lastWaypoint ? lastWaypoint.x + 50 : defaultX,
      y: lastWaypoint ? lastWaypoint.y : defaultY,
      duration: 1000,
    };

    // Add control points for bezier
    if (animation.type === 'bezier') {
      newWaypoint.controlPoint1 = { x: newWaypoint.x - 50, y: newWaypoint.y };
      newWaypoint.controlPoint2 = { x: newWaypoint.x + 50, y: newWaypoint.y };
    }

    const newWaypoints = [...animation.waypoints, newWaypoint];
    onAnimationChange({ ...animation, waypoints: newWaypoints });
    onWaypointSelect(newWaypoints.length - 1);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-200 bg-gray-50">
        <h3 className="text-sm font-semibold text-gray-700">
          Waypoints ({animation.waypoints.length})
        </h3>
        <button
          onClick={addWaypoint}
          className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition"
        >
          <Plus size={14} />
          Add
        </button>
      </div>

      {/* Waypoint list */}
      <div className="flex-1 overflow-y-auto">
        {animation.waypoints.length === 0 ? (
          <div className="p-4 text-center text-sm text-gray-500">
            No waypoints. Shift+Click on canvas to add.
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {animation.waypoints.map((waypoint, index) => (
              <div
                key={index}
                className={`p-3 hover:bg-gray-50 cursor-pointer transition ${
                  selectedWaypointIndex === index ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                }`}
                onClick={() => onWaypointSelect(index)}
              >
                {/* Waypoint header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-500 text-white text-xs font-bold">
                      {index + 1}
                    </span>
                    <span className="text-sm font-medium text-gray-700">
                      Waypoint {index + 1}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    {/* Move up */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        moveWaypoint(index, 'up');
                      }}
                      disabled={index === 0}
                      className="p-1 text-gray-600 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Move up"
                    >
                      <ChevronUp size={16} />
                    </button>

                    {/* Move down */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        moveWaypoint(index, 'down');
                      }}
                      disabled={index === animation.waypoints.length - 1}
                      className="p-1 text-gray-600 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Move down"
                    >
                      <ChevronDown size={16} />
                    </button>

                    {/* Delete */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteWaypoint(index);
                      }}
                      className="p-1 text-gray-600 hover:text-red-600"
                      title="Delete waypoint"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {/* Waypoint properties */}
                <div className="space-y-2 text-xs">
                  {/* Position */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-gray-600 mb-1">X</label>
                      <input
                        type="number"
                        value={Math.round(waypoint.x)}
                        onChange={(e) =>
                          updateWaypoint(index, { x: Number(e.target.value) })
                        }
                        onClick={(e) => e.stopPropagation()}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-600 mb-1">Y</label>
                      <input
                        type="number"
                        value={Math.round(waypoint.y)}
                        onChange={(e) =>
                          updateWaypoint(index, { y: Number(e.target.value) })
                        }
                        onClick={(e) => e.stopPropagation()}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                      />
                    </div>
                  </div>

                  {/* Duration - not shown for first waypoint since it's the starting position */}
                  {index > 0 && (
                    <div>
                      <label className="block text-gray-600 mb-1">
                        Duration (ms)
                        <span className="ml-1 text-gray-400">(to reach this point)</span>
                      </label>
                      <input
                        type="number"
                        value={waypoint.duration}
                        onChange={(e) =>
                          updateWaypoint(index, { duration: Number(e.target.value) })
                        }
                        onClick={(e) => e.stopPropagation()}
                        min="0"
                        step="100"
                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                      />
                    </div>
                  )}
                  {index === 0 && (
                    <div className="text-xs text-gray-400 italic">
                      Starting position (no duration)
                    </div>
                  )}

                  {/* Easing */}
                  <div>
                    <label className="block text-gray-600 mb-1">Easing</label>
                    <select
                      value={waypoint.easing || 'linear'}
                      onChange={(e) =>
                        updateWaypoint(index, { easing: e.target.value })
                      }
                      onClick={(e) => e.stopPropagation()}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                    >
                      {EASING_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Transform properties */}
                  <div className="pt-2 border-t border-gray-200 mt-2">
                    <div className="text-xs font-medium text-gray-500 mb-2">Transform</div>

                    {/* Scale and Rotation */}
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div>
                        <label className="block text-gray-600 mb-1">Scale</label>
                        <input
                          type="number"
                          value={waypoint.scale ?? 1}
                          onChange={(e) =>
                            updateWaypoint(index, { scale: Number(e.target.value) })
                          }
                          onClick={(e) => e.stopPropagation()}
                          min="0.1"
                          max="5"
                          step="0.1"
                          className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-gray-600 mb-1">Rotation</label>
                        <input
                          type="number"
                          value={waypoint.rotation ?? 0}
                          onChange={(e) =>
                            updateWaypoint(index, { rotation: Number(e.target.value) })
                          }
                          onClick={(e) => e.stopPropagation()}
                          min="-360"
                          max="360"
                          step="5"
                          className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                        />
                      </div>
                    </div>

                    {/* Opacity */}
                    <div className="mb-2">
                      <label className="block text-gray-600 mb-1">
                        Opacity ({Math.round((waypoint.opacity ?? 1) * 100)}%)
                      </label>
                      <input
                        type="range"
                        value={waypoint.opacity ?? 1}
                        onChange={(e) =>
                          updateWaypoint(index, { opacity: Number(e.target.value) })
                        }
                        onClick={(e) => e.stopPropagation()}
                        min="0"
                        max="1"
                        step="0.05"
                        className="w-full"
                      />
                    </div>

                    {/* Flip X/Y */}
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={waypoint.flipX ?? false}
                          onChange={(e) =>
                            updateWaypoint(index, { flipX: e.target.checked })
                          }
                          onClick={(e) => e.stopPropagation()}
                          className="w-3.5 h-3.5"
                        />
                        <span className="text-gray-600">Flip H</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={waypoint.flipY ?? false}
                          onChange={(e) =>
                            updateWaypoint(index, { flipY: e.target.checked })
                          }
                          onClick={(e) => e.stopPropagation()}
                          className="w-3.5 h-3.5"
                        />
                        <span className="text-gray-600">Flip V</span>
                      </label>
                    </div>
                  </div>

                  {/* Sprite Animation Section - only shown when spritesheet exists */}
                  {spriteSheet && (
                    <div className="pt-2 border-t border-gray-200 mt-2">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-2">
                        <Film size={12} />
                        <span>Sprite Animation</span>
                      </div>

                      {/* Predefined Animation Dropdown */}
                      {spriteSheet.animations.length > 0 && (
                        <div className="mb-2">
                          <label className="block text-gray-600 mb-1">Animation</label>
                          <select
                            value={waypoint.spriteAnimation || ''}
                            onChange={(e) => {
                              const animName = e.target.value || undefined;
                              // If selecting a predefined animation, clear custom frames
                              updateWaypoint(index, {
                                spriteAnimation: animName,
                                spriteFrames: animName ? undefined : waypoint.spriteFrames,
                              });
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                          >
                            <option value="">None / Custom</option>
                            {spriteSheet.animations.map((anim) => (
                              <option key={anim.name} value={anim.name}>
                                {anim.name} ({anim.frames.length} frames)
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Custom Frame Selection */}
                      {!waypoint.spriteAnimation && (
                        <div className="mb-2">
                          <label className="block text-gray-600 mb-1">Custom Frames</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={waypoint.spriteFrames?.join(', ') || ''}
                              onChange={(e) => {
                                const text = e.target.value;
                                if (!text.trim()) {
                                  updateWaypoint(index, { spriteFrames: undefined });
                                  return;
                                }
                                // Parse comma-separated frame indices
                                const frames = text
                                  .split(',')
                                  .map(s => parseInt(s.trim(), 10))
                                  .filter(n => !isNaN(n) && n >= 0);
                                updateWaypoint(index, { spriteFrames: frames.length > 0 ? frames : undefined });
                              }}
                              onClick={(e) => e.stopPropagation()}
                              placeholder="e.g., 0, 1, 2, 3"
                              className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs"
                            />
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowFrameSelector(index);
                              }}
                              className="px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 transition"
                              title="Select frames visually"
                            >
                              Pick
                            </button>
                          </div>
                          <div className="text-[10px] text-gray-400 mt-1">
                            Comma-separated frame indices, or use Pick button
                          </div>
                        </div>
                      )}

                      {/* Frame Duration */}
                      <div>
                        <label className="block text-gray-600 mb-1">
                          Frame Duration (ms)
                        </label>
                        <input
                          type="number"
                          value={waypoint.spriteFrameDuration ?? 100}
                          onChange={(e) =>
                            updateWaypoint(index, { spriteFrameDuration: Number(e.target.value) })
                          }
                          onClick={(e) => e.stopPropagation()}
                          min="16"
                          max="1000"
                          step="16"
                          className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Frame Selector Modal */}
      {showFrameSelector !== null && spriteSheet && (
        <FrameSelectorModal
          spriteSheet={spriteSheet}
          selectedFrames={animation.waypoints[showFrameSelector]?.spriteFrames || []}
          onConfirm={(frames) => {
            updateWaypoint(showFrameSelector, { spriteFrames: frames.length > 0 ? frames : undefined });
            setShowFrameSelector(null);
          }}
          onCancel={() => setShowFrameSelector(null)}
        />
      )}
    </div>
  );
};

/**
 * FrameSelectorModal - Visual frame selector for spritesheets
 */
interface FrameSelectorModalProps {
  spriteSheet: SpriteSheetData;
  selectedFrames: number[];
  onConfirm: (frames: number[]) => void;
  onCancel: () => void;
}

const FrameSelectorModal: React.FC<FrameSelectorModalProps> = ({
  spriteSheet,
  selectedFrames: initialSelectedFrames,
  onConfirm,
  onCancel,
}) => {
  const [selectedFrames, setSelectedFrames] = useState<number[]>(initialSelectedFrames);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });

  // Calculate number of frames based on image dimensions
  const framesPerRow = imageDimensions.width > 0 ? Math.floor(imageDimensions.width / spriteSheet.frameWidth) : 0;
  const totalRows = imageDimensions.height > 0 ? Math.floor(imageDimensions.height / spriteSheet.frameHeight) : 0;
  const totalFrames = framesPerRow * totalRows;

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    setImageLoaded(true);
  };

  const toggleFrame = (frameIndex: number) => {
    setSelectedFrames(prev => {
      if (prev.includes(frameIndex)) {
        return prev.filter(f => f !== frameIndex);
      } else {
        return [...prev, frameIndex].sort((a, b) => a - b);
      }
    });
  };

  const selectRange = (start: number, end: number) => {
    const frames = [];
    for (let i = Math.min(start, end); i <= Math.max(start, end); i++) {
      frames.push(i);
    }
    setSelectedFrames(frames);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-[60] flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-800">Select Sprite Frames</h3>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600"
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {/* Hidden image to get dimensions */}
          <img
            src={spriteSheet.url}
            alt="Spritesheet"
            onLoad={handleImageLoad}
            className="hidden"
          />

          {!imageLoaded ? (
            <div className="text-center text-gray-500 py-8">Loading spritesheet...</div>
          ) : (
            <>
              {/* Frame info */}
              <div className="text-sm text-gray-600 mb-3">
                {totalFrames} frames ({framesPerRow} per row) - Frame size: {spriteSheet.frameWidth}x{spriteSheet.frameHeight}px
              </div>

              {/* Quick actions */}
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => setSelectedFrames([])}
                  className="px-2 py-1 text-xs bg-gray-200 rounded hover:bg-gray-300"
                >
                  Clear All
                </button>
                <button
                  onClick={() => setSelectedFrames(Array.from({ length: totalFrames }, (_, i) => i))}
                  className="px-2 py-1 text-xs bg-gray-200 rounded hover:bg-gray-300"
                >
                  Select All
                </button>
                <input
                  type="text"
                  placeholder="Range (e.g., 0-5)"
                  className="px-2 py-1 text-xs border border-gray-300 rounded w-24"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const match = e.currentTarget.value.match(/(\d+)-(\d+)/);
                      if (match) {
                        selectRange(parseInt(match[1]), parseInt(match[2]));
                        e.currentTarget.value = '';
                      }
                    }
                  }}
                />
              </div>

              {/* Frame grid */}
              <div
                className="grid gap-1 max-h-[50vh] overflow-auto p-2 bg-gray-100 rounded"
                style={{
                  gridTemplateColumns: `repeat(${Math.min(framesPerRow, 10)}, 1fr)`,
                }}
              >
                {Array.from({ length: totalFrames }, (_, frameIndex) => {
                  const row = Math.floor(frameIndex / framesPerRow);
                  const col = frameIndex % framesPerRow;
                  const isSelected = selectedFrames.includes(frameIndex);
                  const orderIndex = selectedFrames.indexOf(frameIndex);

                  return (
                    <div
                      key={frameIndex}
                      onClick={() => toggleFrame(frameIndex)}
                      className={`relative cursor-pointer border-2 rounded overflow-hidden ${
                        isSelected ? 'border-blue-500 ring-2 ring-blue-300' : 'border-transparent hover:border-gray-400'
                      }`}
                      style={{
                        width: Math.min(60, spriteSheet.frameWidth),
                        height: Math.min(60, spriteSheet.frameHeight),
                      }}
                    >
                      {/* Frame image - use background-position to show the right frame */}
                      <div
                        className="w-full h-full"
                        style={{
                          backgroundImage: `url(${spriteSheet.url})`,
                          backgroundPosition: `-${col * spriteSheet.frameWidth}px -${row * spriteSheet.frameHeight}px`,
                          backgroundSize: `${imageDimensions.width}px ${imageDimensions.height}px`,
                          transform: `scale(${Math.min(60 / spriteSheet.frameWidth, 60 / spriteSheet.frameHeight)})`,
                          transformOrigin: 'top left',
                        }}
                      />
                      {/* Frame number */}
                      <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-60 text-white text-[8px] text-center">
                        {frameIndex}
                      </div>
                      {/* Selection order badge */}
                      {isSelected && orderIndex >= 0 && (
                        <div className="absolute top-0 right-0 bg-blue-500 text-white text-[8px] px-1 rounded-bl">
                          {orderIndex + 1}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Selected frames preview */}
              {selectedFrames.length > 0 && (
                <div className="mt-3 text-sm text-gray-600">
                  Selected ({selectedFrames.length}): {selectedFrames.join(', ')}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-200">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(selectedFrames)}
            className="px-4 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Confirm ({selectedFrames.length} frames)
          </button>
        </div>
      </div>
    </div>
  );
};
