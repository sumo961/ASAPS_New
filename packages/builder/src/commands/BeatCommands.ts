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
}
