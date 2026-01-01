import JSZip from 'jszip';

/**
 * Asset metadata extracted from story
 */
export interface AssetInfo {
  id: string;
  name: string;
  type: 'image' | 'audio' | 'video' | 'font' | 'other';
  path: string; // Path within the ZIP
  mimeType: string;
}

/**
 * Loaded asset with blob URL
 */
export interface LoadedAsset extends AssetInfo {
  url: string; // Blob URL for use in browser
  blob: Blob;
}

/**
 * AssetResolver loads and manages assets from story ZIP files
 * Creates blob URLs for use in the browser and handles cleanup
 */
export class AssetResolver {
  private zip: JSZip | null = null;
  private loadedAssets: Map<string, LoadedAsset> = new Map();
  private assetManifest: Map<string, AssetInfo> = new Map();
  private storyData: any = null;

  /**
   * Load a story from a ZIP file
   */
  async loadFromZip(zipData: ArrayBuffer | Blob | File): Promise<any> {
    // Load the ZIP
    this.zip = await JSZip.loadAsync(zipData);

    // Find and parse the story file (project.json or story.xml)
    let storyFile = this.zip.file('project.json');
    if (storyFile) {
      const content = await storyFile.async('text');
      this.storyData = JSON.parse(content);
    } else {
      // Try to find story.xml for ASML format
      storyFile = this.zip.file('story.xml');
      if (storyFile) {
        const content = await storyFile.async('text');
        // Return raw XML - caller needs to parse with ASMLParser
        this.storyData = { format: 'asml', content };
      }
    }

    if (!this.storyData) {
      throw new Error('No story file found in ZIP (expected project.json or story.xml)');
    }

    // Build asset manifest from ZIP contents
    await this.buildAssetManifest();

    return this.storyData;
  }

  /**
   * Load a story from a URL
   */
  async loadFromUrl(url: string): Promise<any> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch story: ${response.statusText}`);
    }
    const data = await response.arrayBuffer();
    return this.loadFromZip(data);
  }

  /**
   * Build manifest of all assets in the ZIP
   */
  private async buildAssetManifest(): Promise<void> {
    if (!this.zip) return;

    const assetFolders = ['assets', 'backgrounds', 'characters', 'props', 'audio', 'sounds', 'fonts', 'nodes'];

    for (const [path, file] of Object.entries(this.zip.files)) {
      if (file.dir) continue;

      // Check if file is in an asset folder
      const isAsset = assetFolders.some(folder =>
        path.startsWith(`${folder}/`) || path.includes(`/${folder}/`)
      );

      if (isAsset || this.isMediaFile(path)) {
        const info = this.createAssetInfo(path);
        this.assetManifest.set(path, info);

        // Also index by filename for easier lookup
        const filename = path.split('/').pop() || path;
        if (!this.assetManifest.has(filename)) {
          this.assetManifest.set(filename, info);
        }
      }
    }
  }

  /**
   * Check if a file is a media file based on extension
   */
  private isMediaFile(path: string): boolean {
    const ext = path.split('.').pop()?.toLowerCase();
    const mediaExtensions = [
      'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg',
      'mp3', 'wav', 'ogg', 'm4a', 'aac',
      'mp4', 'webm', 'ogv',
      'ttf', 'otf', 'woff', 'woff2'
    ];
    return ext ? mediaExtensions.includes(ext) : false;
  }

  /**
   * Create asset info from file path
   */
  private createAssetInfo(path: string): AssetInfo {
    const ext = path.split('.').pop()?.toLowerCase() || '';
    const filename = path.split('/').pop() || path;
    const name = filename.replace(/\.[^.]+$/, '');

    let type: AssetInfo['type'] = 'other';
    let mimeType = 'application/octet-stream';

    // Determine type and MIME type from extension
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) {
      type = 'image';
      mimeType = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    } else if (['mp3', 'wav', 'ogg', 'm4a', 'aac'].includes(ext)) {
      type = 'audio';
      mimeType = `audio/${ext === 'mp3' ? 'mpeg' : ext}`;
    } else if (['mp4', 'webm', 'ogv'].includes(ext)) {
      type = 'video';
      mimeType = `video/${ext === 'ogv' ? 'ogg' : ext}`;
    } else if (['ttf', 'otf', 'woff', 'woff2'].includes(ext)) {
      type = 'font';
      mimeType = `font/${ext}`;
    }

    return {
      id: path, // Use path as ID
      name,
      type,
      path,
      mimeType,
    };
  }

  /**
   * Get a loaded asset by path or filename
   * Loads and caches if not already loaded
   */
  async getAsset(pathOrName: string): Promise<LoadedAsset | null> {
    // Check if already loaded
    if (this.loadedAssets.has(pathOrName)) {
      return this.loadedAssets.get(pathOrName)!;
    }

    // Find in manifest
    const info = this.assetManifest.get(pathOrName);
    if (!info || !this.zip) {
      // Try to find by searching
      for (const [path, assetInfo] of this.assetManifest) {
        if (path.endsWith(pathOrName) || path.includes(pathOrName)) {
          return this.loadAsset(assetInfo);
        }
      }
      return null;
    }

    return this.loadAsset(info);
  }

  /**
   * Load an asset and create blob URL
   */
  private async loadAsset(info: AssetInfo): Promise<LoadedAsset> {
    if (!this.zip) {
      throw new Error('No ZIP loaded');
    }

    const file = this.zip.file(info.path);
    if (!file) {
      throw new Error(`Asset not found in ZIP: ${info.path}`);
    }

    const blob = await file.async('blob');
    const url = URL.createObjectURL(new Blob([blob], { type: info.mimeType }));

    const loaded: LoadedAsset = {
      ...info,
      url,
      blob,
    };

    this.loadedAssets.set(info.path, loaded);
    this.loadedAssets.set(info.id, loaded);

    return loaded;
  }

  /**
   * Resolve an asset URL from a path reference
   * Used by renderer to get actual blob URLs
   */
  async resolveUrl(pathOrUrl: string): Promise<string> {
    // If it's already a blob URL or data URL, return as-is
    if (pathOrUrl.startsWith('blob:') || pathOrUrl.startsWith('data:')) {
      return pathOrUrl;
    }

    // If it's an http(s) URL, return as-is
    if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
      return pathOrUrl;
    }

    // Try to load from ZIP
    const asset = await this.getAsset(pathOrUrl);
    return asset?.url || pathOrUrl;
  }

  /**
   * Create an asset resolver function for the renderer
   */
  createResolverFunction(): (path: string) => Promise<string> {
    return (path: string) => this.resolveUrl(path);
  }

  /**
   * Get all loaded assets
   */
  getLoadedAssets(): LoadedAsset[] {
    return Array.from(this.loadedAssets.values());
  }

  /**
   * Get the asset manifest
   */
  getManifest(): AssetInfo[] {
    return Array.from(this.assetManifest.values());
  }

  /**
   * Get the loaded story data
   */
  getStoryData(): any {
    return this.storyData;
  }

  /**
   * Preload all assets (useful for offline play)
   */
  async preloadAll(): Promise<void> {
    const promises = Array.from(this.assetManifest.values()).map(info =>
      this.loadAsset(info).catch(err => {
        console.warn(`Failed to preload ${info.path}:`, err);
        return null;
      })
    );
    await Promise.all(promises);
  }

  /**
   * Release all blob URLs to free memory
   */
  dispose(): void {
    for (const asset of this.loadedAssets.values()) {
      URL.revokeObjectURL(asset.url);
    }
    this.loadedAssets.clear();
    this.assetManifest.clear();
    this.zip = null;
    this.storyData = null;
  }
}
