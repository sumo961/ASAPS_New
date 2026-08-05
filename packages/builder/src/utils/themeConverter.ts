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
  'System': 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
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
 * Normalize speaker display settings, migrating old format to new.
 * Old format: { namePosition: 'off'|'left'|'right', graphicPosition: ... }
 * New format: { nameStyle: 'off'|'label'|'inline', namePosition: 'left'|'right', ... }
 */
export function normalizeSpeakerDisplay(sd: any): {
  showNames?: boolean;
  showGraphics?: boolean;
  nameStyle: 'off' | 'label' | 'inline';
  namePosition: 'left' | 'right';
  nameColor?: string;
  graphicPosition: 'off' | 'inside-left' | 'inside-right' | 'above-left' | 'above-right';
  graphicSize?: number;
} {
  // Already new format
  if (sd.nameStyle) {
    // Derive showNames/showGraphics from style fields when absent
    const showNames = sd.showNames ?? (sd.nameStyle !== 'off');
    const showGraphics = sd.showGraphics ?? (sd.graphicPosition !== 'off');
    return {
      showNames,
      showGraphics,
      nameStyle: sd.nameStyle,
      namePosition: sd.namePosition || 'left',
      nameColor: sd.nameColor,
      graphicPosition: sd.graphicPosition || 'off',
      graphicSize: sd.graphicSize,
    };
  }
  // Migrate old format: namePosition 'off'|'left'|'right' → nameStyle + namePosition
  const oldNamePos = sd.namePosition as string | undefined;
  let nameStyle: 'off' | 'label' | 'inline' = 'off';
  let namePosition: 'left' | 'right' = 'left';
  if (oldNamePos === 'left') {
    nameStyle = 'label';
    namePosition = 'left';
  } else if (oldNamePos === 'right') {
    nameStyle = 'label';
    namePosition = 'right';
  }
  // Migrate old graphic positions (left-of-text → inside-left, right-of-text → inside-right)
  // Also pass through new-format values that may exist in mixed-state settings
  let graphicPosition: 'off' | 'inside-left' | 'inside-right' | 'above-left' | 'above-right' = 'off';
  const oldGraphicPos = sd.graphicPosition as string | undefined;
  if (oldGraphicPos === 'left-of-text') graphicPosition = 'inside-left';
  else if (oldGraphicPos === 'right-of-text') graphicPosition = 'inside-right';
  else if (oldGraphicPos === 'above-left') graphicPosition = 'above-left';
  else if (oldGraphicPos === 'above-right') graphicPosition = 'above-right';
  else if (oldGraphicPos === 'inside-left') graphicPosition = 'inside-left';
  else if (oldGraphicPos === 'inside-right') graphicPosition = 'inside-right';

  // Derive showNames/showGraphics from migrated values
  const showNames = sd.showNames ?? (nameStyle !== 'off');
  const showGraphics = sd.showGraphics ?? (graphicPosition !== 'off');
  return { showNames, showGraphics, nameStyle, namePosition, graphicPosition, graphicSize: sd.graphicSize };
}

/**
 * Fill in any missing globalSettings sub-objects with sane defaults.
 *
 * Older or partially-initialised projects (e.g. an imported project whose
 * globalSettings is only `{ project, debug }`) otherwise crash every consumer
 * that reads a nested field like `settings.colors.pcolor` — the theme
 * converters AND the settings inspector. Apply this once at load so no consumer
 * ever sees a partial object. Defaults mirror App.tsx's new-project settings.
 */
export function normalizeGlobalSettings(
  gs: Partial<GlobalSettings> | undefined | null
): GlobalSettings {
  const s = (gs ?? {}) as any;
  // Gap-fill values below ARE the default look ("Ink & Brass", v0.9.87).
  // They only apply to fields the project never authored: new projects
  // (created with empty settings) and corrupted/partial imports. Fully
  // authored projects override every field via the spreads.
  return {
    ...s,
    colors: {
      pcolor: '#d9a441', palpha: 100, ptextcolor: '#201607',
      nonpcolor: '#1b1f2b', nonpalpha: 100, nonptextcolor: '#eae7de',
      bgColor: '#14161f', textBoxBorder: '#3d4356',
      ...(s.colors ?? {}),
    },
    fonts: {
      titleFont: 'Georgia', textFont: 'System', btnFont: 'System',
      ...(s.fonts ?? {}),
      fontSize: { title: 40, text: 19, button: 16, ...(s.fonts?.fontSize ?? {}) },
    },
    textbox: {
      radius: 14, padding: 22, borderWidth: 1, opacity: 93,
      position: 'bottom', boxVisibility: 'all',
      // Pill buttons only for projects with NO authored textbox at all —
      // a project that authored its textbox (but predates buttonRadius)
      // must keep buttons following its box radius.
      ...(s.textbox === undefined ? { buttonRadius: 999 } : {}),
      ...(s.textbox ?? {}),
    },
    // Speaker-name label above the text box is part of the default look,
    // but ONLY for projects with no authored appearance at all — enabling
    // it on legacy projects would make labels pop up on existing scenes.
    ...(s.speakerDisplay === undefined && s.colors === undefined
      ? {
          speakerDisplay: {
            nameStyle: 'label', namePosition: 'left',
            nameColor: '#d9a441', graphicPosition: 'off',
          },
        }
      : {}),
    textEffects: {
      animation: 'none', typewriterSpeed: 15, fadeInDuration: 200,
      ...(s.textEffects ?? {}),
    },
    hotspots: {
      visible: true, labels: true, highlightColor: '#ffff00',
      opacity: 30, showInPreview: 'visible', labelDisplay: 'hover',
      ...(s.hotspots ?? {}),
    },
    sound: {
      backgroundMusic: '', backgroundVolume: 100, mute: false,
      ...(s.sound ?? {}),
    },
  } as GlobalSettings;
}

