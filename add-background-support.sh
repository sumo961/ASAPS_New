#!/bin/bash

# Add background image support to Beat base class and TitleScreenBeat

echo "Adding background image support to beats..."

# 1. Update Beat.ts to include node (background) parameter
FILE_BEAT="/Users/hartmut/Library/Mobile Documents/com~apple~CloudDocs/Coding/Project Phoenix/asaps-modern/packages/core/src/beats/Beat.ts"

cat > "$FILE_BEAT" << 'ENDBEAT'
import type { 
  BeatConfig, 
  Connection, 
  Location, 
  Transition, 
  Sound,  
} from '../types';
import type { IRenderer } from '../types';

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
      
      // UNIVERSAL: Pass locations to renderer for all beat types
      // This allows the renderer to use positioned layouts when available
      const locations = Array.from(this.locations.values());
      if (locations.length > 0) {
        renderer.setState('currentBeatLocations', locations);
      }
      
      // Pass background node if available
      if (this.node) {
        // Get the story from context to look up the asset
        const story = context.getStory();
        if (story) {
          const environment = story.getEnvironment();
          // Find the node in environment
          const nodeData = environment?.nodes?.find((n: any) => n.name === this.node);
          if (nodeData?.src) {
            renderer.setState('backgroundAssetUrl', nodeData.src);
          }
        }
      } else {
        // Clear background if no node specified
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

  // ============= CONNECTION MANAGEMENT METHODS =============
  
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
    return [...this.connections];
  }

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
      node: this.node,
      parameters: this.getParameters()
    };
  }
}
ENDBEAT

echo "✓ Updated Beat.ts with node/background support"

# 2. Update TitleScreenBeat to include node parameter
FILE_TITLE="/Users/hartmut/Library/Mobile Documents/com~apple~CloudDocs/Coding/Project Phoenix/asaps-modern/packages/core/src/beats/TitleScreenBeat.ts"

cat > "$FILE_TITLE" << 'ENDTITLE'
import { Beat } from './Beat';
import type { BeatConfig } from '../types';
import { StoryContext } from '../engine/StoryContext';
import type { IRenderer } from '../types';

export class TitleScreenBeat extends Beat {
  public title: string;
  public author: string;
  public buttonText: string;

  constructor(config: BeatConfig & {
    title?: string;
    author?: string;
    buttonText?: string;
    node?: string;
    parameters?: Record<string, any>;
  }) {
    super(config);
    this.title = config.title || config.parameters?.title || 'Untitled Story';
    this.author = config.author || config.parameters?.author || 'Anonymous';
    this.buttonText = config.buttonText || config.parameters?.buttonText || 'Start';
    // node is now handled by Beat base class
  }

  getParameters(): Record<string, any> {
    return {
      title: this.title,
      author: this.author,
      buttonText: this.buttonText,
      node: this.node
    };
  }

  updateParameters(params: Record<string, any>): void {
    if (params.title !== undefined) this.title = params.title;
    if (params.author !== undefined) this.author = params.author;
    if (params.buttonText !== undefined) this.buttonText = params.buttonText;
    if (params.node !== undefined) this.node = params.node;
  }

  protected async performAction(
    context: StoryContext,
    renderer: IRenderer
  ): Promise<string | null> {
    const locations = Array.from(this.locations.values());
    
    console.log(`[TitleScreenBeat] Rendering with ${locations.length} locations`);
    console.log(`[TitleScreenBeat] Background node: ${this.node || 'none'}`);
    
    await renderer.renderTitleScreen(this.title, this.author, this.buttonText, locations);
    
    return this.getNextBeat(context);
  }
}
ENDTITLE

echo "✓ Updated TitleScreenBeat.ts with node parameter"

echo ""
echo "Now rebuild core package:"
echo "  cd packages/core && npm run build"
echo "  cd ../renderer && npm run build"
echo "  cd ../builder && npm run build"
echo ""
echo "Background images will now be loaded if:"
echo "  1. Beat has 'node' parameter set"
echo "  2. Node exists in story environment with 'src' property"
echo "  3. The src URL is accessible"
