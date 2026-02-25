/**
 * Tests for translation sync - staleness detection and synchronization
 */

import { describe, it, expect } from 'vitest';
import {
  computeSourceHash,
  syncTranslation,
  applySyncResult,
} from '../../src/translation/sync';
import { createEmptyResource } from '../../src/translation/types';

describe('Translation Sync', () => {
  describe('computeSourceHash', () => {
    it('should return a consistent hash for the same input', () => {
      const strings = { 'key.a': 'Hello', 'key.b': 'World' };
      const hash1 = computeSourceHash(strings);
      const hash2 = computeSourceHash(strings);
      expect(hash1).toBe(hash2);
    });

    it('should return the same hash regardless of insertion order', () => {
      const strings1 = { 'key.b': 'World', 'key.a': 'Hello' };
      const strings2 = { 'key.a': 'Hello', 'key.b': 'World' };
      expect(computeSourceHash(strings1)).toBe(computeSourceHash(strings2));
    });

    it('should return different hashes for different values', () => {
      const strings1 = { 'key.a': 'Hello' };
      const strings2 = { 'key.a': 'Goodbye' };
      expect(computeSourceHash(strings1)).not.toBe(computeSourceHash(strings2));
    });

    it('should return different hashes for different keys', () => {
      const strings1 = { 'key.a': 'Hello' };
      const strings2 = { 'key.b': 'Hello' };
      expect(computeSourceHash(strings1)).not.toBe(computeSourceHash(strings2));
    });

    it('should handle empty input', () => {
      const hash = computeSourceHash({});
      expect(typeof hash).toBe('string');
      expect(hash.length).toBeGreaterThan(0);
    });
  });

  describe('syncTranslation', () => {
    it('should detect no changes when source matches snapshot', () => {
      const source = { 'beat:1.text': 'Hello', 'beat:2.text': 'World' };
      const resource = createEmptyResource('de', 'German');
      resource._sourceSnapshot = { ...source };
      resource.strings = {
        'beat:1.text': { value: 'Hallo', status: 'translated' },
        'beat:2.text': { value: 'Welt', status: 'translated' },
      };

      const result = syncTranslation(resource, source);

      expect(result.hasChanges).toBe(false);
      expect(result.newStrings).toHaveLength(0);
      expect(result.staleStrings).toHaveLength(0);
      expect(result.orphanedStrings).toHaveLength(0);
    });

    it('should detect new strings (untranslated)', () => {
      const resource = createEmptyResource('de', 'German');
      resource._sourceSnapshot = { 'beat:1.text': 'Hello' };
      resource.strings = {
        'beat:1.text': { value: 'Hallo', status: 'translated' },
      };

      const currentSource = {
        'beat:1.text': 'Hello',
        'beat:2.text': 'World',       // new string
        'beat:3.text': 'Goodbye',     // new string
      };

      const result = syncTranslation(resource, currentSource);

      expect(result.hasChanges).toBe(true);
      expect(result.newStrings).toEqual(['beat:2.text', 'beat:3.text']);
      expect(result.staleStrings).toHaveLength(0);
      expect(result.orphanedStrings).toHaveLength(0);
    });

    it('should detect stale strings (source text changed)', () => {
      const resource = createEmptyResource('de', 'German');
      resource._sourceSnapshot = {
        'beat:1.text': 'Hello',
        'beat:2.text': 'World',
      };
      resource.strings = {
        'beat:1.text': { value: 'Hallo', status: 'translated' },
        'beat:2.text': { value: 'Welt', status: 'translated' },
      };

      const currentSource = {
        'beat:1.text': 'Hello there!',   // changed
        'beat:2.text': 'World',           // unchanged
      };

      const result = syncTranslation(resource, currentSource);

      expect(result.hasChanges).toBe(true);
      expect(result.staleStrings).toEqual(['beat:1.text']);
      expect(result.newStrings).toHaveLength(0);
      expect(result.orphanedStrings).toHaveLength(0);
    });

    it('should detect orphaned strings (removed from source)', () => {
      const resource = createEmptyResource('de', 'German');
      resource._sourceSnapshot = {
        'beat:1.text': 'Hello',
        'beat:2.text': 'World',
        'beat:3.text': 'Goodbye',
      };
      resource.strings = {
        'beat:1.text': { value: 'Hallo', status: 'translated' },
        'beat:2.text': { value: 'Welt', status: 'translated' },
        'beat:3.text': { value: 'Auf Wiedersehen', status: 'translated' },
      };

      const currentSource = {
        'beat:1.text': 'Hello',
        // beat:2 and beat:3 removed
      };

      const result = syncTranslation(resource, currentSource);

      expect(result.hasChanges).toBe(true);
      expect(result.orphanedStrings).toEqual(['beat:2.text', 'beat:3.text']);
      expect(result.newStrings).toHaveLength(0);
      expect(result.staleStrings).toHaveLength(0);
    });

    it('should detect all change types simultaneously', () => {
      const resource = createEmptyResource('de', 'German');
      resource._sourceSnapshot = {
        'beat:1.text': 'Hello',
        'beat:2.text': 'World',
        'beat:3.text': 'Goodbye',
      };
      resource.strings = {
        'beat:1.text': { value: 'Hallo', status: 'translated' },
        'beat:2.text': { value: 'Welt', status: 'translated' },
        'beat:3.text': { value: 'Auf Wiedersehen', status: 'translated' },
      };

      const currentSource = {
        'beat:1.text': 'Hello there!',  // stale
        // beat:2 removed (orphaned)
        'beat:3.text': 'Goodbye',       // unchanged
        'beat:4.text': 'New string',    // new
      };

      const result = syncTranslation(resource, currentSource);

      expect(result.hasChanges).toBe(true);
      expect(result.staleStrings).toEqual(['beat:1.text']);
      expect(result.orphanedStrings).toEqual(['beat:2.text']);
      expect(result.newStrings).toEqual(['beat:4.text']);
    });
  });

  describe('applySyncResult', () => {
    it('should add new strings as untranslated with source text', () => {
      const resource = createEmptyResource('de', 'German');
      resource._sourceSnapshot = { 'beat:1.text': 'Hello' };
      resource.strings = {
        'beat:1.text': { value: 'Hallo', status: 'translated' },
      };

      const syncResult = {
        newStrings: ['beat:2.text'],
        staleStrings: [],
        orphanedStrings: [],
        hasChanges: true,
      };

      const currentSource = {
        'beat:1.text': 'Hello',
        'beat:2.text': 'World',
      };

      applySyncResult(resource, syncResult, currentSource);

      expect(resource.strings['beat:2.text']).toEqual({
        value: 'World',
        status: 'untranslated',
      });
      // Existing translation preserved
      expect(resource.strings['beat:1.text'].value).toBe('Hallo');
    });

    it('should mark stale strings', () => {
      const resource = createEmptyResource('de', 'German');
      resource._sourceSnapshot = { 'beat:1.text': 'Hello' };
      resource.strings = {
        'beat:1.text': { value: 'Hallo', status: 'translated' },
      };

      const syncResult = {
        newStrings: [],
        staleStrings: ['beat:1.text'],
        orphanedStrings: [],
        hasChanges: true,
      };

      const currentSource = {
        'beat:1.text': 'Hello there!',
      };

      applySyncResult(resource, syncResult, currentSource);

      expect(resource.strings['beat:1.text'].status).toBe('stale');
      // Translation value is kept (for review)
      expect(resource.strings['beat:1.text'].value).toBe('Hallo');
    });

    it('should update source snapshot and hash', () => {
      const resource = createEmptyResource('de', 'German');
      resource._sourceSnapshot = { 'beat:1.text': 'Hello' };
      resource.sourceHash = 'old-hash';

      const currentSource = { 'beat:1.text': 'Hello there!' };

      applySyncResult(resource, {
        newStrings: [],
        staleStrings: ['beat:1.text'],
        orphanedStrings: [],
        hasChanges: true,
      }, currentSource);

      expect(resource._sourceSnapshot).toEqual(currentSource);
      expect(resource.sourceHash).not.toBe('old-hash');
      expect(resource.sourceHash).toBe(computeSourceHash(currentSource));
    });

    it('should not overwrite existing translated entries for "new" keys', () => {
      const resource = createEmptyResource('de', 'German');
      resource._sourceSnapshot = { 'beat:1.text': 'Hello' };
      resource.strings = {
        'beat:1.text': { value: 'Hallo', status: 'translated' },
        // Key exists in strings (from prior sync or AI generation) but not in snapshot
        'beat:2.text': { value: 'Welt', status: 'translated' },
      };

      const syncResult = {
        newStrings: ['beat:2.text'],  // "new" because not in snapshot
        staleStrings: [],
        orphanedStrings: [],
        hasChanges: true,
      };

      const currentSource = {
        'beat:1.text': 'Hello',
        'beat:2.text': 'World',
      };

      applySyncResult(resource, syncResult, currentSource);

      // Existing translation should be preserved (not overwritten with source text)
      expect(resource.strings['beat:2.text'].value).toBe('Welt');
      expect(resource.strings['beat:2.text'].status).toBe('translated');
    });

    it('should remove orphaned strings from the resource', () => {
      const resource = createEmptyResource('de', 'German');
      resource._sourceSnapshot = {
        'beat:1.text': 'Hello',
        'beat:2.text': 'World',
      };
      resource.strings = {
        'beat:1.text': { value: 'Hallo', status: 'translated' },
        'beat:2.text': { value: 'Welt', status: 'translated' },
      };

      const syncResult = {
        newStrings: [],
        staleStrings: [],
        orphanedStrings: ['beat:2.text'],
        hasChanges: true,
      };

      const currentSource = { 'beat:1.text': 'Hello' };

      applySyncResult(resource, syncResult, currentSource);

      // Orphaned strings are removed (source was deleted)
      expect(resource.strings['beat:2.text']).toBeUndefined();
      // Non-orphaned strings preserved
      expect(resource.strings['beat:1.text'].value).toBe('Hallo');
    });

    it('should remove phantom entries not in snapshot or current source', () => {
      const resource = createEmptyResource('de', 'German');
      resource._sourceSnapshot = { 'beat:1.text': 'Hello' };
      resource.strings = {
        'beat:1.text': { value: 'Hallo', status: 'translated' },
        // Phantom: exists in strings but NOT in snapshot or current source
        // (e.g., from a deleted beat whose snapshot was never persisted)
        'beat:deleted.text': { value: 'Ghost', status: 'untranslated' },
        'beat:deleted.question': { value: 'Phantom', status: 'translated' },
      };

      const syncResult = {
        newStrings: [],
        staleStrings: [],
        orphanedStrings: [],
        hasChanges: false,
      };

      const currentSource = { 'beat:1.text': 'Hello' };

      applySyncResult(resource, syncResult, currentSource);

      // Phantom entries removed — they don't exist in current source
      expect(resource.strings['beat:deleted.text']).toBeUndefined();
      expect(resource.strings['beat:deleted.question']).toBeUndefined();
      // Valid strings preserved
      expect(resource.strings['beat:1.text'].value).toBe('Hallo');
    });
  });
});
