import React, { useState, useRef, useCallback, useEffect } from 'react';
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
  AlignHorizontalJustifyStart,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter,
  Magnet,
  Group,
  Ungroup,
} from 'lucide-react';
import type { Asset } from '../assets/AssetManager';
import type { Location } from '@asaps/core';
import type { Character } from '../../types/character';
import type { GlobalSettings } from '../settings/GlobalSettingsInspector';
import type { ThemeAssetUrls } from '../../hooks/useThemes';
import {
  PositionedBeatView,
  createPositionedElementData,
  type PositionedElementData
} from '@asaps/renderer';
import { convertGlobalSettingsToTheme } from '../../utils/themeConverter';
import {
  alignLeft, alignRight, alignTop, alignBottom,
  alignCenterH, alignCenterV, distributeH, distributeV,
} from './alignmentUtils';
import { computeSnap, type SnapLine } from './snapGuides';

/**
 * Helper to resolve fresh image URL from assets using assetId.
 * Character state images stored with blob URLs become stale after page reload.
 */
function resolveCharacterImageUrl(
  state: { visual?: { assetId?: string; image?: string } } | undefined,
  defaultImage: string | undefined,
  assets: Asset[]
): string | undefined {
  if (!state?.visual) {
    return defaultImage;
  }

  // Try to resolve via assetId first (this gives fresh blob URLs)
  if (state.visual.assetId) {
    const asset = assets.find(a => a.id === state.visual!.assetId);
    if (asset?.url) {
      return asset.url;
    }
  }

  // Fall back to stored image URL (may be stale blob URL)
  return state.visual.image || defaultImage;
}

export interface VisualElement {
  id: string;
  type: 'character' | 'prop' | 'text' | 'hotspot' | 'dialog' | 'button' | 'meter';
  assetId?: string;
  assetUrl?: string; // Resolved URL from assetId or character state (for rendering)
  imageUrl?: string; // Direct image URL (for base64 data or when assetId is not available)
  characterId?: string; // For character elements, links to Character definition
  stateId?: string; // Which character state to display
  characterName?: string; // Character name for ASML export
  size?: number; // Scale percentage for characters (e.g., 90 = 90% scale)
  text?: string;
  speaker?: string;
  content?: string;  // Direct content for phase-aware rendering (overrides schema-derived content)
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
  soundAssetId?: string; // Asset ID for the sound (preferred over sound which may be blob URL)
  // Font properties for text elements
  font?: string;
  fontSize?: number;
  textAlign?: 'left' | 'center' | 'right';
  fontOverridden?: boolean;  // True if font/size explicitly set, false = use theme defaults
  // Scroll behavior properties (for text/dialog elements)
  requireScrollToBottom?: boolean;  // If true, continue button disabled until user scrolls to bottom
  manuallyResized?: boolean;        // User has manually resized - skip auto-sizing on content change
  initialAutoSized?: boolean;       // Was auto-sized on creation
  // Hotspot override properties (per-element)
  hotspotOverride?: {
    enabled: boolean;
    opacity?: number;  // 0-100 percentage
    showInPreview?: 'visible' | 'onHover' | 'invisible';
  };
  // Meter-specific properties (for type='meter')
  counterName?: string;      // Name of the counter to display
  meterOrientation?: 'horizontal' | 'vertical';
  showNumericValue?: boolean;
  numericFormat?: 'value' | 'fraction' | 'percentage';
  meterColor?: string;       // Bar fill color
  meterBackgroundColor?: string;  // Bar background color
  // Grouping
  groupId?: string;  // Elements with the same groupId are treated as a group
}

interface VisualBeatEditorProps {
  backgroundAssetId?: string;
  backgroundUrl?: string; // Direct URL from ASML import
  backgroundSound?: string;
  elements: VisualElement[];
  onElementsChange: (elements: VisualElement[]) => void;
  assets: Asset[];
  characters?: Character[]; // Characters for resolving character element images
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
  selectedElements: string[];
  onSelectElements: (elementIds: string[]) => void;
  projectSettings?: {
    width: number;
    height: number;
    aspectRatio: string;
    scalingMode: string;
  };
  boxVisibility?: 'all' | 'hideText' | 'hideAll';
  globalSettings?: GlobalSettings;
  themeAssets?: ThemeAssetUrls | null;
}

