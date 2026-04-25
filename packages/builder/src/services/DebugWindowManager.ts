/**
 * DebugWindowManager - Opens the Story Debug Tools (Reachability, Path Analysis,
 * Story Logic) in a separate browser window so it can be moved freely — including
 * to a second monitor — while the user works in the main builder.
 *
 * Mirrors PreviewWindowManager's shape: window.open + postMessage with an origin
 * check, and a hash route so we don't have to touch the Vite router config.
 */

import type { SerializedStoryData } from './PreviewWindowManager';

export interface DebugMessage {
  type:
    | 'STORY_UPDATE'
    | 'PING'
    | 'HIGHLIGHT_PATH'
    | 'HIGHLIGHT_BEAT'
    | 'CLEAR_HIGHLIGHT';
  payload?: {
    storyData?: SerializedStoryData;
    beatIds?: string[];
    beatId?: string;
  };
}

export interface DebugWindowState {
  isOpen: boolean;
}

type StateChangeCallback = (state: DebugWindowState) => void;
type HighlightCallback =
  | { kind: 'path'; beatIds: string[] }
  | { kind: 'beat'; beatId: string }
  | { kind: 'clear' };

class DebugWindowManager {
  private debugWindow: Window | null = null;
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<StateChangeCallback>();
  private highlightListeners = new Set<(evt: HighlightCallback) => void>();
  /** Most recent story data — re-sent whenever the debug window reports ready. */
  private latestStoryData: SerializedStoryData | null = null;
  private isElectron: boolean = false;
  /** Set by the Electron `debug:ready` listener; gates whether
   *  `sendStoryUpdate` fires over IPC immediately vs. waits. */
  private electronWindowOpen: boolean = false;

  constructor() {
    // Electron routes window.open through setWindowOpenHandler and denies it,
    // so in the desktop build we use IPC (mirroring the Preview Window setup).
    this.isElectron = typeof window !== 'undefined'
      && !!(window as any).electronAPI?.debug?.open;

    if (typeof window !== 'undefined' && !this.isElectron) {
      window.addEventListener('message', this.handleMessage);
    }

    if (this.isElectron) {
      const api = (window as any).electronAPI;
      api.onDebugClosed?.(() => this.cleanup());
      api.onDebugReady?.(() => {
        // Debug window finished loading and is ready for story data.
        this.electronWindowOpen = true;
        if (this.latestStoryData) this.sendStoryUpdate(this.latestStoryData);
      });
      // Forward messages the debug window pushes back (highlight requests).
      api.onDebugMessageToMain?.((message: any) => {
        this.handleMessage({
          origin: typeof window !== 'undefined' ? window.location.origin : '',
          data: message,
        } as MessageEvent);
      });
    }
  }

  subscribe(callback: StateChangeCallback): () => void {
    this.listeners.add(callback);
    callback(this.getState());
    return () => this.listeners.delete(callback);
  }

  /**
   * Listen for highlight requests coming back from the debug window when the
   * user clicks a beat or path — the main builder uses these to paint the
   * flowchart exactly like it does for the in-page DebugPanel.
   */
  subscribeToHighlights(callback: (evt: HighlightCallback) => void): () => void {
    this.highlightListeners.add(callback);
    return () => this.highlightListeners.delete(callback);
  }

  getState(): DebugWindowState {
    return { isOpen: this.isWindowOpen() };
  }

  isWindowOpen(): boolean {
    if (this.isElectron) return this.electronWindowOpen;
    return this.debugWindow !== null && !this.debugWindow.closed;
  }

