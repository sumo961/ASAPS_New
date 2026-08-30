import { describe, it, expect, beforeEach } from 'vitest';
import { readSavedViewport, saveViewport } from '../graphViewportMemory';

// Node 25 ships its own `localStorage` global that shadows jsdom's and throws
// without --localstorage-file; shim it the way useAI.test.ts does.
function installStorageShim() {
  const store = new Map<string, string>();
  const shim = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: shim, configurable: true });
  Object.defineProperty(window, 'localStorage', { value: shim, configurable: true });
  return store;
}

describe('per-project graph viewport memory', () => {
  let store: Map<string, string>;
  beforeEach(() => { store = installStorageShim(); });

  it('round-trips a viewport keyed by project id', () => {
    saveViewport('p1', { x: 12.5, y: -30, zoom: 0.8 });
    expect(readSavedViewport('p1')).toEqual({ x: 12.5, y: -30, zoom: 0.8 });
    expect(readSavedViewport('p2')).toBeNull();
  });

  it('has nothing to say without a project id (untitled projects fit to view)', () => {
    saveViewport(undefined, { x: 1, y: 1, zoom: 1 });
    expect(store.size).toBe(0);
    expect(readSavedViewport(undefined)).toBeNull();
  });

  it('ignores corrupt or impossible stored values', () => {
    store.set('asaps.graphViewport.p1', '{not json');
    expect(readSavedViewport('p1')).toBeNull();
    store.set('asaps.graphViewport.p1', JSON.stringify({ x: 0, y: 0, zoom: 0 }));
    expect(readSavedViewport('p1')).toBeNull();
  });
});
