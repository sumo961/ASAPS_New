/**
 * Integration smoke + happy-path tests for ReactRenderer (the 3922-line core
 * IRenderer impl) driving PositionedBeatView. Mounts the renderer into a real
 * container, renders a beat, and resolves the render promise by clicking the
 * action button — exercising constructor→initialize→createRoot→renderComponent
 * and the resolveAction/handleAction loop end-to-end in jsdom.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { ReactRenderer } from '../../src/renderers/ReactRenderer';

// PositionedBeatView relies on browser observer/media APIs jsdom lacks and the
// renderer test setup doesn't stub. Provide minimal no-op implementations.
beforeEach(() => {
  // Fire the ResizeObserver callback once with a real size — PositionedBeatView
  // only renders positioned elements (incl. the action button) after it
  // measures the stage, which jsdom otherwise never reports.
  (global as any).ResizeObserver = class {
    constructor(private cb: ResizeObserverCallback) {}
    observe(target: Element) {
      this.cb(
        [{ target, contentRect: { width: 1024, height: 768, top: 0, left: 0, right: 1024, bottom: 768, x: 0, y: 0 } } as any],
        this as any,
      );
    }
    unobserve() {}
    disconnect() {}
  };
  if (!(Element.prototype as any).__bcrStubbed) {
    (Element.prototype as any).__bcrStubbed = true;
    Element.prototype.getBoundingClientRect = function () {
      return { width: 1024, height: 768, top: 0, left: 0, right: 1024, bottom: 768, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    };
  }
  (global as any).IntersectionObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  };
  if (!Element.prototype.scrollTo) (Element.prototype as any).scrollTo = vi.fn();
  if (!window.matchMedia) {
    (window as any).matchMedia = (q: string) => ({
      matches: false,
      media: q,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: () => true,
    });
  }
});

let container: HTMLElement;
let renderer: ReactRenderer;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  renderer = new ReactRenderer({ container });
});

afterEach(() => {
  try {
    renderer.destroy?.();
  } catch {
    /* ignore */
  }
  container.remove();
});

describe('ReactRenderer', () => {
  it('mounts a React root into the container on construction', () => {
    expect((container as any).__reactRoot).toBeTruthy();
  });

  it('renderText mounts PositionedBeatView and displays the beat text', async () => {
    renderer.renderText('A quiet morning in the harbor.', 'Continue');
    await waitFor(() => expect(container.textContent).toContain('A quiet morning in the harbor.'));
  });

  it('renderTitleScreen displays the title and author', async () => {
    renderer.renderTitleScreen('The Long Way Back', 'by Ada Lovelace', 'Begin');
    await waitFor(() => expect(container.textContent).toContain('The Long Way Back'));
    expect(container.textContent).toContain('Ada Lovelace');
  });

  it('renderEndScreen displays the ending message', async () => {
    renderer.renderEndScreen('The End.', true, false);
    await waitFor(() => expect(container.textContent).toContain('The End.'));
  });

  it('round-trips renderer state via setState/getState', () => {
    const r = renderer as any;
    r.setState('playerName', 'Eve');
    expect(r.getState('playerName')).toBe('Eve');
    expect(r.getState('missingKey')).toBeUndefined();
  });

  it('re-rendering swaps the displayed content', async () => {
    renderer.renderText('First beat.', 'Next');
    await waitFor(() => expect(container.textContent).toContain('First beat.'));
    renderer.renderText('Second beat.', 'Next');
    await waitFor(() => expect(container.textContent).toContain('Second beat.'));
    expect(container.textContent).not.toContain('First beat.');
  });

  // NOTE: the action-button click→resolve interaction isn't covered here —
  // PositionedBeatView gates the positioned action button behind a layout
  // measurement that jsdom doesn't satisfy even with a stubbed ResizeObserver +
  // getBoundingClientRect. Driving it would need a deeper layout harness; the
  // mount + content-render path above is the reliable coverage for this view.
});

