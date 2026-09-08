/**
 * Beat Commands - Undoable commands for beat operations
 *
 * Implements commands for adding, updating, and deleting beats
 * in the story graph.
 */

import { Command, CommandRegistry } from './Command';
import type { Beat, BeatConfig } from '@asaps/core';
import type { SerializedCommand } from '../storage/types';

// ============================================================================
// State Mutation Callbacks
// ============================================================================

/**
 * Callbacks for mutating beat state
 * These are provided by the component/hook that manages beat state
 */
export interface BeatStateMutations {
  addBeat: (beat: Beat) => void;
  updateBeat: (beatId: string, updates: Partial<BeatConfig>) => void;
  deleteBeat: (beatId: string) => void;
  moveBeat: (beatId: string, position: { x: number; y: number }) => void;
  /** In-cluster position (content-relative coords, stored in
   *  containerBeatPositions). Optional: only App wires it. */
  moveBeatInContainer?: (beatId: string, clusterId: string, x: number, y: number) => void;
  /** Cluster frame bounds. Optional: only App wires it. */
  resizeCluster?: (clusterId: string, width: number, height: number) => void;
  /** Cluster membership (drag-in / drag-out / ⏏). Optional: only App wires them. */
  moveBeatToCluster?: (beatId: string, clusterId: string) => void;
  removeBeatFromCluster?: (beatId: string) => void;
}

/**
 * Where a beat lives: inside a cluster at a content-relative position, or
 * top-level at an absolute canvas position.
 */
export interface BeatPlacement {
  clusterId: string | null;
  x: number;
  y: number;
}

// ============================================================================
// Add Beat Command
// ============================================================================

export class AddBeatCommand extends Command {
  public readonly type = 'ADD_BEAT';
  public description: string;

  private beat: Beat;
  private mutations: BeatStateMutations;

  constructor(
    beat: Beat,
    mutations: BeatStateMutations,
    id?: string
  ) {
    super(id);
    this.beat = beat;
    this.mutations = mutations;
    this.description = `Add ${beat.type} beat`;
  }

  execute(): void {
    this.mutations.addBeat(this.beat);
  }

  undo(): void {
    this.mutations.deleteBeat(this.beat.id);
  }

  protected serializeData(): any {
    return {
      beat: this.beat.toJSON(),
    };
  }

  static deserialize(data: SerializedCommand, mutations: BeatStateMutations): AddBeatCommand {
    // Note: Beat deserialization would need to be implemented
    // For now, this is a placeholder
    throw new Error('Beat deserialization not yet implemented');
  }
}

// ============================================================================
// Delete Beat Command
// ============================================================================

export class DeleteBeatCommand extends Command {
  public readonly type = 'DELETE_BEAT';
  public description: string;

  private beat: Beat;
  private mutations: BeatStateMutations;

  constructor(
    beat: Beat,
    mutations: BeatStateMutations,
    id?: string
  ) {
    super(id);
    this.beat = beat;
    this.mutations = mutations;
    this.description = `Delete ${beat.type} beat`;
  }

  execute(): void {
    this.mutations.deleteBeat(this.beat.id);
  }

  undo(): void {
    this.mutations.addBeat(this.beat);
  }

  protected serializeData(): any {
    return {
      beat: this.beat.toJSON(),
    };
  }

  static deserialize(data: SerializedCommand, mutations: BeatStateMutations): DeleteBeatCommand {
    throw new Error('Beat deserialization not yet implemented');
  }
}

// ============================================================================
// Update Beat Command
// ============================================================================

export class UpdateBeatCommand extends Command {
  public readonly type = 'UPDATE_BEAT';
  public description: string;

  private beatId: string;
  private oldValues: Partial<BeatConfig>;
  private newValues: Partial<BeatConfig>;
  private mutations: BeatStateMutations;

  constructor(
    beatId: string,
    oldValues: Partial<BeatConfig>,
    newValues: Partial<BeatConfig>,
    mutations: BeatStateMutations,
    id?: string
  ) {
    super(id);
    this.beatId = beatId;
    this.oldValues = oldValues;
    this.newValues = newValues;
    this.mutations = mutations;

    const changedKeys = Object.keys(newValues).join(', ');
    this.description = `Update beat ${beatId.slice(0, 8)} (${changedKeys})`;
  }

