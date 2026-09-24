import { machineStorage } from './machineStorage';

/**
 * One sentence telling the author where their API key lives — accurate for
 * the desktop app (encrypted by the operating system — macOS Keychain,
 * Windows Data Protection tied to the user account, the desktop keyring on
 * Linux — or plain on systems
 * without one) and the browser build (this browser's storage).
 */
export function keyStorageNote(): string {
  const desktop = typeof window !== 'undefined' && !!(window as any).electronAPI?.machineStore;
  if (!desktop) {
    return 'Your API key is saved in this browser’s storage, on this computer only.';
  }
  return machineStorage.isEncryptedAtRest()
    ? `Your API key is saved on this computer, encrypted by ${osProtectionName()} so only your user account can read it. It is never stored in a project.`
    : 'Your API key is saved on this computer, unencrypted \u2014 this system offers no secure key storage. It is never stored in a project.';
}

/** Name of the OS facility that protects the keys, for the note above. */
function osProtectionName(): string {
  const platform = (typeof window !== 'undefined' && (window as any).electronAPI?.platform) || '';
  if (platform === 'darwin') return 'the macOS Keychain';
  if (platform === 'win32') return 'Windows Data Protection';
  if (platform === 'linux') return 'your desktop\u2019s keyring';
  return 'the operating system';
}
