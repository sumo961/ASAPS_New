import { useState, useCallback, useEffect } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { WorkspaceView } from './components/WorkspaceView';
import { Inspector } from './components/Inspector';
import { StoryPreview } from './components/preview/StoryPreview';
import { useStoryBuilder } from './hooks/useStoryBuilder';
import { CharacterManager } from './components/characters/CharacterManager';
import { AssetManager } from './components/assets/AssetManager';
import { Story } from '@asaps/core';
import type { Beat, Cluster } from '@asaps/core';
import { useSave, useProject } from './contexts/PersistenceContext';
import { Character } from './types/character';
import type { Asset } from './components/assets/AssetManager';
import type { GlobalSettings } from './components/settings/GlobalSettingsInspector';

function App() {
  const { state, actions, initializeStory } = useStoryBuilder();
  const [selectedBeat, setSelectedBeat] = useState<Beat | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [selectedCluster, setSelectedCluster] = useState<Cluster | null>(null);
  const [paletteCollapsed, setPaletteCollapsed] = useState(false);
  const [showCharacterManager, setShowCharacterManager] = useState(false);
  const [showAssetManager, setShowAssetManager] = useState(false);

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
  const { markChanged } = useSave();
  const { updateStory, project: currentProject } = useProject();

  // Initialize with a basic story on mount
  useEffect(() => {
    if (state.beats.length === 0) {
      initializeStory();
    }
  }, []);

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

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <Header
        title={state.title}
        onTitleChange={actions.setTitle}
        onExport={handleExport}
        onImport={handleImport}
        onPreview={handlePreview}
        onCharacters={handleOpenCharacterManager}
        onAssets={handleOpenAssetManager}
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
    </div>
  );
}

export default App;