  execute(): void {
    this.mutations.updateBeat(this.beatId, this.newValues);
  }

  undo(): void {
    this.mutations.updateBeat(this.beatId, this.oldValues);
  }

  protected serializeData(): any {
    return {
      beatId: this.beatId,
      oldValues: this.oldValues,
      newValues: this.newValues,
    };
  }

  /**
   * Check if this command can be merged with another
   * Allows batching of consecutive updates to the same beat property
   */
  canMergeWith(command: Command): boolean {
    if (!(command instanceof UpdateBeatCommand)) {
      return false;
    }

    // Only merge if updating the same beat
    if (command.beatId !== this.beatId) {
      return false;
    }

    // Only merge if commands are within 2 seconds of each other
    const timeDiff = command.timestamp.getTime() - this.timestamp.getTime();
    if (timeDiff > 2000) {
      return false;
    }

    return true;
  }

  /**
   * Merge this command with another
   */
  mergeWith(command: Command): void {
    if (!(command instanceof UpdateBeatCommand)) {
      return;
    }

    // Merge the new values
    this.newValues = { ...this.newValues, ...command.newValues };

    // Update description
    const changedKeys = Object.keys(this.newValues).join(', ');
    this.description = `Update beat ${this.beatId.slice(0, 8)} (${changedKeys})`;
  }

  static deserialize(data: SerializedCommand, mutations: BeatStateMutations): UpdateBeatCommand {
    return new UpdateBeatCommand(
      data.data.beatId,
      data.data.oldValues,
      data.data.newValues,
      mutations,
      data.id
    );
  }
}

// ============================================================================
// Move Beat Command
// ============================================================================

export class MoveBeatCommand extends Command {
  public readonly type = 'MOVE_BEAT';
  public description: string;

  private beatId: string;
  private oldPosition: { x: number; y: number };
  private newPosition: { x: number; y: number };
  private mutations: BeatStateMutations;

  constructor(
    beatId: string,
    oldPosition: { x: number; y: number },
    newPosition: { x: number; y: number },
    mutations: BeatStateMutations,
    id?: string
  ) {
    super(id);
    this.beatId = beatId;
    this.oldPosition = oldPosition;
    this.newPosition = newPosition;
    this.mutations = mutations;
    this.description = `Move beat`;
  }

  execute(): void {
    this.mutations.moveBeat(this.beatId, this.newPosition);
  }

  undo(): void {
    this.mutations.moveBeat(this.beatId, this.oldPosition);
  }

  protected serializeData(): any {
    return {
      beatId: this.beatId,
      oldPosition: this.oldPosition,
      newPosition: this.newPosition,
    };
  }

  canMergeWith(command: Command): boolean {
    if (!(command instanceof MoveBeatCommand)) return false;
    if (command.beatId !== this.beatId) return false;
    const timeDiff = command.timestamp.getTime() - this.timestamp.getTime();
    return timeDiff <= 500;
  }

  mergeWith(command: Command): void {
    if (!(command instanceof MoveBeatCommand)) return;
    this.newPosition = command.newPosition;
  }

  static deserialize(data: SerializedCommand, mutations: BeatStateMutations): MoveBeatCommand {
    return new MoveBeatCommand(
      data.data.beatId,
      data.data.oldPosition,
      data.data.newPosition,
      mutations,
      data.id
    );
  }
}

// ============================================================================
// Register Commands
// ============================================================================
// Move Beat In Container Command (cluster-unification follow-up: in-cluster
// moves and the cluster auto-arrange were the only beat placements without
// undo)
// ============================================================================

export class MoveBeatInContainerCommand extends Command {
  public readonly type = 'MOVE_BEAT_IN_CONTAINER';
  public description: string;

  private beatId: string;
  private clusterId: string;
  private oldPosition: { x: number; y: number };
  private newPosition: { x: number; y: number };
  private mutations: BeatStateMutations;

  constructor(
    beatId: string,
    clusterId: string,
    // Content-relative coords. For a beat that had NO stored position the
    // caller passes its effective default-grid slot, so undo restores what
    // the author actually saw.
    oldPosition: { x: number; y: number },
    newPosition: { x: number; y: number },
    mutations: BeatStateMutations,
    id?: string
  ) {
    super(id);
    this.beatId = beatId;
    this.clusterId = clusterId;
    this.oldPosition = oldPosition;
    this.newPosition = newPosition;
    this.mutations = mutations;
    this.description = 'Move beat in cluster';
  }

