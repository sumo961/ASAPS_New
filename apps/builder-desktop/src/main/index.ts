import { app, BrowserWindow, ipcMain, dialog, Menu, shell } from 'electron';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import * as fs from 'fs/promises';
import { getEmbeddedAPIServer, setStoryInjectionCallback } from './api-server';
import { autoUpdater, type UpdateInfo } from 'electron-updater';
import { startWatching, stopWatching } from './fileWatcher';
import { execFile, spawn } from 'child_process';

// Suppress EPIPE errors from console.log when stdout/stderr pipes are closed
// (common when the launching terminal is closed while the app keeps running)
process.stdout?.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EPIPE') return;
  throw err;
});
process.stderr?.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EPIPE') return;
  throw err;
});

// Track if we're in the process of installing an update
let isUpdating = false;

// Get the API server instance
const apiServer = getEmbeddedAPIServer({ port: 3001, host: 'localhost' });

// Handle creating/removing shortcuts on Windows when installing/uninstalling
try {
  if (require('electron-squirrel-startup')) {
    app.quit();
  }
} catch {
  // electron-squirrel-startup not installed, ignore (only needed for Windows installers)
}

// Enforce single instance — prevent duplicate windows on install/update
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  // Another instance is already running — quit this one
  app.quit();
} else {
  app.on('second-instance', (_event, _commandLine, _workingDirectory) => {
    // Someone tried to launch a second instance — focus the existing window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// App settings management
interface AppSettings {
  mcpEnabled: boolean;
  autoUpdateEnabled: boolean;
}

const defaultSettings: AppSettings = {
  mcpEnabled: false,
  autoUpdateEnabled: true,  // Enabled by default
};

function getSettingsPath(): string {
  return join(app.getPath('userData'), 'app-settings.json');
}

function loadAppSettings(): AppSettings {
  try {
    const settingsPath = getSettingsPath();
    if (existsSync(settingsPath)) {
      const data = readFileSync(settingsPath, 'utf-8');
      return { ...defaultSettings, ...JSON.parse(data) };
    }
  } catch (error) {
    console.error('[Main] Failed to load app settings:', error);
  }
  return { ...defaultSettings };
}

function saveAppSettings(settings: AppSettings): void {
  try {
    const settingsPath = getSettingsPath();
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    console.log('[Main] App settings saved:', settings);
  } catch (error) {
    console.error('[Main] Failed to save app settings:', error);
  }
}

let appSettings = loadAppSettings();

// Auto-updater setup
function setupAutoUpdater(): void {
  // Don't check for updates in dev mode
  if (!app.isPackaged) {
    console.log('[AutoUpdater] Skipping - not packaged (dev mode)');
    return;
  }

  // Configure auto-updater
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  // Event: Update available
  autoUpdater.on('update-available', (info: UpdateInfo) => {
    console.log('[AutoUpdater] Update available:', info.version);

    // On macOS, skip download and go straight to releases page (download often fails for unsigned apps)
    if (process.platform === 'darwin') {
      dialog.showMessageBox(mainWindow!, {
        type: 'info',
        title: 'Update Available',
        message: `A new version (${info.version}) is available!`,
        detail: 'Click "Download Update" to open the releases page and download the latest DMG.',
        buttons: ['Download Update', 'Later'],
        defaultId: 0,
        cancelId: 1,
      }).then((result) => {
        if (result.response === 0) {
          const releaseUrl = `https://github.com/sumo961/ASAPS_New/releases/tag/v${info.version}`;
          console.log('[AutoUpdater] Opening release page:', releaseUrl);
          shell.openExternal(releaseUrl);
        }
      });
    } else {
      // On Windows, use the built-in download mechanism
      dialog.showMessageBox(mainWindow!, {
        type: 'info',
        title: 'Update Available',
        message: `A new version (${info.version}) is available!`,
        detail: 'Would you like to download it now?',
        buttons: ['Download Now', 'Later'],
        defaultId: 0,
        cancelId: 1,
      }).then((result) => {
        if (result.response === 0) {
          autoUpdater.downloadUpdate();
        }
      });
    }
  });

  // Event: Update not available
  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    console.log('[AutoUpdater] No update available, current version is latest:', info.version);
  });

  // Event: Download progress
  autoUpdater.on('download-progress', (progress) => {
    console.log(`[AutoUpdater] Download progress: ${Math.round(progress.percent)}%`);
    mainWindow?.webContents.send('update:download-progress', progress);
  });

  // Event: Update downloaded
  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    console.log('[AutoUpdater] Update downloaded:', info.version);

    // On macOS, quitAndInstall doesn't work reliably for unsigned apps
    // Instead, open the releases page for manual download
    if (process.platform === 'darwin') {
      dialog.showMessageBox(mainWindow!, {
        type: 'info',
        title: 'Update Ready',
        message: `Version ${info.version} is ready to install!`,
        detail: 'Due to macOS security restrictions, please download the new version manually.\n\nClick "Open Downloads" to get the latest DMG, then drag it to your Applications folder to replace this version.',
        buttons: ['Open Downloads', 'Later'],
        defaultId: 0,
        cancelId: 1,
      }).then((result) => {
        if (result.response === 0) {
          // Open the GitHub releases page for the specific version
          const releaseUrl = `https://github.com/sumo961/ASAPS_New/releases/tag/v${info.version}`;
          console.log('[AutoUpdater] Opening release page:', releaseUrl);
          shell.openExternal(releaseUrl);
        }
      });
    } else {
      // On Windows, quitAndInstall works fine
      dialog.showMessageBox(mainWindow!, {
        type: 'info',
        title: 'Update Ready',
        message: 'Update downloaded successfully!',
        detail: 'The update will be installed when you restart the app. Would you like to restart now?',
        buttons: ['Restart Now', 'Later'],
        defaultId: 0,
        cancelId: 1,
      }).then((result) => {
        if (result.response === 0) {
          console.log('[AutoUpdater] User chose to restart now');
          isUpdating = true;
          autoUpdater.quitAndInstall(true, true);
        }
      });
    }
  });

  // Event: Error
  autoUpdater.on('error', (error) => {
    console.error('[AutoUpdater] Error:', error.message);

    // Silently ignore ENOENT errors (e.g., missing app-update.yml in --dir builds)
    if (error.message?.includes('ENOENT') || error.message?.includes('app-update.yml')) {
      console.log('[AutoUpdater] Ignoring file-not-found error (expected for unpacked builds)');
      return;
    }

    // Show error to user with option to manually download
    dialog.showMessageBox(mainWindow!, {
      type: 'error',
      title: 'Update Error',
      message: 'Failed to download update',
      detail: `${error.message}\n\nYou can download the update manually from the releases page.`,
      buttons: ['Open Releases Page', 'OK'],
      defaultId: 0,
      cancelId: 1,
    }).then((result) => {
      if (result.response === 0) {
        shell.openExternal('https://github.com/sumo961/ASAPS_New/releases/latest');
      }
    });
  });

  // Log when update is being installed
  autoUpdater.on('before-quit-for-update', () => {
    console.log('[AutoUpdater] Quitting for update installation...');
    isUpdating = true;
  });

  // Delay initial check by 5 seconds to not slow startup
  if (appSettings.autoUpdateEnabled) {
    setTimeout(() => {
      console.log('[AutoUpdater] Checking for updates...');
      autoUpdater.checkForUpdates().catch((err) => {
        console.error('[AutoUpdater] Check failed:', err);
      });
    }, 5000);
  }
}

