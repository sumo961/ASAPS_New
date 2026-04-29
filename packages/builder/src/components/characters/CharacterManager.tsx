/**
 * Character Manager Component
 * Main container for all character-related functionality
 */

import React, { useState, useEffect } from 'react';
import {
  Plus,
  Search,
  Grid,
  List,
  Filter,
  Download,
  Upload,
  Users,
  Pencil,
  Trash2
} from 'lucide-react';
import { Character, CHARACTER_TEMPLATES } from '../../types/character';
import { CharacterCard } from './CharacterCard';
import { CharacterEditor } from './CharacterEditor';
import { EmotionPaletteEditor } from './EmotionPaletteEditor';
import { DEFAULT_EMOTION_PALETTE, type EmotionDefinition } from '@asaps/core';

/**
 * Helper to resolve fresh image URL from assets using assetId.
 * Character images stored with blob URLs become stale after page reload.
 */
function resolveImageUrl(
  assetId: string | undefined,
  image: string | undefined,
  assets: Array<{ id: string; url: string; }>
): string | undefined {
  // Try to resolve via assetId first (this gives fresh blob URLs)
  if (assetId) {
    const asset = assets.find(a => a.id === assetId);
    if (asset?.url) {
      return asset.url;
    }
  }
  // Fall back to stored image URL (might be stale blob URL)
  return image;
}

  // Use characters from props
//const characters = initialCharacters;


interface CharacterManagerProps {
  characters: Character[];
  onCharactersChange: (characters: Character[]) => void;
  assets?: Array<{ id: string; url: string; name: string; type: string; }>;
  onAssetAdd?: (asset: any) => Promise<boolean>; // Add this for asset management
  selectionMode?: boolean; // When true, clicking a character selects it instead of editing
  onCharacterSelect?: (character: Character) => void; // Callback when character is selected
  /**
   * Fired when the user creates a Character via the prefill flow ("Define
   * '<name>' as a Character" link in CharacterRefField). The host (App.tsx)
   * uses this to scan for free-text references to that name and offer a
   * one-click bulk re-link via BulkRelinkDialog.
   */
  onCharacterCreated?: (character: Character, sourceName: string) => void;
}


