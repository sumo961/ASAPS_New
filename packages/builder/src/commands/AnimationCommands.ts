/**
 * Animation Commands - Undoable commands for animation operations
 *
 * Implements commands for adding, updating, and deleting animations
 * for visual elements.
 */

import { Command, CommandRegistry } from './Command';
import type { AnimationPath } from '@asaps/core';
import type { SerializedCommand } from '../storage/types';

// ============================================================================
// State Mutation Callbacks
// ============================================================================

/**
 * Callbacks for mutating animation state
 */
export interface AnimationStateMutations {
  addAnimation: (animation: AnimationPath) => void;
  updateAnimation: (animationId: string, updates: Partial<AnimationPath>) => void;
  deleteAnimation: (animationId: string) => void;
}

// ============================================================================
// Add Animation Command
// ============================================================================

export class AddAnimationCommand extends Command {
  public readonly type = 'ADD_ANIMATION';
  public description: string;

  private animation: AnimationPath;
  private mutations: AnimationStateMutations;

  constructor(
    animation: AnimationPath,
    mutations: AnimationStateMutations,
    id?: string
  ) {
    super(id);
    this.animation = animation;
    this.mutations = mutations;
    this.description = `Add animation "${animation.name}"`;
  }

  execute(): void {
    this.mutations.addAnimation(this.animation);
  }

  undo(): void {
    this.mutations.deleteAnimation(this.animation.id);
  }

  protected serializeData(): any {
    return {
      animation: this.animation,
    };
  }

  static deserialize(data: SerializedCommand, mutations: AnimationStateMutations): AddAnimationCommand {
    return new AddAnimationCommand(data.data.animation, mutations, data.id);
  }
}

// ============================================================================
// Delete Animation Command
// ============================================================================

export class DeleteAnimationCommand extends Command {
  public readonly type = 'DELETE_ANIMATION';
  public description: string;

  private animation: AnimationPath;
  private mutations: AnimationStateMutations;

  constructor(
    animation: AnimationPath,
    mutations: AnimationStateMutations,
    id?: string
  ) {
    super(id);
    this.animation = animation;
    this.mutations = mutations;
    this.description = `Delete animation "${animation.name}"`;
  }

  execute(): void {
    this.mutations.deleteAnimation(this.animation.id);
  }

  undo(): void {
    this.mutations.addAnimation(this.animation);
  }

  protected serializeData(): any {
    return {
      animation: this.animation,
    };
  }

  static deserialize(data: SerializedCommand, mutations: AnimationStateMutations): DeleteAnimationCommand {
    return new DeleteAnimationCommand(data.data.animation, mutations, data.id);
  }
}

// ============================================================================
// Update Animation Command
// ============================================================================

export class UpdateAnimationCommand extends Command {
  public readonly type = 'UPDATE_ANIMATION';
  public description: string;

  private animationId: string;
  private oldValues: Partial<AnimationPath>;
  private newValues: Partial<AnimationPath>;
  private mutations: AnimationStateMutations;

  constructor(
    animationId: string,
    oldValues: Partial<AnimationPath>,
    newValues: Partial<AnimationPath>,
    mutations: AnimationStateMutations,
    id?: string
  ) {
    super(id);
    this.animationId = animationId;
    this.oldValues = oldValues;
    this.newValues = newValues;
    this.mutations = mutations;

    const changedKeys = Object.keys(newValues).join(', ');
    this.description = `Update animation ${animationId.slice(0, 8)} (${changedKeys})`;
  }

  execute(): void {
    this.mutations.updateAnimation(this.animationId, this.newValues);
  }

  undo(): void {
    this.mutations.updateAnimation(this.animationId, this.oldValues);
  }

  protected serializeData(): any {
    return {
      animationId: this.animationId,
      oldValues: this.oldValues,
      newValues: this.newValues,
    };
  }

  /**
   * Check if this command can be merged with another
   */
  canMergeWith(command: Command): boolean {
    if (!(command instanceof UpdateAnimationCommand)) {
      return false;
    }

    // Only merge if updating the same animation
    if (command.animationId !== this.animationId) {
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
    if (!(command instanceof UpdateAnimationCommand)) {
      return;
    }

    // Merge the new values
    this.newValues = { ...this.newValues, ...command.newValues };

    // Update description
    const changedKeys = Object.keys(this.newValues).join(', ');
    this.description = `Update animation ${this.animationId.slice(0, 8)} (${changedKeys})`;
  }

  static deserialize(data: SerializedCommand, mutations: AnimationStateMutations): UpdateAnimationCommand {
    return new UpdateAnimationCommand(
      data.data.animationId,
      data.data.oldValues,
      data.data.newValues,
      mutations,
      data.id
    );
  }
}

// ============================================================================
// Register Commands
// ============================================================================

/**
 * Register animation commands for deserialization
 */
export function registerAnimationCommands(mutations: AnimationStateMutations): void {
  CommandRegistry.register('ADD_ANIMATION', (data) =>
    AddAnimationCommand.deserialize(data, mutations)
  );

  CommandRegistry.register('DELETE_ANIMATION', (data) =>
    DeleteAnimationCommand.deserialize(data, mutations)
  );

  CommandRegistry.register('UPDATE_ANIMATION', (data) =>
    UpdateAnimationCommand.deserialize(data, mutations)
  );
}
