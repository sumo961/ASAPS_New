import { useState, useCallback, useRef } from 'react';
import {
  Story,
  Beat,
  BeatTypeRegistry,
  TitleScreenBeat,
  InfoTextBeat,
  EndScreenBeat,
  DialogTreeBeat,
  ASMLProcessor,
  ASMLGenerator,
  ASMLParser,
  Cluster,
  ContainerBeatPosition,
  SharedVisualContent
} from '@asaps/core';
import type { DialogNode } from '@asaps/core';
import { applyTreeLayoutToBeats } from '../utils/TreeLayoutAlgorithm';
import {
  importAsmlAssets,
  linkAssetsToBeats,
  linkAssetsToSettings,
  createFileResolver,
  type AsmlAssetImportResult
} from '../utils/asmlAssetImporter';
import type { Asset } from '../components/assets/AssetManager';
import type { Character } from '../types/character';

interface StoryBuilderState {
  title: string;
  author: string;
  beats: Beat[];
  connections: any[];
  story: Story | null;
  // FIXED: Add storage for imported data
  settings: any;
  environment: any;
  characters: any[];
  clusters: Cluster[];
  containerBeatPositions: ContainerBeatPosition[];
}

interface StoryBuilderActions {
  setTitle: (title: string) => void;
  setAuthor: (author: string) => void;
  createBeat: (type: string, position?: { x: number; y: number }, options?: { id?: string; name?: string }) => Beat;
  addBeat: (type: string, position?: { x: number; y: number }, options?: { id?: string; name?: string }) => Beat;
  addExistingBeat: (beat: Beat) => void;
  updateBeat: (beatId: string, updates: Partial<Beat>) => void;
  deleteBeat: (beatId: string) => void;
  moveBeat: (beatId: string, position: { x: number; y: number }) => void;
  connectBeats: (sourceBeatId: string, targetBeatId: string, label?: string) => void;
  disconnectBeats: (sourceBeatId: string, targetBeatId: string) => void;
  expandCollapseCluster: (clusterId: string) => void;
  moveBeatToCluster: (beatId: string, clusterId: string) => void;
  moveBeatInContainer: (beatId: string, clusterId: string, x: number, y: number) => void;
  moveCluster: (clusterId: string, position: { x: number; y: number }) => void;
  resizeCluster: (clusterId: string, width: number, height: number) => void;
  addCluster: (cluster: Cluster) => void;
  removeCluster: (clusterId: string) => void;
  renameCluster: (clusterId: string, name: string) => void;
  setClusterMap: (clusterId: string, assetId: string | null, scale?: number, opacity?: number) => void;
  setClusterSound: (clusterId: string, soundAssetId: string | null, volume?: number) => void;
  setClusterSharedVisuals: (clusterId: string, sharedVisuals: SharedVisualContent | undefined) => void;
  exportStory: (assets?: any[], characters?: any[]) => string;
  importStory: (xmlContent: string, options?: ImportStoryOptions) => Promise<ImportStoryResult>;
  importBeats: (beats: Beat[], options?: { title?: string; author?: string; firstBeatId?: string }) => void;
  clearStory: () => void;
  updateSettings: (settings: any) => void;
  loadStoryData: (storyData: any) => void;
  mergeDialogTrees: (beatIds: string[]) => { success: boolean; mergedBeatId?: string; mergedBeat?: Beat; error?: string };
}

/**
 * Options for importing a story with assets
 */
export interface ImportStoryOptions {
  /** File map from folder picker (filename -> File) */
  fileMap?: Map<string, File>;
  /** Function to add an asset to storage (receives both Asset metadata and the blob for persistence) */
  addAsset?: (asset: Asset, blob: Blob) => Promise<boolean>;
  /** Current project ID for asset association */
  projectId?: string;
}

/**
 * Result of story import including imported characters
 */
export interface ImportStoryResult {
  /** Whether import was successful */
  success: boolean;
  /** Imported story title */
  title: string;
  /** Imported characters (need to be added to character manager) */
  characters: Character[];
  /** Asset import stats */
  assetStats?: {
    backgroundsImported: number;
    propsImported: number;
    soundsImported: number;
    charactersCreated: number;
    characterImagesImported: number;
    totalFilesImported: number;
    totalFilesMissing: number;
  };
  /** Any errors during import */
  errors: string[];
  /** Imported settings (for immediate use since setState is async) */
  settings?: any;
}

