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
import { applyTreeLayoutToBeats } from './utils/TreeLayoutAlgorithm';
import { validateAIStory, formatValidationResult } from './utils/aiStoryValidator';

// Refs to hold current state for sync operations (avoids stale closures)
// These are updated on every render and provide immediate access to current values

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
  const { updateStory, project: currentProject, load: loadProject, create: createProject, saveCurrent, updateMetadata, discardUntitled } = useProject();
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
      const adjustedPositions = story.beats && Array.isArray(story.beats)
        ? applyTreeLayoutToBeats(story.beats)
        : new Map();

      // Create all beats without adding to state (batch preparation)
      const createdBeats: Beat[] = [];
      if (story.beats && Array.isArray(story.beats)) {
        story.beats.forEach((beatData: any) => {
          const position = adjustedPositions.get(beatData.id) ||
            beatData.position ||
            { x: beatData.x || 200, y: beatData.y || 200 };

          // Use createBeat (not addBeat) to avoid state updates
          const beat = actions.createBeat(
            beatData.type || 'introText',
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

    // Connect to WebSocket server
    const connectWebSocket = () => {
      // Don't reconnect if we've been cleaned up (HMR or unmount)
      if (isCleanedUp) {
        console.log(`[App] Skipping WebSocket reconnect - instance ${wsInstanceId} was cleaned up`);
        return;
      }

      const wsUrl = 'ws://localhost:3001';
      console.log(`[App] Connecting to WebSocket server: ${wsUrl} (instance: ${wsInstanceId})`);

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log(`[App] WebSocket connected to API server (instance: ${wsInstanceId})`);
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
          console.log(`[App] WebSocket disconnected (instance: ${wsInstanceId}), isCleanedUp: ${isCleanedUp}`);
          wsRef.current = null;
          // Only reconnect if we haven't been cleaned up
          if (!isCleanedUp) {
            setTimeout(connectWebSocket, 3000);
          }
        };

        ws.onerror = (error) => {
          console.error('[App] WebSocket error:', error);
        };
      } catch (error) {
        console.error('[App] Failed to create WebSocket connection:', error);
        // Only retry if we haven't been cleaned up
        if (!isCleanedUp) {
          setTimeout(connectWebSocket, 3000);
        }
      }
    };

    connectWebSocket();

    return () => {
      console.log(`[App] Cleaning up WebSocket instance ${wsInstanceId}`);
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

    // Apply tree layout to position beats based on their connections
    const adjustedPositions = story.beats && Array.isArray(story.beats)
      ? applyTreeLayoutToBeats(story.beats)
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
