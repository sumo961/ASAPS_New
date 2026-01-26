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

  // Preview window operations
  preview: {
    open: () => ipcRenderer.invoke('preview:open'),
    close: () => ipcRenderer.invoke('preview:close'),
    isOpen: () => ipcRenderer.invoke('preview:is-open'),
    sendMessage: (message: any) => ipcRenderer.invoke('preview:send-message', message),
  },
  onPreviewMessage: (callback: (message: any) => void) => {
    const handler = (_: unknown, message: any) => callback(message);
    ipcRenderer.on('preview:message', handler);
    return () => ipcRenderer.removeListener('preview:message', handler);
  },
  onPreviewClosed: (callback: () => void) => {
    ipcRenderer.on('preview:closed', callback);
    return () => ipcRenderer.removeListener('preview:closed', callback);
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
      preview: {
        open: () => Promise<boolean>;
        close: () => Promise<boolean>;
        isOpen: () => Promise<boolean>;
        sendMessage: (message: any) => Promise<boolean>;
      };
      onPreviewMessage: (callback: (message: any) => void) => () => void;
      onPreviewClosed: (callback: () => void) => () => void;
      platform: NodeJS.Platform;
      isElectron: boolean;
    };
  }
}
