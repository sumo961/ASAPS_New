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

import type {
  ChangeProposal,
  CoDesignerWireMessage,
  ProposalApplyResult,
} from '../components/ai/codesigner/types';

export interface CoDesignerWindowState {
  isOpen: boolean;
}

type StateChangeCallback = (state: CoDesignerWindowState) => void;
type ApplyCallback = (proposals: ChangeProposal[], title?: string, projectId?: string) => void;
type ContextRequestCallback = () => void;
type BeatContentRequestCallback = (requestId: string, beatId: string) => void;
type PreviewRequestCallback = (requestId: string, proposals: ChangeProposal[], projectId?: string) => void;

class CoDesignerWindowManager {
  private popoutWindow: Window | null = null;
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<StateChangeCallback>();
  private applyListeners = new Set<ApplyCallback>();
  private contextRequestListeners = new Set<ContextRequestCallback>();
  private beatContentListeners = new Set<BeatContentRequestCallback>();
  private previewListeners = new Set<PreviewRequestCallback>();
  private isElectron: boolean = false;
  private electronWindowOpen: boolean = false;

  constructor() {
    this.isElectron = typeof window !== 'undefined'
      && !!(window as any).electronAPI?.codesigner?.open;

    if (typeof window !== 'undefined' && !this.isElectron) {
      window.addEventListener('message', this.handleMessage);
    }

    if (this.isElectron) {
      const api = (window as any).electronAPI;
      api.onCoDesignerClosed?.(() => this.cleanup());
      api.onCoDesignerReady?.(() => {
        this.electronWindowOpen = true;
        this.notifyListeners();
      });
      // Pop-out → main messages (APPLY_PROPOSALS). Synthesized into a
      // MessageEvent-shaped object so handleMessage works unchanged.
      api.onCoDesignerMessageToMain?.((message: any) => {
        this.handleMessage({
          origin: typeof window !== 'undefined' ? window.location.origin : '',
          data: message,
          source: null,
        } as MessageEvent);
      });
    }
  }

  /**
   * App subscribes: selected proposals arriving from the pop-out land here
   * for validation + undoable application against live story state.
   */
  onApply(callback: ApplyCallback): () => void {
    this.applyListeners.add(callback);
    return () => this.applyListeners.delete(callback);
  }

  /** Report per-proposal outcomes back to the pop-out's chat log. */
  notifyApplyResult(results: ProposalApplyResult[]): void {
    this.postToWindow({ type: 'APPLY_RESULT', payload: { results } });
  }

  /** App subscribes: the pop-out asked for a fresh story snapshot. */
  onContextRequest(callback: ContextRequestCallback): () => void {
    this.contextRequestListeners.add(callback);
    return () => this.contextRequestListeners.delete(callback);
  }

  /** Tell the pop-out a fresh snapshot has been written to localStorage. */
  notifyContextUpdated(): void {
    this.postToWindow({ type: 'CONTEXT_UPDATED' });
  }

  /** App subscribes: the pop-out's get_beat_content tool wants full beat data. */
  onBeatContentRequest(callback: BeatContentRequestCallback): () => void {
    this.beatContentListeners.add(callback);
    return () => this.beatContentListeners.delete(callback);
  }

  /** Answer a get_beat_content round-trip. */
  notifyBeatContent(payload: { requestId: string; beatId: string; content?: string; error?: string }): void {
    this.postToWindow({ type: 'BEAT_CONTENT', payload });
  }

  /** App subscribes: the pop-out wants CURRENT values for a proposal batch (old→new diff). */
  onPreviewRequest(callback: PreviewRequestCallback): () => void {
    this.previewListeners.add(callback);
    return () => this.previewListeners.delete(callback);
  }

  /** Answer a proposal-preview round-trip. */
  notifyProposalPreview(payload: { requestId: string; entries: Array<{ index: number; current: string | null; error?: string }> }): void {
    this.postToWindow({ type: 'PROPOSAL_PREVIEW', payload });
  }

  private postToWindow(message: CoDesignerWireMessage): void {
    if (!this.isWindowOpen()) return;
    if (this.isElectron) {
      try {
        (window as any).electronAPI?.codesigner?.sendMessage?.(message);
      } catch (err) {
        console.warn('[CoDesignerWindowManager] Electron sendMessage failed:', err);
      }
      return;
    }
    try {
      this.popoutWindow!.postMessage(message, window.location.origin);
    } catch (err) {
      console.warn('[CoDesignerWindowManager] postMessage to pop-out failed:', err);
    }
  }

  private handleMessage = (event: MessageEvent): void => {
    if (event.origin !== window.location.origin) return;
    const message = event.data as CoDesignerWireMessage;
    if (!message || typeof message.type !== 'string') return;

    // Recover the pop-out reference from event.source (survives a main-
    // window reload) — ONLY for the Co-Designer's own message types.
    // Other pop-outs (Preview, Ideator) post to the same main window;
    // capturing on any message poisoned this ref with foreign windows.
    if (
      (message.type === 'APPLY_PROPOSALS' || message.type === 'REQUEST_CONTEXT' || message.type === 'GET_BEAT_CONTENT' || message.type === 'PREVIEW_PROPOSALS') &&
      event.source &&
      event.source !== window &&
      this.popoutWindow !== event.source
    ) {
      this.popoutWindow = event.source as Window;
    }

    if (message.type === 'APPLY_PROPOSALS') {
      const proposals = message.payload?.proposals;
      if (Array.isArray(proposals) && proposals.length > 0) {
        this.applyListeners.forEach(cb =>
          cb(proposals, message.payload?.title, message.payload?.projectId)
        );
      }
    } else if (message.type === 'REQUEST_CONTEXT') {
      this.contextRequestListeners.forEach(cb => cb());
    } else if (message.type === 'GET_BEAT_CONTENT') {
      const { requestId, beatId } = message.payload || ({} as any);
      if (requestId && beatId) {
        this.beatContentListeners.forEach(cb => cb(requestId, beatId));
      }
    } else if (message.type === 'PREVIEW_PROPOSALS') {
      const { requestId, proposals, projectId } = message.payload || ({} as any);
      if (requestId && Array.isArray(proposals)) {
        this.previewListeners.forEach(cb => cb(requestId, proposals, projectId));
      }
    }
  };

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
    if (typeof window !== 'undefined') {
      window.removeEventListener('message', this.handleMessage);
    }
    this.close();
    this.listeners.clear();
    this.applyListeners.clear();
    this.contextRequestListeners.clear();
    this.beatContentListeners.clear();
    this.previewListeners.clear();
  }
}

export const coDesignerWindowManager = new CoDesignerWindowManager();
export { CoDesignerWindowManager };
