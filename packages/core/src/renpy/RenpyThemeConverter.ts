/**
 * Ren'Py Theme Converter
 *
 * Converts extracted Ren'Py GUI data and assets into ASAPS ThemeDefinition format.
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  ThemeDefinition,
  ThemeColor,
  ThemeFont,
  ThemeAssetRef,
  ThemeAssetRole,
} from '../types/theme';
import type { RenpyGuiData } from './RenpyGuiParser';
import type { RenpyAssetBundle, RenpyFontAsset, RenpyGraphicAsset } from './RenpyAssetExtractor';

/**
 * Options for theme conversion
 */
export interface RenpyConversionOptions {
  /** Name for the imported theme */
  themeName: string;
  /** Optional author name (overrides options.rpy) */
  author?: string;
  /** Target resolution for ASAPS (for scaling) */
  targetResolution?: { width: number; height: number };
  /** Whether to use CSS border-image for textbox frame */
  useBorderImage?: boolean;
  /** Tags to add to the theme */
  tags?: string[];
  /** ASAPS version for compatibility */
  asapsVersion?: string;
}

/**
 * Result of theme conversion including assets to store
 */
export interface RenpyConversionResult {
  /** The converted theme definition */
  theme: ThemeDefinition;
  /** Font assets to store (with generated IDs) */
  fontAssets: Array<{
    asset: RenpyFontAsset;
    id: string;
    role: ThemeAssetRole;
    fontFamily: string;
  }>;
  /** Graphic assets to store (with generated IDs) */
  graphicAssets: Array<{
    asset: RenpyGraphicAsset;
    id: string;
    role: ThemeAssetRole;
  }>;
}

/**
 * Convert a hex color string to ThemeColor
 */
function toThemeColor(hex?: string, alpha = 1): ThemeColor {
  return {
    hex: hex || '#000000',
    alpha,
  };
}

/**
 * Derive a lighter shade of a color for hover states
 */
function lightenColor(hex: string, amount = 0.2): string {
  // Parse hex to RGB
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  // Lighten
  const newR = Math.min(255, Math.round(r + (255 - r) * amount));
  const newG = Math.min(255, Math.round(g + (255 - g) * amount));
  const newB = Math.min(255, Math.round(b + (255 - b) * amount));

  // Convert back to hex
  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
}

/**
 * Derive a darker shade of a color
 */
function darkenColor(hex: string, amount = 0.2): string {
  // Parse hex to RGB
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  // Darken
  const newR = Math.round(r * (1 - amount));
  const newG = Math.round(g * (1 - amount));
  const newB = Math.round(b * (1 - amount));

  // Convert back to hex
  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
}

/**
 * Calculate scale factor for converting Ren'Py values to ASAPS
 */
function calculateScaleFactor(
  sourceRes: { width: number; height: number },
  targetRes: { width: number; height: number }
): number {
  // Use height as the scaling basis (more consistent for UI elements)
  return targetRes.height / sourceRes.height;
}

/**
 * Scale a numeric value from Ren'Py resolution to ASAPS resolution
 */
function scaleValue(value: number, scaleFactor: number): number {
  return Math.round(value * scaleFactor);
}

/**
 * Convert yalign (0-1) to text box position
 */
function yalignToPosition(yalign?: number): 'bottom' | 'top' | 'center' | 'custom' {
  if (yalign === undefined || yalign >= 0.8) {
    return 'bottom';
  }
  if (yalign <= 0.2) {
    return 'top';
  }
  if (yalign >= 0.4 && yalign <= 0.6) {
    return 'center';
  }
  return 'custom';
}

/**
 * Generate a CSS-safe font family name from filename
 * Returns the clean font name without quotes - CSS will handle quoting as needed
 */
