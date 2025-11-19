import { useState, useCallback, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { WorkspaceView } from './components/WorkspaceView';
import { Inspector } from './components/Inspector';
import { StoryPreview } from './components/preview/StoryPreview';
import { GlobalSettingsInspector } from './components/settings/GlobalSettingsInspector';
import { useStoryBuilder } from './hooks/useStoryBuilder';
import { CharacterManager } from './components/characters/CharacterManager';
import { AssetManager } from './components/assets/AssetManager';
import { Story } from '@asaps/core';
import type { Beat, Cluster } from '@asaps/core';
import { useSave, useProject, usePersistence } from './contexts/PersistenceContext';
import { Character } from './types/character';
import type { Asset } from './components/assets/AssetManager';
import type { GlobalSettings } from './components/settings/GlobalSettingsInspector';
import { loadProjectData } from './utils/projectDeserializer';
import { downloadProjectAsZip, importProjectFromZip } from './utils/projectZipManager';
import { SaveUnsavedWorkDialog } from './components/SaveUnsavedWorkDialog';

function App() {
  const { state, actions, initializeStory } = useStoryBuilder();
  const [selectedBeat, setSelectedBeat] = useState<Beat | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [selectedCluster, setSelectedCluster] = useState<Cluster | null>(null);
  const [paletteCollapsed, setPaletteCollapsed] = useState(false);
  const [showCharacterManager, setShowCharacterManager] = useState(false);
  const [showAssetManager, setShowAssetManager] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<string>('');

  // Asset and character state
  const [assets, setAssets] = useState<Asset[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);

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

  const [globalSettings, setGlobalSettings] = useState<GlobalSettings>({
    project: {
      width: 1024,
      height: 768,
      aspectRatio: '4:3',
      scalingMode: 'fit'
    },
    colors: {
      pcolor: '#ffffff',
      palpha: 1,
      nonpcolor: '#ffffff',
      nonpalpha: 1,
      bgColor: '#000000',
      textBoxBg: '#000000',
      textBoxBorder: '#ffffff'
    },
    fonts: {
      titleFont: 'Arial',
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
      padding: 16,
      borderWidth: 2,
      opacity: 0.8,
      position: 'bottom',
      boxVisibility: 'all'
    },
    textEffects: {
      animation: 'none',
      typewriterSpeed: 50,
      fadeInDuration: 200
    },
    hotspots: {
      visible: true,
      labels: true,
      highlightColor: '#ffff00'
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

  // Persistence hooks
  const { markChanged, saveNow } = useSave();
  const { updateStory, project: currentProject, load: loadProject, create: createProject } = useProject();
  const { isUntitledProject, setIsUntitledProject, hasUnsavedChanges } = usePersistence();

  // Track loaded project to avoid re-loading the same project
  const loadedProjectIdRef = useRef<string | null>(null);

  // Initialize with a basic story on mount
  useEffect(() => {
    if (state.beats.length === 0 && !currentProject) {
      initializeStory();
      setIsUntitledProject(true);
    }
  }, []);

  // Load project data when currentProject changes
  useEffect(() => {
    if (currentProject && currentProject.id !== loadedProjectIdRef.current) {
      console.log('[App] Loading project into editor:', currentProject.id);

      try {
        // Deserialize and load project data
        const projectData = loadProjectData(currentProject);

        // Load into story builder
        actions.loadStoryData({
          title: projectData.title,
          author: projectData.author,
          beats: projectData.beats,
          connections: [], // Connections are stored in beats
          story: currentProject.story,
          settings: projectData.settings,
          environment: projectData.environment,
          characters: projectData.characters,
          clusters: projectData.clusters
        });

        // Update characters and settings state
        setCharacters(projectData.characters || []);
        if (projectData.settings) {
          actions.updateSettings(projectData.settings);
        }

        // Mark as loaded
        loadedProjectIdRef.current = currentProject.id;

        // Clear untitled state since we're now working with a real project
        setIsUntitledProject(false);

        console.log('[App] Project loaded successfully:', {
          beats: projectData.beats.length,
          characters: projectData.characters?.length || 0,
          clusters: projectData.clusters?.length || 0
        });
      } catch (error) {
        console.error('[App] Failed to load project:', error);
        alert('Failed to load project. See console for details.');
      }
    } else if (!currentProject && loadedProjectIdRef.current) {
      // Project was unloaded (e.g., deleted)
      console.log('[App] Project unloaded');
      loadedProjectIdRef.current = null;
      // Clear untitled state when project is unloaded
      setIsUntitledProject(false);
    }
  }, [currentProject, actions, setIsUntitledProject]);

  // Handler functions
  const handleBeatSelect = useCallback((beat: Beat) => {
    setSelectedBeat(beat);
  }, []);

  const handleClusterSelect = useCallback((cluster: Cluster | null) => {
    setSelectedCluster(cluster);
  }, []);

  const handleBeatUpdate = useCallback((beatId: string, updates: Partial<Beat>) => {
    actions.updateBeat(beatId, updates);
    const updatedBeat = state.beats.find(b => b.id === beatId);
    if (updatedBeat && selectedBeat?.id === beatId) {
      setSelectedBeat(updatedBeat);
    }
    markChanged();
  }, [actions, state.beats, selectedBeat, markChanged]);

  const handleBeatDelete = useCallback((beatId: string) => {
    actions.deleteBeat(beatId);
    setSelectedBeat(null);
    markChanged();
  }, [actions, markChanged]);

  const handleBeatAdd = useCallback((type: string, position: { x: number; y: number }) => {
    const newBeat = actions.addBeat(type, position);
    setSelectedBeat(newBeat);
    markChanged();
  }, [actions, markChanged]);

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
        await actions.importStory(text);
        setSelectedBeat(null);
        alert('Story imported successfully!');
      } catch (error) {
        console.error('Import failed:', error);
        alert('Failed to import story. Please check that it\'s a valid ASML file.');
      }
    };

    input.click();
  }, [actions]);

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

  const handleImportZip = useCallback(async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip,.asaps.zip';

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const result = await importProjectFromZip(file, {
          generateNewId: true // Always generate new ID to avoid conflicts
        });

        if (result.success && result.projectId) {
          // Load the imported project
          await loadProject(result.projectId);

          alert('Project imported successfully!');
        } else {
          throw new Error(result.error || 'Import failed');
        }
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
    setShowPreview(true);
  }, [state.beats]);

  const handleClosePreview = useCallback(() => {
    setShowPreview(false);
  }, []);

  // Asset and character handlers
  const handleAssetSelect = useCallback((type: 'background' | 'character' | 'prop' | 'sound', callback: (asset: Asset) => void) => {
    // Implement asset selection modal
    console.log('Asset select for type:', type);
  }, []);

  const handleAssetAdd = useCallback(async (asset: Asset) => {
    setAssets(prev => [...prev, asset]);
    markChanged();
    return true;
  }, [markChanged]);

  const handleAssetRemove = useCallback((assetId: string) => {
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
    setShowCharacterManager(true);
  }, []);

  const handleCloseCharacterManager = useCallback(() => {
    setShowCharacterManager(false);
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

  // Create a Story object for preview
  const getStoryForPreview = useCallback((): Story => {
    const story = new Story({
      title: state.title,
      author: state.author || 'Unknown',
      firstBeatId: state.beats[0]?.id || '0',
    });

    state.beats.forEach(beat => {
      story.addBeat(beat);
    });

    return story;
  }, [state]);

  // Save unsaved work dialog handlers
  const handleShowSaveDialog = useCallback((action: string) => {
    if (isUntitledProject && hasUnsavedChanges) {
      setShowSaveDialog(true);
      setPendingAction(action);
      return true; // Intercepted
    }
    return false; // Not intercepted, let Header proceed
  }, [isUntitledProject, hasUnsavedChanges]);

  const handleSaveUnsavedWork = useCallback(async () => {
    // Create a new project with current work
    try {
      await createProject('Untitled Project');
      // Project is automatically loaded by createProject
      // Clear the dialog and pending action
      setShowSaveDialog(false);
      setPendingAction('');
    } catch (error) {
      console.error('Failed to save project:', error);
      alert('Failed to save project. Please try again.');
    }
  }, [createProject]);

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
   * Handle AI-generated story
   */
  const handleStoryGenerated = useCallback((story: any) => {
    console.log('[App] Story generated:', story);

    // Clear existing beats and connections
    actions.clearStory();

    // Add metadata
    if (story.metadata) {
      actions.setTitle(story.metadata.title || 'Generated Story');
    }

    // Add all generated beats
    if (story.beats && Array.isArray(story.beats)) {
      story.beats.forEach((beatData: any) => {
        const beat = actions.addBeat(beatData.type || 'introText', beatData.position);
        // Update beat with generated parameters
        if (beatData.parameters) {
          actions.updateBeat(beat.id, { ...beatData.parameters });
        }
        // Update name if provided
        if (beatData.label || beatData.name) {
          actions.updateBeat(beat.id, { name: beatData.label || beatData.name });
        }
      });
    }

    // Add connections after all beats are created
    if (story.connections && Array.isArray(story.connections)) {
      setTimeout(() => {
        story.connections.forEach((conn: any) => {
          try {
            actions.connectBeats(conn.sourceId || conn.from, conn.targetId || conn.to);
          } catch (error) {
            console.warn('[App] Failed to create connection:', conn, error);
          }
        });
      }, 100);
    }

    markChanged();
  }, [actions, markChanged]);

  /**
   * Handle AI-generated beat from natural language description
   */
  const handleBeatCreated = useCallback((beatData: any) => {
    console.log('[App] Beat created from NL:', beatData);

    // Create beat at center or specified position
    const position = beatData.position || { x: 400, y: 300 };
    const beat = actions.addBeat(beatData.type || 'introText', position);

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

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <Header
        title={state.title}
        onTitleChange={actions.setTitle}
        projectName={currentProject?.name}
        onExport={handleExport}
        onImport={handleImport}
        onExportZip={handleExportZip}
        onImportZip={handleImportZip}
        onPreview={handlePreview}
        onCharacters={handleOpenCharacterManager}
        onAssets={handleOpenAssetManager}
        onSettings={handleOpenSettings}
        onInterceptNewProject={() => handleShowSaveDialog('newProject')}
        onInterceptProjectLibrary={() => handleShowSaveDialog('projectLibrary')}
        onStoryGenerated={handleStoryGenerated}
        onBeatCreated={handleBeatCreated}
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
          onMoveBeatToCluster={actions.moveBeatToCluster}
          onToggleCluster={actions.expandCollapseCluster}
        />

        <div className="flex flex-1 overflow-hidden">
          <WorkspaceView
            beats={state.beats}
            connections={state.connections}
            clusters={state.clusters || []}
            selectedBeat={selectedBeat}
            selectedCluster={selectedCluster}
            onBeatSelect={handleBeatSelect}
            onBeatUpdate={handleBeatUpdate}
            onClusterSelect={handleClusterSelect}
            onBeatMove={actions.moveBeat}
            onConnect={actions.connectBeats}
            onBeatAdd={handleBeatAdd}
            onClusterExpandCollapse={actions.expandCollapseCluster}
            onClusterMove={(clusterId: string, x: number, y: number) => {
              if (actions.moveCluster) {
                actions.moveCluster(clusterId, { x, y });
              }
            }}
            onBeatInContainerMove={() => {
              // TODO: implement moveBeatInContainer in useStoryBuilder
              console.log('moveBeatInContainer not implemented');
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
              onAssetSelect={handleAssetSelect}
              onOpenCharacterManager={handleOpenCharacterManager}
            />
          )}
        </div>
      </div>

      {/* Preview Modal */}
      {showPreview && (
        <StoryPreview
          story={getStoryForPreview()}
          assets={assets}
          characters={characters}
          onClose={handleClosePreview}
        />
      )}

      {/* Character Manager Modal */}
      {showCharacterManager && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white rounded-lg w-full max-w-6xl h-5/6 m-4 flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-xl font-semibold">Character Manager</h2>
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

      {/* Settings Modal */}
      {showSettings && (
        <GlobalSettingsInspector
          settings={globalSettings}
          onUpdate={(newSettings) => setGlobalSettings(newSettings)}
          onClose={handleCloseSettings}
        />
      )}

      {/* Save Unsaved Work Dialog */}
      <SaveUnsavedWorkDialog
        isOpen={showSaveDialog}
        onClose={handleCancelSaveDialog}
        onSave={handleSaveUnsavedWork}
        onDiscard={handleDiscardUnsavedWork}
        action={pendingAction === 'newProject' ? 'creating a new project' : 'opening the project library'}
      />
    </div>
  );
}

export default App;
