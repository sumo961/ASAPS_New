/**
 * Theme Converter Utility
 *
 * Converts GlobalSettings from the builder to RenderThemeSettings for the renderer.
 * This ensures consistent styling between the visual editor and preview.
 */

import type { RenderThemeSettings } from '@asaps/renderer';
import type { GlobalSettings } from '../components/settings/GlobalSettingsInspector';

/**
 * Font name to CSS font-family mapping
 * Must match the mapping in GlobalSettingsInspector.tsx
 */
const FONT_FAMILIES: Record<string, string> = {
  'Arial': 'Arial, sans-serif',
  'Times New Roman': 'Times New Roman, serif',
  'Courier New': 'Courier New, monospace',
  'Georgia': 'Georgia, serif',
  'Verdana': 'Verdana, sans-serif',
  'Gothic': 'Georgia, serif',
  'Handwriting': 'Brush Script MT, cursive',
  'Handwriting2': 'Lucida Handwriting, cursive',
  'Comic Sans MS': 'Comic Sans MS, cursive',
  'Impact': 'Impact, sans-serif',
  'Trebuchet MS': 'Trebuchet MS, sans-serif',
  'Palatino': 'Palatino Linotype, Book Antiqua, Palatino, serif',
};

/**
 * Convert font name to CSS font-family value.
 * Ensures font names with spaces are properly quoted for CSS.
 */
function getFontFamily(fontName: string): string {
  // Check if it's a built-in font first
  if (FONT_FAMILIES[fontName]) {
    return FONT_FAMILIES[fontName];
  }

  // If it already looks like a CSS font-family string (contains comma or ends with font type),
  // return as-is - it's already a complete font stack
  if (fontName.includes(',') || /\b(serif|sans-serif|monospace|cursive|fantasy)\s*$/.test(fontName)) {
    return fontName;
  }

  // For custom fonts, ensure names with spaces are properly quoted
  // CSS requires quotes around font-family names that contain spaces
  if (fontName.includes(' ') && !fontName.startsWith("'") && !fontName.startsWith('"')) {
    return `'${fontName}', sans-serif`;
  }

  return fontName;
}

/**
 * Normalize opacity values that may have been stored incorrectly.
 * Values are expected to be 0-100 (percentage), but some projects may have
 * values stored as decimals (0.0-1.0) due to a previous bug.
 *
 * This function converts:
 * - Values <= 1.0 → multiply by 100 (treat as decimal)
 * - Values > 1.0 and <= 100 → keep as-is (already percentage)
 * - Values > 100 → clamp to 100
 *
 * @param value - The opacity value to normalize
 * @returns Normalized opacity value (0-100)
 */
function normalizeOpacity(value: number): number {
  if (value <= 1) {
    // Value appears to be a decimal (0.0-1.0), convert to percentage
    return Math.round(value * 100);
  } else if (value > 100) {
    // Clamp to max
    return 100;
  }
  // Value is already in percentage form
  return value;
}

/**
 * Lighten a hex color by a percentage
 * @param hex - The hex color code (e.g., "#1a1a2e")
 * @param percent - The percentage to lighten (0.0-1.0)
 * @returns The lightened hex color
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
 * Calculate contrasting text color based on background luminance.
 * Returns black for light backgrounds, white for dark backgrounds.
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
 * Convert GlobalSettings to RenderThemeSettings
 *
 * @param settings - Global settings from the builder
 * @returns Theme settings for the renderer
 */
export function convertGlobalSettingsToTheme(settings: GlobalSettings): RenderThemeSettings {
  // Debug: Log font values being converted
  console.log('[themeConverter] Input fonts:', {
    titleFont: settings.fonts.titleFont,
    textFont: settings.fonts.textFont,
    btnFont: settings.fonts.btnFont,
  });

  // Calculate text colors: use explicit color if set, otherwise auto-calculate from background
  const buttonTextColor = settings.colors.ptextcolor || getContrastColor(settings.colors.pcolor);
  const npcTextColor = settings.colors.nonptextcolor || getContrastColor(settings.colors.nonpcolor);

  return {
    // Stage/canvas background color (used when no background image is set)
    backgroundColor: settings.colors.bgColor,
    textBox: {
      // NPC/narrator text box uses nonpcolor
      backgroundColor: settings.colors.nonpcolor,
      borderColor: settings.colors.textBoxBorder,
      borderWidth: settings.textbox.borderWidth,
      borderRadius: settings.textbox.radius,
      padding: settings.textbox.padding,
      opacity: normalizeOpacity(settings.textbox.opacity),
      hideTitleTextBox: settings.textbox.hideTitleTextBox,
    },
    button: {
      // Button/choice uses buttonBg/buttonBgColor if available, otherwise pcolor
      backgroundColor: settings.colors.buttonBg || settings.colors.buttonBgColor || settings.colors.pcolor,
      hoverBackgroundColor: lightenColor(settings.colors.buttonBg || settings.colors.buttonBgColor || settings.colors.pcolor, 0.15),
      textColor: buttonTextColor,
      borderColor: settings.colors.textBoxBorder,
      borderWidth: settings.textbox.borderWidth,
      borderRadius: settings.textbox.radius,
    },
    colors: {
      textColor: npcTextColor, // NPC/narrator text color
      textAlpha: 100, // Text is always fully visible; nonpalpha controls text BOX background, not text
    },
    fonts: {
      titleFont: getFontFamily(settings.fonts.titleFont),
      textFont: getFontFamily(settings.fonts.textFont),
      buttonFont: getFontFamily(settings.fonts.btnFont || settings.fonts.buttonFont || 'Arial'),
      titleFontSize: settings.fonts.fontSize?.title,
      textFontSize: settings.fonts.fontSize?.text,
      buttonFontSize: settings.fonts.fontSize?.button,
    },
    // Debug: Log converted font families
    ...(console.log('[themeConverter] Output fonts:', {
      titleFont: getFontFamily(settings.fonts.titleFont),
      textFont: getFontFamily(settings.fonts.textFont),
      buttonFont: getFontFamily(settings.fonts.btnFont || settings.fonts.buttonFont || 'Arial'),
    }), {}),
    textEffects: {
      animation: settings.textEffects.animation,
      typewriterSpeed: settings.textEffects.typewriterSpeed,
      fadeInDuration: settings.textEffects.fadeInDuration,
    },
    hotspot: {
      highlightColor: settings.hotspots.highlightColor || '#ffff00',
      visible: settings.hotspots.visible ?? true,
      showLabels: settings.hotspots.labels ?? true,
      opacity: (settings.hotspots.opacity ?? 30) / 100,  // Normalize to 0-1
      showInPreview: settings.hotspots.showInPreview ?? 'visible',
      labelDisplay: settings.hotspots.labelDisplay ?? 'hover',
    },
  };
}
