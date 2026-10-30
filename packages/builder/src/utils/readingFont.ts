/**
 * Reading font — App Preferences ▸ Appearance ▸ Reading font: the builder's
 * own screens in a font made for easier reading (2026-10-30, class
 * feedback: "dyslexia-friendly font").
 *
 * Three free fonts (SIL Open Font License) ship in public/fonts/reading:
 * Lexend, Atkinson Hyperlegible and OpenDyslexic. Readers differ in which
 * helps, so the choice is theirs. The same files are offered to stories in
 * Project Settings ▸ Fonts, where picking one copies it into the project
 * (see `readingFontFile`) — what the story shows is set there, never here:
 * the stage (`keep-colors`) keeps the builder's standard font.
 *
 * A setting of this computer, kept in localStorage; every open window
 * follows a change (the `storage` event reaches the others).
 */
import { useSyncExternalStore } from 'react';
import { KEEP_COLORS } from './appearance';

export interface ReadingFontDef {
  id: 'lexend' | 'atkinson' | 'opendyslexic';
  /** The name shown, and the family name a story stores. */
  name: string;
  /** File stem in public/fonts/reading ("{stem}-latin-400-normal.woff2"). */
  stem: string;
  /** What the font is like, one short sentence (App Preferences shows it under the choice). */
  about: string;
  /** OpenDyslexic draws large; shrink it in the builder so panels keep their fit. */
  uiSizeAdjust?: string;
}

export const READING_FONTS: ReadingFontDef[] = [
  { id: 'lexend', name: 'Lexend', stem: 'lexend', about: 'Plain, evenly spaced letters.' },
  { id: 'atkinson', name: 'Atkinson Hyperlegible', stem: 'atkinson-hyperlegible', about: 'Letters hard to confuse: I, l, 1, O, 0.' },
  { id: 'opendyslexic', name: 'OpenDyslexic', stem: 'opendyslexic', about: 'Weighted bottoms keep b, d, p, q apart.', uiSizeAdjust: '88%' },
];

export type ReadingFont = 'standard' | ReadingFontDef['id'];

const KEY = 'asaps_ui_reading_font';
const CHANGED = 'asaps:reading-font-changed';
const STYLE_ID = 'asaps-reading-font';
/** The builder's own font, Tailwind's sans stack — the stage goes back to it. */
const STANDARD_STACK = 'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"';

let fallback: ReadingFont = 'standard';

function isReadingFont(v: unknown): v is ReadingFont {
  return v === 'standard' || READING_FONTS.some(f => f.id === v);
}

export function getReadingFont(): ReadingFont {
  try {
    const v = localStorage.getItem(KEY);
    return isReadingFont(v) ? v : 'standard';
  } catch {
    return fallback;
  }
}

export function setReadingFont(value: ReadingFont): void {
  fallback = value;
  try {
    if (value === 'standard') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, value);
  } catch { /* lasts for this window only */ }
  applyReadingFont();
  window.dispatchEvent(new CustomEvent(CHANGED, { detail: { value } }));
}

/** URL of a reading font's file, next to the builder's page (works from file:// in the desktop app). */
export function readingFontUrl(def: ReadingFontDef, weight: 400 | 700 = 400): string {
  return new URL(`fonts/reading/${def.stem}-latin-${weight}-normal.woff2`, document.baseURI).href;
}

/** The stylesheet that puts the builder in `def`. */
export function readingFontStylesheet(def: ReadingFontDef): string {
  const family = `ASAPS Reading ${def.name}`;
  const face = (weight: 400 | 700) => `@font-face {
  font-family: '${family}';
  src: url('${readingFontUrl(def, weight)}') format('woff2');
  font-weight: ${weight};
  font-style: normal;
  font-display: swap;${def.uiSizeAdjust ? `\n  size-adjust: ${def.uiSizeAdjust};` : ''}
}`;
  return `${face(400)}
${face(700)}
html.reading-font { font-family: '${family}', ${STANDARD_STACK}; }
html.reading-font .${KEEP_COLORS} { font-family: ${STANDARD_STACK}; }
`;
}

/** Put the page in the chosen reading font. */
export function applyReadingFont(): void {
  const def = READING_FONTS.find(f => f.id === getReadingFont());
  const root = document.documentElement;
  root.classList.toggle('reading-font', !!def);
  let style = document.getElementById(STYLE_ID);
  if (!def) {
    style?.remove();
    return;
  }
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = readingFontStylesheet(def);
}

/** Apply now, and again whenever the setting changes. Call once per window. */
export function initReadingFont(): void {
  applyReadingFont();
  window.addEventListener('storage', (e) => { if (e.key === KEY || e.key === null) applyReadingFont(); });
  window.addEventListener(CHANGED, applyReadingFont);
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => { if (e.key === KEY || e.key === null) onChange(); };
  window.addEventListener(CHANGED, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

/** Re-renders when the setting changes, in this window or another. */
export function useReadingFont(): ReadingFont {
  return useSyncExternalStore(subscribe, getReadingFont, getReadingFont);
}

/**
 * A reading font as a file to add to a story ("OpenDyslexic.woff2"): the
 * builder names a font asset after its file, so the story's font settings
 * store "OpenDyslexic" and exports and the player register it under that
 * name. Only the regular weight goes in; bold is drawn from it.
 */
export async function readingFontFile(def: ReadingFontDef): Promise<File> {
  const res = await fetch(readingFontUrl(def, 400));
  if (!res.ok) throw new Error(`${def.name} could not be read (${res.status})`);
  return new File([await res.blob()], `${def.name}.woff2`, { type: 'font/woff2' });
}
