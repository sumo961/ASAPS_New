/**
 * hotspot — normalized 0–1 clickable region on the SPATIAL layer (Phase 3c).
 *
 * Coordinates are RELATIVE to the spatial image's actual rendered rect —
 * i.e. when objectFit:'contain' letterboxes the image, the hotspot tracks
 * the IMAGE not the container. This makes a hotspot drawn on the original
 * authored canvas land on the same picture pixel at any viewport,
 * orientation, or device aspect ratio.
 *
 * The 2D analog of the existing panoramaHotspot (pitch/yaw on a 360°
 * sphere); kept distinct because the math is different (planar vs.
 * spherical projection) and panorama hotspots already work via PSV.
 *
 * Consumer beats: today, movementChoice (Phase 3c-2) is the first
 * consumer — each choice carries an optional hotspot so spatial maps
 * can be authored. Any future spatial-mode beat can read hotspots
 * the same way.
 */

export interface Hotspot {
  /** Stable id; the renderer fires onAction(id) when clicked. */
  id: string;
  /** Normalized 0–1 x of the top-left corner, relative to the IMAGE rect. */
  x: number;
  /** Normalized 0–1 y of the top-left corner. */
  y: number;
  /** Normalized 0–1 width. */
  width: number;
  /** Normalized 0–1 height. */
  height: number;
  /** Optional alt/label text — used for a11y and editor overlays. */
  label?: string;
  /**
   * Optional shape. 'rect' (default) is an axis-aligned rectangle;
   * 'ellipse' draws an oval inscribed in the same rect (clipping the
   * click area too). Authors get a softer interaction shape for round
   * elements without needing a separate coordinate system.
   */
  shape?: 'rect' | 'ellipse';
  /**
   * P3-3e — orientation-aware portrait override.
   *
   * The canonical x/y/width/height above is the LANDSCAPE rect. When the
   * runtime detects a portrait-oriented stage (container taller than
   * wide) AND this override is present, the renderer uses these values
   * instead. This lets a door that sits in the upper-right of a wide
   * shot move to the lower-right of the same scene's portrait crop
   * without the author needing two separate beats.
   *
   * Absent → the landscape values are used in both orientations
   * (existing behavior, zero regression).
   */
  portrait?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** Optional rotation in degrees, around the hotspot's center. */
  rotation?: number;
  /**
   * True when this hotspot was synthesized from a `kind:'prop'` location
   * during Fixed→Responsive migration. The rect overlays the prop image
   * so clicks still resolve, but the renderer skips the highlight tint
   * and outline — the prop IS the visual, no overlay needed.
   */
  fromProp?: boolean;
}

/** Defensive type guard. */
export function isHotspot(v: unknown): v is Hotspot {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.x === 'number' &&
    typeof o.y === 'number' &&
    typeof o.width === 'number' &&
    typeof o.height === 'number'
  );
}

/**
 * P3-3e — resolve a hotspot's effective rect for the current orientation.
 *
 * Returns the portrait override when isPortrait is true AND the hotspot
 * carries one; otherwise returns the canonical landscape rect. Pure: the
 * input is never mutated, the return is a fresh shallow object that's
 * safe to spread into CSS-percent styles.
 */
export function resolveHotspotRect(
  h: Hotspot,
  isPortrait: boolean
): { x: number; y: number; width: number; height: number } {
  if (isPortrait && h.portrait) {
    return {
      x: h.portrait.x,
      y: h.portrait.y,
      width: h.portrait.width,
      height: h.portrait.height,
    };
  }
  return { x: h.x, y: h.y, width: h.width, height: h.height };
}
