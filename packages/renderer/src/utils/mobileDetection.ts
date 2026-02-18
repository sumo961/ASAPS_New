/**
 * Mobile device detection and scaling utilities
 *
 * Used by the renderer to determine whether to use "cover" scaling
 * (fills viewport, crops edges) instead of "fit" scaling (letterboxes).
 */

/**
 * Detect whether the current device is mobile-like.
 * Checks viewport width, touch support, and user-agent heuristics.
 */
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;

  const isNarrowViewport = window.innerWidth <= 1024;
  const hasTouch =
    'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const mobileUA = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );

  // Require narrow viewport AND at least one touch/UA signal
  return isNarrowViewport && (hasTouch || mobileUA);
}

/**
 * Compute fit vs cover scaling info for a given stage and viewport.
 */
export interface DeviceScalingInfo {
  isMobile: boolean;
  /** Math.min(scaleX, scaleY) — fits stage inside viewport (letterboxes) */
  fitScale: number;
  /** Math.max(scaleX, scaleY) — fills viewport (crops edges) */
  coverScale: number;
  /** Percentage of stage width cropped (0–100) when using cover */
  croppedWidthPercent: number;
  /** Percentage of stage height cropped (0–100) when using cover */
  croppedHeightPercent: number;
}

export function getDeviceScalingInfo(
  stageWidth: number,
  stageHeight: number,
  viewportWidth?: number,
  viewportHeight?: number
): DeviceScalingInfo {
  const vw = viewportWidth ?? (typeof window !== 'undefined' ? window.innerWidth : stageWidth);
  const vh = viewportHeight ?? (typeof window !== 'undefined' ? window.innerHeight : stageHeight);

  const scaleX = vw / stageWidth;
  const scaleY = vh / stageHeight;

  const fitScale = Math.min(scaleX, scaleY);
  const coverScale = Math.max(scaleX, scaleY);

  // When cover-scaled, how much of the stage extends beyond the viewport?
  const scaledWidth = stageWidth * coverScale;
  const scaledHeight = stageHeight * coverScale;
  const croppedWidthPercent = Math.max(0, ((scaledWidth - vw) / scaledWidth) * 100);
  const croppedHeightPercent = Math.max(0, ((scaledHeight - vh) / scaledHeight) * 100);

  return {
    isMobile: isMobileDevice(),
    fitScale,
    coverScale,
    croppedWidthPercent,
    croppedHeightPercent,
  };
}
