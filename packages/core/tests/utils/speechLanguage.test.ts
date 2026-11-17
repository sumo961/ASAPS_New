import { describe, it, expect } from 'vitest';
import { speechLocale, speechLanguageCode, voiceSpeaksLanguage } from '../../src/utils/speechLanguage';

describe('speechLocale', () => {
  it('keeps ordinary tags', () => {
    expect(speechLocale('de')).toBe('de');
    expect(speechLocale('en-US')).toBe('en-US');
    expect(speechLocale('pt-BR')).toBe('pt-BR');
  });
  it('turns script and area codes into the region voices are tagged with', () => {
    expect(speechLocale('zh-Hans')).toBe('zh-CN');
    expect(speechLocale('zh-Hant')).toBe('zh-TW');
    expect(speechLocale('es-419')).toBe('es-MX');
  });
  it('reads a language given by name, as on-the-fly translation does', () => {
    expect(speechLocale('German')).toBe('de');
    expect(speechLocale('Deutsch')).toBe('de');
    expect(speechLocale('french')).toBe('fr');
  });
  it('falls back when the language cannot be read', () => {
    expect(speechLocale('')).toBe('en-US');
    expect(speechLocale(undefined, 'de-DE')).toBe('de-DE');
    expect(speechLocale('Klingonish')).toBe('en-US');
  });
});

describe('speechLanguageCode', () => {
  it('gives the bare language code', () => {
    expect(speechLanguageCode('de-AT')).toBe('de');
    expect(speechLanguageCode('zh-Hans')).toBe('zh');
    expect(speechLanguageCode('en-US')).toBe('en');
    expect(speechLanguageCode('German')).toBe('de');
    expect(speechLanguageCode('')).toBeUndefined();
  });
});

describe('voiceSpeaksLanguage', () => {
  it('matches by language, whatever the region', () => {
    expect(voiceSpeaksLanguage('de-DE', 'de')).toBe(true);
    expect(voiceSpeaksLanguage('es-MX', 'es-419')).toBe(true);
    expect(voiceSpeaksLanguage('es_ES', 'es-419')).toBe(true);
    expect(voiceSpeaksLanguage('en-US', 'de')).toBe(false);
  });
  it('keeps Simplified and Traditional Chinese apart', () => {
    expect(voiceSpeaksLanguage('zh-CN', 'zh-Hans')).toBe(true);
    expect(voiceSpeaksLanguage('zh-TW', 'zh-Hans')).toBe(false);
    expect(voiceSpeaksLanguage('zh-TW', 'zh-Hant')).toBe(true);
    expect(voiceSpeaksLanguage('zh-HK', 'zh-Hant')).toBe(true);
    expect(voiceSpeaksLanguage('zh-CN', 'zh')).toBe(true);
  });
});
