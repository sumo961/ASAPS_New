/**
 * Translation module - Core translation types, sync, and script detection
 *
 * Provides the data structures and utilities for the translation system:
 * - TranslationResource: per-language translation data
 * - TranslationManifest: indexes available languages
 * - Sync: staleness detection and string synchronization
 * - Script detection: Unicode script → Noto font mapping, RTL support
 */

export {
  // Types
  type TranslationOrigin,
  type TextDirection,
  type StringStatus,
  type TranslationEntry,
  type TranslationResource,
  type TranslationManifestEntry,
  type TranslationManifest,
  type TranslationSyncResult,
  // Factory functions
  createEmptyResource,
  createEmptyManifest as createEmptyTranslationManifest,
  buildManifestEntry,
} from './types';

export {
  // Sync
  computeSourceHash,
  syncTranslation,
  applySyncResult,
} from './sync';

export {
  // Script detection
  isRTLLanguage,
  detectRequiredFonts,
  detectFontsForTranslation,
  buildGoogleFontsUrl,
  buildFontStack,
} from './scriptDetection';
