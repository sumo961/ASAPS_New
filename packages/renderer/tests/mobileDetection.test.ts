/**
 * Tests for mobileDetection — viewport + UA + touch heuristics used
 * by the renderer to switch between "fit" (letterbox) and "cover"
 * (crop edges) scaling. A wrong verdict produces blurry or cropped
 * scenes for real users.
 *
 * Coverage focus:
 *   - isMobileDevice: SSR-safe (no window), URL override, real-mobile
 *     heuristics (touch + UA / small screen), DevTools sim path
 *     (touch + small viewport), large-touch-desktop (touch but big
 *     screen + non-mobile UA) → false
 *   - getDeviceScalingInfo: fit vs cover math, cropping percentages,
 *     viewport defaults from window when omitted
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { isMobileDevice, getDeviceScalingInfo } from '../src/utils/mobileDetection';

afterEach(() => {
  vi.unstubAllGlobals();
});

function setup(opts: {
  href?: string;
  ua?: string;
  touchPoints?: number;
  hasTouchstart?: boolean;
  screen?: { width: number; height: number };
  viewport?: { width: number; height: number };
}) {
  const win: any = {
    location: { search: opts.href || '' },
    innerWidth: opts.viewport?.width ?? 1920,
    innerHeight: opts.viewport?.height ?? 1080,
  };
  if (opts.hasTouchstart) {
    win.ontouchstart = null;
  }
  vi.stubGlobal('window', win);
  vi.stubGlobal('navigator', {
    userAgent: opts.ua || 'Mozilla/5.0 (Macintosh; Intel Mac OS X)',
    maxTouchPoints: opts.touchPoints ?? 0,
  });
  vi.stubGlobal('screen', opts.screen || { width: 1920, height: 1080 });
}

describe('isMobileDevice', () => {
  describe('SSR-safety', () => {
    it('returns false when window is undefined (SSR)', () => {
      vi.stubGlobal('window', undefined);
      expect(isMobileDevice()).toBe(false);
    });
  });

  describe('URL override', () => {
    it('returns true when ?mobile=1 in URL (testing affordance)', () => {
      // Even on a desktop, URL override forces mobile mode — used
      // by the dev workflow to test mobile layout without a real
      // device.
      setup({ href: '?mobile=1', screen: { width: 1920, height: 1080 } });
      expect(isMobileDevice()).toBe(true);
    });

    it('does NOT trigger on ?mobile=0 or other values', () => {
      setup({ href: '?mobile=0', screen: { width: 1920, height: 1080 } });
      expect(isMobileDevice()).toBe(false);
    });
  });

  describe('real mobile devices', () => {
    it('iPhone UA + touch + small screen → true', () => {
      setup({
        ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)',
        touchPoints: 5,
        screen: { width: 390, height: 844 },
        viewport: { width: 390, height: 844 },
      });
      expect(isMobileDevice()).toBe(true);
    });

    it('Android UA + touch + small screen → true', () => {
      setup({
        ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)',
        touchPoints: 5,
        screen: { width: 412, height: 915 },
      });
      expect(isMobileDevice()).toBe(true);
    });

    it('touch + mobile UA on a large screen → true (tablet-class detection)', () => {
      // iPad sometimes reports large screen with iPad UA.
      setup({
        ua: 'iPad; CPU OS 16_0 like Mac OS X',
        touchPoints: 5,
        screen: { width: 2048, height: 1536 },
        viewport: { width: 2048, height: 1536 },
      });
      expect(isMobileDevice()).toBe(true);
    });
  });

  describe('DevTools sim path', () => {
    it('touch + small viewport (desktop browser DevTools sim) → true', () => {
      // DevTools mobile simulation reports a desktop UA but a small
      // viewport + touch. The "small viewport with touch" branch
      // catches this so the rendered scene matches what mobile
      // users would see.
      setup({
        ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)',
        touchPoints: 5,
        screen: { width: 1920, height: 1080 },
        viewport: { width: 390, height: 844 },
      });
      expect(isMobileDevice()).toBe(true);
    });
  });

  describe('false negatives + positives boundary', () => {
    it('desktop with touch (modern Mac touchbar laptops, big monitors) → false', () => {
      // Touch + non-mobile UA + large screen + large viewport →
      // NOT mobile. Cover-scaling would crop content on a giant
      // monitor.
      setup({
        ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)',
        touchPoints: 5,
        screen: { width: 2560, height: 1440 },
        viewport: { width: 2560, height: 1440 },
      });
      expect(isMobileDevice()).toBe(false);
    });

    it('no touch + mobile UA (spoofed UA) → false', () => {
      // Mobile UA on a real desktop with no touch → desktop. We
      // require touch as a load-bearing signal so UA spoofing
      // doesn't accidentally force cover-scaling on bigger screens.
      setup({
        ua: 'Mozilla/5.0 (iPhone)',
        touchPoints: 0,
        screen: { width: 1920, height: 1080 },
      });
      expect(isMobileDevice()).toBe(false);
    });

    it('screen exactly 768 → counts as small (boundary)', () => {
      // The threshold is `<= 768`, so exactly 768 must be mobile.
      // Pin the boundary so a future tweak is a deliberate edit.
      setup({
        ua: 'iPhone',
        touchPoints: 5,
        screen: { width: 768, height: 1024 }, // Math.min = 768
      });
      expect(isMobileDevice()).toBe(true);
    });

    it('screen 769 with no mobile UA + no small viewport → false (just above threshold)', () => {
      setup({
        ua: 'Mozilla/5.0 (Macintosh)',
        touchPoints: 5,
        screen: { width: 769, height: 1024 },
        viewport: { width: 1024, height: 769 },  // also > 768
      });
      expect(isMobileDevice()).toBe(false);
    });
  });

  describe('UA detection', () => {
    const mobileUAs = [
      'Mozilla/5.0 (Linux; Android 14)',
      'Mozilla/5.0 (iPhone)',
      'Mozilla/5.0 (iPad)',
      'Mozilla/5.0 (iPod)',
      'webOS',
      'BlackBerry',
      'IEMobile',
      'Opera Mini',
    ];
    it.each(mobileUAs)('detects %s as mobile-shaped', (ua) => {
      setup({
        ua,
        touchPoints: 5,
        screen: { width: 1920, height: 1080 }, // big enough that screen alone wouldn't say mobile
        viewport: { width: 1920, height: 1080 },
      });
      expect(isMobileDevice()).toBe(true);
    });
  });
});

describe('getDeviceScalingInfo', () => {
  describe('fit vs cover math', () => {
    it('produces fit < cover when stage and viewport aspect-ratios differ', () => {
      // 1920×1080 stage, 1080×1920 viewport — vertically-rotated.
      const info = getDeviceScalingInfo(1920, 1080, 1080, 1920);
      // scaleX = 1080/1920 = 0.5625, scaleY = 1920/1080 ≈ 1.778
      // fit = min = 0.5625, cover = max ≈ 1.778
      expect(info.fitScale).toBeCloseTo(0.5625, 4);
      expect(info.coverScale).toBeCloseTo(1.778, 2);
    });

    it('fit and cover are equal when aspect-ratios match', () => {
      // 1920×1080 stage, 3840×2160 viewport (same 16:9).
      const info = getDeviceScalingInfo(1920, 1080, 3840, 2160);
      expect(info.fitScale).toBe(info.coverScale);
      expect(info.fitScale).toBe(2);
    });

    it('croppedWidthPercent is 0 when scale Y is the bigger axis', () => {
      // 1920×1080 stage, 1080×1920 viewport. cover takes scaleY (1.778).
      // scaledWidth = 1920*1.778 = 3413; viewport width 1080.
      // (3413-1080)/3413 ≈ 68% cropped horizontally.
      const info = getDeviceScalingInfo(1920, 1080, 1080, 1920);
      expect(info.croppedWidthPercent).toBeGreaterThan(0);
      expect(info.croppedHeightPercent).toBe(0); // height fits exactly
    });

    it('croppedHeightPercent is 0 when scale X is the bigger axis', () => {
      // Same logic, axis swapped.
      const info = getDeviceScalingInfo(1080, 1920, 1920, 1080);
      expect(info.croppedHeightPercent).toBeGreaterThan(0);
      expect(info.croppedWidthPercent).toBe(0);
    });

    it('both cropped percentages are 0 when aspect-ratios match (no crop needed)', () => {
      const info = getDeviceScalingInfo(1920, 1080, 3840, 2160);
      expect(info.croppedWidthPercent).toBeCloseTo(0, 4);
      expect(info.croppedHeightPercent).toBeCloseTo(0, 4);
    });
  });

  describe('viewport defaults', () => {
    it('defaults viewport to window.innerWidth/Height when omitted', () => {
      // setup() pins window dims via stub.
      const win: any = { location: { search: '' }, innerWidth: 1280, innerHeight: 720 };
      vi.stubGlobal('window', win);
      vi.stubGlobal('navigator', { userAgent: 'x', maxTouchPoints: 0 });
      vi.stubGlobal('screen', { width: 1280, height: 720 });

      const info = getDeviceScalingInfo(1280, 720);
      expect(info.fitScale).toBe(1);
      expect(info.coverScale).toBe(1);
    });

    it('falls back to stage dimensions in SSR (no window)', () => {
      // SSR safety — when window is unavailable, defaulting to
      // stage dims gives scale 1 (a sensible no-op).
      vi.stubGlobal('window', undefined);
      vi.stubGlobal('navigator', undefined);
      const info = getDeviceScalingInfo(1920, 1080);
      expect(info.fitScale).toBe(1);
      expect(info.isMobile).toBe(false);
    });
  });
});
