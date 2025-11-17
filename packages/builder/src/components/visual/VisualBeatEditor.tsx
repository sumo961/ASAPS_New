import React, { useState, useRef, useCallback } from 'react';
import {
  Move,
  Square,
  Type,
  Image as ImageIcon,
  Layers,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Music,
  User,
  Package,
} from 'lucide-react';
import type { Asset } from '../assets/AssetManager';
import type { Location } from '@asaps/core';
import type { Character } from '../../types/character';
import type { GlobalSettings } from '../settings/GlobalSettingsInspector';
import {
  PositionedBeatView,
  createPositionedElementData,
  type PositionedElementData
} from '@asaps/renderer';
import { convertGlobalSettingsToTheme } from '../../utils/themeConverter';

export interface VisualElement {
  id: string;
  type: 'character' | 'prop' | 'text' | 'hotspot' | 'dialog' | 'button';
  assetId?: string;
  imageUrl?: string; // Direct image URL (for base64 data or when assetId is not available)
  characterId?: string; // For character elements, links to Character definition
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
  // Font properties for text elements
  font?: string;
  fontSize?: number;
  textAlign?: 'left' | 'center' | 'right';
}

interface VisualBeatEditorProps {
  backgroundAssetId?: string;
  backgroundSound?: string;
  elements: VisualElement[];
  onElementsChange: (elements: VisualElement[]) => void;
  assets: Asset[];
  onSelectAsset?: (assetType: 'background' | 'character' | 'prop' | 'sound', callback: (asset: Asset) => void) => void;
  onOpenCharacterManager?: (callback: (character: Character) => void) => void;
  beatContent?: {
    text?: string;
    title?: string;
    author?: string;
    buttonText?: string;
    speaker?: string;
    choices?: Array<{ text: string; target?: string }>;
  };
  beatType?: string;
  selectedElement?: string | null;
  onSelectElement?: (elementId: string | null) => void;
  projectSettings?: {
    width: number;
    height: number;
    aspectRatio: string;
    scalingMode: string;
  };
  boxVisibility?: 'all' | 'hideText' | 'hideAll';
  globalSettings?: GlobalSettings;
}

