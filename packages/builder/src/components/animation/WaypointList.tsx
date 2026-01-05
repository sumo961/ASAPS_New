import React from 'react';
import type { AnimationPath, AnimationWaypoint } from '@asaps/core';
import { Trash2, Plus, ChevronUp, ChevronDown } from 'lucide-react';

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
}) => {
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

                  {/* Duration */}
                  <div>
                    <label className="block text-gray-600 mb-1">
                      Duration (ms)
                      {index === 0 && (
                        <span className="ml-1 text-gray-400">(from start)</span>
                      )}
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
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
