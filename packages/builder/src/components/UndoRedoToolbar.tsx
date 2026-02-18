/**
 * UndoRedoToolbar - UI component for undo/redo controls
 *
 * Provides visual buttons for undo/redo operations with
 * keyboard shortcut hints, command descriptions, and a
 * history dropdown panel.
 */

import React, { useState, useRef, useEffect } from 'react';
import { Undo2, Redo2, History, Trash2 } from 'lucide-react';
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
 * Format a timestamp as relative time (e.g., "2s ago", "1m ago")
 */
function formatRelativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

/**
 * Toolbar with undo/redo buttons and history dropdown
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
    manager,
    clear,
  } = useCommandManager(options);

  const shortcuts = useCommandKeyboardShortcuts();
  const [showHistory, setShowHistory] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showHistory) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowHistory(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showHistory]);

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

  const history = manager.getHistory();
  const currentIndex = stats.currentIndex;

  const handleJumpTo = async (targetIndex: number) => {
    if (targetIndex === currentIndex) return;

    if (targetIndex < currentIndex) {
      // Need to undo (currentIndex - targetIndex) times
      for (let i = 0; i < currentIndex - targetIndex; i++) {
        await manager.undo();
      }
    } else {
      // Need to redo (targetIndex - currentIndex) times
      for (let i = 0; i < targetIndex - currentIndex; i++) {
        await manager.redo();
      }
    }
    setShowHistory(false);
  };

  const containerClass =
    orientation === 'horizontal'
      ? 'flex flex-row items-center gap-1'
      : 'flex flex-col items-center gap-1';

  return (
    <div className={`${containerClass} ${className}`} ref={dropdownRef}>
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

      {/* History button + dropdown */}
      {stats.totalCommands > 0 && (
        <div className="relative">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-1 px-1.5 py-1 rounded-md text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            title="Show history"
          >
            <History size={14} />
            <span>{stats.currentIndex + 1}/{stats.totalCommands}</span>
          </button>

          {showHistory && (
            <div className="absolute top-full left-0 mt-1 w-72 bg-white rounded-lg shadow-xl border border-gray-200 z-50 overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50">
                <span className="text-xs font-medium text-gray-600">History</span>
                <button
                  onClick={() => { clear(); setShowHistory(false); }}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors"
                  title="Clear history"
                >
                  <Trash2 size={12} />
                  <span>Clear</span>
                </button>
              </div>

              {/* Command list */}
              <div className="max-h-80 overflow-y-auto">
                {/* Show in reverse order (newest first) */}
                {[...history].reverse().map((cmd, reverseIdx) => {
                  const idx = history.length - 1 - reverseIdx;
                  const isCurrent = idx === currentIndex;
                  const isUndone = idx > currentIndex;

                  return (
                    <button
                      key={cmd.id}
                      onClick={() => handleJumpTo(idx)}
                      className={`
                        w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2
                        transition-colors border-b border-gray-50 last:border-0
                        ${isCurrent
                          ? 'bg-blue-50 text-blue-700 font-medium'
                          : isUndone
                            ? 'text-gray-300 hover:bg-gray-50'
                            : 'text-gray-600 hover:bg-gray-50'
                        }
                      `}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        {isCurrent && (
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                        )}
                        <span className={`truncate ${!isCurrent ? 'ml-3.5' : ''}`}>
                          {cmd.description}
                        </span>
                      </span>
                      <span className={`flex-shrink-0 ${isUndone ? 'text-gray-300' : 'text-gray-400'}`}>
                        {formatRelativeTime(cmd.timestamp)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
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
