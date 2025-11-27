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
import { SaveProjectDialog } from './components/SaveProjectDialog';
import { DebugPanel } from './components/debug/DebugPanel';

// Constants for beat node dimensions (used for overlap detection)
const BEAT_NODE_WIDTH = 250;
const BEAT_NODE_HEIGHT = 80;
const BEAT_PADDING = 30; // Minimum spacing between beats

// Refs to hold current state for sync operations (avoids stale closures)
// These are updated on every render and provide immediate access to current values

/**
 * Resolve overlapping beat positions by pushing them apart
 */
function resolveOverlappingPositions(
  beats: Array<{ id: string; position?: { x: number; y: number } }>
): Map<string, { x: number; y: number }> {
  const adjustedPositions = new Map<string, { x: number; y: number }>();

  // Initialize with original positions
  beats.forEach(beat => {
    const pos = beat.position || { x: 200, y: 200 };
    adjustedPositions.set(beat.id, { x: pos.x, y: pos.y });
  });

  // Check for overlaps and resolve them
  const maxIterations = 50; // Prevent infinite loops
  let hasOverlaps = true;
  let iteration = 0;

  while (hasOverlaps && iteration < maxIterations) {
    hasOverlaps = false;
    iteration++;

    const beatIds = Array.from(adjustedPositions.keys());

    for (let i = 0; i < beatIds.length; i++) {
      for (let j = i + 1; j < beatIds.length; j++) {
        const pos1 = adjustedPositions.get(beatIds[i])!;
        const pos2 = adjustedPositions.get(beatIds[j])!;

        // Check if beats overlap (considering node dimensions)
        const dx = Math.abs(pos1.x - pos2.x);
        const dy = Math.abs(pos1.y - pos2.y);
        const minDx = BEAT_NODE_WIDTH + BEAT_PADDING;
        const minDy = BEAT_NODE_HEIGHT + BEAT_PADDING;

        if (dx < minDx && dy < minDy) {
          hasOverlaps = true;

          // Push beats apart - move the second beat
          if (dx <= dy) {
            // Push horizontally
            const pushX = (minDx - dx) / 2 + 10;
            if (pos1.x <= pos2.x) {
              pos2.x += pushX;
            } else {
              pos2.x -= pushX;
            }
          } else {
            // Push vertically
            const pushY = (minDy - dy) / 2 + 10;
            if (pos1.y <= pos2.y) {
              pos2.y += pushY;
            } else {
              pos2.y -= pushY;
            }
          }

          adjustedPositions.set(beatIds[j], pos2);
        }
      }
    }
  }

  if (iteration >= maxIterations) {
    console.warn('[App] Overlap resolution reached max iterations');
  }

  return adjustedPositions;
}

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
  const [showSaveProjectDialog, setShowSaveProjectDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<string>('');
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [highlightedBeatIds, setHighlightedBeatIds] = useState<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  // Asset and character state
  const [assets, setAssets] = useState<Asset[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);

  // CRITICAL: Refs to hold current state values for sync operations
  // These avoid stale closures when syncProjectData is called inside setTimeout
  const beatsRef = useRef<Beat[]>(state.beats);
  const connectionsRef = useRef(state.connections);
  const titleRef = useRef(state.title);
  const authorRef = useRef(state.author);
  const charactersRef = useRef<Character[]>(characters);

  // Update refs on every render to ensure they always have current values
  useEffect(() => {
    beatsRef.current = state.beats;
    connectionsRef.current = state.connections;
    titleRef.current = state.title;
    authorRef.current = state.author;
  }, [state.beats, state.connections, state.title, state.author]);

  useEffect(() => {
    charactersRef.current = characters;
  }, [characters]);

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
  const { updateStory, project: currentProject, load: loadProject, create: createProject, saveCurrent, updateMetadata } = useProject();
  const { isUntitledProject, setIsUntitledProject, hasUnsavedChanges, storage, registerSyncCallback, unregisterSyncCallback } = usePersistence();

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
    };

    console.log('[App] storyData being passed to updateStory:', {
      beatsCount: storyData.beats.length,
      beatIds: storyData.beats.map((b: any) => b.id)
    });

    updateStory(storyData);
    console.log('[App] syncProjectData - updateStory called successfully');
  }, [currentProject, updateStory]);

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
   * WebSocket connection to API server for external story injection
   * This enables Claude Desktop MCP and other external tools to push stories directly
   */
  const handleStoryGeneratedRef = useRef<((story: any) => void) | null>(null);
  const injectionSaveInProgressRef = useRef<boolean>(false);
  const currentInjectionIdRef = useRef<string | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Store the latest handleStoryGenerated callback in a ref to avoid stale closures
    handleStoryGeneratedRef.current = async (story: any) => {
      // Generate unique injection ID for this story
      const injectionId = `injection_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Cancel any previous pending save operations
      if (saveTimeoutRef.current) {
        console.log('[App] Cancelling previous save timeout');
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }

      // Prevent duplicate calls - but allow if this is a new injection
      if (injectionSaveInProgressRef.current && currentInjectionIdRef.current === injectionId) {
        console.log('[App] Story injection already in progress for same ID, skipping duplicate');
        return;
      }

      // Set current injection as active
      injectionSaveInProgressRef.current = true;
      currentInjectionIdRef.current = injectionId;

      const storyTitle = story.metadata?.title || 'Injected Story';
      console.log('[App] Received story via WebSocket:', storyTitle, 'injectionId:', injectionId);

      // Clear existing beats and connections
      actions.clearStory();

      // Add metadata
      if (story.metadata) {
        actions.setTitle(storyTitle);
        if (story.metadata.author) {
          // Note: author setting if available
        }
      }

      // Resolve overlapping positions before adding beats
      const adjustedPositions = story.beats && Array.isArray(story.beats)
        ? resolveOverlappingPositions(story.beats)
        : new Map();

      // Add all beats with adjusted positions
      if (story.beats && Array.isArray(story.beats)) {
        story.beats.forEach((beatData: any) => {
          const position = adjustedPositions.get(beatData.id) ||
            beatData.position ||
            { x: beatData.x || 200, y: beatData.y || 200 };

          const beat = actions.addBeat(
            beatData.type || 'introText',
            position,
            { id: beatData.id, name: beatData.name || beatData.label }
          );

          if (beatData.parameters) {
            let params = { ...beatData.parameters };

            // Transform conditionBeat nested format to flat format
            if (beatData.type === 'conditionBeat') {
              if (params.condition) {
                const cond = params.condition;
                params.conditionType = cond.type || params.conditionType;
                params.variableName = cond.variableName || cond.left || params.variableName;
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

            actions.updateBeat(beat.id, params);
          }
        });
      }

      // Process connections
      const connectionsToCreate: Array<{ source: string; target: string; label?: string }> = [];

      // Extract connections from beat parameters
      if (story.beats && Array.isArray(story.beats)) {
        story.beats.forEach((beatData: any) => {
          if (beatData.parameters?.connection?.target) {
            connectionsToCreate.push({
              source: beatData.id,
              target: beatData.parameters.connection.target,
            });
          }
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

      // Create connections after a short delay
      if (connectionsToCreate.length > 0) {
        setTimeout(() => {
          connectionsToCreate.forEach((conn) => {
            if (conn.source && conn.target) {
              try {
                actions.connectBeats(conn.source, conn.target, conn.label);
              } catch (error) {
                console.warn('[App] Failed to create connection:', conn, error);
              }
            }
          });
        }, 100);
      }

      // Handle characters if provided
      if (story.characters && Array.isArray(story.characters)) {
        setCharacters(story.characters);
      }

      markChanged();
      console.log('[App] Story injection complete:', {
        beats: story.beats?.length || 0,
        connections: connectionsToCreate.length,
        characters: story.characters?.length || 0,
        injectionId,
      });

      // Auto-save: Create a new project and save the injected story
      // Flow: 1) Wait for state 2) Sync to project 3) Wait 4) Save as new project
      // Store timeout ref so it can be cancelled if a new injection comes in
      saveTimeoutRef.current = setTimeout(async () => {
        // Check if this injection is still the active one
        if (currentInjectionIdRef.current !== injectionId) {
          console.log('[App] Injection ID mismatch, skipping save. Expected:', injectionId, 'Current:', currentInjectionIdRef.current);
          return;
        }

        try {
          const description = story.metadata?.description || 'Story created via Claude Desktop MCP';
          console.log('[App] Syncing injected story data to project...', 'injectionId:', injectionId);

          // Explicitly sync current beats to project before saving
          syncProjectData();

          // Wait for React state update
          await new Promise(resolve => setTimeout(resolve, 200));

          // Double-check we're still the active injection
          if (currentInjectionIdRef.current !== injectionId) {
            console.log('[App] Injection ID changed during wait, aborting save');
            return;
          }

          console.log('[App] Auto-saving injected story as new project:', storyTitle);
          await saveCurrent(storyTitle, description);
          console.log('[App] Injected story saved successfully');
        } catch (error) {
          console.error('[App] Failed to auto-save injected story:', error);
        } finally {
          // Reset flags only if this is still the active injection
          if (currentInjectionIdRef.current === injectionId) {
            injectionSaveInProgressRef.current = false;
            saveTimeoutRef.current = null;
          }
        }
      }, 300);
    };

    // Cleanup on effect re-run (HMR) - cancel any pending saves
    return () => {
      if (saveTimeoutRef.current) {
        console.log('[App] Cleanup: cancelling pending save timeout');
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, [actions, markChanged, saveCurrent, syncProjectData]);

  useEffect(() => {
    // Connect to WebSocket server
    const connectWebSocket = () => {
      const wsUrl = 'ws://localhost:3001';
      console.log('[App] Connecting to WebSocket server:', wsUrl);

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('[App] WebSocket connected to API server');
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            console.log('[App] WebSocket message received:', message.event);

            if (message.event === 'story:inject' && message.data) {
              // Use the ref to call the latest callback
              if (handleStoryGeneratedRef.current) {
                handleStoryGeneratedRef.current(message.data);
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
          console.log('[App] WebSocket disconnected, will reconnect...');
          wsRef.current = null;
          // Reconnect after a delay
          setTimeout(connectWebSocket, 3000);
        };

        ws.onerror = (error) => {
          console.error('[App] WebSocket error:', error);
        };
      } catch (error) {
        console.error('[App] Failed to create WebSocket connection:', error);
        // Retry after a delay
        setTimeout(connectWebSocket, 3000);
      }
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []); // Only run once on mount

  // Track loaded project to avoid re-loading the same project
  const loadedProjectIdRef = useRef<string | null>(null);

  // Initialize with a basic story and create untitled project on mount
  useEffect(() => {
    const initializeApp = async () => {
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
        console.log('[App] No projects exist and no beats - initializing from scratch');

        // Initialize the story first (creates the 3-beat base story)
        // This is async - beats will appear in state shortly
        initializeStory();
        console.log('[App] AFTER initializeStory called - beats will appear soon via React state update');

        // CRITICAL: Mark as changed so hasUnsavedChanges becomes true
        console.log('[App] Marking as changed to trigger save button');
        markChanged();

        // Create untitled project - the loading effect will handle saving beats when they appear
        try {
          console.log('[App] Creating untitled project (beats will be saved by loading effect)');
          await createProject('Untitled Project', 'Auto-saved untitled work');
          console.log('[App] SUCCESS: Created untitled project');
        } catch (error) {
          console.error('[App] FAILED to create untitled project:', error);
        }
      } else {
        console.log('[App] SKIPPING initialization - hasAnyProjects:', hasAnyProjects, 'beats.length:', state.beats.length);
      }
    };

    initializeApp();
  }, [currentProject, state.beats.length]);

  // Load project data when currentProject changes
  useEffect(() => {
    console.log('[App] ==========================================');
    console.log('[App] Project LOAD EFFECT started');
    console.log('[App] currentProject.id:', currentProject?.id);
    console.log('[App] loadedProjectIdRef:', loadedProjectIdRef.current);
    console.log('[App] state.beats.length:', state.beats.length);
    console.log('[App] currentProject.name:', currentProject?.name);

    // CRITICAL FIX: Only proceed if currentProject exists and isn't already loaded
    if (!currentProject || currentProject.id === loadedProjectIdRef.current) {
      console.log('[App] >>> SKIPPED loading - no project or already loaded');
      console.log('[App] ==========================================');
      return;
    }

    console.log('[App] >>> WILL LOAD project:', currentProject.id);

    try {
      // Check if this is a newly created untitled project (will have no beats)
      // CRITICAL FIX: Check if the project story actually has beats array with data
      const projectStory = currentProject.story as any;
      const beatsExist = projectStory?.beats && Array.isArray(projectStory.beats) && projectStory.beats.length > 0;
      const isNewUntitledProject = currentProject.name === 'Untitled Project' && !beatsExist;

      console.log('[App] projectStory:', !!projectStory);
      console.log('[App] beatsExist:', beatsExist, 'beats.length:', projectStory?.beats?.length);
      console.log('[App] isNewUntitledProject:', isNewUntitledProject);
      console.log('[App] current state.beats.length:', state.beats.length);

      if (isNewUntitledProject && state.beats.length > 0) {
        // New untitled project AND beats have been created - save current story state to it
        console.log('[App] >>> SAVING beats to NEW untitled project');

        const storyData = {
          title: state.title,
          author: state.author,
          beats: state.beats,
          characters: characters,
          connections: state.connections,
        };

        console.log('[App] Story data to save:', {
          title: storyData.title,
          beats: storyData.beats.length,
          characters: storyData.characters.length,
          connections: storyData.connections.length
        });

        updateMetadata({ name: 'Untitled Project', description: 'Auto-saved untitled work' });
        updateStory(storyData);
        loadedProjectIdRef.current = currentProject.id;
        setIsUntitledProject(true);

        console.log('[App] >>> SUCCESS: Saved beats to new untitled project');
        console.log('[App] >>> isUntitledProject set to:', true);
      } else if (isNewUntitledProject && state.beats.length === 0) {
        console.log('[App] >>> New untitled project but no beats yet, waiting...');
        // Don't mark as loaded yet - wait for beats to appear
      } else if (!isNewUntitledProject) {
        // This is an existing saved project - load its data
        console.log('[App] >>> REPLACING state with loaded project data');
        const projectData = loadProjectData(currentProject);
        console.log('[App] >>> Loaded data:', {
          title: projectData.title,
          beats: projectData.beats.length,
          connections: projectData.connections?.length || 0,
          characters: projectData.characters?.length || 0,
          clusters: projectData.clusters?.length || 0
        });

        actions.loadStoryData({
          title: projectData.title,
          author: projectData.author,
          beats: projectData.beats,
          connections: projectData.connections || [],
          story: currentProject.story,
          settings: projectData.settings,
          environment: projectData.environment,
          characters: projectData.characters,
          clusters: projectData.clusters
        });

        setCharacters(projectData.characters || []);
        if (projectData.settings) {
          actions.updateSettings(projectData.settings);
        }

        setIsUntitledProject(false);
        loadedProjectIdRef.current = currentProject.id;
        console.log('[App] >>> isUntitledProject set to:', false);
      }
    } catch (error) {
      console.error('[App] >>> FAILED to load project:', error);
      alert('Failed to load project. See console for details.');
    }
    console.log('[App] >>> LOAD EFFECT completed');
    console.log('[App] ==========================================');
  }, [currentProject, actions, setIsUntitledProject, state.beats, state.title, state.author, state.connections, characters, updateMetadata, updateStory]);

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

  /**
   * Handle manual save - for untitled projects, this shows the Save Project dialog
   */
  const handleSave = useCallback(async () => {
    console.log('[App] handleSave called - isUntitledProject:', isUntitledProject, 'should open dialog:', isUntitledProject);
    if (isUntitledProject) {
      // For untitled projects, show the Save Project dialog
      console.log('[App] Opening SaveProjectDialog for untitled project');
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
  }, [isUntitledProject, saveNow]);

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
      await saveCurrent(name, description);
      alert('Project saved successfully!');
    } catch (error) {
      console.error('Failed to save project:', error);
      alert('Failed to save project. Please try again.');
    }
  }, [saveCurrent]);

  /**
   * Handle closing Save Project dialog
   */
  const handleCloseSaveProjectDialog = useCallback(() => {
    setShowSaveProjectDialog(false);
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

    // Clear existing beats and connections
    actions.clearStory();

    // Add metadata
    if (story.metadata) {
      actions.setTitle(storyTitle);
    }

    // Resolve overlapping positions before adding beats
    const adjustedPositions = story.beats && Array.isArray(story.beats)
      ? resolveOverlappingPositions(story.beats)
      : new Map();

    // Add all generated beats, preserving AI-generated IDs with adjusted positions
    if (story.beats && Array.isArray(story.beats)) {
      story.beats.forEach((beatData: any) => {
        // Use adjusted position if available, otherwise fall back to original
        const position = adjustedPositions.get(beatData.id) || beatData.position;

        // Pass the AI-generated ID and name directly to addBeat
        const beat = actions.addBeat(
          beatData.type || 'introText',
          position,
          { id: beatData.id, name: beatData.label || beatData.name }
        );

        // Update beat with generated parameters
        if (beatData.parameters) {
          let params = { ...beatData.parameters };

          // Transform conditionBeat nested format to flat format
          if (beatData.type === 'conditionBeat') {
            // Flatten nested condition object
            if (params.condition) {
              const cond = params.condition;
              params.conditionType = cond.type || params.conditionType;
              params.variableName = cond.variableName || cond.left || params.variableName;
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

          actions.updateBeat(beat.id, params);
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
        // Also check top-level connections array on the beat (fallback format)
        if (beatData.connections && Array.isArray(beatData.connections)) {
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

    // Auto-save: Create a new project and save the generated story
    // Flow: 1) Wait for state 2) Sync to project 3) Wait 4) Save as new project
    setTimeout(async () => {
      try {
        const description = story.metadata?.description || 'AI-generated interactive story';
        console.log('[App] Syncing generated story data to project...');

        // Explicitly sync current beats to project before saving
        syncProjectData();

        // Wait for React state update
        await new Promise(resolve => setTimeout(resolve, 200));

        console.log('[App] Auto-saving generated story as new project:', storyTitle);
        await saveCurrent(storyTitle, description);
        console.log('[App] Generated story saved successfully');
      } catch (error) {
        console.error('[App] Failed to auto-save generated story:', error);
      }
    }, 300);
  }, [actions, markChanged, saveCurrent, syncProjectData]);

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
            highlightedBeatIds={highlightedBeatIds}
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

      {/* Debug Panel */}
      {showDebugPanel && (
        <DebugPanel
          story={getStoryForPreview()}
          onClose={handleCloseDebugPanel}
          onHighlightBeat={handleHighlightBeat}
          onHighlightPath={handleHighlightPath}
        />
      )}

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
    </div>
  );
}

export default App;
