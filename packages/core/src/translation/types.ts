/**
 * Translation Types - Core data structures for the translation system
 *
 * Defines the TranslationResource format (one JSON file per language) and
 * the TranslationManifest (indexes available languages with completeness info).
 */

/**
 * Origin of a translation: AI-generated, human-edited, or a mix.
 */
export type TranslationOrigin = 'ai' | 'human' | 'mixed';

/**
 * Text direction for the translation language.
 */
export type TextDirection = 'ltr' | 'rtl';

/**
 * Status of an individual translated string.
 */
export type StringStatus = 'translated' | 'untranslated' | 'stale';

/**
 * A single translation entry with metadata.
 */
export interface TranslationEntry {
  /** The translated text value */
  value: string;
  /** Status of this translation */
  status: StringStatus;
}

/**
 * A translation resource file for a single language.
 * Stored as `translations/{languageCode}.strings.json`.
 *
 * Keys use the ID-based format: `beat:{beatId}.parameters.text`
 * Non-beat strings (character names, metadata) use positional keys.
 */
export interface TranslationResource {
  /** BCP 47 language code (e.g., 'de', 'fr', 'ar', 'zh-Hans') */
  languageCode: string;

  /** Human-readable language name (e.g., 'German', 'French') */
  languageName: string;

  /** Origin of this translation */
  origin: TranslationOrigin;

  /** Text direction for this language */
  direction: TextDirection;

  /** Noto font variants required for this language's scripts */
  requiredFonts: string[];

  /**
   * Hash of the source strings at the time this translation was created/synced.
   * Used for staleness detection — if current source hash differs, translations
   * may be out of date.
   */
  sourceHash: string;

  /** ISO 8601 timestamp of when this resource was created */
  createdAt: string;

  /** ISO 8601 timestamp of last modification */
  modifiedAt: string;

  /**
   * The translated strings. Keys are ID-based paths like:
   * - `beat:{beatId}.parameters.text`
   * - `beat:{beatId}.parameters.choices.0.displayText`
   * - `project.story.metadata.title`
   * - `project.story.characters.0.name`
   */
  strings: Record<string, TranslationEntry>;

  /**
   * Snapshot of the original source text at translation time.
   * Used for staleness detection: compare current source strings
   * against this snapshot to find changed/new/removed strings.
   */
  _sourceSnapshot: Record<string, string>;
}

/**
 * Entry in the translation manifest for a single language.
 */
export interface TranslationManifestEntry {
  /** BCP 47 language code */
  languageCode: string;

  /** Human-readable language name */
  languageName: string;

  /** Origin of this translation */
  origin: TranslationOrigin;

  /** Text direction */
  direction: TextDirection;

  /** Number of translated strings */
  translatedCount: number;

  /** Total number of strings */
  totalCount: number;

  /** Completeness percentage (0-100) */
  completeness: number;

  /** Whether any strings are stale (source changed since translation) */
  hasStaleStrings: boolean;

  /** Filename of the resource file */
  filename: string;
}

/**
 * Translation manifest file: `translations/_manifest.json`.
 * Indexes all available translations for a project.
 */
export interface TranslationManifest {
  /** The source language of the project (BCP 47) */
  sourceLanguage: string;

  /** Available translations */
  languages: TranslationManifestEntry[];

  /** ISO 8601 timestamp of last manifest update */
  modifiedAt: string;
}

/**
 * Result of syncing a translation resource against current source strings.
 */
export interface TranslationSyncResult {
  /** Strings that exist in source but not in translation (need translating) */
  newStrings: string[];

  /** Strings where the source text changed since translation */
  staleStrings: string[];

  /** Strings in translation that no longer exist in source */
  orphanedStrings: string[];

  /** Whether any changes were detected */
  hasChanges: boolean;
}

/**
 * Create an empty TranslationResource for a language.
 */
export function createEmptyResource(
  languageCode: string,
  languageName: string,
  direction: TextDirection = 'ltr'
): TranslationResource {
  const now = new Date().toISOString();
  return {
    languageCode,
    languageName,
    origin: 'human',
    direction,
    requiredFonts: [],
    sourceHash: '',
    createdAt: now,
    modifiedAt: now,
    strings: {},
    _sourceSnapshot: {},
  };
}

/**
 * Fill in whatever a stored translation resource is missing, so a resource
 * written by another tool (or an older version) loads instead of failing the
 * whole project. Entries without a language code are dropped; string entries
 * given as plain text become translated entries.
 */
export function normalizeTranslationResources(list: unknown): TranslationResource[] {
  if (!Array.isArray(list)) return [];
  const out: TranslationResource[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Partial<TranslationResource> & Record<string, unknown>;
    if (typeof r.languageCode !== 'string' || !r.languageCode) continue;
    const base = createEmptyResource(r.languageCode, typeof r.languageName === 'string' && r.languageName ? r.languageName : r.languageCode);
    const strings: Record<string, TranslationEntry> = {};
    if (r.strings && typeof r.strings === 'object') {
      for (const [key, entry] of Object.entries(r.strings as Record<string, unknown>)) {
        if (typeof entry === 'string') strings[key] = { value: entry, status: 'translated' };
        else if (entry && typeof entry === 'object' && typeof (entry as TranslationEntry).value === 'string') {
          const e = entry as TranslationEntry;
          strings[key] = { value: e.value, status: e.status ?? 'translated' };
        }
      }
    }
    out.push({
      ...base,
      ...r,
      origin: r.origin ?? base.origin,
      direction: r.direction === 'rtl' ? 'rtl' : 'ltr',
      requiredFonts: Array.isArray(r.requiredFonts) ? r.requiredFonts : [],
      sourceHash: typeof r.sourceHash === 'string' ? r.sourceHash : '',
      createdAt: typeof r.createdAt === 'string' ? r.createdAt : base.createdAt,
      modifiedAt: typeof r.modifiedAt === 'string' ? r.modifiedAt : base.modifiedAt,
      strings,
      _sourceSnapshot: r._sourceSnapshot && typeof r._sourceSnapshot === 'object' ? r._sourceSnapshot : {},
    } as TranslationResource);
  }
  return out;
}

/**
 * Create an empty TranslationManifest.
 */
export function createEmptyManifest(sourceLanguage: string = 'en'): TranslationManifest {
  return {
    sourceLanguage,
    languages: [],
    modifiedAt: new Date().toISOString(),
  };
}

/**
 * Build a manifest entry from a TranslationResource.
 */
export function buildManifestEntry(resource: TranslationResource): TranslationManifestEntry {
  const entries = Object.values(resource.strings);
  const totalCount = entries.length;
  const translatedCount = entries.filter(e => e.status === 'translated').length;
  const hasStaleStrings = entries.some(e => e.status === 'stale');

  return {
    languageCode: resource.languageCode,
    languageName: resource.languageName,
    origin: resource.origin,
    direction: resource.direction,
    translatedCount,
    totalCount,
    completeness: totalCount > 0 ? Math.round((translatedCount / totalCount) * 100) : 0,
    hasStaleStrings,
    filename: `${resource.languageCode}.strings.json`,
  };
}
