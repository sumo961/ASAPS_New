/**
 * Enhanced Visual Editor Component
 * Unified, responsive visual editor with proper saving and ASML support
 */

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
  Maximize2,
  Music,
  Volume2,
  User,
  Package,
  Save,
  Hand,
  MousePointer
} from 'lucide-react';
import type { Asset } from '../assets/AssetManager';

export interface VisualElement {
  id: string;
  kind: 'char' | 'prop' | 'text' | 'hotspot' | 'button' | 'dialog';
  name: string;
  assetId?: string;
  text?: string;
  x: number;
  y: number;
  z: number;
  width?: number;
  height?: number;
  rotation?: number;
  scale?: number;
  visible?: boolean;
  locked?: boolean;
  sound?: string;
}

interface EnhancedVisualEditorProps {
  beat: any;
  beats: any[];
  assets: Asset[];
  onAssetSelect: (type: 'background' | 'character' | 'prop' | 'sound', callback: (asset: Asset) => void) => void;
  onSave: (visualData: { node?: string; locs: VisualElement[]; backgroundSound?: string }) => void;
}

export const EnhancedVisualEditor: React.FC<EnhancedVisualEditorProps> = ({
  beat,
  beats,
  assets,
  onAssetSelect,
  onSave
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [elements, setElements] = useState<VisualElement[]>([]);
  const [backgroundAssetId, setBackgroundAssetId] = useState<string>('');
  const [backgroundSound, setBackgroundSound] = useState<string>('');
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [draggedElement, setDraggedElement] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [showGrid, setShowGrid] = useState(true);
  const [tool, setTool] = useState<'select' | 'pan' | 'hotspot' | 'text'>('select');
  
  // Project size from settings or defaults
  const stageWidth = beat?.settings?.project?.width || 1024;
  const stageHeight = beat?.settings?.project?.height || 768;

  // Initialize from beat data
  useEffect(() => {
    if (!beat) return;
    
    const params = beat.getParameters ? beat.getParameters() : {};
    
    // Load visual data from beat
    if (params.node) {
      setBackgroundAssetId(params.node);
    }
    if (params.locs) {
      setElements(params.locs);
    }
    if (params.backgroundSound) {
      setBackgroundSound(params.backgroundSound);
    }
    
    // Auto-add beat-specific elements if not present
    const hasRequiredElements = params.locs && params.locs.length > 0;
    if (!hasRequiredElements) {
      const newElements: VisualElement[] = [];
      
      switch (beat.type) {
        case 'titleScreen':
          // Add title text
          newElements.push({
            id: `title_${Date.now()}`,
            kind: 'text',
            name: 'Title',
            text: `${params.title || 'Untitled'}\nby ${params.author || 'Unknown'}`,
            x: stageWidth / 2 - 200,
            y: stageHeight / 3 - 50,
            z: 1,
            width: 400,
            height: 100
          });
          
          // Add start button
          newElements.push({
            id: `start_${Date.now()}`,
            kind: 'button',
            name: 'Start',
            text: 'Start',
            x: stageWidth / 2 - 100,
            y: stageHeight * 2 / 3,
            z: 2,
            width: 200,
            height: 50
          });
          break;
          
        case 'introText':
        case 'durScreen':
          // Add text
          newElements.push({
            id: `text_${Date.now()}`,
            kind: 'text',
            name: 'Text',
            text: params.text || '',
            x: stageWidth / 2 - 300,
            y: stageHeight / 2 - 100,
            z: 1,
            width: 600,
            height: 200
          });
          
          // Add continue button
          newElements.push({
            id: `continue_${Date.now()}`,
            kind: 'button',
            name: 'Continue',
            text: params.buttonText || 'Continue',
            x: stageWidth / 2 - 100,
            y: stageHeight - 100,
            z: 2,
            width: 200,
            height: 40
          });
          break;
          
        case 'dialogTree':
          const dialogParams = params.dialogTree || params;
          // Add dialog box
          newElements.push({
            id: `dialog_${Date.now()}`,
            kind: 'dialog',
            name: dialogParams.speaker || 'Speaker',
            text: dialogParams.text || '',
            x: 50,
            y: stageHeight - 200,
            z: 10,
            width: stageWidth - 100,
            height: 150
          });
          
          // Add choices
          if (dialogParams.choices) {
            dialogParams.choices.forEach((choice: any, i: number) => {
              newElements.push({
                id: `choice_${i}_${Date.now()}`,
                kind: 'button',
                name: `Choice ${i + 1}`,
                text: choice.text,
                x: 50 + (i * 220),
                y: 50,
                z: 11 + i,
                width: 200,
                height: 40
              });
            });
          }
          break;
      }
      
      if (newElements.length > 0) {
        setElements(newElements);
      }
    }
  }, [beat, stageWidth, stageHeight]);

  // Fit stage to screen
  const fitToScreen = useCallback(() => {
    if (!canvasRef.current || !stageRef.current) return;
    
    const container = canvasRef.current.getBoundingClientRect();
    const padding = 40;
    const availableWidth = container.width - padding * 2;
    const availableHeight = container.height - padding * 2;
    
    const scaleX = availableWidth / stageWidth;
    const scaleY = availableHeight / stageHeight;
    const newZoom = Math.min(scaleX, scaleY, 1);
    
    setZoom(newZoom);
    setPan({ x: 0, y: 0 });
  }, [stageWidth, stageHeight]);

  // Auto-fit on mount and resize
  useEffect(() => {
    fitToScreen();
    window.addEventListener('resize', fitToScreen);
    return () => window.removeEventListener('resize', fitToScreen);
  }, [fitToScreen]);

  // Handle save
  const handleSave = () => {
    const visualData = {
      node: backgroundAssetId || undefined,
      locs: elements,
      backgroundSound: backgroundSound || undefined
    };
    
    onSave(visualData);
    
    // Show save confirmation
    const notification = document.createElement('div');
    notification.className = 'fixed top-20 left-1/2 transform -translate-x-1/2 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
    notification.textContent = 'Visual changes saved!';
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.style.opacity = '0';
      notification.style.transition = 'opacity 0.3s';
      setTimeout(() => document.body.removeChild(notification), 300);
    }, 2000);
  };

  // Handle background selection
  const handleBackgroundSelect = () => {
    onAssetSelect('background', (asset: Asset) => {
      setBackgroundAssetId(asset.id);
    });
  };

  // Handle asset selection for elements
  const handleAddElement = (type: 'char' | 'prop') => {
    onAssetSelect(type === 'char' ? 'character' : 'prop', (asset: Asset) => {
      const newElement: VisualElement = {
        id: `element_${Date.now()}`,
        kind: type,
        name: asset.name,
        assetId: asset.id,
        x: stageWidth / 2 - 75,
        y: stageHeight / 2 - 75,
        z: elements.length + 1,
        width: 150,
        height: 150
      };
      setElements([...elements, newElement]);
      setSelectedElement(newElement.id);
    });
  };

  // Add new element
  const addElement = (kind: VisualElement['kind'], x?: number, y?: number) => {
    const newElement: VisualElement = {
      id: `element_${Date.now()}`,
      kind,
      name: `${kind} ${elements.length + 1}`,
      x: x ?? stageWidth / 2 - 75,
      y: y ?? stageHeight / 2 - 50,
      z: elements.length + 1,
      width: kind === 'button' ? 200 : kind === 'text' ? 300 : 150,
      height: kind === 'button' ? 40 : kind === 'text' ? 100 : 150,
      text: kind === 'text' ? 'New Text' : kind === 'button' ? 'Button' : undefined
    };
    setElements([...elements, newElement]);
    setSelectedElement(newElement.id);
  };

  // Pan and zoom handlers
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.min(Math.max(0.1, zoom * delta), 3);
    setZoom(newZoom);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (tool === 'pan' || e.button === 1) { // Middle mouse button
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      e.preventDefault();
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    } else if (draggedElement && stageRef.current) {
      const rect = stageRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / zoom - dragOffset.x;
      const y = (e.clientY - rect.top) / zoom - dragOffset.y;
      
      setElements(elements.map(el =>
        el.id === draggedElement ? { ...el, x, y } : el
      ));
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggedElement(null);
  };

  // Element operations
  const updateElement = (id: string, updates: Partial<VisualElement>) => {
    setElements(elements.map(el => el.id === id ? { ...el, ...updates } : el));
  };

  const deleteElement = (id: string) => {
    setElements(elements.filter(el => el.id !== id));
    setSelectedElement(null);
  };

  // Auto-size text element based on content
  const autoSizeElement = (element: VisualElement, text: string): { width: number; height: number } => {
    if (!text || (element.kind !== 'text' && element.kind !== 'dialog' && element.kind !== 'button')) {
      return { width: element.width || 100, height: element.height || 40 };
    }

    const charCount = text.length;
    const avgCharWidth = 7.5; // Average character width in pixels
    const lineHeight = 20; // Line height in pixels
    const padding = 24; // Padding (top + bottom or left + right)

    let targetWidth: number;

    if (charCount <= 15) {
      // Very short text: tight width
      targetWidth = Math.max(charCount * avgCharWidth + padding, 100);
    } else if (charCount <= 40) {
      // Short text: aim for 1-2 lines, compact width
      targetWidth = Math.min(charCount * avgCharWidth + padding, 300);
    } else if (charCount <= 80) {
      // Medium text: aim for 2-3 lines
      targetWidth = 400;
    } else {
      // Long text: wider box for readability
      targetWidth = 500;
    }

    // Ensure within bounds
    const width = Math.min(Math.max(targetWidth, 100), 824);

    // Calculate number of lines needed
    const charsPerLine = Math.floor((width - padding) / avgCharWidth);
    const lineCount = Math.max(1, Math.ceil(charCount / charsPerLine));

    // Calculate height based on line count
    const height = Math.max(40, lineCount * lineHeight + padding);

    return { width: Math.round(width), height: Math.round(height) };
  };

  const duplicateElement = (id: string) => {
    const element = elements.find(el => el.id === id);
    if (!element) return;
    
    const newElement = {
      ...element,
      id: `element_${Date.now()}`,
      x: element.x + 20,
      y: element.y + 20,
      name: `${element.name} (Copy)`
    };
    setElements([...elements, newElement]);
    setSelectedElement(newElement.id);
  };

  const moveLayer = (id: string, direction: 'up' | 'down') => {
    const index = elements.findIndex(el => el.id === id);
    if (index === -1) return;
    
    const newElements = [...elements];
    if (direction === 'up' && index < elements.length - 1) {
      [newElements[index], newElements[index + 1]] = [newElements[index + 1], newElements[index]];
    } else if (direction === 'down' && index > 0) {
      [newElements[index], newElements[index - 1]] = [newElements[index - 1], newElements[index]];
    }
    
    // Update z-indices
    newElements.forEach((el, i) => { el.z = i + 1; });
    setElements(newElements);
  };

  const selectedEl = elements.find(el => el.id === selectedElement);
  const backgroundAsset = assets.find(a => a.id === backgroundAssetId);

  return (
    <div className="flex h-full bg-gray-900">
      {/* Main Canvas Area */}
      <div 
        ref={canvasRef}
        className="flex-1 relative overflow-hidden"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Top Toolbar */}
        <div className="absolute top-4 left-4 right-4 z-20 flex gap-2 pointer-events-none">
          <div className="bg-white rounded-lg shadow-lg p-2 flex gap-1 pointer-events-auto">
            <button
              onClick={() => setTool('select')}
              className={`p-2 rounded ${tool === 'select' ? 'bg-blue-500 text-white' : 'hover:bg-gray-100'}`}
              title="Select"
            >
              <MousePointer className="w-4 h-4" />
            </button>
            <button
              onClick={() => setTool('pan')}
              className={`p-2 rounded ${tool === 'pan' ? 'bg-blue-500 text-white' : 'hover:bg-gray-100'}`}
              title="Pan"
            >
              <Hand className="w-4 h-4" />
            </button>
            <div className="w-px bg-gray-300" />
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
          </div>

          <div className="bg-white rounded-lg shadow-lg p-2 flex gap-1 pointer-events-auto">
            <button
              onClick={() => handleAddElement('char')}
              className="p-2 rounded hover:bg-gray-100 flex items-center gap-1"
              title="Add Character"
            >
              <User className="w-4 h-4" />
              <span className="text-xs">Character</span>
            </button>
            <button
              onClick={() => handleAddElement('prop')}
              className="p-2 rounded hover:bg-gray-100 flex items-center gap-1"
              title="Add Prop"
            >
              <Package className="w-4 h-4" />
              <span className="text-xs">Prop</span>
            </button>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-2 flex gap-1 pointer-events-auto">
            <button
              onClick={() => setZoom(Math.max(0.1, zoom - 0.1))}
              className="p-2 rounded hover:bg-gray-100"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="px-2 py-2 text-sm min-w-[50px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom(Math.min(3, zoom + 0.1))}
              className="p-2 rounded hover:bg-gray-100"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={fitToScreen}
              className="p-2 rounded hover:bg-gray-100"
              title="Fit to Screen"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1" />

          <button
            onClick={handleSave}
            className="bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg hover:bg-green-600 flex items-center gap-2 pointer-events-auto"
          >
            <Save className="w-4 h-4" />
            Save Visual
          </button>
        </div>

        {/* Stage Container */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            ref={stageRef}
            className="relative bg-white shadow-2xl"
            style={{
              width: `${stageWidth}px`,
              height: `${stageHeight}px`,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'center center',
              cursor: tool === 'pan' ? 'grab' : 'default',
              backgroundImage: showGrid && !backgroundAsset
                ? 'repeating-linear-gradient(0deg, #00000008 0px, transparent 1px, transparent 19px, #00000008 20px), repeating-linear-gradient(90deg, #00000008 0px, transparent 1px, transparent 19px, #00000008 20px)'
                : undefined,
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget && tool === 'select') {
                setSelectedElement(null);
              } else if (tool === 'hotspot' || tool === 'text') {
                const rect = stageRef.current!.getBoundingClientRect();
                const x = (e.clientX - rect.left) / zoom;
                const y = (e.clientY - rect.top) / zoom;
                addElement(tool === 'hotspot' ? 'hotspot' : 'text', x - 50, y - 20);
                setTool('select');
              }
            }}
          >
            {/* Background */}
            {backgroundAsset ? (
              <img 
                src={backgroundAsset.url}
                alt="Background"
                className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
              />
            ) : (
              <div 
                className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 cursor-pointer"
                onClick={handleBackgroundSelect}
              >
                <div className="text-center text-gray-500">
                  <ImageIcon className="w-16 h-16 mx-auto mb-3" />
                  <p className="text-lg font-medium">Click to add background</p>
                  <p className="text-sm mt-1">{stageWidth} × {stageHeight}px</p>
                </div>
              </div>
            )}

            {/* Elements */}
            {elements.sort((a, b) => a.z - b.z).map(element => {
              const asset = element.assetId ? assets.find(a => a.id === element.assetId) : null;
              const isSelected = selectedElement === element.id;
              
              return (
                <div
                  key={element.id}
                  className={`absolute ${isSelected ? 'ring-2 ring-blue-500' : 'hover:ring-1 hover:ring-gray-400'} ${
                    element.locked ? 'cursor-not-allowed' : 'cursor-move'
                  }`}
                  style={{
                    left: `${element.x}px`,
                    top: `${element.y}px`,
                    width: `${element.width || 150}px`,
                    height: `${element.height || 150}px`,
                    transform: `rotate(${element.rotation || 0}deg) scale(${element.scale || 1})`,
                    opacity: element.visible === false ? 0.3 : 1,
                    pointerEvents: element.locked ? 'none' : 'auto',
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (tool === 'select' && !element.locked) {
                      setSelectedElement(element.id);
                    }
                  }}
                  onMouseDown={(e) => {
                    if (tool === 'select' && !element.locked && !isPanning) {
                      setDraggedElement(element.id);
                      const rect = stageRef.current!.getBoundingClientRect();
                      setDragOffset({
                        x: (e.clientX - rect.left) / zoom - element.x,
                        y: (e.clientY - rect.top) / zoom - element.y
                      });
                      e.preventDefault();
                    }
                  }}
                >
                  {/* Render element based on kind */}
                  {element.kind === 'char' && asset && (
                    <img src={asset.url} alt={element.name} className="w-full h-full object-contain" />
                  )}
                  
                  {element.kind === 'prop' && asset && (
                    <img src={asset.url} alt={element.name} className="w-full h-full object-contain" />
                  )}
                  
                  {element.kind === 'text' && (
                    <div className="w-full h-full flex items-center justify-center bg-white bg-opacity-90 rounded px-2">
                      <span className="text-center whitespace-pre-wrap">{element.text || element.name}</span>
                    </div>
                  )}
                  
                  {element.kind === 'button' && (
                    <button className="w-full h-full bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium">
                      {element.text || element.name}
                    </button>
                  )}
                  
                  {element.kind === 'hotspot' && (
                    <div className="w-full h-full bg-yellow-300 bg-opacity-30 border-2 border-yellow-500 rounded flex items-center justify-center">
                      <span className="text-xs font-bold bg-yellow-500 text-white px-2 py-1 rounded">
                        {element.name}
                      </span>
                    </div>
                  )}
                  
                  {element.kind === 'dialog' && (
                    <div className="w-full h-full bg-black bg-opacity-75 text-white rounded-lg p-3">
                      <div className="text-sm font-bold mb-1">{element.name}:</div>
                      <div className="text-sm">{element.text}</div>
                    </div>
                  )}
                  
                  {element.sound && (
                    <Volume2 className="absolute -top-6 left-0 w-4 h-4 text-blue-500" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right Panel - Unified Properties */}
      <div className="w-80 bg-white flex flex-col shadow-xl">
        <div className="p-4 border-b bg-gray-50">
          <h3 className="font-semibold">Visual Properties</h3>
          <div className="text-sm text-gray-500 mt-1">
            {beat?.name} ({beat?.type})
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Background & Sound */}
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">Background</label>
              <button
                onClick={handleBackgroundSelect}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 flex items-center gap-2"
              >
                <ImageIcon className="w-4 h-4" />
                {backgroundAsset ? backgroundAsset.name : 'Select Background'}
              </button>
            </div>
            
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">Background Sound</label>
              <button
                onClick={() => onAssetSelect('sound', (asset) => setBackgroundSound(asset.id))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 flex items-center gap-2"
              >
                <Music className="w-4 h-4" />
                {backgroundSound ? 'Change Sound' : 'Add Sound'}
              </button>
            </div>
          </div>

          {/* Layers */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
              <Layers className="w-4 h-4" />
              Elements ({elements.length})
            </h4>
            <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto">
              {[...elements].reverse().map(element => (
                <div
                  key={element.id}
                  className={`flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 cursor-pointer ${
                    selectedElement === element.id ? 'bg-blue-50' : ''
                  }`}
                  onClick={() => setSelectedElement(element.id)}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      updateElement(element.id, { visible: element.visible === false ? true : false });
                    }}
                    className="p-1 hover:bg-gray-200 rounded"
                  >
                    {element.visible !== false ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
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
                  <span className="flex-1 text-sm truncate">
                    {element.name} ({element.kind})
                  </span>
                  <span className="text-xs text-gray-400">z:{element.z}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Selected Element Properties */}
          {selectedEl && (
            <div className="space-y-3 pt-3 border-t">
              <h4 className="text-sm font-medium text-gray-700">Selected Element</h4>
              
              <div>
                <label className="block text-xs text-gray-600 mb-1">Name</label>
                <input
                  type="text"
                  value={selectedEl.name}
                  onChange={(e) => updateElement(selectedEl.id, { name: e.target.value })}
                  className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                />
              </div>

              {(selectedEl.kind === 'text' || selectedEl.kind === 'button' || selectedEl.kind === 'dialog') && (
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Text</label>
                  <textarea
                    value={selectedEl.text || ''}
                    onChange={(e) => {
                      const newText = e.target.value;
                      const { width, height } = autoSizeElement(selectedEl, newText);
                      updateElement(selectedEl.id, {
                        text: newText,
                        width,
                        height
                      });
                    }}
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
                    value={Math.round(selectedEl.x)}
                    onChange={(e) => updateElement(selectedEl.id, { x: parseInt(e.target.value) })}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Y</label>
                  <input
                    type="number"
                    value={Math.round(selectedEl.y)}
                    onChange={(e) => updateElement(selectedEl.id, { y: parseInt(e.target.value) })}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Width</label>
                  <input
                    type="number"
                    value={Math.round(selectedEl.width || 150)}
                    onChange={(e) => updateElement(selectedEl.id, { width: parseInt(e.target.value) })}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Height</label>
                  <input
                    type="number"
                    value={Math.round(selectedEl.height || 150)}
                    onChange={(e) => updateElement(selectedEl.id, { height: parseInt(e.target.value) })}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                  />
                </div>
              </div>

              {/* Sound for clickable elements */}
              {(selectedEl.kind === 'char' || selectedEl.kind === 'prop' || 
                selectedEl.kind === 'hotspot' || selectedEl.kind === 'button') && (
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Click Sound</label>
                  <button
                    onClick={() => onAssetSelect('sound', (asset) => {
                      updateElement(selectedEl.id, { sound: asset.id });
                    })}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50"
                  >
                    {selectedEl.sound ? 'Change Sound' : 'Add Sound'}
                  </button>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => moveLayer(selectedEl.id, 'up')}
                  className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50"
                >
                  Layer Up
                </button>
                <button
                  onClick={() => moveLayer(selectedEl.id, 'down')}
                  className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50"
                >
                  Layer Down
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => duplicateElement(selectedEl.id)}
                  className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50 flex items-center justify-center gap-1"
                >
                  <Copy className="w-3 h-3" />
                  Duplicate
                </button>
                <button
                  onClick={() => deleteElement(selectedEl.id)}
                  className="flex-1 px-2 py-1 border border-red-300 text-red-600 rounded text-sm hover:bg-red-50 flex items-center justify-center gap-1"
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
