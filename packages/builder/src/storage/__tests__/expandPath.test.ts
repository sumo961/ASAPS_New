/**
 * Tests for HybridStorageAdapter.expandPath() - home directory resolution
 *
 * The expandPath method resolves '~' to the user's home directory using
 * Electron's app.getPath('home') API, with fallbacks for non-Electron environments.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HybridStorageAdapter, resetStorageAdapter } from '../HybridStorageAdapter';

// Ensure window exists for Node test environment
if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = globalThis;
}

// Access private method via prototype for testing
function getExpandPath(adapter: HybridStorageAdapter): (path: string) => Promise<string> {
  return (adapter as any).expandPath.bind(adapter);
}

describe('HybridStorageAdapter.expandPath', () => {
  let adapter: HybridStorageAdapter;
  let originalElectronAPI: any;

  beforeEach(() => {
    resetStorageAdapter();
    originalElectronAPI = (globalThis as any).electronAPI;
    adapter = new HybridStorageAdapter();
  });

  afterEach(() => {
    (globalThis as any).electronAPI = originalElectronAPI;
    (globalThis as any).window.electronAPI = originalElectronAPI;
    resetStorageAdapter();
  });

  it('should resolve ~ using app.getPath("home")', async () => {
    (globalThis as any).electronAPI = {
      app: {
        getPath: vi.fn().mockResolvedValue('/Users/testuser'),
      },
    };

    const expandPath = getExpandPath(adapter);
    const result = await expandPath('~/.asaps-cache');

    expect(result).toBe('/Users/testuser/.asaps-cache');
    expect((globalThis as any).electronAPI.app.getPath).toHaveBeenCalledWith('home');
  });

  it('should resolve ~ on Windows paths', async () => {
    (globalThis as any).electronAPI = {
      app: {
        getPath: vi.fn().mockResolvedValue('C:\\Users\\testuser'),
      },
    };

    const expandPath = getExpandPath(adapter);
    const result = await expandPath('~/.asaps-cache');

    expect(result).toBe('C:\\Users\\testuser/.asaps-cache');
  });

  it('should handle bare ~ path', async () => {
    (globalThis as any).electronAPI = {
      app: {
        getPath: vi.fn().mockResolvedValue('/home/user'),
      },
    };

    const expandPath = getExpandPath(adapter);
    const result = await expandPath('~');

    expect(result).toBe('/home/user');
  });

  it('should fall back to process.env.HOME when app.getPath fails', async () => {
    (globalThis as any).electronAPI = {
      app: {
        getPath: vi.fn().mockRejectedValue(new Error('Not available')),
      },
    };

    const expandPath = getExpandPath(adapter);
    const result = await expandPath('~/.asaps-cache');

    // Should use process.env.HOME or USERPROFILE as fallback
    if (process.env.HOME || process.env.USERPROFILE) {
      const home = process.env.HOME || process.env.USERPROFILE;
      expect(result).toBe(`${home}/.asaps-cache`);
    } else {
      expect(result).toBe('');
    }
  });

  it('should fall back to process.env when electronAPI is undefined', async () => {
    (globalThis as any).electronAPI = undefined;

    const expandPath = getExpandPath(adapter);
    const result = await expandPath('~/.asaps-cache');

    // Should use process.env.HOME or USERPROFILE as fallback
    if (process.env.HOME || process.env.USERPROFILE) {
      const home = process.env.HOME || process.env.USERPROFILE;
      expect(result).toBe(`${home}/.asaps-cache`);
    } else {
      expect(result).toBe('');
    }
  });

  it('should return path unchanged when it does not start with ~', async () => {
    const expandPath = getExpandPath(adapter);
    const result = await expandPath('/absolute/path/to/cache');

    expect(result).toBe('/absolute/path/to/cache');
  });

  it('should return path unchanged for relative paths', async () => {
    const expandPath = getExpandPath(adapter);
    const result = await expandPath('relative/path');

    expect(result).toBe('relative/path');
  });

  it('should handle app.getPath returning null gracefully', async () => {
    (globalThis as any).electronAPI = {
      app: {
        getPath: vi.fn().mockResolvedValue(null),
      },
    };

    const expandPath = getExpandPath(adapter);
    const result = await expandPath('~/.asaps-cache');

    // Should fall through to process.env fallback
    if (process.env.HOME || process.env.USERPROFILE) {
      const home = process.env.HOME || process.env.USERPROFILE;
      expect(result).toBe(`${home}/.asaps-cache`);
    } else {
      expect(result).toBe('');
    }
  });
});
