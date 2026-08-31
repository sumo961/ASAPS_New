import { contextBridge, ipcRenderer } from 'electron';
import { join } from 'path';

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Absolute file:// URL of the <webview> guest preload (webview-bridge.js,
  // built alongside this preload). WebViewElement sets it as the webview's
  // preload attribute so embedded pages' postMessage exit protocol reaches
  // the host (sendToHost relay) — without it, station-B-style exits only
  // work in browser iframes.
  webviewPreloadUrl: `file://${join(__dirname, 'webview-bridge.js')}`,
  // Filesystem operations
  fs: {
    readFile: (path: string) => ipcRenderer.invoke('fs:read-file', path),
    writeFile: (path: string, data: Buffer | string) =>
      ipcRenderer.invoke('fs:write-file', path, data),
    readDir: (path: string) => ipcRenderer.invoke('fs:read-dir', path),
    mkdir: (path: string) => ipcRenderer.invoke('fs:mkdir', path),
    exists: (path: string) => ipcRenderer.invoke('fs:exists', path),
    unlink: (path: string) => ipcRenderer.invoke('fs:unlink', path),
    copyFile: (src: string, dst: string) => ipcRenderer.invoke('fs:copy-file', src, dst),
    stat: (path: string) => ipcRenderer.invoke('fs:stat', path),
    watchDir: (path: string, callback: (changedFiles: string[]) => void) => {
      const handler = (_: unknown, files: string[]) => callback(files);
      ipcRenderer.on('fs:dir-changed', handler);
      ipcRenderer.invoke('fs:watch-dir', path);
      return () => {
        ipcRenderer.removeListener('fs:dir-changed', handler);
        ipcRenderer.invoke('fs:unwatch-dir');
      };
    },
    runCommand: (command: string, args: string[], cwd?: string, timeout?: number) =>
      ipcRenderer.invoke('fs:run-command', command, args, cwd, timeout),
  },

  // Dialog operations
  dialog: {
    open: (options: Electron.OpenDialogOptions) =>
      ipcRenderer.invoke('dialog:open', options),
    save: (options: Electron.SaveDialogOptions) =>
      ipcRenderer.invoke('dialog:save', options),
    message: (options: Electron.MessageBoxOptions) =>
      ipcRenderer.invoke('dialog:message', options),
  },

  // Shell operations
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
    showItemInFolder: (path: string) => ipcRenderer.invoke('shell:show-item-in-folder', path),
  },

  // App operations
  app: {
    getPath: (name: string) => ipcRenderer.invoke('app:get-path', name),
  },

  // API server operations
  apiServer: {
    getStatus: () => ipcRenderer.invoke('api-server:status'),
  },

  // Settings operations
  settings: {
    getMcpEnabled: () => ipcRenderer.invoke('settings:get-mcp-enabled'),
    setMcpEnabled: (enabled: boolean) => ipcRenderer.invoke('settings:set-mcp-enabled', enabled),
  },
  onMcpSettingChanged: (callback: (enabled: boolean) => void) => {
    const handler = (_: unknown, enabled: boolean) => callback(enabled);
    ipcRenderer.on('settings:mcp-changed', handler);
    return () => ipcRenderer.removeListener('settings:mcp-changed', handler);
  },

  // Menu events
  onMenuNewProject: (callback: () => void) => {
    ipcRenderer.on('menu:new-project', callback);
    return () => ipcRenderer.removeListener('menu:new-project', callback);
  },
  onMenuRevealProject: (callback: () => void) => {
    ipcRenderer.on('menu:reveal-project', callback);
    return () => ipcRenderer.removeListener('menu:reveal-project', callback);
  },
  onMenuSave: (callback: () => void) => {
    ipcRenderer.on('menu:save', callback);
    return () => ipcRenderer.removeListener('menu:save', callback);
  },
  onMenuUndo: (callback: () => void) => {
    ipcRenderer.on('menu:undo', callback);
    return () => ipcRenderer.removeListener('menu:undo', callback);
  },
  onMenuRedo: (callback: () => void) => {
    ipcRenderer.on('menu:redo', callback);
    return () => ipcRenderer.removeListener('menu:redo', callback);
  },
  onMenuStorySettings: (callback: () => void) => {
    ipcRenderer.on('menu:story-settings', callback);
    return () => ipcRenderer.removeListener('menu:story-settings', callback);
  },
  onMenuCharacters: (callback: () => void) => {
    ipcRenderer.on('menu:characters', callback);
    return () => ipcRenderer.removeListener('menu:characters', callback);
  },
  onMenuDebug: (callback: () => void) => {
    ipcRenderer.on('menu:debug', callback);
    return () => ipcRenderer.removeListener('menu:debug', callback);
  },
  onMenuExport: (callback: () => void) => {
    ipcRenderer.on('menu:export', callback);
    return () => ipcRenderer.removeListener('menu:export', callback);
  },
  onProjectOpen: (callback: (path: string) => void) => {
    const handler = (_: unknown, path: string) => callback(path);
    ipcRenderer.on('project:open', handler);
    return () => ipcRenderer.removeListener('project:open', handler);
  },
  /** Collect a file that was double-clicked before the renderer was
   *  listening (cold start on any platform). Call once, right after
   *  registering onProjectOpen; main clears the slot on read. */
  getPendingProjectOpen: (): Promise<string | null> =>
    ipcRenderer.invoke('project:get-pending-open'),
  onProjectSaveAs: (callback: (path: string) => void) => {
    const handler = (_: unknown, path: string) => callback(path);
    ipcRenderer.on('project:save-as', handler);
    return () => ipcRenderer.removeListener('project:save-as', handler);
  },
  onMenuAutoArrange: (callback: () => void) => {
    ipcRenderer.on('menu:auto-arrange', callback);
    return () => ipcRenderer.removeListener('menu:auto-arrange', callback);
  },
  onProjectOpenFolder: (callback: (path: string) => void) => {
    const handler = (_: unknown, path: string) => callback(path);
    ipcRenderer.on('project:open-folder', handler);
    return () => ipcRenderer.removeListener('project:open-folder', handler);
  },
  onProjectSaveAsFolder: (callback: (path: string) => void) => {
    const handler = (_: unknown, path: string) => callback(path);
    ipcRenderer.on('project:save-as-folder', handler);
    return () => ipcRenderer.removeListener('project:save-as-folder', handler);
  },

  // Preview window operations
  preview: {
    open: () => ipcRenderer.invoke('preview:open'),
    close: () => ipcRenderer.invoke('preview:close'),
    isOpen: () => ipcRenderer.invoke('preview:is-open'),
    sendMessage: (message: any) => ipcRenderer.invoke('preview:send-message', message),
    ping: () => ipcRenderer.send('preview:ping'),
    /** Called from the preview window to push arbitrary messages back to the
     *  main builder window (e.g. VISITED_BEATS_UPDATE for the live red trace). */
    sendToMain: (message: any) => ipcRenderer.send('preview:send-to-main', message),
  },
  onPreviewMessage: (callback: (message: any) => void) => {
    const handler = (_: unknown, message: any) => callback(message);
    ipcRenderer.on('preview:message', handler);
    return () => ipcRenderer.removeListener('preview:message', handler);
  },
  onPreviewReady: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('preview:ready', handler);
    return () => ipcRenderer.removeListener('preview:ready', handler);
  },
  onPreviewClosed: (callback: () => void) => {
    ipcRenderer.on('preview:closed', callback);
    return () => ipcRenderer.removeListener('preview:closed', callback);
  },
  /** Subscribe (from the MAIN builder window) to messages the preview window
   *  pushes back via preview.sendToMain. This is the counterpart to
   *  window.addEventListener('message') in the web build. */
  onPreviewMessageToMain: (callback: (message: any) => void) => {
    const handler = (_: unknown, message: any) => callback(message);
    ipcRenderer.on('preview:message-to-main', handler);
    return () => ipcRenderer.removeListener('preview:message-to-main', handler);
  },

  // Debug window operations (pop-out Story Debug Tools). Mirrors `preview`.
  debug: {
    open: () => ipcRenderer.invoke('debug:open'),
    close: () => ipcRenderer.invoke('debug:close'),
    isOpen: () => ipcRenderer.invoke('debug:is-open'),
    sendMessage: (message: any) => ipcRenderer.invoke('debug:send-message', message),
    ping: () => ipcRenderer.send('debug:ping'),
    sendToMain: (message: any) => ipcRenderer.send('debug:send-to-main', message),
  },
  onDebugMessage: (callback: (message: any) => void) => {
    const handler = (_: unknown, message: any) => callback(message);
    ipcRenderer.on('debug:message', handler);
    return () => ipcRenderer.removeListener('debug:message', handler);
  },
  onDebugReady: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('debug:ready', handler);
    return () => ipcRenderer.removeListener('debug:ready', handler);
  },
  onDebugClosed: (callback: () => void) => {
    ipcRenderer.on('debug:closed', callback);
    return () => ipcRenderer.removeListener('debug:closed', callback);
  },
  onDebugMessageToMain: (callback: (message: any) => void) => {
    const handler = (_: unknown, message: any) => callback(message);
    ipcRenderer.on('debug:message-to-main', handler);
    return () => ipcRenderer.removeListener('debug:message-to-main', handler);
  },

  // Start Window — the Electron launch screen. Lives in its own
  // BrowserWindow, opened by main at app `ready` instead of the
  // editor. The page (StartWindow.tsx) calls `start.pick(intent)` to
  // hand off the user's choice; main opens the editor with the
  // intent encoded as URL params and closes the start window.
  start: {
    open: () => ipcRenderer.invoke('start:open'),
    close: () => ipcRenderer.invoke('start:close'),
    isOpen: () => ipcRenderer.invoke('start:is-open'),
    pick: (intent: Record<string, string> = {}) =>
      ipcRenderer.invoke('start:pick', intent),
    /** Main sends an intent to the running editor when the user
     *  picks a project / create path from the start window (opened
     *  via "Browse all projects" while the editor was already up).
     *  Returns an unsubscribe function. */
    onApplyIntent: (callback: (intent: Record<string, string>) => void) => {
      const handler = (_: unknown, intent: Record<string, string>) => callback(intent);
      ipcRenderer.on('start:apply-intent', handler);
      return () => ipcRenderer.removeListener('start:apply-intent', handler);
    },
  },

  // Ideator window operations (pop-out conversational ideation tool).
  // Mirrors `preview` and `debug`. The pop-out is opened by the main builder
  // via IPC (since Electron's setWindowOpenHandler denies window.open),
  // exchanges JSON-shaped wire messages defined in
  // packages/builder/src/components/ai/ideator/types.ts.
  codesigner: {
    open: (options: { projectTitle?: string } = {}) =>
      ipcRenderer.invoke('codesigner:open', options),
    close: () => ipcRenderer.invoke('codesigner:close'),
    isOpen: () => ipcRenderer.invoke('codesigner:is-open'),
    ping: () => ipcRenderer.send('codesigner:ping'),
    sendMessage: (message: any) => ipcRenderer.invoke('codesigner:send-message', message),
    sendToMain: (message: any) => ipcRenderer.send('codesigner:send-to-main', message),
  },
  onCoDesignerMessage: (callback: (message: any) => void) => {
    const handler = (_: unknown, message: any) => callback(message);
    ipcRenderer.on('codesigner:message', handler);
    return () => ipcRenderer.removeListener('codesigner:message', handler);
  },
  onCoDesignerMessageToMain: (callback: (message: any) => void) => {
    const handler = (_: unknown, message: any) => callback(message);
    ipcRenderer.on('codesigner:message-to-main', handler);
    return () => ipcRenderer.removeListener('codesigner:message-to-main', handler);
  },
  onCoDesignerReady: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('codesigner:ready', handler);
    return () => ipcRenderer.removeListener('codesigner:ready', handler);
  },
  onCoDesignerClosed: (callback: () => void) => {
    ipcRenderer.on('codesigner:closed', callback);
    return () => ipcRenderer.removeListener('codesigner:closed', callback);
  },
  ideator: {
    open: (options: { projectTitle?: string; projectId?: string } = {}) =>
      ipcRenderer.invoke('ideator:open', options),
    close: () => ipcRenderer.invoke('ideator:close'),
    isOpen: () => ipcRenderer.invoke('ideator:is-open'),
    sendMessage: (message: any) => ipcRenderer.invoke('ideator:send-message', message),
    ping: () => ipcRenderer.send('ideator:ping'),
    /** Called from the ideator pop-out to push the synthesized
     *  StoryGenerationRequest (and any future replies) back to the
     *  main builder. The renderer-side IdeatorWindowManager listens
     *  via onIdeatorMessageToMain. */
    sendToMain: (message: any) => ipcRenderer.send('ideator:send-to-main', message),
  },
  onIdeatorMessage: (callback: (message: any) => void) => {
    const handler = (_: unknown, message: any) => callback(message);
    ipcRenderer.on('ideator:message', handler);
    return () => ipcRenderer.removeListener('ideator:message', handler);
  },
  onIdeatorReady: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('ideator:ready', handler);
    return () => ipcRenderer.removeListener('ideator:ready', handler);
  },
  onIdeatorClosed: (callback: () => void) => {
    ipcRenderer.on('ideator:closed', callback);
    return () => ipcRenderer.removeListener('ideator:closed', callback);
  },
  onIdeatorMessageToMain: (callback: (message: any) => void) => {
    const handler = (_: unknown, message: any) => callback(message);
    ipcRenderer.on('ideator:message-to-main', handler);
    return () => ipcRenderer.removeListener('ideator:message-to-main', handler);
  },

  // Story injection from MCP server
  onStoryInject: (callback: (data: any) => void) => {
    const handler = (_: unknown, data: any) => callback(data);
    ipcRenderer.on('story:inject', handler);
    return () => ipcRenderer.removeListener('story:inject', handler);
  },

  // VCS menu events
  onVCSTrackVersions: (callback: () => void) => {
    ipcRenderer.on('vcs:track-versions', callback);
    return () => ipcRenderer.removeListener('vcs:track-versions', callback);
  },
  onVCSCommit: (callback: () => void) => {
    ipcRenderer.on('vcs:commit', callback);
    return () => ipcRenderer.removeListener('vcs:commit', callback);
  },
  onVCSPush: (callback: () => void) => {
    ipcRenderer.on('vcs:push', callback);
    return () => ipcRenderer.removeListener('vcs:push', callback);
  },
  onVCSPull: (callback: () => void) => {
    ipcRenderer.on('vcs:pull', callback);
    return () => ipcRenderer.removeListener('vcs:pull', callback);
  },
  onVCSStash: (callback: () => void) => {
    ipcRenderer.on('vcs:stash', callback);
    return () => ipcRenderer.removeListener('vcs:stash', callback);
  },
  onVCSStashPop: (callback: () => void) => {
    ipcRenderer.on('vcs:stash-pop', callback);
    return () => ipcRenderer.removeListener('vcs:stash-pop', callback);
  },
  onVCSTogglePanel: (callback: () => void) => {
    ipcRenderer.on('vcs:toggle-panel', callback);
    return () => ipcRenderer.removeListener('vcs:toggle-panel', callback);
  },
  onVCSRefresh: (callback: () => void) => {
    ipcRenderer.on('vcs:refresh', callback);
    return () => ipcRenderer.removeListener('vcs:refresh', callback);
  },

  // Clone repository menu event
  onMenuCloneRepo: (callback: () => void) => {
    ipcRenderer.on('menu:clone-repo', callback);
    return () => ipcRenderer.removeListener('menu:clone-repo', callback);
  },
  // New GitHub project menu event
  onMenuNewGitHubProject: (callback: () => void) => {
    ipcRenderer.on('menu:new-github-project', callback);
    return () => ipcRenderer.removeListener('menu:new-github-project', callback);
  },

  // Streaming command runner (for `gh auth login`-style flows)
  vcs: {
    runStreaming: (streamId: string, command: string, args: string[], cwd?: string) =>
      ipcRenderer.invoke('vcs:run-streaming', streamId, command, args, cwd),
    cancelStream: (streamId: string) =>
      ipcRenderer.invoke('vcs:stream-cancel', streamId),
    onStreamData: (callback: (payload: { streamId: string; channel: 'stdout' | 'stderr'; data: string }) => void) => {
      const listener = (_: unknown, payload: { streamId: string; channel: 'stdout' | 'stderr'; data: string }) => callback(payload);
      ipcRenderer.on('vcs:stream-data', listener);
      return () => ipcRenderer.removeListener('vcs:stream-data', listener);
    },
    onStreamEnd: (callback: (payload: { streamId: string; exitCode: number; error?: string }) => void) => {
      const listener = (_: unknown, payload: { streamId: string; exitCode: number; error?: string }) => callback(payload);
      ipcRenderer.on('vcs:stream-end', listener);
      return () => ipcRenderer.removeListener('vcs:stream-end', listener);
    },
  },

  // Platform info
  platform: process.platform,
  isElectron: true,
});

