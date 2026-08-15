/**
 * computeStageFitScale — one arithmetic for "how big does the stage draw".
 *
 * It exists because the exported player mounts its screen-HUD layer as a
 * sibling of the stage rather than inside it. Both boxes have to agree, and a
 * second copy of this sum is how they would stop agreeing.
 */
import { describe, it, expect } from 'vitest';
import { computeStageFitScale } from '../../src/utils/hudLayout';

const STAGE = { width: 1024, height: 768 };

describe('computeStageFitScale', () => {
  it('fits by the tighter axis, so nothing is cut off', () => {
    // Wide but short: height binds.
    expect(computeStageFitScale({ width: 2000, height: 384 }, STAGE)).toBeCloseTo(0.5);
    // Tall but narrow: width binds.
    expect(computeStageFitScale({ width: 512, height: 2000 }, STAGE)).toBeCloseTo(0.5);
  });

  it('covers by the looser axis, accepting the crop', () => {
    expect(computeStageFitScale({ width: 2000, height: 384 }, STAGE, 'cover')).toBeCloseTo(2000 / 1024);
  });

  it('scales up to fill a larger window, but not without limit', () => {
    expect(computeStageFitScale({ width: 1536, height: 1152 }, STAGE)).toBeCloseTo(1.5);
    // The 2× ceiling keeps a small authored stage from becoming a blur.
    expect(computeStageFitScale({ width: 10240, height: 7680 }, STAGE)).toBe(2);
  });

  it('snaps near-unity to exactly 1', () => {
    // Sub-pixel letterboxing around 1 is visible as a hairline seam.
    expect(computeStageFitScale({ width: 1029, height: 771 }, STAGE)).toBe(1);
    expect(computeStageFitScale(STAGE, STAGE)).toBe(1);
  });

  it('returns 1 rather than NaN when something has not been measured yet', () => {
    // First paint: the container reports 0 before layout settles.
    expect(computeStageFitScale({ width: 0, height: 0 }, STAGE)).toBe(1);
    expect(computeStageFitScale({ width: 800, height: 600 }, { width: 0, height: 0 })).toBe(1);
  });
});
