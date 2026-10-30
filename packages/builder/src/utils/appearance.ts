/**
 * Appearance — App Preferences ▸ Appearance: Light, Dark, or as the system
 * is set (2026-10-30, class feedback: "Dark mode").
 *
 * The builder is styled with Tailwind's light colours, about 7,000 of them
 * across 120 components. Rather than give each a dark twin, dark mode maps
 * the common ones — the greys of panels, text and borders, and the pale
 * tints of notices and badges — to dark equivalents in one stylesheet,
 * switched on by the `dark` class on <html>. Strong colours (buttons,
 * badges in -500/-600) read on both and stay.
 *
 * What the story shows is never changed: the Visual Editor's stage and the
 * Preview's stage keep the story's own colours. Mark such an element with
 * `keep-colors` and nothing inside it is mapped.
 *
 * A setting of this computer, kept in localStorage; every open window
 * follows a change (the `storage` event reaches the others).
 */
import { useSyncExternalStore } from 'react';

export type Appearance = 'light' | 'dark' | 'system';

const KEY = 'asaps_ui_appearance';
const CHANGED = 'asaps:appearance-changed';
const STYLE_ID = 'asaps-dark-mode';
/** Elements whose colours dark mode leaves alone (the story's stage). */
export const KEEP_COLORS = 'keep-colors';

let fallback: Appearance = 'light';

export function getAppearance(): Appearance {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'dark' || v === 'system' ? v : 'light';
  } catch {
    return fallback;
  }
}

export function setAppearance(value: Appearance): void {
  fallback = value;
  try {
    if (value === 'light') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, value);
  } catch { /* lasts for this window only */ }
  applyAppearance();
  window.dispatchEvent(new CustomEvent(CHANGED, { detail: { value } }));
}

function systemIsDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Is the builder drawn dark now? */
export function isDark(appearance: Appearance = getAppearance()): boolean {
  return appearance === 'dark' || (appearance === 'system' && systemIsDark());
}

/** Put the page in the chosen appearance. */
export function applyAppearance(): void {
  const dark = isDark();
  const root = document.documentElement;
  root.classList.toggle('dark', dark);
  root.style.colorScheme = dark ? 'dark' : 'light';
  if (dark && !document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = darkStylesheet();
    document.head.appendChild(style);
  }
}

/** Apply now, and again whenever the setting or the system changes. Call once per window. */
export function initAppearance(): void {
  applyAppearance();
  window.addEventListener('storage', (e) => { if (e.key === KEY || e.key === null) applyAppearance(); });
  window.addEventListener(CHANGED, applyAppearance);
  if (typeof window.matchMedia === 'function') {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyAppearance);
  }
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
export function useAppearance(): Appearance {
  return useSyncExternalStore(subscribe, getAppearance, getAppearance);
}

function subscribeDark(onChange: () => void): () => void {
  const off = subscribe(onChange);
  const mq = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  mq?.addEventListener?.('change', onChange);
  return () => { off(); mq?.removeEventListener?.('change', onChange); };
}

/**
 * Is the builder drawn dark? For the few places that colour with inline
 * styles (the flowchart's beats), which the stylesheet can't reach.
 */
export function useIsDark(): boolean {
  return useSyncExternalStore(subscribeDark, () => isDark(), () => false);
}

// ── The dark stylesheet ────────────────────────────────────────────────

/** Neutral greys, light → dark. Tailwind's gray and slate both map here. */
const SURFACE: Record<string, string> = {
  white: '#202329', '50': '#25282f', '100': '#2b2f36', '200': '#353a42', '300': '#434851', '400': '#596069',
};
const SURFACE_HOVER: Record<string, string> = {
  white: '#2a2e35', '50': '#2a2e35', '100': '#30343c', '200': '#3a3f48', '300': '#474c56',
};
const TEXT: Record<string, string> = {
  black: '#f1f3f5', '900': '#f1f3f5', '800': '#e4e7eb', '700': '#d1d5db', '600': '#b8bec7', '500': '#9ca3af', '400': '#858b94', '300': '#626873',
};
const BORDER: Record<string, string> = {
  '100': '#2b2f36', '200': '#343840', '300': '#40454e', '400': '#565c66',
};

