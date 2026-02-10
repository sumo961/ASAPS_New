import { describe, it, expect } from 'vitest';
import {
  createEmptyManifest,
  serializeManifest,
  parseManifest,
  setManifestEntry,
  removeManifestEntry,
  getManifestEntry,
  getAssetRelativePath,
  getAssetFolder,
  generateUniqueFilename,
  type AssetManifestEntry,
} from '../../src/persistence/AssetManifest';

describe('AssetManifest', () => {
  describe('createEmptyManifest', () => {
    it('creates a manifest with format version and empty assets', () => {
      const manifest = createEmptyManifest();
      expect(manifest._format).toBe('1.0');
      expect(manifest.assets).toEqual({});
    });
  });

  describe('serializeManifest / parseManifest roundtrip', () => {
    it('serializes and parses back to equivalent data', () => {
      const manifest = createEmptyManifest();
      setManifestEntry(manifest, {
        id: 'asset_1',
        filename: 'forest.jpg',
        type: 'image',
        mimeType: 'image/jpeg',
        size: 12345,
        folder: 'backgrounds',
      });

      const json = serializeManifest(manifest);
      const parsed = parseManifest(json);

      expect(parsed._format).toBe('1.0');
      expect(parsed.assets['asset_1'].filename).toBe('forest.jpg');
      expect(parsed.assets['asset_1'].size).toBe(12345);
    });

    it('throws on invalid JSON manifest', () => {
      expect(() => parseManifest('{}')).toThrow('Invalid asset manifest');
      expect(() => parseManifest('{"_format":"1.0"}')).toThrow('Invalid asset manifest');
    });
  });

  describe('setManifestEntry', () => {
    it('adds a new entry', () => {
      const manifest = createEmptyManifest();
      const entry: AssetManifestEntry = {
        id: 'a1',
        filename: 'hero.png',
        type: 'image',
        mimeType: 'image/png',
        size: 5000,
        folder: 'characters',
      };

      setManifestEntry(manifest, entry);
      expect(manifest.assets['a1']).toBe(entry);
    });

    it('overwrites an existing entry with same ID', () => {
      const manifest = createEmptyManifest();
      setManifestEntry(manifest, {
        id: 'a1',
        filename: 'old.png',
        type: 'image',
        mimeType: 'image/png',
        size: 1000,
        folder: 'characters',
      });
      setManifestEntry(manifest, {
        id: 'a1',
        filename: 'new.png',
        type: 'image',
        mimeType: 'image/png',
        size: 2000,
        folder: 'characters',
      });

      expect(manifest.assets['a1'].filename).toBe('new.png');
      expect(manifest.assets['a1'].size).toBe(2000);
    });
  });

  describe('removeManifestEntry', () => {
    it('removes an existing entry and returns true', () => {
      const manifest = createEmptyManifest();
      setManifestEntry(manifest, {
        id: 'a1',
        filename: 'hero.png',
        type: 'image',
        mimeType: 'image/png',
        size: 5000,
        folder: 'characters',
      });

      const result = removeManifestEntry(manifest, 'a1');
      expect(result).toBe(true);
      expect(manifest.assets['a1']).toBeUndefined();
    });

    it('returns false when entry does not exist', () => {
      const manifest = createEmptyManifest();
      expect(removeManifestEntry(manifest, 'nonexistent')).toBe(false);
    });
  });

  describe('getManifestEntry', () => {
    it('returns the entry for a known ID', () => {
      const manifest = createEmptyManifest();
      const entry: AssetManifestEntry = {
        id: 'a1',
        filename: 'sword.png',
        type: 'image',
        mimeType: 'image/png',
        size: 3000,
        folder: 'props',
      };
      setManifestEntry(manifest, entry);

      expect(getManifestEntry(manifest, 'a1')).toBe(entry);
    });

    it('returns undefined for unknown ID', () => {
      const manifest = createEmptyManifest();
      expect(getManifestEntry(manifest, 'missing')).toBeUndefined();
    });
  });

  describe('getAssetRelativePath', () => {
    it('returns the correct relative path', () => {
      const entry: AssetManifestEntry = {
        id: 'a1',
        filename: 'forest.jpg',
        type: 'image',
        mimeType: 'image/jpeg',
        size: 10000,
        folder: 'backgrounds',
      };

      expect(getAssetRelativePath(entry)).toBe('assets/backgrounds/forest.jpg');
    });
  });

  describe('getAssetFolder', () => {
    it('maps image types based on context', () => {
      expect(getAssetFolder('image', 'background')).toBe('backgrounds');
      expect(getAssetFolder('image', 'node')).toBe('backgrounds');
      expect(getAssetFolder('image', 'character')).toBe('characters');
      expect(getAssetFolder('image', 'prop')).toBe('props');
      expect(getAssetFolder('image')).toBe('backgrounds'); // default for images
    });

    it('maps non-image types', () => {
      expect(getAssetFolder('audio')).toBe('sounds');
      expect(getAssetFolder('video')).toBe('videos');
      expect(getAssetFolder('font')).toBe('fonts');
      expect(getAssetFolder('unknown')).toBe('other');
    });
  });

  describe('generateUniqueFilename', () => {
    it('returns the desired name when no collision', () => {
      const existing = new Set<string>();
      expect(generateUniqueFilename('forest.jpg', existing)).toBe('forest.jpg');
    });

    it('appends _2 on first collision', () => {
      const existing = new Set(['forest.jpg']);
      expect(generateUniqueFilename('forest.jpg', existing)).toBe('forest_2.jpg');
    });

    it('increments counter until unique', () => {
      const existing = new Set(['forest.jpg', 'forest_2.jpg', 'forest_3.jpg']);
      expect(generateUniqueFilename('forest.jpg', existing)).toBe('forest_4.jpg');
    });

    it('handles files without extensions', () => {
      const existing = new Set(['README']);
      expect(generateUniqueFilename('README', existing)).toBe('README_2');
    });
  });
});
