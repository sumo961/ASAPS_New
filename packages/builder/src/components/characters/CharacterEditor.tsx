/**
 * Character Editor Component
 * Detailed editing interface for individual characters
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  Save,
  User,
  Image,
  Layers,
  Calculator,
  Package,
  Plus,
  Trash2,
  Upload,
  Eye,
  EyeOff,
  Palette,
  Grid,
  FileImage,
  Film,
  Info,
  BarChart3,
  ArrowLeftRight,
  ArrowUpDown,
  Hash,
  Globe,
  Heart
} from 'lucide-react';
import { Character, CharacterState, CharacterCounter, InventoryItem, SpriteAnimation, MeterFrameConfig, MeterFrameAnchor, MeterFrameScreenPosition, MeterFrameDockMode, DEFAULT_METER_FRAME_CONFIG, InventoryFrameConfig, DEFAULT_INVENTORY_FRAME_CONFIG, MoodFrameConfig, DEFAULT_MOOD_FRAME_CONFIG } from '../../types/character';
import { describeMoodAxis, DEFAULT_TRAIT_NAMES, DEFAULT_TRAIT_VALUES, TRAIT_DESCRIPTIONS, DEFAULT_PERSONALITY_ARCHETYPES, findPersonalityArchetype } from '@asaps/core';
import { MoodPad } from './MoodPad';
import { StancePad } from './StancePad';
import {
  bigFiveToStance,
  stanceToBigFive,
  applyStanceToTraits,
  describeStance,
} from '../../services/prompts/interpersonalStance';
import { SpriteSheetEditor } from './SpriteSheetEditor';
import { useTranslationState } from '../../contexts/TranslationContext';
import { DirectAssetUpload } from '../assets/DirectAssetUpload';

/**
 * Helper to resolve fresh image URL from assets using assetId.
 * Character state images stored with blob URLs become stale after page reload.
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
  // Fall back to stored image URL (may be stale blob URL after page reload)
  return image;
}

interface CharacterEditorProps {
  character: Character;
  onUpdate: (character: Character) => void;
  onClose: () => void;
  assets?: Array<{ id: string; url: string; name: string; type: string; }>;
  onAssetAdd?: (asset: any) => Promise<boolean>; // Optional: add assets to global pool
  /** Project emotion palette — when supplied, the Affect tab's mood pad
   *  shows each emotion at its (weightToValence, weightToArousal) so
   *  authors see the geography of mood-space they're picking from. */
  emotionPalette?: ReadonlyArray<import('@asaps/core').EmotionDefinition>;
  /** When the user opens the editor by clicking a variant card in the
   *  manager, jump straight to the Affect tab and scroll the requested
   *  variant into view. */
  focusVariantId?: string;
}

