import type {
  BeatConfig,
  Connection,
  Location,
  Transition,
  Sound,
  AnimationPath,
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
  public defaultTargetDelay?: number; // Timeout in seconds before auto-advancing to defaultTarget
  public showTimer?: boolean; // Whether to show countdown timer to user
  public x?: number;
  public y?: number;
  public node?: string; // Background image/node reference
  public animations?: AnimationPath[]; // Path animations for elements
  public notes?: string; // Author notes (not shown to player)
  public _version: number = 0; // Version counter incremented on parameter updates (for React change detection)

  constructor(config: BeatConfig) {
    this.id = config.id;
    this.name = config.name;
    this.type = config.type;
    this.cluster = config.cluster;
    this.transition = config.transition;
    this.sound = config.sound;
    this.defaultTarget = config.defaultTarget;
    this.defaultTargetDelay = (config as any).defaultTargetDelay || (config.parameters as any)?.defaultTargetDelay;
    this.showTimer = (config as any).showTimer || (config.parameters as any)?.showTimer;
    this.node = (config as any).node || (config.parameters as any)?.node;
    this.animations = (config as any).animations || (config.parameters as any)?.animations;
    this.notes = config.notes || (config.parameters as any)?.notes;
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
      // Notify renderer of current beat info at the START of execution
      renderer.setState('currentBeatInfo', {
        id: this.id,
        name: this.name,
        type: this.type,
      });

      // Set animations in renderer state for path animations
      if (this.animations && this.animations.length > 0) {
        console.log(`[Beat.execute] Setting animations in renderer state:`, this.animations.length, this.animations);
        renderer.setState('animations', this.animations);
      } else {
        console.log(`[Beat.execute] No animations for beat ${this.id}`);
        renderer.setState('animations', undefined);
      }

      // Prepare transition (set hidden state) BEFORE rendering
      if (this.transition && renderer.prepareTransition) {
        renderer.prepareTransition(this.transition);
      }

      await this.onEnter(context, renderer);

      // Apply transition (animate to visible) AFTER rendering
      if (this.transition) {
        await renderer.applyTransition(this.transition);
      }

      // Handle cluster sound - look up cluster and play its ambient sound
      // This will only change the cluster sound if entering a different cluster
      if (renderer.playClusterSound) {
        const story = context.getStory();
        if (story && this.cluster) {
          const clusters = story.getClusters();
          const cluster = clusters.find(c => c.id === this.cluster || c.name === this.cluster);
          if (cluster?.sound) {
            await renderer.playClusterSound(cluster.id, cluster.sound);
          } else {
            // Beat is in a cluster without sound - keep current cluster sound
            // (AudioManager will detect same clusterId and skip)
            await renderer.playClusterSound(cluster?.id ?? null, null);
          }
        } else {
          // Beat is not in a cluster - stop cluster sound
          await renderer.playClusterSound(null, null);
        }
      }

      // Play beat-level sound (automatically stops previous beat sound)
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
        // CRITICAL: Clear BOTH backgroundAssetUrl AND backgroundAssetId to prevent
        // previous beat's background from persisting
        renderer.setState('backgroundAssetUrl', null);
        renderer.setState('backgroundAssetId', null);
      }

      // Always set backgroundAssetId centrally so individual beats don't need to
      // This ensures the background is cleared when a beat doesn't have one
      renderer.setState('backgroundAssetId', this.node || null);
      
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

    // Start default target timer only for visible beats with user interaction
    // Excluded: durScreen (has own timer), logic beats (instant), endScreen (no timeout needed)
    const supportsDefaultTargetTimeout = [
      'titleScreen',
      'infoText',
      'dialogTree',
      'movementChoice',
      'pickProp',
      'hyperText',
      'inputText',
      'videoBeat'
    ].includes(this.type);

    if (supportsDefaultTargetTimeout && this.defaultTarget && this.defaultTargetDelay && this.defaultTargetDelay > 0) {
      const timerManager = context.getTimerManager();
      const timerName = `defaultTarget_${this.id}`;

      console.log(`[Beat ${this.id}] Starting default target timer: ${timerName} for ${this.defaultTargetDelay}s → ${this.defaultTarget}`);

      // Note: showTimer support would need to be added to TimerManager.startTimer signature
      timerManager.startTimer(timerName, this.defaultTargetDelay, this.defaultTarget);
    }
  }

  protected async onExit(context: StoryContext, renderer: IRenderer): Promise<void> {
    console.log(`Exiting beat: ${this.name} (${this.id})`);

    // Stop the beat sound when leaving the beat
    if (renderer.stopBeatSound) {
      renderer.stopBeatSound();
    }

    // Cancel default target timer if it exists
    if (this.defaultTarget) {
      const timerManager = context.getTimerManager();
      const timerName = `defaultTarget_${this.id}`;

      // Stop the timer to prevent it from firing after user makes a choice
      timerManager.stopTimer(timerName);
      console.log(`[Beat ${this.id}] Stopped default target timer: ${timerName}`);
    }
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
    // First check conditional connections
    for (const connection of this.connections) {
      if (connection.condition && context.checkCondition(connection.condition)) {
        return connection.targetId;
      }
    }

    // Then check unconditional connections (user button clicks should use these)
    const unconditional = this.connections.find(c => !c.condition);
    if (unconditional) {
      return unconditional.targetId;
    }

    // Only use defaultTarget as fallback when there are NO connections
    // Note: Timer expiry handles defaultTarget directly via timerExpired event,
    // so this is mainly for beats with no explicit connections
    if (this.defaultTarget) {
      return this.defaultTarget;
    }

    return null;
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
    // IMPORTANT: Use this.connections directly, NOT getConnections()
    // getConnections() may include derived connections (e.g., from dialogTree choices)
    // which should be re-derived on load, not stored and accumulated.
    // For beats like movementChoice, pickProp, etc., connections are defined in
    // the choices/props arrays within parameters, not in the connections array.
    // Storing derived connections causes duplication on each save/load cycle.
    const storedConnections = [...this.connections];

    // Merge beat-type-specific parameters with base beat properties like animations
    const parameters = {
      ...this.getParameters(),
      // Include animations in parameters so they're preserved during serialization
      ...(this.animations && this.animations.length > 0 ? { animations: this.animations } : {})
    };

    const json = {
      id: this.id,
      name: this.name,
      type: this.type,
      cluster: this.cluster,
      transition: this.transition,
      sound: this.sound,
      locations: Array.from(this.locations.values()),
      connections: storedConnections,
      defaultTarget: this.defaultTarget,
      defaultTargetDelay: this.defaultTargetDelay,
      showTimer: this.showTimer,
      x: this.x,
      y: this.y,
      node: this.node,
      notes: this.notes,
      parameters: parameters
    };
    return json;
  }
}
