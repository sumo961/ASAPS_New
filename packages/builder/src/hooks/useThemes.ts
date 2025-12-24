/**
 * useThemes Hook
 *
 * React hook for managing themes with the ThemeService.
 * Provides theme listing, selection, and CRUD operations.
 */

import { useState, useEffect, useCallback } from 'react';
import type { ThemeDefinition, StoredTheme } from '@asaps/core';
import { BUILT_IN_THEMES } from '@asaps/core';
import { getThemeService } from '../services/ThemeService';
import { globalSettingsToTheme, themeToGlobalSettings } from '../themes/migration/GlobalSettingsAdapter';
import type { GlobalSettings } from '../storage/types';

// ============================================================================
// Types
// ============================================================================

export interface ThemeInfo {
  id: string;
  name: string;
  description?: string;
  source: 'built-in' | 'imported' | 'custom';
  tags?: string[];
  previewImage?: string;
}

export interface UseThemesResult {
  /** All available themes */
  themes: ThemeInfo[];

  /** Currently selected theme ID */
  selectedThemeId: string | null;

  /** Loading state */
  loading: boolean;

  /** Error state */
  error: string | null;

  /** Select a theme by ID */
  selectTheme: (themeId: string) => Promise<ThemeDefinition | null>;

  /** Get a theme definition (with inheritance resolved) */
  getTheme: (themeId: string) => Promise<ThemeDefinition | null>;

  /** Apply a theme to GlobalSettings */
  applyThemeToSettings: (themeId: string, currentSettings: GlobalSettings) => Promise<GlobalSettings | null>;

  /** Save current settings as a new theme */
  saveAsTheme: (settings: GlobalSettings, name: string) => Promise<string>;

  /** Refresh the themes list */
  refresh: () => Promise<void>;

  /** Check if a theme is built-in */
  isBuiltIn: (themeId: string) => boolean;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useThemes(initialThemeId?: string): UseThemesResult {
  const [themes, setThemes] = useState<ThemeInfo[]>([]);
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(initialThemeId || null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Initialize themes on mount
  useEffect(() => {
    const initThemes = async () => {
      try {
        setLoading(true);
        setError(null);

        const service = getThemeService();
        await service.initialize();

        // Register built-in themes if not already registered
        await service.registerBuiltInThemes(BUILT_IN_THEMES);

        // Load all themes
        const storedThemes = await service.listThemes();

        const themeInfos: ThemeInfo[] = storedThemes.map(stored => ({
          id: stored.id,
          name: stored.definition.meta.name,
          description: stored.definition.meta.description,
          source: stored.source,
          tags: stored.definition.meta.tags,
          previewImage: stored.previewImage,
        }));

        setThemes(themeInfos);
        setInitialized(true);
      } catch (err) {
        console.error('[useThemes] Failed to initialize themes:', err);
        setError(err instanceof Error ? err.message : 'Failed to load themes');
      } finally {
        setLoading(false);
      }
    };

    initThemes();
  }, []);

  // Refresh themes list
  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const service = getThemeService();
      const storedThemes = await service.listThemes();

      const themeInfos: ThemeInfo[] = storedThemes.map(stored => ({
        id: stored.id,
        name: stored.definition.meta.name,
        description: stored.definition.meta.description,
        source: stored.source,
        tags: stored.definition.meta.tags,
        previewImage: stored.previewImage,
      }));

      setThemes(themeInfos);
    } catch (err) {
      console.error('[useThemes] Failed to refresh themes:', err);
      setError(err instanceof Error ? err.message : 'Failed to refresh themes');
    } finally {
      setLoading(false);
    }
  }, []);

  // Select a theme
  const selectTheme = useCallback(async (themeId: string): Promise<ThemeDefinition | null> => {
    try {
      const service = getThemeService();
      const theme = await service.getResolvedTheme(themeId);

      if (theme) {
        setSelectedThemeId(themeId);
        await service.markThemeUsed(themeId);
      }

      return theme;
    } catch (err) {
      console.error('[useThemes] Failed to select theme:', err);
      setError(err instanceof Error ? err.message : 'Failed to select theme');
      return null;
    }
  }, []);

  // Get a theme definition
  const getTheme = useCallback(async (themeId: string): Promise<ThemeDefinition | null> => {
    try {
      const service = getThemeService();
      return await service.getResolvedTheme(themeId);
    } catch (err) {
      console.error('[useThemes] Failed to get theme:', err);
      return null;
    }
  }, []);

  // Apply a theme to GlobalSettings
  const applyThemeToSettings = useCallback(async (
    themeId: string,
    currentSettings: GlobalSettings
  ): Promise<GlobalSettings | null> => {
    try {
      const service = getThemeService();
      const theme = await service.getResolvedTheme(themeId);

      if (!theme) {
        console.warn('[useThemes] Theme not found:', themeId);
        return null;
      }

      // Convert theme to GlobalSettings, preserving project-specific values
      const newSettings = themeToGlobalSettings(theme, currentSettings);

      setSelectedThemeId(themeId);
      await service.markThemeUsed(themeId);

      return newSettings;
    } catch (err) {
      console.error('[useThemes] Failed to apply theme:', err);
      setError(err instanceof Error ? err.message : 'Failed to apply theme');
      return null;
    }
  }, []);

  // Save current settings as a new theme
  const saveAsTheme = useCallback(async (
    settings: GlobalSettings,
    name: string
  ): Promise<string> => {
    try {
      const service = getThemeService();

      // Convert settings to theme
      const themeDefinition = globalSettingsToTheme(settings, name);

      // Save as custom theme
      const themeId = await service.createTheme(themeDefinition, 'custom');

      // Refresh list
      await refresh();

      return themeId;
    } catch (err) {
      console.error('[useThemes] Failed to save theme:', err);
      throw err;
    }
  }, [refresh]);

  // Check if a theme is built-in
  const isBuiltIn = useCallback((themeId: string): boolean => {
    return themeId.startsWith('builtin-');
  }, []);

  return {
    themes,
    selectedThemeId,
    loading,
    error,
    selectTheme,
    getTheme,
    applyThemeToSettings,
    saveAsTheme,
    refresh,
    isBuiltIn,
  };
}

// ============================================================================
// Helper Hook: Get theme by ID
// ============================================================================

export function useTheme(themeId: string | undefined): {
  theme: ThemeDefinition | null;
  loading: boolean;
  error: string | null;
} {
  const [theme, setTheme] = useState<ThemeDefinition | null>(null);
  const [loading, setLoading] = useState(!!themeId);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!themeId) {
      setTheme(null);
      setLoading(false);
      return;
    }

    const loadTheme = async () => {
      try {
        setLoading(true);
        setError(null);

        const service = getThemeService();
        await service.initialize();
        const resolved = await service.getResolvedTheme(themeId);

        setTheme(resolved);
      } catch (err) {
        console.error('[useTheme] Failed to load theme:', err);
        setError(err instanceof Error ? err.message : 'Failed to load theme');
      } finally {
        setLoading(false);
      }
    };

    loadTheme();
  }, [themeId]);

  return { theme, loading, error };
}
