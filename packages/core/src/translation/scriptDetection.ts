/**
 * Script Detection - Unicode script detection, Noto font mapping, RTL support
 *
 * Detects which Unicode scripts are present in translated text and maps them
 * to the appropriate Noto Sans font variants for correct rendering.
 * Also provides RTL language detection.
 */

/**
 * Unicode script ranges and their corresponding Noto Sans font variants.
 * Each entry defines a character range (start-end) and the Google Fonts family name.
 */
interface ScriptRange {
  /** Script identifier */
  script: string;
  /** Start of Unicode range (inclusive) */
  start: number;
  /** End of Unicode range (inclusive) */
  end: number;
  /** Noto Sans variant name for Google Fonts */
  notoFont: string;
}

const SCRIPT_RANGES: ScriptRange[] = [
  // Arabic (includes Persian, Urdu, Pashto, etc.)
  { script: 'Arabic', start: 0x0600, end: 0x06FF, notoFont: 'Noto Sans Arabic' },
  { script: 'Arabic Supplement', start: 0x0750, end: 0x077F, notoFont: 'Noto Sans Arabic' },
  { script: 'Arabic Extended-A', start: 0x08A0, end: 0x08FF, notoFont: 'Noto Sans Arabic' },

  // Hebrew
  { script: 'Hebrew', start: 0x0590, end: 0x05FF, notoFont: 'Noto Sans Hebrew' },

  // Devanagari (Hindi, Sanskrit, Marathi, Nepali)
  { script: 'Devanagari', start: 0x0900, end: 0x097F, notoFont: 'Noto Sans Devanagari' },

  // Bengali
  { script: 'Bengali', start: 0x0980, end: 0x09FF, notoFont: 'Noto Sans Bengali' },

  // Tamil
  { script: 'Tamil', start: 0x0B80, end: 0x0BFF, notoFont: 'Noto Sans Tamil' },

  // Telugu
  { script: 'Telugu', start: 0x0C00, end: 0x0C7F, notoFont: 'Noto Sans Telugu' },

  // Thai
  { script: 'Thai', start: 0x0E00, end: 0x0E7F, notoFont: 'Noto Sans Thai' },

  // Georgian
  { script: 'Georgian', start: 0x10A0, end: 0x10FF, notoFont: 'Noto Sans Georgian' },

  // Ethiopic (Ge'ez)
  { script: 'Ethiopic', start: 0x1200, end: 0x137F, notoFont: 'Noto Sans Ethiopic' },

  // Khmer
  { script: 'Khmer', start: 0x1780, end: 0x17FF, notoFont: 'Noto Sans Khmer' },

  // Myanmar (Burmese)
  { script: 'Myanmar', start: 0x1000, end: 0x109F, notoFont: 'Noto Sans Myanmar' },

  // Korean (Hangul Syllables)
  { script: 'Korean', start: 0xAC00, end: 0xD7AF, notoFont: 'Noto Sans KR' },
  { script: 'Korean Jamo', start: 0x1100, end: 0x11FF, notoFont: 'Noto Sans KR' },

  // CJK Unified Ideographs (Chinese/Japanese share these)
  { script: 'CJK', start: 0x4E00, end: 0x9FFF, notoFont: 'Noto Sans SC' },
  { script: 'CJK Extension A', start: 0x3400, end: 0x4DBF, notoFont: 'Noto Sans SC' },

  // Japanese-specific (Hiragana + Katakana)
  { script: 'Hiragana', start: 0x3040, end: 0x309F, notoFont: 'Noto Sans JP' },
  { script: 'Katakana', start: 0x30A0, end: 0x30FF, notoFont: 'Noto Sans JP' },

  // Armenian
  { script: 'Armenian', start: 0x0530, end: 0x058F, notoFont: 'Noto Sans Armenian' },

  // Syriac
  { script: 'Syriac', start: 0x0700, end: 0x074F, notoFont: 'Noto Sans Syriac' },

  // Thaana (Maldivian)
  { script: 'Thaana', start: 0x0780, end: 0x07BF, notoFont: 'Noto Sans Thaana' },

  // N'Ko
  { script: 'NKo', start: 0x07C0, end: 0x07FF, notoFont: 'Noto Sans NKo' },

  // Gujarati
  { script: 'Gujarati', start: 0x0A80, end: 0x0AFF, notoFont: 'Noto Sans Gujarati' },

  // Gurmukhi (Punjabi)
  { script: 'Gurmukhi', start: 0x0A00, end: 0x0A7F, notoFont: 'Noto Sans Gurmukhi' },

  // Kannada
  { script: 'Kannada', start: 0x0C80, end: 0x0CFF, notoFont: 'Noto Sans Kannada' },

  // Malayalam
  { script: 'Malayalam', start: 0x0D00, end: 0x0D7F, notoFont: 'Noto Sans Malayalam' },

  // Sinhala
  { script: 'Sinhala', start: 0x0D80, end: 0x0DFF, notoFont: 'Noto Sans Sinhala' },

  // Lao
  { script: 'Lao', start: 0x0E80, end: 0x0EFF, notoFont: 'Noto Sans Lao' },

  // Tibetan
  { script: 'Tibetan', start: 0x0F00, end: 0x0FFF, notoFont: 'Noto Sans Tibetan' },
];

