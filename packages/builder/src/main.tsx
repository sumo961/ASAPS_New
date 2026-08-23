import React, { useCallback, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { PersistenceProvider, usePersistence } from './contexts/PersistenceContext';
import { TranslationProvider } from './contexts/TranslationContext';
import { VCSStatusProvider } from './vcs/VCSStatusProvider';
import './styles/main.css';

/**
 * Bridge component that connects persistence (save) to VCS.
 * Flushes pending in-memory saves before each VCS status refresh
 * so that Git sees the latest beat edits on disk.
 */
function VCSBridge({ children }: { children: React.ReactNode }) {
  const { saveNow, hasUnsavedChanges } = usePersistence();
  const saveNowRef = useRef(saveNow);
  const hasUnsavedRef = useRef(hasUnsavedChanges);
  saveNowRef.current = saveNow;
  hasUnsavedRef.current = hasUnsavedChanges;

  const flushSaves = useCallback(async () => {
    if (hasUnsavedRef.current) {
      await saveNowRef.current();
    }
  }, []);

  return (
    <VCSStatusProvider onBeforeRefresh={flushSaves}>
      {children}
    </VCSStatusProvider>
  );
}

// The Preview Window is a second full app instance in its own window. It
// must never WRITE the project (its autosave raced the main window's) and
// must never WATCH it either — with both windows armed, the main window's
// own autosave looked like an external change to the PW's watcher and
// raised the "files changed outside ASAPS" alert with ~120 files listed.
const isPreviewWindow = typeof window !== 'undefined' && window.location.hash === '#/preview-window';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PersistenceProvider
      autoSave={!isPreviewWindow}
      autoSaveDelay={30000}
      debug={true}
      passive={isPreviewWindow}
    >
      <TranslationProvider>
        <VCSBridge>
          <App />
        </VCSBridge>
      </TranslationProvider>
    </PersistenceProvider>
  </React.StrictMode>
);
