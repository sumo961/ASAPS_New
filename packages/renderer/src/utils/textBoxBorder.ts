/**
 * A beat's own text-box border choice (core Beat.textBoxBorder) applied to
 * the project theme: 'hide' drops the border, 'show' draws one even where
 * the project has none (its width, else 2px; its colour, else the text
 * colour). Anything else returns the theme unchanged. Shared by the player
 * (ReactRenderer) and the Visual Editor so both draw the same box.
 */
import type { RenderThemeSettings } from '../components/PositionedBeatView';

export function applyTextBoxBorder<T extends RenderThemeSettings | undefined>(theme: T, border: unknown): T {
  if (!theme?.textBox || (border !== 'show' && border !== 'hide')) return theme;
  const tb = theme.textBox;
  return {
    ...theme,
    textBox: border === 'hide'
      ? { ...tb, borderWidth: 0 }
      : {
          ...tb,
          borderWidth: tb.borderWidth > 0 ? tb.borderWidth : 2,
          borderColor: tb.borderColor && tb.borderColor !== 'transparent' ? tb.borderColor : (theme.colors?.textColor || '#ffffff'),
        },
  } as T;
}