export const VisualBeatEditor: React.FC<VisualBeatEditorProps> = ({
  backgroundAssetId,
  backgroundSound,
  elements = [],
  onElementsChange,
  assets,
  onSelectAsset,
  onOpenCharacterManager,
  beatContent,
  beatType,
  selectedElement,
  onSelectElement,
  projectSettings,
  boxVisibility,
  globalSettings,
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [draggedElement, setDraggedElement] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Use stage size from project settings, with fallback to 1024×768
  const stageWidth = projectSettings?.width || 1024;
  const stageHeight = projectSettings?.height || 768;
  const [zoom, setZoom] = useState(1);
  const [showGrid, setShowGrid] = useState(true);
  const activeBoxVisibility = boxVisibility || 'all';
  const [tool, setTool] = useState<'select' | 'hotspot' | 'text' | 'character' | 'prop'>('select');

  const backgroundAsset = assets.find(a => a.id === backgroundAssetId);

  // Convert VisualElements to Location objects for the renderer
  const locationsForRenderer: Location[] = elements
    .filter(el => el.visible)
    .sort((a, b) => a.z - b.z)
    .map(el => ({
      name: el.name,
      kind: el.type as any,
      x: el.x,
      y: el.y,
      width: el.width,
      height: el.height,
      zIndex: el.z,
      assetId: el.assetId,
      imageUrl: el.imageUrl,  // Include direct image URL for characters with base64 data
      sound: el.sound,
      // Include transform properties
      rotation: el.rotation,
      scale: el.scale,
      // Include font properties directly in Location
      font: el.font,
      fontSize: el.fontSize,
      textAlign: el.textAlign,
      // Only autosize if fontSize is not explicitly set
      autosize: el.fontSize === undefined,
    }));

  // Asset resolver function to look up asset URLs by ID
  const assetResolver = (assetId: string): string | undefined => {
    const asset = assets.find(a => a.id === assetId);
    return asset?.url;
  };

  // Create positioned elements for the shared renderer using helper function
  const positionedElements: PositionedElementData[] = createPositionedElementData(
    locationsForRenderer,
    beatContent || {},
    beatType || 'unknown',
    assetResolver
  );

  // Add asset URLs to elements (keeping this for backwards compatibility)
  positionedElements.forEach(el => {
    if (!el.assetUrl) {
      // First try to resolve assetId
      if (el.location.assetId) {
        const asset = assets.find(a => a.id === el.location.assetId);
        if (asset) {
          el.assetUrl = asset.url;
        }
      }
      // If no assetUrl from assetId, use direct imageUrl (for character base64 data)
      if (!el.assetUrl && el.location.imageUrl) {
        el.assetUrl = el.location.imageUrl;
      }
    }
  });

  // Handle element drag
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!draggedElement || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(stageWidth - 50, 
      (e.clientX - rect.left) / zoom - dragOffset.x));
    const y = Math.max(0, Math.min(stageHeight - 50,
      (e.clientY - rect.top) / zoom - dragOffset.y));

    const updatedElements = elements.map(el => 
      el.id === draggedElement ? { ...el, x, y } : el
    );
    onElementsChange(updatedElements);
  };

  // Handle element drag end
  const handleMouseUp = () => {
    setDraggedElement(null);
  };

  // Handle background click (deselect) - but not from within renderer
  const handleBackgroundClick = useCallback(() => {
    if (onSelectElement) {
      onSelectElement(null);
    }
  }, [onSelectElement]);

  // Add new element
  const addElement = (type: 'hotspot' | 'text' | 'character' | 'prop', x = 100, y = 100, assetId?: string) => {
    console.log('[addElement] Called with:', { type, x, y, assetId });
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
      name: type === 'hotspot' ? 'Hotspot' : type === 'text' ? 'Text' : type === 'character' ? 'Character' : 'Prop',
      text: type === 'text' ? 'New Text' : undefined,
      assetId: (type === 'character' || type === 'prop') ? assetId : undefined,
      // Add font properties for text elements
      font: type === 'text' ? 'Arial' : undefined,
      fontSize: type === 'text' ? 16 : undefined,
      textAlign: type === 'text' ? 'center' : undefined,
    };
    console.log('[addElement] Created element:', newElement);
    onElementsChange([...elements, newElement]);
    if (onSelectElement) {
      onSelectElement(newElement.id);
    }
  };

  // Wrapper to handle element selection and dragging
  const handleElementInteraction = (e: React.MouseEvent, elementName: string) => {
    const element = elements.find(el => el.name === elementName);
    if (!element || element.locked) return;

    e.stopPropagation();
    
    // Select element
    if (onSelectElement) {
      onSelectElement(element.id);
    }

    // Start drag
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    setDraggedElement(element.id);
    setDragOffset({
      x: (e.clientX - rect.left) / zoom - element.x,
      y: (e.clientY - rect.top) / zoom - element.y
    });
  };

  return (
    <div className="h-full bg-gray-100 flex flex-col overflow-hidden">
      {/* DEBUG BANNER */}
      <div className="bg-red-500 text-white text-center py-2 font-bold">
        🔧 DEBUG MODE - VisualBeatEditor LOADED - Updated Code Active 🔧
      </div>
      {/* Toolbar - Fixed at top */}
      <div className="flex-shrink-0 bg-white border-b border-gray-300 p-2 flex gap-2 items-center shadow-sm">
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
        <button
          onClick={() => {
            console.log('[VisualBeatEditor] Character button clicked, onOpenCharacterManager:', onOpenCharacterManager);
            if (onOpenCharacterManager) {
              onOpenCharacterManager((character) => {
                console.log('[VisualBeatEditor] Character selected:', character);
                // TODO: Handle character selection - could add character element to canvas
              });
            } else {
              console.error('[VisualBeatEditor] onOpenCharacterManager callback not provided!');
            }
          }}
          className={`p-2 rounded ${tool === 'character' ? 'bg-blue-500 text-white' : 'hover:bg-gray-100'}`}
          title="Manage Characters"
        >
          <User className="w-4 h-4" />
        </button>
        <button
          onClick={() => {
            alert('Props button clicked! Check console.');
            // Open asset manager filtered to props
            if (onSelectAsset) {
              console.log('[VisualBeatEditor] Opening asset selection for props');
              onSelectAsset('prop', (selectedAsset) => {
                console.log('[VisualBeatEditor] Prop selected:', selectedAsset);
                if (selectedAsset && selectedAsset.id) {
                  // Add prop element in the center of the canvas
                  const x = (stageWidth / 2) - 75;
                  const y = (stageHeight / 2) - 75;
                  addElement('prop', x, y, selectedAsset.id);
                } else {
                  console.warn('[VisualBeatEditor] No asset selected or asset has no ID');
                }
              });
            } else {
              console.error('[VisualBeatEditor] onSelectAsset callback not provided');
            }
          }}
          className={`p-2 rounded hover:bg-gray-100`}
          title="Add Prop"
        >
          <Package className="w-4 h-4" />
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
          <RotateCcw className="w-4 h-4" />
        </button>
        
        <div className="flex-1" />
        
        {/* Canvas Size Indicator */}
        <div className="bg-gray-100 rounded px-3 py-1 text-sm text-gray-700">
          Stage: {stageWidth} × {stageHeight}px {projectSettings?.aspectRatio ? `(${projectSettings.aspectRatio})` : ''}
        </div>
      </div>

      {/* Scrollable Canvas Container */}
      <div className="flex-1 overflow-auto bg-gray-100" style={{ maxWidth: '100%', maxHeight: '100%' }}>
        <div 
          ref={canvasRef}
          className="relative flex items-center justify-center p-5"
          style={{ 
            minWidth: `${stageWidth * zoom + 80}px`,
            minHeight: `${stageHeight * zoom + 80}px`,
            width: 'max-content',
            height: 'max-content'
          }}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <div 
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: 'center center',
              boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
              position: 'relative',
            }}
            onClick={(e) => {
              if (tool === 'hotspot') {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = (e.clientX - rect.left) - 50;
                const y = (e.clientY - rect.top) - 50;
                addElement('hotspot', x, y);
                setTool('select');
              } else if (tool === 'text') {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = (e.clientX - rect.left) - 100;
                const y = (e.clientY - rect.top) - 20;
                addElement('text', x, y);
                setTool('select');
              } else if (tool === 'character') {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = (e.clientX - rect.left) - 75;
                const y = (e.clientY - rect.top) - 75;
                // Open asset selection modal for character
                if (onSelectAsset) {
                  onSelectAsset('character', (selectedAsset) => {
                    if (selectedAsset && selectedAsset.id) {
                      addElement('character', x, y, selectedAsset.id);
                      setTool('select');
                    }
                  });
                }
              } else if (e.target === e.currentTarget) {
                handleBackgroundClick();
              }
            }}
          >
            {/* Wrapper for grid overlay */}
            <div 
              style={{
                position: 'relative',
                width: `${stageWidth}px`,
                height: `${stageHeight}px`,
              }}
            >
              {/* Grid overlay */}
              {showGrid && (
                <div 
                  style={{
                    position: 'absolute',
                    inset: 0,
                    backgroundImage: 'repeating-linear-gradient(0deg, #00000008 0px, transparent 1px, transparent 19px, #00000008 20px), repeating-linear-gradient(90deg, #00000008 0px, transparent 1px, transparent 19px, #00000008 20px)',
                    pointerEvents: 'none',
                    zIndex: 10,
                  }}
                />
              )}

              {/* Background indicator if no asset */}
              {!backgroundAsset && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'linear-gradient(to bottom right, #f3f4f6, #e5e7eb)',
                    cursor: 'pointer',
                    zIndex: 0,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectAsset?.('background', () => {});
                  }}
                >
                  <div style={{ textAlign: 'center', color: '#6b7280' }}>
                    <ImageIcon style={{ width: '64px', height: '64px', margin: '0 auto 12px' }} />
                    <p style={{ fontSize: '18px', fontWeight: 500 }}>Click to add background</p>
                    <p style={{ fontSize: '14px', marginTop: '4px' }}>
                      Recommended: {stageWidth} × {stageHeight}px
                    </p>
                  </div>
                </div>
              )}

              {/* Sound Indicator */}
              {backgroundSound && (
                <div 
                  style={{
                    position: 'absolute',
                    top: '16px',
                    left: '16px',
                    background: 'rgba(0, 0, 0, 0.5)',
                    color: 'white',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    pointerEvents: 'none',
                    zIndex: 20,
                  }}
                >
                  <Music style={{ width: '16px', height: '16px' }} />
                  <span style={{ fontSize: '14px' }}>Background Sound Active</span>
                </div>
              )}

              {/* Use shared PositionedBeatView */}
              <PositionedBeatView
                stageWidth={stageWidth}
                stageHeight={stageHeight}
                backgroundUrl={backgroundAsset?.url}
                backgroundColor="transparent"
                elements={positionedElements}
                interactive={false}
                hideTextBoxes={activeBoxVisibility === 'hideText' || activeBoxVisibility === 'hideAll'}
                hideButtonBoxes={activeBoxVisibility === 'hideAll'}
                theme={globalSettings ? convertGlobalSettingsToTheme(globalSettings) : undefined}
              />
              
              {/* Draggable overlay for each element */}
              {elements
                .filter(el => el.visible)
                .map(el => {
                  // Build transform string for overlay
                  const transforms: string[] = [];
                  if (el.rotation) {
                    transforms.push(`rotate(${el.rotation}deg)`);
                  }
                  if (el.scale && el.scale !== 1) {
                    transforms.push(`scale(${el.scale})`);
                  }

                  return (
                    <div
                      key={`drag-overlay-${el.id}`}
                      style={{
                        position: 'absolute',
                        left: `${el.x}px`,
                        top: `${el.y}px`,
                        width: `${el.width}px`,
                        height: `${el.height}px`,
                        zIndex: (el.z || 0) + 1000,
                        cursor: el.locked ? 'not-allowed' : 'move',
                        pointerEvents: 'auto',
                        transform: transforms.length > 0 ? transforms.join(' ') : undefined,
                        transformOrigin: 'center center',
                      }}
                      onMouseDown={(e) => {
                        if (el.locked) return;
                        e.stopPropagation();

                        const rect = canvasRef.current?.getBoundingClientRect();
                        if (!rect) return;

                        // Select element
                        if (onSelectElement) {
                          onSelectElement(el.id);
                        }

                        // Start drag
                        setDraggedElement(el.id);
                        setDragOffset({
                          x: (e.clientX - rect.left) / zoom - el.x,
                          y: (e.clientY - rect.top) / zoom - el.y
                        });
                      }}
                    />
                  );
                })}

              {/* Selection indicators overlay */}
              {elements
                .filter(el => el.visible && el.id === selectedElement)
                .map(el => {
                  // Build transform string for selection indicator
                  const transforms: string[] = [];
                  if (el.rotation) {
                    transforms.push(`rotate(${el.rotation}deg)`);
                  }
                  if (el.scale && el.scale !== 1) {
                    transforms.push(`scale(${el.scale})`);
                  }

                  return (
                    <div
                      key={`selection-${el.id}`}
                      style={{
                        position: 'absolute',
                        left: `${el.x}px`,
                        top: `${el.y}px`,
                        width: `${el.width}px`,
                        height: `${el.height}px`,
                        border: '2px solid #3b82f6',
                        borderRadius: '4px',
                        pointerEvents: 'none',
                        zIndex: 10000,
                        boxShadow: '0 0 0 1px rgba(255,255,255,0.5), 0 0 20px rgba(59,130,246,0.3)',
                        transform: transforms.length > 0 ? transforms.join(' ') : undefined,
                        transformOrigin: 'center center',
                      }}
                    >
                    {/* Resize handles */}
                    <div style={{
                      position: 'absolute',
                      top: '-6px',
                      left: '-6px',
                      width: '12px',
                      height: '12px',
                      backgroundColor: '#3b82f6',
                      border: '2px solid white',
                      borderRadius: '50%',
                      cursor: 'nwse-resize',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                    }} />
                    <div style={{
                      position: 'absolute',
                      top: '-6px',
                      right: '-6px',
                      width: '12px',
                      height: '12px',
                      backgroundColor: '#3b82f6',
                      border: '2px solid white',
                      borderRadius: '50%',
                      cursor: 'nesw-resize',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                    }} />
                    <div style={{
                      position: 'absolute',
                      bottom: '-6px',
                      left: '-6px',
                      width: '12px',
                      height: '12px',
                      backgroundColor: '#3b82f6',
                      border: '2px solid white',
                      borderRadius: '50%',
                      cursor: 'nesw-resize',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                    }} />
                    <div style={{
                      position: 'absolute',
                      bottom: '-6px',
                      right: '-6px',
                      width: '12px',
                      height: '12px',
                      backgroundColor: '#3b82f6',
                      border: '2px solid white',
                      borderRadius: '50%',
                      cursor: 'nwse-resize',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                    }} />
                  </div>
                  );
                })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