  execute(): void {
    this.mutations.moveBeatInContainer?.(this.beatId, this.clusterId, this.newPosition.x, this.newPosition.y);
  }

  undo(): void {
    this.mutations.moveBeatInContainer?.(this.beatId, this.clusterId, this.oldPosition.x, this.oldPosition.y);
  }

  protected serializeData(): any {
    return {
      beatId: this.beatId,
      clusterId: this.clusterId,
      oldPosition: this.oldPosition,
      newPosition: this.newPosition,
    };
  }

  canMergeWith(command: Command): boolean {
    if (!(command instanceof MoveBeatInContainerCommand)) return false;
    if (command.beatId !== this.beatId || command.clusterId !== this.clusterId) return false;
    const timeDiff = command.timestamp.getTime() - this.timestamp.getTime();
    return timeDiff <= 500;
  }

  mergeWith(command: Command): void {
    if (!(command instanceof MoveBeatInContainerCommand)) return;
    this.newPosition = command.newPosition;
  }

  static deserialize(data: SerializedCommand, mutations: BeatStateMutations): MoveBeatInContainerCommand {
    return new MoveBeatInContainerCommand(
      data.data.beatId,
      data.data.clusterId,
      data.data.oldPosition,
      data.data.newPosition,
      mutations,
      data.id
    );
  }
}

// ============================================================================
// Reparent Beat Command — drag into / out of / between clusters, and the ⏏
// eject button. One entry per gesture; undo puts the beat back where it was
// (membership AND position), which the raw store calls never did.
// ============================================================================

export class ReparentBeatCommand extends Command {
  public readonly type = 'REPARENT_BEAT';
  public description: string;

  private beatId: string;
  private from: BeatPlacement;
  private to: BeatPlacement;
  private mutations: BeatStateMutations;

  constructor(beatId: string, from: BeatPlacement, to: BeatPlacement, mutations: BeatStateMutations, id?: string) {
    super(id);
    this.beatId = beatId;
    this.from = from;
    this.to = to;
    this.mutations = mutations;
    this.description = to.clusterId
      ? (from.clusterId ? 'Move beat to another cluster' : 'Move beat into cluster')
      : 'Take beat out of cluster';
  }

  private apply(p: BeatPlacement): void {
    if (p.clusterId) {
      this.mutations.moveBeatToCluster?.(this.beatId, p.clusterId);
      this.mutations.moveBeatInContainer?.(this.beatId, p.clusterId, p.x, p.y);
    } else {
      this.mutations.removeBeatFromCluster?.(this.beatId);
      this.mutations.moveBeat(this.beatId, { x: p.x, y: p.y });
    }
  }

  execute(): void { this.apply(this.to); }
  undo(): void { this.apply(this.from); }

  protected serializeData(): any {
    return { beatId: this.beatId, from: this.from, to: this.to };
  }

  static deserialize(data: SerializedCommand, mutations: BeatStateMutations): ReparentBeatCommand {
    return new ReparentBeatCommand(data.data.beatId, data.data.from, data.data.to, mutations, data.id);
  }
}

// ============================================================================
// Apply Fix Proposal Command — one review proposal = one parameter patch on
// one beat, one undo entry. Holds its own clones: useStoryBuilder.updateBeat
// strips `parameters` off the object it is handed, which would otherwise
// make redo a no-op; and it never merges with a neighbour, so two proposals
// applied in quick succession stay individually undoable.
// ============================================================================

export class ApplyFixProposalCommand extends Command {
  public readonly type = 'APPLY_FIX_PROPOSAL';
  public description: string;

  private beatId: string;
  /** `updates` objects for BeatStateMutations.updateBeat — `{ parameters }` or `{ connections }`. */
  private prevUpdates: Record<string, any>;
  private nextUpdates: Record<string, any>;
  private proposalId: string;
  private mutations: BeatStateMutations;
  /** Review bookkeeping: an undone proposal reopens in the banner, a redone one settles again. Not serialized. */
  private hooks?: { onUndo?: () => void; onRedo?: () => void };

