/**
 * Tests for script detection - Unicode script detection, Noto font mapping, RTL support
 */

import { describe, it, expect } from 'vitest';
import {
  isRTLLanguage,
  detectRequiredFonts,
  detectFontsForTranslation,
  buildGoogleFontsUrl,
  buildFontStack,
} from '../../src/translation/scriptDetection';

describe('Script Detection', () => {
  describe('isRTLLanguage', () => {
    it('should identify Arabic as RTL', () => {
      expect(isRTLLanguage('ar')).toBe(true);
    });

    it('should identify Hebrew as RTL', () => {
      expect(isRTLLanguage('he')).toBe(true);
    });

    it('should identify Persian as RTL', () => {
      expect(isRTLLanguage('fa')).toBe(true);
    });

    it('should identify Urdu as RTL', () => {
      expect(isRTLLanguage('ur')).toBe(true);
    });

    it('should identify Pashto as RTL', () => {
      expect(isRTLLanguage('ps')).toBe(true);
    });

    it('should identify Yiddish as RTL', () => {
      expect(isRTLLanguage('yi')).toBe(true);
    });

    it('should handle language codes with region subtags (e.g., fa-IR)', () => {
      expect(isRTLLanguage('fa-IR')).toBe(true);
      expect(isRTLLanguage('ar-SA')).toBe(true);
    });

    it('should be case-insensitive', () => {
      expect(isRTLLanguage('AR')).toBe(true);
      expect(isRTLLanguage('He')).toBe(true);
    });

    it('should return false for LTR languages', () => {
      expect(isRTLLanguage('en')).toBe(false);
      expect(isRTLLanguage('de')).toBe(false);
      expect(isRTLLanguage('fr')).toBe(false);
      expect(isRTLLanguage('ja')).toBe(false);
      expect(isRTLLanguage('zh-Hans')).toBe(false);
      expect(isRTLLanguage('ko')).toBe(false);
    });
  });

  describe('detectRequiredFonts', () => {
    it('should return empty array for Latin-only text', () => {
      const fonts = detectRequiredFonts('Hello, world! This is English.');
      expect(fonts).toHaveLength(0);
    });

    it('should detect Arabic script', () => {
      const fonts = detectRequiredFonts('مرحبا بالعالم');
      expect(fonts).toContain('Noto Sans Arabic');
    });

    it('should detect Hebrew script', () => {
      const fonts = detectRequiredFonts('שלום עולם');
      expect(fonts).toContain('Noto Sans Hebrew');
    });

    it('should detect Georgian script', () => {
      const fonts = detectRequiredFonts('გამარჯობა');
      expect(fonts).toContain('Noto Sans Georgian');
    });

    it('should detect Ethiopic script', () => {
      const fonts = detectRequiredFonts('ሰላም');
      expect(fonts).toContain('Noto Sans Ethiopic');
    });

    it('should detect Devanagari script (Hindi)', () => {
      const fonts = detectRequiredFonts('नमस्ते दुनिया');
      expect(fonts).toContain('Noto Sans Devanagari');
    });

    it('should detect Thai script', () => {
      const fonts = detectRequiredFonts('สวัสดีชาวโลก');
      expect(fonts).toContain('Noto Sans Thai');
    });

    it('should detect Korean script', () => {
      const fonts = detectRequiredFonts('안녕하세요');
      expect(fonts).toContain('Noto Sans KR');
    });

    it('should detect Japanese (Hiragana/Katakana)', () => {
      const fonts = detectRequiredFonts('こんにちは');
      expect(fonts).toContain('Noto Sans JP');
    });

    it('should detect CJK ideographs', () => {
      const fonts = detectRequiredFonts('你好世界');
      expect(fonts).toContain('Noto Sans SC');
    });

    it('should detect Bengali script', () => {
      const fonts = detectRequiredFonts('হ্যালো বিশ্ব');
      expect(fonts).toContain('Noto Sans Bengali');
    });

    it('should detect multiple scripts in mixed text', () => {
      const fonts = detectRequiredFonts('Hello مرحبا שלום');
      expect(fonts).toContain('Noto Sans Arabic');
      expect(fonts).toContain('Noto Sans Hebrew');
    });

    it('should not duplicate fonts for text using the same script', () => {
      const fonts = detectRequiredFonts('مرحبا بالعالم كيف حالك');
      const arabicCount = fonts.filter(f => f === 'Noto Sans Arabic').length;
      expect(arabicCount).toBe(1);
    });

    it('should return empty array for empty string', () => {
      expect(detectRequiredFonts('')).toHaveLength(0);
    });

    it('should handle Cyrillic without requiring Noto (covered by default fonts)', () => {
      const fonts = detectRequiredFonts('Привет мир');
      // Cyrillic is skipped — covered by most Western fonts
      expect(fonts).toHaveLength(0);
    });

    it('should handle Greek without requiring Noto (covered by default fonts)', () => {
      const fonts = detectRequiredFonts('Γειά σου Κόσμε');
      expect(fonts).toHaveLength(0);
    });
  });

  describe('detectFontsForTranslation', () => {
    it('should detect fonts across all string values', () => {
      const strings: Record<string, string> = {
        'beat:1.text': 'مرحبا',
        'beat:2.text': 'Hello',
        'beat:3.text': 'გამარჯობა',
      };

      const fonts = detectFontsForTranslation(strings);
      expect(fonts).toContain('Noto Sans Arabic');
      expect(fonts).toContain('Noto Sans Georgian');
    });

    it('should return empty for all-Latin strings', () => {
      const strings: Record<string, string> = {
        'beat:1.text': 'Hello',
        'beat:2.text': 'World',
      };

      const fonts = detectFontsForTranslation(strings);
      expect(fonts).toHaveLength(0);
    });
  });

  describe('buildGoogleFontsUrl', () => {
    it('should return null for empty font list', () => {
      expect(buildGoogleFontsUrl([])).toBeNull();
    });

    it('should build a valid URL for one font', () => {
      const url = buildGoogleFontsUrl(['Noto Sans Arabic']);
      expect(url).toContain('fonts.googleapis.com/css2');
      expect(url).toContain('Noto%20Sans%20Arabic');
      expect(url).toContain('wght@400;700');
    });

    it('should include all fonts in the URL', () => {
      const url = buildGoogleFontsUrl(['Noto Sans Arabic', 'Noto Sans Georgian']);
      expect(url).toContain('Noto%20Sans%20Arabic');
      expect(url).toContain('Noto%20Sans%20Georgian');
    });
  });

  describe('buildFontStack', () => {
    it('should return base font when no Noto fonts needed', () => {
      const stack = buildFontStack('Arial, sans-serif', []);
      expect(stack).toBe('Arial, sans-serif');
    });

    it('should insert Noto fonts before generic fallback', () => {
      const stack = buildFontStack('Arial, sans-serif', ['Noto Sans Arabic']);
      expect(stack).toBe("Arial, 'Noto Sans Arabic', sans-serif");
    });

    it('should insert multiple Noto fonts before generic fallback', () => {
      const stack = buildFontStack('Georgia, serif', ['Noto Sans Arabic', 'Noto Sans Georgian']);
      expect(stack).toBe("Georgia, 'Noto Sans Arabic', 'Noto Sans Georgian', serif");
    });

    it('should append Noto fonts when no generic fallback', () => {
      const stack = buildFontStack("'My Custom Font'", ['Noto Sans Arabic']);
      expect(stack).toBe("'My Custom Font', 'Noto Sans Arabic'");
    });
  });
});
