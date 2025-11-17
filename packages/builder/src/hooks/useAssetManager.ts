import { useState, useCallback, useEffect, useRef } from 'react';
import type { Asset } from '../components/assets/AssetManager';
import { getStorageManager } from '../storage';
import {
  assetToStored,
  storedToAsset,
  extractBlobFromAsset,
  revokeBlobUrls,
  revokeBlobUrl
} from '../storage/AssetStorageAdapter';
import { useStorageQuota, getSizeRecommendation } from './useStorageQuota';

export interface AssetManagerOptions {
  /** Current project ID for asset association */
  projectId?: string;
}

export function useAssetManager(options: AssetManagerOptions = {}) {
  const { projectId } = options;

  const [assets, setAssets] = useState<Asset[]>([]);
  const [showAssetManager, setShowAssetManager] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const storage = useRef(getStorageManager()).current;
  const { quota, canStore, refresh: refreshQuota } = useStorageQuota();

  // Track blob URLs for cleanup
  const blobUrlsRef = useRef<Set<string>>(new Set());

  /**
   * Load assets for current project from storage
   */
  const loadProjectAssets = useCallback(async (loadProjectId: string) => {
    if (!loadProjectId) return;

    try {
      setLoading(true);
      setError(null);

      console.log('[useAssetManager] Loading assets for project:', loadProjectId);

      const result = await storage.getProjectAssets(loadProjectId);

      if (result.success && result.data) {
        // Convert StoredAssets to UI Assets (generates blob URLs)
        const uiAssets = result.data.map(storedAsset => {
          const asset = storedToAsset(storedAsset);
          blobUrlsRef.current.add(asset.url);
          return asset;
        });

        setAssets(uiAssets);
        console.log('[useAssetManager] Loaded', uiAssets.length, 'assets');
      } else {
        console.error('[useAssetManager] Failed to load assets:', result.error);
        const errorMsg: string = typeof result.error === 'string' ? result.error : 'Failed to load assets';
        setError(new Error(errorMsg));
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to load assets');
      console.error('[useAssetManager] Error loading assets:', error);
      setError(error);
    } finally {
      setLoading(false);
    }
  }, [storage]);

  // Initialize reference at the top-level of component
  // Mark as not loading when clearing assets
  // Defined as empty reference first, actual function after clearAssets is defined
  const clearAssetsAndReset = useRef(async () => {
    // This will be replaced with actual implementation after clearAssets is defined
  });

  // When loading is complete, clear the loading tracker
  // This ensures that if projectId changes back to a previously loaded project,
  // it will still reload from storage (resolving consistency issues)
  useEffect(() => {
    if (!loading && loadingProjectRef.current) {
      // Reset after loading is complete, but set a flag to avoid immediate re-triggers
      const currentProject = loadingProjectRef.current;
      loadingProjectRef.current = null;

      // Also provide a way to refresh this specific project in case of storage changes
      console.log(`[useAssetManager] Asset loading completed for project: ${currentProject}`);
    }
  }, [loading]);

  /**
   * Add asset with persistence
   */
  const addAsset = useCallback(async (asset: Asset): Promise<boolean> => {
    if (!projectId) {
      console.warn('[useAssetManager] Cannot add asset: no project ID');
      return false;
    }

    try {
      // Check size recommendation
      const recommendation = getSizeRecommendation(asset.size);
      if (!recommendation.canUpload) {
        console.warn('[useAssetManager] Asset too large:', recommendation.message);
        setError(new Error(recommendation.message));
        return false;
      }

      // Check quota
      if (!canStore(asset.size)) {
        const message = 'Insufficient storage space. Please delete unused assets.';
        console.warn('[useAssetManager] ' + message);
        setError(new Error(message));
        return false;
      }

      // Extract blob from asset
      const blob = await extractBlobFromAsset(asset);

      // Convert to stored asset
      const storedAsset = await assetToStored(asset, projectId, blob);

      // Save to storage
      const result = await storage.createAsset(storedAsset);

      if (result.success) {
        // Add to UI state
        setAssets(prev => [...prev, asset]);
        blobUrlsRef.current.add(asset.url);

        // Refresh quota
        await refreshQuota();

        console.log('[useAssetManager] Asset added:', asset.name);
        return true;
      } else {
        console.error('[useAssetManager] Failed to store asset:', result.error);
        const errorMsg: string = typeof result.error === 'string' ? result.error : 'Failed to store asset';
        setError(new Error(errorMsg));
        return false;
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to add asset');
      console.error('[useAssetManager] Error adding asset:', error);
      setError(error);
      return false;
    }
  }, [projectId, storage, canStore, refreshQuota]);

  /**
   * Remove asset with persistence
   */
  const removeAsset = useCallback(async (assetId: string): Promise<boolean> => {
    try {
      // Find asset to revoke URL
      const asset = assets.find(a => a.id === assetId);

      // Delete from storage
      const result = await storage.deleteAsset(assetId);

      if (result.success) {
        // Remove from UI state
        setAssets(prev => prev.filter(a => a.id !== assetId));

        // Revoke blob URL
        if (asset) {
          revokeBlobUrl(asset.url);
          blobUrlsRef.current.delete(asset.url);
        }

        // Refresh quota
        await refreshQuota();

        console.log('[useAssetManager] Asset removed:', assetId);
        return true;
      } else {
        console.error('[useAssetManager] Failed to delete asset:', result.error);
        const errorMsg: string = typeof result.error === 'string' ? result.error : 'Failed to delete asset';
        setError(new Error(errorMsg));
        return false;
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to remove asset');
      console.error('[useAssetManager] Error removing asset:', error);
      setError(error);
      return false;
    }
  }, [assets, storage, refreshQuota]);

  /**
   * Update asset with persistence
   */
  const updateAsset = useCallback(async (assetId: string, updates: Partial<Asset>): Promise<boolean> => {
    if (!projectId) {
      console.warn('[useAssetManager] Cannot update asset: no project ID');
      return false;
    }

    try {
      // Get current asset
      const result = await storage.getAsset(assetId);

      if (!result.success || !result.data) {
        console.error('[useAssetManager] Asset not found:', assetId);
        return false;
      }

      // Update stored asset
      const updatedStored = {
        ...result.data,
        ...updates,
        lastUsedAt: new Date(),
      };

      const updateResult = await storage.updateAsset(updatedStored);

      if (updateResult.success) {
        // Update UI state
        setAssets(prev => prev.map(a =>
          a.id === assetId ? { ...a, ...updates } : a
        ));

        console.log('[useAssetManager] Asset updated:', assetId);
        return true;
      } else {
        console.error('[useAssetManager] Failed to update asset:', updateResult.error);
        const errorMsg: string = typeof updateResult.error === 'string' ? updateResult.error : 'Failed to update asset';
        setError(new Error(errorMsg));
        return false;
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to update asset');
      console.error('[useAssetManager] Error updating asset:', error);
      setError(error);
      return false;
    }
  }, [projectId, storage]);

  /**
   * Clear all assets (for project switch/close)
   */
  const clearAssets = useCallback(() => {
    // Revoke all blob URLs
    revokeBlobUrls(assets);
    blobUrlsRef.current.clear();

    // Clear state
    setAssets([]);
    setError(null);

    console.log('[useAssetManager] Assets cleared');
  }, [assets]);

  // Now set the actual clearAssetsAndReset function after clearAssets is defined
  clearAssetsAndReset.current = async () => {
    await clearAssets();
    loadingProjectRef.current = null;
  };

  const getAssetsByType = useCallback((type: Asset['type']) => {
    return assets.filter(a => a.type === type);
  }, [assets]);

  const getAssetsBySubType = useCallback((subType: Asset['subType']) => {
    return assets.filter(a => a.subType === subType);
  }, [assets]);

  const getAssetById = useCallback((assetId: string) => {
    return assets.find(a => a.id === assetId);
  }, [assets]);

  const toggleAssetManager = useCallback(() => {
    setShowAssetManager(prev => !prev);
  }, []);

  const openAssetManager = useCallback(() => {
    setShowAssetManager(true);
  }, []);

  const closeAssetManager = useCallback(() => {
    setShowAssetManager(false);
  }, []);

  // Export/Import assets (legacy - for StoryExporter compatibility)
  const exportAssets = useCallback(() => {
    return assets.map(asset => ({
      ...asset,
      file: undefined // Don't export File objects
    }));
  }, [assets]);

  const importAssets = useCallback((importedAssets: Asset[]) => {
    setAssets(importedAssets);
  }, []);

  // LIFO loading prevention: track current loading project to prevent race conditions
  const loadingProjectRef = useRef<string | null>(null);

  // Load assets when project changes
  useEffect(() => {
    // Prevent loading if we already loaded assets for this project
    if (loadingProjectRef.current === projectId) {
      console.log('[useAssetManager] Already loaded for project', projectId, 'skipping reload');
      return;
    }

    if (projectId) {
      console.log('[useAssetManager] Project changed to:', projectId);
      loadingProjectRef.current = projectId;
      loadProjectAssets(projectId);
    } else {
      console.log('[useAssetManager] No project provided, clearing assets');
      loadingProjectRef.current = null;
      clearAssetsAndReset.current();
    }
  }, [projectId, loadProjectAssets]);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      console.log('[useAssetManager] Unmounting, revoking', blobUrlsRef.current.size, 'blob URLs');
      blobUrlsRef.current.forEach(url => revokeBlobUrl(url));
      blobUrlsRef.current.clear();
    };
  }, []);

  return {
    // State
    assets,
    showAssetManager,
    loading,
    error,
    quota,

    // Asset operations (now async)
    addAsset,
    removeAsset,
    updateAsset,
    clearAssets,

    // Query helpers
    getAssetsByType,
    getAssetsBySubType,
    getAssetById,

    // UI controls
    toggleAssetManager,
    openAssetManager,
    closeAssetManager,

    // Legacy exports
    exportAssets,
    importAssets,

    // Project management
    loadProjectAssets,
  };
}