// Manual update check
function checkForUpdatesManually(): void {
  if (!app.isPackaged) {
    dialog.showMessageBox(mainWindow!, {
      type: 'info',
      title: 'Update Check',
      message: 'Updates are not available in development mode.',
    });
    return;
  }

  autoUpdater.checkForUpdates().then((result) => {
    if (!result || !result.updateInfo) {
      dialog.showMessageBox(mainWindow!, {
        type: 'info',
        title: 'No Updates',
        message: 'You are already running the latest version.',
      });
    }
  }).catch((err) => {
    console.error('[AutoUpdater] Manual check failed:', err);
    dialog.showMessageBox(mainWindow!, {
      type: 'error',
      title: 'Update Check Failed',
      message: 'Failed to check for updates. Please try again later.',
      detail: err.message,
    });
  });
}

let mainWindow: BrowserWindow | null = null;
let startWindow: BrowserWindow | null = null;
let previewWindow: BrowserWindow | null = null;
let debugWindow: BrowserWindow | null = null;
let ideatorWindow: BrowserWindow | null = null;
let codesignerWindow: BrowserWindow | null = null;
let currentProjectPath: string | null = null;

function createWindow(intent?: Record<string, string>): void {
  // If a previous editor window is still around (e.g. user picked
  // from the start window while editor was running), just focus it.
  // Multi-window-editor support comes in a later phase.
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
    return;
  }
  mainWindow = new BrowserWindow({
    width: 1800,
    height: 950,
    minWidth: 1550,
    minHeight: 800,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 16 },
    show: false,
  });

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Encode the start-window intent as a query string. The editor's
  // boot logic reads these params and routes to the right surface
  // (open project, new-project dialog, story generator, ideator).
  const params = new URLSearchParams(intent || {});
  const query = params.toString();
  const suffix = query ? `?${query}` : '';

  // Load the app
  // In development, load from the builder's dev server (port 5173)
  // In production, load the builder's built files copied to resources
  if (process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL) {
    const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    mainWindow.loadURL(`${devUrl}${suffix}`);
    mainWindow.webContents.openDevTools();
  } else {
    // In production, the builder's dist is copied to app.asar/builder
    // Electron's loadFile + query string: append manually as search.
    mainWindow.loadFile(join(__dirname, '../../builder/index.html'), {
      search: query || undefined,
    });
  }

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ============================================================================
// Start Window — the Electron launch screen. Opened first at app
// `ready` instead of the editor; user picks a project / create path
// and the start window IPCs the intent to main, which opens the
// editor with the encoded intent and closes the start window.
// ============================================================================
function createStartWindow(): void {
  if (startWindow && !startWindow.isDestroyed()) {
    startWindow.focus();
    return;
  }

  startWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 16 },
    title: 'ASAPS Builder',
    show: false,
  });

  startWindow.once('ready-to-show', () => {
    startWindow?.show();
  });

  if (process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL) {
    const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    startWindow.loadURL(`${devUrl}#/start-window`);
  } else {
    startWindow.loadFile(join(__dirname, '../../builder/index.html'), {
      hash: '/start-window',
    });
  }

  startWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  startWindow.on('closed', () => {
    startWindow = null;
  });
}

