import type { 
  BeatConfig, 
  Connection, 
  Location, 
  Transition, 
  Sound,  
} from '../types';
import type { IRenderer } from '../types';

import { StoryContext } from '../engine/StoryContext';

export abstract class Beat {
  public id: string;
  public name: string;
  public type: string;
  public cluster?: string;
  public transition?: Transition;
  public sound?: Sound;
  public locations: Map<string, Location> = new Map();
  public connections: Connection[] = [];
  public defaultTarget?: string;
  public x?: number;
  public y?: number;
  public node?: string; // Background image/node reference

  constructor(config: BeatConfig) {
    this.id = config.id;
    this.name = config.name;
    this.type = config.type;
    this.cluster = config.cluster;
    this.transition = config.transition;
    this.sound = config.sound;
    this.defaultTarget = config.defaultTarget;
    this.node = (config as any).node || (config.parameters as any)?.node;
    this.x = config.x;
    this.y = config.y;

    // Initialize connections from config
    if (config.connections && Array.isArray(config.connections)) {
      this.connections = config.connections;
    }

    if (config.locations) {
      config.locations.forEach(loc => {
        this.locations.set(loc.name, loc);
      });
    }
  }

  abstract getParameters(): Record<string, any>;
  abstract updateParameters(params: Record<string, any>): void;

  async execute(context: StoryContext, renderer: IRenderer): Promise<string | null> {
    try {
      await this.onEnter(context, renderer);
      
      if (this.transition) {
        await renderer.applyTransition(this.transition);
      }
      
      if (this.sound) {
        await renderer.playSound(this.sound);
      }
      
      // Pass locations to renderer
      const locations = Array.from(this.locations.values());
      if (locations.length > 0) {
        renderer.setState('currentBeatLocations', locations);
      }
      
      // Handle background node with improved lookup
      if (this.node) {
        console.log(`[Beat ${this.id}] Looking up background node: ${this.node}`);
        const story = context.getStory();
        
        if (story) {
          const environment = story.getEnvironment();
          console.log('[Beat] Environment structure:', environment);
          
          // Try multiple lookup paths for compatibility
          let backgroundUrl: string | null = null;
          
          // Path 1: environment.nodes array (new structure)
          if (environment?.nodes && Array.isArray(environment.nodes)) {
            const nodeData = environment.nodes.find((n: any) => n.id === this.node);
            if (nodeData?.url) {
              backgroundUrl = nodeData.url;
              console.log(`[Beat] Found background in nodes array: ${backgroundUrl}`);
            } else if (nodeData?.src) {
              backgroundUrl = nodeData.src;
              console.log(`[Beat] Found background (src format) in nodes array: ${backgroundUrl}`);
            }
          }
          
          // Path 2: Direct environment properties (possible alternative structure)
          if (!backgroundUrl && environment?.[this.node]) {
            const nodeData = environment[this.node];
            if (typeof nodeData === 'string') {
              backgroundUrl = nodeData;
            } else if (nodeData?.src) {
              backgroundUrl = nodeData.src;
            }
            if (backgroundUrl) {
              console.log(`[Beat] Found background in direct property: ${backgroundUrl}`);
            }
          }
          
          // Path 3: Check if node is already a URL
          if (!backgroundUrl && this.node.startsWith('http')) {
            backgroundUrl = this.node;
            console.log(`[Beat] Using node as direct URL: ${backgroundUrl}`);
          }
          
          if (backgroundUrl) {
            renderer.setState('backgroundAssetUrl', backgroundUrl);
            console.log(`[Beat] Set background URL: ${backgroundUrl}`);
          } else {
            console.warn(`[Beat] Could not find background for node: ${this.node}`);
            console.warn('[Beat] Environment:', JSON.stringify(environment, null, 2));
            renderer.setState('backgroundAssetUrl', null);
          }
        } else {
          console.warn('[Beat] No story available in context');
          renderer.setState('backgroundAssetUrl', null);
        }
      } else {
        // No node specified, clear background
        renderer.setState('backgroundAssetUrl', null);
      }
      
      const nextBeatId = await this.performAction(context, renderer);
      
      await this.onExit(context, renderer);
      
      context.markBeatVisited(this.id);
      
      return nextBeatId;
    } catch (error) {
      console.error(`Error executing beat ${this.id}:`, error);
      throw error;
    }
  }

  protected abstract performAction(
    context: StoryContext, 
    renderer: IRenderer
  ): Promise<string | null>;

  protected async onEnter(context: StoryContext, renderer: IRenderer): Promise<void> {
    console.log(`Entering beat: ${this.name} (${this.id})`);
  }

  protected async onExit(context: StoryContext, renderer: IRenderer): Promise<void> {
    console.log(`Exiting beat: ${this.name} (${this.id})`);
  }

  addConnection(connection: Connection): void {
    if (!this.hasConnection(connection.targetId, connection.label)) {
      this.connections.push(connection);
    }
  }

  clearConnections(): void {
    this.connections = [];
  }

  removeConnection(targetId: string, label?: string): void {
    this.connections = this.connections.filter(c => 
      !(c.targetId === targetId && (!label || c.label === label))
    );
  }

  replaceConnections(newConnections: Connection[]): void {
    this.connections = [...newConnections];
  }

  hasConnection(targetId: string, label?: string): boolean {
    return this.connections.some(c => 
      c.targetId === targetId && (!label || c.label === label)
    );
  }

  getConnections(): Connection[] {
    // Safety check: ensure connections is an array
    if (!this.connections || !Array.isArray(this.connections)) {
      console.warn(`[Beat ${this.id}] connections is not an array, initializing to empty array`);
      this.connections = [];
    }
    return [...this.connections];
  }

  getConnectionsForEdit(): Connection[] {
    return this.connections;
  }

  getNextBeat(context: StoryContext): string | null {
    for (const connection of this.connections) {
      if (connection.condition && context.checkCondition(connection.condition)) {
        return connection.targetId;
      }
    }

    if (this.defaultTarget) {
      return this.defaultTarget;
    }

    const unconditional = this.connections.find(c => !c.condition);
    return unconditional?.targetId || null;
  }

  /**
   * Process text with variable interpolation
   * Supports two syntaxes:
   * - $variableName$ (legacy ASML format)
   * - ${variableName} (modern format)
   *
   * Examples:
   * - "Hello $userName$!" -> "Hello John!"
   * - "You are ${role}!" -> "You are wizard!"
   */
  protected processText(text: string, context: StoryContext): string {
    if (!text) return text;

    // Replace ${variableName} format
    text = text.replace(/\$\{([^}]+)\}/g, (match, varName) => {
      const value = context.getVariable(varName.trim());
      return value !== undefined && value !== null ? String(value) : match;
    });

    // Replace $variableName$ format (legacy)
    text = text.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)\$/g, (match, varName) => {
      const value = context.getVariable(varName);
      return value !== undefined && value !== null ? String(value) : match;
    });

    return text;
  }

  toJSON(): any {
    const json = {
      id: this.id,
      name: this.name,
      type: this.type,
      cluster: this.cluster,
      transition: this.transition,
      sound: this.sound,
      locations: Array.from(this.locations.values()),
      connections: this.connections,
      defaultTarget: this.defaultTarget,
      x: this.x,
      y: this.y,
      node: this.node,
      parameters: this.getParameters()
    };
    console.log(`[${this.type} ${this.id}].toJSON():`, {
      node: this.node,
      parameters_node: json.parameters.node,
      has_node_in_params: json.parameters.node !== undefined
    });
    return json;
  }
}
