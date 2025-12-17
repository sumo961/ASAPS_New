/**
 * useFonts Hook
 *
 * React hook for accessing available fonts including custom uploaded fonts.
 * Automatically loads custom fonts when they become available.
 */

import { useMemo, useEffect } from 'react';
import type { Asset } from '../components/assets/AssetManager';
import {
  getAllFonts,
  getFontFamily,
  preloadFonts,
  type FontDefinition,
} from '../utils/fontRegistry';

export interface UseFontsResult {
  /** All available fonts (built-in + custom) */
  fonts: FontDefinition[];
  /** Get CSS font-family value for a font name */
  getFontFamily: (fontName: string) => string;
  /** Just the built-in fonts */
  builtinFonts: FontDefinition[];
  /** Just the custom fonts from assets */
  customFonts: FontDefinition[];
}

/**
 * Hook to access and manage fonts
 *
 * @param assets - Current project assets (to extract font assets)
 * @returns Font utilities
 */
export function useFonts(assets: Asset[] = []): UseFontsResult {
  // Preload custom fonts when assets change
  useEffect(() => {
    preloadFonts(assets);
  }, [assets]);

  // Memoize the font list
  const allFonts = useMemo(() => getAllFonts(assets), [assets]);

  const builtinFonts = useMemo(
    () => allFonts.filter(f => f.type === 'builtin'),
    [allFonts]
  );

  const customFonts = useMemo(
    () => allFonts.filter(f => f.type === 'custom'),
    [allFonts]
  );

  // Memoize the getFontFamily function with assets
  const getFontFamilyWithAssets = useMemo(
    () => (fontName: string) => getFontFamily(fontName, assets),
    [assets]
  );

  return {
    fonts: allFonts,
    getFontFamily: getFontFamilyWithAssets,
    builtinFonts,
    customFonts,
  };
}
