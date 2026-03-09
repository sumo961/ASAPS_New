/**
 * Tests for panorama coordinate conversion utilities
 */

import { describe, it, expect } from 'vitest';
import {
  stageToYawPitch,
  yawPitchToStage,
  viewportSizeOnStage,
  computePanoData,
} from '../panoramaCoordinates';

const STAGE_W = 1024;
const STAGE_H = 768;

describe('panoramaCoordinates', () => {
  // -------------------------------------------------------------------------
  // stageToYawPitch — equirectangular
  // -------------------------------------------------------------------------
  describe('stageToYawPitch — equirectangular', () => {
    it('should map stage center to yaw=0, pitch=0', () => {
      const { yaw, pitch } = stageToYawPitch(
        STAGE_W / 2, STAGE_H / 2, 'equirectangular', STAGE_W, STAGE_H
      );
      expect(yaw).toBeCloseTo(0, 5);
      expect(pitch).toBeCloseTo(0, 5);
    });

    it('should map left edge to yaw=180', () => {
      const { yaw } = stageToYawPitch(0, STAGE_H / 2, 'equirectangular', STAGE_W, STAGE_H);
      expect(yaw).toBeCloseTo(180, 5);
    });

    it('should map right edge to yaw=-180', () => {
      const { yaw } = stageToYawPitch(STAGE_W, STAGE_H / 2, 'equirectangular', STAGE_W, STAGE_H);
      expect(yaw).toBeCloseTo(-180, 5);
    });

    it('should map top edge to pitch=90', () => {
      const { pitch } = stageToYawPitch(STAGE_W / 2, 0, 'equirectangular', STAGE_W, STAGE_H);
      expect(pitch).toBeCloseTo(90, 5);
    });

    it('should map bottom edge to pitch=-90', () => {
      const { pitch } = stageToYawPitch(STAGE_W / 2, STAGE_H, 'equirectangular', STAGE_W, STAGE_H);
      expect(pitch).toBeCloseTo(-90, 5);
    });

    it('should map quarter position correctly', () => {
      // At x=STAGE_W/4 (left quarter): yaw = 180 - 0.25*360 = 90
      const { yaw, pitch } = stageToYawPitch(
        STAGE_W / 4, STAGE_H / 4, 'equirectangular', STAGE_W, STAGE_H
      );
      expect(yaw).toBeCloseTo(90, 5);
      expect(pitch).toBeCloseTo(45, 5);
    });
  });

  // -------------------------------------------------------------------------
  // stageToYawPitch — cylindrical
  // -------------------------------------------------------------------------
  describe('stageToYawPitch — cylindrical', () => {
    it('should map stage center to yaw=0, pitch=0', () => {
      const { yaw, pitch } = stageToYawPitch(
        STAGE_W / 2, STAGE_H / 2, 'cylindrical', STAGE_W, STAGE_H
      );
      expect(yaw).toBeCloseTo(0, 5);
      expect(pitch).toBeCloseTo(0, 5);
    });

    it('should map left edge to positive yaw', () => {
      const { yaw } = stageToYawPitch(0, STAGE_H / 2, 'cylindrical', STAGE_W, STAGE_H);
      expect(yaw).toBeGreaterThan(0);
    });

    it('should map right edge to negative yaw', () => {
      const { yaw } = stageToYawPitch(STAGE_W, STAGE_H / 2, 'cylindrical', STAGE_W, STAGE_H);
      expect(yaw).toBeLessThan(0);
    });

    it('should use default aspect of 4:1 when not specified', () => {
      const result = stageToYawPitch(0, STAGE_H / 2, 'cylindrical', STAGE_W, STAGE_H);
      // Explicit aspect=4 should give same result
      const resultExplicit = stageToYawPitch(0, STAGE_H / 2, 'cylindrical', STAGE_W, STAGE_H, 4);
      expect(result.yaw).toBeCloseTo(resultExplicit.yaw, 10);
      expect(result.pitch).toBeCloseTo(resultExplicit.pitch, 10);
    });

    it('should respect custom image aspect ratio', () => {
      const a4 = stageToYawPitch(0, STAGE_H / 2, 'cylindrical', STAGE_W, STAGE_H, 4);
      const a2 = stageToYawPitch(0, STAGE_H / 2, 'cylindrical', STAGE_W, STAGE_H, 2);
      // Wider aspect → larger yaw range
      expect(Math.abs(a4.yaw)).toBeGreaterThan(Math.abs(a2.yaw));
    });

    it('should have limited pitch range (approx +-26.565 degrees)', () => {
      const top = stageToYawPitch(STAGE_W / 2, 0, 'cylindrical', STAGE_W, STAGE_H);
      const bottom = stageToYawPitch(STAGE_W / 2, STAGE_H, 'cylindrical', STAGE_W, STAGE_H);
      const maxPitch = Math.atan(0.5) * (180 / Math.PI);
      expect(top.pitch).toBeCloseTo(maxPitch, 3);
      expect(bottom.pitch).toBeCloseTo(-maxPitch, 3);
    });
  });

  // -------------------------------------------------------------------------
  // yawPitchToStage — equirectangular
  // -------------------------------------------------------------------------
  describe('yawPitchToStage — equirectangular', () => {
    it('should map yaw=0, pitch=0 to stage center', () => {
      const { centerX, centerY } = yawPitchToStage(
        0, 0, 'equirectangular', STAGE_W, STAGE_H
      );
      expect(centerX).toBeCloseTo(STAGE_W / 2, 5);
      expect(centerY).toBeCloseTo(STAGE_H / 2, 5);
    });

    it('should map yaw=180 to left edge', () => {
      const { centerX } = yawPitchToStage(180, 0, 'equirectangular', STAGE_W, STAGE_H);
      expect(centerX).toBeCloseTo(0, 5);
    });

    it('should map yaw=-180 to right edge', () => {
      const { centerX } = yawPitchToStage(-180, 0, 'equirectangular', STAGE_W, STAGE_H);
      expect(centerX).toBeCloseTo(STAGE_W, 5);
    });

    it('should map pitch=90 to top edge', () => {
      const { centerY } = yawPitchToStage(0, 90, 'equirectangular', STAGE_W, STAGE_H);
      expect(centerY).toBeCloseTo(0, 5);
    });

    it('should map pitch=-90 to bottom edge', () => {
      const { centerY } = yawPitchToStage(0, -90, 'equirectangular', STAGE_W, STAGE_H);
      expect(centerY).toBeCloseTo(STAGE_H, 5);
    });
  });

  // -------------------------------------------------------------------------
  // yawPitchToStage — cylindrical
  // -------------------------------------------------------------------------
  describe('yawPitchToStage — cylindrical', () => {
    it('should map yaw=0, pitch=0 to stage center', () => {
      const { centerX, centerY } = yawPitchToStage(
        0, 0, 'cylindrical', STAGE_W, STAGE_H
      );
      expect(centerX).toBeCloseTo(STAGE_W / 2, 5);
      expect(centerY).toBeCloseTo(STAGE_H / 2, 5);
    });

    it('should map positive yaw to left side of stage', () => {
      const { centerX } = yawPitchToStage(50, 0, 'cylindrical', STAGE_W, STAGE_H);
      expect(centerX).toBeLessThan(STAGE_W / 2);
    });

    it('should map negative yaw to right side of stage', () => {
      const { centerX } = yawPitchToStage(-50, 0, 'cylindrical', STAGE_W, STAGE_H);
      expect(centerX).toBeGreaterThan(STAGE_W / 2);
    });
  });

  // -------------------------------------------------------------------------
  // Roundtrip consistency
  // -------------------------------------------------------------------------
  describe('roundtrip stageToYawPitch <-> yawPitchToStage', () => {
    const testPoints = [
      { x: 100, y: 200 },
      { x: STAGE_W / 2, y: STAGE_H / 2 },
      { x: 0, y: 0 },
      { x: STAGE_W, y: STAGE_H },
      { x: 300, y: 500 },
    ];

    it('should roundtrip equirectangular coordinates', () => {
      for (const { x, y } of testPoints) {
        const { yaw, pitch } = stageToYawPitch(x, y, 'equirectangular', STAGE_W, STAGE_H);
        const { centerX, centerY } = yawPitchToStage(yaw, pitch, 'equirectangular', STAGE_W, STAGE_H);
        expect(centerX).toBeCloseTo(x, 5);
        expect(centerY).toBeCloseTo(y, 5);
      }
    });

    it('should roundtrip cylindrical coordinates', () => {
      for (const { x, y } of testPoints) {
        const { yaw, pitch } = stageToYawPitch(x, y, 'cylindrical', STAGE_W, STAGE_H, 4);
        const { centerX, centerY } = yawPitchToStage(yaw, pitch, 'cylindrical', STAGE_W, STAGE_H, 4);
        expect(centerX).toBeCloseTo(x, 5);
        expect(centerY).toBeCloseTo(y, 5);
      }
    });

    it('should roundtrip with custom aspect ratio', () => {
      const aspect = 3;
      for (const { x, y } of testPoints) {
        const { yaw, pitch } = stageToYawPitch(x, y, 'cylindrical', STAGE_W, STAGE_H, aspect);
        const { centerX, centerY } = yawPitchToStage(yaw, pitch, 'cylindrical', STAGE_W, STAGE_H, aspect);
        expect(centerX).toBeCloseTo(x, 5);
        expect(centerY).toBeCloseTo(y, 5);
      }
    });
  });

  // -------------------------------------------------------------------------
  // viewportSizeOnStage
  // -------------------------------------------------------------------------
  describe('viewportSizeOnStage', () => {
    it('should compute viewport for equirectangular', () => {
      const { width, height } = viewportSizeOnStage(90, 'equirectangular', STAGE_W, STAGE_H);
      // 90/360 * 1024 = 256
      expect(width).toBeCloseTo(256, 5);
      // height = width / (16/9) = 256 / 1.778 ≈ 144
      expect(height).toBeCloseTo(256 / (16 / 9), 3);
    });

    it('should compute viewport for cylindrical', () => {
      const A = 4;
      const totalHfovDeg = A * (180 / Math.PI);
      const hfov = 75;
      const { width } = viewportSizeOnStage(hfov, 'cylindrical', STAGE_W, STAGE_H, A);
      expect(width).toBeCloseTo((hfov / totalHfovDeg) * STAGE_W, 3);
    });

    it('should use default aspect of 4 for cylindrical', () => {
      const explicit = viewportSizeOnStage(75, 'cylindrical', STAGE_W, STAGE_H, 4);
      const implicit = viewportSizeOnStage(75, 'cylindrical', STAGE_W, STAGE_H);
      expect(explicit.width).toBeCloseTo(implicit.width, 10);
    });

    it('should respect display aspect ratio', () => {
      const ar169 = viewportSizeOnStage(90, 'equirectangular', STAGE_W, STAGE_H, undefined, 16 / 9);
      const ar43 = viewportSizeOnStage(90, 'equirectangular', STAGE_W, STAGE_H, undefined, 4 / 3);
      // Same width but different height
      expect(ar169.width).toBeCloseTo(ar43.width, 5);
      expect(ar43.height).toBeGreaterThan(ar169.height);
    });

    it('should scale linearly with hfov', () => {
      const small = viewportSizeOnStage(45, 'equirectangular', STAGE_W, STAGE_H);
      const large = viewportSizeOnStage(90, 'equirectangular', STAGE_W, STAGE_H);
      expect(large.width).toBeCloseTo(small.width * 2, 3);
    });
  });

  // -------------------------------------------------------------------------
  // computePanoData
  // -------------------------------------------------------------------------
  describe('computePanoData', () => {
    it('should compute panoData for a 4:1 cylindrical image', () => {
      const data = computePanoData(4000, 1000);
      // aspect = 4, horizArcDeg = 4 * RAD_TO_DEG ≈ 229.18
      // fullWidth = 4000 * (360 / 229.18) ≈ 6283
      // fullHeight = fullWidth / 2 ≈ 3142
      expect(data.fullWidth).toBeGreaterThan(4000);
      expect(data.fullHeight).toBe(Math.round(data.fullWidth / 2));
      expect(data.croppedWidth).toBe(4000);
      expect(data.croppedHeight).toBe(1000);
    });

    it('should center the cropped region', () => {
      const data = computePanoData(4000, 1000);
      expect(data.croppedX).toBe(Math.round((data.fullWidth - 4000) / 2));
      expect(data.croppedY).toBe(Math.round((data.fullHeight - 1000) / 2));
    });

    it('should handle 2:1 aspect ratio (full equirectangular)', () => {
      const data = computePanoData(2000, 1000);
      // aspect = 2, horizArcDeg = 2 * RAD_TO_DEG ≈ 114.59
      // fullWidth = 2000 * (360 / 114.59) ≈ 6283
      expect(data.fullWidth).toBeGreaterThan(2000);
      expect(data.croppedWidth).toBe(2000);
      expect(data.croppedHeight).toBe(1000);
    });

    it('should have consistent fullHeight = fullWidth / 2', () => {
      for (const [w, h] of [[4000, 1000], [3000, 750], [2000, 500]]) {
        const data = computePanoData(w, h);
        expect(data.fullHeight).toBe(Math.round(data.fullWidth / 2));
      }
    });

    it('should produce integer values', () => {
      const data = computePanoData(3333, 777);
      expect(Number.isInteger(data.fullWidth)).toBe(true);
      expect(Number.isInteger(data.fullHeight)).toBe(true);
      expect(Number.isInteger(data.croppedX)).toBe(true);
      expect(Number.isInteger(data.croppedY)).toBe(true);
    });
  });
});
