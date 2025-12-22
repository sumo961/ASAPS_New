import { describe, it, expect, vi, beforeEach } from 'vitest';
import { linkAssetsToBeats, createFileResolver, AsmlAssetImportResult } from '../asmlAssetImporter';

describe('asmlAssetImporter', () => {
  describe('linkAssetsToBeats', () => {
    let mockImportResult: AsmlAssetImportResult;

    beforeEach(() => {
      // Suppress console logs during tests
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Create mock import result with prefixed keys (as sounds are stored in import)
      mockImportResult = {
        assetMap: new Map([
          ['sound:click', 'sound-asset-id-123'],
          ['sound:forest', 'forest-sound-asset-id'],
          ['bg:forest', 'forest-bg-asset-id'],
          ['bg:castle', 'castle-asset-id'],
          ['sword', 'sword-prop-asset-id'],
        ]),
        urlMap: new Map([
          ['sound:click', 'blob:click-url'],
          ['sound:forest', 'blob:forest-sound-url'],
          ['bg:forest', 'blob:forest-bg-url'],
          ['bg:castle', 'blob:castle-url'],
          ['sword', 'blob:sword-url'],
        ]),
        characterMap: new Map(),
        filePathMap: new Map(),
        propDimensionsMap: new Map(),
        errors: [],
        stats: {
          backgroundsImported: 0,
          propsImported: 0,
          soundsImported: 0,
          charactersCreated: 0,
          characterImagesImported: 0,
          totalFilesImported: 0,
          totalFilesMissing: 0
        }
      };
    });

    describe('Issue #4: Button sound mapping', () => {
      it('should link location sound with sound: prefix lookup', () => {
        // This test verifies the fix for Issue #4: Button sounds not mapped on import
        // Sounds are stored with "sound:" prefix, so lookup must try prefixed version
        const mockLocation = {
          kind: 'button',
          name: 'Button1',
          sound: 'click' // Sound name from ASML (no prefix)
        };

        const mockBeat = {
          id: 'beat1',
          type: 'dialogTree',
          locations: new Map([['button1', mockLocation]]),
          getParameters: () => ({})
        };

        linkAssetsToBeats([mockBeat], mockImportResult);

        // Sound should be linked via prefixed lookup
        expect(mockLocation.soundAssetId).toBe('sound-asset-id-123');
        expect(mockLocation.sound).toBe('blob:click-url');
      });

      it('should handle sound with same name as background using prefix', () => {
        // "forest" exists as both sound and background - should use correct prefix
        const mockLocation = {
          kind: 'button',
          name: 'ForestButton',
          sound: 'forest'
        };

        const mockBeat = {
          id: 'beat2',
          type: 'dialogTree',
          locations: new Map([['btn', mockLocation]]),
          getParameters: () => ({})
        };

        linkAssetsToBeats([mockBeat], mockImportResult);

        // Should get sound asset, not background
        expect(mockLocation.soundAssetId).toBe('forest-sound-asset-id');
        expect(mockLocation.sound).toBe('blob:forest-sound-url');
      });

      it('should fallback to unprefixed lookup for sounds', () => {
        // Add unprefixed sound entry
        mockImportResult.assetMap.set('beep', 'beep-asset-id');
        mockImportResult.urlMap.set('beep', 'blob:beep-url');

        const mockLocation = {
          kind: 'button',
          name: 'BeepButton',
          sound: 'beep'
        };

        const mockBeat = {
          id: 'beat3',
          type: 'dialogTree',
          locations: new Map([['btn', mockLocation]]),
          getParameters: () => ({})
        };

        linkAssetsToBeats([mockBeat], mockImportResult);

        // Should find via unprefixed fallback
        expect(mockLocation.soundAssetId).toBe('beep-asset-id');
        expect(mockLocation.sound).toBe('blob:beep-url');
      });

      it('should link sounds in array-style locations', () => {
        // Test the legacy array format
        const mockLocation = {
          kind: 'button',
          name: 'Button1',
          sound: 'click'
        };

        const mockBeat = {
          id: 'beat4',
          type: 'dialogTree',
          locations: [mockLocation], // Array instead of Map
          getParameters: () => ({})
        };

        linkAssetsToBeats([mockBeat], mockImportResult);

        expect(mockLocation.soundAssetId).toBe('sound-asset-id-123');
        expect(mockLocation.sound).toBe('blob:click-url');
      });

      it('should link sounds case-insensitively', () => {
        // Sound stored as "click" but buttonsound attribute in ASML has "CLICK"
        const mockLocation = {
          kind: 'button',
          name: 'Button1',
          sound: 'CLICK' // Uppercase - should still match lowercase "click"
        };

        const mockBeat = {
          id: 'beat5',
          type: 'dialogTree',
          locations: new Map([['btn', mockLocation]]),
          getParameters: () => ({})
        };

        linkAssetsToBeats([mockBeat], mockImportResult);

        // Should find via case-insensitive lookup
        expect(mockLocation.soundAssetId).toBe('sound-asset-id-123');
        expect(mockLocation.sound).toBe('blob:click-url');
      });
    });

    describe('Background linking', () => {
      it('should link background with bg: prefix', () => {
        const mockBeat = {
          id: 'beat1',
          type: 'introText',
          node: undefined,
          getParameters: () => ({ node: 'castle' }),
          updateParameters: vi.fn()
        };

        linkAssetsToBeats([mockBeat], mockImportResult);

        expect(mockBeat.updateParameters).toHaveBeenCalledWith({
          node: 'castle-asset-id',
          backgroundAssetId: 'castle-asset-id',
          backgroundUrl: 'blob:castle-url'
        });
      });

      it('should handle background with same name as sound using prefix', () => {
        const mockBeat = {
          id: 'beat2',
          type: 'introText',
          getParameters: () => ({ node: 'forest' }),
          updateParameters: vi.fn()
        };

        linkAssetsToBeats([mockBeat], mockImportResult);

        // Should get background asset, not sound
        expect(mockBeat.updateParameters).toHaveBeenCalledWith({
          node: 'forest-bg-asset-id',
          backgroundAssetId: 'forest-bg-asset-id',
          backgroundUrl: 'blob:forest-bg-url'
        });
      });
    });

    describe('Beat-level sound linking', () => {
      it('should link beat sound with prefix', () => {
        const mockBeat = {
          id: 'beat1',
          type: 'introText',
          sound: { file: 'click' },
          getParameters: () => ({})
        };

        linkAssetsToBeats([mockBeat], mockImportResult);

        expect(mockBeat.sound.assetId).toBe('sound-asset-id-123');
        expect(mockBeat.sound.file).toBe('blob:click-url');
      });
    });

    describe('Prop linking', () => {
      it('should link props by name', () => {
        const mockLocation = {
          kind: 'prop',
          name: 'sword'
        };

        const mockBeat = {
          id: 'beat1',
          type: 'introText',
          locations: new Map([['prop1', mockLocation]]),
          getParameters: () => ({})
        };

        linkAssetsToBeats([mockBeat], mockImportResult);

        expect(mockLocation.assetId).toBe('sword-prop-asset-id');
      });
    });
  });

  describe('createFileResolver', () => {
    it('should resolve exact file matches', async () => {
      const mockFile = new File(['content'], 'test.png', { type: 'image/png' });
      const fileMap = new Map([['test.png', mockFile]]);
      const resolver = createFileResolver(fileMap);

      const result = await resolver('test.png');
      expect(result).toBe(mockFile);
    });

    it('should resolve case-insensitive matches', async () => {
      const mockFile = new File(['content'], 'TEST.PNG', { type: 'image/png' });
      const fileMap = new Map([['test.png', mockFile]]);
      const resolver = createFileResolver(fileMap);

      const result = await resolver('test.png');
      expect(result).toBe(mockFile);
    });

    it('should resolve filename without path', async () => {
      const mockFile = new File(['content'], 'image.png', { type: 'image/png' });
      const fileMap = new Map([['image.png', mockFile]]);
      const resolver = createFileResolver(fileMap);

      const result = await resolver('assets/images/image.png');
      expect(result).toBe(mockFile);
    });

    it('should return null for missing files', async () => {
      const fileMap = new Map<string, File>();
      const resolver = createFileResolver(fileMap);

      const result = await resolver('nonexistent.png');
      expect(result).toBeNull();
    });
  });
});
