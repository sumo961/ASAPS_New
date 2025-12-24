/**
 * Theme Service
 *
 * Manages theme CRUD operations, asset handling, and theme application to projects.
 * Integrates with the hybrid storage system for theme assets.
 */

import { v4 as uuidv4 } from 'uuid';
import type { IDBPDatabase } from 'idb';
import type {
  ThemeDefinition,
  StoredTheme,
  StoredThemeAsset,
  ThemeAssetRef,
  ThemeAssetRole,
  ThemeMeta,
  DEFAULT_THEME_VALUES,
} from '@asaps/core';
import type { AsapsDBSchema, ThemeAssetStorageInfo } from '../storage/schema';
import { getDatabase } from '../storage/schema';
import type { StorageLocation } from '../storage/IStorageAdapter';

// ============================================================================
// Theme Service Configuration
// ============================================================================

export interface ThemeServiceConfig {
  /**
   * Size threshold for theme asset storage routing
   * Assets smaller than this go to IndexedDB, larger to filesystem/cache
   * @default 5242880 (5MB)
   */
  sizeThreshold?: number;
}

const DEFAULT_CONFIG: Required<ThemeServiceConfig> = {
  sizeThreshold: 5 * 1024 * 1024, // 5MB
};

// ============================================================================
// Theme Service
// ============================================================================

export class ThemeService {
  private config: Required<ThemeServiceConfig>;
  private db: IDBPDatabase<AsapsDBSchema> | null = null;

