/**
 * useCommandManager Hook - React integration for command pattern
 *
 * Provides a React hook interface to the CommandManager with:
 * - Undo/redo functionality
 * - Keyboard shortcuts (Ctrl+Z, Ctrl+Shift+Z)
 * - React state synchronization
 * - History management
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { CommandManager, type CommandManagerOptions } from '../commands/CommandManager';
import { Command } from '../commands/Command';

/**
 * Return type for useCommandManager hook
 */
export interface UseCommandManagerReturn {
  /** Execute a command */
  execute: (command: Command) => Promise<void>;

  /** Undo the last command */
  undo: () => Promise<void>;

  /** Redo the next command */
  redo: () => Promise<void>;

  /** Check if undo is available */
  canUndo: boolean;

  /** Check if redo is available */
  canRedo: boolean;

  /** Get the command that would be undone */
  undoCommand: Command | null;

  /** Get the command that would be redone */
  redoCommand: Command | null;

  /** Clear all history */
  clear: () => void;

  /** Get history statistics */
  stats: {
    totalCommands: number;
    currentIndex: number;
    undoCount: number;
    redoCount: number;
  };

  /** The CommandManager instance */
  manager: CommandManager;
}

/**
 * Hook for managing undo/redo with command pattern
 *
 * @param options - CommandManager options
 * @param enableKeyboardShortcuts - Enable Ctrl+Z/Ctrl+Shift+Z shortcuts (default: true)
 * @returns Command manager interface
 *
 * @example
 * ```tsx
 * const { execute, undo, redo, canUndo, canRedo } = useCommandManager({
 *   projectId: 'my-project',
 *   maxHistory: 50,
 * });
 *
 * // Execute a command
 * await execute(new AddElementCommand(element, mutations));
 *
 * // Undo
 * await undo();
 *
 * // Redo
 * await redo();
 * ```
 */
export function useCommandManager(
  options?: CommandManagerOptions,
  enableKeyboardShortcuts: boolean = true
): UseCommandManagerReturn {
  // Create manager instance (persists across re-renders)
  const managerRef = useRef<CommandManager | null>(null);

  if (!managerRef.current) {
    managerRef.current = new CommandManager(options);
  }

  const manager = managerRef.current;

  // State for triggering re-renders
  const [, setUpdateTrigger] = useState(0);
  const forceUpdate = useCallback(() => setUpdateTrigger((n) => n + 1), []);

  // Subscribe to history changes
  useEffect(() => {
    const unsubscribe = manager.subscribe(() => {
      forceUpdate();
    });

    return unsubscribe;
  }, [manager, forceUpdate]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!enableKeyboardShortcuts) {
      return;
    }

    const handleKeyDown = async (event: KeyboardEvent) => {
      // Check for Ctrl+Z or Cmd+Z (undo)
      if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        await manager.undo();
      }

      // Check for Ctrl+Shift+Z or Cmd+Shift+Z (redo)
      if ((event.ctrlKey || event.metaKey) && event.key === 'z' && event.shiftKey) {
        event.preventDefault();
        await manager.redo();
      }

      // Alternative: Ctrl+Y for redo (Windows convention)
      if ((event.ctrlKey || event.metaKey) && event.key === 'y') {
        event.preventDefault();
        await manager.redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [manager, enableKeyboardShortcuts]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      manager.dispose();
    };
  }, [manager]);

  // Command execution
  const execute = useCallback(
    async (command: Command) => {
      await manager.execute(command);
    },
    [manager]
  );

  // Undo
  const undo = useCallback(async () => {
    await manager.undo();
  }, [manager]);

  // Redo
  const redo = useCallback(async () => {
    await manager.redo();
  }, [manager]);

  // Clear history
  const clear = useCallback(() => {
    manager.clear();
  }, [manager]);

  // Get current state
  const canUndo = manager.canUndo();
  const canRedo = manager.canRedo();
  const undoCommand = manager.getUndoCommand();
  const redoCommand = manager.getRedoCommand();
  const stats = manager.getStats();

  return {
    execute,
    undo,
    redo,
    canUndo,
    canRedo,
    undoCommand,
    redoCommand,
    clear,
    stats,
    manager,
  };
}

/**
 * Hook for keyboard shortcuts display
 * Returns formatted strings for showing in UI
 */
export function useCommandKeyboardShortcuts() {
  const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);

  return {
    undo: isMac ? '⌘Z' : 'Ctrl+Z',
    redo: isMac ? '⌘⇧Z' : 'Ctrl+Shift+Z',
    redoAlt: isMac ? '⌘Y' : 'Ctrl+Y',
  };
}
