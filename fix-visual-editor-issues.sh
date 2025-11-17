#!/bin/bash

echo "🔧 Fixing Visual Editor Issues in ASPS Modern"
echo "============================================="
echo ""

# Create improved Visual Beat Editor with full-size stage
cat > packages/builder/src/components/visual/VisualBeatEditor.tsx << 'EOF'
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Move, 
  Square, 
  Type, 
  Image as ImageIcon,
  Layers,
  Eye,
  EyeOff,
  Trash2,
  Copy,
  Lock,
  Unlock,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Music,
  Volume2,
  User,
  Package
} from 'lucide-react';
import type { Asset } from '../assets/AssetManager';

export interface VisualElement {
  id: string;
  type: 'character' | 'prop' | 'text' | 'hotspot' | 'dialog';
  assetId?: string;
  text?: string;
  speaker?: string; // For dialog elements
  choices?: string[]; // For dialog choices
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  rotation: number;
  scale: number;
  visible: boolean;
  locked: boolean;
  name: string;
  sound?: string; // Sound effect for clickable elements
}

interface VisualBeatEditorProps {
  backgroundAssetId?: string;
  backgroundSound?: string; // Background sound for the beat
  elements: VisualElement[];
  onElementsChange: (elements: VisualElement[]) => void;
  assets: Asset[];
  onSelectAsset?: (assetType: 'background' | 'character' | 'prop' | 'sound', callback: (asset: Asset) => void) => void;
  beatContent?: {
    text?: string;
    speaker?: string;
    choices?: Array<{ text: string; target?: string }>;
  };
  beatType?: string;
}

