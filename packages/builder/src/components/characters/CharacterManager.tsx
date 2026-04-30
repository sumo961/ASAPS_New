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
  Trash2,
  X,
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
  /**
   * Project-level emotion palette. When provided, the palette editor reads
   * from / writes to the project via these props. When omitted, the manager
   * falls back to local component state (default Ekman palette) — useful for
   * unit tests and host shells that haven't wired persistence yet.
   */
  emotionPalette?: EmotionDefinition[];
  onEmotionPaletteChange?: (palette: EmotionDefinition[]) => void;
}


export const CharacterManager: React.FC<CharacterManagerProps> = ({
  characters: initialCharacters,
  onCharactersChange,
  assets = [],
  onAssetAdd, // Add this
  selectionMode = false,
  onCharacterSelect,
  onCharacterCreated,
  emotionPalette: emotionPaletteProp,
  onEmotionPaletteChange,
}) => {
  // Only use selection management from the hook
  const characters: Character[] = initialCharacters;
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  // When the user clicks a variant sub-card, jump straight to it inside
  // the editor's Affect tab. Cleared whenever the editor is opened the
  // ordinary way (parent character click / "Add character" / templates).
  const [focusVariantId, setFocusVariantId] = useState<string | null>(null);
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
  const [emotionPaletteLocal, setEmotionPaletteLocal] = useState<EmotionDefinition[]>(
    () => DEFAULT_EMOTION_PALETTE.map((e) => ({ ...e })),
  );
  const emotionPalette = emotionPaletteProp ?? emotionPaletteLocal;
  const setEmotionPalette = onEmotionPaletteChange ?? setEmotionPaletteLocal;
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
      setFocusVariantId(null);
      setShowEditor(true);
    }
  };

  // Open editor for a character (used in selection mode's edit button)
  const handleEditCharacter = (character: Character) => {
    selectCharacter(character.id);
    setFocusVariantId(null);
    setShowEditor(true);
  };

  // Open the editor focused on a specific variant of a character — used by
  // variant sub-cards in the grouped grid view.
  const handleVariantClick = (character: Character, variantId: string) => {
    if (selectionMode) return;
    selectCharacter(character.id);
    setFocusVariantId(variantId);
    setShowEditor(true);
  };

  // Remove a variant from a character. Confirms first because variants
  // carry distinct trait / mood / portrait overrides that the author
  // can't trivially recreate from memory. Also clears defaultVariantId
  // when the removed variant was the default, so the runtime falls back
  // to the base character cleanly.
  const handleVariantRemove = (character: Character, variantId: string) => {
    const variant = character.variants?.find((v) => v.id === variantId);
    if (!variant) return;
    const ok = confirm(
      `Remove variant "${variant.name || variantId}" from ${character.displayName || character.name}?\n\nThe variant's overrides (traits, mood, portrait) will be lost. Other variants and the base character are unaffected.`,
    );
    if (!ok) return;
    const nextVariants = (character.variants || []).filter((v) => v.id !== variantId);
    const updated: Character = {
      ...character,
      variants: nextVariants.length > 0 ? nextVariants : undefined,
      defaultVariantId: character.defaultVariantId === variantId ? undefined : character.defaultVariantId,
      updatedAt: new Date().toISOString(),
    };
    onCharactersChange(characters.map((c) => (c.id === character.id ? updated : c)));
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
            {filteredCharacters.map((character) => {
              const hasVariants = !!(character.variants && character.variants.length > 0);
              if (!hasVariants) {
                return (
                  <CharacterCard
                    key={character.id}
                    character={character}
                    onClick={() => handleCharacterClick(character)}
                    onRemove={() => handleCharacterRemove(character.id)}
                    onEdit={() => handleEditCharacter(character)}
                    selectionMode={selectionMode}
                    imageUrl={resolveImageUrl(character.visual.defaultAssetId, character.visual.defaultImage, assets)}
                  />
                );
              }
              // Variant group: parent header + each variant as a sub-card
              // inside a shared frame, with a visible "linked" cue (color
              // dot inherited, bracketed by a thin colored border, "↳"
              // glyph on each variant).
              const baseColor = character.color || '#94a3b8';
              const baseImageUrl = resolveImageUrl(character.visual.defaultAssetId, character.visual.defaultImage, assets);
              return (
                <div
                  key={character.id}
                  className="relative bg-white rounded-lg overflow-hidden flex flex-col"
                  style={{ border: `2px solid ${baseColor}` }}
                >
                  {/* Parent header — clicking opens the base editor. */}
                  <div
                    onClick={() => handleCharacterClick(character)}
                    className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 border-b"
                    style={{ borderBottomColor: baseColor }}
                    title="Edit base character (overrides apply to all variants)"
                  >
                    <span
                      className="inline-block w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: baseColor }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{character.displayName || character.name}</div>
                      <div className="text-[10px] text-gray-500">
                        {character.variants!.length} {character.variants!.length === 1 ? 'variant' : 'variants'}
                        {character.defaultVariantId ? ` · default: ${character.defaultVariantId}` : ''}
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleCharacterRemove(character.id); }}
                      className="text-gray-300 hover:text-red-500 text-sm flex-shrink-0"
                      title="Remove character (and all its variants)"
                    >
                      ✕
                    </button>
                  </div>
                  {/* Variant sub-cards — clicking each opens the editor
                      focused on that variant. */}
                  <div className="flex-1 p-2 space-y-2 bg-gray-50">
                    {character.variants!.map((v) => {
                      const variantImageUrl = resolveImageUrl(
                        v.portrait?.assetId,
                        v.portrait?.image,
                        assets,
                      ) || baseImageUrl;
                      const isDefault = character.defaultVariantId === v.id;
                      // Click on the body opens the editor focused on the
                      // variant; the action buttons sit as siblings outside
                      // the clickable region so there's no nested-handler
                      // race / propagation pitfall. Buttons are always
                      // visible (not hover-fade) so the affordance is
                      // discoverable even on touch devices.
                      return (
                        <div
                          key={v.id}
                          className="flex items-stretch bg-white rounded border border-gray-200 hover:border-blue-400 transition-colors"
                          title={isDefault ? 'Default at story start' : undefined}
                        >
                          <div
                            onClick={() => handleVariantClick(character, v.id)}
                            className="flex-1 flex items-center gap-2 p-2 cursor-pointer hover:bg-blue-50 rounded-l min-w-0"
                            title={`Edit variant: ${v.name}`}
                          >
                            <span
                              className="text-gray-400 flex-shrink-0 text-sm"
                              title={`Variant of ${character.displayName || character.name}`}
                            >↳</span>
                            {variantImageUrl ? (
                              <img
                                src={variantImageUrl}
                                alt={v.name}
                                className="w-8 h-8 rounded object-cover flex-shrink-0 border border-gray-200"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded bg-gray-100 flex-shrink-0 flex items-center justify-center text-[9px] text-gray-400">
                                no img
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-medium truncate">
                                {v.displayName || v.name}
                                {isDefault && (
                                  <span className="ml-1 text-[9px] text-blue-600 font-normal">(default)</span>
                                )}
                              </div>
                              {v.description && (
                                <div className="text-[10px] text-gray-500 truncate">{v.description}</div>
                              )}
                            </div>
                          </div>
                          {/* Action buttons — outside the clickable body so
                              they get clean event handling without needing
                              stopPropagation tricks. Always visible (not
                              hover-only) so they're discoverable on touch
                              devices and don't depend on cursor position. */}
                          <div className="flex items-center gap-0.5 px-1 border-l border-gray-100 bg-gray-50 rounded-r flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => handleVariantClick(character, v.id)}
                              className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-white rounded"
                              title={`Edit ${v.name}`}
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleVariantRemove(character, v.id)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-white rounded"
                              title={`Remove ${v.name}`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    <button
                      onClick={() => handleVariantClick(character, character.variants![0].id)}
                      className="w-full text-[10px] text-gray-500 hover:text-blue-600 py-1 italic"
                      title="Open editor → Affect tab → Variants section to add another"
                    >
                      + Add variant…
                    </button>
                  </div>
                </div>
              );
            })}
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
          emotionPalette={emotionPalette}
          focusVariantId={focusVariantId || undefined}
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
