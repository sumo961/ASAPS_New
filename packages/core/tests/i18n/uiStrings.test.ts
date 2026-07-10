/**
 * Tests for the runtime UI-string catalog — the mechanism that lets
 * translated stories show translated renderer chrome (input placeholders,
 * HUD titles, image-picker text, default buttons) and AI loading messages.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  UI_STRING_DEFAULTS,
  setUIStrings,
  uiString,
  formatUIString,
  translateLoadingMessage,
  buildLoadingTranslationMap,
} from '../../src/i18n/uiStrings';

afterEach(() => setUIStrings(null));

describe('uiStrings catalog', () => {
  it('returns English defaults when nothing is installed', () => {
    expect(uiString('continue')).toBe('Continue');
    expect(uiString('inventoryTitle')).toBe('Inventory');
    expect(uiString('imagePickBoth')).toBe('Take or choose a photo');
  });

  it('installs overrides and keeps defaults for missing keys', () => {
    setUIStrings({ continue: 'Weiter', inventoryTitle: 'Inventar' });
    expect(uiString('continue')).toBe('Weiter');
    expect(uiString('inventoryTitle')).toBe('Inventar');
    expect(uiString('playAgain')).toBe('Play Again'); // untouched
  });

  it('ignores empty and unknown override values', () => {
    setUIStrings({ continue: '', bogusKey: 'x' } as any);
    expect(uiString('continue')).toBe('Continue');
  });

  it('resets to defaults when called with null', () => {
    setUIStrings({ continue: 'Weiter' });
    setUIStrings(null);
    expect(uiString('continue')).toBe('Continue');
  });

  it('formatUIString substitutes placeholders', () => {
    setUIStrings({ inventoryExpandHint: '{title} — {count} Gegenstände' });
    expect(formatUIString('inventoryExpandHint', { title: 'Inventar', count: 3 }))
      .toBe('Inventar — 3 Gegenstände');
  });
});

describe('translateLoadingMessage', () => {
  it('translates direct matches', () => {
    const map = new Map([['Thinking...', 'Denke nach...']]);
    expect(translateLoadingMessage('Thinking...', map)).toBe('Denke nach...');
  });

  it('handles {name} templates via pattern matching', () => {
    const map = new Map([
      ['{name} is getting ready to speak...', '{name} macht sich bereit...'],
    ]);
    expect(translateLoadingMessage('Elena is getting ready to speak...', map))
      .toBe('Elena macht sich bereit...');
  });

  it('passes unknown messages through unchanged', () => {
    expect(translateLoadingMessage('Custom message', new Map())).toBe('Custom message');
  });

  it('buildLoadingTranslationMap reflects installed translations', () => {
    setUIStrings({ loadingThinking: 'Denke nach...' });
    const map = buildLoadingTranslationMap();
    expect(map.get('Thinking...')).toBe('Denke nach...');
    // Identity for untranslated entries
    expect(map.get(UI_STRING_DEFAULTS.loadingFetching)).toBe('Fetching data...');
  });
});
