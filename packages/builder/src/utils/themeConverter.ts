/**
 * Theme Converter Utility
 *
 * Converts GlobalSettings from the builder to RenderThemeSettings for the renderer.
 * This ensures consistent styling between the visual editor and preview.
 */

import type { RenderThemeSettings } from '@asaps/renderer';
import type { GlobalSettings } from '../components/settings/GlobalSettingsInspector';

/**
 * Convert GlobalSettings to RenderThemeSettings
 *
 * @param settings - Global settings from the builder
 * @returns Theme settings for the renderer
 */
export function convertGlobalSettingsToTheme(settings: GlobalSettings): RenderThemeSettings {
  return {
    textBox: {
      backgroundColor: settings.colors.textBoxBg,
      borderColor: settings.colors.textBoxBorder,
      borderWidth: settings.textbox.borderWidth,
      borderRadius: settings.textbox.radius,
      padding: settings.textbox.padding,
      opacity: settings.textbox.opacity,
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
      textAlpha: settings.colors.palpha,
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
