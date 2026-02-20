/**
 * Element Commands - Undoable commands for visual element operations
 *
 * Implements commands for adding, updating, deleting, and moving
 * visual elements in the beat editor.
 */

import { Command, CommandRegistry } from './Command';
import type { SerializedCommand } from '../storage/types';

// ============================================================================
// Visual Element Type
// ============================================================================

/**
 * Visual element in the beat editor
 */
export interface VisualElement {
  id: string;
  type: 'character' | 'prop' | 'text' | 'hotspot' | 'dialog' | 'button' | 'meter' | 'keypad';
  assetId?: string;
  imageUrl?: string;
  characterId?: string;
  text?: string;
  speaker?: string;
  choices?: string[];
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  rotation?: number;
  opacity?: number;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  backgroundColor?: string;
  borderRadius?: number;
  clickSoundUrl?: string;
  [key: string]: any; // Allow additional properties
}

// ============================================================================
// State Mutation Callbacks
// ============================================================================

/**
 * Callbacks for mutating element state
 */
export interface ElementStateMutations {
  addElement: (element: VisualElement) => void;
  updateElement: (elementId: string, updates: Partial<VisualElement>) => void;
  deleteElement: (elementId: string) => void;
}

// ============================================================================
// Add Element Command
// ============================================================================

export class AddElementCommand extends Command {
  public readonly type = 'ADD_ELEMENT';
  public description: string;

  private element: VisualElement;
  private mutations: ElementStateMutations;

  constructor(
    element: VisualElement,
    mutations: ElementStateMutations,
    id?: string
  ) {
    super(id);
    this.element = element;
    this.mutations = mutations;
    this.description = `Add ${element.type} element`;
  }

  execute(): void {
    this.mutations.addElement(this.element);
  }

  undo(): void {
    this.mutations.deleteElement(this.element.id);
  }

  protected serializeData(): any {
    return {
      element: this.element,
    };
  }

  static deserialize(data: SerializedCommand, mutations: ElementStateMutations): AddElementCommand {
    return new AddElementCommand(data.data.element, mutations, data.id);
  }
}

// ============================================================================
// Delete Element Command
// ============================================================================

export class DeleteElementCommand extends Command {
  public readonly type = 'DELETE_ELEMENT';
  public description: string;

  private element: VisualElement;
  private mutations: ElementStateMutations;

  constructor(
    element: VisualElement,
    mutations: ElementStateMutations,
    id?: string
  ) {
    super(id);
    this.element = element;
    this.mutations = mutations;
    this.description = `Delete ${element.type} element`;
  }

  execute(): void {
    this.mutations.deleteElement(this.element.id);
  }

  undo(): void {
    this.mutations.addElement(this.element);
  }

  protected serializeData(): any {
    return {
      element: this.element,
    };
  }

  static deserialize(data: SerializedCommand, mutations: ElementStateMutations): DeleteElementCommand {
    return new DeleteElementCommand(data.data.element, mutations, data.id);
  }
}

// ============================================================================
// Update Element Command
// ============================================================================

export class UpdateElementCommand extends Command {
  public readonly type = 'UPDATE_ELEMENT';
  public description: string;

  private elementId: string;
  private oldValues: Partial<VisualElement>;
  private newValues: Partial<VisualElement>;
  private mutations: ElementStateMutations;

  constructor(
    elementId: string,
    oldValues: Partial<VisualElement>,
    newValues: Partial<VisualElement>,
    mutations: ElementStateMutations,
    id?: string
  ) {
    super(id);
    this.elementId = elementId;
    this.oldValues = oldValues;
    this.newValues = newValues;
    this.mutations = mutations;

    const changedKeys = Object.keys(newValues).join(', ');
    this.description = `Update element ${elementId.slice(0, 8)} (${changedKeys})`;
  }

  execute(): void {
    this.mutations.updateElement(this.elementId, this.newValues);
  }

  undo(): void {
    this.mutations.updateElement(this.elementId, this.oldValues);
  }

  protected serializeData(): any {
    return {
      elementId: this.elementId,
      oldValues: this.oldValues,
      newValues: this.newValues,
    };
  }

  /**
   * Check if this command can be merged with another
   */
  canMergeWith(command: Command): boolean {
    if (!(command instanceof UpdateElementCommand)) {
      return false;
    }

    // Only merge if updating the same element
    if (command.elementId !== this.elementId) {
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
    if (!(command instanceof UpdateElementCommand)) {
      return;
    }

    // Merge the new values
    this.newValues = { ...this.newValues, ...command.newValues };

    // Update description
    const changedKeys = Object.keys(this.newValues).join(', ');
    this.description = `Update element ${this.elementId.slice(0, 8)} (${changedKeys})`;
  }

  static deserialize(data: SerializedCommand, mutations: ElementStateMutations): UpdateElementCommand {
    return new UpdateElementCommand(
      data.data.elementId,
      data.data.oldValues,
      data.data.newValues,
      mutations,
      data.id
    );
  }
}

// ============================================================================
// Move Element Command
// ============================================================================

/**
 * Specialized command for moving elements
 * Handles position and z-index changes with better merging
 */
export class MoveElementCommand extends Command {
  public readonly type = 'MOVE_ELEMENT';
  public description: string;

