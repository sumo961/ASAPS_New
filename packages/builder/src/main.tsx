import React, { useCallback, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { PersistenceProvider, usePersistence } from './contexts/PersistenceContext';
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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PersistenceProvider
      autoSave={true}
      autoSaveDelay={30000}
      debug={true}
    >
      <VCSBridge>
        <App />
      </VCSBridge>
    </PersistenceProvider>
  </React.StrictMode>
);
