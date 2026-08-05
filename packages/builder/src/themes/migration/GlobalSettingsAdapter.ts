/**
 * GlobalSettings Adapter
 *
 * Provides bidirectional conversion between GlobalSettings (legacy/current format)
 * and ThemeDefinition (new theme system format).
 *
 * This enables:
 * - Migration of existing projects to the theme system
 * - Backward compatibility with projects that use GlobalSettings directly
 * - "Save as Theme" functionality
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  ThemeDefinition,
  ThemeColors,
  ThemeFonts,
  ThemeTextBox,
  ThemeButton,
  ThemeHotspot,
  ThemeEffects,
  ThemeColor,
  ThemeMeta,
} from '@asaps/core';
import type { GlobalSettings } from '../../storage/types';

// ============================================================================
// GlobalSettings → ThemeDefinition
// ============================================================================

/**
 * Convert GlobalSettings to ThemeDefinition
 *
 * @param settings - The GlobalSettings to convert
 * @param name - Optional name for the theme (defaults to "Custom Theme")
 * @param id - Optional ID for the theme (defaults to generated UUID)
 */
export function globalSettingsToTheme(
  settings: GlobalSettings,
  name: string = 'Custom Theme',
  id?: string
): ThemeDefinition {
  const themeId = id || uuidv4();
  const now = new Date().toISOString();

  return {
    meta: {
      id: themeId,
      name,
      version: '1.0.0',
      description: 'Theme converted from project settings',
      tags: ['converted'],
      compatibility: {
        asapsVersion: '2.0.0',
      },
      createdAt: now,
      modifiedAt: now,
    },
    colors: convertColors(settings.colors),
    fonts: convertFonts(settings.fonts),
    textBox: convertTextBox(settings.textbox, settings.colors),
    button: convertButton(settings.colors, settings.textbox),
    hotspot: convertHotspot(settings.hotspots),
    effects: convertEffects(settings.textEffects),
  };
}

/**
 * Calculate contrasting text color based on background luminance.
 */
function getContrastColor(hexColor: string): string {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#ffffff';
}

/**
 * Convert GlobalSettings colors to ThemeColors
 */
function convertColors(colors: GlobalSettings['colors']): ThemeColors {
  // Calculate text colors: use explicit color if set, otherwise auto-calculate
  const buttonTextColor = colors.ptextcolor || getContrastColor(colors.pcolor);

  return {
    primary: { hex: colors.pcolor, alpha: colors.palpha / 100 },
    secondary: { hex: colors.nonpcolor, alpha: colors.nonpalpha / 100 },
    accent: { hex: colors.pcolor }, // Use primary as accent
    background: { hex: colors.bgColor },
    surface: { hex: colors.nonpcolor }, // NPC text box background
    buttonNormal: { hex: colors.pcolor }, // Button uses pcolor
    buttonHover: { hex: lightenColor(colors.pcolor, 0.1) },
    buttonText: { hex: buttonTextColor },
    border: { hex: colors.textBoxBorder },
  };
}

/**
 * Convert GlobalSettings fonts to ThemeFonts
 */
function convertFonts(fonts: GlobalSettings['fonts']): ThemeFonts {
  return {
    title: {
      family: fonts.titleFont || 'serif',
      size: fonts.fontSize.title,
      weight: 'bold',
      lineHeight: 1.2,
    },
    body: {
      family: fonts.textFont || 'sans-serif',
      size: fonts.fontSize.text,
      weight: 'normal',
      lineHeight: 1.6,
    },
    button: {
      family: fonts.btnFont || 'sans-serif',
      size: fonts.fontSize.button,
      weight: 'bold',
    },
    dialog: {
      family: fonts.textFont || 'sans-serif',
      size: fonts.fontSize.text,
      weight: 'normal',
      lineHeight: 1.5,
    },
    scale: 1,
  };
}

/**
 * Convert GlobalSettings textbox to ThemeTextBox
 */