/**
 * Convert GlobalSettings to RenderThemeSettings
 *
 * @param settings - Global settings from the builder
 * @returns Theme settings for the renderer
 */
export function convertGlobalSettingsToTheme(settings: GlobalSettings): RenderThemeSettings {
  // Defensive normalisation: older or partially-initialised projects (e.g. an
  // imported project whose globalSettings is only { project, debug }) may be
  // missing entire settings sub-objects. Merge each group over sane defaults so
  // the preview can't crash on `settings.colors.ptextcolor` and friends. The
  // colour defaults matter because getContrastColor / lightenColor are not
  // null-safe; fonts default to Arial because getFontFamily isn't either.
  const colors = {
    pcolor: '#d9a441',
    nonpcolor: '#1b1f2b',
    bgColor: '#14161f',
    ptextcolor: '',
    nonptextcolor: '',
    ...((settings.colors ?? {}) as Partial<NonNullable<GlobalSettings['colors']>>),
  } as NonNullable<GlobalSettings['colors']>;
  const textbox = { ...(settings.textbox ?? {}) } as NonNullable<GlobalSettings['textbox']>;
  const fonts = {
    titleFont: 'Georgia',
    textFont: 'System',
    ...((settings.fonts ?? {}) as Partial<NonNullable<GlobalSettings['fonts']>>),
  } as NonNullable<GlobalSettings['fonts']>;
  const textEffects = { ...(settings.textEffects ?? {}) } as NonNullable<GlobalSettings['textEffects']>;
  const hotspots = { ...(settings.hotspots ?? {}) } as NonNullable<GlobalSettings['hotspots']>;

  // Calculate text colors: use explicit color if set, otherwise auto-calculate from background
  const buttonTextColor = colors.ptextcolor || getContrastColor(colors.pcolor);
  const npcTextColor = colors.nonptextcolor || getContrastColor(colors.nonpcolor);

  return {
    // Stage/canvas background color (used when no background image is set)
    backgroundColor: colors.bgColor,
    textBox: {
      // NPC/narrator text box uses nonpcolor
      backgroundColor: colors.nonpcolor,
      borderColor: colors.textBoxBorder,
      borderWidth: textbox.borderWidth,
      borderRadius: textbox.radius,
      padding: textbox.padding,
      opacity: normalizeOpacity(textbox.opacity),
      hideTitleTextBox: textbox.hideTitleTextBox,
      boxVisibility: textbox.boxVisibility,
    },
    button: {
      // Button/choice uses buttonBg/buttonBgColor if available, otherwise pcolor
      backgroundColor: colors.buttonBg || colors.buttonBgColor || colors.pcolor,
      hoverBackgroundColor: lightenColor(colors.buttonBg || colors.buttonBgColor || colors.pcolor, 0.15),
      textColor: buttonTextColor,
      borderColor: colors.textBoxBorder,
      borderWidth: textbox.borderWidth,
      // Buttons may carry their own radius (999 ⇒ pill); legacy projects
      // without one keep sharing the text-box radius.
      borderRadius: textbox.buttonRadius ?? textbox.radius,
    },
    colors: {
      textColor: npcTextColor, // NPC/narrator text color
      textAlpha: 100, // Text is always fully visible; nonpalpha controls text BOX background, not text
    },
    fonts: {
      titleFont: getFontFamily(fonts.titleFont),
      textFont: getFontFamily(fonts.textFont),
      buttonFont: getFontFamily(fonts.btnFont || fonts.buttonFont || 'Arial'),
      titleFontSize: fonts.fontSize?.title,
      textFontSize: fonts.fontSize?.text,
      buttonFontSize: fonts.fontSize?.button,
    },
    textEffects: {
      animation: textEffects.animation,
      typewriterSpeed: textEffects.typewriterSpeed,
      fadeInDuration: textEffects.fadeInDuration,
    },
    hotspot: {
      highlightColor: hotspots.highlightColor || '#ffff00',
      visible: hotspots.visible ?? true,
      showLabels: hotspots.labels ?? true,
      opacity: (hotspots.opacity ?? 30) / 100,  // Normalize to 0-1
      showInPreview: hotspots.showInPreview ?? 'visible',
      labelDisplay: hotspots.labelDisplay ?? 'hover',
    },
    speakerDisplay: settings.speakerDisplay ? normalizeSpeakerDisplay(settings.speakerDisplay) : undefined,
  };
}
