/**
 * PreviewWindowManager - Manages a separate preview window for story testing
 *
 * Supports both web (window.open + postMessage) and Electron (IPC) environments.
 * The preview window auto-reloads when story changes and navigates to selected beats.
 */

import type { Story, StatePreset } from '@asaps/core';

// Serialized story data for cross-window communication
export interface SerializedStoryData {
  title: string;
  author: string;
  firstBeatId: string;
  beats: Array<{
    id: string;
    name: string;
    type: string;
    x?: number;
    y?: number;
    parameters: Record<string, any>;
    connections: Array<{ targetId: string; label?: string; condition?: any }>;
    locations?: any[];
    animations?: any[];
  }>;
}

// Message types for cross-window communication
export interface PreviewMessage {
  type: 'STORY_UPDATE' | 'NAVIGATE_TO_BEAT' | 'STATE_PRESET' | 'CLOSE' | 'PING';
  payload?: {
    storyData?: SerializedStoryData;
    beatId?: string;
    statePreset?: StatePreset;
    settings?: any;
    projectSettings?: { width: number; height: number };
    assets?: any[];
    characters?: any[];
    themeAssets?: any;
  };
}

export interface PreviewWindowState {
  isOpen: boolean;
  isPending: boolean;
}

type StateChangeCallback = (state: PreviewWindowState) => void;

class PreviewWindowManager {
  private previewWindow: Window | null = null;
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private listeners: Set<StateChangeCallback> = new Set();
  private pendingData: PreviewMessage['payload'] | null = null;
  private isElectron: boolean = false;

  constructor() {
    // Detect Electron environment
    this.isElectron = typeof window !== 'undefined' &&
      !!(window as any).electronAPI?.preview?.open;

    // Listen for messages from preview window (web only)
    if (typeof window !== 'undefined' && !this.isElectron) {
      window.addEventListener('message', this.handleMessage);
    }

    // Listen for Electron preview window closed event
    if (this.isElectron) {
      (window as any).electronAPI?.onPreviewClosed?.(() => {
        this.cleanup();
      });
    }
  }

  /**
   * Subscribe to state changes (open/closed)
   */
  subscribe(callback: StateChangeCallback): () => void {
    this.listeners.add(callback);
    // Immediately notify of current state
    callback(this.getState());
    return () => this.listeners.delete(callback);
  }

  /**
   * Get current window state
   */
  getState(): PreviewWindowState {
    return {
      isOpen: this.isWindowOpen(),
      isPending: this.pendingData !== null,
    };
  }

  /**
   * Check if preview window is currently open
   */
  isWindowOpen(): boolean {
    if (this.isElectron) {
      // In Electron, this is async but we need sync check
      // Use a cached state that's updated via events
      return this._electronWindowOpen;
    }
    return this.previewWindow !== null && !this.previewWindow.closed;
  }

  private _electronWindowOpen: boolean = false;

  /**
   * Open the preview window (or focus it if already open)
   */
  async open(initialData?: PreviewMessage['payload']): Promise<boolean> {
    if (this.isElectron) {
      return this.openElectron(initialData);
    }
    return this.openWeb(initialData);
  }

  /**
   * Open preview window in web environment
   */
  private openWeb(initialData?: PreviewMessage['payload']): boolean {
    // If already open, just focus and send data
    if (this.isWindowOpen()) {
      this.previewWindow?.focus();
      if (initialData) {
        this.sendUpdate(initialData);
      }
      return true;
    }

    // Store data to send once window is ready
    this.pendingData = initialData || null;

    // Calculate window position (centered, or offset from main window)
    const width = 1200;
    const height = 900;
    const left = window.screenX + 50;
    const top = window.screenY + 50;

    // Open new window
    const features = `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes`;

    try {
      // Use hash route for preview window
      const previewUrl = `${window.location.origin}${window.location.pathname}#/preview-window`;
      this.previewWindow = window.open(previewUrl, 'asaps-preview', features);

      if (!this.previewWindow) {
        // Popup was blocked
        console.warn('[PreviewWindowManager] Popup blocked - try allowing popups for this site');
        this.notifyListeners();
        return false;
      }

      // Start checking if window is still open
      this.startWindowCheck();
      this.notifyListeners();
      return true;
    } catch (error) {
      console.error('[PreviewWindowManager] Failed to open preview window:', error);
      return false;
    }
  }

