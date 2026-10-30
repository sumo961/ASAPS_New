import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getAppearance, setAppearance, isDark, applyAppearance, darkStylesheet, KEEP_COLORS } from '../appearance';

// Node 25 exposes its own global localStorage that throws without
// --localstorage-file; give each test a fresh in-memory Storage.
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => { m.delete(k); },
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
  };
}

function mockSystemDark(dark: boolean) {
  window.matchMedia = ((q: string) => ({
    matches: dark && q.includes('dark'), media: q, addEventListener() {}, removeEventListener() {},
  })) as any;
}

describe('appearance', () => {
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
    document.documentElement.className = '';
    document.getElementById('asaps-dark-mode')?.remove();
    mockSystemDark(false);
  });

  it('is light until set otherwise', () => {
    expect(getAppearance()).toBe('light');
    expect(isDark()).toBe(false);
  });

  it('dark puts the class on <html> and adds the stylesheet once', () => {
    setAppearance('dark');
    expect(localStorage.getItem('asaps_ui_appearance')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    applyAppearance();
    expect(document.querySelectorAll('#asaps-dark-mode')).toHaveLength(1);
    setAppearance('light');
    expect(localStorage.getItem('asaps_ui_appearance')).toBeNull();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('"As the system" follows the system setting', () => {
    setAppearance('system');
    expect(isDark()).toBe(false);
    mockSystemDark(true);
    expect(isDark()).toBe(true);
  });

  it('every mapped rule leaves the story stage alone, at no more weight than the class', () => {
    const css = darkStylesheet();
    const rules = css.split('\n').filter((l) => l.includes(':where(html.dark) .'));
    expect(rules.length).toBeGreaterThan(50);
    for (const r of rules) expect(r).toContain(`:where(:not(.${KEEP_COLORS} *))`);
    expect(css).toContain(':where(html.dark) .bg-white:where(');
    expect(css).toContain('.hover\\:bg-gray-50:hover');
  });
});
