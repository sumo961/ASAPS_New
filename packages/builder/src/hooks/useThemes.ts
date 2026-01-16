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
import { loadThemeFont, isThemeFontLoaded } from '../utils/fontRegistry';

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

/** Loaded theme asset URLs (for use in components) */
export interface ThemeAssetUrls {
  fonts: Map<string, string>; // role -> fontFamily
  graphics: Map<string, string>; // role -> objectURL
  textboxFrame?: string; // objectURL for textbox frame
  buttonNormal?: string; // objectURL for button normal state background
  buttonHover?: string; // objectURL for button hover state background
  /** Button layout positioning (from Ren'Py theme import) */
  buttonLayout?: {
    yAlign?: number;
    spacing?: number;
    width?: number;
    height?: number;
  };
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

  /** Loaded theme asset URLs */
  themeAssets: ThemeAssetUrls | null;

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

  /** Load theme assets (fonts and graphics) */
  loadThemeAssets: (themeId: string) => Promise<ThemeAssetUrls | null>;

  /** Clear theme selection and assets */
  clearSelection: () => void;
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
  const [themeAssets, setThemeAssets] = useState<ThemeAssetUrls | null>(null);

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

  // Respond to changes in initialThemeId prop (e.g., when switching projects)
  // This clears theme assets when the theme changes to prevent bleed between projects
  useEffect(() => {
    if (initialThemeId === undefined) {
      // Clear theme assets when project has no theme
      console.log('[useThemes] Clearing theme assets (no theme for this project)');
      setThemeAssets(null);
      setSelectedThemeId(null);
    } else if (initialThemeId !== selectedThemeId) {
      // Theme changed - update selection (assets will be loaded via loadThemeAssets)
      console.log('[useThemes] Theme changed to:', initialThemeId);
      setSelectedThemeId(initialThemeId);
    }
  }, [initialThemeId]); // Don't include selectedThemeId to avoid loops

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

  // Load theme assets (fonts and graphics)
  const loadThemeAssets = useCallback(async (themeId: string): Promise<ThemeAssetUrls | null> => {
    try {
      const service = getThemeService();
      const theme = await service.getResolvedTheme(themeId);

      if (!theme) {
        console.warn('[useThemes] Theme not found for asset loading:', themeId);
        return null;
      }

      const assets: ThemeAssetUrls = {
        fonts: new Map(),
        graphics: new Map(),
      };

      // Load font assets
      if (theme.assets?.fonts) {
        for (const fontRef of theme.assets.fonts) {
          const blob = await service.loadThemeAsset(fontRef.id);
          if (blob && fontRef.fontFamily) {
            // Load into CSS if not already loaded
            if (!isThemeFontLoaded(fontRef.fontFamily)) {
              loadThemeFont(fontRef.fontFamily, blob, fontRef.filename);
            }
            assets.fonts.set(fontRef.role, fontRef.fontFamily);
          }
        }
      }

      // Load UI graphic assets
      if (theme.assets?.uiGraphics) {
        for (const graphicRef of theme.assets.uiGraphics) {
          const blob = await service.loadThemeAsset(graphicRef.id);
          if (blob) {
            const url = URL.createObjectURL(blob);
            assets.graphics.set(graphicRef.role, url);

            // Set textbox frame URL if this is the frame asset
            if (graphicRef.role === 'textbox-frame') {
              assets.textboxFrame = url;
            }
            // Set button graphics URLs
            if (graphicRef.role === 'button-normal') {
              assets.buttonNormal = url;
            }
            if (graphicRef.role === 'button-hover') {
              assets.buttonHover = url;
            }
          }
        }
      }

      // Also check for frameAssetId directly on textBox
      if (theme.textBox.frameAssetId && !assets.textboxFrame) {
        const blob = await service.loadThemeAsset(theme.textBox.frameAssetId);
        if (blob) {
          assets.textboxFrame = URL.createObjectURL(blob);
        }
      }

      // Also check for button graphics directly on button config
      if (theme.button.backgroundImageId && !assets.buttonNormal) {
        const blob = await service.loadThemeAsset(theme.button.backgroundImageId);
        if (blob) {
          assets.buttonNormal = URL.createObjectURL(blob);
        }
      }
      if (theme.button.hoverBackgroundImageId && !assets.buttonHover) {
        const blob = await service.loadThemeAsset(theme.button.hoverBackgroundImageId);
        if (blob) {
          assets.buttonHover = URL.createObjectURL(blob);
        }
      }

      // Extract button layout positioning if available
      if (theme.button.layout) {
        assets.buttonLayout = {
          yAlign: theme.button.layout.yAlign,
          spacing: theme.button.layout.spacing,
          width: theme.button.layout.width,
          height: theme.button.layout.height,
        };
      }

      setThemeAssets(assets);
      console.log('[useThemes] Loaded theme assets:', {
        fonts: assets.fonts.size,
        graphics: assets.graphics.size,
        hasTextboxFrame: !!assets.textboxFrame,
        hasButtonNormal: !!assets.buttonNormal,
        hasButtonHover: !!assets.buttonHover,
        buttonLayout: assets.buttonLayout,
      });

      return assets;
    } catch (err) {
      console.error('[useThemes] Failed to load theme assets:', err);
      return null;
    }
  }, []);

  // Clear theme selection and assets
  const clearSelection = useCallback(() => {
    console.log('[useThemes] Clearing theme selection and assets');
    setSelectedThemeId(null);
    setThemeAssets(null);
  }, []);

  return {
    themes,
    selectedThemeId,
    loading,
    error,
    themeAssets,
    selectTheme,
    getTheme,
    applyThemeToSettings,
    saveAsTheme,
    refresh,
    isBuiltIn,
    loadThemeAssets,
    clearSelection,
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
