/**
 * Text-box frame pictures drawn as Ren'Py draws them (Birka, 2026-10-27:
 * stretched over a long text, the frame's decorated edges ran across it).
 */
import { describe, it, expect } from 'vitest';
import { framePictureStyle, framePicturePadding, FRAME_BAND } from '../../src/utils/framePicture';

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

describe('framePicturePadding', () => {
  // The edge rule the fixed layout uses on a 1024 px stage.
  const stage = (width: number) => (f: number, natural: number) => `${Math.round(Math.max(8, Math.min(natural, f * width)))}px`;
  const elegant = { w: 1920, h: 310 };

  it('takes the decorated edge off the top and bottom padding, keeps the sides (Elegant: 75 px padding)', () => {
    expect(framePicturePadding(elegant, stage(1024), 75)).toBe('max(12px, calc(75px - 55px)) 75px');
    expect(framePicturePadding(elegant, stage(1024), 40, 30)).toBe('max(12px, calc(40px - 55px)) 30px');
  });

  it('scales the padding the way the caller scales the stage (responsive: narrower than its design width)', () => {
    const half = (px: number) => `${px / 2}px`;
    expect(framePicturePadding(elegant, stage(512), 75, 75, half)).toBe('max(12px, calc(37.5px - 28px)) 37.5px');
  });

  it('keeps a small padding as the gap, and the padding unchanged while the picture loads', () => {
    expect(framePicturePadding(elegant, stage(1024), 8)).toBe('max(8px, calc(8px - 55px)) 8px');
    expect(framePicturePadding(undefined, stage(1024), 75)).toBe('75px 75px');
  });
});