// Create application menu
function createMenu(): void {
  const isMac = process.platform === 'darwin';

  const template: Electron.MenuItemConstructorOptions[] = [
    // App menu (macOS only)
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              {
                id: 'mcp-toggle',
                label: 'Enable MCP Integration',
                type: 'checkbox' as const,
                checked: appSettings.mcpEnabled,
                click: (menuItem: Electron.MenuItem) => {
                  appSettings.mcpEnabled = menuItem.checked;
                  saveAppSettings(appSettings);
                  mainWindow?.webContents.send('settings:mcp-changed', appSettings.mcpEnabled);
                },
              },
              {
                id: 'auto-update-toggle',
                label: 'Check for Updates Automatically',
                type: 'checkbox' as const,
                checked: appSettings.autoUpdateEnabled,
                click: (menuItem: Electron.MenuItem) => {
                  appSettings.autoUpdateEnabled = menuItem.checked;
                  saveAppSettings(appSettings);
                },
              },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : [
          // Settings menu for Windows/Linux
          {
            label: 'Settings',
            submenu: [
              {
                id: 'mcp-toggle',
                label: 'Enable MCP Integration',
                type: 'checkbox' as const,
                checked: appSettings.mcpEnabled,
                click: (menuItem: Electron.MenuItem) => {
                  appSettings.mcpEnabled = menuItem.checked;
                  saveAppSettings(appSettings);
                  mainWindow?.webContents.send('settings:mcp-changed', appSettings.mcpEnabled);
                },
              },
              {
                id: 'auto-update-toggle',
                label: 'Check for Updates Automatically',
                type: 'checkbox' as const,
                checked: appSettings.autoUpdateEnabled,
                click: (menuItem: Electron.MenuItem) => {
                  appSettings.autoUpdateEnabled = menuItem.checked;
                  saveAppSettings(appSettings);
                },
              },
            ],
          },
        ]),

    // File menu
    {
      label: 'File',
      submenu: [
        {
          label: 'New Project',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow?.webContents.send('menu:new-project'),
        },
        {
          label: 'Open Project...',
          accelerator: 'CmdOrCtrl+O',
          click: () => handleOpenProject(),
        },
        {
          label: 'Open Project Folder (VCS)...',
          click: () => handleOpenProjectFolder(),
        },
        {
          label: 'Open Project from GitHub...',
          click: () => mainWindow?.webContents.send('menu:clone-repo'),
        },
        {
          label: 'New Project on GitHub...',
          click: () => mainWindow?.webContents.send('menu:new-github-project'),
        },
        { type: 'separator' },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow?.webContents.send('menu:save'),
        },
        {
          label: 'Save As...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => handleSaveAs(),
        },
        {
          label: 'Save As Folder (VCS)...',
          click: () => handleSaveAsFolder(),
        },
        { type: 'separator' },
        {
          label: 'Export...',
          accelerator: 'CmdOrCtrl+E',
          click: () => mainWindow?.webContents.send('menu:export'),
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },

    // Edit menu
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'delete' },
        { type: 'separator' },
        { role: 'selectAll' },
      ],
    },

    // View menu
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        {
          label: 'Auto-arrange Beats',
          accelerator: 'CmdOrCtrl+Shift+A',
          click: () => mainWindow?.webContents.send('menu:auto-arrange'),
        },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },

    // Version Control menu
    {
      label: 'Version Control',
      submenu: [
        {
          label: 'Commit...',
          accelerator: 'CmdOrCtrl+K',
          click: () => mainWindow?.webContents.send('vcs:commit'),
        },
        {
          label: 'Push',
          accelerator: 'CmdOrCtrl+Shift+K',
          click: () => mainWindow?.webContents.send('vcs:push'),
        },
        {
          label: 'Pull',
          accelerator: 'CmdOrCtrl+Shift+L',
          click: () => mainWindow?.webContents.send('vcs:pull'),
        },
        { type: 'separator' },
        {
          label: 'Stash Changes',
          click: () => mainWindow?.webContents.send('vcs:stash'),
        },
        {
          label: 'Pop Stash',
          click: () => mainWindow?.webContents.send('vcs:stash-pop'),
        },
        { type: 'separator' },
        {
          label: 'Toggle VCS Panel',
          accelerator: 'CmdOrCtrl+Shift+G',
          click: () => mainWindow?.webContents.send('vcs:toggle-panel'),
        },
        {
          label: 'Refresh Status',
          click: () => mainWindow?.webContents.send('vcs:refresh'),
        },
      ],
    },

    // Window menu
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [
              { type: 'separator' as const },
              { role: 'front' as const },
            ]
          : [{ role: 'close' as const }]),
      ],
    },

    // Help menu
    {
      label: 'Help',
      submenu: [
        {
          label: 'Check for Updates...',
          click: () => checkForUpdatesManually(),
        },
        { type: 'separator' },
        {
          label: 'Documentation',
          click: () => shell.openExternal('https://github.com/sumo961/ASAPS_New/blob/main/docs/USER_GUIDE.md'),
        },
        {
          label: 'Report Issue',
          click: () => shell.openExternal('https://github.com/sumo961/ASAPS_New/issues'),
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Handle open project
async function handleOpenProject(): Promise<void> {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: [
      { name: 'ASAPS Projects', extensions: ['asaps', 'asaps.zip', 'zip'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    currentProjectPath = filePath;
    mainWindow?.webContents.send('project:open', filePath);
  }
}

// Handle open project folder (directory format)
async function handleOpenProjectFolder(): Promise<void> {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
    title: 'Open Project Folder',
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const folderPath = result.filePaths[0];
    currentProjectPath = folderPath;
    mainWindow?.webContents.send('project:open-folder', folderPath);
  }
}

// Handle save as folder (directory format)
async function handleSaveAsFolder(): Promise<void> {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Save Project As Folder',
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const folderPath = result.filePaths[0];
    currentProjectPath = folderPath;
    mainWindow?.webContents.send('project:save-as-folder', folderPath);
  }
}

// Handle save as
async function handleSaveAs(): Promise<void> {
  const result = await dialog.showSaveDialog(mainWindow!, {
    filters: [
      { name: 'ASAPS Project', extensions: ['asaps.zip'] },
    ],
    defaultPath: currentProjectPath || 'untitled.asaps.zip',
  });

  if (!result.canceled && result.filePath) {
    currentProjectPath = result.filePath;
    mainWindow?.webContents.send('project:save-as', result.filePath);
  }
}

// IPC handlers for filesystem operations
ipcMain.handle('fs:read-file', async (_, path: string) => {
  console.log('[IPC:fs] read-file:', path);
  try {
    return await fs.readFile(path);
  } catch (error: any) {
    console.error('[IPC:fs] read-file FAILED:', path, error.message);
    throw error;
  }
});

ipcMain.handle('fs:write-file', async (_, path: string, data: Buffer | string) => {
  console.log('[IPC:fs] write-file:', path, `(${typeof data === 'string' ? data.length + ' chars' : (data as any).length + ' bytes'})`);
  try {
    await fs.writeFile(path, data);
  } catch (error: any) {
    console.error('[IPC:fs] write-file FAILED:', path, error.message);
    throw error;
  }
});

ipcMain.handle('fs:read-dir', async (_, path: string) => {
  console.log('[IPC:fs] read-dir:', path);
  try {
    const entries = await fs.readdir(path, { withFileTypes: true });
    // Serialize Dirent objects to plain objects (methods are lost over IPC)
    const result = entries.map(e => ({ name: e.name, isDirectory: e.isDirectory(), isFile: e.isFile() }));
    console.log('[IPC:fs] read-dir result:', path, `${result.length} entries`);
    return result;
  } catch (error: any) {
    console.error('[IPC:fs] read-dir FAILED:', path, error.message);
    throw error;
  }
});

ipcMain.handle('fs:mkdir', async (_, path: string) => {
  console.log('[IPC:fs] mkdir:', path);
  try {
    await fs.mkdir(path, { recursive: true });
  } catch (error: any) {
    console.error('[IPC:fs] mkdir FAILED:', path, error.message);
    throw error;
  }
});

ipcMain.handle('fs:exists', async (_, path: string) => {
  try {
    await fs.access(path);
    console.log('[IPC:fs] exists:', path, '-> true');
    return true;
  } catch {
    console.log('[IPC:fs] exists:', path, '-> false');
    return false;
  }
});

ipcMain.handle('fs:unlink', async (_, path: string) => {
  console.log('[IPC:fs] unlink:', path);
  try {
    await fs.unlink(path);
  } catch (error: any) {
    console.error('[IPC:fs] unlink FAILED:', path, error.message);
    throw error;
  }
});

ipcMain.handle('fs:copy-file', async (_, src: string, dst: string) => {
  console.log('[IPC:fs] copy-file:', src, '->', dst);
  try {
    await fs.copyFile(src, dst);
  } catch (error: any) {
    console.error('[IPC:fs] copy-file FAILED:', src, '->', dst, error.message);
    throw error;
  }
});

ipcMain.handle('fs:stat', async (_, path: string) => {
  console.log('[IPC:fs] stat:', path);
  try {
    const stat = await fs.stat(path);
    return {
      size: stat.size,
      mtime: stat.mtime.toISOString(),
      isDirectory: stat.isDirectory(),
    };
  } catch (error: any) {
    console.error('[IPC:fs] stat FAILED:', path, error.message);
    throw error;
  }
});

ipcMain.handle('fs:watch-dir', async (event, dirPath: string) => {
  startWatching(dirPath, (changedFiles) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('fs:dir-changed', changedFiles);
    }
  });
});

ipcMain.handle('fs:unwatch-dir', async () => {
  stopWatching();
});

// Find the actual executable path for a command on Windows
// Searches common install locations when the command isn't on PATH
function findExecutable(command: string): string {
  if (process.platform !== 'win32' || command !== 'git') return command;

  const localAppData = process.env.LOCALAPPDATA || '';
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

  const candidates = [
    join(programFiles, 'Git', 'cmd', 'git.exe'),
    join(programFilesX86, 'Git', 'cmd', 'git.exe'),
    join(localAppData, 'Programs', 'Git', 'cmd', 'git.exe'),
    join(programFiles, 'Git', 'bin', 'git.exe'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      console.log('[IPC:fs] Found git at:', candidate);
      return candidate;
    }
  }

  // Not found in known locations, return original and let PATH handle it
  console.warn('[IPC:fs] git not found in common locations, trying PATH. Searched:', candidates);
  return command;
}

ipcMain.handle('fs:run-command', async (_, command: string, args: string[], cwd?: string, timeout?: number) => {
  console.log('[IPC:fs] run-command:', command, args.join(' '), cwd ? `(cwd: ${cwd})` : '');

  // Augment PATH so tools are found when Electron is launched from GUI
  // macOS: Homebrew paths (Finder has minimal PATH)
  // Windows: Git for Windows paths (common install locations)
  const isWin = process.platform === 'win32';
  const pathSep = isWin ? ';' : ':';
  const extraPaths = isWin
    ? ['C:\\Program Files\\Git\\cmd', 'C:\\Program Files\\Git\\bin', 'C:\\Program Files (x86)\\Git\\cmd']
    : ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'];
  const currentPath = process.env.PATH || '';
  const augmentedPath = [...new Set([...currentPath.split(pathSep), ...extraPaths])].join(pathSep);

  // On Windows, try to find the actual executable path if it's git
  const resolvedCommand = isWin ? findExecutable(command) : command;

  // If git-lfs is configured globally but not installed, git operations fail.
  // Disable LFS filters entirely (empty string = no filter, no process spawned).
  // Uses GIT_CONFIG_COUNT/KEY/VALUE env vars (Git 2.31+).
  const lfsEnv: Record<string, string> = {};
  if (command === 'git') {
    lfsEnv.GIT_CONFIG_COUNT = '4';
    lfsEnv.GIT_CONFIG_KEY_0 = 'filter.lfs.required';
    lfsEnv.GIT_CONFIG_VALUE_0 = 'false';
    lfsEnv.GIT_CONFIG_KEY_1 = 'filter.lfs.clean';
    lfsEnv.GIT_CONFIG_VALUE_1 = '';
    lfsEnv.GIT_CONFIG_KEY_2 = 'filter.lfs.smudge';
    lfsEnv.GIT_CONFIG_VALUE_2 = '';
    lfsEnv.GIT_CONFIG_KEY_3 = 'filter.lfs.process';
    lfsEnv.GIT_CONFIG_VALUE_3 = '';
  }

  return new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve) => {
    execFile(resolvedCommand, args, {
      cwd: cwd || undefined,
      timeout: timeout || 30000,
      env: { ...process.env, PATH: augmentedPath, ...lfsEnv },
    }, (error, stdout, stderr) => {
      const exitCode = error?.code !== undefined ? (typeof error.code === 'number' ? error.code : 1) : 0;
      // When execFile fails (e.g. ENOENT = command not found), stderr is empty
      // but error.message has the real error - surface it so callers can display it
      let stderrResult = stderr || '';
      if (exitCode !== 0 && !stderrResult.trim() && error?.message) {
        // Provide a user-friendly message for common errors
        if (error.code === 'ENOENT' || error.message.includes('ENOENT')) {
          stderrResult = `${command} is not installed or not found on PATH.\n\nPlease install Git for Windows from https://git-scm.com/download/win and restart the app.`;
        } else {
          stderrResult = error.message;
        }
      }
      if (exitCode !== 0) {
        console.warn('[IPC:fs] run-command FAILED:', resolvedCommand, args.join(' '), `exit=${exitCode}`, stderrResult.substring(0, 200));
        if (error) console.warn('[IPC:fs] run-command error details:', error.message, 'code:', error.code);
      } else {
        console.log('[IPC:fs] run-command OK:', resolvedCommand, args.join(' '));
      }
      resolve({
        stdout: stdout || '',
        stderr: stderrResult,
        exitCode,
      });
    });
  });
});

