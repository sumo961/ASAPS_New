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
import { CommandManager, type CommandManagerOptions, getCommandManager } from '../commands/CommandManager';
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
 * Options for useCommandManager hook
 */
export interface UseCommandManagerOptions {
  /** CommandManager options */
  managerOptions?: CommandManagerOptions;

  /** Enable keyboard shortcuts (default: true) */
  enableKeyboardShortcuts?: boolean;

  /** Callback fired after any command operation (execute, undo, redo) */
  onCommandExecuted?: (type: 'execute' | 'undo' | 'redo', command: Command | null) => void;
}

/**
 * Hook for managing undo/redo with command pattern
 *
 * @param options - Hook options
 * @returns Command manager interface
 *
 * @example
 * ```tsx
 * const { execute, undo, redo, canUndo, canRedo } = useCommandManager({
 *   managerOptions: { projectId: 'my-project', maxHistory: 50 },
 *   onCommandExecuted: (type, cmd) => console.log('Command:', type, cmd?.description),
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
  options?: UseCommandManagerOptions | CommandManagerOptions,
  enableKeyboardShortcuts: boolean = true
): UseCommandManagerReturn {
  // Handle both old and new options format for backwards compatibility
  const hookOptions: UseCommandManagerOptions = options && 'managerOptions' in options
    ? options
    : { managerOptions: options as CommandManagerOptions | undefined, enableKeyboardShortcuts };

  const {
    managerOptions,
    enableKeyboardShortcuts: enableShortcuts = enableKeyboardShortcuts,
    onCommandExecuted,
  } = hookOptions;
  // Use the singleton command manager so history persists across components
  // This ensures that commands executed in one component (like HelperCommandInput)
  // can be undone from anywhere in the app
  const managerRef = useRef<CommandManager | null>(null);

  if (!managerRef.current) {
    managerRef.current = getCommandManager(managerOptions);
  }

  const manager = managerRef.current;

  // Store callback in ref to avoid re-creating handlers
  const onCommandExecutedRef = useRef(onCommandExecuted);
  onCommandExecutedRef.current = onCommandExecuted;

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
    if (!enableShortcuts) {
      return;
    }

    const handleKeyDown = async (event: KeyboardEvent) => {
      // Text fields own their native undo — a project-level undo firing on
      // top of a text-field revert destroys work invisibly.
      const target = event.target as HTMLElement | null;
      if (target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      )) {
        return;
      }

      // Check for Ctrl+Z or Cmd+Z (undo)
      if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        const cmd = manager.getUndoCommand();
        await manager.undo();
        onCommandExecutedRef.current?.('undo', cmd);
      }

      // Check for Ctrl+Shift+Z or Cmd+Shift+Z (redo)
      if ((event.ctrlKey || event.metaKey) && event.key === 'z' && event.shiftKey) {
        event.preventDefault();
        const cmd = manager.getRedoCommand();
        await manager.redo();
        onCommandExecutedRef.current?.('redo', cmd);
      }

      // Alternative: Ctrl+Y for redo (Windows convention)
      if ((event.ctrlKey || event.metaKey) && event.key === 'y') {
        event.preventDefault();
        const cmd = manager.getRedoCommand();
        await manager.redo();
        onCommandExecutedRef.current?.('redo', cmd);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [manager, enableShortcuts]);

  // Note: We don't dispose the singleton manager on unmount
  // The singleton persists for the lifetime of the app

  // Command execution
  const execute = useCallback(
    async (command: Command) => {
      await manager.execute(command);
      onCommandExecutedRef.current?.('execute', command);
    },
    [manager]
  );

  // Undo
  const undo = useCallback(async () => {
    const cmd = manager.getUndoCommand();
    await manager.undo();
    onCommandExecutedRef.current?.('undo', cmd);
  }, [manager]);

  // Redo
  const redo = useCallback(async () => {
    const cmd = manager.getRedoCommand();
    await manager.redo();
    onCommandExecutedRef.current?.('redo', cmd);
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