export const VisualBeatEditor: React.FC<VisualBeatEditorProps> = ({
  backgroundAssetId,
  backgroundUrl: backgroundUrlProp,
  backgroundSound,
  elements = [],
  onElementsChange,
  assets,
  characters = [],
  onSelectAsset,
  onOpenCharacterManager,
  beatContent,
  beatType,
  selectedElements,
  onSelectElements,
  projectSettings,
  boxVisibility,
  globalSettings,
  themeAssets,
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [draggedElement, setDraggedElement] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Resize state
  const [resizingElement, setResizingElement] = useState<string | null>(null);
  const [resizeCorner, setResizeCorner] = useState<'nw' | 'ne' | 'sw' | 'se' | null>(null);
  const [resizeStart, setResizeStart] = useState({ mouseX: 0, mouseY: 0, x: 0, y: 0, width: 0, height: 0 });

  // Marquee (rubber band) selection state
  const [marquee, setMarquee] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);

  // Snap guides state
  const [activeGuides, setActiveGuides] = useState<SnapLine[]>([]);
  const [snappingEnabled, setSnappingEnabled] = useState(true);

  // Multi-drag offset tracking: stores offsets for all selected elements during drag
  const dragOffsetsRef = useRef<Map<string, { dx: number; dy: number }>>(new Map());

  // Use stage size from project settings, with fallback to 1024×768
  const stageWidth = projectSettings?.width || 1024;
  const stageHeight = projectSettings?.height || 768;
  const [zoom, setZoom] = useState(1);
  const [showGrid, setShowGrid] = useState(true);
  const activeBoxVisibility = boxVisibility || 'all';
  const [tool, setTool] = useState<'select' | 'hotspot' | 'text' | 'character' | 'prop'>('select');

  const backgroundAsset = assets.find(a => a.id === backgroundAssetId);
  // Prioritize asset lookup (fresh URL) over direct URL (may be stale blob URL)
  const resolvedBackgroundUrl = backgroundAsset?.url || backgroundUrlProp;

  // Get stage background color from global settings (used when no background image is set)
  const stageBackgroundColor = globalSettings?.colors?.bgColor || 'transparent';

  // Convenience: first selected element (for single-select operations like resize)
  const selectedElement = selectedElements.length > 0 ? selectedElements[0] : null;

  // Keyboard handler for arrow key nudge and delete
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if typing in an input field
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (selectedElements.length === 0) return;

      const step = e.shiftKey ? 10 : 1;
      let dx = 0, dy = 0;
      switch (e.key) {
        case 'ArrowUp': dy = -step; break;
        case 'ArrowDown': dy = step; break;
        case 'ArrowLeft': dx = -step; break;
        case 'ArrowRight': dx = step; break;
        case 'Delete': case 'Backspace': {
          e.preventDefault();
          const selectedSet = new Set(selectedElements);
          const updated = elements.filter(el => !selectedSet.has(el.id) || el.locked);
          onElementsChange(updated);
          onSelectElements([]);
          return;
        }
        // Select all with Cmd/Ctrl+A
        case 'a': case 'A':
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            const allIds = elements.filter(el => el.visible && !el.locked).map(el => el.id);
            onSelectElements(allIds);
            return;
          }
          return;
        default: return;
      }
      e.preventDefault();

      const selectedSet = new Set(selectedElements);
      const updated = elements.map(el => {
        if (!selectedSet.has(el.id) || el.locked) return el;
        return {
          ...el,
          x: Math.max(0, Math.min(stageWidth - el.width, el.x + dx)),
          y: Math.max(0, Math.min(stageHeight - el.height, el.y + dy)),
        };
      });
      onElementsChange(updated);
    };

    el.addEventListener('keydown', handleKeyDown);
    return () => el.removeEventListener('keydown', handleKeyDown);
  }, [selectedElements, elements, stageWidth, stageHeight, onElementsChange, onSelectElements]);

  // Debug logging for background
  console.log(`[VisualBeatEditor] backgroundAssetId="${backgroundAssetId}", found=${!!backgroundAsset}, url="${resolvedBackgroundUrl?.substring(0, 80) || 'none'}", assets.length=${assets.length}`);

  // Convert VisualElements to Location objects for the renderer
  const locationsForRenderer: Location[] = elements
    .filter(el => el.visible)
    .sort((a, b) => a.z - b.z)
    .map(el => ({
      name: el.name,
      id: el.id,  // Include element ID for animation targeting
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
      // Character-specific fields
      characterId: el.characterId,
      characterName: el.characterName,
      stateId: el.stateId,
      size: el.size,
      // Include font properties directly in Location (only if explicitly overridden)
      font: el.fontOverridden ? el.font : undefined,
      fontSize: el.fontOverridden ? el.fontSize : undefined,
      textAlign: el.textAlign,
      // Only autosize if font is not explicitly overridden
      autosize: !el.fontOverridden || el.fontSize === undefined,
      // Pass content directly from visual element (for phase-aware rendering)
      // Use el.content if explicitly set, otherwise fall back to el.text
      content: el.content || el.text,
      // Meter-specific fields
      counterName: el.counterName,
      meterOrientation: el.meterOrientation,
      showNumericValue: el.showNumericValue,
      numericFormat: el.numericFormat,
      meterColor: el.meterColor,
      meterBackgroundColor: el.meterBackgroundColor,
      // Scroll behavior properties
      requireScrollToBottom: el.requireScrollToBottom,
      manuallyResized: el.manuallyResized,
      initialAutoSized: el.initialAutoSized,
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
    // For character elements, ALWAYS resolve from characters array
    // This ensures fresh URLs are used after project reload (old blob URLs become invalid)
    if (el.location.kind === 'character') {
      let character: Character | undefined;
      let state: any;

      // Try by characterId first
      if (el.location.characterId) {
        character = characters.find(c => c.id === el.location.characterId);
        if (character) {
          const stateId = el.location.stateId || character.defaultState;
          state = character.states?.find(s => s.id === stateId);
        }
      }

      // Try by characterName if characterId didn't work
      if (!character && el.location.characterName) {
        const charName = el.location.characterName.toLowerCase();
        character = characters.find(c =>
          c.name?.toLowerCase() === charName ||
          c.displayName?.toLowerCase() === charName
        );
        if (character) {
          const stateId = el.location.stateId || character.defaultState;
          state = character.states?.find(s => s.id === stateId);
        }
      }

      // Resolve image URL using helper (handles stale blob URLs via assetId lookup)
      if (character) {
        // For sprite characters, use spriteSheet URL
        if (character.visual?.type === 'sprite' && character.visual.spriteSheet?.url) {
          el.assetUrl = character.visual.spriteSheet.url;
          // Add sprite sheet data for proper frame extraction
          el.spriteSheet = {
            frameWidth: character.visual.spriteSheet.frameWidth,
            frameHeight: character.visual.spriteSheet.frameHeight,
            defaultFrame: 0,
          };
        } else {
          // Static character - resolve from state or default
          const resolvedUrl = resolveCharacterImageUrl(state, character.visual?.defaultImage, assets);
          if (resolvedUrl) {
            el.assetUrl = resolvedUrl;
          }
        }
      }
    }

    // For prop elements, ALWAYS resolve from assets array (fresh URLs)
    if (el.location.kind === 'prop') {
      // Try by assetId first
      if (el.location.assetId) {
        const asset = assets.find(a => a.id === el.location.assetId);
        if (asset) {
          el.assetUrl = asset.url;
        }
      }
      // Try by prop name if assetId didn't work
      if (!el.assetUrl && el.location.name) {
        const propName = el.location.name.toLowerCase();
        const asset = assets.find(a =>
          a.name?.toLowerCase() === propName ||
          a.name?.toLowerCase().includes(propName)
        );
        if (asset) {
          el.assetUrl = asset.url;
        }
      }
    }

    // For other elements, use the original logic
    if (!el.assetUrl) {
      // First try to resolve assetId
      if (el.location.assetId) {
        const asset = assets.find(a => a.id === el.location.assetId);
        if (asset) {
          el.assetUrl = asset.url;
        }
      }
      // If no assetUrl from assetId, use direct imageUrl
      if (!el.assetUrl && el.location.imageUrl) {
        el.assetUrl = el.location.imageUrl;
      }
    }
  });

  // Handle element drag and resize
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();

    // Handle marquee selection
    if (marquee) {
      const currentX = (e.clientX - rect.left) / zoom;
      const currentY = (e.clientY - rect.top) / zoom;
      setMarquee(prev => prev ? { ...prev, currentX, currentY } : null);

      // Calculate marquee bounds in stage coordinates
      // We need to find the stage offset within the canvas
      const stageEl = canvasRef.current.querySelector('[data-stage]') as HTMLElement;
      if (stageEl) {
        const stageRect = stageEl.getBoundingClientRect();
        const stageOffsetX = (stageRect.left - rect.left) / zoom;
        const stageOffsetY = (stageRect.top - rect.top) / zoom;

        const mx1 = Math.min(marquee.startX, currentX) - stageOffsetX;
        const my1 = Math.min(marquee.startY, currentY) - stageOffsetY;
        const mx2 = Math.max(marquee.startX, currentX) - stageOffsetX;
        const my2 = Math.max(marquee.startY, currentY) - stageOffsetY;

        const intersecting = elements
          .filter(el => el.visible && !el.locked)
          .filter(el => {
            return el.x < mx2 && el.x + el.width > mx1 &&
                   el.y < my2 && el.y + el.height > my1;
          })
          .map(el => el.id);

        onSelectElements(intersecting);
      }
      return;
    }

    // Handle resizing
    if (resizingElement && resizeCorner) {
      const deltaX = (e.clientX - resizeStart.mouseX) / zoom;
      const deltaY = (e.clientY - resizeStart.mouseY) / zoom;

      let newX = resizeStart.x;
      let newY = resizeStart.y;
      let newWidth = resizeStart.width;
      let newHeight = resizeStart.height;

      // Adjust based on corner
      if (resizeCorner === 'se') {
        newWidth = Math.max(50, resizeStart.width + deltaX);
        newHeight = Math.max(30, resizeStart.height + deltaY);
      } else if (resizeCorner === 'sw') {
        newWidth = Math.max(50, resizeStart.width - deltaX);
        newHeight = Math.max(30, resizeStart.height + deltaY);
        newX = resizeStart.x + (resizeStart.width - newWidth);
      } else if (resizeCorner === 'ne') {
        newWidth = Math.max(50, resizeStart.width + deltaX);
        newHeight = Math.max(30, resizeStart.height - deltaY);
        newY = resizeStart.y + (resizeStart.height - newHeight);
      } else if (resizeCorner === 'nw') {
        newWidth = Math.max(50, resizeStart.width - deltaX);
        newHeight = Math.max(30, resizeStart.height - deltaY);
        newX = resizeStart.x + (resizeStart.width - newWidth);
        newY = resizeStart.y + (resizeStart.height - newHeight);
      }

      const updatedElements = elements.map(el =>
        el.id === resizingElement ? { ...el, x: newX, y: newY, width: newWidth, height: newHeight, manuallyResized: true } : el
      );
      onElementsChange(updatedElements);
      return;
    }

    // Handle dragging (supports multi-element drag)
    if (!draggedElement) return;

    const draggedEl = elements.find(el => el.id === draggedElement);
    if (!draggedEl) return;

    const scale = draggedEl.scale || 1;

    // Get base dimensions (account for sprite characters)
    let baseWidth = draggedEl.width;
    let baseHeight = draggedEl.height;
    if (draggedEl.type === 'character' && draggedEl.characterId) {
      const char = characters.find(c => c.id === draggedEl.characterId);
      if (char?.visual?.type === 'sprite' && char.visual.spriteSheet) {
        baseWidth = char.visual.spriteSheet.frameWidth;
        baseHeight = char.visual.spriteSheet.frameHeight;
      }
    }

    // Calculate effective dimensions
    const effectiveWidth = baseWidth * scale;
    const effectiveHeight = baseHeight * scale;

    // Calculate the new effective position (where user is dragging to)
    let newEffectiveX = Math.max(0, Math.min(stageWidth - effectiveWidth,
      (e.clientX - rect.left) / zoom - dragOffset.x));
    let newEffectiveY = Math.max(0, Math.min(stageHeight - effectiveHeight,
      (e.clientY - rect.top) / zoom - dragOffset.y));

    // Convert effective position back to base position
    let newX = newEffectiveX - (baseWidth - effectiveWidth) / 2;
    let newY = newEffectiveY - (baseHeight - effectiveHeight) / 2;

    // Snap guides
    if (snappingEnabled) {
      const selectedSet = new Set(selectedElements);
      const otherRects = elements
        .filter(el => el.visible && !selectedSet.has(el.id))
        .map(el => ({ x: el.x, y: el.y, width: el.width, height: el.height }));

      // If multi-selecting, compute bounding box of all selected elements
      if (selectedElements.length > 1) {
        const offsets = dragOffsetsRef.current;
        const selectedEls = elements.filter(el => selectedSet.has(el.id));
        // Compute where each element would be
        const projectedRects = selectedEls.map(sel => {
          const off = offsets.get(sel.id) || { dx: 0, dy: 0 };
          return {
            x: newX + off.dx,
            y: newY + off.dy,
            width: sel.width,
            height: sel.height,
          };
        });
        const bboxX = Math.min(...projectedRects.map(r => r.x));
        const bboxY = Math.min(...projectedRects.map(r => r.y));
        const bboxRight = Math.max(...projectedRects.map(r => r.x + r.width));
        const bboxBottom = Math.max(...projectedRects.map(r => r.y + r.height));
        const dragRect = { x: bboxX, y: bboxY, width: bboxRight - bboxX, height: bboxBottom - bboxY };
        const snap = computeSnap(dragRect, otherRects, stageWidth, stageHeight);
        const snapDx = snap.snappedX - dragRect.x;
        const snapDy = snap.snappedY - dragRect.y;
        newX += snapDx;
        newY += snapDy;
        setActiveGuides(snap.guides);
      } else {
        const dragRect = { x: newX, y: newY, width: draggedEl.width, height: draggedEl.height };
        const snap = computeSnap(dragRect, otherRects, stageWidth, stageHeight);
        newX = snap.snappedX;
        newY = snap.snappedY;
        setActiveGuides(snap.guides);
      }
    }

    // Apply movement to all selected elements
    if (selectedElements.length > 1 && selectedElements.includes(draggedElement)) {
      const offsets = dragOffsetsRef.current;
      const updatedElements = elements.map(el => {
        if (!selectedElements.includes(el.id) || el.locked) return el;
        if (el.id === draggedElement) {
          return { ...el, x: newX, y: newY };
        }
        const off = offsets.get(el.id);
        if (!off) return el;
        return {
          ...el,
          x: Math.max(0, Math.min(stageWidth - el.width, newX + off.dx)),
          y: Math.max(0, Math.min(stageHeight - el.height, newY + off.dy)),
        };
      });
      onElementsChange(updatedElements);
    } else {
      const updatedElements = elements.map(el =>
        el.id === draggedElement ? { ...el, x: newX, y: newY } : el
      );
      onElementsChange(updatedElements);
    }
  };

  // Handle element drag/resize end
  const handleMouseUp = () => {
    setDraggedElement(null);
    setResizingElement(null);
    setResizeCorner(null);
    setActiveGuides([]);
    dragOffsetsRef.current.clear();
    if (marquee) {
      setMarquee(null);
    }
  };

  // Start resize operation
  const startResize = (e: React.MouseEvent, elementId: string, corner: 'nw' | 'ne' | 'sw' | 'se') => {
    e.stopPropagation();
    e.preventDefault();
    const element = elements.find(el => el.id === elementId);
    if (!element) return;

    setResizingElement(elementId);
    setResizeCorner(corner);
    setResizeStart({
      mouseX: e.clientX,
      mouseY: e.clientY,
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
    });
  };

  // Handle background click (deselect)
  const handleBackgroundClick = useCallback(() => {
    onSelectElements([]);
  }, [onSelectElements]);

  // Add new element
  const addElement = (
    type: 'hotspot' | 'text' | 'character' | 'prop',
    x = 100,
    y = 100,
    assetId?: string,
    characterData?: { characterId: string; characterName: string; stateId: string; imageUrl?: string; size?: number }
  ) => {
    console.log('[addElement] Called with:', { type, x, y, assetId, characterData });
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
      name: type === 'hotspot' ? 'Hotspot' : type === 'text' ? 'Text' : type === 'character' ? (characterData?.characterName || 'Character') : 'Prop',
      text: type === 'text' ? 'New Text' : undefined,
      assetId: type === 'prop' ? assetId : undefined,
      // Character-specific fields
      characterId: type === 'character' ? characterData?.characterId : undefined,
      characterName: type === 'character' ? characterData?.characterName : undefined,
      stateId: type === 'character' ? characterData?.stateId : undefined,
      imageUrl: type === 'character' ? characterData?.imageUrl : undefined,
      size: type === 'character' ? (characterData?.size || 100) : undefined,
      // Font is left undefined to use theme default
      font: undefined,
      fontSize: type === 'text' ? 16 : undefined,
      textAlign: type === 'text' ? 'center' : undefined,
    };
    console.log('[addElement] Created element:', newElement);
    onElementsChange([...elements, newElement]);
    onSelectElements([newElement.id]);
  };

  // Apply alignment operation
  const applyAlignment = (alignFn: (rects: { id: string; x: number; y: number; width: number; height: number }[]) => { id: string; x: number; y: number }[]) => {
    const selectedSet = new Set(selectedElements);
    const selectedRects = elements
      .filter(el => selectedSet.has(el.id) && !el.locked)
      .map(el => ({ id: el.id, x: el.x, y: el.y, width: el.width, height: el.height }));

    if (selectedRects.length < 2) return;

    const updates = alignFn(selectedRects);
    const updateMap = new Map(updates.map(u => [u.id, u]));

    const updatedElements = elements.map(el => {
      const update = updateMap.get(el.id);
      if (!update) return el;
      return { ...el, x: update.x, y: update.y };
    });
    onElementsChange(updatedElements);
  };

  return (
    <div className="h-full bg-gray-100 flex flex-col overflow-hidden">
      {/* Toolbar - Fixed at top */}
      <div className="flex-shrink-0 bg-white border-b border-gray-300 p-2 flex gap-2 items-center shadow-sm flex-wrap">
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
            if (onOpenCharacterManager) {
              onOpenCharacterManager((character) => {
                if (character && character.id) {
                  const defaultState = character.states?.find((s: { id: string }) => s.id === character.defaultState) || character.states?.[0];
                  const imageUrl = defaultState?.visual?.image || character.visual?.defaultImage;
                  const x = (stageWidth / 2) - 75;
                  const y = (stageHeight / 2) - 75;
                  addElement('character', x, y, undefined, {
                    characterId: character.id,
                    characterName: character.name,
                    stateId: defaultState?.id || 'default',
                    imageUrl: imageUrl,
                    size: 100
                  });
                }
              });
            }
          }}
          className={`p-2 rounded ${tool === 'character' ? 'bg-blue-500 text-white' : 'hover:bg-gray-100'}`}
          title="Add Character"
        >
          <User className="w-4 h-4" />
        </button>
        <button
          onClick={() => {
            if (onSelectAsset) {
              onSelectAsset('prop', (selectedAsset) => {
                if (selectedAsset && selectedAsset.id) {
                  const x = (stageWidth / 2) - 75;
                  const y = (stageHeight / 2) - 75;
                  addElement('prop', x, y, selectedAsset.id);
                }
              });
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
        <button
          onClick={() => setSnappingEnabled(!snappingEnabled)}
          className={`p-2 rounded ${snappingEnabled ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-400'}`}
          title={snappingEnabled ? 'Snapping On' : 'Snapping Off'}
        >
          <Magnet className="w-4 h-4" />
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

        {/* Alignment buttons - show when 2+ elements selected */}
        {selectedElements.length >= 2 && (
          <>
            <div className="w-px bg-gray-300 mx-1" />
            <button onClick={() => applyAlignment(alignLeft)} className="p-1.5 rounded hover:bg-gray-100" title="Align Left">
              <AlignHorizontalJustifyStart className="w-4 h-4" />
            </button>
            <button onClick={() => applyAlignment(alignCenterH)} className="p-1.5 rounded hover:bg-gray-100" title="Align Center Horizontally">
              <AlignHorizontalJustifyCenter className="w-4 h-4" />
            </button>
            <button onClick={() => applyAlignment(alignRight)} className="p-1.5 rounded hover:bg-gray-100" title="Align Right">
              <AlignHorizontalJustifyEnd className="w-4 h-4" />
            </button>
            <button onClick={() => applyAlignment(alignTop)} className="p-1.5 rounded hover:bg-gray-100" title="Align Top">
              <AlignVerticalJustifyStart className="w-4 h-4" />
            </button>
            <button onClick={() => applyAlignment(alignCenterV)} className="p-1.5 rounded hover:bg-gray-100" title="Align Center Vertically">
              <AlignVerticalJustifyCenter className="w-4 h-4" />
            </button>
            <button onClick={() => applyAlignment(alignBottom)} className="p-1.5 rounded hover:bg-gray-100" title="Align Bottom">
              <AlignVerticalJustifyEnd className="w-4 h-4" />
            </button>
          </>
        )}
        {/* Distribution buttons - show when 3+ elements selected */}
        {selectedElements.length >= 3 && (
          <>
            <div className="w-px bg-gray-300 mx-1" />
            <button onClick={() => applyAlignment(distributeH)} className="p-1.5 rounded hover:bg-gray-100" title="Distribute Horizontally">
              <AlignHorizontalDistributeCenter className="w-4 h-4" />
            </button>
            <button onClick={() => applyAlignment(distributeV)} className="p-1.5 rounded hover:bg-gray-100" title="Distribute Vertically">
              <AlignVerticalDistributeCenter className="w-4 h-4" />
            </button>
          </>
        )}
        {/* Group/Ungroup buttons - show when 2+ elements selected */}
        {selectedElements.length >= 2 && (
          <>
            <div className="w-px bg-gray-300 mx-1" />
            {(() => {
              const selectedEls = elements.filter(el => selectedElements.includes(el.id));
              const allSameGroup = selectedEls.every(el => el.groupId && el.groupId === selectedEls[0].groupId);
              const anyGrouped = selectedEls.some(el => el.groupId);
              return (
                <>
                  {!allSameGroup && (
                    <button
                      onClick={() => {
                        const gid = `group_${Date.now()}`;
                        const selectedSet = new Set(selectedElements);
                        const updated = elements.map(el =>
                          selectedSet.has(el.id) ? { ...el, groupId: gid } : el
                        );
                        onElementsChange(updated);
                      }}
                      className="p-1.5 rounded hover:bg-gray-100"
                      title="Group Elements"
                    >
                      <Group className="w-4 h-4" />
                    </button>
                  )}
                  {anyGrouped && (
                    <button
                      onClick={() => {
                        const selectedSet = new Set(selectedElements);
                        const updated = elements.map(el =>
                          selectedSet.has(el.id) ? { ...el, groupId: undefined } : el
                        );
                        onElementsChange(updated);
                      }}
                      className="p-1.5 rounded hover:bg-gray-100"
                      title="Ungroup Elements"
                    >
                      <Ungroup className="w-4 h-4" />
                    </button>
                  )}
                </>
              );
            })()}
          </>
        )}

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
          tabIndex={0}
          className="relative flex items-center justify-center p-5"
          style={{
            minWidth: `${stageWidth * zoom + 80}px`,
            minHeight: `${stageHeight * zoom + 80}px`,
            width: 'max-content',
            height: 'max-content',
            outline: 'none',
          }}
          onMouseDown={(e) => {
            // Focus canvas for keyboard events
            canvasRef.current?.focus();
            // Start marquee on background mousedown (not on elements)
            if (tool === 'select' && e.target === e.currentTarget) {
              const rect = canvasRef.current?.getBoundingClientRect();
              if (rect) {
                const x = (e.clientX - rect.left) / zoom;
                const y = (e.clientY - rect.top) / zoom;
                setMarquee({ startX: x, startY: y, currentX: x, currentY: y });
                onSelectElements([]);
              }
            }
          }}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <div
            data-stage
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
                backgroundUrl={resolvedBackgroundUrl}
                backgroundColor={stageBackgroundColor}
                elements={positionedElements}
                interactive={false}
                hideTextBoxes={activeBoxVisibility === 'hideText' || activeBoxVisibility === 'hideAll'}
                hideButtonBoxes={activeBoxVisibility === 'hideAll'}
                editorMode={true}
                theme={globalSettings ? (() => {
                  const baseTheme = convertGlobalSettingsToTheme(globalSettings);
                  return {
                    ...baseTheme,
                    // Disable text animations in visual editor - they should only appear in preview
                    textEffects: {
                      animation: 'none' as const,
                      typewriterSpeed: baseTheme.textEffects?.typewriterSpeed ?? 30,
                      fadeInDuration: baseTheme.textEffects?.fadeInDuration ?? 500,
                    },
                    // Add theme asset URLs for button/textbox graphics
                    textboxFrameUrl: themeAssets?.textboxFrame,
                    buttonNormalUrl: themeAssets?.buttonNormal,
                    buttonHoverUrl: themeAssets?.buttonHover,
                    buttonLayout: themeAssets?.buttonLayout,
                  };
                })() : undefined}
              />

              {/* Draggable overlay for each element */}
              {elements
                .filter(el => el.visible)
                .map(el => {
                  const scale = el.scale || 1;

                  // For sprite characters, use sprite frame dimensions
                  let baseWidth = el.width;
                  let baseHeight = el.height;
                  if (el.type === 'character' && el.characterId) {
                    const char = characters.find(c => c.id === el.characterId);
                    if (char?.visual?.type === 'sprite' && char.visual.spriteSheet) {
                      baseWidth = char.visual.spriteSheet.frameWidth;
                      baseHeight = char.visual.spriteSheet.frameHeight;
                    }
                  }

                  // Calculate effective dimensions and position (accounting for scale with center origin)
                  const effectiveWidth = baseWidth * scale;
                  const effectiveHeight = baseHeight * scale;
                  const effectiveX = el.x + (baseWidth - effectiveWidth) / 2;
                  const effectiveY = el.y + (baseHeight - effectiveHeight) / 2;

                  // Build transform string - only rotation, no scale (we use effective dimensions)
                  const transforms: string[] = [];
                  if (el.rotation) {
                    transforms.push(`rotate(${el.rotation}deg)`);
                  }

                  return (
                    <div
                      key={`drag-overlay-${el.id}`}
                      style={{
                        position: 'absolute',
                        left: `${effectiveX}px`,
                        top: `${effectiveY}px`,
                        width: `${effectiveWidth}px`,
                        height: `${effectiveHeight}px`,
                        zIndex: (el.z || 0) + 1000,
                        cursor: el.locked ? 'not-allowed' : 'move',
                        pointerEvents: 'auto',
                        transform: transforms.length > 0 ? transforms.join(' ') : undefined,
                        transformOrigin: 'center center',
                      }}
                      onMouseDown={(e) => {
                        if (el.locked) return;
                        e.stopPropagation();

                        // Focus canvas for keyboard events
                        canvasRef.current?.focus();

                        const rect = canvasRef.current?.getBoundingClientRect();
                        if (!rect) return;

                        const isMeta = e.metaKey || e.ctrlKey;
                        const isShift = e.shiftKey;

                        // Resolve group members for this element
                        const groupIds = el.groupId
                          ? elements.filter(g => g.groupId === el.groupId).map(g => g.id)
                          : [el.id];

                        if (isMeta) {
                          // Cmd/Ctrl+Click: toggle element (or group) in/out of selection
                          const allInSelection = groupIds.every(id => selectedElements.includes(id));
                          if (allInSelection) {
                            onSelectElements(selectedElements.filter(id => !groupIds.includes(id)));
                          } else {
                            const newSel = new Set([...selectedElements, ...groupIds]);
                            onSelectElements([...newSel]);
                          }
                          return; // Don't start drag on toggle
                        } else if (isShift) {
                          // Shift+Click: add element (or group) to selection
                          const newSel = new Set([...selectedElements, ...groupIds]);
                          onSelectElements([...newSel]);
                          // Don't start drag on shift-click add
                          return;
                        } else if (selectedElements.includes(el.id) && selectedElements.length > 1) {
                          // Click on already-selected element in multi-selection: start drag without changing selection
                        } else {
                          // Plain click: select element's group (or just the element)
                          onSelectElements(groupIds);
                        }

                        // Start drag - compute offsets for all selected elements relative to dragged element
                        setDraggedElement(el.id);
                        setDragOffset({
                          x: (e.clientX - rect.left) / zoom - effectiveX,
                          y: (e.clientY - rect.top) / zoom - effectiveY
                        });

                        // For multi-drag: store offsets of other selected elements relative to this one
                        const offsets = new Map<string, { dx: number; dy: number }>();
                        const currentSelection = selectedElements.includes(el.id) ? selectedElements : [el.id];
                        for (const selId of currentSelection) {
                          if (selId === el.id) continue;
                          const selEl = elements.find(e => e.id === selId);
                          if (selEl && !selEl.locked) {
                            offsets.set(selId, {
                              dx: selEl.x - el.x,
                              dy: selEl.y - el.y,
                            });
                          }
                        }
                        dragOffsetsRef.current = offsets;
                      }}
                    />
                  );
                })}

              {/* Selection indicators overlay */}
              {elements
                .filter(el => el.visible && selectedElements.includes(el.id))
                .map(el => {
                  const scale = el.scale || 1;
                  // `size` is percentage scale for characters/props (e.g., 90 = 90%, 115 = 115%)
                  // Applied with TOP-LEFT origin in the renderer, so no position adjustment needed
                  const sizeScale = el.size !== undefined ? el.size / 100 : 1;

                  // For sprite characters, use sprite frame dimensions
                  let baseWidth = el.width;
                  let baseHeight = el.height;
                  if (el.type === 'character' && el.characterId) {
                    const char = characters.find(c => c.id === el.characterId);
                    if (char?.visual?.type === 'sprite' && char.visual.spriteSheet) {
                      baseWidth = char.visual.spriteSheet.frameWidth;
                      baseHeight = char.visual.spriteSheet.frameHeight;
                    }
                  }

                  const hasSize = el.size !== undefined && (el.type === 'character' || el.type === 'prop');

                  let effectiveWidth: number;
                  let effectiveHeight: number;
                  let effectiveX: number;
                  let effectiveY: number;

                  if (hasSize) {
                    effectiveWidth = baseWidth * sizeScale;
                    effectiveHeight = baseHeight * sizeScale;
                    effectiveX = el.x;
                    effectiveY = el.y;
                  } else {
                    effectiveWidth = baseWidth * scale;
                    effectiveHeight = baseHeight * scale;
                    effectiveX = el.x + (baseWidth - effectiveWidth) / 2;
                    effectiveY = el.y + (baseHeight - effectiveHeight) / 2;
                  }

                  const transforms: string[] = [];
                  if (el.rotation) {
                    transforms.push(`rotate(${el.rotation}deg)`);
                  }

                  const isOnlySelected = selectedElements.length === 1;
                  const isGrouped = !!el.groupId;

                  return (
                    <div
                      key={`selection-${el.id}`}
                      style={{
                        position: 'absolute',
                        left: `${effectiveX}px`,
                        top: `${effectiveY}px`,
                        width: `${effectiveWidth}px`,
                        height: `${effectiveHeight}px`,
                        border: isGrouped ? '2px solid #8b5cf6' : '2px solid #3b82f6',
                        borderRadius: '4px',
                        pointerEvents: 'none',
                        zIndex: 10000,
                        boxShadow: isGrouped
                          ? '0 0 0 1px rgba(255,255,255,0.5), 0 0 20px rgba(139,92,246,0.3)'
                          : '0 0 0 1px rgba(255,255,255,0.5), 0 0 20px rgba(59,130,246,0.3)',
                        transform: transforms.length > 0 ? transforms.join(' ') : undefined,
                        transformOrigin: 'center center',
                      }}
                    >
                    {/* Resize handles - only show when exactly one element is selected */}
                    {isOnlySelected && !el.locked && (
                      <>
                        {/* NW corner */}
                        <div
                          style={{
                            position: 'absolute', top: '-6px', left: '-6px', width: '12px', height: '12px',
                            backgroundColor: '#3b82f6', border: '2px solid white', borderRadius: '50%',
                            cursor: 'nwse-resize', boxShadow: '0 2px 4px rgba(0,0,0,0.2)', pointerEvents: 'auto',
                          }}
                          onMouseDown={(e) => startResize(e, el.id, 'nw')}
                        />
                        {/* NE corner */}
                        <div
                          style={{
                            position: 'absolute', top: '-6px', right: '-6px', width: '12px', height: '12px',
                            backgroundColor: '#3b82f6', border: '2px solid white', borderRadius: '50%',
                            cursor: 'nesw-resize', boxShadow: '0 2px 4px rgba(0,0,0,0.2)', pointerEvents: 'auto',
                          }}
                          onMouseDown={(e) => startResize(e, el.id, 'ne')}
                        />
                        {/* SW corner */}
                        <div
                          style={{
                            position: 'absolute', bottom: '-6px', left: '-6px', width: '12px', height: '12px',
                            backgroundColor: '#3b82f6', border: '2px solid white', borderRadius: '50%',
                            cursor: 'nesw-resize', boxShadow: '0 2px 4px rgba(0,0,0,0.2)', pointerEvents: 'auto',
                          }}
                          onMouseDown={(e) => startResize(e, el.id, 'sw')}
                        />
                        {/* SE corner */}
                        <div
                          style={{
                            position: 'absolute', bottom: '-6px', right: '-6px', width: '12px', height: '12px',
                            backgroundColor: '#3b82f6', border: '2px solid white', borderRadius: '50%',
                            cursor: 'nwse-resize', boxShadow: '0 2px 4px rgba(0,0,0,0.2)', pointerEvents: 'auto',
                          }}
                          onMouseDown={(e) => startResize(e, el.id, 'se')}
                        />
                      </>
                    )}
                  </div>
                  );
                })}

              {/* Snap guide lines */}
              {activeGuides.map((guide, i) => (
                <div
                  key={`guide-${i}`}
                  style={{
                    position: 'absolute',
                    ...(guide.orientation === 'vertical'
                      ? { left: `${guide.position}px`, top: 0, width: '1px', height: '100%' }
                      : { top: `${guide.position}px`, left: 0, height: '1px', width: '100%' }),
                    backgroundColor: guide.type === 'stage-center' ? '#f59e0b' : '#ec4899',
                    pointerEvents: 'none',
                    zIndex: 20001,
                    opacity: 0.7,
                  }}
                />
              ))}

              {/* Marquee selection overlay */}
              {marquee && (() => {
                const stageEl = canvasRef.current?.querySelector('[data-stage]') as HTMLElement;
                if (!stageEl || !canvasRef.current) return null;
                const canvasRect = canvasRef.current.getBoundingClientRect();
                const stageRect = stageEl.getBoundingClientRect();
                const stageOffsetX = (stageRect.left - canvasRect.left) / zoom;
                const stageOffsetY = (stageRect.top - canvasRect.top) / zoom;
                const mx = Math.min(marquee.startX, marquee.currentX) - stageOffsetX;
                const my = Math.min(marquee.startY, marquee.currentY) - stageOffsetY;
                const mw = Math.abs(marquee.currentX - marquee.startX);
                const mh = Math.abs(marquee.currentY - marquee.startY);
                return (
                  <div
                    style={{
                      position: 'absolute',
                      left: `${mx}px`,
                      top: `${my}px`,
                      width: `${mw}px`,
                      height: `${mh}px`,
                      border: '1px dashed #3b82f6',
                      backgroundColor: 'rgba(59, 130, 246, 0.08)',
                      pointerEvents: 'none',
                      zIndex: 20002,
                    }}
                  />
                );
              })()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
