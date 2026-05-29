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
import { resolveCharacter } from '../utils/characterRef';

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
  /**
   * Soft responsive layout intent for slot-mode beats (per-slot
   * preferredLines / anchor / gap). Visual-Editor managed. THE invariant:
   * this is a PARAM, never the legacy baked `locations[]` — a beat carrying
   * slotIntent and no locations[] stays responsive. Subclasses that are
   * slot-mode surface this in get/updateParameters; declared on the base so
   * the field + constructor read live in one place.
   */
  public slotIntent?: Record<string, any>;
  /**
   * Responsive motion intent (P3-anim). Per-slot enter/exit/emphasis (and
   * later spatial pan/zoom + hotspot reveal). DELIBERATELY a separate
   * field from `animations` (the legacy AnimationPath[] of pixel-keyframe
   * paths): the new model is INTENT against the slot's resolved box, not
   * coordinates over baked x/y. See project_responsive_layout_system
   * memory ("Responsive animation model — DESIGN SPEC").
   */
  public slotAnimations?: Record<string, any>;
  /**
   * P3-anim-6 — responsive motion intent for the SPATIAL layer (the
   * Phase-3 composite image). Sibling of `slotAnimations` which targets
   * the flow slots; the split mirrors SpatialFlowView's deliberate
   * data-layer separation (image vs. text+buttons) so they animate
   * independently. Only meaningful for spatial-mode beats; the field
   * exists on the base class so the persistence path is uniform.
   */
  public spatialAnimations?: Record<string, any>;
  public animations?: AnimationPath[]; // Path animations for elements (absolute mode)
  public notes?: string; // Author notes (not shown to player)
  public speaker: string; // Who speaks this beat's text (for TTS voice routing and optional display)
  /**
   * Optional Character.id reference for the speaker (Layer 2 of the rich-character roadmap).
   * When set and resolvable, takes precedence over `speaker` for everything that needs a
   * stable identity (TTS voice routing, dialog history per character, dossier building).
   * The free-text `speaker` remains for legacy / inline cases and as the display fallback
   * when no Character record is found.
   */
  public characterRef?: string;
  public showSpeaker: boolean | undefined; // undefined = inherit global, true = force show, false = force hide
  public timeDisplayMode?: 'fictionalTime' | 'manual' | 'none'; // Per-beat time display mode
  public timeDisplayText?: string; // Override Timer HUD text for this beat (manual mode)
  public overrideCountdownMeter?: boolean; // Override default countdown meter visibility on this beat
  /**
   * Level-2 analyzer annotation. Optional list of state requirements the path
   * analyzer will check when simulating. Not enforced by the engine.
   */
  public requires?: import('../types').StateRequirement[];
  /** How multiple requirements combine. Default 'all' (AND); 'any' means OR. */
  public requiresMode: 'all' | 'any' = 'all';
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
    this.slotIntent = (config.parameters as any)?.slotIntent ?? (config as any).slotIntent;
    this.slotAnimations = (config.parameters as any)?.slotAnimations ?? (config as any).slotAnimations;
    this.spatialAnimations = (config.parameters as any)?.spatialAnimations ?? (config as any).spatialAnimations;
    this.animations = (config as any).animations || (config.parameters as any)?.animations;
    this.notes = config.notes || (config.parameters as any)?.notes;
    this.speaker = (config as any).speaker || (config.parameters as any)?.speaker || '';
    this.characterRef = (config as any).characterRef || (config.parameters as any)?.characterRef || undefined;
    this.showSpeaker = (config as any).showSpeaker ?? (config.parameters as any)?.showSpeaker ?? undefined;
    this.timeDisplayMode = (config as any).timeDisplayMode || (config.parameters as any)?.timeDisplayMode;
    this.timeDisplayText = (config as any).timeDisplayText || (config.parameters as any)?.timeDisplayText;
    this.overrideCountdownMeter = (config as any).overrideCountdownMeter || (config.parameters as any)?.overrideCountdownMeter;
    this.requires = (config as any).requires || (config.parameters as any)?.requires;
    this.requiresMode = (config as any).requiresMode
      || (config.parameters as any)?.requiresMode
      || 'all';
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
      // Gate check: evaluate declared requirements before any side effects.
      // If a requirement fails and declares a fallbackTarget, redirect there
      // without rendering or marking this beat visited. Requirements with no
      // fallbackTarget behave as pure annotations and only log a warning.
      const gateResult = this.checkRequirementsGate(context);
      if (gateResult.redirect) {
        console.log(
          `[Beat ${this.id}] Requirement unmet — redirecting to "${gateResult.redirect}" (${gateResult.reason}).`
        );
        return gateResult.redirect;
      }
      if (gateResult.warnings.length > 0) {
        for (const w of gateResult.warnings) {
          console.warn(`[Beat ${this.id}] Requirement unmet (no fallbackTarget declared): ${w}`);
        }
      }

      // Notify renderer of current beat info at the START of execution
      renderer.setState('currentBeatInfo', {
        id: this.id,
        name: this.name,
        type: this.type,
      });

      // Set speaker info in renderer state for TTS routing and display
      renderer.setState('beatSpeaker', this.speaker || '');
      renderer.setState('showSpeaker', this.showSpeaker);

      // Set animations in renderer state for path animations
      if (this.animations && this.animations.length > 0) {
        console.log(`[Beat.execute] Setting animations in renderer state:`, this.animations.length, this.animations);
        renderer.setState('animations', this.animations);
      } else {
        console.log(`[Beat.execute] No animations for beat ${this.id}`);
        renderer.setState('animations', undefined);
      }

      // Push slotIntent + slotAnimations to renderer state so the slot/
      // spatial render paths (SlotFlowView, SpatialFlowView) see the
      // author's anchor + motion intent for THIS beat. Without this, the
      // VE preview reads from beat.slotIntent directly while the
      // runtime reads getState('slotIntent') which stays undefined —
      // anchors set via the custom-template 3×3 picker are honored in
      // the editor but ignored at runtime. Reset to undefined on every
      // beat so a prior beat's intent doesn't leak into one that has
      // none of its own.
      renderer.setState('slotIntent', this.slotIntent);
      renderer.setState('slotAnimations', this.slotAnimations);

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
      
      // Prefetch: while the user reads/interacts with this beat, start generating
      // content for any connected AI beats in the background
      this.prefetchConnectedBeats(context, renderer);

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

  /**
   * Evaluate declared `requires[]` against the current context.
   *
   * `requiresMode === 'all'` (default): beat is gated if ANY requirement fails
   * — redirect to the first failing one's fallbackTarget.
   * `requiresMode === 'any'`: beat is gated only if EVERY requirement fails
   * — redirect to the first failing one's fallbackTarget (representative of
   * the unsatisfied set).
   *
   * Requirements without a fallbackTarget behave as annotations: they surface
   * as `warnings` so the engine logs them but don't block progression.
   */
  protected checkRequirementsGate(
    context: StoryContext,
  ): { redirect: string | null; reason: string; warnings: string[] } {
    const warnings: string[] = [];
    if (!this.requires || this.requires.length === 0) {
      return { redirect: null, reason: '', warnings };
    }

    const evals = this.requires.map(req => {
      let satisfied = false;
      try {
        satisfied = context.checkCondition(req.condition);
      } catch (err) {
        console.warn(`[Beat ${this.id}] Failed to evaluate requirement:`, err);
        satisfied = true; // fail-open — don't trap players on evaluator bugs
      }
      return { req, satisfied };
    });

    if (this.requiresMode === 'any') {
      // OR semantics: pass if any is satisfied.
      if (evals.some(e => e.satisfied)) {
        return { redirect: null, reason: '', warnings };
      }
      // All failed — pick the first failure with a fallbackTarget.
      for (const { req } of evals) {
        const label = req.explanation || 'declared prerequisite';
        if (req.fallbackTarget) {
          return { redirect: req.fallbackTarget, reason: `any-of: ${label}`, warnings };
        }
        warnings.push(label);
      }
      return { redirect: null, reason: '', warnings };
    }

    // AND semantics (default): first failure wins.
    for (const { req, satisfied } of evals) {
      if (satisfied) continue;
      const label = req.explanation || 'declared prerequisite';
      if (req.fallbackTarget) {
        return { redirect: req.fallbackTarget, reason: label, warnings };
      }
      warnings.push(label);
    }
    return { redirect: null, reason: '', warnings };
  }

  private static readonly PREFETCHABLE_TYPES = new Set([
    'aiInfoText', 'aiDurScreen', 'aiDialogTree', 'aiConversation', 'aiSummary', 'onlineContent',
  ]);

  /**
   * Fire-and-forget prefetch of AI content for connected beats.
   * Called at the start of execute(), so API calls run while the user
   * reads/interacts with the current beat.
   */
  private prefetchConnectedBeats(context: StoryContext, renderer: IRenderer): void {
    try {
      const story = context.getStory();
      // Collect unique target beat IDs from connections + defaultTarget
      const targetIds = new Set<string>();
      for (const conn of this.connections) {
        if (conn.targetId) targetIds.add(conn.targetId);
      }
      if (this.defaultTarget) targetIds.add(this.defaultTarget);

      for (const targetId of targetIds) {
        const targetBeat = story.getBeat(targetId);
        if (!targetBeat || !Beat.PREFETCHABLE_TYPES.has(targetBeat.type)) continue;

        const prefetchable = targetBeat as Beat & { prefetch?: (ctx: StoryContext, r: IRenderer) => Promise<void> };
        if (typeof prefetchable.prefetch !== 'function') continue;

        console.log(`[Beat ${this.id}] Prefetching connected AI beat: ${targetId} (${targetBeat.type})`);
        prefetchable.prefetch(context, renderer).catch(() => {
          // Non-fatal — will retry on execute
        });
      }
    } catch {
      // Never let prefetch errors affect the current beat
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
    console.log(`[Beat.getNextBeat] ${this.id} (${this.type}): connections=${this.connections?.length || 0}, defaultTarget=${this.defaultTarget}`);
    if (this.connections && this.connections.length > 0) {
      console.log(`[Beat.getNextBeat] ${this.id} connections:`, this.connections.map(c => ({ target: c.targetId, label: c.label, hasCondition: !!c.condition })));
    }

    // First check conditional connections
    for (const connection of this.connections) {
      if (connection.condition && context.checkCondition(connection.condition)) {
        console.log(`[Beat.getNextBeat] ${this.id}: Using conditional connection → ${connection.targetId}`);
        return connection.targetId;
      }
    }

    // Then check unconditional connections (user button clicks should use these)
    const unconditional = this.connections.find(c => !c.condition);
    if (unconditional) {
      console.log(`[Beat.getNextBeat] ${this.id}: Using unconditional connection → ${unconditional.targetId}`);
      return unconditional.targetId;
    }

    // Only use defaultTarget as fallback when there are NO connections
    // Note: Timer expiry handles defaultTarget directly via timerExpired event,
    // so this is mainly for beats with no explicit connections
    if (this.defaultTarget) {
      console.log(`[Beat.getNextBeat] ${this.id}: Falling back to defaultTarget → ${this.defaultTarget}`);
      return this.defaultTarget;
    }

    console.log(`[Beat.getNextBeat] ${this.id}: No next beat found`);
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

    // Replace {variableName} format (AI-generated content often uses this)
    // Only match if the variable exists to avoid replacing unrelated braces
    text = text.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (match, varName) => {
      const value = context.getVariable(varName.trim());
      return value !== undefined && value !== null ? String(value) : match;
    });

    return text;
  }

  /**
   * Resolve this beat's speaker against a list of defined characters.
   *
   * Priority: `characterRef` (when set and resolvable) → matches a Character by name
   * (case-insensitive) on the free-text `speaker` → free-text fallback. Returns:
   *   - `id`:         canonical Character.id, or null if no match
   *   - `name`:       display name to show (the resolved Character.displayName/name,
   *                   or the free-text speaker if there's no match)
   *   - `character`:  the full Character record when matched, else null
   *
   * Renderers and TTS routing should call this rather than reading `this.speaker`
   * directly, so dialog beats that point at a defined Character get a stable
   * identity even when the free-text speaker drifts.
   */
  getResolvedSpeaker<C extends { id: string; name?: string; displayName?: string }>(
    characters: ReadonlyArray<C> | null | undefined,
  ): { id: string | null; name: string; character: C | null } {
    // Prefer the explicit ref, fall back to matching the free-text speaker.
    const resolved = this.characterRef
      ? resolveCharacter(this.characterRef, characters)
      : resolveCharacter(this.speaker, characters);
    if (resolved) {
      return {
        id: resolved.id,
        name: resolved.displayName || resolved.name || resolved.id,
        character: resolved,
      };
    }
    return {
      id: null,
      name: this.speaker || '',
      character: null,
    };
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
      speaker: this.speaker || undefined,
      characterRef: this.characterRef || undefined,
      showSpeaker: this.showSpeaker != null ? this.showSpeaker : undefined,
      timeDisplayMode: this.timeDisplayMode,
      timeDisplayText: this.timeDisplayText,
      overrideCountdownMeter: this.overrideCountdownMeter,
      // Persist state requirements as a top-level field (the constructor also
      // accepts them nested under parameters for backwards compatibility).
      ...(this.requires && this.requires.length > 0 ? { requires: this.requires } : {}),
      // Only persist requiresMode when it's non-default to keep JSON clean.
      ...(this.requiresMode && this.requiresMode !== 'all' ? { requiresMode: this.requiresMode } : {}),
      parameters: parameters
    };
    return json;
  }
}
