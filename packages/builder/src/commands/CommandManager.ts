/**
 * CommandManager - Manages command history for undo/redo functionality
 *
 * Maintains a stack of executed commands, handles undo/redo operations,
 * and integrates with StorageManager for persistent history.
 */

import { Command, CommandRegistry } from './Command';
import type { CommandHistory, SerializedCommand } from '../storage/types';
import { getStorageManager } from '../storage';

/**
 * Configuration options for CommandManager
 */
export interface CommandManagerOptions {
  /** Maximum number of commands to keep in history */
  maxHistory?: number;

  /** Project ID for persistence */
  projectId?: string;

  /** Enable auto-save of history */
  autoSave?: boolean;

  /** Auto-save debounce delay in milliseconds */
  autoSaveDelay?: number;

  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Command manager for undo/redo functionality
 */
export class CommandManager {
  private history: Command[] = [];
  private currentIndex: number = -1;
  private options: Required<CommandManagerOptions>;
  private autoSaveTimeout: number | null = null;
  private listeners: Set<() => void> = new Set();

  constructor(options: CommandManagerOptions = {}) {
    this.options = {
      maxHistory: options.maxHistory || 50,
      projectId: options.projectId || '',
      autoSave: options.autoSave !== false,
      autoSaveDelay: options.autoSaveDelay || 2000,
      debug: options.debug || false,
    };
  }

  /**
   * Execute a command and add it to history
   */
  async execute(command: Command): Promise<void> {
    try {
      // Execute the command
      await command.execute();

      // Clear any commands after current index (they're now in alternate timeline)
      if (this.currentIndex < this.history.length - 1) {
        this.history = this.history.slice(0, this.currentIndex + 1);
      }

      // Try to merge with previous command if possible
      if (this.history.length > 0) {
        const lastCommand = this.history[this.history.length - 1];
        if (lastCommand.canMergeWith(command)) {
          lastCommand.mergeWith(command);
          this.log('Command merged with previous:', command.type);
          this.notifyListeners();
          this.scheduleAutoSave();
          return;
        }
      }

      // Add command to history
      this.history.push(command);
      this.currentIndex++;

      // Trim history if it exceeds max size
      if (this.history.length > this.options.maxHistory) {
        this.history.shift();
        this.currentIndex--;
      }

      this.log('Command executed:', command.type);
      this.notifyListeners();
      this.scheduleAutoSave();
    } catch (error) {
      console.error('[CommandManager] Failed to execute command:', error);
      throw error;
    }
  }

  /**
   * Undo the last command
   */
  async undo(): Promise<boolean> {
    if (!this.canUndo()) {
      this.log('Cannot undo - no commands to undo');
      return false;
    }

    try {
      const command = this.history[this.currentIndex];
      await command.undo();
      this.currentIndex--;

      this.log('Command undone:', command.type);
      this.notifyListeners();
      this.scheduleAutoSave();
      return true;
    } catch (error) {
      console.error('[CommandManager] Failed to undo command:', error);
      return false;
    }
  }

  /**
   * Redo the next command
   */
  async redo(): Promise<boolean> {
    if (!this.canRedo()) {
      this.log('Cannot redo - no commands to redo');
      return false;
    }

    try {
      const command = this.history[this.currentIndex + 1];
      await command.redo();
      this.currentIndex++;

      this.log('Command redone:', command.type);
      this.notifyListeners();
      this.scheduleAutoSave();
      return true;
    } catch (error) {
      console.error('[CommandManager] Failed to redo command:', error);
      return false;
    }
  }

  /**
   * Record a command in history without executing it.
   * Used when the action has already been performed (e.g., addBeat returns the beat).
   */
  pushWithoutExecute(command: Command): void {
    // Clear any commands after current index
    if (this.currentIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentIndex + 1);
    }

    // Try to merge with previous command
    if (this.history.length > 0) {
      const lastCommand = this.history[this.history.length - 1];
      if (lastCommand.canMergeWith(command)) {
        lastCommand.mergeWith(command);
        this.log('Command merged (without execute):', command.type);
        this.notifyListeners();
        this.scheduleAutoSave();
        return;
      }
    }

    this.history.push(command);
    this.currentIndex++;

    if (this.history.length > this.options.maxHistory) {
      this.history.shift();
      this.currentIndex--;
    }

    this.log('Command pushed (without execute):', command.type);
    this.notifyListeners();
    this.scheduleAutoSave();
  }

  /**
   * Check if undo is available
   */
  canUndo(): boolean {
    return this.currentIndex >= 0;
  }

  /**
   * Check if redo is available
   */
  canRedo(): boolean {
    return this.currentIndex < this.history.length - 1;
  }

  /**
   * Get the command that would be undone
   */
  getUndoCommand(): Command | null {
    if (!this.canUndo()) return null;
    return this.history[this.currentIndex];
  }

