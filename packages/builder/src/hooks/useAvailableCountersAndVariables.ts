/**
 * Hook to collect all available counters and variables from characters and global settings
 * Used for dropdown selection in beat editors
 */

import { useMemo } from 'react';
import type { Character, CharacterCounter, InventoryItem } from '../types/character';

/**
 * Represents a counter from a character, with character context
 */
export interface AvailableCounter {
  name: string;
  displayName: string;
  characterId: string;
  characterName: string;
  min?: number;
  max?: number;
  fullName: string; // "characterName: displayName"
  /**
   * True when the counter mirrors affect state rather than storing a value
   * of its own (docs/Counter-Binding-Design.md).
   *
   * Annotated here rather than filtered, because the same list feeds both
   * *reads* and *writes*. Reading a derived counter in a condition is
   * exactly as valid as reading any other; only writing to one is
   * meaningless, since the next appraisal tick would overwrite it. Write
   * surfaces disable these with a reason — see `derivedWriteReason`.
   */
  derived?: boolean;
  /** The affect effect that actually moves this quantity, for write surfaces to suggest. */
  derivedWriteReason?: string;
}

/**
 * Why a derived counter can't be assigned, and what to use instead. Shown
 * inline at write surfaces so the option is visibly unavailable rather than
 * silently missing — an author who defined a counter and then can't find it
 * would reasonably assume a bug.
 */
export function derivedWriteReason(counter: { name: string; source?: { kind: string } }): string {
  const target = counter.source?.kind === 'mood'
    ? 'a Nudge Mood effect'
    : counter.source?.kind === 'emotion'
      ? 'a Fire Emotion effect'
      : 'an Add Sentiment effect';
  return `${counter.name} mirrors affect state — change it with ${target}`;
}

/**
 * Represents a variable from global settings
 */
export interface AvailableVariable {
  name: string;
  type: 'string' | 'number' | 'boolean';
  defaultValue?: string | number | boolean;
  description?: string;
}

/**
 * Global settings shape (partial, just what we need for variables)
 */
interface GlobalSettingsForVariables {
  variables?: {
    name: string;
    type: 'string' | 'number' | 'boolean';
    defaultValue?: string | number | boolean;
    description?: string;
  }[];
}

/**
 * Collect all counters from all characters
 */
export function useAvailableCounters(characters: Character[]): AvailableCounter[] {
  return useMemo(() => {
    const counters: AvailableCounter[] = [];

    characters.forEach((character) => {
      if (character.counters && Array.isArray(character.counters)) {
        character.counters.forEach((counter: CharacterCounter) => {
          counters.push({
            name: counter.name,
            displayName: counter.displayName || counter.name,
            characterId: character.id,
            characterName: character.displayName || character.name,
            min: counter.min,
            max: counter.max,
            fullName: `${character.displayName || character.name}: ${counter.displayName || counter.name}`,
            derived: !!counter.source,
            derivedWriteReason: counter.source ? derivedWriteReason(counter) : undefined,
          });
        });
      }
    });

    return counters;
  }, [characters]);
}

/**
 * Collect all variables from global settings
 */
export function useAvailableVariables(globalSettings: GlobalSettingsForVariables | null): AvailableVariable[] {
  return useMemo(() => {
    if (!globalSettings?.variables) {
      return [];
    }

    return globalSettings.variables.map((v) => ({
      name: v.name,
      type: v.type,
      defaultValue: v.defaultValue,
      description: v.description,
    }));
  }, [globalSettings]);
}

/**
 * Represents an inventory item from a character
 */
export interface AvailableInventoryItem {
  name: string;
  displayName: string;
  characterId: string;
  characterName: string;
  fullName: string; // "characterName: displayName"
}

/**
 * Collect all inventory items from all characters
 */
export function useAvailableInventoryItems(characters: Character[]): AvailableInventoryItem[] {
  return useMemo(() => {
    const items: AvailableInventoryItem[] = [];

    characters.forEach((character) => {
      if (character.inventory && Array.isArray(character.inventory)) {
        character.inventory.forEach((item: InventoryItem) => {
          items.push({
            name: item.name,
            displayName: item.displayName || item.name,
            characterId: character.id,
            characterName: character.displayName || character.name,
            fullName: `${character.displayName || character.name}: ${item.displayName || item.name}`,
          });
        });
      }
    });

    return items;
  }, [characters]);
}

/**
 * Combined hook for getting both counters and variables
 */
export function useAvailableCountersAndVariables(
  characters: Character[],
  globalSettings: GlobalSettingsForVariables | null
): {
  counters: AvailableCounter[];
  variables: AvailableVariable[];
  allNumericOptions: { name: string; label: string; type: 'counter' | 'variable' }[];
  allStringOptions: { name: string; label: string; type: 'variable' }[];
} {
  const counters = useAvailableCounters(characters);
  const variables = useAvailableVariables(globalSettings);

  // All numeric options: counters + number-type variables
  const allNumericOptions = useMemo(() => {
    const options: { name: string; label: string; type: 'counter' | 'variable' }[] = [];

    // Add all counters
    counters.forEach((c) => {
      options.push({
        name: c.name,
        label: c.fullName,
        type: 'counter',
      });
    });

    // Add number-type variables
    variables
      .filter((v) => v.type === 'number')
      .forEach((v) => {
        options.push({
          name: v.name,
          label: v.description ? `${v.name} (${v.description})` : v.name,
          type: 'variable',
        });
      });

    return options;
  }, [counters, variables]);

  // All string options: string-type variables
  const allStringOptions = useMemo(() => {
    return variables
      .filter((v) => v.type === 'string')
      .map((v) => ({
        name: v.name,
        label: v.description ? `${v.name} (${v.description})` : v.name,
        type: 'variable' as const,
      }));
  }, [variables]);

  return {
    counters,
    variables,
    allNumericOptions,
    allStringOptions,
  };
}
