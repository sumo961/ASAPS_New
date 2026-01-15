/**
 * Ren'Py Theme Import Module
 *
 * Provides utilities for importing Ren'Py visual novel themes into ASAPS,
 * converting them to the ThemeDefinition format.
 *
 * @example
 * ```typescript
 * import { extractRenpyAssets, convertRenpyToTheme, validateRenpyZip } from '@asaps/core/renpy';
 *
 * // Validate a ZIP file
 * const validation = await validateRenpyZip(file);
 * if (!validation.valid) {
 *   console.error(validation.errors);
 *   return;
 * }
 *
 * // Extract assets and convert to theme
 * const bundle = await extractRenpyAssets(file);
 * const result = convertRenpyToTheme(bundle, {
 *   themeName: 'My VN Theme',
 *   author: 'Developer',
 * });
 *
 * // result.theme is the ThemeDefinition
 * // result.fontAssets and result.graphicAssets are the assets to store
 * ```
 */

// Parser exports
export {
  parseGuiRpy,
  parseOptionsRpy,
  detectResolution,
  type RenpyGuiData,
} from './RenpyGuiParser';

// Asset extractor exports
export {
  extractRenpyAssets,
  extractRenpyAssetsPartial,
  validateRenpyZip,
  type RenpyFontAsset,
  type RenpyGraphicAsset,
  type RenpyMetadata,
  type RenpyAssetBundle,
} from './RenpyAssetExtractor';

// Theme converter exports
export {
  convertRenpyToTheme,
  convertRenpyGuiToThemePreview,
  estimateRenpyThemeSize,
  type RenpyConversionOptions,
  type RenpyConversionResult,
} from './RenpyThemeConverter';
