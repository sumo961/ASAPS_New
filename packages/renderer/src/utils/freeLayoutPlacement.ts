import type { Location } from '@asaps/core';

/**
 * Where a Free Layout element goes on a responsive stage: its position and
 * size as a share of the stage. Elements placed in a responsive project
 * carry xPercent / yPercent / widthPercent / heightPercent (0–100); an
 * element without them (made in a fixed project, then switched) is read
 * as a share of the stage it was placed on. The result is in pixels of
 * the stage it is drawn on, so text wraps inside its box instead of the
 * whole screen being scaled.
 */
export function placeByPercent(
  loc: Location,
  authored: { width: number; height: number },
  stage: { width: number; height: number },
): Location {
  const share = (percent: number | undefined, px: number | undefined, of: number) =>
    typeof percent === 'number' ? percent / 100 : (typeof px === 'number' && of > 0 ? px / of : 0);
  return {
    ...loc,
    x: Math.round(share(loc.xPercent, loc.x, authored.width) * stage.width),
    y: Math.round(share(loc.yPercent, loc.y, authored.height) * stage.height),
    width: Math.max(1, Math.round(share(loc.widthPercent, loc.width, authored.width) * stage.width)),
    height: Math.max(1, Math.round(share(loc.heightPercent, loc.height, authored.height) * stage.height)),
  };
}
