/**
 * Animation System Type Definitions
 *
 * Defines data structures for the animation path system that allows
 * positioned elements to move along defined paths with bezier curves.
 */

/**
 * Control point for bezier curve interpolation.
 *
 * `x` / `y` are pixel positions on the authored stage; `xPercent` /
 * `yPercent` are layout-agnostic equivalents (percent of stage size,
 * 0–100) used by the responsive renderer so the curve survives a
 * viewport / orientation change. Both can be populated — the
 * migrator fills percent from pixel when going Fixed → Responsive.
 */
export interface ControlPoint {
  x: number;
  y: number;
  xPercent?: number;
  yPercent?: number;
}

/**
 * A waypoint along an animation path
 *
 * Represents a point in space and time that an element moves through.
 * Supports bezier curves via control points.
 *
 * Coordinate fields:
 * - `x` / `y` — pixel position on the authored stage. Canonical in
 *   fixed-canvas mode; the legacy editor still writes these.
 * - `xPercent` / `yPercent` — percent of stage width/height (0–100),
 *   used by the responsive renderer so the path tracks the live
 *   stage box at any viewport. Populated by the Fixed → Responsive
 *   migrator and by the responsive editor.
 * Both forms can coexist on the same waypoint; renderers should
 * prefer percent when set and fall back to pixel x/y.
 */
export interface AnimationWaypoint {
  /** X position of waypoint (pixels on the authored stage). */
  x: number;

  /** Y position of waypoint (pixels on the authored stage). */
  y: number;

  /** Percent of stage width (0–100). Optional. */
  xPercent?: number;

  /** Percent of stage height (0–100). Optional. */
  yPercent?: number;

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

  // Sprite animation properties:

  /** Name of a predefined sprite animation to play during movement to this waypoint */
  spriteAnimation?: string;

  /** Specific frame indices from sprite sheet to cycle through during movement */
  spriteFrames?: number[];

  /** Duration per frame in ms when cycling through spriteFrames (default: 100) */
  spriteFrameDuration?: number;
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

  /**
   * ID of the element that triggers this animation when clicked (for trigger='onClick').
   * If not specified, clicking the animated element itself triggers the animation.
   * This allows clicking element A (e.g., a door hotspot) to animate element B (e.g., avatar).
   */
  triggerElementId?: string;

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
    /** Current sprite animation name (from waypoint) */
    spriteAnimation?: string;
    /** Current sprite frames to cycle (from waypoint) */
    spriteFrames?: number[];
    /** Frame duration in ms (from waypoint) */
    spriteFrameDuration?: number;
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

  /**
   * Stage size for responsive resolution. When supplied AND a
   * waypoint carries `xPercent` / `yPercent`, the engine scales those
   * percent values against this width/height each frame so the path
   * tracks the responsive layout. A function form re-reads the size
   * on every tick (so resize / orientation flips track live);
   * passing an object snapshots the size at play-time.
   */
  stage?:
    | { width: number; height: number }
    | (() => { width: number; height: number } | null);
}