  constructor(config: ThemeServiceConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the theme service and get database connection
   */
  async initialize(): Promise<void> {
    if (!this.db) {
      this.db = await getDatabase();
    }
  }

  /**
   * Ensure database is initialized
   */
  private async ensureDb(): Promise<IDBPDatabase<AsapsDBSchema>> {
    if (!this.db) {
      await this.initialize();
    }
    return this.db!;
  }

  // ============================================================================
  // THEME CRUD OPERATIONS
  // ============================================================================

  /**
   * List all themes
   */
  async listThemes(): Promise<Array<StoredTheme & { id: string }>> {
    const db = await this.ensureDb();
    return db.getAll('themes');
  }

  /**
   * List themes by source (built-in, imported, custom)
   */
  async listThemesBySource(source: 'built-in' | 'imported' | 'custom'): Promise<Array<StoredTheme & { id: string }>> {
    const db = await this.ensureDb();
    return db.getAllFromIndex('themes', 'by-source', source);
  }

  /**
   * Get a theme by ID (without inheritance resolution)
   */
  async getTheme(themeId: string): Promise<(StoredTheme & { id: string }) | null> {
    const db = await this.ensureDb();
    const theme = await db.get('themes', themeId);
    return theme || null;
  }

  /**
   * Get a theme definition by ID with inheritance resolved
   */
  async getResolvedTheme(themeId: string): Promise<ThemeDefinition | null> {
    const stored = await this.getTheme(themeId);
    if (!stored) return null;

    // If theme extends another, resolve inheritance
    if (stored.definition.meta.extends) {
      return this.resolveThemeInheritance(stored.definition);
    }

    return stored.definition;
  }

  /**
   * Resolve theme inheritance chain
   */
  private async resolveThemeInheritance(theme: ThemeDefinition): Promise<ThemeDefinition> {
    if (!theme.meta.extends) {
      return theme;
    }

    const parent = await this.getResolvedTheme(theme.meta.extends);
    if (!parent) {
      console.warn(`[ThemeService] Parent theme ${theme.meta.extends} not found, using theme as-is`);
      return theme;
    }

    // Deep merge parent and child (child values take precedence)
    return this.mergeThemes(parent, theme);
  }

  /**
   * Deep merge two themes (child overrides parent)
   */
  private mergeThemes(parent: ThemeDefinition, child: ThemeDefinition): ThemeDefinition {
    return {
      meta: { ...parent.meta, ...child.meta },
      colors: { ...parent.colors, ...child.colors },
      fonts: { ...parent.fonts, ...child.fonts },
      textBox: { ...parent.textBox, ...child.textBox },
      button: { ...parent.button, ...child.button },
      hotspot: { ...parent.hotspot, ...child.hotspot },
      effects: { ...parent.effects, ...child.effects },
      components: child.components || parent.components,
      assets: this.mergeAssets(parent.assets, child.assets),
    };
  }

  /**
   * Merge theme assets (child assets replace parent assets by role)
   */
  private mergeAssets(
    parent: ThemeDefinition['assets'],
    child: ThemeDefinition['assets']
  ): ThemeDefinition['assets'] {
    if (!parent && !child) return undefined;
    if (!parent) return child;
    if (!child) return parent;

    const mergeAssetArrays = (
      parentArr: ThemeAssetRef[] | undefined,
      childArr: ThemeAssetRef[] | undefined
    ): ThemeAssetRef[] | undefined => {
      if (!parentArr && !childArr) return undefined;
      if (!parentArr) return childArr;
      if (!childArr) return parentArr;

      // Child assets override parent by role
      const merged = [...parentArr];
      for (const childAsset of childArr) {
        const existingIndex = merged.findIndex(a => a.role === childAsset.role);
        if (existingIndex >= 0) {
          merged[existingIndex] = childAsset;
        } else {
          merged.push(childAsset);
        }
      }
      return merged;
    };

    return {
      fonts: mergeAssetArrays(parent.fonts, child.fonts),
      uiGraphics: mergeAssetArrays(parent.uiGraphics, child.uiGraphics),
      uiSounds: mergeAssetArrays(parent.uiSounds, child.uiSounds),
      defaultBackgrounds: mergeAssetArrays(parent.defaultBackgrounds, child.defaultBackgrounds),
      placeholders: mergeAssetArrays(parent.placeholders, child.placeholders),
    };
  }

  /**
   * Create a new theme
   */
  async createTheme(
    definition: ThemeDefinition,
    source: 'imported' | 'custom' = 'custom'
  ): Promise<string> {
    const db = await this.ensureDb();

    // Ensure theme has an ID
    const themeId = definition.meta.id || uuidv4();
    const now = new Date().toISOString();

    const stored: StoredTheme & { id: string } = {
      id: themeId,
      definition: {
        ...definition,
        meta: {
          ...definition.meta,
          id: themeId,
          createdAt: definition.meta.createdAt || now,
          modifiedAt: now,
        },
      },
      assetIds: [],
      source,
      readOnly: false, // Only built-in themes (registered separately) are read-only
    };

    await db.put('themes', stored);
    console.log(`[ThemeService] Created theme: ${definition.meta.name} (${themeId})`);

    return themeId;
  }

  /**
   * Update an existing theme
   */
  async updateTheme(themeId: string, updates: Partial<ThemeDefinition>): Promise<void> {
    const db = await this.ensureDb();
    const existing = await db.get('themes', themeId);

    if (!existing) {
      throw new Error(`Theme not found: ${themeId}`);
    }

    if (existing.readOnly) {
      throw new Error(`Cannot modify read-only theme: ${existing.definition.meta.name}`);
    }

    const updatedDefinition: ThemeDefinition = {
      ...existing.definition,
      ...updates,
      meta: {
        ...existing.definition.meta,
        ...updates.meta,
        id: themeId, // Preserve ID
        modifiedAt: new Date().toISOString(),
      },
    };

    await db.put('themes', {
      ...existing,
      definition: updatedDefinition,
    });

    console.log(`[ThemeService] Updated theme: ${updatedDefinition.meta.name}`);
  }

  /**
   * Delete a theme and its assets
   */
  async deleteTheme(themeId: string): Promise<void> {
    const db = await this.ensureDb();
    const existing = await db.get('themes', themeId);

    if (!existing) {
      console.warn(`[ThemeService] Theme not found for deletion: ${themeId}`);
      return;
    }

    if (existing.readOnly) {
      throw new Error(`Cannot delete read-only theme: ${existing.definition.meta.name}`);
    }

    // Delete all theme assets
    await this.deleteThemeAssets(themeId);

    // Delete the theme itself
    await db.delete('themes', themeId);

    console.log(`[ThemeService] Deleted theme: ${existing.definition.meta.name}`);
  }

  // ============================================================================
  // THEME ASSET OPERATIONS
  // ============================================================================

  /**
   * Determine storage location for a theme asset based on size
   */
  getStorageLocation(sizeInBytes: number): StorageLocation {
    if (sizeInBytes < this.config.sizeThreshold) {
      return 'indexeddb';
    }
    // In browser, use cache-api for large files
    // In Electron, would use 'filesystem'
    return 'cache-api';
  }

  /**
   * Save a theme asset
   */
  async saveThemeAsset(
    themeId: string,
    blob: Blob,
    filename: string,
    role: ThemeAssetRole,
    type: 'font' | 'image' | 'audio' | 'other' = 'other'
  ): Promise<string> {
    const db = await this.ensureDb();
    const assetId = uuidv4();
    const now = new Date().toISOString();

    // Determine storage location
    const location = this.getStorageLocation(blob.size);

    if (location === 'indexeddb') {
      // Store blob directly in IndexedDB
      const asset: StoredThemeAsset = {
        id: assetId,
        themeId,
        type,
        role,
        filename,
        mimeType: blob.type,
        size: blob.size,
        blob,
        uploadedAt: now,
      };

      await db.put('theme-assets', asset);
    } else {
      // For now, fallback to IndexedDB even for large files
      // Cache API integration would go here
      const asset: StoredThemeAsset = {
        id: assetId,
        themeId,
        type,
        role,
        filename,
        mimeType: blob.type,
        size: blob.size,
        blob,
        uploadedAt: now,
      };

      await db.put('theme-assets', asset);
    }

    // Store metadata
    const metadata: ThemeAssetStorageInfo = {
      id: assetId,
      themeId,
      location,
      size: blob.size,
      mimeType: blob.type,
      filename,
      role,
      uploadedAt: now,
    };

    await db.put('theme-asset-metadata', metadata);

    // Update theme's asset list
    const theme = await db.get('themes', themeId);
    if (theme) {
      theme.assetIds = [...(theme.assetIds || []), assetId];
      await db.put('themes', theme);
    }

    console.log(`[ThemeService] Saved theme asset: ${filename} (${assetId})`);
    return assetId;
  }

  /**
   * Load a theme asset
   */
  async loadThemeAsset(assetId: string): Promise<Blob | null> {
    const db = await this.ensureDb();
    const asset = await db.get('theme-assets', assetId);
    return asset?.blob || null;
  }

  /**
   * Get theme asset info
   */
  async getThemeAssetInfo(assetId: string): Promise<ThemeAssetStorageInfo | null> {
    const db = await this.ensureDb();
    const info = await db.get('theme-asset-metadata', assetId);
    return info || null;
  }

  /**
   * List all assets for a theme
   */
  async listThemeAssets(themeId: string): Promise<ThemeAssetStorageInfo[]> {
    const db = await this.ensureDb();
    return db.getAllFromIndex('theme-asset-metadata', 'by-theme', themeId);
  }

  /**
   * Delete a theme asset
   */
  async deleteThemeAsset(assetId: string): Promise<void> {
    const db = await this.ensureDb();

    // Get metadata to find theme
    const metadata = await db.get('theme-asset-metadata', assetId);
    if (metadata) {
      // Remove from theme's asset list
      const theme = await db.get('themes', metadata.themeId);
      if (theme) {
        theme.assetIds = theme.assetIds.filter(id => id !== assetId);
        await db.put('themes', theme);
      }
    }

    // Delete asset and metadata
    await db.delete('theme-assets', assetId);
    await db.delete('theme-asset-metadata', assetId);
  }

  /**
   * Delete all assets for a theme
   */
  async deleteThemeAssets(themeId: string): Promise<void> {
    const db = await this.ensureDb();
    const assets = await this.listThemeAssets(themeId);

    const tx = db.transaction(['theme-assets', 'theme-asset-metadata'], 'readwrite');

    for (const asset of assets) {
      await tx.objectStore('theme-assets').delete(asset.id);
      await tx.objectStore('theme-asset-metadata').delete(asset.id);
    }

    await tx.done;
    console.log(`[ThemeService] Deleted ${assets.length} assets for theme ${themeId}`);
  }

  /**
   * Get theme asset as object URL (for DOM usage)
   */
  async getThemeAssetObjectURL(assetId: string): Promise<string | null> {
    const blob = await this.loadThemeAsset(assetId);
    if (!blob) return null;
    return URL.createObjectURL(blob);
  }

  // ============================================================================
  // THEME APPLICATION
  // ============================================================================

  /**
   * Mark a theme as recently used
   */
  async markThemeUsed(themeId: string): Promise<void> {
    const db = await this.ensureDb();
    const theme = await db.get('themes', themeId);

    if (theme) {
      theme.lastUsedAt = new Date().toISOString();
      await db.put('themes', theme);
    }
  }

  /**
   * Get recently used themes
   */
  async getRecentThemes(limit: number = 5): Promise<Array<StoredTheme & { id: string }>> {
    const db = await this.ensureDb();
    const themes = await db.getAllFromIndex('themes', 'by-lastUsed');

    // Filter out undefined lastUsedAt and sort by most recent
    return themes
      .filter(t => t.lastUsedAt)
      .sort((a, b) => (b.lastUsedAt || '').localeCompare(a.lastUsedAt || ''))
      .slice(0, limit);
  }

  // ============================================================================
  // BUILT-IN THEMES
  // ============================================================================

  /**
   * Register built-in preset themes
   */
  async registerBuiltInThemes(themes: ThemeDefinition[]): Promise<void> {
    const db = await this.ensureDb();

    for (const theme of themes) {
      const existing = await db.get('themes', theme.meta.id);
      if (!existing) {
        const stored: StoredTheme & { id: string } = {
          id: theme.meta.id,
          definition: theme,
          assetIds: [],
          source: 'built-in',
          readOnly: true,
        };

        await db.put('themes', stored);
        console.log(`[ThemeService] Registered built-in theme: ${theme.meta.name}`);
      }
    }
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let themeServiceInstance: ThemeService | null = null;

/**
 * Get the singleton theme service instance
 */
export function getThemeService(): ThemeService {
  if (!themeServiceInstance) {
    themeServiceInstance = new ThemeService();
  }
  return themeServiceInstance;
}

/**
 * Initialize the theme service (call at app startup)
 */
export async function initThemeService(): Promise<ThemeService> {
  const service = getThemeService();
  await service.initialize();
  return service;
}
