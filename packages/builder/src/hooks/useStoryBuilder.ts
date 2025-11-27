import { useState, useCallback, useRef } from 'react';
import {
  Story,
  Beat,
  BeatTypeRegistry,
  TitleScreenBeat,
  IntroTextBeat,
  EndScreenBeat,
  ASMLProcessor,
  ASMLGenerator,
  Cluster
} from '@asaps/core';

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
  moveCluster: (clusterId: string, position: { x: number; y: number }) => void;
  addCluster: (cluster: Cluster) => void;
  removeCluster: (clusterId: string) => void;
  renameCluster: (clusterId: string, name: string) => void;
  exportStory: (assets?: any[], characters?: any[]) => string;
  importStory: (xmlContent: string) => Promise<void>;
  clearStory: () => void;
  updateSettings: (settings: any) => void;
  loadStoryData: (storyData: any) => void;
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

          // Update beat properties while maintaining the Beat instance
          Object.assign(beat, updates);
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
      
      // Remove connection from source beat
      const connections = sourceBeat.getConnections();
      const filteredConnections = connections.filter(c => c.targetId !== targetBeatId);
      
      // Clear and re-add connections
      while (connections.length > 0) {
        connections.pop();
      }
      filteredConnections.forEach(c => sourceBeat.addConnection(c));

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
    const story = new Story({
      title: state.title,
      author: state.author,
      firstBeatId: state.beats[0]?.id || '0',
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
  const importStory = useCallback(async (xmlContent: string) => {
    const processor = new ASMLProcessor();
    const result = await processor.parseASML(xmlContent);

    if (result.success && result.story) {
      const story = result.story;
      const metadata = story.getMetadata();

      // Important: Get actual Beat instances from the story
      const beats = story.getAllBeats();

      // FIXED: Extract and store all data sections
      const settings = story.getSettings();
      const environment = story.getEnvironment();
      const characters = story.getCharacters();

      console.log('Imported story data:', {
        beats: beats.length,
        settings,
        environment,
        characters,
      });

      setState({
        title: metadata?.title || 'Imported Story',
        author: metadata?.author || 'Unknown Author',
        beats: beats, // These are Beat instances
        connections: [],
        story: story, // Keep the full story for export
        settings,  // Store imported settings in state
        environment,
        characters,
        clusters: [], // Initialize empty clusters for imported story
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
      }
    } else {
      throw new Error(`Failed to import story: ${result.errors.join(', ')}`);
    }
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
    console.log('[useStoryBuilder] Loading story data:', storyData);

    if (!storyData) {
      console.warn('[useStoryBuilder] No story data to load');
      return;
    }

    // Extract beats - these should be Beat instances or beat data
    const beats = storyData.beats || [];
    const connections = storyData.connections || [];

    setState({
      title: storyData.title || 'Untitled Story',
      author: storyData.author || 'Unknown Author',
      beats: beats,
      connections: connections,
      story: storyData.story || null,
      settings: storyData.settings || {},
      environment: storyData.environment || { props: [], nodes: [] },
      characters: storyData.characters || [],
      clusters: storyData.clusters || [],
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
    const introBeat = beatRegistry.current.createBeat('introText', {
      id: 'beat_1',
      name: 'Introduction',
      type: 'introText',
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
    setState(prev => ({
      ...prev,
      beats: prev.beats.map(beat => {
        if (beat.id === beatId) {
          // Update the clusterId property on the existing Beat instance
          // @ts-ignore - We're modifying a readonly property for internal tracking
          beat.clusterId = clusterId;
        }
        return beat;
      }),
    }));
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
    clearStory,
    updateSettings,
    loadStoryData,
    expandCollapseCluster,
    moveBeatToCluster,
    moveCluster,
    addCluster,
    removeCluster,
    renameCluster,
  };

  return {
    state,
    actions,
    initializeStory,
  };
}
