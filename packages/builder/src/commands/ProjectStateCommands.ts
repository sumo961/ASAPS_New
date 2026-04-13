/**
 * Project State Commands - Undoable commands for whole-slice state replacements
 *
 * Used for editors that save a whole state slice at once (Character Editor,
 * Global Settings Inspector). These commands snapshot the old and new value
 * via structured clone and swap them on undo/redo.
 */

import { Command } from './Command';
import type { Character } from '../types/character';
import type { GlobalSettings } from '../components/settings/GlobalSettingsInspector';
import type { SerializedCommand } from '../storage/types';

function clone<T>(value: T): T {
  // structuredClone is supported in all modern browsers + Electron
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

// ============================================================================
// Update Characters Command
// ============================================================================

export interface CharactersMutations {
  setCharacters: (chars: Character[]) => void;
}

export class UpdateCharactersCommand extends Command {
  public readonly type = 'UPDATE_CHARACTERS';
  public description: string;

  private oldCharacters: Character[];
  private newCharacters: Character[];
  private mutations: CharactersMutations;

  constructor(
    oldCharacters: Character[],
    newCharacters: Character[],
    mutations: CharactersMutations,
    description?: string,
    id?: string
  ) {
    super(id);
    this.oldCharacters = clone(oldCharacters);
    this.newCharacters = clone(newCharacters);
    this.mutations = mutations;
    this.description = description || 'Edit characters';
  }

  execute(): void {
    this.mutations.setCharacters(clone(this.newCharacters));
  }

  undo(): void {
    this.mutations.setCharacters(clone(this.oldCharacters));
  }

  protected serializeData(): any {
    return {
      oldCharacters: this.oldCharacters,
      newCharacters: this.newCharacters,
    };
  }

  static deserialize(
    _data: SerializedCommand,
    _mutations: CharactersMutations
  ): UpdateCharactersCommand {
    throw new Error('UpdateCharactersCommand deserialization not yet implemented');
  }
}

// ============================================================================
// Update Global Settings Command
// ============================================================================

export interface GlobalSettingsMutations {
  setGlobalSettings: (settings: GlobalSettings) => void;
}

export class UpdateGlobalSettingsCommand extends Command {
  public readonly type = 'UPDATE_GLOBAL_SETTINGS';
  public description: string;

  private oldSettings: GlobalSettings;
  private newSettings: GlobalSettings;
  private mutations: GlobalSettingsMutations;

  constructor(
    oldSettings: GlobalSettings,
    newSettings: GlobalSettings,
    mutations: GlobalSettingsMutations,
    description?: string,
    id?: string
  ) {
    super(id);
    this.oldSettings = clone(oldSettings);
    this.newSettings = clone(newSettings);
    this.mutations = mutations;
    this.description = description || 'Update global settings';
  }

  execute(): void {
    this.mutations.setGlobalSettings(clone(this.newSettings));
  }

  undo(): void {
    this.mutations.setGlobalSettings(clone(this.oldSettings));
  }

  protected serializeData(): any {
    return {
      oldSettings: this.oldSettings,
      newSettings: this.newSettings,
    };
  }

  static deserialize(
    _data: SerializedCommand,
    _mutations: GlobalSettingsMutations
  ): UpdateGlobalSettingsCommand {
    throw new Error('UpdateGlobalSettingsCommand deserialization not yet implemented');
  }
}
