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
 * Deserialize beats from stored project data
 * Converts plain objects back into Beat class instances
 */
export function deserializeBeats(beatsData: any[]): Beat[] {
  const registry = BeatTypeRegistry.getInstance();
  const beats: Beat[] = [];

  for (const beatData of beatsData) {
    try {
      // Ensure we have the required fields
      if (!beatData.type || !beatData.id) {
        console.warn('[deserializeBeats] Beat missing type or id:', beatData);
        continue;
      }

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

      beats.push(beat);
    } catch (error) {
      console.error('[deserializeBeats] Failed to deserialize beat:', beatData, error);
    }
  }

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
  const needsDeserialization = beatsData.length > 0 && !(beatsData[0] instanceof Object.getPrototypeOf(beatsData[0]).constructor.name);
  const beats = needsDeserialization || !beatsData[0]?.getParameters
    ? deserializeBeats(beatsData)
    : beatsData as Beat[];

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

  return {
    beats,
    title,
    author,
    settings,
    environment,
    characters,
    clusters
  };
}