function convertTextBox(
  textbox: GlobalSettings['textbox'],
  colors: GlobalSettings['colors']
): ThemeTextBox {
  return {
    background: { hex: colors.nonpcolor, alpha: colors.nonpalpha / 100 }, // NPC text box background
    borderColor: { hex: colors.textBoxBorder },
    borderWidth: textbox.borderWidth,
    borderRadius: textbox.radius,
    padding: textbox.padding,
    opacity: textbox.opacity / 100, // Convert 0-100 to 0-1
    position: textbox.position,
    hideTitleTextBox: textbox.hideTitleTextBox,
  };
}

/**
 * Convert GlobalSettings colors to ThemeButton
 */
function convertButton(
  colors: GlobalSettings['colors'],
  textbox?: GlobalSettings['textbox']
): ThemeButton {
  // Calculate button text color: use explicit color if set, otherwise auto-calculate
  const buttonTextColor = colors.ptextcolor || getContrastColor(colors.pcolor);

  return {
    background: { hex: colors.pcolor, alpha: colors.palpha / 100 }, // Button uses pcolor
    hoverBackground: { hex: lightenColor(colors.pcolor, 0.15) },
    activeBackground: { hex: lightenColor(colors.pcolor, 0.2) },
    disabledBackground: { hex: colors.pcolor, alpha: 0.5 },
    textColor: { hex: buttonTextColor },
    borderColor: { hex: colors.textBoxBorder },
    borderWidth: textbox?.borderWidth ?? 1,
    borderRadius: textbox?.buttonRadius ?? textbox?.radius ?? 4,
    padding: { horizontal: 16, vertical: 8 },
    transitionDuration: 200,
  };
}

/**
 * Convert GlobalSettings hotspots to ThemeHotspot
 */
function convertHotspot(hotspots: GlobalSettings['hotspots']): ThemeHotspot {
  return {
    highlightColor: hotspots.highlightColor,
    opacity: hotspots.opacity / 100, // Convert 0-100 to 0-1
    visible: hotspots.visible,
    showLabels: hotspots.labels,
    showInPreview: hotspots.showInPreview,
    labelDisplay: hotspots.labelDisplay ?? 'hover',
  };
}

/**
 * Convert GlobalSettings textEffects to ThemeEffects
 */
function convertEffects(textEffects: GlobalSettings['textEffects']): ThemeEffects {
  return {
    textAnimation: textEffects.animation,
    typewriterSpeed: textEffects.typewriterSpeed,
    fadeInDuration: textEffects.fadeInDuration,
  };
}

// ============================================================================
// ThemeDefinition → GlobalSettings
// ============================================================================

/**
 * Convert ThemeDefinition to GlobalSettings
 *
 * This enables backward compatibility by converting a theme back to
 * the GlobalSettings format used by existing code.
 *
 * @param theme - The ThemeDefinition to convert
 * @param existingSettings - Optional existing settings to merge with
 */
