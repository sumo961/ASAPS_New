import React, { useState } from 'react';
import {
  Image as ImageIcon,
  Trash2,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  ChevronUp,
  ChevronDown,
  Plus,
  User,
  Box,
  Type,
  Square,
  MessageSquare,
  MousePointer,
  RotateCw,
  Maximize2,
  Volume2,
  BarChart3,
} from 'lucide-react';
import { getAllPresetSounds, isPresetSound, getPresetSound, type PresetSound } from '@asaps/core';
import type { Asset } from '../assets/AssetManager';
import type { VisualElement } from './VisualBeatEditor';
import type { Character, CharacterState } from '../../types/character';
import type { GlobalSettings } from '../settings/GlobalSettingsInspector';
import { useFonts } from '../../hooks/useFonts';

// Transition types supported by the renderer
type TransitionType = 'none' | 'fade' | 'slide' | 'zoom' | 'dissolve';

interface VisualPropertiesPanelProps {
  backgroundAssetId?: string;
  elements: VisualElement[];
  selectedElements: string[];
  onBackgroundSelect: () => void;
  onElementSelect: (elementId: string | null) => void;
  onElementUpdate: (elementId: string, updates: Partial<VisualElement>) => void;
  onElementDelete: (elementId: string) => void;
  onElementAdd: (type: 'character' | 'prop' | 'text' | 'hotspot' | 'meter') => void;
  onElementReorder: (elementId: string, direction: 'up' | 'down') => void;
  onSelectAsset?: (assetType: 'background' | 'character' | 'prop' | 'sound', callback: (asset: Asset) => void) => void;
  assets: Asset[];
  stageWidth: number;
  stageHeight: number;
  beatType?: string;  // Beat type to control which elements are available
  beatName?: string;  // Beat name for display in header
  onOpenCharacterManager?: (callback: (character: any) => void) => void;  // For changing character
  characters?: Character[];  // Project characters for state selection
  // Beat-level settings
  beatTransition?: { type: TransitionType; duration: number };
  onBeatTransitionChange?: (transition: { type: TransitionType; duration: number }) => void;
  // Global settings for default font fallback
  globalSettings?: GlobalSettings;
  // DialogTree-specific settings
  presentationMode?: 'positioned' | 'chat-scroll' | 'chat-bubble';
  onPresentationModeChange?: (mode: 'positioned' | 'chat-scroll' | 'chat-bubble') => void;
  showAvatars?: boolean;
  onShowAvatarsChange?: (show: boolean) => void;
  responseDelay?: number;
  onResponseDelayChange?: (delay: number) => void;
}

// Helper to format beat type for display (camelCase -> Title Case)
const formatBeatType = (beatType: string): string => {
  return beatType
    .replace(/([A-Z])/g, ' $1')  // Add space before capitals
    .replace(/^./, str => str.toUpperCase())  // Capitalize first letter
    .trim();
};