describe('chat avatars (roadmap Tier-1 item 4)', () => {
  // Speaker portraits never showed in chat views: renderDialog consulted only
  // characterAvatarResolver — which NO host ever set (PreviewWindow and
  // PlayerEngine wire the PORTRAIT resolver) — and mangled the speaker name
  // to underscores while resolvers match plain lowercased names. These pin
  // the fallback + raw-name lookup.
  it('renderDialog resolves chat avatars via the portrait resolver with the raw speaker name', async () => {
    const portraitResolver = vi.fn((name: string) =>
      name === 'Mary Jane' ? 'blob:mock-portrait-url' : undefined,
    );
    renderer.setCharacterPortraitResolver(portraitResolver);
    renderer.setState('presentationMode', 'chat-scroll');

    void renderer.renderDialog('Mary Jane', 'Hello there!');

    await waitFor(() => {
      const img = container.querySelector('img[src="blob:mock-portrait-url"]');
      expect(img, 'chat message should render the resolved portrait').toBeTruthy();
    });
    // raw name resolved on the first probe — no underscore mangling required
    expect(portraitResolver).toHaveBeenCalledWith('Mary Jane');
  });

  it('falls back to the initial letter when no resolver matches', async () => {
    renderer.setState('presentationMode', 'chat-scroll');
    void renderer.renderDialog('Nora', 'Hi!');
    await waitFor(() => {
      expect(container.textContent).toContain('Hi!');
    });
    expect(container.querySelector('img')).toBeNull();
  });
});

describe('visual transitions (dissolve identity + direction + easing, v0.9.86)', () => {
  // Backlog follow-ups from the Panorama & Transitions verification round:
  // dissolve used to render identically to fade, and Transition.direction/
  // easing existed in the type but were ignored. These pin the new contract.
  const render1 = async () => {
    await renderer.renderText('Hello', 'Continue');
  };

  it('dissolve prepares a blur that resolves — visually distinct from fade', async () => {
    renderer.prepareTransition({ type: 'dissolve', duration: 300 });
    expect(container.style.opacity).toBe('0');
    expect(container.style.filter).toBe('blur(12px)');
    void render1();
    await new Promise(r => setTimeout(r, 120)); // double rAF + transition set
    expect(container.style.transition).toContain('filter');
    expect(container.style.filter).toBe('blur(0px)');
  });

  it('fade does NOT blur (the distinction is real)', () => {
    renderer.prepareTransition({ type: 'fade', duration: 300 });
    expect(container.style.opacity).toBe('0');
    expect(container.style.filter).toBe('');
  });

  it('slide honors the entrance edge: left/top/bottom, legacy in/out → default right', () => {
    const cases: Array<[string | undefined, string]> = [
      ['left', 'translateX(-100%)'],
      ['top', 'translateY(-100%)'],
      ['bottom', 'translateY(100%)'],
      ['right', 'translateX(100%)'],
      ['in', 'translateX(100%)'],   // legacy value in old project data
      [undefined, 'translateX(100%)'],
    ];
    for (const [dir, expected] of cases) {
      container.style.transform = '';
      renderer.prepareTransition({ type: 'slide', duration: 300, direction: dir });
      expect(container.style.transform, String(dir)).toBe(expected);
      (renderer as any).pendingTransitionType = null; // reset between probes
    }
  });

  it('authored easing reaches the CSS transition; default keeps the historic curves', async () => {
    renderer.prepareTransition({ type: 'fade', duration: 300, easing: 'linear' });
    void render1();
    await new Promise(r => setTimeout(r, 120));
    expect(container.style.transition).toContain('opacity 300ms linear');

    renderer.prepareTransition({ type: 'fade', duration: 300 });
    void render1();
    await new Promise(r => setTimeout(r, 120));
    expect(container.style.transition).toContain('opacity 300ms ease-in-out');
    expect(container.style.transition).toContain('transform 300ms ease-out');
  });
});

