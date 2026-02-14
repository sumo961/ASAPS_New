/**
 * Electron-specific storage adapter for the ASAPS Builder
 * Uses native filesystem APIs via the preload bridge
 */

import { join } from 'path';

export interface IStorageAdapter {
  saveProject(name: string, data: ArrayBuffer): Promise<void>;
  loadProject(name: string): Promise<ArrayBuffer | null>;
  deleteProject(name: string): Promise<void>;
  listProjects(): Promise<string[]>;
  getProjectPath(): Promise<string>;
}

export class ElectronStorageAdapter implements IStorageAdapter {
  private projectsDir: string | null = null;

  constructor() {
    this.init();
  }

  private async init(): Promise<void> {
    if (!window.electronAPI) return;

    try {
      const documentsPath = await window.electronAPI.app.getPath('documents');
      this.projectsDir = join(documentsPath, 'ASAPS', 'Projects');

      // Ensure directory exists
      const exists = await window.electronAPI.fs.exists(this.projectsDir);
      if (!exists) {
        await window.electronAPI.fs.mkdir(this.projectsDir);
      }
    } catch (error) {
      console.error('[ElectronStorageAdapter] Failed to init:', error);
    }
  }

  async getProjectPath(): Promise<string> {
    if (!this.projectsDir) {
      await this.init();
    }
    return this.projectsDir || '';
  }

  async saveProject(name: string, data: ArrayBuffer): Promise<void> {
    if (!window.electronAPI || !this.projectsDir) {
      throw new Error('Electron API not available');
    }

    const filename = name.endsWith('.asaps.zip') ? name : `${name}.asaps.zip`;
    const filepath = join(this.projectsDir, filename);

    await window.electronAPI.fs.writeFile(filepath, Buffer.from(data));
  }

  async loadProject(name: string): Promise<ArrayBuffer | null> {
    if (!window.electronAPI || !this.projectsDir) {
      throw new Error('Electron API not available');
    }

    const filename = name.endsWith('.asaps.zip') ? name : `${name}.asaps.zip`;
    const filepath = join(this.projectsDir, filename);

    try {
      const exists = await window.electronAPI.fs.exists(filepath);
      if (!exists) return null;

      const data = await window.electronAPI.fs.readFile(filepath);
      return data.buffer;
    } catch (error) {
      console.error('[ElectronStorageAdapter] Failed to load project:', error);
      return null;
    }
  }

  async deleteProject(name: string): Promise<void> {
    if (!window.electronAPI || !this.projectsDir) {
      throw new Error('Electron API not available');
    }

    const filename = name.endsWith('.asaps.zip') ? name : `${name}.asaps.zip`;
    const filepath = join(this.projectsDir, filename);

    try {
      await window.electronAPI.fs.unlink(filepath);
    } catch (error) {
      console.error('[ElectronStorageAdapter] Failed to delete project:', error);
    }
  }

  async listProjects(): Promise<string[]> {
    if (!window.electronAPI || !this.projectsDir) {
      return [];
    }

    try {
      const entries = await window.electronAPI.fs.readDir(this.projectsDir);
      return entries
        .filter((e: { name: string; isDirectory: () => boolean }) =>
          !e.isDirectory() && (e.name.endsWith('.asaps.zip') || e.name.endsWith('.asaps'))
        )
        .map((e: { name: string }) => e.name.replace(/\.(asaps\.)?zip$/, ''));
    } catch (error) {
      console.error('[ElectronStorageAdapter] Failed to list projects:', error);
      return [];
    }
  }

  /**
   * Save project to a specific path (for Save As)
   */
  async saveToPath(filepath: string, data: ArrayBuffer): Promise<void> {
    if (!window.electronAPI) {
      throw new Error('Electron API not available');
    }

    await window.electronAPI.fs.writeFile(filepath, Buffer.from(data));
  }

  /**
   * Load project from a specific path
   */
  async loadFromPath(filepath: string): Promise<ArrayBuffer | null> {
    if (!window.electronAPI) {
      throw new Error('Electron API not available');
    }

    try {
      const data = await window.electronAPI.fs.readFile(filepath);
      return data.buffer;
    } catch (error) {
      console.error('[ElectronStorageAdapter] Failed to load from path:', error);
      return null;
    }
  }

  /**
   * Show native open dialog
   */
  async showOpenDialog(): Promise<string | null> {
    if (!window.electronAPI) return null;

    const result = await window.electronAPI.dialog.open({
      properties: ['openFile'],
      filters: [
        { name: 'ASAPS Projects', extensions: ['asaps', 'asaps.zip', 'zip'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  }

  /**
   * Show native save dialog
   */
  async showSaveDialog(defaultName: string = 'untitled'): Promise<string | null> {
    if (!window.electronAPI) return null;

    const result = await window.electronAPI.dialog.save({
      defaultPath: `${defaultName}.asaps.zip`,
      filters: [
        { name: 'ASAPS Project', extensions: ['asaps.zip'] },
      ],
    });

    if (result.canceled || !result.filePath) {
      return null;
    }

    return result.filePath;
  }
}

// Export singleton instance
export const electronStorage = new ElectronStorageAdapter();