export function themeToGlobalSettings(
  theme: ThemeDefinition,
  existingSettings?: Partial<GlobalSettings>
): GlobalSettings {
  // Determine text box background color and alpha
  // Priority: textBox.background > colors.surface > colors.secondary (fallback)
  const textBoxBgHex = theme.textBox.background?.hex || theme.colors.surface?.hex || theme.colors.secondary.hex;
  const textBoxBgAlpha = theme.textBox.background?.alpha ?? theme.colors.surface?.alpha ?? theme.colors.secondary.alpha ?? 1;

  // Use textBox.opacity if explicitly set (0-1 range), otherwise use background alpha
  const textBoxOpacity = theme.textBox.opacity !== undefined ? theme.textBox.opacity : textBoxBgAlpha;

  return {
    project: existingSettings?.project || {
      width: 1024,
      height: 768,
      aspectRatio: '4:3',
      scalingMode: 'fit',
    },
    colors: {
      // Button background: use buttonNormal color (from Ren'Py button config), not primary (text color)
      pcolor: theme.colors.buttonNormal?.hex || theme.button.background.hex,
      palpha: Math.round((theme.colors.buttonNormal?.alpha ?? theme.button.background.alpha ?? 1) * 100),
      // Button text color
      ptextcolor: theme.colors.buttonText?.hex || theme.button.textColor.hex,
      // Text box background: use textBox.background or surface color
      nonpcolor: textBoxBgHex,
      nonpalpha: Math.round(textBoxOpacity * 100),
      // Text box text color: use primary (the actual text color from Ren'Py's gui.text_color)
      nonptextcolor: theme.colors.primary.hex,
      bgColor: theme.colors.background.hex,
      textBoxBorder: theme.textBox.borderColor?.hex || theme.colors.border.hex,
    },
    fonts: {
      titleFont: theme.fonts.title.family,
      textFont: theme.fonts.body.family,
      btnFont: theme.fonts.button.family,
      fontSize: {
        title: theme.fonts.title.size,
        text: theme.fonts.body.size,
        button: theme.fonts.button.size,
      },
    },
    textbox: {
      radius: theme.textBox.borderRadius,
      // Button radius only carries over when the theme differentiates it
      // from the box radius; otherwise leave unset (buttons follow radius).
      buttonRadius: theme.button.borderRadius !== theme.textBox.borderRadius
        ? theme.button.borderRadius
        : undefined,
      padding: theme.textBox.padding,
      borderWidth: theme.textBox.borderWidth,
      opacity: Math.round(theme.textBox.opacity * 100), // Convert 0-1 to 0-100
      position: theme.textBox.position === 'custom' ? 'bottom' : theme.textBox.position,
      boxVisibility: existingSettings?.textbox?.boxVisibility || 'all',
      hideTitleTextBox: theme.textBox.hideTitleTextBox,
    },
    textEffects: {
      animation: theme.effects.textAnimation,
      typewriterSpeed: theme.effects.typewriterSpeed,
      fadeInDuration: theme.effects.fadeInDuration,
    },
    hotspots: {
      visible: theme.hotspot.visible,
      labels: theme.hotspot.showLabels,
      highlightColor: theme.hotspot.highlightColor,
      opacity: Math.round(theme.hotspot.opacity * 100), // Convert 0-1 to 0-100
      showInPreview: theme.hotspot.showInPreview,
      labelDisplay: theme.hotspot.labelDisplay ?? 'hover',
    },
    sound: existingSettings?.sound || {
      backgroundMusic: '',
      backgroundVolume: 50,
      mute: false,
    },
    copyright: existingSettings?.copyright || {
      notice: '',
      year: new Date().getFullYear().toString(),
      owner: '',
    },
    debug: existingSettings?.debug || {
      firstbeat: '',
      showvals: false,
    },
  };
}

// ============================================================================
// Merge Theme Overrides
// ============================================================================

/**
 * Apply per-project theme overrides to a resolved theme
 *
 * @param baseTheme - The base theme definition
 * @param overrides - Partial theme overrides from the project
 */
export function applyThemeOverrides(
  baseTheme: ThemeDefinition,
  overrides: Partial<ThemeDefinition>
): ThemeDefinition {
  return {
    meta: { ...baseTheme.meta, ...overrides.meta },
    colors: { ...baseTheme.colors, ...overrides.colors },
    fonts: { ...baseTheme.fonts, ...overrides.fonts },
    textBox: { ...baseTheme.textBox, ...overrides.textBox },
    button: { ...baseTheme.button, ...overrides.button },
    hotspot: { ...baseTheme.hotspot, ...overrides.hotspot },
    effects: { ...baseTheme.effects, ...overrides.effects },
    components: overrides.components || baseTheme.components,
    assets: overrides.assets || baseTheme.assets,
  };
}

/**
 * Extract theme overrides by comparing project settings to base theme
 *
 * @param baseTheme - The base theme being used
 * @param currentSettings - Current project GlobalSettings
 */
