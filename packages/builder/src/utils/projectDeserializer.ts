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
 * Extract target ID from various formats
 * Handles: string, { next: "id" }, { target: "id" }
 */
function extractTargetId(target: any): string | null {
  if (!target) return null;
  if (typeof target === 'string') return target;
  if (typeof target === 'object') {
    if (target.next) return target.next;
    if (typeof target.target === 'string') return target.target;
  }
  return null;
}

/**
 * Extract connections from beat parameters (multi-connection beats)
 * This normalizes beats that store targets in parameters rather than connections array
 */
function extractConnectionsFromBeatParameters(beatData: any): Array<{ source: string; target: string; label?: string }> {
  const connections: Array<{ source: string; target: string; label?: string }> = [];
  const params = beatData.parameters || {};
  const beatId = beatData.id;
  const beatType = beatData.type;

  // movementChoice - choices[].target
  if (beatType === 'movementChoice' && params.choices) {
    params.choices.forEach((choice: any, index: number) => {
      const target = extractTargetId(choice.target) || extractTargetId(choice);
      if (target) {
        connections.push({
          source: beatId,
          target: target,
          label: choice.text || choice.location || `Choice ${index + 1}`,
        });
      }
    });
  }

  // dialogTree - choices[].target or entries[].choices[].target
  if (beatType === 'dialogTree' && params.dialogTree) {
    const processChoices = (choices: any[], prefix: string) => {
      if (!Array.isArray(choices)) return;
      choices.forEach((choice: any, index: number) => {
        const target = extractTargetId(choice.target);
        if (target) {
          connections.push({
            source: beatId,
            target: target,
            label: choice.text || `Choice ${index + 1}`,
          });
        }
      });
    };

    // Direct choices array
    if (params.dialogTree.choices) {
      processChoices(params.dialogTree.choices, 'choice');
    }

    // Entries array with nested choices
    if (params.dialogTree.entries) {
      params.dialogTree.entries.forEach((entry: any, entryIndex: number) => {
        if (entry.choices) {
          processChoices(entry.choices, `entry${entryIndex}`);
        }
      });
    }
  }

  // pickProp - props[].target
  if (beatType === 'pickProp' && params.props) {
    params.props.forEach((prop: any, index: number) => {
      const target = extractTargetId(prop.target);
      if (target) {
        connections.push({
          source: beatId,
          target: target,
          label: prop.name || `Prop ${index + 1}`,
        });
      }
    });
  }

  // hyperText - hyperlinks[].targetBeatId
  if (beatType === 'hyperText' && params.hyperlinks) {
    params.hyperlinks.forEach((link: any, index: number) => {
      if (link.targetBeatId) {
        connections.push({
          source: beatId,
          target: link.targetBeatId,
          label: link.word || `Link ${index + 1}`,
        });
      }
    });
  }

  // conditionBeat - trueTarget, falseTarget
  // IMPORTANT: Labels must be lowercase 'true'/'false' to match Inspector.tsx expectations
  if (beatType === 'conditionBeat') {
    if (params.trueTarget) {
      connections.push({
        source: beatId,
        target: params.trueTarget,
        label: 'true',
      });
    }
    if (params.falseTarget) {
      connections.push({
        source: beatId,
        target: params.falseTarget,
        label: 'false',
      });
    }
  }

  // randomTarget - choices[].target
  if (beatType === 'randomTarget' && params.choices) {
    params.choices.forEach((choice: any, index: number) => {
      const target = typeof choice === 'string' ? choice : extractTargetId(choice.target) || extractTargetId(choice);
      if (target) {
        connections.push({
          source: beatId,
          target: target,
          label: `Random ${index + 1}`,
        });
      }
    });
  }

  // setTimer - timerTarget
  if (beatType === 'setTimer' && params.timerTarget) {
    connections.push({
      source: beatId,
      target: params.timerTarget,
      label: 'Timer Target',
    });
  }

  return connections;
}

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
 * Migrate hyperText beats that have bracketed text but no hyperlinks array
 * Extracts [bracketed text] and creates hyperlinks from them
 */
