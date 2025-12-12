/**
 * Theme Converter Utility
 *
 * Converts GlobalSettings from the builder to RenderThemeSettings for the renderer.
 * This ensures consistent styling between the visual editor and preview.
 */

import type { RenderThemeSettings } from '@asaps/renderer';
import type { GlobalSettings } from '../components/settings/GlobalSettingsInspector';

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
 * Convert GlobalSettings to RenderThemeSettings
 *
 * @param settings - Global settings from the builder
 * @returns Theme settings for the renderer
 */
export function convertGlobalSettingsToTheme(settings: GlobalSettings): RenderThemeSettings {
  return {
    // Stage/canvas background color (used when no background image is set)
    backgroundColor: settings.colors.bgColor,
    textBox: {
      backgroundColor: settings.colors.textBoxBg,
      borderColor: settings.colors.textBoxBorder,
      borderWidth: settings.textbox.borderWidth,
      borderRadius: settings.textbox.radius,
      padding: settings.textbox.padding,
      opacity: normalizeOpacity(settings.textbox.opacity),
    },
    button: {
      backgroundColor: '#3b82f6', // Default blue - could be added to settings later
      hoverBackgroundColor: '#2563eb', // Darker blue on hover
      textColor: '#FFFFFF', // White text on buttons
      borderColor: '#2563eb',
      borderWidth: 2,
      borderRadius: 8,
    },
    colors: {
      textColor: settings.colors.pcolor, // Use player color for text
      textAlpha: normalizeOpacity(settings.colors.palpha),
    },
    fonts: {
      textFont: settings.fonts.textFont,
      buttonFont: settings.fonts.btnFont,
    },
    textEffects: {
      animation: settings.textEffects.animation,
      typewriterSpeed: settings.textEffects.typewriterSpeed,
      fadeInDuration: settings.textEffects.fadeInDuration,
    },
  };
}
