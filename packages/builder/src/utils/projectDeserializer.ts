/**
 * Project Deserializer - Converts stored project data back into Beat instances
 *
 * When projects are saved to IndexedDB, Beat instances are serialized to plain objects.
 * This utility reconstructs proper Beat instances from the stored data.
 */

import { BeatTypeRegistry, Story } from '@asaps/core';
import type { Beat } from '@asaps/core';
import type { Project } from '../storage/types';

/**
 * Migrate dialogTree beats that use deprecated defaultConnection
 * Converts defaultConnection to explicit choice targets
 */
function migrateDialogTreeDefaultConnection(beatData: any): void {
  if (beatData.type !== 'dialogTree') return;

  const params = beatData.parameters || {};
  const defaultConn = params.defaultConnection || beatData.defaultConnection;

  if (!defaultConn) return;

  const defaultTarget = typeof defaultConn === 'string' ? defaultConn : defaultConn.target;
  if (!defaultTarget) return;

  console.log('[migrateDialogTree] Migrating defaultConnection for beat:', beatData.id, '-> target:', defaultTarget);

  // Find all leaf choices (choices without targets) and add the default target
  const addTargetToLeafChoices = (node: any): boolean => {
    if (!node) return false;

    let modified = false;

    if (node.choices && Array.isArray(node.choices)) {
      for (const choice of node.choices) {
        if (!choice.target) {
          // This is a leaf choice - add the default target
          choice.target = defaultTarget;
          modified = true;
          console.log('[migrateDialogTree] Added target to choice:', choice.text || choice.id);
        } else if (typeof choice.target === 'object') {
          // Nested dialog node - recurse
          if (addTargetToLeafChoices(choice.target)) {
            modified = true;
          }
        }
      }
    }

    // Also check 'next' for linear continuation
    if (typeof node.next === 'object' && node.next) {
      if (addTargetToLeafChoices(node.next)) {
        modified = true;
      }
    }

    return modified;
  };

  // Apply migration to dialogTree
  if (params.dialogTree) {
    addTargetToLeafChoices(params.dialogTree);
  }

  // Remove the deprecated defaultConnection
  delete params.defaultConnection;
  delete beatData.defaultConnection;

  console.log('[migrateDialogTree] Migration complete for beat:', beatData.id);
}

/**
 * Deserialize beats from stored project data
 * Converts plain objects back into Beat class instances
 */
export function deserializeBeats(beatsData: any[]): Beat[] {
  const registry = BeatTypeRegistry.getInstance();
  const beats: Beat[] = [];

  console.log('[deserializeBeats] Starting to deserialize', beatsData.length, 'beats');

  for (const beatData of beatsData) {
    try {
      // Ensure we have the required fields
      if (!beatData.type || !beatData.id) {
        console.warn('[deserializeBeats] Beat missing type or id:', beatData);
        continue;
      }

      console.log('[deserializeBeats] Processing beat:', {
        id: beatData.id,
        name: beatData.name || 'unnamed',
        type: beatData.type
      });

      // Apply migrations for deprecated features
      migrateDialogTreeDefaultConnection(beatData);

      // Create beat config from stored data
      const config = {
        id: beatData.id,
        name: beatData.name || beatData.id,
        type: beatData.type,
        x: beatData.x,
        y: beatData.y,
        cluster: beatData.cluster,
        node: beatData.node,
        connections: beatData.connections || [],
        locations: beatData.locations || [],
        defaultTarget: beatData.defaultTarget,
        defaultTargetDelay: beatData.defaultTargetDelay,
        showTimer: beatData.showTimer,
        transition: beatData.transition,
        sound: beatData.sound,
        parameters: beatData.parameters || {}
      };

      // Create Beat instance using registry
      const beat = registry.createBeat(beatData.type, config);

      // Update beat with parameters if they exist
      if (beatData.parameters) {
        beat.updateParameters(beatData.parameters);
      }

      console.log('[deserializeBeats] Successfully created beat:', beat.id, 'type:', beat.type);
      beats.push(beat);
    } catch (error) {
      console.error('[deserializeBeats] FAILED to deserialize beat:', beatData, error);
    }
  }

  console.log('[deserializeBeats] Successfully deserialized', beats.length, 'beats out of', beatsData.length, 'input beats');
  return beats;
}

/**
 * Load project data into story builder format
 * Extracts and deserializes all story components from a stored project
 */
