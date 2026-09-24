import { describe, it, expect } from 'vitest';
import { MachineStore, type MachineCrypto, type MachineFileIO } from '../machineStore';

// Reversible stand-in for safeStorage: "encrypts" by reversing + tagging.
function fakeCrypto(available = true): MachineCrypto {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (p) => Buffer.from(`ENC:${[...p].reverse().join('')}`),
    decryptString: (c) => {
      const s = c.toString();
      if (!s.startsWith('ENC:')) throw new Error('bad ciphertext');
      return [...s.slice(4)].reverse().join('');
    },
  };
}
function memIO(initial: string | null = null): MachineFileIO & { contents: string | null } {
  const io = { contents: initial, read: () => io.contents, write: (c: string) => { io.contents = c; } };
  return io;
}

const aiConfig = JSON.stringify({ provider: 'claude', apiKey: 'sk-ant-secret-123' });

describe('MachineStore', () => {
  it('stores values encrypted at rest and reads them back', () => {
    const io = memIO();
    const store = new MachineStore(fakeCrypto(), io);
    expect(store.set('asaps_ai_config', aiConfig)).toBe(true);
    expect(io.contents).not.toContain('sk-ant-secret-123');
    expect(store.get('asaps_ai_config')).toBe(aiConfig);
    // a fresh instance (next app start) reads the persisted file
    expect(new MachineStore(fakeCrypto(), io).get('asaps_ai_config')).toBe(aiConfig);
  });

  it('refuses keys outside the machine scope', () => {
    const store = new MachineStore(fakeCrypto(), memIO());
    expect(store.set('asaps_ui_tier', 'advanced')).toBe(false);
    expect(store.get('asaps_ui_tier')).toBeNull();
  });

  it('delete removes the entry from disk', () => {
    const io = memIO();
    const store = new MachineStore(fakeCrypto(), io);
    store.set('asaps_brave_api_key', 'BSA-1');
    store.set('asaps_brave_api_key', null);
    expect(store.get('asaps_brave_api_key')).toBeNull();
    expect(io.contents).not.toContain('asaps_brave_api_key');
  });

  it('without OS encryption, keeps working with plain values and says so', () => {
    const io = memIO();
    const store = new MachineStore(fakeCrypto(false), io);
    store.set('asaps_tts_config', '{"apiKey":"x"}');
    expect(store.isEncrypted()).toBe(false);
    expect(store.get('asaps_tts_config')).toBe('{"apiKey":"x"}');
    expect(JSON.parse(io.contents!).entries.asaps_tts_config).toEqual({ plain: '{"apiKey":"x"}' });
  });

  it('a value that cannot be decrypted (other machine / reset keychain) reads as absent, others survive', () => {
    const io = memIO(JSON.stringify({ version: 1, entries: {
      asaps_ai_config: { enc: Buffer.from('garbage').toString('base64') },
      asaps_stt_config: { plain: '{"p":1}' },
    } }));
    const store = new MachineStore(fakeCrypto(), io);
    expect(store.get('asaps_ai_config')).toBeNull();
    expect(store.snapshot()).toEqual({ asaps_stt_config: '{"p":1}' });
  });

  it('an unreadable file starts empty instead of throwing', () => {
    const store = new MachineStore(fakeCrypto(), memIO('{not json'));
    expect(store.snapshot()).toEqual({});
  });
});
