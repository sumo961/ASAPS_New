/**
 * UndoRedoToolbar - UI component for undo/redo controls
 *
 * Provides visual buttons for undo/redo operations with
 * keyboard shortcut hints and command descriptions.
 */

import React from 'react';
import { Undo2, Redo2 } from 'lucide-react';
import { useCommandManager, useCommandKeyboardShortcuts } from '../hooks/useCommandManager';
import type { CommandManagerOptions } from '../commands/CommandManager';

export interface UndoRedoToolbarProps {
  /** Command manager options */
  options?: CommandManagerOptions;

  /** Show command descriptions in tooltips */
  showDescriptions?: boolean;

  /** Show keyboard shortcuts */
  showShortcuts?: boolean;

  /** Toolbar orientation */
  orientation?: 'horizontal' | 'vertical';

  /** Custom className */
  className?: string;
}

/**
 * Toolbar with undo/redo buttons
 */
export const UndoRedoToolbar: React.FC<UndoRedoToolbarProps> = ({
  options,
  showDescriptions = true,
  showShortcuts = true,
  orientation = 'horizontal',
  className = '',
}) => {
  const {
    undo,
    redo,
    canUndo,
    canRedo,
    undoCommand,
    redoCommand,
    stats,
  } = useCommandManager(options);

  const shortcuts = useCommandKeyboardShortcuts();

  const getUndoTooltip = (): string => {
    let tooltip = 'Undo';
    if (showShortcuts) {
      tooltip += ` (${shortcuts.undo})`;
    }
    if (showDescriptions && undoCommand) {
      tooltip += `\n${undoCommand.description}`;
    }
    return tooltip;
  };

  const getRedoTooltip = (): string => {
    let tooltip = 'Redo';
    if (showShortcuts) {
      tooltip += ` (${shortcuts.redo})`;
    }
    if (showDescriptions && redoCommand) {
      tooltip += `\n${redoCommand.description}`;
    }
    return tooltip;
  };

  const containerClass =
    orientation === 'horizontal'
      ? 'flex flex-row items-center gap-1'
      : 'flex flex-col items-center gap-1';

  return (
    <div className={`${containerClass} ${className}`}>
      {/* Undo button */}
      <button
        onClick={undo}
        disabled={!canUndo}
        title={getUndoTooltip()}
        className={`
          p-2 rounded-md transition-colors
          ${
            canUndo
              ? 'hover:bg-gray-100 active:bg-gray-200 text-gray-700'
              : 'opacity-30 cursor-not-allowed text-gray-400'
          }
        `}
        aria-label={`Undo${undoCommand ? `: ${undoCommand.description}` : ''}`}
      >
        <Undo2 size={18} />
      </button>

      {/* Redo button */}
      <button
        onClick={redo}
        disabled={!canRedo}
        title={getRedoTooltip()}
        className={`
          p-2 rounded-md transition-colors
          ${
            canRedo
              ? 'hover:bg-gray-100 active:bg-gray-200 text-gray-700'
              : 'opacity-30 cursor-not-allowed text-gray-400'
          }
        `}
        aria-label={`Redo${redoCommand ? `: ${redoCommand.description}` : ''}`}
      >
        <Redo2 size={18} />
      </button>

      {/* History count (optional) */}
      {stats.totalCommands > 0 && (
        <span className="text-xs text-gray-500 ml-2" title={`${stats.undoCount} undo / ${stats.redoCount} redo`}>
          {stats.currentIndex + 1}/{stats.totalCommands}
        </span>
      )}
    </div>
  );
};

/**
 * Compact version with just icons (no labels)
 */
export const CompactUndoRedoToolbar: React.FC<Omit<UndoRedoToolbarProps, 'showDescriptions' | 'showShortcuts'>> = (
  props
) => {
  return <UndoRedoToolbar {...props} showDescriptions={false} showShortcuts={false} />;
};