export function loadProjectData(project: Project): {
  beats: Beat[];
  title: string;
  author: string;
  settings: any;
  environment: any;
  characters: any[];
  clusters: any[];
  connections: any[];
} {
  console.log('[loadProjectData] Loading project:', project.id);

  // The story might be a Story instance or serialized data
  const story = project.story as any;

  // Extract beats - they might be in story.beats Map or getAllBeats() or beats array
  let beatsData: any[] = [];

  if (story.getAllBeats && typeof story.getAllBeats === 'function') {
    // Story instance with getAllBeats method
    beatsData = story.getAllBeats();
  } else if (story.beats && story.beats instanceof Map) {
    // Story with beats Map
    beatsData = Array.from(story.beats.values());
  } else if (story.beats && Array.isArray(story.beats)) {
    // Serialized story with beats array
    beatsData = story.beats;
  } else if (Array.isArray(story)) {
    // Just an array of beats
    beatsData = story;
  }

  // Check if beats are already Beat instances or need deserialization
  // If they have getParameters method, they're already Beat instances
  const beats = beatsData.length > 0 && beatsData[0]?.getParameters && typeof beatsData[0].getParameters === 'function'
    ? beatsData as Beat[]
    : deserializeBeats(beatsData);

  console.log('[loadProjectData] Deserialized beats:', beats.length);

  // Extract metadata
  let title = project.name || 'Untitled Project';
  let author = 'Unknown Author';

  if (story.getMetadata && typeof story.getMetadata === 'function') {
    const metadata = story.getMetadata();
    title = metadata?.title || title;
    author = metadata?.author || author;
  } else if (story.metadata) {
    title = story.metadata.title || title;
    author = story.metadata.author || author;
  }

  // Extract settings
  let settings = project.settings || {};
  if (story.getSettings && typeof story.getSettings === 'function') {
    settings = story.getSettings();
  } else if (story.settings) {
    settings = story.settings;
  }

  // Extract environment
  let environment = { props: [], nodes: [] };
  if (story.getEnvironment && typeof story.getEnvironment === 'function') {
    environment = story.getEnvironment();
  } else if (story.environment) {
    environment = story.environment;
  }

  // Extract characters
  let characters: any[] = [];
  if (story.getCharacters && typeof story.getCharacters === 'function') {
    characters = story.getCharacters();
  } else if (story.characters) {
    characters = story.characters;
  }

  // Extract clusters
  let clusters: any[] = [];
  if (story.getClusters && typeof story.getClusters === 'function') {
    clusters = story.getClusters();
  } else if (story.clusters) {
    clusters = story.clusters;
  }

  // CRITICAL FIX: Extract connections from multiple sources
  // Priority: story.connections (flowchart format) > extract from beats
  let connections: any[] = [];

  // First, try to get story-level connections (flowchart format: { source, target })
  if (story.getConnections && typeof story.getConnections === 'function') {
    connections = story.getConnections();
  } else if (story.connections && Array.isArray(story.connections)) {
    connections = story.connections;
  }

  console.log('[loadProjectData] Story-level connections found:', connections.length);

  // If no story-level connections, extract from beat data
  // This handles cases where connections were only stored in beats
  if (connections.length === 0 && beatsData.length > 0) {
    console.log('[loadProjectData] No story-level connections, extracting from beats...');

    for (const beatData of beatsData) {
      const beatId = beatData.id;

      // Get connections from beat - either from instance method or serialized data
      let beatConnections: any[] = [];

      if (beatData.getConnections && typeof beatData.getConnections === 'function') {
        // Beat instance with getConnections method
        beatConnections = beatData.getConnections();
      } else if (beatData.connections && Array.isArray(beatData.connections)) {
        // Serialized beat data
        beatConnections = beatData.connections;
      }

      // Convert beat connections (targetId format) to flowchart connections (source/target format)
      for (const conn of beatConnections) {
        const targetId = conn.targetId || conn.target;
        if (targetId) {
          connections.push({
            source: beatId,
            target: targetId,
            label: conn.label
          });
        }
      }
    }

    console.log('[loadProjectData] Extracted', connections.length, 'connections from beats');
  }

  console.log('[loadProjectData] Final loaded data:', {
    title,
    beats: beats.length,
    connections: connections.length,
    characters: characters.length,
    clusters: clusters.length
  });

  return {
    beats,
    title,
    author,
    settings,
    environment,
    characters,
    clusters,
    connections
  };
}