function migrateHyperTextBrackets(beatData: any): void {
  if (beatData.type !== 'hyperText') return;

  const params = beatData.parameters || {};

  // If text contains [bracketed] text but hyperlinks array is empty/missing, extract them
  if (params.text && (!params.hyperlinks || params.hyperlinks.length === 0)) {
    const bracketRegex = /\[([^\]]+)\]/g;
    const matches = [...params.text.matchAll(bracketRegex)];

    if (matches.length > 0) {
      console.log(`[migrateHyperText] Found ${matches.length} bracketed text in beat ${beatData.id}, extracting as hyperlinks`);

      // Create hyperlinks from bracketed text
      params.hyperlinks = [];
      const connections = beatData.connections || [];

      matches.forEach((match: RegExpMatchArray, index: number) => {
        const word = match[1]; // Text inside brackets
        // Try to find corresponding target from connections
        const targetConnection = connections[index];
        const targetBeatId = targetConnection?.targetId || targetConnection?.target || `${beatData.id}_link_${index}`;

        params.hyperlinks.push({
          word: word,
          targetBeatId: targetBeatId
        });

        console.log(`[migrateHyperText] Created hyperlink: "${word}" → ${targetBeatId}`);
      });

      // Remove brackets from the text itself
      params.text = params.text.replace(bracketRegex, '$1');
      console.log(`[migrateHyperText] Cleaned text (removed brackets)`);

      // Update beatData.parameters
      beatData.parameters = params;
    }
  }

  // Also normalize hyperlink property names if needed
  if (params.hyperlinks && Array.isArray(params.hyperlinks)) {
    params.hyperlinks = params.hyperlinks.map((link: any) => ({
      word: link.word || link.text || link.phrase,
      targetBeatId: link.targetBeatId || link.target || link.beatId,
      style: link.style
    }));
  }
}

/**
 * Normalize beat type aliases to canonical names
 * This ensures consistent naming across the UI
 */
const BEAT_TYPE_ALIASES: Record<string, string> = {
  'variable': 'setVariable',
  'counter': 'setVariable',
  'setCounter': 'setVariable',
  'setGlobal': 'setVariable',
  'condition': 'conditionBeat',
  'conditionCheck': 'conditionBeat',
  'addInventory': 'addRemoveInventory',
  'removeInventory': 'addRemoveInventory',
};

/**
 * Normalize beat type to canonical name
 */
function normalizeBeatType(type: string): string {
  return BEAT_TYPE_ALIASES[type] || type;
}

/**
 * Deserialize beats from stored project data
 * Converts plain objects back into Beat class instances
 */
