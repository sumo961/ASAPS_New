/**
 * Tests for detectProjectFormat — pure function that routes a source
 * string (file path / project id) to the right PersistenceAdapter
 * (directory / zip / indexeddb).
 *
 * Misclassification has cascading consequences:
 *   - directory source mis-tagged as zip → tries to unzip a folder
 *   - indexeddb project ID mis-tagged as directory → tries to read
 *     /<uuid> on disk and fails confusingly
 *   - zip mis-tagged as indexeddb → looks up UUID instead of file
 *
 * Coverage focus:
 *   - .zip extension → 'zip'
 *   - .asaps.zip extension → 'zip'
 *   - canonical UUID → 'indexeddb'
 *   - everything else → 'directory'
 *   - case sensitivity of extension
 *   - UUID format strictness (rejects malformed)
 */
import { describe, it, expect } from 'vitest';
import { detectProjectFormat } from '../PersistenceAdapter';

describe('detectProjectFormat', () => {
  describe('ZIP detection', () => {
    it('detects ".asaps.zip" extension', () => {
      expect(detectProjectFormat('/path/to/my-story.asaps.zip')).toBe('zip');
    });

    it('detects bare ".zip" extension', () => {
      // Plain .zip is also treated as zip — user might rename
      // or export with a non-canonical extension. Better to
      // try unzipping than to mis-route to directory.
      expect(detectProjectFormat('/downloads/story.zip')).toBe('zip');
    });

    it('treats relative paths to .zip the same way', () => {
      expect(detectProjectFormat('story.zip')).toBe('zip');
      expect(detectProjectFormat('./local/x.asaps.zip')).toBe('zip');
    });
  });

  describe('IndexedDB UUID detection', () => {
    it('detects canonical UUID v4 format', () => {
      // 8-4-4-4-12 hex groups separated by dashes. The pattern
      // is intentionally strict so non-UUID-shaped strings don't
      // get accidentally routed to IndexedDB lookup.
      expect(detectProjectFormat('550e8400-e29b-41d4-a716-446655440000')).toBe('indexeddb');
    });

    it('is case-insensitive on hex digits', () => {
      // Both lower and upper hex characters are valid in UUIDs.
      expect(detectProjectFormat('ABCDEF12-3456-7890-ABCD-EF1234567890')).toBe('indexeddb');
      expect(detectProjectFormat('abcdef12-3456-7890-abcd-ef1234567890')).toBe('indexeddb');
    });

    it('rejects malformed UUID with wrong group sizes', () => {
      // Off-by-one in any group would route to directory, which
      // tries the filesystem and fails with a meaningful error.
      // Critical: a project ID like "abcdef-1234-..." (7 hex
      // instead of 8) must NOT match.
      expect(detectProjectFormat('abcdef1-3456-7890-abcd-ef1234567890')).toBe('directory');
      expect(detectProjectFormat('abcdef12-3456-7890-abcd-ef123456789')).toBe('directory');
    });

    it('rejects UUID with missing dashes', () => {
      expect(detectProjectFormat('550e8400e29b41d4a716446655440000')).toBe('directory');
    });

    it('rejects UUID with non-hex chars', () => {
      // 'g' is not a hex digit. Must NOT match.
      expect(detectProjectFormat('gggggggg-1234-5678-9abc-def123456789')).toBe('directory');
    });

    it('rejects extra characters before/after UUID', () => {
      // The pattern is anchored — a path that contains a UUID
      // somewhere should NOT match. The whole string must be a
      // UUID for the indexeddb route.
      expect(detectProjectFormat('/path/to/550e8400-e29b-41d4-a716-446655440000'))
        .toBe('directory');
      expect(detectProjectFormat('550e8400-e29b-41d4-a716-446655440000/extra'))
        .toBe('directory');
    });
  });

  describe('directory fallback', () => {
    it('treats unix-style paths as directory', () => {
      expect(detectProjectFormat('/Users/alice/projects/my-story')).toBe('directory');
    });

    it('treats Windows-style paths as directory', () => {
      expect(detectProjectFormat('C:\\Users\\alice\\projects\\my-story')).toBe('directory');
    });

    it('treats home-relative paths as directory', () => {
      expect(detectProjectFormat('~/projects/my-story')).toBe('directory');
    });

    it('treats plain names as directory', () => {
      // Bare folder names default to directory — let the adapter
      // throw a useful error if the folder doesn't exist.
      expect(detectProjectFormat('my-project-folder')).toBe('directory');
    });

    it('treats empty string as directory', () => {
      // Defensive — empty string falls through to directory.
      // The directory adapter then surfaces a meaningful error.
      expect(detectProjectFormat('')).toBe('directory');
    });
  });

  describe('boundary cases', () => {
    it('does NOT detect .zip in the middle of a path', () => {
      // The regex uses endsWith, not includes — a folder named
      // ".zip-backups" wouldn't be mis-routed.
      expect(detectProjectFormat('/projects/.zip-backups/folder')).toBe('directory');
    });

    it('is case-sensitive on .zip extension', () => {
      // endsWith is case-sensitive in JS. Pin so a future refactor
      // to case-insensitive is a deliberate edit. Author-typed
      // ".ZIP" files would route to directory — questionable but
      // pinned.
      expect(detectProjectFormat('/path/to/STORY.ZIP')).toBe('directory');
    });
  });
});