export const VisualPropertiesPanel: React.FC<VisualPropertiesPanelProps> = ({
  backgroundAssetId,
  elements,
  selectedElements,
  onBackgroundSelect,
  onElementSelect,
  onElementUpdate,
  onElementDelete,
  onElementAdd,
  onElementReorder,
  onSelectAsset,
  assets,
  stageWidth,
  stageHeight,
  beatType,
  beatName,
  onOpenCharacterManager,
  characters = [],
  beatTransition,
  onBeatTransitionChange,
  globalSettings,
  presentationMode,
  onPresentationModeChange,
  showAvatars,
  onShowAvatarsChange,
  responseDelay,
  onResponseDelayChange,
}) => {
  // Get available fonts (built-in + custom from assets)
  const { fonts } = useFonts(assets);

  // Helper to extract display name from a CSS font-family string
  // e.g., '"Courier New", Courier, monospace' -> 'Courier New'
  const extractFontDisplayName = (fontFamily: string): string => {
    if (!fontFamily) return 'Arial';

    // Extract the first font name from the CSS font-family string
    // Handle quoted names: "Courier New" or 'Courier New'
    const quotedMatch = fontFamily.match(/^["']([^"']+)["']/);
    if (quotedMatch) {
      // Check if this matches a known font displayName
      const matchedFont = fonts.find(f => f.displayName === quotedMatch[1]);
      if (matchedFont) return matchedFont.displayName;
    }

    // Handle unquoted names: Arial, sans-serif
    const firstFont = fontFamily.split(',')[0].trim().replace(/["']/g, '');
    const matchedFont = fonts.find(f => f.displayName === firstFont);
    if (matchedFont) return matchedFont.displayName;

    // Fallback: return the extracted name or Arial
    return firstFont || 'Arial';
  };

  // Get default fonts from global settings based on element type
  // Renderer uses different fonts for text vs buttons vs titles
  const defaultTitleFont = extractFontDisplayName(globalSettings?.fonts?.titleFont || 'Arial');
  const defaultTextFont = extractFontDisplayName(globalSettings?.fonts?.textFont || 'Arial');
  const defaultButtonFont = extractFontDisplayName(globalSettings?.fonts?.btnFont || 'Arial');

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    background: true,
    dialogSettings: true,  // Show Dialog Settings expanded by default
    elements: true,
    transform: true,
  });
  const [soundTab, setSoundTab] = useState<'presets' | 'custom'>('presets');
  const [playingSound, setPlayingSound] = useState<string | null>(null);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const backgroundAsset = assets.find(a => a.id === backgroundAssetId);
  // Derive single-select compatibility from multi-select array
  const selectedElement = selectedElements.length === 1 ? selectedElements[0] : null;
  const selected = selectedElement ? elements.find(el => el.id === selectedElement) : undefined;
  const sortedElements = [...elements].sort((a, b) => b.z - a.z); // Sort by z-index descending

  // Get audio assets for custom sound selection
  const audioAssets = assets.filter(a => a.type === 'audio' && a.subType === 'sfx');
  const presetSounds = getAllPresetSounds();

  const getElementIcon = (type: string) => {
    switch (type) {
      case 'character':
        return <User className="w-4 h-4" />;
      case 'prop':
        return <Box className="w-4 h-4" />;
      case 'text':
        return <Type className="w-4 h-4" />;
      case 'hotspot':
        return <MousePointer className="w-4 h-4" />;
      case 'button':
        return <Square className="w-4 h-4" />;
      case 'dialog':
        return <MessageSquare className="w-4 h-4" />;
      default:
        return <Square className="w-4 h-4" />;
    }
  };

  // Helper function to play sound preview
  const playSound = (soundUrl: string, soundId: string) => {
    setPlayingSound(soundId);
    const audio = new Audio(soundUrl);
    audio.volume = 0.5;
    audio.play();
    audio.onended = () => setPlayingSound(null);
    audio.onerror = () => {
      setPlayingSound(null);
      console.error('Error playing sound:', soundUrl);
    };
  };

  return (
    <div className="h-full bg-white flex flex-col w-full">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800">Visual Properties</h2>
        <div className="text-sm text-gray-500 mt-1">
          {beatName || (beatType ? formatBeatType(beatType) : 'No beat selected')}
          {beatType && <span className="text-gray-400 ml-1">({beatType})</span>}
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
        {/* Background Section */}
        <div className="border-b border-gray-200">
          <button
            onClick={() => toggleSection('background')}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50"
          >
            <div className="flex items-center gap-2">
              <ImageIcon className="w-4 h-4" />
              <span className="font-medium text-sm">Background</span>
            </div>
          </button>
          
          {expandedSections.background && (
            <div className="px-4 pb-4">
              <button
                onClick={onBackgroundSelect}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors"
              >
                {backgroundAsset ? 'Change Background' : 'Choose Background'}
              </button>
              {backgroundAsset && (
                <div className="mt-2 text-xs text-gray-600">
                  {backgroundAsset.name}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Transition Section - Beat-level setting */}
        {onBeatTransitionChange && (
          <div className="border-b border-gray-200">
            <button
              onClick={() => toggleSection('transition')}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50"
            >
              <div className="flex items-center gap-2">
                <RotateCw className="w-4 h-4" />
                <span className="font-medium text-sm">Transition</span>
              </div>
            </button>

            {expandedSections.transition && (
              <div className="px-4 pb-4 space-y-3">
                {/* Transition Type */}
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">
                    Type
                  </label>
                  <select
                    value={beatTransition?.type || 'none'}
                    onChange={(e) => {
                      if (onBeatTransitionChange) {
                        onBeatTransitionChange({
                          type: e.target.value as TransitionType,
                          duration: beatTransition?.duration || 500
                        });
                      }
                    }}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                  >
                    <option value="none">None</option>
                    <option value="fade">Fade</option>
                    <option value="slide">Slide</option>
                    <option value="zoom">Zoom</option>
                    <option value="dissolve">Dissolve</option>
                  </select>
                </div>

                {/* Transition Duration - only show if type is not 'none' */}
                {beatTransition?.type && beatTransition.type !== 'none' && (
                  <div>
                    <label className="text-xs font-medium text-gray-700 mb-1 block">
                      Duration (ms)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="100"
                        max="2000"
                        step="100"
                        value={beatTransition?.duration || 500}
                        onChange={(e) => onBeatTransitionChange({
                          type: beatTransition?.type || 'fade',
                          duration: parseInt(e.target.value)
                        })}
                        className="flex-1"
                      />
                      <input
                        type="number"
                        value={beatTransition?.duration || 500}
                        onChange={(e) => onBeatTransitionChange({
                          type: beatTransition?.type || 'fade',
                          duration: parseInt(e.target.value) || 500
                        })}
                        className="w-16 px-2 py-1 text-sm border border-gray-300 rounded"
                        min="100"
                        max="2000"
                      />
                      <span className="text-xs text-gray-600">ms</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Dialog Settings Section - For dialogTree and aiDialogTree beats */}
        {(beatType === 'dialogTree' || beatType === 'aiDialogTree') && onPresentationModeChange && (
          <div className="border-b border-gray-200">
            <button
              onClick={() => toggleSection('dialogSettings')}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50"
            >
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                <span className="font-medium text-sm">Dialog Settings</span>
              </div>
              {expandedSections.dialogSettings ? (
                <ChevronUp className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              )}
            </button>

            {expandedSections.dialogSettings && (
              <div className="px-4 pb-4 space-y-3">
                {/* Presentation Mode */}
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">
                    Presentation Mode
                  </label>
                  <select
                    value={presentationMode || 'positioned'}
                    onChange={(e) => onPresentationModeChange(e.target.value as 'positioned' | 'chat-scroll' | 'chat-bubble')}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                  >
                    <option value="positioned">Positioned (Visual Novel)</option>
                    <option value="chat-scroll">Chat - Scrollable History</option>
                    <option value="chat-bubble">Chat - Single Bubble</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    {presentationMode === 'chat-scroll' && 'Messages stack vertically with scrollable history'}
                    {presentationMode === 'chat-bubble' && 'Shows one message at a time in chat style'}
                    {(!presentationMode || presentationMode === 'positioned') && 'Traditional positioned dialog elements'}
                  </p>
                </div>

                {/* Show Avatars - Only visible in chat modes */}
                {(presentationMode === 'chat-scroll' || presentationMode === 'chat-bubble') && onShowAvatarsChange && (
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="showAvatars"
                      checked={showAvatars ?? true}
                      onChange={(e) => onShowAvatarsChange(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    <label htmlFor="showAvatars" className="text-sm text-gray-700">
                      Show character avatars
                    </label>
                  </div>
                )}

                {/* Response Delay - Only visible in chat modes */}
                {(presentationMode === 'chat-scroll' || presentationMode === 'chat-bubble') && onResponseDelayChange && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      NPC Response Delay (seconds)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="10"
                      step="0.5"
                      value={responseDelay ?? 0}
                      onChange={(e) => onResponseDelayChange(parseFloat(e.target.value) || 0)}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Adds a natural pause before NPC responds. Shows typing indicator during delay.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Elements Section */}
        <div className="border-b border-gray-200">
          <button
            onClick={() => toggleSection('elements')}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50"
          >
            <div className="flex items-center gap-2">
              <Box className="w-4 h-4" />
              <span className="font-medium text-sm">Elements ({elements.length})</span>
            </div>
          </button>

          {expandedSections.elements && (
            <div className="px-4 pb-4 space-y-2">
              {/* Add Element Buttons */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <button
                  onClick={() => onElementAdd('character')}
                  className="px-2 py-1.5 border border-gray-300 rounded text-xs hover:bg-gray-50 flex items-center justify-center gap-1"
                >
                  <User className="w-3 h-3" />
                  Character
                </button>
                <button
                  onClick={() => onElementAdd('prop')}
                  className="px-2 py-1.5 border border-gray-300 rounded text-xs hover:bg-gray-50 flex items-center justify-center gap-1"
                >
                  <Box className="w-3 h-3" />
                  Prop
                </button>
                <button
                  onClick={() => onElementAdd('text')}
                  className="px-2 py-1.5 border border-gray-300 rounded text-xs hover:bg-gray-50 flex items-center justify-center gap-1"
                >
                  <Type className="w-3 h-3" />
                  Text
                </button>
                {/* Show Hotspot button for movementChoice and pickProp beats */}
                {(beatType === 'movementChoice' || beatType === 'pickProp') && (
                  <button
                    onClick={() => onElementAdd('hotspot')}
                    className="px-2 py-1.5 border border-gray-300 rounded text-xs hover:bg-gray-50 flex items-center justify-center gap-1"
                  >
                    <MousePointer className="w-3 h-3" />
                    Hotspot
                  </button>
                )}
                {/* Counter Meter button - only show if characters have counters with meters enabled */}
                {characters.some(c => c.counters?.some(counter => counter.showLevelMeter)) && (
                  <button
                    onClick={() => onElementAdd('meter')}
                    className="px-2 py-1.5 border border-gray-300 rounded text-xs hover:bg-gray-50 flex items-center justify-center gap-1"
                    title="Add counter level meter"
                  >
                    <BarChart3 className="w-3 h-3" />
                    Meter
                  </button>
                )}
              </div>

              {/* Element List */}
              {sortedElements.length === 0 ? (
                <div className="text-xs text-gray-500 italic py-2 text-center">
                  No elements yet. Add one above.
                </div>
              ) : (
                <div className="space-y-1">
                  {sortedElements.map((element, index) => (
                    <div
                      key={element.id}
                      className={`
                        p-2 rounded border transition-colors cursor-pointer
                        ${selectedElements.includes(element.id)
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}
                      `}
                      onClick={() => onElementSelect(element.id)}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {getElementIcon(element.type)}
                          <span className="text-sm font-medium truncate">
                            {element.name}
                          </span>
                          {element.groupId && (
                            <span className="text-[10px] px-1 py-0.5 bg-purple-100 text-purple-600 rounded" title="Grouped">G</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-500">z:{element.z}</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1 mt-1">
                        {/* Visibility Toggle */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onElementUpdate(element.id, { visible: !element.visible });
                          }}
                          className="p-1 hover:bg-white rounded"
                          title={element.visible ? 'Hide' : 'Show'}
                        >
                          {element.visible ? (
                            <Eye className="w-3 h-3 text-gray-600" />
                          ) : (
                            <EyeOff className="w-3 h-3 text-gray-400" />
                          )}
                        </button>
                        
                        {/* Lock Toggle */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onElementUpdate(element.id, { locked: !element.locked });
                          }}
                          className="p-1 hover:bg-white rounded"
                          title={element.locked ? 'Unlock' : 'Lock'}
                        >
                          {element.locked ? (
                            <Lock className="w-3 h-3 text-gray-600" />
                          ) : (
                            <Unlock className="w-3 h-3 text-gray-400" />
                          )}
                        </button>
                        
                        <div className="flex-1" />
                        
                        {/* Reorder Buttons */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onElementReorder(element.id, 'up');
                          }}
                          disabled={index === 0}
                          className="p-1 hover:bg-white rounded disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Move Up"
                        >
                          <ChevronUp className="w-3 h-3 text-gray-600" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onElementReorder(element.id, 'down');
                          }}
                          disabled={index === sortedElements.length - 1}
                          className="p-1 hover:bg-white rounded disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Move Down"
                        >
                          <ChevronDown className="w-3 h-3 text-gray-600" />
                        </button>
                        
                        {/* Delete Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`Delete "${element.name}"?`)) {
                              onElementDelete(element.id);
                            }
                          }}
                          className="p-1 hover:bg-red-50 rounded"
                          title="Delete"
                        >
                          <Trash2 className="w-3 h-3 text-red-600" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Multi-select summary */}
        {selectedElements.length > 1 && (
          <div className="border-b border-gray-200 px-4 py-3">
            <div className="text-sm font-medium text-gray-700 mb-2">
              {selectedElements.length} elements selected
              {(() => {
                const selEls = elements.filter(el => selectedElements.includes(el.id));
                const grouped = selEls.filter(el => el.groupId);
                if (grouped.length > 0) {
                  const groups = new Set(grouped.map(el => el.groupId));
                  return <span className="text-purple-600 ml-1">({groups.size} group{groups.size > 1 ? 's' : ''})</span>;
                }
                return null;
              })()}
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => {
                  selectedElements.forEach(id => {
                    const el = elements.find(e => e.id === id);
                    if (el && !el.locked) onElementUpdate(id, { locked: true });
                  });
                }}
                className="px-3 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200"
              >
                Lock All
              </button>
              <button
                onClick={() => {
                  selectedElements.forEach(id => {
                    const el = elements.find(e => e.id === id);
                    if (el && el.locked) onElementUpdate(id, { locked: false });
                  });
                }}
                className="px-3 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200"
              >
                Unlock All
              </button>
              <button
                onClick={() => {
                  selectedElements.forEach(id => onElementDelete(id));
                }}
                className="px-3 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
              >
                Delete All
              </button>
            </div>
          </div>
        )}

        {/* Transform Section - Only shown when element is selected */}
        {selected && (
          <div className="border-b border-gray-200">
            <button
              onClick={() => toggleSection('transform')}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50"
            >
              <div className="flex items-center gap-2">
                <Maximize2 className="w-4 h-4" />
                <span className="font-medium text-sm">Transform</span>
              </div>
            </button>
            
            {expandedSections.transform && (
              <div className="px-4 pb-4 space-y-3">
                {/* Position - shows effective position accounting for scale transform */}
                {(() => {
                  const scale = selected.scale || 1;
                  // Calculate effective dimensions (visual size after scale)
                  const effectiveWidth = selected.width * scale;
                  const effectiveHeight = selected.height * scale;
                  // Calculate effective position (top-left of scaled element, transform origin is center)
                  const effectiveX = selected.x + (selected.width - effectiveWidth) / 2;
                  const effectiveY = selected.y + (selected.height - effectiveHeight) / 2;

                  return (
                    <>
                      <div>
                        <label className="text-xs font-medium text-gray-700 mb-1 block">
                          Position
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs text-gray-600">X</label>
                            <input
                              type="number"
                              value={Math.round(effectiveX)}
                              onChange={(e) => {
                                const newEffectiveX = parseInt(e.target.value) || 0;
                                // Convert effective X back to base X
                                const baseX = newEffectiveX - (selected.width - effectiveWidth) / 2;
                                onElementUpdate(selected.id, { x: Math.round(baseX) });
                              }}
                              className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-600">Y</label>
                            <input
                              type="number"
                              value={Math.round(effectiveY)}
                              onChange={(e) => {
                                const newEffectiveY = parseInt(e.target.value) || 0;
                                // Convert effective Y back to base Y
                                const baseY = newEffectiveY - (selected.height - effectiveHeight) / 2;
                                onElementUpdate(selected.id, { y: Math.round(baseY) });
                              }}
                              className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Size - shows effective size accounting for scale */}
                      <div>
                        <label className="text-xs font-medium text-gray-700 mb-1 block">
                          Size
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs text-gray-600">Width</label>
                            <input
                              type="number"
                              value={Math.round(effectiveWidth)}
                              onChange={(e) => {
                                const newEffectiveWidth = parseInt(e.target.value) || 50;
                                // Convert effective width back to base width
                                const baseWidth = newEffectiveWidth / scale;
                                onElementUpdate(selected.id, { width: Math.round(baseWidth) });
                              }}
                              className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                              min="10"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-600">Height</label>
                            <input
                              type="number"
                              value={Math.round(effectiveHeight)}
                              onChange={(e) => {
                                const newEffectiveHeight = parseInt(e.target.value) || 50;
                                // Convert effective height back to base height
                                const baseHeight = newEffectiveHeight / scale;
                                onElementUpdate(selected.id, { height: Math.round(baseHeight) });
                              }}
                              className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                              min="10"
                            />
                          </div>
                        </div>
                      </div>
                    </>
                  );
                })()}

                {/* Scale - hide for characters since they have their own Size control */}
                {selected.type !== 'character' && (
                  <div>
                    <label className="text-xs font-medium text-gray-700 mb-1 block">
                      Scale
                    </label>
                    <input
                      type="range"
                      min="0.1"
                      max="3"
                      step="0.1"
                      value={selected.scale}
                      onChange={(e) => onElementUpdate(selected.id, { scale: parseFloat(e.target.value) })}
                      className="w-full"
                    />
                    <div className="text-xs text-gray-600 text-center">{(selected.scale * 100).toFixed(0)}%</div>
                  </div>
                )}

                {/* Rotation */}
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">
                    Rotation
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="0"
                      max="360"
                      value={selected.rotation}
                      onChange={(e) => onElementUpdate(selected.id, { rotation: parseInt(e.target.value) })}
                      className="flex-1"
                    />
                    <input
                      type="number"
                      value={selected.rotation}
                      onChange={(e) => onElementUpdate(selected.id, { rotation: parseInt(e.target.value) || 0 })}
                      className="w-16 px-2 py-1 text-sm border border-gray-300 rounded"
                      min="0"
                      max="360"
                    />
                    <span className="text-xs text-gray-600">°</span>
                  </div>
                </div>

                {/* Z-Index */}
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">
                    Layer (Z-Index)
                  </label>
                  <input
                    type="number"
                    value={selected.z}
                    onChange={(e) => onElementUpdate(selected.id, { z: parseInt(e.target.value) || 0 })}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                  />
                </div>

                {/* Name */}
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">
                    Name
                  </label>
                  <input
                    type="text"
                    value={selected.name}
                    onChange={(e) => onElementUpdate(selected.id, { name: e.target.value })}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                  />
                </div>

                {/* Asset Controls - Only for character and prop elements */}
                {(selected.type === 'character' || selected.type === 'prop') && (
                  <div>
                    <label className="text-xs font-medium text-gray-700 mb-1 block">
                      Asset
                    </label>
                    {selected.assetId && (
                      <div className="mb-2 p-2 bg-gray-50 rounded border border-gray-200">
                        {(() => {
                          const asset = assets.find(a => a.id === selected.assetId);
                          if (asset) {
                            return (
                              <div className="flex items-center gap-2">
                                {asset.url && asset.type === 'image' && (
                                  <img
                                    src={asset.url}
                                    alt={asset.name}
                                    className="w-12 h-12 object-contain rounded border border-gray-300"
                                  />
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs font-medium text-gray-900 truncate">{asset.name}</div>
                                  {asset.dimensions && (
                                    <div className="text-xs text-gray-500">
                                      {asset.dimensions.width} × {asset.dimensions.height}px
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          }
                          return (
                            <div className="text-xs text-red-600">
                              Asset not found: {selected.assetId}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                    {/* Character: Show "Change Character" button */}
                    {selected.type === 'character' ? (
                      <button
                        onClick={() => {
                          if (onOpenCharacterManager) {
                            onOpenCharacterManager((character) => {
                              // Get the character's default state image
                              const defaultState = character.states?.find((s: any) => s.id === character.defaultState);
                              const characterImage = defaultState?.visual?.image || character.visual?.defaultImage;

                              // Convert base64 to blob URL if needed
                              const convertBase64ToBlob = (base64: string): string => {
                                if (!base64.startsWith('data:')) return base64;
                                try {
                                  const parts = base64.split(',');
                                  const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/png';
                                  const bstr = atob(parts[1]);
                                  const n = bstr.length;
                                  const u8arr = new Uint8Array(n);
                                  for (let i = 0; i < n; i++) {
                                    u8arr[i] = bstr.charCodeAt(i);
                                  }
                                  const blob = new Blob([u8arr], { type: mime });
                                  return URL.createObjectURL(blob);
                                } catch (error) {
                                  console.error('Error converting base64 to blob:', error);
                                  return base64;
                                }
                              };

                              let imageUrl = characterImage;
                              if (imageUrl && imageUrl.startsWith('data:')) {
                                imageUrl = convertBase64ToBlob(imageUrl);
                              }

                              // Load image to get natural dimensions
                              const updateCharacter = (width?: number, height?: number) => {
                                const updates: Record<string, any> = {
                                  name: character.displayName,
                                  characterId: character.id,
                                  characterName: character.name,
                                  stateId: defaultState?.id || 'default',
                                  imageUrl: imageUrl,
                                  size: 100 // Reset to 100% for new character
                                };
                                if (width && height) {
                                  updates.width = width;
                                  updates.height = height;
                                }
                                onElementUpdate(selected.id, updates);
                              };

                              // Try to load image to get natural dimensions
                              if (imageUrl) {
                                const img = new Image();
                                img.onload = () => {
                                  updateCharacter(img.naturalWidth, img.naturalHeight);
                                };
                                img.onerror = () => {
                                  updateCharacter();
                                };
                                img.src = imageUrl;
                              } else {
                                updateCharacter();
                              }
                            });
                          }
                        }}
                        className="w-full px-3 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 flex items-center justify-center gap-2"
                      >
                        <User className="w-4 h-4" />
                        Change Character
                      </button>
                    ) : (
                      /* Prop: Show "Select Asset" button */
                      <button
                        onClick={() => {
                          if (onSelectAsset) {
                            onSelectAsset(selected.type as 'character' | 'prop', (asset) => {
                              onElementUpdate(selected.id, { assetId: asset.id });
                            });
                          }
                        }}
                        className="w-full px-3 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 flex items-center justify-center gap-2"
                      >
                        <ImageIcon className="w-4 h-4" />
                        {selected.assetId ? 'Change Asset' : 'Select Asset'}
                      </button>
                    )}
                  </div>
                )}

                {/* Character State and Size Controls - Only for character elements */}
                {selected.type === 'character' && selected.characterId && (
                  <>
                    {/* State Selector */}
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-1 block">
                        Character State
                      </label>
                      <select
                        value={selected.stateId || 'default'}
                        onChange={(e) => {
                          const character = characters.find(c => c.id === selected.characterId);
                          const newState = character?.states?.find(s => s.id === e.target.value);
                          const newImageUrl = newState?.visual?.image || character?.visual?.defaultImage;
                          onElementUpdate(selected.id, {
                            stateId: e.target.value,
                            imageUrl: newImageUrl
                          });
                        }}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                      >
                        {(() => {
                          const character = characters.find(c => c.id === selected.characterId);
                          if (character?.states && character.states.length > 0) {
                            return character.states.map(state => (
                              <option key={state.id} value={state.id}>
                                {state.name}
                              </option>
                            ));
                          }
                          return <option value="default">Default</option>;
                        })()}
                      </select>
                    </div>

                    {/* Size/Scale Slider */}
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-1 block">
                        Size ({selected.size || 100}%)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min="10"
                          max="200"
                          value={selected.size || 100}
                          onChange={(e) => onElementUpdate(selected.id, { size: parseInt(e.target.value) })}
                          className="flex-1"
                        />
                        <input
                          type="number"
                          min="10"
                          max="200"
                          value={selected.size || 100}
                          onChange={(e) => onElementUpdate(selected.id, { size: parseInt(e.target.value) || 100 })}
                          className="w-16 px-2 py-1 text-sm border border-gray-300 rounded text-center"
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* Hotspot Settings - Only for hotspot elements */}
                {selected.type === 'hotspot' && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <label className="text-xs font-medium text-gray-700 mb-2 block">
                      Hotspot Settings (Per-Element Override)
                    </label>

                    {/* Override Global Settings Checkbox */}
                    <label className="flex items-center gap-2 mb-3">
                      <input
                        type="checkbox"
                        checked={selected.hotspotOverride?.enabled ?? false}
                        onChange={(e) => onElementUpdate(selected.id, {
                          hotspotOverride: {
                            ...selected.hotspotOverride,
                            enabled: e.target.checked
                          }
                        })}
                        className="rounded"
                      />
                      <span className="text-xs text-gray-700">Override global hotspot settings</span>
                    </label>

                    {/* Override Controls - Only show when override is enabled */}
                    {selected.hotspotOverride?.enabled && (
                      <div className="space-y-3 pl-2 border-l-2 border-blue-200">
                        {/* Opacity Slider */}
                        <div>
                          <label className="text-xs font-medium text-gray-700 mb-1 block">
                            Opacity
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="range"
                              min="0"
                              max="100"
                              value={selected.hotspotOverride?.opacity ?? globalSettings?.hotspots?.opacity ?? 30}
                              onChange={(e) => onElementUpdate(selected.id, {
                                hotspotOverride: {
                                  ...selected.hotspotOverride,
                                  enabled: true,
                                  opacity: parseInt(e.target.value)
                                }
                              })}
                              className="flex-1"
                            />
                            <span className="text-xs text-gray-600 w-8 text-right">
                              {selected.hotspotOverride?.opacity ?? globalSettings?.hotspots?.opacity ?? 30}%
                            </span>
                          </div>
                        </div>

                        {/* Preview Mode Visibility */}
                        <div>
                          <label className="text-xs font-medium text-gray-700 mb-1 block">
                            Preview Visibility
                          </label>
                          <select
                            value={selected.hotspotOverride?.showInPreview ?? globalSettings?.hotspots?.showInPreview ?? 'visible'}
                            onChange={(e) => onElementUpdate(selected.id, {
                              hotspotOverride: {
                                ...selected.hotspotOverride,
                                enabled: true,
                                showInPreview: e.target.value as 'visible' | 'onHover' | 'invisible'
                              }
                            })}
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                          >
                            <option value="visible">Visible (always show)</option>
                            <option value="onHover">On Hover only</option>
                            <option value="invisible">Invisible (no feedback)</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Font Controls - Only for text, dialog, and button elements */}
                {(selected.type === 'text' || selected.type === 'dialog' || selected.type === 'button') && (
                  <>
                    {/* Font Family with Reset Button */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-medium text-gray-700">
                          Font Family
                        </label>
                        {(selected.font || selected.fontSize || selected.fontOverridden) && (
                          <button
                            onClick={() => onElementUpdate(selected.id, {
                              font: undefined,
                              fontSize: undefined,
                              fontOverridden: false
                            })}
                            className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                            title="Reset to theme defaults"
                          >
                            <RotateCw className="w-3 h-3" />
                            Reset
                          </button>
                        )}
                      </div>
                      <select
                        value={selected.font || (
                          selected.type === 'button' ? defaultButtonFont :
                          (selected.name?.toLowerCase().includes('title') || selected.name?.toLowerCase().includes('author')) ? defaultTitleFont :
                          defaultTextFont
                        )}
                        onChange={(e) => onElementUpdate(selected.id, { font: e.target.value, fontOverridden: true })}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                      >
                        {fonts.filter(f => f.type === 'builtin').map(font => (
                          <option key={font.id} value={font.displayName}>
                            {font.displayName}
                          </option>
                        ))}
                        {fonts.filter(f => f.type === 'custom').length > 0 && (
                          <optgroup label="Custom Fonts">
                            {fonts.filter(f => f.type === 'custom').map(font => (
                              <option key={font.id} value={font.displayName}>
                                {font.displayName}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                    </div>

                    {/* Font Size */}
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-1 block">
                        Font Size
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min="10"
                          max="72"
                          value={selected.fontSize || 16}
                          onChange={(e) => onElementUpdate(selected.id, { fontSize: parseInt(e.target.value), fontOverridden: true })}
                          className="flex-1"
                        />
                        <input
                          type="number"
                          value={selected.fontSize || 16}
                          onChange={(e) => onElementUpdate(selected.id, { fontSize: parseInt(e.target.value) || 16, fontOverridden: true })}
                          className="w-16 px-2 py-1 text-sm border border-gray-300 rounded"
                          min="10"
                          max="72"
                        />
                        <span className="text-xs text-gray-600">px</span>
                      </div>
                    </div>

                    {/* Text Alignment */}
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-1 block">
                        Text Alignment
                      </label>
                      <div className="grid grid-cols-3 gap-1">
                        <button
                          onClick={() => onElementUpdate(selected.id, { textAlign: 'left' })}
                          className={`px-2 py-1 text-xs border rounded ${
                            (selected.textAlign || 'center') === 'left'
                              ? 'border-blue-500 bg-blue-50 text-blue-700'
                              : 'border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          Left
                        </button>
                        <button
                          onClick={() => onElementUpdate(selected.id, { textAlign: 'center' })}
                          className={`px-2 py-1 text-xs border rounded ${
                            (selected.textAlign || 'center') === 'center'
                              ? 'border-blue-500 bg-blue-50 text-blue-700'
                              : 'border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          Center
                        </button>
                        <button
                          onClick={() => onElementUpdate(selected.id, { textAlign: 'right' })}
                          className={`px-2 py-1 text-xs border rounded ${
                            (selected.textAlign || 'center') === 'right'
                              ? 'border-blue-500 bg-blue-50 text-blue-700'
                              : 'border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          Right
                        </button>
                      </div>
                    </div>

                    {/* Require Scroll to Bottom - Only for text and dialog elements */}
                    {(selected.type === 'text' || selected.type === 'dialog') && (
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selected.requireScrollToBottom ?? false}
                            onChange={(e) => onElementUpdate(selected.id, { requireScrollToBottom: e.target.checked })}
                            className="rounded border-gray-300"
                          />
                          <span className="text-xs font-medium text-gray-700">Require scroll to bottom</span>
                        </label>
                        <p className="text-xs text-gray-500 mt-1 ml-5">
                          When enabled, the Continue button will be disabled until the player scrolls to the bottom of this text box.
                        </p>
                      </div>
                    )}

                    {/* Click Sound Section - Only for interactive elements */}
                    {(selected.type === 'button' || selected.type === 'text' || selected.type === 'dialog') && (
                      <div className="mt-4">
                        <label className="text-xs font-medium text-gray-700 mb-2 block">
                          Click Sound
                        </label>

                        {/* Tab Selection */}
                        <div className="grid grid-cols-2 gap-1 mb-2">
                          <button
                            onClick={() => setSoundTab('presets')}
                            className={`px-2 py-1 text-xs border rounded ${
                              soundTab === 'presets'
                                ? 'border-blue-500 bg-blue-50 text-blue-700'
                                : 'border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            Presets
                          </button>
                          <button
                            onClick={() => setSoundTab('custom')}
                            className={`px-2 py-1 text-xs border rounded ${
                              soundTab === 'custom'
                                ? 'border-blue-500 bg-blue-50 text-blue-700'
                                : 'border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            Custom
                          </button>
                        </div>

                        {/* Preset Sounds */}
                        {soundTab === 'presets' && (
                          <div className="space-y-1 max-h-48 overflow-y-auto border border-gray-200 rounded p-2">
                            {presetSounds.map((sound) => (
                              <div
                                key={sound.id}
                                className={`flex items-center justify-between p-2 rounded border transition-colors ${
                                  selected.sound === sound.id
                                    ? 'border-blue-500 bg-blue-50'
                                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                }`}
                              >
                                <div className="flex-1 min-w-0 mr-2">
                                  <div className="text-xs font-medium text-gray-900">{sound.name}</div>
                                  <div className="text-xs text-gray-500">{sound.description}</div>
                                </div>
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => playSound(sound.url, sound.id)}
                                    className="p-1 hover:bg-white rounded"
                                    title="Preview sound"
                                  >
                                    <Volume2 className={`w-3 h-3 ${playingSound === sound.id ? 'text-blue-600' : 'text-gray-600'}`} />
                                  </button>
                                  <button
                                    onClick={() => onElementUpdate(selected.id, { sound: sound.id })}
                                    className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
                                  >
                                    {selected.sound === sound.id ? 'Selected' : 'Use'}
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Custom Audio Assets */}
                        {soundTab === 'custom' && (
                          <div className="space-y-1 max-h-48 overflow-y-auto border border-gray-200 rounded p-2">
                            {audioAssets.length === 0 ? (
                              <div className="text-xs text-gray-500 italic py-4 text-center">
                                No custom audio assets uploaded yet.
                                <br />
                                Upload audio files with subType 'sfx' to use them here.
                              </div>
                            ) : (
                              audioAssets.map((asset) => (
                                <div
                                  key={asset.id}
                                  className={`flex items-center justify-between p-2 rounded border transition-colors ${
                                    selected.sound === asset.id
                                      ? 'border-blue-500 bg-blue-50'
                                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                  }`}
                                >
                                  <div className="flex-1 min-w-0 mr-2">
                                    <div className="text-xs font-medium text-gray-900 truncate">{asset.name}</div>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => playSound(asset.url, asset.id)}
                                      className="p-1 hover:bg-white rounded"
                                      title="Preview sound"
                                    >
                                      <Volume2 className={`w-3 h-3 ${playingSound === asset.id ? 'text-blue-600' : 'text-gray-600'}`} />
                                    </button>
                                    <button
                                      onClick={() => onElementUpdate(selected.id, { sound: asset.id, soundAssetId: asset.id })}
                                      className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
                                    >
                                      {selected.sound === asset.id ? 'Selected' : 'Use'}
                                    </button>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        )}

                        {/* Clear Sound Button */}
                        {selected.sound && (
                          <button
                            onClick={() => onElementUpdate(selected.id, { sound: undefined, soundAssetId: undefined })}
                            className="w-full mt-2 px-2 py-1 text-xs border border-red-300 text-red-600 rounded hover:bg-red-50"
                          >
                            Remove Sound
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