export function deserializeBeats(beatsData: any[]): Beat[] {
  const registry = BeatTypeRegistry.getInstance();
  const beats: Beat[] = [];

  console.log('[deserializeBeats] Starting to deserialize', beatsData.length, 'beats');

  // Log AI beat types specifically for debugging
  const aiBeatTypes = ['onlineContent', 'aiCondition', 'aiDialogTree', 'aiSummary'];
  const aiBeatsFound = beatsData.filter((b: any) => aiBeatTypes.includes(b.type));
  if (aiBeatsFound.length > 0) {
    console.log('[deserializeBeats] Found AI beats:', aiBeatsFound.map((b: any) => ({ id: b.id, type: b.type, name: b.name })));
  }

  for (const beatData of beatsData) {
    try {
      // Ensure we have the required fields
      if (!beatData.type || !beatData.id) {
        console.warn('[deserializeBeats] Beat missing type or id:', beatData);
        continue;
      }

      // Extra logging for AI beats
      if (aiBeatTypes.includes(beatData.type)) {
        console.log(`[deserializeBeats] Processing AI beat: ${beatData.type} - ${beatData.id}`, {
          hasParameters: !!beatData.parameters,
          parameterKeys: beatData.parameters ? Object.keys(beatData.parameters) : []
        });
      }

      // Normalize beat type aliases to canonical names
      const originalType = beatData.type;
      const normalizedType = normalizeBeatType(beatData.type);
      if (normalizedType !== originalType) {
        console.log(`[deserializeBeats] Normalized beat type: "${originalType}" → "${normalizedType}" for beat ${beatData.id}`);
        beatData.type = normalizedType;

        // For variable/counter aliases, ensure parameters.type is set correctly
        if (originalType === 'counter' || originalType === 'setCounter') {
          beatData.parameters = beatData.parameters || {};
          beatData.parameters.type = 'counter';
        } else if (originalType === 'variable') {
          beatData.parameters = beatData.parameters || {};
          beatData.parameters.type = 'variable';
        }
        // For addInventory/removeInventory aliases, set the action parameter
        if (originalType === 'addInventory') {
          beatData.parameters = beatData.parameters || {};
          beatData.parameters.action = 'add';
        } else if (originalType === 'removeInventory') {
          beatData.parameters = beatData.parameters || {};
          beatData.parameters.action = 'remove';
        }
      }

      console.log('[deserializeBeats] Processing beat:', {
        id: beatData.id,
        name: beatData.name || 'unnamed',
        type: beatData.type
      });
      // Log location positions during deserialization
      if (beatData.locations && beatData.locations.length > 0) {
        console.log(`[deserializeBeats] Beat ${beatData.id} has ${beatData.locations.length} locations:`);
        beatData.locations.forEach((loc: any) => {
          console.log(`[deserializeBeats]   - "${loc.name}": x=${loc.x}, y=${loc.y}, size=${loc.size}`);
        });
      }

      // Apply migrations for deprecated features
      migrateDialogTreeDefaultConnection(beatData);
      migrateHyperTextBrackets(beatData);

      // === CLEANUP: Remove legacy duplicate/internal fields ===
      const params = beatData.parameters || {};

      // 1. Remove _rawHyperlinks (internal editor field) - whether empty or not
      if (params._rawHyperlinks !== undefined) {
        delete params._rawHyperlinks;
        console.log(`[deserializeBeats] Removed _rawHyperlinks from beat ${beatData.id}`);
      }

      // 2. Remove empty locs array (internal field)
      if (params.locs !== undefined && Array.isArray(params.locs) && params.locs.length === 0) {
        delete params.locs;
      }

      // 3. For dialogTree, remove duplicate speaker/text/emotion from parameters root
      // (they should only be in parameters.dialogTree)
      if (beatData.type === 'dialogTree' && params.dialogTree) {
        if (params.speaker !== undefined && params.dialogTree.speaker !== undefined) {
          delete params.speaker;
        }
        if (params.text !== undefined && params.dialogTree.text !== undefined) {
          delete params.text;
        }
        if (params.emotion !== undefined && params.dialogTree.emotion !== undefined) {
          delete params.emotion;
        }
      }

      // 4. For conditionBeat with inventory type, convert variableName → item
      if (beatData.type === 'conditionBeat' && params.conditionType === 'inventory') {
        if (params.variableName && !params.item) {
          params.item = params.variableName;
          console.log(`[deserializeBeats] Converted variableName → item for conditionBeat ${beatData.id}: ${params.item}`);
        }
        // Also fix condition object
        if (params.condition && params.condition.type === 'inventory') {
          if (!params.condition.item && params.variableName) {
            params.condition.item = params.variableName;
          }
        }
      }

      // 5. For beats with derived connections, deduplicate by targetId
      // (remove connections with same target but different labels - keep only one)
      const BEATS_WITH_DERIVED_CONNECTIONS = ['dialogTree', 'movementChoice', 'pickProp', 'hyperText', 'conditionBeat', 'randomTarget'];
      if (BEATS_WITH_DERIVED_CONNECTIONS.includes(beatData.type) && beatData.connections) {
        const seenTargets = new Set<string>();
        beatData.connections = beatData.connections.filter((conn: any) => {
          const targetId = conn.targetId || conn.target;
          if (!targetId) return false;
          if (seenTargets.has(targetId)) {
            console.log(`[deserializeBeats] Removed duplicate connection to ${targetId} from beat ${beatData.id}`);
            return false;
          }
          seenTargets.add(targetId);
          return true;
        });
      }

      beatData.parameters = params;

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
        notes: beatData.notes,
        parameters: beatData.parameters || {}
      };

      // Create Beat instance using registry
      const beat = registry.createBeat(beatData.type, config);

      // Update beat with parameters if they exist
      if (beatData.parameters) {
        beat.updateParameters(beatData.parameters);

        // Ensure animations are set on the beat (updateParameters doesn't handle this)
        if (beatData.parameters.animations) {
          console.log(`[deserializeBeats] Setting animations on beat ${beatData.id}:`, beatData.parameters.animations.length, beatData.parameters.animations);
          beat.animations = beatData.parameters.animations;
        }
      }

      // CRITICAL FIX: For inputText, ensure variableName is applied to variable
      // AI generates 'variableName' but InputTextBeat uses 'variable'
      if (beatData.type === 'inputText' && beatData.parameters) {
        const inputBeat = beat as any;
        if (beatData.parameters.variableName && inputBeat.variable === 'userInput') {
          inputBeat.variable = beatData.parameters.variableName;
          console.log(`[deserializeBeats] InputTextBeat: Set variable from variableName: "${inputBeat.variable}"`);
        }
      }

      // CRITICAL FIX: For conditionBeat, ensure trueTarget/falseTarget are set directly
      // Sometimes these get lost during deserialization even though they're in parameters
      if (beatData.type === 'conditionBeat' && beatData.parameters) {
        const conditionBeat = beat as any;
        if (beatData.parameters.trueTarget && !conditionBeat.trueTarget) {
          conditionBeat.trueTarget = beatData.parameters.trueTarget;
          console.log(`[deserializeBeats] Set trueTarget from parameters: ${conditionBeat.trueTarget}`);
        }
        if (beatData.parameters.falseTarget && !conditionBeat.falseTarget) {
          conditionBeat.falseTarget = beatData.parameters.falseTarget;
          console.log(`[deserializeBeats] Set falseTarget from parameters: ${conditionBeat.falseTarget}`);
        }
        // Log the current state
        console.log(`[deserializeBeats] ConditionBeat ${beat.id}: trueTarget=${conditionBeat.trueTarget}, falseTarget=${conditionBeat.falseTarget}, params.trueTarget=${beatData.parameters.trueTarget}, params.falseTarget=${beatData.parameters.falseTarget}`);
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
  containerBeatPositions: any[];
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
  // CRITICAL: Project name takes precedence over story metadata title
  // This ensures the UI shows consistent project name, not internal story title
  let title = project.name || 'Untitled Project';
  let author = 'Unknown Author';

  if (story.getMetadata && typeof story.getMetadata === 'function') {
    const metadata = story.getMetadata();
    // Only use story title if project has no name or is "Untitled Project"
    if ((!project.name || project.name === 'Untitled Project') && metadata?.title) {
      title = metadata.title;
    }
    author = metadata?.author || author;
  } else if (story.metadata) {
    // Only use story title if project has no name or is "Untitled Project"
    if ((!project.name || project.name === 'Untitled Project') && story.metadata.title) {
      title = story.metadata.title;
    }
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

  // Extract container beat positions
  let containerBeatPositions: any[] = [];
  if (story.containerBeatPositions) {
    // Handle both array and object formats
    if (Array.isArray(story.containerBeatPositions)) {
      containerBeatPositions = story.containerBeatPositions;
    } else if (typeof story.containerBeatPositions === 'object') {
      // Convert object format to array if needed
      containerBeatPositions = Object.values(story.containerBeatPositions);
    }
  }
  console.log('[loadProjectData] Container beat positions found:', containerBeatPositions.length);

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

  // CRITICAL: Also derive connections from multi-connection beat parameters
  // This handles beats like dialogTree, movementChoice, pickProp, conditionBeat, etc.
  // that store targets in parameters rather than connections array
  const existingConnectionKeys = new Set(
    connections.map((c: any) => `${c.source || c.sourceId}->${c.target || c.targetId}`)
  );

  // Create a map of beat ID to Beat instance for easy lookup
  const beatsById = new Map<string, Beat>();
  for (const beat of beats) {
    beatsById.set(beat.id, beat);
  }

  // Beat types that derive their connections via getConnections() from parameters
  // We should NOT add derived connections to beat.connections for these types
  // because they already derive them at runtime, and storing them causes duplication
  const BEAT_TYPES_WITH_DERIVED_CONNECTIONS = [
    'dialogTree',
    'movementChoice',
    'pickProp',
    'hyperText',
    'conditionBeat',
    'randomTarget'
  ];

  for (const beatData of beatsData) {
    const derivedConnections = extractConnectionsFromBeatParameters(beatData);
    for (const conn of derivedConnections) {
      const key = `${conn.source}->${conn.target}`;

      // Add to story-level connections array if not already there
      if (!existingConnectionKeys.has(key)) {
        existingConnectionKeys.add(key);
        connections.push(conn);
      }

      const beat = beatsById.get(conn.source);
      if (beat) {
        // For beat types that derive their own connections via getConnections(),
        // do NOT add to beat.connections - they will be derived at runtime.
        // This prevents duplication on each save/load cycle.
        // Only add for simple beat types that don't override getConnections().
        if (!BEAT_TYPES_WITH_DERIVED_CONNECTIONS.includes(beat.type)) {
          const beatConnection = {
            targetId: conn.target,
            label: conn.label,
          };
          const alreadyExists = beat.connections.some(
            (c: any) => c.targetId === conn.target || c.target === conn.target
          );
          if (!alreadyExists) {
            beat.connections.push(beatConnection);
            console.log(`[loadProjectData] Added derived connection to beat ${conn.source}: -> ${conn.target}`);
          }
        }

        // ALSO update beat-specific target properties for inspector compatibility
        // ConditionBeat stores trueTarget/falseTarget as class properties
        // Labels are lowercase 'true'/'false' to match Inspector.tsx expectations
        if (beat.type === 'conditionBeat') {
          if (conn.label === 'true' && !(beat as any).trueTarget) {
            (beat as any).trueTarget = conn.target;
            console.log(`[loadProjectData] Set trueTarget on conditionBeat ${conn.source}: ${conn.target}`);
          }
          if (conn.label === 'false' && !(beat as any).falseTarget) {
            (beat as any).falseTarget = conn.target;
            console.log(`[loadProjectData] Set falseTarget on conditionBeat ${conn.source}: ${conn.target}`);
          }
        }
      }
    }
  }

  console.log('[loadProjectData] After parameter derivation, total connections:', connections.length);

  console.log('[loadProjectData] Final loaded data:', {
    title,
    beats: beats.length,
    connections: connections.length,
    characters: characters.length,
    clusters: clusters.length,
    containerBeatPositions: containerBeatPositions.length
  });

  return {
    beats,
    title,
    author,
    settings,
    environment,
    characters,
    clusters,
    connections,
    containerBeatPositions
  };
}