/**
 * RTL language codes (BCP 47 primary subtags).
 * These languages are written right-to-left.
 */
const RTL_LANGUAGES = new Set([
  'ar',  // Arabic
  'he',  // Hebrew
  'fa',  // Persian (Farsi)
  'ur',  // Urdu
  'ps',  // Pashto
  'yi',  // Yiddish
  'sd',  // Sindhi
  'dv',  // Dhivehi (Maldivian / Thaana script)
  'ku',  // Kurdish (when written in Arabic script)
  'ug',  // Uyghur
  'arc', // Aramaic
  'syc', // Syriac
  'nqo', // N'Ko
]);

/**
 * Check if a language code represents an RTL language.
 *
 * @param languageCode - BCP 47 language code (e.g., 'ar', 'he', 'fa-IR')
 * @returns true if the language is RTL
 */
export function isRTLLanguage(languageCode: string): boolean {
  // Extract primary language subtag (before first hyphen)
  const primary = languageCode.split('-')[0].toLowerCase();
  return RTL_LANGUAGES.has(primary);
}

/**
 * Detect which Unicode scripts are present in the given text.
 * Returns a deduplicated list of Noto Sans font family names needed.
 *
 * @param text - The text to analyze
 * @returns Array of Noto Sans font family names (e.g., ['Noto Sans Arabic', 'Noto Sans Georgian'])
 */
export function detectRequiredFonts(text: string): string[] {
  const foundFonts = new Set<string>();

  for (let i = 0; i < text.length; i++) {
    const codePoint = text.codePointAt(i)!;

    // Skip ASCII and common Latin Extended ranges — covered by default fonts
    if (codePoint < 0x0300) continue;

    // Skip Latin Extended, IPA, Spacing Modifiers, Combining Marks — usually covered
    if (codePoint >= 0x0300 && codePoint < 0x0530) continue;

    // Skip Cyrillic — covered by most Western fonts and Noto Sans Latin
    if (codePoint >= 0x0400 && codePoint < 0x0530) continue;

    // Skip Greek — covered by most Western fonts
    if (codePoint >= 0x0370 && codePoint < 0x0400) continue;

    for (const range of SCRIPT_RANGES) {
      if (codePoint >= range.start && codePoint <= range.end) {
        foundFonts.add(range.notoFont);
        break;
      }
    }

    // Handle surrogate pairs for code points > 0xFFFF
    if (codePoint > 0xFFFF) {
      i++; // Skip the low surrogate
    }
  }

  return Array.from(foundFonts);
}

/**
 * Detect required fonts from a translation resource's string values.
 * Scans all translated text and returns the Noto font variants needed.
 *
 * @param strings - Record of translation key → translated text
 * @returns Array of Noto Sans font family names
 */
export function detectFontsForTranslation(strings: Record<string, string>): string[] {
  const allText = Object.values(strings).join(' ');
  return detectRequiredFonts(allText);
}

/**
 * Build the Google Fonts CSS URL for loading the required Noto font variants.
 *
 * @param fonts - Array of Noto font family names
 * @returns CSS @import URL, or null if no fonts needed
 */
export function buildGoogleFontsUrl(fonts: string[]): string | null {
  if (fonts.length === 0) return null;

  // Google Fonts API v2 format
  const families = fonts
    .map(f => `family=${encodeURIComponent(f)}:wght@400;700`)
    .join('&');

  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}

/**
 * Build a CSS font-stack string that includes the required Noto variants
 * as fallbacks after the user's chosen font.
 *
 * @param baseFontFamily - The user's chosen CSS font-family (e.g., 'Arial, sans-serif')
 * @param notoFonts - Required Noto font family names
 * @returns Combined CSS font-family string
 */
export function buildFontStack(baseFontFamily: string, notoFonts: string[]): string {
  if (notoFonts.length === 0) return baseFontFamily;

  // Parse the base font-family to insert Noto variants before the generic fallback
  const parts = baseFontFamily.split(',').map(p => p.trim());
  const genericFallbacks = ['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui'];

  // Find where generic fallbacks start
  const genericIndex = parts.findIndex(p => genericFallbacks.includes(p.toLowerCase()));

  // Quote Noto font names
  const quotedNoto = notoFonts.map(f => `'${f}'`);

  if (genericIndex >= 0) {
    // Insert before generic fallbacks
    parts.splice(genericIndex, 0, ...quotedNoto);
  } else {
    // Append at the end
    parts.push(...quotedNoto);
  }

  return parts.join(', ');
}
