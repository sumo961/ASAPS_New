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
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const lastFrameTime = useRef<number>(0);

  // Load sprite sheet image dimensions
  useEffect(() => {
    if (!spriteSheetUrl) return;
    
    const img = new Image();
    img.onload = () => {
      setImageSize({ width: img.width, height: img.height });
    };
    img.onerror = () => {
      console.error('Failed to load sprite sheet image:', spriteSheetUrl);
      setImageSize({ width: 0, height: 0 });
    };
    img.src = spriteSheetUrl;
  }, [spriteSheetUrl]);

  // Calculate grid dimensions with safety checks
  const calculateGridDimensions = () => {
    // Ensure frame dimensions are valid
    const safeFrameWidth = Math.max(1, localFrameWidth || 1);
    const safeFrameHeight = Math.max(1, localFrameHeight || 1);
    
    // Calculate potential grid dimensions
    let cols = Math.floor(imageSize.width / safeFrameWidth) || 1;
    let rows = Math.floor(imageSize.height / safeFrameHeight) || 1;
    
    // Apply safety limits
    cols = Math.min(cols, MAX_DIMENSION);
    rows = Math.min(rows, MAX_DIMENSION);
    
    // Check total cells
    const totalCells = cols * rows;
    if (totalCells > MAX_GRID_CELLS) {
      // Scale down proportionally
      const scale = Math.sqrt(MAX_GRID_CELLS / totalCells);
      cols = Math.max(1, Math.floor(cols * scale));
      rows = Math.max(1, Math.floor(rows * scale));
      setGridWarning(`Grid limited to ${cols}×${rows} to prevent memory overflow`);
    } else {
      setGridWarning(null);
    }
    
    return { cols, rows, totalFrames: cols * rows };
  };
  
  const { cols, rows, totalFrames } = calculateGridDimensions();

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
    setLocalAnimations([...localAnimations, newAnimation]);
    setSelectedAnimation(localAnimations.length);
  };

  const updateAnimation = (index: number, updates: Partial<SpriteAnimation>) => {
    const newAnimations = [...localAnimations];
    newAnimations[index] = { ...newAnimations[index], ...updates };
    setLocalAnimations(newAnimations);
    onChange({
      frameWidth: localFrameWidth,
      frameHeight: localFrameHeight,
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
              className={`absolute border ${
                isSelected 
                  ? 'border-blue-500 bg-blue-500 bg-opacity-30' 
                  : 'border-gray-300 hover:bg-gray-500 hover:bg-opacity-20'
              } pointer-events-auto cursor-pointer`}
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
        {gridWarning && (
          <div className="mt-2 text-xs text-yellow-600 bg-yellow-50 p-2 rounded">
            ⚠️ {gridWarning}
          </div>
        )}
      </div>

      {/* Sprite Sheet Grid */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-medium">Sprite Sheet</h4>
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
                
                {selectedAnimation === index && animation.frames.length > 0 && (
                  <div className="mt-2 text-xs text-gray-600">
                    Frames: {animation.frames.join(', ')}
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
          
          <div className="flex items-center justify-center p-4 bg-white rounded border">
            <canvas
              ref={canvasRef}
              width={localFrameWidth * 3}
              height={localFrameHeight * 3}
              className="border"
              style={{ imageRendering: 'pixelated' }}
            />
          </div>
          
          <div className="mt-2 text-center text-sm text-gray-600">
            Frame {currentFrame + 1} of {localAnimations[selectedAnimation].frames.length}
          </div>
        </div>
      )}
    </div>
  );
};
