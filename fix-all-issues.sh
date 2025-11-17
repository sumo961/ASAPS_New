#!/bin/bash

echo "🔧 Fixing all issues in ASPS Modern..."
echo ""
echo "Issues to fix:"
echo "1. Inspector cannot be collapsed"
echo "2. Settings changes not reflected in preview"
echo "3. Missing previews in all settings panels"
echo "4. Default settings mismatch"
echo "5. Story preview doesn't use settings"
echo ""

# Create the fixed files
echo "Creating fixed components..."

# 1. Fix App.tsx to support Inspector collapse
cat > packages/builder/src/App.tsx << 'EOF'
import { useState, useCallback, useEffect } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { Canvas } from './components/Canvas';
import { Inspector } from './components/Inspector';
import { StoryPreview } from './components/preview/StoryPreview';
import GlobalSettingsInspector from './components/settings/GlobalSettingsInspector';
import type { GlobalSettings } from './components/settings/GlobalSettingsInspector';
import { useStoryBuilder } from './hooks/useStoryBuilder';
import { useBeatClipboard } from './hooks/useBeatClipboard';
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
  const [inspectorExpanded, setInspectorExpanded] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false); // New state for full collapse
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [paletteCollapsed, setPaletteCollapsed] = useState(false);
  
  // Global settings state - initialized with DEFAULT_SETTINGS
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings>(DEFAULT_SETTINGS);

  // Initialize with a basic story on mount
  useEffect(() => {
    if (state.beats.length === 0) {
      initializeStory();
    }
  }, [state.beats.length, initializeStory]);

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
      
      console.log('Story exported successfully');
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export story. See console for details.');
    }
  }, [actions, state.title]);

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
            />
          )}
        </div>
      </div>

      {/* Preview Modal - now receives settings */}
      {showPreview && (
        <StoryPreview 
          story={getStoryForPreview()}
          settings={globalSettings}
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
    </div>
  );
}

export default App;
EOF

echo "✅ Fixed App.tsx with Inspector collapse and settings integration"

# Now let's check and update the GlobalSettingsInspector
echo ""
echo "Checking GlobalSettingsInspector for preview issues..."
