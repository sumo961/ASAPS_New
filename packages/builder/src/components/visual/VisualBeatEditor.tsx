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
  Eye,
  LayoutGrid,
} from 'lucide-react';
import type { Asset } from '../assets/AssetManager';
import type { Location } from '@asaps/core';
import type { Character } from '../../types/character';
import type { GlobalSettings } from '../settings/GlobalSettingsInspector';
import type { ThemeAssetUrls } from '../../hooks/useThemes';
import {
  PositionedBeatView,
  createPositionedElementData,
  ChatDialogView,
  type PositionedElementData,
  type ChatMessage,
} from '@asaps/renderer';
import { convertGlobalSettingsToTheme } from '../../utils/themeConverter';
import { resolvePortraitUrl, shouldShowSpeaker, resolveTranslatedSpeakerName } from '../../utils/speakerUtils';
import { useTranslationState } from '../../contexts/TranslationContext';
import { yawPitchToStage, stageToYawPitch, viewportSizeOnStage } from '../../utils/panoramaCoordinates';
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
  type: 'character' | 'prop' | 'text' | 'hotspot' | 'dialog' | 'button' | 'meter' | 'keypad';
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
    showSpeaker?: boolean;
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
  onInteractionStart?: () => void;
  onInteractionEnd?: () => void;
  /**
   * Reset this beat's positioned elements to the schema-default layout.
   * Invoked from the toolbar's "Reset layout" button (visible when set).
   * The parent is responsible for the actual reset — it has the full
   * Beat object and projectSettings needed by initializeLocationsFromSchema.
   * Skip the button entirely by leaving this undefined.
   */
  onResetLayout?: () => void;
  /** Per-beat override for countdown meter visibility */
  overrideCountdownMeter?: boolean;
  /** DialogTree presentation mode - when chat mode, show ChatDialogView preview */
  presentationMode?: 'positioned' | 'chat-scroll' | 'chat-bubble';
  /** Panorama camera viewport overlay */
  panoramaViewport?: {
    pitch: number;   // -90 to 90
    yaw: number;     // -180 to 180
    hfov: number;    // 30 to 120
    projectionType?: string;
    imageAspect?: number;
  };
  onPanoramaViewportChange?: (viewport: { pitch: number; yaw: number; hfov: number }) => void;
  /** Panorama prompt display mode: 'static' or 'pinned' */
  promptDisplay?: 'static' | 'pinned';
  /** External zoom level (persisted across Layout↔Preview switches) */
  initialZoom?: number;
  onZoomChange?: (zoom: number) => void;
  /** External scroll position (persisted across Layout↔Preview switches) */
  initialScroll?: { left: number; top: number };
  onScrollChange?: (scroll: { left: number; top: number }) => void;
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
  onInteractionStart,
  onInteractionEnd,
  onResetLayout,
  overrideCountdownMeter,
  presentationMode,
  panoramaViewport,
  onPanoramaViewportChange,
  promptDisplay,
  initialZoom,
  onZoomChange,
  initialScroll,
  onScrollChange,
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
  const [showHud, setShowHud] = useState(false);

  // Panorama viewport rectangle drag state (uses ref + document listeners to avoid z-index / stale closure issues)
  const viewportDraggingRef = useRef(false);
  const viewportDragStartRef = useRef<{ mouseX: number; mouseY: number; yaw: number; pitch: number } | null>(null);
  const panoramaViewportRef = useRef(panoramaViewport);
  const onPanoramaViewportChangeRef = useRef(onPanoramaViewportChange);
  panoramaViewportRef.current = panoramaViewport;
  onPanoramaViewportChangeRef.current = onPanoramaViewportChange;

  // Mock resolvers for character HUD overlays in editor mode
  const characterMeterFrameResolver = useCallback((characterId: string) => {
    if (!showHud) return null;
    const character = characters.find(c => c.id === characterId);
    if (!character?.meterFrame) return null;
    const visibleCounters = character.counters?.filter(c => c.visible) || [];
    if (visibleCounters.length === 0) return null;
    return {
      counters: visibleCounters.map(counter => ({
        name: counter.name,
        displayName: counter.displayName,
        value: counter.value,
        min: counter.min ?? 0,
        max: counter.max ?? 100,
        color: counter.color || '#3B82F6',
        showNumericValue: counter.showNumericValue ?? false,
        numericFormat: (counter.numericFormat || 'value') as 'value' | 'fraction' | 'percentage',
        orientation: (counter.levelMeterOrientation || 'horizontal') as 'horizontal' | 'vertical',
      })),
      config: character.meterFrame,
    };
  }, [showHud, characters]);

  const characterInventoryResolver = useCallback((characterId: string) => {
    if (!showHud) return null;
    const character = characters.find(c => c.id === characterId);
    if (!character?.inventoryFrame) return null;
    // Show configured inventory items, or placeholder items for preview
    let items = (character.inventory || []).map(item => ({
      id: item.id,
      name: item.name,
      displayName: item.displayName,
      description: item.description,
      icon: item.icon || '',
      quantity: item.quantity,
      category: item.category,
    }));
    // If no items defined, show placeholders so the author can preview frame position
    if (items.length === 0) {
      items = [
        { id: 'placeholder_1', name: 'Item 1', displayName: 'Item 1', description: 'Preview item', icon: '', quantity: 1, category: 'general' },
        { id: 'placeholder_2', name: 'Item 2', displayName: 'Item 2', description: 'Preview item', icon: '', quantity: 1, category: 'general' },
      ];
    }
    return { items, config: character.inventoryFrame };
  }, [showHud, characters]);

  // Multi-drag offset tracking: stores offsets for all selected elements during drag
  const dragOffsetsRef = useRef<Map<string, { dx: number; dy: number }>>(new Map());

  // Computed layout positions from PositionedBeatView (for selection handle alignment)
  const [computedPositions, setComputedPositions] = useState<Map<string, { x: number; y: number; width: number; height: number }>>(new Map());

  // Use stage size from project settings, with fallback to 1024×768
  const stageWidth = projectSettings?.width || 1024;
  const stageHeight = projectSettings?.height || 768;
  const [zoom, setZoomInternal] = useState(initialZoom ?? 1);
  const setZoom = (z: number) => { setZoomInternal(z); onZoomChange?.(z); };
  const [showGrid, setShowGrid] = useState(true);
  const activeBoxVisibility = boxVisibility || 'all';
  const [tool, setTool] = useState<'select' | 'hotspot' | 'text' | 'character' | 'prop'>('select');

  const backgroundAsset = assets.find(a => a.id === backgroundAssetId);
  // Prioritize asset lookup (fresh URL) over direct URL (may be stale blob URL)
  const resolvedBackgroundUrl = backgroundAsset?.url || backgroundUrlProp;

  // Resolve speaker portrait URL from character data
  // Resolve global speaker toggles + per-beat override
  const effectiveShowSpeaker = React.useMemo(() => {
    if (!beatContent?.speaker) return false;
    return shouldShowSpeaker(beatContent?.showSpeaker, globalSettings?.speakerDisplay?.showNames ?? false);
  }, [beatContent?.showSpeaker, beatContent?.speaker, globalSettings?.speakerDisplay?.showNames]);

  const effectiveShowGraphics = globalSettings?.speakerDisplay?.showGraphics ?? false;

  const speakerPortraitUrl = React.useMemo(() => {
    if (!effectiveShowSpeaker || !effectiveShowGraphics || !beatContent?.speaker) {
      if (beatContent?.speaker) {
        console.log(`[VBE] Portrait skipped: showSpeaker=${effectiveShowSpeaker}, showGraphics=${effectiveShowGraphics}, speaker="${beatContent?.speaker}"`);
      }
      return undefined;
    }
    const url = resolvePortraitUrl(beatContent.speaker, characters, assets);
    const graphicPos = globalSettings?.speakerDisplay?.graphicPosition;
    console.log(`[VBE] Portrait resolve: speaker="${beatContent.speaker}", url=${url ? 'found' : 'NOT FOUND'}, graphicPosition="${graphicPos}", showGraphics=${effectiveShowGraphics}`);
    if (!url && characters?.length && beatContent.speaker) {
      const spk = beatContent.speaker;
      const char = characters.find(c => c.displayName?.toLowerCase() === spk.toLowerCase() || c.name?.toLowerCase() === spk.toLowerCase());
      console.log(`[VBE] Character match:`, char ? { name: char.displayName, hasPortrait: !!char.portrait, assetId: char.portrait?.assetId } : 'NO MATCH');
    }
    return url;
  }, [effectiveShowSpeaker, effectiveShowGraphics, beatContent?.speaker, characters, assets]);

  // Resolve translated speaker name when a translation language is active
  const translationState = useTranslationState();
  const resolvedSpeakerName = React.useMemo(() => {
    const raw = beatContent?.speaker;
    if (!raw) return raw;
    return resolveTranslatedSpeakerName(raw, characters, translationState.activeLanguage);
  }, [beatContent?.speaker, characters, translationState.activeLanguage]);


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

  // Panorama viewport drag via document-level listeners (bypasses z-index issues)
  useEffect(() => {
    const handleDocMouseMove = (e: MouseEvent) => {
      if (!viewportDraggingRef.current || !viewportDragStartRef.current) return;
      const vp = panoramaViewportRef.current;
      const onChange = onPanoramaViewportChangeRef.current;
      if (!vp || !onChange) return;

      const stageEl = canvasRef.current?.querySelector('[data-stage]') as HTMLElement;
      if (!stageEl) return;
      const stageRect = stageEl.getBoundingClientRect();

      const deltaPixelX = e.clientX - viewportDragStartRef.current.mouseX;
      const deltaPixelY = e.clientY - viewportDragStartRef.current.mouseY;
      // Convert start yaw/pitch → pixel, add delta, convert back
      const projType = vp.projectionType || 'equirectangular';
      const { centerX: startPx, centerY: startPy } = yawPitchToStage(
        viewportDragStartRef.current.yaw, viewportDragStartRef.current.pitch,
        projType, stageRect.width, stageRect.height, vp.imageAspect
      );
      const { yaw: newYawRaw, pitch: newPitchRaw } = stageToYawPitch(
        startPx + deltaPixelX, startPy + deltaPixelY,
        projType, stageRect.width, stageRect.height, vp.imageAspect
      );
      let newYaw = newYawRaw;
      let newPitch = newPitchRaw;
      while (newYaw > 180) newYaw -= 360;
      while (newYaw < -180) newYaw += 360;
      newPitch = Math.max(-90, Math.min(90, newPitch));
      onChange({
        pitch: Math.round(newPitch * 10) / 10,
        yaw: Math.round(newYaw * 10) / 10,
        hfov: vp.hfov,
      });
    };
    const handleDocMouseUp = () => {
      viewportDraggingRef.current = false;
      viewportDragStartRef.current = null;
    };
    document.addEventListener('mousemove', handleDocMouseMove);
    document.addEventListener('mouseup', handleDocMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleDocMouseMove);
      document.removeEventListener('mouseup', handleDocMouseUp);
    };
  }, []);

  // Debug logging for background
  console.log(`[VisualBeatEditor] backgroundAssetId="${backgroundAssetId}", found=${!!backgroundAsset}, url="${resolvedBackgroundUrl?.substring(0, 80) || 'none'}", assets.length=${assets.length}`);

  // Callback from PositionedBeatView reporting computed layout positions
  const handleLayoutComputed = useCallback((positions: { name: string; id?: string; x: number; y: number; width: number; height: number }[]) => {
    setComputedPositions(prev => {
      // Only update if positions actually changed
      let changed = false;
      if (prev.size !== positions.length) changed = true;
      if (!changed) {
        for (const p of positions) {
          const key = p.id || p.name;
          const existing = prev.get(key);
          if (!existing || existing.x !== p.x || existing.y !== p.y || existing.width !== p.width || existing.height !== p.height) {
            changed = true;
            break;
          }
        }
      }
      if (!changed) return prev;
      const map = new Map<string, { x: number; y: number; width: number; height: number }>();
      for (const p of positions) {
        map.set(p.id || p.name, { x: p.x, y: p.y, width: p.width, height: p.height });
      }
      return map;
    });
  }, []);

  // For panorama beats, identify elements that need custom rendering instead of PositionedBeatView
  const isPanoramaBeat = beatType === 'panorama';

  // Convert VisualElements to Location objects for the renderer
  const locationsForRenderer: Location[] = elements
    .filter(el => el.visible)
    // For panorama beats, skip hotspot and dialog/text elements from PositionedBeatView
    // (they'll be rendered as custom overlays instead)
    .filter(el => !isPanoramaBeat || (el.type !== 'hotspot' && el.type !== 'dialog' && el.type !== 'text'))
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
      fontSize: el.fontSize,
      textAlign: el.textAlign,
      // Only autosize if font is not explicitly overridden
      autosize: !el.fontOverridden || el.fontSize === undefined,
      // Pass content directly from visual element (for phase-aware rendering)
      // When a translation is active, omit content so createPositionedElementData
      // falls through to getContentForLocation() which uses the translated beatContent
      content: translationState.activeLanguage ? undefined : (el.content || el.text),
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
          // Propagate asset type so renderer knows how to display (video vs image)
          if (asset.type) el.location.assetType = asset.type as any;
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
          if (asset.type) el.location.assetType = asset.type as any;
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
    if (draggedElement || resizingElement) {
      onInteractionEnd?.();
    }
    setDraggedElement(null);
    setResizingElement(null);
    setResizeCorner(null);
    setActiveGuides([]);
    dragOffsetsRef.current.clear();
    if (marquee) {
      setMarquee(null);
    }
    if (viewportDraggingRef.current) {
      viewportDraggingRef.current = false;
      viewportDragStartRef.current = null;
    }
  };

  // Start resize operation
  const startResize = (e: React.MouseEvent, elementId: string, corner: 'nw' | 'ne' | 'sw' | 'se') => {
    e.stopPropagation();
    e.preventDefault();
    const element = elements.find(el => el.id === elementId);
    if (!element) return;

    onInteractionStart?.();
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
        <button
          onClick={() => setShowHud(!showHud)}
          className={`p-2 rounded ${showHud ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-400'}`}
          title={showHud ? 'HUD Overlays On' : 'HUD Overlays Off'}
        >
          <Eye className="w-4 h-4" />
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

        {/*
         * Reset layout button — re-runs initializeLocationsFromSchema on
         * the current beat, throwing away any manual position edits and
         * restoring the default layout. Useful after layout-math fixes
         * land (existing beats keep their saved positions; this is the
         * affordance to opt into the new defaults without deleting and
         * re-adding the beat). Confirmation lives in the parent's
         * onResetLayout handler.
         */}
        {onResetLayout && (
          <button
            onClick={onResetLayout}
            className="p-2 rounded hover:bg-gray-100"
            title="Reset Layout to Default (discards manual position edits)"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
        )}

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
      <div
        className="flex-1 overflow-auto bg-gray-100"
        style={{ maxWidth: '100%', maxHeight: '100%' }}
        ref={(el) => {
          if (el && initialScroll && !el.dataset.scrollRestored) {
            // Restore scroll position after mount
            requestAnimationFrame(() => {
              el.scrollLeft = initialScroll.left;
              el.scrollTop = initialScroll.top;
              el.dataset.scrollRestored = '1';
            });
          }
        }}
        onScroll={(e) => {
          const t = e.currentTarget;
          onScrollChange?.({ left: t.scrollLeft, top: t.scrollTop });
        }}
      >
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

              {/* Chat mode: show ChatDialogView preview instead of PositionedBeatView */}
              {(presentationMode === 'chat-scroll' || presentationMode === 'chat-bubble') ? (
                <>
                  {/* Chat dialog preview layer */}
                  <div style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none' }}>
                    <ChatDialogView
                      messages={(() => {
                        // Build preview messages from beat content
                        const msgs: ChatMessage[] = [];
                        const dialogElement = elements.find(el => el.type === 'dialog' || (el.type === 'text' && el.name?.toLowerCase().includes('dialog')));
                        const speakerName = resolvedSpeakerName || 'Character';
                        if (dialogElement?.text || beatContent?.text) {
                          msgs.push({
                            id: 'preview-1',
                            text: dialogElement?.text || beatContent?.text || '',
                            speaker: speakerName,
                            isPlayer: false,
                          });
                        }
                        return msgs;
                      })()}
                      choices={beatContent?.choices?.map((c, i) => ({
                        id: `choice-${i}`,
                        text: c.text,
                        target: c.target,
                      })) || []}
                      mode={presentationMode as 'chat-scroll' | 'chat-bubble'}
                      theme={globalSettings ? (() => {
                        const baseTheme = convertGlobalSettingsToTheme(globalSettings);
                        return {
                          ...baseTheme,
                          textEffects: {
                            animation: 'none' as const,
                            typewriterSpeed: baseTheme.textEffects?.typewriterSpeed ?? 30,
                            fadeInDuration: baseTheme.textEffects?.fadeInDuration ?? 500,
                          },
                        };
                      })() : undefined}
                      backgroundUrl={resolvedBackgroundUrl}
                      backgroundColor={stageBackgroundColor}
                      stageWidth={stageWidth}
                      stageHeight={stageHeight}
                    />
                  </div>
                  {/* Chat mode label */}
                  <div style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    background: 'rgba(0,0,0,0.5)',
                    color: 'rgba(255,255,255,0.8)',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontFamily: 'monospace',
                    pointerEvents: 'none',
                    zIndex: 10,
                  }}>
                    Chat Mode
                  </div>
                  {/* Character/prop elements rendered via PositionedBeatView (overlay) */}
                  {(() => {
                    const overlayElements = positionedElements.filter(
                      el => el.location.kind === 'character' || el.location.kind === 'prop'
                    );
                    if (overlayElements.length === 0) return null;
                    return (
                      <PositionedBeatView
                        stageWidth={stageWidth}
                        stageHeight={stageHeight}
                        elements={overlayElements}
                        interactive={false}
                        editorMode={true}
                        speakerName={effectiveShowSpeaker && beatContent?.speaker ? resolvedSpeakerName : undefined}
                        speakerPortraitUrl={speakerPortraitUrl}
                        theme={globalSettings ? (() => {
                          const baseTheme = convertGlobalSettingsToTheme(globalSettings);
                          return {
                            ...baseTheme,
                            textEffects: {
                              animation: 'none' as const,
                              typewriterSpeed: baseTheme.textEffects?.typewriterSpeed ?? 30,
                              fadeInDuration: baseTheme.textEffects?.fadeInDuration ?? 500,
                            },
                          };
                        })() : undefined}
                      />
                    );
                  })()}
                </>
              ) : (
                /* Positioned mode: use shared PositionedBeatView */
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
                  beatType={beatType}
                  onLayoutComputed={handleLayoutComputed}
                  speakerName={effectiveShowSpeaker && beatContent?.speaker ? resolvedSpeakerName : undefined}
                  speakerPortraitUrl={speakerPortraitUrl}
                  theme={globalSettings ? (() => {
                    const baseTheme = convertGlobalSettingsToTheme(globalSettings);
                    return {
                      ...baseTheme,
                      // Disable text animations in visual editor
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
                  timerHudConfig={showHud ? globalSettings?.hudOverlays?.timerHud : undefined}
                  timerHudState={showHud && globalSettings?.hudOverlays?.timerHud?.enabled ? {
                    remainingTime: 45, totalTime: 60
                  } : undefined}
                  countdownMeterConfig={showHud ? globalSettings?.hudOverlays?.countdownMeter : undefined}
                  overrideCountdownMeter={overrideCountdownMeter}
                  countdownMeterValue={showHud && globalSettings?.hudOverlays?.countdownMeter?.enabled ? {
                    value: Math.round(((globalSettings.hudOverlays!.countdownMeter!.counterMax ?? 100) - (globalSettings.hudOverlays!.countdownMeter!.counterMin ?? 0)) * 0.65 + (globalSettings.hudOverlays!.countdownMeter!.counterMin ?? 0)),
                    min: globalSettings.hudOverlays!.countdownMeter!.counterMin ?? 0,
                    max: globalSettings.hudOverlays!.countdownMeter!.counterMax ?? 100,
                  } : undefined}
                  fictionalTimeText={showHud && globalSettings?.hudOverlays?.fictionalTime?.enabled && globalSettings?.hudOverlays?.fictionalTime?.showInTimerHud ? '12:00 PM' : undefined}
                  characterMeterFrameResolver={showHud ? characterMeterFrameResolver : undefined}
                  characterInventoryResolver={showHud ? characterInventoryResolver : undefined}
                  inventoryVisible={showHud}
                />
              )}

              {/* Panorama custom overlays: hotspot markers + prompt text */}
              {isPanoramaBeat && elements
                .filter(el => el.visible && (el.type === 'hotspot' || el.type === 'dialog' || el.type === 'text'))
                .map(el => {
                  if (el.type === 'hotspot') {
                    // Render as yellow dashed rectangle using element's actual dimensions
                    const cx = el.x + el.width / 2;
                    const cy = el.y + el.height / 2;
                    const isSelected = selectedElements.includes(el.id);
                    return (
                      <div
                        key={`pano-marker-${el.id}`}
                        style={{
                          position: 'absolute',
                          left: `${cx}px`,
                          top: `${cy}px`,
                          transform: 'translate(-50%, -50%)',
                          width: `${el.width}px`,
                          height: `${el.height}px`,
                          backgroundColor: isSelected ? 'rgba(255, 255, 0, 0.4)' : 'rgba(255, 255, 0, 0.25)',
                          border: isSelected ? '2px dashed rgba(245, 158, 11, 0.8)' : '2px dashed rgba(255, 255, 0, 0.7)',
                          borderRadius: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '13px',
                          fontFamily: 'sans-serif',
                          fontWeight: '600',
                          color: 'white',
                          textShadow: '0 1px 3px rgba(0,0,0,0.6)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          pointerEvents: 'none',
                          zIndex: (el.z || 0) + 100,
                        }}
                      >
                        {el.text || el.name || 'Hotspot'}
                      </div>
                    );
                  }
                  // Prompt / text overlay — styled from global settings
                  if (el.type === 'dialog' || el.type === 'text') {
                    const promptText = el.text || el.content || '';
                    if (!promptText) return null;
                    const isPinned = promptDisplay === 'pinned';
                    return (
                      <div
                        key={`pano-prompt-${el.id}`}
                        style={{
                          position: 'absolute',
                          left: `${el.x}px`,
                          top: `${el.y}px`,
                          width: `${el.width}px`,
                          backgroundColor: (() => {
                            const hex = globalSettings?.colors?.nonpcolor || '#000000';
                            const alpha = (globalSettings?.colors?.nonpalpha ?? 65) / 100;
                            const r = parseInt(hex.slice(1,3), 16);
                            const g = parseInt(hex.slice(3,5), 16);
                            const b = parseInt(hex.slice(5,7), 16);
                            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
                          })(),
                          color: globalSettings?.colors?.nonptextcolor || (() => {
                            const bg = globalSettings?.colors?.nonpcolor || '#000000';
                            const r = parseInt(bg.slice(1,3), 16);
                            const g = parseInt(bg.slice(3,5), 16);
                            const b = parseInt(bg.slice(5,7), 16);
                            return (r * 299 + g * 587 + b * 114) / 1000 > 128 ? '#000000' : '#ffffff';
                          })(),
                          padding: `${globalSettings?.textbox?.padding ?? 8}px`,
                          borderRadius: `${globalSettings?.textbox?.radius ?? 8}px`,
                          border: isPinned
                            ? '2px dashed rgba(59, 130, 246, 0.6)'
                            : (globalSettings?.textbox?.borderWidth && globalSettings?.colors?.textBoxBorder)
                              ? `${globalSettings.textbox.borderWidth}px solid ${globalSettings.colors.textBoxBorder}`
                              : 'none',
                          fontSize: `${globalSettings?.fonts?.fontSize?.text || 14}px`,
                          fontFamily: globalSettings?.fonts?.textFont || 'sans-serif',
                          textAlign: 'center',
                          pointerEvents: 'none',
                          zIndex: (el.z || 0) + 100,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {promptText}
                      </div>
                    );
                  }
                  return null;
                })
              }

              {/* Mobile Safe Zone overlay - shows crop areas for common mobile aspect ratios */}
              {globalSettings?.project?.showMobileSafeZone && (() => {
                // Calculate crop zones for 16:9 and 19.5:9 ratios on the current stage
                const stageAR = stageWidth / stageHeight;
                const ratios = [
                  { name: '16:9', ar: 16 / 9, color: 'rgba(255, 165, 0, 0.15)', borderColor: 'rgba(255, 165, 0, 0.6)' },
                  { name: '19.5:9', ar: 19.5 / 9, color: 'rgba(255, 50, 50, 0.12)', borderColor: 'rgba(255, 50, 50, 0.5)' },
                ];

                return ratios.map(({ name, ar, color, borderColor }) => {
                  // If the mobile device has a wider aspect ratio than the stage,
                  // it will crop top/bottom. If narrower, it will crop left/right.
                  if (ar > stageAR) {
                    // Wider device: crops top and bottom
                    const visibleHeight = stageWidth / ar;
                    const cropPx = (stageHeight - visibleHeight) / 2;
                    if (cropPx <= 0) return null;
                    return (
                      <React.Fragment key={name}>
                        {/* Top crop zone */}
                        <div
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            height: `${cropPx}px`,
                            background: color,
                            borderBottom: `1px dashed ${borderColor}`,
                            pointerEvents: 'none',
                            zIndex: 9998,
                          }}
                        >
                          <span style={{
                            position: 'absolute',
                            bottom: 2,
                            right: 4,
                            fontSize: '9px',
                            color: borderColor,
                            fontFamily: 'monospace',
                          }}>
                            {name} crop ({Math.round(cropPx)}px)
                          </span>
                        </div>
                        {/* Bottom crop zone */}
                        <div
                          style={{
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            right: 0,
                            height: `${cropPx}px`,
                            background: color,
                            borderTop: `1px dashed ${borderColor}`,
                            pointerEvents: 'none',
                            zIndex: 9998,
                          }}
                        >
                          <span style={{
                            position: 'absolute',
                            top: 2,
                            right: 4,
                            fontSize: '9px',
                            color: borderColor,
                            fontFamily: 'monospace',
                          }}>
                            {name} crop ({Math.round(cropPx)}px)
                          </span>
                        </div>
                      </React.Fragment>
                    );
                  } else {
                    // Narrower device: crops left and right
                    const visibleWidth = stageHeight * ar;
                    const cropPx = (stageWidth - visibleWidth) / 2;
                    if (cropPx <= 0) return null;
                    return (
                      <React.Fragment key={name}>
                        {/* Left crop zone */}
                        <div
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            bottom: 0,
                            width: `${cropPx}px`,
                            background: color,
                            borderRight: `1px dashed ${borderColor}`,
                            pointerEvents: 'none',
                            zIndex: 9998,
                          }}
                        />
                        {/* Right crop zone */}
                        <div
                          style={{
                            position: 'absolute',
                            top: 0,
                            right: 0,
                            bottom: 0,
                            width: `${cropPx}px`,
                            background: color,
                            borderLeft: `1px dashed ${borderColor}`,
                            pointerEvents: 'none',
                            zIndex: 9998,
                          }}
                        />
                      </React.Fragment>
                    );
                  }
                });
              })()}

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

                  // For text/dialog/button, use computed positions from PositionedBeatView
                  const computed = computedPositions.get(el.id);
                  const useComputed = computed && (el.type === 'text' || el.type === 'dialog' || el.type === 'button');

                  // Calculate effective dimensions and position (accounting for scale with center origin)
                  const effectiveWidth = useComputed ? computed.width : baseWidth * scale;
                  const effectiveHeight = useComputed ? computed.height : baseHeight * scale;
                  const effectiveX = useComputed ? computed.x : el.x + (baseWidth - effectiveWidth) / 2;
                  const effectiveY = useComputed ? computed.y : el.y + (baseHeight - effectiveHeight) / 2;

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
                        onInteractionStart?.();
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

                  // For text/dialog/button elements, use computed positions from PositionedBeatView
                  // to align selection handles with the actual smart-sized rendering
                  const computed = computedPositions.get(el.id);
                  const useComputed = computed && (el.type === 'text' || el.type === 'dialog' || el.type === 'button');

                  if (useComputed) {
                    effectiveX = computed.x;
                    effectiveY = computed.y;
                    effectiveWidth = computed.width;
                    effectiveHeight = computed.height;
                  } else if (hasSize) {
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

              {/* Panorama Viewport Rectangle Overlay */}
              {panoramaViewport && (() => {
                const { pitch, yaw, hfov: hfovDeg, projectionType: vpProjType, imageAspect: vpImageAspect } = panoramaViewport;
                const projType = vpProjType || 'equirectangular';
                // Compute rectangle position using projection-aware conversion
                const { centerX, centerY } = yawPitchToStage(yaw, pitch, projType, stageWidth, stageHeight, vpImageAspect);
                const { width: rectWidth, height: rectHeight } = viewportSizeOnStage(hfovDeg, projType, stageWidth, stageHeight, vpImageAspect, stageWidth / stageHeight);

                const left = centerX - rectWidth / 2;
                const top = centerY - rectHeight / 2;

                // Check if rectangle wraps horizontally
                const wrapsLeft = left < 0;
                const wrapsRight = left + rectWidth > stageWidth;

                const rects: { x: number; y: number; w: number; h: number; ghost?: boolean }[] = [];
                rects.push({ x: left, y: top, w: rectWidth, h: rectHeight });
                if (wrapsLeft) {
                  rects.push({ x: left + stageWidth, y: top, w: rectWidth, h: rectHeight, ghost: true });
                }
                if (wrapsRight) {
                  rects.push({ x: left - stageWidth, y: top, w: rectWidth, h: rectHeight, ghost: true });
                }

                return rects.map((r, i) => (
                  <React.Fragment key={`viewport-rect-${i}`}>
                    {/* Visual rectangle */}
                    <div
                      style={{
                        position: 'absolute',
                        left: `${r.x}px`,
                        top: `${r.y}px`,
                        width: `${r.w}px`,
                        height: `${r.h}px`,
                        border: '2px dashed rgba(59, 130, 246, 0.7)',
                        backgroundColor: 'rgba(59, 130, 246, 0.06)',
                        borderRadius: '2px',
                        pointerEvents: 'none',
                        zIndex: 9999,
                        opacity: r.ghost ? 0.4 : 1,
                      }}
                    >
                      {/* Label */}
                      {!r.ghost && (
                        <span style={{
                          position: 'absolute',
                          top: '4px',
                          left: '6px',
                          fontSize: '10px',
                          fontFamily: 'monospace',
                          color: 'rgba(59, 130, 246, 0.8)',
                          pointerEvents: 'none',
                          userSelect: 'none',
                          whiteSpace: 'nowrap',
                        }}>
                          Camera View
                        </span>
                      )}
                    </div>
                    {/* Drag hit-detect overlay (only on primary, not ghost) */}
                    {!r.ghost && (
                      <div
                        style={{
                          position: 'absolute',
                          left: `${r.x}px`,
                          top: `${r.y}px`,
                          width: `${r.w}px`,
                          height: `${r.h}px`,
                          cursor: viewportDraggingRef.current ? 'grabbing' : 'grab',
                          pointerEvents: 'auto',
                          zIndex: 10001,
                        }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          viewportDraggingRef.current = true;
                          viewportDragStartRef.current = {
                            mouseX: e.clientX,
                            mouseY: e.clientY,
                            yaw: panoramaViewport.yaw,
                            pitch: panoramaViewport.pitch,
                          };
                        }}
                      />
                    )}
                  </React.Fragment>
                ));
              })()}

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