export const CharacterEditor: React.FC<CharacterEditorProps> = ({
  character,
  onUpdate,
  onClose,
  assets = [],
  onAssetAdd,
  emotionPalette,
  focusVariantId,
}) => {
  const [activeTab, setActiveTab] = useState<'basic' | 'visual' | 'states' | 'counters' | 'inventory' | 'affect' | 'translations'>(focusVariantId ? 'affect' : 'basic');
  const [editedCharacter, setEditedCharacter] = useState<Character>(character);

  // When opened with focusVariantId set (variant card click), scroll the
  // matching variant card into view so the author lands on what they clicked.
  useEffect(() => {
    if (!focusVariantId) return;
    const t = setTimeout(() => {
      const el = document.querySelector(`[data-variant-id="${focusVariantId}"]`);
      if (el && 'scrollIntoView' in el) {
        (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
        (el as HTMLElement).style.outline = '2px solid #3b82f6';
        setTimeout(() => { (el as HTMLElement).style.outline = ''; }, 1600);
      }
    }, 80);
    return () => clearTimeout(t);
  }, [focusVariantId]);
  // Last archetype the author picked from the Personality dropdown. Local
  // session state — not persisted on Character, since the author might
  // tweak away from the preset and we don't want a stale label sticking
  // around in the saved data.
  const [selectedArchetypeId, setSelectedArchetypeId] = useState<string>('');
  const [hasChanges, setHasChanges] = useState(false);
  const [showAssetPicker, setShowAssetPicker] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const translationState = useTranslationState();

  // Update editedCharacter when character prop changes
  // This fixes the race condition where saved changes weren't being reflected
  useEffect(() => {
    // Always update when switching to a different character
    if (character.id !== editedCharacter.id) {
      setEditedCharacter(character);
      setHasChanges(false);
      setJustSaved(false);
    }
    // Also update after a successful save (when we're expecting the update)
    else if (justSaved) {
      setEditedCharacter(character);
      setHasChanges(false);
      setJustSaved(false);
    }
  }, [character, editedCharacter.id, justSaved])

  // Track changes
  useEffect(() => {
    const hasAnyChanges = JSON.stringify(character) !== JSON.stringify(editedCharacter);
    setHasChanges(hasAnyChanges);
  }, [editedCharacter, character]);

  const handleSave = () => {
    console.log('[Editor] sending', editedCharacter);
    setJustSaved(true); // Mark that we just saved to trigger state sync when parent updates
    onUpdate(editedCharacter);
    // Don't set hasChanges to false here - wait for the parent update to confirm
  };

  const handleClose = () => {
    if (hasChanges && !confirm('You have unsaved changes. Are you sure you want to close?')) {
      return;
    }
    onClose();
  };

  // Basic Info Tab
  const renderBasicTab = () => (
    <div className="space-y-4">
      {/* ID — the canonical reference key. Frozen after creation because
          conditions, sentiments, AI prompts, and saved-state snapshots
          all key off this value; renaming would break references. Shown
          read-only so authors can verify what's referenced from elsewhere
          (e.g. when the Inspector's Toward / Character autocomplete shows
          the lowercase slug, this is what they're seeing). */}
      <div>
        <label className="block text-sm font-medium mb-1">ID</label>
        <input
          type="text"
          value={editedCharacter.id}
          readOnly
          className="w-full px-3 py-2 border rounded-lg bg-gray-50 text-gray-700 font-mono text-sm cursor-not-allowed"
        />
        <p className="text-xs text-gray-500 mt-1">
          Frozen after creation. Used everywhere a character is referenced —
          conditions, sentiment targets, AI prompts, save-state.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Code Name</label>
        <input
          type="text"
          value={editedCharacter.name}
          onChange={(e) => setEditedCharacter({ ...editedCharacter, name: e.target.value })}
          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="e.g., player, old_wizard"
        />
        <p className="text-xs text-gray-500 mt-1">
          Short label used in AI prompts and exports. Often matches the ID
          in lowercase but can differ — this is editable, the ID is not.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Display Name</label>
        <input
          type="text"
          value={editedCharacter.displayName}
          onChange={(e) => {
                console.log('[Editor] typing', e.target.value);       // Is there something happening?

            //setEditedCharacter({ ...editedCharacter, displayName: e.target.value });
            setEditedCharacter(prev => {
                const next = { ...prev, displayName: e.target.value };
                console.log('[Editor] state after set', next); // ← add this
                return next;
            });
          }}
          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="e.g., Player, Old Wizard"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Role</label>
        <select
          value={editedCharacter.role}
          onChange={(e) => setEditedCharacter({ ...editedCharacter, role: e.target.value as Character['role'] })}
          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="player">Player</option>
          <option value="npc">NPC</option>
          <option value="companion">Companion</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <textarea
          value={editedCharacter.description || ''}
          onChange={(e) => setEditedCharacter({ ...editedCharacter, description: e.target.value })}
          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={3}
          placeholder="Character background and notes..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Theme Color</label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={editedCharacter.color || '#3B82F6'}
            onChange={(e) => setEditedCharacter({ ...editedCharacter, color: e.target.value })}
            className="w-12 h-12 border rounded cursor-pointer"
          />
          <input
            type="text"
            value={editedCharacter.color || '#3B82F6'}
            onChange={(e) => setEditedCharacter({ ...editedCharacter, color: e.target.value })}
            className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Tags</label>
        <input
          type="text"
          value={(editedCharacter.tags || []).join(', ')}
          onChange={(e) => setEditedCharacter({ 
            ...editedCharacter, 
            tags: e.target.value.split(',').map(t => t.trim()).filter(t => t) 
          })}
          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="e.g., main, merchant, questgiver"
        />
        <p className="text-xs text-gray-500 mt-1">Separate with commas</p>
      </div>
    </div>
  );

  // Visual Tab with enhanced static image and sprite sheet support
  const renderVisualTab = () => (
    <div className="space-y-4">
      {/* Visual Type Selection */}
      <div className="bg-white border rounded-lg p-4">
        <label className="block text-sm font-medium mb-3">Visual Type</label>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setEditedCharacter({ 
              ...editedCharacter, 
              visual: { ...editedCharacter.visual, type: 'static' }
            })}
            className={`p-4 border-2 rounded-lg transition-all flex flex-col items-center gap-2 ${
              editedCharacter.visual.type === 'static' 
                ? 'border-blue-500 bg-blue-50' 
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <FileImage className="w-8 h-8" />
            <div>
              <div className="font-medium">Static Images</div>
              <div className="text-xs text-gray-500">Individual images for states</div>
            </div>
          </button>
          
          <button
            onClick={() => {
              // Initialize sprite sheet config if switching to sprite type
              const newVisual = { 
                ...editedCharacter.visual, 
                type: 'sprite' as const
              };
              if (!newVisual.spriteSheet) {
                newVisual.spriteSheet = {
                  url: '',
                  frameWidth: 32,
                  frameHeight: 32,
                  animations: []
                };
              }
              setEditedCharacter({ ...editedCharacter, visual: newVisual });
            }}
            className={`p-4 border-2 rounded-lg transition-all flex flex-col items-center gap-2 ${
              editedCharacter.visual.type === 'sprite' 
                ? 'border-blue-500 bg-blue-50' 
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <Film className="w-8 h-8" />
            <div>
              <div className="font-medium">Sprite Sheet</div>
              <div className="text-xs text-gray-500">Animated character sprites</div>
            </div>
          </button>
        </div>
      </div>

      {/* Speaker Portrait (shown for both static and sprite types) */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <h4 className="font-medium mb-3 flex items-center gap-2">
          <User className="w-4 h-4" />
          Speaker Portrait
        </h4>
        <p className="text-xs text-gray-500 mb-3">Face/head image shown in text boxes during dialog when speaker display is enabled.</p>

        {resolveImageUrl(editedCharacter.portrait?.assetId, editedCharacter.portrait?.image, assets) && (
          <div className="mb-3 flex items-center gap-3">
            <img
              src={resolveImageUrl(editedCharacter.portrait?.assetId, editedCharacter.portrait?.image, assets)}
              alt="Portrait"
              className="w-16 h-16 rounded-lg object-cover border border-gray-300"
            />
            <button
              onClick={() => setEditedCharacter({ ...editedCharacter, portrait: undefined })}
              className="text-xs text-red-600 hover:text-red-700 flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" /> Remove
            </button>
          </div>
        )}

        <DirectAssetUpload
          currentAssetUrl={resolveImageUrl(editedCharacter.portrait?.assetId, editedCharacter.portrait?.image, assets)}
          onAssetSelect={(url, metadata) => {
            setEditedCharacter({
              ...editedCharacter,
              portrait: {
                image: url,
                assetId: metadata?.id || undefined,
              },
            });
          }}
          onAssetAdd={onAssetAdd}
          acceptTypes={['image/*']}
          maxSize={5}
          label="Upload Portrait"
        />

        {assets.length > 0 && !resolveImageUrl(editedCharacter.portrait?.assetId, editedCharacter.portrait?.image, assets) && (
          <div className="mt-3 pt-3 border-t border-gray-200">
            <button
              onClick={() => setShowAssetPicker('default')}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-2"
            >
              <Grid className="w-4 h-4" />
              Browse Existing Assets ({assets.filter(a => a.type === 'image').length})
            </button>
          </div>
        )}
      </div>

      {/* Static Images Configuration */}
      {editedCharacter.visual.type === 'static' && (
        <div className="space-y-4">
          <div className="bg-gray-50 p-4 rounded-lg">
            <h4 className="font-medium mb-3 flex items-center gap-2">
              <Image className="w-4 h-4" />
              Default Character Image
            </h4>
            
            {/* Direct Upload Component */}
            <DirectAssetUpload
              currentAssetUrl={resolveImageUrl(editedCharacter.visual.defaultAssetId, editedCharacter.visual.defaultImage, assets)}
              onAssetSelect={(url, metadata) => {
                // Save both the URL (for display) and assetId (for persistence)
                setEditedCharacter({
                  ...editedCharacter,
                  visual: {
                    ...editedCharacter.visual,
                    defaultImage: url,
                    defaultAssetId: metadata?.id || undefined
                  }
                });
              }}
              onAssetAdd={onAssetAdd}
              acceptTypes={['image/*']}
              maxSize={10}
              label="Upload Character Image"
            />
            
            {/* Browse Existing Assets Option */}
            {assets.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <button
                  onClick={() => setShowAssetPicker('default')}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-2"
                >
                  <Grid className="w-4 h-4" />
                  Browse Existing Assets ({assets.filter(a => a.type === 'image').length})
                </button>
              </div>
            )}
          </div>

          {/* Info about states */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800">
                <p className="font-medium">State-specific images</p>
                <p className="text-xs mt-1">You can assign different images to character states in the States tab. Each state can have its own visual representation.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sprite Sheet Configuration */}
      {editedCharacter.visual.type === 'sprite' && (
        <div className="space-y-4">
          <div className="bg-gray-50 p-4 rounded-lg">
            <h4 className="font-medium mb-3 flex items-center gap-2">
              <Grid className="w-4 h-4" />
              Sprite Sheet Source
            </h4>
            
            {/* Sprite Sheet Upload */}
            <div className="space-y-3">
              {!resolveImageUrl(editedCharacter.visual.spriteSheet?.assetId, editedCharacter.visual.spriteSheet?.url, assets) ? (
                <DirectAssetUpload
                  onAssetSelect={(url, metadata) => {
                    const newVisual = { ...editedCharacter.visual };
                    if (!newVisual.spriteSheet) {
                      newVisual.spriteSheet = {
                        url: url,
                        assetId: metadata?.id || undefined,
                        frameWidth: 32,
                        frameHeight: 32,
                        animations: []
                      };
                    } else {
                      newVisual.spriteSheet = { ...newVisual.spriteSheet, url: url, assetId: metadata?.id || undefined };
                    }
                    setEditedCharacter({ ...editedCharacter, visual: newVisual });
                  }}
                  onAssetAdd={onAssetAdd}
                  acceptTypes={['image/*']}
                  maxSize={10}
                  label="Upload Sprite Sheet"
                />
              ) : (
                <div className="relative">
                  <div className="border-2 border-gray-300 rounded-lg overflow-hidden"
                       style={{ maxHeight: '100px', maxWidth: '200px', backgroundImage: 'repeating-conic-gradient(#f0f0f0 0% 25%, white 0% 50%)', backgroundSize: '10px 10px' }}>
                    <img
                      src={resolveImageUrl(editedCharacter.visual.spriteSheet?.assetId, editedCharacter.visual.spriteSheet?.url, assets)}
                      alt="Sprite Sheet"
                      className="max-w-full max-h-[100px] object-contain"
                      style={{ imageRendering: 'pixelated' }}
                    />
                  </div>
                  <button
                    onClick={() => {
                      const newVisual = { ...editedCharacter.visual };
                      if (newVisual.spriteSheet) {
                        newVisual.spriteSheet = { ...newVisual.spriteSheet, url: '', assetId: undefined };
                      }
                      setEditedCharacter({ ...editedCharacter, visual: newVisual });
                    }}
                    className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full hover:bg-red-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              
              {/* Browse existing option for sprite sheets */}
              {assets.length > 0 && !resolveImageUrl(editedCharacter.visual.spriteSheet?.assetId, editedCharacter.visual.spriteSheet?.url, assets) && (
                <button
                  onClick={() => setShowAssetPicker('spritesheet')}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-2"
                >
                  <Grid className="w-4 h-4" />
                  Browse Existing Sprite Sheets
                </button>
              )}
            </div>

            {/* Sprite Sheet Editor */}
            {resolveImageUrl(editedCharacter.visual.spriteSheet?.assetId, editedCharacter.visual.spriteSheet?.url, assets) && (
              <div className="mt-4">
                <SpriteSheetEditor
                  spriteSheetUrl={resolveImageUrl(editedCharacter.visual.spriteSheet?.assetId, editedCharacter.visual.spriteSheet?.url, assets) || ''}
                  frameWidth={editedCharacter.visual.spriteSheet?.frameWidth || 32}
                  frameHeight={editedCharacter.visual.spriteSheet?.frameHeight || 32}
                  animations={editedCharacter.visual.spriteSheet?.animations || []}
                  onChange={(config) => {
                    const newVisual = { ...editedCharacter.visual };
                    if (newVisual.spriteSheet) {
                      newVisual.spriteSheet = {
                        ...newVisual.spriteSheet,
                        ...config
                      };
                    }
                    setEditedCharacter({ ...editedCharacter, visual: newVisual });
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  // States Tab
  const renderStatesTab = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-medium">Character States</h3>
        <button
          onClick={() => {
            const newState: CharacterState = {
              id: `state_${Date.now()}`,
              name: `state_${editedCharacter.states.length + 1}`,
              displayName: `State ${editedCharacter.states.length + 1}`,
              visual: {}
            };
            setEditedCharacter({
              ...editedCharacter,
              states: [...editedCharacter.states, newState]
            });
          }}
          className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm flex items-center gap-1"
        >
          <Plus className="w-3 h-3" />
          Add State
        </button>
      </div>

      <div className="space-y-2">
        {editedCharacter.states.map((state, index) => (
          <div key={state.id} className="border rounded-lg p-3">
            <div className="flex items-start justify-between">
              <div className="flex-1 space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={state.name}
                    onChange={(e) => {
                      const newStates = [...editedCharacter.states];
                      newStates[index] = { ...state, name: e.target.value };
                      setEditedCharacter({ ...editedCharacter, states: newStates });
                    }}
                    className="flex-1 px-2 py-1 border rounded text-sm"
                    placeholder="Internal name"
                  />
                  <input
                    type="text"
                    value={state.displayName}
                    onChange={(e) => {
                      const newStates = [...editedCharacter.states];
                      newStates[index] = { ...state, displayName: e.target.value };
                      setEditedCharacter({ ...editedCharacter, states: newStates });
                    }}
                    className="flex-1 px-2 py-1 border rounded text-sm"
                    placeholder="Display name"
                  />
                </div>
                <div className="flex items-center gap-2">
                  {(() => {
                    const resolvedUrl = resolveImageUrl(state.visual.assetId, state.visual.image, assets);
                    return resolvedUrl ? (
                      <img
                        src={resolvedUrl}
                        alt={state.displayName}
                        className="w-12 h-12 object-cover rounded border"
                      />
                    ) : null;
                  })()}
                  <button
                    onClick={() => setShowAssetPicker(`state_${state.id}`)}
                    className="px-2 py-1 text-xs border rounded hover:bg-gray-50"
                  >
                    Select Image
                  </button>
                  {state.id === editedCharacter.defaultState && (
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">Default</span>
                  )}
                  {state.id !== editedCharacter.defaultState && (
                    <button
                      onClick={() => setEditedCharacter({ ...editedCharacter, defaultState: state.id })}
                      className="px-2 py-1 text-xs border rounded hover:bg-blue-50"
                    >
                      Set as Default
                    </button>
                  )}
                </div>
              </div>
              {editedCharacter.states.length > 1 && (
                <button
                  onClick={() => {
                    const newStates = editedCharacter.states.filter(s => s.id !== state.id);
                    setEditedCharacter({ ...editedCharacter, states: newStates });
                  }}
                  className="p-1 text-red-500 hover:bg-red-50 rounded ml-2"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // Counters Tab
  const renderCountersTab = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-medium">Character Counters</h3>
        <button
          onClick={() => {
            const newCounter: CharacterCounter = {
              name: `counter_${editedCharacter.counters.length + 1}`,
              displayName: `Counter ${editedCharacter.counters.length + 1}`,
              value: 0,
              visible: true
            };
            setEditedCharacter({
              ...editedCharacter,
              counters: [...editedCharacter.counters, newCounter]
            });
          }}
          className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm flex items-center gap-1"
        >
          <Plus className="w-3 h-3" />
          Add Counter
        </button>
      </div>
      <p className="text-xs text-gray-500 -mt-2">
        These counters are scoped to <strong>{editedCharacter.displayName || editedCharacter.name}</strong>. The
        initial value here seeds the counter at story start. To change it during play, use a
        <code className="mx-1">setVariable</code> beat (type = Counter) with <strong>Owner</strong> set to this character —
        another character can safely use the same counter name.
      </p>

      <div className="space-y-2">
        {editedCharacter.counters.map((counter, index) => (
          <div key={index} className="border rounded-lg p-3">
            <div className="grid grid-cols-2 gap-2 mb-2">
              <input
                type="text"
                value={counter.name}
                onChange={(e) => {
                  const newCounters = [...editedCharacter.counters];
                  newCounters[index] = { ...counter, name: e.target.value };
                  setEditedCharacter({ ...editedCharacter, counters: newCounters });
                }}
                className="px-2 py-1 border rounded text-sm"
                placeholder="Internal name"
              />
              <input
                type="text"
                value={counter.displayName}
                onChange={(e) => {
                  const newCounters = [...editedCharacter.counters];
                  newCounters[index] = { ...counter, displayName: e.target.value };
                  setEditedCharacter({ ...editedCharacter, counters: newCounters });
                }}
                className="px-2 py-1 border rounded text-sm"
                placeholder="Display name"
              />
            </div>
            {/* Value / Min / Max labels */}
            <div className="grid grid-cols-4 gap-2 mb-1">
              <label className="text-xs text-gray-500">Initial</label>
              <label className="text-xs text-gray-500">Min</label>
              <label className="text-xs text-gray-500">Max</label>
              <label className="text-xs text-gray-500"></label>
            </div>
            <div className="grid grid-cols-4 gap-2 mb-2">
              <input
                type="number"
                value={counter.value}
                onChange={(e) => {
                  const newCounters = [...editedCharacter.counters];
                  newCounters[index] = { ...counter, value: Number(e.target.value) };
                  setEditedCharacter({ ...editedCharacter, counters: newCounters });
                }}
                className="px-2 py-1 border rounded text-sm"
                placeholder="0"
              />
              <input
                type="number"
                value={counter.min ?? ''}
                onChange={(e) => {
                  const newCounters = [...editedCharacter.counters];
                  newCounters[index] = { ...counter, min: e.target.value ? Number(e.target.value) : undefined };
                  setEditedCharacter({ ...editedCharacter, counters: newCounters });
                }}
                className="px-2 py-1 border rounded text-sm"
                placeholder="0"
              />
              <input
                type="number"
                value={counter.max ?? ''}
                onChange={(e) => {
                  const newCounters = [...editedCharacter.counters];
                  newCounters[index] = { ...counter, max: e.target.value ? Number(e.target.value) : undefined };
                  setEditedCharacter({ ...editedCharacter, counters: newCounters });
                }}
                className="px-2 py-1 border rounded text-sm"
                placeholder="100"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const newCounters = [...editedCharacter.counters];
                    newCounters[index] = { ...counter, visible: !counter.visible };
                    setEditedCharacter({ ...editedCharacter, counters: newCounters });
                  }}
                  className="p-1 hover:bg-gray-100 rounded"
                  title={counter.visible ? 'Visible' : 'Hidden'}
                >
                  {counter.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
                <input
                  type="color"
                  value={counter.color || '#3B82F6'}
                  onChange={(e) => {
                    const newCounters = [...editedCharacter.counters];
                    newCounters[index] = { ...counter, color: e.target.value };
                    setEditedCharacter({ ...editedCharacter, counters: newCounters });
                  }}
                  className="w-8 h-8 border rounded cursor-pointer"
                  title="Counter color"
                />
                <button
                  onClick={() => {
                    const newCounters = editedCharacter.counters.filter((_, i) => i !== index);
                    setEditedCharacter({ ...editedCharacter, counters: newCounters });
                  }}
                  className="p-1 text-red-500 hover:bg-red-50 rounded"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            {/* Level Meter Settings */}
            <div className="flex items-center gap-3 mt-2 pt-2 border-t border-gray-100">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={counter.showLevelMeter || false}
                  onChange={(e) => {
                    const newCounters = [...editedCharacter.counters];
                    newCounters[index] = { ...counter, showLevelMeter: e.target.checked };
                    setEditedCharacter({ ...editedCharacter, counters: newCounters });
                  }}
                  className="rounded border-gray-300"
                />
                <BarChart3 className="w-4 h-4 text-gray-500" />
                <span className="text-gray-600">Show Level Meter</span>
              </label>
              {counter.showLevelMeter && (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">Orientation:</span>
                    <button
                      onClick={() => {
                        const newCounters = [...editedCharacter.counters];
                        newCounters[index] = { ...counter, levelMeterOrientation: 'horizontal' };
                        setEditedCharacter({ ...editedCharacter, counters: newCounters });
                      }}
                      className={`p-1.5 rounded transition-colors ${
                        (counter.levelMeterOrientation || 'horizontal') === 'horizontal'
                          ? 'bg-blue-100 text-blue-700'
                          : 'hover:bg-gray-100 text-gray-500'
                      }`}
                      title="Horizontal"
                    >
                      <ArrowLeftRight className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        const newCounters = [...editedCharacter.counters];
                        newCounters[index] = { ...counter, levelMeterOrientation: 'vertical' };
                        setEditedCharacter({ ...editedCharacter, counters: newCounters });
                      }}
                      className={`p-1.5 rounded transition-colors ${
                        counter.levelMeterOrientation === 'vertical'
                          ? 'bg-blue-100 text-blue-700'
                          : 'hover:bg-gray-100 text-gray-500'
                      }`}
                      title="Vertical"
                    >
                      <ArrowUpDown className="w-4 h-4" />
                    </button>
                  </div>
                  {/* Numeric value toggle */}
                  <label className="flex items-center gap-2 text-sm ml-2">
                    <input
                      type="checkbox"
                      checked={counter.showNumericValue || false}
                      onChange={(e) => {
                        const newCounters = [...editedCharacter.counters];
                        newCounters[index] = { ...counter, showNumericValue: e.target.checked };
                        setEditedCharacter({ ...editedCharacter, counters: newCounters });
                      }}
                      className="rounded border-gray-300"
                    />
                    <Hash className="w-4 h-4 text-gray-500" />
                    <span className="text-gray-600">Show Value</span>
                  </label>
                  {/* Numeric format selector */}
                  {counter.showNumericValue && (
                    <select
                      value={counter.numericFormat || 'value'}
                      onChange={(e) => {
                        const newCounters = [...editedCharacter.counters];
                        newCounters[index] = { ...counter, numericFormat: e.target.value as 'value' | 'fraction' | 'percentage' };
                        setEditedCharacter({ ...editedCharacter, counters: newCounters });
                      }}
                      className="px-2 py-1 border rounded text-xs"
                    >
                      <option value="value">75</option>
                      <option value="fraction">75/100</option>
                      <option value="percentage">75%</option>
                    </select>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Meter Frame Configuration */}
      <div className="mt-6 pt-6 border-t">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Meter Frame (HUD Overlay)
          </h3>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!editedCharacter.meterFrame}
              onChange={(e) => {
                if (e.target.checked) {
                  setEditedCharacter({
                    ...editedCharacter,
                    meterFrame: { ...DEFAULT_METER_FRAME_CONFIG }
                  });
                } else {
                  const { meterFrame, ...rest } = editedCharacter;
                  setEditedCharacter(rest as Character);
                }
              }}
              className="rounded border-gray-300"
            />
            <span className="text-gray-600">Enable</span>
          </label>
        </div>

        {editedCharacter.meterFrame && (
          <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
            {/* Dock Mode Toggle */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Dock To</label>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setEditedCharacter({
                      ...editedCharacter,
                      meterFrame: { ...editedCharacter.meterFrame!, dockMode: 'character' }
                    });
                  }}
                  className={`flex-1 px-3 py-2 text-sm rounded border transition-colors ${
                    (editedCharacter.meterFrame?.dockMode ?? 'character') === 'character'
                      ? 'bg-blue-500 border-blue-600 text-white'
                      : 'bg-white border-gray-300 hover:bg-gray-100'
                  }`}
                >
                  Character
                </button>
                <button
                  onClick={() => {
                    setEditedCharacter({
                      ...editedCharacter,
                      meterFrame: { ...editedCharacter.meterFrame!, dockMode: 'screen' }
                    });
                  }}
                  className={`flex-1 px-3 py-2 text-sm rounded border transition-colors ${
                    editedCharacter.meterFrame?.dockMode === 'screen'
                      ? 'bg-blue-500 border-blue-600 text-white'
                      : 'bg-white border-gray-300 hover:bg-gray-100'
                  }`}
                >
                  Screen Corner
                </button>
              </div>
            </div>

            {/* Character Anchor Position (shown when dockMode is 'character') */}
            {(editedCharacter.meterFrame?.dockMode ?? 'character') === 'character' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Anchor Position</label>
                <div className="grid grid-cols-3 gap-1 w-32">
                  {(['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right'] as const).map((pos) => {
                    const isAnchor = pos !== 'center' && pos !== 'left' && pos !== 'right' ? pos : (pos === 'left' ? 'left' : (pos === 'right' ? 'right' : null));
                    if (pos === 'center') {
                      return <div key={pos} className="w-10 h-10 border border-dashed border-gray-300 rounded bg-gray-200" />;
                    }
                    return (
                      <button
                        key={pos}
                        onClick={() => {
                          if (isAnchor) {
                            setEditedCharacter({
                              ...editedCharacter,
                              meterFrame: { ...editedCharacter.meterFrame!, anchor: isAnchor as MeterFrameAnchor }
                            });
                          }
                        }}
                        className={`w-10 h-10 border rounded transition-colors ${
                          editedCharacter.meterFrame?.anchor === pos
                            ? 'bg-blue-500 border-blue-600 text-white'
                            : 'bg-white border-gray-300 hover:bg-gray-100'
                        }`}
                        title={pos}
                      >
                        <div className={`w-2 h-2 mx-auto rounded-full ${
                          editedCharacter.meterFrame?.anchor === pos ? 'bg-white' : 'bg-gray-400'
                        }`} />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Screen Corner Position (shown when dockMode is 'screen') */}
            {editedCharacter.meterFrame?.dockMode === 'screen' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Screen Corner</label>
                <div className="grid grid-cols-2 gap-2 w-48">
                  {([
                    { pos: 'screen-top-left', label: 'Top Left' },
                    { pos: 'screen-top-right', label: 'Top Right' },
                    { pos: 'screen-bottom-left', label: 'Bottom Left' },
                    { pos: 'screen-bottom-right', label: 'Bottom Right' }
                  ] as const).map(({ pos, label }) => (
                    <button
                      key={pos}
                      onClick={() => {
                        setEditedCharacter({
                          ...editedCharacter,
                          meterFrame: { ...editedCharacter.meterFrame!, screenPosition: pos as MeterFrameScreenPosition }
                        });
                      }}
                      className={`px-3 py-2 text-sm border rounded transition-colors ${
                        (editedCharacter.meterFrame?.screenPosition ?? 'screen-top-left') === pos
                          ? 'bg-blue-500 border-blue-600 text-white'
                          : 'bg-white border-gray-300 hover:bg-gray-100'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Offset */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Offset X</label>
                <input
                  type="number"
                  value={editedCharacter.meterFrame.offset.x}
                  onChange={(e) => {
                    setEditedCharacter({
                      ...editedCharacter,
                      meterFrame: {
                        ...editedCharacter.meterFrame!,
                        offset: { ...editedCharacter.meterFrame!.offset, x: parseInt(e.target.value) || 0 }
                      }
                    });
                  }}
                  className="w-full px-2 py-1 border rounded text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Offset Y</label>
                <input
                  type="number"
                  value={editedCharacter.meterFrame.offset.y}
                  onChange={(e) => {
                    setEditedCharacter({
                      ...editedCharacter,
                      meterFrame: {
                        ...editedCharacter.meterFrame!,
                        offset: { ...editedCharacter.meterFrame!.offset, y: parseInt(e.target.value) || 0 }
                      }
                    });
                  }}
                  className="w-full px-2 py-1 border rounded text-sm"
                />
              </div>
            </div>

            {/* Style Settings */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-gray-700">Style</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Background</label>
                  <input
                    type="text"
                    value={editedCharacter.meterFrame.style.backgroundColor}
                    onChange={(e) => {
                      setEditedCharacter({
                        ...editedCharacter,
                        meterFrame: {
                          ...editedCharacter.meterFrame!,
                          style: { ...editedCharacter.meterFrame!.style, backgroundColor: e.target.value }
                        }
                      });
                    }}
                    className="w-full px-2 py-1 border rounded text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Border Color</label>
                  <input
                    type="color"
                    value={editedCharacter.meterFrame.style.borderColor}
                    onChange={(e) => {
                      setEditedCharacter({
                        ...editedCharacter,
                        meterFrame: {
                          ...editedCharacter.meterFrame!,
                          style: { ...editedCharacter.meterFrame!.style, borderColor: e.target.value }
                        }
                      });
                    }}
                    className="w-full h-8 border rounded cursor-pointer"
                  />
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Border</label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={editedCharacter.meterFrame.style.borderWidth}
                    onChange={(e) => {
                      setEditedCharacter({
                        ...editedCharacter,
                        meterFrame: {
                          ...editedCharacter.meterFrame!,
                          style: { ...editedCharacter.meterFrame!.style, borderWidth: parseInt(e.target.value) || 0 }
                        }
                      });
                    }}
                    className="w-full px-2 py-1 border rounded text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Radius</label>
                  <input
                    type="number"
                    min="0"
                    max="20"
                    value={editedCharacter.meterFrame.style.borderRadius}
                    onChange={(e) => {
                      setEditedCharacter({
                        ...editedCharacter,
                        meterFrame: {
                          ...editedCharacter.meterFrame!,
                          style: { ...editedCharacter.meterFrame!.style, borderRadius: parseInt(e.target.value) || 0 }
                        }
                      });
                    }}
                    className="w-full px-2 py-1 border rounded text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Padding</label>
                  <input
                    type="number"
                    min="0"
                    max="20"
                    value={editedCharacter.meterFrame.style.padding}
                    onChange={(e) => {
                      setEditedCharacter({
                        ...editedCharacter,
                        meterFrame: {
                          ...editedCharacter.meterFrame!,
                          style: { ...editedCharacter.meterFrame!.style, padding: parseInt(e.target.value) || 0 }
                        }
                      });
                    }}
                    className="w-full px-2 py-1 border rounded text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Opacity</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={editedCharacter.meterFrame.style.opacity}
                    onChange={(e) => {
                      setEditedCharacter({
                        ...editedCharacter,
                        meterFrame: {
                          ...editedCharacter.meterFrame!,
                          style: { ...editedCharacter.meterFrame!.style, opacity: parseInt(e.target.value) || 0 }
                        }
                      });
                    }}
                    className="w-full px-2 py-1 border rounded text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Display Settings */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-gray-700">Display</h4>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editedCharacter.meterFrame.showLabels}
                  onChange={(e) => {
                    setEditedCharacter({
                      ...editedCharacter,
                      meterFrame: { ...editedCharacter.meterFrame!, showLabels: e.target.checked }
                    });
                  }}
                  className="rounded border-gray-300"
                />
                <span className="text-gray-600">Show Labels</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Meter Width</label>
                  <input
                    type="number"
                    min="50"
                    max="300"
                    value={editedCharacter.meterFrame.meterWidth}
                    onChange={(e) => {
                      setEditedCharacter({
                        ...editedCharacter,
                        meterFrame: { ...editedCharacter.meterFrame!, meterWidth: parseInt(e.target.value) || 100 }
                      });
                    }}
                    className="w-full px-2 py-1 border rounded text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Meter Height</label>
                  <input
                    type="number"
                    min="4"
                    max="30"
                    value={editedCharacter.meterFrame.meterHeight}
                    onChange={(e) => {
                      setEditedCharacter({
                        ...editedCharacter,
                        meterFrame: { ...editedCharacter.meterFrame!, meterHeight: parseInt(e.target.value) || 12 }
                      });
                    }}
                    className="w-full px-2 py-1 border rounded text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Spacing</label>
                  <input
                    type="number"
                    min="0"
                    max="20"
                    value={editedCharacter.meterFrame.meterSpacing}
                    onChange={(e) => {
                      setEditedCharacter({
                        ...editedCharacter,
                        meterFrame: { ...editedCharacter.meterFrame!, meterSpacing: parseInt(e.target.value) || 6 }
                      });
                    }}
                    className="w-full px-2 py-1 border rounded text-xs"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // Inventory Tab
  const renderInventoryTab = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-medium">Character Inventory</h3>
        <button
          onClick={() => {
            const newItem: InventoryItem = {
              id: `item_${Date.now()}`,
              name: `item_${editedCharacter.inventory.length + 1}`,
              displayName: `Item ${editedCharacter.inventory.length + 1}`,
              description: '',
              icon: '',
              quantity: 1,
              stackable: false,
              category: 'misc'
            };
            setEditedCharacter({
              ...editedCharacter,
              inventory: [...editedCharacter.inventory, newItem]
            });
          }}
          className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm flex items-center gap-1"
        >
          <Plus className="w-3 h-3" />
          Add Item
        </button>
      </div>

      <div className="space-y-2">
        {editedCharacter.inventory.map((item, index) => (
          <div key={item.id} className="border rounded-lg p-3">
            <div className="grid grid-cols-2 gap-2 mb-2">
              <input
                type="text"
                value={item.name}
                onChange={(e) => {
                  const newInventory = [...editedCharacter.inventory];
                  newInventory[index] = { ...item, name: e.target.value };
                  setEditedCharacter({ ...editedCharacter, inventory: newInventory });
                }}
                className="px-2 py-1 border rounded text-sm"
                placeholder="Internal name"
              />
              <input
                type="text"
                value={item.displayName}
                onChange={(e) => {
                  const newInventory = [...editedCharacter.inventory];
                  newInventory[index] = { ...item, displayName: e.target.value };
                  setEditedCharacter({ ...editedCharacter, inventory: newInventory });
                }}
                className="px-2 py-1 border rounded text-sm"
                placeholder="Display name"
              />
            </div>
            {/* Image and Description row */}
            <div className="flex items-center gap-2 mb-2">
              {/* Item Image/Icon */}
              <div className="flex items-center gap-2 shrink-0">
                {(() => {
                  const resolvedUrl = resolveImageUrl(item.assetId, item.icon, assets);
                  return resolvedUrl ? (
                    <img
                      src={resolvedUrl}
                      alt={item.displayName}
                      className="w-10 h-10 object-cover rounded border"
                    />
                  ) : (
                    <div className="w-10 h-10 bg-gray-200 rounded border flex items-center justify-center">
                      <Package className="w-5 h-5 text-gray-400" />
                    </div>
                  );
                })()}
                <button
                  onClick={() => setShowAssetPicker(`inventory_${item.id}`)}
                  className="px-2 py-1 text-xs border rounded hover:bg-gray-50"
                >
                  {item.icon || item.assetId ? 'Change' : 'Add Image'}
                </button>
                {(item.icon || item.assetId) && (
                  <button
                    onClick={() => {
                      const newInventory = [...editedCharacter.inventory];
                      newInventory[index] = { ...item, icon: '', assetId: undefined };
                      setEditedCharacter({ ...editedCharacter, inventory: newInventory });
                    }}
                    className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                    title="Remove image"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
              <input
                type="text"
                value={item.description}
                onChange={(e) => {
                  const newInventory = [...editedCharacter.inventory];
                  newInventory[index] = { ...item, description: e.target.value };
                  setEditedCharacter({ ...editedCharacter, inventory: newInventory });
                }}
                className="flex-1 px-2 py-1 border rounded text-sm"
                placeholder="Description"
              />
            </div>
            {/* Quantity, Category, Stackable, Delete row */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Qty:</label>
              <input
                type="number"
                value={item.quantity}
                min={1}
                onChange={(e) => {
                  const newInventory = [...editedCharacter.inventory];
                  newInventory[index] = { ...item, quantity: Math.max(1, Number(e.target.value) || 1) };
                  setEditedCharacter({ ...editedCharacter, inventory: newInventory });
                }}
                className="w-16 px-2 py-1 border rounded text-sm"
              />
              <select
                value={item.category}
                onChange={(e) => {
                  const newInventory = [...editedCharacter.inventory];
                  newInventory[index] = { ...item, category: e.target.value };
                  setEditedCharacter({ ...editedCharacter, inventory: newInventory });
                }}
                className="px-2 py-1 border rounded text-sm"
              >
                <option value="misc">Misc</option>
                <option value="weapon">Weapon</option>
                <option value="armor">Armor</option>
                <option value="consumable">Consumable</option>
                <option value="quest">Quest</option>
                <option value="key">Key</option>
              </select>
              <label className="flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  checked={item.stackable}
                  onChange={(e) => {
                    const newInventory = [...editedCharacter.inventory];
                    newInventory[index] = { ...item, stackable: e.target.checked };
                    setEditedCharacter({ ...editedCharacter, inventory: newInventory });
                  }}
                />
                Stackable
              </label>
              {item.stackable && (
                <>
                  <label className="text-xs text-gray-500">Max:</label>
                  <input
                    type="number"
                    value={item.maxStack ?? 99}
                    min={1}
                    onChange={(e) => {
                      const newInventory = [...editedCharacter.inventory];
                      newInventory[index] = { ...item, maxStack: Math.max(1, Number(e.target.value) || 99) };
                      setEditedCharacter({ ...editedCharacter, inventory: newInventory });
                    }}
                    className="w-16 px-2 py-1 border rounded text-sm"
                    title="Max stack size"
                  />
                </>
              )}
              <div className="flex-1" />
              <button
                onClick={() => {
                  const newInventory = editedCharacter.inventory.filter((_, i) => i !== index);
                  setEditedCharacter({ ...editedCharacter, inventory: newInventory });
                }}
                className="p-1 text-red-500 hover:bg-red-50 rounded"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Inventory Frame (HUD Overlay) Configuration */}
      <div className="border-t pt-4 mt-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-medium flex items-center gap-2">
            <Package className="w-4 h-4" />
            Inventory Frame (HUD Overlay)
          </h3>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!editedCharacter.inventoryFrame}
              onChange={(e) => {
                if (e.target.checked) {
                  setEditedCharacter({
                    ...editedCharacter,
                    inventoryFrame: { ...DEFAULT_INVENTORY_FRAME_CONFIG }
                  });
                } else {
                  const { inventoryFrame, ...rest } = editedCharacter;
                  setEditedCharacter(rest as Character);
                }
              }}
              className="rounded border-gray-300"
            />
            <span className="text-gray-600">Enable</span>
          </label>
        </div>

        {editedCharacter.inventoryFrame && (
          <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
            {/* Dock Mode Toggle */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Dock To</label>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setEditedCharacter({
                      ...editedCharacter,
                      inventoryFrame: { ...editedCharacter.inventoryFrame!, dockMode: 'character' }
                    });
                  }}
                  className={`flex-1 px-3 py-2 text-sm rounded border transition-colors ${
                    editedCharacter.inventoryFrame?.dockMode === 'character'
                      ? 'bg-blue-500 border-blue-600 text-white'
                      : 'bg-white border-gray-300 hover:bg-gray-100'
                  }`}
                >
                  Character
                </button>
                <button
                  onClick={() => {
                    setEditedCharacter({
                      ...editedCharacter,
                      inventoryFrame: { ...editedCharacter.inventoryFrame!, dockMode: 'screen' }
                    });
                  }}
                  className={`flex-1 px-3 py-2 text-sm rounded border transition-colors ${
                    (editedCharacter.inventoryFrame?.dockMode ?? 'screen') === 'screen'
                      ? 'bg-blue-500 border-blue-600 text-white'
                      : 'bg-white border-gray-300 hover:bg-gray-100'
                  }`}
                >
                  Screen Corner
                </button>
              </div>
            </div>

            {/* Screen Corner Position (shown when dockMode is 'screen') */}
            {(editedCharacter.inventoryFrame?.dockMode ?? 'screen') === 'screen' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Screen Corner</label>
                <div className="grid grid-cols-2 gap-2 w-48">
                  {([
                    { pos: 'screen-top-left', label: 'Top Left' },
                    { pos: 'screen-top-right', label: 'Top Right' },
                    { pos: 'screen-bottom-left', label: 'Bottom Left' },
                    { pos: 'screen-bottom-right', label: 'Bottom Right' }
                  ] as const).map(({ pos, label }) => (
                    <button
                      key={pos}
                      onClick={() => {
                        setEditedCharacter({
                          ...editedCharacter,
                          inventoryFrame: { ...editedCharacter.inventoryFrame!, screenPosition: pos as MeterFrameScreenPosition }
                        });
                      }}
                      className={`px-3 py-2 text-sm border rounded transition-colors ${
                        (editedCharacter.inventoryFrame?.screenPosition ?? 'screen-bottom-right') === pos
                          ? 'bg-blue-500 border-blue-600 text-white'
                          : 'bg-white border-gray-300 hover:bg-gray-100'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Character Anchor Position (shown when dockMode is 'character') */}
            {editedCharacter.inventoryFrame?.dockMode === 'character' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Anchor Position</label>
                <div className="grid grid-cols-3 gap-1 w-32">
                  {(['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right'] as const).map((pos) => {
                    const isAnchor = pos !== 'center' && pos !== 'left' && pos !== 'right' ? pos : (pos === 'left' ? 'left' : (pos === 'right' ? 'right' : null));
                    if (pos === 'center') {
                      return <div key={pos} className="w-10 h-10 border border-dashed border-gray-300 rounded bg-gray-200" />;
                    }
                    return (
                      <button
                        key={pos}
                        onClick={() => {
                          if (isAnchor) {
                            setEditedCharacter({
                              ...editedCharacter,
                              inventoryFrame: { ...editedCharacter.inventoryFrame!, anchor: isAnchor as MeterFrameAnchor }
                            });
                          }
                        }}
                        className={`w-10 h-10 border rounded transition-colors ${
                          editedCharacter.inventoryFrame?.anchor === pos
                            ? 'bg-blue-500 border-blue-600 text-white'
                            : 'bg-white border-gray-300 hover:bg-gray-100'
                        }`}
                        title={pos}
                      >
                        <div className={`w-2 h-2 mx-auto rounded-full ${
                          editedCharacter.inventoryFrame?.anchor === pos ? 'bg-white' : 'bg-gray-400'
                        }`} />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Offset Controls */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Offset X</label>
                <input
                  type="number"
                  value={editedCharacter.inventoryFrame.offset.x}
                  onChange={(e) => {
                    setEditedCharacter({
                      ...editedCharacter,
                      inventoryFrame: {
                        ...editedCharacter.inventoryFrame!,
                        offset: { ...editedCharacter.inventoryFrame!.offset, x: parseInt(e.target.value) || 0 }
                      }
                    });
                  }}
                  className="w-full px-2 py-1 border rounded text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Offset Y</label>
                <input
                  type="number"
                  value={editedCharacter.inventoryFrame.offset.y}
                  onChange={(e) => {
                    setEditedCharacter({
                      ...editedCharacter,
                      inventoryFrame: {
                        ...editedCharacter.inventoryFrame!,
                        offset: { ...editedCharacter.inventoryFrame!.offset, y: parseInt(e.target.value) || 0 }
                      }
                    });
                  }}
                  className="w-full px-2 py-1 border rounded text-sm"
                />
              </div>
            </div>

            {/* Display Settings */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-gray-700">Display</h4>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Item Size</label>
                  <input
                    type="number"
                    min="24"
                    max="96"
                    value={editedCharacter.inventoryFrame.itemSize}
                    onChange={(e) => {
                      setEditedCharacter({
                        ...editedCharacter,
                        inventoryFrame: { ...editedCharacter.inventoryFrame!, itemSize: parseInt(e.target.value) || 48 }
                      });
                    }}
                    className="w-full px-2 py-1 border rounded text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Columns</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={editedCharacter.inventoryFrame.columns}
                    onChange={(e) => {
                      setEditedCharacter({
                        ...editedCharacter,
                        inventoryFrame: { ...editedCharacter.inventoryFrame!, columns: parseInt(e.target.value) || 4 }
                      });
                    }}
                    className="w-full px-2 py-1 border rounded text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Spacing</label>
                  <input
                    type="number"
                    min="0"
                    max="20"
                    value={editedCharacter.inventoryFrame.itemSpacing}
                    onChange={(e) => {
                      setEditedCharacter({
                        ...editedCharacter,
                        inventoryFrame: { ...editedCharacter.inventoryFrame!, itemSpacing: parseInt(e.target.value) || 6 }
                      });
                    }}
                    className="w-full px-2 py-1 border rounded text-xs"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editedCharacter.inventoryFrame.showLabels}
                  onChange={(e) => {
                    setEditedCharacter({
                      ...editedCharacter,
                      inventoryFrame: { ...editedCharacter.inventoryFrame!, showLabels: e.target.checked }
                    });
                  }}
                  className="rounded border-gray-300"
                />
                <span className="text-gray-600">Show Labels</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editedCharacter.inventoryFrame.showOnDemand}
                  onChange={(e) => {
                    setEditedCharacter({
                      ...editedCharacter,
                      inventoryFrame: { ...editedCharacter.inventoryFrame!, showOnDemand: e.target.checked }
                    });
                  }}
                  className="rounded border-gray-300"
                />
                <span className="text-gray-600">Show on demand only (Ctrl/Cmd+I)</span>
              </label>
            </div>

            {/* Style Settings */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-gray-700">Style</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Background</label>
                  <input
                    type="text"
                    value={editedCharacter.inventoryFrame.style.backgroundColor}
                    onChange={(e) => {
                      setEditedCharacter({
                        ...editedCharacter,
                        inventoryFrame: {
                          ...editedCharacter.inventoryFrame!,
                          style: { ...editedCharacter.inventoryFrame!.style, backgroundColor: e.target.value }
                        }
                      });
                    }}
                    className="w-full px-2 py-1 border rounded text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Border Color</label>
                  <input
                    type="color"
                    value={editedCharacter.inventoryFrame.style.borderColor}
                    onChange={(e) => {
                      setEditedCharacter({
                        ...editedCharacter,
                        inventoryFrame: {
                          ...editedCharacter.inventoryFrame!,
                          style: { ...editedCharacter.inventoryFrame!.style, borderColor: e.target.value }
                        }
                      });
                    }}
                    className="w-full h-8 border rounded cursor-pointer"
                  />
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Border</label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={editedCharacter.inventoryFrame.style.borderWidth}
                    onChange={(e) => {
                      setEditedCharacter({
                        ...editedCharacter,
                        inventoryFrame: {
                          ...editedCharacter.inventoryFrame!,
                          style: { ...editedCharacter.inventoryFrame!.style, borderWidth: parseInt(e.target.value) || 0 }
                        }
                      });
                    }}
                    className="w-full px-2 py-1 border rounded text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Radius</label>
                  <input
                    type="number"
                    min="0"
                    max="20"
                    value={editedCharacter.inventoryFrame.style.borderRadius}
                    onChange={(e) => {
                      setEditedCharacter({
                        ...editedCharacter,
                        inventoryFrame: {
                          ...editedCharacter.inventoryFrame!,
                          style: { ...editedCharacter.inventoryFrame!.style, borderRadius: parseInt(e.target.value) || 0 }
                        }
                      });
                    }}
                    className="w-full px-2 py-1 border rounded text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Padding</label>
                  <input
                    type="number"
                    min="0"
                    max="20"
                    value={editedCharacter.inventoryFrame.style.padding}
                    onChange={(e) => {
                      setEditedCharacter({
                        ...editedCharacter,
                        inventoryFrame: {
                          ...editedCharacter.inventoryFrame!,
                          style: { ...editedCharacter.inventoryFrame!.style, padding: parseInt(e.target.value) || 0 }
                        }
                      });
                    }}
                    className="w-full px-2 py-1 border rounded text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Opacity</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={editedCharacter.inventoryFrame.style.opacity}
                    onChange={(e) => {
                      setEditedCharacter({
                        ...editedCharacter,
                        inventoryFrame: {
                          ...editedCharacter.inventoryFrame!,
                          style: { ...editedCharacter.inventoryFrame!.style, opacity: parseInt(e.target.value) || 0 }
                        }
                      });
                    }}
                    className="w-full px-2 py-1 border rounded text-xs"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // Asset Picker Modal
  const renderAssetPicker = () => {
    if (!showAssetPicker) return null;

    // Fixed: Check for MIME types that start with 'image/'
    const imageAssets = assets.filter(a => 
      a.type?.startsWith('image/') || 
      a.type === 'image' || 
      // Fallback: check file extension if type is missing
      (!a.type && a.url && /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(a.url))
    );

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-4 max-w-4xl w-full max-h-[80vh] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Select Image</h3>
            <button
              onClick={() => setShowAssetPicker(null)}
              className="p-1 hover:bg-gray-100 rounded"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="flex-1 overflow-auto">
            <div className="grid grid-cols-4 gap-4">
              {imageAssets.map(asset => (
                <div
                  key={asset.id}
                  onClick={() => {
                    if (showAssetPicker === 'default') {
                      // Save both URL (for display) and assetId (for persistence)
                      setEditedCharacter({
                        ...editedCharacter,
                        visual: { ...editedCharacter.visual, defaultImage: asset.url, defaultAssetId: asset.id }
                      });
                    } else if (showAssetPicker === 'spritesheet') {
                      const newVisual = { ...editedCharacter.visual };
                      if (!newVisual.spriteSheet) {
                        newVisual.spriteSheet = {
                          url: asset.url,
                          assetId: asset.id,
                          frameWidth: 32,
                          frameHeight: 32,
                          animations: []
                        };
                      } else {
                        newVisual.spriteSheet = { ...newVisual.spriteSheet, url: asset.url, assetId: asset.id };
                      }
                      setEditedCharacter({ ...editedCharacter, visual: newVisual });
                    } else if (showAssetPicker?.startsWith('state_')) {
                      const stateId = showAssetPicker.replace('state_', '');
                      const newStates = editedCharacter.states.map(s => {
                        if (s.id === stateId) {
                          // Save both URL (for display) and assetId (for persistence)
                          return { ...s, visual: { ...s.visual, image: asset.url, assetId: asset.id } };
                        }
                        return s;
                      });
                      setEditedCharacter({ ...editedCharacter, states: newStates });
                    } else if (showAssetPicker?.startsWith('inventory_')) {
                      const itemId = showAssetPicker.replace('inventory_', '');
                      const newInventory = editedCharacter.inventory.map(item => {
                        if (item.id === itemId) {
                          // Save both URL (for display) and assetId (for persistence)
                          return { ...item, icon: asset.url, assetId: asset.id };
                        }
                        return item;
                      });
                      setEditedCharacter({ ...editedCharacter, inventory: newInventory });
                    }
                    setShowAssetPicker(null);
                  }}
                  className="cursor-pointer hover:opacity-80 border rounded-lg overflow-hidden"
                >
                  <img 
                    src={asset.url} 
                    alt={asset.name}
                    className="w-full h-32 object-cover"
                  />
                  <div className="p-2 text-xs truncate">{asset.name}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Affect tab — authored initial mood + sentiments seeded into runtime
  // state on story start. The runtime owns these values once play begins;
  // UpdateAffect beats and emotion firings drift them away from these
  // starting points. Resetting the story re-seeds from here.
  const renderAffectTab = () => {
    const mood = editedCharacter.initialMood || { valence: 0, arousal: 0 };
    const sentiments = editedCharacter.initialSentiments || [];

    const updateMood = (axis: 'valence' | 'arousal', v: number) => {
      const clamped = Math.max(-1, Math.min(1, v));
      setEditedCharacter({
        ...editedCharacter,
        initialMood: { ...mood, [axis]: clamped },
      });
    };

    const clearMood = () => {
      const { initialMood: _drop, ...rest } = editedCharacter;
      setEditedCharacter(rest as Character);
    };

    const updateSentiment = (index: number, patch: Partial<{ toEntityRef: string; emotion: string; strength: number }>) => {
      const next = [...sentiments];
      next[index] = { ...next[index], ...patch };
      setEditedCharacter({ ...editedCharacter, initialSentiments: next });
    };

    const addSentiment = () => {
      setEditedCharacter({
        ...editedCharacter,
        initialSentiments: [...sentiments, { toEntityRef: '', emotion: '', strength: 0 }],
      });
    };

    const removeSentiment = (index: number) => {
      const next = sentiments.filter((_, i) => i !== index);
      setEditedCharacter({
        ...editedCharacter,
        initialSentiments: next.length > 0 ? next : undefined,
      });
    };

    const moodIsNeutral = !editedCharacter.initialMood
      || (Math.abs(mood.valence) < 0.05 && Math.abs(mood.arousal) < 0.05);

    // Step 6 — Personality traits. Authored on the Character; modulate
    // emotion deltas at runtime via the project's TraitModulationProfile.
    const traits = editedCharacter.traits || {};
    const traitsNeutral = Object.values(traits).every(
      (v) => typeof v !== 'number' || Math.abs(v - 0.5) < 0.05,
    );
    const updateTrait = (name: string, v: number) => {
      const clamped = Math.max(0, Math.min(1, v));
      setEditedCharacter({
        ...editedCharacter,
        traits: { ...traits, [name]: clamped },
      });
    };
    const removeTrait = (name: string) => {
      const next = { ...traits };
      delete next[name];
      setEditedCharacter({
        ...editedCharacter,
        traits: Object.keys(next).length > 0 ? next : undefined,
      });
    };
    const seedDefaultTraits = () => {
      setEditedCharacter({
        ...editedCharacter,
        traits: { ...DEFAULT_TRAIT_VALUES },
      });
    };
    const addCustomTrait = () => {
      let suffix = 1;
      while (traits[`trait${suffix}`] !== undefined) suffix += 1;
      setEditedCharacter({
        ...editedCharacter,
        traits: { ...traits, [`trait${suffix}`]: 0.5 },
      });
    };

    /**
     * Apply a personality archetype: replaces Big Five traits with the
     * preset's vector (custom author-named traits are preserved). Self-
     * sentiments from the preset are appended to initialSentiments using
     * the character's own id as the toEntityRef — existing sentiments
     * toward self are deduplicated by emotion (overwritten if the preset
     * defines the same emotion).
     */
    const applyArchetype = (archetypeId: string) => {
      const archetype = findPersonalityArchetype(archetypeId);
      if (!archetype) return;
      // Preserve any author-defined custom traits; only the Big Five
      // canonical names are replaced.
      const next = { ...traits, ...archetype.traits };
      const updates: Partial<Character> = { traits: next };

      if (archetype.selfSentiments && archetype.selfSentiments.length > 0) {
        const selfRef = editedCharacter.id;
        const existing = (editedCharacter.initialSentiments || []).filter(
          (s) => !(s.toEntityRef === selfRef && archetype.selfSentiments!.some((seed) => seed.emotion === s.emotion)),
        );
        updates.initialSentiments = [
          ...existing,
          ...archetype.selfSentiments.map((seed) => ({
            toEntityRef: selfRef,
            emotion: seed.emotion,
            strength: seed.strength,
          })),
        ];
      }
      setEditedCharacter({ ...editedCharacter, ...updates });
    };

    // Step 7 — dossier policy fork. Default `'reAnchor'` (Mode A) means the
    // dossier rebuilds from structured state every turn — no drift, no
    // accumulated reflections. `'reflection'` (Mode B) accumulates per-turn
    // reflections so the LLM sees recent felt-experience.
    const dossierPolicy = editedCharacter.dossierPolicy || 'reAnchor';
    const setDossierPolicy = (value: 'reAnchor' | 'reflection') => {
      if (value === 'reAnchor') {
        const { dossierPolicy: _drop, ...rest } = editedCharacter;
        setEditedCharacter(rest as Character);
      } else {
        setEditedCharacter({ ...editedCharacter, dossierPolicy: value });
      }
    };

    // Step 8 — goals. Static authoring data; runtime tracks status separately.
    const goals = editedCharacter.goals || [];
    const updateGoal = (index: number, patch: Partial<typeof goals[number]>) => {
      const next = [...goals];
      next[index] = { ...next[index], ...patch };
      setEditedCharacter({ ...editedCharacter, goals: next });
    };
    const removeGoal = (index: number) => {
      const next = goals.filter((_, i) => i !== index);
      setEditedCharacter({
        ...editedCharacter,
        goals: next.length > 0 ? next : undefined,
      });
    };
    const addGoal = () => {
      let suffix = goals.length + 1;
      while (goals.find((g) => g.id === `goal${suffix}`)) suffix += 1;
      setEditedCharacter({
        ...editedCharacter,
        goals: [...goals, { id: `goal${suffix}`, name: '', priority: 0.5 }],
      });
    };

    // Variants — alternate persona profiles. One can be marked default
    // (auto-applies at story-start); authors switch between them via the
    // setCharacterVariant effect on choices. Per-variant authoring here
    // covers the high-value slice: identity (displayName), description,
    // and a Big-Five vector picked from the archetype library. Mood +
    // sentiments overrides are supported by the runtime today and can
    // be edited via the project file or a future inline editor.
    const variants = editedCharacter.variants || [];
    const defaultVariantId = editedCharacter.defaultVariantId;
    const updateVariant = (i: number, patch: Partial<typeof variants[number]>) => {
      const next = variants.map((v, idx) => idx === i ? { ...v, ...patch } : v);
      setEditedCharacter({ ...editedCharacter, variants: next });
    };
    const removeVariant = (i: number) => {
      const removed = variants[i];
      const next = variants.filter((_, idx) => idx !== i);
      const updates: Partial<Character> = {
        variants: next.length > 0 ? next : undefined,
      };
      // If the removed variant was the default, clear the default field.
      if (removed && removed.id === defaultVariantId) {
        updates.defaultVariantId = undefined;
      }
      setEditedCharacter({ ...editedCharacter, ...updates });
    };
    /**
     * Adding a variant migrates base personality / mood / sentiments /
     * dossierPolicy onto the new variant so the author doesn't lose work.
     * Two cases:
     *   - First variant ever: clone base values into the new variant AND
     *     clear those fields from the base record. From this point on,
     *     personality is authored per-variant. The base owns identity
     *     (id, role, name, sprite sheet, states, counters, inventory,
     *     goals, HUD config) but not personality state.
     *   - Subsequent variants: clone from the FIRST variant's values so
     *     authors start from a known persona and edit deltas, rather
     *     than facing a blank form. They can still clear individual
     *     overrides if they want a different baseline.
     */
    const addVariant = () => {
      let suffix = variants.length + 1;
      while (variants.find((v) => v.id === `variant${suffix}`)) suffix += 1;
      const id = `variant${suffix}`;

      // Source values to seed the new variant from.
      const isFirst = variants.length === 0;
      const source = isFirst
        ? {
            traits: editedCharacter.traits,
            initialMood: editedCharacter.initialMood,
            initialSentiments: editedCharacter.initialSentiments,
            dossierPolicy: editedCharacter.dossierPolicy,
          }
        : {
            traits: variants[0].traits,
            initialMood: variants[0].initialMood,
            initialSentiments: variants[0].initialSentiments,
            dossierPolicy: variants[0].dossierPolicy,
          };

      const newVariant = {
        id,
        name: id,
        ...(source.traits ? { traits: { ...source.traits } } : {}),
        ...(source.initialMood ? { initialMood: { ...source.initialMood } } : {}),
        ...(source.initialSentiments && source.initialSentiments.length > 0
          ? { initialSentiments: source.initialSentiments.map((s) => ({ ...s })) }
          : {}),
        ...(source.dossierPolicy ? { dossierPolicy: source.dossierPolicy } : {}),
      };

      const updates: Partial<Character> = {
        variants: [...variants, newVariant],
      };

      // First-variant migration: clear base personality fields so they
      // don't shadow the variant overlay at runtime, and so the editor
      // hides them cleanly. Only run on the first variant — subsequent
      // adds leave the base alone (it's already cleared).
      if (isFirst) {
        updates.traits = undefined;
        updates.initialMood = undefined;
        updates.initialSentiments = undefined;
        updates.dossierPolicy = undefined;
      }

      setEditedCharacter({ ...editedCharacter, ...updates });
    };
    const setDefaultVariant = (variantId: string | undefined) => {
      setEditedCharacter({ ...editedCharacter, defaultVariantId: variantId });
    };
    const applyArchetypeToVariant = (i: number, archetypeId: string) => {
      const archetype = findPersonalityArchetype(archetypeId);
      if (!archetype) return;
      // Variant traits replace whatever was there — variants are preset-shaped
      // overlays; the base character's traits remain untouched.
      updateVariant(i, { traits: { ...archetype.traits } });
    };

    // When the character has variants, personality / initial mood / initial
    // sentiments / dossier policy are authored *per variant* — variants
    // become the unit of persona. The parent sections collapse to a single
    // banner explaining where to edit, and the Variants section grows
    // inline editors for each variant's full personality slice.
    const hasVariants = variants.length > 0;

    return (
      <div className="space-y-6">
        {/* When variants exist, surface a one-line explainer at the top so
            authors don't hunt for the (now-hidden) parent sections. */}
        {hasVariants && (
          <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs text-blue-800">
            This character has <span className="font-semibold">{variants.length}</span> variant{variants.length === 1 ? '' : 's'}. Personality, initial mood, and sentiments are authored per variant below — the base character only owns identity (name, sprite sheet, states, counters, inventory) and shared goals.
          </div>
        )}

        {/* Personality — Big Five + author-defined traits */}
        {!hasVariants && (
        <div className="bg-white border rounded-lg p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Heart className="w-4 h-4" />
                Personality
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                Static traits in <span className="font-mono">[0, 1]</span>. Modulate emotion deltas at runtime — never gate choices on their own.
              </p>
            </div>
            {Object.keys(traits).length === 0 ? (
              <button
                onClick={seedDefaultTraits}
                className="text-xs text-blue-600 hover:bg-blue-50 px-2 py-1 rounded"
                title="Seed Big Five traits at neutral 0.5"
              >
                + Add Big Five
              </button>
            ) : (
              <button
                onClick={addCustomTrait}
                className="text-xs text-blue-600 hover:bg-blue-50 px-2 py-1 rounded"
              >
                + Add custom trait
              </button>
            )}
          </div>

          {/* Archetype dropdown — fast path for picking a coherent profile.
              Shown alongside the empty-state hint and at the top of the
              populated trait list. Selecting overwrites Big Five values
              and (when defined) appends self-directed sentiments. The
              info caption below the dropdown surfaces the description
              and any sentiment seeds, so the author can see exactly what
              the preset will do before / after applying. */}
          <div className="mb-3">
            <div className="flex items-center gap-2">
              <label htmlFor="archetype-select" className="text-xs text-gray-600 whitespace-nowrap">
                Load archetype
              </label>
              <select
                id="archetype-select"
                value={selectedArchetypeId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedArchetypeId(id);
                  if (id) applyArchetype(id);
                }}
                className="text-xs border rounded px-2 py-1 bg-white"
                title="Replace Big Five trait values with a preset profile. Custom traits and existing sentiments toward other characters are preserved."
              >
                <option value="">— pick a preset —</option>
                {DEFAULT_PERSONALITY_ARCHETYPES.map((a) => (
                  <option key={a.id} value={a.id} title={a.description}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            {(() => {
              const picked = findPersonalityArchetype(selectedArchetypeId);
              if (!picked) return null;
              const seeds = picked.selfSentiments || [];
              return (
                <div className="mt-2 ml-1 text-[11px] text-gray-600 bg-gray-50 rounded px-3 py-2 space-y-1">
                  <div>{picked.description}</div>
                  {seeds.length > 0 ? (
                    <div>
                      <span className="text-gray-500">Seeded toward self: </span>
                      {seeds.map((s, i) => (
                        <span key={i} className="font-mono">
                          {s.emotion} {s.strength >= 0 ? '+' : ''}{s.strength.toFixed(2)}
                          {i < seeds.length - 1 ? ', ' : ''}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="text-gray-500 italic">No sentiment seeded — psychology research doesn't ground a specific self-feeling for this profile, so the preset only sets traits.</div>
                  )}
                </div>
              );
            })()}
          </div>

          {Object.keys(traits).length === 0 ? (
            <div className="text-xs text-gray-400 italic py-3">
              No traits set. This character behaves like a neutral one — emotion deltas pass through unchanged. Pick an archetype above or click "Add Big Five" to start tuning.
            </div>
          ) : (
            <div className="space-y-3">
              {Object.entries(traits).map(([name, value]) => {
                const isDefault = (DEFAULT_TRAIT_NAMES as readonly string[]).includes(name);
                const description = isDefault
                  ? TRAIT_DESCRIPTIONS[name as keyof typeof TRAIT_DESCRIPTIONS]
                  : undefined;
                return (
                  <div key={name}>
                    <div className="flex items-center justify-between text-xs text-gray-700 mb-1">
                      {isDefault ? (
                        <span className="font-medium capitalize">{name}</span>
                      ) : (
                        <input
                          type="text"
                          value={name}
                          onChange={(e) => {
                            const newName = e.target.value.trim();
                            if (!newName || newName === name) return;
                            const next = { ...traits };
                            delete next[name];
                            next[newName] = value;
                            setEditedCharacter({ ...editedCharacter, traits: next });
                          }}
                          className="font-medium px-1 py-0.5 border rounded text-xs"
                          style={{ width: 140 }}
                        />
                      )}
                      <button
                        onClick={() => removeTrait(name)}
                        className="text-gray-400 hover:text-red-600 text-sm"
                        title={`Remove ${name}`}
                      >
                        ×
                      </button>
                    </div>
                    {description && (
                      <p className="text-[10px] text-gray-500 mb-1">{description}</p>
                    )}
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={0} max={1} step={0.05}
                        value={typeof value === 'number' ? value : 0.5}
                        onChange={(e) => updateTrait(name, parseFloat(e.target.value))}
                        className="flex-1"
                      />
                      <span className="font-mono text-xs w-12 text-right text-gray-700">
                        {(typeof value === 'number' ? value : 0.5).toFixed(2)}
                      </span>
                    </div>
                  </div>
                );
              })}
              {!traitsNeutral && (
                <div className="text-xs text-gray-600 bg-gray-50 rounded px-3 py-2">
                  Non-neutral traits will scale emotion deltas at runtime. Authors can branch on traits via the <span className="font-mono">trait</span> condition operator.
                </div>
              )}
              {/* Interpersonal-stance lens on the base personality: the
                  circumplex plane IS extraversion × agreeableness rotated
                  ~45° (docs/Interpersonal-Stance-Model.md), so this pad is
                  a direct two-way lens — the dot mirrors the E/A sliders,
                  and dragging it sets both at once (full-scale inverse
                  rotation, no weighting). E/A square corners map slightly
                  outside the unit disc; the pad clamps the dot at the rim. */}
              <div className="border-t pt-2">
                <div className="text-[11px] text-gray-600 mb-1.5">
                  Interpersonal stance (a lens on extraversion × agreeableness — drag to set both):
                </div>
                <div className="flex justify-center">
                  {(() => {
                    const pos = bigFiveToStance(traits);
                    return (
                      <StancePad
                        warmth={pos.warmth}
                        dominance={pos.dominance}
                        size={180}
                        onChange={(stance) => {
                          const ea = stanceToBigFive(stance);
                          setEditedCharacter({
                            ...editedCharacter,
                            traits: {
                              ...traits,
                              extraversion: ea.extraversion,
                              agreeableness: ea.agreeableness,
                            },
                          });
                        }}
                        subtitle={describeStance(pos)}
                      />
                    );
                  })()}
                </div>
              </div>
            </div>
          )}
        </div>
        )}

        {/* Mood — 2D affect at story start */}
        {!hasVariants && (
        <div className="bg-white border rounded-lg p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Heart className="w-4 h-4" />
                Initial mood
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                Where this character's mood starts at story open. The runtime can drift it from here via Update Affect beats.
              </p>
            </div>
            {!moodIsNeutral && (
              <button
                onClick={clearMood}
                className="text-xs text-gray-500 hover:text-red-600"
                title="Reset to neutral (and remove from saved character data)"
              >
                Reset to neutral
              </button>
            )}
          </div>

          {/* 2D mood pad — Russell's circumplex. Pad is the primary picker
              (click / drag); sliders below are the numeric fine-tune. The
              pad is sized large enough that emotion-marker labels stay
              comfortably readable. */}
          <div className="flex justify-center mb-4">
            <MoodPad
              valence={mood.valence}
              arousal={mood.arousal}
              palette={emotionPalette}
              size={320}
              onChange={({ valence, arousal }) => {
                setEditedCharacter({
                  ...editedCharacter,
                  initialMood: { valence, arousal },
                });
              }}
              subtitle={!moodIsNeutral
                ? `${describeMoodAxis(mood.valence, 'valence')}, ${describeMoodAxis(mood.arousal, 'arousal')}`
                : 'neutral'}
            />
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                <span>← sad</span>
                <span className="font-medium">Valence</span>
                <span>happy →</span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={-1} max={1} step={0.05}
                  value={mood.valence}
                  onChange={(e) => updateMood('valence', parseFloat(e.target.value))}
                  className="flex-1"
                />
                <span className="font-mono text-xs w-12 text-right text-gray-700">
                  {mood.valence >= 0 ? '+' : ''}{mood.valence.toFixed(2)}
                </span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                <span>← calm</span>
                <span className="font-medium">Arousal</span>
                <span>excited →</span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={-1} max={1} step={0.05}
                  value={mood.arousal}
                  onChange={(e) => updateMood('arousal', parseFloat(e.target.value))}
                  className="flex-1"
                />
                <span className="font-mono text-xs w-12 text-right text-gray-700">
                  {mood.arousal >= 0 ? '+' : ''}{mood.arousal.toFixed(2)}
                </span>
              </div>
            </div>

            {emotionPalette && emotionPalette.length > 0 && (
              <div className="text-xs text-gray-500">
                Purple markers on the pad show where each project emotion sits in mood-space — they're the same weights the runtime uses when an emotion fires.
              </div>
            )}
          </div>
        </div>
        )}

        {/* Initial sentiments — directed feelings at story start */}
        {!hasVariants && (
        <div className="bg-white border rounded-lg p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Heart className="w-4 h-4" />
                Initial sentiments
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                Directed feelings this character starts with. <em>Trust toward player +0.5</em>, <em>fear toward wolf +0.7</em>, etc. Each row is one (target, emotion) pair.
              </p>
            </div>
            <button
              onClick={addSentiment}
              className="flex items-center gap-1 text-xs text-blue-600 hover:bg-blue-50 px-2 py-1 rounded"
            >
              <Plus className="w-3 h-3" />
              Add sentiment
            </button>
          </div>

          {sentiments.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No initial sentiments. Click "Add sentiment" to define one.</p>
          ) : (
            <div className="space-y-2">
              {sentiments.map((s, i) => (
                <div key={i} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                  <input
                    type="text"
                    value={s.toEntityRef}
                    onChange={(e) => updateSentiment(i, { toEntityRef: e.target.value })}
                    placeholder="toward (id, name, item, …)"
                    className="flex-1 text-sm px-2 py-1 border rounded"
                  />
                  <input
                    type="text"
                    value={s.emotion}
                    onChange={(e) => updateSentiment(i, { emotion: e.target.value })}
                    placeholder="emotion"
                    className="w-32 text-sm px-2 py-1 border rounded"
                  />
                  <div className="flex items-center gap-1">
                    <input
                      type="range"
                      min={-1} max={1} step={0.05}
                      value={s.strength}
                      onChange={(e) => updateSentiment(i, { strength: parseFloat(e.target.value) })}
                      className="w-24"
                    />
                    <span className="font-mono text-xs w-10 text-right text-gray-700">
                      {s.strength >= 0 ? '+' : ''}{s.strength.toFixed(2)}
                    </span>
                  </div>
                  <button
                    onClick={() => removeSentiment(i)}
                    className="text-gray-400 hover:text-red-600 p-1"
                    title="Remove this sentiment"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        )}

        {/* Dossier policy — Mode A re-anchor vs Mode B reflection memory.
            Stays at parent level when no variants exist; hidden once variants
            take over personality (each variant overrides dossierPolicy
            individually if needed). */}
        {!hasVariants && (
        <div className="bg-white border rounded-lg p-4">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <Heart className="w-4 h-4" />
            Dossier policy
          </h3>
          <p className="text-xs text-gray-500 mt-1 mb-3">
            Controls how the LLM sees this character when they speak in an AI beat.
          </p>
          <div className="space-y-2">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                checked={dossierPolicy === 'reAnchor'}
                onChange={() => setDossierPolicy('reAnchor')}
                className="mt-1"
              />
              <div>
                <div className="text-sm font-medium">Re-anchor every turn (default)</div>
                <div className="text-xs text-gray-500">
                  Rebuilds the dossier from structured state on every AI turn. The character cannot drift away from who they are. Recommended for most stories.
                </div>
              </div>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                checked={dossierPolicy === 'reflection'}
                onChange={() => setDossierPolicy('reflection')}
                className="mt-1"
              />
              <div>
                <div className="text-sm font-medium">Accumulate reflections (Mode B)</div>
                <div className="text-xs text-gray-500">
                  Appends reflection memory across turns. The character is allowed to grow and remember subjectively. Use the <span className="font-mono">addReflection</span> effect on choices/nodes to seed reflections, or call <span className="font-mono">appendCharacterReflection</span> at runtime.
                </div>
              </div>
            </label>
          </div>
        </div>
        )}

        {/* Goals — authored, status flips at runtime, fires GAMYGDALA-style emotions.
            Goals stay at the character level even when variants exist —
            "Alex's goal is the same regardless of variant." If a project
            needs variant-specific goals, that's a future runtime feature
            (variant-aware getCharacterGoals merge). */}
        <div className="bg-white border rounded-lg p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Heart className="w-4 h-4" />
                Goals
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                Authored objectives this character is pursuing. The runtime tracks status; goals that become 'met' or 'failed' auto-fire pride/joy or shame/sadness scaled by priority. Use the <span className="font-mono">setGoalStatus</span> effect or the <span className="font-mono">goal</span> condition to react to status.
              </p>
            </div>
            <button
              onClick={addGoal}
              className="text-xs text-blue-600 hover:bg-blue-50 px-2 py-1 rounded"
            >
              + Add goal
            </button>
          </div>
          {goals.length === 0 ? (
            <div className="text-xs text-gray-400 italic py-3">
              No goals authored. Mode A characters can leave this empty; Mode B / agentic stories need goals to drive emergent behavior.
            </div>
          ) : (
            <div className="space-y-3">
              {goals.map((goal, i) => (
                <div key={i} className="border rounded p-3 bg-gray-50">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={goal.id}
                          onChange={(e) => updateGoal(i, { id: e.target.value })}
                          className="px-2 py-1 text-xs font-mono border rounded"
                          placeholder="goal-id"
                          style={{ width: 120 }}
                          title="Stable identifier — used by setGoalStatus effect and goal condition"
                        />
                        <input
                          type="text"
                          value={goal.name}
                          onChange={(e) => updateGoal(i, { name: e.target.value })}
                          className="flex-1 px-2 py-1 text-sm border rounded"
                          placeholder="Short label (e.g. Find the Grail)"
                        />
                      </div>
                      <textarea
                        value={goal.description || ''}
                        onChange={(e) => updateGoal(i, { description: e.target.value || undefined })}
                        className="w-full px-2 py-1 text-xs border rounded resize-none"
                        rows={2}
                        placeholder="Optional description — surfaced in the dossier for the LLM"
                      />
                      <div className="flex items-center gap-2 text-xs text-gray-700">
                        <span className="w-16 flex-shrink-0">Priority:</span>
                        <input
                          type="range"
                          min={0} max={1} step={0.05}
                          value={typeof goal.priority === 'number' ? goal.priority : 0.5}
                          onChange={(e) => updateGoal(i, { priority: parseFloat(e.target.value) })}
                          className="flex-1"
                        />
                        <span className="font-mono w-10 text-right">
                          {(typeof goal.priority === 'number' ? goal.priority : 0.5).toFixed(2)}
                        </span>
                      </div>
                      <div className="text-[10px] text-gray-500">
                        Optional satisfaction predicate is wired through <span className="font-mono">goal.satisfaction</span>. Edit via the project condition editor in a follow-up — for now you can drive status with the <span className="font-mono">setGoalStatus</span> effect.
                      </div>
                    </div>
                    <button
                      onClick={() => removeGoal(i)}
                      className="text-gray-400 hover:text-red-600"
                      title="Remove goal"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Variants — alternate persona profiles for one character */}
        <div className="bg-white border rounded-lg p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Heart className="w-4 h-4" />
                Variants
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                Alternate persona profiles for the same character. Useful for "play as a man / woman", an introvert / extrovert version of an NPC, etc. Pick one as default to auto-apply at story-start, or use the <span className="font-mono">setCharacterVariant</span> effect on a player choice. The character keeps one stable id — only the affect / persona slice swaps.
              </p>
            </div>
            <button
              onClick={addVariant}
              className="text-xs text-blue-600 hover:bg-blue-50 px-2 py-1 rounded"
            >
              + Add variant
            </button>
          </div>
          {variants.length >= 2 && (
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[11px] text-gray-600">At story start:</span>
              <select
                value={editedCharacter.variantSelectionPolicy === 'random' ? 'random' : 'fixed'}
                onChange={(e) =>
                  setEditedCharacter({
                    ...editedCharacter,
                    variantSelectionPolicy: e.target.value === 'random' ? 'random' : undefined,
                  })
                }
                className="px-2 py-1 text-xs border rounded"
                title="How the active variant is chosen at story start. A setCharacterVariant effect always overrides."
              >
                <option value="fixed">Use default variant</option>
                <option value="random">Pick randomly each playthrough</option>
              </select>
              {editedCharacter.variantSelectionPolicy === 'random' && (
                <span className="text-[11px] text-gray-400 italic">
                  Every restart draws a new variant — the "default" radio is ignored.
                </span>
              )}
            </div>
          )}
          {variants.length === 0 ? (
            <div className="text-xs text-gray-400 italic py-3">
              No variants. Add one to give the player a persona choice, or to ship a single character in two flavors.
            </div>
          ) : (
            <div className="space-y-3">
              {variants.map((variant, i) => (
                <div key={i} data-variant-id={variant.id} className="border rounded p-3 bg-gray-50">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1 text-[11px] text-gray-600 cursor-pointer" title="Auto-apply this variant at story start">
                          <input
                            type="radio"
                            name="default-variant"
                            checked={defaultVariantId === variant.id}
                            onChange={() => setDefaultVariant(variant.id)}
                          />
                          default
                        </label>
                        <input
                          type="text"
                          value={variant.id}
                          onChange={(e) => updateVariant(i, { id: e.target.value })}
                          className="px-2 py-1 text-xs font-mono border rounded"
                          placeholder="variant-id"
                          style={{ width: 130 }}
                          title="Stable identifier — used by setCharacterVariant effect and characterVariant condition"
                        />
                        <input
                          type="text"
                          value={variant.name}
                          onChange={(e) => updateVariant(i, { name: e.target.value })}
                          className="flex-1 px-2 py-1 text-sm border rounded"
                          placeholder="Variant label (e.g. Anxious introvert)"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-gray-600 w-24 flex-shrink-0">Display name:</span>
                        <input
                          type="text"
                          value={variant.displayName || ''}
                          onChange={(e) => updateVariant(i, { displayName: e.target.value || undefined })}
                          className="flex-1 px-2 py-1 text-xs border rounded"
                          placeholder={`(default: ${editedCharacter.displayName || editedCharacter.name})`}
                          title="Override the user-facing name when this variant is active. Leave empty to inherit."
                        />
                      </div>
                      <textarea
                        value={variant.description || ''}
                        onChange={(e) => updateVariant(i, { description: e.target.value || undefined })}
                        className="w-full px-2 py-1 text-xs border rounded resize-none"
                        rows={2}
                        placeholder="Optional description — shown in this editor and surfaced in the dossier when the variant is active."
                      />
                      <div className="flex items-center gap-2">
                        <label htmlFor={`variant-${i}-archetype`} className="text-[11px] text-gray-600 whitespace-nowrap">
                          Trait preset:
                        </label>
                        <select
                          id={`variant-${i}-archetype`}
                          value=""
                          onChange={(e) => {
                            const id = e.target.value;
                            if (id) applyArchetypeToVariant(i, id);
                          }}
                          className="text-xs border rounded px-2 py-1 bg-white"
                          title="Replace this variant's traits with a preset profile."
                        >
                          <option value="">
                            {variant.traits ? '— overwrite with preset —' : '— pick a preset —'}
                          </option>
                          {DEFAULT_PERSONALITY_ARCHETYPES.map((a) => (
                            <option key={a.id} value={a.id} title={a.description}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                        {variant.traits && (
                          <button
                            onClick={() => updateVariant(i, { traits: undefined })}
                            className="text-[10px] text-gray-500 hover:text-red-600"
                            title="Clear variant trait override; falls back to base character traits when active"
                          >
                            clear
                          </button>
                        )}
                      </div>
                      {/* Inline Big Five trait sliders. Edit per axis when
                          the archetype dropdown above only got you 80% of
                          the way there. */}
                      {variant.traits && (
                        <div className="space-y-1 px-2 pb-1">
                          {(DEFAULT_TRAIT_NAMES as readonly string[]).map((traitName) => {
                            const value = variant.traits?.[traitName] ?? 0.5;
                            return (
                              <div key={traitName} className="flex items-center gap-2 text-[10px]">
                                <span className="w-24 text-gray-600 capitalize flex-shrink-0">{traitName}</span>
                                <input
                                  type="range"
                                  min={0} max={1} step={0.05}
                                  value={value}
                                  onChange={(e) => {
                                    const v = parseFloat(e.target.value);
                                    updateVariant(i, {
                                      traits: { ...(variant.traits || {}), [traitName]: v },
                                    });
                                  }}
                                  className="flex-1"
                                />
                                <span className="font-mono text-gray-700 w-10 text-right">{value.toFixed(2)}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Interpersonal stance per variant — Leary's rose
                          (warmth × dominance). Dragging writes the stance
                          AND re-derives the variant's extraversion +
                          agreeableness via the circumplex rotation, so the
                          sliders above follow the dot. A hollow "traits"
                          marker shows where the current traits actually sit
                          when they've drifted from the authored stance
                          (docs/Interpersonal-Stance-Model.md). */}
                      <div className="border-t pt-2 mt-2">
                        <div className="text-[11px] text-gray-600 mb-1.5">
                          Interpersonal stance (how this disposition meets the other person):
                        </div>
                        <div className="flex justify-center">
                          {(() => {
                            const explicit = variant.stance;
                            const traitsPos = variant.traits ? bigFiveToStance(variant.traits) : null;
                            const shown = explicit ?? traitsPos ?? { warmth: 0, dominance: 0 };
                            return (
                              <StancePad
                                warmth={shown.warmth}
                                dominance={shown.dominance}
                                derived={!explicit}
                                traitsPosition={explicit ? traitsPos : null}
                                size={180}
                                onChange={(stance) => {
                                  const derivedEA = applyStanceToTraits(
                                    editedCharacter.traits || {},
                                    stance,
                                  );
                                  updateVariant(i, {
                                    stance,
                                    traits: {
                                      ...DEFAULT_TRAIT_VALUES,
                                      ...(variant.traits || {}),
                                      extraversion: derivedEA.extraversion,
                                      agreeableness: derivedEA.agreeableness,
                                    },
                                  });
                                }}
                                subtitle={
                                  describeStance(shown) +
                                  (explicit ? '' : ' — derived from traits, drag to set')
                                }
                              />
                            );
                          })()}
                        </div>
                      </div>

                      {/* Inline initial mood per variant — Russell's
                          circumplex pad, sized down for the inline form. */}
                      <div className="border-t pt-2 mt-2">
                        <div className="text-[11px] text-gray-600 mb-1.5">Initial mood (when this variant is active):</div>
                        <div className="flex justify-center">
                          <MoodPad
                            valence={variant.initialMood?.valence ?? 0}
                            arousal={variant.initialMood?.arousal ?? 0}
                            palette={emotionPalette}
                            size={180}
                            onChange={({ valence, arousal }) => {
                              updateVariant(i, {
                                initialMood: { valence, arousal },
                              });
                            }}
                            subtitle={variant.initialMood
                              ? `${describeMoodAxis(variant.initialMood.valence, 'valence')}, ${describeMoodAxis(variant.initialMood.arousal, 'arousal')}`
                              : 'neutral (click to set)'}
                          />
                        </div>
                      </div>

                      {/* Inline initial sentiments per variant — same
                          (target, emotion, strength) shape as the base
                          editor, compact form. */}
                      <div className="border-t pt-2 mt-2">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="text-[11px] text-gray-600">Initial sentiments:</div>
                          <button
                            onClick={() => {
                              const next = [...(variant.initialSentiments || []), { toEntityRef: '', emotion: '', strength: 0 }];
                              updateVariant(i, { initialSentiments: next });
                            }}
                            className="text-[10px] text-blue-600 hover:bg-blue-50 px-2 py-0.5 rounded"
                          >
                            + Add sentiment
                          </button>
                        </div>
                        {(variant.initialSentiments || []).length === 0 ? (
                          <div className="text-[10px] text-gray-400 italic">None.</div>
                        ) : (
                          <div className="space-y-1">
                            {(variant.initialSentiments || []).map((s, sIdx) => (
                              <div key={sIdx} className="flex items-center gap-1 text-[10px]">
                                <input
                                  type="text"
                                  value={s.toEntityRef}
                                  onChange={(e) => {
                                    const next = [...(variant.initialSentiments || [])];
                                    next[sIdx] = { ...s, toEntityRef: e.target.value };
                                    updateVariant(i, { initialSentiments: next });
                                  }}
                                  className="px-1 py-0.5 border rounded text-[10px]"
                                  style={{ width: 80 }}
                                  placeholder="toward"
                                />
                                <input
                                  type="text"
                                  value={s.emotion}
                                  onChange={(e) => {
                                    const next = [...(variant.initialSentiments || [])];
                                    next[sIdx] = { ...s, emotion: e.target.value };
                                    updateVariant(i, { initialSentiments: next });
                                  }}
                                  className="px-1 py-0.5 border rounded text-[10px]"
                                  style={{ width: 70 }}
                                  placeholder="emotion"
                                />
                                <input
                                  type="number"
                                  step={0.1}
                                  min={-1} max={1}
                                  value={s.strength}
                                  onChange={(e) => {
                                    const next = [...(variant.initialSentiments || [])];
                                    next[sIdx] = { ...s, strength: parseFloat(e.target.value) || 0 };
                                    updateVariant(i, { initialSentiments: next });
                                  }}
                                  className="px-1 py-0.5 border rounded text-[10px]"
                                  style={{ width: 50 }}
                                />
                                <button
                                  onClick={() => {
                                    const next = (variant.initialSentiments || []).filter((_, j) => j !== sIdx);
                                    updateVariant(i, { initialSentiments: next.length > 0 ? next : undefined });
                                  }}
                                  className="text-gray-400 hover:text-red-600 text-xs flex-shrink-0"
                                  title="Remove"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Per-variant portrait override. Variants share the
                          base character's sprite sheet / states by design —
                          full visual identity swap (different sprite sheet,
                          different animations) is out of scope here, but a
                          different portrait/face is the most common need
                          and stays safe (no animation-name mismatches). */}
                      <div className="border-t pt-2 mt-2">
                        <div className="text-[11px] text-gray-600 mb-1.5">Portrait override (optional):</div>
                        {(() => {
                          const variantPortraitUrl = resolveImageUrl(
                            variant.portrait?.assetId,
                            variant.portrait?.image,
                            assets,
                          );
                          return (
                            <div className="flex items-start gap-3">
                              {variantPortraitUrl ? (
                                <img
                                  src={variantPortraitUrl}
                                  alt={`${variant.name} portrait`}
                                  className="w-12 h-12 rounded object-cover border border-gray-300 flex-shrink-0"
                                />
                              ) : (
                                <div
                                  className="w-12 h-12 rounded border border-dashed border-gray-300 flex items-center justify-center text-[9px] text-gray-400 flex-shrink-0"
                                  title="Falls back to base character's portrait when this variant is active"
                                >
                                  inherits
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <DirectAssetUpload
                                  currentAssetUrl={variantPortraitUrl}
                                  onAssetSelect={(url, metadata) => {
                                    updateVariant(i, {
                                      portrait: {
                                        image: url,
                                        assetId: metadata?.id || undefined,
                                      },
                                    });
                                  }}
                                  onAssetAdd={onAssetAdd}
                                  acceptTypes={['image/*']}
                                  maxSize={5}
                                  label="Upload variant portrait"
                                />
                                {variantPortraitUrl && (
                                  <button
                                    onClick={() => updateVariant(i, { portrait: undefined })}
                                    className="mt-1 text-[10px] text-gray-500 hover:text-red-600 flex items-center gap-1"
                                  >
                                    <Trash2 className="w-3 h-3" /> Clear (use base portrait)
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      <div className="text-[10px] text-gray-500">
                        Variants share the base character's sprite sheet, states, and animations. Mood / sentiment overrides aren't editable in the inline form yet — runtime supports them; edit via the project file or seed via the variant's <span className="font-mono">setCharacterVariant</span> re-seed at story-start.
                      </div>
                    </div>
                    <button
                      onClick={() => removeVariant(i)}
                      className="text-gray-400 hover:text-red-600"
                      title="Remove variant"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Mood HUD — opt-in 2D mood-pad overlay during play */}
        {(() => {
          const mf: MoodFrameConfig = editedCharacter.moodFrame || DEFAULT_MOOD_FRAME_CONFIG;
          const updateMoodFrame = (patch: Partial<MoodFrameConfig>) => {
            setEditedCharacter({
              ...editedCharacter,
              moodFrame: { ...mf, ...patch },
            });
          };
          return (
            <div className="bg-white border rounded-lg p-4">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Heart className="w-4 h-4" />
                Mood HUD
              </h3>
              <p className="text-xs text-gray-500 mt-1 mb-3">
                Show a compact 2D mood pad on stage during play, anchored to this character or a screen corner. Off by default — turn on for characters whose emotional state should be visible to the player.
              </p>
              <label className="flex items-center gap-2 cursor-pointer text-sm mb-3">
                <input
                  type="checkbox"
                  checked={!!mf.enabled}
                  onChange={(e) => updateMoodFrame({ enabled: e.target.checked })}
                />
                Enable HUD pad
              </label>
              {mf.enabled && (
                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-2">
                    <label className="w-24 text-gray-600">Dock mode:</label>
                    <select
                      value={mf.dockMode}
                      onChange={(e) => updateMoodFrame({ dockMode: e.target.value as any })}
                      className="border rounded px-2 py-1"
                    >
                      <option value="character">Anchored to character</option>
                      <option value="screen">Fixed to screen corner</option>
                    </select>
                  </div>
                  {mf.dockMode === 'character' ? (
                    <div className="flex items-center gap-2">
                      <label className="w-24 text-gray-600">Anchor:</label>
                      <select
                        value={mf.anchor}
                        onChange={(e) => updateMoodFrame({ anchor: e.target.value as any })}
                        className="border rounded px-2 py-1"
                      >
                        {['top','bottom','left','right','top-left','top-right','bottom-left','bottom-right'].map((a) => (
                          <option key={a} value={a}>{a}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <label className="w-24 text-gray-600">Corner:</label>
                      <select
                        value={mf.screenPosition}
                        onChange={(e) => updateMoodFrame({ screenPosition: e.target.value as any })}
                        className="border rounded px-2 py-1"
                      >
                        {['screen-top-left','screen-top-right','screen-bottom-left','screen-bottom-right'].map((a) => (
                          <option key={a} value={a}>{a.replace('screen-','')}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <label className="w-24 text-gray-600">Size (px):</label>
                    <input
                      type="number"
                      min={48} max={320}
                      value={mf.size}
                      onChange={(e) => updateMoodFrame({ size: parseInt(e.target.value) || 96 })}
                      className="border rounded px-2 py-1 w-20"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="w-24 text-gray-600">Opacity:</label>
                    <input
                      type="range"
                      min={0.2} max={1} step={0.05}
                      value={mf.backgroundOpacity}
                      onChange={(e) => updateMoodFrame({ backgroundOpacity: parseFloat(e.target.value) })}
                      className="flex-1"
                    />
                    <span className="font-mono text-gray-700 w-10 text-right">{mf.backgroundOpacity.toFixed(2)}</span>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={mf.showEmotionMarkers}
                      onChange={(e) => updateMoodFrame({ showEmotionMarkers: e.target.checked })}
                    />
                    Show emotion-palette markers
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={mf.showLabels}
                      onChange={(e) => updateMoodFrame({ showLabels: e.target.checked })}
                    />
                    Show axis labels (sad / happy / calm / excited)
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={mf.showQualitativeLabel !== false}
                      onChange={(e) => updateMoodFrame({ showQualitativeLabel: e.target.checked })}
                    />
                    Show qualitative mood label below the disc (e.g. "sad, alert")
                  </label>
                </div>
              )}
            </div>
          );
        })()}
      </div>
    );
  };

  const renderTranslationsTab = () => {
    const projectLanguages = translationState.translations;
    if (projectLanguages.length === 0) {
      return (
        <div className="text-center py-12 text-gray-500">
          <Globe className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-lg font-medium mb-1">No translations configured</p>
          <p className="text-sm">Add translation languages in the Translation settings to translate character names.</p>
        </div>
      );
    }

    const charTranslations = editedCharacter.translations || {};

    return (
      <div className="space-y-4">
        <div className="text-sm text-gray-600 mb-4">
          Translate the display name for each language. The translated name will be shown as the speaker label when that language is active.
        </div>
        <div className="space-y-3">
          {projectLanguages.map(lang => {
            const translated = charTranslations[lang.languageCode]?.displayName || '';
            return (
              <div key={lang.languageCode} className="flex items-center gap-3">
                <label className="w-40 text-sm font-medium text-gray-700 flex-shrink-0">
                  {lang.languageName}
                  <span className="text-gray-400 ml-1 text-xs">({lang.languageCode})</span>
                </label>
                <input
                  type="text"
                  value={translated}
                  onChange={(e) => {
                    const newTranslations = { ...charTranslations };
                    if (e.target.value) {
                      newTranslations[lang.languageCode] = { displayName: e.target.value };
                    } else {
                      delete newTranslations[lang.languageCode];
                    }
                    setEditedCharacter(prev => ({
                      ...prev,
                      translations: Object.keys(newTranslations).length > 0 ? newTranslations : undefined,
                    }));
                  }}
                  placeholder={editedCharacter.displayName}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40">
      <div className="bg-white rounded-lg w-full max-w-4xl h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center">
              {(() => {
                const resolvedUrl = resolveImageUrl(editedCharacter.visual.defaultAssetId, editedCharacter.visual.defaultImage, assets);
                return resolvedUrl ? (
                  <img
                    src={resolvedUrl}
                    alt={editedCharacter.displayName}
                    className="w-full h-full object-cover rounded-lg"
                  />
                ) : (
                  <User className="w-5 h-5" />
                );
              })()}
            </div>
            <div>
              <h2 className="text-lg font-semibold">{editedCharacter.displayName}</h2>
              <p className="text-sm text-gray-500">{editedCharacter.name}</p>
            </div>
            {hasChanges && (
              <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs rounded">Unsaved</span>
            )}
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          {[
            { id: 'basic' as const, label: 'Basic', icon: User },
            { id: 'visual' as const, label: 'Visual', icon: Image },
            { id: 'states' as const, label: 'States', icon: Layers },
            { id: 'counters' as const, label: 'Counters', icon: Calculator },
            { id: 'inventory' as const, label: 'Inventory', icon: Package },
            { id: 'affect' as const, label: 'Affect', icon: Heart },
            ...(translationState.translations.length > 0
              ? [{ id: 'translations' as const, label: 'Translations', icon: Globe }]
              : []),
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-auto p-6">
          {activeTab === 'basic' && renderBasicTab()}
          {activeTab === 'visual' && renderVisualTab()}
          {activeTab === 'states' && renderStatesTab()}
          {activeTab === 'counters' && renderCountersTab()}
          {activeTab === 'inventory' && renderInventoryTab()}
          {activeTab === 'affect' && renderAffectTab()}
          {activeTab === 'translations' && renderTranslationsTab()}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t">
          <button
            onClick={handleClose}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              hasChanges
                ? 'bg-blue-500 text-white hover:bg-blue-600'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            <Save className="w-4 h-4" />
            Save Changes
          </button>
        </div>

        {/* Asset Picker Modal */}
        {renderAssetPicker()}
      </div>
    </div>
  );
};
