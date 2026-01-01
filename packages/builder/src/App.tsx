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
import { ImportAsmlDialog } from './components/ImportAsmlDialog';
import { Story, ASMLParser, type AssetManifest } from '@asaps/core';
import type { Beat, Cluster, ContainerBeatPosition } from '@asaps/core';
import { useSave, useProject, usePersistence } from './contexts/PersistenceContext';
import { Character } from './types/character';
import type { Asset } from './components/assets/AssetManager';
import type { GlobalSettings } from './components/settings/GlobalSettingsInspector';
import { loadProjectData } from './utils/projectDeserializer';
import { downloadProjectAsZip, importProjectFromZip } from './utils/projectZipManager';
import { SaveUnsavedWorkDialog } from './components/SaveUnsavedWorkDialog';
import { SaveProjectDialog } from './components/SaveProjectDialog';
import { getStorageAdapter } from './storage/HybridStorageAdapter';
import { assetToStored, extractBlobFromAsset } from './storage/AssetStorageAdapter';
import { DebugPanel } from './components/debug/DebugPanel';
import { applyTreeLayoutToBeats, applyClusterAwareTreeLayout, ClusterAwareLayoutResult } from './utils/TreeLayoutAlgorithm';
import { validateAIStory, formatValidationResult } from './utils/aiStoryValidator';
import { preloadFonts } from './utils/fontRegistry';
import { useAIDebug } from './hooks/useAIDebug';
import { AIDebugModal } from './components/ai/AIDebugModal';
import { getThemeService } from './services/ThemeService';
import { themeToGlobalSettings } from './themes/migration/GlobalSettingsAdapter';
import { BUILT_IN_THEMES } from '@asaps/core';

// Refs to hold current state for sync operations (avoids stale closures)
// These are updated on every render and provide immediate access to current values

