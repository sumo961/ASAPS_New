/**
 * jsdom gaps the renderer's big layout views (PositionedBeatView / SlotFlowView
 * / SpatialFlowView / ReactRenderer) rely on but the renderer test setup does
 * not provide. Call installRendererDomStubs() in a beforeEach. The
 * ResizeObserver stub FIRES its callback once with a 1024×768 contentRect so
 * measurement-gated rendering actually proceeds; getBoundingClientRect returns
 * the same box.
 */
import { vi } from 'vitest';

export function installRendererDomStubs(width = 1024, height = 768): void {
  (globalThis as any).ResizeObserver = class {
    constructor(private cb: ResizeObserverCallback) {}
    observe(target: Element) {
      this.cb(
        [{ target, contentRect: { width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0 } } as any],
        this as any,
      );
    }
    unobserve() {}
    disconnect() {}
  };

  (globalThis as any).IntersectionObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  };

  if (!Element.prototype.scrollTo) (Element.prototype as any).scrollTo = vi.fn();

  Element.prototype.getBoundingClientRect = function () {
    return { width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  };

  if (!window.matchMedia) {
    (window as any).matchMedia = (q: string) => ({
      matches: false,
      media: q,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: () => true,
    });
  }
}
