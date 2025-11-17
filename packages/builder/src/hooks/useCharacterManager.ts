import { useState, useCallback } from 'react';
import { Character, CHARACTER_TEMPLATES } from '../types/character';

interface UseCharacterManagerReturn {
  characters: Character[];
  selectedCharacter: Character | null;
  addCharacter: (character: Partial<Character>) => Character;
  updateCharacter: (id: string, updates: Partial<Character>) => void;
  removeCharacter: (id: string) => void;
  selectCharacter: (id: string | null) => void;
  importCharacters: (characters: Character[]) => void;
  exportCharacters: () => Character[];
  createFromTemplate: (templateIndex: number) => Character;
  getCharacterById: (id: string) => Character | undefined;
  getCharactersByRole: (role: 'player' | 'npc' | 'companion') => Character[];
}

export function useCharacterManager(): UseCharacterManagerReturn {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);

  // Generate unique character ID
  const generateId = useCallback(() => {
    return `char_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  // Add a new character
  const addCharacter = useCallback((characterData: Partial<Character>): Character => {
    const newCharacter: Character = {
      id: generateId(),
      name: characterData.name || 'new_character',
      displayName: characterData.displayName || 'New Character',
      role: characterData.role || 'npc',
      visual: characterData.visual || { type: 'static' },
      states: characterData.states || [
        { id: 'default', name: 'default', displayName: 'Default', visual: {} }
      ],
      defaultState: characterData.defaultState || 'default',
      counters: characterData.counters || [],
      inventory: characterData.inventory || [],
      description: characterData.description,
      tags: characterData.tags || [],
      color: characterData.color,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setCharacters(prev => [...prev, newCharacter]);
    return newCharacter;
  }, [generateId]);

  // Update an existing character
  const updateCharacter = useCallback((id: string, updates: Partial<Character>) => {
    setCharacters(prev => prev.map(char => {
      if (char.id === id) {
        const updated = {
          ...char,
          ...updates,
          updatedAt: new Date().toISOString(),
        };
        // Update selected character if it's the one being updated
        if (selectedCharacter?.id === id) {
          setSelectedCharacter(updated);
        }
        return updated;
      }
      return char;
    }));
  }, [selectedCharacter]);

  // Remove a character
  const removeCharacter = useCallback((id: string) => {
    setCharacters(prev => prev.filter(char => char.id !== id));
    if (selectedCharacter?.id === id) {
      setSelectedCharacter(null);
    }
  }, [selectedCharacter]);

  // Select a character for editing
  const selectCharacter = useCallback((id: string | null) => {
    if (id === null) {
      setSelectedCharacter(null);
    } else {
      const character = characters.find(c => c.id === id);
      setSelectedCharacter(character || null);
    }
  }, [characters]);

  // Import characters (for loading from story)
  const importCharacters = useCallback((importedCharacters: Character[]) => {
    setCharacters(importedCharacters);
    setSelectedCharacter(null);
  }, []);

  // Export characters (for saving to story)
  const exportCharacters = useCallback(() => {
    return characters;
  }, [characters]);

  // Create character from template
  const createFromTemplate = useCallback((templateIndex: number): Character => {
    const template = CHARACTER_TEMPLATES[templateIndex];
    if (!template) {
      throw new Error(`Template ${templateIndex} not found`);
    }
    return addCharacter(template);
  }, [addCharacter]);

  // Get character by ID
  const getCharacterById = useCallback((id: string): Character | undefined => {
    return characters.find(c => c.id === id);
  }, [characters]);

  // Get characters by role
  const getCharactersByRole = useCallback((role: 'player' | 'npc' | 'companion'): Character[] => {
    return characters.filter(c => c.role === role);
  }, [characters]);

  return {
    characters,
    selectedCharacter,
    addCharacter,
    updateCharacter,
    removeCharacter,
    selectCharacter,
    importCharacters,
    exportCharacters,
    createFromTemplate,
    getCharacterById,
    getCharactersByRole,
  };
}
