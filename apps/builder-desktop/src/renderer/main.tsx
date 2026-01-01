import { ElectronStorageAdapter } from './ElectronStorageAdapter';

/**
 * Electron-specific initialization for the ASAPS Builder
 *
 * The actual builder UI is loaded separately - this file sets up
 * the Electron bridge for native filesystem access and menu handling.
 */

// Set up Electron-specific environment
if (window.electronAPI) {
  console.log('[ASAPS Builder Desktop] Running in Electron');
  console.log('[ASAPS Builder Desktop] Platform:', window.electronAPI.platform);

  // Register the Electron storage adapter globally
  // The builder will check for this and use it instead of IndexedDB
  (window as any).__ASAPS_STORAGE_ADAPTER__ = ElectronStorageAdapter;
  (window as any).__ASAPS_IS_ELECTRON__ = true;

  // Handle menu events by dispatching custom events
  window.electronAPI.onMenuNewProject(() => {
    window.dispatchEvent(new CustomEvent('asaps:new-project'));
  });

  window.electronAPI.onMenuSave(() => {
    window.dispatchEvent(new CustomEvent('asaps:save'));
  });

  window.electronAPI.onMenuExport(() => {
    window.dispatchEvent(new CustomEvent('asaps:export'));
  });

  window.electronAPI.onProjectOpen((path) => {
    window.dispatchEvent(new CustomEvent('asaps:open-project', { detail: { path } }));
  });

  window.electronAPI.onProjectSaveAs((path) => {
    window.dispatchEvent(new CustomEvent('asaps:save-as', { detail: { path } }));
  });

  console.log('[ASAPS Builder Desktop] Electron bridge initialized');
}

// The builder app will be loaded via the vite config that includes the builder source
