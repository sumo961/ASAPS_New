/**
 * Sprite Sheet Editor Component
 * Manages sprite sheet configuration and animation for characters
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Grid, 
  Play, 
  Pause, 
  Plus, 
  Trash2, 
  Settings,
  RefreshCw,
  ZoomIn,
  ZoomOut,
  Move
} from 'lucide-react';
import { SpriteAnimation } from '../../types/character';

interface SpriteSheetEditorProps {
  spriteSheetUrl: string;
  frameWidth: number;
  frameHeight: number;
  animations: SpriteAnimation[];
  onChange: (config: {
    frameWidth: number;
    frameHeight: number;
    imageWidth?: number;
    imageHeight?: number;
    animations: SpriteAnimation[];
  }) => void;
}

// Maximum grid dimensions to prevent memory overflow
const MAX_GRID_CELLS = 1000; // Maximum total cells
const MAX_DIMENSION = 100;   // Maximum rows or columns

export const SpriteSheetEditor: React.FC<SpriteSheetEditorProps> = ({
  spriteSheetUrl,
  frameWidth,
  frameHeight,
  animations,
  onChange
}) => {
  const [localFrameWidth, setLocalFrameWidth] = useState(frameWidth || 32);
  const [localFrameHeight, setLocalFrameHeight] = useState(frameHeight || 32);
  const [localAnimations, setLocalAnimations] = useState<SpriteAnimation[]>(animations || []);
  const [selectedAnimation, setSelectedAnimation] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [showGrid, setShowGrid] = useState(true);
  const [zoom, setZoom] = useState(2);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [gridWarning, setGridWarning] = useState<string | null>(null);
  const [showFrameSelector, setShowFrameSelector] = useState(false);

  // Sync local state when props change (after save or character switch)
  useEffect(() => {
    setLocalFrameWidth(frameWidth || 32);
    setLocalFrameHeight(frameHeight || 32);
  }, [frameWidth, frameHeight]);

  useEffect(() => {
    // Only update if animations actually changed (deep compare)
    const propsAnimStr = JSON.stringify(animations || []);
    const localAnimStr = JSON.stringify(localAnimations);
    if (propsAnimStr !== localAnimStr) {
      setLocalAnimations(animations || []);
      // Reset selected animation if it's out of bounds
      if (selectedAnimation >= (animations?.length || 0)) {
        setSelectedAnimation(Math.max(0, (animations?.length || 0) - 1));
      }
    }
  }, [animations]);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const lastFrameTime = useRef<number>(0);

  // Load sprite sheet image dimensions
  useEffect(() => {
    if (!spriteSheetUrl) return;

    const img = new Image();
    img.onload = () => {
      setImageSize({ width: img.width, height: img.height });
      // Immediately persist the image dimensions for correct frame position calculation in preview
      onChange({
        frameWidth: localFrameWidth,
        frameHeight: localFrameHeight,
        imageWidth: img.width,
        imageHeight: img.height,
        animations: localAnimations
      });
    };
    img.onerror = () => {
      console.error('Failed to load sprite sheet image:', spriteSheetUrl);
      setImageSize({ width: 0, height: 0 });
    };
    img.src = spriteSheetUrl;
     
  }, [spriteSheetUrl]);

  // Calculate grid dimensions with safety checks (using useMemo to avoid re-render loops)
  const { cols, rows, totalFrames, warning } = React.useMemo(() => {
    // Ensure frame dimensions are valid
    const safeFrameWidth = Math.max(1, localFrameWidth || 1);
    const safeFrameHeight = Math.max(1, localFrameHeight || 1);

    // Calculate potential grid dimensions
    let calcCols = Math.floor(imageSize.width / safeFrameWidth) || 1;
    let calcRows = Math.floor(imageSize.height / safeFrameHeight) || 1;

    // Apply safety limits
    calcCols = Math.min(calcCols, MAX_DIMENSION);
    calcRows = Math.min(calcRows, MAX_DIMENSION);

    // Check total cells
    const totalCells = calcCols * calcRows;
    let warningMsg: string | null = null;

    if (totalCells > MAX_GRID_CELLS) {
      // Scale down proportionally
      const scale = Math.sqrt(MAX_GRID_CELLS / totalCells);
      calcCols = Math.max(1, Math.floor(calcCols * scale));
      calcRows = Math.max(1, Math.floor(calcRows * scale));
      warningMsg = `Grid limited to ${calcCols}×${calcRows} to prevent memory overflow`;
    }

    return { cols: calcCols, rows: calcRows, totalFrames: calcCols * calcRows, warning: warningMsg };
  }, [localFrameWidth, localFrameHeight, imageSize.width, imageSize.height]);

  // Update warning state when calculated warning changes
  useEffect(() => {
    setGridWarning(warning);
  }, [warning]);

  // Animation playback
  useEffect(() => {
    if (!isPlaying || localAnimations.length === 0) return;
    
    const animation = localAnimations[selectedAnimation];
    if (!animation || animation.frames.length === 0) return;

    const animate = (timestamp: number) => {
      if (!lastFrameTime.current) lastFrameTime.current = timestamp;
      
      const elapsed = timestamp - lastFrameTime.current;
      
      if (elapsed >= animation.frameDuration) {
        setCurrentFrame(prev => {
          const next = prev + 1;
          if (next >= animation.frames.length) {
            return animation.loop ? 0 : prev;
          }
          return next;
        });
        lastFrameTime.current = timestamp;
      }
      
      if (isPlaying) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };
    
    animationRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, selectedAnimation, localAnimations]);

  // Draw preview
  useEffect(() => {
    if (!canvasRef.current || !spriteSheetUrl || localAnimations.length === 0) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const animation = localAnimations[selectedAnimation];
      if (!animation || animation.frames.length === 0) return;
      
      const frameIndex = animation.frames[Math.min(currentFrame, animation.frames.length - 1)];
      const col = frameIndex % cols;
      const row = Math.floor(frameIndex / cols);
      
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        img,
        col * localFrameWidth,
        row * localFrameHeight,
        localFrameWidth,
        localFrameHeight,
        0,
        0,
        canvas.width,
        canvas.height
      );
    };
    img.src = spriteSheetUrl;
  }, [spriteSheetUrl, localFrameWidth, localFrameHeight, currentFrame, selectedAnimation, localAnimations, cols]);

  const handleFrameConfigChange = () => {
    // Validate frame dimensions before updating
    const validWidth = Math.max(8, Math.min(512, localFrameWidth));
    const validHeight = Math.max(8, Math.min(512, localFrameHeight));
    
    setLocalFrameWidth(validWidth);
    setLocalFrameHeight(validHeight);
    
    onChange({
      frameWidth: validWidth,
      frameHeight: validHeight,
      imageWidth: imageSize.width || undefined,
      imageHeight: imageSize.height || undefined,
      animations: localAnimations
    });
  };

  const addAnimation = () => {
    const newAnimation: SpriteAnimation = {
      name: `animation_${localAnimations.length + 1}`,
      frames: [0],
      frameDuration: 100,
      loop: true
    };
    const newAnimations = [...localAnimations, newAnimation];
    setLocalAnimations(newAnimations);
    setSelectedAnimation(localAnimations.length);
    // Call onChange to persist the new animation
    onChange({
      frameWidth: localFrameWidth,
      frameHeight: localFrameHeight,
      imageWidth: imageSize.width || undefined,
      imageHeight: imageSize.height || undefined,
      animations: newAnimations
    });
  };

  const updateAnimation = (index: number, updates: Partial<SpriteAnimation>) => {
    const newAnimations = [...localAnimations];
    newAnimations[index] = { ...newAnimations[index], ...updates };
    setLocalAnimations(newAnimations);
    onChange({
      frameWidth: localFrameWidth,
      frameHeight: localFrameHeight,
      imageWidth: imageSize.width || undefined,
      imageHeight: imageSize.height || undefined,
      animations: newAnimations
    });
  };

  const deleteAnimation = (index: number) => {
    const newAnimations = localAnimations.filter((_, i) => i !== index);
    setLocalAnimations(newAnimations);
    if (selectedAnimation >= newAnimations.length) {
      setSelectedAnimation(Math.max(0, newAnimations.length - 1));
    }
    onChange({
      frameWidth: localFrameWidth,
      frameHeight: localFrameHeight,
      imageWidth: imageSize.width || undefined,
      imageHeight: imageSize.height || undefined,
      animations: newAnimations
    });
  };

  const toggleFrameInAnimation = (frameIndex: number) => {
    if (localAnimations.length === 0) return;
    
    const animation = localAnimations[selectedAnimation];
    const frames = [...animation.frames];
    const idx = frames.indexOf(frameIndex);
    
    if (idx >= 0) {
      frames.splice(idx, 1);
    } else {
      frames.push(frameIndex);
      frames.sort((a, b) => a - b);
    }
    
    updateAnimation(selectedAnimation, { frames });
  };

  // Render grid cells safely
  const renderGridCells = () => {
    const cells: JSX.Element[] = [];
    
    // Only render if dimensions are reasonable
    if (cols > 0 && rows > 0 && cols <= MAX_DIMENSION && rows <= MAX_DIMENSION) {
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const frameIndex = row * cols + col;
          const isSelected = localAnimations[selectedAnimation]?.frames.includes(frameIndex);
          
          cells.push(
            <div
              key={`${row}-${col}`}
              className={`absolute border-2 ${
                isSelected
                  ? 'border-blue-500 bg-blue-500 bg-opacity-40'
                  : 'border-gray-400 border-dashed hover:bg-yellow-300 hover:bg-opacity-40 hover:border-yellow-500 hover:border-solid'
              } pointer-events-auto cursor-pointer transition-colors`}
              style={{
                left: col * localFrameWidth * zoom,
                top: row * localFrameHeight * zoom,
                width: localFrameWidth * zoom,
                height: localFrameHeight * zoom
              }}
              onClick={() => toggleFrameInAnimation(frameIndex)}
              title={`Frame ${frameIndex}`}
            >
              <span className="absolute top-0 left-0 text-xs bg-black bg-opacity-50 text-white px-1">
                {frameIndex}
              </span>
            </div>
          );
        }
      }
    }
    
    return cells;
  };

  return (
    <div className="space-y-4">
      {/* Frame Configuration */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <h4 className="font-medium mb-3 flex items-center gap-2">
          <Grid className="w-4 h-4" />
          Frame Configuration
        </h4>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Frame Width</label>
            <input
              type="number"
              value={localFrameWidth}
              onChange={(e) => {
                const val = Number(e.target.value);
                if (val > 0 && val <= 512) {
                  setLocalFrameWidth(val);
                }
              }}
              onBlur={handleFrameConfigChange}
              className="w-full px-2 py-1 border rounded text-sm"
              min="8"
              max="512"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Frame Height</label>
            <input
              type="number"
              value={localFrameHeight}
              onChange={(e) => {
                const val = Number(e.target.value);
                if (val > 0 && val <= 512) {
                  setLocalFrameHeight(val);
                }
              }}
              onBlur={handleFrameConfigChange}
              className="w-full px-2 py-1 border rounded text-sm"
              min="8"
              max="512"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Total Frames</label>
            <div className="px-2 py-1 bg-gray-100 rounded text-sm">
              {totalFrames} ({cols}×{rows})
            </div>
          </div>
        </div>
        {/* Show detected image dimensions for debugging */}
        {imageSize.width > 0 && imageSize.height > 0 && (
          <div className="mt-2 text-xs text-gray-500">
            Image: {imageSize.width}×{imageSize.height}px
          </div>
        )}
        {gridWarning && (
          <div className="mt-2 text-xs text-yellow-600 bg-yellow-50 p-2 rounded">
            ⚠️ {gridWarning}
          </div>
        )}
      </div>

      {/* Sprite Sheet Grid */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h4 className="font-medium">Sprite Sheet</h4>
            {localAnimations.length > 0 && (
              <p className="text-xs text-gray-500">Click cells to add frames to selected animation</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowGrid(!showGrid)}
              className={`p-1 rounded ${showGrid ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100'}`}
              title="Toggle Grid"
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setZoom(Math.max(1, zoom - 0.5))}
              className="p-1 hover:bg-gray-100 rounded"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs text-gray-600 px-2">{zoom}x</span>
            <button
              onClick={() => setZoom(Math.min(4, zoom + 0.5))}
              className="p-1 hover:bg-gray-100 rounded"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        <div className="overflow-auto max-h-64 bg-white border rounded p-2">
          {spriteSheetUrl ? (
            <div 
              className="relative inline-block"
              style={{
                width: imageSize.width * zoom,
                height: imageSize.height * zoom,
                backgroundImage: `url(${spriteSheetUrl})`,
                backgroundSize: `${imageSize.width * zoom}px ${imageSize.height * zoom}px`,
                imageRendering: 'pixelated'
              }}
            >
              {showGrid && (
                <div className="absolute inset-0 pointer-events-none">
                  {renderGridCells()}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              No sprite sheet loaded
            </div>
          )}
        </div>
      </div>

      {/* Animation Configuration */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-medium">Animations</h4>
          <button
            onClick={addAnimation}
            className="px-2 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 flex items-center gap-1"
          >
            <Plus className="w-3 h-3" />
            Add Animation
          </button>
        </div>
        
        {localAnimations.length > 0 ? (
          <div className="space-y-2">
            {localAnimations.map((animation, index) => (
              <div
                key={index}
                className={`border rounded-lg p-3 cursor-pointer ${
                  selectedAnimation === index ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50'
                }`}
                onClick={() => setSelectedAnimation(index)}
              >
                <div className="flex items-center justify-between mb-2">
                  <input
                    type="text"
                    value={animation.name}
                    onChange={(e) => updateAnimation(index, { name: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                    className="font-medium bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 outline-none"
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteAnimation(index);
                    }}
                    className="p-1 text-red-500 hover:bg-red-50 rounded"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <label className="block text-xs text-gray-600">Duration (ms)</label>
                    <input
                      type="number"
                      value={animation.frameDuration}
                      onChange={(e) => updateAnimation(index, { frameDuration: Number(e.target.value) })}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full px-1 py-0.5 border rounded text-xs"
                      min="10"
                      max="1000"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600">Frames</label>
                    <div className="px-1 py-0.5 bg-gray-100 rounded text-xs">
                      {animation.frames.length}
                    </div>
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-1 text-xs">
                      <input
                        type="checkbox"
                        checked={animation.loop}
                        onChange={(e) => updateAnimation(index, { loop: e.target.checked })}
                        onClick={(e) => e.stopPropagation()}
                      />
                      Loop
                    </label>
                  </div>
                </div>
                
                {selectedAnimation === index && (
                  <div className="mt-2 pt-2 border-t border-gray-200">
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-xs text-gray-600">
                        {animation.frames.length > 0
                          ? `Selected frames: ${animation.frames.join(', ')}`
                          : <span className="text-amber-600">No frames selected</span>
                        }
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowFrameSelector(true);
                        }}
                        className="px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
                      >
                        Select Frames
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-4 text-gray-500 text-sm">
            No animations configured. Click "Add Animation" to start.
          </div>
        )}
      </div>

      {/* Animation Preview */}
      {localAnimations.length > 0 && localAnimations[selectedAnimation]?.frames.length > 0 && (
        <div className="bg-gray-50 p-4 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium">Preview</h4>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setIsPlaying(!isPlaying);
                  setCurrentFrame(0);
                  lastFrameTime.current = 0;
                }}
                className={`p-2 rounded ${
                  isPlaying ? 'bg-red-500 text-white' : 'bg-blue-500 text-white'
                } hover:opacity-90`}
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
              <button
                onClick={() => setCurrentFrame(0)}
                className="p-2 bg-gray-200 rounded hover:bg-gray-300"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>
          
          <div className="flex items-center justify-center p-2 bg-white rounded border">
            <canvas
              ref={canvasRef}
              width={localFrameWidth * 2}
              height={localFrameHeight * 2}
              className="border"
              style={{ imageRendering: 'pixelated' }}
            />
          </div>
          
          <div className="mt-2 text-center text-sm text-gray-600">
            Frame {currentFrame + 1} of {localAnimations[selectedAnimation].frames.length}
          </div>
        </div>
      )}

      {/* Frame Selector Modal */}
      {showFrameSelector && localAnimations.length > 0 && (
        <FrameSelectorModal
          spriteSheetUrl={spriteSheetUrl}
          frameWidth={localFrameWidth}
          frameHeight={localFrameHeight}
          imageWidth={imageSize.width}
          imageHeight={imageSize.height}
          totalFrames={totalFrames}
          cols={cols}
          selectedFrames={localAnimations[selectedAnimation]?.frames || []}
          onConfirm={(frames) => {
            updateAnimation(selectedAnimation, { frames });
            setShowFrameSelector(false);
          }}
          onCancel={() => setShowFrameSelector(false)}
        />
      )}
    </div>
  );
};

/**
 * FrameSelectorModal - Visual frame selector for animations
 */
interface FrameSelectorModalProps {
  spriteSheetUrl: string;
  frameWidth: number;
  frameHeight: number;
  imageWidth: number;
  imageHeight: number;
  totalFrames: number;
  cols: number;
  selectedFrames: number[];
  onConfirm: (frames: number[]) => void;
  onCancel: () => void;
}

const FrameSelectorModal: React.FC<FrameSelectorModalProps> = ({
  spriteSheetUrl,
  frameWidth,
  frameHeight,
  imageWidth,
  imageHeight,
  totalFrames,
  cols,
  selectedFrames: initialSelectedFrames,
  onConfirm,
  onCancel,
}) => {
  const [selectedFrames, setSelectedFrames] = useState<number[]>(initialSelectedFrames);
  const [zoom, setZoom] = useState(2);

  const toggleFrame = (frameIndex: number) => {
    setSelectedFrames(prev => {
      if (prev.includes(frameIndex)) {
        return prev.filter(f => f !== frameIndex);
      } else {
        return [...prev, frameIndex].sort((a, b) => a - b);
      }
    });
  };

  const selectRange = (start: number, end: number) => {
    const frames = [];
    for (let i = Math.min(start, end); i <= Math.max(start, end); i++) {
      frames.push(i);
    }
    setSelectedFrames(frames);
  };

  const selectAll = () => {
    setSelectedFrames(Array.from({ length: totalFrames }, (_, i) => i));
  };

  const clearAll = () => {
    setSelectedFrames([]);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-[60] flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl max-h-[90vh] flex flex-col m-4">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-800">Select Frames for Animation</h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-4 px-4 py-2 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setZoom(Math.max(1, zoom - 0.5))}
              className="px-2 py-1 text-sm border rounded hover:bg-gray-100"
            >
              Zoom -
            </button>
            <span className="text-sm text-gray-600">{zoom}x</span>
            <button
              onClick={() => setZoom(Math.min(4, zoom + 0.5))}
              className="px-2 py-1 text-sm border rounded hover:bg-gray-100"
            >
              Zoom +
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={selectAll}
              className="px-2 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
            >
              Select All
            </button>
            <button
              onClick={clearAll}
              className="px-2 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
            >
              Clear All
            </button>
          </div>
          <div className="text-sm text-gray-600">
            Selected: {selectedFrames.length} / {totalFrames} frames
          </div>
        </div>

        {/* Instructions */}
        <div className="px-4 py-2 bg-blue-50 text-sm text-blue-700 border-b border-blue-100">
          Click on frames to select/deselect. Hold Shift and click two frames to select a range.
        </div>

        {/* Frame Grid */}
        <div className="flex-1 overflow-auto p-4">
          <div
            className="relative inline-block"
            style={{
              width: imageWidth * zoom,
              height: imageHeight * zoom,
              backgroundImage: `url(${spriteSheetUrl})`,
              backgroundSize: `${imageWidth * zoom}px ${imageHeight * zoom}px`,
              imageRendering: 'pixelated',
            }}
          >
            {/* Render clickable frame cells */}
            {Array.from({ length: totalFrames }, (_, frameIndex) => {
              const col = frameIndex % cols;
              const row = Math.floor(frameIndex / cols);
              const isSelected = selectedFrames.includes(frameIndex);

              return (
                <div
                  key={frameIndex}
                  className={`absolute border-2 cursor-pointer transition-colors ${
                    isSelected
                      ? 'border-blue-500 bg-blue-500 bg-opacity-40'
                      : 'border-gray-400 border-dashed hover:bg-yellow-300 hover:bg-opacity-40 hover:border-yellow-500 hover:border-solid'
                  }`}
                  style={{
                    left: col * frameWidth * zoom,
                    top: row * frameHeight * zoom,
                    width: frameWidth * zoom,
                    height: frameHeight * zoom,
                  }}
                  onClick={(e) => {
                    if (e.shiftKey && selectedFrames.length > 0) {
                      const lastSelected = selectedFrames[selectedFrames.length - 1];
                      selectRange(lastSelected, frameIndex);
                    } else {
                      toggleFrame(frameIndex);
                    }
                  }}
                  title={`Frame ${frameIndex}`}
                >
                  <span className="absolute top-0 left-0 text-xs bg-black bg-opacity-60 text-white px-1 rounded-br">
                    {frameIndex}
                  </span>
                  {isSelected && (
                    <span className="absolute bottom-0 right-0 text-xs bg-blue-500 text-white px-1 rounded-tl">
                      ✓
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
          <div className="text-sm text-gray-600">
            {selectedFrames.length > 0 && `Order: ${selectedFrames.join(', ')}`}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              onClick={() => onConfirm(selectedFrames)}
              className="px-4 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Apply ({selectedFrames.length} frames)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
