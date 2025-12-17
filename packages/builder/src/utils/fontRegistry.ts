/**
 * Font Registry
 *
 * Manages available fonts including built-in system fonts and custom uploaded fonts.
 * Handles dynamic font loading via @font-face for custom fonts.
 */

import type { Asset } from '../components/assets/AssetManager';

export interface FontDefinition {
  /** Unique identifier for the font */
  id: string;
  /** Display name shown in UI */
  displayName: string;
  /** CSS font-family value */
  fontFamily: string;
  /** Whether this is a built-in system font or custom uploaded font */
  type: 'builtin' | 'custom';
  /** For custom fonts: the asset ID */
  assetId?: string;
  /** For custom fonts: the URL to the font file */
  url?: string;
  /** Whether this font has been loaded (for custom fonts) */
  loaded?: boolean;
}

/**
 * Built-in fonts that are available on most systems
 */
export const BUILTIN_FONTS: FontDefinition[] = [
  { id: 'arial', displayName: 'Arial', fontFamily: 'Arial, sans-serif', type: 'builtin' },
  { id: 'helvetica', displayName: 'Helvetica', fontFamily: 'Helvetica, Arial, sans-serif', type: 'builtin' },
  { id: 'times-new-roman', displayName: 'Times New Roman', fontFamily: 'Times New Roman, serif', type: 'builtin' },
  { id: 'georgia', displayName: 'Georgia', fontFamily: 'Georgia, serif', type: 'builtin' },
  { id: 'gothic', displayName: 'Gothic', fontFamily: 'Georgia, serif', type: 'builtin' },
  { id: 'courier-new', displayName: 'Courier New', fontFamily: 'Courier New, monospace', type: 'builtin' },
  { id: 'verdana', displayName: 'Verdana', fontFamily: 'Verdana, sans-serif', type: 'builtin' },
  { id: 'handwriting', displayName: 'Handwriting', fontFamily: 'Brush Script MT, cursive', type: 'builtin' },
  { id: 'handwriting2', displayName: 'Handwriting2', fontFamily: 'Lucida Handwriting, cursive', type: 'builtin' },
  { id: 'comic-sans', displayName: 'Comic Sans MS', fontFamily: 'Comic Sans MS, cursive', type: 'builtin' },
  { id: 'impact', displayName: 'Impact', fontFamily: 'Impact, sans-serif', type: 'builtin' },
  { id: 'trebuchet', displayName: 'Trebuchet MS', fontFamily: 'Trebuchet MS, sans-serif', type: 'builtin' },
  { id: 'palatino', displayName: 'Palatino', fontFamily: 'Palatino Linotype, Book Antiqua, Palatino, serif', type: 'builtin' },
];

// Track loaded custom fonts to avoid duplicate @font-face rules
const loadedFonts = new Set<string>();

// Style element for @font-face rules
let fontStyleElement: HTMLStyleElement | null = null;

/**
 * Get or create the style element for custom font definitions
 */
function getFontStyleElement(): HTMLStyleElement {
  if (!fontStyleElement) {
    fontStyleElement = document.createElement('style');
    fontStyleElement.id = 'asaps-custom-fonts';
    document.head.appendChild(fontStyleElement);
  }
  return fontStyleElement;
}

/**
 * Load a custom font via @font-face
 */
export function loadCustomFont(font: FontDefinition): void {
  if (font.type !== 'custom' || !font.url) return;
  if (loadedFonts.has(font.id)) return; // Already loaded

  const styleEl = getFontStyleElement();

  // Determine font format from URL
  let format = 'truetype';
  if (font.url.includes('.woff2')) format = 'woff2';
  else if (font.url.includes('.woff')) format = 'woff';
  else if (font.url.includes('.otf')) format = 'opentype';

  const fontFace = `
    @font-face {
      font-family: '${font.displayName}';
      src: url('${font.url}') format('${format}');
      font-weight: normal;
      font-style: normal;
      font-display: swap;
    }
  `;

  styleEl.textContent += fontFace;
  loadedFonts.add(font.id);
  console.log(`[FontRegistry] Loaded custom font: ${font.displayName}`);
}

/**
 * Convert font assets to FontDefinitions
 */
export function fontAssetsToDefinitions(assets: Asset[]): FontDefinition[] {
  return assets
    .filter(asset => asset.type === 'font')
    .map(asset => {
      // Use filename without extension as display name
      const displayName = asset.name.replace(/\.[^/.]+$/, '');

      return {
        id: `custom-${asset.id}`,
        displayName,
        fontFamily: `'${displayName}', sans-serif`,
        type: 'custom' as const,
        assetId: asset.id,
        url: asset.url,
        loaded: loadedFonts.has(`custom-${asset.id}`),
      };
    });
}

/**
 * Get all available fonts (built-in + custom from assets)
 */
export function getAllFonts(assets: Asset[]): FontDefinition[] {
  const customFonts = fontAssetsToDefinitions(assets);

  // Load any custom fonts that haven't been loaded yet
  customFonts.forEach(font => {
    if (!font.loaded) {
      loadCustomFont(font);
    }
  });

  return [...BUILTIN_FONTS, ...customFonts];
}

/**
 * Get font family CSS value by display name
 * Handles both built-in fonts and custom fonts
 */
export function getFontFamily(fontName: string, assets: Asset[] = []): string {
  // Check built-in fonts first (by displayName)
  const builtin = BUILTIN_FONTS.find(f => f.displayName === fontName);
  if (builtin) {
    return builtin.fontFamily;
  }

  // Check custom fonts
  const customFonts = fontAssetsToDefinitions(assets);
  const custom = customFonts.find(f => f.displayName === fontName);
  if (custom) {
    // Ensure font is loaded
    if (!custom.loaded) {
      loadCustomFont(custom);
    }
    return custom.fontFamily;
  }

  // Fallback: return as-is (might already be a CSS font-family value)
  return fontName;
}

/**
 * Preload all custom fonts from assets
 */
export function preloadFonts(assets: Asset[]): void {
  const customFonts = fontAssetsToDefinitions(assets);
  customFonts.forEach(loadCustomFont);
}

/**
 * Clear all loaded custom fonts
 */
export function clearCustomFonts(): void {
  if (fontStyleElement) {
    fontStyleElement.textContent = '';
  }
  loadedFonts.clear();
}
