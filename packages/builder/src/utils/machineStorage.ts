/**
 * Machine-scope storage for secrets (UX-Eval B3): AI / TTS / STT provider
 * configs with their API keys and the Brave search key.
 *
 * Same synchronous surface as localStorage, so the existing config readers
 * keep their shape. In the desktop app it is backed by the main process's
 * encrypted machine store (OS keychain; apps/builder-desktop/src/main/
 * machineStore.ts) — values no longer sit in the renderer's localStorage in
 * plain text and survive a storage reset. In the browser build there is no
 * such store, so it falls through to localStorage unchanged.
 *
 * Migration is lazy and idempotent: the first read of a key that the machine
 * store lacks but localStorage still has moves it across and deletes the
 * localStorage copy. Several windows migrating at once write the same value.
 */

interface MachineStoreBridge {
  get(key: string): string | null;
  set(key: string, value: string | null): Promise<boolean>;
  isEncrypted(): boolean;
  onChanged(cb: (key: string, value: string | null) => void): () => void;
}

function bridge(): MachineStoreBridge | null {
  if (typeof window === 'undefined') return null;
  const b = (window as any).electronAPI?.machineStore;
  return b && typeof b.get === 'function' && typeof b.set === 'function' ? (b as MachineStoreBridge) : null;
}

function local(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export const machineStorage = {
  getItem(key: string): string | null {
    const b = bridge();
    const ls = local();
    if (!b) return ls ? ls.getItem(key) : null;
    const value = b.get(key);
    if (value !== null) return value;
    const legacy = ls?.getItem(key) ?? null;
    if (legacy !== null) {
      // Delete the plain copy only once the machine store confirmed the
      // write — a failed write must never lose the key.
      void b.set(key, legacy).then((ok) => {
        if (ok) { try { ls?.removeItem(key); } catch { /* ignore */ } }
      });
    }
    return legacy;
  },

  setItem(key: string, value: string): void {
    const b = bridge();
    const ls = local();
    if (!b) {
      ls?.setItem(key, value);
      return;
    }
    void b.set(key, value).then((ok) => {
      if (ok) { try { ls?.removeItem(key); } catch { /* ignore */ } }
    });
  },

  removeItem(key: string): void {
    const b = bridge();
    if (b) void b.set(key, null);
    try { local()?.removeItem(key); } catch { /* ignore */ }
  },

  /** True in the desktop app when secrets are encrypted by the OS keychain. */
  isEncryptedAtRest(): boolean {
    return bridge()?.isEncrypted() ?? false;
  },

  /** Subscribe to changes made in other windows (desktop app only). */
  onChanged(cb: (key: string, value: string | null) => void): () => void {
    return bridge()?.onChanged(cb) ?? (() => {});
  },
};