function generateFontFamily(filename: string): string {
  // Remove extension and clean up
  const name = filename
    .replace(/\.(ttf|otf|woff|woff2)$/i, '')
    .replace(/[-_]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim();

  // Return clean name without quotes - CSS font-family handles quoting automatically
  return name;
}

/**
 * Map Ren'Py font role to ASAPS ThemeAssetRole
 * Note: RenpyAssetExtractor now returns ThemeAssetRole-compatible values directly,
 * so this is mostly a pass-through for type consistency.
 */
function mapFontRoleToAssetRole(role: RenpyFontAsset['role']): ThemeAssetRole {
  // RenpyFontAsset.role now uses ThemeAssetRole values directly
  return role as ThemeAssetRole;
}

/**
 * Map Ren'Py graphic role to ASAPS ThemeAssetRole
 */
function mapGraphicRoleToAssetRole(role: RenpyGraphicAsset['role']): ThemeAssetRole {
  switch (role) {
    case 'textbox':
      return 'textbox-frame';
    case 'namebox':
      return 'textbox-frame'; // ASAPS doesn't have separate namebox
    case 'button-idle':
      return 'button-normal';
    case 'button-hover':
      return 'button-hover';
    case 'button-selected':
      return 'button-active';
    case 'choice-idle':
      return 'button-normal';
    case 'choice-hover':
      return 'button-hover';
    default:
      return role;
  }
}

/**
 * Convert Ren'Py GUI data and assets to ASAPS ThemeDefinition
 *
 * @param bundle - Extracted Ren'Py asset bundle
 * @param options - Conversion options
 * @returns Conversion result with theme and assets to store
 *
 * @example
 * ```typescript
 * const bundle = await extractRenpyAssets(zipFile);
 * const result = convertRenpyToTheme(bundle, {
 *   themeName: 'My VN Theme',
 *   author: 'Game Developer',
 * });
 * // Store assets and apply theme
 * ```
 */
export function convertRenpyToTheme(
  bundle: RenpyAssetBundle,
  options: RenpyConversionOptions
): RenpyConversionResult {
  const { guiData, fonts, uiGraphics, metadata } = bundle;
  const themeId = uuidv4();
  const now = new Date().toISOString();

  // Calculate scale factor
  const sourceRes = metadata.resolution;
  const targetRes = options.targetResolution || { width: 1024, height: 768 };
  const scaleFactor = calculateScaleFactor(sourceRes, targetRes);

  // Process fonts and assign IDs
  const fontAssets: RenpyConversionResult['fontAssets'] = fonts.map((font) => ({
    asset: font,
    id: uuidv4(),
    role: mapFontRoleToAssetRole(font.role),
    fontFamily: generateFontFamily(font.filename),
  }));

  // Process graphics and assign IDs
  const graphicAssets: RenpyConversionResult['graphicAssets'] = uiGraphics.map((graphic) => ({
    asset: graphic,
    id: uuidv4(),
    role: mapGraphicRoleToAssetRole(graphic.role),
  }));

  // Find specific assets
  const textboxAsset = graphicAssets.find((a) => a.role === 'textbox-frame');
  // Look for dialog-font first, then body-font as fallback
  const dialogFont = fontAssets.find((f) => f.role === 'dialog-font') ||
                     fontAssets.find((f) => f.role === 'body-font');
  const buttonFont = fontAssets.find((f) => f.role === 'button-font');
  const titleFont = fontAssets.find((f) => f.role === 'title-font');

  // Build color palette
  const accentColor = guiData.colors.accent || '#cc6600';
  const textColor = guiData.colors.text || '#ffffff';
  const idleColor = guiData.colors.idle || '#888888';
  const hoverColor = guiData.colors.hover || lightenColor(accentColor);
  const insensitiveColor = guiData.colors.insensitive || '#444444';
  const backgroundColor = darkenColor(accentColor, 0.85);
  const surfaceColor = darkenColor(accentColor, 0.75);

  // Build fonts config
  const baseFontSize = guiData.fonts.textSize || 28;
  const scaledFontSize = scaleValue(baseFontSize, scaleFactor);

  // Title text size: prefer gui.title_text_size, then title.textSize, fallback to 75 (Ren'Py default)
  const titleTextSize = guiData.title?.textSize || guiData.fonts.titleTextSize || 75;

  // Get font family names from loaded assets (these are proper CSS font-family values)
  // Fallback to 'serif' / 'sans-serif' if no asset was loaded
  const titleFontFamily = titleFont?.fontFamily || 'serif';
  const dialogFontFamily = dialogFont?.fontFamily || 'sans-serif';
  // Button font: prefer button-font asset, then title/interface font, then dialog font
  const buttonFontFamily = buttonFont?.fontFamily || titleFont?.fontFamily || dialogFont?.fontFamily || 'sans-serif';

  const fonts_config = {
    title: {
      family: titleFontFamily,
      size: scaleValue(titleTextSize, scaleFactor),
      weight: 'bold' as const,
    },
    body: {
      family: dialogFontFamily,
      size: scaledFontSize,
      lineHeight: 1.5,
    },
    button: {
      family: buttonFontFamily,
      size: scaleValue(guiData.fonts.interfaceTextSize || guiData.fonts.textSize || 24, scaleFactor),
      weight: 'normal' as const,
    },
    dialog: {
      family: dialogFontFamily,
      size: scaledFontSize,
      lineHeight: 1.6,
    },
    scale: 1,
  };

  // Build text box config
  const textBoxPosition = yalignToPosition(guiData.textbox.yalign);
  const textBox_config: ThemeDefinition['textBox'] = {
    borderWidth: 0, // VN style typically uses images, not borders
    borderRadius: 0,
    padding: scaleValue(
      Math.max(guiData.textbox.dialogueXpos || 20, guiData.textbox.dialogueYpos || 20),
      scaleFactor
    ),
    opacity: 0.9,
    position: textBoxPosition,
    hideTitleTextBox: true, // VN style - title/author text floats over background without boxes
    ...(textboxAsset && options.useBorderImage !== false
      ? { frameAssetId: textboxAsset.id }
      : {}),
    ...(textBoxPosition === 'custom' && guiData.textbox.height
      ? {
          customPosition: {
            x: 0,
            y: guiData.textbox.yalign
              ? Math.round(guiData.textbox.yalign * targetRes.height)
              : targetRes.height - scaleValue(guiData.textbox.height, scaleFactor),
            width: targetRes.width,
            height: scaleValue(guiData.textbox.height, scaleFactor),
          },
        }
      : {}),
  };

  // Build button config
  const buttonBorders = guiData.button.borders || [6, 6, 6, 6];
  const buttonTextIdleColor = guiData.button.textIdleColor || idleColor;
  const buttonTextHoverColor = guiData.button.textHoverColor || hoverColor;

  // Find button graphics from extracted assets
  const buttonNormalAsset = graphicAssets.find(g => g.role === 'button-normal');
  const buttonHoverAsset = graphicAssets.find(g => g.role === 'button-hover');

  const button_config: ThemeDefinition['button'] = {
    background: toThemeColor(darkenColor(accentColor, 0.6), 0.8),
    hoverBackground: toThemeColor(accentColor, 0.9),
    activeBackground: toThemeColor(darkenColor(accentColor, 0.3)),
    disabledBackground: toThemeColor(insensitiveColor, 0.5),
    textColor: toThemeColor(buttonTextIdleColor),
    borderColor: toThemeColor(accentColor, 0.5),
    borderWidth: 1,
    borderRadius: 4,
    padding: {
      horizontal: scaleValue(buttonBorders[0] + buttonBorders[2], scaleFactor),
      vertical: scaleValue(buttonBorders[1] + buttonBorders[3], scaleFactor),
    },
    transitionDuration: 200,
    // Button graphics (from Ren'Py choice/button folders)
    backgroundImageId: buttonNormalAsset?.id,
    hoverBackgroundImageId: buttonHoverAsset?.id,
    // Button layout positioning (from Ren'Py choice positioning)
    layout: (guiData.choice.ypos !== undefined || guiData.choice.spacing !== undefined ||
             guiData.choice.buttonWidth !== undefined || guiData.choice.buttonHeight !== undefined) ? {
      // Convert ypos from pixels to 0-1 scale (based on target resolution)
      yAlign: guiData.choice.ypos !== undefined
        ? scaleValue(guiData.choice.ypos, scaleFactor) / targetRes.height
        : undefined,
      spacing: guiData.choice.spacing !== undefined
        ? scaleValue(guiData.choice.spacing, scaleFactor)
        : undefined,
      width: guiData.choice.buttonWidth !== undefined
        ? scaleValue(guiData.choice.buttonWidth, scaleFactor)
        : undefined,
      height: guiData.choice.buttonHeight !== undefined
        ? scaleValue(guiData.choice.buttonHeight, scaleFactor)
        : undefined,
    } : undefined,
  };

  // Build asset references
  const assetRefs: ThemeDefinition['assets'] = {
    fonts: fontAssets.map(
      (f): ThemeAssetRef => ({
        id: f.id,
        role: f.role,
        filename: f.asset.filename,
        mimeType: getMimeType(f.asset.filename),
        fontFamily: f.fontFamily.replace(/"/g, ''), // Remove quotes for storage
      })
    ),
    uiGraphics: graphicAssets.map(
      (g): ThemeAssetRef => ({
        id: g.id,
        role: g.role,
        filename: g.asset.filename,
        mimeType: getMimeType(g.asset.filename),
      })
    ),
  };

  // Build component overrides for VN-specific styling
  const components_config: ThemeDefinition['components'] = {
    dialogTree: {
      speakerFont: {
        family: titleFont?.fontFamily || fonts_config.title.family,
        size: scaleValue(guiData.fonts.nameTextSize || 28, scaleFactor),
        weight: 'bold',
      },
      choiceStyle: {
        background: button_config.background,
        hoverBackground: button_config.hoverBackground,
        textColor: toThemeColor(guiData.choice.buttonTextIdleColor || buttonTextIdleColor),
        borderColor: button_config.borderColor,
        borderWidth: 1,
        borderRadius: 4,
        padding: button_config.padding,
      },
    },
  };

  // Build complete theme definition
  const theme: ThemeDefinition = {
    meta: {
      id: themeId,
      name: options.themeName || metadata.name || 'Imported Ren\'Py Theme',
      version: metadata.version || '1.0.0',
      description: `Imported from Ren'Py project${metadata.name ? `: ${metadata.name}` : ''}`,
      author: options.author || metadata.author,
      tags: [
        'renpy',
        'visual-novel',
        'imported',
        ...(options.tags || []),
      ],
      compatibility: {
        asapsVersion: options.asapsVersion || '0.9.6',
      },
      createdAt: now,
      modifiedAt: now,
    },
    colors: {
      primary: toThemeColor(textColor),
      secondary: toThemeColor(idleColor),
      accent: toThemeColor(accentColor),
      background: toThemeColor(backgroundColor),
      surface: toThemeColor(surfaceColor, 0.9),
      buttonNormal: button_config.background,
      buttonHover: button_config.hoverBackground,
      buttonText: toThemeColor(buttonTextIdleColor),
      border: toThemeColor(accentColor, 0.5),
    },
    fonts: fonts_config,
    textBox: textBox_config,
    button: button_config,
    hotspot: {
      highlightColor: accentColor,
      opacity: 0.3,
      visible: true,
      showLabels: false, // VN style typically doesn't show hotspot labels
      showInPreview: 'onHover',
    },
    effects: {
      textAnimation: 'typewriter', // VN default
      typewriterSpeed: 40, // Characters per second
      fadeInDuration: 300,
      sceneTransition: 'dissolve',
      sceneTransitionDuration: 500,
    },
    components: components_config,
    assets: assetRefs,
  };

  return {
    theme,
    fontAssets,
    graphicAssets,
  };
}

/**
 * Get MIME type from filename
 */
function getMimeType(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop();
  const mimeTypes: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    ttf: 'font/ttf',
    otf: 'font/otf',
    woff: 'font/woff',
    woff2: 'font/woff2',
  };
  return mimeTypes[ext || ''] || 'application/octet-stream';
}

/**
 * Create a minimal theme from Ren'Py GUI data without assets
 * Useful for quick preview or when assets aren't available
 *
 * @param guiData - Parsed GUI data from gui.rpy
 * @param themeName - Name for the theme
 * @returns Basic theme definition without asset references
 */
export function convertRenpyGuiToThemePreview(
  guiData: RenpyGuiData,
  themeName: string
): ThemeDefinition {
  const mockBundle: RenpyAssetBundle = {
    fonts: [],
    uiGraphics: [],
    guiData,
    metadata: {
      resolution: { width: 1920, height: 1080 },
    },
    structureType: 'flat',
  };

  const result = convertRenpyToTheme(mockBundle, {
    themeName,
    useBorderImage: false,
  });

  // Remove asset references since we don't have actual assets
  delete result.theme.assets;
  delete result.theme.textBox.frameAssetId;

  return result.theme;
}

/**
 * Estimate the complexity of importing a Ren'Py theme bundle
 *
 * @param bundle - The asset bundle to estimate
 * @returns Object with counts and estimated storage size
 */
export function estimateRenpyThemeSize(bundle: RenpyAssetBundle): {
  fontCount: number;
  graphicCount: number;
  estimatedStorageKB: number;
  hasTextbox: boolean;
  hasCustomFonts: boolean;
} {
  const fontCount = bundle.fonts.length;
  const graphicCount = bundle.uiGraphics.length;
  const hasTextbox = bundle.uiGraphics.some((g) => g.role === 'textbox');
  const hasCustomFonts = fontCount > 0;

  // Rough estimate: fonts ~200KB each, images ~50KB each
  const estimatedStorageKB = fontCount * 200 + graphicCount * 50;

  return {
    fontCount,
    graphicCount,
    estimatedStorageKB,
    hasTextbox,
    hasCustomFonts,
  };
}
