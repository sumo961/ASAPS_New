/**
 * CoDesignerWindowManager — opens the Co-Designer pop-out (design-phase
 * counterpart to the Ideator). Mirrors IdeatorWindowManager in shape.
 *
 * Data flow is simpler than the Ideator's: the story digest travels via
 * localStorage (written by App right before open; same-origin windows share
 * it in web AND Electron), so no postMessage/IPC payload channel is needed.
 * Only window lifecycle goes through IPC in Electron (open / close /
 * closed / ready), because Electron's setWindowOpenHandler denies
 * window.open.
 */

export interface CoDesignerWindowState {
  isOpen: boolean;
}

type StateChangeCallback = (state: CoDesignerWindowState) => void;

class CoDesignerWindowManager {
  private popoutWindow: Window | null = null;
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<StateChangeCallback>();
  private isElectron: boolean = false;
  private electronWindowOpen: boolean = false;

  constructor() {
    this.isElectron = typeof window !== 'undefined'
      && !!(window as any).electronAPI?.codesigner?.open;

    if (this.isElectron) {
      const api = (window as any).electronAPI;
      api.onCoDesignerClosed?.(() => this.cleanup());
      api.onCoDesignerReady?.(() => {
        this.electronWindowOpen = true;
        this.notifyListeners();
      });
    }
  }

  subscribe(callback: StateChangeCallback): () => void {
    this.listeners.add(callback);
    callback(this.getState());
    return () => this.listeners.delete(callback);
  }

  getState(): CoDesignerWindowState {
    return { isOpen: this.isWindowOpen() };
  }

  isWindowOpen(): boolean {
    if (this.isElectron) return this.electronWindowOpen;
    return this.popoutWindow !== null && !this.popoutWindow.closed;
  }

  /** Open the Co-Designer window (or focus it if already open). */
  open(opts: { projectTitle?: string } = {}): boolean {
    if (this.isElectron) {
      const api = (window as any).electronAPI;
      try {
        api.codesigner.open(opts);
        this.electronWindowOpen = true;
        this.notifyListeners();
        return true;
      } catch (err) {
        console.error('[CoDesignerWindowManager] Electron open failed:', err);
        return false;
      }
    }

    if (this.isWindowOpen()) {
      this.popoutWindow?.focus();
      return true;
    }

    const width = 720;
    const height = 800;
    const left = window.screenX + Math.max(60, window.outerWidth - width - 60);
    const top = window.screenY + 80;
    const features = `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes`;

    try {
      let hash = '#/co-designer-window';
      if (opts.projectTitle) {
        hash += `?title=${encodeURIComponent(opts.projectTitle)}`;
      }
      const url = `${window.location.origin}${window.location.pathname}${hash}`;
      this.popoutWindow = window.open(url, 'asaps-codesigner', features);

      if (!this.popoutWindow) {
        console.warn('[CoDesignerWindowManager] Popup blocked — enable popups for this site');
        this.notifyListeners();
        return false;
      }

      this.startWindowCheck();
      this.notifyListeners();
      return true;
    } catch (error) {
      console.error('[CoDesignerWindowManager] Failed to open window:', error);
      return false;
    }
  }

  close(): void {
    if (this.isElectron) {
      (window as any).electronAPI?.codesigner?.close?.();
      this.cleanup();
      return;
    }
    if (this.popoutWindow && !this.popoutWindow.closed) {
      this.popoutWindow.close();
    }
    this.cleanup();
  }

  private startWindowCheck(): void {
    if (this.checkInterval) clearInterval(this.checkInterval);
    this.checkInterval = setInterval(() => {
      if (this.popoutWindow && this.popoutWindow.closed) this.cleanup();
    }, 500);
  }

  private cleanup(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.popoutWindow = null;
    this.electronWindowOpen = false;
    this.notifyListeners();
  }

  private notifyListeners(): void {
    const state = this.getState();
    this.listeners.forEach(cb => cb(state));
  }

  destroy(): void {
    this.close();
    this.listeners.clear();
  }
}

export const coDesignerWindowManager = new CoDesignerWindowManager();
export { CoDesignerWindowManager };
