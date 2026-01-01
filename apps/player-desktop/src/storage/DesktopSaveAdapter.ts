import type { SaveSlot, ISaveStorageAdapter } from '@asaps/player';

/**
 * Desktop save storage using Tauri filesystem APIs
 * Saves to ~/Documents/ASAPS/saves/
 */
export class DesktopSaveAdapter implements ISaveStorageAdapter {
  private basePath: string | null = null;
  private initPromise: Promise<void> | null = null;

  constructor() {
    this.initPromise = this.init();
  }

  private async init(): Promise<void> {
    if (!window.__TAURI__) {
      console.warn('[DesktopSaveAdapter] Not in Tauri environment, using fallback');
      return;
    }

    try {
      const { documentDir, join } = await import('@tauri-apps/api/path');
      const { mkdir, exists } = await import('@tauri-apps/plugin-fs');

      const docDir = await documentDir();
      this.basePath = await join(docDir, 'ASAPS', 'saves');

      // Create directory if it doesn't exist
      const dirExists = await exists(this.basePath);
      if (!dirExists) {
        await mkdir(this.basePath, { recursive: true });
      }
    } catch (error) {
      console.error('[DesktopSaveAdapter] Failed to initialize:', error);
      this.basePath = null;
    }
  }

  private async ensureReady(): Promise<boolean> {
    if (this.initPromise) {
      await this.initPromise;
    }
    return this.basePath !== null;
  }

  private getFilename(storyId: string, slotId: number): string {
    const safeStoryId = storyId.replace(/[^a-zA-Z0-9-_]/g, '_');
    return slotId === -1
      ? `${safeStoryId}_autosave.json`
      : `${safeStoryId}_slot${slotId}.json`;
  }

  async saveSlot(slot: SaveSlot): Promise<void> {
    const ready = await this.ensureReady();
    if (!ready) {
      // Fallback to localStorage
      const key = `asaps-save:${slot.storyId}:${slot.slotId}`;
      localStorage.setItem(key, JSON.stringify({
        ...slot,
        timestamp: slot.timestamp.toISOString(),
      }));
      return;
    }

    try {
      const { join } = await import('@tauri-apps/api/path');
      const { writeTextFile } = await import('@tauri-apps/plugin-fs');

      const filename = this.getFilename(slot.storyId, slot.slotId);
      const filepath = await join(this.basePath!, filename);

      const data = JSON.stringify({
        ...slot,
        timestamp: slot.timestamp.toISOString(),
      }, null, 2);

      await writeTextFile(filepath, data);
    } catch (error) {
      console.error('[DesktopSaveAdapter] Failed to save:', error);
      throw error;
    }
  }

  async loadSlot(storyId: string, slotId: number): Promise<SaveSlot | null> {
    const ready = await this.ensureReady();
    if (!ready) {
      // Fallback to localStorage
      const key = `asaps-save:${storyId}:${slotId}`;
      const data = localStorage.getItem(key);
      if (!data) return null;
      const parsed = JSON.parse(data);
      return {
        ...parsed,
        timestamp: new Date(parsed.timestamp),
      };
    }

    try {
      const { join } = await import('@tauri-apps/api/path');
      const { readTextFile, exists } = await import('@tauri-apps/plugin-fs');

      const filename = this.getFilename(storyId, slotId);
      const filepath = await join(this.basePath!, filename);

      const fileExists = await exists(filepath);
      if (!fileExists) return null;

      const data = await readTextFile(filepath);
      const parsed = JSON.parse(data);

      return {
        ...parsed,
        timestamp: new Date(parsed.timestamp),
      };
    } catch (error) {
      console.error('[DesktopSaveAdapter] Failed to load:', error);
      return null;
    }
  }

  async deleteSlot(storyId: string, slotId: number): Promise<void> {
    const ready = await this.ensureReady();
    if (!ready) {
      // Fallback to localStorage
      const key = `asaps-save:${storyId}:${slotId}`;
      localStorage.removeItem(key);
      return;
    }

    try {
      const { join } = await import('@tauri-apps/api/path');
      const { remove, exists } = await import('@tauri-apps/plugin-fs');

      const filename = this.getFilename(storyId, slotId);
      const filepath = await join(this.basePath!, filename);

      const fileExists = await exists(filepath);
      if (fileExists) {
        await remove(filepath);
      }
    } catch (error) {
      console.error('[DesktopSaveAdapter] Failed to delete:', error);
    }
  }

  async listSlots(storyId: string): Promise<SaveSlot[]> {
    const ready = await this.ensureReady();
    if (!ready) {
      // Fallback to localStorage
      const slots: SaveSlot[] = [];
      const prefix = `asaps-save:${storyId}:`;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(prefix) && !key.endsWith(':-1')) {
          const data = localStorage.getItem(key);
          if (data) {
            const parsed = JSON.parse(data);
            slots.push({
              ...parsed,
              timestamp: new Date(parsed.timestamp),
            });
          }
        }
      }
      return slots.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    }

    try {
      const { join } = await import('@tauri-apps/api/path');
      const { readDir, readTextFile } = await import('@tauri-apps/plugin-fs');

      const safeStoryId = storyId.replace(/[^a-zA-Z0-9-_]/g, '_');
      const entries = await readDir(this.basePath!);
      const slots: SaveSlot[] = [];

      for (const entry of entries) {
        if (entry.isFile && entry.name.startsWith(safeStoryId) && entry.name.endsWith('.json') && !entry.name.includes('autosave')) {
          try {
            const filepath = await join(this.basePath!, entry.name);
            const data = await readTextFile(filepath);
            const parsed = JSON.parse(data);
            slots.push({
              ...parsed,
              timestamp: new Date(parsed.timestamp),
            });
          } catch {
            // Skip invalid files
          }
        }
      }

      return slots.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    } catch (error) {
      console.error('[DesktopSaveAdapter] Failed to list slots:', error);
      return [];
    }
  }

  async getAutoSave(storyId: string): Promise<SaveSlot | null> {
    return this.loadSlot(storyId, -1);
  }

  /**
   * Get the save directory path
   */
  getSavePath(): string | null {
    return this.basePath;
  }
}

// Declare Tauri global
declare global {
  interface Window {
    __TAURI__?: unknown;
  }
}