  private elementId: string;
  private oldPosition: { x: number; y: number; z?: number };
  private newPosition: { x: number; y: number; z?: number };
  private mutations: ElementStateMutations;

  constructor(
    elementId: string,
    oldPosition: { x: number; y: number; z?: number },
    newPosition: { x: number; y: number; z?: number },
    mutations: ElementStateMutations,
    id?: string
  ) {
    super(id);
    this.elementId = elementId;
    this.oldPosition = oldPosition;
    this.newPosition = newPosition;
    this.mutations = mutations;
    this.description = `Move element ${elementId.slice(0, 8)}`;
  }

  execute(): void {
    this.mutations.updateElement(this.elementId, this.newPosition);
  }

  undo(): void {
    this.mutations.updateElement(this.elementId, this.oldPosition);
  }

  protected serializeData(): any {
    return {
      elementId: this.elementId,
      oldPosition: this.oldPosition,
      newPosition: this.newPosition,
    };
  }

  /**
   * Check if this command can be merged with another
   * Move commands are highly mergeable during dragging
   */
  canMergeWith(command: Command): boolean {
    if (!(command instanceof MoveElementCommand)) {
      return false;
    }

    // Only merge if moving the same element
    if (command.elementId !== this.elementId) {
      return false;
    }

    // Only merge if commands are within 500ms of each other (active dragging)
    const timeDiff = command.timestamp.getTime() - this.timestamp.getTime();
    if (timeDiff > 500) {
      return false;
    }

    return true;
  }

  /**
   * Merge this command with another
   * Keep the original start position but update to the new end position
   */
  mergeWith(command: Command): void {
    if (!(command instanceof MoveElementCommand)) {
      return;
    }

    // Update to the new position (keep old position as original)
    this.newPosition = command.newPosition;
  }

  static deserialize(data: SerializedCommand, mutations: ElementStateMutations): MoveElementCommand {
    return new MoveElementCommand(
      data.data.elementId,
      data.data.oldPosition,
      data.data.newPosition,
      mutations,
      data.id
    );
  }
}

// ============================================================================
// Visual Elements Snapshot Command
// ============================================================================

/**
 * Snapshot-based command that stores before/after copies of the full
 * elements array. Handles multi-element drags, alignment, and any
 * bulk changes as a single undo step.
 *
 * Uses `unknown[]` internally so it works with any VisualElement definition
 * (the command never inspects individual element properties).
 */
export class VisualElementsSnapshotCommand extends Command {
  public readonly type = 'UPDATE_VISUAL_ELEMENTS';
  public description: string;
  private oldElements: unknown[];
  private newElements: unknown[];
  private applyFn: (elements: any[]) => void;

  constructor(
    oldElements: unknown[],
    newElements: unknown[],
    applyFn: (elements: any[]) => void,
    description: string,
    id?: string
  ) {
    super(id);
    this.oldElements = oldElements;
    this.newElements = newElements;
    this.applyFn = applyFn;
    this.description = description;
  }

  execute(): void {
    this.applyFn(this.newElements);
  }

  undo(): void {
    this.applyFn(this.oldElements);
  }

  protected serializeData(): any {
    return {
      oldElements: this.oldElements,
      newElements: this.newElements,
      description: this.description,
    };
  }

  canMergeWith(command: Command): boolean {
    if (!(command instanceof VisualElementsSnapshotCommand)) {
      return false;
    }
    // Only merge commands with the same description within 2 seconds
    if (command.description !== this.description) {
      return false;
    }
    const timeDiff = command.timestamp.getTime() - this.timestamp.getTime();
    if (timeDiff > 2000) {
      return false;
    }
    return true;
  }

  mergeWith(command: Command): void {
    if (!(command instanceof VisualElementsSnapshotCommand)) {
      return;
    }
    // Keep original oldElements, update to latest newElements
    this.newElements = command.newElements;
  }
}

// ============================================================================
// Register Commands
// ============================================================================

/**
 * Register element commands for deserialization
 */
export function registerElementCommands(mutations: ElementStateMutations): void {
  CommandRegistry.register('ADD_ELEMENT', (data) =>
    AddElementCommand.deserialize(data, mutations)
  );

  CommandRegistry.register('DELETE_ELEMENT', (data) =>
    DeleteElementCommand.deserialize(data, mutations)
  );

  CommandRegistry.register('UPDATE_ELEMENT', (data) =>
    UpdateElementCommand.deserialize(data, mutations)
  );

  CommandRegistry.register('MOVE_ELEMENT', (data) =>
    MoveElementCommand.deserialize(data, mutations)
  );

  // VisualElementsSnapshotCommand does not support deserialization
  // (applyFn cannot be serialized) but register the type so CommandRegistry
  // doesn't warn about unknown types if history is loaded.
  CommandRegistry.register('UPDATE_VISUAL_ELEMENTS', () => {
    console.warn('[CommandRegistry] UPDATE_VISUAL_ELEMENTS cannot be deserialized');
    return null as any;
  });
}
