import { SerializedStoryState } from '@asaps/core';

/**
 * A save slot containing story state and metadata
 */
export interface SaveSlot {
  slotId: number;
  storyId: string;
  storyTitle: string;
  timestamp: Date;
  state: SerializedStoryState;
  thumbnail?: string; // Base64 encoded screenshot
  autoSave: boolean;
  playTime: number; // Total play time in seconds
}

/**
 * Storage adapter interface for save/load operations
 * Implement this for different platforms (web, desktop, mobile)
 */
export interface ISaveStorageAdapter {
  saveSlot(slot: SaveSlot): Promise<void>;
  loadSlot(storyId: string, slotId: number): Promise<SaveSlot | null>;
  deleteSlot(storyId: string, slotId: number): Promise<void>;
  listSlots(storyId: string): Promise<SaveSlot[]>;
  getAutoSave(storyId: string): Promise<SaveSlot | null>;
}

/**
 * Save system configuration
 */
export interface SaveSystemConfig {
  maxSlots: number;
  autoSaveEnabled: boolean;
  autoSaveIntervalMs: number;
  adapter: ISaveStorageAdapter;
}

const DEFAULT_CONFIG: Partial<SaveSystemConfig> = {
  maxSlots: 10,
  autoSaveEnabled: true,
  autoSaveIntervalMs: 60000, // 1 minute
};

/**
 * SaveSystem manages save slots for story playback
 * Supports manual saves, auto-saves, and quick saves
 */
export class SaveSystem {
  private config: SaveSystemConfig;
  private storyId: string;
  private storyTitle: string;
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;
  private sessionStartTime: number = Date.now();
  private accumulatedPlayTime: number = 0;

  constructor(storyId: string, storyTitle: string, config: Partial<SaveSystemConfig> & { adapter: ISaveStorageAdapter }) {
    this.storyId = storyId;
    this.storyTitle = storyTitle;
    this.config = { ...DEFAULT_CONFIG, ...config } as SaveSystemConfig;
  }

  /**
   * Save to a specific slot
   */
  async saveToSlot(slotId: number, state: SerializedStoryState, thumbnail?: string): Promise<SaveSlot> {
    if (slotId < 0 || slotId >= this.config.maxSlots) {
      throw new Error(`Invalid slot ID: ${slotId}. Must be between 0 and ${this.config.maxSlots - 1}`);
    }

    const slot: SaveSlot = {
      slotId,
      storyId: this.storyId,
      storyTitle: this.storyTitle,
      timestamp: new Date(),
      state,
      thumbnail,
      autoSave: false,
      playTime: this.getTotalPlayTime(),
    };

    await this.config.adapter.saveSlot(slot);
    return slot;
  }

  /**
   * Load from a specific slot
   */
  async loadFromSlot(slotId: number): Promise<SaveSlot | null> {
    const slot = await this.config.adapter.loadSlot(this.storyId, slotId);
    if (slot) {
      // Resume accumulated play time
      this.accumulatedPlayTime = slot.playTime;
      this.sessionStartTime = Date.now();
    }
    return slot;
  }

  /**
   * Delete a specific slot
   */
  async deleteSlot(slotId: number): Promise<void> {
    await this.config.adapter.deleteSlot(this.storyId, slotId);
  }

  /**
   * List all save slots for the current story
   */
  async listSlots(): Promise<SaveSlot[]> {
    return this.config.adapter.listSlots(this.storyId);
  }

  /**
   * Create an auto-save
   */
  async autoSave(state: SerializedStoryState, thumbnail?: string): Promise<SaveSlot> {
    const slot: SaveSlot = {
      slotId: -1, // Special slot ID for auto-save
      storyId: this.storyId,
      storyTitle: this.storyTitle,
      timestamp: new Date(),
      state,
      thumbnail,
      autoSave: true,
      playTime: this.getTotalPlayTime(),
    };

    await this.config.adapter.saveSlot(slot);
    return slot;
  }

  /**
   * Get the most recent auto-save
   */
  async getAutoSave(): Promise<SaveSlot | null> {
    return this.config.adapter.getAutoSave(this.storyId);
  }

  /**
   * Start auto-save timer
   * @param getState Function that returns the current game state
   * @param getThumbnail Optional function that returns a screenshot
   */
  startAutoSave(getState: () => SerializedStoryState, getThumbnail?: () => Promise<string | undefined>): void {
    if (!this.config.autoSaveEnabled) return;

    this.stopAutoSave();

    this.autoSaveTimer = setInterval(async () => {
      try {
        const state = getState();
        const thumbnail = getThumbnail ? await getThumbnail() : undefined;
        await this.autoSave(state, thumbnail);
        console.log('[SaveSystem] Auto-save completed');
      } catch (error) {
        console.error('[SaveSystem] Auto-save failed:', error);
      }
    }, this.config.autoSaveIntervalMs);
  }

  /**
   * Stop auto-save timer
   */
  stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  /**
   * Get total play time in seconds
   */
  getTotalPlayTime(): number {
    const currentSessionTime = (Date.now() - this.sessionStartTime) / 1000;
    return this.accumulatedPlayTime + currentSessionTime;
  }

  /**
   * Format play time as HH:MM:SS
   */
  formatPlayTime(): string {
    const totalSeconds = Math.floor(this.getTotalPlayTime());
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  /**
   * Get configuration
   */
  getConfig(): Readonly<SaveSystemConfig> {
    return { ...this.config };
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.stopAutoSave();
  }
}
