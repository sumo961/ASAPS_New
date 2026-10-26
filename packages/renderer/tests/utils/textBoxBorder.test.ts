import { describe, it, expect } from 'vitest';
import { applyTextBoxBorder } from '../../src/utils/textBoxBorder';
import { DEFAULT_THEME } from '../../src/components/PositionedBeatView';

describe('applyTextBoxBorder', () => {
  const base = { ...DEFAULT_THEME, textBox: { ...DEFAULT_THEME.textBox, borderWidth: 1, borderColor: '#3d4356' } };
  it('hides the border', () => {
    expect(applyTextBoxBorder(base, 'hide').textBox.borderWidth).toBe(0);
  });
  it('shows the project border, or a 2px one in the text colour where the project has none', () => {
    expect(applyTextBoxBorder(base, 'show').textBox).toMatchObject({ borderWidth: 1, borderColor: '#3d4356' });
    const none = { ...base, textBox: { ...base.textBox, borderWidth: 0, borderColor: 'transparent' } };
    expect(applyTextBoxBorder(none, 'show').textBox).toMatchObject({ borderWidth: 2, borderColor: base.colors.textColor });
  });
  it('leaves the theme alone otherwise', () => {
    expect(applyTextBoxBorder(base, undefined)).toBe(base);
    expect(applyTextBoxBorder(undefined, 'hide')).toBeUndefined();
  });
});
