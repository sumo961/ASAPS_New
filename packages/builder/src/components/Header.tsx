import React, { useState, useEffect } from 'react';
import { Compass, GitMerge, FileText, Download, Upload, Play, Settings, Image, Users, Save, Check, Sparkles, ChevronDown, Bug, Wrench, MessageSquare, Wand2, Globe, Volume2, VolumeX, Mic, MicOff, Search, Plus } from 'lucide-react';
import { ProjectSelector } from './ProjectSelector';
import { NewProjectDialog } from './NewProjectDialog';
import { NewProjectPicker } from './NewProjectPicker';
import { TemplateGalleryModal } from './TemplateGallery';
import { ProjectLibrary } from './ProjectLibrary';
import { UndoRedoToolbar } from './UndoRedoToolbar';
import { SaveStatus } from './SaveStatus';
import { AIConfigDialog } from './ai/AIConfigDialog';
import { StoryGenerator } from './ai/StoryGenerator';
import { NaturalLanguageBeatCreator } from './ai/NaturalLanguageBeatCreator';
import { TTSConfigDialog } from './tts/TTSConfigDialog';
import { STTConfigDialog } from './stt/STTConfigDialog';
import { LanguageSelector } from './translation/LanguageSelector';
import { useSave, useProject, usePersistence } from '../contexts/PersistenceContext';
import { useTranslationState, useTranslationActions } from '../contexts/TranslationContext';
import { VCSStatusBar } from './vcs/VCSStatusBar';
import { getProjectDataForExport } from '../utils/projectZipManager';
import { getSavedAIConfig } from '../hooks/useAI';
import { useTTS } from '../hooks/useTTS';
import { getTTSService } from '../services/tts';
import { useSTT } from '../hooks/useSTT';
import { getSTTService } from '../services/stt';
import { getLanguageDisplayName } from '../utils/languageCatalog';

