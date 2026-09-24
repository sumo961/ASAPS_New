import { machineStorage } from './machineStorage';

/**
 * One sentence telling the author where their API key lives — accurate for
 * the desktop app (encrypted by the OS keychain, or plain on systems
 * without one) and the browser build (this browser's storage).
 */
export function keyStorageNote(): string {
  const desktop = typeof window !== 'undefined' && !!(window as any).electronAPI?.machineStore;
  if (!desktop) {
    return 'Your API key is saved in this browser’s storage, on this computer only.';
  }
  return machineStorage.isEncryptedAtRest()
    ? 'Your API key is saved on this computer, encrypted with the system keychain. It is never stored in a project.'
    : 'Your API key is saved on this computer (this system offers no keychain encryption). It is never stored in a project.';
}