export const CharacterManager: React.FC<CharacterManagerProps> = ({
  characters: initialCharacters,
  onCharactersChange,
  assets = [],
  onAssetAdd, // Add this
  selectionMode = false,
  onCharacterSelect,
  onCharacterCreated,
}) => {
  // Only use selection management from the hook
  const characters: Character[] = initialCharacters;
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
 // const selectedCharacter = selectedCharacterId ? characters.find(c => c.id === selectedCharacterId) || null : null;
  const selectedCharacter = selectedCharacterId ? characters.find((c: Character) => c.id === selectedCharacterId) || null : null;
  
  const selectCharacter = (id: string | null) => {
    setSelectedCharacterId(id);
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState<'all' | 'player' | 'npc' | 'companion'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showEditor, setShowEditor] = useState(false);
  // Step 5 polish — emotion palette editor modal. Local in-memory state until
  // project-level persistence is wired through globalSettings/story save.
  const [showPaletteEditor, setShowPaletteEditor] = useState(false);
  const [emotionPalette, setEmotionPalette] = useState<EmotionDefinition[]>(
    () => DEFAULT_EMOTION_PALETTE.map((e) => ({ ...e })),
  );
  const [showTemplates, setShowTemplates] = useState(false);

  // Consume the prefill name set by Inspector → CharacterRefField's "Define
  // '<name>' as a Character" link. When present we skip the template picker
  // and create a minimal NPC with that name, then open the editor so the
  // author can fill in the rest. The prefill is cleared after consumption.
  useEffect(() => {
    const prefillName = (window as any).__asapsPrefillCharacterName;
    if (typeof prefillName !== 'string' || !prefillName.trim()) return;
    (window as any).__asapsPrefillCharacterName = undefined;
    const trimmed = prefillName.trim();

    // Don't double-create if a character with this exact name already exists —
    // just select it instead so the user lands somewhere predictable.
    const existing = characters.find((c) =>
      (c.name || '').toLowerCase() === trimmed.toLowerCase()
      || (c.displayName || '').toLowerCase() === trimmed.toLowerCase()
    );
    if (existing) {
      selectCharacter(existing.id);
      setShowEditor(true);
      return;
    }

    const sanitisedName = trimmed.replace(/\s+/g, '_').toLowerCase().slice(0, 64) || 'new_character';
    const newCharacter: Character = {
      id: `char_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: sanitisedName,
      displayName: trimmed,
      role: 'npc',
      visual: { type: 'static' },
      states: [{ id: 'default', name: 'default', displayName: 'Default', visual: {} }],
      defaultState: 'default',
      counters: [],
      inventory: [],
      description: '',
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    onCharactersChange([...characters, newCharacter]);
    selectCharacter(newCharacter.id);
    setShowEditor(true);
    // Notify the host so it can offer to re-link existing free-text references
    // to this character's name (Step 1.d.5 bulk re-link flow).
    if (onCharacterCreated) {
      onCharacterCreated(newCharacter, trimmed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);



  // Filter characters based on search and role
  const filteredCharacters = characters.filter((char: Character) => {
 // const filteredCharacters = characters.filter(char => {
    const matchesSearch = char.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          char.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          char.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = filterRole === 'all' || char.role === filterRole;
    return matchesSearch && matchesRole;
  });

  const handleCreateNew = () => {
    setShowTemplates(true);
  };

  const handleSelectTemplate = (templateIndex: number) => {
    const template = CHARACTER_TEMPLATES[templateIndex];
    if (!template) return;
    
    const newCharacter: Character = {
      id: `char_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: template.name || 'new_character',
      displayName: template.displayName || 'New Character',
      role: template.role || 'npc',
      visual: template.visual || { type: 'static' },
      states: template.states || [
        { id: 'default', name: 'default', displayName: 'Default', visual: {} }
      ],
      defaultState: template.defaultState || 'default',
      counters: template.counters || [],
      inventory: template.inventory || [],
      description: template.description,
      tags: template.tags || [],
      color: template.color,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    onCharactersChange([...characters, newCharacter]);
    selectCharacter(newCharacter.id);
    setShowEditor(true);
    setShowTemplates(false);
  };

  const handleCharacterClick = (character: Character) => {
    if (selectionMode && onCharacterSelect) {
      // In selection mode, call the callback with the selected character
      onCharacterSelect(character);
    } else {
      // In edit mode, open the editor
      selectCharacter(character.id);
      setShowEditor(true);
    }
  };

  // Open editor for a character (used in selection mode's edit button)
  const handleEditCharacter = (character: Character) => {
    selectCharacter(character.id);
    setShowEditor(true);
  };

  const handleCharacterRemove = (id: string) => {
    if (confirm('Are you sure you want to remove this character?')) {
     // onCharactersChange(characters.filter(c => c.id !== id));
      onCharactersChange(characters.filter((c: Character) => c.id !== id));
      if (selectedCharacter?.id === id) {
        selectCharacter(null);
      }
    }
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const importedCharacters = JSON.parse(event.target?.result as string);
            onCharactersChange([...characters, ...importedCharacters]);
            alert('Characters imported successfully!');
          } catch (error) {
            alert('Failed to import characters. Please check the file format.');
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  const handleExport = () => {
    const dataStr = JSON.stringify(characters, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = 'characters.json';
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const getRoleIcon = (role: Character['role']) => {
    switch (role) {
      case 'player': return '👤';
      case 'npc': return '🧙';
      case 'companion': return '🐕';
      default: return '👥';
    }
  };

  const getRoleColor = (role: Character['role']) => {
    switch (role) {
      case 'player': return 'bg-blue-100 text-blue-700';
      case 'npc': return 'bg-green-100 text-green-700';
      case 'companion': return 'bg-purple-100 text-purple-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5" />
          <h2 className="text-lg font-semibold">
            {selectionMode ? 'Select a Character' : 'Characters'}
          </h2>
          <span className="px-2 py-1 text-xs bg-gray-100 rounded-full">
            {characters.length}
          </span>
          {selectionMode && (
            <span className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded-full">
              Click to add to stage
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleImport}
            className="p-2 hover:bg-gray-100 rounded transition-colors"
            title="Import Characters"
          >
            <Upload className="w-4 h-4" />
          </button>
          <button
            onClick={handleExport}
            className="p-2 hover:bg-gray-100 rounded transition-colors"
            title="Export Characters"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowPaletteEditor(true)}
            className="px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50 transition-colors"
            title="Edit the project's emotion palette — names, mood-axis weights, decay rate"
          >
            Emotion palette…
          </button>
          <button
            onClick={handleCreateNew}
            className="flex items-center gap-2 px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Character
          </button>
        </div>
      </div>

      {/* Search and Filter Bar */}
      <div className="flex items-center gap-4 p-4 border-b bg-gray-50">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search characters..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value as any)}
            className="px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Roles</option>
            <option value="player">Player</option>
            <option value="npc">NPC</option>
            <option value="companion">Companion</option>
          </select>
        </div>
        <div className="flex items-center gap-1 border rounded-lg">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 transition-colors ${
              viewMode === 'grid' ? 'bg-blue-500 text-white' : 'hover:bg-gray-100'
            }`}
          >
            <Grid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 transition-colors ${
              viewMode === 'list' ? 'bg-blue-500 text-white' : 'hover:bg-gray-100'
            }`}
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Character List/Grid */}
      <div className="flex-1 p-4 overflow-auto">
        {viewMode === 'grid' ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredCharacters.map((character) => (
              <CharacterCard
                key={character.id}
                character={character}
                onClick={() => handleCharacterClick(character)}
                onRemove={() => handleCharacterRemove(character.id)}
                onEdit={() => handleEditCharacter(character)}
                selectionMode={selectionMode}
                imageUrl={resolveImageUrl(character.visual.defaultAssetId, character.visual.defaultImage, assets)}
              />
            ))}
            {/* Add Character Card */}
            <div
              onClick={handleCreateNew}
              className="aspect-square border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center hover:border-blue-500 hover:bg-blue-50 cursor-pointer transition-all"
            >
              <Plus className="w-8 h-8 text-gray-400 mb-2" />
              <span className="text-sm text-gray-500">Add Character</span>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredCharacters.map((character) => {
              const listImageUrl = resolveImageUrl(character.visual.defaultAssetId, character.visual.defaultImage, assets);
              return (
              <div
                key={character.id}
                onClick={() => handleCharacterClick(character)}
                className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 cursor-pointer transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gray-200 rounded-lg flex items-center justify-center">
                    {listImageUrl ? (
                      <img
                        src={listImageUrl}
                        alt={character.displayName}
                        className="w-full h-full object-cover rounded-lg"
                      />
                    ) : (
                      getRoleIcon(character.role)
                    )}
                  </div>
                  <div>
                    <div className="font-medium">{character.displayName}</div>
                    <div className="text-xs text-gray-500">{character.name}</div>
                  </div>
                  <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getRoleColor(character.role)}`}>
                    {character.role}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span>{character.states.length} states</span>
                    <span>•</span>
                    <span>{character.counters.length} counters</span>
                  </div>
                  {/* Edit button in selection mode */}
                  {selectionMode && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditCharacter(character);
                      }}
                      className="p-2 rounded-lg hover:bg-blue-100 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Edit Character"
                    >
                      <Pencil className="w-4 h-4 text-blue-500" />
                    </button>
                  )}
                  {/* Delete button — always visible so the first screen of the editor has per-row delete */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCharacterRemove(character.id);
                    }}
                    className="p-2 rounded-lg hover:bg-red-100 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remove Character"
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Template Selection Modal */}
      {showTemplates && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-auto">
            <h3 className="text-xl font-semibold mb-4">Choose a Template</h3>
            <div className="grid grid-cols-3 gap-4">
              {CHARACTER_TEMPLATES.map((template, index) => (
                <div
                  key={index}
                  onClick={() => handleSelectTemplate(index)}
                  className="p-4 border rounded-lg hover:border-blue-500 hover:bg-blue-50 cursor-pointer transition-all"
                >
                  <div className="text-2xl mb-2">{getRoleIcon(template.role!)}</div>
                  <div className="font-medium">{template.displayName}</div>
                  <div className="text-xs text-gray-500">{template.role}</div>
                </div>
              ))}
              <div
                onClick={() => {
                  const newChar: Character = {
                    id: `char_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    name: 'new_character',
                    displayName: 'New Character',
                    role: 'npc',
                    visual: { type: 'static' },
                    states: [
                      { id: 'default', name: 'default', displayName: 'Default', visual: {} }
                    ],
                    defaultState: 'default',
                    counters: [],
                    inventory: [],
                    tags: [],
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                  };
                  onCharactersChange([...characters, newChar]);
                  selectCharacter(newChar.id);
                  setShowEditor(true);
                  setShowTemplates(false);
                }}
                className="p-4 border rounded-lg hover:border-blue-500 hover:bg-blue-50 cursor-pointer transition-all"
              >
                <div className="text-2xl mb-2">➕</div>
                <div className="font-medium">Blank Character</div>
                <div className="text-xs text-gray-500">Start from scratch</div>
              </div>
            </div>
            <button
              onClick={() => setShowTemplates(false)}
              className="mt-4 px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Character Editor Modal */}
      {showEditor && selectedCharacter && (
        <CharacterEditor
          character={characters.find(c => c.id === selectedCharacter.id) || selectedCharacter}
          onUpdate={(updatedCharacter) => {
            // Update the character in the parent's state

            console.log('[Manager] about to replace', updatedCharacter);

            const updatedCharacters = characters.map((c: Character) => 
              c.id === selectedCharacter.id 
                ? { ...updatedCharacter, updatedAt: new Date().toISOString() }
                : c
            );

            console.log('[Manager] new array', updatedCharacters); // must contain "Player 1"

            onCharactersChange(updatedCharacters);
            // Update the selected character reference
            selectCharacter(updatedCharacter.id);
          }}
          onClose={() => {
            setShowEditor(false);
            selectCharacter(null);
          }}
          assets={assets}
          onAssetAdd={onAssetAdd} // Pass through the asset handler
        />
      )}

      {/* Emotion Palette Editor Modal */}
      {showPaletteEditor && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <EmotionPaletteEditor
            palette={emotionPalette}
            onChange={setEmotionPalette}
            onClose={() => setShowPaletteEditor(false)}
          />
        </div>
      )}
    </div>
  );
};
