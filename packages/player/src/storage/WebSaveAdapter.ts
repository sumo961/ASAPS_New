import { openDB, IDBPDatabase } from 'idb';
import type { SaveSlot, ISaveStorageAdapter } from '../SaveSystem';

const DB_NAME = 'asaps-player-saves';
const DB_VERSION = 1;
const STORE_NAME = 'saves';

interface SaveRecord {
  key: string; // Format: "{storyId}:{slotId}" or "{storyId}:auto"
  slot: SaveSlot;
}

/**
 * Web-based save storage using IndexedDB
 * Falls back to localStorage for smaller saves if IndexedDB is unavailable
 */
export class WebSaveAdapter implements ISaveStorageAdapter {
  private db: IDBPDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  constructor() {
    this.initPromise = this.initDB();
  }

  private async initDB(): Promise<void> {
    try {
      this.db = await openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
            store.createIndex('by-story', 'slot.storyId');
            store.createIndex('by-timestamp', 'slot.timestamp');
          }
        },
      });
    } catch (error) {
      console.warn('[WebSaveAdapter] IndexedDB not available, falling back to localStorage');
      this.db = null;
    }
  }

  private async ensureReady(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
    }
  }

  private getKey(storyId: string, slotId: number): string {
    return slotId === -1 ? `${storyId}:auto` : `${storyId}:${slotId}`;
  }

  async saveSlot(slot: SaveSlot): Promise<void> {
    await this.ensureReady();
    const key = this.getKey(slot.storyId, slot.slotId);

    // Convert Date to ISO string for storage
    const storableSlot = {
      ...slot,
      timestamp: slot.timestamp instanceof Date ? slot.timestamp.toISOString() : slot.timestamp,
    };

    if (this.db) {
      await this.db.put(STORE_NAME, { key, slot: storableSlot });
    } else {
      // Fallback to localStorage
      localStorage.setItem(`asaps-save:${key}`, JSON.stringify(storableSlot));
    }
  }

  async loadSlot(storyId: string, slotId: number): Promise<SaveSlot | null> {
    await this.ensureReady();
    const key = this.getKey(storyId, slotId);

    let record: SaveRecord | undefined;

    if (this.db) {
      record = await this.db.get(STORE_NAME, key);
    } else {
      const data = localStorage.getItem(`asaps-save:${key}`);
      if (data) {
        record = { key, slot: JSON.parse(data) };
      }
    }

    if (record?.slot) {
      // Convert timestamp back to Date
      return {
        ...record.slot,
        timestamp: new Date(record.slot.timestamp),
      };
    }

    return null;
  }

  async deleteSlot(storyId: string, slotId: number): Promise<void> {
    await this.ensureReady();
    const key = this.getKey(storyId, slotId);

    if (this.db) {
      await this.db.delete(STORE_NAME, key);
    } else {
      localStorage.removeItem(`asaps-save:${key}`);
    }
  }

  async listSlots(storyId: string): Promise<SaveSlot[]> {
    await this.ensureReady();
    const slots: SaveSlot[] = [];

    if (this.db) {
      const index = this.db.transaction(STORE_NAME).store.index('by-story');
      let cursor = await index.openCursor(IDBKeyRange.only(storyId));

      while (cursor) {
        const record = cursor.value as SaveRecord;
        if (!record.slot.autoSave) {
          slots.push({
            ...record.slot,
            timestamp: new Date(record.slot.timestamp),
          });
        }
        cursor = await cursor.continue();
      }
    } else {
      // Fallback to localStorage
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(`asaps-save:${storyId}:`) && !key.endsWith(':auto')) {
          const data = localStorage.getItem(key);
          if (data) {
            const slot = JSON.parse(data);
            slots.push({
              ...slot,
              timestamp: new Date(slot.timestamp),
            });
          }
        }
      }
    }

    // Sort by timestamp, newest first
    return slots.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  async getAutoSave(storyId: string): Promise<SaveSlot | null> {
    return this.loadSlot(storyId, -1);
  }

  /**
   * Delete all saves for a story
   */
  async clearStory(storyId: string): Promise<void> {
    await this.ensureReady();

    if (this.db) {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const index = tx.store.index('by-story');
      let cursor = await index.openCursor(IDBKeyRange.only(storyId));

      while (cursor) {
        await cursor.delete();
        cursor = await cursor.continue();
      }

      await tx.done;
    } else {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(`asaps-save:${storyId}:`)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
    }
  }

  /**
   * Get storage usage info
   */
  async getStorageInfo(): Promise<{ used: number; available: number }> {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      return {
        used: estimate.usage || 0,
        available: estimate.quota || 0,
      };
    }
    return { used: 0, available: 0 };
  }
}