// Type declarations for the exposed API
declare global {
  interface Window {
    electronAPI: {
      fs: {
        readFile: (path: string) => Promise<Buffer>;
        writeFile: (path: string, data: Buffer | string) => Promise<void>;
        readDir: (path: string) => Promise<{ name: string; isDirectory: () => boolean }[]>;
        mkdir: (path: string) => Promise<void>;
        exists: (path: string) => Promise<boolean>;
        unlink: (path: string) => Promise<void>;
        copyFile: (src: string, dst: string) => Promise<void>;
        stat: (path: string) => Promise<{ size: number; mtime: string; isDirectory: boolean }>;
        watchDir: (path: string, callback: (changedFiles: string[]) => void) => () => void;
        runCommand: (command: string, args: string[], cwd?: string, timeout?: number) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
      };
      dialog: {
        open: (options: Electron.OpenDialogOptions) => Promise<Electron.OpenDialogReturnValue>;
        save: (options: Electron.SaveDialogOptions) => Promise<Electron.SaveDialogReturnValue>;
        message: (options: Electron.MessageBoxOptions) => Promise<Electron.MessageBoxReturnValue>;
      };
      shell: {
        openExternal: (url: string) => Promise<void>;
      };
      app: {
        getPath: (name: string) => Promise<string>;
      };
      apiServer: {
        getStatus: () => Promise<{ running: boolean; port: number; host: string }>;
      };
      settings: {
        getMcpEnabled: () => Promise<boolean>;
        setMcpEnabled: (enabled: boolean) => Promise<boolean>;
      };
      onMcpSettingChanged: (callback: (enabled: boolean) => void) => () => void;
      onMenuNewProject: (callback: () => void) => () => void;
      onMenuSave: (callback: () => void) => () => void;
      onMenuUndo?: (callback: () => void) => () => void;
      onMenuRedo?: (callback: () => void) => () => void;
      onMenuStorySettings?: (callback: () => void) => () => void;
      onMenuCharacters?: (callback: () => void) => () => void;
      onMenuDebug?: (callback: () => void) => () => void;
      onMenuExport: (callback: () => void) => () => void;
      onMenuAutoArrange: (callback: () => void) => () => void;
      onProjectOpen: (callback: (path: string) => void) => () => void;
      onProjectSaveAs: (callback: (path: string) => void) => () => void;
      onProjectOpenFolder: (callback: (path: string) => void) => () => void;
      onProjectSaveAsFolder: (callback: (path: string) => void) => () => void;
      preview: {
        open: () => Promise<boolean>;
        close: () => Promise<boolean>;
        isOpen: () => Promise<boolean>;
        sendMessage: (message: any) => Promise<boolean>;
        ping: () => void;
        sendToMain: (message: any) => void;
      };
      onPreviewMessage: (callback: (message: any) => void) => () => void;
      onPreviewReady: (callback: () => void) => () => void;
      onPreviewClosed: (callback: () => void) => () => void;
      onPreviewMessageToMain: (callback: (message: any) => void) => () => void;
      debug: {
        open: () => Promise<boolean>;
        close: () => Promise<boolean>;
        isOpen: () => Promise<boolean>;
        sendMessage: (message: any) => Promise<boolean>;
        ping: () => void;
        sendToMain: (message: any) => void;
      };
      onDebugMessage: (callback: (message: any) => void) => () => void;
      onDebugReady: (callback: () => void) => () => void;
      onDebugClosed: (callback: () => void) => () => void;
      onDebugMessageToMain: (callback: (message: any) => void) => () => void;
      onStoryInject: (callback: (data: any) => void) => () => void;
      onVCSTrackVersions?: (callback: () => void) => () => void;
      onVCSCommit: (callback: () => void) => () => void;
      onVCSPush: (callback: () => void) => () => void;
      onVCSPull: (callback: () => void) => () => void;
      onVCSStash: (callback: () => void) => () => void;
      onVCSStashPop: (callback: () => void) => () => void;
      onVCSTogglePanel: (callback: () => void) => () => void;
      onVCSRefresh: (callback: () => void) => () => void;
      onMenuCloneRepo: (callback: () => void) => () => void;
      onMenuNewGitHubProject: (callback: () => void) => () => void;
      vcs: {
        runStreaming: (streamId: string, command: string, args: string[], cwd?: string) => Promise<{ ok: boolean; error?: string }>;
        cancelStream: (streamId: string) => Promise<{ ok: boolean }>;
        onStreamData: (callback: (payload: { streamId: string; channel: 'stdout' | 'stderr'; data: string }) => void) => () => void;
        onStreamEnd: (callback: (payload: { streamId: string; exitCode: number; error?: string }) => void) => () => void;
      };
      platform: NodeJS.Platform;
      isElectron: boolean;
    };
  }
}
