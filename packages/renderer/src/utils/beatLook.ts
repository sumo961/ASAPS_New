/**
 * A beat's own look (core BeatLook) laid over the project theme for that beat
 * only: the stage colour, the text box, the text colour, buttons and fonts.
 * Unset fields keep the project's. Shared by the player (ReactRenderer) and
 * the Visual Editor so both draw the same beat.
 */
import { getFontFamily, type BeatLook } from '@asaps/core';
import type { RenderThemeSettings } from '../components/PositionedBeatView';

const set = <T extends object>(base: T, over: Partial<T> | undefined): T => {
  if (!over) return base;
  const out: any = { ...base };
  for (const [k, v] of Object.entries(over)) if (v !== undefined && v !== null && v !== '') out[k] = v;
  return out;
};

/** A slightly lighter colour for a button's hover state (#rrggbb only). */
function lighter(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = (shift: number) => Math.min(255, Math.round(((n >> shift) & 255) + (255 - ((n >> shift) & 255)) * 0.15));
  return `#${[16, 8, 0].map(s => ch(s).toString(16).padStart(2, '0')).join('')}`;
}

export function applyBeatLook<T extends RenderThemeSettings | undefined>(theme: T, look: BeatLook | undefined | null): T {
  if (!theme || !look || typeof look !== 'object') return theme;
  const t = theme as RenderThemeSettings;
  const tb = look.textBox ?? {};
  const button = look.button ?? {};
  return {
    ...t,
    ...(look.stageColor ? { backgroundColor: look.stageColor } : {}),
    textBox: set(t.textBox, {
      backgroundColor: tb.backgroundColor,
      opacity: tb.opacity,
      borderColor: tb.borderColor,
      borderWidth: tb.borderWidth,
      borderRadius: tb.borderRadius,
      padding: tb.padding,
      boxVisibility: tb.visibility,
    }),
    colors: set(t.colors, { textColor: look.textColor }),
    button: set(t.button, {
      backgroundColor: button.backgroundColor,
      hoverBackgroundColor: button.backgroundColor ? lighter(button.backgroundColor) : undefined,
      textColor: button.textColor,
      borderColor: button.borderColor,
      borderRadius: button.borderRadius,
    }),
    // Fonts are stored by name, as an element's font is.
    fonts: set(t.fonts, look.fonts && {
      titleFont: look.fonts.titleFont ? getFontFamily(look.fonts.titleFont) : undefined,
      textFont: look.fonts.textFont ? getFontFamily(look.fonts.textFont) : undefined,
      buttonFont: look.fonts.buttonFont ? getFontFamily(look.fonts.buttonFont) : undefined,
      titleFontSize: look.fonts.titleFontSize,
      textFontSize: look.fonts.textFontSize,
      buttonFontSize: look.fonts.buttonFontSize,
    }),
  } as T;
}
