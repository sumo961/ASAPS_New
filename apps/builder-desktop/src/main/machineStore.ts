/**
 * Machine store — secrets that belong to THIS COMPUTER, not to a project or
 * a browser profile (UX-Eval B3, "Machine" scope): AI / TTS / STT provider
 * configs with their API keys, the Brave search key.
 *
 * Before, they lived in the renderer's localStorage: plaintext on disk, and
 * gone whenever that storage was cleared. Here they live in
 * <userData>/machine-store.json, each value encrypted with Electron's
 * safeStorage (macOS Keychain, Windows DPAPI, libsecret on Linux). When the
 * OS offers no encryption the value is stored as plain text, marked so, and
 * the app says so in the log rather than failing.
 *
 * Renderers read a snapshot synchronously at preload time (the existing
 * readers are synchronous) and write through IPC; the main process
 * broadcasts every change so all open windows stay in step.
 *
 * Pure except for the injected `crypto` / `fileIO`, so it is unit-tested
 * without Electron.
 */

export interface MachineCrypto {
  isEncryptionAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(cipher: Buffer): string;
}

export interface MachineFileIO {
  read(): string | null;
  /** Must be atomic (write temp + rename) — a torn file would lose every key. */
  write(contents: string): void;
}

/** On-disk entry: encrypted (base64 ciphertext) or, without OS crypto, plain. */
type StoredEntry = { enc: string } | { plain: string };

interface StoredFile {
  version: 1;
  entries: Record<string, StoredEntry>;
}

/** Keys the renderer may keep here. Anything else is refused. */
export const MACHINE_KEYS = [
  'asaps_ai_config',
  'asaps_tts_config',
  'asaps_stt_config',
  'asaps_brave_api_key',
] as const;
export type MachineKey = (typeof MACHINE_KEYS)[number];

export function isMachineKey(key: string): key is MachineKey {
  return (MACHINE_KEYS as readonly string[]).includes(key);
}

export class MachineStore {
  private entries: Record<string, StoredEntry> = {};
  private warnedPlain = false;

  constructor(private crypto: MachineCrypto, private io: MachineFileIO) {
    this.load();
  }

  private load(): void {
    const raw = this.io.read();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as StoredFile;
      if (parsed && parsed.version === 1 && parsed.entries && typeof parsed.entries === 'object') {
        this.entries = parsed.entries;
      }
    } catch (err) {
      console.error('[MachineStore] unreadable machine-store.json — starting empty:', err);
    }
  }

  private persist(): void {
    const file: StoredFile = { version: 1, entries: this.entries };
    this.io.write(JSON.stringify(file, null, 2));
  }

  private decode(entry: StoredEntry): string | null {
    if ('plain' in entry) return entry.plain;
    try {
      return this.crypto.decryptString(Buffer.from(entry.enc, 'base64'));
    } catch (err) {
      // Encrypted on another machine / user account, or the keychain entry
      // was reset: the value is unrecoverable here. Treat as absent.
      console.error('[MachineStore] could not decrypt a stored value (different machine or reset keychain?):', err);
      return null;
    }
  }

  get(key: string): string | null {
    const entry = this.entries[key];
    return entry ? this.decode(entry) : null;
  }

  /** All readable values — the snapshot handed to renderers at preload. */
  snapshot(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const key of Object.keys(this.entries)) {
      const v = this.get(key);
      if (v !== null) out[key] = v;
    }
    return out;
  }

  /** Set (string) or delete (null). Returns false for keys outside MACHINE_KEYS. */
  set(key: string, value: string | null): boolean {
    if (!isMachineKey(key)) return false;
    if (value === null) {
      delete this.entries[key];
    } else if (this.crypto.isEncryptionAvailable()) {
      this.entries[key] = { enc: this.crypto.encryptString(value).toString('base64') };
    } else {
      if (!this.warnedPlain) {
        console.warn('[MachineStore] OS encryption unavailable — storing machine secrets as plain text');
        this.warnedPlain = true;
      }
      this.entries[key] = { plain: value };
    }
    this.persist();
    return true;
  }

  /** Whether values are encrypted at rest on this machine (for the UI). */
  isEncrypted(): boolean {
    return this.crypto.isEncryptionAvailable();
  }
}
