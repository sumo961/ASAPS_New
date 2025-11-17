import { useState, useCallback, useRef } from 'react';
import { 
  Story, 
  Beat, 
  BeatTypeRegistry,
  TitleScreenBeat,
  IntroTextBeat,
  EndScreenBeat,
  ASMLProcessor,
  ASMLGenerator
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
}

interface StoryBuilderActions {
  setTitle: (title: string) => void;
  setAuthor: (author: string) => void;
  addBeat: (type: string, position?: { x: number; y: number }) => Beat;
  updateBeat: (beatId: string, updates: Partial<Beat>) => void;
  deleteBeat: (beatId: string) => void;
  moveBeat: (beatId: string, position: { x: number; y: number }) => void;
  connectBeats: (sourceBeatId: string, targetBeatId: string) => void;
  disconnectBeats: (sourceBeatId: string, targetBeatId: string) => void;
  exportStory: () => string;
  importStory: (xmlContent: string) => Promise<void>;
  clearStory: () => void;
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

  // Add a new beat
  const addBeat = useCallback((type: string, position?: { x: number; y: number }): Beat => {
    const id = generateBeatId();
    const name = `${type.charAt(0).toUpperCase() + type.slice(1)} ${id}`;
    
    const beatConfig = {
      id,
      name,
      type,
      x: position?.x || Math.random() * 500,
      y: position?.y || Math.random() * 500,
    };
    
    const newBeat = beatRegistry.current.createBeat(type, beatConfig);
    
    // Important: Store the actual Beat instance
    setState(prev => ({
      ...prev,
      beats: [...prev.beats, newBeat],
    }));
    
    return newBeat;
  }, [generateBeatId]);

  // Update a beat
  const updateBeat = useCallback((beatId: string, updates: Partial<Beat>) => {
    setState(prev => ({
      ...prev,
      beats: prev.beats.map(beat => {
        if (beat.id === beatId) {
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
  const connectBeats = useCallback((sourceBeatId: string, targetBeatId: string) => {
    setState(prev => {
      const sourceBeat = prev.beats.find(b => b.id === sourceBeatId);
      const targetBeat = prev.beats.find(b => b.id === targetBeatId);
      
      if (!sourceBeat || !targetBeat) return prev;
      
      // Check if connection already exists
      const existingConnection = sourceBeat.getConnections().find(c => c.targetId === targetBeatId);
      if (existingConnection) return prev;
      
      // Add connection to source beat
      sourceBeat.addConnection({
        targetId: targetBeatId,
        label: `To ${targetBeat.name}`,
      });
      
      return {
        ...prev,
        beats: [...prev.beats], // Trigger re-render
        connections: [
          ...prev.connections,
          { source: sourceBeatId, target: targetBeatId },
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

  // FIXED: Export story to ASML with ALL data
  const exportStory = useCallback((): string => {
    const story = new Story({
      title: state.title,
      author: state.author,
      firstBeatId: state.beats[0]?.id || '0',
    });
    
    // FIXED: Transfer settings, environment, and characters from imported story
    if (state.story) {
      // Use data from the imported story
      story.setSettings(state.story.getSettings());
      story.setEnvironment(state.story.getEnvironment());
      story.setCharacters(state.story.getCharacters());
      story.setClusters(state.story.getClusters());
    } else {
      // Use data from state (for manually created stories)
      story.setSettings(state.settings);
      story.setEnvironment(state.environment);
      story.setCharacters(state.characters);
    }
    
    // Add all beats to story
    state.beats.forEach(beat => {
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
        settings,
        environment,
        characters,
      });
      
      // Reset beat counter
      beatCounter.current = beats.length;
      
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
    });
    beatCounter.current = 0;
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

  const actions: StoryBuilderActions = {
    setTitle,
    setAuthor,
    addBeat,
    updateBeat,
    deleteBeat,
    moveBeat,
    connectBeats,
    disconnectBeats,
    exportStory,
    importStory,
    clearStory,
  };

  return {
    state,
    actions,
    initializeStory,
  };
}
