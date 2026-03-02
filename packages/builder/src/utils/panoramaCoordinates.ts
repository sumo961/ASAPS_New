/**
 * Panorama coordinate conversion utilities.
 *
 * Converts between stage pixel coordinates (x, y) and panorama
 * yaw/pitch values used by Photo Sphere Viewer.
 *
 * Cylindrical images are treated as partial equirectangular via
 * panoData cropping.  The horizontal mapping is FLIPPED: image
 * left (u=0) maps to positive yaw, image right (u=1) maps to
 * negative yaw.
 */

const RAD_TO_DEG = 180 / Math.PI;

/**
 * Convert stage pixel center to yaw/pitch degrees.
 *
 * @param centerX  Pixel x of element center on stage
 * @param centerY  Pixel y of element center on stage
 * @param projType 'cylindrical' | 'equirectangular'
 * @param stageW   Stage width in pixels
 * @param stageH   Stage height in pixels
 * @param imageAspect  Image width / height (required for cylindrical, ignored for equirect)
 */
export function stageToYawPitch(
  centerX: number,
  centerY: number,
  projType: string,
  stageW: number,
  stageH: number,
  imageAspect?: number,
): { yaw: number; pitch: number } {
  if (projType === 'cylindrical') {
    const A = imageAspect ?? 4; // default to 4:1 if unknown
    const halfYawDeg = 0.5 * A * RAD_TO_DEG;
    const maxPitchDeg = Math.atan(0.5) * RAD_TO_DEG; // ≈ 26.565°

    const yaw = halfYawDeg * (1 - 2 * centerX / stageW);
    const pitch = maxPitchDeg * (1 - 2 * centerY / stageH);
    return { yaw, pitch };
  }

  // Equirectangular: full 360° x 180°, flipped horizontal
  const yaw = 180 - (centerX / stageW) * 360;
  const pitch = 90 - (centerY / stageH) * 180;
  return { yaw, pitch };
}

/**
 * Convert yaw/pitch degrees back to stage pixel center.
 * Inverse of stageToYawPitch.
 */
export function yawPitchToStage(
  yaw: number,
  pitch: number,
  projType: string,
  stageW: number,
  stageH: number,
  imageAspect?: number,
): { centerX: number; centerY: number } {
  if (projType === 'cylindrical') {
    const A = imageAspect ?? 4;
    const halfYawDeg = 0.5 * A * RAD_TO_DEG;
    const maxPitchDeg = Math.atan(0.5) * RAD_TO_DEG;

    const centerX = stageW * (1 - yaw / halfYawDeg) / 2;
    const centerY = stageH * (1 - pitch / maxPitchDeg) / 2;
    return { centerX, centerY };
  }

  // Equirectangular
  const centerX = stageW * (180 - yaw) / 360;
  const centerY = stageH * (90 - pitch) / 180;
  return { centerX, centerY };
}

/**
 * Compute viewport rectangle size on the flat stage for a given HFOV.
 * Returns { width, height } in stage pixels.
 */
export function viewportSizeOnStage(
  hfovDeg: number,
  projType: string,
  stageW: number,
  stageH: number,
  imageAspect?: number,
  displayAR: number = 16 / 9,
): { width: number; height: number } {
  let width: number;

  if (projType === 'cylindrical') {
    const A = imageAspect ?? 4;
    const totalHfovDeg = A * RAD_TO_DEG;
    width = (hfovDeg / totalHfovDeg) * stageW;
  } else {
    // Equirectangular
    width = (hfovDeg / 360) * stageW;
  }

  // Force height from display aspect ratio so the viewport rectangle
  // matches the project's actual aspect ratio on stage.
  const height = width / displayAR;
  return { width, height };
}

/**
 * Compute panoData for a partial (cylindrical) panorama image.
 * PSV treats it as a cropped region of a full equirectangular sphere.
 *
 * @param imageWidth   Natural pixel width of the panorama image
 * @param imageHeight  Natural pixel height of the panorama image
 */
export function computePanoData(imageWidth: number, imageHeight: number) {
  const A = imageWidth / imageHeight;
  const horizArcDeg = A * RAD_TO_DEG;
  const fullWidth = Math.round(imageWidth * (360 / horizArcDeg));
  const fullHeight = Math.round(fullWidth / 2);
  return {
    fullWidth,
    fullHeight,
    croppedWidth: imageWidth,
    croppedHeight: imageHeight,
    croppedX: Math.round((fullWidth - imageWidth) / 2),
    croppedY: Math.round((fullHeight - imageHeight) / 2),
  };
}
