import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
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
  onMenuSave: (callback: () => void) => {
    ipcRenderer.on('menu:save', callback);
    return () => ipcRenderer.removeListener('menu:save', callback);
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

  // Story injection from MCP server
  onStoryInject: (callback: (data: any) => void) => {
    const handler = (_: unknown, data: any) => callback(data);
    ipcRenderer.on('story:inject', handler);
    return () => ipcRenderer.removeListener('story:inject', handler);
  },

  // VCS menu events
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
      };
      onPreviewMessage: (callback: (message: any) => void) => () => void;
      onPreviewReady: (callback: () => void) => () => void;
      onPreviewClosed: (callback: () => void) => () => void;
      onStoryInject: (callback: (data: any) => void) => () => void;
      onVCSCommit: (callback: () => void) => () => void;
      onVCSPush: (callback: () => void) => () => void;
      onVCSPull: (callback: () => void) => () => void;
      onVCSStash: (callback: () => void) => () => void;
      onVCSStashPop: (callback: () => void) => () => void;
      onVCSTogglePanel: (callback: () => void) => () => void;
      onVCSRefresh: (callback: () => void) => () => void;
      onMenuCloneRepo: (callback: () => void) => () => void;
      platform: NodeJS.Platform;
      isElectron: boolean;
    };
  }
}