// Streaming command runner — used by `gh auth login` flow so the renderer can
// show device-code prompts and progress while the long-lived process runs.
// Renderer subscribes to `vcs:stream-data` (chunked stdout/stderr) and
// `vcs:stream-end` (final exit code) keyed by streamId. `vcs:stream-cancel`
// kills the process if the user backs out.
const streamProcs = new Map<string, ReturnType<typeof spawn>>();

ipcMain.handle('vcs:run-streaming', async (event, streamId: string, command: string, args: string[], cwd?: string) => {
  console.log('[IPC:vcs] run-streaming:', streamId, command, args.join(' '), cwd ? `(cwd: ${cwd})` : '');
  const isWin = process.platform === 'win32';
  const pathSep = isWin ? ';' : ':';
  const extraPaths = isWin
    ? ['C:\\Program Files\\Git\\cmd', 'C:\\Program Files\\Git\\bin', 'C:\\Program Files (x86)\\Git\\cmd']
    : ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'];
  const augmentedPath = [...new Set([...(process.env.PATH || '').split(pathSep), ...extraPaths])].join(pathSep);
  const resolvedCommand = isWin && command === 'git' ? findExecutable(command) : command;

  try {
    const proc = spawn(resolvedCommand, args, {
      cwd: cwd || undefined,
      env: { ...process.env, PATH: augmentedPath },
    });
    streamProcs.set(streamId, proc);

    proc.stdout?.on('data', (chunk: Buffer) => {
      event.sender.send('vcs:stream-data', { streamId, channel: 'stdout', data: chunk.toString('utf8') });
    });
    proc.stderr?.on('data', (chunk: Buffer) => {
      event.sender.send('vcs:stream-data', { streamId, channel: 'stderr', data: chunk.toString('utf8') });
    });
    proc.on('error', (err) => {
      streamProcs.delete(streamId);
      event.sender.send('vcs:stream-end', { streamId, exitCode: -1, error: err.message });
    });
    proc.on('close', (code) => {
      streamProcs.delete(streamId);
      event.sender.send('vcs:stream-end', { streamId, exitCode: code ?? -1 });
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle('vcs:stream-cancel', async (_, streamId: string) => {
  const proc = streamProcs.get(streamId);
  if (proc) {
    proc.kill();
    streamProcs.delete(streamId);
    return { ok: true };
  }
  return { ok: false };
});

ipcMain.handle('dialog:open', async (_, options: Electron.OpenDialogOptions) => {
  return await dialog.showOpenDialog(mainWindow!, options);
});

ipcMain.handle('dialog:save', async (_, options: Electron.SaveDialogOptions) => {
  return await dialog.showSaveDialog(mainWindow!, options);
});

ipcMain.handle('dialog:message', async (_, options: Electron.MessageBoxOptions) => {
  return await dialog.showMessageBox(mainWindow!, options);
});

ipcMain.handle('shell:open-external', async (_, url: string) => {
  await shell.openExternal(url);
});

ipcMain.handle('app:get-path', async (_, name: string) => {
  return app.getPath(name as any);
});

// API server status
ipcMain.handle('api-server:status', async () => {
  return apiServer.getStatus();
});

// App settings
ipcMain.handle('settings:get-mcp-enabled', async () => {
  return appSettings.mcpEnabled;
});

ipcMain.handle('settings:set-mcp-enabled', async (_, enabled: boolean) => {
  appSettings.mcpEnabled = enabled;
  saveAppSettings(appSettings);
  // Update menu checkbox state
  const menu = Menu.getApplicationMenu();
  if (menu) {
    const mcpItem = menu.getMenuItemById('mcp-toggle');
    if (mcpItem) {
      mcpItem.checked = enabled;
    }
  }
  return appSettings.mcpEnabled;
});

// ============================================================================
// Preview Window Management
// ============================================================================

function createPreviewWindow(): void {
  if (previewWindow && !previewWindow.isDestroyed()) {
    previewWindow.focus();
    return;
  }

  // Get main window position to offset preview window
  const mainBounds = mainWindow?.getBounds() || { x: 100, y: 100 };

  previewWindow = new BrowserWindow({
    width: 1200,
    height: 900,
    x: mainBounds.x + 50,
    y: mainBounds.y + 50,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
    title: 'ASAPS Preview',
    show: false,
  });

  // Show when ready
  previewWindow.once('ready-to-show', () => {
    previewWindow?.show();
  });

  // Load the preview window route
  if (process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL) {
    const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    previewWindow.loadURL(`${devUrl}#/preview-window`);
  } else {
    // In production, load with hash route
    previewWindow.loadFile(join(__dirname, '../../builder/index.html'), {
      hash: '/preview-window',
    });
  }

  // Notify main window when preview is closed
  previewWindow.on('closed', () => {
    previewWindow = null;
    mainWindow?.webContents.send('preview:closed');
  });
}

// Preview window IPC handlers
ipcMain.handle('preview:open', async () => {
  createPreviewWindow();
  return true;
});

ipcMain.handle('preview:close', async () => {
  if (previewWindow && !previewWindow.isDestroyed()) {
    previewWindow.close();
  }
  return true;
});

ipcMain.handle('preview:is-open', async () => {
  return previewWindow !== null && !previewWindow.isDestroyed();
});

ipcMain.handle('preview:send-message', async (_, message: any) => {
  if (previewWindow && !previewWindow.isDestroyed()) {
    previewWindow.webContents.send('preview:message', message);
    return true;
  }
  return false;
});

// Preview window signals it's ready to receive messages
ipcMain.on('preview:ping', () => {
  console.log('[Main] Preview window is ready (ping received)');
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('preview:ready');
  }
});

// Relay messages from the preview window back to the main builder window
// (e.g. VISITED_BEATS_UPDATE for the live red flowchart trace). The preview
// window calls electronAPI.preview.sendToMain(msg); we forward it to main.
ipcMain.on('preview:send-to-main', (_, message: any) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('preview:message-to-main', message);
  }
});

// ============================================================================
// Debug Window Management — pop-out Story Debug Tools (Reachability, Path
// Analysis, Story Logic). Mirrors the Preview Window setup: a dedicated
// BrowserWindow opened via IPC (web window.open is denied by the main
// window's setWindowOpenHandler, so we route through Electron directly).
// ============================================================================

function createDebugWindow(): void {
  if (debugWindow && !debugWindow.isDestroyed()) {
    debugWindow.focus();
    return;
  }

  const mainBounds = mainWindow?.getBounds() || { x: 100, y: 100 };

  debugWindow = new BrowserWindow({
    width: 900,
    height: 800,
    x: mainBounds.x + 80,
    y: mainBounds.y + 80,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
    title: 'ASAPS Debug Tools',
    show: false,
  });

  debugWindow.once('ready-to-show', () => {
    debugWindow?.show();
  });

  if (process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL) {
    const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    debugWindow.loadURL(`${devUrl}#/debug-window`);
  } else {
    debugWindow.loadFile(join(__dirname, '../../builder/index.html'), {
      hash: '/debug-window',
    });
  }

  debugWindow.on('closed', () => {
    debugWindow = null;
    mainWindow?.webContents.send('debug:closed');
  });
}

ipcMain.handle('debug:open', async () => {
  createDebugWindow();
  return true;
});

ipcMain.handle('debug:close', async () => {
  if (debugWindow && !debugWindow.isDestroyed()) {
    debugWindow.close();
  }
  return true;
});

ipcMain.handle('debug:is-open', async () => {
  return debugWindow !== null && !debugWindow.isDestroyed();
});

ipcMain.handle('debug:send-message', async (_, message: any) => {
  if (debugWindow && !debugWindow.isDestroyed()) {
    debugWindow.webContents.send('debug:message', message);
    return true;
  }
  return false;
});

// Debug window announces readiness (so the manager can flush the pending story)
ipcMain.on('debug:ping', () => {
  console.log('[Main] Debug window is ready (ping received)');
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('debug:ready');
  }
});

// Relay messages FROM the debug window back to the main builder window
// (e.g. HIGHLIGHT_PATH / HIGHLIGHT_BEAT / CLEAR_HIGHLIGHT for flowchart painting)
ipcMain.on('debug:send-to-main', (_, message: any) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('debug:message-to-main', message);
  }
});