/** Tailwind's -500 (for tints) and -300/-200/-100/-400 (for text) of each hue. */
const HUES: Record<string, { rgb: string; t400: string; t300: string; t200: string; t100: string }> = {
  blue: { rgb: '59,130,246', t400: '#60a5fa', t300: '#93c5fd', t200: '#bfdbfe', t100: '#dbeafe' },
  indigo: { rgb: '99,102,241', t400: '#818cf8', t300: '#a5b4fc', t200: '#c7d2fe', t100: '#e0e7ff' },
  purple: { rgb: '168,85,247', t400: '#c084fc', t300: '#d8b4fe', t200: '#e9d5ff', t100: '#f3e8ff' },
  violet: { rgb: '139,92,246', t400: '#a78bfa', t300: '#c4b5fd', t200: '#ddd6fe', t100: '#ede9fe' },
  primary: { rgb: '139,92,246', t400: '#a78bfa', t300: '#c4b5fd', t200: '#ddd6fe', t100: '#ede9fe' },
  green: { rgb: '34,197,94', t400: '#4ade80', t300: '#86efac', t200: '#bbf7d0', t100: '#dcfce7' },
  emerald: { rgb: '16,185,129', t400: '#34d399', t300: '#6ee7b7', t200: '#a7f3d0', t100: '#d1fae5' },
  red: { rgb: '239,68,68', t400: '#f87171', t300: '#fca5a5', t200: '#fecaca', t100: '#fee2e2' },
  rose: { rgb: '244,63,94', t400: '#fb7185', t300: '#fda4af', t200: '#fecdd3', t100: '#ffe4e6' },
  amber: { rgb: '245,158,11', t400: '#fbbf24', t300: '#fcd34d', t200: '#fde68a', t100: '#fef3c7' },
  yellow: { rgb: '234,179,8', t400: '#facc15', t300: '#fde047', t200: '#fef08a', t100: '#fef9c3' },
  orange: { rgb: '249,115,22', t400: '#fb923c', t300: '#fdba74', t200: '#fed7aa', t100: '#ffedd5' },
  teal: { rgb: '20,184,166', t400: '#2dd4bf', t300: '#5eead4', t200: '#99f6e4', t100: '#ccfbf1' },
  cyan: { rgb: '6,182,212', t400: '#22d3ee', t300: '#67e8f9', t200: '#a5f3fc', t100: '#cffafe' },
  sky: { rgb: '14,165,233', t400: '#38bdf8', t300: '#7dd3fc', t200: '#bae6fd', t100: '#e0f2fe' },
  pink: { rgb: '236,72,153', t400: '#f472b6', t300: '#f9a8d4', t200: '#fbcfe8', t100: '#fce7f3' },
  fuchsia: { rgb: '217,70,239', t400: '#e879f9', t300: '#f0abfc', t200: '#f5d0fe', t100: '#fae8ff' },
  lime: { rgb: '132,204,22', t400: '#a3e635', t300: '#bef264', t200: '#d9f99d', t100: '#ecfccb' },
};

