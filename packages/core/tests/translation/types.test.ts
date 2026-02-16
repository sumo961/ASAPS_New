/**
 * Tests for translation types - factory functions and manifest building
 */

import { describe, it, expect } from 'vitest';
import {
  createEmptyResource,
  createEmptyManifest,
  buildManifestEntry,
} from '../../src/translation/types';

describe('Translation Types', () => {
  describe('createEmptyResource', () => {
    it('should create a resource with correct language metadata', () => {
      const resource = createEmptyResource('de', 'German');
      expect(resource.languageCode).toBe('de');
      expect(resource.languageName).toBe('German');
      expect(resource.direction).toBe('ltr');
      expect(resource.origin).toBe('human');
    });

    it('should create a resource with RTL direction', () => {
      const resource = createEmptyResource('ar', 'Arabic', 'rtl');
      expect(resource.direction).toBe('rtl');
    });

    it('should have empty strings and snapshot', () => {
      const resource = createEmptyResource('fr', 'French');
      expect(resource.strings).toEqual({});
      expect(resource._sourceSnapshot).toEqual({});
    });

    it('should set ISO timestamps', () => {
      const before = new Date().toISOString();
      const resource = createEmptyResource('de', 'German');
      const after = new Date().toISOString();

      expect(resource.createdAt >= before).toBe(true);
      expect(resource.createdAt <= after).toBe(true);
      expect(resource.modifiedAt >= before).toBe(true);
    });

    it('should have empty requiredFonts and sourceHash', () => {
      const resource = createEmptyResource('de', 'German');
      expect(resource.requiredFonts).toEqual([]);
      expect(resource.sourceHash).toBe('');
    });
  });

  describe('createEmptyManifest', () => {
    it('should create a manifest with the given source language', () => {
      const manifest = createEmptyManifest('en');
      expect(manifest.sourceLanguage).toBe('en');
      expect(manifest.languages).toEqual([]);
    });

    it('should default to English', () => {
      const manifest = createEmptyManifest();
      expect(manifest.sourceLanguage).toBe('en');
    });

    it('should set a timestamp', () => {
      const manifest = createEmptyManifest();
      expect(manifest.modifiedAt).toBeDefined();
      expect(manifest.modifiedAt.length).toBeGreaterThan(0);
    });
  });

  describe('buildManifestEntry', () => {
    it('should build entry with correct counts for fully translated resource', () => {
      const resource = createEmptyResource('de', 'German');
      resource.strings = {
        'beat:1.text': { value: 'Hallo', status: 'translated' },
        'beat:2.text': { value: 'Welt', status: 'translated' },
      };

      const entry = buildManifestEntry(resource);

      expect(entry.languageCode).toBe('de');
      expect(entry.languageName).toBe('German');
      expect(entry.totalCount).toBe(2);
      expect(entry.translatedCount).toBe(2);
      expect(entry.completeness).toBe(100);
      expect(entry.hasStaleStrings).toBe(false);
      expect(entry.filename).toBe('de.strings.json');
    });

    it('should calculate partial completeness', () => {
      const resource = createEmptyResource('de', 'German');
      resource.strings = {
        'beat:1.text': { value: 'Hallo', status: 'translated' },
        'beat:2.text': { value: 'World', status: 'untranslated' },
        'beat:3.text': { value: 'Goodbye', status: 'untranslated' },
        'beat:4.text': { value: 'Auf Wiedersehen', status: 'translated' },
      };

      const entry = buildManifestEntry(resource);

      expect(entry.totalCount).toBe(4);
      expect(entry.translatedCount).toBe(2);
      expect(entry.completeness).toBe(50);
    });

    it('should detect stale strings', () => {
      const resource = createEmptyResource('de', 'German');
      resource.strings = {
        'beat:1.text': { value: 'Hallo', status: 'translated' },
        'beat:2.text': { value: 'Welt', status: 'stale' },
      };

      const entry = buildManifestEntry(resource);

      expect(entry.hasStaleStrings).toBe(true);
    });

    it('should handle empty resource', () => {
      const resource = createEmptyResource('de', 'German');

      const entry = buildManifestEntry(resource);

      expect(entry.totalCount).toBe(0);
      expect(entry.translatedCount).toBe(0);
      expect(entry.completeness).toBe(0);
    });

    it('should preserve direction', () => {
      const resource = createEmptyResource('ar', 'Arabic', 'rtl');
      resource.strings = {
        'beat:1.text': { value: 'مرحبا', status: 'translated' },
      };

      const entry = buildManifestEntry(resource);
      expect(entry.direction).toBe('rtl');
    });
  });
});
