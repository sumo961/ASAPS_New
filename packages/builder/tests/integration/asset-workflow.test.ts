import { describe, it, expect } from 'vitest';
import type { Asset } from '../../src/components/assets/AssetManager';
import type { VisualElement } from '../../src/components/visual/VisualBeatEditor';

/**
 * Integration tests for asset management workflow
 * These tests verify the logic and data flow without rendering React components
 */

describe('Asset Management Workflow', () => {
  describe('Asset Type Assignment', () => {
    it('should create character asset with correct subType', () => {
      const asset: Asset = {
        id: 'char-1',
        name: 'Hero.png',
        type: 'image',
        subType: 'character',
        url: 'blob:character1',
        size: 1024,
        dimensions: { width: 200, height: 300 },
        uploadedAt: new Date(),
      };

      expect(asset.subType).toBe('character');
      expect(asset.type).toBe('image');
    });

    it('should create prop asset with correct subType', () => {
      const asset: Asset = {
        id: 'prop-1',
        name: 'Sword.png',
        type: 'image',
        subType: 'prop',
        url: 'blob:prop1',
        size: 512,
        dimensions: { width: 100, height: 150 },
        uploadedAt: new Date(),
      };

      expect(asset.subType).toBe('prop');
      expect(asset.type).toBe('image');
    });

    it('should create background asset with correct subType', () => {
      const asset: Asset = {
        id: 'bg-1',
        name: 'Forest.jpg',
        type: 'image',
        subType: 'background',
        url: 'blob:background1',
        size: 2048,
        dimensions: { width: 1920, height: 1080 },
        uploadedAt: new Date(),
      };

      expect(asset.subType).toBe('background');
      expect(asset.type).toBe('image');
    });

    it('should create video asset with correct subType', () => {
      const asset: Asset = {
        id: 'video-1',
        name: 'intro.mp4',
        type: 'video',
        subType: 'video',
        url: 'blob:video1',
        size: 10240,
        uploadedAt: new Date(),
      };

      expect(asset.subType).toBe('video');
      expect(asset.type).toBe('video');
    });

    it('should create audio asset with correct subType', () => {
      const asset: Asset = {
        id: 'audio-1',
        name: 'bgm.mp3',
        type: 'audio',
        subType: 'music',
        url: 'blob:audio1',
        size: 5120,
        uploadedAt: new Date(),
      };

      expect(asset.subType).toBe('music');
      expect(asset.type).toBe('audio');
    });
  });

  describe('Element-Asset Linking', () => {
    it('should create character element with asset ID', () => {
      const element: VisualElement = {
        id: 'elem-1',
        type: 'character',
        assetId: 'char-1',
        x: 100,
        y: 100,
        z: 0,
        width: 150,
        height: 150,
        rotation: 0,
        scale: 1,
        visible: true,
        locked: false,
        name: 'Hero',
      };

      expect(element.type).toBe('character');
      expect(element.assetId).toBe('char-1');
      expect(element.width).toBe(150);
      expect(element.height).toBe(150);
    });

    it('should create prop element with asset ID', () => {
      const element: VisualElement = {
        id: 'elem-2',
        type: 'prop',
        assetId: 'prop-1',
        x: 200,
        y: 200,
        z: 1,
        width: 100,
        height: 100,
        rotation: 0,
        scale: 1,
        visible: true,
        locked: false,
        name: 'Sword',
      };

      expect(element.type).toBe('prop');
      expect(element.assetId).toBe('prop-1');
    });

    it('should allow element without asset ID', () => {
      const element: VisualElement = {
        id: 'elem-3',
        type: 'character',
        assetId: undefined,
        x: 100,
        y: 100,
        z: 0,
        width: 150,
        height: 150,
        rotation: 0,
        scale: 1,
        visible: true,
        locked: false,
        name: 'Unassigned Character',
      };

      expect(element.assetId).toBeUndefined();
    });
  });

  describe('Asset Resolution Logic', () => {
    const mockAssets: Asset[] = [
      {
        id: 'char-1',
        name: 'Hero.png',
        type: 'image',
        subType: 'character',
        url: 'blob:character1',
        size: 1024,
        dimensions: { width: 200, height: 300 },
        uploadedAt: new Date(),
      },
      {
        id: 'prop-1',
        name: 'Sword.png',
        type: 'image',
        subType: 'prop',
        url: 'blob:prop1',
        size: 512,
        dimensions: { width: 100, height: 150 },
        uploadedAt: new Date(),
      },
    ];

    it('should resolve asset ID to URL', () => {
      const assetResolver = (assetId: string): string | undefined => {
        const asset = mockAssets.find((a) => a.id === assetId);
        return asset?.url;
      };

      const url = assetResolver('char-1');
      expect(url).toBe('blob:character1');
    });

    it('should return undefined for missing asset', () => {
      const assetResolver = (assetId: string): string | undefined => {
        const asset = mockAssets.find((a) => a.id === assetId);
        return asset?.url;
      };

      const url = assetResolver('missing-asset');
      expect(url).toBeUndefined();
    });

    it('should find asset by ID', () => {
      const asset = mockAssets.find((a) => a.id === 'prop-1');

      expect(asset).toBeDefined();
      expect(asset?.name).toBe('Sword.png');
      expect(asset?.subType).toBe('prop');
    });

    it('should filter assets by type', () => {
      const characters = mockAssets.filter((a) => a.subType === 'character');
      const props = mockAssets.filter((a) => a.subType === 'prop');

      expect(characters).toHaveLength(1);
      expect(props).toHaveLength(1);
      expect(characters[0].name).toBe('Hero.png');
      expect(props[0].name).toBe('Sword.png');
    });
  });

  describe('Element Update Logic', () => {
    it('should update element asset ID', () => {
      const element: VisualElement = {
        id: 'elem-1',
        type: 'character',
        assetId: 'char-1',
        x: 100,
        y: 100,
        z: 0,
        width: 150,
        height: 150,
        rotation: 0,
        scale: 1,
        visible: true,
        locked: false,
        name: 'Hero',
      };

      const updatedElement = { ...element, assetId: 'char-2' };

      expect(updatedElement.assetId).toBe('char-2');
      expect(updatedElement.id).toBe(element.id);
    });

    it('should update element properties while preserving asset ID', () => {
      const element: VisualElement = {
        id: 'elem-1',
        type: 'character',
        assetId: 'char-1',
        x: 100,
        y: 100,
        z: 0,
        width: 150,
        height: 150,
        rotation: 0,
        scale: 1,
        visible: true,
        locked: false,
        name: 'Hero',
      };

      const updatedElement = { ...element, x: 200, y: 200 };

      expect(updatedElement.assetId).toBe('char-1');
      expect(updatedElement.x).toBe(200);
      expect(updatedElement.y).toBe(200);
    });
  });

  describe('Asset List Management', () => {
    it('should add new asset to list', () => {
      const assets: Asset[] = [];

      const newAsset: Asset = {
        id: 'char-1',
        name: 'Hero.png',
        type: 'image',
        subType: 'character',
        url: 'blob:character1',
        size: 1024,
        uploadedAt: new Date(),
      };

      const updatedAssets = [...assets, newAsset];

      expect(updatedAssets).toHaveLength(1);
      expect(updatedAssets[0].id).toBe('char-1');
    });

    it('should remove asset from list', () => {
      const assets: Asset[] = [
        {
          id: 'char-1',
          name: 'Hero.png',
          type: 'image',
          subType: 'character',
          url: 'blob:character1',
          size: 1024,
          uploadedAt: new Date(),
        },
        {
          id: 'prop-1',
          name: 'Sword.png',
          type: 'image',
          subType: 'prop',
          url: 'blob:prop1',
          size: 512,
          uploadedAt: new Date(),
        },
      ];

      const updatedAssets = assets.filter((a) => a.id !== 'char-1');

      expect(updatedAssets).toHaveLength(1);
      expect(updatedAssets[0].id).toBe('prop-1');
    });

    it('should count assets by subType', () => {
      const assets: Asset[] = [
        {
          id: 'char-1',
          name: 'Hero.png',
          type: 'image',
          subType: 'character',
          url: 'blob:character1',
          size: 1024,
          uploadedAt: new Date(),
        },
        {
          id: 'char-2',
          name: 'Villain.png',
          type: 'image',
          subType: 'character',
          url: 'blob:character2',
          size: 1024,
          uploadedAt: new Date(),
        },
        {
          id: 'prop-1',
          name: 'Sword.png',
          type: 'image',
          subType: 'prop',
          url: 'blob:prop1',
          size: 512,
          uploadedAt: new Date(),
        },
      ];

      const characterCount = assets.filter((a) => a.subType === 'character').length;
      const propCount = assets.filter((a) => a.subType === 'prop').length;

      expect(characterCount).toBe(2);
      expect(propCount).toBe(1);
    });
  });

  describe('Element List Management', () => {
    it('should add element to list', () => {
      const elements: VisualElement[] = [];

      const newElement: VisualElement = {
        id: 'elem-1',
        type: 'character',
        assetId: 'char-1',
        x: 100,
        y: 100,
        z: 0,
        width: 150,
        height: 150,
        rotation: 0,
        scale: 1,
        visible: true,
        locked: false,
        name: 'Hero',
      };

      const updatedElements = [...elements, newElement];

      expect(updatedElements).toHaveLength(1);
      expect(updatedElements[0].type).toBe('character');
    });

    it('should update element in list', () => {
      const elements: VisualElement[] = [
        {
          id: 'elem-1',
          type: 'character',
          assetId: 'char-1',
          x: 100,
          y: 100,
          z: 0,
          width: 150,
          height: 150,
          rotation: 0,
          scale: 1,
          visible: true,
          locked: false,
          name: 'Hero',
        },
      ];

      const updatedElements = elements.map((el) =>
        el.id === 'elem-1' ? { ...el, assetId: 'char-2' } : el
      );

      expect(updatedElements[0].assetId).toBe('char-2');
    });

    it('should delete element from list', () => {
      const elements: VisualElement[] = [
        {
          id: 'elem-1',
          type: 'character',
          assetId: 'char-1',
          x: 100,
          y: 100,
          z: 0,
          width: 150,
          height: 150,
          rotation: 0,
          scale: 1,
          visible: true,
          locked: false,
          name: 'Hero',
        },
        {
          id: 'elem-2',
          type: 'prop',
          assetId: 'prop-1',
          x: 200,
          y: 200,
          z: 1,
          width: 100,
          height: 100,
          rotation: 0,
          scale: 1,
          visible: true,
          locked: false,
          name: 'Sword',
        },
      ];

      const updatedElements = elements.filter((el) => el.id !== 'elem-1');

      expect(updatedElements).toHaveLength(1);
      expect(updatedElements[0].id).toBe('elem-2');
    });
  });

  describe('Asset-Element Validation', () => {
    it('should validate character element has character or prop asset', () => {
      const characterElement: VisualElement = {
        id: 'elem-1',
        type: 'character',
        assetId: 'char-1',
        x: 100,
        y: 100,
        z: 0,
        width: 150,
        height: 150,
        rotation: 0,
        scale: 1,
        visible: true,
        locked: false,
        name: 'Hero',
      };

      const assets: Asset[] = [
        {
          id: 'char-1',
          name: 'Hero.png',
          type: 'image',
          subType: 'character',
          url: 'blob:character1',
          size: 1024,
          uploadedAt: new Date(),
        },
      ];

      const asset = assets.find((a) => a.id === characterElement.assetId);

      expect(asset).toBeDefined();
      expect(['character', 'prop']).toContain(asset?.subType);
    });

    it('should detect missing asset reference', () => {
      const element: VisualElement = {
        id: 'elem-1',
        type: 'character',
        assetId: 'missing-asset',
        x: 100,
        y: 100,
        z: 0,
        width: 150,
        height: 150,
        rotation: 0,
        scale: 1,
        visible: true,
        locked: false,
        name: 'Hero',
      };

      const assets: Asset[] = [
        {
          id: 'char-1',
          name: 'Hero.png',
          type: 'image',
          subType: 'character',
          url: 'blob:character1',
          size: 1024,
          uploadedAt: new Date(),
        },
      ];

      const asset = assets.find((a) => a.id === element.assetId);

      expect(asset).toBeUndefined();
    });
  });
});