function App() {
  const { state, actions, initializeStory } = useStoryBuilder();
  const [selectedBeat, setSelectedBeat] = useState<Beat | null>(null);
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
  const [highlightedBeatIds, setHighlightedBeatIds] = useState<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  // AI Debug hook - automatically runs after AI story generation
  const {
    result: aiDebugResult,
    showModal: showAIDebugModal,
    runDebug: runAIDebug,
    closeModal: closeAIDebugModal,
  } = useAIDebug({ checkUI: true, checkConsole: true, delay: 1500 });

  // Import ASML dialog state
  const [showImportAsmlDialog, setShowImportAsmlDialog] = useState(false);
  const [importAsmlContent, setImportAsmlContent] = useState('');
  const [importAsmlManifest, setImportAsmlManifest] = useState<AssetManifest | null>(null);

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
  useEffect(() => {
    (window as any).loadDebugStory = async (url = '/debug-story.json') => {
      try {
        console.log('[Debug] Fetching debug story from:', url);
        const response = await fetch(url);
        const debugData = await response.json();

        console.log('[Debug] Loaded debug file:', {
          title: debugData.title,
          beatCount: debugData.beatCount,
          status: debugData.status
        });

        if (!debugData.story?.beats) {
          console.error('[Debug] No beats found in debug file');
          return;
        }

        // Create beats using the registry
        const { BeatTypeRegistry } = await import('@asaps/core');
        const registry = BeatTypeRegistry.getInstance();

        const createdBeats = debugData.story.beats.map((beatData: any) => {
          const beat = registry.createBeat(beatData.type, {
            ...beatData,
            parameters: beatData.parameters || {}
          });
          // Set position
          if (beatData.position) {
            beat.x = beatData.position.x;
            beat.y = beatData.position.y;
          }
          return beat;
        });

        console.log('[Debug] Created', createdBeats.length, 'beats');

        // Load into the app
        actions.loadStoryData({
          title: debugData.story.metadata?.title || debugData.title || 'Debug Story',
          author: debugData.story.metadata?.author || 'Debug',
          beats: createdBeats,
          connections: [],
          settings: {},
          characters: [],
          clusters: []
        });

        console.log('[Debug] Story loaded successfully!');
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
  }, [actions]);

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
      animation: 'typewriter',  // Visual Novel style typewriter effect
      typewriterSpeed: 15,      // Characters per second (slower for visible effect)
      fadeInDuration: 200
    },
    hotspots: {
      visible: true,
      labels: true,
      highlightColor: '#ffff00',
      opacity: 30,
      showInPreview: 'visible'
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

    console.log('[App] storyData being passed to updateStory:', {
      beatsCount: storyData.beats.length,
      beatIds: storyData.beats.map((b: any) => b.id)
    });

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
      const adjustedPositions = story.beats && Array.isArray(story.beats)
        ? applyTreeLayoutToBeats(story.beats, undefined, externalConnections)
        : new Map();

      // Create all beats without adding to state (batch preparation)
      const createdBeats: Beat[] = [];
      // Known beat types for validation (including AI variations that map to canonical types)
      const knownBeatTypes = new Set([
        'titleScreen', 'introText', 'dialogTree', 'conversationChoice', 'movementChoice',
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
          const beatType = beatData.type || 'introText';
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
            let params = { ...beatData.parameters };

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
          // Single connection (introText, titleScreen, etc.)
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
    // Unique ID for this WebSocket connection instance (for debugging duplicates)
    const wsInstanceId = `ws_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    // Flag to prevent reconnection after cleanup (important for HMR)
    let isCleanedUp = false;
    // Track if we've logged connection failure (to reduce spam)
    let hasLoggedFailure = false;
    let connectionAttempts = 0;

    // Connect to WebSocket server
    const connectWebSocket = () => {
      // Don't reconnect if we've been cleaned up (HMR or unmount)
      if (isCleanedUp) {
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
          // Only reconnect if we haven't been cleaned up, with longer interval
          if (!isCleanedUp) {
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
        // Only retry if we haven't been cleaned up
        if (!isCleanedUp) {
          setTimeout(connectWebSocket, 10000);
        }
      }
    };

    connectWebSocket();

    return () => {
      isCleanedUp = true;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []); // Only run once on mount

  // Track loaded project to avoid re-loading the same project
  const loadedProjectIdRef = useRef<string | null>(null);
  // Track if we've already initialized to prevent React Strict Mode double-init
  const hasInitializedRef = useRef<boolean>(false);
  // CRITICAL: Track when we're transitioning to a new project after save
  // This prevents the load effect from trying to reload the old project
  // during the async window between saveCurrentProject completing and
  // React propagating the new currentProject value
  const pendingNewProjectIdRef = useRef<string | null>(null);

  // Initialize with a basic story and create untitled project on mount
  useEffect(() => {
    const initializeApp = async () => {
      // CRITICAL: Prevent double initialization from React Strict Mode
      if (hasInitializedRef.current) {
        console.log('[App] Skipping init - already initialized');
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
        console.log('[App] No projects exist and no beats - initializing from scratch');

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
    console.log('[App] pendingNewProjectIdRef:', pendingNewProjectIdRef.current);
    console.log('[App] injectionSaveInProgressRef:', injectionSaveInProgressRef.current);
    console.log('[App] state.beats.length:', state.beats.length);
    console.log('[App] currentProject.name:', currentProject?.name);

    // CRITICAL FIX: Skip if injection is in progress to prevent bleed from old project
    // The injection handler manages its own save lifecycle
    if (injectionSaveInProgressRef.current) {
      console.log('[App] >>> SKIPPED loading - injection in progress (prevents project bleed)');
      console.log('[App] ==========================================');
      return;
    }

    // CRITICAL FIX: Only proceed if currentProject exists and isn't already loaded
    if (!currentProject || currentProject.id === loadedProjectIdRef.current) {
      console.log('[App] >>> SKIPPED loading - no project or already loaded');
      console.log('[App] ==========================================');
      return;
    }

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
      console.log('[App] current state.beats.length:', state.beats.length);

      if (isSwitchingFromAnotherProject) {
        // SWITCHING PROJECTS: Always load the new project's data
        console.log('[App] >>> SWITCHING to different project - loading its data');
        const projectData = loadProjectData(currentProject);
        console.log('[App] >>> Loaded data:', {
          title: projectData.title,
          beats: projectData.beats.length,
          connections: projectData.connections?.length || 0,
          characters: projectData.characters?.length || 0,
          clusters: projectData.clusters?.length || 0,
          containerBeatPositions: projectData.containerBeatPositions?.length || 0
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
          clusters: projectData.clusters,
          containerBeatPositions: projectData.containerBeatPositions || []
        });

        setCharacters(projectData.characters || []);
        if (projectData.settings) {
          actions.updateSettings(projectData.settings);
        }

        // Load assets from storage using HybridStorageAdapter
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
            console.error('[App] >>> Error loading assets:', err);
          }
        };
        loadAssets();

        // Restore global settings from project (if saved)
        if (currentProject.globalSettings) {
          console.log('[App] >>> Restoring globalSettings from project');
          setGlobalSettings(currentProject.globalSettings);
        }

        setIsUntitledProject(currentProject.name === 'Untitled Project');
        loadedProjectIdRef.current = currentProject.id;
        console.log('[App] >>> Project switch complete');
      } else if (isNewUntitledProject && state.beats.length > 0) {
        // New untitled project AND beats have been created - save current story state to it
        // This only happens when creating a NEW project in this session, not when switching
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
          clusters: projectData.clusters?.length || 0,
          containerBeatPositions: projectData.containerBeatPositions?.length || 0
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
          clusters: projectData.clusters,
          containerBeatPositions: projectData.containerBeatPositions || []
        });

        setCharacters(projectData.characters || []);
        if (projectData.settings) {
          actions.updateSettings(projectData.settings);
        }

        // Load assets from storage using HybridStorageAdapter
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

            // CRITICAL: Reconstruct character image URLs from asset IDs
            // Characters were saved with asset IDs, but blob URLs are invalid after reload
            console.log('[App] >>> Checking character URL reconstruction...');
            console.log('[App] >>> projectData.characters:', projectData.characters?.length || 0);
            console.log('[App] >>> uiAssets:', uiAssets.length);
            if (projectData.characters && projectData.characters.length > 0) {
              const assetUrlMap = new Map(uiAssets.map(a => [a.id, a.url]));
              console.log('[App] >>> Asset URL map size:', assetUrlMap.size);
              const updatedCharacters = projectData.characters.map((char: any) => {
                // Update default image
                const defaultAssetId = char.visual?.defaultAssetId;
                const defaultUrl = defaultAssetId ? assetUrlMap.get(defaultAssetId) : null;
                console.log(`[App] >>> Character "${char.displayName}": defaultAssetId=${defaultAssetId}, resolved=${!!defaultUrl}`);

                // Update state images
                const updatedStates = (char.states || []).map((state: any) => {
                  const stateAssetId = state.visual?.assetId;
                  const stateUrl = stateAssetId ? assetUrlMap.get(stateAssetId) : null;
                  console.log(`[App] >>>   State "${state.id}": assetId=${stateAssetId}, resolved=${!!stateUrl}`);
                  return {
                    ...state,
                    visual: {
                      ...state.visual,
                      image: stateUrl || state.visual?.image // Use reconstructed URL or keep existing
                    }
                  };
                });

                return {
                  ...char,
                  visual: {
                    ...char.visual,
                    defaultImage: defaultUrl || char.visual?.defaultImage
                  },
                  states: updatedStates
                };
              });

              setCharacters(updatedCharacters);
              console.log('[App] >>> Character URLs reconstructed from assets');
            }
          } catch (err) {
            console.error('[App] >>> Error loading assets:', err);
          }
        };
        loadAssets();

        // Restore global settings from project (if saved)
        if (currentProject.globalSettings) {
          console.log('[App] >>> Restoring globalSettings from project');
          setGlobalSettings(currentProject.globalSettings);
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
      const PADDING = 20;
      const MAX_ITERATIONS = 30;

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
      });

      // Check overlap between two elements
      const overlaps = (a: Element, b: Element): boolean => {
        return !(a.x + a.width + PADDING < b.x ||
                 b.x + b.width + PADDING < a.x ||
                 a.y + a.height + PADDING < b.y ||
                 b.y + b.height + PADDING < a.y);
      };

      // Iteratively resolve overlaps
      for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
        let hadOverlap = false;

        for (let i = 0; i < elements.length; i++) {
          for (let j = i + 1; j < elements.length; j++) {
            const a = elements[i];
            const b = elements[j];

            if (overlaps(a, b)) {
              hadOverlap = true;

              // Calculate centers
              const aCenterX = a.x + a.width / 2;
              const aCenterY = a.y + a.height / 2;
              const bCenterX = b.x + b.width / 2;
              const bCenterY = b.y + b.height / 2;

              // Calculate overlap amounts
              const overlapX = (a.width + b.width) / 2 + PADDING - Math.abs(aCenterX - bCenterX);
              const overlapY = (a.height + b.height) / 2 + PADDING - Math.abs(aCenterY - bCenterY);

              // Push apart in direction of least overlap
              if (overlapX < overlapY) {
                const shift = overlapX / 2 + 1;
                if (aCenterX < bCenterX) {
                  a.x -= shift;
                  b.x += shift;
                } else {
                  a.x += shift;
                  b.x -= shift;
                }
              } else {
                const shift = overlapY / 2 + 1;
                if (aCenterY < bCenterY) {
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

        if (!hadOverlap) break;
      }

      // Extract resolved positions
      const resolvedBeats = new Map<string, { x: number; y: number }>();
      const resolvedClusters = new Map<string, { x: number; y: number }>();

      elements.forEach(el => {
        if (el.isCluster) {
          resolvedClusters.set(el.id, { x: el.x, y: el.y });
        } else {
          resolvedBeats.set(el.id, { x: el.x, y: el.y });
        }
      });

      return { resolvedBeats, resolvedClusters };
    };

    // Helper to resolve collisions between beats inside a cluster
    const resolveInternalBeatCollisions = (
      beatPositions: Map<string, { x: number; y: number }>
    ): Map<string, { x: number; y: number }> => {
      const BEAT_WIDTH = 160;
      const BEAT_HEIGHT = 80;
      const PADDING = 20;
      const MAX_ITERATIONS = 30;

      // Convert to array for easier manipulation
      const beats = Array.from(beatPositions.entries()).map(([id, pos]) => ({
        id,
        x: pos.x,
        y: pos.y,
        width: BEAT_WIDTH,
        height: BEAT_HEIGHT,
      }));

      if (beats.length <= 1) {
        return beatPositions;
      }

      // Check overlap between two beats
      const overlaps = (a: typeof beats[0], b: typeof beats[0]): boolean => {
        return !(a.x + a.width + PADDING < b.x ||
                 b.x + b.width + PADDING < a.x ||
                 a.y + a.height + PADDING < b.y ||
                 b.y + b.height + PADDING < a.y);
      };

      // Iteratively resolve overlaps
      for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
        let hadOverlap = false;

        for (let i = 0; i < beats.length; i++) {
          for (let j = i + 1; j < beats.length; j++) {
            const a = beats[i];
            const b = beats[j];

            if (overlaps(a, b)) {
              hadOverlap = true;

              // Calculate centers
              const aCenterX = a.x + a.width / 2;
              const aCenterY = a.y + a.height / 2;
              const bCenterX = b.x + b.width / 2;
              const bCenterY = b.y + b.height / 2;

              // Calculate overlap amounts
              const overlapX = (a.width + b.width) / 2 + PADDING - Math.abs(aCenterX - bCenterX);
              const overlapY = (a.height + b.height) / 2 + PADDING - Math.abs(aCenterY - bCenterY);

              // Push apart in direction of least overlap
              if (overlapX < overlapY) {
                const shift = overlapX / 2 + 1;
                if (aCenterX < bCenterX) {
                  a.x -= shift;
                  b.x += shift;
                } else {
                  a.x += shift;
                  b.x -= shift;
                }
              } else {
                const shift = overlapY / 2 + 1;
                if (aCenterY < bCenterY) {
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

        if (!hadOverlap) break;
      }

      // Ensure minimum x/y values (keep beats inside cluster)
      const MIN_X = 20;
      const MIN_Y = 20;
      beats.forEach(beat => {
        beat.x = Math.max(MIN_X, beat.x);
        beat.y = Math.max(MIN_Y, beat.y);
      });

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

      // Calculate expanded cluster sizes from internal beat positions
      // This ensures clusters are large enough to show all their beats
      const BEAT_WIDTH = 160;
      const BEAT_HEIGHT = 80; // Must match NODE_HEIGHT in ClusterContainerNode.tsx
      const CLUSTER_PADDING = 40; // Padding around beats inside cluster

      const clusterSizes = new Map<string, { width: number; height: number }>();
      clusters.forEach(c => {
        const internalPositions = result.clusterInternalPositions.get(c.id);
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
          const width = Math.max(300, maxX + CLUSTER_PADDING);
          const height = Math.max(200, maxY + CLUSTER_PADDING);
          clusterSizes.set(c.id, { width, height });
        } else {
          // Fallback to stored bounds or default
          clusterSizes.set(c.id, c.containerBounds || { width: 300, height: 200 });
        }
      });

      // Resolve any overlaps between beats and clusters
      const { resolvedBeats, resolvedClusters } = resolveCollisions(
        result.beatPositions,
        result.clusterPositions,
        clusterSizes
      );

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

      // Apply positions to beats inside clusters with collision detection
      result.clusterInternalPositions.forEach((internalPositions, clusterId) => {
        // Resolve collisions for beats within this cluster
        const resolvedInternalPositions = resolveInternalBeatCollisions(internalPositions);

        resolvedInternalPositions.forEach((pos, beatId) => {
          if (actions.moveBeatInContainer) {
            actions.moveBeatInContainer(beatId, clusterId, pos.x, pos.y);
          }
        });
      });
    } else {
      // No clusters - use standard layout
      const newPositions = applyTreeLayoutToBeats(beatsForLayout, undefined, externalEdges);

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
          await actions.importStory(text);
          setSelectedBeat(null);
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
  }, [actions]);

  /**
   * Handle import dialog completion (with or without assets)
   */
  const handleImportAsmlComplete = useCallback(async (result: {
    fileMap: Map<string, File>;
    filesFound: number;
    filesMissing: number;
  }) => {
    setShowImportAsmlDialog(false);

    try {
      const projectId = currentProject?.id || 'temp-project';

      // Import with or without assets
      const importResult = await actions.importStory(importAsmlContent, {
        fileMap: result.fileMap,
        addAsset: async (asset: Asset, blob: Blob) => {
          try {
            // Convert to stored format and persist using HybridStorageAdapter
            const storedAsset = await assetToStored(asset, projectId, blob);
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
        projectId
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
  }, [actions, importAsmlContent, currentProject?.id]);

  /**
   * Handle import dialog cancellation
   */
  const handleImportAsmlCancel = useCallback(() => {
    setShowImportAsmlDialog(false);
    setImportAsmlContent('');
    setImportAsmlManifest(null);
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

      try {
        const result = await importProjectFromZip(file, {
          generateNewId: false // Keep original IDs for simpler import
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

  /**
   * Check if the current project is a "default empty" project
   * (has only the 3 default beats with default IDs created by initializeStory)
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
    const defaultBeatTypes = ['endScreen', 'introText', 'titleScreen'];

    return JSON.stringify(beatTypes) === JSON.stringify(defaultBeatTypes);
  }, [isUntitledProject, state.beats]);

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
    const adjustedPositions = story.beats && Array.isArray(story.beats)
      ? applyTreeLayoutToBeats(story.beats, undefined, externalConnections)
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

        // Trigger AI debug analysis after save completes
        runAIDebug(beatsRef.current, connectionsRef.current);
      } catch (error) {
        console.error('[App] Failed to auto-save generated story:', error);
      }
    }, 300);
  }, [actions, markChanged, saveCurrent, syncProjectData, runAIDebug, globalSettings, setGlobalSettings]);

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
        onExportAsmlWithAssets={handleExportAsmlWithAssets}
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
        currentProjectId={currentProject?.id}
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
            const clusterName = prompt('Enter cluster name:', `Cluster ${(state.clusters?.length || 0) + 1}`);
            if (!clusterName) return; // User cancelled

            const newCluster = {
              id: `cluster_${Date.now()}`,
              name: clusterName.trim(),
              type: 'spatial' as const, // All clusters are spatial by default
              containerPosition: { x: 100, y: 100 },
              containerBounds: { width: 400, height: 300 },
              isExpanded: true,
            };
            actions.addCluster(newCluster);
            markChanged();
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
            beats={state.beats}
            connections={state.connections}
            clusters={state.clusters || []}
            containerBeatPositions={state.containerBeatPositions || []}
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
            onBeatDuplicate={handleBeatDuplicate}
            onBeatDelete={handleBeatDelete}
            onBeatCopy={handleBeatCopy}
            onBeatPaste={handleBeatPaste}
            hasBeatClipboard={beatClipboard !== null}
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

      {/* Preview Modal */}
      {showPreview && (
        <StoryPreview
          story={getStoryForPreview()}
          assets={assets}
          characters={characters}
          settings={globalSettings}
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

      {/* Settings Modal */}
      {showSettings && (
        <GlobalSettingsInspector
          settings={globalSettings}
          onUpdate={(newSettings) => setGlobalSettings(newSettings)}
          onClose={handleCloseSettings}
          assets={assets}
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

      {/* AI Debug Modal */}
      <AIDebugModal
        isOpen={showAIDebugModal}
        onClose={closeAIDebugModal}
        result={aiDebugResult}
      />
    </div>
  );
}

export default App;
