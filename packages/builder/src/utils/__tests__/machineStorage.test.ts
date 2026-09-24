import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { machineStorage } from '../machineStorage';

function installBridge(initial: Record<string, string> = {}) {
  const values: Record<string, string> = { ...initial };
  const set = vi.fn(async (k: string, v: string | null) => { if (v === null) delete values[k]; else values[k] = v; return true; });
  (window as any).electronAPI = {
    machineStore: {
      get: (k: string) => (k in values ? values[k] : null),
      set,
      isEncrypted: () => true,
      onChanged: () => () => {},
    },
  };
  return { values, set };
}

// Node 25 exposes its own global localStorage that throws without
// --localstorage-file; give each test a fresh in-memory Storage.
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => { m.delete(k); },
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
  };
}
beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); });
afterEach(() => { delete (window as any).electronAPI; vi.unstubAllGlobals(); });

describe('machineStorage', () => {
  it('browser build (no bridge): plain localStorage passthrough', () => {
    machineStorage.setItem('asaps_ai_config', '{"k":1}');
    expect(localStorage.getItem('asaps_ai_config')).toBe('{"k":1}');
    expect(machineStorage.getItem('asaps_ai_config')).toBe('{"k":1}');
    machineStorage.removeItem('asaps_ai_config');
    expect(localStorage.getItem('asaps_ai_config')).toBeNull();
    expect(machineStorage.isEncryptedAtRest()).toBe(false);
  });

  it('desktop: writes go to the machine store, never localStorage', () => {
    const { values } = installBridge();
    machineStorage.setItem('asaps_tts_config', '{"apiKey":"s"}');
    expect(values.asaps_tts_config).toBe('{"apiKey":"s"}');
    expect(localStorage.getItem('asaps_tts_config')).toBeNull();
    expect(machineStorage.isEncryptedAtRest()).toBe(true);
  });

  it('desktop: first read migrates a legacy localStorage value and deletes the plain copy once stored', async () => {
    localStorage.setItem('asaps_brave_api_key', 'BSA-legacy');
    const { values, set } = installBridge();
    expect(machineStorage.getItem('asaps_brave_api_key')).toBe('BSA-legacy');
    expect(set).toHaveBeenCalledWith('asaps_brave_api_key', 'BSA-legacy');
    await Promise.resolve(); await Promise.resolve();
    expect(values.asaps_brave_api_key).toBe('BSA-legacy');
    expect(localStorage.getItem('asaps_brave_api_key')).toBeNull();
  });

  it('desktop: a failed machine-store write keeps the localStorage copy', async () => {
    localStorage.setItem('asaps_stt_config', 'keep-me');
    const { set } = installBridge();
    set.mockResolvedValueOnce(false);
    expect(machineStorage.getItem('asaps_stt_config')).toBe('keep-me');
    await Promise.resolve(); await Promise.resolve();
    expect(localStorage.getItem('asaps_stt_config')).toBe('keep-me');
  });

  it('desktop: the machine store wins over a stale localStorage copy', () => {
    localStorage.setItem('asaps_ai_config', 'old');
    installBridge({ asaps_ai_config: 'new' });
    expect(machineStorage.getItem('asaps_ai_config')).toBe('new');
  });
});
