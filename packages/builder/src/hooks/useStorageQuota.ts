/**
 * useStorageQuota Hook
 *
 * Monitors browser storage quota and usage.
 * Provides utilities for checking available space before storing assets.
 */

import { useState, useEffect, useCallback } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface StorageQuotaInfo {
  /** Total quota in bytes */
  quota: number;

  /** Used space in bytes */
  usage: number;

  /** Available space in bytes */
  available: number;

  /** Percentage used (0-100) */
  percentUsed: number;

  /** Whether quota is supported */
  supported: boolean;

  /** Warning level based on usage */
  warningLevel: 'safe' | 'warning' | 'critical' | 'full';
}

export interface StorageQuotaHook {
  /** Current quota information */
  quota: StorageQuotaInfo | null;

  /** Whether quota is being loaded */
  loading: boolean;

  /** Error if quota check failed */
  error: Error | null;

  /** Refresh quota information */
  refresh: () => Promise<void>;

  /** Check if size can be stored */
  canStore: (sizeInBytes: number) => boolean;

  /** Get warning message for current quota state */
  getWarningMessage: () => string | null;

  /** Format bytes to human-readable size */
  formatBytes: (bytes: number) => string;
}

// ============================================================================
// Storage Quota Hook
// ============================================================================

/**
 * Hook to monitor browser storage quota
 *
 * @param refreshInterval - How often to check quota (ms), 0 = manual only
 */
export function useStorageQuota(refreshInterval = 0): StorageQuotaHook {
  const [quota, setQuota] = useState<StorageQuotaInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  /**
   * Fetch current quota information
   */
  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Check if Storage API is supported
      if (!navigator.storage || !navigator.storage.estimate) {
        setQuota({
          quota: 0,
          usage: 0,
          available: 0,
          percentUsed: 0,
          supported: false,
          warningLevel: 'safe',
        });
        setLoading(false);
        return;
      }

      // Get quota estimate
      const estimate = await navigator.storage.estimate();
      const quotaValue = estimate.quota || 0;
      const usageValue = estimate.usage || 0;
      const available = quotaValue - usageValue;
      const percentUsed = quotaValue > 0 ? (usageValue / quotaValue) * 100 : 0;

      // Determine warning level
      let warningLevel: StorageQuotaInfo['warningLevel'] = 'safe';
      if (percentUsed >= 95) {
        warningLevel = 'full';
      } else if (percentUsed >= 90) {
        warningLevel = 'critical';
      } else if (percentUsed >= 80) {
        warningLevel = 'warning';
      }

      setQuota({
        quota: quotaValue,
        usage: usageValue,
        available,
        percentUsed,
        supported: true,
        warningLevel,
      });

      setLoading(false);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to get storage quota');
      setError(error);
      setLoading(false);
      console.error('[useStorageQuota] Error fetching quota:', error);
    }
  }, []);

  /**
   * Check if a given size can be stored
   */
  const canStore = useCallback(
    (sizeInBytes: number): boolean => {
      if (!quota || !quota.supported) {
        // If quota not supported, assume we can store (risky but necessary)
        return true;
      }

      // Leave 10MB buffer for safety
      const SAFETY_BUFFER = 10 * 1024 * 1024;
      return sizeInBytes <= quota.available - SAFETY_BUFFER;
    },
    [quota]
  );

  /**
   * Get warning message based on current quota state
   */
  const getWarningMessage = useCallback((): string | null => {
    if (!quota || !quota.supported) {
      return null;
    }

    switch (quota.warningLevel) {
      case 'full':
        return `Storage is full (${quota.percentUsed.toFixed(1)}% used). Cannot upload more assets. Please delete unused assets or export your project.`;

      case 'critical':
        return `Storage is critically low (${quota.percentUsed.toFixed(1)}% used). You have ${formatBytes(quota.available)} remaining. Consider cleaning up assets.`;

      case 'warning':
        return `Storage is getting low (${quota.percentUsed.toFixed(1)}% used). You have ${formatBytes(quota.available)} remaining.`;

      default:
        return null;
    }
  }, [quota]);

  /**
   * Format bytes to human-readable string
   */
  const formatBytes = useCallback((bytes: number): string => {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  }, []);

  // Initial load
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Auto-refresh if interval specified
  useEffect(() => {
    if (refreshInterval <= 0) {
      return;
    }

    const intervalId = setInterval(refresh, refreshInterval);
    return () => clearInterval(intervalId);
  }, [refreshInterval, refresh]);

  return {
    quota,
    loading,
    error,
    refresh,
    canStore,
    getWarningMessage,
    formatBytes,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format bytes to human-readable string (standalone function)
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Get size tier for asset based on size
 */
export function getSizeTier(
  sizeInBytes: number
): 'tiny' | 'small' | 'medium' | 'large' | 'huge' {
  const KB = 1024;
  const MB = KB * 1024;

  if (sizeInBytes < 100 * KB) return 'tiny';        // <100KB
  if (sizeInBytes < 5 * MB) return 'small';         // 100KB-5MB
  if (sizeInBytes < 20 * MB) return 'medium';       // 5-20MB
  if (sizeInBytes < 50 * MB) return 'large';        // 20-50MB
  return 'huge';                                     // >50MB
}

/**
 * Get recommended action for a given size
 */
export function getSizeRecommendation(
  sizeInBytes: number
): {
  canUpload: boolean;
  level: 'ok' | 'warn' | 'block';
  message: string;
} {
  const tier = getSizeTier(sizeInBytes);
  const size = formatBytes(sizeInBytes);

  switch (tier) {
    case 'tiny':
    case 'small':
      return {
        canUpload: true,
        level: 'ok',
        message: `File size: ${size}`,
      };

    case 'medium':
      return {
        canUpload: true,
        level: 'warn',
        message: `Large file (${size}). This will use significant storage space.`,
      };

    case 'large':
      return {
        canUpload: true,
        level: 'warn',
        message: `Very large file (${size}). Consider compressing or using external hosting.`,
      };

    case 'huge':
      return {
        canUpload: false,
        level: 'block',
        message: `File too large (${size}). Maximum recommended size is 50MB. Please compress or use external hosting.`,
      };
  }
}

/**
 * Check if storage quota is critically low
 */
export function isStorageCritical(percentUsed: number): boolean {
  return percentUsed >= 90;
}

/**
 * Check if storage quota needs warning
 */
export function needsStorageWarning(percentUsed: number): boolean {
  return percentUsed >= 80;
}
