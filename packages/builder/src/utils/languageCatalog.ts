/**
 * Shared language catalog (BCP-47 code + English name).
 *
 * Single source of truth for every surface that lists languages:
 * the translation LanguageSelector, the New Project dialog's story-language
 * field, and (eventually) the settings source-language select. Extracted
 * from LanguageSelector.tsx so consumers stop duplicating ad-hoc lists.
 */

export interface LanguageEntry {
  code: string;
  name: string;
}

/**
 * Common languages shown at the top of language dropdowns.
 */
export const COMMON_LANGUAGES: LanguageEntry[] = [
  { code: 'de', name: 'German' },
  { code: 'fr', name: 'French' },
  { code: 'es', name: 'Spanish' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'nl', name: 'Dutch' },
  { code: 'ja', name: 'Japanese' },
  { code: 'zh-Hans', name: 'Chinese (Simplified)' },
  { code: 'zh-Hant', name: 'Chinese (Traditional)' },
  { code: 'ko', name: 'Korean' },
  { code: 'ar', name: 'Arabic' },
  { code: 'he', name: 'Hebrew' },
  { code: 'ru', name: 'Russian' },
  { code: 'pl', name: 'Polish' },
  { code: 'tr', name: 'Turkish' },
  { code: 'sv', name: 'Swedish' },
  { code: 'da', name: 'Danish' },
  { code: 'fi', name: 'Finnish' },
  { code: 'nb', name: 'Norwegian' },
  { code: 'mt', name: 'Maltese' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'cs', name: 'Czech' },
  { code: 'hu', name: 'Hungarian' },
  { code: 'ro', name: 'Romanian' },
  { code: 'el', name: 'Greek' },
  { code: 'th', name: 'Thai' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'hi', name: 'Hindi' },
  { code: 'bn', name: 'Bengali' },
  { code: 'fa', name: 'Persian' },
  { code: 'ka', name: 'Georgian' },
  { code: 'am', name: 'Amharic' },
];

/**
 * Extended language database for name → code lookup.
 * Covers all ISO 639-1 languages plus common variants.
 */
export const ALL_LANGUAGES: LanguageEntry[] = [
  ...COMMON_LANGUAGES,
  { code: 'af', name: 'Afrikaans' },
  { code: 'sq', name: 'Albanian' },
  { code: 'hy', name: 'Armenian' },
  { code: 'az', name: 'Azerbaijani' },
  { code: 'eu', name: 'Basque' },
  { code: 'be', name: 'Belarusian' },
  { code: 'bs', name: 'Bosnian' },
  { code: 'bg', name: 'Bulgarian' },
  { code: 'my', name: 'Burmese' },
  { code: 'ca', name: 'Catalan' },
  { code: 'hr', name: 'Croatian' },
  { code: 'dv', name: 'Dhivehi' },
  { code: 'et', name: 'Estonian' },
  { code: 'fil', name: 'Filipino' },
  { code: 'gl', name: 'Galician' },
  { code: 'gu', name: 'Gujarati' },
  { code: 'ha', name: 'Hausa' },
  { code: 'haw', name: 'Hawaiian' },
  { code: 'is', name: 'Icelandic' },
  { code: 'ig', name: 'Igbo' },
  { code: 'id', name: 'Indonesian' },
  { code: 'ga', name: 'Irish' },
  { code: 'kn', name: 'Kannada' },
  { code: 'kk', name: 'Kazakh' },
  { code: 'km', name: 'Khmer' },
  { code: 'rw', name: 'Kinyarwanda' },
  { code: 'ku', name: 'Kurdish' },
  { code: 'ky', name: 'Kyrgyz' },
  { code: 'lo', name: 'Lao' },
  { code: 'la', name: 'Latin' },
  { code: 'lv', name: 'Latvian' },
  { code: 'lt', name: 'Lithuanian' },
  { code: 'lb', name: 'Luxembourgish' },
  { code: 'mk', name: 'Macedonian' },
  { code: 'mg', name: 'Malagasy' },
  { code: 'ms', name: 'Malay' },
  { code: 'ml', name: 'Malayalam' },
  { code: 'mi', name: 'Maori' },
  { code: 'mr', name: 'Marathi' },
  { code: 'mn', name: 'Mongolian' },
  { code: 'ne', name: 'Nepali' },
  { code: 'ps', name: 'Pashto' },
  { code: 'pa', name: 'Punjabi' },
  { code: 'sm', name: 'Samoan' },
  { code: 'gd', name: 'Scottish Gaelic' },
  { code: 'sr', name: 'Serbian' },
  { code: 'sn', name: 'Shona' },
  { code: 'sd', name: 'Sindhi' },
  { code: 'si', name: 'Sinhala' },
  { code: 'sk', name: 'Slovak' },
  { code: 'sl', name: 'Slovenian' },
  { code: 'so', name: 'Somali' },
  { code: 'su', name: 'Sundanese' },
  { code: 'sw', name: 'Swahili' },
  { code: 'tl', name: 'Tagalog' },
  { code: 'tg', name: 'Tajik' },
  { code: 'ta', name: 'Tamil' },
  { code: 'tt', name: 'Tatar' },
  { code: 'te', name: 'Telugu' },
  { code: 'ti', name: 'Tigrinya' },
  { code: 'bo', name: 'Tibetan' },
  { code: 'tk', name: 'Turkmen' },
  { code: 'ug', name: 'Uyghur' },
  { code: 'ur', name: 'Urdu' },
  { code: 'uz', name: 'Uzbek' },
  { code: 'cy', name: 'Welsh' },
  { code: 'xh', name: 'Xhosa' },
  { code: 'yi', name: 'Yiddish' },
  { code: 'yo', name: 'Yoruba' },
  { code: 'zu', name: 'Zulu' },
  // Common alternative names / aliases
  { code: 'nb', name: 'Norwegian Bokmal' },
  { code: 'nn', name: 'Norwegian Nynorsk' },
  { code: 'pt-BR', name: 'Brazilian Portuguese' },
  { code: 'es-419', name: 'Latin American Spanish' },
  { code: 'en-GB', name: 'British English' },
  { code: 'fr-CA', name: 'Canadian French' },
  { code: 'zh-Hans', name: 'Mandarin' },
  { code: 'zh-Hant', name: 'Cantonese' },
  { code: 'fa', name: 'Farsi' },
];

/** English display name for a code; falls back to the code itself. */
export function getLanguageDisplayName(code: string): string {
  if (code === 'en') return 'English';
  return ALL_LANGUAGES.find(l => l.code === code)?.name ?? code;
}
