#!/bin/bash

echo "🎨 Creating Graphical Beat Editor..."
echo ""

# Create the Visual Beat Editor component
cat > packages/builder/src/components/visual/VisualBeatEditor.tsx << 'EOF'
import React, { useState, useRef, useEffect } from 'react';
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
  RotateCw
} from 'lucide-react';
import type { Asset } from '../assets/AssetManager';

export interface VisualElement {
  id: string;
  type: 'character' | 'prop' | 'text' | 'hotspot';
  assetId?: string;
  text?: string;
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
}

interface VisualBeatEditorProps {
  backgroundAssetId?: string;
  elements: VisualElement[];
  onElementsChange: (elements: VisualElement[]) => void;
  assets: Asset[];
  onSelectAsset?: (assetType: 'background' | 'character' | 'prop') => void;
}

export const VisualBeatEditor: React.FC<VisualBeatEditorProps> = ({
  backgroundAssetId,
  elements = [],
  onElementsChange,
  assets,
  onSelectAsset
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [draggedElement, setDraggedElement] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [showGrid, setShowGrid] = useState(true);
  const [tool, setTool] = useState<'select' | 'hotspot' | 'text'>('select');

  const backgroundAsset = assets.find(a => a.id === backgroundAssetId);

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

    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setDraggedElement(elementId);
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
    e.preventDefault();
  };

  // Handle element drag
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!draggedElement || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - dragOffset.x) / zoom;
    const y = (e.clientY - rect.top - dragOffset.y) / zoom;

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
      width: type === 'hotspot' ? 100 : 150,
      height: type === 'hotspot' ? 100 : 150,
      rotation: 0,
      scale: 1,
      visible: true,
      locked: false,
      name: `${type} ${elements.length + 1}`,
      text: type === 'text' ? 'New Text' : undefined
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
      {/* Canvas Area */}
      <div className="flex-1 bg-gray-100 relative overflow-hidden">
        {/* Toolbar */}
        <div className="absolute top-4 left-4 z-10 bg-white rounded-lg shadow-lg p-2 flex gap-2">
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
            onClick={() => setZoom(Math.max(0.5, zoom - 0.1))}
            className="p-2 rounded hover:bg-gray-100"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="px-2 py-2 text-sm">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setZoom(Math.min(2, zoom + 0.1))}
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

        {/* Canvas */}
        <div 
          ref={canvasRef}
          className="absolute inset-0 overflow-auto"
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
            } else if (e.target === e.currentTarget) {
              setSelectedElement(null);
            }
          }}
        >
          <div 
            className="relative"
            style={{
              width: '800px',
              height: '600px',
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
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
                className="absolute inset-0 w-full h-full object-cover"
                style={{ pointerEvents: 'none' }}
              />
            )}
            
            {!backgroundAsset && (
              <div 
                className="absolute inset-0 flex items-center justify-center bg-gray-200 cursor-pointer"
                onClick={() => onSelectAsset?.('background')}
              >
                <div className="text-center text-gray-500">
                  <ImageIcon className="w-12 h-12 mx-auto mb-2" />
                  <p>Click to add background</p>
                </div>
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
                    className={`absolute border-2 ${
                      selectedElement === element.id 
                        ? 'border-blue-500' 
                        : 'border-transparent hover:border-gray-400'
                    } ${element.locked ? 'cursor-not-allowed' : 'cursor-move'}`}
                    style={{
                      left: `${element.x}px`,
                      top: `${element.y}px`,
                      width: `${element.width}px`,
                      height: `${element.height}px`,
                      transform: `rotate(${element.rotation}deg) scale(${element.scale})`,
                      opacity: element.visible ? 1 : 0.5,
                      zIndex: element.z,
                    }}
                    onClick={(e) => handleElementClick(element.id, e)}
                    onMouseDown={(e) => handleMouseDown(element.id, e)}
                  >
                    {element.type === 'hotspot' && (
                      <div className="w-full h-full bg-yellow-300 bg-opacity-30 border-2 border-yellow-500 rounded flex items-center justify-center">
                        <span className="text-xs font-medium bg-yellow-500 text-white px-2 py-1 rounded">
                          {element.name}
                        </span>
                      </div>
                    )}
                    
                    {element.type === 'text' && (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-lg" style={{ userSelect: 'none' }}>
                          {element.text}
                        </span>
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
      <div className="w-80 bg-white border-l border-gray-200 p-4 overflow-y-auto">
        <h3 className="font-semibold mb-4">Visual Editor</h3>
        
        {/* Add Elements */}
        <div className="mb-6">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Add Elements</h4>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onSelectAsset?.('character')}
              className="p-2 border border-gray-300 rounded hover:bg-gray-50 text-sm"
            >
              Add Character
            </button>
            <button
              onClick={() => onSelectAsset?.('prop')}
              className="p-2 border border-gray-300 rounded hover:bg-gray-50 text-sm"
            >
              Add Prop
            </button>
            <button
              onClick={() => addElement('hotspot')}
              className="p-2 border border-gray-300 rounded hover:bg-gray-50 text-sm"
            >
              Add Hotspot
            </button>
            <button
              onClick={() => addElement('text')}
              className="p-2 border border-gray-300 rounded hover:bg-gray-50 text-sm"
            >
              Add Text
            </button>
          </div>
        </div>

        {/* Layers */}
        <div className="mb-6">
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
              </div>
            ))}
          </div>
        </div>

        {/* Selected Element Properties */}
        {selectedElementData && (
          <div className="space-y-4">
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
  );
};
EOF

echo "✅ Created VisualBeatEditor component"

echo ""
echo "✨ Graphical Beat Editor created!"
echo ""
echo "The Visual Beat Editor includes:"
echo "1. ✅ Background image placement"
echo "2. ✅ Character and prop positioning with drag & drop"
echo "3. ✅ Hotspot creation and naming"
echo "4. ✅ Text overlay support"
echo "5. ✅ Layer management (z-index)"
echo "6. ✅ Transform controls (position, rotation, scale)"
echo "7. ✅ Zoom and grid controls"
echo "8. ✅ Lock/unlock and visibility toggles"
echo ""
echo "Next steps:"
echo "- Integrate VisualBeatEditor into beat types that need it"
echo "- Add animation path support"
echo "- Export visual layout to ASML"