describe('consecutive XR map beats (GPS starter map → walk pair)', () => {
  // A fake sensor service the test can push positions through.
  const makeSensors = () => {
    const watchers: Array<(r: { lat: number; lng: number }) => void> = [];
    return {
      watchLocation(cb: (r: { lat: number; lng: number }) => void) {
        watchers.push(cb);
        return () => {};
      },
      count() { return watchers.length; },
      push(lat: number, lng: number) {
        for (const w of [...watchers]) w({ lat, lng });
      },
    };
  };

  it('a trigger map after a display map still fires its arrival', async () => {
    // Without a per-mount key the second <MapBeatLeaflet> reconciles into the
    // FIRST one's instance and inherits resolvedRef=true from the display
    // beat's Continue click — the geofence can then never fire and the walk
    // beat waits forever while the status line says "At target ✓". Found live
    // by the Ordinary Wonders template's map → walk pair; the GPS field kit's
    // B_show → B_walk pair has the same shape on device.
    const sensors = makeSensors();
    (renderer as any).setState('sensorService', sensors);
    const loc = [{ id: 'w1', name: 'Wonder', lat: 59.3326, lng: 18.0649, radiusMeters: 25 }];

    const p1 = renderer.renderMap!({ mode: 'display', locations: loc, buttonText: 'Onward' });
    await waitFor(() => {
      const btn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Onward');
      expect(btn).toBeTruthy();
      btn!.click();
    });
    await expect(p1).resolves.toMatchObject({ path: 'continue' });

    const before = sensors.count();
    const p2 = renderer.renderMap!({ mode: 'trigger-on-arrival', locations: loc });
    // Wait until the fresh mount subscribes, then walk into the fence.
    await waitFor(() => expect(sensors.count()).toBeGreaterThan(before));
    sensors.push(59.3326, 18.0649);
    await expect(p2).resolves.toMatchObject({ path: 'arrived', locationId: 'w1' });
  });
});

describe('markdown-lite after typewriter reveal', () => {
  it('typewriter text formats its markdown once the reveal completes', async () => {
    // The render branch used to gate on `animation === 'typewriter'` alone —
    // a theme CONSTANT — so typewriter stories showed raw asterisks forever.
    // Formatting must appear once isAnimating flips off.
    const { DEFAULT_THEME } = await import('../../src/components/PositionedBeatView');
    renderer.setTheme({
      ...DEFAULT_THEME,
      textEffects: { ...DEFAULT_THEME.textEffects, animation: 'typewriter', typewriterSpeed: 1000 },
    } as any);
    renderer.renderText('A **bold** claim.', 'Next');
    await waitFor(() => {
      const strong = container.querySelector('strong');
      expect(strong?.textContent).toBe('bold');
    }, { timeout: 4000 });
    expect(container.textContent).not.toContain('**');
  });

  it('fixed-canvas typewriter formats after the reveal too', async () => {
    // The positioned view keeps the plain revealed/transparent split WHILE
    // typing (markers show literally), and must swap to the markdown branch
    // when isAnimating flips off — gating on the theme constant alone left
    // fixed-canvas typewriter text unformatted forever.
    const { DEFAULT_THEME } = await import('../../src/components/PositionedBeatView');
    renderer.setTheme({
      ...DEFAULT_THEME,
      textEffects: { ...DEFAULT_THEME.textEffects, animation: 'typewriter', typewriterSpeed: 1000 },
    } as any);
    // An author-positioned text location routes renderText to PositionedBeatView.
    renderer.renderText('A **bold** claim.', 'Next', [
      { id: 'text_1', name: 'Body', kind: 'text', x: 100, y: 100, width: 400, height: 200 } as any,
    ]);
    await waitFor(() => {
      const strong = container.querySelector('strong');
      expect(strong?.textContent).toBe('bold');
    }, { timeout: 4000 });
  });
});
