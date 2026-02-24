import { useState, useCallback, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { WorkspaceView } from './components/WorkspaceView';
import { Inspector } from './components/Inspector';
import { StoryPreview } from './components/preview/StoryPreview';
import { PreviewWindow } from './pages/PreviewWindow';
import { previewWindowManager, type PreviewWindowState } from './services/PreviewWindowManager';
import { GlobalSettingsInspector } from './components/settings/GlobalSettingsInspector';
import { useStoryBuilder } from './hooks/useStoryBuilder';
import { CharacterManager } from './components/characters/CharacterManager';
import { AssetManager } from './components/assets/AssetManager';
import { ImportAsmlDialog } from './components/ImportAsmlDialog';
import { ImportTwineDialog } from './components/ImportTwineDialog';
import { Story, ASMLParser, type AssetManifest, type ImportResult } from '@asaps/core';
import type { Beat, Cluster, ContainerBeatPosition } from '@asaps/core';
import { useSave, useProject, usePersistence } from './contexts/PersistenceContext';
import { Character } from './types/character';
import type { Asset } from './components/assets/AssetManager';
import type { GlobalSettings } from './components/settings/GlobalSettingsInspector';
import { loadProjectData } from './utils/projectDeserializer';
import { downloadProjectAsZip, importProjectFromZip, getProjectDataForExport } from './utils/projectZipManager';
import { SaveUnsavedWorkDialog } from './components/SaveUnsavedWorkDialog';
import { SaveProjectDialog } from './components/SaveProjectDialog';
import { InputModal } from './components/InputModal';
import { getStorageAdapter } from './storage/HybridStorageAdapter';
import { assetToStored, extractBlobFromAsset } from './storage/AssetStorageAdapter';
import { DebugPanel } from './components/debug/DebugPanel';
import { SearchPanel } from './components/search';
import { HelperCommandInput } from './components/ai/HelperCommandInput';
import { applyTreeLayoutToBeats, applyClusterAwareTreeLayout, ClusterAwareLayoutResult } from './utils/TreeLayoutAlgorithm';
import { validateAIStory, formatValidationResult } from './utils/aiStoryValidator';
import { validateStoryLogic, formatLogicValidationResult } from './utils/storyLogicValidator';
import { preloadFonts } from './utils/fontRegistry';
import { useThemes, type ThemeAssetUrls } from './hooks/useThemes';
import { useAIDebug } from './hooks/useAIDebug';
import { getSavedAIConfig } from './hooks/useAI';
import { useCommandManager } from './hooks/useCommandManager';
import { getCommandManager } from './commands/CommandManager';
import { UpdateBeatCommand, AddBeatCommand, DeleteBeatCommand, MoveBeatCommand, type BeatStateMutations } from './commands/BeatCommands';
import { AIDebugModal } from './components/ai/AIDebugModal';
import { MergeDialogTreesModal } from './components/tools/MergeDialogTreesModal';
import { HtmlExportDialog } from './components/export/HtmlExportDialog';
import { getThemeService } from './services/ThemeService';
import { themeToGlobalSettings } from './themes/migration/GlobalSettingsAdapter';
import { BUILT_IN_THEMES } from '@asaps/core';
import { useVCSStatus } from './vcs/VCSStatusProvider';
import { VCSPanel } from './components/vcs/VCSPanel';
import { DiffViewer } from './components/vcs/DiffViewer';
import { VCSToast } from './components/vcs/VCSToast';
import { GitInitDialog } from './components/vcs/GitInitDialog';
import { CloneRepoDialog } from './components/vcs/CloneRepoDialog';
import { useTranslationState, useTranslationActions } from './contexts/TranslationContext';
import { applyTranslationResource } from './export/StoryTranslator';

// Type declaration for Electron API exposed by preload
declare global {
  interface Window {
    electronAPI?: {
      fs: {
        readFile: (path: string) => Promise<ArrayBuffer>;
        writeFile: (path: string, data: ArrayBuffer | Uint8Array | string) => Promise<void>;
        readDir: (path: string) => Promise<Array<{ name: string; isDirectory: boolean | (() => boolean) }>>;
        mkdir: (path: string) => Promise<void>;
        exists: (path: string) => Promise<boolean>;
        unlink: (path: string) => Promise<void>;
        copyFile: (src: string, dst: string) => Promise<void>;
        stat: (path: string) => Promise<{ size: number; mtime: string; isDirectory: boolean }>;
        watchDir: (path: string, callback: (changedFiles: string[]) => void) => () => void;
        runCommand: (command: string, args: string[], cwd?: string, timeout?: number) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
      };
      dialog?: {
        save: (options: { defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }) => Promise<{ canceled: boolean; filePath?: string }>;
        open: (options: { properties?: string[]; filters?: Array<{ name: string; extensions: string[] }> }) => Promise<{ canceled: boolean; filePaths: string[] }>;
      };
      settings?: {
        getMcpEnabled: () => Promise<boolean>;
        setMcpEnabled: (enabled: boolean) => Promise<boolean>;
      };
      onMenuNewProject: (callback: () => void) => () => void;
      onMenuSave: (callback: () => void) => () => void;
      onMenuExport: (callback: () => void) => () => void;
      onMenuAutoArrange: (callback: () => void) => () => void;
      onMcpSettingChanged?: (callback: (enabled: boolean) => void) => () => void;
      onProjectOpen: (callback: (path: string) => void) => () => void;
      onProjectSaveAs: (callback: (path: string) => void) => () => void;
      onProjectOpenFolder?: (callback: (path: string) => void) => () => void;
      onProjectSaveAsFolder?: (callback: (path: string) => void) => () => void;
      onStoryInject?: (callback: (data: any) => void) => () => void;
      onVCSCommit?: (callback: () => void) => () => void;
      onVCSPush?: (callback: () => void) => () => void;
      onVCSPull?: (callback: () => void) => () => void;
      onVCSStash?: (callback: () => void) => () => void;
      onVCSStashPop?: (callback: () => void) => () => void;
      onVCSTogglePanel?: (callback: () => void) => () => void;
      onVCSRefresh?: (callback: () => void) => () => void;
      onMenuCloneRepo?: (callback: () => void) => () => void;
      isElectron: boolean;
    };
  }
}

// Helper to check if running in Electron
const isElectron = () => typeof window !== 'undefined' && !!window.electronAPI?.isElectron;

// Check if we're in the preview window route
const isPreviewWindowRoute = () => typeof window !== 'undefined' && window.location.hash === '#/preview-window';

// Refs to hold current state for sync operations (avoids stale closures)
// These are updated on every render and provide immediate access to current values

/**
 * Apply project-level AI settings as localStorage defaults when no local config exists.
 * This lets collaborators inherit provider/model preferences from the project without
 * sharing API keys (which must always be supplied individually).
 */
function applyProjectAIDefaults(globalSettings: any): void {
  if (!globalSettings?.ai) return;
  if (getSavedAIConfig()?.apiKey) return; // User already has their own config with a key
  const ai = globalSettings.ai;
  try {
    const config = {
      provider: ai.provider || 'openai',
      apiKey: '',
      model: ai.model,
      baseUrl: ai.baseUrl,
      maxTokens: ai.maxTokens,
      reasoningEffort: ai.reasoningEffort,
      providerType: ai.providerType,
    };
    localStorage.setItem('asaps_ai_config', JSON.stringify(config));
    console.log('[App] Applied project-level AI defaults:', ai.providerType || ai.provider);
  } catch { /* ignore localStorage errors */ }
}

/**
 * Load assets directly from a directory project's manifest + filesystem.
 * Bypasses IndexedDB entirely — used when IndexedDB is unavailable (e.g. Windows Electron).
 */
async function loadAssetsFromDirectory(dirPath: string): Promise<Asset[]> {
  const api = (window as any).electronAPI;
  if (!api?.fs) return [];

  const sep = dirPath.includes('\\') ? '\\' : '/';
  const manifestPath = [dirPath, 'assets', '_manifest.json'].join(sep);

  try {
    const exists = await api.fs.exists(manifestPath);
    if (!exists) {
      console.log('[App] No asset manifest found at', manifestPath);
      return [];
    }

    const raw = await api.fs.readFile(manifestPath);
    const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
    const manifest = JSON.parse(text);
    const assets: Asset[] = [];

    for (const [assetId, entry] of Object.entries(manifest.assets || {})) {
      const e = entry as any;
      const assetPath = [dirPath, 'assets', e.folder, e.filename].join(sep);
      try {
        const fileExists = await api.fs.exists(assetPath);
        if (!fileExists) {
          console.warn('[App] Asset file not found:', assetPath);
          continue;
        }
        const buffer = await api.fs.readFile(assetPath);
        const blob = new Blob([buffer], { type: e.mimeType });
        const url = URL.createObjectURL(blob);
        assets.push({
          id: assetId,
          name: e.filename,
          type: e.mimeType?.startsWith('image/') ? 'image' :
                e.mimeType?.startsWith('audio/') ? 'audio' :
                e.mimeType?.startsWith('video/') ? 'video' :
                e.mimeType?.includes('font') ? 'font' : 'image',
          subType: e.metadata?.subType,
          url,
          size: e.size || blob.size,
          uploadedAt: e.uploadedAt ? new Date(e.uploadedAt) : new Date(),
        });
      } catch (fileErr) {
        console.warn('[App] Failed to load asset file:', assetPath, fileErr);
      }
    }

    console.log('[App] Loaded', assets.length, 'assets directly from directory');
    return assets;
  } catch (err) {
    console.error('[App] Failed to load directory assets:', err);
    return [];
  }
}

function App() {
  // If we're in the preview window route, render the standalone preview
  if (isPreviewWindowRoute()) {
    return <PreviewWindow />;
  }

  const { state, actions, initializeStory } = useStoryBuilder();

  // Stable mutations ref for the command system — always points to current actions
  // so undo/redo callbacks never close over stale state
  const stableMutations = useRef<BeatStateMutations>({
    addBeat: () => {},
    updateBeat: () => {},
    deleteBeat: () => {},
    moveBeat: () => {},
  });
  stableMutations.current = {
    addBeat: (beat) => actions.addExistingBeat(beat),
    updateBeat: (id, updates) => actions.updateBeat(id, updates as Partial<Beat>),
    deleteBeat: (id) => actions.deleteBeat(id),
    moveBeat: (id, pos) => actions.moveBeat(id, pos),
  };

  const [selectedBeat, setSelectedBeat] = useState<Beat | null>(null);
  const [beatRefreshKey, setBeatRefreshKey] = useState(0); // Increments to force visual editor refresh
  const [showPreview, setShowPreview] = useState(false);
  const [selectedCluster, setSelectedCluster] = useState<Cluster | null>(null);
  const [paletteCollapsed, setPaletteCollapsed] = useState(false);
  const [showCharacterManager, setShowCharacterManager] = useState(false);
  const characterSelectionCallbackRef = useRef<((character: Character) => void) | null>(null);
  const [showAssetManager, setShowAssetManager] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showSaveProjectDialog, setShowSaveProjectDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<string>('');
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [showSearchPanel, setShowSearchPanel] = useState(false);
  const [showHelperCommands, setShowHelperCommands] = useState(false);
  const [highlightedBeatIds, setHighlightedBeatIds] = useState<string[]>([]);
  const [previewWindowOpen, setPreviewWindowOpen] = useState(false);
  const [triggerNewProject, setTriggerNewProject] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);

  // Cluster naming modal state (replaces prompt() for Electron compatibility)
  const [showClusterNameModal, setShowClusterNameModal] = useState(false);
  const [clusterNameDefault, setClusterNameDefault] = useState('');

  // Import conflict modal state (replaces prompt() for Electron compatibility)
  const [showImportConflictModal, setShowImportConflictModal] = useState(false);
  const [importConflictDefault, setImportConflictDefault] = useState('');
  const [importConflictLabel, setImportConflictLabel] = useState('');
  const importConflictResolverRef = useRef<((value: string | null) => void) | null>(null);

  // AI Debug hook - automatically runs after AI story generation
  const {
    result: aiDebugResult,
    showModal: showAIDebugModal,
    runDebug: runAIDebug,
    closeModal: closeAIDebugModal,
  } = useAIDebug({ checkUI: true, checkConsole: true, delay: 1500 });

  // Command manager callback - see below for useCommandManager call after handlers are defined

  // Import ASML dialog state
  const [showImportAsmlDialog, setShowImportAsmlDialog] = useState(false);
  const [importAsmlContent, setImportAsmlContent] = useState('');
  const [importAsmlManifest, setImportAsmlManifest] = useState<AssetManifest | null>(null);

  // Merge DialogTrees modal state
  const [showMergeDialogTrees, setShowMergeDialogTrees] = useState(false);

  // HTML Export dialog state
  const [showHtmlExportDialog, setShowHtmlExportDialog] = useState(false);

  // Import Twine dialog state
  const [showImportTwineDialog, setShowImportTwineDialog] = useState(false);

  // VCS Panel state
  const [vcsPanelOpen, setVcsPanelOpen] = useState(false);
  const [diffViewerFile, setDiffViewerFile] = useState<string | null>(null);
  const [showGitInitDialog, setShowGitInitDialog] = useState(false);
  const [showCloneRepoDialog, setShowCloneRepoDialog] = useState(false);

  // Translation state
  const translationState = useTranslationState();
  const translationActions = useTranslationActions();
  const translationStateRef = useRef(translationState);
  translationStateRef.current = translationState;
  const translationActionsRef = useRef(translationActions);
  translationActionsRef.current = translationActions;

  // Asset and character state
  const [assets, setAssets] = useState<Asset[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);

  // Theme state - track current theme ID for asset loading
  const [currentThemeId, setCurrentThemeId] = useState<string | undefined>(undefined);

  // Theme management hook - provides theme assets (fonts, graphics)
  const { loadThemeAssets, themeAssets } = useThemes(currentThemeId);

  // Load theme assets when theme changes
  useEffect(() => {
    console.log('[App] Theme effect triggered - currentThemeId:', currentThemeId);
    if (currentThemeId) {
      console.log('[App] Loading theme assets for:', currentThemeId);
      loadThemeAssets(currentThemeId).then(assets => {
        console.log('[App] Theme assets loaded:', {
          hasAssets: !!assets,
          buttonNormal: !!assets?.buttonNormal,
          buttonHover: !!assets?.buttonHover,
          textboxFrame: !!assets?.textboxFrame,
        });
      });
    }
  }, [currentThemeId, loadThemeAssets]);

  // Save theme ID to project when it changes (accessed after useProject hook is called)
  const currentThemeIdRef = useRef<string | undefined>(currentThemeId);
  currentThemeIdRef.current = currentThemeId;

  // CRITICAL: Refs to hold current state values for sync operations
  // These avoid stale closures when syncProjectData is called inside setTimeout
  const beatsRef = useRef<Beat[]>(state.beats);
  const connectionsRef = useRef(state.connections);
  const titleRef = useRef(state.title);
  const authorRef = useRef(state.author);
  const charactersRef = useRef<Character[]>(characters);
  const clustersRef = useRef<Cluster[]>(state.clusters || []);
  const containerBeatPositionsRef = useRef<ContainerBeatPosition[]>(state.containerBeatPositions || []);
  const assetsRef = useRef<Asset[]>(assets);
  const globalSettingsRef = useRef<GlobalSettings | null>(null);

  // Update refs on every render to ensure they always have current values
  useEffect(() => {
    beatsRef.current = state.beats;
    connectionsRef.current = state.connections;
    titleRef.current = state.title;
    authorRef.current = state.author;
    clustersRef.current = state.clusters || [];
    containerBeatPositionsRef.current = state.containerBeatPositions || [];
  }, [state.beats, state.connections, state.title, state.author, state.clusters, state.containerBeatPositions]);

  useEffect(() => {
    charactersRef.current = characters;
  }, [characters]);

  // Preload custom fonts when assets change
  useEffect(() => {
    preloadFonts(assets);
  }, [assets]);

  useEffect(() => {
    assetsRef.current = assets;
  }, [assets]);

  // Keyboard shortcut for search (Ctrl+F)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setShowSearchPanel(prev => !prev);
      }
      // Ctrl/Cmd+Shift+K: Toggle AI Helper Commands
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'k') {
        e.preventDefault();
        setShowHelperCommands(prev => !prev);
      }
      };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Subscribe to preview window state changes
  useEffect(() => {
    const unsubscribe = previewWindowManager.subscribe((windowState: PreviewWindowState) => {
      setPreviewWindowOpen(windowState.isOpen);
    });
    return unsubscribe;
  }, []);

  // Project and global settings
  const [projectSettings, setProjectSettings] = useState({
    width: 1024,
    height: 768,
    aspectRatio: '4:3',
    scalingMode: 'contain',
    boxVisibility: 'all' as const
  });

  // Update global settings when story title changes
  useEffect(() => {
    setGlobalSettings(prev => ({
      ...prev,
      debug: prev.debug || { firstbeat: '', showvals: false }
    }));
  }, [state.title, state.author]);

  // DEBUG HELPER: Expose function to load debug story from console
  // Usage: window.loadDebugStory() or window.loadDebugStory('/path/to/debug.json')
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  useEffect(() => {
    (window as any).loadDebugStory = async (url = '/debug-story.json') => {
      try {
        const response = await fetch(url);
        const debugData = await response.json();

        if (!debugData.story?.beats) {
          console.error('[Debug] No beats found in debug file');
          return;
        }

        const { BeatTypeRegistry } = await import('@asaps/core');
        const registry = BeatTypeRegistry.getInstance();

        const createdBeats = debugData.story.beats.map((beatData: any) => {
          const beat = registry.createBeat(beatData.type, {
            ...beatData,
            parameters: beatData.parameters || {},
            connections: beatData.connections?.map((conn: any) => ({
              targetId: conn.target || conn.targetId,
              label: conn.label,
              condition: conn.condition
            })) || []
          });
          if (beatData.position) {
            beat.x = beatData.position.x;
            beat.y = beatData.position.y;
          }
          return beat;
        });

        const connections: Array<{ id: string; source: string; target: string; label?: string }> = [];
        createdBeats.forEach((beat: any) => {
          const beatConnections = beat.getConnections();
          beatConnections.forEach((conn: any, idx: number) => {
            if (conn.targetId) {
              connections.push({
                id: `${beat.id}-${conn.targetId}-${idx}`,
                source: beat.id,
                target: conn.targetId,
                label: conn.label
              });
            }
          });
        });

        actionsRef.current.loadStoryData({
          title: debugData.story.metadata?.title || debugData.title || 'Debug Story',
          author: debugData.story.metadata?.author || 'Debug',
          beats: createdBeats,
          connections: connections,
          settings: {},
          characters: [],
          clusters: []
        });

        console.log('[Debug] Story loaded:', createdBeats.length, 'beats');
        return { success: true, beatCount: createdBeats.length };
      } catch (error) {
        console.error('[Debug] Failed to load debug story:', error);
        return { success: false, error };
      }
    };

    console.log('[Debug] Debug helper available: window.loadDebugStory()');

    return () => {
      delete (window as any).loadDebugStory;
    };
  }, []);

  const [globalSettings, setGlobalSettings] = useState<GlobalSettings>({
    project: {
      width: 1024,
      height: 768,
      aspectRatio: '4:3',
      scalingMode: 'fit'
    },
    colors: {
      pcolor: '#ffffff',       // Button/choice background color
      palpha: 100,             // Button/choice opacity (0-100)
      ptextcolor: '',          // Button text color (auto-calculated if empty)
      nonpcolor: '#cccccc',    // NPC/narrator text box background
      nonpalpha: 100,          // NPC/narrator text box opacity (0-100)
      nonptextcolor: '',       // NPC text color (auto-calculated if empty)
      bgColor: '#1a1a2e',      // Dark blue background
      textBoxBorder: '#4a90d9' // Blue border
    },
    fonts: {
      titleFont: 'Georgia',
      textFont: 'Arial',
      btnFont: 'Arial',
      fontSize: {
        title: 32,
        text: 18,
        button: 18
      }
    },
    textbox: {
      radius: 8,
      padding: 20,
      borderWidth: 2,
      opacity: 90,  // Text box background opacity percentage (0-100)
      position: 'bottom',
      boxVisibility: 'all'
    },
    textEffects: {
      animation: 'none',        // No typewriter effect by default
      typewriterSpeed: 15,      // Characters per second (if typewriter enabled)
      fadeInDuration: 200
    },
    hotspots: {
      visible: true,
      labels: true,
      highlightColor: '#ffff00',
      opacity: 30,
      showInPreview: 'visible',
      labelDisplay: 'hover'
    },
    sound: {
      backgroundMusic: '',
      backgroundVolume: 100,
      mute: false
    },
    copyright: {
      notice: '',
      year: new Date().getFullYear().toString(),
      owner: ''
    },
    debug: {
      firstbeat: state.beats[0]?.id || '',
      showvals: false
    }
  });

  // Update globalSettingsRef whenever globalSettings changes
  useEffect(() => {
    globalSettingsRef.current = globalSettings;
  }, [globalSettings]);

  // Persistence hooks
  const { markChanged, saveNow } = useSave();
  const { updateStory, updateGlobalSettings, project: currentProject, load: loadProject, create: createProject, saveCurrent, updateMetadata, discardUntitled } = useProject();
  const { isUntitledProject, setIsUntitledProject, hasUnsavedChanges, storage, registerSyncCallback, unregisterSyncCallback, pauseAutoSave, resumeAutoSave, initialized: storageInitialized, openDirectoryProject, saveAsDirectory, projectFormat, projectPath } = usePersistence();
  const vcs = useVCSStatus();
  const vcsRef = useRef(vcs);
  vcsRef.current = vcs;
  const currentProjectRef2 = useRef(currentProject);
  currentProjectRef2.current = currentProject;
  const stateTitleRef = useRef(state.title);
  stateTitleRef.current = state.title;
  const projectFormatRef = useRef(projectFormat);
  projectFormatRef.current = projectFormat;

  // Electron integration - set up menu event listeners
  useEffect(() => {
    if (!isElectron() || !window.electronAPI) {
      return;
    }

    console.log('[Electron] Setting up menu event listeners');

    // Handle opening a project from File menu
    const unsubscribeOpen = window.electronAPI.onProjectOpen(async (filePath: string) => {
      console.log('[Electron] Opening project:', filePath);
      try {
        const buffer = await window.electronAPI!.fs.readFile(filePath);
        const blob = new Blob([buffer]);
        const fileName = filePath.split('/').pop() || 'project.zip';
        const file = new File([blob], fileName, { type: 'application/zip' });

        // Helper function to handle import with conflict resolution
        const doImport = async (options: { overwrite?: boolean; generateNewId?: boolean; newName?: string } = {}): Promise<void> => {
          const result = await importProjectFromZip(file, options);

          if (result.conflict) {
            // Show modal dialog for conflict resolution (Electron compatible)
            const incomingName = result.conflict.incomingProjectName || 'Imported Project';
            const existingName = result.conflict.existingProjectName || 'Unknown';

            const newName = await showImportConflictPrompt(
              `A project with this ID already exists!\n\nExisting: "${existingName}"\nImporting: "${incomingName}"\n\nEnter a new name or type "OVERWRITE" to replace:`,
              incomingName + ' (Copy)'
            );

            if (newName === null) {
              return; // User cancelled
            } else if (newName.toUpperCase() === 'OVERWRITE') {
              return doImport({ overwrite: true });
            } else if (newName.trim()) {
              return doImport({ generateNewId: true, newName: newName.trim() });
            } else {
              alert('Please enter a valid name');
              return;
            }
          }

          if (result.success && result.projectId) {
            await loadProject(result.projectId);
            console.log('[Electron] Project loaded successfully');
          } else if (result.error) {
            throw new Error(result.error);
          }
        };

        await doImport({ generateNewId: false });
      } catch (error) {
        console.error('[Electron] Failed to open project:', error);
        alert(`Failed to open project: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    });

    // Handle Save from File menu
    const unsubscribeSave = window.electronAPI.onMenuSave(() => {
      console.log('[Electron] Save requested from menu');
      saveNow();
    });

    // Handle Export from File menu
    const unsubscribeExport = window.electronAPI.onMenuExport(async () => {
      console.log('[Electron] Export requested from menu');
      const proj = currentProjectRef2.current;
      if (proj) {
        try {
          await downloadProjectAsZip(proj.id, proj.name || stateTitleRef.current);
        } catch (error) {
          console.error('[Electron] Export failed:', error);
        }
      }
    });

    // Handle Save As from File menu - saves to internal storage with new name
    const unsubscribeSaveAs = window.electronAPI.onProjectSaveAs(async (filePath: string) => {
      console.log('[Electron] Save As requested:', filePath);
      try {
        // Extract project name from file path (e.g., "/path/to/MyStory.asaps.zip" -> "MyStory")
        const fileName = filePath.split('/').pop() || 'Project';
        const projectName = fileName
          .replace(/\.asaps\.zip$/i, '')
          .replace(/\.zip$/i, '')
          .replace(/\.asaps$/i, '') || 'Project';

        console.log('[Electron] Saving project as:', projectName);

        // Save to internal storage with the new name
        const newProjectId = await saveCurrent(projectName);
        console.log('[Electron] Project saved with new ID:', newProjectId);

        alert(`Project saved as "${projectName}"`);
      } catch (error) {
        console.error('[Electron] Save As failed:', error);
        alert(`Failed to save project: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    });

    // Handle New Project from File menu - open New Project dialog instead of silently creating empty
    const unsubscribeNew = window.electronAPI.onMenuNewProject(() => {
      console.log('[Electron] New Project requested from menu');
      setTriggerNewProject(prev => prev + 1);
    });

    // Handle Open Project Folder from File menu (directory format)
    const unsubscribeOpenFolder = window.electronAPI.onProjectOpenFolder?.(async (folderPath: string) => {
      console.log('[Electron] Opening project folder:', folderPath);
      try {
        const success = await openDirectoryProject(folderPath);
        if (success) {
          console.log('[Electron] Directory project opened successfully');
          // Initialize VCS tracking for the directory
          if (vcs) {
            await vcs.initialize(folderPath);
          }
        } else {
          alert('Failed to open project folder. Make sure it contains a valid ASAPS project.');
        }
      } catch (error) {
        console.error('[Electron] Failed to open project folder:', error);
        alert(`Failed to open project folder: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    });

    // Handle Save As Folder from File menu (directory format)
    const unsubscribeSaveAsFolder = window.electronAPI.onProjectSaveAsFolder?.(async (folderPath: string) => {
      console.log('[Electron] Saving project as folder:', folderPath);
      const wasDirectory = projectFormatRef.current === 'directory';
      try {
        const success = await saveAsDirectory(folderPath);
        if (success) {
          console.log('[Electron] Project saved as directory successfully');
          const currentVcs = vcsRef.current;
          if (!wasDirectory && currentVcs) {
            setTimeout(() => {
              alert('Project converted to folder format \u2014 version control is now available.');
            }, 200);
          } else {
            alert(`Project saved to folder: ${folderPath}`);
          }
          // Initialize VCS tracking for the new directory
          if (currentVcs) {
            await currentVcs.initialize(folderPath);
          }
        } else {
          alert('Failed to save project as folder.');
        }
      } catch (error) {
        console.error('[Electron] Failed to save as folder:', error);
        alert(`Failed to save project as folder: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    });

    // Cleanup
    return () => {
      unsubscribeOpen();
      unsubscribeSave();
      unsubscribeExport();
      unsubscribeSaveAs();
      unsubscribeNew();
      unsubscribeOpenFolder?.();
      unsubscribeSaveAsFolder?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadProject, saveNow, saveCurrent, openDirectoryProject, saveAsDirectory]);

  // Auto-initialize VCS when project format changes to directory.
  // IMPORTANT: We depend only on the specific primitive values we check, NOT the
  // entire `vcs` object — that object is recreated on every VCS state change
  // and would cause an infinite re-render loop.
  const vcsInitialized = vcs?.initialized ?? false;
  useEffect(() => {
    if (projectFormat === 'directory' && projectPath && vcs && !vcsInitialized) {
      console.log('[App] Auto-initializing VCS for directory project:', projectPath);
      vcs.initialize(projectPath).then(async () => {
        // Opportunistically detect remote URL and persist it
        try {
          const { gitListRemotes } = await import('./vcs/GitAdapter');
          const remotes = await gitListRemotes(projectPath);
          const origin = remotes.find(r => r.name === 'origin');
          if (origin?.url && currentProject && origin.url !== currentProject.vcsRemoteUrl) {
            console.log('[App] Detected VCS remote URL:', origin.url);
            const updatedProject = { ...currentProject, vcsRemoteUrl: origin.url };
            await storage.updateProject(updatedProject);
          }
        } catch (e) {
          // Non-fatal — remote URL detection is best-effort
          console.debug('[App] Could not detect VCS remote URL:', e);
        }
      });
    } else if (projectFormat !== 'directory' && vcsInitialized) {
      vcs?.clear();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectFormat, projectPath, vcsInitialized]);

  // Listen for stale-directory events from PersistenceContext (path no longer exists on reload)
  useEffect(() => {
    const handler = (e: Event) => {
      const dirPath = (e as CustomEvent).detail?.dirPath;
      alert(`The project folder could not be found:\n${dirPath}\n\nThe project has been reverted to local storage mode. Re-open the folder to restore version control.`);
    };
    window.addEventListener('asaps:stale-directory', handler);
    return () => window.removeEventListener('asaps:stale-directory', handler);
  }, []);

  // Flag: when set, the load effect will resume auto-save after completing.
  // This prevents auto-save from firing between openDirectoryProject and the
  // load effect, which would write pre-reset in-memory state back to disk.
  const resumeAutoSaveAfterLoadRef = useRef(false);

  // Listen for git-reset events — reload the directory project from disk
  // IMPORTANT: openDirectoryProject re-reads files into currentProject, but
  // the load effect (line ~1641) skips reload when project ID hasn't changed.
  // We clear loadedProjectIdRef so the effect sees a "new" project and reloads
  // beats, connections, settings, translations, etc.
  useEffect(() => {
    const handler = async () => {
      if (projectFormat !== 'directory' || !projectPath) return;
      console.log('[App] asaps:git-reset received — reloading project from disk');
      // Pause auto-save so stale in-memory state isn't written to disk
      // before the load effect updates refs from the reset commit
      pauseAutoSave();
      resumeAutoSaveAfterLoadRef.current = true;
      try {
        // Clear the loaded-project guard so the load effect will re-fire
        loadedProjectIdRef.current = null;
        const success = await openDirectoryProject(projectPath);
        if (!success) {
          resumeAutoSaveAfterLoadRef.current = false;
          resumeAutoSave();
        }
      } catch (e) {
        console.error('[App] Failed to reload project after git reset:', e);
        resumeAutoSaveAfterLoadRef.current = false;
        resumeAutoSave();
      }
    };
    window.addEventListener('asaps:git-reset', handler);
    return () => window.removeEventListener('asaps:git-reset', handler);
  }, [projectFormat, projectPath, openDirectoryProject, pauseAutoSave, resumeAutoSave]);

  /**
   * Sync current story state to project before saving
   * This ensures beats, characters, etc. are persisted to the project story
   *
   * CRITICAL: Uses refs (beatsRef, etc.) instead of state values to avoid stale closures.
   * When called inside setTimeout, state values from useCallback closure are stale,
   * but refs always have the current value.
   */
  const syncProjectData = useCallback(() => {
    if (!currentProject) {
      console.log('[App] syncProjectData - No current project, skipping');
      return;
    }

    // CRITICAL: Read from refs to get current values, not stale closure values
    const currentBeats = beatsRef.current;
    const currentConnections = connectionsRef.current;
    const currentTitle = titleRef.current;
    const currentAuthor = authorRef.current;
    const currentCharacters = charactersRef.current;
    const currentClusters = clustersRef.current;
    const currentContainerBeatPositions = containerBeatPositionsRef.current;

    if (currentBeats.length === 0) {
      console.log('[App] syncProjectData - No beats in beatsRef, skipping');
      return;
    }

    // Log detailed beat information
    const beatDetails = currentBeats.map(b => ({
      id: b.id,
      name: b.name || 'unnamed',
      type: b.type,
      x: (b as any).x,
      y: (b as any).y
    }));

    console.log('[App] syncProjectData - Using REFS (not stale closure):', {
      totalBeats: currentBeats.length,
      beats: beatDetails,
      connections: currentConnections.length,
      characters: currentCharacters.length,
      clusters: currentClusters.length,
      title: currentTitle,
      author: currentAuthor
    });

    // CRITICAL: Serialize beats with toJSON() before storing
    // Beat instances have methods that can't be structured-cloned by IndexedDB
    const serializedBeats = currentBeats.map(beat => {
      if (typeof beat.toJSON === 'function') {
        return beat.toJSON();
      }
      return beat;
    });

    const storyData = {
      title: currentTitle,
      author: currentAuthor,
      metadata: {
        title: currentTitle,
        author: currentAuthor,
      },
      beats: serializedBeats,
      characters: currentCharacters,
      connections: currentConnections,
      clusters: currentClusters,
      containerBeatPositions: currentContainerBeatPositions,
    };

    // Debug: Log AI beats specifically
    const aiBeatTypes = ['onlineContent', 'aiCondition', 'aiDialogTree', 'aiSummary'];
    const aiBeats = storyData.beats.filter((b: any) => aiBeatTypes.includes(b.type));
    if (aiBeats.length > 0) {
      console.log('[App] AI beats being saved:', aiBeats.map((b: any) => ({
        id: b.id,
        type: b.type,
        name: b.name,
        hasParameters: !!b.parameters,
        parameterKeys: b.parameters ? Object.keys(b.parameters) : []
      })));
    }

    console.log('[App] storyData being passed to updateStory:', {
      beatsCount: storyData.beats.length,
      beatIds: storyData.beats.map((b: any) => b.id),
      beatTypes: storyData.beats.map((b: any) => b.type)
    });

    // Sync translations from TranslationContext onto the project object
    // BEFORE calling updateStory, so the spread in updateProjectStory preserves them
    // on the new project object it creates via {...projectToUpdate, story: newStory}
    const currentTranslations = translationStateRef.current;
    const projForTranslations = currentProjectRef2.current;
    if (projForTranslations) {
      if (currentTranslations.translations.length > 0) {
        projForTranslations.translations = currentTranslations.translations;
        projForTranslations.translationManifest = currentTranslations.manifest;
      } else if (projForTranslations.translations) {
        // Translations were cleared — remove from project too
        delete projForTranslations.translations;
        delete projForTranslations.translationManifest;
      }
    }

    updateStory(storyData);
    console.log('[App] syncProjectData - updateStory called successfully');

    // Also sync global settings to the project
    const currentGlobalSettings = globalSettingsRef.current;
    if (currentGlobalSettings) {
      updateGlobalSettings(currentGlobalSettings);
      console.log('[App] syncProjectData - updateGlobalSettings called successfully');
    }
  }, [currentProject, updateStory, updateGlobalSettings]);

  /**
   * Register sync callback with PersistenceContext
   * This ensures beats are synced before auto-save
   */
  useEffect(() => {
    console.log('[App] Registering sync callback with PersistenceContext');
    registerSyncCallback(syncProjectData);

    return () => {
      console.log('[App] Unregistering sync callback from PersistenceContext');
      unregisterSyncCallback();
    };
  }, [syncProjectData, registerSyncCallback, unregisterSyncCallback]);

  /**
   * Save theme ID to project when it changes
   * This ensures the theme persists when the project is reloaded
   */
  useEffect(() => {
    // Only update if we have a project and the theme has actually changed
    if (currentProject && currentThemeId !== undefined && currentProject.themeId !== currentThemeId) {
      console.log('[App] Saving themeId to project:', currentThemeId);
      updateMetadata({ themeId: currentThemeId });
    }
  }, [currentThemeId, currentProject, updateMetadata]);

  /**
   * WebSocket connection to API server for external story injection
   * This enables Claude Desktop MCP and other external tools to push stories directly
   */
  const handleStoryGeneratedRef = useRef<((story: any) => void) | null>(null);
  const injectionSaveInProgressRef = useRef<boolean>(false);
  const currentInjectionIdRef = useRef<string | null>(null);
  // Track processed injections by server timestamp to prevent duplicates
  const processedInjectionsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Store the latest handleStoryGenerated callback in a ref to avoid stale closures
    handleStoryGeneratedRef.current = async (story: any) => {
      // Use server's injectedAt timestamp as deduplication key
      // This ensures the same story isn't processed twice even if received by multiple clients
      const serverInjectionId = story.injectedAt || `fallback_${Date.now()}`;

      // Check if we've already processed this injection
      if (processedInjectionsRef.current.has(serverInjectionId)) {
        console.log('[App] Story already processed (duplicate WebSocket message), skipping. injectedAt:', serverInjectionId);
        return;
      }

      // Mark as processed
      processedInjectionsRef.current.add(serverInjectionId);

      // Clean up old entries after 10 seconds to prevent memory leak
      setTimeout(() => {
        processedInjectionsRef.current.delete(serverInjectionId);
      }, 10000);

      // Generate unique injection ID for tracking within this session
      const injectionId = `injection_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Set current injection as active (cancels any previous in-flight saves via ID check)
      injectionSaveInProgressRef.current = true;
      currentInjectionIdRef.current = injectionId;

      const storyTitle = story.metadata?.title || 'Injected Story';
      console.log('[App] Received story via WebSocket:', storyTitle, 'injectionId:', injectionId);

      // NOTE: We use loadStoryData for a single batch update instead of:
      // - actions.clearStory() - would trigger a state update
      // - actions.setTitle() - would trigger another state update
      // - actions.addBeat() x 42 - would trigger 42 state updates!
      // This reduces re-renders from 44+ to just 1

      // BATCH UPDATE: Create all beats first, then load them in a single state update
      // This prevents the GraphEditor from re-rendering 42+ times
      // Use tree layout algorithm to position beats based on their connections
      // Pass both beats (for parameter-embedded connections) and the connections array (for external connections)
      const externalConnections = story.connections && Array.isArray(story.connections)
        ? story.connections.map((conn: any) => ({
            source: conn.sourceId || conn.source,
            target: conn.targetId || conn.target,
          }))
        : [];
      const firstBeatId = story.metadata?.firstBeatId || story.firstBeatId || (story.beats?.[0]?.id);
      const adjustedPositions = story.beats && Array.isArray(story.beats)
        ? applyTreeLayoutToBeats(story.beats, undefined, externalConnections, firstBeatId)
        : new Map();

      // Create all beats without adding to state (batch preparation)
      const createdBeats: Beat[] = [];
      // Known beat types for validation (including AI variations that map to canonical types)
      const knownBeatTypes = new Set([
        'titleScreen', 'infoText', 'dialogTree', 'conversationChoice', 'movementChoice',
        'pickProp', 'videoBeat', 'endScreen', 'durScreen', 'SWFBeat', 'inputText', 'hyperText',
        'setVariable', 'setGlobal', 'setCounter', 'counter', 'variable', 'conditionBeat', 'conditionCheck', 'condition',
        'randomTarget', 'setTimer', 'addRemoveInventory', 'addInventory', 'removeInventory'
      ]);

      if (story.beats && Array.isArray(story.beats)) {
        story.beats.forEach((beatData: any) => {
          const position = adjustedPositions.get(beatData.id) ||
            beatData.position ||
            { x: beatData.x || 200, y: beatData.y || 200 };

          // Log warning if AI generated an unknown beat type
          const beatType = beatData.type || 'infoText';
          if (!knownBeatTypes.has(beatType)) {
            console.warn(`[App] AI generated unknown beat type: "${beatType}" for beat ${beatData.id}. Check AI prompt constraints.`);
          }

          // Use createBeat (not addBeat) to avoid state updates
          const beat = actions.createBeat(
            beatType,
            position,
            { id: beatData.id, name: beatData.name || beatData.label }
          );

          // Apply parameters directly to the beat instance
          if (beatData.parameters) {
            const params = { ...beatData.parameters };

            // Transform conditionBeat nested format to flat format
            if (beatData.type === 'conditionBeat') {
              if (params.condition) {
                const cond = params.condition;
                params.conditionType = cond.type || params.conditionType;
                // AI may generate 'variable', 'variableName', or 'left' - support all
                params.variableName = cond.variableName || cond.variable || cond.left || params.variableName;
                params.operator = cond.operator || params.operator;
                params.value = cond.value ?? cond.right ?? params.value;
                delete params.condition;
              }
              if (params.trueConnection?.target) {
                params.trueTarget = params.trueConnection.target;
                delete params.trueConnection;
              }
              if (params.falseConnection?.target) {
                params.falseTarget = params.falseConnection.target;
                delete params.falseConnection;
              }
            }

            // Update parameters on the beat instance directly
            beat.updateParameters(params);
          }

          createdBeats.push(beat);
        });
      }

      // Process connections (build connection list without state updates)
      const connectionsToCreate: Array<{ source: string; target: string; label?: string }> = [];

      // Helper to recursively extract targets from dialogTree
      // Supports both new format (dialogNode) and old format (target as object)
      const extractDialogTreeTargets = (node: any, beatId: string): void => {
        if (!node) return;

        // Check choices for targets
        if (node.choices && Array.isArray(node.choices)) {
          node.choices.forEach((choice: any) => {
            // New format: target is string (beat ID)
            if (typeof choice.target === 'string' && choice.target) {
              connectionsToCreate.push({
                source: beatId,
                target: choice.target,
                label: choice.text || 'Choice',
              });
            }
            // New format: dialogNode for nested dialog
            if (choice.dialogNode) {
              extractDialogTreeTargets(choice.dialogNode, beatId);
            }
            // Old format: target as object (backward compatibility)
            if (typeof choice.target === 'object' && choice.target) {
              extractDialogTreeTargets(choice.target, beatId);
            }
          });
        }
      };

      // Extract connections from beat parameters
      if (story.beats && Array.isArray(story.beats)) {
        story.beats.forEach((beatData: any) => {
          // Single connection (infoText, titleScreen, etc.)
          if (beatData.parameters?.connection?.target) {
            connectionsToCreate.push({
              source: beatData.id,
              target: beatData.parameters.connection.target,
            });
          }

          // conditionBeat true/false connections
          if (beatData.type === 'conditionBeat') {
            if (beatData.parameters?.trueConnection?.target) {
              connectionsToCreate.push({
                source: beatData.id,
                target: beatData.parameters.trueConnection.target,
                label: 'true',
              });
            }
            if (beatData.parameters?.falseConnection?.target) {
              connectionsToCreate.push({
                source: beatData.id,
                target: beatData.parameters.falseConnection.target,
                label: 'false',
              });
            }
          }

          // dialogTree - extract targets from nested dialog structure
          if (beatData.type === 'dialogTree' && beatData.parameters?.dialogTree) {
            extractDialogTreeTargets(beatData.parameters.dialogTree, beatData.id);
          }

          // movementChoice - extract targets from choices array
          if (beatData.type === 'movementChoice' && beatData.parameters?.choices) {
            beatData.parameters.choices.forEach((choice: any) => {
              if (choice.target) {
                connectionsToCreate.push({
                  source: beatData.id,
                  target: choice.target,
                  label: choice.text || choice.location || 'Choice',
                });
              }
            });
          }

          // pickProp - extract targets from props array
          if (beatData.type === 'pickProp' && beatData.parameters?.props) {
            beatData.parameters.props.forEach((prop: any) => {
              if (prop.target) {
                connectionsToCreate.push({
                  source: beatData.id,
                  target: prop.target,
                  label: prop.name || 'Prop',
                });
              }
            });
          }

          // hyperText - extract targets from hyperlinks array
          if (beatData.type === 'hyperText' && beatData.parameters?.hyperlinks) {
            beatData.parameters.hyperlinks.forEach((link: any) => {
              if (link.targetBeatId) {
                connectionsToCreate.push({
                  source: beatData.id,
                  target: link.targetBeatId,
                  label: link.word || 'Link',
                });
              }
            });
          }

          // randomTarget - extract targets from choices array
          if (beatData.type === 'randomTarget' && beatData.parameters?.choices) {
            beatData.parameters.choices.forEach((choice: any, index: number) => {
              const target = typeof choice === 'string' ? choice : choice.target;
              if (target) {
                connectionsToCreate.push({
                  source: beatData.id,
                  target: target,
                  label: `Random ${index + 1}`,
                });
              }
            });
          }
        });
      }

      // Also use top-level connections array
      if (story.connections && Array.isArray(story.connections)) {
        story.connections.forEach((conn: any) => {
          connectionsToCreate.push({
            source: conn.source || conn.sourceId || conn.from,
            target: conn.target || conn.targetId || conn.to,
            label: conn.label,
          });
        });
      }

      // Handle characters if provided
      const storyCharacters = story.characters && Array.isArray(story.characters)
        ? story.characters
        : characters; // Keep existing characters if none provided

      // CRITICAL: Add connections to beat instances BEFORE loading story data
      // The GraphEditor reads connections from beat.getConnections(), not state.connections
      // Build a map of beats by ID for fast lookup
      const beatMap = new Map<string, Beat>();
      createdBeats.forEach(beat => beatMap.set(beat.id, beat));

      // Add connections to source beats
      connectionsToCreate.forEach(conn => {
        const sourceBeat = beatMap.get(conn.source);
        const targetBeat = beatMap.get(conn.target);
        if (sourceBeat && targetBeat) {
          sourceBeat.addConnection({
            targetId: conn.target,
            label: conn.label || `To ${targetBeat.name}`,
          });
        }
      });

      // CRITICAL: Set pendingNewProjectIdRef BEFORE loadStoryData
      // The loadStoryData call will trigger the load effect via state.beats dependency.
      // We need to mark that we're in a save transition BEFORE that happens.
      pendingNewProjectIdRef.current = 'pending';
      console.log('[App] Set pendingNewProjectIdRef to "pending" before loadStoryData');

      // SINGLE BATCH UPDATE: Load all story data at once
      // This triggers only ONE re-render instead of 42+
      console.log('[App] Batch loading story data:', {
        beats: createdBeats.length,
        connections: connectionsToCreate.length,
        characters: storyCharacters.length,
      });

      actions.loadStoryData({
        title: storyTitle,
        author: story.metadata?.author || state.author,
        beats: createdBeats,
        connections: connectionsToCreate,
        characters: storyCharacters,
      });

      // Update characters state separately (for App-level character management)
      if (story.characters && Array.isArray(story.characters)) {
        setCharacters(story.characters);
      }

      // NOTE: Don't call markChanged() here - we'll save the project immediately
      // and it should not appear as "unsaved" after the save completes
      console.log('[App] Story injection complete:', {
        beats: story.beats?.length || 0,
        connections: connectionsToCreate.length,
        characters: story.characters?.length || 0,
        injectionId,
      });

      // Auto-save: Create a new project and save the injected story
      // Use an async IIFE that runs immediately - don't use setTimeout that can be cancelled by HMR
      // The injectionId check protects against duplicate processing
      (async () => {
        // Wait for React state to settle
        await new Promise(resolve => setTimeout(resolve, 300));

        // Check if this injection is still the active one
        if (currentInjectionIdRef.current !== injectionId) {
          console.log('[App] Injection ID mismatch after wait, skipping save. Expected:', injectionId, 'Current:', currentInjectionIdRef.current);
          return;
        }

        try {
          const description = story.metadata?.description || 'Story created via Claude Desktop MCP';
          console.log('[App] Syncing injected story data to project...', 'injectionId:', injectionId);

          // Explicitly sync current beats to project before saving
          syncProjectData();

          // Wait for sync to complete
          await new Promise(resolve => setTimeout(resolve, 200));

          // Double-check we're still the active injection
          if (currentInjectionIdRef.current !== injectionId) {
            console.log('[App] Injection ID changed during wait, aborting save');
            return;
          }

          console.log('[App] Auto-saving injected story as new project:', storyTitle);

          // NOTE: pendingNewProjectIdRef was already set to 'pending' before loadStoryData
          // to block the load effect from reloading the old project

          const newProjectId = await saveCurrent(storyTitle, description);
          console.log('[App] Injected story saved successfully, new project ID:', newProjectId);

          // CRITICAL: Update both refs atomically
          // pendingNewProjectIdRef stores the new ID so the load effect knows to skip
          // until currentProject catches up
          pendingNewProjectIdRef.current = newProjectId;
          loadedProjectIdRef.current = newProjectId;
        } catch (error) {
          console.error('[App] Failed to auto-save injected story:', error);
          // Clear pending flag on error to allow normal operation to resume
          pendingNewProjectIdRef.current = null;
        } finally {
          // Reset flags only if this is still the active injection
          if (currentInjectionIdRef.current === injectionId) {
            injectionSaveInProgressRef.current = false;
          }
        }
      })();
    };

    // No cleanup needed - the async IIFE will check injectionId to prevent duplicate saves
  }, [actions, markChanged, saveCurrent, syncProjectData]);

  useEffect(() => {
    // MCP WebSocket integration is disabled by default to reduce noise
    // In Electron: Enable via app menu "Enable MCP Integration"
    // In web: Enable via localStorage.setItem('asaps_mcp_enabled', 'true')

    // Shared state for cleanup and connection control
    let isCleanedUp = false;
    let mcpShouldBeEnabled = false; // Tracks current MCP setting state
    let hasLoggedFailure = false;
    let connectionAttempts = 0;
    const wsInstanceId = `ws_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

    // Connect to WebSocket server
    const connectWebSocket = () => {
      // Don't reconnect if we've been cleaned up or MCP is disabled
      if (isCleanedUp || !mcpShouldBeEnabled) {
        return;
      }

      connectionAttempts++;
      const wsUrl = 'ws://localhost:3001';

      // Only log first connection attempt
      if (connectionAttempts === 1) {
        console.log(`[App] Connecting to WebSocket server: ${wsUrl}`);
      }

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log(`[App] WebSocket connected to API server`);
          hasLoggedFailure = false; // Reset on successful connection
          connectionAttempts = 0;
        };

        ws.onmessage = (event) => {
          // Ignore messages if we've been cleaned up
          if (isCleanedUp) return;

          try {
            const message = JSON.parse(event.data);
            const messageTime = new Date().toISOString();
            console.log(`[App] WebSocket message received at ${messageTime}:`, message.event);
            if (message.data?.injectedAt) {
              console.log('[App] Message injectedAt:', message.data.injectedAt);
            }
            if (message.timestamp) {
              console.log('[App] Message server timestamp:', message.timestamp);
            }

            if (message.event === 'story:inject' && message.data) {
              console.log(`[App] Processing story:inject event on instance ${wsInstanceId}...`);
              // Use the ref to call the latest callback
              if (handleStoryGeneratedRef.current) {
                handleStoryGeneratedRef.current(message.data);
              } else {
                console.warn('[App] handleStoryGeneratedRef.current is null, cannot process story');
              }
            } else if (message.event === 'story:request-state') {
              // Server is requesting current state - could implement state reporting
              console.log('[App] State request received (not implemented)');
            }
          } catch (error) {
            console.error('[App] Failed to parse WebSocket message:', error);
          }
        };

        ws.onclose = () => {
          wsRef.current = null;
          // Only reconnect if we haven't been cleaned up AND MCP is still enabled
          if (!isCleanedUp && mcpShouldBeEnabled) {
            setTimeout(connectWebSocket, 10000); // 10 seconds instead of 3
          }
        };

        ws.onerror = () => {
          // Only log error once to reduce console spam
          if (!hasLoggedFailure) {
            console.log('[App] WebSocket server not available (MCP server not running) - will retry silently');
            hasLoggedFailure = true;
          }
        };
      } catch (error) {
        // Only log once
        if (!hasLoggedFailure) {
          console.log('[App] WebSocket connection failed - MCP server not running');
          hasLoggedFailure = true;
        }
        // Only retry if we haven't been cleaned up AND MCP is still enabled
        if (!isCleanedUp && mcpShouldBeEnabled) {
          setTimeout(connectWebSocket, 10000);
        }
      }
    };

    // Initialize MCP connection based on settings
    const initMcpConnection = async () => {
      // Check if we're in Electron with the settings API
      if (window.electronAPI?.settings?.getMcpEnabled) {
        try {
          mcpShouldBeEnabled = await window.electronAPI.settings.getMcpEnabled();
        } catch (err) {
          console.log('[App] Failed to get MCP setting from Electron:', err);
          mcpShouldBeEnabled = false;
        }
      } else {
        // Fallback to localStorage for web mode
        mcpShouldBeEnabled = localStorage.getItem('asaps_mcp_enabled') === 'true';
      }

      if (!mcpShouldBeEnabled || isCleanedUp) {
        // MCP integration disabled - skip WebSocket connection
        console.log('[App] MCP integration disabled - WebSocket connection skipped');
        return;
      }

      console.log('[App] MCP integration enabled - connecting to WebSocket server');
      connectWebSocket();
    };

    // Listen for setting changes from Electron menu
    let unsubscribeMcpSetting: (() => void) | undefined;
    if (window.electronAPI?.onMcpSettingChanged) {
      unsubscribeMcpSetting = window.electronAPI.onMcpSettingChanged((enabled) => {
        console.log('[App] MCP setting changed:', enabled);
        mcpShouldBeEnabled = enabled; // Update the flag so retry loops stop

        if (enabled && !wsRef.current) {
          // Setting enabled, start connection
          hasLoggedFailure = false; // Reset so we log on new connection attempts
          connectionAttempts = 0;
          connectWebSocket();
        } else if (!enabled) {
          // Setting disabled, close connection and stop retries
          console.log('[App] MCP disabled - closing WebSocket and stopping retries');
          if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
          }
        }
      });
    }

    // Listen for story injection from Electron IPC (when running as desktop app)
    let unsubscribeStoryInject: (() => void) | undefined;
    if (window.electronAPI?.onStoryInject) {
      unsubscribeStoryInject = window.electronAPI.onStoryInject((data) => {
        console.log('[App] Story injection received via IPC:', data.metadata?.title);
        if (handleStoryGeneratedRef.current) {
          handleStoryGeneratedRef.current(data);
        } else {
          console.warn('[App] handleStoryGeneratedRef.current is null, cannot process injected story');
        }
      });
      console.log('[App] Registered IPC listener for story injection');
    }

    // Start initialization
    initMcpConnection();

    return () => {
      isCleanedUp = true;
      mcpShouldBeEnabled = false; // Ensure retries stop on cleanup
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (unsubscribeMcpSetting) {
        unsubscribeMcpSetting();
      }
      if (unsubscribeStoryInject) {
        unsubscribeStoryInject();
      }
    };
  }, []); // Only run once on mount

  // Track loaded project to avoid re-loading the same project
  const loadedProjectIdRef = useRef<string | null>(null);
  // Track if we've already initialized to prevent React Strict Mode double-init
  const hasInitializedRef = useRef<boolean>(false);

  // LocalStorage key for remembering last used project
  const LAST_PROJECT_KEY = 'asaps-last-project-id';
  // CRITICAL: Track when we're transitioning to a new project after save
  // This prevents the load effect from trying to reload the old project
  // during the async window between saveCurrentProject completing and
  // React propagating the new currentProject value
  const pendingNewProjectIdRef = useRef<string | null>(null);

  // Save current project ID to localStorage so we can restore it on next session
  // This prevents the "reset to untitled project" issue when user comes back
  useEffect(() => {
    if (currentProject && currentProject.id) {
      try {
        localStorage.setItem(LAST_PROJECT_KEY, currentProject.id);
        console.log('[App] Saved last project ID to localStorage:', currentProject.id);
      } catch (e) {
        console.warn('[App] Failed to save last project ID to localStorage:', e);
      }
    }
  }, [currentProject?.id]);

  // Initialize with a basic story and create untitled project on mount
  useEffect(() => {
    const initializeApp = async () => {
      // CRITICAL: Prevent double initialization from React Strict Mode
      if (hasInitializedRef.current) {
        console.log('[App] Skipping init - already initialized');
        return;
      }

      // CRITICAL: Wait for storage to be initialized before checking for projects
      if (!storageInitialized) {
        console.log('[App] Waiting for storage initialization...');
        return;
      }

      console.log('[App] Initializing app - currentProject:', currentProject, 'beats.length:', state.beats.length);

      // CRITICAL FIX: Reset loadedProjectIdRef on fresh start
      // This ensures projects always load fresh when app starts
      if (!currentProject) {
        console.log('[App] Resetting loadedProjectIdRef to null (fresh start)');
        loadedProjectIdRef.current = null;
      }

      // CRITICAL FIX: Check if there are ANY projects first
      const hasAnyProjects = currentProject !== null && currentProject !== undefined;

      if (!hasAnyProjects && state.beats.length === 0) {
        console.log('[App] No current project and no beats - checking for last session or existing projects');

        // FIRST: Check if we have a last used project ID in localStorage
        // This restores the user's session when they come back after being away
        try {
          const lastProjectId = localStorage.getItem(LAST_PROJECT_KEY);
          if (lastProjectId) {
            console.log('[App] Found last project ID in localStorage:', lastProjectId);
            hasInitializedRef.current = true;
            const loaded = await loadProject(lastProjectId);
            if (loaded) {
              console.log('[App] SUCCESS: Restored last session project');
              return; // Exit early - project loaded
            } else {
              console.log('[App] Last project no longer exists, falling back to untitled search');
              // Clear the invalid last project ID
              localStorage.removeItem(LAST_PROJECT_KEY);
            }
          }
        } catch (e) {
          console.warn('[App] Failed to restore last project from localStorage:', e);
        }

        // Reset hasInitializedRef in case it was set by failed last project load
        hasInitializedRef.current = false;

        // SECOND: Look for existing untitled projects
        try {
          const projectsResult = await storage.listProjects();
          if (projectsResult.success && projectsResult.data) {
            // Find ALL untitled projects, sorted by modification date (newest first)
            const untitledProjects = projectsResult.data
              .filter(p => p.name === 'Untitled Project')
              .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());

            console.log('[App] Found', untitledProjects.length, 'untitled projects');

            if (untitledProjects.length > 0) {
              // Delete all but the most recent untitled project
              if (untitledProjects.length > 1) {
                console.log('[App] Cleaning up', untitledProjects.length - 1, 'old untitled projects');
                for (let i = 1; i < untitledProjects.length; i++) {
                  try {
                    await storage.deleteProject(untitledProjects[i].id);
                    console.log('[App] Deleted old untitled project:', untitledProjects[i].id);
                  } catch (e) {
                    console.warn('[App] Failed to delete old untitled project:', e);
                  }
                }
              }

              // Load the most recent untitled project
              const existingUntitled = untitledProjects[0];
              console.log('[App] Loading most recent untitled project:', existingUntitled.id);
              hasInitializedRef.current = true;

              const loaded = await loadProject(existingUntitled.id);
              if (loaded) {
                console.log('[App] SUCCESS: Loaded existing untitled project');
                return; // Exit early - project loaded, beats will come from project
              } else {
                console.log('[App] FAILED to load existing untitled project, creating new one');
              }
            }
          }
        } catch (error) {
          console.warn('[App] Could not check for existing untitled projects:', error);
        }

        console.log('[App] No last project or existing untitled project found - initializing from scratch');

        // Mark as initialized BEFORE async operations to prevent race conditions
        hasInitializedRef.current = true;

        // Initialize the story first (creates the 3-beat base story)
        // This is async - beats will appear in state shortly
        initializeStory();
        console.log('[App] AFTER initializeStory called - beats will appear soon via React state update');

        // NOTE: Do NOT mark as changed here - the default story is not "unsaved work"
        // Only mark as changed when user actually makes changes
        // This prevents showing "unsaved" indicator for a fresh default story

        // Create untitled project - the loading effect will handle saving beats when they appear
        // CRITICAL: Retry project creation if it fails to ensure we have a valid project
        let retryCount = 0;
        const maxRetries = 3;
        while (retryCount < maxRetries) {
          try {
            console.log(`[App] Creating untitled project (attempt ${retryCount + 1}/${maxRetries})...`);
            await createProject('Untitled Project', 'Auto-saved untitled work');
            console.log('[App] SUCCESS: Created untitled project');
            break; // Success, exit retry loop
          } catch (error) {
            retryCount++;
            console.error(`[App] FAILED to create untitled project (attempt ${retryCount}/${maxRetries}):`, error);
            if (retryCount < maxRetries) {
              // Wait a bit before retrying
              await new Promise(resolve => setTimeout(resolve, 500));
            } else {
              console.error('[App] CRITICAL: All project creation attempts failed. User may need to manually save.');
            }
          }
        }
      } else {
        console.log('[App] SKIPPING initialization - hasAnyProjects:', hasAnyProjects, 'beats.length:', state.beats.length);
      }
    };

    initializeApp();
   
  }, [currentProject, state.beats.length, storage, loadProject, storageInitialized]);

  // Load project data when currentProject changes
  useEffect(() => {
    // Skip if no change or already loaded
    if (injectionSaveInProgressRef.current || !currentProject || currentProject.id === loadedProjectIdRef.current) {
      return;
    }

    console.log('[App] Project LOAD EFFECT: loading', currentProject.name, '(', currentProject.id, ')');

    // CRITICAL FIX: Check if we're in the middle of a save-to-new-project transition
    // This happens when saveCurrentProject creates a new project but React hasn't
    // propagated the new currentProject value yet. During this window, we should
    // NOT try to reload the old project.
    if (pendingNewProjectIdRef.current) {
      // 'pending' means we're waiting for saveCurrent to complete
      if (pendingNewProjectIdRef.current === 'pending') {
        console.log('[App] >>> SKIPPED loading - save in progress, waiting for new project ID');
        console.log('[App] ==========================================');
        return;
      }

      // Check if currentProject has caught up to the new project ID
      if (currentProject.id === pendingNewProjectIdRef.current) {
        // Transition complete! Clear the pending flag and mark as loaded
        console.log('[App] >>> Transition complete! currentProject caught up to new project:', currentProject.id);
        pendingNewProjectIdRef.current = null;
        loadedProjectIdRef.current = currentProject.id;
        console.log('[App] ==========================================');
        return;
      } else {
        // Still in transition - currentProject has old ID, skip reload
        console.log('[App] >>> SKIPPED loading - in transition to new project. currentProject:', currentProject.id, 'pending:', pendingNewProjectIdRef.current);
        console.log('[App] ==========================================');
        return;
      }
    }

    console.log('[App] >>> WILL LOAD project:', currentProject.id);

    try {
      // Check if this is a newly created untitled project (will have no beats)
      // CRITICAL FIX: Check if the project story actually has beats array with data
      const projectStory = currentProject.story as any;
      const beatsExist = projectStory?.beats && Array.isArray(projectStory.beats) && projectStory.beats.length > 0;
      const isNewUntitledProject = currentProject.name === 'Untitled Project' && !beatsExist;

      // CRITICAL FIX: Detect if we're SWITCHING from another project
      // If loadedProjectIdRef is set and different, we're switching projects and should LOAD, not SAVE
      const isSwitchingFromAnotherProject = loadedProjectIdRef.current !== null &&
                                             loadedProjectIdRef.current !== currentProject.id;

      console.log('[App] projectStory:', !!projectStory);
      console.log('[App] beatsExist:', beatsExist, 'beats.length:', projectStory?.beats?.length);
      console.log('[App] isNewUntitledProject:', isNewUntitledProject);
      console.log('[App] isSwitchingFromAnotherProject:', isSwitchingFromAnotherProject);
      console.log('[App] current beats.length:', beatsRef.current.length);

      if (isSwitchingFromAnotherProject) {
        // SWITCHING PROJECTS: Always load the new project's data
        console.log('[App] >>> SWITCHING to different project - loading its data');

        // CRITICAL: Clear UI selections before loading new project data
        // This prevents stale beat/cluster references from leaking across projects
        setSelectedBeat(null);
        setSelectedCluster(null);

        // Close overlay panels that show project-specific data
        setShowCharacterManager(false);
        setShowAssetManager(false);
        setShowSettings(false);
        setShowDebugPanel(false);
        setShowSearchPanel(false);
        const projectData = loadProjectData(currentProject);
        console.log('[App] >>> Loaded data:', {
          title: projectData.title,
          beats: projectData.beats.length,
          connections: projectData.connections?.length || 0,
          characters: projectData.characters?.length || 0,
          clusters: projectData.clusters?.length || 0,
          containerBeatPositions: projectData.containerBeatPositions?.length || 0
        });

        actionsRef.current.loadStoryData({
          title: projectData.title,
          author: projectData.author,
          beats: projectData.beats,
          connections: projectData.connections || [],
          story: currentProject.story,
          settings: projectData.settings,
          environment: projectData.environment,
          characters: projectData.characters,
          clusters: projectData.clusters,
          containerBeatPositions: projectData.containerBeatPositions || []
        });

        // Immediately update refs to prevent syncProjectData from reading stale data
        // before the useEffect that normally syncs these fires
        beatsRef.current = projectData.beats;
        connectionsRef.current = projectData.connections || [];
        clustersRef.current = projectData.clusters || [];
        containerBeatPositionsRef.current = projectData.containerBeatPositions || [];

        setCharacters(projectData.characters || []);
        if (projectData.settings) {
          actionsRef.current.updateSettings(projectData.settings);
        }

        // Load assets from storage using HybridStorageAdapter (falls back to filesystem for directory projects)
        const loadAssets = async () => {
          try {
            console.log('[App] >>> Loading assets for project:', currentProject.id);
            const storage = getStorageAdapter();
            await storage.initialize();
            console.log('[App] >>> HybridStorageAdapter initialized');

            // listAssets returns metadata only, we need to load blobs separately
            const assetInfoList = await storage.listAssets(currentProject.id);
            console.log('[App] >>> Found', assetInfoList.length, 'assets in storage');

            const uiAssets: Asset[] = [];
            for (const assetInfo of assetInfoList) {
              // Load the actual blob from storage (respects hybrid storage routing)
              const blob = await storage.loadAsset(assetInfo.id);
              if (blob) {
                const url = URL.createObjectURL(blob);
                uiAssets.push({
                  id: assetInfo.id,
                  name: assetInfo.filename,
                  type: assetInfo.mimeType.startsWith('image/') ? 'image' :
                        assetInfo.mimeType.startsWith('audio/') ? 'audio' :
                        assetInfo.mimeType.startsWith('video/') ? 'video' :
                        assetInfo.mimeType.includes('font') ? 'font' : 'image',
                  subType: (assetInfo as { subType?: Asset['subType'] }).subType,
                  url,
                  size: assetInfo.size,
                  uploadedAt: new Date(assetInfo.uploadedAt),
                });
                console.log('[App] >>> Asset loaded:', assetInfo.filename, '(location:', assetInfo.location, ')');
              } else {
                console.warn('[App] >>> Could not load blob for asset:', assetInfo.filename);
              }
            }

            setAssets(uiAssets);
            console.log('[App] >>> Total assets loaded:', uiAssets.length);
          } catch (err) {
            console.error('[App] >>> Error loading assets from IndexedDB:', err);
            // Fallback: load assets directly from filesystem for directory projects
            if (projectFormat === 'directory' && projectPath) {
              console.log('[App] >>> Falling back to direct filesystem asset loading');
              const dirAssets = await loadAssetsFromDirectory(projectPath);
              setAssets(dirAssets);
            }
          }
        };
        loadAssets();

        // Restore global settings from project (if saved)
        if (currentProject.globalSettings) {
          console.log('[App] >>> Restoring globalSettings from project');
          setGlobalSettings(currentProject.globalSettings);
          applyProjectAIDefaults(currentProject.globalSettings);
        }

        // ALWAYS set theme ID from project (clear if undefined to prevent bleed between projects)
        console.log('[App] >>> Setting themeId from project:', currentProject.themeId || '(none)');
        setCurrentThemeId(currentProject.themeId);

        // Load translations from project (sync against current source to detect new fields)
        // IMPORTANT: Build projectData from currentProject directly instead of reading
        // from IndexedDB (which may be stale after git reset — race with async updateProject).
        if (currentProject.translations?.length) {
          const translations = currentProject.translations;
          const manifest = currentProject.translationManifest;
          const projectData = {
            project: {
              ...currentProject,
              story: currentProject.story,
            },
          };
          translationActions.loadTranslations(translations, manifest, projectData);
          console.log('[App] >>> Loaded', translations.length, 'translation(s) with sync');
        } else {
          translationActions.clearTranslations();
        }

        setIsUntitledProject(currentProject.name === 'Untitled Project');
        loadedProjectIdRef.current = currentProject.id;
        console.log('[App] >>> Project switch complete');
      } else if (isNewUntitledProject && beatsRef.current.length > 0) {
        // New untitled project AND beats have been created - save current story state to it
        // This only happens when creating a NEW project in this session, not when switching
        console.log('[App] >>> SAVING beats to NEW untitled project');
        setSelectedBeat(null);
        setSelectedCluster(null);

        const storyData = {
          title: titleRef.current,
          author: authorRef.current,
          beats: beatsRef.current,
          characters: charactersRef.current,
          connections: connectionsRef.current,
        };

        console.log('[App] Story data to save:', {
          title: storyData.title,
          beats: storyData.beats.length,
          characters: storyData.characters.length,
          connections: storyData.connections.length
        });

        updateMetadata({ name: 'Untitled Project', description: 'Auto-saved untitled work' });
        updateStory(storyData);
        translationActions.clearTranslations();
        loadedProjectIdRef.current = currentProject.id;
        setIsUntitledProject(true);

        console.log('[App] >>> SUCCESS: Saved beats to new untitled project');
      } else if (isNewUntitledProject && beatsRef.current.length === 0) {
        // Existing untitled project with no beats - initialize default story
        console.log('[App] >>> Untitled project has no beats - initializing default story');
        setSelectedBeat(null);
        setSelectedCluster(null);

        // CRITICAL FIX: Even when waiting for beats, restore globalSettings immediately
        // This ensures hotspot settings (showInPreview, labelDisplay) are applied
        if (currentProject.globalSettings) {
          console.log('[App] >>> Restoring globalSettings from untitled project');
          setGlobalSettings(currentProject.globalSettings);
        }

        // Initialize the default 3-beat story (title, intro, end)
        initializeStory();
        translationActions.clearTranslations();
        loadedProjectIdRef.current = currentProject.id;
        console.log('[App] >>> Default story initialized for untitled project');
      } else if (!isNewUntitledProject) {
        // This is an existing saved project - load its data
        console.log('[App] >>> REPLACING state with loaded project data');
        setSelectedBeat(null);
        setSelectedCluster(null);
        const projectData = loadProjectData(currentProject);
        console.log('[App] >>> Loaded data:', {
          title: projectData.title,
          beats: projectData.beats.length,
          connections: projectData.connections?.length || 0,
          characters: projectData.characters?.length || 0,
          clusters: projectData.clusters?.length || 0,
          containerBeatPositions: projectData.containerBeatPositions?.length || 0
        });

        actionsRef.current.loadStoryData({
          title: projectData.title,
          author: projectData.author,
          beats: projectData.beats,
          connections: projectData.connections || [],
          story: currentProject.story,
          settings: projectData.settings,
          environment: projectData.environment,
          characters: projectData.characters,
          clusters: projectData.clusters,
          containerBeatPositions: projectData.containerBeatPositions || []
        });

        // Immediately update refs to prevent syncProjectData from reading stale data
        beatsRef.current = projectData.beats;
        connectionsRef.current = projectData.connections || [];
        clustersRef.current = projectData.clusters || [];
        containerBeatPositionsRef.current = projectData.containerBeatPositions || [];

        setCharacters(projectData.characters || []);
        if (projectData.settings) {
          actionsRef.current.updateSettings(projectData.settings);
        }

        // Load assets from storage using HybridStorageAdapter (falls back to filesystem for directory projects)
        const loadAssets = async () => {
          let uiAssets: Asset[] = [];

          try {
            console.log('[App] >>> Loading assets for project:', currentProject.id);
            const storage = getStorageAdapter();
            await storage.initialize();
            console.log('[App] >>> HybridStorageAdapter initialized');

            // listAssets returns metadata only, we need to load blobs separately
            const assetInfoList = await storage.listAssets(currentProject.id);
            console.log('[App] >>> Found', assetInfoList.length, 'assets in storage');

            for (const assetInfo of assetInfoList) {
              // Load the actual blob from storage (respects hybrid storage routing)
              const blob = await storage.loadAsset(assetInfo.id);
              if (blob) {
                const url = URL.createObjectURL(blob);
                uiAssets.push({
                  id: assetInfo.id,
                  name: assetInfo.filename,
                  type: assetInfo.mimeType.startsWith('image/') ? 'image' :
                        assetInfo.mimeType.startsWith('audio/') ? 'audio' :
                        assetInfo.mimeType.startsWith('video/') ? 'video' :
                        assetInfo.mimeType.includes('font') ? 'font' : 'image',
                  subType: (assetInfo as { subType?: Asset['subType'] }).subType,
                  url,
                  size: assetInfo.size,
                  uploadedAt: new Date(assetInfo.uploadedAt),
                });
                console.log('[App] >>> Asset loaded:', assetInfo.filename, '(location:', assetInfo.location, ')');
              } else {
                console.warn('[App] >>> Could not load blob for asset:', assetInfo.filename);
              }
            }

            console.log('[App] >>> Total assets loaded from IndexedDB:', uiAssets.length);
          } catch (err) {
            console.error('[App] >>> Error loading assets from IndexedDB:', err);
            // Fallback: load assets directly from filesystem for directory projects
            if (projectFormat === 'directory' && projectPath) {
              console.log('[App] >>> Falling back to direct filesystem asset loading');
              uiAssets = await loadAssetsFromDirectory(projectPath);
            }
          }

          setAssets(uiAssets);
          console.log('[App] >>> Total assets loaded:', uiAssets.length);

          // CRITICAL: Reconstruct character image URLs from asset IDs
          // Characters were saved with asset IDs, but blob URLs are invalid after reload
          if (uiAssets.length > 0 && projectData.characters && projectData.characters.length > 0) {
            const assetUrlMap = new Map(uiAssets.map(a => [a.id, a.url]));
            console.log('[App] >>> Reconstructing character URLs, asset map size:', assetUrlMap.size);
            const updatedCharacters = projectData.characters.map((char: any) => {
              // Update default image
              const defaultAssetId = char.visual?.defaultAssetId;
              const defaultUrl = defaultAssetId ? assetUrlMap.get(defaultAssetId) : null;

              // Update state images
              const updatedStates = (char.states || []).map((state: any) => {
                const stateAssetId = state.visual?.assetId;
                const stateUrl = stateAssetId ? assetUrlMap.get(stateAssetId) : null;
                return {
                  ...state,
                  visual: {
                    ...state.visual,
                    image: stateUrl || state.visual?.image
                  }
                };
              });

              // Update spritesheet URL
              const spriteSheet = char.visual?.spriteSheet;
              let updatedSpriteSheet = spriteSheet;
              if (spriteSheet?.assetId) {
                const ssUrl = assetUrlMap.get(spriteSheet.assetId);
                if (ssUrl) {
                  updatedSpriteSheet = { ...spriteSheet, url: ssUrl };
                }
              }

              // Update inventory icons
              const updatedInventory = (char.inventory || []).map((item: any) => {
                if (item.assetId) {
                  const iconUrl = assetUrlMap.get(item.assetId);
                  if (iconUrl) {
                    return { ...item, icon: iconUrl };
                  }
                }
                return item;
              });

              return {
                ...char,
                visual: {
                  ...char.visual,
                  defaultImage: defaultUrl || char.visual?.defaultImage,
                  ...(updatedSpriteSheet ? { spriteSheet: updatedSpriteSheet } : {})
                },
                states: updatedStates,
                inventory: updatedInventory
              };
            });

            setCharacters(updatedCharacters);
            console.log('[App] >>> Character URLs reconstructed from assets');
          }
        };
        loadAssets();

        // Restore global settings from project (if saved)
        if (currentProject.globalSettings) {
          console.log('[App] >>> Restoring globalSettings from project');
          setGlobalSettings(currentProject.globalSettings);
          applyProjectAIDefaults(currentProject.globalSettings);
        }

        // ALWAYS set theme ID from project (clear if undefined to prevent bleed between projects)
        console.log('[App] >>> Setting themeId from project:', currentProject.themeId || '(none)');
        setCurrentThemeId(currentProject.themeId);

        // Load translations from project (sync against current source to detect new fields)
        // IMPORTANT: Build projectData from currentProject directly instead of reading
        // from IndexedDB (which may be stale after git reset — race with async updateProject).
        // After git-reset: skip sync entirely — both translations and source files come from
        // the same commit, so any "stale" detection is a false positive from the extraction
        // logic having evolved between when the translation was created and now.
        if (currentProject.translations?.length) {
          const translations = currentProject.translations;
          const manifest = currentProject.translationManifest;
          const isGitResetReload = resumeAutoSaveAfterLoadRef.current;
          const projectData = isGitResetReload ? undefined : {
            project: {
              ...currentProject,
              story: currentProject.story,
            },
          };
          translationActions.loadTranslations(translations, manifest, projectData);
          console.log('[App] >>> Loaded', translations.length, 'translation(s)', isGitResetReload ? '(sync skipped — git reset)' : 'with sync');
        } else {
          translationActions.clearTranslations();
        }

        setIsUntitledProject(false);
        loadedProjectIdRef.current = currentProject.id;
        console.log('[App] >>> isUntitledProject set to:', false);
      }
    } catch (error) {
      console.error('[App] >>> FAILED to load project:', error);
      alert('Failed to load project. See console for details.');
    }

    // Resume auto-save if it was paused by the git-reset handler.
    // By this point all refs (beatsRef, connectionsRef, etc.) are updated
    // from the new project data, so auto-save will write correct state.
    if (resumeAutoSaveAfterLoadRef.current) {
      resumeAutoSaveAfterLoadRef.current = false;
      resumeAutoSave();
      console.log('[App] >>> Auto-save resumed after git-reset reload');
    }

    console.log('[App] >>> LOAD EFFECT completed');
    console.log('[App] ==========================================');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject, setIsUntitledProject, updateMetadata, updateStory, initializeStory, resumeAutoSave]);

  // Handler functions
  const handleBeatSelect = useCallback((beat: Beat) => {
    // If selecting the same beat but with updated _version (e.g., after merge),
    // force re-render by clearing first, then setting in next tick
    if (selectedBeat?.id === beat.id && (beat as any)._version !== (selectedBeat as any)?._version) {
      console.log('[App] Beat version changed, forcing re-render:', (selectedBeat as any)?._version, '->', (beat as any)._version);
      setSelectedBeat(null);
      // Use setTimeout to ensure React processes the null state before setting the new beat
      setTimeout(() => setSelectedBeat(beat), 0);
    } else {
      setSelectedBeat(beat);
    }
  }, [selectedBeat]);

  const handleClusterSelect = useCallback((cluster: Cluster | null) => {
    setSelectedCluster(cluster);
  }, []);

  const handleBeatUpdate = useCallback((beatId: string, updates: Partial<Beat>) => {
    const currentBeat = state.beats.find(b => b.id === beatId);
    if (!currentBeat) return;

    // Snapshot current values for the fields being updated (for undo)
    // structuredClone preserves Map, Set, Date etc. unlike JSON.parse(JSON.stringify())
    const oldValues: Record<string, any> = {};
    for (const key of Object.keys(updates)) {
      const val = (currentBeat as any)[key];
      oldValues[key] = (val && typeof val === 'object') ? structuredClone(val) : val;
    }

    const cmd = new UpdateBeatCommand(
      beatId,
      oldValues,
      updates as any,
      stableMutations.current
    );
    getCommandManager().execute(cmd);

    // Update selectedBeat for immediate UI feedback
    if (selectedBeat?.id === beatId) {
      const updatedBeat = state.beats.find(b => b.id === beatId);
      if (updatedBeat) {
        setSelectedBeat(updatedBeat);
      }
    }
    markChanged();
  }, [state.beats, selectedBeat, markChanged]);

  // Handle bulk transformation changes - force UI refresh for affected beats
  const handleTransformationChangesApplied = useCallback((affectedBeatIds: string[]) => {
    console.log('[App] Transformation changes applied to beats:', affectedBeatIds);
    markChanged();

    // Force refresh of selected beat if it was affected
    if (selectedBeat && affectedBeatIds.includes(selectedBeat.id)) {
      const updatedBeat = state.beats.find(b => b.id === selectedBeat.id);
      if (updatedBeat) {
        // Force re-render by clearing and re-setting
        setSelectedBeat(null);
        setTimeout(() => setSelectedBeat(updatedBeat), 0);
      }
    }
  }, [selectedBeat, state.beats, markChanged]);

  // Handle command operations (execute, undo, redo) - refresh UI after any beat changes
  const handleCommandExecuted = useCallback((type: 'execute' | 'undo' | 'redo') => {
    console.log(`[App] Command ${type} executed`);

    // All command operations modify state and should trigger save
    markChanged();

    // Force visual editor to refresh by incrementing the key
    // This ensures the editor re-reads the beat data even if the object reference hasn't changed
    setBeatRefreshKey(k => k + 1);
  }, [markChanged]);

  // Refs to access current values in the refresh effect without adding dependencies
  const selectedBeatRef = useRef(selectedBeat);
  selectedBeatRef.current = selectedBeat;
  const beatsForRefreshRef = useRef(state.beats);
  beatsForRefreshRef.current = state.beats;

  // Force selectedBeat refresh when beatRefreshKey changes (after undo/redo)
  // This runs after React has processed the state update from the command
  useEffect(() => {
    if (beatRefreshKey > 0 && selectedBeatRef.current) {
      const beatId = selectedBeatRef.current.id;
      // Find the beat in the updated state and force a re-selection
      const freshBeat = beatsForRefreshRef.current.find(b => b.id === beatId);
      if (freshBeat) {
        // Clear and restore to force all dependent components to re-read the beat
        setSelectedBeat(null);
        // Use requestAnimationFrame to ensure the null state is painted first
        requestAnimationFrame(() => {
          setSelectedBeat(freshBeat);
        });
      }
    }
  }, [beatRefreshKey]);

  // Advisory editing locks — acquire/release when selected beat changes
  const prevLockedBeatRef = useRef<string | null>(null);
  useEffect(() => {
    if (!vcs || !vcs.initialized || vcs.type !== 'git' || !vcs.projectPath) return;

    const prevBeatId = prevLockedBeatRef.current;
    const newBeatId = selectedBeat?.id ?? null;

    // Release previous lock
    if (prevBeatId && prevBeatId !== newBeatId) {
      vcs.releaseEditingLock(prevBeatId);
    }
    // Acquire new lock
    if (newBeatId && newBeatId !== prevBeatId) {
      const beatName = selectedBeat?.name || selectedBeat?.type || newBeatId;
      vcs.acquireEditingLock(newBeatId, String(beatName));
    }
    prevLockedBeatRef.current = newBeatId;

    // On unmount, release all locks
    return () => {
      if (prevLockedBeatRef.current) {
        vcs.releaseAllEditingLocks();
        prevLockedBeatRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBeat?.id, vcs?.initialized, vcs?.type, vcs?.projectPath]);

  // Command manager hook - provides global Ctrl+Z/Ctrl+Shift+Z keyboard shortcuts for undo/redo
  // Must be called after handleCommandExecuted is defined
  useCommandManager({
    onCommandExecuted: handleCommandExecuted,
  });

  const handleBeatDelete = useCallback((beatId: string) => {
    const beatToDelete = state.beats.find(b => b.id === beatId);
    if (!beatToDelete) return;

    const cmd = new DeleteBeatCommand(beatToDelete, stableMutations.current);
    getCommandManager().execute(cmd);
    setSelectedBeat(null);
    markChanged();
  }, [state.beats, markChanged]);

  const handleBeatAdd = useCallback((type: string, position: { x: number; y: number }) => {
    // addBeat creates AND adds to state in one step, so we record the command
    // without executing it (the beat is already in state)
    const newBeat = actions.addBeat(type, position);
    const cmd = new AddBeatCommand(newBeat, stableMutations.current);
    getCommandManager().pushWithoutExecute(cmd);
    setSelectedBeat(newBeat);
    markChanged();
  }, [actions, markChanged]);

  const handleBeatMove = useCallback((beatId: string, position: { x: number; y: number }) => {
    const currentBeat = state.beats.find(b => b.id === beatId);
    if (!currentBeat) return;

    const oldPos = { x: currentBeat.x || 0, y: currentBeat.y || 0 };
    const cmd = new MoveBeatCommand(beatId, oldPos, position, stableMutations.current);
    getCommandManager().execute(cmd);
  }, [state.beats]);

  // Beat clipboard for copy/paste
  const [beatClipboard, setBeatClipboard] = useState<{
    type: string;
    name: string;
    parameters: Record<string, any>;
  } | null>(null);

  const handleBeatDuplicate = useCallback((beatId: string) => {
    const beat = state.beats.find(b => b.id === beatId);
    if (!beat) return;

    const position = {
      x: (beat.x || 0) + 30,
      y: (beat.y || 0) + 30,
    };

    const newBeat = actions.addBeat(beat.type, position, {
      name: `${beat.name} (Copy)`,
    });

    // Copy parameters if possible
    if (newBeat && typeof beat.getParameters === 'function') {
      const params = beat.getParameters();
      actions.updateBeat(newBeat.id, { parameters: params } as Partial<Beat>);
    }

    setSelectedBeat(newBeat);
    markChanged();
  }, [actions, state.beats, markChanged]);

  const handleBeatCopy = useCallback((beatId: string) => {
    const beat = state.beats.find(b => b.id === beatId);
    if (!beat) return;

    setBeatClipboard({
      type: beat.type,
      name: beat.name,
      parameters: typeof beat.getParameters === 'function' ? beat.getParameters() : {},
    });
  }, [state.beats]);

  const handleBeatPaste = useCallback((position: { x: number; y: number }) => {
    if (!beatClipboard) return;

    const newBeat = actions.addBeat(beatClipboard.type, position, {
      name: `${beatClipboard.name} (Paste)`,
    });

    // Apply copied parameters
    if (newBeat && beatClipboard.parameters) {
      actions.updateBeat(newBeat.id, { parameters: beatClipboard.parameters } as Partial<Beat>);
    }

    setSelectedBeat(newBeat);
    markChanged();
  }, [actions, beatClipboard, markChanged]);

  // VCS context menu handlers
  const vcsCtx = useVCSStatus();
  const handleViewBeatDiff = useCallback((beatId: string) => {
    // Find the file path for this beat from VCS changed files
    if (!vcsCtx) return;
    const allFiles = [
      ...vcsCtx.stagedFiles.map(f => f.path),
      ...vcsCtx.unstagedFiles.map(f => f.path),
      ...vcsCtx.changedFiles,
    ];
    const safeBeatId = beatId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const file = allFiles.find(f => f.includes(`_${beatId}.json`) || f.includes(`_${safeBeatId}.json`));
    if (file) {
      setDiffViewerFile(file);
    }
  }, [vcsCtx]);

  const handleViewBeatHistory = useCallback((beatId: string) => {
    // Open VCS panel to History tab, filtered to this beat's file
    // For now just open the panel - the HistoryTab will show all history
    setVcsPanelOpen(true);
  }, []);

  const handleRevertBeat = useCallback(async (beatId: string) => {
    if (!vcsCtx) return;
    const allFiles = [
      ...vcsCtx.stagedFiles.map(f => f.path),
      ...vcsCtx.unstagedFiles.map(f => f.path),
      ...vcsCtx.changedFiles,
    ];
    const safeBeatId = beatId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const file = allFiles.find(f => f.includes(`_${beatId}.json`) || f.includes(`_${safeBeatId}.json`));
    if (file) {
      const confirmed = window.confirm(`Revert changes to "${file}"? This cannot be undone.`);
      if (confirmed) {
        await vcsCtx.revertFiles([file]);
      }
    }
  }, [vcsCtx]);

  // Auto-layout handler - rearranges all beats using the tree layout algorithm
  const handleAutoLayout = useCallback(() => {
    if (state.beats.length === 0) return;

    // Convert beats to the format needed by the layout algorithm
    const beatsForLayout = state.beats.map(beat => ({
      id: beat.id,
      type: beat.type,
      cluster: beat.cluster,
      position: { x: beat.x || 0, y: beat.y || 0 },
      parameters: typeof beat.getParameters === 'function' ? beat.getParameters() : {},
    }));

    // Extract connections from beat objects (for simple beats with external connections)
    const externalEdges: Array<{ source: string; target: string }> = [];
    state.beats.forEach(beat => {
      if (typeof beat.getConnections === 'function') {
        const connections = beat.getConnections();
        connections.forEach((conn: any) => {
          if (conn.targetId) {
            externalEdges.push({ source: beat.id, target: conn.targetId });
          }
        });
      }
    });

    // Check if there are clusters with beats
    const clusters = state.clusters || [];
    const hasClusteredBeats = clusters.length > 0 && state.beats.some(b => b.cluster);

    // Collision detection helper - resolves overlaps after layout
    const resolveCollisions = (
      beatPositions: Map<string, { x: number; y: number }>,
      clusterPositions: Map<string, { x: number; y: number }>,
      clusterSizes: Map<string, { width: number; height: number }>
    ) => {
      const BEAT_WIDTH = 160;
      const BEAT_HEIGHT = 80; // Must match NODE_HEIGHT in ClusterContainerNode.tsx
      const PADDING = 25; // Slightly larger padding for cleaner separation
      const MAX_ITERATIONS = 100; // More iterations for complex layouts

      interface Element {
        id: string;
        x: number;
        y: number;
        width: number;
        height: number;
        isCluster: boolean;
      }

      const elements: Element[] = [];

      // Add unclustered beats
      beatPositions.forEach((pos, id) => {
        elements.push({ id, x: pos.x, y: pos.y, width: BEAT_WIDTH, height: BEAT_HEIGHT, isCluster: false });
      });

      // Add clusters
      clusterPositions.forEach((pos, id) => {
        const size = clusterSizes.get(id) || { width: 300, height: 200 };
        elements.push({ id, x: pos.x, y: pos.y, width: size.width, height: size.height, isCluster: true });
        console.log(`[Collision] Adding cluster ${id}: pos=(${pos.x.toFixed(0)}, ${pos.y.toFixed(0)}), size=${size.width}x${size.height}`);
      });

      // Check overlap between two elements
      const overlaps = (a: Element, b: Element): boolean => {
        return !(a.x + a.width + PADDING < b.x ||
                 b.x + b.width + PADDING < a.x ||
                 a.y + a.height + PADDING < b.y ||
                 b.y + b.height + PADDING < a.y);
      };

      // Iteratively resolve overlaps with increasing force
      for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
        let hadOverlap = false;
        // Increase push force as iterations go on to break deadlocks
        const forceMult = 1 + (iter / MAX_ITERATIONS) * 0.5;

        for (let i = 0; i < elements.length; i++) {
          for (let j = i + 1; j < elements.length; j++) {
            const a = elements[i];
            const b = elements[j];

            if (overlaps(a, b)) {
              hadOverlap = true;

              // Determine collision type for different push strengths
              const isClusterCluster = a.isCluster && b.isCluster;
              const isClusterBeat = (a.isCluster && !b.isCluster) || (!a.isCluster && b.isCluster);

              // Log cluster-cluster overlaps
              if (isClusterCluster && iter === 0) {
                console.log(`[Collision] CLUSTER OVERLAP: ${a.id} (${a.x.toFixed(0)},${a.y.toFixed(0)} ${a.width}x${a.height}) vs ${b.id} (${b.x.toFixed(0)},${b.y.toFixed(0)} ${b.width}x${b.height})`);
              }

              // Calculate centers
              const aCenterX = a.x + a.width / 2;
              const aCenterY = a.y + a.height / 2;
              const bCenterX = b.x + b.width / 2;
              const bCenterY = b.y + b.height / 2;

              // Calculate overlap amounts
              const overlapX = (a.width + b.width) / 2 + PADDING - Math.abs(aCenterX - bCenterX);
              const overlapY = (a.height + b.height) / 2 + PADDING - Math.abs(aCenterY - bCenterY);

              // Push apart in direction of least overlap
              // Use MUCH stronger push for cluster-cluster collisions
              if (overlapX < overlapY) {
                let shift: number;
                if (isClusterCluster) {
                  // Full overlap + extra margin for clusters
                  shift = overlapX + 50;
                } else if (isClusterBeat) {
                  // For cluster-beat: only move the beat, push it fully clear
                  shift = overlapX + 20;
                } else {
                  // Beat-beat: normal push
                  shift = (overlapX / 2 + 5) * forceMult;
                }

                if (isClusterBeat) {
                  // Only move the beat, not the cluster
                  if (a.isCluster) {
                    b.x += aCenterX <= bCenterX ? shift : -shift;
                  } else {
                    a.x += aCenterX <= bCenterX ? -shift : shift;
                  }
                } else {
                  if (aCenterX <= bCenterX) {
                    a.x -= shift / 2;
                    b.x += shift / 2;
                  } else {
                    a.x += shift / 2;
                    b.x -= shift / 2;
                  }
                }
              } else {
                let shift: number;
                if (isClusterCluster) {
                  // Full overlap + extra margin for clusters
                  shift = overlapY + 50;
                } else if (isClusterBeat) {
                  // For cluster-beat: only move the beat
                  shift = overlapY + 20;
                } else {
                  // Beat-beat: normal push
                  shift = (overlapY / 2 + 5) * forceMult;
                }

                if (isClusterBeat) {
                  // Only move the beat, not the cluster
                  if (a.isCluster) {
                    b.y += aCenterY <= bCenterY ? shift : -shift;
                  } else {
                    a.y += aCenterY <= bCenterY ? -shift : shift;
                  }
                } else {
                  if (aCenterY <= bCenterY) {
                    a.y -= shift / 2;
                    b.y += shift / 2;
                  } else {
                    a.y += shift / 2;
                    b.y -= shift / 2;
                  }
                }
              }
            }
          }
        }

        if (!hadOverlap) break;
      }

      // Extract resolved positions
      const resolvedBeats = new Map<string, { x: number; y: number }>();
      const resolvedClusters = new Map<string, { x: number; y: number }>();

      elements.forEach(el => {
        if (el.isCluster) {
          resolvedClusters.set(el.id, { x: el.x, y: el.y });
          console.log(`[Collision] Final cluster ${el.id}: (${el.x.toFixed(0)}, ${el.y.toFixed(0)})`);
        } else {
          resolvedBeats.set(el.id, { x: el.x, y: el.y });
        }
      });

      // Check if clusters still overlap after resolution
      const clusterEls = elements.filter(e => e.isCluster);
      for (let i = 0; i < clusterEls.length; i++) {
        for (let j = i + 1; j < clusterEls.length; j++) {
          if (overlaps(clusterEls[i], clusterEls[j])) {
            console.warn(`[Collision] WARNING: Clusters still overlap after resolution: ${clusterEls[i].id} and ${clusterEls[j].id}`);
          }
        }
      }

      return { resolvedBeats, resolvedClusters };
    };

    // Helper to resolve collisions between beats inside a cluster
    const resolveInternalBeatCollisions = (
      beatPositions: Map<string, { x: number; y: number }>
    ): Map<string, { x: number; y: number }> => {
      console.log('🔴🔴🔴 resolveInternalBeatCollisions CALLED with', beatPositions.size, 'beats');
      const BEAT_WIDTH = 160;
      const BEAT_HEIGHT = 80;
      const PADDING = 25; // Slightly larger padding for cleaner separation
      const MAX_ITERATIONS = 100; // More iterations for complex clusters

      // Convert to array for easier manipulation
      const beats = Array.from(beatPositions.entries()).map(([id, pos]) => ({
        id,
        x: pos.x,
        y: pos.y,
        width: BEAT_WIDTH,
        height: BEAT_HEIGHT,
      }));

      console.log('🟢🟢🟢 Created beats array with', beats.length, 'items');

      if (beats.length <= 1) {
        console.log('🟡🟡🟡 Only 1 or fewer beats, returning early');
        return beatPositions;
      }

      // Debug: Log all beat positions
      console.log('🔵🔵🔵 Checking beats for collisions:', beats.slice(0, 3));

      // Check overlap between two beats
      const overlaps = (a: typeof beats[0], b: typeof beats[0]): boolean => {
        const noOverlapRight = a.x + a.width + PADDING < b.x;
        const noOverlapLeft = b.x + b.width + PADDING < a.x;
        const noOverlapBottom = a.y + a.height + PADDING < b.y;
        const noOverlapTop = b.y + b.height + PADDING < a.y;
        const hasOverlap = !(noOverlapRight || noOverlapLeft || noOverlapBottom || noOverlapTop);
        return hasOverlap;
      };

      // Debug: Check first few pairs for overlap
      if (beats.length >= 2) {
        for (let i = 0; i < Math.min(3, beats.length); i++) {
          for (let j = i + 1; j < Math.min(4, beats.length); j++) {
            const a = beats[i];
            const b = beats[j];
            console.log(`[CollisionDetection] Pair ${a.id}-${b.id}: a=(${a.x},${a.y}), b=(${b.x},${b.y}), overlaps=${overlaps(a, b)}`);
          }
        }
      }

      // Iteratively resolve overlaps with increasing force
      let totalOverlapsFound = 0;
      for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
        let hadOverlap = false;
        // Increase push force as iterations go on to break deadlocks
        const forceMult = 1 + (iter / MAX_ITERATIONS) * 0.5;

        for (let i = 0; i < beats.length; i++) {
          for (let j = i + 1; j < beats.length; j++) {
            const a = beats[i];
            const b = beats[j];

            if (overlaps(a, b)) {
              hadOverlap = true;
              totalOverlapsFound++;

              // Calculate centers
              const aCenterX = a.x + a.width / 2;
              const aCenterY = a.y + a.height / 2;
              const bCenterX = b.x + b.width / 2;
              const bCenterY = b.y + b.height / 2;

              // Calculate overlap amounts
              const overlapX = (a.width + b.width) / 2 + PADDING - Math.abs(aCenterX - bCenterX);
              const overlapY = (a.height + b.height) / 2 + PADDING - Math.abs(aCenterY - bCenterY);

              // Push apart in direction of least overlap
              // Use full overlap amount (not half) to guarantee separation
              if (overlapX < overlapY) {
                const shift = (overlapX / 2 + 5) * forceMult;
                if (aCenterX <= bCenterX) {
                  a.x -= shift;
                  b.x += shift;
                } else {
                  a.x += shift;
                  b.x -= shift;
                }
              } else {
                const shift = (overlapY / 2 + 5) * forceMult;
                if (aCenterY <= bCenterY) {
                  a.y -= shift;
                  b.y += shift;
                } else {
                  a.y += shift;
                  b.y -= shift;
                }
              }
            }
          }
        }

        if (!hadOverlap) {
          console.log(`[CollisionDetection] Resolved all overlaps in ${iter} iterations, total overlaps found: ${totalOverlapsFound}`);
          break;
        }
      }
      if (totalOverlapsFound > 0) {
        console.log(`[CollisionDetection] After ${MAX_ITERATIONS} iterations, total overlaps resolved: ${totalOverlapsFound}`);
      }

      // NOTE: We no longer clamp minimum x/y here because:
      // 1. It was destroying spacing by clamping multiple negative values to the same position
      // 2. The caller now normalizes positions after collision resolution

      // Return resolved positions
      const resolved = new Map<string, { x: number; y: number }>();
      beats.forEach(beat => {
        resolved.set(beat.id, { x: beat.x, y: beat.y });
      });

      return resolved;
    };

    // Normalize all positions to ensure minimum padding from origin
    // This prevents beats from being placed at negative coordinates or too close to edges
    const normalizePositions = (
      beatPositions: Map<string, { x: number; y: number }>,
      clusterPositions: Map<string, { x: number; y: number }>,
      _clusterSizes: Map<string, { width: number; height: number }>
    ) => {
      const MIN_X = 100; // Minimum X padding from left edge
      const MIN_Y = 50;  // Minimum Y padding from top edge

      // Find the minimum X and Y across all elements
      let minX = Infinity;
      let minY = Infinity;

      beatPositions.forEach((pos) => {
        minX = Math.min(minX, pos.x);
        minY = Math.min(minY, pos.y);
      });

      clusterPositions.forEach((pos) => {
        minX = Math.min(minX, pos.x);
        minY = Math.min(minY, pos.y);
      });

      // Calculate shift needed to ensure minimum padding
      const shiftX = minX < MIN_X ? MIN_X - minX : 0;
      const shiftY = minY < MIN_Y ? MIN_Y - minY : 0;

      // If no shift needed, return original positions
      if (shiftX === 0 && shiftY === 0) {
        return { normalizedBeats: beatPositions, normalizedClusters: clusterPositions };
      }

      // Apply shift to all positions
      const normalizedBeats = new Map<string, { x: number; y: number }>();
      const normalizedClusters = new Map<string, { x: number; y: number }>();

      beatPositions.forEach((pos, id) => {
        normalizedBeats.set(id, { x: pos.x + shiftX, y: pos.y + shiftY });
      });

      clusterPositions.forEach((pos, id) => {
        normalizedClusters.set(id, { x: pos.x + shiftX, y: pos.y + shiftY });
      });

      console.log(`[Auto-layout] Normalized positions: shifted by (${shiftX}, ${shiftY})`);
      return { normalizedBeats, normalizedClusters };
    };

    if (hasClusteredBeats) {
      // Use cluster-aware layout
      const clusterInfos = clusters.map(cluster => ({
        id: cluster.id,
        beatIds: state.beats.filter(b => b.cluster === cluster.id).map(b => b.id),
        containerBounds: cluster.containerBounds,
        containerPosition: cluster.containerPosition,
      }));

      const result: ClusterAwareLayoutResult = applyClusterAwareTreeLayout(
        beatsForLayout,
        clusterInfos,
        undefined,
        externalEdges
      );
      console.log(`[AutoArrange] Layout result - cluster positions:`, Array.from(result.clusterPositions.entries()));

      // First resolve internal collisions for each cluster, then calculate sizes
      // This ensures clusters are sized based on collision-resolved positions
      const BEAT_WIDTH = 160;
      const BEAT_HEIGHT = 80; // Must match NODE_HEIGHT in ClusterContainerNode.tsx
      const CLUSTER_PADDING = 60; // Padding around beats inside cluster (increased for bottom space)

      // Resolve collisions for all clusters first, then normalize to positive coordinates
      const resolvedClusterInternalPositions = new Map<string, Map<string, { x: number; y: number }>>();
      result.clusterInternalPositions.forEach((internalPositions, clusterId) => {
        console.log(`[AutoArrange] Cluster ${clusterId}: ${internalPositions.size} beats before collision resolution`);
        const resolved = resolveInternalBeatCollisions(internalPositions);

        // Normalize positions to ensure all are positive and start from cluster padding
        // Find minimum x and y values
        let minX = Infinity, minY = Infinity;
        resolved.forEach(pos => {
          minX = Math.min(minX, pos.x);
          minY = Math.min(minY, pos.y);
        });

        // Shift all positions so minimum is at (40, 60) - cluster internal padding
        const INTERNAL_PADDING_X = 40;
        const INTERNAL_PADDING_Y = 60; // Account for cluster header
        const shiftX = INTERNAL_PADDING_X - minX;
        const shiftY = INTERNAL_PADDING_Y - minY;

        const normalized = new Map<string, { x: number; y: number }>();
        resolved.forEach((pos, beatId) => {
          normalized.set(beatId, { x: pos.x + shiftX, y: pos.y + shiftY });
        });

        console.log(`[AutoArrange] Cluster ${clusterId}: normalized positions (shifted by ${shiftX}, ${shiftY})`, Array.from(normalized.entries()));
        resolvedClusterInternalPositions.set(clusterId, normalized);
      });

      // Calculate cluster sizes from RESOLVED positions (after collision detection)
      const clusterSizes = new Map<string, { width: number; height: number }>();
      clusters.forEach(c => {
        const internalPositions = resolvedClusterInternalPositions.get(c.id);
        if (internalPositions && internalPositions.size > 0) {
          // Calculate the maximum extent of internal beats from cluster origin
          // Internal positions are relative to cluster origin (0,0), with layout starting
          // at startX=40, startY=60 to account for padding and header
          let maxX = 0, maxY = 0;
          internalPositions.forEach((pos) => {
            maxX = Math.max(maxX, pos.x + BEAT_WIDTH);
            maxY = Math.max(maxY, pos.y + BEAT_HEIGHT);
          });
          // Add padding after the rightmost/bottommost beat
          // Use smaller minimums to avoid overly wide clusters for simple vertical stacks
          const width = Math.max(240, maxX + CLUSTER_PADDING);  // Reduced from 300
          const height = Math.max(160, maxY + CLUSTER_PADDING); // Reduced from 200
          clusterSizes.set(c.id, { width, height });
          console.log(`[AutoArrange] Cluster ${c.id} size: ${width}x${height} (maxX=${maxX}, maxY=${maxY})`);
        } else {
          // Fallback to stored bounds or default
          clusterSizes.set(c.id, c.containerBounds || { width: 300, height: 200 });
        }
      });

      // Resolve any overlaps between beats and clusters
      console.log(`[AutoArrange] Resolving collisions: ${result.beatPositions.size} beats, ${result.clusterPositions.size} clusters`);
      const { resolvedBeats, resolvedClusters } = resolveCollisions(
        result.beatPositions,
        result.clusterPositions,
        clusterSizes
      );
      console.log(`[AutoArrange] After collision resolution:`, Array.from(resolvedClusters.entries()));

      // Normalize positions to ensure all elements are visible (not at negative coords)
      const { normalizedBeats, normalizedClusters } = normalizePositions(
        resolvedBeats,
        resolvedClusters,
        clusterSizes
      );

      // Apply normalized positions to unclustered beats
      normalizedBeats.forEach((pos, beatId) => {
        actions.moveBeat(beatId, pos);
      });

      // Apply normalized positions to clusters and update their sizes
      normalizedClusters.forEach((pos, clusterId) => {
        if (actions.moveCluster) {
          actions.moveCluster(clusterId, pos);
        }
        // Also update cluster size to fit all internal beats
        const newSize = clusterSizes.get(clusterId);
        if (newSize && actions.resizeCluster) {
          actions.resizeCluster(clusterId, newSize.width, newSize.height);
        }
      });

      // Apply positions to beats inside clusters (already collision-resolved)
      resolvedClusterInternalPositions.forEach((resolvedPositions, clusterId) => {
        resolvedPositions.forEach((pos, beatId) => {
          if (actions.moveBeatInContainer) {
            actions.moveBeatInContainer(beatId, clusterId, pos.x, pos.y);
          }
        });
      });
    } else {
      // No clusters - use standard layout
      // Use first beat as start beat to ensure it's positioned at top
      const startBeatId = state.beats[0]?.id;
      const newPositions = applyTreeLayoutToBeats(beatsForLayout, undefined, externalEdges, startBeatId);

      // Resolve overlapping beats using collision detection
      const { resolvedBeats } = resolveCollisions(
        newPositions,
        new Map(), // No clusters
        new Map()  // No cluster sizes
      );

      // Normalize positions for non-clustered layout
      const { normalizedBeats } = normalizePositions(
        resolvedBeats,
        new Map(), // No clusters
        new Map()  // No cluster sizes
      );

      // Apply normalized positions to all beats
      normalizedBeats.forEach((pos, beatId) => {
        actions.moveBeat(beatId, pos);
      });
    }

    markChanged();
  }, [state.beats, state.clusters, actions, markChanged]);

  // Electron integration - View > Auto-arrange Beats menu item
  useEffect(() => {
    if (!isElectron() || !window.electronAPI?.onMenuAutoArrange) {
      return;
    }
    const unsubscribe = window.electronAPI.onMenuAutoArrange(() => {
      console.log('[Electron] Auto-arrange requested from menu');
      handleAutoLayout();
    });
    return unsubscribe;
  }, [handleAutoLayout]);

  // Electron integration - Version Control menu items
  useEffect(() => {
    if (!isElectron()) return;
    const api = window.electronAPI;
    const unsubs: (() => void)[] = [];

    if (api?.onVCSTogglePanel) {
      unsubs.push(api.onVCSTogglePanel(() => setVcsPanelOpen(prev => !prev)));
    }
    if (api?.onVCSCommit) {
      unsubs.push(api.onVCSCommit(() => { setVcsPanelOpen(true); /* focus commit input */ }));
    }
    if (api?.onVCSPush && vcsCtx) {
      unsubs.push(api.onVCSPush(() => { vcsCtx.push(); }));
    }
    if (api?.onVCSPull && vcsCtx) {
      unsubs.push(api.onVCSPull(() => { vcsCtx.pull(); }));
    }
    if (api?.onVCSStash && vcsCtx) {
      unsubs.push(api.onVCSStash(() => { vcsCtx.stash(); }));
    }
    if (api?.onVCSStashPop && vcsCtx) {
      unsubs.push(api.onVCSStashPop(() => { vcsCtx.stashPop(); }));
    }
    if (api?.onVCSRefresh && vcsCtx) {
      unsubs.push(api.onVCSRefresh(() => { vcsCtx.refresh(); }));
    }
    if (api?.onMenuCloneRepo) {
      unsubs.push(api.onMenuCloneRepo(() => setShowCloneRepoDialog(true)));
    }

    return () => unsubs.forEach(u => u());
  }, [vcsCtx]);

  // Reload translations from disk after successful VCS operations (pull, stash pop, etc.)
  // This handles both cases:
  //   - Translations already loaded: sync staleness against updated source
  //   - No translations loaded yet: load newly pulled translation files from disk
  useEffect(() => {
    if (!vcsCtx) return;
    let syncTimer: ReturnType<typeof setTimeout> | null = null;
    const unsub = vcsCtx.onEvent((event) => {
      if (event.type !== 'success') return;

      // Clear undo history after VCS operations (pull, stash pop, etc.)
      // because the project state on disk has changed externally
      getCommandManager().clear();

      if (syncTimer) clearTimeout(syncTimer);
      syncTimer = setTimeout(async () => {
        const proj = currentProjectRef2.current;
        if (!proj?.id) return;
        const dirPath = proj.directoryPath;
        if (!dirPath) return;

        const api = window.electronAPI;
        if (!api?.fs) return;

        try {
          // Read translation files from the translations/ directory on disk
          const sep = dirPath.includes('\\') ? '\\' : '/';
          const translationsDir = dirPath + sep + 'translations';
          const dirExists = await api.fs.exists(translationsDir);
          if (!dirExists) {
            // No translations directory — if we had translations, clear them
            if (translationStateRef.current.translations.length > 0) {
              translationActionsRef.current.clearTranslations();
            }
            return;
          }

          const entries = await api.fs.readDir(translationsDir);
          const resources: any[] = [];
          let manifest: any = undefined;

          for (const entry of entries) {
            const name = entry.name || entry;
            if (typeof name !== 'string') continue;
            const filePath = translationsDir + sep + name;

            if (name === '_manifest.json') {
              try {
                const buf = await api.fs.readFile(filePath);
                const text = buf instanceof Uint8Array || buf instanceof ArrayBuffer
                  ? new TextDecoder().decode(buf) : String(buf);
                manifest = JSON.parse(text);
              } catch { /* skip */ }
            } else if (name.endsWith('.strings.json')) {
              try {
                const buf = await api.fs.readFile(filePath);
                const text = buf instanceof Uint8Array || buf instanceof ArrayBuffer
                  ? new TextDecoder().decode(buf) : String(buf);
                resources.push(JSON.parse(text));
              } catch { /* skip */ }
            }
          }

          if (resources.length > 0) {
            console.log('[App] Post-VCS: Loaded', resources.length, 'translation(s) from disk:',
              resources.map((r: any) => r.languageCode));
            translationActionsRef.current.loadTranslations(resources, manifest);
            // Also update the project object so next save includes them
            proj.translations = resources;
            proj.translationManifest = manifest;
          } else if (translationStateRef.current.translations.length > 0) {
            // Translation files were removed (e.g., reverted)
            translationActionsRef.current.clearTranslations();
            delete proj.translations;
            delete proj.translationManifest;
          }

          // If translations exist, also sync staleness against current source
          if (translationStateRef.current.translations.length > 0) {
            try {
              const projectData = await getProjectDataForExport(proj.id);
              translationActionsRef.current.syncAllTranslations(projectData);
            } catch (e) {
              console.error('[App] Post-VCS translation staleness sync failed:', e);
            }
          }
        } catch (e) {
          console.error('[App] Post-VCS translation reload failed:', e);
        }
      }, 500);
    });
    return () => {
      unsub();
      if (syncTimer) clearTimeout(syncTimer);
    };
  }, [vcsCtx]);

  const handleExport = useCallback(async () => {
    try {
      const asml = actions.exportStory(assets, characters);
      const blob = new Blob([asml], { type: 'text/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${state.title.replace(/\s+/g, '_')}.xml`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export story. See console for details.');
    }
  }, [actions, state.title, assets, characters]);

  const handleImport = useCallback(async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xml';

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();

        // Check if the ASML file references assets
        const manifest = ASMLParser.getAssetManifest(text);

        if (manifest.hasAssets()) {
          // Show import dialog for asset selection
          setImportAsmlContent(text);
          setImportAsmlManifest(manifest);
          setShowImportAsmlDialog(true);
        } else {
          // No assets, import directly
          // CRITICAL: Clear existing assets and characters first to start fresh
          setAssets([]);
          setCharacters([]);

          const importResult = await actions.importStory(text);
          setSelectedBeat(null);

          // CRITICAL: Create a new project for the imported story
          // Use the title from the import result (not state, which is async)
          const importedTitle = importResult.title || 'Imported Story';
          pendingNewProjectIdRef.current = 'pending';
          const newProjectId = await createProject(importedTitle, `Imported from ASML`);
          pendingNewProjectIdRef.current = newProjectId;
          loadedProjectIdRef.current = newProjectId;
          console.log('[App] ASML import - Created new project:', newProjectId, 'with title:', importedTitle);

          alert('Story imported successfully!');
        }
      } catch (error) {
        // Log full error details for debugging
        console.error('Import failed:', error);
        if (error instanceof Error) {
          console.error('Error message:', error.message);
          console.error('Error stack:', error.stack);
        } else {
          console.error('Non-Error thrown:', JSON.stringify(error, null, 2));
        }
        const errorMsg = error instanceof Error ? error.message : String(error);
        alert(`Failed to import story: ${errorMsg}`);
      }
    };

    input.click();
  }, [actions, createProject]);

  /**
   * Handle import dialog completion (with or without assets)
   */
  const handleImportAsmlComplete = useCallback(async (result: {
    fileMap: Map<string, File>;
    filesFound: number;
    filesMissing: number;
  }) => {
    setShowImportAsmlDialog(false);

    // CRITICAL: Clear existing assets and characters first to start fresh
    setAssets([]);
    setCharacters([]);

    try {
      // Create a temporary project ID for asset storage during import
      // We'll create the real project after import succeeds
      const tempProjectId = `import-${Date.now()}`;

      // Import with or without assets
      const importResult = await actions.importStory(importAsmlContent, {
        fileMap: result.fileMap,
        addAsset: async (asset: Asset, blob: Blob) => {
          try {
            // Convert to stored format and persist using HybridStorageAdapter
            const storedAsset = await assetToStored(asset, tempProjectId, blob);
            const storage = getStorageAdapter();
            await storage.initialize();
            await storage.saveAsset(storedAsset);
            console.log('[handleImportAsmlComplete] Persisted asset:', asset.name);

            // Add to local state
            setAssets(prev => [...prev, asset]);
            return true;
          } catch (err) {
            console.error('[handleImportAsmlComplete] Failed to persist asset:', asset.name, err);
            // Still add to local state as fallback
            setAssets(prev => [...prev, asset]);
            return true;
          }
        },
        projectId: tempProjectId
      });

      setSelectedBeat(null);

      // Add imported characters to character state
      if (importResult.characters && importResult.characters.length > 0) {
        setCharacters(prev => [...prev, ...importResult.characters]);
        console.log('[handleImportAsmlComplete] Added characters:', importResult.characters.map(c => c.displayName));
      }

      // Merge imported settings into globalSettings
      // This is needed because ASML settings (like backgroundMusic) are stored in state.settings
      // but the UI uses globalSettings
      // NOTE: We use importResult.settings (returned directly) instead of state.settings
      // because React's setState is async and state.settings won't be updated yet
      const importedSettings = importResult.settings;
      if (importedSettings && Object.keys(importedSettings).length > 0) {
        console.log('[handleImportAsmlComplete] Merging imported settings:', importedSettings);
        setGlobalSettings(prev => {
          // Helper to filter out null/undefined values from an object
          // This prevents null values from overwriting defaults during spread
          const filterNullValues = (obj: Record<string, any> | undefined): Record<string, any> => {
            if (!obj) return {};
            return Object.fromEntries(
              Object.entries(obj).filter(([_, v]) => v !== null && v !== undefined)
            );
          };

          // Helper to calculate contrasting text color based on background
          // Uses relative luminance formula to determine if background is light or dark
          const getContrastingTextColor = (bgColor: string): string => {
            // Parse hex color (supports #RGB, #RRGGBB)
            let hex = bgColor.replace('#', '');
            if (hex.length === 3) {
              hex = hex.split('').map(c => c + c).join('');
            }
            const r = parseInt(hex.substring(0, 2), 16) / 255;
            const g = parseInt(hex.substring(2, 4), 16) / 255;
            const b = parseInt(hex.substring(4, 6), 16) / 255;

            // Calculate relative luminance (WCAG formula)
            const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

            // Return dark text for light backgrounds, light text for dark backgrounds
            return luminance > 0.5 ? '#1a1a1a' : '#ffffff';
          };

          // Map ASML textbox colors to GlobalSettings colors
          // ASML stores textbox bgcolor/bordercolor in textbox section, but GlobalSettings uses colors section
          const textboxBgColor = importedSettings.textbox?.bgcolor;
          const textboxBorderColor = importedSettings.textbox?.bordercolor;

          // Map ASML button colors to GlobalSettings if present
          const buttonBgColor = importedSettings.button?.bgcolor;
          const buttonTextColor = importedSettings.button?.textcolor;

          // Filter imported colors to exclude null values
          const filteredColors = filterNullValues(importedSettings.colors);

          // In ASML format:
          // - pcolor/palpha = button/choice BACKGROUND color/alpha (player-interactive)
          // - nonpcolor/nonpalpha = NPC textbox BACKGROUND color/alpha
          // Text colors are auto-calculated from backgrounds for readability

          return {
            ...prev,
            // Deep merge all settings categories to preserve defaults
            sound: {
              ...prev.sound,
              ...filterNullValues(importedSettings.sound)
            },
            colors: {
              ...prev.colors,
              // Button/choice background from pcolor
              ...(filteredColors.pcolor ? { pcolor: filteredColors.pcolor } : {}),
              ...(filteredColors.palpha !== undefined ? { palpha: filteredColors.palpha } : {}),
              // NPC textbox background from nonpcolor
              ...(filteredColors.nonpcolor ? { nonpcolor: filteredColors.nonpcolor } : {}),
              ...(filteredColors.nonpalpha !== undefined ? { nonpalpha: filteredColors.nonpalpha } : {}),
              // Text colors are auto-calculated (leave empty for auto)
              ptextcolor: '',
              nonptextcolor: '',
              // Override with explicit textbox border if present
              ...(textboxBorderColor ? { textBoxBorder: textboxBorderColor } : {}),
            },
            fonts: {
              ...prev.fonts,
              ...filterNullValues(importedSettings.fonts),
              // Map buttonFont to btnFont
              ...(importedSettings.fonts?.buttonFont ? { btnFont: importedSettings.fonts.buttonFont } : {}),
            },
            textbox: {
              ...prev.textbox,
              // Only merge supported textbox properties (already filtering for non-null)
              ...(importedSettings.textbox?.radius !== undefined ? { radius: importedSettings.textbox.radius } : {}),
              // Use nonpalpha (textbox background alpha) as opacity, fallback to textbox.opacity
              ...(filteredColors.nonpalpha !== undefined
                ? { opacity: filteredColors.nonpalpha }
                : importedSettings.textbox?.opacity !== undefined
                  ? { opacity: importedSettings.textbox.opacity }
                  : {}),
              ...(importedSettings.textbox?.padding !== undefined ? { padding: importedSettings.textbox.padding } : {}),
              ...(importedSettings.textbox?.borderWidth !== undefined ? { borderWidth: importedSettings.textbox.borderWidth } : {}),
            },
            debug: {
              ...prev.debug,
              ...filterNullValues(importedSettings.debug)
            },
            copyright: {
              ...prev.copyright,
              ...filterNullValues(importedSettings.copyright)
            }
          };
        });
      }

      // CRITICAL: Create a new project for the imported story
      // Use the title from the import result (not state, which is async)
      const importedTitle = importResult.title || 'Imported Story';
      pendingNewProjectIdRef.current = 'pending';
      const newProjectId = await createProject(importedTitle, `Imported from ASML`);
      pendingNewProjectIdRef.current = newProjectId;
      loadedProjectIdRef.current = newProjectId;
      console.log('[App] ASML import with assets - Created new project:', newProjectId, 'with title:', importedTitle);

      // CRITICAL: Reassociate assets from tempProjectId to the actual project ID
      // Assets were saved with tempProjectId during import, but now need to be linked to the real project
      const storage = getStorageAdapter();
      const migratedCount = await storage.reassociateAssets(tempProjectId, newProjectId);
      console.log(`[App] ASML import - Reassociated ${migratedCount} assets from ${tempProjectId} to ${newProjectId}`);

      // Show summary
      let message = 'Story imported successfully!';
      if (importResult.assetStats) {
        const stats = importResult.assetStats;
        message += `\n\nAssets imported:`;
        message += `\n- Backgrounds: ${stats.backgroundsImported}`;
        message += `\n- Props: ${stats.propsImported}`;
        message += `\n- Sounds: ${stats.soundsImported}`;
        message += `\n- Characters: ${stats.charactersCreated} (${stats.characterImagesImported} images)`;
        if (stats.totalFilesMissing > 0) {
          message += `\n\nWarning: ${stats.totalFilesMissing} files were not found`;
        }
      }
      if (importResult.errors.length > 0) {
        message += `\n\nWarnings: ${importResult.errors.length} issues`;
        console.warn('Import warnings:', importResult.errors);
      }

      alert(message);
    } catch (error) {
      console.error('Import failed:', error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      alert(`Failed to import story: ${errorMsg}`);
    }

    // Clear import state
    setImportAsmlContent('');
    setImportAsmlManifest(null);
  }, [actions, importAsmlContent, createProject]);

  /**
   * Handle import dialog cancellation
   */
  const handleImportAsmlCancel = useCallback(() => {
    setShowImportAsmlDialog(false);
    setImportAsmlContent('');
    setImportAsmlManifest(null);
  }, []);

  /**
   * Open Twine import dialog
   */
  const handleImportTwine = useCallback(() => {
    setShowImportTwineDialog(true);
  }, []);

  /**
   * Handle Twine import completion
   */
  const handleImportTwineComplete = useCallback(async (result: ImportResult) => {
    setShowImportTwineDialog(false);

    try {
      // Import beats from Twine result
      actions.importBeats(result.beats, {
        title: result.title,
        author: result.author,
        firstBeatId: result.firstBeatId,
      });

      setSelectedBeat(null);

      // CRITICAL: Set pending flag BEFORE saveCurrent to prevent load effect
      // from reloading the old project during the transition
      pendingNewProjectIdRef.current = 'pending';
      console.log('[App] Twine import - Set pendingNewProjectIdRef to "pending"');

      // Save as named project (converts from "Untitled Project" to named project)
      const projectName = result.title || 'Imported Twine Story';
      const newProjectId = await saveCurrent(projectName, `Imported from Twine: ${result.title}`);

      // CRITICAL: Update refs to complete the transition
      // This prevents the load effect from treating this as a project switch
      pendingNewProjectIdRef.current = newProjectId;
      loadedProjectIdRef.current = newProjectId;
      console.log('[App] Twine import - Updated refs to new project ID:', newProjectId);

      // Show success message with stats
      const warningCount = result.warnings.length;
      let message = `Successfully imported "${result.title}" with ${result.beats.length} beats.`;
      if (warningCount > 0) {
        message += `\n\n${warningCount} warnings during import. Check console for details.`;
        console.log('[Twine Import] Warnings:', result.warnings);
      }
      alert(message);
    } catch (error) {
      console.error('Twine import failed:', error);
      // Clear pending flag on error
      pendingNewProjectIdRef.current = null;
      const errorMsg = error instanceof Error ? error.message : String(error);
      alert(`Failed to import Twine story: ${errorMsg}`);
    }
  }, [actions, saveCurrent]);

  /**
   * Handle Twine import cancellation
   */
  const handleImportTwineCancel = useCallback(() => {
    setShowImportTwineDialog(false);
  }, []);

  const handleExportZip = useCallback(async () => {
    if (!currentProject) {
      alert('No project loaded. Please save or create a project first.');
      return;
    }

    try {
      // First save the current state
      await saveNow();

      // Then export as ZIP
      await downloadProjectAsZip(currentProject.id, currentProject.name);

      alert('Project exported successfully!');
    } catch (error) {
      console.error('ZIP export failed:', error);
      alert('Failed to export project as ZIP. See console for details.');
    }
  }, [currentProject, saveNow]);

  const handleExportAsmlWithAssets = useCallback(async () => {
    try {
      // Generate ASML XML
      const asml = actions.exportStory(assets, characters);

      // Get stored assets for current project
      const storage = getStorageAdapter();
      await storage.initialize();
      const assetsResult = await storage.getProjectAssets(currentProject?.id || 'temp');
      const storedAssets = assetsResult.success ? assetsResult.data || [] : [];

      // Import the download function dynamically
      const { downloadAsmlWithAssets } = await import('./utils/projectZipManager');

      await downloadAsmlWithAssets(
        state.title || 'Untitled',
        asml,
        storedAssets
      );

      alert('ASML with assets exported successfully!');
    } catch (error) {
      console.error('Export ASML with assets failed:', error);
      alert('Failed to export ASML with assets. See console for details.');
    }
  }, [actions, assets, characters, state.title, currentProject]);

  const handleImportZip = useCallback(async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip,.asaps.zip';

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const doImport = async (options: { overwrite?: boolean; generateNewId?: boolean; newName?: string } = {}) => {
        const result = await importProjectFromZip(file, options);

        if (result.conflict) {
          // Show modal dialog for conflict resolution (Electron compatible)
          const existingName = result.conflict.existingProjectName || 'Unknown';
          const incomingName = result.conflict.incomingProjectName || 'Unknown';

          const choice = await showImportConflictPrompt(
            `A project with this ID already exists!\n\nExisting: "${existingName}"\nImporting: "${incomingName}"\n\nEnter a new name or type "OVERWRITE" to replace:`,
            incomingName + ' (Copy)'
          );

          if (choice === null) {
            // User cancelled
            return;
          } else if (choice.toUpperCase() === 'OVERWRITE') {
            // Overwrite existing
            return doImport({ overwrite: true });
          } else if (choice.trim()) {
            // Import with new ID and name
            return doImport({ generateNewId: true, newName: choice.trim() });
          } else {
            alert('Please enter a valid name or "OVERWRITE"');
            return;
          }
        }

        if (result.success && result.projectId) {
          // Load the imported project
          await loadProject(result.projectId);
          alert('Project imported successfully!');
        } else if (result.error) {
          throw new Error(result.error);
        }
      };

      try {
        await doImport({ generateNewId: false });
      } catch (error) {
        console.error('ZIP import failed:', error);
        alert(`Failed to import project: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    };

    input.click();
  }, [loadProject]);

  const handlePreview = useCallback(() => {
    if (state.beats.length === 0) {
      alert('Please add some beats to your story first!');
      return;
    }
    // Pause auto-save while preview is open to prevent interruptions
    pauseAutoSave();
    setShowPreview(true);
  }, [state.beats, pauseAutoSave]);

  const handleClosePreview = useCallback(() => {
    setShowPreview(false);
    // Resume auto-save after preview is closed
    resumeAutoSave();
  }, [resumeAutoSave]);

  // Serialize story data for preview window
  const getSerializedStoryData = useCallback(() => {
    // Serialize beats with all their data
    const serializedBeats = state.beats.map(beat => ({
      id: beat.id,
      name: beat.name,
      type: beat.type,
      x: beat.x,
      y: beat.y,
      cluster: beat.cluster,
      node: beat.node,
      transition: beat.transition,
      sound: beat.sound,
      defaultTarget: beat.defaultTarget,
      defaultTargetDelay: beat.defaultTargetDelay,
      showTimer: beat.showTimer,
      notes: beat.notes,
      timeDisplayMode: beat.timeDisplayMode,
      timeDisplayText: beat.timeDisplayText,
      overrideCountdownMeter: beat.overrideCountdownMeter,
      parameters: beat.getParameters?.() || {},
      connections: beat.connections?.map(conn => ({
        targetId: conn.targetId,
        label: conn.label,
        condition: conn.condition,
      })) || [],
      locations: beat.locations ? Array.from(beat.locations.values()) : [],
      animations: beat.animations || [],
    }));

    const storyData = {
      title: state.title,
      author: state.author,
      firstBeatId: getStoryForPreview().getFirstBeatId(),
      beats: serializedBeats,
    };

    // Apply translations if a language is active
    if (translationState.activeLanguage) {
      const resource = translationState.translations.find(
        t => t.languageCode === translationState.activeLanguage
      );
      if (resource) {
        // Wrap in project structure for applyTranslationResource, then unwrap
        const wrapped = { project: { story: storyData } };
        const translated = applyTranslationResource(wrapped, resource);
        return translated.project.story;
      }
    }

    return storyData;
  }, [state.beats, state.title, state.author, state.story, translationState.activeLanguage, translationState.translations]);

  // Toggle preview window (separate window mode)
  const handleTogglePreviewWindow = useCallback(() => {
    if (state.beats.length === 0) {
      alert('Please add some beats to your story first!');
      return;
    }

    if (previewWindowManager.isWindowOpen()) {
      previewWindowManager.close();
    } else {
      // Serialize story data for the preview window
      const storyData = getSerializedStoryData();

      // Apply character-level translations for preview
      let translatedChars = characters;
      if (translationState.activeLanguage) {
        const resource = translationState.translations.find(
          t => t.languageCode === translationState.activeLanguage
        );
        if (resource) {
          const wrapped = { project: { story: { characters } } };
          const translated = applyTranslationResource(wrapped, resource);
          translatedChars = translated.project?.story?.characters ?? characters;
        }
      }

      previewWindowManager.open({
        storyData,
        settings: globalSettings,
        assets: assets,
        characters: translatedChars,
        themeAssets: themeAssets,
        beatId: selectedBeat?.id,
        activeLanguage: translationState.activeLanguage ?? null,
      });
    }
  }, [state.beats, selectedBeat, assets, characters, themeAssets, getSerializedStoryData, globalSettings, translationState.activeLanguage, translationState.translations]);

  // Keyboard shortcut for preview window (Ctrl/Cmd+Shift+P)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        handleTogglePreviewWindow();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleTogglePreviewWindow]);

  // Auto-reload preview window when story changes (debounced)
  const previewUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    // Only send updates if preview window is open
    if (!previewWindowOpen) return;

    // Clear any pending update
    if (previewUpdateTimeoutRef.current) {
      clearTimeout(previewUpdateTimeoutRef.current);
    }

    // Debounce updates to avoid flooding
    previewUpdateTimeoutRef.current = setTimeout(() => {
      const storyData = getSerializedStoryData();
      // Apply character-level translations (counter displayNames, inventory displayNames)
      let translatedCharacters = characters;
      if (translationState.activeLanguage) {
        const resource = translationState.translations.find(
          t => t.languageCode === translationState.activeLanguage
        );
        if (resource) {
          const wrapped = { project: { story: { characters } } };
          const translated = applyTranslationResource(wrapped, resource);
          translatedCharacters = translated.project?.story?.characters ?? characters;
        }
      }

      previewWindowManager.sendUpdate({
        storyData,
        settings: globalSettings,
        projectSettings: { width: projectSettings.width, height: projectSettings.height },
        assets: assets,
        characters: translatedCharacters,
        themeAssets: themeAssets,
        beatId: selectedBeat?.id,
        activeLanguage: translationState.activeLanguage ?? null,
      });
      console.log('[App] Sent auto-reload update to preview window');
    }, 300);

    return () => {
      if (previewUpdateTimeoutRef.current) {
        clearTimeout(previewUpdateTimeoutRef.current);
      }
    };
  }, [previewWindowOpen, state.beats, state.connections, globalSettings, assets, characters, themeAssets, getSerializedStoryData, translationState.activeLanguage, selectedBeat]);

  // Auto-navigate preview to selected beat
  useEffect(() => {
    if (!previewWindowOpen || !selectedBeat) return;

    previewWindowManager.navigateToBeat(selectedBeat.id);
  }, [previewWindowOpen, selectedBeat]);

  // Asset and character handlers
  const handleAssetSelect = useCallback((type: 'background' | 'character' | 'prop' | 'sound', callback: (asset: Asset) => void) => {
    // Implement asset selection modal
    console.log('Asset select for type:', type);
  }, []);

  const handleAssetAdd = useCallback(async (asset: Asset) => {
    console.log('[App] handleAssetAdd CALLED with asset:', asset.name, asset.id);

    if (!currentProject) {
      console.warn('[App] handleAssetAdd - No current project, skipping storage');
      setAssets(prev => [...prev, asset]);
      markChanged();
      return true;
    }

    console.log('[App] handleAssetAdd - Current project:', currentProject.id);

    try {
      // Extract blob from asset and convert to stored format
      console.log('[App] handleAssetAdd - Extracting blob...');
      const blob = await extractBlobFromAsset(asset);
      console.log('[App] handleAssetAdd - Blob extracted, size:', blob.size);

      const storedAsset = await assetToStored(asset, currentProject.id, blob);
      console.log('[App] handleAssetAdd - Converted to stored format');

      // Save to storage using HybridStorageAdapter (v2 schema with asset-metadata)
      const storage = getStorageAdapter();
      console.log('[App] handleAssetAdd - Got HybridStorageAdapter');
      await storage.initialize();
      console.log('[App] handleAssetAdd - Storage initialized, saving asset...');
      await storage.saveAsset(storedAsset);

      setAssets(prev => [...prev, asset]);
      markChanged();
      console.log('[App] handleAssetAdd - Asset saved to storage:', asset.name);
      return true;
    } catch (err) {
      console.error('[App] handleAssetAdd - Error saving asset:', err);
      // Still add to local state as fallback
      setAssets(prev => [...prev, asset]);
      markChanged();
      return true;
    }
  }, [currentProject, markChanged]);

  const handleAssetRemove = useCallback(async (assetId: string) => {
    try {
      // Delete from storage using HybridStorageAdapter
      const storage = getStorageAdapter();
      await storage.initialize();
      await storage.deleteAsset(assetId);
      console.log('[App] handleAssetRemove - Asset deleted from storage:', assetId);
    } catch (err) {
      console.error('[App] handleAssetRemove - Error deleting asset:', err);
    }

    // Always update local state
    setAssets(prev => prev.filter(a => a.id !== assetId));
    markChanged();
  }, [markChanged]);

  const handleAssetUpdate = useCallback((assetId: string, updates: Partial<Asset>) => {
    setAssets(prev => prev.map(a => a.id === assetId ? { ...a, ...updates } : a));
    markChanged();
  }, [markChanged]);

  const handleCharactersChange = useCallback((newCharacters: Character[]) => {
    setCharacters(newCharacters);
    markChanged();
  }, [markChanged]);

  const handleOpenCharacterManager = useCallback((callback?: (character: Character) => void) => {
    // Store the callback so we can call it when a character is selected
    characterSelectionCallbackRef.current = callback || null;
    setShowCharacterManager(true);
  }, []);

  const handleCloseCharacterManager = useCallback(() => {
    setShowCharacterManager(false);
    characterSelectionCallbackRef.current = null;
  }, []);

  const handleOpenAssetManager = useCallback(() => {
    setShowAssetManager(true);
  }, []);

  const handleCloseAssetManager = useCallback(() => {
    setShowAssetManager(false);
  }, []);

  const handleOpenSettings = useCallback(() => {
    setShowSettings(true);
  }, []);

  const handleCloseSettings = useCallback(() => {
    setShowSettings(false);
  }, []);

  /**
   * Handle manual save - for untitled projects, this shows the Save Project dialog
   */
  const handleSave = useCallback(async () => {
    console.log('[App] handleSave called - isUntitledProject:', isUntitledProject, 'currentProject:', currentProject?.id, 'should open dialog:', isUntitledProject || !currentProject);
    // CRITICAL FIX: Also show dialog if there's no current project at all
    // This handles the edge case where initialization failed to create a project
    if (isUntitledProject || !currentProject) {
      // For untitled projects or missing project, show the Save Project dialog
      console.log('[App] Opening SaveProjectDialog for untitled/missing project');
      setShowSaveProjectDialog(true);
    } else {
      // For named projects, just save now
      console.log('[App] Saving named project now');
      try {
        await saveNow();
        console.log('[App] Save completed');
      } catch (error) {
        console.error('[App] Save failed:', error);
      }
    }
  }, [isUntitledProject, currentProject, saveNow]);

  /**
   * Handle Save Project - shows dialog for naming untitled project
   */
  const handleSaveProject = useCallback(() => {
    setShowSaveProjectDialog(true);
  }, []);

  /**
   * Handle confirming Save Project dialog - saves current work as named project
   */
  const handleSaveProjectConfirmed = useCallback(async (name: string, description?: string) => {
    try {
      // CRITICAL FIX: If there's no current project (initialization failed),
      // create one first with the current beats, then save it
      if (!currentProject) {
        console.log('[App] No current project - creating new project with current beats:', name);

        // Create a new project first
        const newProjectId = await createProject(name, description);
        console.log('[App] Created new project:', newProjectId);

        // Sync the current beats to the project
        syncProjectData();

        // Mark as NOT untitled since we just named it
        setIsUntitledProject(false);

        // Wait for sync to propagate then save directly to storage
        // Using a small delay to ensure the project ref is updated
        await new Promise(resolve => setTimeout(resolve, 100));

        // Get the updated project from storage manager and save it
        // This bypasses the auto-save protections (isDefaultProject check)
        // which are meant for auto-save, not explicit manual saves
        const result = await storage.getProject(newProjectId);
        if (result.success && result.data) {
          const updatedProject = { ...result.data, modifiedAt: new Date() };
          await storage.updateProject(updatedProject);
          console.log('[App] Saved beats to new project');
        }

        alert('Project saved successfully!');
        return;
      }

      await saveCurrent(name, description);
      alert('Project saved successfully!');
    } catch (error) {
      console.error('Failed to save project:', error);
      alert('Failed to save project. Please try again.');
    }
  }, [saveCurrent, currentProject, createProject, syncProjectData, setIsUntitledProject, storage]);

  /**
   * Handle closing Save Project dialog
   */
  const handleCloseSaveProjectDialog = useCallback(() => {
    setShowSaveProjectDialog(false);
  }, []);

  /**
   * Show import conflict modal and wait for user response (replaces window.prompt())
   */
  const showImportConflictPrompt = useCallback((label: string, defaultValue: string): Promise<string | null> => {
    return new Promise((resolve) => {
      setImportConflictLabel(label);
      setImportConflictDefault(defaultValue);
      importConflictResolverRef.current = resolve;
      setShowImportConflictModal(true);
    });
  }, []);

  /**
   * Handle import conflict modal confirmation
   */
  const handleImportConflictConfirm = useCallback((value: string) => {
    setShowImportConflictModal(false);
    if (importConflictResolverRef.current) {
      importConflictResolverRef.current(value);
      importConflictResolverRef.current = null;
    }
  }, []);

  /**
   * Handle import conflict modal cancellation
   */
  const handleImportConflictCancel = useCallback(() => {
    setShowImportConflictModal(false);
    if (importConflictResolverRef.current) {
      importConflictResolverRef.current(null);
      importConflictResolverRef.current = null;
    }
  }, []);

  /**
   * Handle cluster name modal confirmation
   */
  const handleClusterNameConfirm = useCallback((clusterName: string) => {
    setShowClusterNameModal(false);
    const newCluster = {
      id: `cluster_${Date.now()}`,
      name: clusterName.trim(),
      type: 'spatial' as const,
      containerPosition: { x: 100, y: 100 },
      containerBounds: { width: 400, height: 300 },
      isExpanded: true,
    };
    actions.addCluster(newCluster);
    markChanged();
  }, [actions, markChanged]);

  // Create a Story object for preview
  const getStoryForPreview = useCallback((): Story => {
    // Determine firstBeatId: prefer debug.firstbeat from global settings (user-configured),
    // then story metadata, then let Story auto-detect (prefers titleScreen beats).
    // Using beats[0] as fallback is WRONG because the beats array is sorted alphabetically.
    const settingsFirstBeat = globalSettings?.debug?.firstbeat;
    const knownFirstBeatId = settingsFirstBeat || (state.story as any)?.getFirstBeatId?.() || (state.story as any)?.metadata?.firstBeatId || (state.story as any)?.firstBeatId;

    const story = new Story({
      title: state.title,
      author: state.author || 'Unknown',
      firstBeatId: knownFirstBeatId || undefined,
    });

    state.beats.forEach(beat => {
      story.addBeat(beat);
    });

    // If no firstBeatId was known, let Story auto-detect now that beats are added
    // and write it back to metadata so getFirstBeatId() returns consistently
    if (!knownFirstBeatId) {
      const detected = story.getFirstBeatId();
      if (detected) {
        story.setFirstBeatId(detected);
      }
    }

    return story;
  }, [state, globalSettings]);

  /**
   * Check if the current project is a "default empty" project
   * (has only the 3 default beats with default IDs AND default content)
   *
   * This is used to auto-discard empty untitled projects without prompting.
   * We must check content, not just structure, to avoid discarding user work.
   */
  const isDefaultEmptyProject = useCallback(() => {
    if (!isUntitledProject) return false;

    // Check if we have exactly 3 beats with the default IDs
    if (state.beats.length !== 3) return false;

    const beatIds = state.beats.map(b => b.id).sort();
    const defaultBeatIds = ['beat_0', 'beat_1', 'beat_2'];

    // Check if beat IDs match the default ones
    if (JSON.stringify(beatIds) !== JSON.stringify(defaultBeatIds)) return false;

    // Check if beat types match the default types
    const beatTypes = state.beats.map(b => b.type).sort();
    const defaultBeatTypes = ['endScreen', 'infoText', 'titleScreen'];

    if (JSON.stringify(beatTypes) !== JSON.stringify(defaultBeatTypes)) return false;

    // CRITICAL: Also check if content matches defaults
    // This prevents discarding projects where user modified the default beats
    const defaultContent = {
      'beat_0': { title: 'My Interactive Story', author: 'Story Author', buttonText: 'Start' },
      'beat_1': { text: 'Welcome to your interactive story. This is where your narrative begins...', buttonText: 'Continue' },
      'beat_2': { message: 'The End', showRestart: true, showCredits: false }
    };

    for (const beat of state.beats) {
      const params = beat.getParameters?.() || {};
      const expectedContent = defaultContent[beat.id as keyof typeof defaultContent];

      if (!expectedContent) continue;

      // Check each expected property
      for (const [key, expectedValue] of Object.entries(expectedContent)) {
        const actualValue = params[key];
        if (actualValue !== expectedValue) {
          // Content has been modified - this is NOT a default empty project
          return false;
        }
      }

      // Check if beat has any visual elements (characters, props, animations)
      if (beat.locations && beat.locations.size > 0) {
        return false; // Has visual elements - not empty
      }
      if (beat.animations && beat.animations.length > 0) {
        return false; // Has animations - not empty
      }
    }

    // Also check if there are any connections beyond the default 2
    if (state.connections.length > 2) {
      return false;
    }

    return true;
  }, [isUntitledProject, state.beats, state.connections]);

  // Save unsaved work dialog handlers
  const handleShowSaveDialog = useCallback((action: string) => {
    // If it's an untitled project with only default content,
    // discard it automatically without prompting
    if (isUntitledProject && isDefaultEmptyProject()) {
      console.log('[App] Discarding empty untitled project automatically');
      discardUntitled();
      return false; // Not intercepted, let Header proceed
    }

    // If it's an untitled project with real changes, show save dialog
    if (isUntitledProject && hasUnsavedChanges) {
      setShowSaveDialog(true);
      setPendingAction(action);
      return true; // Intercepted
    }
    return false; // Not intercepted, let Header proceed
  }, [isUntitledProject, hasUnsavedChanges, isDefaultEmptyProject, discardUntitled]);

  const handleSaveUnsavedWork = useCallback(async () => {
    // Save current work as a named project
    try {
      // Generate a name with timestamp
      const timestamp = new Date().toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      const projectName = `Saved Project (${timestamp})`;

      await saveCurrent(projectName, 'Auto-saved from unsaved changes dialog');
      // Project is now saved as named project
      // Clear the dialog and pending action
      setShowSaveDialog(false);
      setPendingAction('');
    } catch (error) {
      console.error('Failed to save project:', error);
      alert('Failed to save project. Please try again.');
    }
  }, [saveCurrent]);

  const handleDiscardUnsavedWork = useCallback(() => {
    // Clear the dialog and pending action
    setShowSaveDialog(false);
    setPendingAction('');
  }, []);

  const handleCancelSaveDialog = useCallback(() => {
    // Just close the dialog, don't execute any action
    setShowSaveDialog(false);
    setPendingAction('');
  }, []);

  /**
   * Handle renaming a project
   */
  const handleRenameProject = useCallback(async (projectId: string, newName: string) => {
    console.log('[App] handleRenameProject called - projectId:', projectId, 'newName:', newName);
    try {
      // Get the project from storage
      const getResult = await storage.getProject(projectId);
      if (!getResult.success || !getResult.data) {
        throw new Error('Failed to load project for renaming');
      }

      // Update the project
      const project = getResult.data;
      project.name = newName;
      project.modifiedAt = new Date();

      // Save to storage immediately
      const updateResult = await storage.updateProject(project);
      if (!updateResult.success) {
        throw new Error('Failed to update project name in storage');
      }

      console.log('[App] Project renamed successfully in storage');
    } catch (error) {
      console.error('[App] Failed to rename project:', error);
      throw error;
    }
  }, [storage]);

  /**
   * Handle AI-generated story
   */
  const handleStoryGenerated = useCallback(async (story: any) => {
    const storyTitle = story.metadata?.title || 'Generated Story';
    console.log('[App] Story generated:', storyTitle);

    // Validate AI-generated story structure before import
    const validation = validateAIStory(story);
    console.log('[App] AI Story Validation:\n' + formatValidationResult(validation));

    if (!validation.valid) {
      console.warn('[App] AI story has validation errors:');
      validation.errors.forEach(e => console.warn('  -', e.message));
      if (validation.missingBeatIds.length > 0) {
        console.warn('[App] Missing beat IDs:', validation.missingBeatIds.join(', '));
      }
      // Continue importing despite errors - user can fix in builder
    }
    if (validation.warnings.length > 0) {
      console.warn('[App] AI story warnings:');
      validation.warnings.forEach(w => console.warn('  -', w.message));
    }

    // Validate narrative logic (hub beats, state assumptions, undescribed items)
    const logicValidation = validateStoryLogic(story);
    console.log('[App] Story Logic Validation:\n' + formatLogicValidationResult(logicValidation));

    if (logicValidation.issues.length > 0) {
      console.warn('[App] Story logic issues detected:');
      logicValidation.issues.forEach(issue => {
        const icon = issue.type === 'warning' ? '⚠️' : 'ℹ️';
        console.warn(`  ${icon} [${issue.beatId}] ${issue.message}`);
        if (issue.suggestedFix) {
          console.warn(`     Fix: ${issue.suggestedFix}`);
        }
      });
    }

    // Clear existing beats and connections
    actions.clearStory();

    // Add metadata
    if (story.metadata) {
      actions.setTitle(storyTitle);
    }

    // Apply suggested theme if provided
    if (story.suggestedTheme?.themeId) {
      const themeId = story.suggestedTheme.themeId;
      console.log('[App] AI suggested theme:', themeId, '-', story.suggestedTheme.reason);

      try {
        // Initialize theme service and get the theme
        const themeService = getThemeService();
        await themeService.initialize();
        await themeService.registerBuiltInThemes(BUILT_IN_THEMES);

        const theme = await themeService.getResolvedTheme(themeId);
        if (theme) {
          // Apply theme to global settings
          const newSettings = themeToGlobalSettings(theme, globalSettingsRef.current || globalSettings);
          setGlobalSettings(newSettings);
          console.log('[App] Applied theme:', theme.meta.name);
        } else {
          console.warn('[App] Suggested theme not found:', themeId);
        }
      } catch (error) {
        console.warn('[App] Failed to apply suggested theme:', error);
      }
    }

    // Apply tree layout to position beats based on their connections
    // Pass both beats (for parameter-embedded connections) and the connections array (for external connections)
    const externalConnections = story.connections && Array.isArray(story.connections)
      ? story.connections.map((conn: any) => ({
          source: conn.sourceId || conn.source,
          target: conn.targetId || conn.target,
        }))
      : [];
    const firstBeatIdForLayout = story.metadata?.firstBeatId || story.firstBeatId || (story.beats?.[0]?.id);
    const adjustedPositions = story.beats && Array.isArray(story.beats)
      ? applyTreeLayoutToBeats(story.beats, undefined, externalConnections, firstBeatIdForLayout)
      : new Map();

    // Add all generated beats, preserving AI-generated IDs with adjusted positions
    if (story.beats && Array.isArray(story.beats)) {
      story.beats.forEach((beatData: any) => {
        // Use adjusted position if available, otherwise fall back to original
        const position = adjustedPositions.get(beatData.id) || beatData.position;

        // Pass the AI-generated ID and name directly to addBeat
        const beat = actions.addBeat(
          beatData.type || 'infoText',
          position,
          { id: beatData.id, name: beatData.label || beatData.name }
        );

        // Update beat with generated parameters
        if (beatData.parameters) {
          const params = { ...beatData.parameters };

          // Transform conditionBeat nested format to flat format
          if (beatData.type === 'conditionBeat') {
            // Flatten nested condition object
            if (params.condition) {
              const cond = params.condition;
              params.conditionType = cond.type || params.conditionType;
              // AI may generate 'variable', 'variableName', or 'left' - support all
              params.variableName = cond.variableName || cond.variable || cond.left || params.variableName;
              params.operator = cond.operator || params.operator;
              params.value = cond.value ?? cond.right ?? params.value;
              params.counter1 = cond.counter1 || params.counter1;
              params.counter2 = cond.counter2 || params.counter2;
              params.timer = cond.timer || params.timer;
              params.item = cond.item || params.item;
              params.character = cond.character || params.character;
              params.checkType = cond.checkType || params.checkType;
              params.beatId = cond.beatId || params.beatId;
              delete params.condition;
            }
            // Extract targets from connection objects
            if (params.trueConnection?.target) {
              params.trueTarget = params.trueConnection.target;
              delete params.trueConnection;
            }
            if (params.falseConnection?.target) {
              params.falseTarget = params.falseConnection.target;
              delete params.falseConnection;
            }
          }

          // CRITICAL: Call updateParameters() directly on the beat instance
          // Using actions.updateBeat() would use Object.assign which bypasses
          // the beat's proper parameter handling (e.g., DialogTree migration)
          beat.updateParameters(params);
        }
      });
    }

    // Add connections after all beats are created
    // Collect connections from beat parameters (AI-generated format)
    const connectionsToCreate: Array<{ source: string; target: string; label?: string }> = [];

    if (story.beats && Array.isArray(story.beats)) {
      story.beats.forEach((beatData: any) => {
        // Check for connection in parameters (single-connection beats)
        if (beatData.parameters?.connection?.target) {
          connectionsToCreate.push({
            source: beatData.id,
            target: beatData.parameters.connection.target,
          });
        }
        // Handle conditionBeat trueConnection/falseConnection
        if (beatData.type === 'conditionBeat') {
          if (beatData.parameters?.trueConnection?.target) {
            connectionsToCreate.push({
              source: beatData.id,
              target: beatData.parameters.trueConnection.target,
              label: 'true',
            });
          }
          if (beatData.parameters?.falseConnection?.target) {
            connectionsToCreate.push({
              source: beatData.id,
              target: beatData.parameters.falseConnection.target,
              label: 'false',
            });
          }
        }
        // Handle dialogTree beats - recursively extract targets from nested structure
        // DialogTree has targets embedded in dialogTree.choices[].target which can be:
        // - A string beat ID to exit the dialog
        // - A nested dialogNode object for more conversation
        if (beatData.type === 'dialogTree' && beatData.parameters?.dialogTree) {
          const extractDialogTreeTargets = (node: any, targets: Array<{ target: string; label: string }>) => {
            if (!node || !node.choices) return;
            node.choices.forEach((choice: any) => {
              if (choice.target && typeof choice.target === 'string') {
                // This is a beat ID exit point
                targets.push({ target: choice.target, label: choice.text || 'Choice' });
              }
              // Recurse into nested dialog nodes
              if (choice.dialogNode) {
                extractDialogTreeTargets(choice.dialogNode, targets);
              }
            });
          };

          const dialogTargets: Array<{ target: string; label: string }> = [];
          extractDialogTreeTargets(beatData.parameters.dialogTree, dialogTargets);
          dialogTargets.forEach(({ target, label }) => {
            connectionsToCreate.push({
              source: beatData.id,
              target,
              label,
            });
          });
        }
        // Handle choice-based beats (movementChoice, pickProp)
        // Extract connections from parameters.choices[] or parameters.props[]
        // This is more reliable than depending on AI to duplicate targets in connections array
        const choicesArray = beatData.parameters?.choices || beatData.parameters?.props || [];
        if (Array.isArray(choicesArray) && choicesArray.length > 0) {
          choicesArray.forEach((choice: any, index: number) => {
            if (choice.target) {
              connectionsToCreate.push({
                source: beatData.id,
                target: choice.target,
                label: choice.text || choice.name || `Choice ${index + 1}`,
              });
            }
          });
        }
        // Also check top-level connections array on the beat (fallback format)
        // Skip if we already extracted from choices to avoid duplicates
        if (beatData.connections && Array.isArray(beatData.connections) && choicesArray.length === 0) {
          beatData.connections.forEach((conn: any) => {
            connectionsToCreate.push({
              source: beatData.id,
              target: conn.targetId || conn.target,
              label: conn.label,
            });
          });
        }
      });
    }

    // Also support top-level connections array (legacy format)
    if (story.connections && Array.isArray(story.connections)) {
      story.connections.forEach((conn: any) => {
        connectionsToCreate.push({
          source: conn.sourceId || conn.from,
          target: conn.targetId || conn.to,
        });
      });
    }

    // Create all connections with a delay to ensure state has updated
    if (connectionsToCreate.length > 0) {
      console.log('[App] Creating', connectionsToCreate.length, 'connections');
      setTimeout(() => {
        let successCount = 0;
        let failCount = 0;
        connectionsToCreate.forEach((conn) => {
          try {
            if (conn.source && conn.target) {
              actions.connectBeats(conn.source, conn.target, conn.label);
              successCount++;
            }
          } catch (error) {
            failCount++;
            console.warn('[App] Failed to create connection:', conn, error);
          }
        });
        console.log(`[App] Connections created: ${successCount} success, ${failCount} failed`);
      }, 100);
    }

    markChanged();

    // Create a new project for the generated story (don't contaminate current project)
    // Uses the same pattern as ASML import to fully detach from any directory/git project
    setTimeout(async () => {
      try {
        const description = story.metadata?.description || 'AI-generated interactive story';
        console.log('[App] Syncing generated story data to project...');

        // Explicitly sync current beats to project before saving
        syncProjectData();

        // Wait for React state update
        await new Promise(resolve => setTimeout(resolve, 200));

        console.log('[App] Creating new project for generated story:', storyTitle);
        pendingNewProjectIdRef.current = 'pending';
        const newProjectId = await createProject(storyTitle, description);
        pendingNewProjectIdRef.current = newProjectId;
        loadedProjectIdRef.current = newProjectId;
        console.log('[App] AI story generation - Created new project:', newProjectId);

        // Trigger AI debug analysis after save completes
        runAIDebug(beatsRef.current, connectionsRef.current);
      } catch (error) {
        console.error('[App] Failed to create project for generated story:', error);
        pendingNewProjectIdRef.current = null;
      }
    }, 300);
  }, [actions, markChanged, createProject, syncProjectData, runAIDebug, globalSettings, setGlobalSettings]);

  /**
   * Handle AI-generated beat from natural language description
   */
  const handleBeatCreated = useCallback((beatData: any) => {
    console.log('[App] Beat created from NL:', beatData);

    // Create beat at center or specified position
    const position = beatData.position || { x: 400, y: 300 };
    const beat = actions.addBeat(beatData.type || 'infoText', position);

    // Apply AI-generated parameters
    if (beatData.parameters) {
      actions.updateBeat(beat.id, { ...beatData.parameters });
    }

    // Update name if provided
    if (beatData.label || beatData.name) {
      actions.updateBeat(beat.id, { name: beatData.label || beatData.name });
    }

    markChanged();
  }, [actions, markChanged]);

  /**
   * Handle opening debug panel
   */
  const handleOpenDebugPanel = useCallback(() => {
    setShowDebugPanel(true);
  }, []);

  /**
   * Handle closing debug panel
   */
  const handleCloseDebugPanel = useCallback(() => {
    setShowDebugPanel(false);
    setHighlightedBeatIds([]); // Clear highlighting when closing
  }, []);

  /**
   * Handle navigating to a beat from search results
   */
  const handleNavigateToBeat = useCallback((beatId: string) => {
    const beat = state.beats.find(b => b.id === beatId);
    if (beat) {
      setSelectedBeat(beat);
      setHighlightedBeatIds([beatId]);
    }
  }, [state.beats]);

  /**
   * Handle navigating to a character from search results
   */
  const handleNavigateToCharacter = useCallback((characterId: string) => {
    // Open character manager and potentially select the character
    setShowCharacterManager(true);
    // TODO: Add support for selecting a specific character in CharacterManager
  }, []);

  /**
   * Handle replacing text in a beat
   * Supports nested field paths like 'dialogTree.text', 'dialogTree.choices[0].text'
   */
  const handleReplaceInBeat = useCallback((beatId: string, field: string, oldValue: string, newValue: string) => {
    const beat = state.beats.find(b => b.id === beatId);
    if (!beat) return;

    // Get current parameters
    const params = beat.getParameters();

    // Parse the field path and update the nested value
    const setNestedValue = (obj: any, path: string, value: string) => {
      const parts = path.split(/\.|\[|\]/).filter(Boolean);
      let current = obj;

      for (let i = 0; i < parts.length - 1; i++) {
        const key = isNaN(Number(parts[i])) ? parts[i] : Number(parts[i]);
        if (current[key] === undefined) return false;
        current = current[key];
      }

      const lastKey = parts[parts.length - 1];
      const finalKey = isNaN(Number(lastKey)) ? lastKey : Number(lastKey);

      if (current[finalKey] !== oldValue) {
        console.warn('[App] Replace: value mismatch, expected:', oldValue, 'got:', current[finalKey]);
        return false;
      }

      current[finalKey] = newValue;
      return true;
    };

    // Handle special case for beat name
    if (field === 'name') {
      actions.updateBeat(beatId, { name: newValue } as Partial<Beat>);
      return;
    }

    // Clone params and update the nested value
    const updatedParams = JSON.parse(JSON.stringify(params));
    if (setNestedValue(updatedParams, field, newValue)) {
      // CRITICAL: Call updateParameters() directly on the beat instance
      // Using actions.updateBeat() with { parameters: ... } would use Object.assign
      // which bypasses the beat's proper parameter handling
      beat.updateParameters(updatedParams);
      // Trigger a state update to force re-render (empty update just triggers React's change detection)
      actions.updateBeat(beatId, {} as Partial<Beat>);
    }
  }, [state.beats, actions]);

  /**
   * Handle highlighting a single beat
   */
  const handleHighlightBeat = useCallback((beatId: string) => {
    setHighlightedBeatIds([beatId]);
  }, []);

  /**
   * Handle highlighting a path (multiple beats)
   */
  const handleHighlightPath = useCallback((beatIds: string[]) => {
    setHighlightedBeatIds(beatIds);
  }, []);

  /**
   * Handle current project being deleted from the project library.
   * Reset the UI to an empty/untitled state.
   */
  const handleCurrentProjectDeleted = useCallback(() => {
    console.log('[App] Current project deleted - resetting to empty state');
    actions.clearStory();
    initializeStory();
    setIsUntitledProject(true);
    setSelectedBeat(null);
    setSelectedCluster(null);
  }, [actions, initializeStory, setIsUntitledProject]);

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <Header
        title={state.title}
        onTitleChange={actions.setTitle}
        projectName={currentProject?.name}
        onExport={handleExport}
        onImport={handleImport}
        onExportZip={handleExportZip}
        onExportAsmlWithAssets={handleExportAsmlWithAssets}
        onImportZip={handleImportZip}
        onImportTwine={handleImportTwine}
        onPreview={handleTogglePreviewWindow}
        previewWindowOpen={previewWindowOpen}
        onCharacters={handleOpenCharacterManager}
        onAssets={handleOpenAssetManager}
        onSettings={handleOpenSettings}
        onDebug={handleOpenDebugPanel}
        onSave={handleSave}
        onInterceptNewProject={() => handleShowSaveDialog('newProject')}
        onInterceptProjectLibrary={() => handleShowSaveDialog('projectLibrary')}
        onStoryGenerated={handleStoryGenerated}
        onBeatCreated={handleBeatCreated}
        onSaveProject={handleSaveProject}
        onRenameProject={handleRenameProject}
        isUntitledProject={isUntitledProject}
        hasUnsavedChanges={hasUnsavedChanges}
        currentProjectId={currentProject?.id}
        onMergeDialogTrees={() => setShowMergeDialogTrees(true)}
        onHelperCommands={() => setShowHelperCommands(true)}
        onExportHtml={() => setShowHtmlExportDialog(true)}
        vcsPanelOpen={vcsPanelOpen}
        onToggleVCSPanel={() => setVcsPanelOpen(prev => !prev)}
        onInitRepo={() => setShowGitInitDialog(true)}
        onAISettingsChanged={(aiSettings) => {
          setGlobalSettings(prev => ({ ...prev, ai: aiSettings }));
        }}
        onCurrentProjectDeleted={handleCurrentProjectDeleted}
        triggerNewProject={triggerNewProject}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          beats={state.beats}
          clusters={state.clusters || []}
          selectedBeat={selectedBeat}
          selectedCluster={selectedCluster}
          onBeatSelect={handleBeatSelect}
          onClusterSelect={handleClusterSelect}
          onAddBeat={(type) => actions.addBeat(type)}
          onAddCluster={() => {
            // Use custom modal instead of prompt() for Electron compatibility
            setClusterNameDefault(`Cluster ${(state.clusters?.length || 0) + 1}`);
            setShowClusterNameModal(true);
          }}
          onMoveBeatToCluster={(beatId, clusterId) => {
            actions.moveBeatToCluster(beatId, clusterId);
            markChanged();
          }}
          onToggleCluster={actions.expandCollapseCluster}
          onRenameCluster={(clusterId, name) => {
            actions.renameCluster(clusterId, name);
            markChanged();
          }}
        />

        <div className="flex flex-1 overflow-hidden">
          <WorkspaceView
            key={currentProject?.id || 'untitled'}
            beats={state.beats}
            connections={state.connections}
            clusters={state.clusters || []}
            containerBeatPositions={state.containerBeatPositions || []}
            selectedBeat={selectedBeat}
            refreshKey={beatRefreshKey}
            selectedCluster={selectedCluster}
            onBeatSelect={handleBeatSelect}
            onBeatUpdate={handleBeatUpdate}
            onClusterSelect={handleClusterSelect}
            onBeatMove={handleBeatMove}
            onBeatAdd={handleBeatAdd}
            onClusterExpandCollapse={actions.expandCollapseCluster}
            onClusterMove={(clusterId: string, x: number, y: number) => {
              if (actions.moveCluster) {
                actions.moveCluster(clusterId, { x, y });
              }
            }}
            onBeatInContainerMove={(beatId: string, clusterId: string, x: number, y: number) => {
              if (actions.moveBeatInContainer) {
                actions.moveBeatInContainer(beatId, clusterId, x, y);
                markChanged();
              }
            }}
            onDropBeatToCluster={(beatId: string, clusterId: string) => {
              if (actions.moveBeatToCluster) {
                actions.moveBeatToCluster(beatId, clusterId);
                markChanged();
              }
            }}
            paletteCollapsed={paletteCollapsed}
            onTogglePalette={() => setPaletteCollapsed(!paletteCollapsed)}
            assets={assets}
            onAssetSelect={handleAssetSelect}
            onAssetAdd={handleAssetAdd}
            onAssetRemove={handleAssetRemove}
            onAssetUpdate={handleAssetUpdate}
            onOpenCharacterManager={handleOpenCharacterManager}
            projectSettings={projectSettings}
            globalSettings={globalSettings}
            highlightedBeatIds={highlightedBeatIds}
            onAutoLayout={handleAutoLayout}
            onAutoLayoutCluster={(clusterId: string) => {
              // Auto-layout beats within a cluster using a simple grid
              const cluster = state.clusters?.find(c => c.id === clusterId);
              if (!cluster) return;

              const clusterBeats = state.beats.filter(b => b.cluster === clusterId);
              if (clusterBeats.length === 0) return;

              const nodeWidth = 160;
              const nodeHeight = 80;
              const padding = 20;
              const gap = 40;
              const maxWidth = (cluster.containerBounds?.width || 500) - padding * 2;

              // Calculate grid layout
              const beatsPerRow = Math.max(1, Math.floor((maxWidth + gap) / (nodeWidth + gap)));

              clusterBeats.forEach((beat, index) => {
                const row = Math.floor(index / beatsPerRow);
                const col = index % beatsPerRow;
                const x = padding + col * (nodeWidth + gap);
                const y = padding + row * (nodeHeight + gap);

                if (actions.moveBeatInContainer) {
                  actions.moveBeatInContainer(beat.id, clusterId, x, y);
                }
              });

              markChanged();
              console.log(`[App] Auto-arranged ${clusterBeats.length} beats in cluster ${cluster.name}`);
            }}
            onAddToContainer={(clusterId: string) => {
              // For now, show a helpful message - full implementation would show a beat selection dialog
              console.log(`[App] Add beat to cluster ${clusterId} - drag beats from sidebar to add them`);
              // Select the cluster to highlight it as a drop target
              const cluster = state.clusters?.find(c => c.id === clusterId);
              if (cluster) {
                handleClusterSelect(cluster);
              }
            }}
            onRemoveCluster={(clusterId: string) => {
              if (actions.removeCluster) {
                actions.removeCluster(clusterId);
                markChanged();
              }
            }}
            onClusterResize={(clusterId: string, width: number, height: number) => {
              if (actions.resizeCluster) {
                actions.resizeCluster(clusterId, width, height);
                markChanged();
              }
            }}
            onSetClusterMap={(clusterId: string, assetId: string | null, scale?: number, opacity?: number) => {
              if (actions.setClusterMap) {
                actions.setClusterMap(clusterId, assetId, scale, opacity);
                markChanged();
              }
            }}
            onSetClusterSound={(clusterId: string, soundAssetId: string | null, volume?: number) => {
              if (actions.setClusterSound) {
                actions.setClusterSound(clusterId, soundAssetId, volume);
                markChanged();
              }
            }}
            onSetClusterSharedVisuals={(clusterId: string, sharedVisuals: any) => {
              if (actions.setClusterSharedVisuals) {
                actions.setClusterSharedVisuals(clusterId, sharedVisuals);
                markChanged();
              }
            }}
            characters={characters}
            themeAssets={themeAssets}
            onBeatDuplicate={handleBeatDuplicate}
            onBeatDelete={handleBeatDelete}
            onBeatCopy={handleBeatCopy}
            onBeatPaste={handleBeatPaste}
            hasBeatClipboard={beatClipboard !== null}
            onViewBeatDiff={handleViewBeatDiff}
            onViewBeatHistory={handleViewBeatHistory}
            onRevertBeat={handleRevertBeat}
          />

          {selectedBeat && (
            <Inspector
              beat={selectedBeat}
              onUpdate={handleBeatUpdate}
              onDelete={handleBeatDelete}
              allBeats={state.beats}
              onConnect={actions.connectBeats}
              onDisconnect={actions.disconnectBeats}
              onBeatAdd={actions.addBeat}
              assets={assets}
              onAssetSelect={handleAssetSelect}
              onOpenCharacterManager={handleOpenCharacterManager}
              characters={characters}
              globalSettings={globalSettings}
            />
          )}
        </div>
      </div>

      {/* VCS Panel (bottom panel for directory projects under version control) */}
      <VCSPanel
        isOpen={vcsPanelOpen}
        onToggle={() => setVcsPanelOpen(prev => !prev)}
        onViewDiff={(filePath) => setDiffViewerFile(filePath)}
      />

      {/* Preview Modal */}
      {showPreview && (
        <StoryPreview
          story={getStoryForPreview()}
          assets={assets}
          characters={characters}
          settings={globalSettings}
          themeAssets={themeAssets}
          onClose={handleClosePreview}
          loadAssetBlob={async (assetIdOrUrl: string) => {
            // Skip invalid asset IDs
            if (!assetIdOrUrl || assetIdOrUrl === 'undefined') {
              return null;
            }

            try {
              const storage = getStorageAdapter();

              // First try to load by asset ID directly
              let blob = await storage.loadAsset(assetIdOrUrl);
              if (blob) return blob;

              // If not found and it looks like a blob URL, search assets by URL (legacy fallback)
              if (assetIdOrUrl.startsWith('blob:')) {
                const matchingAsset = assets.find(a => a.url === assetIdOrUrl);
                if (matchingAsset) {
                  blob = await storage.loadAsset(matchingAsset.id);
                  if (blob) return blob;
                }
              }

              return null;
            } catch (error) {
              console.warn(`[App loadAssetBlob] Error loading asset: ${assetIdOrUrl}`, error);
              return null;
            }
          }}
        />
      )}

      {/* Character Manager Modal */}
      {showCharacterManager && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white rounded-lg w-full max-w-6xl h-5/6 m-4 flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-xl font-semibold">
                {characterSelectionCallbackRef.current ? 'Select Character' : 'Character Manager'}
              </h2>
              <button
                onClick={handleCloseCharacterManager}
                className="p-2 hover:bg-gray-100 rounded"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-hidden p-4">
              <CharacterManager
                characters={characters}
                onCharactersChange={handleCharactersChange}
                assets={assets}
                onAssetAdd={handleAssetAdd}
                selectionMode={characterSelectionCallbackRef.current !== null}
                onCharacterSelect={(character) => {
                  if (characterSelectionCallbackRef.current) {
                    characterSelectionCallbackRef.current(character);
                    handleCloseCharacterManager();
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Asset Manager Modal */}
      {showAssetManager && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white rounded-lg w-full max-w-6xl h-5/6 m-4 flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-xl font-semibold">Asset Manager</h2>
              <button
                onClick={handleCloseAssetManager}
                className="p-2 hover:bg-gray-100 rounded"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-hidden p-4">
              <AssetManager
                assets={assets}
                onAssetAdd={handleAssetAdd}
                onAssetRemove={handleAssetRemove}
                onAssetUpdate={handleAssetUpdate}
              />
            </div>
          </div>
        </div>
      )}

      {/* Import ASML Dialog */}
      {showImportAsmlDialog && importAsmlManifest && (
        <ImportAsmlDialog
          isOpen={showImportAsmlDialog}
          xmlContent={importAsmlContent}
          manifest={importAsmlManifest}
          onImport={handleImportAsmlComplete}
          onCancel={handleImportAsmlCancel}
        />
      )}

      {/* Import Twine Dialog */}
      <ImportTwineDialog
        isOpen={showImportTwineDialog}
        onImport={handleImportTwineComplete}
        onCancel={handleImportTwineCancel}
      />

      {/* Settings Modal */}
      {showSettings && (
        <GlobalSettingsInspector
          settings={globalSettings}
          onUpdate={(newSettings) => {
            setGlobalSettings(newSettings);
            // CRITICAL: Also persist to project immediately, not just React state
            // This ensures hotspot settings (showInPreview, labelDisplay) and other
            // global settings are saved when user clicks "Save Settings"
            updateGlobalSettings(newSettings);
            markChanged();
          }}
          onClose={handleCloseSettings}
          assets={assets}
          themeId={currentThemeId}
          onThemeChange={setCurrentThemeId}
          beats={state.beats.map(b => ({ id: b.id, name: b.name, type: b.type }))}
        />
      )}

      {/* Debug Panel */}
      {showDebugPanel && (
        <DebugPanel
          story={getStoryForPreview()}
          onClose={handleCloseDebugPanel}
          onHighlightBeat={handleHighlightBeat}
          onHighlightPath={handleHighlightPath}
        />
      )}

      {/* Search Panel */}
      <SearchPanel
        isOpen={showSearchPanel}
        onClose={() => setShowSearchPanel(false)}
        beats={state.beats}
        characters={characters}
        assets={assets}
        metadata={{ title: state.title, author: state.author }}
        onNavigateToBeat={handleNavigateToBeat}
        onNavigateToCharacter={handleNavigateToCharacter}
        onReplaceInBeat={handleReplaceInBeat}
      />

      {/* Transformation Commands Panel */}
      <HelperCommandInput
        isOpen={showHelperCommands}
        onClose={() => setShowHelperCommands(false)}
        beats={state.beats}
        clusters={state.clusters}
        containerBeatPositions={state.containerBeatPositions}
        assets={assets.map(a => ({ id: a.id, name: a.name, type: a.type }))}
        characterNames={characters.map(c => c.name)}
        onUpdateBeat={actions.updateBeat}
        onDeleteBeat={actions.deleteBeat}
        onChangesApplied={handleTransformationChangesApplied}
      />

      {/* Save Project Dialog */}
      <SaveProjectDialog
        isOpen={showSaveProjectDialog}
        onClose={handleCloseSaveProjectDialog}
        onSave={handleSaveProjectConfirmed}
        currentName={state.title}
      />

      {/* Save Unsaved Work Dialog */}
      <SaveUnsavedWorkDialog
        isOpen={showSaveDialog}
        onClose={handleCancelSaveDialog}
        onSave={handleSaveUnsavedWork}
        onDiscard={handleDiscardUnsavedWork}
        action={pendingAction === 'newProject' ? 'creating a new project' : 'opening the project library'}
      />

      {/* Cluster Name Modal (replaces prompt() for Electron compatibility) */}
      <InputModal
        isOpen={showClusterNameModal}
        title="New Cluster"
        label="Cluster Name"
        defaultValue={clusterNameDefault}
        placeholder="Enter cluster name..."
        onConfirm={handleClusterNameConfirm}
        onCancel={() => setShowClusterNameModal(false)}
        submitText="Create"
      />

      {/* Import Conflict Modal (replaces prompt() for Electron compatibility) */}
      <InputModal
        isOpen={showImportConflictModal}
        title="Import Conflict"
        label={importConflictLabel}
        defaultValue={importConflictDefault}
        placeholder="Enter new name or OVERWRITE..."
        onConfirm={handleImportConflictConfirm}
        onCancel={handleImportConflictCancel}
        submitText="Import"
      />

      {/* AI Debug Modal */}
      <AIDebugModal
        isOpen={showAIDebugModal}
        onClose={closeAIDebugModal}
        result={aiDebugResult}
      />

      {/* Merge DialogTrees Modal */}
      <MergeDialogTreesModal
        isOpen={showMergeDialogTrees}
        onClose={() => setShowMergeDialogTrees(false)}
        beats={state.beats}
        onMerge={actions.mergeDialogTrees}
        onBeatSelect={handleBeatSelect}
      />

      {/* HTML Export Dialog */}
      {currentProject && (
        <HtmlExportDialog
          isOpen={showHtmlExportDialog}
          onClose={() => setShowHtmlExportDialog(false)}
          projectId={currentProject.id}
          projectName={currentProject.name}
        />
      )}

      {/* Git Init Dialog */}
      {showGitInitDialog && vcsCtx && (
        <GitInitDialog
          onInit={async (remoteUrl) => {
            await vcsCtx.initRepo(remoteUrl);
          }}
          onClose={() => setShowGitInitDialog(false)}
        />
      )}

      {/* Clone Repository Dialog */}
      {showCloneRepoDialog && (
        <CloneRepoDialog
          onCloned={async (clonedPath) => {
            console.log('[App] Repository cloned to:', clonedPath);
            try {
              // A fresh clone cannot have merge conflicts, so skip the expensive
              // git grep scan that checks every file's content (causes crashes on
              // slow filesystems like Parallels shared folders).
              console.log('[App] Opening cloned project as directory...');
              const success = await openDirectoryProject(clonedPath);
              if (success) {
                console.log('[App] Cloned project opened successfully');
              } else {
                console.warn('[App] Not a valid ASAPS directory project:', clonedPath);
                alert('Repository cloned successfully!\n\nNote: This does not appear to be an ASAPS directory-format project.');
              }
              // VCS will be auto-initialized by the projectFormat/projectPath effect
              console.log('[App] Post-clone setup complete (VCS auto-init will follow)');
            } catch (error) {
              console.error('[App] Failed to open cloned project:', error);
              alert(`Failed to open cloned project: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
          }}
          onClose={() => setShowCloneRepoDialog(false)}
        />
      )}

      {/* VCS Diff Viewer Modal */}
      <DiffViewer
        filePath={diffViewerFile || ''}
        isOpen={!!diffViewerFile}
        onClose={() => setDiffViewerFile(null)}
      />

      {/* VCS Toast Notifications */}
      <VCSToast />
    </div>
  );
}

export default App;