// ============================================================================
// Ideator Window IPC handlers
// ============================================================================
// Pop-out conversational ideation tool. Mirrors the Preview / Debug Window
// setup: a dedicated BrowserWindow opened via IPC because the main window's
// setWindowOpenHandler denies window.open. Wire-message contract documented
// in packages/builder/src/components/ai/ideator/types.ts (IdeatorWireMessage).
// ============================================================================

function createIdeatorWindow(options: { projectTitle?: string; projectId?: string } = {}): void {
  if (ideatorWindow && !ideatorWindow.isDestroyed()) {
    ideatorWindow.focus();
    return;
  }

  const mainBounds = mainWindow?.getBounds() || { x: 100, y: 100 };

  ideatorWindow = new BrowserWindow({
    width: 900,
    height: 800,
    x: mainBounds.x + 80,
    y: mainBounds.y + 80,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
    title: 'ASAPS Ideator',
    show: false,
  });

  ideatorWindow.once('ready-to-show', () => {
    ideatorWindow?.show();
  });

  // Build the hash route with optional ?title= / ?projectId= so the
  // IdeatorWindow page can show project context.
  const params = new URLSearchParams();
  if (options.projectTitle) params.set('title', options.projectTitle);
  if (options.projectId) params.set('projectId', options.projectId);
  const queryString = params.toString();
  const hash = queryString ? `/ideator-window?${queryString}` : '/ideator-window';

  if (process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL) {
    const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    ideatorWindow.loadURL(`${devUrl}#${hash}`);
  } else {
    ideatorWindow.loadFile(join(__dirname, '../../builder/index.html'), {
      hash,
    });
  }

  ideatorWindow.on('closed', () => {
    ideatorWindow = null;
    mainWindow?.webContents.send('ideator:closed');
  });
}