export function useStoryBuilder() {
  const beatRegistry = useRef(BeatTypeRegistry.getInstance());
  const beatCounter = useRef(0);
  
  const [state, setState] = useState<StoryBuilderState>({
    title: 'My Interactive Story',
    author: 'Story Author',
    beats: [],
    connections: [],
    story: null,
    // FIXED: Initialize data storage
    settings: {},
    environment: { props: [], nodes: [] },
    characters: [],
    clusters: [],
    containerBeatPositions: [],
  });

  // Generate unique beat ID
  const generateBeatId = useCallback(() => {
    return `beat_${beatCounter.current++}`;
  }, []);

  // Set story title
  const setTitle = useCallback((title: string) => {
    setState(prev => ({ ...prev, title }));
  }, []);

  // Set story author
  const setAuthor = useCallback((author: string) => {
    setState(prev => ({ ...prev, author }));
  }, []);

  // Create a new beat instance without adding it to state
  // Used by the command system to avoid double-adding
  const createBeat = useCallback((
    type: string,
    position?: { x: number; y: number },
    options?: { id?: string; name?: string }
  ): Beat => {
    const id = options?.id || generateBeatId();
    const name = options?.name || `${type.charAt(0).toUpperCase() + type.slice(1)} ${id}`;

    const beatConfig = {
      id,
      name,
      x: position?.x || 200,
      y: position?.y || 200,
      type,
    };

    console.log('[useStoryBuilder] Creating beat with config:', {
      id,
      name,
      position: { x: beatConfig.x, y: beatConfig.y },
      type
    });

    const newBeat = beatRegistry.current.createBeat(type, beatConfig);

    console.log('[useStoryBuilder] Created beat with positions:', {
      id: newBeat.id,
      name: newBeat.name,
      x: newBeat.x,
      y: newBeat.y,
      type: newBeat.type
    });

    return newBeat;
  }, [generateBeatId]);

  // Add a new beat (creates and adds to state)
  // Options allow specifying a custom ID and name (useful for AI-generated stories)
  const addBeat = useCallback((
    type: string,
    position?: { x: number; y: number },
    options?: { id?: string; name?: string }
  ): Beat => {
    console.log('[useStoryBuilder] addBeat called with type:', type, 'position:', position, 'options:', options);
    const newBeat = createBeat(type, position, options);
    setState(prev => ({
      ...prev,
      beats: [...prev.beats, newBeat],
    }));
    console.log('[useStoryBuilder] Beat added to state, total beats:', newBeat.id);
    return newBeat;
  }, [createBeat]);

  // Add an existing beat instance to state (used by command system)
  const addExistingBeat = useCallback((beat: Beat) => {
    setState(prev => ({
      ...prev,
      beats: [...prev.beats, beat],
    }));
  }, []);

  // Update a beat
  const updateBeat = useCallback((beatId: string, updates: Partial<Beat>) => {
    setState(prev => ({
      ...prev,
      beats: prev.beats.map(beat => {
        if (beat.id === beatId) {
          // Special handling for locations: convert array to Map
          if ((updates as any).locations && Array.isArray((updates as any).locations)) {
            const locationsArray = (updates as any).locations;
            delete (updates as any).locations; // Remove from updates to prevent Object.assign from overwriting the Map

            // Update the locations Map
            beat.locations.clear();
            locationsArray.forEach((loc: any) => {
              beat.locations.set(loc.name, loc);
            });

            console.log(`[updateBeat] Converted ${locationsArray.length} locations from array to Map for beat ${beatId}`);
          }

          // CRITICAL: Special handling for parameters - must call updateParameters()
          // Object.assign would just set beat.parameters but not update internal state
          // This is especially important for AI beats and other complex beat types
          if ((updates as any).parameters && typeof beat.updateParameters === 'function') {
            const params = (updates as any).parameters;
            delete (updates as any).parameters; // Remove from updates to prevent Object.assign from overwriting

            beat.updateParameters(params);
            console.log(`[updateBeat] Called updateParameters for beat ${beatId}:`, Object.keys(params));
          }

          // Log transition updates for debugging
          if ((updates as any).transition) {
            console.log(`[updateBeat] Setting transition for beat ${beatId}:`, (updates as any).transition);
          }

          // Update beat properties while maintaining the Beat instance
          Object.assign(beat, updates);

          // Increment _version to signal to React that the beat has changed
          // This is necessary because Object.assign mutates in place, keeping the same reference
          // Components using beat in their key (e.g., VisualWorkspace) will detect this change
          (beat as any)._version = ((beat as any)._version || 0) + 1;

          return beat;
        }
        return beat;
      }),
    }));
  }, []);

  // Delete a beat
  const deleteBeat = useCallback((beatId: string) => {
    setState(prev => ({
      ...prev,
      beats: prev.beats.filter(beat => beat.id !== beatId),
      connections: prev.connections.filter(
        conn => conn.source !== beatId && conn.target !== beatId
      ),
    }));
  }, []);

  // Move a beat
  const moveBeat = useCallback((beatId: string, position: { x: number; y: number }) => {
    setState(prev => ({
      ...prev,
      beats: prev.beats.map(beat => {
        if (beat.id === beatId) {
          // Update position on the actual Beat instance
          beat.x = position.x;
          beat.y = position.y;
          return beat;
        }
        return beat;
      }),
    }));
  }, []);

  // Connect two beats
  const connectBeats = useCallback((sourceBeatId: string, targetBeatId: string, label?: string) => {
    setState(prev => {
      const sourceBeat = prev.beats.find(b => b.id === sourceBeatId);
      const targetBeat = prev.beats.find(b => b.id === targetBeatId);

      if (!sourceBeat || !targetBeat) return prev;

      // Check if connection already exists (same target and label)
      const existingConnection = sourceBeat.getConnections().find(
        c => c.targetId === targetBeatId && (label ? c.label === label : true)
      );
      if (existingConnection) return prev;

      // Add connection to source beat
      // Use provided label, or default to "To {targetName}"
      sourceBeat.addConnection({
        targetId: targetBeatId,
        label: label || `To ${targetBeat.name}`,
      });

      return {
        ...prev,
        beats: [...prev.beats], // Trigger re-render
        connections: [
          ...prev.connections,
          { source: sourceBeatId, target: targetBeatId, label },
        ],
      };
    });
  }, []);

  // Disconnect two beats
  const disconnectBeats = useCallback((sourceBeatId: string, targetBeatId: string) => {
    setState(prev => {
      const sourceBeat = prev.beats.find(b => b.id === sourceBeatId);

      if (!sourceBeat) return prev;

      // Remove the connection from the source beat. NOTE: getConnections()
      // returns a COPY, so the old "pop the array then re-add the filtered
      // set" approach mutated a throwaway copy and left the beat's real
      // connections untouched — the edge persisted after a disconnect. Use
      // the Beat's own removeConnection(), which filters this.connections.
      sourceBeat.removeConnection(targetBeatId);

      return {
        ...prev,
        beats: [...prev.beats], // Trigger re-render
        connections: prev.connections.filter(
          conn => !(conn.source === sourceBeatId && conn.target === targetBeatId)
        ),
      };
    });
  }, []);

  // FIXED: Export story to ASML with ALL data including assets and characters
  const exportStory = useCallback((assets?: any[], characters?: any[]): string => {
    const knownFirstBeatId = (state.story as any)?.getFirstBeatId?.() || (state.story as any)?.metadata?.firstBeatId || (state.story as any)?.firstBeatId;
    const story = new Story({
      title: state.title,
      author: state.author,
      firstBeatId: knownFirstBeatId || undefined,
    });

    // FIXED: Always use state.settings as it contains the most up-to-date settings
    // Check if we have settings in state (either from updateSettings or from import)
    if (state.settings && Object.keys(state.settings).length > 0) {
      story.setSettings(state.settings);
    } else if (state.story) {
      // Fallback to imported story settings if no manual updates were made
      // Check if state.story is a Story instance with methods or a plain object
      if (typeof state.story.getSettings === 'function') {
        story.setSettings(state.story.getSettings());
      } else if ((state.story as any).settings) {
        // Plain object - extract settings directly
        story.setSettings((state.story as any).settings);
      }
    }

    // Apply environment and characters
    if (state.story) {
      // Use data from the imported story (unless overridden)
      // Handle both Story instances and plain objects (use type assertion for plain object access)
      const storyEnvironment = typeof state.story.getEnvironment === 'function'
        ? state.story.getEnvironment()
        : (state.story as any).environment || {};
      const environment = state.environment || storyEnvironment;
      // Add assets to environment if provided
      if (assets && assets.length > 0) {
        environment.assets = assets;
      }
      story.setEnvironment(environment);

      // Use provided characters, fall back to state or imported characters
      const storyCharacters = typeof state.story.getCharacters === 'function'
        ? state.story.getCharacters()
        : (state.story as any).characters || [];
      story.setCharacters(characters || state.characters || storyCharacters);

      // Set clusters if available
      const storyClusters = typeof state.story.getClusters === 'function'
        ? state.story.getClusters()
        : (state.story as any).clusters || [];
      story.setClusters(storyClusters);
    } else {
      // Use data from state (for manually created stories)
      const environment = { ...state.environment };
      // Add assets to environment if provided
      if (assets && assets.length > 0) {
        environment.assets = assets;
      }
      story.setEnvironment(environment);
      // Use provided characters or state characters
      story.setCharacters(characters || state.characters);
    }

    // Add all beats to story
    state.beats.forEach(beat => {
      console.log('[export] beat.connections for', beat.id,
        beat.getConnections().map((c: any) => ({ target: c.targetId, label: c.label })));
      story.addBeat(beat);
    });

    // If no firstBeatId was known, let Story auto-detect now that beats are added
    if (!knownFirstBeatId) {
      const detected = story.getFirstBeatId();
      if (detected) {
        story.setFirstBeatId(detected);
      }
    }

    // Log what we're exporting for debugging
    console.log('Exporting story with:', {
      beats: state.beats.length,
      settings: story.getSettings(),
      environment: story.getEnvironment(),
      characters: story.getCharacters(),
    });

    // Generate ASML
    const generator = new ASMLGenerator();
    return generator.generate(story);
  }, [state]);

  // FIXED: Import story from ASML - preserve ALL data
  // Enhanced: Now supports asset import via options
  const importStory = useCallback(async (
    xmlContent: string,
    options?: ImportStoryOptions
  ): Promise<ImportStoryResult> => {
    console.warn('[useStoryBuilder] ★★★ importStory CALLED ★★★');
    const errors: string[] = [];
    const importedCharacters: Character[] = [];
    let assetImportResult: AsmlAssetImportResult | undefined;

    // Step 1: If assets need to be imported, do that first
    if (options?.fileMap && options.fileMap.size > 0 && options.addAsset && options.projectId) {
      console.log('[importStory] Importing assets from folder...');

      // Extract asset manifest from XML
      const manifest = ASMLParser.getAssetManifest(xmlContent);

      if (manifest.hasAssets()) {
        // Create file resolver from the file map
        const fileResolver = createFileResolver(options.fileMap);

        // Import all assets
        assetImportResult = await importAsmlAssets({
          manifest,
          fileResolver,
          projectId: options.projectId,
          addAsset: options.addAsset
        });

        // Collect characters from import result
        assetImportResult.characterMap.forEach((character, name) => {
          // Avoid duplicates (map has both name and lowercase name)
          if (!importedCharacters.find(c => c.id === character.id)) {
            importedCharacters.push(character);
          }
        });

        // Collect errors
        errors.push(...assetImportResult.errors);

        console.log('[importStory] Asset import complete:', assetImportResult.stats);
      }
    }

    // Step 2: Parse the story
    console.warn('[importStory] ★★★ About to call ASMLProcessor.parseASML ★★★');
    const processor = new ASMLProcessor();
    const result = await processor.parseASML(xmlContent);
    console.warn('[importStory] ★★★ parseASML returned ★★★', result.success ? 'SUCCESS' : 'FAILED');

    // Log parser warnings (useful for debugging missing beats)
    if (result.warnings && result.warnings.length > 0) {
      console.warn('[importStory] Parser warnings:', result.warnings);
      errors.push(...result.warnings);
    }

    if (!result.success || !result.story) {
      return {
        success: false,
        title: 'Imported Story',
        characters: [],
        errors: [`Failed to import story: ${result.errors.join(', ')}`]
      };
    }

    const story = result.story;
    const metadata = story.getMetadata();

    // Important: Get actual Beat instances from the story
    const beats = story.getAllBeats();

    // DEBUG: Log locations after getting beats from story
    console.log('[importStory] ========== BEAT LOCATIONS AFTER IMPORT ==========');
    for (const beat of beats) {
      if (beat.locations.size > 0) {
        console.log(`[importStory] Beat ${beat.id} (${beat.type}) locations:`);
        beat.locations.forEach((loc: any, key: string) => {
          console.log(`[importStory]   - "${key}": x=${loc.x}, y=${loc.y}, size=${loc.size}`);
        });
      }
    }
    console.log('[importStory] ===================================================');

    // FIXED: Extract and store all data sections
    const settings = story.getSettings();
    const environment = story.getEnvironment();
    const characters = story.getCharacters();
    const clusters = story.getClusters() || [];

    console.log('Imported story data:', {
      beats: beats.length,
      settings,
      environment,
      characters,
      clusters: clusters.length,
    });

    // Step 3: Link assets to beats and settings if we imported assets
    if (assetImportResult) {
      console.log('[importStory] Linking assets to beats...');
      linkAssetsToBeats(beats, assetImportResult);

      // Link assets to settings (e.g., background music)
      console.log('[importStory] Linking assets to settings...');
      linkAssetsToSettings(settings, assetImportResult);
    }

    // Extract connections from beats using their getConnections() method
    const connections: Array<{ source: string; target: string; label?: string }> = [];
    const seenConnections = new Set<string>();

    for (const beat of beats) {
      if (typeof beat.getConnections === 'function') {
        const beatConnections = beat.getConnections();
        for (const conn of beatConnections) {
          if (conn.targetId) {
            const key = `${beat.id}->${conn.targetId}`;
            if (!seenConnections.has(key)) {
              seenConnections.add(key);
              connections.push({
                source: beat.id,
                target: conn.targetId,
                label: conn.label
              });
            }
          }
        }
      }
    }

    console.log('[importStory] Extracted connections:', connections.length);

    // Check if any beats have positions - if not, apply auto-layout
    const hasPositions = beats.some(b => b.x !== undefined && b.y !== undefined);

    if (!hasPositions && beats.length > 0) {
      console.log('[importStory] No beat positions found, applying auto-layout');

      // Create layout-compatible beat data
      const layoutBeats = beats.map(b => ({
        id: b.id,
        type: b.type,
        position: undefined,
        parameters: b.getParameters()
      }));

      // Extract edges for layout
      const edges = connections.map(c => ({
        source: c.source,
        target: c.target
      }));

      // Apply tree layout - use firstBeatId to ensure it's positioned at top
      const startBeatId = metadata?.firstBeatId || beats[0]?.id;
      const positions = applyTreeLayoutToBeats(layoutBeats, undefined, edges, startBeatId);

      // Apply positions to beats
      for (const beat of beats) {
        const pos = positions.get(beat.id);
        if (pos) {
          (beat as any).x = pos.x;
          (beat as any).y = pos.y;
          console.log(`[importStory] Positioned ${beat.id} at (${pos.x}, ${pos.y})`);
        }
      }
    }

    setState({
      title: metadata?.title || 'Imported Story',
      author: metadata?.author || 'Unknown Author',
      beats: beats, // These are Beat instances
      connections: connections, // Now properly extracted from beats
      story: story, // Keep the full story for export
      settings,  // Store imported settings in state
      environment,
      characters,
      clusters: clusters, // Use imported clusters, preserving beat groupings
      containerBeatPositions: [], // Initialize empty positions
    });

    // Reset beat counter - parse actual beat IDs to find the highest number
    let maxBeatNumber = 0;
    for (const beat of beats) {
      const match = beat.id?.match(/^beat_(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxBeatNumber) {
          maxBeatNumber = num;
        }
      }
    }
    beatCounter.current = Math.max(maxBeatNumber + 1, beats.length);
    console.log('[importStory] Beat counter set to:', beatCounter.current);

    // Log any warnings
    if (result.warnings.length > 0) {
      console.warn('Import warnings:', result.warnings);
      errors.push(...result.warnings);
    }

    return {
      success: true,
      title: metadata?.title || 'Imported Story',
      characters: importedCharacters,
      assetStats: assetImportResult?.stats,
      errors,
      settings // Return settings so App.tsx can use them immediately (state update is async)
    };
  }, []);

  /**
   * Import beats directly (e.g., from Twine import)
   * Simpler than importStory which parses ASML XML
   */
  const importBeats = useCallback((
    beats: Beat[],
    options?: { title?: string; author?: string; firstBeatId?: string }
  ) => {
    console.log('[useStoryBuilder] Importing beats directly:', beats.length);

    // Extract connections from beats
    const connections: Array<{ source: string; target: string; label?: string }> = [];
    const seenConnections = new Set<string>();

    for (const beat of beats) {
      if (typeof beat.getConnections === 'function') {
        const beatConnections = beat.getConnections();
        for (const conn of beatConnections) {
          if (conn.targetId) {
            const key = `${beat.id}->${conn.targetId}`;
            if (!seenConnections.has(key)) {
              seenConnections.add(key);
              connections.push({
                source: beat.id,
                target: conn.targetId,
                label: conn.label
              });
            }
          }
        }
      }

      // Also check defaultTarget
      if (beat.defaultTarget) {
        const key = `${beat.id}->${beat.defaultTarget}`;
        if (!seenConnections.has(key)) {
          seenConnections.add(key);
          connections.push({
            source: beat.id,
            target: beat.defaultTarget,
          });
        }
      }
    }

    console.log('[importBeats] Extracted connections:', connections.length);

    // Check if beats have positions - if not, apply auto-layout
    const hasPositions = beats.some(b => b.x !== undefined && b.y !== undefined);

    if (!hasPositions && beats.length > 0) {
      console.log('[importBeats] No beat positions found, applying auto-layout');

      // Create layout-compatible beat data
      const layoutBeats = beats.map(b => ({
        id: b.id,
        type: b.type,
        position: undefined,
        parameters: b.getParameters()
      }));

      // Extract edges for layout
      const edges = connections.map(c => ({
        source: c.source,
        target: c.target
      }));

      // Apply tree layout - use first beat as start beat
      const startBeatId = options?.firstBeatId || beats[0]?.id;
      const positions = applyTreeLayoutToBeats(layoutBeats, undefined, edges, startBeatId);

      // Apply positions to beats
      for (const beat of beats) {
        const pos = positions.get(beat.id);
        if (pos) {
          (beat as any).x = pos.x;
          (beat as any).y = pos.y;
        }
      }
    }

    // Update state
    setState({
      title: options?.title || 'Imported Story',
      author: options?.author || 'Unknown Author',
      beats: beats,
      connections: connections,
      story: null,
      settings: {},
      environment: { props: [], nodes: [] },
      characters: [],
      clusters: [],
      containerBeatPositions: [],
    });

    // Reset beat counter
    let maxBeatNumber = 0;
    for (const beat of beats) {
      const match = beat.id?.match(/(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxBeatNumber) {
          maxBeatNumber = num;
        }
      }
    }
    beatCounter.current = Math.max(maxBeatNumber + 1, beats.length);
    console.log('[importBeats] Beat counter set to:', beatCounter.current);
  }, []);

  // Clear story
  const clearStory = useCallback(() => {
    setState({
      title: 'My Interactive Story',
      author: 'Story Author',
      beats: [],
      connections: [],
      story: null,
      settings: {},
      environment: { props: [], nodes: [] },
      characters: [],
      clusters: [],
      containerBeatPositions: [],
    });
    beatCounter.current = 0;
  }, []);

  // Update global settings
  const updateSettings = useCallback((settings: any) => {
    setState(prev => ({
      ...prev,
      settings: settings
    }));
  }, []);

  // Load story data from persistence (e.g., when opening a project)
  const loadStoryData = useCallback((storyData: any) => {
    if (!storyData) {
      console.warn('[useStoryBuilder] No story data to load');
      return;
    }

    // Extract beats - these should be Beat instances or beat data
    const beats = storyData.beats || [];
    const connections = storyData.connections || [];
    const clusters = storyData.clusters || [];
    const containerBeatPositions = storyData.containerBeatPositions || [];

    console.log('[useStoryBuilder] loadStoryData:', {
      beats: beats.length,
      connections: connections.length,
      clusters: clusters.length,
      containerBeatPositions: containerBeatPositions.length,
      clusterIds: clusters.map((c: any) => c.id),
    });

    setState({
      title: storyData.title || 'Untitled Story',
      author: storyData.author || 'Unknown Author',
      beats: beats,
      connections: connections,
      story: storyData.story || null,
      settings: storyData.settings || {},
      environment: storyData.environment || { props: [], nodes: [] },
      characters: storyData.characters || [],
      clusters,
      containerBeatPositions,
    });

    // Update beat counter to ensure new beats get unique IDs
    // CRITICAL FIX: Parse actual beat IDs to find the highest number
    // This prevents duplicate IDs when beats have been added/deleted
    let maxBeatNumber = 0;
    for (const beat of beats) {
      const match = beat.id?.match(/^beat_(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxBeatNumber) {
          maxBeatNumber = num;
        }
      }
    }
    // Set counter to one higher than the max found ID
    beatCounter.current = Math.max(maxBeatNumber + 1, beats.length, beatCounter.current);
    console.log('[useStoryBuilder] Beat counter set to:', beatCounter.current, '(max beat ID found:', maxBeatNumber, ')');

    console.log('[useStoryBuilder] Story data loaded:', {
      title: storyData.title,
      beats: beats.length,
      connections: connections.length,
    });
  }, []);

  // Initialize with a basic story structure
  const initializeStory = useCallback(() => {
    // Clear any existing beats first
    clearStory();
    
    // Create title beat
    const titleBeat = beatRegistry.current.createBeat('titleScreen', {
      id: 'beat_0',
      name: 'Title Screen',
      type: 'titleScreen',
      x: 100,
      y: 200,
      parameters: {
        title: 'My Interactive Story',
        author: 'Story Author',
        buttonText: 'Start'
      }
    });
    
    // Create intro beat
    const introBeat = beatRegistry.current.createBeat('infoText', {
      id: 'beat_1',
      name: 'Introduction',
      type: 'infoText',
      x: 400,
      y: 200,
      parameters: {
        text: 'Welcome to your interactive story. This is where your narrative begins...',
        buttonText: 'Continue'
      }
    });
    
    // Create end beat
    const endBeat = beatRegistry.current.createBeat('endScreen', {
      id: 'beat_2',
      name: 'The End',
      type: 'endScreen',
      x: 700,
      y: 200,
      parameters: {
        message: 'The End',
        showRestart: true,
        showCredits: false
      }
    });
    
    // Add connections
    titleBeat.addConnection({
      targetId: introBeat.id,
      label: 'Start Story'
    });
    
    introBeat.addConnection({
      targetId: endBeat.id,
      label: 'Finish'
    });
    
    // Update state with actual Beat instances
    setState(prev => ({
      ...prev,
      beats: [titleBeat, introBeat, endBeat],
      connections: [
        { source: titleBeat.id, target: introBeat.id },
        { source: introBeat.id, target: endBeat.id }
      ]
    }));
    
    beatCounter.current = 3;
  }, [clearStory]);

  // Expand/collapse cluster
  const expandCollapseCluster = useCallback((clusterId: string) => {
    setState(prev => ({
      ...prev,
      clusters: prev.clusters.map(cluster =>
        cluster.id === clusterId
          ? { ...cluster, isExpanded: !cluster.isExpanded }
          : cluster
      ),
    }));
  }, []);

  // Move beat to cluster
  const moveBeatToCluster = useCallback((beatId: string, clusterId: string) => {
    console.log(`[useStoryBuilder] Moving beat ${beatId} to cluster ${clusterId}`);
    setState(prev => ({
      ...prev,
      beats: prev.beats.map(beat => {
        if (beat.id === beatId) {
          // Update the cluster property on the existing Beat instance
          beat.cluster = clusterId;
          console.log(`[useStoryBuilder] Beat ${beat.name} now in cluster ${clusterId}`);
        }
        return beat;
      }),
    }));
  }, []);

  // Move beat position within container (for spatial clusters)
  const moveBeatInContainer = useCallback((beatId: string, clusterId: string, x: number, y: number) => {
    setState(prev => {
      // Check if position already exists for this beat
      const existingIndex = prev.containerBeatPositions.findIndex(
        pos => pos.beatId === beatId && pos.clusterId === clusterId
      );

      const newPosition: ContainerBeatPosition = {
        beatId,
        clusterId,
        position: { x, y, z: 0 }
      };

      if (existingIndex >= 0) {
        // Update existing position
        const newPositions = [...prev.containerBeatPositions];
        newPositions[existingIndex] = {
          ...newPositions[existingIndex],
          position: { ...newPositions[existingIndex].position, x, y }
        };
        return { ...prev, containerBeatPositions: newPositions };
      } else {
        // Add new position
        return {
          ...prev,
          containerBeatPositions: [...prev.containerBeatPositions, newPosition]
        };
      }
    });
  }, []);

  // Move cluster
  const moveCluster = useCallback((clusterId: string, position: { x: number; y: number }) => {
    setState(prev => ({
      ...prev,
      clusters: prev.clusters.map(cluster =>
        cluster.id === clusterId
          ? { ...cluster, containerPosition: position }
          : cluster
      ),
    }));
  }, []);

  // Resize cluster container
  const resizeCluster = useCallback((clusterId: string, width: number, height: number) => {
    setState(prev => ({
      ...prev,
      clusters: prev.clusters.map(cluster =>
        cluster.id === clusterId
          ? {
              ...cluster,
              containerBounds: {
                ...cluster.containerBounds,
                width,
                height,
              }
            }
          : cluster
      ),
    }));
  }, []);

  // Add cluster
  const addCluster = useCallback((cluster: Cluster) => {
    setState(prev => ({
      ...prev,
      clusters: [...prev.clusters, cluster],
    }));
  }, []);

  // Remove cluster
  const removeCluster = useCallback((clusterId: string) => {
    setState(prev => ({
      ...prev,
      clusters: prev.clusters.filter(cluster => cluster.id !== clusterId),
      // Also remove any cluster references from beats
      beats: prev.beats.map(beat => {
        // If beat is associated with the cluster being removed, clear the association
        if (beat.cluster === clusterId) {
          const { cluster, ...beatWithoutCluster } = beat;
          return beatWithoutCluster as Beat;
        }
        return beat;
      }),
    }));
  }, []);

  // Rename cluster
  const renameCluster = useCallback((clusterId: string, name: string) => {
    console.log('[useStoryBuilder] Renaming cluster', clusterId, 'to', name);
    setState(prev => ({
      ...prev,
      clusters: prev.clusters.map(cluster =>
        cluster.id === clusterId
          ? { ...cluster, name: name }
          : cluster
      ),
    }));
  }, []);

  // Set cluster background map
  const setClusterMap = useCallback((clusterId: string, assetId: string | null, scale?: number, opacity?: number) => {
    console.log('[useStoryBuilder] Setting cluster map', clusterId, assetId, scale, opacity);
    setState(prev => ({
      ...prev,
      clusters: prev.clusters.map(cluster =>
        cluster.id === clusterId
          ? {
              ...cluster,
              mapAssetId: assetId || undefined,
              mapScale: scale,
              mapOpacity: opacity,
            }
          : cluster
      ),
    }));
  }, []);

  // Set cluster ambient sound
  const setClusterSound = useCallback((clusterId: string, soundAssetId: string | null, volume?: number) => {
    console.log('[useStoryBuilder] Setting cluster sound', clusterId, soundAssetId, volume);
    setState(prev => ({
      ...prev,
      clusters: prev.clusters.map(cluster =>
        cluster.id === clusterId
          ? {
              ...cluster,
              sound: soundAssetId
                ? {
                    file: soundAssetId, // Will be resolved to URL during preview
                    volume: volume ?? 0.5,
                    loop: true, // Cluster sounds always loop
                  }
                : undefined,
            }
          : cluster
      ),
    }));
  }, []);

  // Set cluster shared visual content (inherited by all beats in cluster)
  const setClusterSharedVisuals = useCallback((clusterId: string, sharedVisuals: SharedVisualContent | undefined) => {
    console.log('[useStoryBuilder] Setting cluster shared visuals', clusterId, sharedVisuals);
    setState(prev => ({
      ...prev,
      clusters: prev.clusters.map(cluster =>
        cluster.id === clusterId
          ? { ...cluster, sharedVisuals }
          : cluster
      ),
    }));
  }, []);

  // Merge multiple dialogTree beats into a single beat with nested dialog structure
  const mergeDialogTrees = useCallback((beatIds: string[]): { success: boolean; mergedBeatId?: string; mergedBeat?: Beat; error?: string } => {
    if (beatIds.length < 2) {
      return { success: false, error: 'Need at least 2 beats to merge' };
    }

    // Get the beats in order
    const beatsToMerge: DialogTreeBeat[] = [];
    for (const id of beatIds) {
      const beat = state.beats.find(b => b.id === id);
      if (!beat) {
        return { success: false, error: `Beat ${id} not found` };
      }
      if (beat.type !== 'dialogTree') {
        return { success: false, error: `Beat ${beat.name} is not a DialogTree` };
      }
      beatsToMerge.push(beat as DialogTreeBeat);
    }

    console.log(`[useStoryBuilder] Merging ${beatsToMerge.length} dialogTree beats`);

    // The first beat becomes the target, others get merged into it
    const targetBeat = beatsToMerge[0];
    const beatsToRemove = beatsToMerge.slice(1);

    // Create a deep copy of the target's dialogTree
    const targetDialogTree = targetBeat.dialogTree;
    if (!targetDialogTree) {
      return { success: false, error: 'Target beat has no dialog tree' };
    }

    // Build nested structure: each choice's dialogNode contains the next beat's dialog
    // Find choices that lead to the beats being merged
    const updateChoicesWithNesting = (choices: any[] | undefined): any[] => {
      if (!choices) return [];

      return choices
        .map(choice => {
          // Check if this choice leads to one of the beats being merged
          const targetIndex = beatsToRemove.findIndex(b => b.id === choice.target);
          if (targetIndex !== -1) {
            const nextBeat = beatsToRemove[targetIndex];
            const nextDialogTree = nextBeat.dialogTree;

            if (nextDialogTree) {
              // Create nested dialogNode from the next beat
              // IMPORTANT: Generate unique ID to avoid collision with other phases
              // Use beat ID + timestamp to ensure uniqueness
              const nestedNode: DialogNode = {
                id: `nested_${nextBeat.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                speaker: nextDialogTree.speaker,
                text: nextDialogTree.text,
                emotion: nextDialogTree.emotion,
                conditions: nextDialogTree.conditions,
                effects: nextDialogTree.effects,
                // Recursively process choices of the nested beat
                choices: updateChoicesWithNesting(nextDialogTree.choices)
              };

              // Return choice with nested node, removing the target reference
              return {
                ...choice,
                dialogNode: nestedNode,
                target: undefined
              };
            }
          }
          return choice;
        })
        // Filter out empty/placeholder choices that have no target and no nested content
        .filter(choice => {
          const hasTarget = choice.target && !beatsToRemove.find(b => b.id === choice.target);
          const hasNestedContent = choice.dialogNode;
          const hasRealText = choice.text && choice.text !== 'Player response...' && choice.text.trim() !== '';
          // Keep choices that have a target to external beat, or have nested content, or have real text
          return hasTarget || hasNestedContent || hasRealText;
        });
    };

    // Update the target beat's choices with nested structure
    const updatedDialogTree = {
      ...targetDialogTree,
      choices: updateChoicesWithNesting(targetDialogTree.choices),
    };

    // CRITICAL: Update the target beat's parameters with the new dialog tree
    // This persists the merged structure and allows React to detect the change
    targetBeat.updateParameters({ dialogTree: updatedDialogTree });

    // Clear button locations from the target beat so auto-layout will be used
    // The old button positions don't match the new merged choices structure
    const locationsToRemove: string[] = [];
    targetBeat.locations.forEach((loc, key) => {
      if (loc.kind === 'button') {
        locationsToRemove.push(key);
      }
    });
    locationsToRemove.forEach(key => targetBeat.locations.delete(key));
    console.log(`[useStoryBuilder] Cleared ${locationsToRemove.length} button locations for auto-layout after merge`);

    // Collect all outgoing connections from beats being removed
    const newConnections: any[] = [];
    beatsToRemove.forEach(beat => {
      const beatConnections = beat.getConnections();
      beatConnections.forEach(conn => {
        // Don't add connections that go to other beats being merged
        if (!beatsToRemove.find(b => b.id === conn.targetId)) {
          // These connections should now come from the target beat via nested choices
          console.log(`[useStoryBuilder] Connection from ${beat.id} to ${conn.targetId} preserved in nested structure`);
        }
      });
    });

    // Update state: remove merged beats and their connections
    // Also create a new reference for the target beat to trigger React re-render
    const removedIds = new Set(beatsToRemove.map(b => b.id));

    setState(prev => ({
      ...prev,
      // Create new array with new reference for target beat to trigger re-render
      beats: prev.beats
        .filter(b => !removedIds.has(b.id))
        .map(b => b.id === targetBeat.id ? targetBeat : b),
      connections: prev.connections.filter(
        conn => !removedIds.has(conn.source) && !removedIds.has(conn.target)
      ),
    }));

    console.log(`[useStoryBuilder] Merged ${beatsToRemove.length} beats into ${targetBeat.name}`);

    // Return the actual beat object so the caller can select it directly (avoids stale state issues)
    return { success: true, mergedBeatId: targetBeat.id, mergedBeat: targetBeat };
  }, [state.beats]);

  const actions: StoryBuilderActions = {
    setTitle,
    setAuthor,
    createBeat,
    addBeat,
    addExistingBeat,
    updateBeat,
    deleteBeat,
    moveBeat,
    connectBeats,
    disconnectBeats,
    exportStory,
    importStory,
    importBeats,
    clearStory,
    updateSettings,
    loadStoryData,
    expandCollapseCluster,
    moveBeatToCluster,
    moveBeatInContainer,
    moveCluster,
    resizeCluster,
    addCluster,
    removeCluster,
    renameCluster,
    setClusterMap,
    setClusterSound,
    setClusterSharedVisuals,
    mergeDialogTrees,
  };

  return {
    state,
    actions,
    initializeStory,
  };
}