  /**
   * Open the debug window (or focus it if already open) and push the latest
   * story data to it.
   */
  open(storyData: SerializedStoryData): boolean {
    this.latestStoryData = storyData;

    if (this.isElectron) {
      const api = (window as any).electronAPI;
      try {
        api.debug.open();
        // Mark optimistically so subscribers get the open state; the actual
        // story-update push happens on `debug:ready` in the constructor.
        this.electronWindowOpen = true;
        this.notifyListeners();
        return true;
      } catch (err) {
        console.error('[DebugWindowManager] Electron open failed:', err);
        return false;
      }
    }

    if (this.isWindowOpen()) {
      this.debugWindow?.focus();
      this.sendStoryUpdate(storyData);
      return true;
    }

    // Default size — authors often park this on a second display, so we use
    // comfortable dimensions rather than matching the preview (1200x900).
    const width = 900;
    const height = 800;
    const left = window.screenX + window.outerWidth - width - 50;
    const top = window.screenY + 80;

    const features = `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes`;

    try {
      const url = `${window.location.origin}${window.location.pathname}#/debug-window`;
      this.debugWindow = window.open(url, 'asaps-debug', features);

      if (!this.debugWindow) {
        console.warn('[DebugWindowManager] Popup blocked — enable popups for this site');
        this.notifyListeners();
        return false;
      }

      this.startWindowCheck();
      this.notifyListeners();
      return true;
    } catch (error) {
      console.error('[DebugWindowManager] Failed to open debug window:', error);
      return false;
    }
  }

  close(): void {
    if (this.isElectron) {
      (window as any).electronAPI?.debug?.close?.();
      this.cleanup();
      return;
    }
    if (this.debugWindow && !this.debugWindow.closed) {
      this.debugWindow.close();
    }
    this.cleanup();
  }

  /**
   * Push an updated story to the debug window. Called from App.tsx whenever
   * the authored story changes so the analyzers stay in sync.
   */
  sendStoryUpdate(storyData: SerializedStoryData): void {
    this.latestStoryData = storyData;
    const message: DebugMessage = { type: 'STORY_UPDATE', payload: { storyData } };
    if (this.isElectron) {
      if (!this.electronWindowOpen) return;
      try {
        (window as any).electronAPI?.debug?.sendMessage?.(message);
      } catch (err) {
        console.error('[DebugWindowManager] Electron sendMessage failed:', err);
      }
      return;
    }
    if (!this.isWindowOpen() || !this.debugWindow) return;
    try {
      this.debugWindow.postMessage(message, window.location.origin);
    } catch (error) {
      console.error('[DebugWindowManager] Failed to send STORY_UPDATE:', error);
    }
  }

  private handleMessage = (event: MessageEvent): void => {
    if (event.origin !== window.location.origin) return;
    const message = event.data as DebugMessage;
    if (!message || typeof message.type !== 'string') return;

    switch (message.type) {
      case 'PING':
        // Debug window is ready — send the latest story.
        if (this.latestStoryData && this.debugWindow) {
          this.sendStoryUpdate(this.latestStoryData);
        }
        break;
      case 'HIGHLIGHT_PATH': {
        const beatIds = message.payload?.beatIds ?? [];
        this.highlightListeners.forEach(cb => cb({ kind: 'path', beatIds }));
        break;
      }
      case 'HIGHLIGHT_BEAT': {
        const beatId = message.payload?.beatId;
        if (beatId) this.highlightListeners.forEach(cb => cb({ kind: 'beat', beatId }));
        break;
      }
      case 'CLEAR_HIGHLIGHT':
        this.highlightListeners.forEach(cb => cb({ kind: 'clear' }));
        break;
    }
  };

  private startWindowCheck(): void {
    if (this.checkInterval) clearInterval(this.checkInterval);
    this.checkInterval = setInterval(() => {
      if (this.debugWindow && this.debugWindow.closed) this.cleanup();
    }, 500);
  }

  private cleanup(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.debugWindow = null;
    this.electronWindowOpen = false;
    this.notifyListeners();
    // Clear highlight so the flowchart doesn't keep showing stale yellow selection.
    this.highlightListeners.forEach(cb => cb({ kind: 'clear' }));
  }

  private notifyListeners(): void {
    const state = this.getState();
    this.listeners.forEach(cb => cb(state));
  }

  destroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('message', this.handleMessage);
    }
    this.close();
    this.listeners.clear();
    this.highlightListeners.clear();
  }
}

export const debugWindowManager = new DebugWindowManager();
export { DebugWindowManager };