ipcMain.handle('ideator:open', async (_, options: { projectTitle?: string; projectId?: string } = {}) => {
  createIdeatorWindow(options);
  return true;
});

ipcMain.handle('ideator:close', async () => {
  if (ideatorWindow && !ideatorWindow.isDestroyed()) {
    ideatorWindow.close();
  }
  return true;
});

ipcMain.handle('ideator:is-open', async () => {
  return ideatorWindow !== null && !ideatorWindow.isDestroyed();
});

// Main → ideator pop-out (e.g. GENERATION_COMPLETE / GENERATION_FAILED)
ipcMain.handle('ideator:send-message', async (_, message: any) => {
  if (ideatorWindow && !ideatorWindow.isDestroyed()) {
    ideatorWindow.webContents.send('ideator:message', message);
    return true;
  }
  return false;
});

// Ideator pop-out announces readiness so the manager can flush any pending state.
ipcMain.on('ideator:ping', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('ideator:ready');
  }
});

// ============================================================================
// Pop-out Co-Designer — design-phase collaborator on the OPEN story.
// Counterpart to the Ideator window above. Story context travels via
// localStorage (same-origin BrowserWindows share it), so only window
// lifecycle needs IPC here.
// ============================================================================

function createCoDesignerWindow(options: { projectTitle?: string } = {}): void {
  if (codesignerWindow && !codesignerWindow.isDestroyed()) {
    codesignerWindow.focus();
    return;
  }

  const mainBounds = mainWindow?.getBounds() || { x: 100, y: 100 };

  codesignerWindow = new BrowserWindow({
    width: 900,
    height: 800,
    x: mainBounds.x + 110,
    y: mainBounds.y + 110,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
    title: 'ASAPS Co-Designer',
    show: false,
  });

  codesignerWindow.once('ready-to-show', () => {
    codesignerWindow?.show();
  });

  const params = new URLSearchParams();
  if (options.projectTitle) params.set('title', options.projectTitle);
  const queryString = params.toString();
  const hash = queryString ? `/co-designer-window?${queryString}` : '/co-designer-window';

  if (process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL) {
    const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    codesignerWindow.loadURL(`${devUrl}#${hash}`);
  } else {
    codesignerWindow.loadFile(join(__dirname, '../../builder/index.html'), {
      hash,
    });
  }

  codesignerWindow.on('closed', () => {
    codesignerWindow = null;
    mainWindow?.webContents.send('codesigner:closed');
  });
}

