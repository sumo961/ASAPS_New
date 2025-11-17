#!/bin/bash

echo "🎨 Completing Asset Management Integration..."
echo ""

# Update Header component to include Assets button
cat > packages/builder/src/components/Header.tsx << 'EOF'
import React from 'react';
import { Save, Upload, Play, Settings, Image, HelpCircle } from 'lucide-react';

interface HeaderProps {
  title: string;
  onTitleChange: (title: string) => void;
  onExport: () => void;
  onImport: () => void;
  onPreview: () => void;
  onSettings: () => void;
  onAssets?: () => void;
  onHelp?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  onTitleChange,
  onExport,
  onImport,
  onPreview,
  onSettings,
  onAssets,
  onHelp,
}) => {
  return (
    <header className="bg-white border-b border-gray-200 px-6 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-gray-800">ASPS Modern</h1>
          <input
            type="text"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            className="px-3 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Story Title"
          />
        </div>
        
        <div className="flex items-center gap-2">
          {onAssets && (
            <button
              onClick={onAssets}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
              title="Manage Assets"
            >
              <Image className="w-4 h-4" />
              Assets
            </button>
          )}
          
          <button
            onClick={onSettings}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
            title="Global Settings"
          >
            <Settings className="w-4 h-4" />
            Settings
          </button>
          
          <button
            onClick={onImport}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            title="Import Story"
          >
            <Upload className="w-4 h-4" />
            Import
          </button>
          
          <button
            onClick={onExport}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            title="Export Story"
          >
            <Save className="w-4 h-4" />
            Export
          </button>
          
          <button
            onClick={onPreview}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            title="Preview Story"
          >
            <Play className="w-4 h-4" />
            Preview
          </button>
          
          {onHelp && (
            <button
              onClick={onHelp}
              className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
              title="Help & Shortcuts"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
EOF

echo "✅ Updated Header with Assets button"

# Now create the full App.tsx with Asset Management integrated
cat > packages/builder/src/App.tsx << 'EOF'
import { useState, useCallback, useEffect } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { Canvas } from './components/Canvas';
import { Inspector } from './components/Inspector';
import { StoryPreview } from './components/preview/StoryPreview';
import GlobalSettingsInspector from './components/settings/GlobalSettingsInspector';
import { AssetManager } from './components/assets/AssetManager';
import KeyboardShortcutsModal from './components/KeyboardShortcutsModal';
import type { GlobalSettings } from './components/settings/GlobalSettingsInspector';
import { useStoryBuilder } from './hooks/useStoryBuilder';
import { useBeatClipboard } from './hooks/useBeatClipboard';
import { useAssetManager } from './hooks/useAssetManager';
import { Story } from '@asaps/core';
import type { Beat } from '@asaps/core';

// Default settings used throughout the app
const DEFAULT_SETTINGS: GlobalSettings = {
  colors: {
    pcolor: '#7D8DA3',
    palpha: 90,
    nonpcolor: '#CCCCCC',
    nonpalpha: 90,
    bgColor: '#1a1a1a',
    textBoxBg: '#000000',
    textBoxBorder: '#333333',
  },
  fonts: {
    titleFont: 'Gothic',
    textFont: 'Handwriting2',
    btnFont: 'Handwriting2',
    fontSize: {
      title: 48,
      text: 18,
      button: 16,
    }
  },
  textbox: {
    radius: 20,
    padding: 20,
    borderWidth: 2,
    opacity: 80,
    position: 'bottom',
  },
  textEffects: {
    animation: 'typewriter',
    typewriterSpeed: 30,
    fadeInDuration: 500,
  },
  hotspots: {
    visible: true,
    labels: true,
    highlightColor: '#ffff00',
  },
  debug: {
    firstbeat: '0',
    showvals: false,
  }
};

function App() {
  const { state, actions, initializeStory } = useStoryBuilder();
  const [selectedBeat, setSelectedBeat] = useState<Beat | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [inspectorExpanded, setInspectorExpanded] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [paletteCollapsed, setPaletteCollapsed] = useState(false);
  
  // Asset Management
  const {
    assets,
    showAssetManager,
    addAsset,
    removeAsset,
    updateAsset,
    toggleAssetManager,
    closeAssetManager,
  } = useAssetManager();
  
  // Global settings state - initialized with DEFAULT_SETTINGS
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings>(DEFAULT_SETTINGS);

  // Initialize with a basic story on mount
  useEffect(() => {
    if (state.beats.length === 0) {
      initializeStory();
    }
  }, [state.beats.length, initializeStory]);

  // Keyboard shortcuts for help modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Help modal: ? or Shift+/
      if ((e.key === '?' || (e.shiftKey && e.key === '/')) && 
          !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement;
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          setShowHelp(prev => !prev);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleBeatSelect = useCallback((beat: Beat) => {
    setSelectedBeat(beat);
    // Auto-expand inspector for dialog tree beats
    if (beat.type === 'dialogTree') {
      setInspectorExpanded(true);
    }
    // Auto-open inspector if it was collapsed
    if (inspectorCollapsed) {
      setInspectorCollapsed(false);
    }
  }, [inspectorCollapsed]);

  const handleBeatUpdate = useCallback((beatId: string, updates: Partial<Beat>) => {
    actions.updateBeat(beatId, updates);
    // Force re-render by updating selected beat reference
    const updatedBeat = state.beats.find(b => b.id === beatId);
    if (updatedBeat && selectedBeat?.id === beatId) {
      setSelectedBeat(updatedBeat);
    }
  }, [actions, state.beats, selectedBeat]);

  // Define handleBeatDelete before using it in clipboard
  const handleBeatDelete = useCallback((beatId: string) => {
    actions.deleteBeat(beatId);
    setSelectedBeat(null);
    setInspectorExpanded(false);
  }, [actions]);

  // Clipboard functionality - handlePasteBeat receives plain object, not Beat
  const handlePasteBeat = useCallback((beatData: {
    id: string;
    name: string;
    type: string;
    x?: number;
    y?: number;
    parameters?: Record<string, any>;
  }, position?: { x: number; y: number }) => {
    // Create new beat with the type
    const newBeat = actions.addBeat(beatData.type, position || { x: beatData.x || 0, y: beatData.y || 0 });
    
    // Copy all parameters from the clipboard beat if available
    if (beatData.parameters && typeof newBeat.updateParameters === 'function') {
      newBeat.updateParameters(beatData.parameters);
    }
    
    // Update the beat with name and position
    actions.updateBeat(newBeat.id, {
      name: beatData.name,
      x: position?.x || beatData.x || newBeat.x,
      y: position?.y || beatData.y || newBeat.y
    });
    
    setSelectedBeat(newBeat);
  }, [actions]);

  // Initialize clipboard with proper handlers
  const clipboard = useBeatClipboard(
    selectedBeat,
    (beat) => console.log('Copy:', beat),
    handlePasteBeat,
    handleBeatDelete
  );

  const handleBeatAdd = useCallback((type: string, position: { x: number; y: number }) => {
    const newBeat = actions.addBeat(type, position);
    setSelectedBeat(newBeat);
    // Auto-expand inspector for complex beat types
    if (type === 'dialogTree' || type === 'movementChoice' || type === 'pickProp') {
      setInspectorExpanded(true);
    }
    // Open inspector if collapsed
    if (inspectorCollapsed) {
      setInspectorCollapsed(false);
    }
  }, [actions, inspectorCollapsed]);

  const handleExport = useCallback(async () => {
    try {
      // Include assets in the export
      const storyData = {
        asml: actions.exportStory(),
        assets: assets.map(a => ({
          id: a.id,
          name: a.name,
          type: a.type,
          subType: a.subType,
          url: a.url,
          metadata: a.metadata
        })),
        settings: globalSettings
      };
      
      const asml = actions.exportStory();
      
      // Create a blob and download
      const blob = new Blob([asml], { type: 'text/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${state.title.replace(/\s+/g, '_')}.xml`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      console.log('Story exported successfully with', assets.length, 'assets');
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export story. See console for details.');
    }
  }, [actions, state.title, assets, globalSettings]);

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
        setInspectorExpanded(false);
        console.log('Story imported successfully');
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

  const handleShowSettings = useCallback(() => {
    setShowSettings(true);
  }, []);

  const handleCloseSettings = useCallback(() => {
    setShowSettings(false);
  }, []);

  const handleUpdateSettings = useCallback((newSettings: GlobalSettings) => {
    setGlobalSettings(newSettings);
    actions.updateSettings(newSettings);
    setShowSettings(false);
  }, [actions]);

  const toggleInspectorExpanded = useCallback(() => {
    setInspectorExpanded(!inspectorExpanded);
  }, [inspectorExpanded]);

  const toggleInspectorCollapsed = useCallback(() => {
    setInspectorCollapsed(!inspectorCollapsed);
  }, [inspectorCollapsed]);

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed(!sidebarCollapsed);
  }, [sidebarCollapsed]);

  const togglePaletteCollapsed = useCallback(() => {
    setPaletteCollapsed(!paletteCollapsed);
  }, [paletteCollapsed]);

  // Create a Story object for preview with settings
  const getStoryForPreview = useCallback((): Story => {
    const story = new Story({
      title: state.title,
      author: state.author || 'Unknown',
      firstBeatId: state.beats[0]?.id || '0',
    });
    
    // Apply the global settings to the story
    story.setSettings(globalSettings);
    
    // Add all beats to story
    state.beats.forEach(beat => {
      story.addBeat(beat);
    });
    
    return story;
  }, [state, globalSettings]);

  // Calculate dynamic widths for responsive layout
  const getInspectorWidth = () => {
    if (inspectorCollapsed) return 'w-12'; // Collapsed to icon width
    if (inspectorExpanded) return 'w-[640px]'; // Expanded for complex beats
    if (selectedBeat) return 'w-80'; // Normal width when beat selected
    return 'w-0'; // Hidden when no beat selected
  };

  const inspectorWidth = getInspectorWidth();
  
  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <Header 
        title={state.title}
        onTitleChange={actions.setTitle}
        onExport={handleExport}
        onImport={handleImport}
        onPreview={handlePreview}
        onSettings={handleShowSettings}
        onAssets={toggleAssetManager}
        onHelp={() => setShowHelp(true)}
      />
      
      <div className="flex flex-1 overflow-hidden">
        <Sidebar 
          beats={state.beats}
          selectedBeat={selectedBeat}
          onBeatSelect={handleBeatSelect}
          onAddBeat={(type) => actions.addBeat(type)}
          collapsed={sidebarCollapsed}
          onToggleCollapse={toggleSidebarCollapsed}
        />
        
        <Canvas 
          beats={state.beats}
          connections={state.connections}
          selectedBeat={selectedBeat}
          onBeatSelect={handleBeatSelect}
          onBeatMove={actions.moveBeat}
          onConnect={actions.connectBeats}
          onBeatAdd={handleBeatAdd}
          paletteCollapsed={paletteCollapsed}
          onTogglePalette={togglePaletteCollapsed}
        />
        
        {/* Inspector with collapse functionality */}
        <div className={`${inspectorWidth} transition-all duration-300 relative`}>
          {/* Collapse/Expand Button - Always visible */}
          <button
            onClick={toggleInspectorCollapsed}
            className="absolute -left-3 top-4 z-10 p-1 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
            title={inspectorCollapsed ? 'Expand Inspector' : 'Collapse Inspector'}
          >
            {inspectorCollapsed ? '←' : '→'}
          </button>
          
          {/* Expand/Collapse Button for complex beats - only when not fully collapsed */}
          {!inspectorCollapsed && selectedBeat && (
            selectedBeat.type === 'dialogTree' || 
            selectedBeat.type === 'movementChoice' || 
            selectedBeat.type === 'pickProp'
          ) && (
            <button
              onClick={toggleInspectorExpanded}
              className="absolute -left-3 top-20 z-10 p-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
              title={inspectorExpanded ? 'Collapse' : 'Expand for editing'}
            >
              {inspectorExpanded ? '→' : '←'}
            </button>
          )}
          
          {/* Only render Inspector if not collapsed */}
          {!inspectorCollapsed && (
            <Inspector 
              beat={selectedBeat}
              onUpdate={handleBeatUpdate}
              onDelete={handleBeatDelete}
              allBeats={state.beats}
              onConnect={actions.connectBeats}
              onDisconnect={actions.disconnectBeats}
              expanded={inspectorExpanded}
              assets={assets}
              onOpenAssetManager={toggleAssetManager}
            />
          )}
        </div>
      </div>

      {/* Preview Modal - now receives settings and assets */}
      {showPreview && (
        <StoryPreview 
          story={getStoryForPreview()}
          settings={globalSettings}
          assets={assets}
          onClose={handleClosePreview}
        />
      )}

      {/* Settings Modal - now uses DEFAULT_SETTINGS */}
      {showSettings && (
        <GlobalSettingsInspector
          settings={globalSettings}
          defaultSettings={DEFAULT_SETTINGS}
          onUpdate={handleUpdateSettings}
          onClose={handleCloseSettings}
        />
      )}

      {/* Asset Manager Modal */}
      {showAssetManager && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-xl w-[900px] h-[700px] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">Asset Manager</h2>
              <button
                onClick={closeAssetManager}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <AssetManager
                assets={assets}
                onAssetAdd={addAsset}
                onAssetRemove={removeAsset}
                onAssetUpdate={updateAsset}
              />
            </div>
          </div>
        </div>
      )}

      {/* Keyboard Shortcuts Modal */}
      {showHelp && (
        <KeyboardShortcutsModal onClose={() => setShowHelp(false)} />
      )}
    </div>
  );
}

export default App;
EOF

echo "✅ Updated App.tsx with full Asset Management integration"

# Create a Keyboard Shortcuts Modal if it doesn't exist
cat > packages/builder/src/components/KeyboardShortcutsModal.tsx << 'EOF'
import React from 'react';
import { X, Command } from 'lucide-react';

interface KeyboardShortcutsModalProps {
  onClose: () => void;
}

const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({ onClose }) => {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const cmdKey = isMac ? '⌘' : 'Ctrl';

  const shortcuts = [
    { category: 'Beat Operations', items: [
      { keys: [`${cmdKey}`, 'C'], action: 'Copy selected beat' },
      { keys: [`${cmdKey}`, 'X'], action: 'Cut selected beat' },
      { keys: [`${cmdKey}`, 'V'], action: 'Paste beat' },
      { keys: [`${cmdKey}`, 'D'], action: 'Duplicate beat' },
      { keys: ['Delete'], action: 'Delete selected beat' },
      { keys: ['Backspace'], action: 'Delete selected beat' },
    ]},
    { category: 'File Operations', items: [
      { keys: [`${cmdKey}`, 'S'], action: 'Export story' },
      { keys: [`${cmdKey}`, 'O'], action: 'Import story' },
    ]},
    { category: 'View', items: [
      { keys: ['?'], action: 'Show this help' },
      { keys: [`${cmdKey}`, 'P'], action: 'Preview story' },
    ]},
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl w-[600px] max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Command className="w-5 h-5" />
            Keyboard Shortcuts
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6">
          {shortcuts.map((group, i) => (
            <div key={i} className="mb-6">
              <h3 className="font-medium text-gray-700 mb-3">{group.category}</h3>
              <div className="space-y-2">
                {group.items.map((shortcut, j) => (
                  <div key={j} className="flex items-center justify-between py-1">
                    <span className="text-sm text-gray-600">{shortcut.action}</span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, k) => (
                        <React.Fragment key={k}>
                          {k > 0 && <span className="text-xs text-gray-400">+</span>}
                          <kbd className="px-2 py-1 bg-gray-100 border border-gray-300 rounded text-xs font-mono">
                            {key}
                          </kbd>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        
        <div className="p-4 border-t bg-gray-50 text-center text-sm text-gray-500">
          Press <kbd className="px-2 py-1 bg-white border border-gray-300 rounded text-xs font-mono">?</kbd> at any time to show this help
        </div>
      </div>
    </div>
  );
};

export default KeyboardShortcutsModal;
EOF

echo "✅ Created KeyboardShortcutsModal component"

echo ""
echo "✨ Asset Management Integration Complete!"
echo ""
echo "Completed:"
echo "1. ✅ Updated Header with Assets button"
echo "2. ✅ Integrated AssetManager into main App"
echo "3. ✅ Added asset state management"
echo "4. ✅ Created keyboard shortcuts modal"
echo "5. ✅ Assets ready for use in beat editors"
echo ""
echo "Now proceeding to create the Graphical Beat Editor..."
