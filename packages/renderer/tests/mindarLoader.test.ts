/**
 * Tests for loadMindAR — runtime loader for mind-ar that bypasses
 * our bundler (mind-ar's npm build imports a removed-from-three
 * export, so we load via <script type="module"> + importmap).
 *
 * Coverage focus:
 *   - SSR safety: rejects with a clear error when window is undefined
 *   - Reuses existing window.MINDAR.IMAGE.MindARThree when present
 *     (idempotent across mounts on the same page)
 *   - Injects an importmap exactly once (subsequent calls reuse the
 *     same import resolution)
 *   - Respects a pre-existing importmap (doesn't overwrite a custom
 *     three version the host page set up)
 *   - Returns the cached loadPromise across rapid back-to-back calls
 *     (no double-injection of the <script> tag)
 *   - Clears the cached promise on script error (so a retry can
 *     re-attempt the network load)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  // Clean up DOM between tests so importmap detection / script-tag
  // counts are deterministic.
  document.head.innerHTML = '';
});

beforeEach(() => {
  // Reset module state so loadPromise + importMapInjected are fresh.
  vi.resetModules();
});

describe('loadMindAR', () => {
  describe('SSR safety', () => {
    it('rejects with a clear error when window is undefined', async () => {
      const realWindow = globalThis.window;
      (globalThis as any).window = undefined;
      const { loadMindAR } = await import('../src/utils/mindarLoader');
      await expect(loadMindAR()).rejects.toThrow(/only load in a browser/i);
      (globalThis as any).window = realWindow;
    });
  });

  describe('reuse existing MINDAR global', () => {
    it('resolves immediately with the existing MindARThree when present', async () => {
      const fakeCtor = function FakeMindAR() {};
      (window as any).MINDAR = { IMAGE: { MindARThree: fakeCtor } };
      const { loadMindAR } = await import('../src/utils/mindarLoader');

      const result = await loadMindAR();
      expect(result.MindARThree).toBe(fakeCtor);

      // No script tag was injected since we reused.
      const scripts = document.querySelectorAll('script[src*="mind-ar"]');
      expect(scripts.length).toBe(0);

      delete (window as any).MINDAR;
    });
  });

  describe('importmap injection', () => {
    it('respects an existing importmap on the page', async () => {
      // Host page might have a custom three setup. The loader must
      // NOT overwrite it; do nothing and let mind-ar resolve through
      // the host's importmap.
      const existing = document.createElement('script');
      existing.type = 'importmap';
      existing.id = 'host-importmap';
      existing.textContent = JSON.stringify({ imports: { three: 'CUSTOM' } });
      document.head.appendChild(existing);

      const { loadMindAR } = await import('../src/utils/mindarLoader');
      loadMindAR().catch(() => {/* irrelevant — never resolves in test */});

      // Only the host's importmap should exist.
      const maps = document.querySelectorAll('script[type="importmap"]');
      expect(maps.length).toBe(1);
      expect((maps[0] as HTMLScriptElement).id).toBe('host-importmap');
    });

    it('injects an importmap when none exists', async () => {
      const { loadMindAR } = await import('../src/utils/mindarLoader');
      loadMindAR().catch(() => {/* expected — script never loads in jsdom */});

      const maps = document.querySelectorAll('script[type="importmap"]');
      expect(maps.length).toBe(1);

      const content = JSON.parse((maps[0] as HTMLScriptElement).textContent || '{}');
      expect(content.imports?.three).toMatch(/three@\d/);
    });
  });

  describe('script tag injection', () => {
    it('injects exactly one mind-ar <script type="module">', async () => {
      const { loadMindAR } = await import('../src/utils/mindarLoader');
      loadMindAR().catch(() => {});

      const scripts = document.querySelectorAll('script[src*="mind-ar"]');
      expect(scripts.length).toBe(1);
      expect((scripts[0] as HTMLScriptElement).type).toBe('module');
      expect((scripts[0] as HTMLScriptElement).async).toBe(true);
    });

    it('pins the mind-ar version (script URL contains "mind-ar@<version>")', async () => {
      // Critical: a wildcarded URL would let an upstream change
      // silently break our AR runtime. Pinned version → bumping
      // is a deliberate edit.
      const { loadMindAR } = await import('../src/utils/mindarLoader');
      loadMindAR().catch(() => {});

      const script = document.querySelector('script[src*="mind-ar"]') as HTMLScriptElement;
      expect(script.src).toMatch(/mind-ar@\d+\.\d+\.\d+/);
    });

    it('uses jsdelivr CDN (not unpkg or other)', async () => {
      // jsdelivr is the documented CDN. Pin so a future swap is
      // visible.
      const { loadMindAR } = await import('../src/utils/mindarLoader');
      loadMindAR().catch(() => {});

      const script = document.querySelector('script[src*="mind-ar"]') as HTMLScriptElement;
      expect(script.src).toContain('cdn.jsdelivr.net');
    });
  });

  describe('cached promise behavior', () => {
    it('only injects ONE script tag across back-to-back calls', async () => {
      // The module caches loadPromise so a second call doesn't
      // double-inject the script. Pin via script-tag count.
      const { loadMindAR } = await import('../src/utils/mindarLoader');
      loadMindAR().catch(() => {/* never resolves in jsdom */});
      loadMindAR().catch(() => {/* same — uses cached promise */});

      const scripts = document.querySelectorAll('script[src*="mind-ar"]');
      expect(scripts.length).toBe(1);
    });

    it('clears the cached promise on script error so retry works', async () => {
      const { loadMindAR } = await import('../src/utils/mindarLoader');

      // First call — script is injected but never fires onload/onerror.
      // We fire onerror manually to simulate network failure.
      const firstPromise = loadMindAR();
      const firstScript = document.querySelector('script[src*="mind-ar"]') as HTMLScriptElement;
      firstScript.onerror?.(new Event('error'));
      await expect(firstPromise).rejects.toThrow(/Failed to load mind-ar/);

      // Second call must re-inject a fresh script (loadPromise was
      // cleared on error). Otherwise retries would be impossible.
      loadMindAR().catch(() => {});
      const scripts = document.querySelectorAll('script[src*="mind-ar"]');
      expect(scripts.length).toBe(2);
    });
  });

  describe('script onload behavior', () => {
    it('resolves when MINDAR.IMAGE.MindARThree becomes available after load', async () => {
      const { loadMindAR } = await import('../src/utils/mindarLoader');
      const loaderPromise = loadMindAR();
      const script = document.querySelector('script[src*="mind-ar"]') as HTMLScriptElement;

      // Pretend the bundle exposes the global, THEN fire onload.
      const fakeCtor = function FakeMindAR() {};
      (window as any).MINDAR = { IMAGE: { MindARThree: fakeCtor } };

      script.onload?.(new Event('load'));
      const result = await loaderPromise;
      expect(result.MindARThree).toBe(fakeCtor);

      delete (window as any).MINDAR;
    });
  });
});
