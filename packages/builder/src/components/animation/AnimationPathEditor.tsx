import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { AnimationPath, AnimationWaypoint } from '@asaps/core';
import { PathCanvas, type StageElement } from './PathCanvas';
import { WaypointList } from './WaypointList';
import { Play, Pause, RotateCcw, Save, X } from 'lucide-react';
import type { Character, SpriteAnimation } from '../../types/character';

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

/** Visual element from the stage (simplified for animation editor) */
interface VisualElement {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  imageUrl?: string;
  assetUrl?: string;
  characterId?: string; // For character elements, links to Character definition
}

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

  /** Visual elements on the stage */
  elements?: VisualElement[];

  /** Characters for spritesheet animation data */
  characters?: Character[];

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
  elements = [],
  characters = [],
  onSave,
  onClose,
}) => {
  // Find the target element and its character's spritesheet data
  // Support both id-based (new) and name-based (old) lookups
  const targetElement = useMemo(() => {
    return elements.find(el => el.id === elementId || el.name === elementId);
  }, [elements, elementId]);

  const spriteSheet = useMemo(() => {
    if (!targetElement?.characterId) return undefined;
    const character = characters.find(c => c.id === targetElement.characterId);
    return character?.visual?.spriteSheet;
  }, [targetElement, characters]);

  // Load spritesheet image dimensions for auto-cycle animation
  const [spriteImageDims, setSpriteImageDims] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (!spriteSheet?.url) {
      setSpriteImageDims(null);
      return;
    }

    const img = new Image();
    img.onload = () => {
      setSpriteImageDims({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      setSpriteImageDims(null);
    };
    img.src = spriteSheet.url;
  }, [spriteSheet?.url]);

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
  const [previewPosition, setPreviewPosition] = useState<{
    x: number;
    y: number;
    flipX?: boolean;
    flipY?: boolean;
    scale?: number;
    rotation?: number;
    opacity?: number;
  } | null>(null);
  const [currentSpriteFrame, setCurrentSpriteFrame] = useState<number | null>(null);

  // Get the default animation for path playback (prefer "walk" or first available)
  // If no animations are defined, create a fallback that cycles through all frames
  const activeAnimation = useMemo((): SpriteAnimation | undefined => {
    if (spriteSheet?.animations?.length) {
      // Look for common movement animation names
      const walkAnim = spriteSheet.animations.find(
        a => a.name.toLowerCase() === 'walk' ||
             a.name.toLowerCase() === 'walking' ||
             a.name.toLowerCase() === 'run' ||
             a.name.toLowerCase() === 'move'
      );
      return walkAnim || spriteSheet.animations[0];
    }

    // Fallback: if no animations defined but we have a spritesheet, cycle all frames
    if (spriteSheet && spriteSheet.frameWidth > 0 && spriteSheet.frameHeight > 0 && spriteImageDims) {
      const cols = Math.floor(spriteImageDims.width / spriteSheet.frameWidth);
      const rows = Math.floor(spriteImageDims.height / spriteSheet.frameHeight);
      const totalFrames = cols * rows;
      if (totalFrames > 1) {
        // Create a synthetic animation that cycles all frames
        const frames = Array.from({ length: totalFrames }, (_, i) => i);
        return {
          name: '_auto_cycle',
          frames,
          frameDuration: 100, // 10 FPS default
          loop: true,
        };
      }
    }

    return undefined;
  }, [spriteSheet, spriteImageDims]);

  // Calculate total duration from waypoints
  // Note: The first waypoint (index 0) is the starting position - its duration is NOT used.
  // Each subsequent waypoint's duration defines how long it takes to travel TO that waypoint.
  // So we sum durations from waypoints[1] to waypoints[n-1].
  useEffect(() => {
    const totalDuration = animation.waypoints.slice(1).reduce(
      (sum, waypoint) => sum + waypoint.duration,
      0
    );
    if (totalDuration !== animation.duration) {
      setAnimation((prev) => ({ ...prev, duration: totalDuration }));
    }
  }, [animation.waypoints, animation.duration]);

  // Ref to track the start time for animation playback
  const startTimeRef = useRef<number>(0);
  const currentTimeRef = useRef<number>(0);

  // Keep currentTimeRef in sync with currentTime state
  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  // Animation preview playback
  useEffect(() => {
    if (!isPlaying || animation.waypoints.length === 0) {
      return;
    }

    // Capture animation data in local variables to avoid stale closures
    const waypoints = animation.waypoints;
    const duration = animation.duration;
    const animationType = animation.type;
    const loop = animation.loop;

    // Capture sprite animation data for frame cycling
    const spriteAnim = activeAnimation;

    // Don't animate if duration is 0 or invalid
    if (duration <= 0) {
      console.warn('[AnimationPathEditor] Animation duration is 0, cannot play');
      setIsPlaying(false);
      return;
    }

    console.log('[AnimationPathEditor] Starting animation playback', { duration, waypointCount: waypoints.length });

    // Cubic bezier helper - defined here to avoid closure issues
    const bezier = (t: number, p0: number, p1: number, p2: number, p3: number): number => {
      const oneMinusT = 1 - t;
      return oneMinusT * oneMinusT * oneMinusT * p0 +
             3 * oneMinusT * oneMinusT * t * p1 +
             3 * oneMinusT * t * t * p2 +
             t * t * t * p3;
    };

    // Calculate position at time - defined here to avoid closure issues
    // Also returns spriteAnimation and transform properties from the current waypoint
    type PositionResult = {
      x: number;
      y: number;
      flipX?: boolean;
      flipY?: boolean;
      scale?: number;
      rotation?: number;
      opacity?: number;
      spriteAnimation?: string;
    };

    const getPositionAtTime = (time: number): PositionResult => {
      if (waypoints.length === 0) return { x: 0, y: 0 };
      if (waypoints.length === 1) {
        const wp = waypoints[0];
        return {
          x: wp.x,
          y: wp.y,
          flipX: wp.flipX,
          flipY: wp.flipY,
          scale: wp.scale,
          rotation: wp.rotation,
          opacity: wp.opacity,
          spriteAnimation: wp.spriteAnimation,
        };
      }

      let accumulatedTime = 0;
      for (let i = 0; i < waypoints.length - 1; i++) {
        const curr = waypoints[i];
        const next = waypoints[i + 1];
        const segmentDuration = next.duration;

        if (time <= accumulatedTime + segmentDuration) {
          const progress = segmentDuration > 0 ? (time - accumulatedTime) / segmentDuration : 0;

          // Use flip settings and spriteAnimation from current waypoint (they apply until the next waypoint)
          const flipX = curr.flipX;
          const flipY = curr.flipY;
          const spriteAnimation = curr.spriteAnimation;

          // Interpolate scale, rotation, opacity
          const currScale = curr.scale ?? 1;
          const nextScale = next.scale ?? 1;
          const scale = currScale + (nextScale - currScale) * progress;

          const currRotation = curr.rotation ?? 0;
          const nextRotation = next.rotation ?? 0;
          const rotation = currRotation + (nextRotation - currRotation) * progress;

          const currOpacity = curr.opacity ?? 1;
          const nextOpacity = next.opacity ?? 1;
          const opacity = currOpacity + (nextOpacity - currOpacity) * progress;

          if (animationType === 'bezier' && curr.controlPoint2 && next.controlPoint1) {
            return {
              x: bezier(progress, curr.x, curr.controlPoint2.x, next.controlPoint1.x, next.x),
              y: bezier(progress, curr.y, curr.controlPoint2.y, next.controlPoint1.y, next.y),
              flipX,
              flipY,
              scale,
              rotation,
              opacity,
              spriteAnimation,
            };
          }
          return {
            x: curr.x + (next.x - curr.x) * progress,
            y: curr.y + (next.y - curr.y) * progress,
            flipX,
            flipY,
            scale,
            rotation,
            opacity,
            spriteAnimation,
          };
        }
        accumulatedTime += segmentDuration;
      }
      const last = waypoints[waypoints.length - 1];
      // Animation complete - no sprite animation
      return {
        x: last.x,
        y: last.y,
        flipX: last.flipX,
        flipY: last.flipY,
        scale: last.scale,
        rotation: last.rotation,
        opacity: last.opacity,
        spriteAnimation: undefined,
      };
    };

    let animationFrameId: number;
    let frameCount = 0;
    startTimeRef.current = Date.now() - currentTimeRef.current;

    // Track current sprite animation name to detect changes
    let currentSpriteAnimName: string | undefined = undefined;
    let spriteAnimStartTime = Date.now();

    const animate = () => {
      const now = Date.now();
      const elapsed = now - startTimeRef.current;
      frameCount++;

      // Debug logging every 30 frames
      if (frameCount % 30 === 1) {
        console.log('[AnimationPathEditor] Frame', frameCount, { elapsed, duration, startTime: startTimeRef.current, now });
      }

      if (elapsed >= duration) {
        console.log('[AnimationPathEditor] Animation complete', { elapsed, duration });
        if (loop) {
          startTimeRef.current = Date.now();
          setCurrentTime(0);
          setPreviewPosition(getPositionAtTime(0));
          currentSpriteAnimName = undefined; // Reset for loop
        } else {
          setIsPlaying(false);
          setCurrentTime(duration);
          setPreviewPosition(getPositionAtTime(duration));
          setCurrentSpriteFrame(null); // Reset to default frame when stopped
          return;
        }
      } else {
        const pos = getPositionAtTime(elapsed);
        setCurrentTime(elapsed);
        setPreviewPosition(pos);

        // Get sprite animation for current segment from waypoint
        const waypointSpriteAnim = pos.spriteAnimation;

        // Find the animation data from spriteSheet
        let spriteAnimData: SpriteAnimation | undefined;
        if (waypointSpriteAnim && spriteSheet?.animations) {
          spriteAnimData = spriteSheet.animations.find(a => a.name === waypointSpriteAnim);
        }
        // Fall back to default animation if waypoint doesn't specify one
        if (!spriteAnimData && spriteAnim) {
          spriteAnimData = spriteAnim;
        }

        // Calculate sprite frame if we have a sprite animation
        if (spriteAnimData && spriteAnimData.frames.length > 0) {
          // Reset sprite animation timing when animation changes
          if (waypointSpriteAnim !== currentSpriteAnimName) {
            currentSpriteAnimName = waypointSpriteAnim;
            spriteAnimStartTime = now;
          }

          const spriteElapsed = now - spriteAnimStartTime;
          const frameDuration = spriteAnimData.frameDuration || 100;
          const numFrames = spriteAnimData.frames.length;
          const frameIdx = Math.floor(spriteElapsed / frameDuration) % numFrames;
          const actualFrame = spriteAnimData.frames[frameIdx];
          setCurrentSpriteFrame(actualFrame);
        } else {
          setCurrentSpriteFrame(null);
        }
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    console.log('[AnimationPathEditor] Starting animation loop');
    animationFrameId = requestAnimationFrame(animate);

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isPlaying, animation.waypoints, animation.duration, animation.loop, animation.type, activeAnimation]);

  // Cubic bezier interpolation helper
  // B(t) = (1-t)³P0 + 3(1-t)²tP1 + 3(1-t)t²P2 + t³P3
  const cubicBezier = (
    t: number,
    p0: number,
    p1: number,
    p2: number,
    p3: number
  ): number => {
    const oneMinusT = 1 - t;
    const oneMinusT2 = oneMinusT * oneMinusT;
    const oneMinusT3 = oneMinusT2 * oneMinusT;
    const t2 = t * t;
    const t3 = t2 * t;
    return oneMinusT3 * p0 + 3 * oneMinusT2 * t * p1 + 3 * oneMinusT * t2 * p2 + t3 * p3;
  };

  // Calculate element position at a given time (for timeline scrubbing)
  const calculatePositionAtTime = (time: number): {
    x: number;
    y: number;
    flipX?: boolean;
    flipY?: boolean;
    scale?: number;
    rotation?: number;
    opacity?: number;
  } => {
    if (animation.waypoints.length === 0) {
      return { x: 0, y: 0 };
    }

    if (animation.waypoints.length === 1) {
      const wp = animation.waypoints[0];
      return {
        x: wp.x,
        y: wp.y,
        flipX: wp.flipX,
        flipY: wp.flipY,
        scale: wp.scale,
        rotation: wp.rotation,
        opacity: wp.opacity,
      };
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

        // Use flip settings from current waypoint
        const flipX = currentWaypoint.flipX;
        const flipY = currentWaypoint.flipY;

        // Interpolate scale, rotation, opacity
        const currScale = currentWaypoint.scale ?? 1;
        const nextScale = nextWaypoint.scale ?? 1;
        const scale = currScale + (nextScale - currScale) * segmentProgress;

        const currRotation = currentWaypoint.rotation ?? 0;
        const nextRotation = nextWaypoint.rotation ?? 0;
        const rotation = currRotation + (nextRotation - currRotation) * segmentProgress;

        const currOpacity = currentWaypoint.opacity ?? 1;
        const nextOpacity = nextWaypoint.opacity ?? 1;
        const opacity = currOpacity + (nextOpacity - currOpacity) * segmentProgress;

        // Use bezier interpolation if animation type is bezier and control points exist
        if (
          animation.type === 'bezier' &&
          currentWaypoint.controlPoint2 &&
          nextWaypoint.controlPoint1
        ) {
          // Cubic bezier curve:
          // P0 = current waypoint (start)
          // P1 = current waypoint's outgoing control (controlPoint2)
          // P2 = next waypoint's incoming control (controlPoint1)
          // P3 = next waypoint (end)
          return {
            x: cubicBezier(
              segmentProgress,
              currentWaypoint.x,
              currentWaypoint.controlPoint2.x,
              nextWaypoint.controlPoint1.x,
              nextWaypoint.x
            ),
            y: cubicBezier(
              segmentProgress,
              currentWaypoint.y,
              currentWaypoint.controlPoint2.y,
              nextWaypoint.controlPoint1.y,
              nextWaypoint.y
            ),
            flipX,
            flipY,
            scale,
            rotation,
            opacity,
          };
        }

        // Fall back to linear interpolation
        return {
          x: currentWaypoint.x + (nextWaypoint.x - currentWaypoint.x) * segmentProgress,
          y: currentWaypoint.y + (nextWaypoint.y - currentWaypoint.y) * segmentProgress,
          flipX,
          flipY,
          scale,
          rotation,
          opacity,
        };
      }

      accumulatedTime += segmentDuration;
    }

    // Past the end - return last waypoint
    const lastWaypoint = animation.waypoints[animation.waypoints.length - 1];
    return {
      x: lastWaypoint.x,
      y: lastWaypoint.y,
      flipX: lastWaypoint.flipX,
      flipY: lastWaypoint.flipY,
      scale: lastWaypoint.scale,
      rotation: lastWaypoint.rotation,
      opacity: lastWaypoint.opacity,
    };
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
    setCurrentSpriteFrame(null);
  };

  const handleSave = () => {
    onSave(animation);
  };

  // Ref to track if timeline change is from user interaction
  const isUserScrubbing = useRef(false);

  const handleTimelineMouseDown = () => {
    isUserScrubbing.current = true;
    setIsPlaying(false);
  };

  const handleTimelineMouseUp = () => {
    isUserScrubbing.current = false;
  };

  const handleTimelineChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = Number(e.target.value);
    setCurrentTime(newTime);

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

              {/* Trigger Element selector - shown only for onClick trigger */}
              {animation.trigger === 'onClick' && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <label className="block text-gray-700 mb-1 text-sm">
                    Click Element (trigger)
                    <span className="ml-2 text-xs text-gray-500">
                      Which element to click to start the animation
                    </span>
                  </label>
                  <select
                    value={animation.triggerElementId || animation.elementId}
                    onChange={(e) =>
                      setAnimation({
                        ...animation,
                        triggerElementId: e.target.value === animation.elementId ? undefined : e.target.value,
                      })
                    }
                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                  >
                    {/* Option for animating element itself (default) */}
                    <option value={animation.elementId}>
                      {targetElement?.name || elementId} (animated element)
                    </option>
                    {/* Other elements on stage */}
                    {elements
                      .filter(el => (el.name || el.id) !== elementId)
                      .map(el => (
                        <option key={el.id} value={el.name || el.id}>
                          {el.name || el.id} ({el.type})
                        </option>
                      ))}
                  </select>
                </div>
              )}
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
                stageElements={elements.map(el => {
                  // Get sprite sheet data and URL for character elements
                  let elSpriteSheet = undefined;
                  let resolvedImageUrl = el.imageUrl || el.assetUrl;
                  // Support both id-based (new) and name-based (old) animation targeting
                  const isTarget = el.id === elementId || el.name === elementId;

                  if (el.characterId) {
                    const char = characters.find(c => c.id === el.characterId);
                    if (char?.visual?.type === 'sprite' && char.visual.spriteSheet) {
                      // For sprite characters, use the spriteSheet URL
                      resolvedImageUrl = char.visual.spriteSheet.url;
                      elSpriteSheet = {
                        frameWidth: char.visual.spriteSheet.frameWidth,
                        frameHeight: char.visual.spriteSheet.frameHeight,
                        defaultFrame: 0,
                        // Pass image dimensions for frame calculation
                        imageWidth: isTarget && spriteImageDims ? spriteImageDims.width : undefined,
                        // Pass current frame for animation target during playback
                        currentFrame: isTarget && currentSpriteFrame !== null ? currentSpriteFrame : undefined,
                        // Pass animations for PathCanvas to reference
                        animations: char.visual.spriteSheet.animations?.map(a => ({
                          name: a.name,
                          frames: a.frames,
                          frameDuration: a.frameDuration,
                          loop: a.loop,
                        })),
                        activeAnimation: isTarget && isPlaying && activeAnimation ? activeAnimation.name : undefined,
                      };
                    }
                  }

                  return {
                    id: el.name || el.id, // Use element name (stable) for animation targeting
                    type: el.type,
                    x: el.x,
                    y: el.y,
                    width: elSpriteSheet ? elSpriteSheet.frameWidth : el.width,
                    height: elSpriteSheet ? elSpriteSheet.frameHeight : el.height,
                    label: el.name || el.type,
                    text: el.text,
                    imageUrl: resolvedImageUrl,
                    isAnimationTarget: isTarget,
                    spriteSheet: elSpriteSheet,
                  };
                })}
                animationTargetId={elementId}
                previewPosition={previewPosition}
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
                    onMouseDown={handleTimelineMouseDown}
                    onMouseUp={handleTimelineMouseUp}
                    onTouchStart={handleTimelineMouseDown}
                    onTouchEnd={handleTimelineMouseUp}
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
              elementPosition={targetElement ? { x: targetElement.x, y: targetElement.y } : undefined}
              spriteSheet={spriteSheet}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
