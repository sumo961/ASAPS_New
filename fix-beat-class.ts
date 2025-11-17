import type { 
  BeatConfig, 
  Connection, 
  Location, 
  Transition, 
  Sound,  
} from '../types';
import type { IRenderer } from '@asaps/renderer';

import { StoryContext } from '../engine/StoryContext';

/**
 * FIXED VERSION - Added proper connection management methods
 * Changes:
 * 1. Added clearConnections() method
 * 2. Added removeConnection() method  
 * 3. Added replaceConnections() method
 * 4. Added hasConnection() method for checking
 */
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

  constructor(config: BeatConfig) {
    this.id = config.id;
    this.name = config.name;
    this.type = config.type;
    this.cluster = config.cluster;
    this.transition = config.transition;
    this.sound = config.sound;
    this.defaultTarget = config.defaultTarget;
    
    if (config.locations) {
      config.locations.forEach(loc => {
        this.locations.set(loc.name, loc);
      });
    }
  }

  // Abstract methods that concrete beat classes must implement
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

  // ============= CONNECTION MANAGEMENT METHODS =============
  
  /**
   * Add a new connection
   */
  addConnection(connection: Connection): void {
    // Avoid duplicates
    if (!this.hasConnection(connection.targetId, connection.label)) {
      this.connections.push(connection);
    }
  }

  /**
   * Clear all connections
   */
  clearConnections(): void {
    this.connections = [];
  }

  /**
   * Remove a specific connection
   */
  removeConnection(targetId: string, label?: string): void {
    this.connections = this.connections.filter(c => 
      !(c.targetId === targetId && (!label || c.label === label))
    );
  }

  /**
   * Replace all connections with new ones
   */
  replaceConnections(newConnections: Connection[]): void {
    this.connections = [...newConnections];
  }

  /**
   * Check if a connection exists
   */
  hasConnection(targetId: string, label?: string): boolean {
    return this.connections.some(c => 
      c.targetId === targetId && (!label || c.label === label)
    );
  }

  /**
   * Get a copy of connections (safe for reading)
   */
  getConnections(): Connection[] {
    return [...this.connections];
  }

  /**
   * Get direct access to connections array (for editing)
   * Use with caution - prefer the specific methods above
   */
  getConnectionsForEdit(): Connection[] {
    return this.connections;
  }

  // =========================================================

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

  // Updated toJSON method that includes parameters
  toJSON(): any {
    return {
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
      parameters: this.getParameters() // Now includes beat-specific parameters
    };
  }
}
