import React, { useState, useEffect } from 'react';
import type { AnimationPath, AnimationWaypoint } from '@asaps/core';
import { PathCanvas } from './PathCanvas';
import { WaypointList } from './WaypointList';
import { Play, Pause, RotateCcw, Save, X } from 'lucide-react';

/**
 * AnimationPathEditor - Main editor for creating and editing animation paths
 *
 * Features:
 * - Visual path editing with PathCanvas
 * - Waypoint list and property editing
 * - Timeline scrubber for preview
 * - Play/pause animation preview
 * - Save/cancel actions
 */

interface AnimationPathEditorProps {
  /** Animation being edited (or null for new animation) */
  animation: AnimationPath | null;

  /** ID of the element being animated */
  elementId: string;

  /** Stage dimensions */
  stageWidth: number;
  stageHeight: number;

  /** Background image for reference */
  backgroundUrl?: string;

  /** Callback when animation is saved */
  onSave: (animation: AnimationPath) => void;

  /** Callback when editor is closed */
  onClose: () => void;
}

export const AnimationPathEditor: React.FC<AnimationPathEditorProps> = ({
  animation: initialAnimation,
  elementId,
  stageWidth,
  stageHeight,
  backgroundUrl,
  onSave,
  onClose,
}) => {
  // Initialize or create new animation
  const [animation, setAnimation] = useState<AnimationPath>(() => {
    if (initialAnimation) {
      return initialAnimation;
    }

    // Create new animation with default values
    return {
      id: `anim-${Date.now()}`,
      name: `Animation ${Date.now()}`,
      elementId,
      type: 'bezier',
      waypoints: [],
      duration: 0,
      loop: false,
      autoPlay: true,
      trigger: 'onLoad',
    };
  });

  const [selectedWaypointIndex, setSelectedWaypointIndex] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [previewPosition, setPreviewPosition] = useState<{ x: number; y: number } | null>(null);

  // Calculate total duration from waypoints
  useEffect(() => {
    const totalDuration = animation.waypoints.reduce(
      (sum, waypoint) => sum + waypoint.duration,
      0
    );
    if (totalDuration !== animation.duration) {
      setAnimation((prev) => ({ ...prev, duration: totalDuration }));
    }
  }, [animation.waypoints, animation.duration]);

  // Animation preview playback
  useEffect(() => {
    if (!isPlaying || animation.waypoints.length === 0) {
      return;
    }

    let animationFrameId: number;
    let startTime = Date.now() - currentTime;

    const animate = () => {
      const elapsed = Date.now() - startTime;

      if (elapsed >= animation.duration) {
        if (animation.loop) {
          // Loop back to start
          startTime = Date.now();
          setCurrentTime(0);
        } else {
          // Stop at end
          setIsPlaying(false);
          setCurrentTime(animation.duration);
          return;
        }
      } else {
        setCurrentTime(elapsed);
      }

      // Calculate preview position
      const position = calculatePositionAtTime(elapsed);
      setPreviewPosition(position);

      animationFrameId = requestAnimationFrame(animate);
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isPlaying, animation.waypoints, animation.duration, animation.loop, currentTime]);

  // Calculate element position at a given time
  const calculatePositionAtTime = (time: number): { x: number; y: number } => {
    if (animation.waypoints.length === 0) {
      return { x: 0, y: 0 };
    }

    if (animation.waypoints.length === 1) {
      return { x: animation.waypoints[0].x, y: animation.waypoints[0].y };
    }

    // Find which segment we're in
    let accumulatedTime = 0;
    for (let i = 0; i < animation.waypoints.length - 1; i++) {
      const nextWaypoint = animation.waypoints[i + 1];
      const segmentDuration = nextWaypoint.duration;

      if (time <= accumulatedTime + segmentDuration) {
        // We're in this segment
        const segmentProgress = (time - accumulatedTime) / segmentDuration;
        const currentWaypoint = animation.waypoints[i];

        // Linear interpolation for now (bezier interpolation will be in Phase 4.4)
        return {
          x: currentWaypoint.x + (nextWaypoint.x - currentWaypoint.x) * segmentProgress,
          y: currentWaypoint.y + (nextWaypoint.y - currentWaypoint.y) * segmentProgress,
        };
      }

      accumulatedTime += segmentDuration;
    }

    // Past the end - return last waypoint
    const lastWaypoint = animation.waypoints[animation.waypoints.length - 1];
    return { x: lastWaypoint.x, y: lastWaypoint.y };
  };

  const handlePlayPause = () => {
    if (isPlaying) {
      setIsPlaying(false);
    } else {
      if (currentTime >= animation.duration) {
        setCurrentTime(0);
      }
      setIsPlaying(true);
    }
  };

  const handleReset = () => {
    setIsPlaying(false);
    setCurrentTime(0);
    setPreviewPosition(null);
  };

  const handleSave = () => {
    onSave(animation);
  };

  const handleTimelineChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = Number(e.target.value);
    setCurrentTime(newTime);
    setIsPlaying(false);

    // Update preview position
    const position = calculatePositionAtTime(newTime);
    setPreviewPosition(position);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl w-[90vw] h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
          <div className="flex-1">
            <input
              type="text"
              value={animation.name}
              onChange={(e) => setAnimation({ ...animation, name: e.target.value })}
              className="text-lg font-semibold bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-blue-500 px-2 py-1 rounded"
              placeholder="Animation name"
            />
            <div className="text-xs text-gray-500 mt-1 px-2">
              Element: {elementId} | Type: {animation.type} | Duration: {animation.duration}ms
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition"
            >
              <Save size={16} />
              Save
            </button>
            <button
              onClick={onClose}
              className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition"
            >
              <X size={16} />
              Cancel
            </button>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Canvas */}
          <div className="flex-1 flex flex-col p-4 overflow-auto">
            {/* Animation settings */}
            <div className="mb-4 p-3 bg-gray-50 rounded border border-gray-200">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <label className="block text-gray-700 mb-1">Type</label>
                  <select
                    value={animation.type}
                    onChange={(e) =>
                      setAnimation({ ...animation, type: e.target.value as 'bezier' | 'linear' })
                    }
                    className="w-full px-2 py-1 border border-gray-300 rounded"
                  >
                    <option value="linear">Linear</option>
                    <option value="bezier">Bezier</option>
                  </select>
                </div>

                <div>
                  <label className="block text-gray-700 mb-1">Trigger</label>
                  <select
                    value={animation.trigger || 'onLoad'}
                    onChange={(e) =>
                      setAnimation({
                        ...animation,
                        trigger: e.target.value as 'onLoad' | 'onClick' | 'onVariable',
                      })
                    }
                    className="w-full px-2 py-1 border border-gray-300 rounded"
                  >
                    <option value="onLoad">On Load</option>
                    <option value="onClick">On Click</option>
                    <option value="onVariable">On Variable</option>
                  </select>
                </div>

                <div className="flex items-center">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={animation.loop || false}
                      onChange={(e) => setAnimation({ ...animation, loop: e.target.checked })}
                      className="w-4 h-4"
                    />
                    <span className="text-gray-700">Loop</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Canvas */}
            <div className="flex-1 flex items-center justify-center">
              <PathCanvas
                width={stageWidth}
                height={stageHeight}
                animation={animation}
                backgroundUrl={backgroundUrl}
                onAnimationChange={setAnimation}
                selectedWaypointIndex={selectedWaypointIndex}
                onWaypointSelect={setSelectedWaypointIndex}
              />
            </div>

            {/* Timeline and playback controls */}
            <div className="mt-4 p-3 bg-gray-50 rounded border border-gray-200">
              <div className="flex items-center gap-3">
                {/* Playback buttons */}
                <button
                  onClick={handlePlayPause}
                  disabled={animation.waypoints.length < 2}
                  className="p-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition"
                >
                  {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                </button>

                <button
                  onClick={handleReset}
                  className="p-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition"
                >
                  <RotateCcw size={20} />
                </button>

                {/* Timeline slider */}
                <div className="flex-1">
                  <input
                    type="range"
                    min="0"
                    max={animation.duration || 1000}
                    value={currentTime}
                    onChange={handleTimelineChange}
                    disabled={animation.waypoints.length < 2}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>{currentTime}ms</span>
                    <span>{animation.duration}ms</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Waypoint list */}
          <div className="w-80 border-l border-gray-200 bg-gray-50">
            <WaypointList
              animation={animation}
              onAnimationChange={setAnimation}
              selectedWaypointIndex={selectedWaypointIndex}
              onWaypointSelect={setSelectedWaypointIndex}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
