import { Story } from '../engine/Story';
import { Beat } from '../beats/Beat';
import { BeatTypeRegistry } from '../beats/BeatRegistry';
import type { 
  BeatConfig, 
  Transition, 
  Sound, 
  Location, 
  Connection,
  Condition,
  Effect 
} from '../types';

export class ASMLParser {
  private beatTypeRegistry: BeatTypeRegistry;
  private warnings: string[] = [];
  private errors: string[] = [];

  constructor() {
    this.beatTypeRegistry = BeatTypeRegistry.getInstance();
  }

  /**
   * Parse ASML XML content into a Story object
   */
  async parse(xmlContent: string): Promise<{
    success: boolean;
    story?: Story;
    errors: string[];
    warnings: string[];
  }> {
    this.warnings = [];
    this.errors = [];

    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');
      
      // Check for XML parsing errors
      const parserError = xmlDoc.querySelector('parsererror');
      if (parserError) {
        this.errors.push(`XML parsing error: ${parserError.textContent}`);
        return { success: false, errors: this.errors, warnings: this.warnings };
      }

      const storyElement = xmlDoc.querySelector('story');
      if (!storyElement) {
        this.errors.push('No <story> element found');
        return { success: false, errors: this.errors, warnings: this.warnings };
      }

      const story = new Story();

      // Parse metadata
      const metadata = {
        title: storyElement.getAttribute('title') || 'Untitled Story',
        author: storyElement.getAttribute('author') || 'Unknown',
        version: storyElement.getAttribute('version') || '1.0.0'
      };
      story.setMetadata(metadata);

      // Parse settings
      const settingsElement = storyElement.querySelector('settings');
      if (settingsElement) {
        story.setSettings(this.parseSettings(settingsElement));
      }

      // Parse environment
      const environmentElement = storyElement.querySelector('environment');
      if (environmentElement) {
        story.setEnvironment(this.parseEnvironment(environmentElement));
      }

      // Parse characters
      const charactersElement = storyElement.querySelector('characters');
      if (charactersElement) {
        story.setCharacters(this.parseCharacters(charactersElement));
      }

      // Parse plot (beats)
      const plotElement = storyElement.querySelector('plot');
      if (plotElement) {
        const { clusters, beats } = this.parsePlot(plotElement);
        
        // Apply layout to beats before adding to story
        this.applyLayout(beats);
        
        // Add all beats to the story
        beats.forEach(beat => {
          if (beat) {
            story.addBeat(beat);
          }
        });
      }

      return {
        success: true,
        story,
        errors: this.errors,
        warnings: this.warnings
      };
    } catch (error: any) {
      this.errors.push(`Fatal error: ${error.message}`);
      return { success: false, errors: this.errors, warnings: this.warnings };
    }
  }

  /**
   * Apply enhanced hierarchical layout to imported beats
   * Only positions beats that don't already have saved positions
   */
  private applyLayout(beats: Beat[]): void {
    if (beats.length === 0) return;
    
    // Separate beats into positioned and unpositioned
    const positionedBeats = beats.filter(beat => 
      beat.x !== undefined && beat.y !== undefined
    );
    const unpositionedBeats = beats.filter(beat => 
      beat.x === undefined || beat.y === undefined
    );
    
    // If all beats are positioned, skip auto-layout
    if (unpositionedBeats.length === 0) {
      console.log('All beats have saved positions, skipping auto-layout');
      return;
    }
    
    // If only some beats are positioned, only layout the unpositioned ones
    if (positionedBeats.length > 0) {
      console.log(`${positionedBeats.length} beats have saved positions, ` +
                  `applying auto-layout to ${unpositionedBeats.length} unpositioned beats`);
    }
    
    // Apply layout only to unpositioned beats
    const beatsToLayout = unpositionedBeats.length > 0 ? unpositionedBeats : beats;
    
    console.log('Starting enhanced auto-layout for', beatsToLayout.length, 'beats');
    
    // Create adjacency map for connections
    const connections = new Map<string, string[]>();
    const incomingCount = new Map<string, number>();
    
    // Initialize beats to be laid out
    beatsToLayout.forEach(beat => {
      connections.set(beat.id, []);
      incomingCount.set(beat.id, 0);
    });
    
    // Build connection graph
    beatsToLayout.forEach(beat => {
      const beatConnections = beat.getConnections();
      beatConnections.forEach(conn => {
        if (connections.has(beat.id)) {
          connections.get(beat.id)!.push(conn.targetId);
        }
        // Increase incoming count for target beat
        const currentCount = incomingCount.get(conn.targetId) || 0;
        incomingCount.set(conn.targetId, currentCount + 1);
      });
    });
    
    // Find start beat (beat with no incoming connections, or ID "0")
    let startBeat = beatsToLayout.find(beat => beat.id === '0');
    if (!startBeat) {
      startBeat = beatsToLayout.find(beat => (incomingCount.get(beat.id) || 0) === 0);
    }
    if (!startBeat) {
      startBeat = beatsToLayout[0]; // fallback to first beat
    }
    
    console.log('Start beat:', startBeat.id);
    
    // Perform layered layout using modified Sugiyama algorithm
    const layers = this.createLayers(beatsToLayout, connections, incomingCount, startBeat);
    
    // Position beats within layers
    this.positionBeatsInLayers(layers);
    
    console.log('Layout complete. Layers:', layers.length);
  }

  private createLayers(
    beats: Beat[], 
    connections: Map<string, string[]>, 
    incomingCount: Map<string, number>,
    startBeat: Beat
  ): Beat[][] {
    const layers: Beat[][] = [];
    const visited = new Set<string>();
    const beatMap = new Map<string, Beat>();
    
    // Create beat lookup map
    beats.forEach(beat => beatMap.set(beat.id, beat));
    
    // Level assignment using BFS with cycle detection
    const queue: Array<{beat: Beat, level: number}> = [];
    const beatLevels = new Map<string, number>();
    
    // Start with the initial beat
    queue.push({beat: startBeat, level: 0});
    beatLevels.set(startBeat.id, 0);
    
    // Process beats level by level
    while (queue.length > 0) {
      const {beat, level} = queue.shift()!;
      
      if (visited.has(beat.id)) continue;
      visited.add(beat.id);
      
      // Ensure we have enough layers
      while (layers.length <= level) {
        layers.push([]);
      }
      
      layers[level].push(beat);
      
      // Add connected beats to next level
      const nextConnections = connections.get(beat.id) || [];
      for (const targetId of nextConnections) {
        const targetBeat = beatMap.get(targetId);
        if (targetBeat && !visited.has(targetId)) {
          // Check if target should be at a deeper level
          const suggestedLevel = level + 1;
          const currentLevel = beatLevels.get(targetId);
          
          if (currentLevel === undefined || suggestedLevel > currentLevel) {
            beatLevels.set(targetId, suggestedLevel);
            // Remove from previous layer if exists
            if (currentLevel !== undefined && layers[currentLevel]) {
              layers[currentLevel] = layers[currentLevel].filter(b => b.id !== targetId);
            }
            queue.push({beat: targetBeat, level: suggestedLevel});
          }
        }
      }
    }
    
    // Handle disconnected beats (put them in the last layer)
    const unvisitedBeats = beats.filter((beat: Beat) => !visited.has(beat.id));
    if (unvisitedBeats.length > 0) {
      console.log('Adding', unvisitedBeats.length, 'disconnected beats to final layer');
      const lastLayerIndex = Math.max(0, layers.length);
      while (layers.length <= lastLayerIndex) {
        layers.push([]);
      }
      layers[lastLayerIndex].push(...unvisitedBeats);
    }
    
    return layers.filter(layer => layer.length > 0);
  }
  
  private positionBeatsInLayers(layers: Beat[][]): void {
    const LAYER_HEIGHT = 200; // Vertical spacing between layers
    const BEAT_WIDTH = 160;   // Width of each beat
    const BEAT_SPACING = 40;  // Horizontal spacing between beats
    const START_Y = 100;      // Starting Y position
    
    layers.forEach((layer, layerIndex) => {
      const layerY = START_Y + (layerIndex * LAYER_HEIGHT);
      
      // Calculate total width needed for this layer
      const totalWidth = (layer.length * BEAT_WIDTH) + ((layer.length - 1) * BEAT_SPACING);
      
      // Center the layer horizontally
      const startX = Math.max(100, (1200 - totalWidth) / 2); // Assume canvas width ~1200px
      
      layer.forEach((beat, beatIndex) => {
        const beatX = startX + (beatIndex * (BEAT_WIDTH + BEAT_SPACING));
        
        beat.x = beatX;
        beat.y = layerY;
        
        console.log(`Positioned beat ${beat.id} (${beat.name}) at (${beatX}, ${layerY})`);
      });
    });
  }

  /**
   * Parse settings element
   */
  private parseSettings(settingsElement: Element): any {
    const settings: any = {};

    // Debug settings
    const debugElement = settingsElement.querySelector('debug');
    if (debugElement) {
      settings.debug = {
        firstbeat: debugElement.getAttribute('firstbeat') || '0',
        showvals: debugElement.getAttribute('showvals') === 'on'
      };
    }

    // Colors
    const colorsElement = settingsElement.querySelector('colors');
    if (colorsElement) {
      settings.colors = {
        pcolor: colorsElement.getAttribute('pcolor'),
        palpha: parseInt(colorsElement.getAttribute('palpha') || '100')
      };
    }

    // Fonts
    const fontsElement = settingsElement.querySelector('fonts');
    if (fontsElement) {
      settings.fonts = {
        titleFont: fontsElement.getAttribute('titleFont'),
        textFont: fontsElement.getAttribute('textFont')
      };
    }

    // Textbox
    const textboxElement = settingsElement.querySelector('textbox');
    if (textboxElement) {
      settings.textbox = {
        radius: parseInt(textboxElement.getAttribute('radius') || '0')
      };
    }

    return settings;
  }

  /**
   * Parse environment element
   */
  private parseEnvironment(environmentElement: Element): any {
    const environment: any = {
      props: [],
      nodes: []
    };

    // Parse props
    const propElements = environmentElement.querySelectorAll('prop');
    propElements.forEach(propEl => {
      environment.props.push({
        id: propEl.getAttribute('id'),
        name: propEl.getAttribute('name'),
        file: propEl.getAttribute('file'),
        description: propEl.textContent || ''
      });
    });

    // Parse nodes (backgrounds)
    const nodeElements = environmentElement.querySelectorAll('node');
    nodeElements.forEach(nodeEl => {
      environment.nodes.push({
        id: nodeEl.getAttribute('id'),
        name: nodeEl.getAttribute('name'),
        file: nodeEl.getAttribute('file')
      });
    });

    return environment;
  }

  /**
   * Parse characters element - ENHANCED to import all character properties
   */
  private parseCharacters(charactersElement: Element): any[] {
    const characters: any[] = [];

    const characterElements = charactersElement.querySelectorAll('character');
    characterElements.forEach(charEl => {
      const character: any = {
        id: charEl.getAttribute('id'),
        name: charEl.getAttribute('name'),
        displayName: charEl.getAttribute('displayName') || charEl.getAttribute('name'),
        role: charEl.getAttribute('role') || 'npc',
        color: charEl.getAttribute('color'),
        defaultState: charEl.getAttribute('defaultState') || 'default',
        createdAt: charEl.getAttribute('createdAt') || new Date().toISOString(),
        updatedAt: charEl.getAttribute('updatedAt') || new Date().toISOString(),
        visual: { type: 'static' },
        states: [],
        counters: [],
        inventory: []
      };

      // Parse description
      const descriptionEl = charEl.querySelector('description');
      if (descriptionEl) {
        character.description = descriptionEl.textContent || '';
      }

      // Parse tags
      const tagsEl = charEl.querySelector('tags');
      if (tagsEl) {
        const tagsText = tagsEl.textContent || '';
        character.tags = tagsText.split(',').map(t => t.trim()).filter(t => t);
      }

      // Parse visual configuration
      const visualEl = charEl.querySelector('visual');
      if (visualEl) {
        character.visual = {
          type: visualEl.getAttribute('type') || 'static',
          defaultImage: visualEl.getAttribute('defaultImage')
        };

        // Parse sprite sheet if present
        const spriteSheetEl = visualEl.querySelector('spriteSheet');
        if (spriteSheetEl) {
          character.visual.spriteSheet = {
            url: spriteSheetEl.getAttribute('url') || '',
            frameWidth: parseInt(spriteSheetEl.getAttribute('frameWidth') || '32'),
            frameHeight: parseInt(spriteSheetEl.getAttribute('frameHeight') || '32'),
            animations: [] // TODO: Parse animations when implemented
          };
        }
      } else if (charEl.getAttribute('image')) {
        // Backward compatibility with old format
        character.visual.defaultImage = charEl.getAttribute('image');
      }

      // Parse states
      const statesEl = charEl.querySelector('states');
      if (statesEl) {
        const stateElements = statesEl.querySelectorAll('state');
        stateElements.forEach(stateEl => {
          const state: any = {
            id: stateEl.getAttribute('id'),
            name: stateEl.getAttribute('name'),
            displayName: stateEl.getAttribute('displayName') || stateEl.getAttribute('name'),
            visual: {}
          };

          // Parse state visual
          const stateVisualEl = stateEl.querySelector('visual');
          if (stateVisualEl) {
            state.visual.image = stateVisualEl.getAttribute('image');
            state.visual.animation = stateVisualEl.getAttribute('animation');
          }

          character.states.push(state);
        });
      }

      // Ensure at least one default state exists
      if (character.states.length === 0) {
        character.states.push({
          id: 'default',
          name: 'default',
          displayName: 'Default',
          visual: {}
        });
      }

      // Parse counters (enhanced)
      const countersEl = charEl.querySelector('counters');
      if (countersEl) {
        const counterElements = countersEl.querySelectorAll('counter');
        counterElements.forEach(counterEl => {
          character.counters.push({
            name: counterEl.getAttribute('name'),
            displayName: counterEl.getAttribute('displayName') || counterEl.getAttribute('name'),
            value: parseInt(counterEl.getAttribute('value') || '0'),
            min: counterEl.hasAttribute('min') ? parseInt(counterEl.getAttribute('min')!) : undefined,
            max: counterEl.hasAttribute('max') ? parseInt(counterEl.getAttribute('max')!) : undefined,
            visible: counterEl.getAttribute('visible') !== 'false',
            icon: counterEl.getAttribute('icon'),
            color: counterEl.getAttribute('color')
          });
        });
      } else {
        // Backward compatibility - check for old-style counters directly under character
        const oldCounterElements = charEl.querySelectorAll(':scope > counter');
        oldCounterElements.forEach(counterEl => {
          character.counters.push({
            name: counterEl.getAttribute('name'),
            displayName: counterEl.getAttribute('name'),
            value: parseInt(counterEl.getAttribute('value') || '0'),
            min: counterEl.hasAttribute('min') ? parseInt(counterEl.getAttribute('min')!) : 0,
            max: counterEl.hasAttribute('max') ? parseInt(counterEl.getAttribute('max')!) : 100,
            visible: true
          });
        });
      }

      // Parse inventory
      const inventoryEl = charEl.querySelector('inventory');
      if (inventoryEl) {
        const itemElements = inventoryEl.querySelectorAll('item');
        itemElements.forEach(itemEl => {
          const item: any = {
            id: itemEl.getAttribute('id'),
            name: itemEl.getAttribute('name'),
            displayName: itemEl.getAttribute('displayName') || itemEl.getAttribute('name'),
            icon: itemEl.getAttribute('icon') || '',
            quantity: parseInt(itemEl.getAttribute('quantity') || '1'),
            stackable: itemEl.getAttribute('stackable') === 'true',
            category: itemEl.getAttribute('category') || 'misc',
            maxStack: itemEl.hasAttribute('maxStack') ? 
              parseInt(itemEl.getAttribute('maxStack')!) : undefined
          };

          // Parse item description
          const itemDescEl = itemEl.querySelector('description');
          if (itemDescEl) {
            item.description = itemDescEl.textContent || '';
          } else {
            item.description = '';
          }

          character.inventory.push(item);
        });
      }

      characters.push(character);
    });

    return characters;
  }

  /**
   * Parse plot element containing beats
   */
  private parsePlot(plotElement: Element): { clusters: any[], beats: Beat[] } {
    const clusters: any[] = [];
    const beats: Beat[] = [];

    // Parse clusters - support both old and new formats
    const clustersElement = plotElement.querySelector('clusters');
    if (clustersElement) {
      // New format: <cluster id="..." name="..." />
      const clusterElements = clustersElement.querySelectorAll('cluster');
      if (clusterElements.length > 0) {
        clusterElements.forEach(clusterEl => {
          clusters.push({
            id: clusterEl.getAttribute('id'),
            name: clusterEl.getAttribute('name')
          });
        });
      } else {
        // Legacy format: <clusters cluster1="Mom's House" cluster2="Forest" />
        const attributes = Array.from(clustersElement.attributes);
        attributes.forEach((attr, index) => {
          if (attr.name.startsWith('cluster')) {
            const clusterId = `cluster_${index}`;
            const clusterName = attr.value;
            clusters.push({
              id: clusterId,
              name: clusterName
            });
          }
        });

        // Also check if the beats reference clusters by name (we'll create these)
        // and we'll handle the cluster name references in the beat cluster attributes later
      }
    }

    // Parse beats
    const beatElements = plotElement.querySelectorAll('beat');
    beatElements.forEach(beatElement => {
      try {
        const beat = this.parseBeat(beatElement);
        if (beat) {
          beats.push(beat);
        }
      } catch (error: any) {
        this.warnings.push(`Failed to parse beat: ${error.message}`);
      }
    });

    return { clusters, beats };
  }

  /**
   * Parse individual beat element
   */
  private parseBeat(beatElement: Element): Beat | null {
    // Read position attributes from beat element (if present)
    const xAttr = beatElement.getAttribute('x');
    const yAttr = beatElement.getAttribute('y');
    
    // Get beat ID and metadata
    const idElement = beatElement.querySelector('id');
    if (!idElement) {
      this.warnings.push('Beat missing ID element');
      return null;
    }

    const id = idElement.getAttribute('id') || '';
    const name = idElement.getAttribute('name') || `Beat ${id}`;
    const cluster = idElement.getAttribute('cluster');

    // Get beat function/type
    const functionElement = beatElement.querySelector('function');
    if (!functionElement) {
      this.warnings.push(`Beat ${id} missing function element`);
      return null;
    }

    const beatType = functionElement.getAttribute('kind') || '';

    // Create beat configuration
    const config: BeatConfig = {
      id,
      name,
      type: beatType,
      cluster: cluster || undefined
    };

    // Parse transition
    const transitionElement = beatElement.querySelector('transition');
    if (transitionElement) {
      config.transition = this.parseTransition(transitionElement);
    }

    // Parse sound
    const soundElement = beatElement.querySelector('sound');
    if (soundElement) {
      config.sound = this.parseSound(soundElement);
    }

    // Parse locations
    const locsElement = beatElement.querySelector('locs');
    if (locsElement) {
      config.locations = this.parseLocations(locsElement);
    }

    // Parse default target (legacy)
    const defaultTargetElement = beatElement.querySelector('defaulttarget');
    if (defaultTargetElement) {
      config.defaultTarget = defaultTargetElement.getAttribute('targetBeat') || undefined;

      // Parse delay (val attribute)
      const valAttr = defaultTargetElement.getAttribute('val');
      if (valAttr) {
        const delay = parseInt(valAttr);
        if (!isNaN(delay) && delay > 0) {
          (config as any).defaultTargetDelay = delay;
        }
      }

      // Parse showTimer attribute
      const showTimerAttr = defaultTargetElement.getAttribute('showTimer');
      if (showTimerAttr === 'true') {
        (config as any).showTimer = true;
      }
    }

    // Parse beat-specific parameters and connections
    const { parameters, connections } = this.parseBeatFunction(functionElement, beatType, config);
    config.parameters = parameters;

    // Create beat instance
    let beat: Beat;
    try {
      beat = this.beatTypeRegistry.createBeat(beatType, config);
      
      // Store parameters on the beat using updateParameters to ensure proper handling
      if (parameters && beat.updateParameters) {
        console.log('[ASMLParser] About to update beat with parameters:', parameters);
        console.log('[ASMLParser] BEFORE updateParameters - beat.node:', (beat as any).node);
        beat.updateParameters(parameters);
        console.log('[ASMLParser] AFTER updateParameters - beat.node:', (beat as any).node);
        console.log('[ASMLParser] AFTER updateParameters - beat.parameters:', (beat as any).parameters);
      } else {
        console.log('[ASMLParser] No parameters or updateParameters method. Parameters:', parameters);
      }
      
      // Apply saved position if available (prevents auto-layout from overwriting)
      if (xAttr !== null) {
        beat.x = parseInt(xAttr);
      }
      if (yAttr !== null) {
        beat.y = parseInt(yAttr);
      }
      
      // Add connections to the beat
      connections.forEach(conn => beat.addConnection(conn));
      
      return beat;
    } catch (error: any) {
      this.warnings.push(`Failed to create beat ${id} of type ${beatType}: ${error.message}`);
      return null;
    }
  }

  /**
   * Parse beat function element and extract parameters and connections
   */
  private parseBeatFunction(functionElement: Element, beatType: string, config: any): {
    parameters: any;
    connections: Connection[];
  } {
    const parameters: any = {};
    const connections: Connection[] = [];

    // Get simple attributes as parameters
    Array.from(functionElement.attributes).forEach(attr => {
      if (attr.name !== 'kind') {
        // Try to parse as boolean or number if applicable
        let value: any = attr.value;
        if (value === 'true') value = true;
        else if (value === 'false') value = false;
        else if (!isNaN(Number(value)) && value !== '') value = Number(value);
        
        parameters[attr.name] = value;
      }
    });

    // Parse nested elements based on beat type
    switch (beatType) {
      case 'introText':
      case 'titleScreen':
      case 'durScreen':
      case 'endScreen':
      case 'setVariable':
      case 'setCounter':
      case 'videoBeat':
        // These beats have single connections nested in function
        const connectionEl = functionElement.querySelector('connection');
        if (connectionEl) {
          connections.push(this.parseConnection(connectionEl));
        }
        break;
        
      case 'setTimer':
        // Parse timer element for timer-specific parameters
        const timerEl = functionElement.querySelector('timer');
        if (timerEl) {
          parameters.timerName = timerEl.getAttribute('name');
          parameters.name = timerEl.getAttribute('name'); // Compatibility
          parameters.value = parseInt(timerEl.getAttribute('val') || '0');
          parameters.target = timerEl.getAttribute('target');
          parameters.timerTarget = timerEl.getAttribute('target'); // Compatibility
          
          // The timer target is NOT a regular connection - it's stored as a parameter
          // But we do need to create a special connection for graph visualization
          if (parameters.target) {
            connections.push({
              targetId: parameters.target,
              label: 'Timer Target'
            });
          }
        }
        
        // ALSO parse regular connection for immediate next beat
        const normalConnectionEl = functionElement.querySelector('connection');
        if (normalConnectionEl) {
          connections.push(this.parseConnection(normalConnectionEl));
        }
        
        // Also check for restartConnection (for endScreen)
        const restartConnectionEl = functionElement.querySelector('restartConnection');
        if (restartConnectionEl) {
          connections.push({
            targetId: restartConnectionEl.getAttribute('target') || '0',
            label: 'Restart'
          });
        }
        break;

      case 'movementChoice':
        // Parse delay element if present
        const movementDelayEl = functionElement.querySelector('delay');
        if (movementDelayEl) {
          const val = movementDelayEl.getAttribute('val');
          if (val) {
            const delay = parseFloat(val);
            if (!isNaN(delay) && delay > 0) {
              parameters.choiceDelay = delay;
            }
          }
        }

        // Parse choices which contain targets
        const choices: any[] = [];
        const choiceElements = functionElement.querySelectorAll('choice');
        choiceElements.forEach(choiceEl => {
          const choice = {
            id: choiceEl.getAttribute('id'),
            text: choiceEl.getAttribute('text'),
            location: choiceEl.getAttribute('location'),
            target: choiceEl.getAttribute('target')
          };
          choices.push(choice);

          // Import buttonsound attribute → add/update location with sound
          const buttonsound = choiceEl.getAttribute('buttonsound');
          if (buttonsound && choice.location && config.locations) {
            // Find existing location by name and add sound to it
            const existingLoc = config.locations.find((loc: any) => loc.name === choice.location);
            if (existingLoc) {
              existingLoc.sound = buttonsound;
            } else {
              // Create a minimal location for this choice with sound
              config.locations.push({
                kind: 'hotspot',
                name: choice.location,
                x: 0,
                y: 0,
                width: 100,
                height: 100,
                sound: buttonsound
              });
            }
          }

          // Add connection for this choice
          if (choice.target) {
            connections.push({
              targetId: choice.target,
              label: choice.text || undefined
            });
          }
        });
        parameters.choices = choices;
        break;

      case 'pickProp':
        // Parse delay element if present
        const pickPropDelayEl = functionElement.querySelector('delay');
        if (pickPropDelayEl) {
          const val = pickPropDelayEl.getAttribute('val');
          if (val) {
            const delay = parseFloat(val);
            if (!isNaN(delay) && delay > 0) {
              parameters.choiceDelay = delay;
            }
          }
        }

        // Parse props which contain targets
        const props: any[] = [];
        const propElements = functionElement.querySelectorAll('prop');
        propElements.forEach(propEl => {
          const prop = {
            id: propEl.getAttribute('id'),
            name: propEl.getAttribute('name'),
            description: propEl.getAttribute('description'),
            target: propEl.getAttribute('target')
          };
          props.push(prop);

          // Import buttonsound attribute → add/update location with sound
          const buttonsound = propEl.getAttribute('buttonsound');
          if (buttonsound && prop.name && config.locations) {
            // For props, the location name matches the prop name
            const existingLoc = config.locations.find((loc: any) => loc.name === prop.name);
            if (existingLoc) {
              existingLoc.sound = buttonsound;
            } else {
              // Create a minimal location for this prop with sound
              config.locations.push({
                kind: 'prop',
                name: prop.name,
                x: 0,
                y: 0,
                width: 100,
                height: 100,
                sound: buttonsound
              });
            }
          }

          // Add connection for this prop
          if (prop.target) {
            connections.push({
              targetId: prop.target,
              label: prop.name || undefined
            });
          }
        });
        parameters.props = props;
        break;

      case 'dialogTree':
        // Parse delay element if present
        const dialogDelayEl = functionElement.querySelector('delay');
        if (dialogDelayEl) {
          const val = dialogDelayEl.getAttribute('val');
          if (val) {
            const delay = parseFloat(val);
            if (!isNaN(delay) && delay > 0) {
              parameters.choiceDelay = delay;
            }
          }
        }

        // Parse dialog tree - the function element IS the dialog tree
        parameters.dialogTree = this.parseDialogTree(functionElement, config);

        // Extract connections from dialog choices
        this.extractDialogConnections(parameters.dialogTree, connections);

        // Also check for default connection after dialog
        const defaultConnEl = functionElement.querySelector(':scope > connection');
        if (defaultConnEl) {
          connections.push(this.parseConnection(defaultConnEl));
        }
        break;

      case 'conditionBeat':
        // Parse condition
        const conditionEl = functionElement.querySelector('condition');
        if (conditionEl) {
          parameters.condition = this.parseCondition(conditionEl);
        }
        
        // Parse true/false targets
        const trueTargetEl = functionElement.querySelector('trueTarget');
        const falseTargetEl = functionElement.querySelector('falseTarget');
        
        if (trueTargetEl) {
          const targetBeat = trueTargetEl.getAttribute('targetBeat');
          if (targetBeat) {
            connections.push({
              targetId: targetBeat,
              label: 'true'
            });
            parameters.trueTarget = targetBeat;
          }
        }
        
        if (falseTargetEl) {
          const targetBeat = falseTargetEl.getAttribute('targetBeat');
          if (targetBeat) {
            connections.push({
              targetId: targetBeat,
              label: 'false'
            });
            parameters.falseTarget = targetBeat;
          }
        }
        break;

      case 'conversationChoice':
        // Legacy beat type - parse similar to dialogTree
        const questioner = functionElement.querySelector('questioner');
        const question = functionElement.querySelector('question');
        
        if (questioner) {
          parameters.questioner = questioner.textContent;
        }
        if (question) {
          parameters.question = question.textContent;
        }
        
        // Parse choices
        const convChoices: any[] = [];
        const convChoiceElements = functionElement.querySelectorAll('choice');
        convChoiceElements.forEach(choiceEl => {
          const choice = {
            text: choiceEl.textContent,
            target: choiceEl.getAttribute('targetBeat') || choiceEl.getAttribute('target')
          };
          convChoices.push(choice);
          
          if (choice.target) {
            connections.push({
              targetId: choice.target,
              label: choice.text || undefined
            });
          }
        });
        parameters.choices = convChoices;
        break;

      case 'randomTarget':
        // Parse random target choices
        const randomChoices: string[] = [];
        const randomChoiceElements = functionElement.querySelectorAll('choice');
        randomChoiceElements.forEach(choiceEl => {
          const targetBeat = choiceEl.getAttribute('targetBeat');
          if (targetBeat) {
            randomChoices.push(targetBeat);
            // Add connection for visualization
            connections.push({
              targetId: targetBeat,
              label: `Random ${randomChoices.length}`
            });
          }
        });
        parameters.choices = randomChoices;
        break;
        
      default:
        // For unknown beat types, try to parse generic connection
        const genericConnEl = functionElement.querySelector('connection');
        if (genericConnEl) {
          connections.push(this.parseConnection(genericConnEl));
        }
        break;
    }

    // Also parse any intro, button, buttonsound, target elements (legacy format)
    const introEl = functionElement.querySelector('intro');
    if (introEl) {
      parameters.text = introEl.textContent;
    }

    const buttonEl = functionElement.querySelector('button');
    if (buttonEl) {
      parameters.buttonText = buttonEl.textContent;
    }

    const targetEl = functionElement.querySelector('target');
    if (targetEl && connections.length === 0) {
      const targetBeat = targetEl.getAttribute('targetBeat');
      if (targetBeat && targetBeat !== 'undefined') {
        connections.push({
          targetId: targetBeat,
          label: parameters.buttonText || undefined
        });
      }
    }

    // Import buttonsound from connection elements for single-connection beats
    const connectionEl = functionElement.querySelector('connection');
    if (connectionEl) {
      const buttonsound = connectionEl.getAttribute('buttonsound');
      if (buttonsound && config.locations) {
        // Create or update a button location with the sound
        const existingButtonLoc = config.locations.find((loc: any) => loc.kind === 'button');
        if (existingButtonLoc) {
          existingButtonLoc.sound = buttonsound;
        } else {
          // Create a button location with sound
          config.locations.push({
            kind: 'button',
            name: 'button',
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            sound: buttonsound
          });
        }
      }
    }

    // Handle arbitrary nested elements (like <node>) for all beat types
    // This is a catch-all for elements not handled in the switch cases
    functionElement.querySelectorAll(':scope > *').forEach(childEl => {
      const tagName = childEl.tagName.toLowerCase();
      // Skip elements already handled in switch cases
      if (['connection', 'choice', 'prop', 'button', 'target', 'condition', 'truetarget', 'falsetarget', 'set', 'addmarker', 'removemarker', 'capture', 'questioner', 'question', 'variable', 'timer', 'itemaction', 'score', 'lives', 'image'].includes(tagName)) {
        return;
      }

      // Handle <node> element for background asset
      if (tagName === 'node' && childEl.textContent) {
        parameters.node = childEl.textContent;
        console.log('[ASMLParser.parseBeatFunction] Found <node> element with value:', parameters.node);
      }
      // Could add other generic handlers here if needed
    });

    console.log('[ASMLParser.parseBeatFunction] FINAL parameters:', parameters);

    return { parameters, connections };
  }

  /**
   * Parse dialog tree structure
   * Supports both new simplified format and old format for backward compatibility:
   * - New format: <choice><dialogTree>...</dialogTree></choice>
   * - Old format: <choice><target><dialogTree>...</dialogTree></target></choice>
   */
  private parseDialogTree(dialogTreeEl: Element, config?: any): any {
    const dialogNode: any = {
      id: dialogTreeEl.getAttribute('id'),
      speaker: dialogTreeEl.getAttribute('speaker'),
      text: dialogTreeEl.getAttribute('text'),
      emotion: dialogTreeEl.getAttribute('emotion'),
      choices: []
    };

    // Parse choices
    const choiceElements = dialogTreeEl.querySelectorAll(':scope > choice');
    choiceElements.forEach(choiceEl => {
      const choice: any = {
        id: choiceEl.getAttribute('id'),
        text: choiceEl.getAttribute('text'),
        // Parse counter effects
        counter: choiceEl.getAttribute('counter'),
        counterOperation: choiceEl.getAttribute('operation'),
        counterValue: choiceEl.getAttribute('val') ?
          parseInt(choiceEl.getAttribute('val')!) : undefined
      };

      // target attribute is always a beat ID string (new format)
      const targetAttr = choiceEl.getAttribute('target');
      if (targetAttr) {
        choice.target = targetAttr;
      }

      // Import buttonsound attribute → add/update location with sound
      const buttonsound = choiceEl.getAttribute('buttonsound');
      if (buttonsound && choice.text && config?.locations) {
        // For dialog choices, the location name matches the choice text
        const existingLoc = config.locations.find((loc: any) => loc.name === choice.text);
        if (existingLoc) {
          existingLoc.sound = buttonsound;
        } else {
          // Create a minimal location for this dialog choice with sound
          config.locations.push({
            kind: 'dialog',
            name: choice.text,
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            sound: buttonsound
          });
        }
      }

      // NEW FORMAT: Direct <dialogTree> inside choice (no <target> wrapper)
      const directDialogEl = choiceEl.querySelector(':scope > dialogTree');
      if (directDialogEl) {
        choice.dialogNode = this.parseDialogTree(directDialogEl, config);
      }

      // OLD FORMAT: <target><dialogTree>...</dialogTree></target>
      // (backward compatibility - convert to new format)
      const targetEl = choiceEl.querySelector(':scope > target');
      if (targetEl) {
        const nestedDialogEl = targetEl.querySelector(':scope > dialogTree');
        if (nestedDialogEl) {
          choice.dialogNode = this.parseDialogTree(nestedDialogEl, config);
        }
      }

      // Parse condition if present
      const conditionEl = choiceEl.querySelector(':scope > condition');
      if (conditionEl) {
        choice.conditions = [this.parseCondition(conditionEl)];
      }

      // Parse effects if present
      const effectElements = choiceEl.querySelectorAll(':scope > effect');
      if (effectElements.length > 0) {
        choice.effects = Array.from(effectElements).map(el => this.parseEffect(el));
      }

      // OLD FORMAT: <next> element (backward compatibility - convert to dialogNode)
      const nextEl = choiceEl.querySelector(':scope > next');
      if (nextEl) {
        const nextTarget = nextEl.getAttribute('target');
        if (nextTarget && !choice.target) {
          // next with target becomes the choice's target
          choice.target = nextTarget;
        } else {
          // Nested dialog in next becomes dialogNode
          const nextDialogEl = nextEl.querySelector(':scope > dialogTree');
          if (nextDialogEl && !choice.dialogNode) {
            choice.dialogNode = this.parseDialogTree(nextDialogEl, config);
          }
        }
      }

      dialogNode.choices.push(choice);
    });

    // OLD FORMAT: Direct <next> element on dialogTree (backward compatibility)
    // Convert to a [Continue] choice
    const directNextEl = dialogTreeEl.querySelector(':scope > next');
    console.log(`[ASMLParser.parseDialogTree] id=${dialogNode.id}, found <next>:`, !!directNextEl);
    if (directNextEl) {
      const nextTarget = directNextEl.getAttribute('target');
      console.log(`[ASMLParser.parseDialogTree] <next> target attr:`, nextTarget);
      if (nextTarget) {
        dialogNode.choices.push({
          id: 'auto_continue',
          text: '[Continue]',
          target: nextTarget
        });
        console.log(`[ASMLParser.parseDialogTree] Added [Continue] choice with target:`, nextTarget);
      } else {
        const nextDialogEl = directNextEl.querySelector(':scope > dialogTree');
        console.log(`[ASMLParser.parseDialogTree] <next> has nested <dialogTree>:`, !!nextDialogEl);
        if (nextDialogEl) {
          const nestedNode = this.parseDialogTree(nextDialogEl, config);
          dialogNode.choices.push({
            id: 'auto_continue',
            text: '[Continue]',
            dialogNode: nestedNode
          });
          console.log(`[ASMLParser.parseDialogTree] Added [Continue] choice with nested dialogNode:`, nestedNode.id);
        }
      }
    }

    console.log(`[ASMLParser.parseDialogTree] Final dialogNode id=${dialogNode.id} has ${dialogNode.choices.length} choices`);
    return dialogNode;
  }

  /**
   * Extract connections from dialog tree (new format uses dialogNode, old used target as object)
   */
  private extractDialogConnections(dialogNode: any, connections: Connection[]): void {
    if (!dialogNode) return;

    if (dialogNode.choices) {
      dialogNode.choices.forEach((choice: any) => {
        // New format: target is string (beat ID)
        if (typeof choice.target === 'string' && choice.target) {
          connections.push({
            targetId: choice.target,
            label: choice.text || undefined
          });
        }
        // Recurse into nested dialogNode
        if (choice.dialogNode) {
          this.extractDialogConnections(choice.dialogNode, connections);
        }
      });
    }
  }

  /**
   * Parse transition element
   */
  private parseTransition(transitionElement: Element): Transition {
    return {
      type: (transitionElement.getAttribute('type') || 'none') as any,
      duration: parseFloat(transitionElement.getAttribute('duration') || '500'), // Convert to ms
      direction: (transitionElement.getAttribute('direction') || 'in') as any,
      easing: (transitionElement.getAttribute('easing') || 'ease-in-out') as any
    };
  }

  /**
   * Parse sound element
   */
  private parseSound(soundElement: Element): Sound {
    return {
      file: soundElement.getAttribute('name') || soundElement.getAttribute('file') || '',
      volume: parseFloat(soundElement.getAttribute('volume') || '1'),
      loop: soundElement.getAttribute('loop') === 'true',
      fadeIn: parseFloat(soundElement.getAttribute('fadeIn') || '0'),
      fadeOut: parseFloat(soundElement.getAttribute('fadeOut') || '0')
    };
  }

  /**
   * Parse locations
   */
  private parseLocations(locsElement: Element): Location[] {
    const locations: Location[] = [];

    const locElements = locsElement.querySelectorAll('loc');
    locElements.forEach(locEl => {
      const location: Location = {
        kind: locEl.getAttribute('kind') as any || 'text',
        name: locEl.getAttribute('name') || '',
        x: parseInt(locEl.getAttribute('x') || '0'),
        y: parseInt(locEl.getAttribute('y') || '0'),
        width: parseInt(locEl.getAttribute('width') || '100'),
        height: parseInt(locEl.getAttribute('height') || '100'),
        zIndex: parseInt(locEl.getAttribute('zIndex') || '0')
      };

      // Parse optional properties
      const assetId = locEl.getAttribute('assetId');
      if (assetId) location.assetId = assetId;

      const sound = locEl.getAttribute('sound');
      if (sound) location.sound = sound;

      // Parse font properties
      const font = locEl.getAttribute('font');
      if (font) location.font = font;

      const fontSize = locEl.getAttribute('fontSize');
      if (fontSize) location.fontSize = parseInt(fontSize);

      const textAlign = locEl.getAttribute('textAlign') as 'left' | 'center' | 'right';
      if (textAlign) location.textAlign = textAlign;

      const autosize = locEl.getAttribute('autosize');
      if (autosize) location.autosize = autosize === 'true';

      locations.push(location);
    });

    return locations;
  }

  /**
   * Parse connection element
   */
  private parseConnection(connectionElement: Element): Connection {
    return {
      targetId: connectionElement.getAttribute('target') || '',
      label: connectionElement.getAttribute('label') || undefined
    };
  }

  /**
   * Parse effect element
   */
  private parseEffect(effectElement: Element): Effect {
    const effectType = effectElement.getAttribute('type') || 'setVariable';
    const target = effectElement.getAttribute('target') || '';
    const value = this.parseConditionValue(effectElement.getAttribute('value'));

    return {
      type: effectType as Effect['type'],
      target,
      value
    };
  }

  /**
   * Parse condition element with proper ASML attribute mapping
   */
  private parseCondition(conditionElement: Element): Condition {
    // Support both 'right' and 'val' attributes for backward compatibility
    const rightValue = conditionElement.getAttribute('right');
    const valValue = conditionElement.getAttribute('val');
    
    const conditionType = conditionElement.getAttribute('type') || 'variable';
    let leftValue: string;
    
    // Map attributes based on condition type following ASML standards
    switch (conditionType) {
      case 'counter':
        leftValue = conditionElement.getAttribute('counter') || conditionElement.getAttribute('left') || '';
        break;
      case 'inventory':
        leftValue = conditionElement.getAttribute('character') || conditionElement.getAttribute('left') || '';
        break;
      case 'variable':
        leftValue = conditionElement.getAttribute('name') || conditionElement.getAttribute('left') || '';
        break;
      case 'counterCompare':
        // Special case: counterCompare uses counter1 and counter2, no val needed
        const condition: any = {
          type: conditionType as any,
          operator: (conditionElement.getAttribute('operator') || '==') as any,
          counter1: conditionElement.getAttribute('counter1') || '',
          counter2: conditionElement.getAttribute('counter2') || ''
        };
        return condition;
      default:
        leftValue = conditionElement.getAttribute('left') || '';
        break;
    }
    
    return {
      type: conditionType as any,
      operator: (conditionElement.getAttribute('operator') || '==') as any,
      left: leftValue,
      right: this.parseConditionValue(valValue || rightValue)
    };
  }

  /**
   * Parse condition value (could be string, number, boolean)
   */
  private parseConditionValue(value: string | null): any {
    if (value === null) return null;
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (!isNaN(Number(value)) && value !== '') return Number(value);
    return value;
  }
}