ipcMain.handle('codesigner:open', async (_, options: { projectTitle?: string } = {}) => {
  createCoDesignerWindow(options);
  return true;
});

ipcMain.handle('codesigner:close', async () => {
  if (codesignerWindow && !codesignerWindow.isDestroyed()) {
    codesignerWindow.close();
  }
  return true;
});

ipcMain.handle('codesigner:is-open', async () => {
  return codesignerWindow !== null && !codesignerWindow.isDestroyed();
});

// Pop-out announces readiness so the manager can reflect open state.
ipcMain.on('codesigner:ping', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('codesigner:ready');
  }
});

// Main → pop-out (APPLY_RESULT)
ipcMain.handle('codesigner:send-message', async (_, message: any) => {
  if (codesignerWindow && !codesignerWindow.isDestroyed()) {
    codesignerWindow.webContents.send('codesigner:message', message);
    return true;
  }
  return false;
});

// Pop-out → main (APPLY_PROPOSALS)
ipcMain.on('codesigner:send-to-main', (_, message: any) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('codesigner:message-to-main', message);
  }
});

// ============================================================================
// Start Window IPC handlers
// ============================================================================
// The start window is the app's launch surface. When the user picks
// a project / create path, it sends `start:pick` with the intent
// encoded as a flat string map. Main opens the editor with the intent
// as URL params and closes the start window. The editor's boot
// reader (App.tsx) consumes the params and routes to the destination.
// ============================================================================

