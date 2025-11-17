/**
 * Commands Module Exports
 *
 * Central export point for the command pattern implementation.
 * Provides undo/redo functionality for all editor operations.
 */

// Base Command
export { Command, CommandRegistry, type CommandFactory } from './Command';

// Command Manager
export {
  CommandManager,
  getCommandManager,
  resetCommandManager,
  type CommandManagerOptions,
} from './CommandManager';

// Beat Commands
export {
  AddBeatCommand,
  DeleteBeatCommand,
  UpdateBeatCommand,
  registerBeatCommands,
  type BeatStateMutations,
} from './BeatCommands';

// Element Commands
export {
  AddElementCommand,
  DeleteElementCommand,
  UpdateElementCommand,
  MoveElementCommand,
  registerElementCommands,
  type ElementStateMutations,
  type VisualElement,
} from './ElementCommands';

// Animation Commands
export {
  AddAnimationCommand,
  DeleteAnimationCommand,
  UpdateAnimationCommand,
  registerAnimationCommands,
  type AnimationStateMutations,
} from './AnimationCommands';
