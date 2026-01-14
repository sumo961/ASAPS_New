import { app, BrowserWindow, ipcMain, dialog, Menu, shell } from 'electron';
import { join } from 'path';
import * as fs from 'fs/promises';

// Handle creating/removing shortcuts on Windows when installing/uninstalling
try {
  if (require('electron-squirrel-startup')) {
    app.quit();
  }
} catch {
  // electron-squirrel-startup not installed, ignore (only needed for Windows installers)
}

let mainWindow: BrowserWindow | null = null;
let currentProjectPath: string | null = null;

function createWindow(): void {
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

  // Load the app
  // In development, load from the builder's dev server (port 5173)
  // In production, load the builder's built files copied to resources
  if (process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL) {
    const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools();
  } else {
    // In production, the builder's dist is copied to app.asar/builder
    mainWindow.loadFile(join(__dirname, '../../builder/index.html'));
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
      : []),

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
          label: 'Documentation',
          click: () => shell.openExternal('https://asaps.example.com/docs'),
        },
        {
          label: 'Report Issue',
          click: () => shell.openExternal('https://github.com/asaps/asaps-modern/issues'),
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
  return await fs.readFile(path);
});

ipcMain.handle('fs:write-file', async (_, path: string, data: Buffer | string) => {
  await fs.writeFile(path, data);
});

ipcMain.handle('fs:read-dir', async (_, path: string) => {
  return await fs.readdir(path, { withFileTypes: true });
});

ipcMain.handle('fs:mkdir', async (_, path: string) => {
  await fs.mkdir(path, { recursive: true });
});

ipcMain.handle('fs:exists', async (_, path: string) => {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('fs:unlink', async (_, path: string) => {
  await fs.unlink(path);
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

// App lifecycle
app.whenReady().then(() => {
  createMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle file open on macOS (when double-clicking a file)
app.on('open-file', (event, path) => {
  event.preventDefault();
  if (mainWindow) {
    currentProjectPath = path;
    mainWindow.webContents.send('project:open', path);
  }
});
