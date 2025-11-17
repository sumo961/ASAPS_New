/**
 * Command Base Class - Abstract base for all undoable commands
 *
 * Implements the Command pattern for undo/redo functionality.
 * All commands must extend this base class and implement execute/undo/redo methods.
 */

import type { SerializedCommand } from '../storage/types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Abstract base class for all commands
 */
export abstract class Command {
  /** Unique command identifier */
  public readonly id: string;

  /** Command type for deserialization */
  public abstract readonly type: string;

  /** Timestamp when command was created */
  public readonly timestamp: Date;

  /** Human-readable description of the command */
  public abstract description: string;

  constructor(id?: string) {
    this.id = id || uuidv4();
    this.timestamp = new Date();
  }

  /**
   * Execute the command (do)
   * Should modify the application state
   */
  abstract execute(): void | Promise<void>;

  /**
   * Reverse the command (undo)
   * Should restore the state to before execute() was called
   */
  abstract undo(): void | Promise<void>;

  /**
   * Re-execute after undo (redo)
   * By default, calls execute() again
   */
  redo(): void | Promise<void> {
    return this.execute();
  }

  /**
   * Serialize command data for storage
   * Subclasses should override to include command-specific data
   */
  toJSON(): SerializedCommand {
    return {
      id: this.id,
      type: this.type,
      timestamp: this.timestamp,
      data: this.serializeData(),
    };
  }

  /**
   * Serialize command-specific data
   * Subclasses must implement this
   */
  protected abstract serializeData(): any;

  /**
   * Check if this command can be merged with another
   * Used to batch similar consecutive commands
   */
  canMergeWith(command: Command): boolean {
    return false;
  }

  /**
   * Merge this command with another
   * Used to batch similar consecutive commands
   */
  mergeWith(command: Command): void {
    // Default: no merging
  }
}

/**
 * Command factory function type
 */
export type CommandFactory = (data: any) => Command;

/**
 * Command registry for deserialization
 */
export class CommandRegistry {
  private static factories = new Map<string, CommandFactory>();

  /**
   * Register a command type for deserialization
   */
  static register(type: string, factory: CommandFactory): void {
    this.factories.set(type, factory);
  }

  /**
   * Create a command from serialized data
   */
  static deserialize(serialized: SerializedCommand): Command | null {
    const factory = this.factories.get(serialized.type);
    if (!factory) {
      console.error(`[CommandRegistry] Unknown command type: ${serialized.type}`);
      return null;
    }

    try {
      return factory(serialized);
    } catch (error) {
      console.error(`[CommandRegistry] Failed to deserialize command:`, error);
      return null;
    }
  }

  /**
   * Check if a command type is registered
   */
  static has(type: string): boolean {
    return this.factories.has(type);
  }

  /**
   * Clear all registered factories (for testing)
   */
  static clear(): void {
    this.factories.clear();
  }
}