/** `.hover\:bg-gray-50:hover` for ('hover', 'bg-gray-50'). */
function sel(cls: string, variant?: 'hover' | 'focus' | 'disabled' | 'group-hover'): string {
  const esc = cls.replace(/\//g, '\\/');
  if (!variant) return `.${esc}`;
  if (variant === 'group-hover') return `.group:hover .group-hover\\:${esc}`;
  return `.${variant}\\:${esc}:${variant}`;
}

/**
 * Rules that apply in dark mode, outside any `keep-colors` element. The
 * scoping is in :where() so each rule weighs what the Tailwind class does:
 * coming later, it wins over that class, but a component's own hover colour
 * (`hover:bg-blue-600`) still wins over a mapped background.
 */
function rule(selectors: string[], decl: string): string {
  const scoped = selectors.map((s) => `:where(html.dark) ${s}:where(:not(.${KEEP_COLORS} *))`);
  return `${scoped.join(',\n')} { ${decl} }`;
}

export function darkStylesheet(): string {
  const out: string[] = [];
  const greys = ['gray', 'slate', 'zinc', 'neutral', 'stone'];

  // The page itself, form controls and the default border colour (Tailwind's
  // preflight sets it on every element; :where keeps this as weak as that).
  out.push(`html.dark body { background-color: #17191d; color: ${TEXT['800']}; }`);
  out.push(`:where(html.dark) :where(*:not(.${KEEP_COLORS} *)), :where(html.dark) :where(*:not(.${KEEP_COLORS} *))::before, :where(html.dark) :where(*:not(.${KEEP_COLORS} *))::after { border-color: ${BORDER['200']}; }`);
  out.push(`html.dark .${KEEP_COLORS} { color-scheme: light; color: #000; }`);
  out.push(`:where(html.dark) :where(input, select, textarea):where(:not(.${KEEP_COLORS} *)) { background-color: #1a1d22; }`);
  out.push(`:where(html.dark) :where(input, textarea):where(:not(.${KEEP_COLORS} *))::placeholder { color: ${TEXT['400']}; }`);

  for (const [shade, color] of Object.entries(SURFACE)) {
    const names = shade === 'white' ? ['bg-white'] : greys.map((g) => `bg-${g}-${shade}`);
    out.push(rule(names.map((n) => sel(n)).concat(names.map((n) => sel(n, 'disabled'))), `background-color: ${color};`));
  }
  for (const [shade, color] of Object.entries(SURFACE_HOVER)) {
    const names = shade === 'white' ? ['bg-white'] : greys.map((g) => `bg-${g}-${shade}`);
    out.push(rule(names.flatMap((n) => [sel(n, 'hover'), sel(n, 'group-hover')]), `background-color: ${color};`));
  }
  for (const [shade, color] of Object.entries(TEXT)) {
    const names = shade === 'black' ? ['text-black'] : greys.map((g) => `text-${g}-${shade}`);
    out.push(rule(names.flatMap((n) => [sel(n), sel(n, 'hover'), sel(n, 'group-hover')]), `color: ${color};`));
  }
  for (const [shade, color] of Object.entries(BORDER)) {
    const names = greys.map((g) => `border-${g}-${shade}`);
    out.push(rule(names.flatMap((n) => [sel(n), sel(n, 'hover')]), `border-color: ${color};`));
    out.push(rule(greys.map((g) => `.divide-${g}-${shade} > :not([hidden]) ~ :not([hidden])`), `border-color: ${color};`));
  }
  // Translucent white panels (the opacity variants the components use).
  out.push(rule(['60', '70', '80', '90', '95'].map((o) => sel(`bg-white/${o}`)), 'background-color: rgba(32,35,41,0.92);'));
  out.push(rule(greys.map((g) => sel(`bg-${g}-100/80`)), `background-color: ${SURFACE['100']};`));
  // Grey gradients (a character card without a portrait).
  for (const shade of ['50', '100', '200']) {
    out.push(rule(greys.map((g) => `.from-${g}-${shade}`), `--tw-gradient-from: ${SURFACE[shade]} var(--tw-gradient-from-position); --tw-gradient-to: transparent var(--tw-gradient-to-position); --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to);`));
    out.push(rule(greys.map((g) => `.to-${g}-${shade}`), `--tw-gradient-to: ${SURFACE[shade]} var(--tw-gradient-to-position);`));
  }

  // The flowchart's own controls (ReactFlow 11 has no dark mode of its own).
  out.push(rule(['.react-flow__controls-button'], `background: ${SURFACE['100']}; border-bottom-color: ${BORDER['200']}; color: ${TEXT['700']}; fill: ${TEXT['700']};`));
  out.push(rule(['.react-flow__controls-button:hover'], `background: ${SURFACE['200']};`));
  out.push(rule(['.react-flow__minimap'], `background-color: ${SURFACE.white};`));
  out.push(rule(['.react-flow__attribution'], 'background: transparent;'));
  out.push(rule(['.react-flow__edge-textbg'], `fill: ${SURFACE.white};`));
  out.push(rule(['.react-flow__edge-text'], `fill: ${TEXT['700']};`));

  for (const [hue, h] of Object.entries(HUES)) {
    const tint = (a: number) => `background-color: rgba(${h.rgb},${a});`;
    out.push(rule([sel(`bg-${hue}-50`), ...['30', '40', '50', '60', '95'].map((o) => sel(`bg-${hue}-50/${o}`))], tint(0.1)));
    out.push(rule([sel(`bg-${hue}-100`), sel(`bg-${hue}-100/50`)], tint(0.18)));
    out.push(rule([sel(`bg-${hue}-200`)], tint(0.28)));
    out.push(rule([sel(`bg-${hue}-50`, 'hover'), sel(`bg-${hue}-50`, 'group-hover')], tint(0.16)));
    out.push(rule([sel(`bg-${hue}-100`, 'hover'), sel(`bg-${hue}-100`, 'group-hover')], tint(0.24)));
    out.push(rule([sel(`bg-${hue}-200`, 'hover')], tint(0.32)));
    out.push(rule([`.from-${hue}-50`], `--tw-gradient-from: rgba(${h.rgb},0.12) var(--tw-gradient-from-position); --tw-gradient-to: rgba(${h.rgb},0) var(--tw-gradient-to-position); --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to);`));
    out.push(rule([`.to-${hue}-50`], `--tw-gradient-to: rgba(${h.rgb},0.12) var(--tw-gradient-to-position);`));

    const text: Array<[string, string]> = [['600', h.t400], ['700', h.t300], ['800', h.t200], ['900', h.t100]];
    for (const [shade, color] of text) {
      out.push(rule([sel(`text-${hue}-${shade}`), sel(`text-${hue}-${shade}`, 'hover'), sel(`text-${hue}-${shade}`, 'group-hover')], `color: ${color};`));
    }
    out.push(rule([sel(`border-${hue}-100`), sel(`border-${hue}-200`), sel(`border-${hue}-200/60`), sel(`border-${hue}-200/70`)], `border-color: rgba(${h.rgb},0.32);`));
    out.push(rule([sel(`border-${hue}-300`), sel(`border-${hue}-300`, 'hover')], `border-color: rgba(${h.rgb},0.5);`));
  }
  return out.join('\n');
}
