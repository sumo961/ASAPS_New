/**
 * Tests for validateProjectAssets — checks every asset listed in
 * the project's _manifest.json actually exists on the filesystem.
 *
 * Electron-only (uses window.electronAPI.fs). The function reads
 * the manifest at `<assetsPath>/assets/_manifest.json`, then probes
 * each file at `<assetsPath>/assets/<folder>/<filename>`. Returns
 * the entries split into `valid` and `missing` so the UI can prompt
 * the author to relocate missing assets.
 *
 * Coverage focus:
 *   - throws when no electronAPI.fs (graceful when called from web)
 *   - returns empty when manifest doesn't exist or is unreadable
 *   - splits entries into valid + missing based on per-file existence
 *   - per-file probe error doesn't crash the whole run — that entry
 *     goes to missing
 *   - uses electronAPI.path.sep when present (Windows compat)
 *   - falls back to "/" when path.sep is missing
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { validateProjectAssets } from '../assetValidator';

afterEach(() => {
  vi.unstubAllGlobals();
});

// Helper: build a fake electronAPI with controllable fs + path.
function makeElectronAPI(opts: {
  exists?: (p: string) => Promise<boolean>;
  readFile?: (p: string, enc: string) => Promise<string | Uint8Array>;
  pathSep?: string;
}) {
  return {
    electronAPI: {
      fs: {
        exists: opts.exists ?? vi.fn().mockResolvedValue(false),
        readFile: opts.readFile ?? vi.fn().mockResolvedValue(''),
      },
      path: opts.pathSep !== undefined ? { sep: opts.pathSep } : undefined,
    },
  };
}

const entry = (id: string, folder: string, filename: string, type: 'image' | 'audio') => ({
  id, folder, filename, type,
  mimeType: type === 'image' ? 'image/png' : 'audio/mp3',
  size: 1024,
});
const manifestJSON = JSON.stringify({
  _format: '1.0',
  assets: {
    'a1': entry('a1', 'images', 'cover.png', 'image'),
    'a2': entry('a2', 'audio', 'theme.mp3', 'audio'),
    'a3': entry('a3', 'images', 'missing.png', 'image'),
  },
});

describe('validateProjectAssets', () => {
  it('throws when electronAPI.fs is not available', async () => {
    // Web build calling this is a bug — fail loud rather than
    // silently returning empty results that could be mistaken for
    // "no missing assets".
    vi.stubGlobal('window', {});
    await expect(validateProjectAssets('/project'))
      .rejects.toThrow(/electron filesystem api/i);
  });

  it('returns empty result when the manifest file does not exist', async () => {
    // Project may legitimately have no external assets folder yet.
    // Don't error — just report nothing to validate.
    vi.stubGlobal('window', makeElectronAPI({
      exists: vi.fn().mockResolvedValue(false), // manifest missing
      pathSep: '/',
    }));

    const result = await validateProjectAssets('/project');
    expect(result).toEqual({ valid: [], missing: [] });
  });

  it('returns empty result when manifest read throws', async () => {
    // Permission error / corrupt manifest — gracefully degrade.
    vi.stubGlobal('window', makeElectronAPI({
      exists: vi.fn().mockResolvedValue(true), // manifest "exists"
      readFile: vi.fn().mockRejectedValue(new Error('permission denied')),
      pathSep: '/',
    }));

    const result = await validateProjectAssets('/project');
    expect(result).toEqual({ valid: [], missing: [] });
  });

  it('splits entries into valid + missing based on per-file existence', async () => {
    // Two valid files, one missing. The manifest-exists call gets
    // the first probe; the next three probes are for the asset
    // files themselves.
    const existsMock = vi.fn()
      .mockResolvedValueOnce(true)   // manifest itself
      .mockResolvedValueOnce(true)   // a1 cover.png
      .mockResolvedValueOnce(true)   // a2 theme.mp3
      .mockResolvedValueOnce(false); // a3 missing.png
    const readFileMock = vi.fn().mockResolvedValue(manifestJSON);
    vi.stubGlobal('window', makeElectronAPI({
      exists: existsMock,
      readFile: readFileMock,
      pathSep: '/',
    }));

    const result = await validateProjectAssets('/project');
    expect(result.valid).toHaveLength(2);
    expect(result.missing).toHaveLength(1);
    expect(result.missing[0].id).toBe('a3');
    expect(result.missing[0].filename).toBe('missing.png');
  });

  it('a per-file probe error puts that entry in missing (not crashing)', async () => {
    // A1 probe throws (e.g. EACCES on one folder). Treat as
    // missing rather than aborting the whole validation — the
    // author still gets a useful report for the other entries.
    const existsMock = vi.fn()
      .mockResolvedValueOnce(true)                                    // manifest
      .mockRejectedValueOnce(new Error('permission denied on a1'))    // a1
      .mockResolvedValueOnce(true)                                    // a2
      .mockResolvedValueOnce(true);                                   // a3
    const readFileMock = vi.fn().mockResolvedValue(manifestJSON);
    vi.stubGlobal('window', makeElectronAPI({
      exists: existsMock,
      readFile: readFileMock,
      pathSep: '/',
    }));

    const result = await validateProjectAssets('/project');
    expect(result.missing.some(e => e.id === 'a1')).toBe(true);
    expect(result.valid.some(e => e.id === 'a2')).toBe(true);
    expect(result.valid.some(e => e.id === 'a3')).toBe(true);
  });

  it('uses electronAPI.path.sep when present (Windows compat)', async () => {
    const existsMock = vi.fn().mockResolvedValue(true);
    const readFileMock = vi.fn().mockResolvedValue(manifestJSON);
    vi.stubGlobal('window', makeElectronAPI({
      exists: existsMock,
      readFile: readFileMock,
      pathSep: '\\',
    }));

    await validateProjectAssets('C:\\project');

    // readFile path was constructed with the Windows separator,
    // not the Unix one.
    expect(readFileMock).toHaveBeenCalledWith(
      expect.stringContaining('C:\\project\\assets\\_manifest.json'),
      expect.any(String)
    );
  });

  it('falls back to "/" when path.sep is missing', async () => {
    const existsMock = vi.fn().mockResolvedValue(true);
    const readFileMock = vi.fn().mockResolvedValue(manifestJSON);
    vi.stubGlobal('window', makeElectronAPI({
      exists: existsMock,
      readFile: readFileMock,
      // No pathSep — falls back to '/'.
    }));

    await validateProjectAssets('/project');

    expect(readFileMock).toHaveBeenCalledWith(
      '/project/assets/_manifest.json',
      expect.any(String)
    );
  });

  it('decodes the manifest when readFile returns a Uint8Array', async () => {
    // Electron's fs.readFile may return either string or Uint8Array
    // depending on the version + how it was invoked. The util
    // decodes Uint8Array via TextDecoder.
    const encoder = new TextEncoder();
    const bytes = encoder.encode(manifestJSON);
    const existsMock = vi.fn().mockResolvedValue(true);
    const readFileMock = vi.fn().mockResolvedValue(bytes);
    vi.stubGlobal('window', makeElectronAPI({
      exists: existsMock,
      readFile: readFileMock,
      pathSep: '/',
    }));

    const result = await validateProjectAssets('/project');
    // Sanity: parsed the manifest successfully and got the 3 entries.
    expect(result.valid.length + result.missing.length).toBe(3);
  });
});
