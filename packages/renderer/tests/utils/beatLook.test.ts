import { describe, it, expect } from 'vitest';
import { applyBeatLook } from '../../src/utils/beatLook';
import { DEFAULT_THEME } from '../../src/components/PositionedBeatView';

describe('applyBeatLook', () => {
  it('returns the theme unchanged without a look', () => {
    expect(applyBeatLook(DEFAULT_THEME, undefined)).toBe(DEFAULT_THEME);
  });

  it('lays the set fields over the project theme and keeps the rest', () => {
    const t = applyBeatLook(DEFAULT_THEME, {
      stageColor: '#112233',
      textColor: '#eeeeee',
      textBox: { backgroundColor: '#aa2222', opacity: 100, visibility: 'all' },
      button: { backgroundColor: '#336699' },
      fonts: { textFont: 'Georgia', textFontSize: 30 },
    });
    expect(t.backgroundColor).toBe('#112233');
    expect(t.colors.textColor).toBe('#eeeeee');
    expect(t.textBox).toMatchObject({ backgroundColor: '#aa2222', opacity: 100, boxVisibility: 'all', padding: DEFAULT_THEME.textBox.padding });
    expect(t.button.backgroundColor).toBe('#336699');
    expect(t.button.hoverBackgroundColor).not.toBe(DEFAULT_THEME.button.hoverBackgroundColor);
    expect(t.button.textColor).toBe(DEFAULT_THEME.button.textColor);
    expect(t.fonts.textFont).toContain('Georgia');
    expect(t.fonts.textFontSize).toBe(30);
    expect(t.fonts.titleFont).toBe(DEFAULT_THEME.fonts.titleFont);
  });
});

describe('applyBeatLook: frame picture', () => {
  it("turns the theme's frame picture off for the beat, and only when asked", () => {
    const framed = { ...DEFAULT_THEME, textboxFrameUrl: 'frame.png' };
    expect(applyBeatLook(framed, { textBox: { framePicture: 'off' } }).textboxFrameUrl).toBeUndefined();
    expect(applyBeatLook(framed, { textBox: { opacity: 50 } }).textboxFrameUrl).toBe('frame.png');
  });
});
