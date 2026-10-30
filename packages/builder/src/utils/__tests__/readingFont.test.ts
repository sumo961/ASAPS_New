import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { getReadingFont, setReadingFont, applyReadingFont, readingFontStylesheet, readingFontFile, READING_FONTS } from '../readingFont';
import { KEEP_COLORS } from '../appearance';

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

const opendyslexic = READING_FONTS.find(f => f.id === 'opendyslexic')!;

describe('reading font', () => {
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
    document.documentElement.className = '';
    document.getElementById('asaps-reading-font')?.remove();
  });

  it('is the standard font until chosen', () => {
    expect(getReadingFont()).toBe('standard');
    applyReadingFont();
    expect(document.documentElement.classList.contains('reading-font')).toBe(false);
    expect(document.getElementById('asaps-reading-font')).toBeNull();
  });

  it('a chosen font puts the class on <html> and one stylesheet in', () => {
    setReadingFont('lexend');
    expect(localStorage.getItem('asaps_ui_reading_font')).toBe('lexend');
    expect(document.documentElement.classList.contains('reading-font')).toBe(true);
    setReadingFont('opendyslexic');
    const styles = document.querySelectorAll('#asaps-reading-font');
    expect(styles).toHaveLength(1);
    expect(styles[0].textContent).toContain('ASAPS Reading OpenDyslexic');
  });

  it('back to standard removes the class and the stylesheet', () => {
    setReadingFont('atkinson');
    setReadingFont('standard');
    expect(localStorage.getItem('asaps_ui_reading_font')).toBeNull();
    expect(document.documentElement.classList.contains('reading-font')).toBe(false);
    expect(document.getElementById('asaps-reading-font')).toBeNull();
  });

  it('ignores a stored value it does not know', () => {
    localStorage.setItem('asaps_ui_reading_font', 'comic');
    expect(getReadingFont()).toBe('standard');
  });

  it('the story stage keeps the standard font', () => {
    const css = readingFontStylesheet(opendyslexic);
    expect(css).toContain(`html.reading-font .${KEEP_COLORS} { font-family: ui-sans-serif`);
    expect(css).toMatch(/font-weight: 400;[\s\S]*font-weight: 700;/);
    expect(css).toContain('size-adjust: 88%');
    expect(readingFontStylesheet(READING_FONTS[0])).not.toContain('size-adjust');
  });

  it('every reading font has its regular and bold file next to the page', () => {
    const dir = path.resolve(__dirname, '../../../public/fonts/reading');
    for (const f of READING_FONTS) {
      for (const w of [400, 700]) expect(fs.existsSync(path.join(dir, `${f.stem}-latin-${w}-normal.woff2`))).toBe(true);
      expect(fs.existsSync(path.join(dir, `${f.stem}-OFL.txt`))).toBe(true);
    }
  });

  it('a story gets the regular file, named so its font settings store the font name', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      expect(url).toContain('fonts/reading/opendyslexic-latin-400-normal.woff2');
      return new Response(new Blob([new Uint8Array([1, 2, 3])]));
    }));
    const file = await readingFontFile(opendyslexic);
    expect(file.name).toBe('OpenDyslexic.woff2');
    expect(file.type).toBe('font/woff2');
  });

  it('says so when the file cannot be read', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
    await expect(readingFontFile(opendyslexic)).rejects.toThrow('OpenDyslexic could not be read (404)');
  });
});