export function extractThemeOverrides(
  baseTheme: ThemeDefinition,
  currentSettings: GlobalSettings
): Partial<ThemeDefinition> | undefined {
  // Convert current settings to theme format
  const currentAsTheme = globalSettingsToTheme(currentSettings, 'temp');

  // Compare and extract differences
  const overrides: Partial<ThemeDefinition> = {};
  let hasOverrides = false;

  // Check colors
  const colorOverrides = diffColors(baseTheme.colors, currentAsTheme.colors);
  if (colorOverrides) {
    overrides.colors = colorOverrides;
    hasOverrides = true;
  }

  // Check fonts
  const fontOverrides = diffFonts(baseTheme.fonts, currentAsTheme.fonts);
  if (fontOverrides) {
    overrides.fonts = fontOverrides;
    hasOverrides = true;
  }

  // Check textBox
  const textBoxOverrides = diffTextBox(baseTheme.textBox, currentAsTheme.textBox);
  if (textBoxOverrides) {
    overrides.textBox = textBoxOverrides;
    hasOverrides = true;
  }

  // Check hotspot
  const hotspotOverrides = diffHotspot(baseTheme.hotspot, currentAsTheme.hotspot);
  if (hotspotOverrides) {
    overrides.hotspot = hotspotOverrides;
    hasOverrides = true;
  }

  // Check effects
  const effectsOverrides = diffEffects(baseTheme.effects, currentAsTheme.effects);
  if (effectsOverrides) {
    overrides.effects = effectsOverrides;
    hasOverrides = true;
  }

  return hasOverrides ? overrides : undefined;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Lighten a hex color by a percentage
 */
function lightenColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(255 * percent);

  let r = (num >> 16) + amt;
  let g = ((num >> 8) & 0x00ff) + amt;
  let b = (num & 0x0000ff) + amt;

  r = Math.min(255, Math.max(0, r));
  g = Math.min(255, Math.max(0, g));
  b = Math.min(255, Math.max(0, b));

  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

/**
 * Compare two ThemeColor values
 */
function colorsEqual(a: ThemeColor, b: ThemeColor): boolean {
  return a.hex.toLowerCase() === b.hex.toLowerCase() && (a.alpha ?? 1) === (b.alpha ?? 1);
}

/**
 * Diff colors and return overrides if different
 */
function diffColors(base: ThemeColors, current: ThemeColors): ThemeColors | undefined {
  const diff: Partial<ThemeColors> = {};
  let hasDiff = false;

  for (const key of Object.keys(base) as (keyof ThemeColors)[]) {
    if (key === 'custom') continue;
    if (!colorsEqual(base[key] as ThemeColor, current[key] as ThemeColor)) {
      (diff as any)[key] = current[key];
      hasDiff = true;
    }
  }

  return hasDiff ? { ...base, ...diff } : undefined;
}

/**
 * Diff fonts and return overrides if different
 */
function diffFonts(base: ThemeFonts, current: ThemeFonts): ThemeFonts | undefined {
  if (
    base.title.family !== current.title.family ||
    base.title.size !== current.title.size ||
    base.body.family !== current.body.family ||
    base.body.size !== current.body.size ||
    base.button.family !== current.button.family ||
    base.button.size !== current.button.size
  ) {
    return current;
  }
  return undefined;
}

/**
 * Diff textBox and return overrides if different
 */
function diffTextBox(base: ThemeTextBox, current: ThemeTextBox): ThemeTextBox | undefined {
  if (
    base.borderWidth !== current.borderWidth ||
    base.borderRadius !== current.borderRadius ||
    base.padding !== current.padding ||
    base.opacity !== current.opacity ||
    base.position !== current.position
  ) {
    return current;
  }
  return undefined;
}

/**
 * Diff hotspot and return overrides if different
 */
function diffHotspot(base: ThemeHotspot, current: ThemeHotspot): ThemeHotspot | undefined {
  if (
    base.highlightColor !== current.highlightColor ||
    base.opacity !== current.opacity ||
    base.visible !== current.visible ||
    base.showLabels !== current.showLabels ||
    base.showInPreview !== current.showInPreview ||
    base.labelDisplay !== current.labelDisplay
  ) {
    return current;
  }
  return undefined;
}

/**
 * Diff effects and return overrides if different
 */
function diffEffects(base: ThemeEffects, current: ThemeEffects): ThemeEffects | undefined {
  if (
    base.textAnimation !== current.textAnimation ||
    base.typewriterSpeed !== current.typewriterSpeed ||
    base.fadeInDuration !== current.fadeInDuration
  ) {
    return current;
  }
  return undefined;
}
