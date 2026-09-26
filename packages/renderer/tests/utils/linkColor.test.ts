import { describe, it, expect } from 'vitest';
import { readableLinkColor } from '../../src/utils/linkColor';

describe('readableLinkColor', () => {
  it('skips a transparent button background (text-only choices) and uses the button text colour', () => {
    // Late Light: dark stage, transparent text box, choices = blue text, no fill.
    expect(readableLinkColor({ colors: { textColor: '#e0e0e0' }, textBox: { backgroundColor: 'transparent', opacity: 0 },
      button: { backgroundColor: 'transparent', textColor: '#4a9df0' } })).toBe('#4a9df0');
  });
  it('keeps a button colour that reads on the text box', () => {
    expect(readableLinkColor({ colors: { textColor: '#ffffff' }, textBox: { backgroundColor: '#16213e', opacity: 90 },
      button: { backgroundColor: '#f0a030', textColor: '#000000' } })).toBe('#f0a030');
  });
  it('falls back to the text colour when no theme colour stands out', () => {
    expect(readableLinkColor({ colors: { textColor: '#eeeeee' }, textBox: { backgroundColor: '#111111', opacity: 100 },
      button: { backgroundColor: '#151515', textColor: '#1a1a1a', borderColor: 'transparent' } })).toBe('#eeeeee');
  });
});
