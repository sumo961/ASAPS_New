#!/bin/bash

# Enhanced Visual Workspace Fix Script
# This script enhances the VisualWorkspace with proper controls and functionality

echo "🔧 Enhancing Visual Workspace..."

# Create enhanced VisualWorkspace.tsx
cat > packages/builder/src/components/visual/VisualWorkspace.tsx << 'EOF'
/**
 * Visual Workspace Component
 * Full-screen visual editor for beats with all controls consolidated
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Beat } from '@asaps/core';
import { VisualBeatEditor, VisualElement } from './VisualBeatEditor';
import { AssetSelectionModal } from '../assets/AssetSelectionModal';
import type { Asset } from '../assets/AssetManager';
import { 
  Info, Save, Settings, Layers, Image, Music, FileText, 
  User, Package, Square, Type, Plus, Eye, EyeOff, Lock, 
  Unlock, Trash2, ChevronLeft, ChevronRight 
} from 'lucide-react';

interface VisualWorkspaceProps {
  beat: Beat | null;
  beats: Beat[];
  assets?: Asset[];
  onAssetSelect?: (type: 'background' | 'character' | 'prop' | 'sound', callback: (asset: Asset) => void) => void;
  onAssetAdd?: (asset: Asset) => void;
  onAssetRemove?: (assetId: string) => void;
  onAssetUpdate?: (assetId: string, updates: Partial<Asset>) => void;
}

export const VisualWorkspace: React.FC<VisualWorkspaceProps> = ({
  beat,
  beats,
  assets = [],
  onAssetSelect,
  onAssetAdd,
  onAssetRemove,
  onAssetUpdate,
}) => {
  const [visualElements, setVisualElements] = useState<VisualElement[]>([]);
  const [backgroundAssetId, setBackgroundAssetId] = useState<string>('');
  const [backgroundSound, setBackgroundSound] = useState<string>('');
  const [showProperties, setShowProperties] = useState(true);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  
  // Asset selection modal state
  const [assetModal, setAssetModal] = useState<{
    isOpen: boolean;
    type: 'background' | 'character' | 'prop' | 'sound' | null;
    callback: ((asset: Asset) => void) | null;
  }>({ isOpen: false, type: null, callback: null });

  // Initialize from beat parameters
  useEffect(() => {
    if (!beat) return;
    
    const params = beat.getParameters ? beat.getParameters() : {};
    
    // Load saved visual elements or initialize with defaults
    let elements = params.visualElements || [];
    
    // Auto-add beat-specific elements if not already present
    if (beat.type === 'titleScreen' && !elements.some((e: VisualElement) => e.type === 'button' && e.name === 'Start')) {
      elements.push({
        id: `button_start_${Date.now()}`,
        type: 'button',
        name: 'Start',
        text: params.buttonText || 'Start',
        x: 512 - 100, // Center on 1024 width
        y: 500,
        z: 10,
        width: 200,
        height: 50,
        rotation: 0,
        scale: 1,
        visible: true,
        locked: false
      });
      
      // Also add title text
      if (!elements.some((e: VisualElement) => e.type === 'text' && e.name === 'Title')) {
        elements.push({
          id: `text_title_${Date.now()}`,
          type: 'text',
          name: 'Title',
          text: `${params.title || 'Untitled'}`,
          x: 512 - 200,
          y: 200,
          z: 9,
          width: 400,
          height: 60,
          rotation: 0,
          scale: 1,
          visible: true,
          locked: false
        });
        
        elements.push({
          id: `text_author_${Date.now()}`,
          type: 'text',
          name: 'Author',
          text: `by ${params.author || 'Unknown'}`,
          x: 512 - 150,
          y: 270,
          z: 9,
          width: 300,
          height: 40,
          rotation: 0,
          scale: 1,
          visible: true,
          locked: false
        });
      }
    }
    
    // Load background from node parameter (old ASML style) or backgroundAssetId
    const bgId = params.node || params.backgroundAssetId || '';
    
    setVisualElements(elements);
    setBackgroundAssetId(bgId);
    setBackgroundSound(params.backgroundSound || '');
    setHasChanges(false);
  }, [beat?.id]);

  // Get beat content for visual editor
  const getBeatContent = () => {
    if (!beat) return undefined;
    const params = beat.getParameters ? beat.getParameters() : {};
    
    switch (beat.type) {
      case 'titleScreen':
        return {
          title: params.title || 'Untitled',
          author: params.author || 'Unknown',
          buttonText: params.buttonText || 'Start'
        };
      case 'introText':
      case 'durScreen':
        return {
          text: params.text || '',
          buttonText: params.buttonText || 'Continue'
        };
      case 'dialogTree':
        return {
          text: params.dialogTree?.text || params.text || '',
          speaker: params.dialogTree?.speaker || params.speaker,
          choices: params.dialogTree?.choices?.map((c: any) => ({ text: c.text })) || []
        };
      case 'movementChoice':
        return {
          text: params.question || 'Where do you want to go?',
          choices: params.choices || []
        };
      case 'pickProp':
        return {
          text: params.question || 'What do you want to pick up?',
          choices: params.props?.map((p: any) => ({ text: p.name })) || []
        };
      case 'endScreen':
        return {
          text: params.message || 'The End',
          buttonText: params.buttonText || 'Play Again'
        };
      default:
        return undefined;
    }
  };

  // Handle asset selection
  const handleAssetSelection = useCallback((
    type: 'background' | 'character' | 'prop' | 'sound',
    callback: (asset: Asset) => void
  ) => {
    setAssetModal({
      isOpen: true,
      type,
      callback
    });
  }, []);

  // Handle asset selected from modal
  const handleAssetSelected = (asset: Asset) => {
    if (assetModal.callback) {
      assetModal.callback(asset);
    }
    setAssetModal({ isOpen: false, type: null, callback: null });
  };

  // Handle background selection
  const handleBackgroundSelect = useCallback(() => {
    handleAssetSelection('background', (asset) => {
      setBackgroundAssetId(asset.id);
      setHasChanges(true);
    });
  }, [handleAssetSelection]);

  // Handle sound selection
  const handleSoundSelect = useCallback(() => {
    handleAssetSelection('sound', (asset) => {
      setBackgroundSound(asset.id);
      setHasChanges(true);
    });
  }, [handleAssetSelection]);

  // Add visual element
  const addElement = (type: 'character' | 'prop' | 'hotspot' | 'text') => {
    if (type === 'character' || type === 'prop') {
      handleAssetSelection(type, (asset) => {
        const newElement: VisualElement = {
          id: `element_${Date.now()}`,
          type,
          assetId: asset.id,
          name: asset.name,
          x: 512 - 75,
          y: 384 - 75,
          z: visualElements.length,
          width: 150,
          height: 150,
          rotation: 0,
          scale: 1,
          visible: true,
          locked: false
        };
        setVisualElements([...visualElements, newElement]);
        setSelectedElementId(newElement.id);
        setHasChanges(true);
      });
    } else {
      const newElement: VisualElement = {
        id: `element_${Date.now()}`,
        type,
        name: type === 'hotspot' ? 'Hotspot' : 'Text',
        text: type === 'text' ? 'New Text' : undefined,
        x: 512 - (type === 'hotspot' ? 50 : 100),
        y: 384 - (type === 'hotspot' ? 50 : 20),
        z: visualElements.length,
        width: type === 'hotspot' ? 100 : 200,
        height: type === 'hotspot' ? 100 : 40,
        rotation: 0,
        scale: 1,
        visible: true,
        locked: false
      };
      setVisualElements([...visualElements, newElement]);
      setSelectedElementId(newElement.id);
      setHasChanges(true);
    }
  };

  // Update element
  const updateElement = (elementId: string, updates: Partial<VisualElement>) => {
    setVisualElements(prev => prev.map(el => 
      el.id === elementId ? { ...el, ...updates } : el
    ));
    setHasChanges(true);
  };

  // Delete element
  const deleteElement = (elementId: string) => {
    setVisualElements(prev => prev.filter(el => el.id !== elementId));
    if (selectedElementId === elementId) {
      setSelectedElementId(null);
    }
    setHasChanges(true);
  };

  // Save visual changes
  const handleSave = () => {
    if (!beat || !beat.updateParameters) return;
    
    const params = beat.getParameters ? beat.getParameters() : {};
    
    // Save visual data
    beat.updateParameters({
      ...params,
      visualElements,
      backgroundAssetId,
      node: backgroundAssetId, // For old ASML compatibility
      backgroundSound,
      // Convert to locs format for ASML
      locs: visualElements.map(el => ({
        kind: el.type === 'character' ? 'char' : 
              el.type === 'button' ? 'button' :
              el.type === 'text' ? 'text' :
              el.type === 'hotspot' ? 'hotspot' : 
              el.type === 'prop' ? 'prop' : el.type,
        name: el.name || el.text || '',
        assetId: el.assetId,
        x: Math.round(el.x),
        y: Math.round(el.y),
        z: el.z,
        width: el.width,
        height: el.height,
        rotation: el.rotation,
        scale: el.scale,
        sound: el.sound
      }))
    });
    
    setHasChanges(false);
    
    // Show save confirmation
    const notification = document.createElement('div');
    notification.className = 'fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-50 animate-fade-in';
    notification.textContent = 'Visual changes saved!';
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.classList.add('animate-fade-out');
      setTimeout(() => document.body.removeChild(notification), 300);
    }, 2000);
  };

  if (!beat) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-100">
        <div className="text-center text-gray-500">
          <Info className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-medium mb-2">No Beat Selected</h3>
          <p className="text-sm">Select a visual beat from the flowchart to start editing</p>
        </div>
      </div>
    );
  }

  const selectedElement = visualElements.find(el => el.id === selectedElementId);

  return (
    <div className="h-full flex bg-gray-900">
      {/* Left Panel - Properties (Collapsible) */}
      <div className={`transition-all duration-300 ${showProperties ? 'w-80' : 'w-0'} overflow-hidden`}>
        <div className="w-80 h-full bg-white border-r border-gray-300 flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-800">Visual Properties</h3>
              {hasChanges && (
                <span className="text-xs text-orange-500 font-medium">Unsaved</span>
              )}
            </div>
            <div className="text-sm text-gray-500 mt-1">
              {beat.name} ({beat.type})
            </div>
          </div>

          {/* Properties Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Beat Information */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-700 flex items-center gap-1">
                <FileText className="w-4 h-4" />
                Beat Content
              </h4>
              <div className="bg-gray-50 p-3 rounded-lg">
                <div className="text-sm text-gray-600 whitespace-pre-wrap">
                  {getBeatContent()?.text || getBeatContent()?.title || 'No text content'}
                  {getBeatContent()?.author && (
                    <div className="mt-1 text-xs">by {getBeatContent().author}</div>
                  )}
                  {getBeatContent()?.buttonText && (
                    <div className="mt-2 pt-2 border-t border-gray-200">
                      <span className="text-xs font-medium">Button:</span> {getBeatContent().buttonText}
                    </div>
                  )}
                </div>
                {getBeatContent()?.choices && getBeatContent()!.choices.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-200">
                    <div className="text-xs font-medium text-gray-500 mb-1">Choices:</div>
                    {getBeatContent()!.choices.map((choice: any, i: number) => (
                      <div key={i} className="text-xs text-gray-600 ml-2">
                        • {choice.text}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Background Settings */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-700 flex items-center gap-1">
                <Image className="w-4 h-4" />
                Background
              </h4>
              <button
                onClick={handleBackgroundSelect}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
              >
                {backgroundAssetId ? 'Change Background' : 'Choose Background'}
              </button>
              {backgroundAssetId && (
                <div className="text-xs text-gray-500">
                  Current: {assets.find(a => a.id === backgroundAssetId)?.name || backgroundAssetId}
                </div>
              )}
            </div>

            {/* Sound Settings */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-700 flex items-center gap-1">
                <Music className="w-4 h-4" />
                Background Sound
              </h4>
              <button
                onClick={handleSoundSelect}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
              >
                {backgroundSound ? 'Change Sound' : 'Add Sound'}
              </button>
            </div>

            {/* Add Elements */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-700 flex items-center gap-1">
                <Plus className="w-4 h-4" />
                Add Elements
              </h4>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => addElement('character')}
                  className="p-2 border border-gray-300 rounded hover:bg-gray-50 text-sm flex items-center justify-center gap-1"
                >
                  <User className="w-4 h-4" />
                  Character
                </button>
                <button
                  onClick={() => addElement('prop')}
                  className="p-2 border border-gray-300 rounded hover:bg-gray-50 text-sm flex items-center justify-center gap-1"
                >
                  <Package className="w-4 h-4" />
                  Prop
                </button>
                <button
                  onClick={() => addElement('hotspot')}
                  className="p-2 border border-gray-300 rounded hover:bg-gray-50 text-sm"
                >
                  <Square className="w-4 h-4 inline mr-1" />
                  Hotspot
                </button>
                <button
                  onClick={() => addElement('text')}
                  className="p-2 border border-gray-300 rounded hover:bg-gray-50 text-sm"
                >
                  <Type className="w-4 h-4 inline mr-1" />
                  Text
                </button>
              </div>
            </div>

            {/* Layers */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-700 flex items-center gap-1">
                <Layers className="w-4 h-4" />
                Layers ({visualElements.length})
              </h4>
              <div className="space-y-1 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-2">
                {[...visualElements].reverse().map(element => (
                  <div 
                    key={element.id}
                    className={`flex items-center gap-2 p-1 rounded cursor-pointer text-xs ${
                      selectedElementId === element.id ? 'bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                    onClick={() => setSelectedElementId(element.id)}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        updateElement(element.id, { visible: !element.visible });
                      }}
                      className="p-0.5 hover:bg-gray-200 rounded"
                    >
                      {element.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        updateElement(element.id, { locked: !element.locked });
                      }}
                      className="p-0.5 hover:bg-gray-200 rounded"
                    >
                      {element.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                    </button>
                    <span className="flex-1 truncate">
                      {element.name || element.text || 'Unnamed'}
                    </span>
                    <span className="text-gray-400">z:{element.z}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteElement(element.id);
                      }}
                      className="p-0.5 hover:bg-red-100 rounded text-red-500"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {visualElements.length === 0 && (
                  <div className="text-center text-gray-400 py-2">
                    No elements added
                  </div>
                )}
              </div>
            </div>

            {/* Selected Element Properties */}
            {selectedElement && (
              <div className="space-y-2 p-3 bg-blue-50 rounded-lg">
                <h4 className="text-sm font-medium text-blue-900">
                  {selectedElement.name || 'Selected Element'}
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-600">X</label>
                    <input
                      type="number"
                      value={Math.round(selectedElement.x)}
                      onChange={(e) => updateElement(selectedElement.id, { x: parseInt(e.target.value) })}
                      className="w-full px-2 py-1 text-xs border rounded"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Y</label>
                    <input
                      type="number"
                      value={Math.round(selectedElement.y)}
                      onChange={(e) => updateElement(selectedElement.id, { y: parseInt(e.target.value) })}
                      className="w-full px-2 py-1 text-xs border rounded"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Width</label>
                    <input
                      type="number"
                      value={Math.round(selectedElement.width)}
                      onChange={(e) => updateElement(selectedElement.id, { width: parseInt(e.target.value) })}
                      className="w-full px-2 py-1 text-xs border rounded"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Height</label>
                    <input
                      type="number"
                      value={Math.round(selectedElement.height)}
                      onChange={(e) => updateElement(selectedElement.id, { height: parseInt(e.target.value) })}
                      className="w-full px-2 py-1 text-xs border rounded"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Save Button */}
          <div className="p-4 border-t border-gray-200">
            <button
              onClick={handleSave}
              disabled={!hasChanges}
              className={`w-full py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 ${
                hasChanges 
                  ? 'bg-blue-500 text-white hover:bg-blue-600' 
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              <Save className="w-4 h-4" />
              Save Visual Changes
            </button>
          </div>
        </div>
      </div>

      {/* Toggle Properties Panel Button */}
      <button
        onClick={() => setShowProperties(!showProperties)}
        className="absolute left-0 top-1/2 -translate-y-1/2 z-10 p-2 bg-white border border-gray-300 rounded-r-lg shadow-md hover:bg-gray-50 transition-all"
        style={{ left: showProperties ? '320px' : '0px' }}
      >
        {showProperties ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>

      {/* Main Visual Editor */}
      <div className="flex-1">
        <VisualBeatEditor
          backgroundAssetId={backgroundAssetId}
          backgroundSound={backgroundSound}
          elements={visualElements}
          onElementsChange={(elements) => {
            setVisualElements(elements);
            setHasChanges(true);
          }}
          assets={assets}
          onSelectAsset={handleAssetSelection}
          beatContent={getBeatContent()}
          beatType={beat.type}
        />
      </div>

      {/* Asset Selection Modal */}
      <AssetSelectionModal
        isOpen={assetModal.isOpen}
        onClose={() => setAssetModal({ isOpen: false, type: null, callback: null })}
        onSelect={handleAssetSelected}
        assets={assets}
        onAssetAdd={onAssetAdd!}
        onAssetRemove={onAssetRemove!}
        onAssetUpdate={onAssetUpdate!}
        assetType={assetModal.type === 'sound' ? 'audio' : 'image'}
        assetSubType={assetModal.type === 'sound' ? 'sfx' : assetModal.type ?? undefined}
        title={`Select ${assetModal.type || 'Asset'}`}
      />
    </div>
  );
};
EOF

echo "✅ Enhanced VisualWorkspace.tsx created!"
echo ""
echo "Key improvements:"
echo "1. ✅ Proper asset selection modal for backgrounds and sounds"
echo "2. ✅ Auto-adds beat-specific elements (Start button for titleScreen)"
echo "3. ✅ Saves visual data to beat parameters"
echo "4. ✅ Consolidated all visual controls in one place"
echo "5. ✅ Layer management with visibility/lock controls"
echo "6. ✅ Selected element properties editing"
echo "7. ✅ Collapsible properties panel"
echo ""
echo "Next: Update the ASML generator to export visual elements..."
