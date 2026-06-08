/**
 * StartWindow — Electron-only standalone start screen page. Loads at
 * the URL hash route `#/start-window`, hosted in its own BrowserWindow
 * spawned by the main process at app launch. The route is also
 * reachable in web for dev-time visual verification, but the web
 * build's normal entry point is still the in-editor modal Browser.
 *
 * Surfaces the same three create paths as the in-editor + New picker
 * AND the recent projects grid as a single unified Project Browser
 * page. Whatever the user picks results in `electronAPI.start.pick(...)`
 * being called — the main process then opens the editor window with
 * the encoded intent and closes this start window.
 *
 * Web fallback: when `window.electronAPI?.start` is not available
 * (i.e. web build), picks navigate to `/` with the intent appended
 * as query params so a single-page-app boot can consume them. This
 * makes the route work in plain Vite dev without Electron mock.
 */
import React from 'react';
import { ProjectLibrary } from '../components/ProjectLibrary';
import { useProject } from '../contexts/PersistenceContext';
import { importProjectFromZip } from '../utils/projectZipManager';

// macOS Electron uses `titleBarStyle: 'hiddenInset'` which puts the
// red/yellow/green traffic-light buttons inside the content area at
// the top-left. Without a left inset, our 📁 + ASAPS Builder header
// sits under the buttons. Match the editor's offset (~80px).
const isElectronMac = typeof window !== 'undefined' &&
  !!(window as any).electronAPI?.isElectron &&
  (window as any).electronAPI?.platform === 'darwin';

interface StartIntent {
  openProject?: string;
  createEmpty?: boolean;
  openStoryGen?: boolean;
  openIdeator?: boolean;
}

function dispatchPick(intent: StartIntent) {
  // Build the editor-window URL params from the intent. Mirrors what
  // the in-editor boot logic reads on mount (see App.tsx consumeBootIntent).
  const params = new URLSearchParams();
  if (intent.openProject) params.set('openProject', intent.openProject);
  if (intent.createEmpty) params.set('createEmpty', '1');
  if (intent.openStoryGen) params.set('openStoryGen', '1');
  if (intent.openIdeator) params.set('openIdeator', '1');

  const electronStart = (window as any).electronAPI?.start;
  if (electronStart?.pick) {
    // Electron: main process opens editor + closes this window.
    electronStart.pick(Object.fromEntries(params.entries()));
    return;
  }

  // Web fallback — navigate the same tab back to the editor. The
  // sessionStorage flag is already set (we opened the Browser once),
  // so the editor won't re-overlay the modal.
  const query = params.toString();
  window.location.href = query ? `/?${query}` : '/';
}

const LAST_PROJECT_KEY = 'asaps-last-project-id';

export const StartWindow: React.FC = () => {
  const { create: createProject } = useProject();
  // Read the last-session project id so the Continue banner can
  // surface it. The full Project metadata is fetched by ProjectLibrary
  // during its listProjects sweep; we just need the id to flag it.
  const lastProjectId = typeof window !== 'undefined'
    ? localStorage.getItem(LAST_PROJECT_KEY) || undefined
    : undefined;

  // Empty path — create a fresh project right here in the start
  // window's storage context (same IndexedDB) and hand the new id
  // to the editor.
  const handleEmpty = async () => {
    try {
      const newId = await createProject('Untitled Project', undefined);
      if (newId) {
        dispatchPick({ openProject: newId });
      } else {
        dispatchPick({ createEmpty: true });
      }
    } catch (err) {
      console.warn('[StartWindow] createProject failed; deferring to editor', err);
      dispatchPick({ createEmpty: true });
    }
  };

  const handlePrompt = () => dispatchPick({ openStoryGen: true });
  const handleIdeator = () => dispatchPick({ openIdeator: true });
  const handleLoadExisting = (projectId: string) => dispatchPick({ openProject: projectId });

  // Import — run the existing zip importer in this window's storage
  // context, then hand the imported project's id to the editor.
  const handleImportFile = async (file: File) => {
    try {
      const result = await importProjectFromZip(file, {});
      if (result.success && result.projectId) {
        dispatchPick({ openProject: result.projectId });
      } else if (result.error) {
        alert(`Import failed: ${result.error}`);
      }
    } catch (err) {
      alert(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Stateless ProjectLibrary uses its own currentProjectDeleted, etc.
  // Pass through what we know; isModal=false makes it render full-page.
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header
        className="px-6 py-4 border-b border-gray-200 bg-white"
        style={{
          // Reserve space for the macOS traffic-light buttons that
          // overlay the top-left of the content area. WebKit's
          // `-webkit-app-region: drag` makes the whole header
          // draggable; the icon + title block opt out so they're
          // still clickable / focusable.
          paddingLeft: isElectronMac ? 96 : undefined,
          ...(({ WebkitAppRegion: 'drag' } as React.CSSProperties)),
        }}
      >
        <div
          className="flex items-center gap-3"
          style={{ ...(({ WebkitAppRegion: 'no-drag' } as React.CSSProperties)) }}
        >
          <div className="text-2xl">📁</div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">ASAPS Builder</h1>
            <div className="text-xs text-gray-500">Start a new project or continue where you left off</div>
          </div>
        </div>
      </header>
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto">
          <ProjectLibrary
            isModal={false}
            onLoadProject={handleLoadExisting}
            onCreateProject={handleEmpty}
            onOpenStoryFromPrompt={handlePrompt}
            onOpenIdeator={handleIdeator}
            onImportZipFile={handleImportFile}
            currentProjectId={lastProjectId}
            onContinueLast={lastProjectId ? () => handleLoadExisting(lastProjectId) : undefined}
          />
        </div>
      </div>
    </div>
  );
};

export default StartWindow;
