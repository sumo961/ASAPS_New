/**
 * The colour hypertext links are drawn in. It used to be the theme's button
 * background — a transparent button (a "text-only choices" look, Late
 * Light's theme) made every link invisible. Now: the first theme colour that
 * stands out against what is behind the text (contrast ≥ 3:1, WCAG's bar
 * for large/underlined text), else the text colour itself (links stay
 * underlined, so they still read as links).
 */

type RGBA = { r: number; g: number; b: number; a: number };

export function parseColor(input: string | undefined | null): RGBA | null {
  if (!input || typeof input !== 'string') return null;
  const c = input.trim().toLowerCase();
  if (c === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  let m = c.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map((x) => x + x).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    return {
      r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16),
      a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
    };
  }
  m = c.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const [r, g, b, a] = m[1].split(',').map((x) => parseFloat(x));
    return { r, g, b, a: Number.isFinite(a) ? a : 1 };
  }
  return null;
}

const luminance = ({ r, g, b }: RGBA): number => {
  const ch = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
};

export function contrastRatio(a: RGBA, b: RGBA): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function readableLinkColor(theme: {
  colors?: { textColor?: string };
  textBox?: { backgroundColor?: string; opacity?: number };
  button?: { backgroundColor?: string; textColor?: string; borderColor?: string };
} | undefined): string {
  const text = parseColor(theme?.colors?.textColor) ?? { r: 255, g: 255, b: 255, a: 1 };
  // What is behind the text: the box when it is mostly opaque; otherwise the
  // stage, which the text colour was chosen to read on (light text → dark).
  const box = parseColor(theme?.textBox?.backgroundColor);
  const boxOpaque = box && box.a > 0.5 && (theme?.textBox?.opacity ?? 100) >= 50;
  const backdrop: RGBA = boxOpaque ? box! : (luminance(text) > 0.4 ? { r: 0, g: 0, b: 0, a: 1 } : { r: 255, g: 255, b: 255, a: 1 });
  for (const candidate of [theme?.button?.backgroundColor, theme?.button?.textColor, theme?.button?.borderColor]) {
    const c = parseColor(candidate);
    if (c && c.a > 0.5 && contrastRatio(c, backdrop) >= 3) return candidate as string;
  }
  return theme?.colors?.textColor || '#ffffff';
}