interface HeaderProps {
  title: string;
  onTitleChange: (title: string) => void;
  projectName?: string | null;
  onExport: () => void;
  onImport: () => void;
  onExportZip?: () => void;
  /** Export the open project as a .asapst template (importing one always
   *  instantiates a copy — the distributable-master workflow). */
  onExportTemplate?: () => void;
  onExportAsmlWithAssets?: () => void;
  onImportZip?: () => void;
  /** Merge another story (.asaps) into the open project. */
  onMergeStory?: () => void;
  /** Drag-drop variant of import — takes a pre-selected File. The
   *  Project Browser's dropzone uses this so authors can drag a
   *  .asaps zip directly onto the modal without going through the
   *  file picker. */
  onImportZipFile?: (file: File, options?: { newName?: string }) => Promise<void>;
  onImportTwine?: () => void;
  onPreview?: () => void;
  onSettings?: () => void;
  onAssets?: () => void;
  onCharacters?: () => void;
  onSearch?: () => void;
  searchPanelOpen?: boolean;
  onSave?: () => void;
  onDebug?: () => void;
  onInterceptNewProject?: () => boolean;
  onInterceptProjectLibrary?: () => boolean;
  onStoryGenerated?: (story: any) => void;
  onBeatCreated?: (beat: any) => void;
  onIdeator?: () => void;
  onCoDesigner?: () => void;
  onSaveProject?: () => void;
  onRenameProject?: (projectId: string, newName: string) => Promise<void>;
  isUntitledProject?: boolean;
  hasUnsavedChanges?: boolean;
  currentProjectId?: string;
  onMergeDialogTrees?: () => void;
  onHelperCommands?: () => void;
  onExportHtml?: () => void;
  previewWindowOpen?: boolean;
  vcsPanelOpen?: boolean;
  onToggleVCSPanel?: () => void;
  onInitRepo?: () => void;
  onAISettingsChanged?: (settings: {
    provider?: 'claude' | 'openai';
    providerType?: 'claude' | 'openai' | 'local';
    model?: string;
    baseUrl?: string;
    maxTokens?: number;
    reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  }) => void;
  onCurrentProjectDeleted?: () => void;
  triggerNewProject?: number;
  speakers?: string[];
  playerCharacterName?: string;
  speakerVoices?: Record<string, string>;
  onSpeakerVoiceChange?: (speaker: string, voiceId: string) => void;
  onTTSProviderChanged?: (provider: string, model?: string, baseUrl?: string) => void;
  /** Phase 1 — resolved project layout mode for the badge. */
  layoutMode?: 'fixed' | 'responsive';
  /** Phase 1 — opens project settings (badge click target). */
  onOpenLayoutSettings?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  onTitleChange,
  projectName,
  onExport,
  onImport,
  onExportZip,
  onExportTemplate,
  onExportAsmlWithAssets,
  onImportZip,
  onMergeStory,
  onImportZipFile,
  onImportTwine,
  onPreview,
  onSettings,
  onAssets,
  onCharacters,
  onSearch,
  searchPanelOpen,
  onSave,
  onDebug,
  onInterceptNewProject,
  onInterceptProjectLibrary,
  onStoryGenerated,
  onBeatCreated,
  onIdeator,
  onCoDesigner,
  onSaveProject,
  onRenameProject,
  isUntitledProject,
  hasUnsavedChanges,
  currentProjectId,
  onMergeDialogTrees,
  onHelperCommands,
  onExportHtml,
  previewWindowOpen,
  vcsPanelOpen,
  onToggleVCSPanel,
  onInitRepo,
  onAISettingsChanged,
  onCurrentProjectDeleted,
  triggerNewProject,
  speakers = [],
  playerCharacterName,
  speakerVoices = {},
  onSpeakerVoiceChange,
  onTTSProviderChanged,
  layoutMode,
  onOpenLayoutSettings,
}) => {
  const { status, lastSaved, error: saveError, markChanged } = useSave();
  const { load } = useProject();
  const translationState = useTranslationState();
  const translationActions = useTranslationActions();
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [showProjectLibrary, setShowProjectLibrary] = useState(false);
  const [showNewProjectPicker, setShowNewProjectPicker] = useState(false);
  const [showTemplateGallery, setShowTemplateGallery] = useState(false);
  const [showAIConfig, setShowAIConfig] = useState(false);
  const [showStoryGenerator, setShowStoryGenerator] = useState(false);
  const [showBeatCreator, setShowBeatCreator] = useState(false);
  const [showAIMenu, setShowAIMenu] = useState(false);
  const [showImportMenu, setShowImportMenu] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const [showTTSConfig, setShowTTSConfig] = useState(false);
  const [showTTSMenu, setShowTTSMenu] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<Array<{ id: string; name: string }>>([]);
  const [activeProviderName, setActiveProviderName] = useState<string>('');
  const [ttsEnabled, setTtsEnabled] = useState(() => {
    try {
      return localStorage.getItem('asaps_tts_enabled') !== 'false';
    } catch { return true; }
  });
  const { configure: configureTTS } = useTTS();

  // STT state
  const [showSTTConfig, setShowSTTConfig] = useState(false);
  const [showSTTMenu, setShowSTTMenu] = useState(false);
  const [sttEnabled, setSttEnabled] = useState(() => {
    try {
      return localStorage.getItem('asaps_stt_enabled') === 'true';
    } catch { return false; }
  });
  const { configure: configureSTT } = useSTT();

  // Load available voices when TTS menu opens
  useEffect(() => {
    if (!showTTSMenu || !ttsEnabled) return;
    const loadVoices = async () => {
      try {
        const provider = getTTSService().getActiveProvider();
        if (provider) {
          const voices = await provider.getVoices();
          setAvailableVoices(voices.map(v => ({ id: v.id, name: v.name })));
          setActiveProviderName(provider.name);
        }
      } catch (e) {
        console.warn('[Header] Failed to load TTS voices:', e);
      }
    };
    loadVoices();
  }, [showTTSMenu, ttsEnabled]);

  // Open New Project dialog when triggered from Electron menu
  useEffect(() => {
    if (triggerNewProject && triggerNewProject > 0) {
      setShowNewProjectDialog(true);
    }
  }, [triggerNewProject]);

  // Phase 4 — boot-time staleness check. App.tsx dispatches this event
  // when the auto-restored project's modifiedAt is > 24h old, so the
  // user lands on the Browser with a Continue option instead of being
  // dropped silently into editing. Decoupled via a window event so App
  // doesn't have to thread state down through the Header prop list.
  useEffect(() => {
    const handler = () => setShowProjectLibrary(true);
    window.addEventListener('asaps:open-project-browser', handler);
    return () => window.removeEventListener('asaps:open-project-browser', handler);
  }, []);

  // Boot intents from the Electron start window. When main hands off
  // to the editor with createEmpty / openStoryGen / openIdeator query
  // params, App.tsx fires the matching event so the right surface
  // pops on first paint without state-prop plumbing.
  useEffect(() => {
    const newProjectHandler = () => setShowNewProjectDialog(true);
    const storyGenHandler = () => setShowStoryGenerator(true);
    const ideatorHandler = () => onIdeator?.();
    window.addEventListener('asaps:open-new-project-dialog', newProjectHandler);
    window.addEventListener('asaps:open-story-generator', storyGenHandler);
    window.addEventListener('asaps:open-ideator', ideatorHandler);
    return () => {
      window.removeEventListener('asaps:open-new-project-dialog', newProjectHandler);
      window.removeEventListener('asaps:open-story-generator', storyGenHandler);
      window.removeEventListener('asaps:open-ideator', ideatorHandler);
    };
  }, [onIdeator]);

  const handleLoadProject = async (projectId: string) => {
    const success = await load(projectId);
    if (!success) {
      alert('Failed to load project');
    }
  };

  // Detect if running in Electron on macOS (traffic lights need space)
  const isElectronMac = typeof window !== 'undefined' &&
    !!(window as any).electronAPI?.isElectron &&
    (window as any).electronAPI?.platform === 'darwin';

  return (
    <header className="bg-white border-b border-gray-200 px-4 py-2">
      {/* Row 1: Logo and Story Title - Draggable on Electron macOS */}
      <div
        className="flex items-center justify-between mb-2"
        style={{
          paddingLeft: isElectronMac ? '64px' : undefined,
          // Make this row draggable for window movement on Electron
          WebkitAppRegion: isElectronMac ? 'drag' : undefined,
        } as React.CSSProperties}
      >
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <FileText className="w-6 h-6 text-blue-600" />
            <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              ASAPS
            </span>
            <span className="text-xs text-gray-400 font-normal">
              v{__APP_VERSION__}.{__BUILD_NUMBER__}
            </span>
          </div>

          {/* Story Title - Auto-grows with content, no-drag so it's editable */}
          <input
            type="text"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            className="px-3 py-1.5 text-lg font-medium border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[200px]"
            placeholder="Story Title"
            title="Enter the title that will appear on your story's title screen"
            size={Math.max(15, (title || '').length + 2)}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          />

          {/* Phase 1 — project layout mode badge. Always visible so the
              author knows which authoring contract is active; click
              opens Settings → Layout to switch (with migration prompt). */}
          {layoutMode && (
            <button
              type="button"
              onClick={onOpenLayoutSettings}
              className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
                layoutMode === 'responsive'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                  : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
              }`}
              title={layoutMode === 'responsive'
                ? 'Responsive layout — slot/spatial flow. Click to change.'
                : 'Fixed canvas — pixel-positioned. Click to change.'}
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
              {layoutMode === 'responsive' ? 'Responsive layout' : 'Fixed canvas'}
            </button>
          )}

          {/* Top-row unsaved indicator — surfaces dirty state alongside
              the title where the user is already looking, so they don't
              have to glance down at SaveStatus. The amber pill matches
              the layout-fixed badge family so the row reads as one
              status strip. */}
          {hasUnsavedChanges && (
            <span
              className="px-2.5 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-800 border border-amber-300"
              title="You have unsaved changes. Click Save in the toolbar below."
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
              ● Unsaved
            </span>
          )}
        </div>
      </div>

      {/* Row 2: All action buttons */}
      <div className="flex items-center justify-between">
        {/* Left: Project, Undo/Redo, Save, Import/Export */}
        <div className="flex items-center space-x-2">
          {/* Project Selector — "Browse all projects" routes to the
              dedicated Electron start window when available, else
              falls back to the in-editor modal Browser. Same surface
              either way; the Electron variant is a separate window
              for parity with the cold-launch experience. */}
          <ProjectSelector
            onOpenLibrary={() => {
              if (onInterceptProjectLibrary) {
                const intercepted = onInterceptProjectLibrary();
                if (intercepted) return;
              }
              const electronStart = (window as any).electronAPI?.start;
              if (electronStart?.open) {
                electronStart.open();
              } else {
                setShowProjectLibrary(true);
              }
            }}
          />
          {/* Direct + New entry — opens the picker with the same three
              create paths as the Project Browser. Frequent action,
              previously two clicks deep (Projects dropdown → + New).
              Guarded by hasUnsavedChanges via the same prompt the
              Browser uses, so a user with dirty edits doesn't blow
              them away by accident. */}
          <button
            type="button"
            onClick={() => {
              if (hasUnsavedChanges && onSave) {
                const proceed = window.confirm(
                  'You have unsaved changes in the current project. Save them before continuing?\n\nOK to save and continue, Cancel to stay here.'
                );
                if (!proceed) return;
                onSave();
              }
              setShowNewProjectPicker(true);
            }}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium"
            title="Start a new project (Empty, Prompt, or Co-write with AI)"
          >
            <Plus size={16} />
            <span>New</span>
          </button>

          <div className="w-px h-6 bg-gray-300 mx-1" />

          <UndoRedoToolbar
            showDescriptions={false}
            showShortcuts={false}
            orientation="horizontal"
          />

          <div className="w-px h-6 bg-gray-300 mx-1" />

          {/* Save Button and Status */}
          <SaveStatus
            status={status}
            lastSaved={lastSaved}
            error={saveError}
            onSave={onSave}
            onSaveProject={onSaveProject}
            isUntitledProject={isUntitledProject}
            hasUnsavedChanges={hasUnsavedChanges}
            showText={true}
            compact={false}
          />

          <div className="w-px h-6 bg-gray-300 mx-1" />

          {/* Import Menu */}
          <div className="relative">
            <button
              className="px-3 py-1.5 bg-white text-gray-700 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors flex items-center gap-1.5"
              onClick={() => setShowImportMenu(!showImportMenu)}
              title="Open project files, or import from other formats"
            >
              <Upload className="w-4 h-4" />
              Open
              <ChevronDown className="w-3 h-3" />
            </button>

            {showImportMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowImportMenu(false)}
                />
                {/* Tier-5 item 13 (decision 2026-08-02, built 2026-08-18):
                    "Open" is for ASAPS's own files — they land in your
                    projects transparently, no mental model of "importing"
                    required. "Import" is reserved for format CONVERSIONS
                    (ASML, Twine), where something genuinely gets translated.
                    Merge is neither — it stays its own operation. */}
                <div className="absolute left-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-20">
                  {onImportZip && (
                    <button
                      onClick={() => {
                        onImportZip();
                        setShowImportMenu(false);
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-3"
                      title="Open an ASAPS project file — it's added to your projects and opened"
                    >
                      <Upload className="w-4 h-4" />
                      <span>
                        Open Project File…
                        <span className="block text-[11px] text-gray-400">.asaps · .asapst · zip</span>
                      </span>
                    </button>
                  )}
                  {onMergeStory && (
                    <button
                      onClick={() => {
                        onMergeStory();
                        setShowImportMenu(false);
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-3"
                      title="Merge another story (.asaps) into this project"
                    >
                      <GitMerge className="w-4 h-4" />
                      Merge Story (.asaps)
                    </button>
                  )}
                  <div className="my-1 border-t border-gray-100" />
                  <div className="px-4 pt-1 pb-0.5 text-[10px] font-semibold tracking-wide text-gray-400">
                    IMPORT FROM OTHER FORMATS
                  </div>
                  <button
                    onClick={() => {
                      onImport();
                      setShowImportMenu(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-3"
                    title="Convert an ASML 1.0 (XML) file into a project"
                  >
                    <FileText className="w-4 h-4" />
                    ASML 1.0 (XML)
                  </button>
                  {onImportTwine && (
                    <button
                      onClick={() => {
                        onImportTwine();
                        setShowImportMenu(false);
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-3"
                      title="Convert a Twine 2 story (SugarCube format) into a project"
                    >
                      <FileText className="w-4 h-4" />
                      Twine (HTML)
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Export Menu */}
          <div className="relative">
            <button
              className="px-3 py-1.5 bg-white text-gray-700 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors flex items-center gap-1.5"
              onClick={() => setShowExportMenu(!showExportMenu)}
              title="Export"
            >
              <Download className="w-4 h-4" />
              Export
              <ChevronDown className="w-3 h-3" />
            </button>

            {showExportMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowExportMenu(false)}
                />
                <div className="absolute left-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-20">
                  {onExportZip && (
                    <button
                      onClick={() => {
                        onExportZip();
                        setShowExportMenu(false);
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-3"
                      title="Export project with assets as ZIP — ASML 2.0 (JSON), the complete native format"
                    >
                      <Download className="w-4 h-4" />
                      Export Project (ZIP)
                    </button>
                  )}
                  {onExportTemplate && (
                    <button
                      onClick={() => {
                        onExportTemplate();
                        setShowExportMenu(false);
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-3"
                      title="Export as a distributable template (.asapst) — anyone importing it gets their own copy; your master file is never edited"
                    >
                      <Download className="w-4 h-4" />
                      Export as Template (.asapst)
                    </button>
                  )}
                  {onExportHtml && (
                    <>
                      <div className="my-2 border-t border-gray-200" />
                      <button
                        onClick={() => {
                          onExportHtml();
                          setShowExportMenu(false);
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-3"
                        title="Export as standalone HTML for web embedding"
                      >
                        <Globe className="w-4 h-4" />
                        Export as HTML
                      </button>
                    </>
                  )}
                  {/* Tier-5 item 14 (decision 2026-08-02, built 2026-08-18,
                      semantics corrected same day): ASML itself is NOT
                      legacy — the native JSON project format IS ASML 2.0.
                      What is frozen is ASML 1.0 (XML): its generator
                      predates variants, stances, responsive slot layout,
                      affect bindings and more, and none of it round-trips.
                      Import of 1.0 files stays fully supported — old files
                      keep opening forever. The confirm spells out what a
                      fresh XML export would silently drop. */}
                  <div className="my-2 border-t border-gray-200" />
                  <div className="px-4 pt-1 pb-0.5 text-[10px] font-semibold tracking-wide text-gray-400">
                    LEGACY — ASML 1.0 (XML)
                  </div>
                  <button
                    onClick={() => {
                      if (window.confirm(
                        'ASML 1.0 (XML) is the legacy serialization, kept for compatibility with the original ASAPS. '
                        + 'ASAPS Modern\u2019s native format is ASML 2.0 (JSON), carried in the project zip.\n\n'
                        + 'An XML export does NOT include newer features: character variants and stances, '
                        + 'affect (mood/sentiments/traits), responsive slot layout, counter bindings, themes, '
                        + 'and more. Opening this file later will not restore them.\n\n'
                        + 'For a complete copy of your project, use "Export Project (ZIP)".\n\nExport ASML 1.0 anyway?'
                      )) {
                        onExport();
                      }
                      setShowExportMenu(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-500 hover:bg-gray-50 transition-colors flex items-center gap-3"
                    title="Legacy: export as ASML 1.0 (XML) — newer features are not included"
                  >
                    <FileText className="w-4 h-4" />
                    ASML 1.0 (XML only)
                  </button>
                  {onExportAsmlWithAssets && (
                    <button
                      onClick={() => {
                        if (window.confirm(
                          'ASML 1.0 (XML) is the legacy serialization, kept for compatibility with the original ASAPS. '
                        + 'ASAPS Modern\u2019s native format is ASML 2.0 (JSON), carried in the project zip.\n\n'
                          + 'An XML export does NOT include newer features: character variants and stances, '
                          + 'affect (mood/sentiments/traits), responsive slot layout, counter bindings, themes, '
                          + 'and more. Opening this file later will not restore them.\n\n'
                          + 'For a complete copy of your project, use "Export Project (ZIP)".\n\nExport ASML 1.0 anyway?'
                        )) {
                          onExportAsmlWithAssets();
                        }
                        setShowExportMenu(false);
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-gray-500 hover:bg-gray-50 transition-colors flex items-center gap-3"
                      title="Legacy: export ASML 1.0 (XML) with asset folders — newer features are not included"
                    >
                      <FileText className="w-4 h-4" />
                      ASML 1.0 with Assets
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Tools Menu */}
          {(onMergeDialogTrees || onHelperCommands) && (
            <div className="relative">
              <button
                className="px-3 py-1.5 bg-white text-gray-700 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors flex items-center gap-1.5"
                onClick={() => setShowToolsMenu(!showToolsMenu)}
                title="Tools"
              >
                <Wrench className="w-4 h-4" />
                Tools
                <ChevronDown className="w-3 h-3" />
              </button>

              {showToolsMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowToolsMenu(false)}
                  />
                  <div className="absolute left-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-20">
                    {onHelperCommands && (
                      <button
                        onClick={() => {
                          onHelperCommands();
                          setShowToolsMenu(false);
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-3"
                        title="Bulk transformation commands (Ctrl+Shift+K)"
                      >
                        <Wand2 className="w-4 h-4" />
                        Transformations
                      </button>
                    )}
                    {onMergeDialogTrees && (
                      <button
                        onClick={() => {
                          onMergeDialogTrees();
                          setShowToolsMenu(false);
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-3"
                        title="Merge multiple DialogTree beats into a nested conversation"
                      >
                        <MessageSquare className="w-4 h-4" />
                        Merge DialogTrees
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Right: Feature buttons */}
        <div className="flex items-center space-x-2">
          {onSearch && (
            <button
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                searchPanelOpen
                  ? 'bg-slate-700 text-white ring-2 ring-slate-300'
                  : 'bg-slate-500 text-white hover:bg-slate-600'
              }`}
              onClick={onSearch}
              title="Search & replace text across all beats (Cmd+F)"
            >
              <Search className="w-4 h-4" />
              Search
            </button>
          )}

          {onCharacters && (
            <button
              className="px-3 py-1.5 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600 transition-colors flex items-center gap-1.5"
              // Wrap so the click event is NOT passed as onCharacters' argument.
              // onCharacters -> handleOpenCharacterManager(callback): leaking the
              // event made it a truthy non-function "callback", which turned on
              // selectionMode and crashed on select ("... is not a function").
              onClick={() => onCharacters()}
              title="Create and manage characters with appearances, stats, and inventory"
            >
              <Users className="w-4 h-4" />
              Characters
            </button>
          )}

          {onAssets && (
            <button
              className="px-3 py-1.5 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors flex items-center gap-1.5"
              onClick={onAssets}
              title="Manage images, sounds, videos, and fonts for your story"
            >
              <Image className="w-4 h-4" />
              Assets
            </button>
          )}

          {onSettings && (
            <button
              className="px-3 py-1.5 bg-purple-500 text-white rounded-lg text-sm font-medium hover:bg-purple-600 transition-colors flex items-center gap-1.5"
              onClick={onSettings}
              title="Configure stage size, typography, colors, and global story settings"
            >
              <Settings className="w-4 h-4" />
              Settings
            </button>
          )}

          {onDebug && (
            <button
              className="px-3 py-1.5 bg-gray-600 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors flex items-center gap-1.5"
              onClick={onDebug}
              title="Analyze reachability, find dead ends, and debug story paths"
            >
              <Bug className="w-4 h-4" />
              Debug
            </button>
          )}

          {onPreview && (
            <button
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                previewWindowOpen
                  ? 'bg-green-600 text-white ring-2 ring-green-300 hover:bg-green-700'
                  : 'bg-green-500 text-white hover:bg-green-600'
              }`}
              onClick={onPreview}
              title={previewWindowOpen ? 'Preview window open (Cmd+Shift+P to close)' : 'Open preview window (Cmd+Shift+P)'}
            >
              <Play className="w-4 h-4" />
              {previewWindowOpen ? 'Preview Open' : 'Preview'}
            </button>
          )}
        </div>
      </div>

      {/* Row 3: AI, VCS, Language, Translation */}
      <div className="flex items-center justify-between mt-1 pt-1 border-t border-gray-100">
        {/* Left: AI + VCS */}
        <div className="flex items-center space-x-2">
          {/* AI Menu Button */}
          <div className="relative">
            <button
              className="px-3 py-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg text-sm font-medium hover:from-purple-600 hover:to-pink-600 transition-colors flex items-center gap-1.5"
              onClick={() => setShowAIMenu(!showAIMenu)}
              title="AI Tools"
            >
              <Sparkles className="w-4 h-4" />
              AI
              <ChevronDown className="w-3 h-3" />
            </button>

            {/* AI Dropdown Menu */}
            {showAIMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowAIMenu(false)}
                />
                <div className="absolute left-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-20">
                  {onIdeator && (
                    <button
                      onClick={() => {
                        onIdeator();
                        setShowAIMenu(false);
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-purple-50 hover:text-purple-700 transition-colors flex items-center gap-3"
                      title="Open Ideator — a conversational ideation tool that helps you shape a complex issue into a prompt before generating the story"
                    >
                      <Wand2 className="w-4 h-4" />
                      Ideate with Ideator
                    </button>
                  )}
                  {onCoDesigner && (
                    <button
                      onClick={() => {
                        onCoDesigner();
                        setShowAIMenu(false);
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-teal-50 hover:text-teal-700 transition-colors flex items-center gap-3"
                      title="Open Co-Designer — a design-phase collaborator that works with you on the story currently open (deepen characters, sharpen choices, find where branches earn their keep)"
                    >
                      <Compass className="w-4 h-4" />
                      Design with Co-Designer
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setShowStoryGenerator(true);
                      setShowAIMenu(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-purple-50 hover:text-purple-700 transition-colors flex items-center gap-3"
                    title="Generate a complete story structure from a description"
                  >
                    <Sparkles className="w-4 h-4" />
                    Generate Story
                  </button>
                  <button
                    onClick={() => {
                      setShowBeatCreator(true);
                      setShowAIMenu(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-purple-50 hover:text-purple-700 transition-colors flex items-center gap-3"
                    title="Create a new beat by describing what you want in plain language"
                  >
                    <FileText className="w-4 h-4" />
                    Create Beat from Description
                  </button>
                  <div className="my-2 border-t border-gray-200" />
                  <button
                    onClick={() => {
                      setShowAIConfig(true);
                      setShowAIMenu(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-purple-50 hover:text-purple-700 transition-colors flex items-center gap-3"
                    title="Set up your AI provider (Claude, OpenAI, or local Ollama)"
                  >
                    <Settings className="w-4 h-4" />
                    Configure AI
                  </button>
                </div>
              </>
            )}
          </div>

          {/* VCS Status (shown when project is under version control) */}
          <VCSStatusBar panelOpen={vcsPanelOpen} onTogglePanel={onToggleVCSPanel} onInitRepo={onInitRepo} />
        </div>

        {/* Right: TTS + Language + Translation Progress */}
        <div className="flex items-center space-x-2">
          {/* TTS Menu Button */}
          <div className="relative">
            <button
              className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                ttsEnabled
                  ? 'bg-teal-500 text-white hover:bg-teal-600'
                  : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
              }`}
              onClick={() => setShowTTSMenu(!showTTSMenu)}
              title={ttsEnabled ? 'TTS enabled' : 'TTS disabled'}
            >
              {ttsEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              TTS
              <ChevronDown className="w-3 h-3" />
            </button>

            {/* TTS Dropdown Menu */}
            {showTTSMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowTTSMenu(false)}
                />
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-20">
                  {/* Toggle TTS */}
                  <button
                    onClick={() => {
                      const newEnabled = !ttsEnabled;
                      setTtsEnabled(newEnabled);
                      getTTSService().setEnabled(newEnabled);
                      localStorage.setItem('asaps_tts_enabled', String(newEnabled));
                      if (!newEnabled) getTTSService().stop();
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-teal-50 hover:text-teal-700 transition-colors flex items-center gap-3"
                  >
                    {ttsEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                    {ttsEnabled ? 'Disable TTS' : 'Enable TTS'}
                  </button>

                  {/* Configure Provider */}
                  <button
                    onClick={() => {
                      setShowTTSConfig(true);
                      setShowTTSMenu(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-teal-50 hover:text-teal-700 transition-colors flex items-center gap-3"
                  >
                    <Settings className="w-4 h-4" />
                    Configure Provider
                  </button>

                  {/* Character Voices section */}
                  {ttsEnabled && speakers.length > 0 && (
                    <>
                      <div className="my-2 border-t border-gray-200" />
                      <div className="px-4 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                        Character Voices{activeProviderName ? ` (${activeProviderName})` : ''}
                      </div>
                      {speakers.map(speaker => {
                        const isPlayerCharacter = speaker === 'Interactor' || (playerCharacterName && speaker === playerCharacterName);
                        const displayName = isPlayerCharacter
                          ? (playerCharacterName ? `${playerCharacterName} (Player)` : 'Interactor')
                          : speaker;
                        return (
                          <div key={speaker} className="px-4 py-1.5 flex items-center justify-between gap-2">
                            <span className="text-sm text-gray-700 truncate flex-shrink-0" style={{ maxWidth: '35%' }}>
                              {displayName}
                            </span>
                            <select
                              value={speakerVoices[speaker] || ''}
                              onChange={(e) => onSpeakerVoiceChange?.(speaker, e.target.value)}
                              className="flex-1 text-xs px-2 py-1 border rounded bg-white min-w-0"
                            >
                              <option value="">{isPlayerCharacter ? 'Silent' : 'Auto'}</option>
                              {availableVoices.map(v => (
                                <option key={v.id} value={v.id}>{v.name}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => getTTSService().speak(`Hello, I am ${displayName}.`, speaker)}
                              className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded flex-shrink-0"
                              title={`Test ${displayName}'s voice`}
                            >
                              Test
                            </button>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          {/* STT Menu Button */}
          <div className="relative">
            <button
              className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                sttEnabled
                  ? 'bg-rose-500 text-white hover:bg-rose-600'
                  : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
              }`}
              onClick={() => setShowSTTMenu(!showSTTMenu)}
              title={sttEnabled ? 'STT enabled' : 'STT disabled'}
            >
              {sttEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
              STT
              <ChevronDown className="w-3 h-3" />
            </button>

            {/* STT Dropdown Menu */}
            {showSTTMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowSTTMenu(false)}
                />
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-20">
                  {/* Toggle STT */}
                  <button
                    onClick={() => {
                      const newEnabled = !sttEnabled;
                      setSttEnabled(newEnabled);
                      getSTTService().setEnabled(newEnabled);
                      localStorage.setItem('asaps_stt_enabled', String(newEnabled));
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-rose-50 hover:text-rose-700 transition-colors flex items-center gap-3"
                  >
                    {sttEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                    {sttEnabled ? 'Disable STT' : 'Enable STT'}
                  </button>

                  {/* Configure Provider */}
                  <button
                    onClick={() => {
                      setShowSTTConfig(true);
                      setShowSTTMenu(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-rose-50 hover:text-rose-700 transition-colors flex items-center gap-3"
                  >
                    <Settings className="w-4 h-4" />
                    Configure STT
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Language Selector */}
          <LanguageSelector
            sourceLanguage={translationState.sourceLanguage}
            sourceLanguageName={getLanguageDisplayName(translationState.sourceLanguage)}
            activeLanguage={translationState.activeLanguage}
            translations={translationState.translations}
            manifest={translationState.manifest}
            onLanguageChange={translationActions.setActiveLanguage}
            onGenerateTranslation={async (code, name) => {
              if (!currentProjectId) return;
              const savedConfig = getSavedAIConfig();
              if (!savedConfig?.apiKey) {
                alert('Please configure an AI provider with an API key in the AI Settings first.');
                return;
              }
              try {
                const projectData = await getProjectDataForExport(currentProjectId);
                const providerMap: Record<string, 'openai' | 'anthropic' | 'custom' | 'local'> = {
                  'openai': 'openai',
                  'claude': 'anthropic',
                  'local': 'local',
                };
                const aiConfig = {
                  provider: providerMap[savedConfig.providerType || savedConfig.provider] || 'openai' as const,
                  apiKey: savedConfig.apiKey,
                  baseUrl: savedConfig.baseUrl,
                  model: savedConfig.model,
                };
                await translationActions.generateTranslation(projectData, code, name, aiConfig);
                // Trigger save so translation files get written to disk (visible to VCS)
                markChanged();
              } catch (e) {
                console.error('[Header] Translation generation failed:', e);
              }
            }}
            onCreateManualTranslation={async (code, name) => {
              if (!currentProjectId) return;
              try {
                const projectData = await getProjectDataForExport(currentProjectId);
                translationActions.createManualTranslation(projectData, code, name);
                // Trigger save so translation files get written to disk (visible to VCS)
                markChanged();
              } catch (e) {
                console.error('[Header] Manual translation creation failed:', e);
              }
            }}
            isGenerating={translationState.isGenerating}
            onDeleteTranslation={(code) => {
              translationActions.deleteTranslation(code);
              markChanged();
            }}
            onContinueTranslation={async (code, name) => {
              if (!currentProjectId) return;
              const savedConfig = getSavedAIConfig();
              if (!savedConfig?.apiKey) {
                alert('Please configure an AI provider with an API key in the AI Settings first.');
                return;
              }
              try {
                const projectData = await getProjectDataForExport(currentProjectId);
                const providerMap: Record<string, 'openai' | 'anthropic' | 'custom' | 'local'> = {
                  'openai': 'openai',
                  'claude': 'anthropic',
                  'local': 'local',
                };
                const aiConfig = {
                  provider: providerMap[savedConfig.providerType || savedConfig.provider] || 'openai' as const,
                  apiKey: savedConfig.apiKey,
                  baseUrl: savedConfig.baseUrl,
                  model: savedConfig.model,
                };
                await translationActions.continueTranslation(projectData, code, aiConfig);
                markChanged();
              } catch (e) {
                console.error('[Header] Continue translation failed:', e);
              }
            }}
          />

          {/* Translation progress indicator */}
          {translationState.isGenerating && (() => {
            const { stringsTranslated, totalStrings, generationProgress } = translationState;
            const pct = totalStrings > 0 ? Math.round((stringsTranslated / totalStrings) * 100) : 0;
            return (
              <div className="flex items-center gap-2 px-2.5 py-1 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded">
                <svg className="w-3.5 h-3.5 animate-spin flex-shrink-0" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <div className="flex flex-col gap-0.5 min-w-[140px]">
                  <span className="truncate">
                    {generationProgress || 'Translating...'}
                  </span>
                  {totalStrings > 0 && (
                    <div className="w-full h-1.5 bg-blue-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-600 rounded-full transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* New Project Dialog */}
      {showNewProjectDialog && (
        <NewProjectDialog
          onClose={() => setShowNewProjectDialog(false)}
          onProjectCreated={(projectId) => {
            handleLoadProject(projectId);
            setShowNewProjectDialog(false);
          }}
        />
      )}

      {/* Project Library */}
      {showProjectLibrary && (() => {
        // Guard create/load actions when the current project has
        // unsaved edits. From Prompt and Ideator BOTH funnel through
        // handleStoryGenerated which calls actions.clearStory() with
        // auto-save paused — a path the auto-saver can't rescue, so
        // any unsaved beats would silently vanish. Save-then-proceed
        // is the right default; auto-save will have caught up by the
        // time the user clicks the prompt anyway, but the explicit
        // call protects the rare just-edited-then-jumped case.
        const guardCreate = (action: () => void) => {
          if (hasUnsavedChanges && onSave) {
            const proceed = window.confirm(
              'You have unsaved changes in the current project. Save them before continuing?\n\nOK to save and continue, Cancel to stay here.'
            );
            if (!proceed) return;
            onSave();
          }
          action();
        };
        return (
        <ProjectLibrary
          onLoadProject={(projectId) => {
            guardCreate(() => {
              handleLoadProject(projectId);
              setShowProjectLibrary(false);
            });
          }}
          onCreateProject={() => {
            guardCreate(() => {
              setShowProjectLibrary(false);
              setShowNewProjectDialog(true);
            });
          }}
          // Phase 5 — Prompt path. Only enabled when the host App
          // wired an onStoryGenerated handler (it does, for normal
          // editor flow). Closes the library and opens the existing
          // StoryGenerator dialog; its onStoryGenerated fires the App's
          // handleStoryGenerated which spins up a new project.
          onOpenStoryFromPrompt={onStoryGenerated ? () => {
            guardCreate(() => {
              setShowProjectLibrary(false);
              setShowStoryGenerator(true);
            });
          } : undefined}
          // Phase 6 — Ideator path. Closes the library and opens the
          // existing Ideator pop-out window via App's handleOpenIdeator.
          // The pop-out's session-end SUBMIT_REQUEST hits handleIdeatorSubmit
          // → AI generator → handleStoryGenerated → new project, same
          // pipeline as the Prompt path.
          onOpenIdeator={onIdeator ? () => {
            guardCreate(() => {
              setShowProjectLibrary(false);
              onIdeator();
            });
          } : undefined}
          onExportZip={onExportZip}
          onImportZip={onImportZip}
          onImportZipFile={onImportZipFile}
          onRenameProject={onRenameProject}
          isModal={true}
          onClose={() => setShowProjectLibrary(false)}
          currentProjectId={currentProjectId}
          onCurrentProjectDeleted={onCurrentProjectDeleted}
        />
        );
      })()}

      {/* New Project Picker — the in-editor + New entry. Routes to the
          same destinations as the Browser's create row (without
          Import — that's a Browser-only flow). */}
      <NewProjectPicker
        isOpen={showNewProjectPicker}
        onClose={() => setShowNewProjectPicker(false)}
        onPickEmpty={() => {
          if (onInterceptNewProject) {
            const intercepted = onInterceptNewProject();
            if (intercepted) return;
          }
          setShowNewProjectDialog(true);
        }}
        onPickPrompt={onStoryGenerated ? () => setShowStoryGenerator(true) : undefined}
        onPickIdeator={onIdeator ? () => onIdeator() : undefined}
        onPickTemplate={onImportZipFile ? () => setShowTemplateGallery(true) : undefined}
      />

      {/* Template gallery — the "Start from a template" destination. Using
          a template routes through the ordinary zip-import pipeline, whose
          template branch instantiates a fresh copy. */}
      <TemplateGalleryModal
        isOpen={showTemplateGallery}
        onClose={() => setShowTemplateGallery(false)}
        onUseTemplate={async (file, _meta, name) => {
          await onImportZipFile?.(file, name ? { newName: name } : undefined);
          setShowTemplateGallery(false);
        }}
      />

      {/* AI Configuration Dialog */}
      <AIConfigDialog
        isOpen={showAIConfig}
        onClose={() => setShowAIConfig(false)}
        onSettingsChanged={onAISettingsChanged}
      />

      {/* TTS Configuration Dialog */}
      <TTSConfigDialog
        isOpen={showTTSConfig}
        onClose={() => setShowTTSConfig(false)}
        onConfigure={(providerType, apiKey, model, baseUrl, defaultVoiceId) => {
          configureTTS(providerType, apiKey, model, baseUrl, defaultVoiceId);
          onTTSProviderChanged?.(providerType, model, baseUrl);
        }}
        ttsEnabled={ttsEnabled}
        onToggleTTS={(enabled) => {
          setTtsEnabled(enabled);
          getTTSService().setEnabled(enabled);
          localStorage.setItem('asaps_tts_enabled', String(enabled));
          if (!enabled) getTTSService().stop();
        }}
      />

      <STTConfigDialog
        isOpen={showSTTConfig}
        onClose={() => setShowSTTConfig(false)}
        onConfigure={(providerType, apiKey, model, baseUrl, language) => {
          configureSTT(providerType, apiKey, model, baseUrl, language);
        }}
        sttEnabled={sttEnabled}
        onToggleSTT={(enabled) => {
          setSttEnabled(enabled);
          getSTTService().setEnabled(enabled);
          localStorage.setItem('asaps_stt_enabled', String(enabled));
        }}
      />

      {/* Story Generator Dialog */}
      {onStoryGenerated && (
        <StoryGenerator
          isOpen={showStoryGenerator}
          onClose={() => setShowStoryGenerator(false)}
          onStoryGenerated={onStoryGenerated}
        />
      )}

      {/* Natural Language Beat Creator Dialog */}
      {onBeatCreated && (
        <NaturalLanguageBeatCreator
          isOpen={showBeatCreator}
          onClose={() => setShowBeatCreator(false)}
          onBeatCreated={onBeatCreated}
        />
      )}
    </header>
  );
};
