/**
 * Batch Command - Composite command for bulk operations
 *
 * Wraps multiple commands into a single undoable operation.
 * Used for AI helper commands that modify multiple elements at once.
 */

import { Command, CommandRegistry } from './Command';
import type { SerializedCommand } from '../storage/types';

/**
 * Batch Command for grouping multiple operations into a single undo step
 */
export class BatchCommand extends Command {
  public readonly type = 'BATCH';
  public description: string;

  private commands: Command[];
  private batchDescription: string;

  constructor(
    commands: Command[],
    description: string,
    id?: string
  ) {
    super(id);
    this.commands = commands;
    this.batchDescription = description;
    this.description = description;
  }

  /**
   * Execute all commands in order
   */
  async execute(): Promise<void> {
    console.log(`[BatchCommand] Executing ${this.commands.length} commands: ${this.description}`);

    for (const command of this.commands) {
      try {
        await command.execute();
      } catch (error) {
        console.error(`[BatchCommand] Failed to execute command ${command.type}:`, error);
        // Attempt to undo any commands that have already executed
        const executedIndex = this.commands.indexOf(command);
        for (let i = executedIndex - 1; i >= 0; i--) {
          try {
            await this.commands[i].undo();
          } catch (undoError) {
            console.error(`[BatchCommand] Failed to undo command during rollback:`, undoError);
          }
        }
        throw error;
      }
    }
  }

  /**
   * Undo all commands in reverse order
   */
  async undo(): Promise<void> {
    console.log(`[BatchCommand] Undoing ${this.commands.length} commands: ${this.description}`);

    // Undo in reverse order
    for (let i = this.commands.length - 1; i >= 0; i--) {
      try {
        await this.commands[i].undo();
      } catch (error) {
        console.error(`[BatchCommand] Failed to undo command ${this.commands[i].type}:`, error);
        throw error;
      }
    }
  }

  /**
   * Redo all commands in order
   */
  async redo(): Promise<void> {
    console.log(`[BatchCommand] Redoing ${this.commands.length} commands: ${this.description}`);

    for (const command of this.commands) {
      try {
        await command.redo();
      } catch (error) {
        console.error(`[BatchCommand] Failed to redo command ${command.type}:`, error);
        throw error;
      }
    }
  }

  /**
   * Get the number of commands in this batch
   */
  get commandCount(): number {
    return this.commands.length;
  }

  /**
   * Get all commands in this batch
   */
  getCommands(): readonly Command[] {
    return this.commands;
  }

  /**
   * Serialize command data for storage
   */
  protected serializeData(): any {
    return {
      description: this.batchDescription,
      commands: this.commands.map(cmd => cmd.toJSON()),
    };
  }

  /**
   * Batch commands cannot be merged
   */
  canMergeWith(_command: Command): boolean {
    return false;
  }

  /**
   * Deserialize a batch command
   * Note: This requires all child command types to be registered
   */
  static deserialize(data: SerializedCommand): BatchCommand {
    const childCommands: Command[] = [];

    for (const serializedChild of data.data.commands) {
      const childCommand = CommandRegistry.deserialize(serializedChild);
      if (childCommand) {
        childCommands.push(childCommand);
      }
    }

    return new BatchCommand(
      childCommands,
      data.data.description,
      data.id
    );
  }
}

/**
 * Builder class for creating batch commands
 */
export class BatchCommandBuilder {
  private commands: Command[] = [];
  private description: string = 'Batch operation';

  /**
   * Set the description for this batch
   */
  setDescription(description: string): this {
    this.description = description;
    return this;
  }

  /**
   * Add a command to the batch
   */
  add(command: Command): this {
    this.commands.push(command);
    return this;
  }

  /**
   * Add multiple commands to the batch
   */
  addAll(commands: Command[]): this {
    this.commands.push(...commands);
    return this;
  }

  /**
   * Get the current number of commands
   */
  get count(): number {
    return this.commands.length;
  }

  /**
   * Check if the batch is empty
   */
  isEmpty(): boolean {
    return this.commands.length === 0;
  }

  /**
   * Build the batch command
   */
  build(): BatchCommand {
    if (this.commands.length === 0) {
      throw new Error('Cannot create empty batch command');
    }

    return new BatchCommand([...this.commands], this.description);
  }

  /**
   * Build if there are commands, otherwise return null
   */
  buildOrNull(): BatchCommand | null {
    if (this.commands.length === 0) {
      return null;
    }
    return this.build();
  }

  /**
   * Clear all commands
   */
  clear(): this {
    this.commands = [];
    return this;
  }
}

// Register the batch command for deserialization
CommandRegistry.register('BATCH', (data) => BatchCommand.deserialize(data));
