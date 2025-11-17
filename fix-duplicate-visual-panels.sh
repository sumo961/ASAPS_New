#!/bin/bash

# Fix Duplicate Visual Panels
# This script removes the duplicate visual editor panel on the right side

echo "🔧 Fixing duplicate visual panels..."
echo ""
echo "Problem: Two visual panels exist - 'Visual Properties' on left and 'Visual Editor' on right"
echo "Solution: Remove right panel from VisualBeatEditor, keep everything in left VisualWorkspace panel"
echo ""

# Create a cleaned VisualBeatEditor without the right-side panel
cat > packages/builder/src/components/visual/VisualBeatEditor-cleaned.tsx << 'EOF'
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
  type: 'character' | 'prop' | 'text' | 'hotspot' | 'dialog' | 'button';
  assetId?: string;
  text?: string;
  speaker?: string;
  choices?: string[];
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
  sound?: string;
}

interface VisualBeatEditorProps {
  backgroundAssetId?: string;
  backgroundSound?: string;
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
  selectedElement?: string | null;
  onSelectElement?: (elementId: string | null) => void;
}

export const VisualBeatEditor: React.FC<VisualBeatEditorProps> = ({
  backgroundAssetId,
  backgroundSound,
  elements = [],
  onElementsChange,
  assets,
  onSelectAsset,
  beatContent,
  beatType,
  selectedElement,
  onSelectElement
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [draggedElement, setDraggedElement] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [showGrid, setShowGrid] = useState(true);
  const [tool, setTool] = useState<'select' | 'hotspot' | 'text'>('select');
  const [canvasSize, setCanvasSize] = useState({ width: 1280, height: 720 });

  const backgroundAsset = assets.find(a => a.id === backgroundAssetId);

  // Update canvas size based on container
  useEffect(() => {
    const updateCanvasSize = () => {
      if (canvasRef.current) {
        const container = canvasRef.current.parentElement;
        if (container) {
          const rect = container.getBoundingClientRect();
          setCanvasSize({
            width: Math.max(1024, rect.width - 40),
            height: Math.max(576, rect.height - 100)
          });
        }
      }
    };

    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    return () => window.removeEventListener('resize', updateCanvasSize);
  }, []);

  // Handle element selection
  const handleElementClick = (elementId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const element = elements.find(el => el.id === elementId);
    if (!element?.locked) {
      onSelectElement?.(elementId);
    }
  };

  // Handle element drag
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

  const handleMouseUp = () => {
    setDraggedElement(null);
  };

  // Add new element at click position
  const addElement = (type: VisualElement['type'], x: number, y: number) => {
    const newElement: VisualElement = {
      id: `element_${Date.now()}`,
      type,
      x,
      y,
      z: elements.length,
      width: type === 'hotspot' ? 100 : type === 'text' ? 200 : 150,
      height: type === 'hotspot' ? 100 : type === 'text' ? 40 : 150,
      rotation: 0,
      scale: 1,
      visible: true,
      locked: false,
      name: `${type} ${elements.length + 1}`,
      text: type === 'text' ? 'New Text' : undefined
    };
    onElementsChange([...elements, newElement]);
    onSelectElement?.(newElement.id);
  };

  return (
    <div className="h-full bg-gray-100 relative overflow-hidden">
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

      {/* Canvas */}
      <div 
        ref={canvasRef}
        className="relative w-full h-full flex items-center justify-center overflow-auto"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={(e) => {
          if (tool === 'hotspot' || tool === 'text') {
            const rect = canvasRef.current!.getBoundingClientRect();
            const x = (e.clientX - rect.left) / zoom;
            const y = (e.clientY - rect.top) / zoom;
            addElement(tool, x - (tool === 'hotspot' ? 50 : 100), y - (tool === 'hotspot' ? 50 : 20));
            setTool('select');
          } else if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('stage-area')) {
            onSelectElement?.(null);
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

          {/* Render Elements */}
          {elements
            .sort((a, b) => a.z - b.z)
            .map(element => {
              const asset = element.assetId ? assets.find(a => a.id === element.assetId) : null;
              const isSelected = selectedElement === element.id;
              
              return (
                <div
                  key={element.id}
                  className={`absolute ${
                    isSelected 
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
                  {/* Sound indicator */}
                  {element.sound && (
                    <Volume2 className="absolute -top-6 left-0 w-4 h-4 text-blue-500" />
                  )}
                  
                  {/* Render based on type */}
                  {element.type === 'hotspot' && (
                    <div className="w-full h-full bg-yellow-300 bg-opacity-30 border-2 border-yellow-500 rounded flex items-center justify-center">
                      <span className="text-xs font-bold bg-yellow-500 text-white px-2 py-1 rounded">
                        {element.name}
                      </span>
                    </div>
                  )}
                  
                  {element.type === 'text' && (
                    <div className="w-full h-full flex items-center justify-center bg-white bg-opacity-90 rounded px-2">
                      <span className="text-lg font-medium select-none">
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
                  
                  {element.type === 'button' && (
                    <div className="w-full h-full bg-gradient-to-b from-blue-500 to-blue-600 text-white rounded-lg flex items-center justify-center shadow-md hover:shadow-lg transition-shadow cursor-pointer border border-blue-700">
                      <span className="font-medium text-lg select-none">
                        {element.text || element.name || 'Button'}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
};
EOF

echo "✅ Created cleaned VisualBeatEditor without right-side properties panel"
echo ""

# Now update the VisualWorkspace to pass selected element to VisualBeatEditor
echo "📝 Updating VisualWorkspace to control element selection..."

cat > packages/builder/src/components/visual/VisualWorkspace-unified.tsx << 'EOF'
/**
 * Visual Workspace Component
 * Unified visual editor with single properties panel
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Beat } from '@asaps/core';
import { VisualBeatEditor, VisualElement } from './VisualBeatEditor';
import { AssetSelectionModal } from '../assets/AssetSelectionModal';
import type { Asset } from '../assets/AssetManager';
import { 
  Info, Save, Settings, Layers, Image, Music, FileText, 
  User, Package, Square, Type, Plus, Eye, EyeOff, Lock, 
  Unlock, Trash2, ChevronLeft, ChevronRight, Volume2
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
        x: 512 - 100,
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

  // Move element layer
  const moveElementLayer = (elementId: string, direction: 'up' | 'down') => {
    const elementIndex = visualElements.findIndex(el => el.id === elementId);
    if (elementIndex === -1) return;

    const newElements = [...visualElements];
    const element = newElements[elementIndex];

    if (direction === 'up' && elementIndex < visualElements.length - 1) {
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

    setVisualElements(newElements);
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
      {/* Left Panel - All Visual Properties Consolidated Here */}
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

          {/* Properties Content - Scrollable */}
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

            {/* Layers - Complete Layer Management Here */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-700 flex items-center gap-1">
                <Layers className="w-4 h-4" />
                Layers ({visualElements.length})
              </h4>
              <div className="space-y-1 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-2">
                {[...visualElements].reverse().map(element => (
                  <div 
                    key={element.id}
                    className={`flex items-center gap-1 p-1 rounded cursor-pointer text-xs ${
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
                    <span className="text-gray-400 text-[10px]">z:{element.z}</span>
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

            {/* Properties for Selected Element */}
            {selectedElement && (
              <div className="space-y-2 p-3 bg-blue-50 rounded-lg">
                <h4 className="text-sm font-medium text-blue-900">
                  Properties
                </h4>
                
                <div>
                  <label className="text-xs text-gray-600">Name</label>
                  <input
                    type="text"
                    value={selectedElement.name}
                    onChange={(e) => updateElement(selectedElement.id, { name: e.target.value })}
                    className="w-full px-2 py-1 text-xs border rounded"
                  />
                </div>

                {selectedElement.type === 'text' && (
                  <div>
                    <label className="text-xs text-gray-600">Text</label>
                    <textarea
                      value={selectedElement.text}
                      onChange={(e) => updateElement(selectedElement.id, { text: e.target.value })}
                      className="w-full px-2 py-1 text-xs border rounded"
                      rows={2}
                    />
                  </div>
                )}

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

                <div>
                  <label className="text-xs text-gray-600">
                    Rotation ({selectedElement.rotation}°)
                  </label>
                  <input
                    type="range"
                    min="-180"
                    max="180"
                    value={selectedElement.rotation}
                    onChange={(e) => updateElement(selectedElement.id, { rotation: parseInt(e.target.value) })}
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="text-xs text-gray-600">
                    Scale ({(selectedElement.scale * 100).toFixed(0)}%)
                  </label>
                  <input
                    type="range"
                    min="10"
                    max="200"
                    value={selectedElement.scale * 100}
                    onChange={(e) => updateElement(selectedElement.id, { scale: parseInt(e.target.value) / 100 })}
                    className="w-full"
                  />
                </div>

                {(selectedElement.type === 'hotspot' || 
                  selectedElement.type === 'prop' || 
                  selectedElement.type === 'character') && (
                  <div>
                    <label className="text-xs text-gray-600">
                      <Volume2 className="w-3 h-3 inline mr-1" />
                      Click Sound
                    </label>
                    <button
                      onClick={() => handleAssetSelection('sound', (asset) => {
                        updateElement(selectedElement.id, { sound: asset.id });
                      })}
                      className="w-full px-2 py-1 text-xs border rounded hover:bg-gray-50"
                    >
                      {selectedElement.sound ? 'Change Sound' : 'Add Sound'}
                    </button>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => moveElementLayer(selectedElement.id, 'up')}
                    className="flex-1 p-1 text-xs border rounded hover:bg-gray-50"
                  >
                    Move Up
                  </button>
                  <button
                    onClick={() => moveElementLayer(selectedElement.id, 'down')}
                    className="flex-1 p-1 text-xs border rounded hover:bg-gray-50"
                  >
                    Move Down
                  </button>
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

      {/* Main Visual Editor - No more right-side panel! */}
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
          selectedElement={selectedElementId}
          onSelectElement={setSelectedElementId}
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

echo "✅ Created unified VisualWorkspace with all controls in left panel"
echo ""
echo "📝 Summary of changes:"
echo "1. Removed right-side properties panel from VisualBeatEditor"
echo "2. All layer management now in left 'Visual Properties' panel"
echo "3. Selected element properties editing in left panel"
echo "4. Element selection coordinated between panels"
echo "5. Single source of truth for visual controls"
echo ""
echo "✅ Duplicate visual panels issue resolved!"
echo ""
echo "To apply these fixes:"
echo "1. Backup current files"
echo "2. Copy VisualBeatEditor-cleaned.tsx to VisualBeatEditor.tsx"
echo "3. Copy VisualWorkspace-unified.tsx to VisualWorkspace.tsx"
echo "4. Build and test"