  /**
   * Open preview window in Electron environment
   */
  private async openElectron(initialData?: PreviewMessage['payload']): Promise<boolean> {
    try {
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.preview?.open) {
        console.error('[PreviewWindowManager] Electron preview API not available');
        return false;
      }

      await electronAPI.preview.open();
      this._electronWindowOpen = true;

      // Send initial data if provided (with small delay to let window initialize)
      if (initialData) {
        setTimeout(() => {
          this.sendUpdateElectron(initialData);
        }, 500);
      }

      this.notifyListeners();
      return true;
    } catch (error) {
      console.error('[PreviewWindowManager] Failed to open Electron preview window:', error);
      return false;
    }
  }

  /**
   * Close the preview window
   */
  close(): void {
    if (this.isElectron) {
      (window as any).electronAPI?.preview?.close?.();
      this._electronWindowOpen = false;
    } else if (this.previewWindow && !this.previewWindow.closed) {
      this.previewWindow.close();
    }
    this.cleanup();
  }

  /**
   * Send update to preview window
   */
  sendUpdate(data: PreviewMessage['payload']): void {
    if (!this.isWindowOpen()) {
      console.warn('[PreviewWindowManager] Preview window not open, cannot send update');
      return;
    }

    if (this.isElectron) {
      this.sendUpdateElectron(data);
    } else {
      this.sendUpdateWeb(data);
    }
  }

  /**
   * Send update via postMessage (web)
   */
  private sendUpdateWeb(data: PreviewMessage['payload']): void {
    if (!this.previewWindow || this.previewWindow.closed) return;

    const message: PreviewMessage = {
      type: 'STORY_UPDATE',
      payload: data,
    };

    try {
      this.previewWindow.postMessage(message, window.location.origin);
    } catch (error) {
      console.error('[PreviewWindowManager] Failed to send message to preview window:', error);
    }
  }

  /**
   * Send update via IPC (Electron)
   */
  private async sendUpdateElectron(data: PreviewMessage['payload']): Promise<void> {
    try {
      const electronAPI = (window as any).electronAPI;
      if (electronAPI?.preview?.sendMessage) {
        await electronAPI.preview.sendMessage({
          type: 'STORY_UPDATE',
          payload: data,
        });
      }
    } catch (error) {
      console.error('[PreviewWindowManager] Failed to send IPC message:', error);
    }
  }

  /**
   * Navigate preview to a specific beat
   */
  navigateToBeat(beatId: string): void {
    if (!this.isWindowOpen()) return;

    const message: PreviewMessage = {
      type: 'NAVIGATE_TO_BEAT',
      payload: { beatId },
    };

    if (this.isElectron) {
      (window as any).electronAPI?.preview?.sendMessage?.(message);
    } else if (this.previewWindow) {
      this.previewWindow.postMessage(message, window.location.origin);
    }
  }

  /**
   * Apply a state preset to the preview
   */
  applyStatePreset(preset: StatePreset): void {
    if (!this.isWindowOpen()) return;

    const message: PreviewMessage = {
      type: 'STATE_PRESET',
      payload: { statePreset: preset },
    };

    if (this.isElectron) {
      (window as any).electronAPI?.preview?.sendMessage?.(message);
    } else if (this.previewWindow) {
      this.previewWindow.postMessage(message, window.location.origin);
    }
  }

  /**
   * Handle messages from preview window
   */
  private handleMessage = (event: MessageEvent): void => {
    // Verify origin for security
    if (event.origin !== window.location.origin) return;

    const message = event.data as PreviewMessage;
    if (!message || typeof message.type !== 'string') return;

    switch (message.type) {
      case 'PING':
        // Preview window is ready, send pending data
        if (this.pendingData && this.previewWindow) {
          const initMessage: PreviewMessage = {
            type: 'STORY_UPDATE',
            payload: this.pendingData,
          };
          this.previewWindow.postMessage(initMessage, window.location.origin);
          this.pendingData = null;
          this.notifyListeners();
        }
        break;
    }
  };

  /**
   * Start polling to check if window is still open
   */
  private startWindowCheck(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    this.checkInterval = setInterval(() => {
      if (this.previewWindow && this.previewWindow.closed) {
        this.cleanup();
      }
    }, 500);
  }

  /**
   * Cleanup when window is closed
   */
  private cleanup(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.previewWindow = null;
    this.pendingData = null;
    this._electronWindowOpen = false;
    this.notifyListeners();
  }

  /**
   * Notify all listeners of state change
   */
  private notifyListeners(): void {
    const state = this.getState();
    this.listeners.forEach(callback => callback(state));
  }

  /**
   * Cleanup on destroy
   */
  destroy(): void {
    if (typeof window !== 'undefined' && !this.isElectron) {
      window.removeEventListener('message', this.handleMessage);
    }
    this.close();
    this.listeners.clear();
  }
}

// Export singleton instance
export const previewWindowManager = new PreviewWindowManager();

// Also export class for testing
export { PreviewWindowManager };
