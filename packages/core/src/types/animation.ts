/**
 * Animation System Type Definitions
 *
 * Defines data structures for the animation path system that allows
 * positioned elements to move along defined paths with bezier curves.
 */

/**
 * Control point for bezier curve interpolation
 */
export interface ControlPoint {
  x: number;
  y: number;
}

/**
 * A waypoint along an animation path
 *
 * Represents a point in space and time that an element moves through.
 * Supports bezier curves via control points.
 */
export interface AnimationWaypoint {
  /** X position of waypoint */
  x: number;

  /** Y position of waypoint */
  y: number;

  /** First bezier control point (for curve before this waypoint) */
  controlPoint1?: ControlPoint;

  /** Second bezier control point (for curve after this waypoint) */
  controlPoint2?: ControlPoint;

  /** Time in ms to reach this waypoint from previous waypoint */
  duration: number;

  /** Easing function for movement to this waypoint (CSS easing string) */
  easing?: string;

  // Transform properties:

  /** Scale factor at this waypoint (1 = 100%) */
  scale?: number;

  /** Rotation in degrees at this waypoint */
  rotation?: number;

  /** Opacity at this waypoint (0-1) */
  opacity?: number;

  /** Flip horizontally (for sprite direction changes) */
  flipX?: boolean;

  /** Flip vertically */
  flipY?: boolean;
}

/**
 * An animation path that defines how an element moves over time
 *
 * Contains all waypoints and metadata for animating a positioned element.
 * Supports both linear and bezier curve interpolation.
 */
export interface AnimationPath {
  /** Unique identifier for this animation */
  id: string;

  /** Human-readable name for this animation */
  name: string;

  /** ID of the element that this animation applies to */
  elementId: string;

  /** Interpolation type for the path */
  type: 'bezier' | 'linear';

  /** Ordered list of waypoints defining the path */
  waypoints: AnimationWaypoint[];

  /** Total duration of animation in milliseconds */
  duration: number;

  /** Global easing function (CSS easing string, can be overridden per waypoint) */
  easing?: string;

  /** Whether animation should loop continuously */
  loop?: boolean;

  /** Whether animation should start automatically when beat loads */
  autoPlay?: boolean;

  /** Trigger condition for starting animation */
  trigger?: 'onLoad' | 'onClick' | 'onVariable';

  /** Variable name to monitor if trigger is 'onVariable' */
  triggerVariable?: string;

  /** Variable value that triggers animation if trigger is 'onVariable' */
  triggerValue?: any;
}

/**
 * State of an animation during playback
 */
export interface AnimationState {
  /** Animation being played */
  animation: AnimationPath;

  /** Current playback time in ms */
  currentTime: number;

  /** Whether animation is currently playing */
  isPlaying: boolean;

  /** Whether animation is paused */
  isPaused: boolean;

  /** Whether animation has completed */
  isCompleted: boolean;

  /** Current waypoint index */
  currentWaypointIndex: number;

  /** Current interpolated position */
  currentPosition: { x: number; y: number };

  /** Current transform properties */
  currentTransform?: {
    scale?: number;
    rotation?: number;
    opacity?: number;
    flipX?: boolean;
    flipY?: boolean;
  };
}

/**
 * Options for playing an animation
 */
export interface AnimationPlayOptions {
  /** Start time in ms (default: 0) */
  startTime?: number;

  /** Playback speed multiplier (default: 1.0) */
  speed?: number;

  /** Callback when animation completes */
  onComplete?: () => void;

  /** Callback for each frame with current state */
  onUpdate?: (state: AnimationState) => void;
}