ipcMain.handle('start:open', async () => {
  createStartWindow();
  return true;
});

ipcMain.handle('start:close', async () => {
  if (startWindow && !startWindow.isDestroyed()) {
    startWindow.close();
  }
  return true;
});

ipcMain.handle('start:is-open', async () => {
  return startWindow !== null && !startWindow.isDestroyed();
});

ipcMain.handle('start:pick', async (_, intent: Record<string, string> = {}) => {
  // Two cases:
  //   1. Editor doesn't exist yet (cold launch path) — create it
  //      with the intent encoded as URL params. The editor's boot
  //      logic consumes the params on first render.
  //   2. Editor already exists (user opened the start window from
  //      the editor's "Browse all projects" action) — send the
  //      intent via IPC so the existing editor can apply it
  //      without a window recreate. Closing + reopening would
  //      drop unsaved state and flash an empty window.
  const editorExists = mainWindow && !mainWindow.isDestroyed();
  if (editorExists) {
    mainWindow!.webContents.send('start:apply-intent', intent);
    mainWindow!.focus();
  } else {
    createWindow(intent);
  }
  if (startWindow && !startWindow.isDestroyed()) {
    startWindow.close();
  }
  return true;
});

// Ideator pop-out → main builder (SUBMIT_REQUEST is the load-bearing one;
// the user's confirmed StoryGenerationRequest comes back this way and main
// runs aiService.generateStory() on it).
ipcMain.on('ideator:send-to-main', (_, message: any) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('ideator:message-to-main', message);
  }
});

// App lifecycle
app.whenReady().then(async () => {
  // Start the embedded API server for AI proxy functionality
  try {
    await apiServer.start();
    console.log('[Main] API server started:', apiServer.getStatus());

    // Set up story injection callback to forward to renderer
    setStoryInjectionCallback((data) => {
      console.log('[Main] Story injection received, forwarding to renderer');
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('story:inject', data);
      } else {
        console.warn('[Main] Cannot inject story - main window not available');
      }
    });
  } catch (error) {
    console.error('[Main] Failed to start API server:', error);
    // Continue anyway - the app can work without the proxy server
  }

  createMenu();
  // Open the start window first instead of the editor. The user
  // picks a project / create path, which IPCs back to main and
  // triggers createWindow() with the encoded intent. Same boot
  // shape as Xcode's welcome window.
  createStartWindow();

  // Setup auto-updater after window is created
  setupAutoUpdater();

  app.on('activate', () => {
    // Dock click with no windows open — re-show the start window if
    // there's no editor running. If the editor is running, focus it.
    const allWindows = BrowserWindow.getAllWindows();
    if (allWindows.length === 0) {
      createStartWindow();
    } else if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.focus();
    } else if (startWindow && !startWindow.isDestroyed()) {
      startWindow.focus();
    }
  });
});

app.on('window-all-closed', () => {
  // Always quit when updating, regardless of platform
  if (isUpdating || process.platform !== 'darwin') {
    app.quit();
  }
});

// Clean up API server before quitting
// Note: Skip cleanup during update to avoid interfering with auto-updater's quit process
app.on('before-quit', (event) => {
  if (isUpdating) {
    console.log('[Main] Skipping API server cleanup during update');
    return;
  }

  // Stop API server (fire and forget to not block quit)
  apiServer.stop()
    .then(() => console.log('[Main] API server stopped'))
    .catch((error) => console.error('[Main] Error stopping API server:', error));
});

// Handle file open on macOS (when double-clicking a file)
app.on('open-file', (event, path) => {
  event.preventDefault();
  if (mainWindow) {
    currentProjectPath = path;
    mainWindow.webContents.send('project:open', path);
  }
});
