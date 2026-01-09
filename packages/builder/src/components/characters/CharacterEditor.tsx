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
  Hash
} from 'lucide-react';
import { Character, CharacterState, CharacterCounter, InventoryItem, SpriteAnimation, MeterFrameConfig, MeterFrameAnchor, MeterFrameScreenPosition, MeterFrameDockMode, DEFAULT_METER_FRAME_CONFIG } from '../../types/character';
import { SpriteSheetEditor } from './SpriteSheetEditor';
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
}

export const CharacterEditor: React.FC<CharacterEditorProps> = ({
  character,
  onUpdate,
  onClose,
  assets = [],
  onAssetAdd
}) => {
  const [activeTab, setActiveTab] = useState<'basic' | 'visual' | 'states' | 'counters' | 'inventory'>('basic');
  const [editedCharacter, setEditedCharacter] = useState<Character>(character);
  const [hasChanges, setHasChanges] = useState(false);
  const [showAssetPicker, setShowAssetPicker] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

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
      <div>
        <label className="block text-sm font-medium mb-1">Internal Name</label>
        <input
          type="text"
          value={editedCharacter.name}
          onChange={(e) => setEditedCharacter({ ...editedCharacter, name: e.target.value })}
          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="e.g., player, old_wizard"
        />
        <p className="text-xs text-gray-500 mt-1">Used in code and exports (no spaces)</p>
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
              {!editedCharacter.visual.spriteSheet?.url ? (
                <DirectAssetUpload
                  onAssetSelect={(url, metadata) => {
                    const newVisual = { ...editedCharacter.visual };
                    if (!newVisual.spriteSheet) {
                      newVisual.spriteSheet = {
                        url: url,
                        frameWidth: 32,
                        frameHeight: 32,
                        animations: []
                      };
                    } else {
                      newVisual.spriteSheet.url = url;
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
                      src={editedCharacter.visual.spriteSheet.url}
                      alt="Sprite Sheet"
                      className="max-w-full max-h-[100px] object-contain"
                      style={{ imageRendering: 'pixelated' }}
                    />
                  </div>
                  <button
                    onClick={() => {
                      const newVisual = { ...editedCharacter.visual };
                      if (newVisual.spriteSheet) {
                        newVisual.spriteSheet.url = '';
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
              {assets.length > 0 && !editedCharacter.visual.spriteSheet?.url && (
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
            {editedCharacter.visual.spriteSheet?.url && (
              <div className="mt-4">
                <SpriteSheetEditor
                  spriteSheetUrl={editedCharacter.visual.spriteSheet.url}
                  frameWidth={editedCharacter.visual.spriteSheet.frameWidth || 32}
                  frameHeight={editedCharacter.visual.spriteSheet.frameHeight || 32}
                  animations={editedCharacter.visual.spriteSheet.animations || []}
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
            <div className="flex items-center gap-2">
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
              <input
                type="number"
                value={item.quantity}
                onChange={(e) => {
                  const newInventory = [...editedCharacter.inventory];
                  newInventory[index] = { ...item, quantity: Number(e.target.value) };
                  setEditedCharacter({ ...editedCharacter, inventory: newInventory });
                }}
                className="w-20 px-2 py-1 border rounded text-sm"
                placeholder="Qty"
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
                          frameWidth: 32,
                          frameHeight: 32,
                          animations: []
                        };
                      } else {
                        newVisual.spriteSheet.url = asset.url;
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
