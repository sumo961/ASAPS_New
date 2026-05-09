/**
 * IdeatorWindowManager — opens the Ideator ideation pop-out and routes the
 * finished StoryGenerationRequest back to the main builder.
 *
 * Mirrors DebugWindowManager and PreviewWindowManager in shape: window.open
 * with a hash route, origin-checked postMessage, subscribers for state and
 * for the handoff event.
 */

import type {
  IdeatorWireMessage,
} from '../components/ai/ideator/types';
import type { StoryGenerationRequest } from '../types/ai';

export interface IdeatorWindowState {
  isOpen: boolean;
}

type StateChangeCallback = (state: IdeatorWindowState) => void;
type SubmitCallback = (request: StoryGenerationRequest) => void;

class IdeatorWindowManager {
  private ideatorWindow: Window | null = null;
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<StateChangeCallback>();
  private submitListeners = new Set<SubmitCallback>();

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('message', this.handleMessage);
    }
  }

  subscribe(callback: StateChangeCallback): () => void {
    this.listeners.add(callback);
    callback(this.getState());
    return () => this.listeners.delete(callback);
  }

  /**
   * Listen for the user's "Send to Story Generator" confirmation inside
   * the pop-out. App.tsx subscribes so it can call generateStory() and drop
   * the result on the canvas, just like the in-app Story Generator does.
   */
  onSubmit(callback: SubmitCallback): () => void {
    this.submitListeners.add(callback);
    return () => this.submitListeners.delete(callback);
  }

  getState(): IdeatorWindowState {
    return { isOpen: this.isWindowOpen() };
  }

  isWindowOpen(): boolean {
    return this.ideatorWindow !== null && !this.ideatorWindow.closed;
  }

  /**
   * Open the Ideator window (or focus it if already open). The project
   * title and id travel in the URL fragment so the pop-out can show
   * context and scope saved sessions to the right project without needing
   * a round-trip postMessage handshake.
   */
  open(opts: { projectTitle?: string; projectId?: string } = {}): boolean {
    if (this.isWindowOpen()) {
      this.ideatorWindow?.focus();
      return true;
    }

    const width = 720;
    const height = 800;
    const left = window.screenX + Math.max(60, window.outerWidth - width - 60);
    const top = window.screenY + 80;

    const features = `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes`;

    try {
      let hash = '#/ideator-window';
      const params = new URLSearchParams();
      if (opts.projectTitle) params.set('title', opts.projectTitle);
      if (opts.projectId) params.set('projectId', opts.projectId);
      const qs = params.toString();
      if (qs) hash += `?${qs}`;
      const url = `${window.location.origin}${window.location.pathname}${hash}`;
      this.ideatorWindow = window.open(url, 'asaps-ideator', features);

      if (!this.ideatorWindow) {
        console.warn(
          '[IdeatorWindowManager] Popup blocked — enable popups for this site'
        );
        this.notifyListeners();
        return false;
      }

      this.startWindowCheck();
      this.notifyListeners();
      return true;
    } catch (error) {
      console.error(
        '[IdeatorWindowManager] Failed to open ideator window:',
        error
      );
      return false;
    }
  }

  close(): void {
    if (this.ideatorWindow && !this.ideatorWindow.closed) {
      this.ideatorWindow.close();
    }
    this.cleanup();
  }

  /**
   * Tell the pop-out the story has finished generating so it can swap its
   * progress UI for the success card. No-op if the window has been closed.
   */
  notifyGenerationComplete(): void {
    this.postToWindow({ type: 'GENERATION_COMPLETE' });
  }

  /**
   * Tell the pop-out generation failed so it can drop back to the preview
   * pane with the error visible. No-op if the window has been closed.
   */
  notifyGenerationFailed(error: string): void {
    this.postToWindow({ type: 'GENERATION_FAILED', payload: { error } });
  }

  private postToWindow(message: IdeatorWireMessage): void {
    if (!this.isWindowOpen()) return;
    try {
      this.ideatorWindow!.postMessage(message, window.location.origin);
    } catch (err) {
      console.warn('[IdeatorWindowManager] postMessage to pop-out failed:', err);
    }
  }

  private handleMessage = (event: MessageEvent): void => {
    if (event.origin !== window.location.origin) return;
    const message = event.data as IdeatorWireMessage;
    if (!message || typeof message.type !== 'string') return;

    // Recover the pop-out reference from event.source whenever it arrives.
    // Critical if the main builder was hard-reloaded between opening the
    // Ideator and the pop-out posting back: our ideatorWindow ref was
    // wiped during the reload, but the pop-out still holds window.opener
    // and can reach us. Capturing event.source restores the back-channel
    // so notifyGenerationComplete / notifyGenerationFailed can land.
    if (
      event.source &&
      event.source !== window &&
      this.ideatorWindow !== event.source
    ) {
      this.ideatorWindow = event.source as Window;
      console.log('[IdeatorWindowManager] Recovered pop-out reference from event.source');
    }

    switch (message.type) {
      case 'SUBMIT_REQUEST': {
        const req = message.payload?.request;
        if (req && typeof req.prompt === 'string') {
          this.submitListeners.forEach(cb => cb(req));
        }
        break;
      }
      case 'PING':
        // Ideator window is up; nothing to send back for v1 since context
        // travels in the URL fragment. Hook reserved for future use.
        break;
    }
  };

  private startWindowCheck(): void {
    if (this.checkInterval) clearInterval(this.checkInterval);
    this.checkInterval = setInterval(() => {
      if (this.ideatorWindow && this.ideatorWindow.closed) this.cleanup();
    }, 500);
  }

  private cleanup(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.ideatorWindow = null;
    this.notifyListeners();
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
    this.submitListeners.clear();
  }
}

export const ideatorWindowManager = new IdeatorWindowManager();
export { IdeatorWindowManager };
