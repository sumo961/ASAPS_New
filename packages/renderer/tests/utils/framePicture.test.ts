/**
 * Text-box frame pictures drawn as Ren'Py draws them (Birka, 2026-10-27:
 * stretched over a long text, the frame's decorated edges ran across it).
 */
import { describe, it, expect } from 'vitest';
import { framePictureStyle, FRAME_BAND } from '../../src/utils/framePicture';

describe('framePictureStyle', () => {
  it('keeps the top and bottom thirds in proportion and stretches only the middle', () => {
    const band = (f: number, natural: number) => `${Math.round(Math.min(natural, f * 1024))}px`;
    const style = framePictureStyle('blob:textbox', { w: 1920, h: 310 }, band);
    // Elegant GUI kit textbox.png: a third of 310 px against a 1920 px picture,
    // on a 1024 px stage → 55 px bands.
    expect(style.borderWidth).toBe('55px 0');
    expect(style.borderImageSource).toBe('url("blob:textbox")');
    expect(style.borderImageSlice).toBe(`${(FRAME_BAND * 100).toFixed(3)}% 0 fill`);
    expect(style.borderImageRepeat).toBe('stretch');
    expect(style.backgroundImage).toBeUndefined();
  });

  it('never makes a band taller than in the picture itself', () => {
    const style = framePictureStyle('blob:textbox', { w: 1920, h: 310 }, (f, natural) => `${Math.min(natural, f * 4000)}px`);
    expect(style.borderWidth).toBe('103px 0');
  });

  it('stretches the picture until its size is known', () => {
    const style = framePictureStyle('blob:textbox', undefined, () => '0px');
    expect(style.backgroundImage).toBe('url(blob:textbox)');
    expect(style.backgroundSize).toBe('100% 100%');
  });
});
