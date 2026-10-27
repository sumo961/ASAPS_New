/**
 * A text-box frame picture (a Ren'Py theme's textbox.png, or one chosen in
 * Project Settings ▸ Text Box ▸ Pictures), drawn the way Ren'Py draws it.
 *
 * Stretched over the whole box, the picture's decorated top and bottom
 * edges grew with the text and ran across it (2026-10-27, Birka: a long
 * text box with the Elegant GUI kit's frame). Ren'Py never stretches its
 * text box: the picture keeps its proportions and the text sits in its
 * middle (Elegant: 310 px high, text from y 105). So the frame is drawn as
 * a 9-slice image: the top and bottom thirds keep the picture's proportions
 * relative to the stage width — the way the picture spans a Ren'Py
 * screen — and only the middle stretches; the text lives in the middle and
 * scrolls there.
 */
import React from 'react';

export interface PictureSize { w: number; h: number }

/** The decorated band at the top and at the bottom, as a share of the picture's height. */
export const FRAME_BAND = 1 / 3;

const sizes = new Map<string, PictureSize | null>();
const loading = new Map<string, Promise<void>>();

function load(url: string): Promise<void> {
  let p = loading.get(url);
  if (!p) {
    p = new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => { sizes.set(url, img.naturalWidth ? { w: img.naturalWidth, h: img.naturalHeight } : null); resolve(); };
      img.onerror = () => { sizes.set(url, null); resolve(); };
      img.src = url;
    });
    loading.set(url, p);
  }
  return p;
}

/** The picture's natural size once it has loaded (undefined until then or without one). */
export function usePictureSize(url?: string): PictureSize | undefined {
  const [, loaded] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    if (!url || sizes.has(url) || typeof Image === 'undefined') return;
    let live = true;
    void load(url).then(() => { if (live) loaded(); });
    return () => { live = false; };
  }, [url]);
  return url ? sizes.get(url) ?? undefined : undefined;
}

/**
 * Style for a box wearing the frame picture. `bandLength(fraction, naturalPx)`
 * turns "this share of the stage width" into a CSS length (the band's height
 * on screen); `naturalPx` is the band's height in the picture itself. Until
 * the picture's size is known the picture is stretched, as before.
 */
export function framePictureStyle(
  url: string,
  size: PictureSize | undefined,
  bandLength: (fractionOfStageWidth: number, naturalPx: number) => string,
): React.CSSProperties {
  if (!size) {
    return {
      backgroundImage: `url(${url})`,
      backgroundSize: '100% 100%',
      backgroundRepeat: 'no-repeat',
      backgroundColor: 'transparent',
      border: 'none',
    };
  }
  const band = bandLength((size.h * FRAME_BAND) / size.w, Math.round(size.h * FRAME_BAND));
  const slice = `${(FRAME_BAND * 100).toFixed(3)}%`;
  return {
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderWidth: `${band} 0`,
    borderImageSource: `url("${url}")`,
    borderImageSlice: `${slice} 0 fill`,
    borderImageRepeat: 'stretch',
  };
}