  constructor(
    proposalId: string,
    beatId: string,
    prevUpdates: Record<string, any>,
    nextUpdates: Record<string, any>,
    description: string,
    mutations: BeatStateMutations,
    id?: string,
    hooks?: { onUndo?: () => void; onRedo?: () => void },
  ) {
    super(id);
    this.proposalId = proposalId;
    this.beatId = beatId;
    this.prevUpdates = prevUpdates;
    this.nextUpdates = nextUpdates;
    this.description = description;
    this.mutations = mutations;
    this.hooks = hooks;
  }

  execute(): void {
    this.mutations.updateBeat(this.beatId, structuredClone(this.nextUpdates) as any);
  }

  undo(): void {
    this.mutations.updateBeat(this.beatId, structuredClone(this.prevUpdates) as any);
    this.hooks?.onUndo?.();
  }

  redo(): void {
    this.execute();
    this.hooks?.onRedo?.();
  }

  canMergeWith(): boolean { return false; }

  protected serializeData(): any {
    return { proposalId: this.proposalId, beatId: this.beatId, prevUpdates: this.prevUpdates, nextUpdates: this.nextUpdates, description: this.description };
  }

  static deserialize(data: SerializedCommand, mutations: BeatStateMutations): ApplyFixProposalCommand {
    return new ApplyFixProposalCommand(data.data.proposalId, data.data.beatId, data.data.prevUpdates, data.data.nextUpdates, data.data.description, mutations, data.id);
  }
}

// ============================================================================
// Resize Cluster Command (pairs with the auto-arrange batch: arranging grows
// the frame, so undo must restore the old bounds too)
// ============================================================================

export class ResizeClusterCommand extends Command {
  public readonly type = 'RESIZE_CLUSTER';
  public description: string;

  private clusterId: string;
  private oldBounds: { width: number; height: number };
  private newBounds: { width: number; height: number };
  private mutations: BeatStateMutations;

  constructor(
    clusterId: string,
    oldBounds: { width: number; height: number },
    newBounds: { width: number; height: number },
    mutations: BeatStateMutations,
    id?: string
  ) {
    super(id);
    this.clusterId = clusterId;
    this.oldBounds = oldBounds;
    this.newBounds = newBounds;
    this.mutations = mutations;
    this.description = 'Resize cluster';
  }

  execute(): void {
    this.mutations.resizeCluster?.(this.clusterId, this.newBounds.width, this.newBounds.height);
  }

  undo(): void {
    this.mutations.resizeCluster?.(this.clusterId, this.oldBounds.width, this.oldBounds.height);
  }

  protected serializeData(): any {
    return {
      clusterId: this.clusterId,
      oldBounds: this.oldBounds,
      newBounds: this.newBounds,
    };
  }

  static deserialize(data: SerializedCommand, mutations: BeatStateMutations): ResizeClusterCommand {
    return new ResizeClusterCommand(
      data.data.clusterId,
      data.data.oldBounds,
      data.data.newBounds,
      mutations,
      data.id
    );
  }
}

// ============================================================================

/**
 * Register beat commands for deserialization
 * Note: This requires mutations to be provided, so registration
 * happens when the command manager is initialized with context
 */
export function registerBeatCommands(mutations: BeatStateMutations): void {
  CommandRegistry.register('ADD_BEAT', (data) =>
    AddBeatCommand.deserialize(data, mutations)
  );

  CommandRegistry.register('DELETE_BEAT', (data) =>
    DeleteBeatCommand.deserialize(data, mutations)
  );

  CommandRegistry.register('UPDATE_BEAT', (data) =>
    UpdateBeatCommand.deserialize(data, mutations)
  );

  CommandRegistry.register('MOVE_BEAT', (data) =>
    MoveBeatCommand.deserialize(data, mutations)
  );

  CommandRegistry.register('MOVE_BEAT_IN_CONTAINER', (data) =>
    MoveBeatInContainerCommand.deserialize(data, mutations)
  );

  CommandRegistry.register('RESIZE_CLUSTER', (data) =>
    ResizeClusterCommand.deserialize(data, mutations)
  );

  CommandRegistry.register('REPARENT_BEAT', (data) =>
    ReparentBeatCommand.deserialize(data, mutations)
  );

  CommandRegistry.register('APPLY_FIX_PROPOSAL', (data) =>
    ApplyFixProposalCommand.deserialize(data, mutations)
  );
}