  /**
   * Get the command that would be redone
   */
  getRedoCommand(): Command | null {
    if (!this.canRedo()) return null;
    return this.history[this.currentIndex + 1];
  }

  /**
   * Clear all history
   */
  clear(): void {
    this.history = [];
    this.currentIndex = -1;
    this.notifyListeners();
    this.scheduleAutoSave();
    this.log('History cleared');
  }

  /**
   * Get current history size
   */
  getHistorySize(): number {
    return this.history.length;
  }

  /**
   * Get current position in history
   */
  getCurrentIndex(): number {
    return this.currentIndex;
  }

  /**
   * Get all commands in history (for debugging)
   */
  getHistory(): ReadonlyArray<Command> {
    return this.history;
  }

  /**
   * Set project ID for persistence
   */
  setProjectId(projectId: string): void {
    this.options.projectId = projectId;
    this.log('Project ID set:', projectId);
  }

  /**
   * Subscribe to history changes
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify all listeners of history changes
   */
  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener());
  }

  /**
   * Schedule auto-save of history
   */
  private scheduleAutoSave(): void {
    if (!this.options.autoSave || !this.options.projectId) {
      return;
    }

    // Clear existing timeout
    if (this.autoSaveTimeout !== null) {
      clearTimeout(this.autoSaveTimeout);
    }

    // Schedule new save
    this.autoSaveTimeout = window.setTimeout(async () => {
      await this.saveToStorage();
      this.autoSaveTimeout = null;
    }, this.options.autoSaveDelay);
  }

  /**
   * Save history to storage immediately
   */
  async saveToStorage(): Promise<void> {
    if (!this.options.projectId) {
      this.log('Cannot save history - no project ID set');
      return;
    }

    try {
      const storage = getStorageManager();
      const serialized = this.serialize();
      await storage.saveHistory(serialized);
      this.log('History saved to storage');
    } catch (error) {
      console.error('[CommandManager] Failed to save history:', error);
    }
  }

  /**
   * Load history from storage
   */
  async loadFromStorage(): Promise<boolean> {
    if (!this.options.projectId) {
      this.log('Cannot load history - no project ID set');
      return false;
    }

    try {
      const storage = getStorageManager();
      const result = await storage.getHistory(this.options.projectId);

      if (!result.success || !result.data) {
        this.log('No history found in storage');
        return false;
      }

      this.deserialize(result.data);
      this.log('History loaded from storage');
      return true;
    } catch (error) {
      console.error('[CommandManager] Failed to load history:', error);
      return false;
    }
  }

  /**
   * Serialize history to storage format
   */
  serialize(): CommandHistory {
    const serializedCommands: SerializedCommand[] = this.history.map((cmd) => cmd.toJSON());

    return {
      projectId: this.options.projectId,
      commands: serializedCommands,
      currentIndex: this.currentIndex,
      lastUpdated: new Date(),
    };
  }

  /**
   * Deserialize history from storage format
   */
  deserialize(data: CommandHistory): void {
    this.history = [];
    this.currentIndex = data.currentIndex;

    // Deserialize each command
    for (const serialized of data.commands) {
      const command = CommandRegistry.deserialize(serialized);
      if (command) {
        this.history.push(command);
      } else {
        console.warn('[CommandManager] Failed to deserialize command:', serialized.type);
      }
    }

    this.notifyListeners();
    this.log('History deserialized:', this.history.length, 'commands');
  }

  /**
   * Get history statistics
   */
  getStats(): {
    totalCommands: number;
    currentIndex: number;
    canUndo: boolean;
    canRedo: boolean;
    undoCount: number;
    redoCount: number;
  } {
    return {
      totalCommands: this.history.length,
      currentIndex: this.currentIndex,
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      undoCount: this.currentIndex + 1,
      redoCount: this.history.length - this.currentIndex - 1,
    };
  }

  /**
   * Debug logging
   */
  private log(...args: any[]): void {
    if (this.options.debug) {
      console.log('[CommandManager]', ...args);
    }
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    if (this.autoSaveTimeout !== null) {
      clearTimeout(this.autoSaveTimeout);
      this.autoSaveTimeout = null;
    }
    this.listeners.clear();
    this.log('CommandManager disposed');
  }
}

// ============================================================================
// Singleton Instance (optional)
// ============================================================================

let commandManagerInstance: CommandManager | null = null;

/**
 * Get the singleton CommandManager instance
 */
export function getCommandManager(options?: CommandManagerOptions): CommandManager {
  if (!commandManagerInstance) {
    commandManagerInstance = new CommandManager(options);
  }
  return commandManagerInstance;
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetCommandManager(): void {
  if (commandManagerInstance) {
    commandManagerInstance.dispose();
    commandManagerInstance = null;
  }
}
