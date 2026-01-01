import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
import type { SaveSlot, ISaveStorageAdapter } from '@asaps/player';

/**
 * Mobile save storage using Capacitor APIs
 * Uses Filesystem for save data and Preferences for metadata
 */
export class MobileSaveAdapter implements ISaveStorageAdapter {
  private readonly SAVES_DIR = 'asaps-saves';
  private isNative: boolean;

  constructor() {
    this.isNative = Capacitor.isNativePlatform();
    this.ensureDirectory();
  }

  private async ensureDirectory(): Promise<void> {
    if (!this.isNative) return;

    try {
      await Filesystem.mkdir({
        path: this.SAVES_DIR,
        directory: Directory.Documents,
        recursive: true,
      });
    } catch (error) {
      // Directory might already exist
    }
  }

  private getFilename(storyId: string, slotId: number): string {
    const safeStoryId = storyId.replace(/[^a-zA-Z0-9-_]/g, '_');
    return slotId === -1
      ? `${safeStoryId}_autosave.json`
      : `${safeStoryId}_slot${slotId}.json`;
  }

  private getPreferencesKey(storyId: string, slotId: number): string {
    return slotId === -1
      ? `save:${storyId}:auto`
      : `save:${storyId}:${slotId}`;
  }

  async saveSlot(slot: SaveSlot): Promise<void> {
    const storableSlot = {
      ...slot,
      timestamp: slot.timestamp.toISOString(),
    };

    if (this.isNative) {
      // Save to filesystem on native
      const filename = this.getFilename(slot.storyId, slot.slotId);
      await Filesystem.writeFile({
        path: `${this.SAVES_DIR}/${filename}`,
        data: JSON.stringify(storableSlot, null, 2),
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
      });
    } else {
      // Fallback to Preferences for web
      await Preferences.set({
        key: this.getPreferencesKey(slot.storyId, slot.slotId),
        value: JSON.stringify(storableSlot),
      });
    }
  }

  async loadSlot(storyId: string, slotId: number): Promise<SaveSlot | null> {
    try {
      let data: string | null = null;

      if (this.isNative) {
        const filename = this.getFilename(storyId, slotId);
        const result = await Filesystem.readFile({
          path: `${this.SAVES_DIR}/${filename}`,
          directory: Directory.Documents,
          encoding: Encoding.UTF8,
        });
        data = result.data as string;
      } else {
        const result = await Preferences.get({
          key: this.getPreferencesKey(storyId, slotId),
        });
        data = result.value;
      }

      if (!data) return null;

      const parsed = JSON.parse(data);
      return {
        ...parsed,
        timestamp: new Date(parsed.timestamp),
      };
    } catch (error) {
      console.warn('[MobileSaveAdapter] Failed to load slot:', error);
      return null;
    }
  }

  async deleteSlot(storyId: string, slotId: number): Promise<void> {
    try {
      if (this.isNative) {
        const filename = this.getFilename(storyId, slotId);
        await Filesystem.deleteFile({
          path: `${this.SAVES_DIR}/${filename}`,
          directory: Directory.Documents,
        });
      } else {
        await Preferences.remove({
          key: this.getPreferencesKey(storyId, slotId),
        });
      }
    } catch (error) {
      console.warn('[MobileSaveAdapter] Failed to delete slot:', error);
    }
  }

  async listSlots(storyId: string): Promise<SaveSlot[]> {
    const slots: SaveSlot[] = [];
    const safeStoryId = storyId.replace(/[^a-zA-Z0-9-_]/g, '_');

    try {
      if (this.isNative) {
        const result = await Filesystem.readdir({
          path: this.SAVES_DIR,
          directory: Directory.Documents,
        });

        for (const file of result.files) {
          if (
            file.name.startsWith(safeStoryId) &&
            file.name.endsWith('.json') &&
            !file.name.includes('autosave')
          ) {
            try {
              const content = await Filesystem.readFile({
                path: `${this.SAVES_DIR}/${file.name}`,
                directory: Directory.Documents,
                encoding: Encoding.UTF8,
              });
              const parsed = JSON.parse(content.data as string);
              slots.push({
                ...parsed,
                timestamp: new Date(parsed.timestamp),
              });
            } catch {
              // Skip invalid files
            }
          }
        }
      } else {
        // Fallback: check slots 0-9
        for (let i = 0; i < 10; i++) {
          const slot = await this.loadSlot(storyId, i);
          if (slot) {
            slots.push(slot);
          }
        }
      }
    } catch (error) {
      console.warn('[MobileSaveAdapter] Failed to list slots:', error);
    }

    return slots.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  async getAutoSave(storyId: string): Promise<SaveSlot | null> {
    return this.loadSlot(storyId, -1);
  }

  /**
   * Share a save file (native only)
   */
  async shareSave(storyId: string, slotId: number): Promise<void> {
    if (!this.isNative) {
      console.warn('Share is only available on native platforms');
      return;
    }

    try {
      const { Share } = await import('@capacitor/share');
      const filename = this.getFilename(storyId, slotId);
      const uri = await Filesystem.getUri({
        path: `${this.SAVES_DIR}/${filename}`,
        directory: Directory.Documents,
      });

      await Share.share({
        title: 'ASAPS Save File',
        url: uri.uri,
      });
    } catch (error) {
      console.error('[MobileSaveAdapter] Failed to share save:', error);
    }
  }
}