export const VisualBeatEditor: React.FC<VisualBeatEditorProps> = ({
  backgroundAssetId,
  backgroundSound,
  elements = [],
  onElementsChange,
  assets,
  onSelectAsset,
  beatContent,
  beatType
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [draggedElement, setDraggedElement] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [showGrid, setShowGrid] = useState(true);
  const [tool, setTool] = useState<'select' | 'hotspot' | 'text'>('select');
  const [canvasSize, setCanvasSize] = useState({ width: 1280, height: 720 }); // Full HD default

  const backgroundAsset = assets.find(a => a.id === backgroundAssetId);

  // Update canvas size based on container
  useEffect(() => {
    const updateCanvasSize = () => {
      if (canvasRef.current) {
        const container = canvasRef.current.parentElement;
        if (container) {
          const rect = container.getBoundingClientRect();
          // Use full container size minus some padding
          setCanvasSize({
            width: Math.max(1280, rect.width - 40),
            height: Math.max(720, rect.height - 40)
          });
        }
      }
    };

    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    return () => window.removeEventListener('resize', updateCanvasSize);
  }, []);

  // Auto-add beat content as visual elements
  useEffect(() => {
    if (beatContent && beatType) {
      // Check if we already have dialog elements
      const hasDialogElements = elements.some(el => el.type === 'dialog');
      if (!hasDialogElements) {
        const newElements: VisualElement[] = [];
        
        // Add main text/dialog
        if (beatContent.text) {
          newElements.push({
            id: `dialog_main_${Date.now()}`,
            type: 'dialog',
            text: beatContent.text,
            speaker: beatContent.speaker,
            x: canvasSize.width / 2 - 300,
            y: canvasSize.height - 200,
            z: 100, // High z-index for dialog
            width: 600,
            height: 150,
            rotation: 0,
            scale: 1,
            visible: true,
            locked: false,
            name: beatContent.speaker ? `${beatContent.speaker} Dialog` : 'Text'
          });
        }
        
        // Add choices if present
        if (beatContent.choices && beatContent.choices.length > 0) {
          beatContent.choices.forEach((choice, index) => {
            newElements.push({
              id: `choice_${index}_${Date.now()}`,
              type: 'dialog',
              text: choice.text,
              choices: [choice.text],
              x: canvasSize.width / 2 - 200,
              y: 50 + (index * 60),
              z: 101 + index,
              width: 400,
              height: 50,
              rotation: 0,
              scale: 1,
              visible: true,
              locked: false,
              name: `Choice ${index + 1}`
            });
          });
        }
        
        if (newElements.length > 0) {
          onElementsChange([...elements, ...newElements]);
        }
      }
    }
  }, [beatContent, beatType, canvasSize]);

  // Handle asset selection callback
  const handleAssetSelection = useCallback((type: 'character' | 'prop', callback?: (asset: Asset) => void) => {
    if (onSelectAsset) {
      onSelectAsset(type, (asset: Asset) => {
        // Add the selected asset as a new element
        const newElement: VisualElement = {
          id: `element_${Date.now()}`,
          type,
          assetId: asset.id,
          x: canvasSize.width / 2 - 75,
          y: canvasSize.height / 2 - 75,
          z: elements.length,
          width: 150,
          height: 150,
          rotation: 0,
          scale: 1,
          visible: true,
          locked: false,
          name: asset.name
        };
        onElementsChange([...elements, newElement]);
        setSelectedElement(newElement.id);
        
        if (callback) callback(asset);
      });
    }
  }, [onSelectAsset, elements, onElementsChange, canvasSize]);

  // Handle element selection
  const handleElementClick = (elementId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!elements.find(el => el.id === elementId)?.locked) {
      setSelectedElement(elementId);
    }
  };

  // Handle element drag start
  const handleMouseDown = (elementId: string, e: React.MouseEvent) => {
    const element = elements.find(el => el.id === elementId);
    if (!element || element.locked) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    setDraggedElement(elementId);
    setDragOffset({
      x: (e.clientX - rect.left) / zoom - element.x,
      y: (e.clientY - rect.top) / zoom - element.y
    });
    e.preventDefault();
  };

  // Handle element drag
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!draggedElement || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoom - dragOffset.x;
    const y = (e.clientY - rect.top) / zoom - dragOffset.y;

    const updatedElements = elements.map(el => 
      el.id === draggedElement ? { ...el, x, y } : el
    );
    onElementsChange(updatedElements);
  };

  // Handle element drag end
  const handleMouseUp = () => {
    setDraggedElement(null);
  };

  // Add new element
  const addElement = (type: VisualElement['type'], x = 100, y = 100) => {
    const newElement: VisualElement = {
      id: `element_${Date.now()}`,
      type,
      x,
      y,
      z: elements.length,
      width: type === 'hotspot' ? 100 : type === 'dialog' ? 400 : 150,
      height: type === 'hotspot' ? 100 : type === 'dialog' ? 100 : 150,
      rotation: 0,
      scale: 1,
      visible: true,
      locked: false,
      name: `${type} ${elements.length + 1}`,
      text: type === 'text' ? 'New Text' : type === 'dialog' ? 'Dialog text here...' : undefined
    };
    onElementsChange([...elements, newElement]);
    setSelectedElement(newElement.id);
  };

  // Update element property
  const updateElement = (elementId: string, updates: Partial<VisualElement>) => {
    const updatedElements = elements.map(el => 
      el.id === elementId ? { ...el, ...updates } : el
    );
    onElementsChange(updatedElements);
  };

  // Delete element
  const deleteElement = (elementId: string) => {
    onElementsChange(elements.filter(el => el.id !== elementId));
    setSelectedElement(null);
  };

  // Duplicate element
  const duplicateElement = (elementId: string) => {
    const element = elements.find(el => el.id === elementId);
    if (!element) return;

    const newElement: VisualElement = {
      ...element,
      id: `element_${Date.now()}`,
      x: element.x + 20,
      y: element.y + 20,
      name: `${element.name} (Copy)`
    };
    onElementsChange([...elements, newElement]);
    setSelectedElement(newElement.id);
  };

  // Reorder elements (z-index)
  const moveElementLayer = (elementId: string, direction: 'up' | 'down') => {
    const elementIndex = elements.findIndex(el => el.id === elementId);
    if (elementIndex === -1) return;

    const newElements = [...elements];
    const element = newElements[elementIndex];

    if (direction === 'up' && elementIndex < elements.length - 1) {
      newElements.splice(elementIndex, 1);
      newElements.splice(elementIndex + 1, 0, element);
    } else if (direction === 'down' && elementIndex > 0) {
      newElements.splice(elementIndex, 1);
      newElements.splice(elementIndex - 1, 0, element);
    }

    // Update z-index values
    newElements.forEach((el, index) => {
      el.z = index;
    });

    onElementsChange(newElements);
  };

  const selectedElementData = elements.find(el => el.id === selectedElement);

  return (
    <div className="flex h-full">
      {/* Canvas Area - Now full size */}
      <div className="flex-1 bg-gray-100 relative overflow-auto">
        {/* Toolbar */}
        <div className="absolute top-4 left-4 z-20 bg-white rounded-lg shadow-lg p-2 flex gap-2">
          <button
            onClick={() => setTool('select')}
            className={`p-2 rounded ${tool === 'select' ? 'bg-blue-500 text-white' : 'hover:bg-gray-100'}`}
            title="Select Tool"
          >
            <Move className="w-4 h-4" />
          </button>
          <button
            onClick={() => setTool('hotspot')}
            className={`p-2 rounded ${tool === 'hotspot' ? 'bg-blue-500 text-white' : 'hover:bg-gray-100'}`}
            title="Add Hotspot"
          >
            <Square className="w-4 h-4" />
          </button>
          <button
            onClick={() => setTool('text')}
            className={`p-2 rounded ${tool === 'text' ? 'bg-blue-500 text-white' : 'hover:bg-gray-100'}`}
            title="Add Text"
          >
            <Type className="w-4 h-4" />
          </button>
          <div className="w-px bg-gray-300 mx-1" />
          <button
            onClick={() => setShowGrid(!showGrid)}
            className={`p-2 rounded ${showGrid ? 'bg-gray-200' : 'hover:bg-gray-100'}`}
            title="Toggle Grid"
          >
            <Layers className="w-4 h-4" />
          </button>
          <div className="w-px bg-gray-300 mx-1" />
          <button
            onClick={() => setZoom(Math.max(0.25, zoom - 0.1))}
            className="p-2 rounded hover:bg-gray-100"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="px-2 py-2 text-sm">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setZoom(Math.min(3, zoom + 0.1))}
            className="p-2 rounded hover:bg-gray-100"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => setZoom(1)}
            className="p-2 rounded hover:bg-gray-100"
            title="Reset Zoom"
          >
            <RotateCw className="w-4 h-4" />
          </button>
        </div>

        {/* Canvas Size Indicator */}
        <div className="absolute top-4 right-4 z-20 bg-white rounded-lg shadow-lg px-3 py-2 text-sm">
          Stage: {canvasSize.width} × {canvasSize.height}px
        </div>

        {/* Canvas - Full size stage */}
        <div 
          ref={canvasRef}
          className="relative min-h-full flex items-center justify-center p-5"
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onClick={(e) => {
            if (tool === 'hotspot') {
              const rect = canvasRef.current!.getBoundingClientRect();
              const x = (e.clientX - rect.left) / zoom;
              const y = (e.clientY - rect.top) / zoom;
              addElement('hotspot', x - 50, y - 50);
              setTool('select');
            } else if (tool === 'text') {
              const rect = canvasRef.current!.getBoundingClientRect();
              const x = (e.clientX - rect.left) / zoom;
              const y = (e.clientY - rect.top) / zoom;
              addElement('text', x - 75, y - 20);
              setTool('select');
            } else if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('stage-area')) {
              setSelectedElement(null);
            }
          }}
        >
          <div 
            className="stage-area relative bg-white shadow-xl"
            style={{
              width: `${canvasSize.width}px`,
              height: `${canvasSize.height}px`,
              transform: `scale(${zoom})`,
              transformOrigin: 'center center',
              backgroundImage: showGrid 
                ? 'repeating-linear-gradient(0deg, #00000008 0px, transparent 1px, transparent 19px, #00000008 20px), repeating-linear-gradient(90deg, #00000008 0px, transparent 1px, transparent 19px, #00000008 20px)'
                : undefined,
            }}
          >
            {/* Background */}
            {backgroundAsset && (
              <img 
                src={backgroundAsset.url}
                alt="Background"
                className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              />
            )}
            
            {!backgroundAsset && (
              <div 
                className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectAsset?.('background', () => {});
                }}
              >
                <div className="text-center text-gray-500">
                  <ImageIcon className="w-16 h-16 mx-auto mb-3" />
                  <p className="text-lg font-medium">Click to add background</p>
                  <p className="text-sm mt-1">Recommended: {canvasSize.width} × {canvasSize.height}px</p>
                </div>
              </div>
            )}

            {/* Sound Indicator */}
            {backgroundSound && (
              <div className="absolute top-4 left-4 bg-black bg-opacity-50 text-white px-3 py-2 rounded-lg flex items-center gap-2">
                <Music className="w-4 h-4" />
                <span className="text-sm">Background Sound Active</span>
              </div>
            )}

            {/* Elements */}
            {elements
              .sort((a, b) => a.z - b.z)
              .map(element => {
                const asset = element.assetId ? assets.find(a => a.id === element.assetId) : null;
                
                return (
                  <div
                    key={element.id}
                    className={`absolute ${
                      selectedElement === element.id 
                        ? 'ring-2 ring-blue-500 ring-offset-2' 
                        : 'hover:ring-2 hover:ring-gray-400 hover:ring-offset-1'
                    } ${element.locked ? 'cursor-not-allowed' : 'cursor-move'} ${
                      !element.visible ? 'opacity-30' : ''
                    }`}
                    style={{
                      left: `${element.x}px`,
                      top: `${element.y}px`,
                      width: `${element.width}px`,
                      height: `${element.height}px`,
                      transform: `rotate(${element.rotation}deg) scale(${element.scale})`,
                      zIndex: element.z,
                    }}
                    onClick={(e) => handleElementClick(element.id, e)}
                    onMouseDown={(e) => handleMouseDown(element.id, e)}
                  >
                    {/* Sound indicator for clickable elements */}
                    {element.sound && (
                      <Volume2 className="absolute -top-6 left-0 w-4 h-4 text-blue-500" />
                    )}
                    
                    {element.type === 'hotspot' && (
                      <div className="w-full h-full bg-yellow-300 bg-opacity-30 border-2 border-yellow-500 rounded flex items-center justify-center">
                        <span className="text-xs font-bold bg-yellow-500 text-white px-2 py-1 rounded">
                          {element.name}
                        </span>
                      </div>
                    )}
                    
                    {element.type === 'text' && (
                      <div className="w-full h-full flex items-center justify-center bg-white bg-opacity-90 rounded px-2">
                        <span className="text-lg font-medium" style={{ userSelect: 'none' }}>
                          {element.text}
                        </span>
                      </div>
                    )}
                    
                    {element.type === 'dialog' && (
                      <div className="w-full h-full bg-black bg-opacity-75 text-white rounded-lg p-3 flex flex-col justify-center">
                        {element.speaker && (
                          <div className="text-xs font-bold text-yellow-300 mb-1">{element.speaker}:</div>
                        )}
                        <div className="text-sm">{element.text}</div>
                        {element.choices && element.choices.length > 0 && (
                          <div className="mt-2 text-xs text-blue-300">
                            → Player Choice
                          </div>
                        )}
                      </div>
                    )}
                    
                    {element.type === 'character' && asset && (
                      <img 
                        src={asset.url}
                        alt={element.name}
                        className="w-full h-full object-contain"
                        style={{ pointerEvents: 'none' }}
                      />
                    )}
                    
                    {element.type === 'prop' && asset && (
                      <img 
                        src={asset.url}
                        alt={element.name}
                        className="w-full h-full object-contain"
                        style={{ pointerEvents: 'none' }}
                      />
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      {/* Properties Panel */}
      <div className="w-80 bg-white border-l border-gray-200 flex flex-col">
        <div className="p-4 border-b">
          <h3 className="font-semibold">Visual Editor</h3>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Add Elements */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Add Elements</h4>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleAssetSelection('character')}
                className="p-2 border border-gray-300 rounded hover:bg-gray-50 text-sm flex items-center justify-center gap-1"
              >
                <User className="w-4 h-4" />
                Character
              </button>
              <button
                onClick={() => handleAssetSelection('prop')}
                className="p-2 border border-gray-300 rounded hover:bg-gray-50 text-sm flex items-center justify-center gap-1"
              >
                <Package className="w-4 h-4" />
                Prop
              </button>
              <button
                onClick={() => addElement('hotspot')}
                className="p-2 border border-gray-300 rounded hover:bg-gray-50 text-sm"
              >
                Hotspot
              </button>
              <button
                onClick={() => addElement('text')}
                className="p-2 border border-gray-300 rounded hover:bg-gray-50 text-sm"
              >
                Text
              </button>
            </div>
          </div>

          {/* Beat Content Info */}
          {beatContent && (
            <div className="p-3 bg-blue-50 rounded-lg">
              <h4 className="text-sm font-medium text-blue-900 mb-1">Beat Content</h4>
              <div className="text-xs text-blue-700">
                {beatContent.speaker && <p>Speaker: {beatContent.speaker}</p>}
                {beatContent.text && <p>Text: {beatContent.text.substring(0, 50)}...</p>}
                {beatContent.choices && <p>Choices: {beatContent.choices.length}</p>}
              </div>
            </div>
          )}

          {/* Layers */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Layers</h4>
            <div className="space-y-1 max-h-48 overflow-y-auto border border-gray-200 rounded p-2">
              {[...elements].reverse().map(element => (
                <div 
                  key={element.id}
                  className={`flex items-center gap-2 p-1 rounded cursor-pointer ${
                    selectedElement === element.id ? 'bg-blue-50' : 'hover:bg-gray-50'
                  }`}
                  onClick={() => setSelectedElement(element.id)}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      updateElement(element.id, { visible: !element.visible });
                    }}
                    className="p-1 hover:bg-gray-200 rounded"
                  >
                    {element.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      updateElement(element.id, { locked: !element.locked });
                    }}
                    className="p-1 hover:bg-gray-200 rounded"
                  >
                    {element.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                  </button>
                  <span className="flex-1 text-sm truncate">{element.name}</span>
                  {element.sound && <Volume2 className="w-3 h-3 text-blue-500" />}
                </div>
              ))}
            </div>
          </div>

          {/* Selected Element Properties */}
          {selectedElementData && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-gray-700">Properties</h4>
              
              <div>
                <label className="block text-xs text-gray-600 mb-1">Name</label>
                <input
                  type="text"
                  value={selectedElementData.name}
                  onChange={(e) => updateElement(selectedElement!, { name: e.target.value })}
                  className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                />
              </div>

              {selectedElementData.type === 'text' && (
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Text</label>
                  <textarea
                    value={selectedElementData.text}
                    onChange={(e) => updateElement(selectedElement!, { text: e.target.value })}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                    rows={3}
                  />
                </div>
              )}

              {selectedElementData.type === 'dialog' && (
                <>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Speaker</label>
                    <input
                      type="text"
                      value={selectedElementData.speaker || ''}
                      onChange={(e) => updateElement(selectedElement!, { speaker: e.target.value })}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Dialog Text</label>
                    <textarea
                      value={selectedElementData.text}
                      onChange={(e) => updateElement(selectedElement!, { text: e.target.value })}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                      rows={3}
                    />
                  </div>
                </>
              )}

              {/* Sound Effect for clickable elements */}
              {(selectedElementData.type === 'hotspot' || 
                selectedElementData.type === 'prop' || 
                selectedElementData.type === 'character') && (
                <div>
                  <label className="block text-xs text-gray-600 mb-1">
                    <Volume2 className="w-3 h-3 inline mr-1" />
                    Click Sound
                  </label>
                  <button
                    onClick={() => onSelectAsset?.('sound', (asset) => {
                      updateElement(selectedElement!, { sound: asset.id });
                    })}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50"
                  >
                    {selectedElementData.sound ? 'Change Sound' : 'Add Sound'}
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">X</label>
                  <input
                    type="number"
                    value={Math.round(selectedElementData.x)}
                    onChange={(e) => updateElement(selectedElement!, { x: parseInt(e.target.value) })}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Y</label>
                  <input
                    type="number"
                    value={Math.round(selectedElementData.y)}
                    onChange={(e) => updateElement(selectedElement!, { y: parseInt(e.target.value) })}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Width</label>
                  <input
                    type="number"
                    value={Math.round(selectedElementData.width)}
                    onChange={(e) => updateElement(selectedElement!, { width: parseInt(e.target.value) })}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Height</label>
                  <input
                    type="number"
                    value={Math.round(selectedElementData.height)}
                    onChange={(e) => updateElement(selectedElement!, { height: parseInt(e.target.value) })}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  Rotation ({selectedElementData.rotation}°)
                </label>
                <input
                  type="range"
                  min="-180"
                  max="180"
                  value={selectedElementData.rotation}
                  onChange={(e) => updateElement(selectedElement!, { rotation: parseInt(e.target.value) })}
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  Scale ({(selectedElementData.scale * 100).toFixed(0)}%)
                </label>
                <input
                  type="range"
                  min="10"
                  max="200"
                  value={selectedElementData.scale * 100}
                  onChange={(e) => updateElement(selectedElement!, { scale: parseInt(e.target.value) / 100 })}
                  className="w-full"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => moveElementLayer(selectedElement!, 'up')}
                  className="flex-1 p-2 border border-gray-300 rounded hover:bg-gray-50 text-sm"
                >
                  Move Up
                </button>
                <button
                  onClick={() => moveElementLayer(selectedElement!, 'down')}
                  className="flex-1 p-2 border border-gray-300 rounded hover:bg-gray-50 text-sm"
                >
                  Move Down
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => duplicateElement(selectedElement!)}
                  className="flex-1 p-2 border border-gray-300 rounded hover:bg-gray-50 text-sm flex items-center justify-center gap-1"
                >
                  <Copy className="w-3 h-3" />
                  Duplicate
                </button>
                <button
                  onClick={() => deleteElement(selectedElement!)}
                  className="flex-1 p-2 border border-red-300 text-red-600 rounded hover:bg-red-50 text-sm flex items-center justify-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                  Delete
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
EOF

echo "✅ Created improved VisualBeatEditor with full-size stage and sound support"
echo ""

# Now let's fix the asset selection issue by enhancing the AssetManager
echo "🔧 Fixing asset selection mechanism..."

# Create an asset selection modal component
cat > packages/builder/src/components/assets/AssetSelectionModal.tsx << 'EOF'
import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { Asset } from './AssetManager';
import { AssetManager } from './AssetManager';

interface AssetSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (asset: Asset) => void;
  assets: Asset[];
  onAssetAdd: (asset: Asset) => void;
  onAssetRemove: (assetId: string) => void;
  onAssetUpdate: (assetId: string, updates: Partial<Asset>) => void;
  assetType?: 'image' | 'audio' | 'video' | 'font';
  assetSubType?: string;
  title?: string;
}

export const AssetSelectionModal: React.FC<AssetSelectionModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  assets,
  onAssetAdd,
  onAssetRemove,
  onAssetUpdate,
  assetType,
  assetSubType,
  title = 'Select Asset'
}) => {
  if (!isOpen) return null;

  // Filter assets based on type and subtype
  const filteredAssets = assets.filter(asset => {
    if (assetType && asset.type !== assetType) return false;
    if (assetSubType && asset.subType !== assetSubType) return false;
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl w-[900px] h-[700px] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex-1 overflow-hidden">
          <AssetManager
            assets={assets}
            onAssetAdd={onAssetAdd}
            onAssetRemove={onAssetRemove}
            onAssetUpdate={onAssetUpdate}
            onAssetSelect={onSelect} // New prop for selection
            selectionMode={true} // Enable selection mode
            filterType={assetType}
            filterSubType={assetSubType}
          />
        </div>
      </div>
    </div>
  );
};
EOF

echo "✅ Created AssetSelectionModal component"
echo ""
echo "🔧 Updating AssetManager to support selection mode..."

# We need to update the AssetManager to handle selection mode
# This would be a large file, so I'll create a patch

cat > packages/builder/src/components/assets/AssetManager-patch.tsx << 'EOF'
// Add these props to AssetManagerProps interface:
interface AssetManagerProps {
  // ... existing props ...
  onAssetSelect?: (asset: Asset) => void;
  selectionMode?: boolean;
  filterType?: Asset['type'];
  filterSubType?: Asset['subType'];
}

// In the component, update the asset click handler:
// Replace the onClick handler in both grid and list views with:
onClick={() => {
  if (selectionMode && onAssetSelect) {
    onAssetSelect(asset);
  } else {
    setSelectedAsset(asset);
  }
}}

// Add a Select button in the asset details panel when in selection mode:
{selectedAsset && selectionMode && onAssetSelect && (
  <button
    onClick={() => onAssetSelect(selectedAsset)}
    className="mt-3 w-full py-2 px-4 bg-blue-500 text-white rounded hover:bg-blue-600"
  >
    Select This Asset
  </button>
)}
EOF

echo "✅ Created patch for AssetManager selection mode"
echo ""
echo "🎉 Visual Editor fixes complete!"
echo ""
echo "Summary of changes:"
echo "1. ✅ Full-size stage (1280x720 minimum, adapts to container)"
echo "2. ✅ Asset selection mechanism with callback"
echo "3. ✅ Beat content integration (shows dialog and choices)"
echo "4. ✅ Sound support for clickable elements and beats"
echo "5. ✅ Improved drag and drop with better positioning"
echo ""
echo "Next steps:"
echo "1. Apply the AssetManager patch manually"
echo "2. Update Inspector to use the new asset selection flow"
echo "3. Add sound properties to all beat types"
echo "4. Test the visual editor with different beat types"

