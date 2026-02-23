/**
 * LanguageSelector - Central language selector for the builder toolbar
 *
 * Shows a dropdown with "Source (English)" as default, plus all added translation languages.
 * Switching is near-instant (data-layer clone + apply — pure in-memory operation).
 */

import React, { useState, useRef, useEffect } from 'react';
import { Globe, Plus, Sparkles, PenLine, AlertTriangle, ChevronDown, Type, Play, Trash2 } from 'lucide-react';
import type { TranslationResource, TranslationManifest } from '@asaps/core';

/**
 * Common languages shown at the top of the "Add Translation" dropdown.
 */
const COMMON_LANGUAGES = [
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
const ALL_LANGUAGES: { code: string; name: string }[] = [
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

/**
 * Get filtered suggestions for the custom language search.
 */
function getLanguageSuggestions(
  query: string,
  existingCodes: Set<string>,
  sourceLanguage: string,
  limit = 6,
): { code: string; name: string }[] {
  if (!query.trim()) return [];
  const q = query.trim().toLowerCase();

  return ALL_LANGUAGES
    .filter(l =>
      l.code !== sourceLanguage &&
      !existingCodes.has(l.code) &&
      (l.name.toLowerCase().includes(q) || l.code.toLowerCase().startsWith(q))
    )
    // Deduplicate by code (keep first)
    .filter((l, i, arr) => arr.findIndex(a => a.code === l.code) === i)
    // Sort: prefix matches first, then alphabetical
    .sort((a, b) => {
      const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1;
      const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return a.name.localeCompare(b.name);
    })
    .slice(0, limit);
}

/**
 * Parse a custom language input string into code + name.
 * Accepts formats:
 *   "Dagaare (dga)"  → { code: 'dga', name: 'Dagaare' }
 *   "dga:Dagaare"    → { code: 'dga', name: 'Dagaare' }
 *   "dga: Dagaare"   → { code: 'dga', name: 'Dagaare' }
 *   "dga"            → { code: 'dga', name: 'Dga' }  (code used as name, capitalized)
 */
function parseCustomLanguage(input: string): { code: string; name: string } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Format: "Name (code)" or "Name(code)"
  const parenMatch = trimmed.match(/^(.+?)\s*\(([a-zA-Z]{2,8}(?:-[a-zA-Z0-9]+)?)\)\s*$/);
  if (parenMatch) {
    return { name: parenMatch[1].trim(), code: parenMatch[2].toLowerCase() };
  }

  // Format: "code:Name" or "code: Name"
  const colonMatch = trimmed.match(/^([a-zA-Z]{2,8}(?:-[a-zA-Z0-9]+)?)\s*:\s*(.+)$/);
  if (colonMatch) {
    return { code: colonMatch[1].toLowerCase(), name: colonMatch[2].trim() };
  }

  // Format: bare code (2-8 alpha characters, optionally with subtag)
  const codeMatch = trimmed.match(/^([a-zA-Z]{2,8}(?:-[a-zA-Z0-9]+)?)$/);
  if (codeMatch) {
    const code = codeMatch[1].toLowerCase();
    const name = code.charAt(0).toUpperCase() + code.slice(1);
    return { code, name };
  }

  return null;
}

export interface LanguageSelectorProps {
  /** Source language code (from GlobalSettings) */
  sourceLanguage: string;
  /** Source language display name */
  sourceLanguageName?: string;
  /** Currently active language code (null = source) */
  activeLanguage: string | null;
  /** Available translation resources */
  translations: TranslationResource[];
  /** Translation manifest for completeness info */
  manifest?: TranslationManifest;
  /** Called when user switches to a language (null = back to source) */
  onLanguageChange: (languageCode: string | null) => void;
  /** Called when user wants to generate an AI translation */
  onGenerateTranslation: (languageCode: string, languageName: string) => void;
  /** Called when user wants to create a manual translation template */
  onCreateManualTranslation: (languageCode: string, languageName: string) => void;
  /** Whether an AI translation is currently being generated */
  isGenerating?: boolean;
  /** Called when user wants to delete a translation */
  onDeleteTranslation?: (languageCode: string) => void;
  /** Called when user wants to continue translating (new + stale strings) */
  onContinueTranslation?: (languageCode: string, languageName: string) => void;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  sourceLanguage,
  sourceLanguageName,
  activeLanguage,
  translations,
  manifest,
  onLanguageChange,
  onGenerateTranslation,
  onCreateManualTranslation,
  isGenerating = false,
  onDeleteTranslation,
  onContinueTranslation,
}) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customSearch, setCustomSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const customSearchRef = useRef<HTMLInputElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
        setShowAddMenu(false);
        setShowCustomInput(false);
        setCustomSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const existingCodes = new Set(translations.map(t => t.languageCode));
  const hasStaleStrings = translations.some(t =>
    Object.values(t.strings).some(s => s.status === 'stale')
  );

  // Get display name for active language
  const activeTranslation = activeLanguage
    ? translations.find(t => t.languageCode === activeLanguage)
    : null;

  const displayLabel = activeLanguage
    ? activeTranslation?.languageName || activeLanguage
    : `Source (${sourceLanguageName || sourceLanguage})`;

  // Filter languages not yet added for the "Add" menu
  const availableLanguages = COMMON_LANGUAGES.filter(
    l => l.code !== sourceLanguage && !existingCodes.has(l.code)
  );

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Main selector button */}
      <button
        onClick={() => { setShowDropdown(!showDropdown); setShowAddMenu(false); }}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded border transition-colors ${
          activeLanguage
            ? 'bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100'
            : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
        } ${isGenerating ? 'opacity-60 cursor-wait' : ''}`}
        disabled={isGenerating}
        title="Switch language for preview and inspector"
      >
        <Globe className="w-3.5 h-3.5" />
        <span className="max-w-[120px] truncate">{displayLabel}</span>
        {hasStaleStrings && (
          <span title="Some translations are stale"><AlertTriangle className="w-3 h-3 text-amber-500" /></span>
        )}
        <ChevronDown className="w-3 h-3 opacity-50" />
      </button>

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
          {/* Source language */}
          <button
            onClick={() => { onLanguageChange(null); setShowDropdown(false); }}
            className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-gray-50 ${
              !activeLanguage ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
            }`}
          >
            <span className="w-5 text-center text-xs text-gray-400">
              {!activeLanguage ? '>' : ''}
            </span>
            Source ({sourceLanguageName || sourceLanguage})
          </button>

          {/* Separator */}
          {translations.length > 0 && <div className="border-t border-gray-100" />}

          {/* Translation languages */}
          {translations.map(t => {
            const entry = manifest?.languages.find(l => l.languageCode === t.languageCode);
            const completeness = entry?.completeness ?? 100;
            const hasStale = Object.values(t.strings).some(s => s.status === 'stale');
            return (
              <div
                key={t.languageCode}
                className={`w-full px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-50 ${
                  activeLanguage === t.languageCode ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                }`}
              >
                <button
                  onClick={() => { onLanguageChange(t.languageCode); setShowDropdown(false); }}
                  className="flex items-center gap-2 flex-1 min-w-0 text-left"
                >
                  <span className="w-5 text-center text-xs text-gray-400 flex-shrink-0">
                    {activeLanguage === t.languageCode ? '>' : ''}
                  </span>
                  <span className="flex-1 truncate">
                    {t.languageName}
                    <span className="text-xs text-gray-400 ml-1">({t.languageCode})</span>
                  </span>
                  <span className="flex items-center gap-1 flex-shrink-0">
                    {hasStale && <AlertTriangle className="w-3 h-3 text-amber-500" />}
                    <span className={`text-xs ${completeness === 100 ? 'text-green-600' : 'text-gray-400'}`}>
                      {completeness}%
                    </span>
                  </span>
                </button>
                {/* Per-language action buttons */}
                <span className="flex items-center gap-0.5 flex-shrink-0">
                  {completeness < 100 && onContinueTranslation && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onContinueTranslation(t.languageCode, t.languageName);
                        setShowDropdown(false);
                      }}
                      className="p-1 rounded hover:bg-blue-100 text-blue-500"
                      title="Continue translation — translate new & changed strings"
                    >
                      <Play className="w-3 h-3" />
                    </button>
                  )}
                  {onDeleteTranslation && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm(`Remove the ${t.languageName} translation? This cannot be undone.`)) {
                          onDeleteTranslation(t.languageCode);
                          setShowDropdown(false);
                        }
                      }}
                      className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-500"
                      title="Remove translation"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </span>
              </div>
            );
          })}

          {/* Add translation */}
          <div className="border-t border-gray-100">
            <button
              onClick={() => setShowAddMenu(!showAddMenu)}
              className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 text-blue-600 hover:bg-blue-50"
            >
              <Plus className="w-4 h-4" />
              Add Translation...
            </button>
          </div>

          {/* Add translation sub-menu */}
          {showAddMenu && (
            <div className="border-t border-gray-100 max-h-60 overflow-y-auto">
              {availableLanguages.map(lang => (
                <div
                  key={lang.code}
                  className="px-3 py-1.5 text-sm flex items-center gap-2 hover:bg-gray-50"
                >
                  <span className="flex-1 text-gray-700">{lang.name}</span>
                  <button
                    onClick={() => {
                      onGenerateTranslation(lang.code, lang.name);
                      setShowAddMenu(false);
                      setShowDropdown(false);
                    }}
                    className="p-1 rounded hover:bg-blue-100 text-blue-600"
                    title="Generate AI translation"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      onCreateManualTranslation(lang.code, lang.name);
                      setShowAddMenu(false);
                      setShowDropdown(false);
                    }}
                    className="p-1 rounded hover:bg-green-100 text-green-600"
                    title="Create for manual translation"
                  >
                    <PenLine className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}

              {/* Search / custom language option */}
              <div className="border-t border-gray-100">
                {!showCustomInput ? (
                  <button
                    onClick={() => {
                      setShowCustomInput(true);
                      setCustomSearch('');
                      setTimeout(() => customSearchRef.current?.focus(), 50);
                    }}
                    className="w-full px-3 py-1.5 text-sm flex items-center gap-2 text-gray-500 hover:bg-gray-50"
                  >
                    <Type className="w-3.5 h-3.5" />
                    <span>Search languages...</span>
                  </button>
                ) : (
                  <div className="px-3 py-2 space-y-1">
                    <input
                      ref={customSearchRef}
                      type="text"
                      value={customSearch}
                      onChange={(e) => setCustomSearch(e.target.value)}
                      placeholder="e.g. Swahili, Dagaare (dga), dga"
                      className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                    {/* Suggestions */}
                    {customSearch.trim() && (() => {
                      const suggestions = getLanguageSuggestions(customSearch, existingCodes, sourceLanguage);
                      if (suggestions.length === 0) {
                        // No match — offer custom code entry
                        const trimmed = customSearch.trim();
                        const custom = parseCustomLanguage(trimmed);
                        return (
                          <div className="py-1 space-y-1">
                            <div className="text-xs text-gray-400 italic">
                              No matching language in the built-in list.
                            </div>
                            {custom && !existingCodes.has(custom.code) ? (
                              <div className="py-1 text-sm flex items-center gap-2 hover:bg-gray-50 rounded">
                                <span className="flex-1 text-gray-700">
                                  {custom.name}
                                  <span className="text-xs text-gray-400 ml-1">({custom.code})</span>
                                </span>
                                <button
                                  onClick={() => {
                                    onGenerateTranslation(custom.code, custom.name);
                                    setShowAddMenu(false);
                                    setShowDropdown(false);
                                    setShowCustomInput(false);
                                    setCustomSearch('');
                                  }}
                                  className="p-1 rounded hover:bg-blue-100 text-blue-600"
                                  title="Generate AI translation"
                                >
                                  <Sparkles className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => {
                                    onCreateManualTranslation(custom.code, custom.name);
                                    setShowAddMenu(false);
                                    setShowDropdown(false);
                                    setShowCustomInput(false);
                                    setCustomSearch('');
                                  }}
                                  className="p-1 rounded hover:bg-green-100 text-green-600"
                                  title="Create for manual translation"
                                >
                                  <PenLine className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="text-xs text-gray-500">
                                Type a name and code, e.g. "Dagaare (dga)" or "dga:Dagaare"
                              </div>
                            )}
                          </div>
                        );
                      }
                      return suggestions.map(lang => (
                        <div
                          key={lang.code}
                          className="py-1 text-sm flex items-center gap-2 hover:bg-gray-50 rounded"
                        >
                          <span className="flex-1 text-gray-700">
                            {lang.name}
                            <span className="text-xs text-gray-400 ml-1">({lang.code})</span>
                          </span>
                          <button
                            onClick={() => {
                              onGenerateTranslation(lang.code, lang.name);
                              setShowAddMenu(false);
                              setShowDropdown(false);
                              setShowCustomInput(false);
                              setCustomSearch('');
                            }}
                            className="p-1 rounded hover:bg-blue-100 text-blue-600"
                            title="Generate AI translation"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              onCreateManualTranslation(lang.code, lang.name);
                              setShowAddMenu(false);
                              setShowDropdown(false);
                              setShowCustomInput(false);
                              setCustomSearch('');
                            }}
                            className="p-1 rounded hover:bg-green-100 text-green-600"
                            title="Create for manual translation"
                          >
                            <PenLine className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ));
                    })()}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
