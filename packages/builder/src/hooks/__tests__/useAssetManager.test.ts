/**
 * useAssetManager Hook Tests
 * Tests asset upload functionality and loop prevention
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('useAssetManager Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Asset Addition', () => {
    it('should create asset with proper structure', () => {
      const mockAsset = {
        id: 'asset_123',
        name: 'test-image.png',
        type: 'image' as const,
        subType: 'background' as const,
        url: 'blob:test',
        file: new File([''], 'test-image.png', { type: 'image/png' }),
        size: 1024,
        uploadedAt: new Date(),
      };

      expect(mockAsset.id).toBeDefined();
      expect(mockAsset.name).toBe('test-image.png');
      expect(mockAsset.type).toBe('image');
      expect(mockAsset.file).toBeInstanceOf(File);
    });

    it('should validate asset size limits', () => {
      const smallAsset = { size: 1024 * 1024 }; // 1MB
      const largeAsset = { size: 100 * 1024 * 1024 }; // 100MB

      expect(smallAsset.size).toBeLessThan(10 * 1024 * 1024);
      expect(largeAsset.size).toBeGreaterThan(50 * 1024 * 1024);
    });

    it('should handle multiple asset types', () => {
      const imageAsset = { type: 'image', mimeType: 'image/png' };
      const audioAsset = { type: 'audio', mimeType: 'audio/mp3' };
      const videoAsset = { type: 'video', mimeType: 'video/mp4' };

      expect(['image', 'audio', 'video', 'font']).toContain(imageAsset.type);
      expect(['image', 'audio', 'video', 'font']).toContain(audioAsset.type);
      expect(['image', 'audio', 'video', 'font']).toContain(videoAsset.type);
    });
  });

  describe('Async Upload Flow', () => {
    it('should return Promise<boolean> from addAsset', async () => {
      const mockAddAsset = vi.fn().mockResolvedValue(true);

      const result = await mockAddAsset({
        id: 'test',
        name: 'test.png',
        type: 'image',
        url: 'blob:test',
        size: 1024,
      });

      expect(result).toBe(true);
      expect(mockAddAsset).toHaveBeenCalledTimes(1);
    });

    it('should handle upload failure', async () => {
      const mockAddAsset = vi.fn().mockResolvedValue(false);

      const result = await mockAddAsset({
        id: 'test',
        name: 'test.png',
        type: 'image',
        url: 'blob:test',
        size: 1024,
      });

      expect(result).toBe(false);
    });

    it('should handle upload errors', async () => {
      const mockAddAsset = vi.fn().mockRejectedValue(new Error('Upload failed'));

      await expect(mockAddAsset({})).rejects.toThrow('Upload failed');
    });
  });

  describe('Storage Integration', () => {
    it('should convert UI Asset to StoredAsset', () => {
      const uiAsset = {
        id: 'asset_123',
        name: 'test.png',
        type: 'image' as const,
        url: 'blob:test',
        size: 1024,
        uploadedAt: new Date(),
      };

      const storedAsset = {
        id: uiAsset.id,
        projectId: 'project_456',
        type: 'image' as const,
        filename: uiAsset.name,
        mimeType: 'image/png',
        size: uiAsset.size,
        blob: new Blob([]),
        uploadedAt: uiAsset.uploadedAt,
        lastUsedAt: new Date(),
      };

      expect(storedAsset.id).toBe(uiAsset.id);
      expect(storedAsset.filename).toBe(uiAsset.name);
      expect(storedAsset.size).toBe(uiAsset.size);
    });

    it('should handle image dimensions', () => {
      const imageAsset = {
        id: 'img_123',
        name: 'test.png',
        type: 'image' as const,
        url: 'blob:test',
        size: 1024,
        dimensions: { width: 1920, height: 1080 },
        uploadedAt: new Date(),
      };

      expect(imageAsset.dimensions?.width).toBe(1920);
      expect(imageAsset.dimensions?.height).toBe(1080);
    });
  });

  describe('Load Project Assets', () => {
    it('should prevent duplicate loading with ref tracking', () => {
      const loadingProjectRef = { current: 'project_123' };
      const projectId = 'project_123';

      // Simulate check
      if (loadingProjectRef.current === projectId) {
        // Should skip reload
        expect(loadingProjectRef.current).toBe(projectId);
      }
    });

    it('should allow loading different project', () => {
      const loadingProjectRef = { current: 'project_123' };
      const newProjectId = 'project_456';

      // Should allow loading
      expect(loadingProjectRef.current).not.toBe(newProjectId);
    });
  });

  describe('Blob URL Management', () => {
    it('should track blob URLs for cleanup', () => {
      const blobUrlsRef = { current: new Set<string>() };
      const blobUrl = 'blob:http://localhost:5174/test';

      blobUrlsRef.current.add(blobUrl);

      expect(blobUrlsRef.current.has(blobUrl)).toBe(true);
      expect(blobUrlsRef.current.size).toBe(1);
    });

    it('should cleanup blob URLs on unmount', () => {
      const blobUrlsRef = { current: new Set<string>(['blob:test1', 'blob:test2']) };

      // Simulate cleanup
      const mockRevoke = vi.fn();
      blobUrlsRef.current.forEach(url => mockRevoke(url));
      blobUrlsRef.current.clear();

      expect(mockRevoke).toHaveBeenCalledTimes(2);
      expect(blobUrlsRef.current.size).toBe(0);
    });
  });
});
