/**
 * Character Manager Integration Hook
 * Manages the state and visibility of the Character Manager in the main app
 */

import { useState, useCallback } from 'react';
import { Character } from '../types/character';

export function useCharacterManagerIntegration() {
  const [showCharacterManager, setShowCharacterManager] = useState(false);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [onCharacterSelect, setOnCharacterSelect] = useState<((character: Character) => void) | undefined>(undefined);

  const toggleCharacterManager = useCallback(() => {
    setShowCharacterManager(prev => !prev);
    setSelectionMode(false);
    setOnCharacterSelect(undefined);
  }, []);

  const openCharacterManagerForSelection = useCallback((callback: (character: Character) => void) => {
    setShowCharacterManager(true);
    setSelectionMode(true);
    // Wrap callback to close modal after selection
    setOnCharacterSelect(() => (character: Character) => {
      callback(character);
      setShowCharacterManager(false);
      setSelectionMode(false);
      setOnCharacterSelect(undefined);
    });
  }, []);

  const closeCharacterManager = useCallback(() => {
    setShowCharacterManager(false);
    setSelectionMode(false);
    setOnCharacterSelect(undefined);
  }, []);

  const updateCharacters = useCallback((newCharacters: Character[]) => {
    setCharacters(newCharacters);
  }, []);

  return {
    characters,
    showCharacterManager,
    toggleCharacterManager,
    openCharacterManagerForSelection,
    closeCharacterManager,
    updateCharacters,
    selectionMode,
    onCharacterSelect,
  };
}
