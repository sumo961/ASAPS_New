/**
 * Visual Workspace Component
 * Unified visual editor with all controls in one left panel
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Beat, Cluster, type Location, type AnimationPath, type SharedVisualContent, computeDialogTreeLayout, type DialogTreeLayoutTheme, DEFAULT_DIALOG_TREE_THEME, calculateTextBoxDimensions, calculateButtonDimensions, calculateDialogDimensions } from '@asaps/core';
import { VisualBeatEditor, VisualElement } from './VisualBeatEditor';
import { XRMapEditor } from './XRMapEditor';
import { XRFloorPlanEditor } from './XRFloorPlanEditor';
type PanoramaViewMode = 'layout' | 'preview';
import { VisualPropertiesPanel } from './VisualPropertiesPanel';
import { AnimationPanel } from './AnimationPanel';
import { AssetSelectionModal } from '../assets/AssetSelectionModal';
import type { Asset } from '../assets/AssetManager';
import { initializeLocationsFromSchema } from '../../utils/SchemaLocationInitializer';
import { stageToYawPitch, yawPitchToStage, viewportSizeOnStage, computePanoData } from '../../utils/panoramaCoordinates';
// applySmartSizing removed — smart sizing now computed at render time by PositionedBeatView
import { convertGlobalSettingsToTheme } from '../../utils/themeConverter';
import { Viewer as PSVViewer } from '@photo-sphere-viewer/core';
import { MarkersPlugin as PSVMarkersPlugin } from '@photo-sphere-viewer/markers-plugin';
import '@photo-sphere-viewer/core/index.css';
import '@photo-sphere-viewer/markers-plugin/index.css';
import { Info, Share2, ChevronDown, ChevronRight, MessageSquare } from 'lucide-react';
import type { DialogNode, DialogChoice } from '@asaps/core';
import type { SlotIntentResolution, SlotIntentEntry, SlotAnimations, SpatialAnimations } from '@asaps/core';
import { mergeSlotIntent } from '../../utils/slotIntentEdit';
import { resolveLayoutMode } from '../../utils/projectLayoutMode';
import { SlotFlowView, SpatialFlowView, ChatDialogView, isSlotModeBeatType, isSpatialModeBeatType, getSlotSpec, getSpatialSpec, TimerHudDisplay, type TimerHudConfig } from '@asaps/renderer';
import { HotspotEditOverlay } from './HotspotEditOverlay';
import type { Hotspot } from '@asaps/core';

// VE viewport presets for the slot-mode preview. Fixed presets are a real
// W×H device rectangle so the WHOLE composition (side/top/bottom margins,
// bottom-anchored buttons) is faithful — not just the font. width/height
// null = "Editor": fill the editor canvas (truly responsive to it, no
// simulation). Larger-than-editor rects can be shown scaled-to-fit or 1:1.
const SLOT_PREVIEW_VIEWPORTS: ReadonlyArray<{
  id: string;
  label: string;
  width: number | null;
  height: number | null;
  coarse: boolean;
}> = [
  { id: 'phone', label: 'Phone', width: 390, height: 844, coarse: true }, // modern standard (iPhone 14/15/16-class, ~19.5:9)
  { id: 'tablet', label: 'Tablet', width: 768, height: 1024, coarse: true },
  { id: 'authored', label: 'Authored', width: 1024, height: 768, coarse: false },
  { id: 'desktop', label: 'Desktop', width: 1440, height: 810, coarse: false }, // 16:9
  { id: 'editor', label: 'Editor', width: null, height: null, coarse: false },
];

// Preview-only filler for slot beats whose body is produced at runtime
// (aiSummary / aiInfoText / onlineContent). Shown only when the beat has no
// authored body/fallback, so the author can judge the real title+body+button
// composition and reflow instead of an empty middle. NEVER persisted — it is
// substituted into the preview content, not written back to the beat.
const SLOT_PREVIEW_SAMPLE_BODY = [
  "This is sample text shown only in the editor. When the story runs, this beat's content is generated live, so the real length will vary.",
  "It stands in here at a realistic length so you can see how the title, body and buttons compose together, where the text wraps, and how the layout reflows at the phone, tablet and desktop widths.",
  "Switch viewports above to watch it adapt; the title line-count and button anchor controls update this preview the same way they affect the running story.",
  "Replace the prompt or add a fallback on the beat to preview your own wording instead of this placeholder.",
].join('\n\n');
import { useTranslationState } from '../../contexts/TranslationContext';
import { getTranslationsForBeat } from '../../export/StoryTranslator';

import type { GlobalSettings } from '../settings/GlobalSettingsInspector';
import type { Character } from '../../types/character';
import type { ThemeAssetUrls } from '../../hooks/useThemes';
import { getCommandManager } from '../../commands/CommandManager';
import { VisualElementsSnapshotCommand } from '../../commands/ElementCommands';

/**
 * Helper to resolve fresh image URL from assets using assetId.
 * Character state images stored with blob URLs become stale after page reload.
 * This function looks up the assetId in the assets array to get fresh URLs.
 */
function resolveCharacterImageUrl(
  state: { visual?: { assetId?: string; image?: string } } | null,
  defaultImage: string | undefined,
  assets: Asset[],
  // Last-resort fallback for characters that have no per-state image and
  // no defaultImage — only a spritesheet. The renderer crops to a single
  // frame using frameWidth/Height. Without this, an authored character
  // location with only a spritesheet renders as nothing on stage.
  spriteSheet?: { url?: string; assetId?: string }
): string | undefined {
  if (!state?.visual) {
    // Even with no state, try defaultImage then spritesheet.
    if (defaultImage) return defaultImage;
    if (spriteSheet?.assetId) {
      const asset = assets.find(a => a.id === spriteSheet.assetId);
      if (asset?.url) return asset.url;
    }
    return spriteSheet?.url;
  }

  // Try to resolve via assetId first (this gives fresh blob URLs)
  if (state.visual.assetId) {
    const asset = assets.find(a => a.id === state.visual!.assetId);
    if (asset?.url) {
      return asset.url;
    }
  }

  // Fall back to stored image URL (may be stale blob URL)
  if (state.visual.image) {
    // Check if it's a blob URL - these are likely stale after page reload
    if (state.visual.image.startsWith('blob:')) {
      console.warn('[VisualWorkspace] Using potentially stale blob URL - no assetId found:', state.visual.image.substring(0, 50));
    }
    return state.visual.image;
  }

  if (defaultImage) return defaultImage;

  // Final fallback: spritesheet (assetId first for fresh blob, then raw url).
  if (spriteSheet?.assetId) {
    const asset = assets.find(a => a.id === spriteSheet.assetId);
    if (asset?.url) return asset.url;
  }
  return spriteSheet?.url;
}

/**
 * Phase tree node for DialogTree navigation
 */
interface PhaseTreeNode {
  id: string;
  speaker: string;
  text: string;  // Truncated for display
  fullText: string;  // Full text for reference
  depth: number;  // Indentation level
  choiceText?: string;  // The choice that leads to this phase
  children: PhaseTreeNode[];
}

/**
 * Build a tree structure from DialogTree's nested DialogNode structure
 * Generates unique IDs for phases based on their path through the tree
 */
function buildPhaseTree(dialogTree: DialogNode | undefined): PhaseTreeNode | null {
  if (!dialogTree) return null;

  function traverse(node: DialogNode, depth: number, pathId: string, choiceText?: string): PhaseTreeNode {
    const truncatedText = node.text.length > 25
      ? node.text.substring(0, 25) + '...'
      : node.text;

    return {
      id: pathId,  // Use path-based ID instead of node.id (which may be 'root' for all nodes)
      speaker: node.speaker || 'NPC',
      text: truncatedText,
      fullText: node.text,
      depth,
      choiceText: choiceText ? (choiceText.length > 20 ? choiceText.substring(0, 20) + '...' : choiceText) : undefined,
      children: (node.choices || [])
        .filter(c => c.dialogNode)
        .map((c, idx) => traverse(c.dialogNode!, depth + 1, `${pathId}_choice${idx}`, c.text)),
    };
  }

  return traverse(dialogTree, 0, 'root');
}

/**
 * Flatten phase tree to array with depth info for rendering
 */
function flattenPhaseTree(node: PhaseTreeNode | null): PhaseTreeNode[] {
  if (!node) return [];

  const result: PhaseTreeNode[] = [node];
  for (const child of node.children) {
    result.push(...flattenPhaseTree(child));
  }
  return result;
}

/**
 * Find a DialogNode by path-based ID in the tree
 * Path IDs look like: "root", "root_choice0", "root_choice1", "root_choice0_choice2"
 */
function findPhaseById(dialogTree: DialogNode | undefined, phaseId: string | null): DialogNode | null {
  if (!dialogTree || !phaseId) return null;

  // Parse the path to navigate to the correct node
  // Path format: "root" or "root_choice0_choice1_..."
  const parts = phaseId.split('_');

  // First part should be 'root'
  if (parts[0] !== 'root') return null;

  // Start at the root node
  let currentNode: DialogNode | undefined = dialogTree;

  // Navigate through choice indices
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    // Part should be like "choice0", "choice1", etc.
    const match = part.match(/^choice(\d+)$/);
    if (!match) return null;

    const choiceIndex = parseInt(match[1], 10);
    const choices: DialogChoice[] = currentNode?.choices || [];

    if (choiceIndex < 0 || choiceIndex >= choices.length) return null;

    const choice: DialogChoice = choices[choiceIndex];
    if (!choice.dialogNode) return null;

    currentNode = choice.dialogNode;
  }

  return currentNode || null;
}

/**
 * Phase 3.1 — fictional-time HUD preview formatter.
 *
 * Mirrors StoryContext.formatFictionalTime but reads its time from the
 * passed `initialTime` argument instead of `this.state.fictionalTime`,
 * because the Visual Editor preview has no live StoryContext. Used by
 * the editor HUD overlay to show the project's initial fictional time
 * under the author's chosen displayFormat — the format the chip will
 * carry on the very first beat at runtime.
 */
function formatEditorFictionalTime(
  initialTime: { year: number; month: number; day: number; hour: number; minute: number },
  format: 'time-12h' | 'time-24h' | 'date' | 'datetime-12h' | 'datetime-24h' | 'day-number' | 'year'
): string {
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const t12 = (h: number, m: number) => {
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return `${hour12}:${m.toString().padStart(2, '0')} ${period}`;
  };
  const t24 = (h: number, m: number) =>
    `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  const date = () =>
    `${initialTime.day} ${monthNames[initialTime.month - 1]} ${initialTime.year}`;
  switch (format) {
    case 'time-12h': return t12(initialTime.hour, initialTime.minute);
    case 'time-24h': return t24(initialTime.hour, initialTime.minute);
    case 'date': return date();
    case 'datetime-12h': return `${date()}, ${t12(initialTime.hour, initialTime.minute)}`;
    case 'datetime-24h': return `${date()}, ${t24(initialTime.hour, initialTime.minute)}`;
    case 'day-number': return 'Day 1'; // editor preview is always at the initial time, so Day 1
    case 'year': return String(initialTime.year);
    default: return `${date()}, ${t12(initialTime.hour, initialTime.minute)}`;
  }
}

const _DEG_TO_RAD = Math.PI / 180;
const _RAD_TO_DEG = 180 / Math.PI;

/** Convert our HFOV (degrees) to PSV zoom level 0-100 */
function _hfovToZoom(viewer: PSVViewer, hfovDeg: number): number {
  const vFov = viewer.dataHelper.hFovToVFov(hfovDeg);
  return viewer.dataHelper.fovToZoomLevel(vFov);
}

/** Get current HFOV (degrees) from PSV zoom level */
function _zoomToHfov(viewer: PSVViewer): number {
  const vFov = viewer.dataHelper.zoomLevelToFov(viewer.getZoomLevel());
  return viewer.dataHelper.vFovToHFov(vFov);
}

/**
 * Panorama Preview Section — imperative PSV Viewer + MarkersPlugin.
 * Extracted as a separate component so the viewer lifecycle (create/destroy)
 * is tied to React mount/unmount rather than manual refs.
 */
const PanoramaPreviewSection: React.FC<{
  beat: Beat;
  panoramaResolvedUrl: string;
  panoramaProjectionType: string;
  panoramaImageAspect: number | undefined;
  panoramaHotspots: { id: string; pitch: number; yaw: number; text: string; locationName?: string }[];
  visualElements: VisualElement[];
  selectedElementId: string | null | undefined;
  projectSettings: { width: number; height: number; aspectRatio: string; scalingMode: string } | undefined;
  globalSettings: GlobalSettings | undefined;
  panoramaPreviewContainerRef: React.MutableRefObject<HTMLDivElement | null>;
  panoramaPreviewWidth: number;
  setPanoramaPreviewWidth: (w: number) => void;
  psvViewerRef: React.MutableRefObject<PSVViewer | null>;
  psvMarkersRef: React.MutableRefObject<PSVMarkersPlugin | null>;
  panoramaReadyRef: React.MutableRefObject<boolean>;
  panoramaUserInteractingRef: React.MutableRefObject<boolean>;
  panoramaViewChangingRef: React.MutableRefObject<boolean>;
  livePanoCamRef: React.MutableRefObject<{ yaw: number; pitch: number; hfov: number }>;
  previewDragRef: React.MutableRefObject<any>;
  setHasChanges: (v: boolean) => void;
  onBeatUpdate?: (beatId: string, updates: Partial<Beat>) => void;
  setSelectedElementIds: (ids: string[]) => void;
  handlePreviewPointerDown: (e: React.PointerEvent, elementId: string) => void;
  handlePreviewPointerMove: (e: React.PointerEvent) => void;
  handlePreviewPointerUp: (e: React.PointerEvent) => void;
  handlePreviewResizeDown: (e: React.PointerEvent, elementId: string, corner: 'nw' | 'ne' | 'sw' | 'se') => void;
}> = ({
  beat,
  panoramaResolvedUrl,
  panoramaProjectionType,
  panoramaImageAspect,
  panoramaHotspots,
  visualElements,
  selectedElementId,
  projectSettings,
  globalSettings,
  panoramaPreviewContainerRef,
  panoramaPreviewWidth,
  setPanoramaPreviewWidth,
  psvViewerRef,
  psvMarkersRef,
  panoramaReadyRef,
  panoramaUserInteractingRef,
  panoramaViewChangingRef,
  livePanoCamRef,
  previewDragRef,
  setHasChanges,
  onBeatUpdate,
  setSelectedElementIds,
  handlePreviewPointerDown,
  handlePreviewPointerMove,
  handlePreviewPointerUp,
  handlePreviewResizeDown,
}) => {
  // Ref to hold the PSV viewer div (separate from the outer container)
  const psvContainerRef = useRef<HTMLDivElement | null>(null);
  // Force re-render for markers sync
  const [markersVersion, setMarkersVersion] = useState(0);
  // Store HFOV at viewer creation for zoom scaling reference
  const panoramaInitialHfovRef = useRef(75);

  // PSV Viewer lifecycle — create when mounted, destroy on cleanup
  useEffect(() => {
    if (!psvContainerRef.current || !panoramaResolvedUrl) return;

    panoramaReadyRef.current = false;
    let cancelled = false;

    const createWithPanoData = (panoData?: any) => {
      if (!psvContainerRef.current || cancelled) return;

      const params = beat.getParameters();
      const yawDeg = Number.isFinite(params.initialYaw) ? params.initialYaw : 0;
      const pitchDeg = Number.isFinite(params.initialPitch) ? params.initialPitch : 0;
      // VE editor: no min/max/zoomSpeed restrictions on the PSV viewer.
      // FOV is the design-time ground truth for element sizing.
      // Min/max are runtime-only zoom limits for the player.
      const viewer = new PSVViewer({
        container: psvContainerRef.current,
        // Do NOT pass panorama here — PSV's initial load can stall in React StrictMode.
        // Instead, call setPanorama() after creation (below).
        defaultYaw: yawDeg * _DEG_TO_RAD,
        defaultPitch: pitchDeg * _DEG_TO_RAD,
        defaultZoomLvl: 50,
        minFov: 10,
        maxFov: 179,
        navbar: false,
        plugins: [[PSVMarkersPlugin, { markers: [] }]],
      });

      psvViewerRef.current = viewer;
      const markersPlugin = viewer.getPlugin<PSVMarkersPlugin>(PSVMarkersPlugin);
      psvMarkersRef.current = markersPlugin;

      // Ready handler: set correct zoom from HFOV
      viewer.addEventListener('ready', () => {
        try {
          const storedHfov = Number.isFinite(params.hfov) ? params.hfov : 75;
          viewer.zoom(_hfovToZoom(viewer, Math.max(30, storedHfov)));
        } catch { /* ignore */ }

        // Read back actual HFOV from viewer after zoom is applied — PSV's
        // HFOV→zoomLevel→HFOV round-trip may differ from the requested value
        // due to aspect-ratio-dependent quantization.  Using the actual value
        // ensures zoomScale=1 at initialization regardless of container size.
        const actualHfov = Math.max(30, _zoomToHfov(viewer));

        // Initialize live camera state
        livePanoCamRef.current = {
          yaw: yawDeg,
          pitch: pitchDeg,
          hfov: actualHfov,
        };

        // Store initial HFOV for zoom scaling reference
        panoramaInitialHfovRef.current = actualHfov;
        // Allow camera sync after a tick
        requestAnimationFrame(() => { panoramaReadyRef.current = true; });
        // Trigger markers sync
        setMarkersVersion(v => v + 1);
      }, { once: true });

      // Load the panorama via setPanorama() after a frame — deferred to survive
      // React StrictMode's rapid mount→unmount→mount cycle in development.
      // The cancelled flag ensures we don't load on a viewer that's about to be destroyed.
      requestAnimationFrame(() => {
        if (cancelled) return;
        viewer.setPanorama(panoramaResolvedUrl, {
          panoData: panoData || undefined,
          position: { yaw: yawDeg * _DEG_TO_RAD, pitch: pitchDeg * _DEG_TO_RAD },
        }).catch(() => { /* ignore load errors during cleanup */ });
      });

      // Position updated: update live camera state and save to beat params
      viewer.addEventListener('position-updated', (e) => {
        const pos = e.position;
        let yaw = pos.yaw * _RAD_TO_DEG;
        while (yaw > 180) yaw -= 360;
        while (yaw < -180) yaw += 360;
        const hfovValue = _zoomToHfov(viewer);
        if (isNaN(hfovValue) || isNaN(yaw) || isNaN(pos.pitch)) return;

        livePanoCamRef.current = { yaw, pitch: pos.pitch * _RAD_TO_DEG, hfov: hfovValue };

        if (!panoramaReadyRef.current || !panoramaUserInteractingRef.current) return;
        panoramaViewChangingRef.current = true;
        beat.updateParameters({
          initialYaw: Math.round(yaw * 10) / 10,
          initialPitch: Math.round(pos.pitch * _RAD_TO_DEG * 10) / 10,
          hfov: Math.round(hfovValue),
        });
        setHasChanges(true);
        if (onBeatUpdate) {
          onBeatUpdate(beat.id, {
            parameters: {
              ...beat.getParameters(),
              initialYaw: Math.round(yaw * 10) / 10,
              initialPitch: Math.round(pos.pitch * _RAD_TO_DEG * 10) / 10,
              hfov: Math.round(hfovValue),
            },
          } as any);
        }
        requestAnimationFrame(() => { panoramaViewChangingRef.current = false; });
      });

      // Zoom updated: same pattern as position
      viewer.addEventListener('zoom-updated', (e) => {
        const hfovValue = _zoomToHfov(viewer);
        const pos = viewer.getPosition();
        let yaw = pos.yaw * _RAD_TO_DEG;
        while (yaw > 180) yaw -= 360;
        while (yaw < -180) yaw += 360;

        livePanoCamRef.current = { yaw, pitch: pos.pitch * _RAD_TO_DEG, hfov: hfovValue };

        // Trigger markers rebuild so markers scale with zoom
        setMarkersVersion(v => v + 1);

        if (!panoramaReadyRef.current || !panoramaUserInteractingRef.current) return;
        panoramaViewChangingRef.current = true;
        beat.updateParameters({
          initialYaw: Math.round(yaw * 10) / 10,
          initialPitch: Math.round(pos.pitch * _RAD_TO_DEG * 10) / 10,
          hfov: Math.round(hfovValue),
        });
        setHasChanges(true);
        if (onBeatUpdate) {
          onBeatUpdate(beat.id, {
            parameters: {
              ...beat.getParameters(),
              initialYaw: Math.round(yaw * 10) / 10,
              initialPitch: Math.round(pos.pitch * _RAD_TO_DEG * 10) / 10,
              hfov: Math.round(hfovValue),
            },
          } as any);
        }
        requestAnimationFrame(() => { panoramaViewChangingRef.current = false; });
      });
    };

    // For cylindrical projection, load image to get natural dimensions for panoData
    if (panoramaProjectionType === 'cylindrical') {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => createWithPanoData(computePanoData(img.naturalWidth, img.naturalHeight));
      img.onerror = () => createWithPanoData();
      img.src = panoramaResolvedUrl;
    } else {
      createWithPanoData();
    }

    return () => {
      cancelled = true;
      if (psvViewerRef.current) {
        try { psvViewerRef.current.destroy(); } catch { /* ignore */ }
        psvViewerRef.current = null;
        psvMarkersRef.current = null;
      }
    };
    // Only re-create viewer when URL or projection type changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panoramaResolvedUrl, panoramaProjectionType]);

  // Compute panorama camera/prompt settings outside the markers effect so `beat` is not a dependency
  const panoramaBeatCamera = useMemo(() => {
    const bp = beat.getParameters();
    const raw = (beat as any).parameters;
    return {
      promptDisplay: (bp.promptDisplay ?? raw?.promptDisplay ?? 'static') as 'static' | 'pinned',
      initialYaw: bp.initialYaw ?? raw?.initialYaw ?? 0,
      initialPitch: bp.initialPitch ?? raw?.initialPitch ?? 0,
      hfov: bp.hfov ?? raw?.hfov ?? 75,
    };
  }, [beat?.id, (beat as any)?._version]);

  // Markers sync: update markers when hotspots, elements, or selection changes
  useEffect(() => {
    const mp = psvMarkersRef.current;
    const viewer = psvViewerRef.current;
    if (!mp || !viewer) return;

    const stageW = projectSettings?.width || 1024;
    const stageH = projectSettings?.height || 768;
    const promptDisplay = panoramaBeatCamera.promptDisplay;

    // Scale marker pixel sizes from stage coordinates to screen coordinates
    const containerW = psvContainerRef.current?.clientWidth || stageW;
    const sizeFactor = containerW / stageW;

    // Scale markers proportionally with zoom using perspective-correct tangent ratio.
    // This matches how PSV's Three.js renderer scales the panorama background.
    const currentHfov = Math.max(30, livePanoCamRef.current.hfov);
    const initRad = panoramaInitialHfovRef.current * 0.5 * _DEG_TO_RAD;
    const currRad = currentHfov * 0.5 * _DEG_TO_RAD;
    const zoomScale = Math.tan(initRad) / Math.tan(currRad);

    const markers: any[] = [];

    // Hotspot appearance from global settings (editor always shows, but uses configured style)
    const hsColor = globalSettings?.hotspots?.highlightColor || '#ffff00';
    const hsOpacity = (globalSettings?.hotspots?.opacity ?? 25) / 100; // 0-100 → 0-1
    const hsFontFamily = globalSettings?.fonts?.textFont || 'sans-serif';
    const hsFontSize = globalSettings?.fonts?.fontSize?.text || 16;
    // Use NPC text color for hotspot labels (matches prompt/NPC text styling)
    // When nonptextcolor is empty, compute contrast from NPC background color
    const hsFontColor = globalSettings?.colors?.nonptextcolor || (() => {
      const bg = globalSettings?.colors?.nonpcolor || '#000000';
      const r = parseInt(bg.slice(1,3), 16);
      const g = parseInt(bg.slice(3,5), 16);
      const b = parseInt(bg.slice(5,7), 16);
      return (r * 299 + g * 587 + b * 114) / 1000 > 128 ? '#000000' : '#ffffff';
    })();
    // Parse hex to rgb for rgba usage
    const hsR = parseInt(hsColor.slice(1,3), 16) || 255;
    const hsG = parseInt(hsColor.slice(3,5), 16) || 255;
    const hsB = parseInt(hsColor.slice(5,7), 16) || 0;

    // Build set of locationName values from hotspots — elements assigned via locationName
    // are rendered as hotspot markers and should NOT also appear in the non-hotspot loop
    const assignedLocationNames = new Set(
      panoramaHotspots.map(hs => hs.locationName).filter(Boolean) as string[]
    );

    // 1. Hotspot markers — interactive (draggable + resizable via overlay)
    for (const hs of panoramaHotspots) {
      // When locationName is set, look up the referenced VE element by name (not hotspot id)
      const veEl = hs.locationName
        ? visualElements.find(e => e.name === hs.locationName) || visualElements.find(e => e.id === hs.id)
        : visualElements.find(e => e.id === hs.id);
      const cx = veEl ? veEl.x + veEl.width / 2 : stageW / 2;
      const cy = veEl ? veEl.y + veEl.height / 2 : stageH / 2;
      const { yaw: elYaw, pitch: elPitch } = stageToYawPitch(cx, cy, panoramaProjectionType, stageW, stageH, panoramaImageAspect);
      const elScale = veEl?.scale || 1;
      const elRotation = veEl?.rotation || 0;
      // Base dimensions at container scale (no zoom) — CSS transform handles zoom uniformly
      // so text and box scale together, avoiding browser minimum font-size issues
      const baseW = Math.round((veEl?.width || 120) * elScale * sizeFactor);
      const baseH = Math.round((veEl?.height || 50) * elScale * sizeFactor);
      const isSelected = selectedElementId === (veEl?.id || hs.id);
      // Font size at base scale only — CSS transform: scale(zoomScale) scales it uniformly with the box
      const baseFontSize = (veEl?.fontOverridden && veEl?.fontSize) ? veEl.fontSize : hsFontSize;
      const fontSize = Math.max(10, Math.round(baseFontSize * sizeFactor));

      // Combine zoom scale and rotation in one CSS transform
      const transforms = [`scale(${zoomScale.toFixed(4)})`];
      if (elRotation) transforms.push(`rotate(${elRotation}deg)`);

      // Check if the referenced element has an image (prop/character with asset)
      const imgSrc = veEl ? (veEl.assetUrl || veEl.imageUrl) : undefined;
      const isImageMarker = imgSrc && veEl?.type !== 'hotspot';

      // Editor: slightly reduced opacity, brightened when selected
      const bgAlpha = isSelected ? Math.min(hsOpacity * 1.5, 1) : hsOpacity * 0.7;
      const borderAlpha = isSelected ? 0.8 : 0.7;

      // Create the element with pointer event handlers for drag/resize
      const el = document.createElement('div');
      el.className = 'psv--capture-event';
      el.style.cssText = `width:${baseW}px;height:${baseH}px;position:relative;cursor:${previewDragRef.current?.elementId === (veEl?.id || hs.id) ? 'grabbing' : 'grab'};transform:${transforms.join(' ')};transform-origin:center center;`;

      if (isImageMarker) {
        // Image-based marker for props/characters assigned via locationName
        el.innerHTML = `<img src="${imgSrc}" alt="${hs.text || veEl?.name || 'Hotspot'}" style="width:100%;height:100%;object-fit:contain;pointer-events:none;${isSelected ? 'outline:2px solid rgba(245,158,11,0.8);border-radius:4px;' : ''}" />`;
      } else {
        el.innerHTML = `<div style="width:100%;height:100%;
          background-color:rgba(${hsR},${hsG},${hsB},${bgAlpha.toFixed(2)});
          border:2px dashed rgba(${hsR},${hsG},${hsB},${borderAlpha});
          border-radius:4px;display:flex;align-items:center;justify-content:center;
          font-size:${fontSize}px;font-family:${hsFontFamily};font-weight:600;color:${hsFontColor};
          text-shadow:0 1px 3px rgba(0,0,0,0.6);white-space:nowrap;overflow:hidden;box-sizing:border-box;">
          ${hs.text || 'Hotspot'}</div>`;
      }

      // Corner resize handles — visual indicators only (pointer-events: none).
      // Resize detection is done via coordinate-based hit-testing in onPointerDown.
      if (isSelected) {
        for (const corner of ['nw', 'ne', 'sw', 'se'] as const) {
          const handle = document.createElement('div');
          handle.style.cssText = `position:absolute;width:14px;height:14px;background:white;border:2px solid #f59e0b;border-radius:2px;pointer-events:none;z-index:10;${corner.includes('n') ? 'top:-7px;' : 'bottom:-7px;'}${corner.includes('w') ? 'left:-7px;' : 'right:-7px;'}`;
          el.appendChild(handle);
        }
      }

      markers.push({
        id: `hotspot-${hs.id}`,
        element: el,
        position: { yaw: elYaw * _DEG_TO_RAD, pitch: elPitch * _DEG_TO_RAD },
        size: { width: baseW, height: baseH },
        anchor: 'center center',
        data: { elementId: veEl?.id || hs.id, type: 'hotspot' },
      });
    }

    // 2. Non-hotspot elements (props, characters, pinned text/dialog)
    for (const vel of visualElements) {
      if (vel.type === 'hotspot' || vel.visible === false) continue;
      // Skip elements assigned to a hotspot via locationName (rendered as hotspot marker above)
      if (assignedLocationNames.has(vel.name)) continue;
      if ((vel.type === 'text' || vel.type === 'dialog') && promptDisplay !== 'pinned') continue;
      const elCx = vel.x + vel.width / 2;
      const elCy = vel.y + vel.height / 2;
      const { yaw: elYaw, pitch: elPitch } = stageToYawPitch(elCx, elCy, panoramaProjectionType, stageW, stageH, panoramaImageAspect);
      const sizeScale = vel.size !== undefined ? vel.size / 100 : 1;
      const elScale = (vel.scale || 1) * sizeScale;
      const elRotation = vel.rotation || 0;
      // Base dimensions at container scale (no zoom) — CSS transform handles zoom
      const baseW = Math.round(vel.width * elScale * sizeFactor);
      const baseH = Math.round(vel.height * elScale * sizeFactor);
      const isElSelected = selectedElementId === vel.id;

      // Combine zoom scale and rotation
      const transforms = [`scale(${zoomScale.toFixed(4)})`];
      if (elRotation) transforms.push(`rotate(${elRotation}deg)`);

      const el = document.createElement('div');
      el.className = 'psv--capture-event';
      el.style.cssText = `width:${baseW}px;height:${baseH}px;cursor:${previewDragRef.current?.elementId === vel.id ? 'grabbing' : 'grab'};transform:${transforms.join(' ')};transform-origin:center center;`;

      if (vel.type === 'text' || vel.type === 'dialog') {
        const promptText = vel.text || vel.name || '';
        const hex = globalSettings?.colors?.nonpcolor || '#000000';
        const alpha = (globalSettings?.colors?.nonpalpha ?? 65) / 100;
        const r = parseInt(hex.slice(1,3), 16);
        const g = parseInt(hex.slice(3,5), 16);
        const b = parseInt(hex.slice(5,7), 16);
        // Use nonptextcolor if set, otherwise compute contrast color from background
        const textColor = globalSettings?.colors?.nonptextcolor || (
          (r * 299 + g * 587 + b * 114) / 1000 > 128 ? '#000000' : '#ffffff'
        );
        const textFontSize = (vel.fontOverridden && vel.fontSize) ? vel.fontSize : (globalSettings?.fonts?.fontSize?.text || 16);
        el.innerHTML = `<div style="
          width:100%;height:100%;box-sizing:border-box;overflow:hidden;
          background-color:rgba(${r},${g},${b},${alpha});
          color:${textColor};
          padding:${globalSettings?.textbox?.padding ?? 8}px;
          border-radius:${globalSettings?.textbox?.radius ?? 8}px;
          border:${isElSelected ? '2px solid rgba(245,158,11,0.8)' : (globalSettings?.textbox?.borderWidth && globalSettings?.colors?.textBoxBorder) ? `${globalSettings.textbox.borderWidth}px solid ${globalSettings.colors.textBoxBorder}` : 'none'};
          font-size:${Math.round(textFontSize * sizeFactor)}px;
          font-family:${globalSettings?.fonts?.textFont || 'sans-serif'};
          display:flex;align-items:center;justify-content:center;
          word-wrap:break-word;overflow-wrap:break-word;text-align:center;">${promptText}</div>`;
      } else {
        const imgSrc = vel.assetUrl || vel.imageUrl;
        if (imgSrc) {
          el.innerHTML = `<img src="${imgSrc}" alt="${vel.name}" style="width:100%;height:100%;object-fit:contain;pointer-events:none;${isElSelected ? 'outline:2px solid rgba(245,158,11,0.8);border-radius:4px;' : ''}" />`;
        } else {
          el.innerHTML = `<div style="width:100%;height:100%;
            background-color:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.3);
            border-radius:4px;display:flex;align-items:center;justify-content:center;
            font-size:11px;color:rgba(255,255,255,0.5);box-sizing:border-box;">
            ${vel.name}</div>`;
        }
      }

      markers.push({
        id: `element-${vel.id}`,
        element: el,
        position: { yaw: elYaw * _DEG_TO_RAD, pitch: elPitch * _DEG_TO_RAD },
        size: { width: baseW, height: baseH },
        anchor: 'center center',
        data: { elementId: vel.id, type: vel.type },
      });
    }

    try {
      mp.setMarkers(markers);
    } catch { /* viewer may be initializing */ }
  }, [panoramaHotspots, visualElements, selectedElementId, panoramaProjectionType, panoramaImageAspect, projectSettings, globalSettings, markersVersion, panoramaBeatCamera]);

  const stageW = projectSettings?.width || 1024;
  const stageH = projectSettings?.height || 768;

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {panoramaResolvedUrl ? (
        <div
          ref={(el) => {
            panoramaPreviewContainerRef.current = el;
            if (el) {
              const w = el.clientWidth;
              if (w > 0 && w !== panoramaPreviewWidth) setPanoramaPreviewWidth(w);
            }
          }}
          style={{ width: '100%', maxHeight: '100%', aspectRatio: `${stageW}/${stageH}`, position: 'relative', overflow: 'hidden' }}
          onClick={() => { setSelectedElementIds([]); }}
          onPointerDown={(e) => {
            panoramaUserInteractingRef.current = true;
            // Check if clicking on a marker element for drag/resize
            const target = e.target as HTMLElement;
            const markerEl = target.closest?.('.psv--capture-event') as HTMLElement;
            if (markerEl) {
              // Find which marker this element belongs to
              const mp = psvMarkersRef.current;
              if (mp) {
                for (const m of mp.getMarkers()) {
                  if (m.domElement === markerEl || markerEl.closest?.(`[data-marker-id="${m.id}"]`) || m.domElement?.contains(markerEl)) {
                    const elementId = (m.data as any)?.elementId;
                    if (elementId) {
                      // If this is the selected element, check if click is near a corner for resize
                      if (elementId === selectedElementId) {
                        const rect = markerEl.getBoundingClientRect();
                        const mx = e.clientX - rect.left;
                        const my = e.clientY - rect.top;
                        const threshold = 24; // px from corner
                        let corner: 'nw' | 'ne' | 'sw' | 'se' | null = null;
                        if (mx < threshold && my < threshold) corner = 'nw';
                        else if (mx > rect.width - threshold && my < threshold) corner = 'ne';
                        else if (mx < threshold && my > rect.height - threshold) corner = 'sw';
                        else if (mx > rect.width - threshold && my > rect.height - threshold) corner = 'se';
                        if (corner) {
                          handlePreviewResizeDown(e, elementId, corner);
                          return;
                        }
                      }
                      handlePreviewPointerDown(e, elementId);
                      return;
                    }
                  }
                }
              }
            }
          }}
          onPointerMove={(e) => { handlePreviewPointerMove(e); }}
          onPointerUp={(e) => {
            setTimeout(() => { panoramaUserInteractingRef.current = false; }, 150);
            handlePreviewPointerUp(e);
          }}
          onPointerCancel={() => { setTimeout(() => { panoramaUserInteractingRef.current = false; }, 150); }}
          onWheel={() => {
            panoramaUserInteractingRef.current = true;
            setTimeout(() => { panoramaUserInteractingRef.current = false; }, 300);
          }}
        >
          {/* PSV viewer mounts here */}
          <div ref={psvContainerRef} style={{ width: '100%', height: '100%' }} />

          {/* Prompt text overlay — themed from global settings (only in 'static' display mode) */}
          {(() => {
            const params = beat.getParameters();
            const rawParams = (beat as any).parameters;
            const promptText = params.prompt || rawParams?.prompt || '';
            if (!promptText) return null;
            const promptDisplayVal = params.promptDisplay ?? rawParams?.promptDisplay ?? 'static';
            if (promptDisplayVal === 'pinned') return null;
            return (
              <div style={{
                position: 'absolute',
                bottom: 60,
                left: '50%',
                transform: 'translateX(-50%)',
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
                border: (globalSettings?.textbox?.borderWidth && globalSettings?.colors?.textBoxBorder)
                  ? `${globalSettings.textbox.borderWidth}px solid ${globalSettings.colors.textBoxBorder}`
                  : 'none',
                fontSize: `${globalSettings?.fonts?.fontSize?.text || 16}px`,
                fontFamily: globalSettings?.fonts?.textFont || 'sans-serif',
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
                zIndex: 10,
              }}>
                {promptText}
              </div>
            );
          })()}

          {/* Hint overlay */}
          <div style={{
            position: 'absolute',
            bottom: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            color: 'rgba(255, 255, 255, 0.7)',
            padding: '6px 14px',
            borderRadius: 6,
            fontSize: 11,
            fontFamily: 'sans-serif',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}>
            {selectedElementId
              ? 'Drag to reposition \u2022 Use corners to resize'
              : 'Click to select \u2022 Drag to reposition'}
          </div>
        </div>
      ) : (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '100%', height: '100%', color: 'rgba(255,255,255,0.5)',
          fontFamily: 'sans-serif', fontSize: '14px',
        }}>
          No panorama image assigned
        </div>
      )}
    </div>
  );
};

interface VisualWorkspaceProps {
  beat: Beat | null;
  beats: Beat[];
  assets?: Asset[];
  onAssetSelect?: (type: 'background' | 'character' | 'prop' | 'sound', callback: (asset: Asset) => void) => void;
  onAssetAdd?: (asset: Asset) => Promise<boolean>;
  onAssetRemove?: (assetId: string) => void;
  onAssetUpdate?: (assetId: string, updates: Partial<Asset>) => void;
  onOpenCharacterManager?: (callback?: (character: any) => void) => void;
  onBeatUpdate?: (beatId: string, updates: Partial<Beat>) => void;
  projectSettings?: {
    width: number;
    height: number;
    aspectRatio: string;
    scalingMode: string;
  };
  globalSettings?: GlobalSettings;
  characters?: Character[];
  themeAssets?: ThemeAssetUrls | null;
  // Cluster containing this beat (for shared visuals)
  cluster?: Cluster | null;
  onSetClusterSharedVisuals?: (clusterId: string, sharedVisuals: SharedVisualContent | undefined) => void;
  /**
   * Update the indoor venue's beacons array (project-level settings).
   * Used by XRFloorPlanEditor when authors drag beacons or add new ones.
   */
  onUpdateVenueBeacons?: (beacons: Array<{ uuid: string; displayName?: string; x: number; y: number }>) => void;
}

export const VisualWorkspace: React.FC<VisualWorkspaceProps> = ({
  beat,
  beats,
  assets = [],
  onAssetSelect,
  onAssetAdd,
  onAssetRemove,
  onAssetUpdate,
  onOpenCharacterManager,
  onBeatUpdate,
  projectSettings,
  globalSettings,
  characters = [],
  themeAssets,
  cluster,
  onSetClusterSharedVisuals,
  onUpdateVenueBeacons,
}) => {
  const [visualElements, setVisualElements] = useState<VisualElement[]>([]);
  const [backgroundAssetId, setBackgroundAssetId] = useState<string>('');
  const [backgroundUrl, setBackgroundUrl] = useState<string>(''); // Direct URL for ASML import
  const [backgroundSound, setBackgroundSound] = useState<string>('');
  const [showProperties, setShowProperties] = useState(true);
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  // Slot-mode preview: which simulated viewport, and the latest per-slot
  // intent-resolution report from SlotFlowView (override-visibility / 3c).
  const [slotPreviewViewportId, setSlotPreviewViewportId] = useState<string>('authored');
  // P2.5 — when the project orientation is 'flexible' the author still needs
  // to check both ways; this is a preview-only toggle (does NOT change the
  // project setting). When the policy is locked it is forced to the lock.
  const [slotPreviewOrient, setSlotPreviewOrient] = useState<'portrait' | 'landscape'>('portrait');
  const [slotResolutions, setSlotResolutions] = useState<SlotIntentResolution[]>([]);
  // Slot-row expansion state — shared between the panel rows and stage
  // clicks. Stage click on a slot sets it; panel click toggles the same
  // key. Shape: `slot:{name}` or `slot:{name}:{buttonId}`.
  const [expandedSlotKey, setExpandedSlotKey] = useState<string | null>(null);
  // 3d-4 — transient gap while dragging the action grip. Live (uncommitted)
  // so the preview reflows per-frame WITHOUT spamming the undo stack; a
  // single setAnchor commit fires on pointer-up.
  const [slotGapDrag, setSlotGapDrag] = useState<{ startY: number; startGap: number; gap: number } | null>(null);
  // Viewport scale: 'fit' shrinks a larger-than-editor device rect to show
  // the whole composition; 'one' = 1:1 actual pixels (scroll); 'auto' picks
  // fit only when the rect exceeds the editor area. Measured editor area
  // drives the fit factor.
  const [slotScaleMode, setSlotScaleMode] = useState<'auto' | 'fit' | 'one'>('auto');
  const [slotStageSize, setSlotStageSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  // Drag-to-snap for custom-template slots. When the author pointer-
  // downs on a slot in the responsive preview AND layoutTemplate is
  // 'custom', we track the drag; on release we snap to the nearest of
  // the 9 anchor zones and write slotIntent. The 3×3 grid overlay is
  // only visible during the drag.
  type SlotDrag = {
    slotName: string;
    stageRect: DOMRect;
    pointerX: number;
    pointerY: number;
  };
  const [slotDrag, setSlotDrag] = useState<SlotDrag | null>(null);
  const slotIntentRef = useRef<Record<string, any> | undefined>(undefined);

  // Snap a pointer position (in stage coords) to its 3×3 zone.
  const snapPointerToZone = useCallback((x: number, y: number, stageRect: DOMRect): {
    h: 'left' | 'center' | 'right';
    v: 'top' | 'middle' | 'bottom';
    col: number;
    row: number;
  } => {
    const colW = stageRect.width / 3;
    const rowH = stageRect.height / 3;
    const col = Math.max(0, Math.min(2, Math.floor(x / colW)));
    const row = Math.max(0, Math.min(2, Math.floor(y / rowH)));
    const h = (['left', 'center', 'right'] as const)[col];
    const v = (['top', 'middle', 'bottom'] as const)[row];
    return { h, v, col, row };
  }, []);
  const slotStageRoRef = useRef<ResizeObserver | null>(null);
  // Callback ref: (dis)connects a ResizeObserver as the preview container
  // mounts/unmounts — no dependency on later-declared state (TDZ-safe) and
  // correct when the slot preview appears/disappears between beats.
  const slotStageRef = useCallback((el: HTMLDivElement | null) => {
    slotStageRoRef.current?.disconnect();
    slotStageRoRef.current = null;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      setSlotStageSize(prev => {
        const w = el.clientWidth;
        const h = el.clientHeight;
        return prev.w === w && prev.h === h ? prev : { w, h };
      });
    });
    ro.observe(el);
    slotStageRoRef.current = ro;
    setSlotStageSize({ w: el.clientWidth, h: el.clientHeight });
  }, []);

  // 3d-1 — shared slotIntent write-back. The control panel (3d-2) and drag
  // handles (3d-4) both call this. It commits through the normal beat-param
  // command/undo path (onBeatUpdate with { parameters }) and NEVER through
  // syncElementsToBeatLocations, so the beat cannot accumulate locations[]
  // and silently flip out of slot mode (the no-bake guard). `partial === null`
  // clears the slot's intent.
  const onSlotIntentChange = useCallback(
    (slot: string, partial: Partial<SlotIntentEntry> | null) => {
      if (!beat || !onBeatUpdate) return;
      const cur = (beat.getParameters?.() ?? {}) as Record<string, any>;
      const nextIntent = mergeSlotIntent(cur.slotIntent, slot, partial);
      // In-memory update first so the faithful preview reflects it instantly
      // (bumps _version → beatVersion → re-render); the command path then
      // persists + makes it undoable like any Inspector param edit.
      // updateParameters skips `undefined` values across all beat
      // subclasses (the standard partial-update guard), so a full clear
      // (nextIntent === undefined when the last slot entry is removed)
      // is written directly to the public field. The command path below
      // still records the change for undo.
      if (nextIntent === undefined) {
        (beat as any).slotIntent = undefined;
      } else {
        beat.updateParameters?.({ slotIntent: nextIntent });
      }
      onBeatUpdate(beat.id, {
        parameters: { ...beat.getParameters(), slotIntent: nextIntent },
      } as any);
    },
    [beat, onBeatUpdate]
  );

  // P3-anim-3 — slotAnimations write-back, mirroring onSlotIntentChange.
  // The Animations tab editor receives the whole next SlotAnimations object
  // (the merge is in the editor) and we just commit it; undo/redo lives in
  // the same beat-param command path.
  const onSlotAnimationsChange = useCallback(
    (next: SlotAnimations | undefined) => {
      if (!beat || !onBeatUpdate) return;
      beat.updateParameters?.({ slotAnimations: next });
      onBeatUpdate(beat.id, {
        parameters: { ...beat.getParameters(), slotAnimations: next },
      } as any);
    },
    [beat, onBeatUpdate]
  );

  // P3-anim-6 — spatial-layer animation write-back. Mirrors slotAnimations
  // — sibling channel persisted on beat.spatialAnimations.
  const onSpatialAnimationsChange = useCallback(
    (next: SpatialAnimations | undefined) => {
      if (!beat || !onBeatUpdate) return;
      beat.updateParameters?.({ spatialAnimations: next });
      onBeatUpdate(beat.id, {
        parameters: { ...beat.getParameters(), spatialAnimations: next },
      } as any);
    },
    [beat, onBeatUpdate]
  );

  // P3-3c-3 — hotspot editing state + write-back. The overlay calls
  // onChange with commit:false on every move (in-memory only, for live
  // visual feedback) and commit:true on pointer-up (creates an undoable
  // command via onBeatUpdate). The on-disk shape stays normalized 0–1.
  const [selectedHotspotId, setSelectedHotspotId] = useState<string | null>(null);

  // P3-3c-12 — dialogTree click-to-traverse. The path is a sequence of
  // choice ids from root → current node; each segment names the choice
  // whose `dialogNode` we descended into. Empty array means root node.
  // Reset to root when the selected beat changes.
  const [dialogTreeNodePath, setDialogTreeNodePath] = useState<string[]>([]);
  useEffect(() => {
    setDialogTreeNodePath([]);
  }, [beat?.id]);

  // P3-3c-14 — bidirectional walker sync with DialogTreeEditor:
  //   - Canvas walks (Step in / breadcrumb / beat switch) → dispatch
  //     `asaps:dialogTreeWalkChanged` so the inspector can auto-expand
  //     the matching parent chain and highlight the focused node.
  //   - Inspector "Walk here" button → fires `asaps:dialogTreeWalkRequest`
  //     which we listen for and apply to our local path state.
  useEffect(() => {
    if (beat?.type !== 'dialogTree') return;
    window.dispatchEvent(new CustomEvent('asaps:dialogTreeWalkChanged', {
      detail: { beatId: beat?.id, path: dialogTreeNodePath },
    }));
  }, [beat?.id, beat?.type, dialogTreeNodePath]);
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { beatId?: string; path?: string[] } | undefined;
      if (!detail || !Array.isArray(detail.path)) return;
      if (!beat || beat.type !== 'dialogTree') return;
      if (detail.beatId && detail.beatId !== beat.id) return;
      setDialogTreeNodePath(detail.path);
      setSelectedHotspotId(null);
    };
    window.addEventListener('asaps:dialogTreeWalkRequest', handler);
    return () => window.removeEventListener('asaps:dialogTreeWalkRequest', handler);
  }, [beat]);

  // P3-3c-12 — walk the tree to the node at the given path, or null if
  // any segment refers to a choice without a nested dialogNode.
  function dialogNodeAt(tree: any, path: string[]): any | null {
    if (!tree) return null;
    let cur = tree;
    for (const choiceId of path) {
      const choice = (cur?.choices ?? []).find((c: any) => c?.id === choiceId);
      if (!choice?.dialogNode) return null;
      cur = choice.dialogNode;
    }
    return cur;
  }

  // P3-3c-12 — return a new tree with `newChoices` substituted into the
  // node at `path`. Never mutates the input.
  function dialogTreeWithChoicesAt(tree: any, path: string[], newChoices: any[]): any {
    if (path.length === 0) return { ...(tree ?? {}), choices: newChoices };
    const [head, ...rest] = path;
    const choices = (tree?.choices ?? []).map((c: any) =>
      c?.id !== head || !c?.dialogNode
        ? c
        : { ...c, dialogNode: dialogTreeWithChoicesAt(c.dialogNode, rest, newChoices) }
    );
    return { ...(tree ?? {}), choices };
  }

  // P3-3c-8 / P3-3c-11 / P3-3c-12 — shared callbacks across
  // movementChoice, pickProp, and dialogTree (any depth). DialogTree's
  // items live nested at `dialogTree.{choices}.{dialogNode}.choices...`
  // so the accessor closes over the current dialogTreeNodePath.
  type HotspotItemsAccessor = {
    read: (params: any) => any[];
    write: (params: any, items: any[]) => any;
    itemKind: 'choice' | 'prop' | 'dialogChoice';
  };
  const hotspotItemsAccessorFor = (b: any): HotspotItemsAccessor | null => {
    if (b?.type === 'movementChoice') return {
      read: (p) => Array.isArray(p?.choices) ? p.choices : [],
      write: (p, items) => ({ ...p, choices: items }),
      itemKind: 'choice',
    };
    if (b?.type === 'pickProp') return {
      read: (p) => Array.isArray(p?.props) ? p.props : [],
      write: (p, items) => ({ ...p, props: items }),
      itemKind: 'prop',
    };
    if (b?.type === 'dialogTree') return {
      read: (p) => {
        const node = dialogNodeAt(p?.dialogTree, dialogTreeNodePath);
        return Array.isArray(node?.choices) ? node.choices : [];
      },
      write: (p, items) => ({
        ...p,
        dialogTree: dialogTreeWithChoicesAt(p?.dialogTree, dialogTreeNodePath, items),
      }),
      itemKind: 'dialogChoice',
    };
    return null;
  };
  const onHotspotChange = useCallback(
    (
      id: string,
      next: Pick<Hotspot, 'x' | 'y' | 'width' | 'height'>,
      commit: boolean,
      isPortrait: boolean
    ) => {
      const accessor = hotspotItemsAccessorFor(beat);
      if (!beat || !accessor) return;
      const params = beat.getParameters?.() ?? {};
      const items = [...accessor.read(params)];
      const idx = items.findIndex((c: any) => c?.id === id);
      if (idx < 0) return;
      const cur = items[idx];
      const curHotspot = (cur as any).hotspot ?? {};
      // P3-3e — route the edit to the variant the author was looking
      // at. Portrait edits write into hotspot.portrait (creating it on
      // first edit, with the canonical rect as its template so an
      // accidental tap doesn't blank the override). Landscape edits
      // write the canonical x/y/width/height as before.
      const nextHotspot = isPortrait
        ? {
            ...curHotspot,
            portrait: {
              x: next.x,
              y: next.y,
              width: next.width,
              height: next.height,
            },
          }
        : { ...curHotspot, x: next.x, y: next.y, width: next.width, height: next.height };
      items[idx] = { ...cur, hotspot: nextHotspot };
      const nextParams = accessor.write(params, items);
      beat.updateParameters?.(nextParams);
      if (commit && onBeatUpdate) {
        onBeatUpdate(beat.id, { parameters: { ...beat.getParameters(), ...nextParams } } as any);
      }
    },
    [beat, onBeatUpdate]
  );

  // P3-3c-6 — strip the item's hotspot but keep the item itself.
  const onHotspotDelete = useCallback(
    (id: string) => {
      const accessor = hotspotItemsAccessorFor(beat);
      if (!beat || !onBeatUpdate || !accessor) return;
      const params = beat.getParameters?.() ?? {};
      const items = [...accessor.read(params)];
      const idx = items.findIndex((c: any) => c?.id === id);
      if (idx < 0) return;
      const { hotspot, ...rest } = items[idx] as any;
      void hotspot;
      items[idx] = rest;
      const nextParams = accessor.write(params, items);
      beat.updateParameters?.(nextParams);
      onBeatUpdate(beat.id, { parameters: { ...beat.getParameters(), ...nextParams } } as any);
    },
    [beat, onBeatUpdate]
  );

  // P3-3c-5 / 8 / 11 — canvas draw-to-create. Placeholder shape depends
  // on the beat type's itemKind.
  const onHotspotCreate = useCallback(
    (rect: { x: number; y: number; width: number; height: number }): string | null => {
      const accessor = hotspotItemsAccessorFor(beat);
      if (!beat || !onBeatUpdate || !accessor) return null;
      const params = beat.getParameters?.() ?? {};
      const items = [...accessor.read(params)];
      const nextHotspot = {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        shape: 'rect' as const,
      };
      let targetIdx = items.findIndex((c: any) => !c?.hotspot);
      if (targetIdx < 0) {
        const newId = `${accessor.itemKind === 'prop' ? 'prop' : 'choice'}-${Date.now().toString(36).slice(-6)}`;
        const placeholder = accessor.itemKind === 'prop'
          ? { id: newId, name: 'New prop', description: '', target: '', hotspot: nextHotspot }
          : accessor.itemKind === 'dialogChoice'
            ? { id: newId, text: 'New choice', hotspot: nextHotspot }
            : { id: newId, text: 'New choice', target: '', hotspot: nextHotspot };
        items.push(placeholder);
        targetIdx = items.length - 1;
      } else {
        items[targetIdx] = { ...items[targetIdx], hotspot: nextHotspot };
      }
      const nextParams = accessor.write(params, items);
      beat.updateParameters?.(nextParams);
      onBeatUpdate(beat.id, { parameters: { ...beat.getParameters(), ...nextParams } } as any);
      return (items[targetIdx] as any).id ?? null;
    },
    [beat, onBeatUpdate]
  );

  // P3-anim-5 — replay tick. SlotAnimationsEditor's "Replay" button
  // dispatches `asaps:slotAnimReplay`; we key the preview SlotFlowView
  // with this tick so it remounts and all enter animations play from
  // scratch. Authors can iterate on a preset without clicking through
  // the beat to retrigger it.
  const [animReplayTick, setAnimReplayTick] = useState(0);
  useEffect(() => {
    const handler = () => setAnimReplayTick((t) => t + 1);
    window.addEventListener('asaps:slotAnimReplay', handler);
    return () => window.removeEventListener('asaps:slotAnimReplay', handler);
  }, []);
  // Compatibility helper for single-select consumers
  const selectedElementId = selectedElementIds.length > 0 ? selectedElementIds[0] : null;
  const [hasChanges, setHasChanges] = useState(false);
  const [activeTab, setActiveTab] = useState<'elements' | 'animations'>('elements');
  const [animations, setAnimations] = useState<AnimationPath[]>([]);
  const [leftPanelWidth, setLeftPanelWidth] = useState(320); // Default w-80 = 320px
  const [isResizingPanel, setIsResizingPanel] = useState(false);

  // Phase id of the currently-walked dialogTree node. Derived from
  // dialogTreeNodePath in a useEffect below; phaseOverrides still keys
  // off this. Drives only the persistence side of the per-phase
  // element-override system — no UI sets it directly anymore.
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null);

  // Keep selectedPhaseId in sync with dialogTreeNodePath. The legacy
  // per-phase override system (phaseOverrides) keys off selectedPhaseId,
  // and there's no UI that sets it directly any more — the breadcrumb +
  // preview step-into write to dialogTreeNodePath instead. This effect
  // walks the tree to the node at the path end and surfaces its id, so
  // phaseOverrides persistence continues to work without a parallel UI.
  useEffect(() => {
    if (beat?.type !== 'dialogTree') return;
    const params = beat.getParameters ? beat.getParameters() : {};
    const node = dialogNodeAt(params?.dialogTree, dialogTreeNodePath);
    const derived = node?.id || params?.dialogTree?.id || 'root';
    if (derived !== selectedPhaseId) {
      setSelectedPhaseId(derived);
    }
  }, [beat, dialogTreeNodePath, selectedPhaseId]);

  // Panorama view mode toggle: layout (flat equirect + VE tools) vs preview (PSV 360°)
  // Panorama beats always use preview mode (no layout mode)
  const panoramaViewMode: PanoramaViewMode = 'preview';
  // Counter to force PSV remount each time we enter preview
  const [psvMountKey, setPsvMountKey] = useState(0);
  const psvViewerRef = useRef<PSVViewer | null>(null);
  const psvMarkersRef = useRef<PSVMarkersPlugin | null>(null);
  const panoramaPreviewContainerRef = useRef<HTMLDivElement | null>(null);
  const [panoramaPreviewWidth, setPanoramaPreviewWidth] = useState(600);
  // Flag to prevent feedback loop: position-updated → updateParams → useEffect → rotate → position-updated
  const panoramaViewChangingRef = useRef(false);
  // Flag to prevent position-updated from saving before ready sets the correct zoom
  const panoramaReadyRef = useRef(false);
  // Track user interaction — only save when user is dragging/scrolling
  const panoramaUserInteractingRef = useRef(false);
  // Live camera state for markers — updated on EVERY position/zoom change
  const livePanoCamRef = useRef({ yaw: 0, pitch: 0, hfov: 75 });
  // VBE Stage zoom/scroll persistence across Layout↔Preview switches
  const vbeZoomRef = useRef(1);
  const vbeScrollRef = useRef<{ left: number; top: number }>({ left: 0, top: 0 });

  // Panorama preview direct-interaction drag/resize state (refs to avoid re-render churn)
  const previewDragRef = useRef<{
    elementId: string;
    offsetX: number;  // mouse-to-element-center offset in screen px
    offsetY: number;
  } | null>(null);

  const previewResizeRef = useRef<{
    elementId: string;
    corner: 'nw' | 'ne' | 'sw' | 'se';
    startMouseX: number;  // screen px relative to container
    startMouseY: number;
    startX: number;       // stage px
    startY: number;
    startWidth: number;
    startHeight: number;
  } | null>(null);

  // Translation state for showing translated text in VE
  const translationState = useTranslationState();

  // Use refs to track current state for cleanup
  const beatRef = useRef(beat);
  const visualElementsRef = useRef(visualElements);
  const backgroundAssetIdRef = useRef(backgroundAssetId);
  const backgroundSoundRef = useRef(backgroundSound);
  const animationsRef = useRef(animations);
  const hasChangesRef = useRef(hasChanges);
  const charactersRef = useRef(characters);

  // Track previous parameters to detect changes
  const prevParamsRef = useRef<string>('');

  // Update refs whenever state changes (EXCEPT beatRef which is updated in the save effect)
  useEffect(() => {
    visualElementsRef.current = visualElements;
  }, [visualElements]);

  useEffect(() => {
    backgroundAssetIdRef.current = backgroundAssetId;
  }, [backgroundAssetId]);

  useEffect(() => {
    animationsRef.current = animations;
  }, [animations]);

  useEffect(() => {
    backgroundSoundRef.current = backgroundSound;
  }, [backgroundSound]);

  useEffect(() => {
    hasChangesRef.current = hasChanges;
  }, [hasChanges]);

  useEffect(() => {
    charactersRef.current = characters;
  }, [characters]);

  // Memoized render theme for smart sizing - converts GlobalSettings to RenderThemeSettings
  const renderTheme = useMemo(() => {
    if (!globalSettings) return null;
    return convertGlobalSettingsToTheme(globalSettings);
  }, [globalSettings]);

  // ---- Undo/Redo snapshot tracking for visual element changes ----
  const snapshotRef = useRef<VisualElement[] | null>(null);
  const commitTimeoutRef = useRef<number | null>(null);
  // Ref to hold syncElementsToBeatLocations (defined later) so applyElements can call it
  const syncElementsRef = useRef<((elements: VisualElement[], beat: Beat) => void) | null>(null);

  // Unified function for applying element state (used by undo/redo)
  const applyElements = useCallback((elements: VisualElement[]) => {
    setVisualElements(elements);
    setHasChanges(true);
    if (beatRef.current && syncElementsRef.current) {
      syncElementsRef.current(elements, beatRef.current);
    }
  }, []);

  // Creates a command from snapshot vs current state
  const commitSnapshot = useCallback((description: string) => {
    if (!snapshotRef.current) return;
    const oldEls = snapshotRef.current;
    const newEls = visualElementsRef.current.map(el => ({ ...el }));
    snapshotRef.current = null;
    // Skip if no actual change
    if (JSON.stringify(oldEls) === JSON.stringify(newEls)) return;
    const cmd = new VisualElementsSnapshotCommand(oldEls, newEls, applyElements, description);
    getCommandManager().pushWithoutExecute(cmd);
  }, [applyElements]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (commitTimeoutRef.current) {
        clearTimeout(commitTimeoutRef.current);
      }
    };
  }, []);

  // Listen for elements added from the Inspector (hotspots, props via image asset selection)
  useEffect(() => {
    const handler = (e: Event) => {
      const { beatId, location } = (e as CustomEvent).detail;
      if (!beatRef.current || beatRef.current.id !== beatId) return;

      const loc = location as { kind: string; name: string; x: number; y: number; width: number; height: number; zIndex: number; assetId?: string };

      const addElement = (w: number, h: number) => {
        const newElement: VisualElement = {
          id: `element_${Date.now()}`,
          type: loc.kind as any,
          name: loc.name,
          x: loc.x,
          y: loc.y,
          z: loc.zIndex,
          width: w,
          height: h,
          rotation: 0,
          scale: 1,
          visible: true,
          locked: false,
          ...(loc.assetId ? { assetId: loc.assetId } : {}),
        };
        const afterElements = [...visualElementsRef.current, newElement];
        setVisualElements(afterElements);
        setHasChanges(true);

        // Update beat.locations with actual dimensions
        if (beatRef.current) {
          beatRef.current.locations.set(loc.name, {
            ...loc,
            width: Math.round(w),
            height: Math.round(h),
          } as any);
        }
      };

      // For elements with an image asset, load actual dimensions
      if (loc.assetId) {
        const asset = assets.find(a => a.id === loc.assetId);
        if (asset?.dimensions?.width && asset?.dimensions?.height) {
          addElement(asset.dimensions.width, asset.dimensions.height);
        } else if (asset?.url) {
          const img = new Image();
          img.onload = () => addElement(img.naturalWidth, img.naturalHeight);
          img.onerror = () => addElement(loc.width, loc.height);
          img.src = asset.url;
        } else {
          addElement(loc.width, loc.height);
        }
      } else {
        addElement(loc.width, loc.height);
      }
    };

    window.addEventListener('asaps:addElementToStage', handler);
    return () => window.removeEventListener('asaps:addElementToStage', handler);
  }, [assets]);

  // Handle panel resize dragging
  useEffect(() => {
    if (!isResizingPanel) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(280, Math.min(600, e.clientX));
      setLeftPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizingPanel(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingPanel]);

  // Asset selection modal state
  const [assetModal, setAssetModal] = useState<{
    isOpen: boolean;
    type: 'background' | 'character' | 'prop' | 'sound' | 'video' | null;
    callback: ((asset: Asset) => void) | null;
  }>({ isOpen: false, type: null, callback: null });

  // Meter selection modal state
  const [meterModal, setMeterModal] = useState<{
    isOpen: boolean;
  }>({ isOpen: false });

  // Phase tree computation for DialogTree beats
  // Note: We need to depend on beat._version to detect parameter changes (e.g., after merging)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const beatVersion = (beat as any)?._version;

  const dialogTreeParams = useMemo(() => {
    if (beat?.type !== 'dialogTree') return null;
    return (beat.getParameters?.() as { dialogTree?: DialogNode } | undefined)?.dialogTree || null;
  }, [beat?.type, beat?.id, beatVersion]);

  const phaseTree = useMemo(() => {
    if (beat?.type !== 'dialogTree' || !dialogTreeParams) return null;
    console.log('[VisualWorkspace] Building phase tree from dialogTree:', dialogTreeParams);
    const tree = buildPhaseTree(dialogTreeParams);
    console.log('[VisualWorkspace] Built phase tree:', tree);
    return tree;
  }, [beat?.type, dialogTreeParams]);

  const flattenedPhases = useMemo(() => {
    const flattened = flattenPhaseTree(phaseTree);
    console.log('[VisualWorkspace] Flattened phases:', flattened.length, flattened.map(p => p.id));
    return flattened;
  }, [phaseTree]);
  const isDialogTreeBeat = beat?.type === 'dialogTree' && flattenedPhases.length > 1;
  console.log('[VisualWorkspace] isDialogTreeBeat:', isDialogTreeBeat, 'phases:', flattenedPhases.length);

  const isPanoramaBeat = beat?.type === 'panorama';

  // Responsive slot-mode: a slot-declared beat (endScreen / onlineContent /
  // aiInfoText / aiSummary) that has NO author-baked pixel locations renders
  // responsively at runtime. Show the FAITHFUL SlotFlowView here instead of
  // the misleading pixel-positioned editor — and, by branching to a preview
  // that never calls onElementsChange/syncElementsToBeatLocations, the beat
  // can't accidentally bake locations[] and silently flip out of slot mode
  // (the no-bake guard; this is the Phase-1.5 correctness fix).
  const beatHasAuthorLocations = (beat?.locations?.size ?? 0) > 0;
  // Project-level gate for the schema-declared slot/spatial editor.
  // Fixed projects keep the legacy positioned editor for slot-mode beats
  // — the responsive (slot) editor is opt-in via the project layout-mode
  // flag, and the schema's slot declaration alone is not sufficient.
  // Hotspot-based spatial preview (isHotspotChoicePreview) is per-beat
  // author intent and stays regardless of project mode.
  const projectIsResponsive = resolveLayoutMode(globalSettings as any, beats as any) === 'responsive';
  // P3-anim-6.5 — spatial-mode beats (titleScreen) also get the responsive
  // preview. P3-3c-3 extends this to per-INSTANCE spatial: a movementChoice
  // whose every choice carries a hotspot composes through SpatialFlowView
  // even though its schema isn't layoutMode:spatial (the routing is
  // data-driven there).
  // P3-3c-5 — relaxed: the editor flips into spatial mode as soon as ANY
  // choice/prop has a hotspot OR there are none yet. This lets the author
  // draw the FIRST hotspot via drag (which auto-creates a choice/prop).
  // The runtime detection (in renderMovement / renderPropSelection) keeps
  // the same shape — items without a hotspot just don't render as
  // clickable regions.
  // P3-3c-8 / P3-3c-11 — generalized hotspot-bearing detection via the
  // accessor pair. Reads from the accessor's read(params) so dialogTree's
  // nested `dialogTree.choices` path works the same as movementChoice's
  // top-level `choices`.
  //
  // In responsive projects the spatial preview overrides baked locations
  // — the author opted into responsive flow, so the schema-declared slot
  // wins over the lingering positioned canvas. Fixed projects still
  // require !beatHasAuthorLocations so authors who haven't migrated keep
  // the legacy positioned editor.
  const hotspotAccessor = hotspotItemsAccessorFor(beat);
  const hotspotItemsKey: 'choices' | 'props' | 'dialogChoices' | null =
    !!beat && !isPanoramaBeat && (projectIsResponsive || !beatHasAuthorLocations) && !!hotspotAccessor
      ? (beat.type === 'movementChoice' ? 'choices'
        : beat.type === 'pickProp' ? 'props'
        : beat.type === 'dialogTree' ? 'dialogChoices'
        : null)
      : null;
  const hotspotItems: any[] = hotspotAccessor && beat
    ? hotspotAccessor.read(beat.getParameters?.() ?? {})
    : [];
  const isHotspotChoicePreview =
    hotspotItemsKey !== null
    && (hotspotItems.some((c: any) => c && c.hotspot) || hotspotItems.length === 0);
  // In responsive projects the schema's slot/spatial declaration is
  // authoritative — baked locations may linger from a prior fixed-mode
  // session but the responsive flow is what the author chose. In fixed
  // projects the schema declaration is only suggestive; baked author
  // positions still win (the editor stays on the absolute path).
  const beatLayoutTemplate = beat ? ((beat as any).layoutTemplate as string | undefined) : undefined;
  const schemaSpatial = !!beat && !isPanoramaBeat && isSpatialModeBeatType(beat.type)
    && (projectIsResponsive || !beatHasAuthorLocations);
  const schemaSlot = !!beat && !isPanoramaBeat && isSlotModeBeatType(beat.type)
    && (projectIsResponsive || !beatHasAuthorLocations);
  // DialogTree opts into slot mode template-by-template (the schema
  // doesn't declare layoutMode:'slot' on its own). When the author has
  // picked stacked / conversation / custom, the preview fires the slot
  // branch and uses the same inline slot spec the runtime uses
  // (speaker + body 'text' + actions). chat-* takes ChatDialogView.
  const dialogTreeSlotTemplate =
    !!beat && (beat.type === 'dialogTree' || beat.type === 'aiDialogTree')
    && (beatLayoutTemplate === 'stacked' || beatLayoutTemplate === 'conversation' || beatLayoutTemplate === 'custom')
    && (projectIsResponsive || !beatHasAuthorLocations);
  const INLINE_DIALOGTREE_SLOTS = [
    { name: 'speaker', role: 'speaker', source: 'speaker' },
    { name: 'text', role: 'body', source: 'text', grow: true, scroll: true },
    { name: 'actions', role: 'action' },
  ] as Array<{ name: string; role: 'speaker' | 'body' | 'action' | 'title'; source?: string; grow?: boolean; scroll?: boolean; buttons?: string[] }>;
  const isSpatialPreview =
    (projectIsResponsive && schemaSpatial)
    || isHotspotChoicePreview;
  const isSlotPreview =
    (projectIsResponsive && schemaSlot)
    || (projectIsResponsive && dialogTreeSlotTemplate)
    || isSpatialPreview;
  const slotSpec = isSpatialPreview
    ? (getSpatialSpec(beat!.type)?.slots ?? null)
    : (isSlotPreview
        ? (dialogTreeSlotTemplate ? INLINE_DIALOGTREE_SLOTS : getSlotSpec(beat!.type))
        : null);
  // Plain (non-memoized) derivation: the switch is trivial, and param edits
  // from the Inspector mutate the same Beat instance without changing its
  // identity — a useMemo keyed on `beat` would go stale on text edits.
  // VisualWorkspace re-renders on beat updates, so recomputing here is both
  // correct and cheap.
  const slotPreviewParams =
    isSlotPreview && beat ? beat.getParameters() : undefined;

  // Drag-to-snap: attach pointerdown handlers to body + action slot DOM
  // elements when slot preview is active and layoutTemplate is 'custom'.
  // Speaker is intentionally not draggable (rides along with body).
  // Re-runs when the slot preview re-mounts (key changes), the template
  // flips, or the beat changes.
  const customDragActive =
    isSlotPreview && slotPreviewParams?.layoutTemplate === 'custom' &&
    !!onSlotIntentChange;
  useEffect(() => {
    if (!customDragActive) return;
    // Slot elements come and go inside SlotFlowView (the action panel
    // returns null while the read-gate is unearned after a body-text
    // change — typical right after a step-in walk). A one-shot query
    // misses panels that mount later. We attach idempotently via a
    // WeakSet, and re-scan via a MutationObserver on the stage.
    const cleanups: Array<() => void> = [];
    const DRAG_THRESHOLD = 5; // px — distinguishes drag from a button click
    const attached = new WeakSet<HTMLElement>();
    const stage = document.querySelector('[data-slotflow-stage]') as HTMLElement | null;
    if (!stage) return;

    const attachToSlot = (slot: HTMLElement) => {
      if (attached.has(slot)) return;
      const slotName = slot.getAttribute('data-slotflow-slot');
      if (!slotName || slotName === 'speaker') return;
      attached.add(slot);
      // Pending drag: pointer-downed but not yet moved past the threshold.
      // We DON'T preventDefault / stopPropagation here so a quick click
      // (no movement) still passes through to the button's onClick
      // (which step-ins into the dialog node). Only once movement
      // crosses the threshold do we activate the drag.
      let pending: { x: number; y: number; stage: HTMLElement } | null = null;
      const onDown = (e: PointerEvent) => {
        if (e.button !== 0) return;
        // Stage rect comes from the marked SlotFlowView wrapper
        // (data-slotflow-stage), not the slot's offsetParent — the
        // latter shifts when the body scroller becomes positioned
        // (after an anchor is set on the body), making the body's
        // drag overlay rect a sub-rectangle of the action panel's.
        const st = (slot.closest('[data-slotflow-stage]') as HTMLElement | null);
        if (!st) return;
        pending = { x: e.clientX, y: e.clientY, stage: st };
      };
      const onMoveThreshold = (e: PointerEvent) => {
        if (!pending) return;
        const dx = e.clientX - pending.x;
        const dy = e.clientY - pending.y;
        if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return;
        const st = pending.stage;
        pending = null;
        setSlotDrag({
          slotName,
          stageRect: st.getBoundingClientRect(),
          pointerX: e.clientX,
          pointerY: e.clientY,
        });
      };
      const onUpClear = () => { pending = null; };
      slot.addEventListener('pointerdown', onDown);
      document.addEventListener('pointermove', onMoveThreshold);
      document.addEventListener('pointerup', onUpClear);
      const prevCursor = slot.style.cursor;
      slot.style.cursor = 'grab';
      cleanups.push(() => {
        slot.removeEventListener('pointerdown', onDown);
        document.removeEventListener('pointermove', onMoveThreshold);
        document.removeEventListener('pointerup', onUpClear);
        slot.style.cursor = prevCursor;
      });
    };

    // Initial scan.
    stage.querySelectorAll<HTMLElement>('[data-slotflow-slot]').forEach(attachToSlot);

    // Re-scan whenever the stage subtree mutates. Catches the action
    // panel re-mounting after the read-gate fires post-step-in. We
    // gate the observer callback on whether a drag is in flight —
    // during a drag the slot DOM is stable (just style updates we
    // already track), and the live-preview re-renders can fire dozens
    // of mutation events per frame, which froze the page on long
    // drags before this guard.
    const observer = new MutationObserver(() => {
      if (slotDragRef.current) return;
      stage.querySelectorAll<HTMLElement>('[data-slotflow-slot]').forEach(attachToSlot);
    });
    observer.observe(stage, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      cleanups.forEach(c => c());
    };
  }, [customDragActive, beat?.id, beat?.type, slotPreviewParams?.layoutTemplate, dialogTreeNodePath]);

  // Global pointer tracking during an active drag. Move updates the
  // overlay + the live-preview anchor; up snaps and commits the anchor.
  //
  // Two performance guards:
  //   • rAF-throttle pointermove so we update React state at most once
  //     per frame. Without this, a fast pointer move fires dozens of
  //     events per frame, each forcing a SlotFlowView re-render with a
  //     new previewSlotIntent — easily enough to choke the main thread
  //     into a "page unresponsive" dialog.
  //   • Deps key off slotDrag's *identity*, not its values — slotDrag
  //     null vs non-null. The pointermove closure reads through a ref
  //     so it always sees the latest stageRect / slotName without
  //     forcing the effect to re-attach listeners on every frame.
  const slotDragRef = useRef<SlotDrag | null>(null);
  useEffect(() => {
    slotDragRef.current = slotDrag;
  }, [slotDrag]);
  const slotDragActive = !!slotDrag;
  useEffect(() => {
    if (!slotDragActive || !onSlotIntentChange) return;
    let raf = 0;
    let nextX = 0;
    let nextY = 0;
    const flush = () => {
      raf = 0;
      setSlotDrag(prev => prev ? { ...prev, pointerX: nextX, pointerY: nextY } : null);
    };
    const onMove = (e: PointerEvent) => {
      nextX = e.clientX;
      nextY = e.clientY;
      if (!raf) raf = requestAnimationFrame(flush);
    };
    const onUp = (e: PointerEvent) => {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      const cur = slotDragRef.current;
      if (!cur) return;
      const x = e.clientX - cur.stageRect.left;
      const y = e.clientY - cur.stageRect.top;
      const { h, v } = snapPointerToZone(x, y, cur.stageRect);
      onSlotIntentChange(cur.slotName, { anchor: { h, v } });
      setSlotDrag(null);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
  }, [slotDragActive, onSlotIntentChange, snapPointerToZone]);
  // Bug 27 — speaker visibility for the VE slot preview, mirroring the
  // runtime's resolveSpeakerForSlot. Beat-level showSpeaker wins;
  // otherwise the global theme.speakerDisplay.showNames flag decides.
  // titleScreen has no speaker concept and stays blank.
  const slotPreviewSpeaker: string = (() => {
    if (!beat || beat.type === 'titleScreen') return '';
    const override = (beat as any).showSpeaker as boolean | undefined;
    const globalOn = !!(globalSettings as any)?.speakerDisplay?.showNames;
    const show = override === true ? true : override === false ? false : globalOn;
    if (!show) return '';
    return ((beat as any).speaker as string) || '';
  })();
  const slotPreviewContent: Record<string, any> | null =
    !isSlotPreview || !beat || !slotPreviewParams
      ? null
      : beat.type === 'titleScreen'
        ? {
            // P3-anim-6.5 — titleScreen (spatial mode). The flow slots are
            // 'title' (heading) + 'author' (body) + 'actions' (start button);
            // the spatial image rides on the beat background asset, threaded
            // as imageUrl on SpatialFlowView.
            title: slotPreviewParams.title || 'Untitled Story',
            author: slotPreviewParams.author || '',
            buttonText: slotPreviewParams.buttonText || 'Start',
          }
        : beat.type === 'movementChoice'
          ? {
              // P3-3c-3 — movementChoice spatial mode. Only the question
              // text becomes a flow slot; the choices appear as hotspots
              // on the spatial layer (rendered by the editor overlay).
              question: slotPreviewParams.question || 'Where do you want to go?',
              speaker: slotPreviewSpeaker,
            }
        : beat.type === 'multiChoice'
          ? {
              question: slotPreviewParams.question || 'What do you want to say?',
              speaker: slotPreviewSpeaker,
            }
        : beat.type === 'pickProp'
          ? {
              // P3-3c-8 — pickProp spatial mode. Mirrors movementChoice;
              // props appear as hotspots on the image.
              question: slotPreviewParams.question || 'What do you want to interact with?',
              speaker: slotPreviewSpeaker,
            }
        : beat.type === 'dialogTree'
          ? (() => {
              // P3-3c-12 — current node lookup along dialogTreeNodePath.
              // Falls back to root if the path is empty (or stale, e.g.
              // a choice was renamed and the path no longer resolves).
              const cur = dialogNodeAt(slotPreviewParams.dialogTree, dialogTreeNodePath)
                ?? slotPreviewParams.dialogTree;
              return {
                speaker: cur?.speaker || 'Speaker',
                text: cur?.text || 'Dialogue text...',
              };
            })()
        : beat.type === 'endScreen'
        ? {
            message: slotPreviewParams.message ?? '',
            showRestart: slotPreviewParams.showRestart,
            showCredits: slotPreviewParams.showCredits,
            restartText: slotPreviewParams.restartText,
            creditsText: slotPreviewParams.creditsText,
            speaker: slotPreviewSpeaker,
          }
        : beat.type === 'aiSummary'
          ? {
              title: slotPreviewParams.title ?? '',
              summary:
                (slotPreviewParams.summary ?? slotPreviewParams.fallbackText) ||
                SLOT_PREVIEW_SAMPLE_BODY,
              showRestart: slotPreviewParams.showRestart,
              showCredits: slotPreviewParams.showCredits,
              restartText: slotPreviewParams.restartText,
              creditsText: slotPreviewParams.creditsText,
            }
          : beat.type === 'inputText'
          ? {
              // inputText slot mode: prompt (body) + input field +
              // continue button. The input slot reads placeholder via
              // placeholderSource; the value is editor-disabled so the
              // author can author without typing.
              prompt: slotPreviewParams.prompt ?? '',
              placeholder: slotPreviewParams.placeholder ?? '',
              buttonText: slotPreviewParams.buttonText ?? 'Continue',
              speaker: slotPreviewSpeaker,
            }
          : {
              // onlineContent / aiInfoText / infoText / durScreen —
              // runtime fetches/generates the body for AI beats; preview
              // with the authored placeholder, or realistic sample filler
              // when there is none so the author can judge the real
              // composition.
              text:
                (slotPreviewParams.text ??
                  slotPreviewParams.displayTemplate ??
                  slotPreviewParams.fallbackText) ||
                SLOT_PREVIEW_SAMPLE_BODY,
              buttonText: slotPreviewParams.buttonText ?? 'Continue',
              speaker: slotPreviewSpeaker,
            };

  // True when the preview body above fell back to the editor-only sample
  // (drives the "sample text" caption so it isn't mistaken for content).
  // titleScreen and endScreen have their own body fields (author / message),
  // not text/summary, and never use the sample-body fallback — skip them.
  const slotPreviewUsesSample =
    isSlotPreview && !!beat && !!slotPreviewParams &&
    beat.type !== 'endScreen' && beat.type !== 'titleScreen' && beat.type !== 'inputText'
      ? !(
          (beat.type === 'aiSummary'
            ? (slotPreviewParams.summary ?? slotPreviewParams.fallbackText)
            : (slotPreviewParams.text ??
              slotPreviewParams.displayTemplate ??
              slotPreviewParams.fallbackText)) || ''
        )
      : false;

  // Memoized panorama projection type for PSV preview (equirectangular or cylindrical)
  const panoramaProjectionType = isPanoramaBeat && beat?.getParameters ? (beat.getParameters().projectionType || 'equirectangular') : 'equirectangular';

  // Track panorama image aspect ratio for coordinate conversion
  const [panoramaImageAspect, setPanoramaImageAspect] = useState<number>(4);
  useEffect(() => {
    if (!isPanoramaBeat || !backgroundUrl) return;
    const resolvedUrl = backgroundAssetId ? assets.find(a => a.id === backgroundAssetId)?.url : undefined;
    const img = new Image();
    img.onload = () => {
      const aspect = img.naturalWidth / img.naturalHeight;
      setPanoramaImageAspect(aspect);
      // Persist to beat params so SchemaLocationInitializer can use it
      if (beat?.updateParameters) {
        beat.updateParameters({ imageAspectRatio: aspect });
      }
    };
    img.src = resolvedUrl || backgroundUrl;
  }, [isPanoramaBeat, backgroundUrl, backgroundAssetId, assets]);

  // Listen for panorama hotspots added from the Inspector
  useEffect(() => {
    const handler = (e: Event) => {
      const { beatId, hotspot } = (e as CustomEvent).detail;
      if (!beatRef.current || beatRef.current.id !== beatId) return;

      // Convert yaw/pitch to stage pixel position
      const stageW = projectSettings?.width || 1024;
      const stageH = projectSettings?.height || 768;
      const params = beatRef.current.getParameters ? beatRef.current.getParameters() : {};
      const projType = params.projectionType || 'equirectangular';
      const imgAspect = params.imageAspectRatio ?? panoramaImageAspect;

      // Place new hotspot at current camera center
      let initYaw = livePanoCamRef.current.yaw;
      let initPitch = livePanoCamRef.current.pitch;

      const { centerX, centerY } = yawPitchToStage(initYaw, initPitch, projType, stageW, stageH, imgAspect);
      const hotspotWidth = 120;
      const hotspotHeight = 50;

      const newElement: VisualElement = {
        id: hotspot.id,
        type: 'hotspot',
        name: hotspot.text || 'Hotspot',
        text: hotspot.text || 'Hotspot',
        x: centerX - hotspotWidth / 2,
        y: centerY - hotspotHeight / 2,
        z: 10 + (params.hotspots?.length || 0),
        width: hotspotWidth,
        height: hotspotHeight,
        rotation: 0,
        scale: 1,
        visible: true,
        locked: false,
      };

      console.log(`[VisualWorkspace] Adding panorama hotspot VisualElement: id=${hotspot.id} at px(${Math.round(newElement.x)},${Math.round(newElement.y)}) from yaw=${initYaw} pitch=${initPitch}`);
      const afterElements = [...visualElementsRef.current, newElement];
      setVisualElements(afterElements);
      setHasChanges(true);
      // Sync to beat locations so yaw/pitch gets written to beat params
      if (beatRef.current && syncElementsRef.current) {
        syncElementsRef.current(afterElements, beatRef.current);
      }
    };

    window.addEventListener('asaps:addPanoramaHotspot', handler);
    return () => window.removeEventListener('asaps:addPanoramaHotspot', handler);
  }, [projectSettings, panoramaImageAspect]);

  const panoramaResolvedUrl = useMemo(() => {
    if (!isPanoramaBeat) return '';
    const resolvedUrl = backgroundAssetId ? assets.find(a => a.id === backgroundAssetId)?.url : undefined;
    return resolvedUrl || backgroundUrl || '';
  }, [isPanoramaBeat, backgroundAssetId, backgroundUrl, assets]);

  // Extract hotspot data from beat parameters for the preview
  const panoramaHotspots: { id: string; pitch: number; yaw: number; text: string; locationName?: string }[] = useMemo(() => {
    if (!isPanoramaBeat || !beat) return [];
    const params = beat.getParameters ? beat.getParameters() : {};
    return (params.hotspots || []).map((hs: any) => ({
      id: hs.id as string,
      pitch: hs.pitch as number,
      yaw: hs.yaw as number,
      text: (hs.text || '') as string,
      locationName: hs.locationName as string | undefined,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPanoramaBeat, beat, beatVersion]);

  // EndScreen with credits phase detection
  const isEndScreenWithCredits = useMemo(() => {
    if (beat?.type !== 'endScreen') return false;
    const params = beat.getParameters ? beat.getParameters() : {};
    return params.showCredits === true;
  }, [beat?.type, beat?.id, beatVersion]);

  const endScreenPhases = useMemo(() => {
    if (!isEndScreenWithCredits) return [];
    return [
      { id: 'main', label: 'End Screen' },
      { id: 'credits', label: 'Credits' },
    ];
  }, [isEndScreenWithCredits]);

  // Get the current phase's DialogNode for phase-aware editing
  // Must depend on dialogTreeParams to recalculate when dialog tree is modified (e.g., adding choices)
  const selectedPhase = useMemo(() => {
    if (beat?.type !== 'dialogTree' || !selectedPhaseId || !dialogTreeParams) return null;
    return findPhaseById(dialogTreeParams, selectedPhaseId);
  }, [beat?.type, dialogTreeParams, selectedPhaseId]);

  // Track previous phase ID to detect phase changes for auto-save
  const prevPhaseIdRef = useRef<string | null>(null);
  // Track previous phase choices count to detect when choices are added/removed
  const prevChoicesCountRef = useRef<number>(0);

  // Reset selected phase and panorama view mode when beat changes
  useEffect(() => {
    if (beat?.id) {
      if (beat.type === 'endScreen') {
        // Default to 'main' phase for EndScreen
        setSelectedPhaseId('main');
      } else {
        // Default to root phase when switching beats
        const rootPhase = phaseTree?.id || null;
        setSelectedPhaseId(rootPhase);
      }
      // Reset panorama viewer when switching beats
      panoramaReadyRef.current = false;
      if (psvViewerRef.current) {
        try { psvViewerRef.current.destroy(); } catch { /* ignore */ }
        psvViewerRef.current = null;
        psvMarkersRef.current = null;
      }
      // Set prevPhaseIdRef to null so the phase effect knows to reload
      // (if we set it to rootPhase, the phase effect would skip loading)
      prevPhaseIdRef.current = null;
    }
  }, [beat?.id, beat?.type, phaseTree?.id]);

  // Sync panorama camera settings (sliders) to the PSV preview
  useEffect(() => {
    if (!isPanoramaBeat || !psvViewerRef.current) return;
    // Skip if this update came from the PSV viewer itself (prevents feedback loop)
    if (panoramaViewChangingRef.current) return;
    // Defer to ready handler for initial camera setup
    if (!panoramaReadyRef.current) return;
    try {
      const viewer = psvViewerRef.current;
      const params = beat!.getParameters();
      const yawDeg = Number.isFinite(params.initialYaw) ? params.initialYaw : 0;
      const pitchDeg = Number.isFinite(params.initialPitch) ? params.initialPitch : 0;
      // FOV is the design-time ground truth — no min/max clamping in the editor
      const hfovDeg = Math.max(10, Number.isFinite(params.hfov) ? params.hfov : 75);
      viewer.rotate({ yaw: yawDeg * DEG_TO_RAD, pitch: pitchDeg * DEG_TO_RAD });
      const vFov = viewer.dataHelper.hFovToVFov(hfovDeg);
      viewer.zoom(viewer.dataHelper.fovToZoomLevel(vFov));
    } catch { /* viewer may not be fully loaded yet */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPanoramaBeat, beatVersion]);

  /**
   * Generate visual elements for a specific DialogTree phase
   * Uses the shared computeDialogTreeLayout from @asaps/core
   * This ensures visual editor and preview use identical position calculations
   *
   * Position priority (handled by computeDialogTreeLayout):
   * 1. phaseOverrides (user-edited positions)
   * 2. storedLocations (imported ASML positions)
   * 3. auto-layout (fallback for new beats)
   */
  const generatePhaseElements = useCallback((
    phase: DialogNode,
    stageWidth: number,
    stageHeight: number,
    overrides?: Record<string, Partial<{ x: number; y: number; width: number; height: number }>>,
    storedLocations?: Map<string, Location>
  ): VisualElement[] => {
    // Build theme from global settings
    // IMPORTANT: These same values must be passed to DialogTreeBeat via renderer state
    // to ensure WYSIWYG - the preview uses the settings passed through previewData.settings
    const layoutTheme: DialogTreeLayoutTheme = {
      fontSize: globalSettings?.fonts?.fontSize?.text || 16,
      fontFamily: globalSettings?.fonts?.textFont || 'Arial',
      padding: globalSettings?.textbox?.padding || 20,
      maxTextWidthRatio: 0.8,
      maxButtonWidthRatio: 0.6,
      textButtonGap: 20,
      buttonGap: 16,
      startY: 50,
    };

    // Log input overrides for debugging
    if (overrides) {
      console.log(`[VisualWorkspace] generatePhaseElements overrides for phase ${phase.id}:`, overrides);
    }

    // Use shared layout calculation (same function used by preview/renderer)
    const layout = computeDialogTreeLayout({
      phase: {
        id: phase.id || 'root',
        speaker: phase.speaker || '',
        text: phase.text || '',
        choices: (phase.choices || []).map((c, idx) => ({
          id: c.id || `choice_${idx}`,
          text: c.text || '',
        })),
      },
      stageWidth,
      stageHeight,
      theme: layoutTheme,
      overrides,
      storedLocations,
    });

    // Convert to VisualElements using the shared layout's method
    const elements = layout.toVisualElements() as VisualElement[];
    console.log(`[VisualWorkspace] generatePhaseElements output:`, elements.map(el => ({ id: el.id, name: el.name, text: el.text?.substring(0, 30), z: el.z })));
    return elements;
  }, [globalSettings]);

  /**
   * Sync visual elements to beat.locations Map
   * This is called whenever elements change to ensure preview always has latest positions
   */
  const syncElementsToBeatLocations = useCallback((elements: VisualElement[], targetBeat: Beat) => {
    if (!targetBeat) return;

    targetBeat.locations.clear();

    elements.forEach((el: VisualElement) => {
      if (el.name === 'Main Text') return;

      // Skip credits-phase elements — they are persisted via phaseOverrides, not beat.locations
      if (el.id === 'credits_title' || el.id === 'credits_body' || el.id === 'credits_close') return;

      let kind: 'text' | 'hotspot' | 'prop' | 'character' | 'button' | 'dialog' | 'meter' | 'keypad';
      if (el.type === 'character') kind = 'character';
      else if (el.type === 'prop') kind = 'prop';
      else if (el.type === 'dialog') kind = 'dialog';
      else if (el.type === 'button') kind = 'button';
      else if (el.type === 'hotspot') kind = 'hotspot';
      else if (el.type === 'meter') kind = 'meter';
      else if (el.type === 'keypad') kind = 'keypad';
      else kind = 'text';

      // Use consistent key for both Map key and location.name to avoid
      // mismatches after serialization (toJSON uses values, Beat constructor uses loc.name as key)
      const locationKey = el.name || el.text || el.id;
      const location: any = {
        kind,
        name: locationKey,
        id: el.id, // Include element ID for animation targeting
        x: Math.round(el.x),
        y: Math.round(el.y),
        width: Math.round(el.width),
        height: Math.round(el.height),
        zIndex: el.z
      };

      // Add optional properties
      if (el.assetId) location.assetId = el.assetId;
      if (el.imageUrl) location.imageUrl = el.imageUrl;
      if (el.sound) location.sound = el.sound;
      if (el.fontOverridden && el.font) location.font = el.font;
      if (el.fontOverridden && el.fontSize !== undefined) location.fontSize = el.fontSize;
      if (el.textAlign) location.textAlign = el.textAlign;
      location.autosize = !el.fontOverridden || el.fontSize === undefined;

      // Add transform properties (rotation and scale)
      if (el.rotation !== undefined && el.rotation !== 0) location.rotation = el.rotation;
      if (el.scale !== undefined && el.scale !== 1) location.scale = el.scale;

      // Add character-specific properties
      if (el.type === 'character') {
        if (el.characterId) location.characterId = el.characterId;
        if (el.characterName) location.characterName = el.characterName;
        if (el.stateId) location.stateId = el.stateId;
        if (el.size !== undefined) location.size = el.size;
        // Look up character name if not already set
        if (!location.characterName) {
          const character = charactersRef.current.find(c => c.id === el.characterId);
          if (character) {
            location.characterName = character.name;
          }
        }
      }

      // Add meter-specific properties
      if (el.type === 'meter') {
        if (el.characterId) location.characterId = el.characterId;
        if (el.counterName) location.counterName = el.counterName;
        if (el.meterOrientation) location.meterOrientation = el.meterOrientation;
        if (el.showNumericValue !== undefined) location.showNumericValue = el.showNumericValue;
        if (el.numericFormat) location.numericFormat = el.numericFormat;
        if (el.meterColor) location.meterColor = el.meterColor;
        if (el.meterBackgroundColor) location.meterBackgroundColor = el.meterBackgroundColor;
      }

      // Add scroll behavior properties (for text/dialog elements)
      if (el.requireScrollToBottom) location.requireScrollToBottom = el.requireScrollToBottom;
      if (el.manuallyResized) location.manuallyResized = el.manuallyResized;
      if (el.initialAutoSized) location.initialAutoSized = el.initialAutoSized;

      // Per-element hotspot appearance override
      if ((el as any).hotspotOverride?.enabled) location.hotspotOverride = (el as any).hotspotOverride;

      targetBeat.locations.set(locationKey, location);
    });

    console.log(`[VisualWorkspace] Synced ${targetBeat.locations.size} locations to beat.locations`);

    // For panorama beats, also sync hotspot positions from elements back to beat parameters
    if (targetBeat.type === 'panorama') {
      const stageW = projectSettings?.width || 1024;
      const stageH = projectSettings?.height || 768;
      syncPanoramaHotspotsFromElements(elements, targetBeat, stageW, stageH);
    }
  }, [projectSettings]);

  /**
   * Sync panorama hotspot positions from VisualElements back to beat.hotspots[]
   * Converts element x/y center → pitch/yaw and merges into existing hotspot data
   */
  const syncPanoramaHotspotsFromElements = useCallback((
    elements: VisualElement[],
    targetBeat: Beat,
    stageW: number,
    stageH: number
  ) => {
    const params = targetBeat.getParameters ? targetBeat.getParameters() : {};
    const existingHotspots: any[] = params.hotspots || [];
    const hotspotElements = elements.filter(el => el.type === 'hotspot');

    console.log(`[SyncHotspots] ${existingHotspots.length} hotspots, ${hotspotElements.length} elements`);
    for (const hs of existingHotspots) {
      console.log(`[SyncHotspots]   hs: id="${hs.id}" text="${hs.text}" pitch=${hs.pitch} yaw=${hs.yaw}`);
    }
    for (const el of hotspotElements) {
      console.log(`[SyncHotspots]   el: id="${el.id}" name="${el.name}" center=(${Math.round(el.x + el.width/2)},${Math.round(el.y + el.height/2)})`);
    }

    const updatedHotspots = existingHotspots.map((hs: any) => {
      const el = hotspotElements.find(e => e.id === hs.id) ||
                 hotspotElements.find(e => e.name === hs.text);
      if (!el) {
        console.warn(`[SyncHotspots] NO MATCH for hs "${hs.text}" (id=${hs.id})`);
        return hs;
      }

      // Convert element center x/y → yaw/pitch
      const xCenter = el.x + el.width / 2;
      const yCenter = el.y + el.height / 2;
      const { yaw, pitch } = stageToYawPitch(xCenter, yCenter, panoramaProjectionType, stageW, stageH, panoramaImageAspect);

      console.log(`[SyncHotspots] MATCHED hs "${hs.text}" → el "${el.name}" (id match: ${el.id === hs.id}): pitch ${hs.pitch}→${Math.round(pitch*10)/10}, yaw ${hs.yaw}→${Math.round(yaw*10)/10}`);

      return {
        ...hs,
        pitch: Math.round(pitch * 10) / 10,
        yaw: Math.round(yaw * 10) / 10,
      };
    });

    targetBeat.updateParameters({ hotspots: updatedHotspots });
  }, [panoramaProjectionType, panoramaImageAspect]);

  // Keep sync ref up to date for undo/redo applyElements
  syncElementsRef.current = syncElementsToBeatLocations;

  /**
   * Unproject screen coordinates (relative to panorama preview container) back to stage pixels.
   * Uses inverse gnomonic projection for perspective-correct mapping.
   */
  const DEG_TO_RAD = Math.PI / 180;
  const RAD_TO_DEG = 180 / Math.PI;

  /**
   * Unproject screen coordinates to stage pixels using PSV's viewerCoordsToSphericalCoords.
   * This replaces the old gnomonic unproject and uses PSV's native inverse projection.
   */
  const unprojectScreenToStage = useCallback((screenX: number, screenY: number) => {
    const stageW = projectSettings?.width || 1024;
    const stageH = projectSettings?.height || 768;
    const viewer = psvViewerRef.current;
    if (viewer) {
      try {
        const pos = viewer.dataHelper.viewerCoordsToSphericalCoords({ x: screenX, y: screenY });
        const yawDeg = pos.yaw * RAD_TO_DEG;
        const pitchDeg = pos.pitch * RAD_TO_DEG;
        const stage = yawPitchToStage(yawDeg, pitchDeg, panoramaProjectionType, stageW, stageH, panoramaImageAspect);
        let cx = stage.centerX;
        let cy = stage.centerY;
        // Wrap horizontally for equirectangular
        if (cx < 0) cx += stageW;
        if (cx > stageW) cx -= stageW;
        cy = Math.max(0, Math.min(stageH, cy));
        return { cx, cy };
      } catch { /* fall through */ }
    }
    // Fallback if viewer not available
    return { cx: stageW / 2, cy: stageH / 2 };
  }, [projectSettings, panoramaProjectionType, panoramaImageAspect]);

  /** Convert screen pixel delta to stage pixel delta (for resize). */
  const screenToStageDelta = useCallback((dScreenX: number, dScreenY: number) => {
    const stageW = projectSettings?.width || 1024;
    const stageH = projectSettings?.height || 768;
    const cW = panoramaPreviewWidth || 600;
    const cH = cW / (stageW / stageH);
    const hfov = Math.max(30, livePanoCamRef.current.hfov);
    const vp = viewportSizeOnStage(hfov, panoramaProjectionType, stageW, stageH, panoramaImageAspect, stageW / stageH);
    return {
      dStageX: dScreenX * vp.width / cW,
      dStageY: dScreenY * vp.height / cH,
    };
  }, [projectSettings, panoramaPreviewWidth, panoramaProjectionType, panoramaImageAspect]);

  // ---- Panorama preview direct-interaction handlers (drag & resize) ----

  /** Get mouse position relative to the panorama preview container */
  const getPreviewMousePos = useCallback((e: React.PointerEvent) => {
    const container = panoramaPreviewContainerRef.current;
    if (!container) return { x: 0, y: 0 };
    const rect = container.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const handlePreviewPointerDown = useCallback((e: React.PointerEvent, elementId: string) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedElementIds([elementId]);

    // Capture undo snapshot
    if (!snapshotRef.current) {
      snapshotRef.current = visualElementsRef.current.map(el => ({ ...el }));
    }

    // Compute drag offset = mouse position minus element's projected screen center
    const mouse = getPreviewMousePos(e);
    const el = visualElementsRef.current.find(v => v.id === elementId);
    if (!el) return;

    // Project element center to screen using PSV's sphericalCoordsToViewerCoords
    const stageW = projectSettings?.width || 1024;
    const stageH = projectSettings?.height || 768;
    const elCx = el.x + el.width / 2;
    const elCy = el.y + el.height / 2;
    const { yaw: elYaw, pitch: elPitch } = stageToYawPitch(elCx, elCy, panoramaProjectionType, stageW, stageH, panoramaImageAspect);

    const viewer = psvViewerRef.current;
    let screenCx = (panoramaPreviewWidth || 600) / 2;
    let screenCy = screenCx / (stageW / stageH) / 2;
    if (viewer) {
      try {
        const pt = viewer.dataHelper.sphericalCoordsToViewerCoords({ yaw: elYaw * DEG_TO_RAD, pitch: elPitch * DEG_TO_RAD });
        screenCx = pt.x;
        screenCy = pt.y;
      } catch { /* ignore */ }
    }

    previewDragRef.current = {
      elementId,
      offsetX: mouse.x - screenCx,
      offsetY: mouse.y - screenCy,
    };
    // Capture on the container (currentTarget), not on the marker element (target).
    // Marker elements get destroyed/recreated by setMarkers() during drag,
    // which would release pointer capture if set on target.
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [getPreviewMousePos, projectSettings, panoramaProjectionType, panoramaImageAspect]);

  const handlePreviewPointerMove = useCallback((e: React.PointerEvent) => {
    const mouse = getPreviewMousePos(e);

    // Resize takes priority over drag.
    if (previewResizeRef.current) {
      const rs = previewResizeRef.current;
      const dMouse = { x: mouse.x - rs.startMouseX, y: mouse.y - rs.startMouseY };
      const { dStageX, dStageY } = screenToStageDelta(dMouse.x, dMouse.y);

      // Center-symmetric resize: grow/shrink from element center so the
      // marker's yaw/pitch position stays fixed in PSV (avoids visual drift).
      const centerX = rs.startX + rs.startWidth / 2;
      const centerY = rs.startY + rs.startHeight / 2;

      // Determine size delta based on which corner is dragged
      let dw = 0, dh = 0;
      if (rs.corner === 'se')      { dw =  dStageX * 2; dh =  dStageY * 2; }
      else if (rs.corner === 'nw') { dw = -dStageX * 2; dh = -dStageY * 2; }
      else if (rs.corner === 'ne') { dw =  dStageX * 2; dh = -dStageY * 2; }
      else if (rs.corner === 'sw') { dw = -dStageX * 2; dh =  dStageY * 2; }

      const newW = Math.max(30, rs.startWidth + dw);
      const newH = Math.max(20, rs.startHeight + dh);
      const newX = centerX - newW / 2;
      const newY = centerY - newH / 2;

      const updated = visualElementsRef.current.map(el => {
        if (el.id !== rs.elementId) return el;
        return { ...el, x: newX, y: newY, width: newW, height: newH };
      });
      setVisualElements(updated);
      setHasChanges(true);
      if (beatRef.current) {
        syncElementsToBeatLocations(updated, beatRef.current);
      }
    } else if (previewDragRef.current) {
      const drag = previewDragRef.current;
      // Compute new screen center (mouse - offset), unproject to stage
      const screenCx = mouse.x - drag.offsetX;
      const screenCy = mouse.y - drag.offsetY;
      const { cx, cy } = unprojectScreenToStage(screenCx, screenCy);

      const updated = visualElementsRef.current.map(el => {
        if (el.id !== drag.elementId) return el;
        return { ...el, x: cx - el.width / 2, y: cy - el.height / 2 };
      });
      setVisualElements(updated);
      setHasChanges(true);
      if (beatRef.current) {
        syncElementsToBeatLocations(updated, beatRef.current);
      }
    }
  }, [getPreviewMousePos, unprojectScreenToStage, screenToStageDelta, syncElementsToBeatLocations]);

  const handlePreviewPointerUp = useCallback((e: React.PointerEvent) => {
    if (previewDragRef.current || previewResizeRef.current) {
      commitSnapshot(previewResizeRef.current ? 'Resize element' : 'Move element');
      previewDragRef.current = null;
      previewResizeRef.current = null;
      try {
        // Release on the container (currentTarget) — matches the capture target
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // Pointer capture may already be released
      }
    }
  }, [commitSnapshot]);

  const handlePreviewResizeDown = useCallback((e: React.PointerEvent, elementId: string, corner: 'nw' | 'ne' | 'sw' | 'se') => {
    e.stopPropagation();
    e.preventDefault();

    // Capture undo snapshot
    if (!snapshotRef.current) {
      snapshotRef.current = visualElementsRef.current.map(el => ({ ...el }));
    }

    const mouse = getPreviewMousePos(e);
    const el = visualElementsRef.current.find(v => v.id === elementId);
    if (!el) return;

    previewResizeRef.current = {
      elementId,
      corner,
      startMouseX: mouse.x,
      startMouseY: mouse.y,
      startX: el.x,
      startY: el.y,
      startWidth: el.width,
      startHeight: el.height,
    };
    // Capture on the container (currentTarget), not on the corner handle element.
    // Corner elements get destroyed/recreated by setMarkers() during resize.
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [getPreviewMousePos]);

  // Save changes when switching to a different beat - MUST run before load
  const prevBeatIdRef = useRef(beat?.id);

  useEffect(() => {
    // If beat ID is changing and we had unsaved changes, save to the PREVIOUS beat first
    if (beat?.id !== prevBeatIdRef.current && hasChangesRef.current && beatRef.current) {
      const prevBeat = beatRef.current;

      // Save using refs to get current state
      const params = prevBeat.getParameters ? prevBeat.getParameters() : {};

      // Clear beat.locations and repopulate with ALL properties
      // For DialogTree beats: only save characters, props, meters (dialog/buttons are phase-specific)
      prevBeat.locations.clear();

      visualElementsRef.current.forEach((el: VisualElement) => {
        if (el.name === 'Main Text') return;

        // Skip credits-phase elements — they are persisted via phaseOverrides, not beat.locations
        if (el.id === 'credits_title' || el.id === 'credits_body' || el.id === 'credits_close') return;

        // For DialogTree beats, skip dialog and button elements (they're regenerated per phase)
        if (prevBeat.type === 'dialogTree' && (el.type === 'dialog' || el.type === 'button')) {
          return;
        }

        let kind: 'text' | 'hotspot' | 'prop' | 'character' | 'button' | 'dialog' | 'meter' | 'keypad';
        if (el.type === 'character') kind = 'character';
        else if (el.type === 'prop') kind = 'prop';
        else if (el.type === 'dialog') kind = 'dialog';
        else if (el.type === 'button') kind = 'button';
        else if (el.type === 'hotspot') kind = 'hotspot';
        else if (el.type === 'meter') kind = 'meter';
        else if (el.type === 'keypad') kind = 'keypad';
        else kind = 'text';

        // Use consistent key for both Map key and location.name
        const locationKey = el.name || el.text || el.id;
        const location: any = {
          kind,
          name: locationKey,
          id: el.id,  // Include element ID for animation targeting
          x: Math.round(el.x),
          y: Math.round(el.y),
          width: Math.round(el.width),
          height: Math.round(el.height),
          zIndex: el.z
        };

        // Add optional properties
        if (el.assetId) location.assetId = el.assetId;
        if ((el as any).assetType) location.assetType = (el as any).assetType;
        if (el.imageUrl) location.imageUrl = el.imageUrl;  // Preserve direct image URL (ASML imports)
        if (el.sound) location.sound = el.sound;
        if (el.fontOverridden && el.font) location.font = el.font;
        if (el.fontOverridden && el.fontSize !== undefined) location.fontSize = el.fontSize;
        if (el.textAlign) location.textAlign = el.textAlign;
        location.autosize = !el.fontOverridden || el.fontSize === undefined;

        // Add transform properties (rotation and scale)
        if (el.rotation !== undefined && el.rotation !== 0) location.rotation = el.rotation;
        if (el.scale !== undefined && el.scale !== 1) location.scale = el.scale;

        // Add character-specific properties (for kind='character')
        if (el.type === 'character') {
          if (el.characterId) location.characterId = el.characterId;
          if (el.characterName) location.characterName = el.characterName;  // Preserve character name
          if (el.stateId) location.stateId = el.stateId;
          if (el.size !== undefined) location.size = el.size;
          // Look up character name for ASML export compatibility (if not already set)
          if (!location.characterName) {
            const character = charactersRef.current.find(c => c.id === el.characterId);
            if (character) {
              location.characterName = character.name;
            }
          }
        }

        // Add meter-specific properties (for kind='meter')
        if (el.type === 'meter') {
          if (el.characterId) location.characterId = el.characterId;
          if (el.counterName) location.counterName = el.counterName;
          if (el.meterOrientation) location.meterOrientation = el.meterOrientation;
          if (el.showNumericValue !== undefined) location.showNumericValue = el.showNumericValue;
          if (el.numericFormat) location.numericFormat = el.numericFormat;
          if (el.meterColor) location.meterColor = el.meterColor;
          if (el.meterBackgroundColor) location.meterBackgroundColor = el.meterBackgroundColor;
        }

        // Per-element hotspot appearance override
        if ((el as any).hotspotOverride?.enabled) location.hotspotOverride = (el as any).hotspotOverride;

        prevBeat.locations.set(locationKey, location);
      });

      // For DialogTree and EndScreen beats: save phase-specific element positions to phaseOverrides
      // This preserves dialog/button positions when switching beats
      // Use selectedPhaseId as fallback if prevPhaseIdRef.current is null (e.g., after HMR re-mount)
      const phaseKeyToSave = prevPhaseIdRef.current || selectedPhaseId;
      if ((prevBeat.type === 'dialogTree' || prevBeat.type === 'endScreen') && phaseKeyToSave) {
        const phaseKey = phaseKeyToSave;
        const overrides: Record<string, Partial<{ x: number; y: number; width: number; height: number; z: number }>> = {};

        visualElementsRef.current.forEach((el: VisualElement) => {
          // Save ALL elements to phaseOverrides (dialog, buttons, and others)
          // Now includes z-index to preserve reordering
          overrides[el.id] = {
            x: el.x,
            y: el.y,
            width: el.width,
            height: el.height,
            z: el.z,
          };
        });

        const existingOverrides = params.phaseOverrides || {};
        params.phaseOverrides = {
          ...existingOverrides,
          [phaseKey]: overrides,
        };
        console.log(`[VisualWorkspace] Saved phase overrides for phase: ${phaseKey} before beat change`, overrides);
      }

      // For panorama beats, also save panoramaAssetId and sync hotspot positions
      if (prevBeat.type === 'panorama') {
        params.panoramaAssetId = backgroundAssetIdRef.current;
        // Sync hotspot x/y → pitch/yaw before saving
        const stageW = projectSettings?.width || 1024;
        const stageH = projectSettings?.height || 768;
        const projType = params.projectionType || 'equirectangular';
        const hotspotEls = visualElementsRef.current.filter(el => el.type === 'hotspot');
        if (params.hotspots && hotspotEls.length > 0) {
          params.hotspots = params.hotspots.map((hs: any) => {
            const el = hotspotEls.find(e => e.id === hs.id);
            if (!el) return hs;
            const xCenter = el.x + el.width / 2;
            const yCenter = el.y + el.height / 2;
            const { yaw, pitch } = stageToYawPitch(xCenter, yCenter, projType, stageW, stageH, panoramaImageAspect);
            return {
              ...hs,
              pitch: Math.round(pitch * 10) / 10,
              yaw: Math.round(yaw * 10) / 10,
            };
          });
        }
      }

      // Save to parameters
      prevBeat.updateParameters({
        ...params,
        visualElements: visualElementsRef.current,
        backgroundAssetId: backgroundAssetIdRef.current,
        node: backgroundAssetIdRef.current,
        backgroundSound: backgroundSoundRef.current,
        animations: animationsRef.current
      });

      // Also set animations directly on beat (updateParameters doesn't handle base Beat properties)
      prevBeat.animations = animationsRef.current;

      console.log(`[VisualWorkspace] Auto-saved ${prevBeat.locations.size} locations and ${animationsRef.current?.length || 0} animations to previous beat`);
    }

    // Update beatRef to new beat AFTER saving to previous beat
    beatRef.current = beat;

    // NOTE: Don't update prevBeatIdRef here! It's updated by the phase loading effect
    // so that effect can correctly detect beat changes. The auto-save check at line 512
    // will still work because prevBeatIdRef isn't updated until AFTER phase loading.
  }, [beat]); // Depend on beat object, not beat?.id, to run before the load

  /**
   * Save current phase overrides before switching to a new phase
   */
  const saveCurrentPhaseOverrides = useCallback(() => {
    if (!beat || !prevPhaseIdRef.current) return;
    if (beat.type !== 'dialogTree' && beat.type !== 'endScreen') return;
    if (!hasChanges) return; // No changes to save

    const params = beat.getParameters ? beat.getParameters() : {};
    const phaseKey = prevPhaseIdRef.current;

    // Calculate overrides: elements that differ from auto-layout
    // For simplicity, save all element positions as overrides
    // Now includes z-index to preserve reordering
    const overrides: Record<string, Partial<{ x: number; y: number; width: number; height: number; z: number }>> = {};

    visualElements.forEach(el => {
      overrides[el.id] = {
        x: el.x,
        y: el.y,
        width: el.width,
        height: el.height,
        z: el.z,
      };
    });

    // Save to phaseOverrides
    const existingOverrides = params.phaseOverrides || {};
    const updatedParams: any = {
      ...params,
      phaseOverrides: {
        ...existingOverrides,
        [phaseKey]: overrides,
      },
    };

    // Also sync credits text when leaving credits phase
    if (beat.type === 'endScreen' && phaseKey === 'credits') {
      const titleEl = visualElements.find(el => el.id === 'credits_title');
      const bodyEl = visualElements.find(el => el.id === 'credits_body');
      const closeEl = visualElements.find(el => el.id === 'credits_close');
      if (titleEl?.text !== undefined) updatedParams.creditsPageTitle = titleEl.text;
      if (bodyEl?.text !== undefined) updatedParams.creditsPageBody = bodyEl.text;
      if (closeEl?.text !== undefined) updatedParams.creditsCloseText = closeEl.text;
    }

    beat.updateParameters(updatedParams);

    console.log(`[VisualWorkspace] Saved phase overrides for phase: ${phaseKey}`, overrides);
  }, [beat, hasChanges, visualElements]);

  /**
   * Handle phase selection with auto-save
   */
  const handlePhaseSelect = useCallback((phaseId: string) => {
    console.log(`[VisualWorkspace] handlePhaseSelect called with: ${phaseId}, current: ${selectedPhaseId}`);

    if (phaseId === selectedPhaseId) {
      console.log(`[VisualWorkspace] Same phase selected, skipping`);
      return; // Same phase, no action needed
    }

    console.log(`[VisualWorkspace] Phase switch: ${selectedPhaseId} → ${phaseId}`);

    // Save current phase before switching
    saveCurrentPhaseOverrides();

    // Switch to new phase - DON'T update prevPhaseIdRef here!
    // Let the useEffect handle it after loading elements
    setSelectedPhaseId(phaseId);
    setHasChanges(false);
    console.log(`[VisualWorkspace] Phase selection state updated to: ${phaseId}`);
  }, [selectedPhaseId, saveCurrentPhaseOverrides]);

  /**
   * Load phase-specific elements when phase changes (for DialogTree beats)
   */
  useEffect(() => {
    console.log(`[VisualWorkspace] Phase effect - beatId: ${beat?.id}, prevBeatId: ${prevBeatIdRef.current}, selectedPhaseId: ${selectedPhaseId}, prevRef: ${prevPhaseIdRef.current}, selectedPhase: ${selectedPhase?.id}`);

    if (!beat || beat.type !== 'dialogTree' || !selectedPhaseId || !selectedPhase) {
      console.log(`[VisualWorkspace] Phase effect - skipping (missing data): beat=${!!beat}, type=${beat?.type}, phaseId=${selectedPhaseId}, phase=${!!selectedPhase}`);
      return;
    }

    // Use default project settings if not provided
    const stageWidth = projectSettings?.width || 1024;
    const stageHeight = projectSettings?.height || 768;

    // Check if beat changed - always reload when switching to a different beat
    const beatChanged = prevBeatIdRef.current !== beat.id;

    // Check if choices count changed - force reload when choices are added/removed
    const currentChoicesCount = selectedPhase.choices?.length || 0;
    const choicesChanged = prevChoicesCountRef.current !== currentChoicesCount;

    // Don't reload if this is the same beat AND same phase AND same choices count AND we already have elements
    if (!beatChanged && !choicesChanged && prevPhaseIdRef.current === selectedPhaseId && visualElements.length > 0) {
      console.log(`[VisualWorkspace] Phase effect - skipping (same beat+phase+choices, already have elements)`);
      return;
    }

    console.log(`[VisualWorkspace] Loading phase elements for: ${selectedPhaseId}, phase text: ${selectedPhase.text}, beatChanged: ${beatChanged}`);

    const params = beat.getParameters ? beat.getParameters() : {};
    const phaseOverrides = params.phaseOverrides?.[selectedPhaseId];

    // Generate dialog and choice elements for this phase
    // Uses stored positions from beat.locations (ASML import) if available,
    // otherwise falls back to auto-layout
    const phaseElements = generatePhaseElements(
      selectedPhase,
      stageWidth,
      stageHeight,
      phaseOverrides,
      beat.locations  // Pass stored locations for imported ASML positions
    );

    // Also load characters and props from beat.locations (these are shared across all phases)
    const persistedElements: VisualElement[] = [];
    if (beat.locations.size > 0) {
      beat.locations.forEach((loc: Location) => {
        // Only include characters and props - dialog/buttons come from phase
        if (loc.kind === 'character' || loc.kind === 'prop') {
          const element: VisualElement = {
            id: loc.id || `element_${Date.now()}_${Math.random()}`,
            type: loc.kind as 'character' | 'prop',
            name: loc.name,
            text: '',
            assetId: loc.assetId,
            imageUrl: loc.imageUrl,
            characterId: loc.characterId,
            characterName: loc.characterName,
            stateId: loc.stateId,
            size: loc.size,
            x: loc.x,
            y: loc.y,
            z: loc.zIndex ?? 0,
            width: loc.width,
            height: loc.height,
            rotation: loc.rotation ?? 0,
            scale: loc.scale ?? 1,
            visible: true,
            locked: false,
            sound: loc.sound,
            hotspotOverride: loc.hotspotOverride,
          };

          // Resolve character image URLs
          if (loc.kind === 'character' && loc.characterId) {
            const character = characters.find(c => c.id === loc.characterId);
            if (character) {
              const stateId = loc.stateId || character.defaultState;
              const state = character.states?.find((s: any) => s.id === stateId);
              if (state) {
                const resolvedUrl = resolveCharacterImageUrl(state, character.visual?.defaultImage, assets, character.visual?.spriteSheet);
                if (resolvedUrl) {
                  element.imageUrl = resolvedUrl;
                }
              }
            }
          }

          // Resolve prop image URLs
          if (loc.kind === 'prop' && loc.assetId) {
            const asset = assets.find(a => a.id === loc.assetId);
            if (asset) {
              element.imageUrl = asset.url;
            }
          }

          persistedElements.push(element);
        }
      });
      console.log(`[VisualWorkspace] Loaded ${persistedElements.length} persisted elements (characters/props) from beat.locations`);
    }

    // Merge: persisted elements (characters/props) + phase elements (dialog/choices)
    const allElements = [...persistedElements, ...phaseElements];

    // Log z-index values for debugging
    console.log(`[VisualWorkspace] Phase elements z-values:`, phaseElements.map(el => ({ id: el.id, name: el.name, z: el.z })));

    // Fix z-index ordering for phase elements only.
    // Persisted elements (characters/props) keep their user-set z-values.
    // Phase elements (dialog/buttons) get z-values starting above the max persisted z.
    if (persistedElements.length > 0 && phaseElements.length > 0) {
      const maxPersistedZ = Math.max(...persistedElements.map(el => el.z), -1);
      phaseElements.forEach((el: VisualElement, idx: number) => {
        el.z = maxPersistedZ + 1 + idx;
      });
    } else if (allElements.length > 1) {
      // No persisted elements — only reassign if ALL z-values are the same (ASML import)
      const zValues = allElements.map((el: VisualElement) => el.z);
      const uniqueZValues = new Set(zValues);
      if (uniqueZValues.size === 1) {
        allElements.forEach((el: VisualElement, idx: number) => {
          el.z = idx;
        });
      }
    }

    // Elements use raw positions from beat.locations / schema defaults
    // Smart sizing is now computed at render time by PositionedBeatView

    setVisualElements(allElements);
    setHasChanges(false);
    prevPhaseIdRef.current = selectedPhaseId;
    prevBeatIdRef.current = beat.id;
    prevChoicesCountRef.current = currentChoicesCount;

    console.log(`[VisualWorkspace] Loaded ${allElements.length} elements for phase: ${selectedPhaseId} (${persistedElements.length} persisted + ${phaseElements.length} phase, ${currentChoicesCount} choices)`);

    // Update character/prop element dimensions based on actual image size
    // This ensures the selection box matches the actual rendered graphic
    const updateDialogTreeImageDimensions = async () => {
      const elementsNeedingUpdate = allElements.filter(el =>
        (el.type === 'character' || el.type === 'prop') &&
        (el.imageUrl || el.assetUrl) &&
        // Check for default/scaled default dimensions (100x100 or 128x128 from ASML scaling)
        ((el.width === 100 && el.height === 100) || (el.width === 128 && el.height === 128))
      );

      if (elementsNeedingUpdate.length === 0) return;

      console.log(`[VisualWorkspace] DialogTree: Loading ${elementsNeedingUpdate.length} images to get actual dimensions`);

      const updates: { id: string; width: number; height: number }[] = [];

      await Promise.all(elementsNeedingUpdate.map(el => {
        return new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            // Apply size percentage to get effective dimensions
            const sizeMultiplier = (el.size || 100) / 100;
            const effectiveWidth = Math.round(img.naturalWidth * sizeMultiplier);
            const effectiveHeight = Math.round(img.naturalHeight * sizeMultiplier);
            console.log(`[VisualWorkspace] DialogTree: Image "${el.name}": natural=${img.naturalWidth}x${img.naturalHeight}, size=${el.size}%, effective=${effectiveWidth}x${effectiveHeight}`);
            updates.push({ id: el.id, width: effectiveWidth, height: effectiveHeight });
            resolve();
          };
          img.onerror = () => {
            console.warn(`[VisualWorkspace] DialogTree: Failed to load image for "${el.name}"`);
            resolve();
          };
          img.src = el.imageUrl || el.assetUrl || '';
        });
      }));

      if (updates.length > 0) {
        setVisualElements(prev => prev.map(el => {
          const update = updates.find(u => u.id === el.id);
          if (update) {
            return { ...el, width: update.width, height: update.height };
          }
          return el;
        }));
        console.log(`[VisualWorkspace] DialogTree: Updated dimensions for ${updates.length} elements`);
      }
    };

    updateDialogTreeImageDimensions();
  }, [beat, selectedPhaseId, selectedPhase, projectSettings, generatePhaseElements, characters, assets]);

  /**
   * Load phase-specific elements when phase changes (for EndScreen credits beats)
   */
  useEffect(() => {
    if (!beat || beat.type !== 'endScreen' || !isEndScreenWithCredits || !selectedPhaseId) {
      return;
    }

    // Skip if same beat + same phase and we already have elements
    const beatChanged = prevBeatIdRef.current !== beat.id;
    if (!beatChanged && prevPhaseIdRef.current === selectedPhaseId && visualElements.length > 0) {
      return;
    }

    // If main phase, reload from beat.locations (the normal EndScreen elements)
    if (selectedPhaseId === 'main') {
      console.log('[VisualWorkspace] Switching back to EndScreen main phase, reloading elements from beat.locations');
      const params = beat.getParameters ? beat.getParameters() : {};

      // Rebuild elements from beat.locations (main phase elements)
      let elements: VisualElement[] = [];
      if (beat.locations.size > 0) {
        elements = Array.from(beat.locations.values()).map((loc: Location) => {
          const nameLower = loc.name?.toLowerCase() || '';
          const isButtonByName = nameLower.includes('button') ||
                                 nameLower.includes('start') ||
                                 nameLower.includes('continue') ||
                                 nameLower.includes('restart') ||
                                 nameLower.includes('credits') ||
                                 nameLower.includes('submit') ||
                                 nameLower.includes('skip');

          const element: VisualElement = {
            id: (loc as any).id || `element_${Date.now()}_${Math.random()}`,
            type: loc.kind === 'character' ? 'character' :
                  loc.kind === 'prop' ? 'prop' :
                  loc.kind === 'button' ? 'button' :
                  loc.kind === 'dialog' ? 'dialog' :
                  loc.kind === 'hotspot' ? 'hotspot' :
                  loc.kind === 'meter' ? 'meter' :
                  loc.kind === 'keypad' ? 'keypad' :
                  (isButtonByName ? 'button' : 'text'),
            name: loc.name,
            text: '',
            x: loc.x,
            y: loc.y,
            z: loc.zIndex ?? 0,
            width: loc.width,
            height: loc.height,
            rotation: (loc as any).rotation ?? 0,
            scale: (loc as any).scale ?? 1,
            visible: true,
            locked: false,
            assetId: loc.assetId,
            imageUrl: (loc as any).imageUrl,
            sound: loc.sound,
            font: loc.font,
            fontSize: loc.fontSize,
            fontOverridden: !!(loc.font || loc.fontSize),
            textAlign: loc.textAlign,
            characterId: loc.characterId,
            characterName: loc.characterName,
            stateId: loc.stateId,
            size: loc.size,
          };
          return element;
        });
      }

      // If no elements from locations, use schema-driven initialization
      if (elements.length === 0) {
        elements = initializeLocationsFromSchema(beat, params, projectSettings);
      }

      // Populate text from beat parameters
      elements.forEach(el => {
        const nameLower = el.name?.toLowerCase() || '';
        if (nameLower.includes('message') || (el.type === 'text' && !nameLower.includes('restart') && !nameLower.includes('credits'))) {
          el.text = params.message || 'The End';
        } else if (nameLower.includes('restart') || nameLower.includes('again')) {
          el.text = params.restartText || params.buttonText || 'Play Again';
        } else if (nameLower.includes('credits')) {
          el.text = params.creditsText || 'Credits';
        }
      });

      // Ensure restart + credits buttons are side by side
      const stageWidth = projectSettings?.width || 1024;
      const ctrX = stageWidth / 2;
      const restartBtn = elements.find(el => el.type === 'button' && (el.name?.toLowerCase().includes('restart') || el.name?.toLowerCase().includes('again')));
      const creditsBtn = elements.find(el => el.type === 'button' && el.name?.toLowerCase().includes('credits'));
      if (restartBtn && creditsBtn) {
        const spacing = 20;
        const totalWidth = restartBtn.width + creditsBtn.width + spacing;
        restartBtn.x = ctrX - totalWidth / 2;
        creditsBtn.x = ctrX - totalWidth / 2 + restartBtn.width + spacing;
        creditsBtn.y = restartBtn.y;
      }

      // Smart sizing is now computed at render time by PositionedBeatView

      setVisualElements(elements);
      setHasChanges(false);
      prevPhaseIdRef.current = selectedPhaseId;
      prevBeatIdRef.current = beat.id;
      return;
    }

    // Credits phase: generate credits elements
    if (selectedPhaseId === 'credits') {
      console.log('[VisualWorkspace] Loading EndScreen credits phase elements');
      const params = beat.getParameters ? beat.getParameters() : {};
      const stageWidth = projectSettings?.width || 1024;
      const stageHeight = projectSettings?.height || 768;
      const centerX = stageWidth / 2;

      // Check for saved overrides
      const overrides = params.phaseOverrides?.['credits'];

      // Generate credits elements
      const creditsElements: VisualElement[] = [
        {
          id: 'credits_title',
          type: 'text',
          name: 'Credits Title',
          text: params.creditsPageTitle || 'Credits',
          x: overrides?.credits_title?.x ?? Math.round(centerX - 300),
          y: overrides?.credits_title?.y ?? 60,
          z: overrides?.credits_title?.z ?? 0,
          width: overrides?.credits_title?.width ?? 600,
          height: overrides?.credits_title?.height ?? 60,
          rotation: 0,
          scale: 1,
          visible: true,
          locked: false,
          fontSize: 28,
          textAlign: 'center',
        },
        {
          id: 'credits_body',
          type: 'dialog',
          name: 'Credits Body',
          text: params.creditsPageBody || '',
          x: overrides?.credits_body?.x ?? Math.round(centerX - 350),
          y: overrides?.credits_body?.y ?? 150,
          z: overrides?.credits_body?.z ?? 1,
          width: overrides?.credits_body?.width ?? 700,
          height: overrides?.credits_body?.height ?? 400,
          rotation: 0,
          scale: 1,
          visible: true,
          locked: false,
          fontSize: 16,
          textAlign: 'center',
        },
        {
          id: 'credits_close',
          type: 'button',
          name: 'Credits Close Button',
          text: params.creditsCloseText || 'Close',
          x: overrides?.credits_close?.x ?? Math.round(centerX - 90),
          y: overrides?.credits_close?.y ?? (stageHeight - 120),
          z: overrides?.credits_close?.z ?? 2,
          width: overrides?.credits_close?.width ?? 180,
          height: overrides?.credits_close?.height ?? 50,
          rotation: 0,
          scale: 1,
          visible: true,
          locked: false,
          fontSize: 18,
          textAlign: 'center',
        },
      ];

      // Also load characters/props from beat.locations (shared across phases)
      const persistedElements: VisualElement[] = [];
      if (beat.locations.size > 0) {
        beat.locations.forEach((loc: Location) => {
          if (loc.kind === 'character' || loc.kind === 'prop') {
            const element: VisualElement = {
              id: loc.id || `element_${Date.now()}_${Math.random()}`,
              type: loc.kind as 'character' | 'prop',
              name: loc.name,
              text: '',
              assetId: loc.assetId,
              imageUrl: loc.imageUrl,
              characterId: loc.characterId,
              characterName: loc.characterName,
              stateId: loc.stateId,
              size: loc.size,
              x: loc.x,
              y: loc.y,
              z: loc.zIndex ?? 0,
              width: loc.width,
              height: loc.height,
              rotation: loc.rotation ?? 0,
              scale: loc.scale ?? 1,
              visible: true,
              locked: false,
              sound: loc.sound,
              hotspotOverride: loc.hotspotOverride,
            };
            persistedElements.push(element);
          }
        });
      }

      const allElements = [...persistedElements, ...creditsElements];
      setVisualElements(allElements);
      setHasChanges(false);
      prevPhaseIdRef.current = selectedPhaseId;
      prevBeatIdRef.current = beat.id;

      console.log(`[VisualWorkspace] Loaded ${allElements.length} elements for EndScreen credits phase`);
    }
  }, [beat, selectedPhaseId, isEndScreenWithCredits, projectSettings, visualElements.length]);

  // Initialize from beat parameters
  useEffect(() => {
    if (!beat) return;

    // For EndScreen credits phase: skip normal init, elements handled by phase-aware loading
    if (beat.type === 'endScreen' && isEndScreenWithCredits && selectedPhaseId === 'credits') {
      const params = beat.getParameters ? beat.getParameters() : {};
      const bgId = params.node || params.backgroundAssetId || '';
      const bgUrl = params.backgroundUrl || '';
      setBackgroundAssetId(bgId);
      setBackgroundUrl(bgUrl);
      setBackgroundSound(params.backgroundSound || '');
      setAnimations(beat.animations || params.animations || []);
      return;
    }

    // For DialogTree beats: load background/animations but skip element loading
    // Elements are handled by phase-aware loading effect (which runs before this effect)
    if (beat.type === 'dialogTree') {
      console.log(`[VisualWorkspace] DialogTree: loading background/animations only, elements via phase-aware loading`);
      const params = beat.getParameters ? beat.getParameters() : {};
      const bgId = params.node || params.backgroundAssetId || '';
      const bgUrl = params.backgroundUrl || '';
      setBackgroundAssetId(bgId);
      setBackgroundUrl(bgUrl);
      setBackgroundSound(params.backgroundSound || '');
      // Load animations from beat.animations first (direct property), fallback to params.animations
      console.log(`[VisualWorkspace] DialogTree: Loading animations: beat.animations=${beat.animations?.length || 0}, params.animations=${params.animations?.length || 0}`);
      setAnimations(beat.animations || params.animations || []);
      // NOTE: Don't clear visual elements here - the phase loading effect already handles this
      // by calling setVisualElements(allElements) which replaces all elements
      return;
    }

    console.log(`[VisualWorkspace] LOADING BEAT: ${beat.type} (id: ${beat.id}, name: ${beat.name})`);

    const params = beat.getParameters ? beat.getParameters() : {};
    console.log(`[VisualWorkspace] params.node (background): ${params.node || 'NOT SET'}`);
    console.log(`[VisualWorkspace] beat.node (direct): ${beat.node || 'NOT SET'}`);
    console.log(`[VisualWorkspace] beat.locations.size: ${beat.locations?.size || 0}`);

    // Determine element visibility based on global settings (Phase 5 - Optional Text Boxes)
    const boxVisibility = globalSettings?.textbox.boxVisibility || 'all';
    const textBoxesVisible = boxVisibility === 'all'; // Text boxes visible
    const buttonBoxesVisible = boxVisibility !== 'hideAll'; // Buttons visible unless hideAll

    // Helper to set visibility based on element type
    const getElementVisibility = (elementType: 'text' | 'dialog' | 'button' | 'hotspot' | 'prop' | 'character') => {
      if (elementType === 'text' || elementType === 'dialog') {
        return textBoxesVisible;
      } else if (elementType === 'button') {
        return buttonBoxesVisible;
      }
      // For hotspots, props, characters - always visible
      return true;
    };

    // CRITICAL FIX: Load from beat.locations FIRST (this is the source of truth)
    // Only fall back to params.visualElements or params.locs if beat.locations is empty
    let elements: VisualElement[] = [];

    // Priority 1: Load from beat.locations (persisted data)
    if (beat.locations.size > 0) {
      console.warn(`[VisualWorkspace] ★★★ Loading ${beat.locations.size} elements from beat.locations for ${beat.type} ★★★`);
      console.warn(`[VisualWorkspace] ========== LOCATION POSITIONS ==========`);
      beat.locations.forEach((loc: Location, key: string) => {
        console.warn(`[VisualWorkspace]   "${key}": x=${loc.x}, y=${loc.y}, w=${loc.width}, h=${loc.height}, z=${loc.zIndex}, size=${(loc as any).size}`);
      });
      console.warn(`[VisualWorkspace] ========================================`);
      const locationDetails = Array.from(beat.locations.values()).map((loc: Location) => ({
        name: loc.name,
        kind: loc.kind,
        x: loc.x,
        y: loc.y,
        width: loc.width,
        height: loc.height,
        // Character-related fields
        characterId: (loc as any).characterId,
        characterName: (loc as any).characterName,
        stateId: (loc as any).stateId,
        imageUrl: (loc as any).imageUrl?.substring?.(0, 50) ?? 'NOT SET',
        assetId: (loc as any).assetId
      }));
      console.log('[VisualWorkspace] Location details:', locationDetails);
      elements = Array.from(beat.locations.values()).map((loc: Location) => {
        // Detect if this is a button based on name (legacy ASML uses kind="text" for buttons)
        const nameLower = loc.name?.toLowerCase() || '';
        const isButtonByName = nameLower.includes('button') ||
                               nameLower.includes('start') ||
                               nameLower.includes('continue') ||
                               nameLower.includes('restart') ||
                               nameLower.includes('credits') ||
                               nameLower.includes('submit') ||
                               nameLower.includes('skip');

        const element: any = {
          id: loc.id || `element_${Date.now()}_${Math.random()}`,
          type: loc.kind === 'character' ? 'character' :
                loc.kind === 'prop' ? 'prop' :
                loc.kind === 'button' ? 'button' :
                isButtonByName ? 'button' : // Detect buttons by name for legacy ASML
                loc.kind === 'dialog' ? 'dialog' :
                loc.kind === 'hotspot' ? 'hotspot' :
                loc.kind === 'meter' ? 'meter' :
                loc.kind === 'keypad' ? 'keypad' :
                'text',
          name: loc.name,
          text: '', // Will be populated below from params
          assetId: loc.assetId,
          imageUrl: loc.imageUrl, // Direct image URL (for ASML imported characters)
          // Character-specific properties
          characterId: loc.characterId,
          characterName: loc.characterName,
          stateId: loc.stateId,
          size: loc.size,
          x: loc.x,
          y: loc.y,
          z: loc.zIndex ?? 0,
          width: loc.width,
          height: loc.height,
          rotation: loc.rotation ?? 0,
          scale: loc.scale ?? 1,
          visible: true,
          locked: false,
          sound: loc.sound,
          hotspotOverride: loc.hotspotOverride,
          // Include font properties from location (mark as overridden if stored)
          font: loc.font,
          fontSize: loc.fontSize,
          textAlign: loc.textAlign,
          fontOverridden: loc.font !== undefined || loc.fontSize !== undefined,
          // Meter-specific properties
          counterName: loc.counterName,
          meterOrientation: loc.meterOrientation,
          showNumericValue: loc.showNumericValue,
          numericFormat: loc.numericFormat,
          meterColor: loc.meterColor,
          meterBackgroundColor: loc.meterBackgroundColor
        };

        // Resolve asset URL for props immediately (so updateImageDimensions can use it)
        if (element.type === 'prop') {
          // Try by assetId first
          if (loc.assetId) {
            const asset = assets.find(a => a.id === loc.assetId);
            if (asset) {
              element.imageUrl = asset.url;
            }
          }
          // Try by prop name if assetId didn't work
          if (!element.imageUrl && loc.name) {
            const propName = loc.name.toLowerCase();
            const asset = assets.find(a =>
              a.name?.toLowerCase() === propName ||
              a.name?.toLowerCase().includes(propName)
            );
            if (asset) {
              element.imageUrl = asset.url;
            }
          }
        }

        // Resolve character images from characters array (fresh URLs, not stale blob URLs)
        // FIRST OCCURRENCE - for beat.locations path
        if (element.type === 'character') {
          let resolved = false;
          let character: Character | undefined;
          let state: any;

          // Try by characterId first
          if (loc.characterId) {
            character = characters.find(c => c.id === loc.characterId);
            if (character) {
              const stateId = loc.stateId || character.defaultState;
              state = character.states?.find((s: any) => s.id === stateId);
            }
          }

          // Try by characterName if characterId didn't work
          if (!character && loc.characterName) {
            const charName = loc.characterName.toLowerCase();
            character = characters.find(c =>
              c.name?.toLowerCase() === charName ||
              c.displayName?.toLowerCase() === charName
            );
            if (character) {
              const stateId = loc.stateId || character.defaultState;
              state = character.states?.find((s: any) => s.id === stateId);
            }
          }

          // Try by element name as character name (fallback)
          if (!character && loc.name) {
            const charName = loc.name.toLowerCase();
            character = characters.find(c =>
              c.name?.toLowerCase() === charName ||
              c.displayName?.toLowerCase() === charName
            );
            if (character) {
              const stateId = loc.stateId || character.defaultState;
              state = character.states?.find((s: any) => s.id === stateId);
            }
          }

          // Resolve image URL using helper (handles stale blob URLs via assetId lookup)
          if (character) {
            const resolvedUrl = resolveCharacterImageUrl(
              state,
              character.visual?.defaultImage,
              assets,
              character.visual?.spriteSheet,
            );
            if (resolvedUrl) {
              element.imageUrl = resolvedUrl;
              resolved = true;
            }
          }

          if (!resolved) {
            console.warn('[VisualWorkspace] Character NOT resolved (beat.locations), using original imageUrl:', element.imageUrl);
          }
        }

        // Populate text content from beat parameters based on element name
        // Note: nameLower is already defined above for button detection
        if (element.type === 'dialog' || element.type === 'text') {
          if (beat.type === 'infoText' || beat.type === 'durScreen') {
            element.text = params.text || '';
          } else if (beat.type === 'aiInfoText' || beat.type === 'aiDurScreen') {
            // AI beats use fallbackText for visual editor preview
            element.text = params.fallbackText || '[AI-generated text]';
          } else if (beat.type === 'hyperText') {
            element.text = params.text || '';
          } else if (beat.type === 'endScreen') {
            // Any text/dialog element on endScreen is the message
            element.text = params.message || 'The End';
          } else if (beat.type === 'dialogTree') {
            // DialogTree stores text in dialogTree.text, not params.text
            element.text = params.dialogTree?.text || params.text || '';
          } else if (beat.type === 'titleScreen') {
            if (nameLower.includes('title')) {
              element.text = params.title || 'Untitled Story';
            } else if (nameLower.includes('author')) {
              element.text = params.author || 'Anonymous';
            }
          } else if (beat.type === 'movementChoice' || beat.type === 'pickProp') {
            // Text element gets question text - check for 'question' OR 'text' name
            if (nameLower.includes('question') || nameLower === 'text') {
              element.text = params.question || params.text || '';
            }
          } else if (beat.type === 'inputText') {
            if (nameLower.includes('prompt')) {
              element.text = params.prompt || 'Please enter your response:';
            }
          } else if (beat.type === 'panorama') {
            if (nameLower.includes('prompt')) {
              element.text = params.prompt || '';
            }
          }
        } else if (element.type === 'button') {
          // Populate button text from params
          if (beat.type === 'titleScreen' && nameLower.includes('start')) {
            element.text = params.buttonText || 'Start';
          } else if (beat.type === 'endScreen') {
            if (nameLower.includes('restart') || nameLower.includes('again')) {
              element.text = params.restartText || params.buttonText || 'Play Again';
            } else if (nameLower.includes('credits')) {
              element.text = params.creditsText || 'Credits';
            } else {
              // Any other button on endScreen defaults to restart text
              element.text = params.restartText || params.buttonText || 'Play Again';
            }
          } else {
            element.text = params.buttonText || loc.name || 'Continue';
          }
        }

        return element;
      }).filter((element: any) => element !== null && element.name !== 'Main Text');
    }
    // Priority 2: Fall back to params.visualElements (legacy/initial load)
    else if (params.visualElements && params.visualElements.length > 0) {
      console.log('[VisualWorkspace] Loading from params.visualElements');
      // Clean stale fonts: strip font values from elements where fontOverridden is not true
      elements = params.visualElements.map((el: VisualElement) => ({
        ...el,
        font: el.fontOverridden ? el.font : undefined,
        fontSize: el.fontOverridden ? el.fontSize : undefined,
      }));
    }
    // Priority 3: Convert from params.locs (ASML import)
    else if (params.locs && params.locs.length > 0) {
      console.log('[DEBUG] Converting locations to visual elements:', params.locs);
      console.log('[DEBUG] Beat type:', beat.type);
      elements = params.locs.map((loc: any) => {
        console.log('[DEBUG] Converting location:', { kind: loc.kind, name: loc.name, text: loc.text });

        // Skip deprecated "Main Text" elements to prevent duplication
        if (loc.name === 'Main Text') {
          console.log('[DEBUG] Skipping deprecated Main Text element');
          return null;
        }

        // Detect if this is a button based on name (legacy ASML uses kind="text" for buttons)
        const nameLower = loc.name?.toLowerCase() || '';
        const isButtonByName = nameLower.includes('button') ||
                               nameLower.includes('start') ||
                               nameLower.includes('continue') ||
                               nameLower.includes('restart') ||
                               nameLower.includes('credits') ||
                               nameLower.includes('submit') ||
                               nameLower.includes('skip');

        const element: any = {
          id: loc.id || `element_${Date.now()}_${Math.random()}`,
          type: loc.kind === 'char' || loc.kind === 'character' ? 'character' :
                loc.kind === 'button' ? 'button' :
                isButtonByName ? 'button' : // Detect buttons by name for legacy ASML
                loc.kind === 'text' ? 'dialog' : // Convert remaining text to dialog
                loc.kind === 'inputfield' ? 'hotspot' :
                loc.kind === 'meter' ? 'meter' :
                loc.kind === 'keypad' ? 'keypad' :
                loc.kind,
          name: loc.name,
          text: loc.text, // Will be populated below if missing
          speaker: loc.speaker,
          assetId: loc.assetId,
          imageUrl: loc.imageUrl, // Direct image URL (for ASML imported characters)
          // Character-specific properties
          characterId: loc.characterId,
          characterName: loc.characterName,
          stateId: loc.stateId,
          size: loc.size,
          x: loc.x,
          y: loc.y,
          z: loc.zIndex ?? loc.z ?? 0,
          width: loc.width,
          height: loc.height,
          rotation: loc.rotation || 0,
          scale: loc.scale || 1,
          visible: true,
          locked: false,
          sound: loc.sound,
          hotspotOverride: (loc as any).hotspotOverride,
          // Include font properties from location (mark as overridden if stored)
          font: loc.font,
          fontSize: loc.fontSize,
          textAlign: loc.textAlign,
          fontOverridden: loc.font !== undefined || loc.fontSize !== undefined,
          // Meter-specific properties
          counterName: loc.counterName,
          meterOrientation: loc.meterOrientation,
          showNumericValue: loc.showNumericValue,
          numericFormat: loc.numericFormat,
          meterColor: loc.meterColor,
          meterBackgroundColor: loc.meterBackgroundColor
        };

        // Resolve asset URL for props immediately (so updateImageDimensions can use it)
        if (element.type === 'prop') {
          // Try by assetId first
          if (loc.assetId) {
            const asset = assets.find(a => a.id === loc.assetId);
            if (asset) {
              element.imageUrl = asset.url;
            }
          }
          // Try by prop name if assetId didn't work
          if (!element.imageUrl && loc.name) {
            const propName = loc.name.toLowerCase();
            const asset = assets.find(a =>
              a.name?.toLowerCase() === propName ||
              a.name?.toLowerCase().includes(propName)
            );
            if (asset) {
              element.imageUrl = asset.url;
            }
          }
        }

        // Resolve character images from characters array (fresh URLs, not stale blob URLs)
        // SECOND OCCURRENCE - for params.locs path
        if (element.type === 'character') {
          let character: Character | undefined;
          let state: any;

          // Try by characterId first
          if (loc.characterId) {
            character = characters.find(c => c.id === loc.characterId);
            if (character) {
              const stateId = loc.stateId || character.defaultState;
              state = character.states?.find((s: any) => s.id === stateId);
            }
          }

          // Try by characterName if characterId didn't work
          if (!character && loc.characterName) {
            const charName = loc.characterName.toLowerCase();
            character = characters.find(c =>
              c.name?.toLowerCase() === charName ||
              c.displayName?.toLowerCase() === charName
            );
            if (character) {
              const stateId = loc.stateId || character.defaultState;
              state = character.states?.find((s: any) => s.id === stateId);
            }
          }

          // Try by element name as character name (fallback)
          if (!character && loc.name) {
            const charName = loc.name.toLowerCase();
            character = characters.find(c =>
              c.name?.toLowerCase() === charName ||
              c.displayName?.toLowerCase() === charName
            );
            if (character) {
              const stateId = loc.stateId || character.defaultState;
              state = character.states?.find((s: any) => s.id === stateId);
            }
          }

          // Resolve image URL using helper (handles stale blob URLs via assetId lookup)
          if (character) {
            const resolvedUrl = resolveCharacterImageUrl(state, character.visual?.defaultImage, assets, character.visual?.spriteSheet);
            if (resolvedUrl) {
              element.imageUrl = resolvedUrl;
            }
          }
        }

        // CRITICAL FIX: If element is a dialog/text and has no text, get it from beat parameters
        if ((element.type === 'dialog' || loc.kind === 'text') && !element.text && !isButtonByName) {
          // For different beat types, get text from appropriate parameter
          if (beat.type === 'infoText' || beat.type === 'durScreen') {
            element.text = params.text;
          } else if (beat.type === 'aiInfoText' || beat.type === 'aiDurScreen') {
            // AI beats use fallbackText for visual editor preview
            element.text = params.fallbackText || '[AI-generated text]';
          } else if (beat.type === 'hyperText') {
            element.text = params.text;
          } else if (beat.type === 'endScreen' && loc.name === 'End Message') {
            element.text = params.message || 'The End';
          } else if (beat.type === 'dialogTree') {
            element.text = params.dialogTree?.text || params.text;
          } else if ((beat.type === 'movementChoice' || beat.type === 'pickProp') && loc.name?.toLowerCase().includes('question')) {
            element.text = params.question || '';
          }
        }

        // Populate button text from beat parameters
        if (element.type === 'button' && !element.text) {
          if (beat.type === 'titleScreen') {
            element.text = params.buttonText || 'Start';
          } else if (beat.type === 'endScreen') {
            if (nameLower.includes('restart') || nameLower.includes('again')) {
              element.text = params.restartText || params.buttonText || 'Play Again';
            } else if (nameLower.includes('credits')) {
              element.text = params.creditsText || 'Credits';
            } else {
              element.text = params.buttonText || 'Continue';
            }
          } else {
            // Default for infoText, durScreen, inputText, etc.
            element.text = params.buttonText || 'Continue';
          }
        }

        return element;
      }).filter((element: any) => element !== null); // Remove null elements (skipped "Main Text")
      console.log('Converted elements:', elements);
      
      // CRITICAL FIX: Also populate beat.locations Map from loaded data
      beat.locations.clear();
      elements.forEach((el: VisualElement) => {
        let kind: 'text' | 'hotspot' | 'prop' | 'character' | 'button' | 'dialog' | 'meter' | 'keypad' = el.type as any;
        if (el.type === 'character') kind = 'character';
        else if (el.type === 'prop') kind = 'prop';
        else if (el.type === 'dialog') kind = 'dialog';
        else if (el.type === 'button') kind = 'button';
        else if (el.type === 'hotspot') kind = 'hotspot';
        else if (el.type === 'meter') kind = 'meter';
        else if (el.type === 'keypad') kind = 'keypad';
        else if (el.type === 'text') kind = 'text';

        // Use consistent key for both Map key and location.name
        const locationKey = el.name || el.text || el.id;
        const location: any = {
          kind,
          name: locationKey,
          id: el.id,  // Include element ID for animation targeting
          x: Math.round(el.x),
          y: Math.round(el.y),
          width: Math.round(el.width),
          height: Math.round(el.height),
          zIndex: el.z
        };

        // Add optional properties
        if (el.assetId) location.assetId = el.assetId;
        if (el.sound) location.sound = el.sound;
        if (el.fontOverridden && el.font) location.font = el.font;
        if (el.fontOverridden && el.fontSize !== undefined) location.fontSize = el.fontSize;
        if (el.textAlign) location.textAlign = el.textAlign;
        location.autosize = !el.fontOverridden || el.fontSize === undefined;

        // Add meter-specific properties
        if (el.type === 'meter') {
          if (el.characterId) location.characterId = el.characterId;
          if (el.counterName) location.counterName = el.counterName;
          if (el.meterOrientation) location.meterOrientation = el.meterOrientation;
          if (el.showNumericValue !== undefined) location.showNumericValue = el.showNumericValue;
          if (el.numericFormat) location.numericFormat = el.numericFormat;
          if (el.meterColor) location.meterColor = el.meterColor;
          if (el.meterBackgroundColor) location.meterBackgroundColor = el.meterBackgroundColor;
        }

        // Per-element hotspot appearance override
        if ((el as any).hotspotOverride?.enabled) location.hotspotOverride = (el as any).hotspotOverride;

        beat.locations.set(locationKey, location);
      });
      console.log(`[VisualWorkspace] Loaded ${beat.locations.size} locations to beat.locations Map`);
    }
    
    // Calculate dynamic center positions based on project settings
    const centerX = projectSettings?.width ? projectSettings.width / 2 : 512;
    const centerY = projectSettings?.height ? projectSettings.height / 2 : 384;

    // SCHEMA-DRIVEN LOCATION INITIALIZATION
    // Use SchemaLocationInitializer to generate elements from schema.
    // XR beats (gpsLocation, indoorLocation) don't render stage-positioned
    // elements — their data model is location entries (lat/lng or beacon
    // UUID), and they're handled by the dedicated XRMapEditor /
    // XRFloorPlanEditor early-return below. Skip the schema lookup so it
    // doesn't warn about a missing `locations` array on XR beat schemas.
    const isXrBeat = beat.type === 'gpsLocation' || beat.type === 'indoorLocation';
    if (!isXrBeat && elements.length === 0 && beat.locations.size === 0) {
      // In a responsive project, schema-declared slot/spatial beats must
      // stay empty — auto-baking default locations here re-bakes what the
      // fixed→responsive migration just cleared and re-strands the beat
      // on the absolute path. The slot preview branch above will paint
      // the responsive layout instead. Fixed projects still get defaults.
      const skipForResponsiveSlot =
        projectIsResponsive && (isSlotModeBeatType(beat.type) || isSpatialModeBeatType(beat.type));
      if (skipForResponsiveSlot) {
        console.log(`[VisualWorkspace] Responsive project + slot/spatial beat — skipping default location bake for ${beat.type}`);
      } else {
        console.log(`[VisualWorkspace] Using SchemaLocationInitializer for ${beat.type}`);
        const schemaElements = initializeLocationsFromSchema(beat, params, projectSettings);
        elements = schemaElements;
      }
    }

    // VideoBeat: keep only the video element, remove stale elements (e.g. old "Controls" text)
    if (beat.type === 'videoBeat') {
      const stale = elements.filter((e: VisualElement) =>
        e.type !== 'prop' && e.name !== 'video' && e.name !== 'Video'
      );
      // Clean stale locations from beat
      for (const el of stale) {
        const key = el.name || el.id;
        if (beat.locations.has(key)) beat.locations.delete(key);
      }
      elements = elements.filter((e: VisualElement) =>
        e.type === 'prop' || e.name === 'video' || e.name === 'Video'
      );
      if (params.videoAssetId) {
        const videoEl = elements.find((e: VisualElement) =>
          e.name === 'video' || e.name === 'Video' || e.type === 'prop'
        );
        if (videoEl) {
          videoEl.assetId = params.videoAssetId;
          (videoEl as any).assetType = 'video';
        }
      }
    }

    // Panorama hotspot sync: ensure each hotspot in beat.parameters.hotspots
    // has a matching VisualElement with the correct ID
    if (beat.type === 'panorama' && params.hotspots && params.hotspots.length > 0) {
      const hotspotElements = elements.filter((e: VisualElement) => e.type === 'hotspot');
      const projType = params.projectionType || 'equirectangular';
      const imgAspect = params.imageAspectRatio ?? 4;
      const stageW = projectSettings?.width || 1024;
      const stageH = projectSettings?.height || 768;

      params.hotspots.forEach((hs: any) => {
        // Match by ID first, then by name (for elements saved with old random IDs)
        let matchEl = hotspotElements.find((e: VisualElement) => e.id === hs.id);
        if (!matchEl) {
          matchEl = hotspotElements.find((e: VisualElement) => e.name === hs.text);
        }

        if (matchEl) {
          // Fix the ID to match the hotspot param ID (for elements with old random IDs)
          if (matchEl.id !== hs.id) {
            console.log(`[VisualWorkspace] Fixing hotspot VE ID: "${matchEl.id}" → "${hs.id}" (name=${hs.text})`);
            matchEl.id = hs.id;
          }
        } else {
          // Create new VisualElement for orphan hotspot
          const { centerX: cx, centerY: cy } = yawPitchToStage(hs.yaw ?? 0, hs.pitch ?? 0, projType, stageW, stageH, imgAspect);
          const hotspotWidth = 120;
          const hotspotHeight = 50;
          const maxZ = elements.length > 0 ? Math.max(...elements.map((e: VisualElement) => e.z)) : 0;
          elements.push({
            id: hs.id,
            type: 'hotspot',
            name: hs.text || `Hotspot`,
            text: hs.text || `Hotspot`,
            x: cx - hotspotWidth / 2,
            y: cy - hotspotHeight / 2,
            z: maxZ + 1,
            width: hotspotWidth,
            height: hotspotHeight,
            rotation: 0,
            scale: 1,
            visible: true,
            locked: false,
          });
          console.log(`[VisualWorkspace] Created orphan hotspot VE: hs=${hs.id} (${hs.text}): yaw=${hs.yaw} pitch=${hs.pitch} → px(${Math.round(cx)},${Math.round(cy)})`);
        }
      });
    }

    // Supplement missing static elements for beats with dynamic locations.
    // movementChoice/pickProp may have choice/prop hotspots in beat.locations
    // but be missing the schema-defined "question" text element.
    //
    // In a responsive project the schema's question slot already renders
    // the prompt — auto-adding a positioned dialog element would double-
    // render it (the legacy element row sits next to the slot row in the
    // panel, and the renderer paints both). Skip the supplement here so
    // only the slot's question shows.
    if (
      elements.length > 0 &&
      (beat.type === 'movementChoice' || beat.type === 'pickProp') &&
      !projectIsResponsive
    ) {
      const questionText = params.question || '';
      const hasQuestion = elements.some((e: VisualElement) =>
        e.name?.toLowerCase().includes('question') ||
        // Also match text/dialog elements that already contain the question content
        ((e.type === 'text' || e.type === 'dialog') && e.text && questionText && e.text === questionText)
      );
      if (!hasQuestion) {
        const supplementQuestionText = questionText || (beat.type === 'movementChoice' ? 'Where do you want to go?' : 'What do you want to interact with?');
        const stageWidth = projectSettings?.width || 1024;
        const qWidth = 600;
        // Find lowest z-index to place question behind choice elements
        const minZ = Math.min(0, ...elements.map((e: VisualElement) => e.z));
        // Find topmost element y position to place question above it
        const topY = Math.min(...elements.map((e: VisualElement) => e.y));
        elements.unshift({
          id: `element_question_${Date.now()}`,
          type: 'dialog',
          name: 'Question',
          text: supplementQuestionText,
          x: stageWidth / 2 - qWidth / 2,
          y: Math.max(60, topY - 100),
          z: minZ - 1,
          width: qWidth,
          height: 80,
          rotation: 0,
          scale: 1,
          visible: true,
          locked: false,
          font: undefined,
          fontSize: 18,
          textAlign: 'center',
        });
        console.log(`[VisualWorkspace] Added missing question element for ${beat.type}`);
      }
    }

    // Fallback: Auto-add beat-specific elements if not already present (legacy)
    // Note: All visible beats now use schema-driven initialization only

    // Load background from node parameter (old ASML style) or backgroundAssetId
    // For panorama beats, the panorama image IS the background
    const bgId = beat.type === 'panorama'
      ? (params.panoramaAssetId || '')
      : (params.node || params.backgroundAssetId || '');
    // Use direct backgroundUrl from ASML import (if available) - avoids asset lookup
    const bgUrl = params.backgroundUrl || '';

    // Panorama: reposition text/dialog (prompt) elements to camera-center position.
    // The schema initializer places prompts near the top of the stage (y≈100), which maps
    // to near the north pole in equirectangular. Reposition so the prompt appears at the
    // bottom-center of the initial camera view, matching the expected prompt location.
    if (beat.type === 'panorama') {
      const stageW = projectSettings?.width || 1024;
      const stageH = projectSettings?.height || 768;
      const hfov = params.hfov ?? 75;
      const iYaw = params.initialYaw ?? 0;
      const iPitch = params.initialPitch ?? 0;
      const projType = params.projectionType || 'equirectangular';
      const imgAspect = params.imageAspectRatio ?? 4;
      const aspectRatio = stageW / stageH;
      const vfov = hfov / aspectRatio;
      // Camera-center bottom: below center of initial view
      const promptYaw = iYaw;
      const promptPitch = iPitch - vfov * 0.35;
      const { centerX: camCx, centerY: camCy } = yawPitchToStage(promptYaw, promptPitch, projType, stageW, stageH, imgAspect);

      for (const el of elements) {
        if (el.type !== 'text' && el.type !== 'dialog') continue;
        // Only reposition if still at the schema default position (y < 200, centered horizontally)
        if (el.y < 200 && el.x > stageW * 0.2 && el.x < stageW * 0.5) {
          el.x = Math.round(camCx - el.width / 2);
          el.y = Math.round(camCy - el.height / 2);
          console.log(`[VisualWorkspace] Panorama: repositioned prompt "${el.name}" to camera-center (x=${el.x}, y=${el.y})`);
        }
      }
    }

    // Fix z-index ordering: ensure all elements have unique z values
    // This handles ASML imports where z-index wasn't preserved (all 0) or has duplicates
    if (elements.length > 1) {
      const zValues = elements.map((el: VisualElement) => el.z);
      const uniqueZValues = new Set(zValues);
      if (uniqueZValues.size < elements.length) {
        console.log(`[VisualWorkspace] Duplicate z-index values found (${uniqueZValues.size} unique for ${elements.length} elements), assigning incremental values`);
        elements.forEach((el: VisualElement, idx: number) => {
          el.z = idx;
        });
      }
    }

    // Smart sizing is now computed at render time by PositionedBeatView

    // XR beats render via XRMapEditor / XRFloorPlanEditor and don't use
    // the stage-element pipeline — silence the diagnostic logs that
    // would only show 0 elements / no background for them.
    if (!isXrBeat) {
      console.warn(`[VisualWorkspace] ★★★ Setting ${elements.length} elements for ${beat.type} ★★★`);
      console.warn(`[VisualWorkspace] ========== ELEMENT POSITIONS BEING SET ==========`);
      elements.forEach((e, idx) => {
        console.warn(`[VisualWorkspace]   [${idx}] ${e.type}/${e.name}: x=${e.x}, y=${e.y}, z=${e.z}, w=${e.width}, h=${e.height}, size=${e.size}, fontSize=${e.fontSize}`);
      });
      console.warn(`[VisualWorkspace] ================================================`);
      console.log(`[VisualWorkspace] Background: bgId=${bgId?.substring?.(0, 8) || 'none'}, bgUrl=${bgUrl ? 'set' : 'none'}`);
    }

    setVisualElements(elements);
    setBackgroundAssetId(bgId);
    setBackgroundUrl(bgUrl);
    setBackgroundSound(params.backgroundSound || '');
    // Load animations from beat.animations first (direct property), fallback to params.animations
    console.log(`[VisualWorkspace] Loading animations: beat.animations=${beat.animations?.length || 0}, params.animations=${params.animations?.length || 0}`);
    setAnimations(beat.animations || params.animations || []);
    setHasChanges(false);

    // Update character/prop element dimensions based on actual image size
    // This ensures the selection box and Properties panel show correct dimensions
    const updateImageDimensions = async () => {
      const elementsNeedingUpdate = elements.filter(el =>
        (el.type === 'character' || el.type === 'prop') &&
        (el.imageUrl || el.assetUrl) &&
        // Check for default/scaled default dimensions (100x100 or 128x128 from ASML scaling)
        ((el.width === 100 && el.height === 100) || (el.width === 128 && el.height === 128))
      );

      if (elementsNeedingUpdate.length === 0) return;

      console.log(`[VisualWorkspace] Loading ${elementsNeedingUpdate.length} images to get actual dimensions`);

      const updates: { id: string; width: number; height: number }[] = [];

      await Promise.all(elementsNeedingUpdate.map(el => {
        return new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            // Apply size percentage to get effective dimensions
            const sizeMultiplier = (el.size || 100) / 100;
            const effectiveWidth = Math.round(img.naturalWidth * sizeMultiplier);
            const effectiveHeight = Math.round(img.naturalHeight * sizeMultiplier);
            console.log(`[VisualWorkspace] Image "${el.name}": natural=${img.naturalWidth}x${img.naturalHeight}, size=${el.size}%, effective=${effectiveWidth}x${effectiveHeight}`);
            updates.push({ id: el.id, width: effectiveWidth, height: effectiveHeight });
            resolve();
          };
          img.onerror = () => {
            console.warn(`[VisualWorkspace] Failed to load image for "${el.name}"`);
            resolve();
          };
          img.src = el.imageUrl || el.assetUrl!;
        });
      }));

      if (updates.length > 0) {
        setVisualElements(prev => prev.map(el => {
          const update = updates.find(u => u.id === el.id);
          if (update) {
            return { ...el, width: update.width, height: update.height };
          }
          return el;
        }));
      }
    };

    updateImageDimensions();

    // Update prevBeatIdRef for non-dialogTree beats (dialogTree updates in phase loading effect)
    prevBeatIdRef.current = beat.id;

    // Reset parameter tracking so second useEffect will run for this beat
    prevParamsRef.current = '';
  }, [beat?.id]);

  // Sync visual elements with current parameters when they change
  // This ensures that when parameters change in the Inspector, the visual elements update
  useEffect(() => {
    if (!beat || !beat.getParameters) return;

    const params = beat.getParameters();

    // Create a stable JSON representation of parameters to detect changes
    const paramsJson = JSON.stringify(params);

    // Only run if parameters actually changed
    if (paramsJson === prevParamsRef.current) {
      return;
    }

    console.log('[VisualWorkspace] Parameters changed, syncing visual elements');

    // Log only relevant parameters for this beat type
    const relevantParams: any = { beatType: beat.type };
    if (beat.type === 'titleScreen') {
      relevantParams.title = params.title;
      relevantParams.author = params.author;
      relevantParams.buttonText = params.buttonText;
    } else if (beat.type === 'endScreen') {
      relevantParams.message = params.message;
      relevantParams.restartText = params.restartText;
      relevantParams.creditsText = params.creditsText;
    } else if (beat.type === 'infoText' || beat.type === 'durScreen') {
      relevantParams.text = params.text;
      relevantParams.buttonText = params.buttonText;
    } else if (beat.type === 'aiInfoText' || beat.type === 'aiDurScreen') {
      // AI beats use fallbackText for visual editor preview
      relevantParams.fallbackText = params.fallbackText;
      relevantParams.prompt = params.prompt;
      relevantParams.buttonText = params.buttonText;
    } else {
      relevantParams.text = params.text;
      relevantParams.buttonText = params.buttonText;
    }
    console.log('[VisualWorkspace] Syncing visual elements with params:', relevantParams);

    setVisualElements(prev => {
      let updated = [...prev];
      let changed = false;

      // Update text content and auto-resize for InfoText/DurScreen
      if ((beat.type === 'infoText' || beat.type === 'durScreen') && params.text) {
        updated = updated.map((e: VisualElement) => {
          if (e.type === 'text' && e.name === 'text') {
            if (e.text !== params.text) {
              changed = true;
              console.log('[VisualWorkspace] Updating text element, fontSize:', e.fontSize);
              // Smart sizing is computed at render time by PositionedBeatView
              return { ...e, text: params.text };
            }
          }
          return e;
        });
      }

      // Update text content for AI beats (using fallbackText)
      if ((beat.type === 'aiInfoText' || beat.type === 'aiDurScreen') && params.fallbackText) {
        updated = updated.map((e: VisualElement) => {
          if (e.type === 'text' && e.name === 'text') {
            if (e.text !== params.fallbackText) {
              changed = true;
              console.log('[VisualWorkspace] Updating AI beat text element');
              // Smart sizing is computed at render time by PositionedBeatView
              return { ...e, text: params.fallbackText };
            }
          }
          return e;
        });
      }

      // Update EndScreen button texts and visibility (only in main phase, not credits phase)
      if (beat.type === 'endScreen' && selectedPhaseId !== 'credits') {
        console.log('[VisualWorkspace] EndScreen detected, checking buttons:', {
          buttons: updated.filter(e => e.type === 'button').map(e => ({ name: e.name, text: e.text })),
          restartText: params.restartText,
          creditsText: params.creditsText,
          buttonText: params.buttonText,
          showRestart: params.showRestart,
          showCredits: params.showCredits
        });

        const stageWidth = projectSettings?.width || 1024;
        const centerX = stageWidth / 2;
        const restartWidth = 180;
        const creditsWidth = 180;
        const buttonSpacing = 20;

        // Check which buttons should exist
        const showRestart = params.showRestart !== false;
        const showCredits = params.showCredits === true;

        // Check which buttons currently exist
        // For legacy imports, any button that's NOT credits is treated as restart button
        const hasCreditsButton = updated.some(e => e.type === 'button' && e.name?.toLowerCase().includes('credits'));
        const hasRestartButton = updated.some(e => e.type === 'button' && !e.name?.toLowerCase().includes('credits'));

        // Remove Restart button if showRestart is false (any non-credits button)
        if (!showRestart && hasRestartButton) {
          console.log('[VisualWorkspace] Removing Restart button (showRestart=false)');
          updated = updated.filter(e => !(e.type === 'button' && !e.name?.toLowerCase().includes('credits')));
          changed = true;
        }

        // Remove Credits button if showCredits is false
        if (!showCredits && hasCreditsButton) {
          console.log('[VisualWorkspace] Removing Credits button (showCredits=false)');
          updated = updated.filter(e => !(e.type === 'button' && e.name?.toLowerCase().includes('credits')));
          changed = true;
        }

        // Add Restart button if showRestart is true and it doesn't exist
        if (showRestart && !hasRestartButton) {
          console.log('[VisualWorkspace] Adding Restart button (showRestart=true)');
          let restartX: number;
          if (showCredits) {
            const totalButtonWidth = restartWidth + creditsWidth + buttonSpacing;
            restartX = centerX - totalButtonWidth / 2;
          } else {
            restartX = centerX - restartWidth / 2;
          }
          updated.push({
            id: `button_restart_${Date.now()}`,
            type: 'button',
            name: 'Restart',
            text: params.restartText || params.buttonText || 'Play Again',
            x: restartX,
            y: 450,
            z: 11,
            width: 180,
            height: 50,
            rotation: 0,
            scale: 1,
            visible: true,
            locked: false,
            font: undefined, // Use theme default
            fontSize: 18,
            textAlign: 'center'
          });
          changed = true;
        }

        // Add Credits button if showCredits is true and it doesn't exist
        if (showCredits && !hasCreditsButton) {
          console.log('[VisualWorkspace] Adding Credits button (showCredits=true)');
          let creditsX: number;
          if (showRestart) {
            const totalButtonWidth = restartWidth + creditsWidth + buttonSpacing;
            creditsX = centerX - totalButtonWidth / 2 + restartWidth + buttonSpacing;
          } else {
            creditsX = centerX - creditsWidth / 2;
          }
          updated.push({
            id: `button_credits_${Date.now()}`,
            type: 'button',
            name: 'Credits',
            text: params.creditsText || 'Credits',
            x: creditsX,
            y: 450,
            z: 12,
            width: 180,
            height: 50,
            rotation: 0,
            scale: 1,
            visible: true,
            locked: false,
            font: undefined, // Use theme default
            fontSize: 18,
            textAlign: 'center'
          });
          changed = true;
        }

        // Update existing button texts and positions
        updated = updated.map((e: VisualElement) => {
          if (e.type === 'button') {
            const nameLower = e.name?.toLowerCase() || '';
            console.log('[VisualWorkspace] Checking button:', { name: e.name, nameLower, text: e.text });

            // Update Restart button text and position
            if (nameLower.includes('restart') || nameLower.includes('again')) {
              const newText = params.restartText || params.buttonText || 'Play Again';
              let newX = e.x;

              // Recalculate position based on whether Credits button exists
              const creditsExists = updated.some(el => el.type === 'button' && el.name?.toLowerCase().includes('credits'));
              if (creditsExists) {
                // Use ACTUAL button widths, not hardcoded values
                const actualRestartWidth = e.width;
                const creditsButton = updated.find(el => el.type === 'button' && el.name?.toLowerCase().includes('credits'));
                const actualCreditsWidth = creditsButton?.width || creditsWidth;
                const totalButtonWidth = actualRestartWidth + actualCreditsWidth + buttonSpacing;
                newX = centerX - totalButtonWidth / 2;
              } else {
                // Single button - use actual width
                newX = centerX - e.width / 2;
              }

              if (e.text !== newText || e.x !== newX) {
                console.log(`[VisualWorkspace] Updating Restart button: text="${newText}", x=${newX}`);
                changed = true;
                return { ...e, text: newText, x: newX };
              }
            }
            // Update Credits button text and position
            else if (nameLower.includes('credits')) {
              const newText = params.creditsText || 'Credits';
              let newX = e.x;

              // Recalculate position based on whether Restart button exists
              const restartExists = updated.some(el => el.type === 'button' && el.name?.toLowerCase().includes('restart'));
              if (restartExists) {
                // Use ACTUAL button widths, not hardcoded values
                const restartButton = updated.find(el => el.type === 'button' && (el.name?.toLowerCase().includes('restart') || el.name?.toLowerCase().includes('again')));
                const actualRestartWidth = restartButton?.width || restartWidth;
                const actualCreditsWidth = e.width;
                const totalButtonWidth = actualRestartWidth + actualCreditsWidth + buttonSpacing;
                newX = centerX - totalButtonWidth / 2 + actualRestartWidth + buttonSpacing;
              } else {
                // Single button - use actual width
                newX = centerX - e.width / 2;
              }

              if (e.text !== newText || e.x !== newX) {
                console.log(`[VisualWorkspace] Updating Credits button: text="${newText}", x=${newX}`);
                changed = true;
                return { ...e, text: newText, x: newX };
              }
            }
          }
          return e;
        });
      }

      // Update EndScreen credits phase text elements
      if (beat.type === 'endScreen' && selectedPhaseId === 'credits') {
        updated = updated.map((e: VisualElement) => {
          if (e.id === 'credits_title') {
            const newText = params.creditsPageTitle || 'Credits';
            if (e.text !== newText) {
              changed = true;
              return { ...e, text: newText };
            }
          } else if (e.id === 'credits_body') {
            const newText = params.creditsPageBody || '';
            if (e.text !== newText) {
              changed = true;
              return { ...e, text: newText };
            }
          } else if (e.id === 'credits_close') {
            const newText = params.creditsCloseText || 'Close';
            if (e.text !== newText) {
              changed = true;
              return { ...e, text: newText };
            }
          }
          return e;
        });
      }

      // Update TitleScreen text elements and button
      if (beat.type === 'titleScreen') {
        updated = updated.map((e: VisualElement) => {
          const nameLower = e.name?.toLowerCase() || '';
          if (e.type === 'button' && nameLower.includes('start')) {
            const newText = params.buttonText || 'Start';
            if (e.text !== newText) {
              console.log(`[VisualWorkspace] Updating Start button text from "${e.text}" to "${newText}"`);
              changed = true;
              return { ...e, text: newText };
            }
          } else if (e.type === 'text' || e.type === 'dialog') {
            if (nameLower.includes('title')) {
              const newText = params.title || 'Untitled Story';
              if (e.text !== newText) {
                console.log(`[VisualWorkspace] Updating Title text from "${e.text}" to "${newText}"`);
                changed = true;
                // Smart sizing is computed at render time by PositionedBeatView
                return { ...e, text: newText };
              }
            } else if (nameLower.includes('author')) {
              const newText = params.author || 'Anonymous';
              if (e.text !== newText) {
                console.log(`[VisualWorkspace] Updating Author text from "${e.text}" to "${newText}"`);
                changed = true;
                return { ...e, text: newText };
              }
            } else if (nameLower.includes('message')) {
              // Handle message box for endScreen
              const newText = params.message || 'The End';
              if (e.text !== newText) {
                console.log(`[VisualWorkspace] Updating message text from "${e.text}" to "${newText}"`);
                changed = true;
                return { ...e, text: newText };
              }
            }
          }
          return e;
        });
      }

      // Update movementChoice/pickProp question text
      if (beat.type === 'movementChoice' || beat.type === 'pickProp') {
        updated = updated.map((e: VisualElement) => {
          if ((e.type === 'dialog' || e.type === 'text') && e.name?.toLowerCase().includes('question')) {
            if (e.text !== params.question) {
              changed = true;
              return { ...e, text: params.question || '' };
            }
          }
          return e;
        });
      }

      if (changed) {
        console.log('[VisualWorkspace] Visual elements updated');
        setHasChanges(true); // Mark as changed so Save button appears
      }

      return changed ? updated : prev;
    });

    // Update previous parameters ref
    prevParamsRef.current = paramsJson;
  }, [beat, beat?.id, beatVersion, selectedPhaseId, projectSettings, renderTheme]); // beatVersion triggers on param changes, selectedPhaseId for phase-aware sync

  // Get beat content for display, with translation overlay when active
  const getBeatContent = () => {
    if (!beat) return undefined;
    const params = beat.getParameters ? beat.getParameters() : {};

    // When a translation is active, get translated values for this beat
    // and create a helper to look them up by parameter path
    const activeResource = translationState.activeLanguage
      ? translationState.translations.find(r => r.languageCode === translationState.activeLanguage)
      : null;
    const translations = activeResource ? getTranslationsForBeat(activeResource, beat.id) : {};
    const t = (path: string, fallback: string) => translations[path] ?? fallback;

    switch (beat.type) {
      case 'titleScreen':
        return {
          title: t('title', params.title || 'Untitled'),
          author: t('author', params.author || 'Unknown'),
          buttonText: t('buttonText', params.buttonText || 'Start')
        };
      case 'infoText':
        return {
          text: t('text', params.text || ''),
          buttonText: t('buttonText', params.buttonText || 'Continue')
        };
      case 'durScreen':
        return {
          text: t('text', params.text || ''),
        };
      case 'endScreen':
        if (selectedPhaseId === 'credits') {
          return {
            creditsTitle: t('creditsPageTitle', params.creditsPageTitle || 'Credits'),
            creditsBody: t('creditsPageBody', params.creditsPageBody || ''),
            creditsCloseText: t('creditsCloseText', params.creditsCloseText || 'Close'),
          };
        }
        return {
          message: t('message', params.message || 'The End'),
          showRestart: params.showRestart !== false,
          showCredits: params.showCredits || false,
          restartText: t('restartText', params.restartText || 'Play Again'),
          creditsText: t('creditsText', params.creditsText || 'Credits'),
          buttonText: params.buttonText ? t('buttonText', params.buttonText) : undefined
        };
      case 'dialogTree': {
        const rawText = params.text || params.dialogTree?.text || '';
        const rawChoices = params.dialogTree?.choices || [];
        const translatedChoices = rawChoices.map((c: any, i: number) => ({
          ...c,
          text: translations[`dialogTree.choices.${i}.text`] ?? c.text,
          displayText: translations[`dialogTree.choices.${i}.displayText`] ?? c.displayText,
        }));
        return {
          speaker: params.speaker || params.dialogTree?.speaker || 'Character',
          text: t('text', rawText) || translations['dialogTree.text'] || rawText,
          choices: translatedChoices
        };
      }
      case 'movementChoice': {
        const rawChoices = params.choices || [];
        const translatedChoices = rawChoices.map((c: any, i: number) => ({
          ...c,
          text: translations[`choices.${i}.text`] ?? c.text,
          displayText: translations[`choices.${i}.displayText`] ?? c.displayText,
        }));
        return {
          question: t('question', params.question || 'Where do you want to go?'),
          choices: translatedChoices
        };
      }
      case 'multiChoice': {
        const rawChoices = params.choices || [];
        const translatedChoices = rawChoices.map((c: any, i: number) => ({
          ...c,
          text: translations[`choices.${i}.text`] ?? c.text,
        }));
        const question = t('question', params.question || 'What do you say?');
        return {
          speaker: params.speaker || '',
          question,
          // Mirror question → text so VBE's ChatDialogView preview (which
          // keys off content.text) shows the prompt in chat-bubble mode.
          text: question,
          choices: translatedChoices,
        };
      }
      case 'pickProp': {
        const rawProps = params.props || [];
        const translatedProps = rawProps.map((p: any, i: number) => ({
          ...p,
          name: translations[`props.${i}.name`] ?? p.name,
          displayName: translations[`props.${i}.displayName`] ?? p.displayName,
          description: translations[`props.${i}.description`] ?? p.description,
        }));
        return {
          question: t('question', params.question || 'What do you want to interact with?'),
          props: translatedProps
        };
      }
      case 'inputText':
        return {
          prompt: t('prompt', params.prompt || 'Please enter your response:'),
          placeholder: t('placeholder', params.placeholder || 'Type here...'),
          buttonText: t('buttonText', params.buttonText || 'Continue')
        };
      case 'hyperText':
        return {
          text: t('text', params.text || 'Click on any word to explore.'),
          hyperlinks: params.hyperlinks || []
        };
      case 'video':
        return {
          videoFile: params.videoFile || '',
          skipButton: params.skipButton !== false
        };
      case 'onlineContent':
        return {
          text: params.query
            ? `[AI will search: "${params.query.substring(0, 50)}${params.query.length > 50 ? '...' : ''}"]`
            : '[Online content will appear here]',
          buttonText: params.buttonText || 'Continue'
        };
      case 'aiDialogTree':
        return {
          text: `[${params.npcName || 'Character'} will respond based on scenario]`,
          choices: []
        };
      case 'aiSummary':
        return {
          title: params.title || 'Your Journey',
          summary: '[AI-generated summary will appear here]',
          showRestart: params.showRestart !== false,
          showCredits: params.showCredits || false,
          restartText: params.restartText || 'Play Again',
          creditsText: params.creditsText || 'Credits'
        };
      case 'aiInfoText':
        return {
          text: params.fallbackText || '[AI-generated text will appear here]',
          buttonText: params.buttonText || 'Continue'
        };
      case 'aiDurScreen':
        return {
          text: params.fallbackText || '[AI-generated text will appear here]',
          // No button - auto-advances based on reading time
        };
      default:
        return params;
    }
  };

  // Wrap getBeatContent to always include base beat speaker fields
  const getBeatContentWithSpeaker = () => {
    const content = getBeatContent();
    if (!content || !beat) return content;
    return {
      ...content,
      speaker: content.speaker || beat.speaker,
      showSpeaker: beat.showSpeaker,
    };
  };

  // Handle asset selection
  const handleAssetSelection = useCallback((
    type: 'background' | 'character' | 'prop' | 'sound' | 'video',
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

      // CRITICAL FIX: Immediately persist background to beat parameters
      // This ensures the background is saved even without switching beats
      if (beat && beat.updateParameters) {
        const params = beat.getParameters ? beat.getParameters() : {};
        if (beat.type === 'panorama') {
          beat.updateParameters({ ...params, panoramaAssetId: asset.id });
        } else {
          beat.updateParameters({
            ...params,
            backgroundAssetId: asset.id,
            node: asset.id // Also set 'node' for compatibility with Beat.execute()
          });
        }
        console.log(`[VisualWorkspace] Background immediately persisted to beat: ${asset.id}`);
      }
    });
  }, [handleAssetSelection, beat]);

  // Save visual changes
  const handleSave = () => {
    if (!beat || !beat.updateParameters) return;
    
    const params = beat.getParameters ? beat.getParameters() : {};
    
    // CRITICAL FIX: Update beat.locations Map directly
    // Clear existing locations
    beat.locations.clear();
    
    // Add all visual elements as locations
    visualElements.forEach(el => {
      // Skip deprecated "Main Text" elements to prevent saving them back
      if (el.name === 'Main Text') {
        console.log('[DEBUG] Skipping deprecated Main Text element during save');
        return;
      }

      // For EndScreen credits phase, skip credits-specific elements (they're saved as phaseOverrides)
      if (beat.type === 'endScreen' && selectedPhaseId === 'credits' &&
          (el.id === 'credits_title' || el.id === 'credits_body' || el.id === 'credits_close')) {
        return;
      }

      // For DialogTree beats, skip dialog and button elements (they're regenerated per phase)
      if (beat.type === 'dialogTree' && (el.type === 'dialog' || el.type === 'button')) {
        return;
      }

      let kind: 'text' | 'hotspot' | 'prop' | 'character' | 'button' | 'dialog' | 'meter' | 'keypad' = el.type as any;

      if (el.type === 'character') kind = 'character';
      else if (el.type === 'prop') kind = 'prop';
      else if (el.type === 'dialog') kind = 'dialog';
      else if (el.type === 'button') kind = 'button';
      else if (el.type === 'hotspot') kind = 'hotspot';
      else if (el.type === 'text') kind = 'text';
      else if (el.type === 'meter') kind = 'meter';
      else if (el.type === 'keypad') kind = 'keypad';

      // Use consistent key for both Map key and location.name
      const locationKey = el.name || el.text || el.id;
      const location: any = {
        kind,
        name: locationKey,
        id: el.id,  // Include element ID for animation targeting
        x: Math.round(el.x),
        y: Math.round(el.y),
        width: Math.round(el.width),
        height: Math.round(el.height),
        zIndex: el.z
      };

      // Add optional properties
      if (el.assetId) location.assetId = el.assetId;
      if (el.imageUrl) location.imageUrl = el.imageUrl;  // Preserve direct image URL (ASML imports)
      if (el.sound) location.sound = el.sound;

      // Add transform properties (rotation and scale)
      if (el.rotation !== undefined && el.rotation !== 0) location.rotation = el.rotation;
      if (el.scale !== undefined && el.scale !== 1) location.scale = el.scale;

      // Add font properties (only if explicitly overridden by user)
      if (el.fontOverridden && el.font) location.font = el.font;
      if (el.fontOverridden && el.fontSize !== undefined) location.fontSize = el.fontSize;
      if (el.textAlign) location.textAlign = el.textAlign;

      // Set autosize - enable if font is not explicitly overridden
      location.autosize = !el.fontOverridden || el.fontSize === undefined;

      // Add character-specific properties (for kind='character')
      if (el.type === 'character') {
        if (el.characterId) location.characterId = el.characterId;
        if (el.characterName) location.characterName = el.characterName;  // Preserve character name
        if (el.stateId) location.stateId = el.stateId;
        if (el.size !== undefined) location.size = el.size;
        // Look up character name for ASML export compatibility (if not already set)
        if (!location.characterName) {
          const character = characters.find(c => c.id === el.characterId);
          if (character) {
            location.characterName = character.name;
          }
        }
      }

      // Add meter-specific properties (for kind='meter')
      if (el.type === 'meter') {
        if (el.characterId) location.characterId = el.characterId;
        if (el.counterName) location.counterName = el.counterName;
        if (el.meterOrientation) location.meterOrientation = el.meterOrientation;
        if (el.showNumericValue !== undefined) location.showNumericValue = el.showNumericValue;
        if (el.numericFormat) location.numericFormat = el.numericFormat;
        if (el.meterColor) location.meterColor = el.meterColor;
        if (el.meterBackgroundColor) location.meterBackgroundColor = el.meterBackgroundColor;
      }

      // Per-element hotspot appearance override
      if ((el as any).hotspotOverride?.enabled) location.hotspotOverride = (el as any).hotspotOverride;

      beat.locations.set(locationKey, location);
    });

    console.log(`[VisualWorkspace] Saved ${beat.locations.size} locations to beat`);

    // For EndScreen credits phase, save phase overrides and credits text
    const updatedParams: any = {
      ...params,
      visualElements,
      ...(beat.type === 'panorama'
        ? { panoramaAssetId: backgroundAssetId }
        : { backgroundAssetId, node: backgroundAssetId }),
      backgroundSound,
      animations
    };

    if (beat.type === 'endScreen' && selectedPhaseId === 'credits') {
      // Save credits element positions as phaseOverrides
      const overrides: Record<string, Partial<{ x: number; y: number; width: number; height: number; z: number }>> = {};
      visualElements.forEach(el => {
        if (el.id === 'credits_title' || el.id === 'credits_body' || el.id === 'credits_close') {
          overrides[el.id] = { x: el.x, y: el.y, width: el.width, height: el.height, z: el.z };
        }
      });
      updatedParams.phaseOverrides = { ...params.phaseOverrides, credits: overrides };

      // Also sync credits text back to parameters
      const titleEl = visualElements.find(el => el.id === 'credits_title');
      const bodyEl = visualElements.find(el => el.id === 'credits_body');
      const closeEl = visualElements.find(el => el.id === 'credits_close');
      if (titleEl?.text !== undefined) updatedParams.creditsPageTitle = titleEl.text;
      if (bodyEl?.text !== undefined) updatedParams.creditsPageBody = bodyEl.text;
      if (closeEl?.text !== undefined) updatedParams.creditsCloseText = closeEl.text;
    }

    // Save visual data to parameters
    beat.updateParameters(updatedParams);

    // Also set animations directly on beat (updateParameters doesn't handle base Beat properties)
    beat.animations = animations;
    console.log(`[VisualWorkspace] Saved animations to beat:`, animations.length, animations);

    // Notify the store so autosave/VCS detects the changes (locations, parameters, animations)
    if (onBeatUpdate) {
      onBeatUpdate(beat.id, {
        locations: Array.from(beat.locations.values()),
        animations,
      } as any);
    }

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
  const content = getBeatContentWithSpeaker();

  // Debug: log selected element details when selection changes (debug level to avoid flood)
  if (selectedElement) {
    console.debug(`[VisualWorkspace] Selected: ${selectedElement.type}/${selectedElement.name} x=${Math.round(selectedElement.x)} y=${Math.round(selectedElement.y)} w=${Math.round(selectedElement.width)} h=${Math.round(selectedElement.height)}`);
  }

  // Handle sharing current background to cluster
  const handleShareBackgroundToCluster = useCallback(() => {
    if (!cluster || !onSetClusterSharedVisuals) return;

    const currentSharedVisuals = cluster.sharedVisuals || { locations: [] };
    const newSharedVisuals: SharedVisualContent = {
      ...currentSharedVisuals,
      background: backgroundAssetId ? {
        assetId: backgroundAssetId,
        scale: 1,
        opacity: 1,
      } : undefined,
    };

    onSetClusterSharedVisuals(cluster.id, newSharedVisuals);
    console.log('[VisualWorkspace] Shared background to cluster:', cluster.name, newSharedVisuals);
  }, [cluster, onSetClusterSharedVisuals, backgroundAssetId]);

  // Handle sharing selected element to cluster
  const handleShareElementToCluster = useCallback(() => {
    if (!cluster || !onSetClusterSharedVisuals || !selectedElementId) return;

    const elementToShare = visualElements.find(el => el.id === selectedElementId);
    if (!elementToShare) return;

    // Convert VisualElement to Location format
    const locationToShare: Location = {
      x: elementToShare.x,
      y: elementToShare.y,
      width: elementToShare.width,
      height: elementToShare.height,
      kind: elementToShare.type,  // Map 'type' to 'kind'
      name: elementToShare.name || elementToShare.id,  // Use name or fall back to id
      // Copy relevant properties
      assetId: elementToShare.assetId,
      characterId: elementToShare.characterId,
      fontSize: elementToShare.fontSize,
    };

    const currentSharedVisuals = cluster.sharedVisuals || { locations: [] };
    const newSharedVisuals: SharedVisualContent = {
      ...currentSharedVisuals,
      locations: [...(currentSharedVisuals.locations || []), locationToShare],
    };

    onSetClusterSharedVisuals(cluster.id, newSharedVisuals);
    console.log('[VisualWorkspace] Shared element to cluster:', elementToShare.name, cluster.name);
  }, [cluster, onSetClusterSharedVisuals, selectedElementId, visualElements]);

  // XR beats use dedicated visual editors (Leaflet map for GPS, SVG floor
  // plan for indoor). Short-circuit the standard pipeline since their data
  // model is location entries, not stage-positioned visual elements.
  if (beat && (beat.type === 'gpsLocation' || beat.type === 'indoorLocation')) {
    const params = (beat.getParameters?.() ?? {}) as any;
    const xrLocations: any[] = Array.isArray(params.xrLocations) ? params.xrLocations : [];
    const beatRadius: number | undefined = params.radiusMeters;
    const projectDefault = (globalSettings as any)?.location?.defaultProximityRadiusM as number | undefined;
    const availableTargets = beats.filter((b: any) => b.id !== beat.id).map((b: any) => ({
      id: b.id,
      name: b.name,
    }));
    const writeLocations = (next: any[]) => {
      const updated = (beat as any).getParameters?.() ?? {};
      onBeatUpdate?.(beat.id, { parameters: { ...updated, xrLocations: next } } as any);
    };
    if (beat.type === 'gpsLocation') {
      const loc = (globalSettings as any)?.location;
      const storyOrigin = loc?.originLat !== undefined && loc?.originLng !== undefined
        ? { lat: loc.originLat, lng: loc.originLng }
        : (loc?.mockLocation || undefined);
      return (
        <div style={{ position: 'relative', height: '100%', width: '100%' }}>
          <XRMapEditor
            locations={xrLocations}
            beatRadiusMeters={beatRadius}
            projectDefaultRadius={projectDefault}
            mapStyle={params.mapStyle}
            storyOrigin={storyOrigin}
            onChange={writeLocations}
          />
        </div>
      );
    }
    // indoorLocation — beat-level venue wins, project venue is the
    // fallback. Same resolution rule as IndoorLocationBeat.performAction.
    const venueRaw = (globalSettings as any)?.location?.venue as
      | { name?: string; floorPlan?: string; floorWidth: number; floorHeight: number }
      | undefined;
    const beatHasVenue = !!params.floorPlanAssetId
      || params.floorWidthM !== undefined
      || params.floorHeightM !== undefined;
    const floorPlanAssetId = params.floorPlanAssetId ?? (beatHasVenue ? undefined : venueRaw?.floorPlan);
    const floorWidth = params.floorWidthM ?? venueRaw?.floorWidth ?? 20;
    const floorHeight = params.floorHeightM ?? venueRaw?.floorHeight ?? 20;
    const floorPlanUrl = floorPlanAssetId
      ? assets.find((a: any) => a.id === floorPlanAssetId)?.url
      : undefined;
    return (
      <div style={{ position: 'relative', height: '100%', width: '100%' }}>
        <XRFloorPlanEditor
          locations={xrLocations}
          beatRadiusMeters={beatRadius}
          projectDefaultRadius={projectDefault}
          venue={{
            name: beatHasVenue ? undefined : venueRaw?.name,
            floorPlanUrl,
            floorWidth,
            floorHeight,
          }}
          onLocationsChange={writeLocations}
        />
      </div>
    );
  }

  return (
    <div className="h-full flex bg-gray-100 relative">
      {/* Left Panel with Tabs */}
      {showProperties && (
        <div
          className="bg-white border-r border-gray-200 flex flex-col relative"
          style={{ width: leftPanelWidth, minWidth: 280, maxWidth: 600 }}
        >
          {/* Resize Handle */}
          <div
            className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-400 transition-colors z-10"
            style={{ backgroundColor: isResizingPanel ? '#3b82f6' : 'transparent' }}
            onMouseDown={(e) => {
              e.preventDefault();
              setIsResizingPanel(true);
            }}
          />
          {/* Cluster Info Banner */}
          {cluster && (
            <div className="p-2 bg-teal-50 border-b border-teal-200">
              <div className="flex items-center gap-2 text-sm">
                <Share2 className="w-4 h-4 text-teal-600" />
                <span className="font-medium text-teal-700">In cluster: {cluster.name}</span>
              </div>
              {cluster.sharedVisuals && (
                <div className="mt-1 text-xs text-teal-600">
                  {cluster.sharedVisuals.background ? '✓ Shared background' : ''}
                  {cluster.sharedVisuals.locations?.length ? ` • ${cluster.sharedVisuals.locations.length} shared element(s)` : ''}
                </div>
              )}
              <div className="mt-2 flex gap-2">
                {backgroundAssetId && onSetClusterSharedVisuals && (
                  <button
                    onClick={handleShareBackgroundToCluster}
                    className="px-2 py-1 text-xs bg-teal-500 text-white rounded hover:bg-teal-600"
                    title="Share current background with all beats in this cluster"
                  >
                    Share Background
                  </button>
                )}
                {selectedElementId && onSetClusterSharedVisuals && (
                  <button
                    onClick={handleShareElementToCluster}
                    className="px-2 py-1 text-xs bg-teal-500 text-white rounded hover:bg-teal-600"
                    title="Share selected element with all beats in this cluster"
                  >
                    Share Element
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Legacy left-side "Dialog Phases" panel removed (v0.9.63).
              Phase navigation lives on the canvas now: a breadcrumb
              shows the current node path, and clicking a choice button
              in the responsive preview steps into its nested dialog.
              Inspector's DialogTreeEditor keeps its Walk button so
              both sides can drive dialogTreeNodePath. selectedPhaseId
              is now derived from dialogTreeNodePath so phaseOverrides
              continues to key per-phase without a separate UI. */}

          {/* EndScreen Credits Phase Navigator */}
          {isEndScreenWithCredits && (
            <div className="border-b border-gray-200 bg-amber-50">
              <div className="px-3 py-1.5 flex items-center gap-1">
                {endScreenPhases.map((phase) => (
                  <button
                    key={phase.id}
                    onClick={() => handlePhaseSelect(phase.id)}
                    className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                      selectedPhaseId === phase.id
                        ? 'bg-amber-200 text-amber-900 ring-1 ring-amber-400'
                        : 'hover:bg-amber-100 text-amber-700'
                    }`}
                  >
                    {phase.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <>
          {/* Tab Buttons */}
          <div className="flex border-b border-gray-200">
            <button
              className={`flex-1 px-4 py-2 font-medium text-sm transition-colors ${
                activeTab === 'elements'
                  ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
              }`}
              onClick={() => setActiveTab('elements')}
            >
              Elements
            </button>
            <button
              className={`flex-1 px-4 py-2 font-medium text-sm transition-colors ${
                activeTab === 'animations'
                  ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
              }`}
              onClick={() => setActiveTab('animations')}
            >
              Animations
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-hidden">
            {activeTab === 'elements' && (
              <VisualPropertiesPanel
                layoutMode={
                  beat && !beatHasAuthorLocations
                    ? isSpatialModeBeatType(beat.type)
                      ? 'spatial'
                      : isSlotModeBeatType(beat.type)
                        ? 'slot'
                        : 'absolute'
                    : 'absolute'
                }
                backgroundAssetId={backgroundAssetId}
                elements={visualElements}
                selectedElements={selectedElementIds}
                onBackgroundSelect={handleBackgroundSelect}
                onElementSelect={(id: string | null) => {
                  // Selection is exclusive across the panel: choosing an
                  // element clears any expanded slot row, and vice versa
                  // (see onExpandedSlotKeyChange below). One thing
                  // highlighted at a time.
                  setSelectedElementIds(id ? [id] : []);
                  if (id) setExpandedSlotKey(null);
                }}
                onElementUpdate={(elementId, updates) => {
                  // Capture snapshot for undo before first property change
                  if (!snapshotRef.current) {
                    snapshotRef.current = visualElements.map(el => ({ ...el }));
                  }
                  // Calculate updated elements synchronously so we can also sync to beat.locations
                  const updatedElements = visualElements.map(el => {
                    if (el.id === elementId) {
                      const updatedElement = { ...el, ...updates };

                      // Auto-resize if fontSize, font, or text changes for text/button/dialog elements
                      // Skip for panorama beats — markers use global settings font, not element fontSize
                      if ((el.type === 'text' || el.type === 'dialog' || el.type === 'button') &&
                          beat?.type !== 'panorama' &&
                          (updates.fontSize !== undefined || updates.font !== undefined || updates.text !== undefined)) {
                        const text = updatedElement.text || '';
                        const fontSize = updatedElement.fontSize || 16;
                        const fontFamily = updatedElement.font || 'Arial';

                        // Choose appropriate sizing function based on element type
                        let newDimensions;
                        if (el.type === 'button') {
                          newDimensions = calculateButtonDimensions(text, fontSize, fontFamily);
                        } else if (el.type === 'dialog') {
                          newDimensions = calculateDialogDimensions(text, fontSize, fontFamily);
                        } else {
                          newDimensions = calculateTextBoxDimensions(text, fontSize, fontFamily);
                        }

                        const resizedElement = { ...updatedElement, width: newDimensions.width, height: newDimensions.height };

                        // For buttons, recalculate x position to keep them centered
                        if (el.type === 'button') {
                          const stageWidth = projectSettings?.width || 1024;
                          const centerX = stageWidth / 2;
                          const nameLower = el.name?.toLowerCase() || '';

                          // Check if this is an EndScreen button (Restart or Credits)
                          if (nameLower.includes('restart') || nameLower.includes('again') || nameLower.includes('credits')) {
                            // Find if there are both Restart and Credits buttons
                            const hasRestartButton = visualElements.some(e =>
                              e.type === 'button' && (e.name?.toLowerCase().includes('restart') || e.name?.toLowerCase().includes('again'))
                            );
                            const hasCreditsButton = visualElements.some(e =>
                              e.type === 'button' && e.name?.toLowerCase().includes('credits')
                            );

                            if (hasRestartButton && hasCreditsButton) {
                              // Two buttons - calculate total width and position accordingly
                              const restartButton = visualElements.find(e =>
                                e.type === 'button' && (e.name?.toLowerCase().includes('restart') || e.name?.toLowerCase().includes('again'))
                              );
                              const creditsButton = visualElements.find(e =>
                                e.type === 'button' && e.name?.toLowerCase().includes('credits')
                              );

                              const restartWidth = (nameLower.includes('restart') || nameLower.includes('again')) ? newDimensions.width : (restartButton?.width || 180);
                              const creditsWidth = nameLower.includes('credits') ? newDimensions.width : (creditsButton?.width || 180);
                              const buttonSpacing = 20;
                              const totalButtonWidth = restartWidth + creditsWidth + buttonSpacing;

                              if (nameLower.includes('restart') || nameLower.includes('again')) {
                                // Restart button is on the left
                                resizedElement.x = centerX - totalButtonWidth / 2;
                              } else if (nameLower.includes('credits')) {
                                // Credits button is on the right
                                resizedElement.x = centerX - totalButtonWidth / 2 + restartWidth + buttonSpacing;
                              }
                            } else {
                              // Single button - center it
                              resizedElement.x = centerX - newDimensions.width / 2;
                            }
                          }
                        }

                        return resizedElement;
                      }

                      return updatedElement;
                    }
                    return el;
                  });

                  // Update state and sync to beat.locations
                  setVisualElements(updatedElements);
                  setHasChanges(true);

                  // CRITICAL: Sync to beat.locations immediately so effects don't overwrite with stale data
                  if (beat) {
                    syncElementsToBeatLocations(updatedElements, beat);
                  }

                  // Sync credits phase text changes back to beat parameters
                  if (beat?.type === 'endScreen' && selectedPhaseId === 'credits' && updates.text !== undefined) {
                    const updatedEl = updatedElements.find(el => el.id === elementId);
                    if (updatedEl && beat.updateParameters) {
                      const params = beat.getParameters ? beat.getParameters() : {};
                      const nameLower = updatedEl.name?.toLowerCase() || '';
                      if (nameLower.includes('title')) {
                        beat.updateParameters({ ...params, creditsPageTitle: updates.text });
                      } else if (nameLower.includes('body')) {
                        beat.updateParameters({ ...params, creditsPageBody: updates.text });
                      } else if (nameLower.includes('close')) {
                        beat.updateParameters({ ...params, creditsCloseText: updates.text });
                      }
                    }
                  }

                  // Debounced commit for property panel changes
                  if (commitTimeoutRef.current) clearTimeout(commitTimeoutRef.current);
                  commitTimeoutRef.current = window.setTimeout(() => {
                    commitSnapshot('Update element properties');
                    commitTimeoutRef.current = null;
                  }, 800);
                }}
                onElementDelete={(elementId) => {
                  // Capture snapshot before deletion for undo
                  const beforeSnapshot = visualElements.map(el => ({ ...el }));

                  // Find the element before removing it so we can remove from beat.locations
                  const elementToDelete = visualElements.find(el => el.id === elementId);

                  const afterElements = visualElements.filter(el => el.id !== elementId);
                  setVisualElements(afterElements);
                  if (selectedElementId === elementId) {
                    setSelectedElementIds([]);
                  }
                  setHasChanges(true);

                  // CRITICAL: Also remove from beat.locations immediately for Preview consistency
                  if (beat && elementToDelete) {
                    const locationKey = elementToDelete.name || elementToDelete.id;
                    if (beat.locations.has(locationKey)) {
                      beat.locations.delete(locationKey);
                      console.log(`[VisualWorkspace] Removed "${locationKey}" from beat.locations (now ${beat.locations.size} locations)`);
                    }

                    // For panorama beats, also remove the corresponding PanoramaHotspot entry
                    if (beat.type === 'panorama' && elementToDelete.type === 'hotspot') {
                      const params = beat.getParameters ? beat.getParameters() : {};
                      const hotspots = (params.hotspots || []).filter((hs: any) => hs.id !== elementId);
                      beat.updateParameters({ hotspots });
                      console.log(`[VisualWorkspace] Removed panorama hotspot "${elementId}" (now ${hotspots.length} hotspots)`);
                    }
                  }

                  // Commit immediately for delete
                  const cmd = new VisualElementsSnapshotCommand(
                    beforeSnapshot,
                    afterElements.map(el => ({ ...el })),
                    applyElements,
                    `Delete ${elementToDelete?.type || 'element'}`
                  );
                  getCommandManager().pushWithoutExecute(cmd);
                }}
                onElementAdd={(type) => {
                  const stageWidth = projectSettings?.width || 1024;
                  const stageHeight = projectSettings?.height || 768;
                  // Capture snapshot before add for undo
                  const beforeSnapshot = visualElements.map(el => ({ ...el }));

                  // For character type, use Character Manager instead of Asset Manager
                  if (type === 'character' && onOpenCharacterManager) {
                    onOpenCharacterManager((character) => {
                      if (character && character.id) {
                        // Get the default state
                        const defaultState = character.states?.find((s: { id: string }) => s.id === character.defaultState) || character.states?.[0];
                        // Get the image from the state or character default
                        const imageUrl = defaultState?.visual?.image || character.visual?.defaultImage;

                        // Load image to get natural dimensions
                        const addCharacterElement = (width: number, height: number) => {
                          const newElement: VisualElement = {
                            id: `element_${Date.now()}`,
                            type: 'character',
                            name: character.name || 'Character',
                            x: Math.floor(stageWidth / 2) - Math.floor(width / 2),
                            y: Math.floor(stageHeight / 2) - Math.floor(height / 2),
                            z: visualElements.length,
                            width,
                            height,
                            rotation: 0,
                            scale: 1,
                            visible: true,
                            locked: false,
                            characterId: character.id,
                            characterName: character.name,
                            stateId: defaultState?.id || 'default',
                            imageUrl: imageUrl,
                            size: 100 // Default to 100%
                          };
                          const afterElements = [...visualElementsRef.current, newElement];
                          setVisualElements(afterElements);
                          setSelectedElementIds([newElement.id]);
                          setHasChanges(true);

                          // CRITICAL: Also persist to beat.locations immediately for Preview
                          if (beat) {
                            const locationName = newElement.name || newElement.id;
                            beat.locations.set(locationName, {
                              kind: 'character',
                              name: locationName,
                              x: Math.round(newElement.x),
                              y: Math.round(newElement.y),
                              width: Math.round(newElement.width),
                              height: Math.round(newElement.height),
                              zIndex: newElement.z,
                              characterId: character.id,
                              characterName: character.name,
                              stateId: defaultState?.id || 'default'
                            });
                            console.log(`[VisualWorkspace] Added character "${locationName}" to beat.locations (now ${beat.locations.size} locations)`);
                          }

                          // Commit add for undo
                          const cmd = new VisualElementsSnapshotCommand(
                            beforeSnapshot, afterElements.map(el => ({ ...el })),
                            applyElements, 'Add character'
                          );
                          getCommandManager().pushWithoutExecute(cmd);
                        };

                        // Try to load image to get natural dimensions
                        if (imageUrl) {
                          const img = new Image();
                          img.onload = () => {
                            addCharacterElement(img.naturalWidth, img.naturalHeight);
                          };
                          img.onerror = () => {
                            // Fallback to default size if image fails to load
                            addCharacterElement(150, 150);
                          };
                          img.src = imageUrl;
                        } else {
                          // No image, use default size
                          addCharacterElement(150, 150);
                        }
                      }
                    });
                    return;
                  }

                  // For prop type, open asset selection modal
                  if (type === 'prop' && onAssetSelect) {
                    setAssetModal({
                      isOpen: true,
                      type: 'prop',
                      callback: (asset) => {
                        if (asset && asset.id) {
                          // Helper to add the prop element with given dimensions
                          const addPropElement = (width: number, height: number) => {
                            const newElement: VisualElement = {
                              id: `element_${Date.now()}`,
                              type,
                              name: asset.name || 'Prop',
                              x: Math.floor(stageWidth / 2) - Math.floor(width / 2),
                              y: Math.floor(stageHeight / 2) - Math.floor(height / 2),
                              z: visualElements.length,
                              width,
                              height,
                              rotation: 0,
                              scale: 1,
                              visible: true,
                              locked: false,
                              assetId: asset.id,
                              imageUrl: asset.url,
                            };
                            const afterElements = [...visualElementsRef.current, newElement];
                            setVisualElements(afterElements);
                            setSelectedElementIds([newElement.id]);
                            setHasChanges(true);

                            // CRITICAL: Also persist to beat.locations immediately for Preview
                            // Without this, newly added props won't appear in Preview
                            if (beat) {
                              const locationName = newElement.name || newElement.id;
                              beat.locations.set(locationName, {
                                kind: 'prop',
                                name: locationName,
                                x: Math.round(newElement.x),
                                y: Math.round(newElement.y),
                                width: Math.round(newElement.width),
                                height: Math.round(newElement.height),
                                zIndex: newElement.z,
                                assetId: asset.id,
                                imageUrl: asset.url,
                              });
                              console.log(`[VisualWorkspace] Added prop "${locationName}" to beat.locations (now ${beat.locations.size} locations)`);
                            }

                            // Commit add for undo
                            const cmd = new VisualElementsSnapshotCommand(
                              beforeSnapshot, afterElements.map(el => ({ ...el })),
                              applyElements, 'Add prop'
                            );
                            getCommandManager().pushWithoutExecute(cmd);
                          };

                          // Try to load image to get natural dimensions
                          if (asset.url) {
                            const img = new Image();
                            img.onload = () => {
                              addPropElement(img.naturalWidth, img.naturalHeight);
                            };
                            img.onerror = () => {
                              // Fallback to default size if image fails to load
                              addPropElement(150, 150);
                            };
                            img.src = asset.url;
                          } else {
                            // No URL, use default size
                            addPropElement(150, 150);
                          }
                        }
                      }
                    });
                    return;
                  }

                  // For meter type, open meter selection modal
                  if (type === 'meter') {
                    setMeterModal({ isOpen: true });
                    return;
                  }

                  // For panorama hotspots, use a stable ID and also create a panorama hotspot entry
                  const isPanorama = beat.type === 'panorama' && type === 'hotspot';
                  const elementId = isPanorama ? `hotspot_${Date.now()}` : `element_${Date.now()}`;

                  // For text and hotspot types, create element immediately
                  const newElement: VisualElement = {
                    id: elementId,
                    type,
                    name: isPanorama ? `Hotspot ${(beat.getParameters().hotspots || []).length + 1}` : type.charAt(0).toUpperCase() + type.slice(1),
                    x: Math.floor(stageWidth / 2) - 50,
                    y: Math.floor(stageHeight / 2) - 50,
                    z: visualElements.length,
                    width: type === 'text' ? 200 : (isPanorama ? 120 : 100),
                    height: type === 'text' ? 40 : (isPanorama ? 80 : 100),
                    rotation: 0,
                    scale: 1,
                    visible: true,
                    locked: false,
                    text: type === 'text' ? 'New Text' : (isPanorama ? `Hotspot ${(beat.getParameters().hotspots || []).length + 1}` : undefined),
                    // Font is left undefined to use theme default
                    font: undefined,
                    fontSize: (type === 'text' || type === 'hotspot') ? 16 : undefined,
                    textAlign: (type === 'text' || type === 'hotspot') ? 'center' : undefined,
                  };
                  const afterElements = [...visualElements, newElement];
                  setVisualElements(afterElements);
                  setSelectedElementIds([newElement.id]);
                  setHasChanges(true);

                  // For panorama beats, also create a corresponding PanoramaHotspot entry
                  if (isPanorama) {
                    const params = beat.getParameters ? beat.getParameters() : {};
                    const existingHotspots = params.hotspots || [];
                    const xCenter = newElement.x + newElement.width / 2;
                    const yCenter = newElement.y + newElement.height / 2;
                    const { yaw, pitch } = stageToYawPitch(xCenter, yCenter, panoramaProjectionType, stageWidth, stageHeight, panoramaImageAspect);
                    const newHotspot = {
                      id: elementId,
                      pitch: Math.round(pitch * 10) / 10,
                      yaw: Math.round(yaw * 10) / 10,
                      text: newElement.name,
                      target: '',
                    };
                    beat.updateParameters({ hotspots: [...existingHotspots, newHotspot] });
                  }

                  // Commit add for undo
                  const cmd = new VisualElementsSnapshotCommand(
                    beforeSnapshot, afterElements.map(el => ({ ...el })),
                    applyElements, `Add ${type}`
                  );
                  getCommandManager().pushWithoutExecute(cmd);
                }}
                onElementReorder={(elementId, direction) => {
                  const beforeSnapshot = visualElements.map(el => ({ ...el }));
                  const sortedElements = [...visualElements].sort((a, b) => b.z - a.z);
                  const index = sortedElements.findIndex(el => el.id === elementId);
                  if (index === -1) return;

                  let reordered = false;
                  let updatedElements: VisualElement[] = visualElements;
                  if (direction === 'up' && index > 0) {
                    // Swap z values
                    const currentZ = sortedElements[index].z;
                    const targetZ = sortedElements[index - 1].z;
                    updatedElements = visualElements.map(el => {
                      if (el.id === elementId) return { ...el, z: targetZ };
                      if (el.id === sortedElements[index - 1].id) return { ...el, z: currentZ };
                      return el;
                    });
                    setVisualElements(updatedElements);
                    setHasChanges(true);
                    reordered = true;
                  } else if (direction === 'down' && index < sortedElements.length - 1) {
                    // Swap z values
                    const currentZ = sortedElements[index].z;
                    const targetZ = sortedElements[index + 1].z;
                    updatedElements = visualElements.map(el => {
                      if (el.id === elementId) return { ...el, z: targetZ };
                      if (el.id === sortedElements[index + 1].id) return { ...el, z: currentZ };
                      return el;
                    });
                    setVisualElements(updatedElements);
                    setHasChanges(true);
                    reordered = true;
                  }

                  // Sync z-order changes to beat.locations immediately
                  // (component remounts on beat change, so auto-save on unmount won't help)
                  if (reordered && beat) {
                    syncElementsToBeatLocations(updatedElements, beat);
                  }

                  // Commit reorder for undo (use timeout to capture state after React update)
                  if (reordered) {
                    window.setTimeout(() => {
                      const cmd = new VisualElementsSnapshotCommand(
                        beforeSnapshot,
                        visualElementsRef.current.map(el => ({ ...el })),
                        applyElements,
                        'Reorder elements'
                      );
                      getCommandManager().pushWithoutExecute(cmd);
                    }, 0);
                  }
                }}
                assets={assets}
                stageWidth={projectSettings?.width || 1024}
                stageHeight={projectSettings?.height || 768}
                beatType={beat.type}
                beatName={beat.name}
                beatParams={beat.getParameters?.() ?? {}}
                onSelectAsset={onAssetSelect}
                onOpenCharacterManager={onOpenCharacterManager}
                characters={characters}
                globalSettings={globalSettings}
                beatTransition={beat.transition}
                onBeatTransitionChange={onBeatUpdate ? (transition) => {
                  onBeatUpdate(beat.id, { transition });
                  setHasChanges(true);
                } : undefined}
                presentationMode={(beat.type === 'dialogTree' || beat.type === 'aiDialogTree') ? ((beat as any).presentationMode || 'positioned') : undefined}
                onPresentationModeChange={(beat.type === 'dialogTree' || beat.type === 'aiDialogTree') && onBeatUpdate ? (mode) => {
                  (beat as any).presentationMode = mode;
                  onBeatUpdate(beat.id, { presentationMode: mode } as any);
                  setHasChanges(true);
                } : undefined}
                showAvatars={(beat.type === 'dialogTree' || beat.type === 'aiDialogTree') ? ((beat as any).showAvatars ?? true) : undefined}
                onShowAvatarsChange={(beat.type === 'dialogTree' || beat.type === 'aiDialogTree') && onBeatUpdate ? (show) => {
                  (beat as any).showAvatars = show;
                  onBeatUpdate(beat.id, { showAvatars: show } as any);
                  setHasChanges(true);
                } : undefined}
                responseDelay={(beat.type === 'dialogTree' || beat.type === 'aiDialogTree') ? ((beat as any).responseDelay ?? 1.5) : undefined}
                onResponseDelayChange={(beat.type === 'dialogTree' || beat.type === 'aiDialogTree') && onBeatUpdate ? (delay) => {
                  (beat as any).responseDelay = delay;
                  onBeatUpdate(beat.id, { responseDelay: delay } as any);
                  setHasChanges(true);
                } : undefined}
                layoutTemplate={(() => {
                  // multiChoice: only when project is responsive (the picker
                  // doesn't apply in fixed mode). dialogTree/aiDialogTree:
                  // always — its templates include chat-scroll/chat-bubble
                  // which work regardless of project layout mode (they
                  // bypass the absolute path at runtime).
                  if (beat.type === 'multiChoice' && projectIsResponsive) {
                    return (beat as any).layoutTemplate || 'stacked';
                  }
                  if (beat.type === 'dialogTree' || beat.type === 'aiDialogTree') {
                    return (beat as any).layoutTemplate || 'stacked';
                  }
                  return undefined;
                })()}
                onLayoutTemplateChange={(() => {
                  if (!onBeatUpdate) return undefined;
                  const handler = (template: string) => {
                    (beat as any).layoutTemplate = template;
                    // Keep legacy presentationMode synced for one release so
                    // any reader that still consumes it sees the right value
                    // (DialogTreeBeat updateParameters migrates the other way).
                    if (beat.type === 'dialogTree' || beat.type === 'aiDialogTree') {
                      const legacy = template === 'chat-scroll' || template === 'chat-bubble'
                        ? template
                        : 'positioned';
                      (beat as any).presentationMode = legacy;
                      onBeatUpdate(beat.id, { layoutTemplate: template, presentationMode: legacy } as any);
                    } else {
                      onBeatUpdate(beat.id, { layoutTemplate: template } as any);
                    }
                    setHasChanges(true);
                  };
                  if (beat.type === 'multiChoice' && projectIsResponsive) return handler;
                  if (beat.type === 'dialogTree' || beat.type === 'aiDialogTree') return handler;
                  return undefined;
                })()}
                slotIntent={(() => {
                  // Expose slotIntent for any beat type that participates
                  // in slot/spatial layout — the panel's per-slot rows
                  // (Title lines, Pin, Action layout) read/write it.
                  // Falls through to undefined for purely-absolute beats.
                  if (beat.type === 'multiChoice' && projectIsResponsive) {
                    return (beat as any).slotIntent as Record<string, any> | undefined;
                  }
                  if (beat.type === 'dialogTree' || beat.type === 'aiDialogTree') {
                    return (beat as any).slotIntent as Record<string, any> | undefined;
                  }
                  if (projectIsResponsive && (isSlotModeBeatType(beat.type) || isSpatialModeBeatType(beat.type))) {
                    return (beat as any).slotIntent as Record<string, any> | undefined;
                  }
                  return undefined;
                })()}
                onSlotIntentChange={(() => {
                  if (!onBeatUpdate) return undefined;
                  const handler = (nextIntent: Record<string, any>) => {
                    (beat as any).slotIntent = nextIntent;
                    onBeatUpdate(beat.id, { slotIntent: nextIntent } as any);
                    setHasChanges(true);
                  };
                  if (beat.type === 'multiChoice' && projectIsResponsive) return handler;
                  if (beat.type === 'dialogTree' || beat.type === 'aiDialogTree') return handler;
                  if (projectIsResponsive && (isSlotModeBeatType(beat.type) || isSpatialModeBeatType(beat.type))) return handler;
                  return undefined;
                })()}
                slotResolutions={slotResolutions}
                expandedSlotKey={expandedSlotKey}
                onExpandedSlotKeyChange={(next) => {
                  setExpandedSlotKey(next);
                  // Selection is exclusive — expanding a slot row clears
                  // any selected free-positioned element.
                  if (next) setSelectedElementIds([]);
                }}
                spatialFit={
                  beat.type === 'titleScreen' ||
                  beat.type === 'movementChoice' ||
                  beat.type === 'pickProp' ||
                  beat.type === 'dialogTree'
                    ? ((beat as any).spatialFit as 'contain' | 'cover' | undefined)
                    : undefined
                }
                onSpatialFitChange={
                  (beat.type === 'titleScreen' ||
                    beat.type === 'movementChoice' ||
                    beat.type === 'pickProp' ||
                    beat.type === 'dialogTree') && onBeatUpdate
                    ? (fit) => {
                        (beat as any).spatialFit = fit;
                        onBeatUpdate(beat.id, { spatialFit: fit } as any);
                        setHasChanges(true);
                      }
                    : undefined
                }
                allBeats={beat.type === 'panorama' ? beats.map(b => ({ id: b.id, name: b.name, type: b.type })) : undefined}
                panoramaHotspots={beat.type === 'panorama' ? (() => {
                  const params = beat.getParameters ? beat.getParameters() : {};
                  const hotspots: any[] = params.hotspots || [];
                  const stageW = projectSettings?.width || 1024;
                  const stageH = projectSettings?.height || 768;
                  // Compute pitch/yaw from current element positions
                  return hotspots.map((hs: any) => {
                    const el = visualElements.find(e => e.id === hs.id) ||
                               visualElements.find(e => e.type === 'hotspot' && e.name === hs.text);
                    if (el) {
                      const xCenter = el.x + el.width / 2;
                      const yCenter = el.y + el.height / 2;
                      const { yaw, pitch } = stageToYawPitch(xCenter, yCenter, panoramaProjectionType, stageW, stageH, panoramaImageAspect);
                      return {
                        ...hs,
                        pitch: Math.round(pitch * 10) / 10,
                        yaw: Math.round(yaw * 10) / 10,
                      };
                    }
                    return hs;
                  });
                })() : undefined}
                onPanoramaHotspotUpdate={beat.type === 'panorama' ? (id, updates) => {
                  const params = beat.getParameters ? beat.getParameters() : {};
                  const hotspots = (params.hotspots || []).map((hs: any) =>
                    hs.id === id ? { ...hs, ...updates } : hs
                  );
                  beat.updateParameters({ hotspots });
                  if (onBeatUpdate) {
                    onBeatUpdate(beat.id, { parameters: { ...beat.getParameters(), hotspots } } as any);
                  }
                  // If yaw or pitch changed, reposition the visual element on stage
                  if ('yaw' in updates || 'pitch' in updates) {
                    const updatedHs = hotspots.find((hs: any) => hs.id === id);
                    if (updatedHs) {
                      const stageW = projectSettings?.width || 1024;
                      const stageH = projectSettings?.height || 768;
                      const projType = params.projectionType || 'equirectangular';
                      const imgAspect = params.imageAspectRatio ?? panoramaImageAspect;
                      const { centerX, centerY } = yawPitchToStage(updatedHs.yaw, updatedHs.pitch, projType, stageW, stageH, imgAspect);
                      const el = visualElements.find(e => e.id === id);
                      if (el) {
                        const newX = centerX - el.width / 2;
                        const newY = centerY - el.height / 2;
                        setVisualElements(prev => prev.map(e =>
                          e.id === id ? { ...e, x: newX, y: newY } : e
                        ));
                      }
                    }
                  }
                  setHasChanges(true);
                } : undefined}
                panoramaSettings={isPanoramaBeat ? {
                  initialPitch: Number.isFinite(beat.getParameters().initialPitch) ? beat.getParameters().initialPitch : 0,
                  initialYaw: Number.isFinite(beat.getParameters().initialYaw) ? beat.getParameters().initialYaw : 0,
                  hfov: Number.isFinite(beat.getParameters().hfov) ? beat.getParameters().hfov : 75,
                  minHfov: Number.isFinite(beat.getParameters().minHfov) ? beat.getParameters().minHfov : 30,
                  maxHfov: Number.isFinite(beat.getParameters().maxHfov) ? beat.getParameters().maxHfov : 120,
                  zoomSpeed: Number.isFinite(beat.getParameters().zoomSpeed) ? beat.getParameters().zoomSpeed : 1.0,
                  promptDisplay: beat.getParameters().promptDisplay ?? (beat as any).parameters?.promptDisplay ?? 'static',
                  projectionType: beat.getParameters().projectionType || 'equirectangular',
                } : undefined}
                onPanoramaCameraChange={isPanoramaBeat ? (settings) => {
                  beat.updateParameters(settings);
                  if (onBeatUpdate) {
                    onBeatUpdate(beat.id, { parameters: { ...beat.getParameters(), ...settings } } as any);
                  }
                } : undefined}
                onPromptDisplayChange={isPanoramaBeat ? (display) => {
                  beat.updateParameters({ promptDisplay: display });
                  if (onBeatUpdate) {
                    onBeatUpdate(beat.id, { parameters: { ...beat.getParameters(), promptDisplay: display } } as any);
                  }
                  // When switching to pinned mode, reposition prompt element near camera center
                  // so the user can find it easily instead of hunting for it off-screen
                  if (display === 'pinned') {
                    const params = beat.getParameters();
                    const stW = projectSettings?.width || 1024;
                    const stH = projectSettings?.height || 768;
                    const iYaw = params.initialYaw ?? 0;
                    const iPitch = params.initialPitch ?? 0;
                    const hfovVal = params.hfov ?? 75;
                    const projT = params.projectionType || 'equirectangular';
                    const imgA = panoramaImageAspect;
                    const vfov = hfovVal / (stW / stH);
                    const promptYaw = iYaw;
                    const promptPitch = iPitch - vfov * 0.35;
                    const { centerX: cx, centerY: cy } = yawPitchToStage(promptYaw, promptPitch, projT, stW, stH, imgA);
                    setVisualElements(prev => prev.map(el => {
                      if (el.type !== 'text' && el.type !== 'dialog') return el;
                      return { ...el, x: Math.round(cx - el.width / 2), y: Math.round(cy - el.height / 2) };
                    }));
                  }
                  setHasChanges(true);
                } : undefined}
                videoAssetId={beat?.type === 'videoBeat' ? beat.getParameters().videoAssetId : undefined}
                videoSettings={beat?.type === 'videoBeat' ? {
                  autoplay: beat.getParameters().autoplay ?? true,
                  controls: beat.getParameters().controls ?? true,
                  skipButton: beat.getParameters().skipButton ?? true,
                } : undefined}
                onSelectVideo={beat?.type === 'videoBeat' ? () => {
                  handleAssetSelection('video', (asset) => {
                    beat.updateParameters({ videoAssetId: asset.id, videoFile: asset.url });
                    if (onBeatUpdate) {
                      onBeatUpdate(beat.id, { parameters: beat.getParameters() } as any);
                    }
                    setHasChanges(true);
                  });
                } : undefined}
                onVideoSettingsChange={beat?.type === 'videoBeat' ? (settings) => {
                  beat.updateParameters(settings);
                  if (onBeatUpdate) {
                    onBeatUpdate(beat.id, { parameters: beat.getParameters() } as any);
                  }
                  setHasChanges(true);
                } : undefined}
                onProjectionTypeChange={isPanoramaBeat ? (type) => {
                  beat.updateParameters({ projectionType: type });
                  setHasChanges(true);
                  if (onBeatUpdate) {
                    onBeatUpdate(beat.id, { parameters: { ...beat.getParameters(), projectionType: type } } as any);
                  }
                } : undefined}
              />
            )}

            {activeTab === 'animations' && (
              <AnimationPanel
                layoutMode={
                  // QA-flagged: schema-type-only detection missed the
                  // data-driven spatial mode used by movementChoice /
                  // pickProp / dialogTree (they opt in per-instance via
                  // hotspot, without setting layoutMode:'spatial' at the
                  // type level). Reuse the same isSpatialPreview /
                  // isSlotPreview flags that the canvas preview branch
                  // uses, so the SlotAnimationsEditor shows up for
                  // hotspot-mode beats too instead of the legacy
                  // path-keyframe editor.
                  isSpatialPreview
                    ? 'spatial'
                    : isSlotPreview
                      ? 'slot'
                      : 'absolute'
                }
                animations={animations}
                elements={visualElements}
                stageWidth={projectSettings?.width || 1024}
                stageHeight={projectSettings?.height || 768}
                backgroundUrl={
                  // Prioritize asset lookup (fresh URL) over direct URL (may be stale blob URL)
                  (backgroundAssetId && assets
                    ? assets.find(a => a.id === backgroundAssetId)?.url
                    : undefined) || backgroundUrl
                }
                characters={characters}
                onAnimationsChange={(newAnimations) => {
                  setAnimations(newAnimations);
                  setHasChanges(true);
                  // CRITICAL: Sync to beat.animations immediately so preview has latest animations
                  if (beat) {
                    beat.animations = newAnimations;
                    console.log(`[VisualWorkspace] Animations immediately synced to beat:`, newAnimations.length, newAnimations);
                  }
                }}
                beatType={beat?.type}
                slotAnimations={
                  (beat?.getParameters?.()?.slotAnimations as SlotAnimations | undefined) ?? undefined
                }
                onSlotAnimationsChange={onSlotAnimationsChange}
                spatialAnimations={
                  (beat?.getParameters?.()?.spatialAnimations as SpatialAnimations | undefined) ?? undefined
                }
                onSpatialAnimationsChange={onSpatialAnimationsChange}
                projectLayoutMode={resolveLayoutMode(
                  globalSettings as any,
                  beats as any
                )}
              />
            )}
          </div>
          </>
        </div>
      )}

      {/* Canvas column — wraps the breadcrumb bar (above) + the canvas
          (below) in a flex column so the breadcrumb stretches the full
          canvas width without breaking the outer flex-row layout. */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* DialogTree breadcrumb — above the canvas, full width. Replaces
            the legacy left-side "Dialog Phases" panel. Always visible for
            dialogTree beats (shows "Root" at empty path); each segment is
            a clickable button that truncates the path back to that depth.
            Walks go through dialogTreeNodePath, which also drives the
            Inspector's tree highlight via the asaps:dialogTreeWalkChanged
            event — so clicking here keeps the Inspector in sync. */}
        {(beat?.type === 'dialogTree' || beat?.type === 'aiDialogTree') && (() => {
          const tree = (beat?.getParameters?.() as any)?.dialogTree;
          const labels: Array<{ idx: number; label: string }> = [];
          let cur = tree;
          for (let i = 0; i < dialogTreeNodePath.length; i++) {
            const id = dialogTreeNodePath[i];
            const choice = (cur?.choices ?? []).find((c: any) => c?.id === id);
            if (!choice) break;
            labels.push({ idx: i, label: choice.text || choice.id });
            cur = choice.dialogNode;
          }
          return (
            <div className="shrink-0 flex items-center gap-2 px-5 py-3 bg-gradient-to-b from-slate-50 to-slate-100 border-b-2 border-slate-300 text-base overflow-x-auto shadow-sm">
              <MessageSquare className="w-5 h-5 text-slate-500 shrink-0" />
              <span className="text-slate-600 text-sm font-semibold uppercase tracking-wide mr-2 shrink-0">Dialog path</span>
              <button
                type="button"
                onClick={() => setDialogTreeNodePath([])}
                className={`px-3 py-1.5 rounded-md transition-colors font-medium ${
                  labels.length === 0
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-white text-slate-700 border border-slate-300 hover:bg-blue-50 hover:border-blue-400 hover:text-blue-700'
                }`}
                title="Back to root node"
              >
                Root
              </button>
              {labels.map((seg, i) => {
                const isCurrent = i === labels.length - 1;
                return (
                  <React.Fragment key={seg.idx}>
                    <span className="text-slate-400 text-lg select-none">›</span>
                    <button
                      type="button"
                      onClick={() => setDialogTreeNodePath(prev => prev.slice(0, seg.idx + 1))}
                      className={`px-3 py-1.5 rounded-md transition-colors font-medium truncate max-w-[260px] ${
                        isCurrent
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'bg-white text-slate-700 border border-slate-300 hover:bg-blue-50 hover:border-blue-400 hover:text-blue-700'
                      }`}
                      title={seg.label}
                    >
                      {seg.label}
                    </button>
                  </React.Fragment>
                );
              })}
              {labels.length === 0 && (
                <span className="text-slate-500 text-sm ml-2 italic">click a choice on the canvas to step in, or use the Inspector tree</span>
              )}
            </div>
          );
        })()}

        {/* Main Visual Editor Canvas */}
        <div className="flex-1 overflow-hidden relative">
        {isPanoramaBeat ? (
          /* Panorama Preview Mode: PSV interactive 360° viewer */
          <PanoramaPreviewSection
            key={`psv-section-${psvMountKey}`}
            beat={beat}
            panoramaResolvedUrl={panoramaResolvedUrl}
            panoramaProjectionType={panoramaProjectionType}
            panoramaImageAspect={panoramaImageAspect}
            panoramaHotspots={panoramaHotspots}
            visualElements={visualElements}
            selectedElementId={selectedElementId}
            projectSettings={projectSettings}
            globalSettings={globalSettings}
            panoramaPreviewContainerRef={panoramaPreviewContainerRef}
            panoramaPreviewWidth={panoramaPreviewWidth}
            setPanoramaPreviewWidth={setPanoramaPreviewWidth}
            psvViewerRef={psvViewerRef}
            psvMarkersRef={psvMarkersRef}
            panoramaReadyRef={panoramaReadyRef}
            panoramaUserInteractingRef={panoramaUserInteractingRef}
            panoramaViewChangingRef={panoramaViewChangingRef}
            livePanoCamRef={livePanoCamRef}
            previewDragRef={previewDragRef}
            setHasChanges={setHasChanges}
            onBeatUpdate={onBeatUpdate}
            setSelectedElementIds={setSelectedElementIds}
            handlePreviewPointerDown={handlePreviewPointerDown}
            handlePreviewPointerMove={handlePreviewPointerMove}
            handlePreviewPointerUp={handlePreviewPointerUp}
            handlePreviewResizeDown={handlePreviewResizeDown}
          />
        ) : isSlotPreview && slotSpec && slotPreviewContent ? (
          /* Responsive slot-mode: faithful read-only SlotFlowView preview at
             a selectable simulated viewport, with override-visibility badges.
             Still never wires onElementsChange/syncElementsToBeatLocations,
             so the beat cannot bake locations[] and silently leave slot mode
             (the no-bake guard). Draggable intent handles = next increment. */
          (() => {
            const selVp =
              SLOT_PREVIEW_VIEWPORTS.find(v => v.id === slotPreviewViewportId) ??
              SLOT_PREVIEW_VIEWPORTS[2];
            // Fixed device rect vs the "Editor" preset (fills the area).
            const isFixed = selVp.width != null && selVp.height != null;
            // Project orientation policy → preview consequence. Phone/Tablet
            // are orientation-variable; locked policy forces it, flexible
            // uses the preview-only toggle. Authored = the design canvas and
            // Desktop is inherently wide — both orientation-neutral.
            const orientPolicy: 'flexible' | 'portrait' | 'landscape' =
              (globalSettings?.project?.orientation as any) ?? 'flexible';
            const effOrient: 'portrait' | 'landscape' =
              orientPolicy === 'flexible' ? slotPreviewOrient : orientPolicy;
            const orientable = selVp.id === 'phone' || selVp.id === 'tablet';
            const rawW = selVp.width ?? 0;
            const rawH = selVp.height ?? 0;
            const lo = Math.min(rawW, rawH);
            const hi = Math.max(rawW, rawH);
            const devW = !isFixed
              ? 0
              : orientable
                ? (effOrient === 'landscape' ? hi : lo)
                : rawW;
            const devH = !isFixed
              ? 0
              : orientable
                ? (effOrient === 'landscape' ? lo : hi)
                : rawH;
            // Available editor area (container minus its p-3 padding).
            const availW = Math.max(0, slotStageSize.w - 24);
            const availH = Math.max(0, slotStageSize.h - 24);
            const fitScale =
              isFixed && availW > 0 && availH > 0
                ? Math.min(availW / devW, availH / devH, 1)
                : 1;
            const exceeds = isFixed && (devW > availW || devH > availH);
            const effScale = !isFixed
              ? 1
              : slotScaleMode === 'one'
                ? 1
                : slotScaleMode === 'fit'
                  ? fitScale
                  : exceeds
                    ? fitScale
                    : 1; // auto
            const scalePct = Math.round(effScale * 100);
            const overridden = slotResolutions.filter(r => !r.applied);
            const allApplied =
              slotResolutions.length > 0 && overridden.length === 0;
            // Friendly label for a slot name. Slot keys are technical
            // ("question", "actions", "text", "title", "speaker") —
            // present them with the same vocabulary the author sees in
            // the picker / inspector.
            const slotLabel = (name: string): string => {
              if (name === 'question') return 'Question';
              if (name === 'text') return 'Dialog';
              if (name === 'actions') return 'Choices';
              if (name === 'title') return 'Title';
              if (name === 'speaker') return 'Speaker';
              if (name === 'body') return 'Body';
              return name.charAt(0).toUpperCase() + name.slice(1);
            };
            // Custom-template collision detection: when two slots are
            // anchored to the same (h, v) zone, the later one renders
            // on top of the other. The renderer doesn't catch this
            // (each slot's absolute placement is independent), so we
            // surface it from the editor side — read straight from
            // slotIntent at the current viewport.
            const customCollisions: Array<{ zone: string; slots: string[] }> = (() => {
              if (beatLayoutTemplate !== 'custom') return [];
              const intent = (slotPreviewParams?.slotIntent ?? {}) as Record<string, any>;
              const byZone: Record<string, string[]> = {};
              for (const [name, entry] of Object.entries(intent)) {
                const a = entry?.anchor;
                if (!a || (!a.h && !a.v)) continue;
                const key = `${a.v ?? 'middle'}-${a.h ?? 'center'}`;
                (byZone[key] ??= []).push(name);
              }
              return Object.entries(byZone)
                .filter(([, names]) => names.length > 1)
                .map(([zone, slots]) => ({ zone, slots }));
            })();
            // Slot-intent control panel (3d-2): title preferredLines + the
            // action slot's anchor. Slot names come from the schema spec so
            // we target the right keys in slotIntent.
            const titleSlotName = slotSpec!.find(s => s.role === 'title')?.name;
            const actionSlotSpec = slotSpec!.find(s => s.role === 'action');
            const actionSlotName = actionSlotSpec?.name;
            const curIntent = (slotPreviewParams?.slotIntent ?? {}) as Record<string, any>;
            const titleLines: number | undefined =
              titleSlotName ? curIntent[titleSlotName]?.preferredLines : undefined;
            const actionAnchor = (actionSlotName ? curIntent[actionSlotName]?.anchor : undefined) ?? {};
            const anchorMode: 'bottom' | 'belowBody' =
              actionAnchor.relativeTo === 'element' ? 'belowBody' : 'bottom';
            const anchorH: 'left' | 'center' | 'right' = actionAnchor.h ?? 'center';
            const anchorGap: number =
              typeof actionAnchor.gap === 'number' ? actionAnchor.gap : 16;
            const setTitleLines = (n: number | null) =>
              onSlotIntentChange(titleSlotName!, n == null ? { preferredLines: undefined } : { preferredLines: n });
            const setAnchor = (patch: Record<string, any>) => {
              const nextAnchor =
                patch.__mode === 'bottom'
                  ? { h: anchorH, v: 'bottom' as const, relativeTo: 'stage' as const, gap: anchorGap }
                  : patch.__mode === 'belowBody'
                    ? { h: anchorH, relativeTo: 'element' as const, relativeElementId: 'body', edge: 'below' as const, gap: anchorGap }
                    : {
                        ...(anchorMode === 'belowBody'
                          ? { relativeTo: 'element' as const, relativeElementId: 'body', edge: 'below' as const }
                          : { v: 'bottom' as const, relativeTo: 'stage' as const }),
                        h: anchorH,
                        gap: anchorGap,
                        ...patch,
                      };
              onSlotIntentChange(actionSlotName!, { anchor: nextAnchor });
            };
            // Per-button anchor authoring. The action schema lists the
            // catalogue of button ids (continueButton / restartButton /
            // creditsButton); each beat instance only shows those its
            // content opts in. Without overrides, all visible buttons live
            // in the shared flex row above; pinning one lifts JUST that
            // button onto an absolute anchor against the stage so designs
            // like "Credits in the corner, Restart centered" work without
            // splitting beats.
            const actionButtonIds: string[] = actionSlotSpec?.buttons ?? [];
            const buttonAnchors = (actionSlotName
              ? (curIntent[actionSlotName]?.buttonAnchors as Record<string, any> | undefined)
              : undefined) ?? {};
            const visibleActionButtonIds = actionButtonIds.filter(id => {
              if (id === 'continueButton') return true;
              if (id === 'restartButton') return (slotPreviewParams as any)?.showRestart !== false;
              if (id === 'creditsButton') return (slotPreviewParams as any)?.showCredits === true;
              return true;
            });
            const setButtonAnchor = (buttonId: string, patch: Record<string, any> | null) => {
              if (!actionSlotName) return;
              const nextAnchors = { ...buttonAnchors };
              if (patch === null) {
                delete nextAnchors[buttonId];
              } else {
                const cur = nextAnchors[buttonId] ?? { h: 'center', v: 'bottom', relativeTo: 'stage', gap: 16 };
                nextAnchors[buttonId] = { ...cur, ...patch };
              }
              onSlotIntentChange(actionSlotName, {
                buttonAnchors: Object.keys(nextAnchors).length > 0 ? nextAnchors : undefined,
              });
            };
            // 3d-4 — live gap while dragging the action grip (uncommitted).
            const liveGap = slotGapDrag ? slotGapDrag.gap : anchorGap;
            // Drag-to-snap live preview: while the author drags a slot,
            // splice the current snap zone into the slot's anchor so
            // SlotFlowView re-renders the slot at the prospective new
            // position on every pointer move. Release commits via
            // onSlotIntentChange (no double-write here).
            const dragLivePatch: Record<string, any> = {};
            if (slotDrag) {
              const sx = slotDrag.pointerX - slotDrag.stageRect.left;
              const sy = slotDrag.pointerY - slotDrag.stageRect.top;
              const { h: dh, v: dv } = snapPointerToZone(sx, sy, slotDrag.stageRect);
              dragLivePatch[slotDrag.slotName] = {
                ...(curIntent[slotDrag.slotName] ?? {}),
                anchor: { h: dh, v: dv },
              };
            }
            const baseIntent =
              slotGapDrag && actionSlotName
                ? {
                    ...curIntent,
                    [actionSlotName]: {
                      ...(curIntent[actionSlotName] ?? {}),
                      anchor: {
                        ...(anchorMode === 'belowBody'
                          ? { relativeTo: 'element', relativeElementId: 'body', edge: 'below' }
                          : { v: 'bottom', relativeTo: 'stage' }),
                        h: anchorH,
                        gap: liveGap,
                      },
                    },
                  }
                : (slotPreviewParams?.slotIntent ?? curIntent);
            const previewSlotIntent = slotDrag
              ? { ...baseIntent, ...dragLivePatch }
              : baseIntent;
            // The faithful preview contents — defined once, hosted by either
            // the scaled fixed-device rect or the editor-fill wrapper.
            // P3-3c-12 — breadcrumb of the current dialogTree node path.
            // Each segment is the choice id whose dialogNode we descended
            // into; resolve labels by re-walking the tree so a rename
            // updates them automatically. Click a segment to step back
            // up to that depth (root = path index -1).
            // Breadcrumb has moved out of the canvas overlay to its
            // own full-width bar above the canvas — see the section
            // just before the canvas div.
            const previewInner = (
              <>
                {slotPreviewUsesSample && (
                  <div className="absolute top-1.5 left-1/2 -translate-x-1/2 z-10 px-2 py-0.5 rounded bg-amber-400/90 text-black text-[10px] font-medium pointer-events-none">
                    Sample body — replaced by generated content at runtime
                  </div>
                )}
                {/* Breadcrumb moved out to a full-width bar above the
                    canvas — see the section before the canvas div. */}
                {isSpatialPreview ? (
                  <>
                    <SpatialFlowView
                      key={`spatprev-${beat!.id}-${selVp.id}-${animReplayTick}-${dialogTreeNodePath.join('.')}`}
                      beatType={beat!.type}
                      spatial={{
                        source: 'background',
                        // Bug 26 — per-beat fit override. The beat
                        // can opt 'cover' over the schema's default
                        // 'contain' (and vice-versa). Falls back to
                        // schema default when unset.
                        fit: ((slotPreviewParams as any)?.spatialFit === 'contain'
                          || (slotPreviewParams as any)?.spatialFit === 'cover'
                          ? (slotPreviewParams as any).spatialFit
                          : getSpatialSpec(beat!.type)?.fit) ?? 'contain',
                        slots: slotSpec!,
                      }}
                      content={slotPreviewContent}
                      theme={renderTheme ?? undefined}
                      imageUrl={
                        // Prioritize asset lookup (fresh URL) over the
                        // backgroundUrl state, which can lag or hold an
                        // ASML-import-only direct URL. Matches the
                        // AnimationPanel resolution.
                        ((backgroundAssetId && assets
                          ? assets.find(a => a.id === backgroundAssetId)?.url
                          : undefined) || backgroundUrl) || null
                      }
                      imageVariants={(() => {
                        // Phase 3.3 — pair the background asset's
                        // variants (assetId + orientation/deviceClass
                        // constraints) with each target asset's URL
                        // so SpatialFlowView can pick the best match
                        // at render time without needing the full
                        // asset list.
                        if (!backgroundAssetId || !assets) return undefined;
                        const base = assets.find(a => a.id === backgroundAssetId);
                        const vs = (base as any)?.variants as
                          | ReadonlyArray<{ assetId: string; orientation?: 'portrait' | 'landscape'; deviceClass?: 'phone' | 'tablet' | 'desktop' }>
                          | undefined;
                        if (!vs || vs.length === 0) return undefined;
                        return vs
                          .map(v => {
                            const target = assets.find(a => a.id === v.assetId);
                            return target ? { ...v, url: target.url } : null;
                          })
                          .filter((v): v is { assetId: string; orientation?: 'portrait' | 'landscape'; deviceClass?: 'phone' | 'tablet' | 'desktop'; url: string } => !!v);
                      })()}
                      backgroundColor={renderTheme?.backgroundColor || 'linear-gradient(to bottom, #1e3a8a, #1e40af)'}
                      slotIntent={previewSlotIntent}
                      slotAnimations={
                        (slotPreviewParams?.slotAnimations as SlotAnimations | undefined) ?? undefined
                      }
                      spatialAnimations={
                        (slotPreviewParams?.spatialAnimations as SpatialAnimations | undefined) ?? undefined
                      }
                      hotspots={undefined /* P3-3c-3: HotspotEditOverlay below
                        renders the interactive hotspots in the editor;
                        SpatialFlowView would otherwise double-render the
                        runtime button layer and intercept clicks. */}
                      previewWidth={isFixed ? devW : undefined}
                      previewCoarse={selVp.coarse}
                      onResolve={(res) =>
                        setSlotResolutions(prev =>
                          prev.length === res.length &&
                          prev.every(
                            (p, i) =>
                              p.slot === res[i].slot &&
                              p.applied === res[i].applied &&
                              p.overrideReason === res[i].overrideReason
                          )
                            ? prev
                            : res
                        )
                      }
                      onAction={() => { /* read-only preview */ }}
                      // Free-positioned character/prop locations from the
                      // beat. SpatialFlowView renders these as a sprite
                      // layer on top of the background. Mirrors the
                      // runtime wiring in ReactRenderer (pickFreePositioned).
                      // beat.locations is a Map<string, Location>, not an
                      // array — iterate values.
                      characterLocations={(() => {
                        const locsMap = (beat as any)?.locations as Map<string, any> | any[] | undefined;
                        if (!locsMap) return undefined;
                        const list: any[] = Array.isArray(locsMap)
                          ? locsMap
                          : (typeof locsMap.values === 'function' ? Array.from(locsMap.values()) : []);
                        const out = list.filter(l => l?.kind === 'character' || l?.kind === 'prop');
                        return out.length > 0 ? out : undefined;
                      })()}
                      // Resolve a character's current image URL by id/state.
                      // Falls through state.visual.image → defaultImage →
                      // spritesheet, same chain the panel uses.
                      characterResolver={(characterId: string, stateId?: string) => {
                        const ch = characters.find(c => c.id === characterId);
                        if (!ch) return undefined;
                        const st = ch.states?.find(s => s.id === (stateId || ch.defaultState)) ?? null;
                        return resolveCharacterImageUrl(
                          st,
                          ch.visual?.defaultImage,
                          assets,
                          ch.visual?.spriteSheet,
                        );
                      }}
                      // Provide sprite metadata so the renderer can crop the
                      // spritesheet to a single frame (otherwise it draws the
                      // whole tiled sheet). Mirrors ReactRenderer.spriteDataResolver.
                      spriteDataResolver={(characterId: string) => {
                        const ch = characters.find(c => c.id === characterId);
                        const ss = ch?.visual?.spriteSheet;
                        if (!ss || !ss.frameWidth || !ss.frameHeight) return null;
                        return {
                          frameWidth: ss.frameWidth,
                          frameHeight: ss.frameHeight,
                          imageWidth: ss.imageWidth,
                          animations: ss.animations,
                        };
                      }}
                      // Editor selection: clicking a sprite OR slot
                      // content on the stage selects the matching row
                      // in the left panel + highlights the clicked
                      // thing in yellow.
                      editorMode={true}
                      selectedElementName={(() => {
                        if (selectedElementIds.length !== 1) return undefined;
                        const el = visualElements.find(e => e.id === selectedElementIds[0]);
                        return el?.name;
                      })()}
                      onElementSelect={(locationName) => {
                        const el = visualElements.find(e => e.name === locationName);
                        if (el) setSelectedElementIds([el.id]);
                        // Clear slot expansion so the user's attention
                        // moves to the sprite they just clicked.
                        setExpandedSlotKey(null);
                      }}
                      selectedSlotKey={expandedSlotKey ?? undefined}
                      onSlotSelect={(slotName, buttonId) => {
                        const key = buttonId
                          ? `slot:${slotName}:${buttonId}`
                          : `slot:${slotName}`;
                        setExpandedSlotKey(prev => prev === key ? null : key);
                        // Clear free-positioned selection so only one
                        // thing is highlighted at a time.
                        setSelectedElementIds([]);
                      }}
                    />
                    {/* P3-3c-3 — interactive hotspot editor overlay. Only for
                        movementChoice in spatial mode; sits above the read-only
                        SpatialFlowView, intercepts pointer events to drag-move
                        and corner-resize each hotspot. */}
                    {isHotspotChoicePreview && (() => {
                      const items = hotspotAccessor && slotPreviewParams
                        ? hotspotAccessor.read(slotPreviewParams)
                        : [];
                      // P3-3c-12 — dialogTree: which choices can step in?
                      // Any whose `dialogNode` exists. Pass as a Set so the
                      // overlay can render the "Step in →" badge per
                      // hotspot. movementChoice/pickProp omit the prop.
                      const stepIntoIds = beat?.type === 'dialogTree'
                        ? new Set<string>(
                            items
                              .filter((c: any) => c?.hotspot && c?.dialogNode)
                              .map((c: any) => c.id)
                          )
                        : undefined;
                      return (
                        <HotspotEditOverlay
                          imageUrl={
                        // Prioritize asset lookup (fresh URL) over the
                        // backgroundUrl state, which can lag or hold an
                        // ASML-import-only direct URL. Matches the
                        // AnimationPanel resolution.
                        ((backgroundAssetId && assets
                          ? assets.find(a => a.id === backgroundAssetId)?.url
                          : undefined) || backgroundUrl) || null
                      }
                          fit={getSpatialSpec(beat!.type)?.fit ?? 'contain'}
                          hotspots={items
                            .filter((c: any) => c && c.hotspot)
                            .map((c: any) => ({
                              id: c.id,
                              x: c.hotspot.x,
                              y: c.hotspot.y,
                              width: c.hotspot.width,
                              height: c.hotspot.height,
                              shape: c.hotspot.shape,
                              // P3-3e — pass the portrait override
                              // through so the overlay can render the
                              // portrait variant when in portrait
                              // preview, and so drag-start reads the
                              // correct origin rect.
                              portrait: c.hotspot.portrait,
                              label: c.displayText || c.text || c.displayName || c.name,
                            }))}
                          selectedId={selectedHotspotId}
                          onSelect={setSelectedHotspotId}
                          onChange={onHotspotChange}
                          onCreate={onHotspotCreate}
                          onDelete={onHotspotDelete}
                          stepIntoIds={stepIntoIds}
                          onStepInto={beat?.type === 'dialogTree' ? (id) => {
                            setDialogTreeNodePath(prev => [...prev, id]);
                            setSelectedHotspotId(null);
                          } : undefined}
                          // P3-3e — orientation for hotspot routing. For
                          // fixed device presets (Phone/Tablet/Authored/
                          // Desktop) use the ACTUAL stage dimensions —
                          // that's what the runtime sees and what
                          // SpatialFlowView's container measurement
                          // will report. For the editor-fill preset
                          // (no fixed dims) fall back to the
                          // orientation-policy toggle.
                          isPortrait={isFixed ? devH > devW : effOrient === 'portrait'}
                        />
                      );
                    })()}
                  </>
                ) : (() => {
                  // multiChoice chat-* templates render through ChatDialogView
                  // in the responsive slot preview — same component the
                  // runtime uses, so the editor preview matches PW.
                  const lt = beat!.type === 'multiChoice'
                    ? (slotPreviewParams?.layoutTemplate as string | undefined)
                    : undefined;
                  if (lt === 'chat-bubble' || lt === 'chat-scroll') {
                    const speakerName = (slotPreviewContent as any)?.speaker || 'Character';
                    const promptText = (slotPreviewContent as any)?.question
                      || (slotPreviewContent as any)?.text
                      || 'What do you say?';
                    const previewChoices = (() => {
                      const cs = Array.isArray(slotPreviewParams?.choices)
                        ? slotPreviewParams!.choices as Array<{ id: string; text: string }>
                        : [];
                      return cs.length > 0
                        ? cs.map(c => ({ id: c.id, text: c.text || c.id }))
                        : [{ id: '__preview_placeholder__', text: '(Add a choice to preview)' }];
                    })();
                    return (
                      <div style={{ width: '100%', height: '100%', display: 'flex', overflow: 'hidden' }}>
                        <ChatDialogView
                          messages={[{
                            id: 'preview-npc',
                            speaker: speakerName,
                            text: promptText,
                            isPlayer: false,
                          }]}
                          choices={previewChoices}
                          mode={lt as 'chat-scroll' | 'chat-bubble'}
                          theme={renderTheme ?? undefined}
                          backgroundUrl={backgroundUrl || null}
                          backgroundColor={renderTheme?.backgroundColor || 'linear-gradient(to bottom, #1e3a8a, #1e40af)'}
                          onChoiceSelect={() => { /* preview is read-only */ }}
                          responsive
                        />
                      </div>
                    );
                  }
                  return (
                  <SlotFlowView
                    key={`slotprev-${beat!.id}-${selVp.id}-${animReplayTick}`}
                    beatType={beat!.type}
                    slots={slotSpec}
                    content={slotPreviewContent}
                    // Editor preview opts out of the read-gate: at
                    // runtime the action panel hides until the player
                    // has read the body, but in the editor we always
                    // want everything visible (including for slot
                    // drag-to-snap, which needs the panel mounted so
                    // its DOM node can carry pointer handlers). Without
                    // this, the action panel returned null between a
                    // body-text change and the gate firing, leaving
                    // post-step-in dialogTree levels un-draggable.
                    requireFullRead={false}
                    theme={renderTheme ?? undefined}
                    backgroundUrl={backgroundUrl || null}
                    backgroundColor={renderTheme?.backgroundColor || 'linear-gradient(to bottom, #1e3a8a, #1e40af)'}
                    slotIntent={previewSlotIntent}
                    slotAnimations={
                      (slotPreviewParams?.slotAnimations as SlotAnimations | undefined) ?? undefined
                    }
                    dynamicChoices={(beat!.type === 'multiChoice'
                      || ((beat!.type === 'dialogTree' || beat!.type === 'aiDialogTree') && dialogTreeSlotTemplate))
                      ? (() => {
                          // multiChoice stores choices flat; dialogTree
                          // nests them — walk to the current node via
                          // dialogTreeNodePath so stepping into a choice
                          // updates the displayed buttons (and the speaker
                          // + body, which the dialogTree case in
                          // slotPreviewContent already walks to).
                          let rawChoices: any;
                          if (beat!.type === 'multiChoice') {
                            rawChoices = slotPreviewParams?.choices;
                          } else {
                            const curNode = dialogNodeAt(
                              (slotPreviewParams as any)?.dialogTree,
                              dialogTreeNodePath,
                            ) ?? (slotPreviewParams as any)?.dialogTree;
                            rawChoices = curNode?.choices;
                          }
                          const cs = Array.isArray(rawChoices) ? rawChoices as Array<{ id: string; text: string }> : [];
                          return cs.length > 0
                            ? cs.map((c) => ({ id: c.id, text: c.text || c.id }))
                            : [{ id: '__preview_placeholder__', text: '(Add a choice to preview)' }];
                        })()
                      : undefined}
                    layoutTemplate={(beat!.type === 'multiChoice'
                      || beat!.type === 'dialogTree'
                      || beat!.type === 'aiDialogTree')
                      ? ((slotPreviewParams?.layoutTemplate === 'conversation'
                          ? 'conversation'
                          : slotPreviewParams?.layoutTemplate === 'custom'
                            ? 'custom'
                            : 'stacked') as 'stacked' | 'conversation' | 'custom')
                      : undefined}
                    previewWidth={isFixed ? devW : undefined}
                    previewCoarse={selVp.coarse}
                    onResolve={(res) =>
                      setSlotResolutions(prev =>
                        prev.length === res.length &&
                        prev.every(
                          (p, i) =>
                            p.slot === res[i].slot &&
                            p.applied === res[i].applied &&
                            p.overrideReason === res[i].overrideReason
                        )
                          ? prev
                          : res
                      )
                    }
                    onAction={(id?: string) => {
                      // dialogTree: clicking a choice button in the
                      // preview walks the canvas into that choice's
                      // nested dialogNode (if any). Mirrors the spatial
                      // path's Step-in behavior so authors can navigate
                      // the tree from either side. Choices without a
                      // dialogNode are inert (they'd be exits at runtime).
                      if (!id || (beat!.type !== 'dialogTree' && beat!.type !== 'aiDialogTree')) return;
                      const tree = (slotPreviewParams as any)?.dialogTree;
                      const cur = dialogNodeAt(tree, dialogTreeNodePath);
                      const choice = (cur?.choices ?? []).find((c: any) => c?.id === id);
                      if (choice?.dialogNode) {
                        setDialogTreeNodePath(prev => [...prev, id]);
                      }
                    }}
                    editorMode={true}
                    selectedSlotKey={expandedSlotKey ?? undefined}
                    onSlotSelect={(slotName, buttonId) => {
                      const key = buttonId
                        ? `slot:${slotName}:${buttonId}`
                        : `slot:${slotName}`;
                      setExpandedSlotKey(prev => prev === key ? null : key);
                      setSelectedElementIds([]);
                    }}
                  />
                  );
                })()}
                {/* 3d-4 — direct-manipulation gap grip. Delta is divided by
                    the viewport scale so a screen-pixel drag maps to the
                    right number of LOGICAL px even when the rect is
                    fit-scaled. Transient during drag; one commit on release. */}
                {actionSlotName && (
                  <div
                    role="slider"
                    aria-label="Button gap"
                    aria-valuenow={liveGap}
                    title={`Drag to set button gap — ${liveGap}px`}
                    onPointerDown={(e) => {
                      (e.target as HTMLElement).setPointerCapture(e.pointerId);
                      setSlotGapDrag({ startY: e.clientY, startGap: anchorGap, gap: anchorGap });
                    }}
                    onPointerMove={(e) => {
                      setSlotGapDrag(prev =>
                        prev
                          ? {
                              ...prev,
                              gap: Math.max(
                                0,
                                Math.min(
                                  64,
                                  Math.round(
                                    prev.startGap +
                                      (prev.startY - e.clientY) / Math.max(effScale, 0.01)
                                  )
                                )
                              ),
                            }
                          : prev
                      );
                    }}
                    onPointerUp={() => {
                      setSlotGapDrag(prev => {
                        if (prev) {
                          const quantized = Math.max(0, Math.min(64, Math.round(prev.gap / 4) * 4));
                          setAnchor({ gap: quantized });
                        }
                        return null;
                      });
                    }}
                    className={`absolute left-1/2 -translate-x-1/2 z-10 flex items-center justify-center gap-1 px-3 h-5 rounded-full select-none touch-none cursor-ns-resize ${
                      slotGapDrag ? 'bg-blue-500 text-white' : 'bg-white/70 text-black/70 hover:bg-white/90'
                    }`}
                    style={{ bottom: 6 }}
                  >
                    <span className="text-[10px] leading-none font-medium tracking-wide">
                      ⇕ gap {liveGap}px
                    </span>
                  </div>
                )}
                {/* Phase 3.1 — fictional-time HUD preview. The runtime
                    renders the same TimerHudDisplay over the stage
                    (driven by globalSettings.hudOverlays); the editor
                    surfaces it now so authors see WHERE the chip will
                    sit and HOW the initial time renders under the
                    chosen displayFormat. Only mounted when the project
                    has fictional-time enabled + opted-in to the HUD;
                    otherwise the stage stays clean. */}
                {(() => {
                  const overlays = (globalSettings as any)?.hudOverlays ?? {};
                  const ft = overlays.fictionalTime as
                    | {
                        enabled?: boolean;
                        initialTime?: { year: number; month: number; day: number; hour: number; minute: number };
                        displayFormat?: 'time-12h' | 'time-24h' | 'date' | 'datetime-12h' | 'datetime-24h' | 'day-number' | 'year';
                        showInTimerHud?: boolean;
                      }
                    | undefined;
                  if (!ft?.enabled || !ft.showInTimerHud || !ft.initialTime) return null;
                  // Persisted key is `timerHud` (matching the storage shape
                  // in GlobalSettings.hudOverlays). The component prop
                  // type is the same — just the key differs from the
                  // older `timer` shorthand.
                  const timerCfg = overlays.timerHud as TimerHudConfig | undefined;
                  if (!timerCfg?.enabled) return null;
                  const fmt = ft.displayFormat ?? 'datetime-12h';
                  const text = formatEditorFictionalTime(ft.initialTime, fmt);
                  return (
                    <TimerHudDisplay
                      visible
                      config={timerCfg}
                      fictionalTimeText={text}
                    />
                  );
                })()}
              </>
            );
            return (
              <div className="absolute inset-0 flex flex-col bg-neutral-900">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 text-white text-[11px] flex-wrap shrink-0">
                  <span className="opacity-70 mr-1">Responsive (slot mode)</span>
                  <div className="flex rounded overflow-hidden border border-white/20">
                    {SLOT_PREVIEW_VIEWPORTS.map(vp => (
                      <button
                        key={vp.id}
                        type="button"
                        onClick={() => setSlotPreviewViewportId(vp.id)}
                        title={vp.width ? `${vp.width}px${vp.coarse ? ' · touch' : ''}` : 'Fit editor canvas'}
                        className={`px-2 py-0.5 transition-colors ${
                          vp.id === selVp.id
                            ? 'bg-blue-600 text-white'
                            : 'bg-white/5 hover:bg-white/10 text-white/80'
                        }`}
                      >
                        {vp.label}
                        {vp.width ? <span className="opacity-60"> · {vp.width}</span> : null}
                      </button>
                    ))}
                  </div>
                  {isFixed && (
                    <>
                      <div className="flex rounded overflow-hidden border border-white/20">
                        {([
                          ['fit', 'Fit'],
                          ['one', '1:1'],
                        ] as const).map(([m, label]) => {
                          const active =
                            slotScaleMode === m ||
                            (slotScaleMode === 'auto' &&
                              ((m === 'fit' && effScale < 1) || (m === 'one' && effScale === 1)));
                          return (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setSlotScaleMode(m)}
                              title={
                                m === 'fit'
                                  ? 'Shrink the whole device screen to fit — see the full composition + margins'
                                  : 'Actual pixels (scroll if larger than the editor)'
                              }
                              className={`px-2 py-0.5 transition-colors ${
                                active
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-white/5 hover:bg-white/10 text-white/80'
                              }`}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                      <span className="opacity-60 tabular-nums">
                        {devW}×{devH} · {scalePct}%
                      </span>
                    </>
                  )}
                  {/* P2.5 — orientation policy: indicator + setter (writes
                      project.orientation via the app event bus). */}
                  <span className="opacity-30">|</span>
                  <span className="opacity-70">Orientation</span>
                  <select
                    value={orientPolicy}
                    onChange={(e) =>
                      window.dispatchEvent(
                        new CustomEvent('asaps:setProjectOrientation', {
                          detail: { orientation: e.target.value },
                        })
                      )
                    }
                    title="Project orientation policy (saved to settings). Layout stays width-responsive either way."
                    className="px-1.5 py-0.5 rounded bg-white/10 border border-white/20 text-white"
                  >
                    <option value="flexible">Flexible</option>
                    <option value="portrait">Portrait (locked)</option>
                    <option value="landscape">Landscape (locked)</option>
                  </select>
                  {orientPolicy === 'flexible' && orientable ? (
                    <div className="flex rounded overflow-hidden border border-white/20">
                      {(['portrait', 'landscape'] as const).map((o) => (
                        <button
                          key={o}
                          type="button"
                          onClick={() => setSlotPreviewOrient(o)}
                          title={`Preview in ${o} (does not change the project setting)`}
                          className={`px-2 py-0.5 transition-colors ${
                            effOrient === o
                              ? 'bg-blue-600 text-white'
                              : 'bg-white/5 hover:bg-white/10 text-white/80'
                          }`}
                        >
                          {o === 'portrait' ? '▯' : '▭'}
                        </button>
                      ))}
                    </div>
                  ) : orientPolicy !== 'flexible' ? (
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/80 text-black font-medium">
                      🔒 {orientPolicy}
                    </span>
                  ) : null}
                  {/* Slot status badges + per-slot controls used to live
                      here. They now sit next to each slot row in the left
                      Elements panel — see VisualPropertiesPanel slot rows.
                      Only collision badges (which span multiple slots and
                      can't live on a single row) stay surfaced up here. */}
                  {customCollisions.map(c => (
                    <span
                      key={`coll-${c.zone}`}
                      title={`Slots ${c.slots.map(slotLabel).join(' + ')} are both anchored to ${c.zone.replace('-', ' · ')}. They will overlap on stage. Drag one to a different zone to fix.`}
                      className="px-1.5 py-0.5 rounded bg-orange-500/90 text-black font-medium"
                    >
                      ⚠ {c.slots.map(slotLabel).join(' + ')} overlap at {c.zone.replace('-', '·')}
                    </span>
                  ))}
                </div>
                <div
                  ref={slotStageRef}
                  className={`flex-1 min-h-0 flex p-3 overflow-auto ${
                    isFixed ? 'items-center justify-center' : ''
                  }`}
                >
                  {isFixed ? (
                    // Fixed device rect, transform-scaled. The footprint
                    // wrapper carries the SCALED size so flex-centering and
                    // overflow-scroll account for the visual size while the
                    // inner rect renders at true device px (faithful layout).
                    <div
                      className="shrink-0"
                      style={{ width: devW * effScale, height: devH * effScale }}
                    >
                      <div
                        className="relative bg-black shadow-xl ring-2 ring-amber-400/80"
                        data-slotflow-stage="true"
                        style={{
                          width: devW,
                          height: devH,
                          transform: `scale(${effScale})`,
                          transformOrigin: 'top left',
                        }}
                      >
                        {previewInner}
                      </div>
                    </div>
                  ) : (
                    // "Editor" preset — fill the area, truly responsive to it.
                    <div className="relative w-full h-full bg-black shadow-xl ring-2 ring-amber-400/80" data-slotflow-stage="true">
                      {previewInner}
                    </div>
                  )}
                </div>
              </div>
            );
          })()
        ) : (
          /* Layout Mode: Standard Visual Beat Editor (with viewport rect for panorama) */
          <VisualBeatEditor
            backgroundAssetId={backgroundAssetId}
            backgroundUrl={backgroundUrl}
            backgroundSound={backgroundSound}
            elements={visualElements}
            onInteractionStart={() => {
              if (commitTimeoutRef.current) {
                clearTimeout(commitTimeoutRef.current);
                commitTimeoutRef.current = null;
              }
              if (!snapshotRef.current) {
                snapshotRef.current = visualElements.map(el => ({ ...el }));
              }
            }}
            onInteractionEnd={() => {
              commitSnapshot('Move/resize element');
            }}
            onElementsChange={(elements) => {
              // Capture snapshot if not already in an interaction
              if (!snapshotRef.current) {
                snapshotRef.current = visualElements.map(el => ({ ...el }));
              }
              setVisualElements(elements);
              setHasChanges(true);
              // CRITICAL: Sync to beat.locations immediately so preview has latest positions
              if (beat) {
                syncElementsToBeatLocations(elements, beat);
              }
              // Debounced commit for non-drag changes (arrow keys, alignment, etc.)
              if (commitTimeoutRef.current) clearTimeout(commitTimeoutRef.current);
              commitTimeoutRef.current = window.setTimeout(() => {
                commitSnapshot('Update elements');
                commitTimeoutRef.current = null;
              }, 800);
            }}
            assets={assets}
            characters={characters}
            onSelectAsset={handleAssetSelection}
            onOpenCharacterManager={onOpenCharacterManager}
            beatContent={content}
            beatType={beat.type === 'endScreen' && selectedPhaseId === 'credits' ? 'endScreenCredits' : beat.type}
            selectedElements={selectedElementIds}
            onSelectElements={setSelectedElementIds}
            projectSettings={projectSettings}
            globalSettings={globalSettings}
            themeAssets={themeAssets}
            overrideCountdownMeter={(beat as any).overrideCountdownMeter}
            presentationMode={(() => {
              // dialogTree/aiDialogTree: read the legacy presentationMode
              // field that VBE's chat-preview branch keys on.
              if (beat.type === 'dialogTree' || beat.type === 'aiDialogTree') {
                return (beat as any).presentationMode || 'positioned';
              }
              // multiChoice: map layoutTemplate → presentationMode so VBE's
              // ChatDialogView preview fires for chat-scroll/chat-bubble.
              if (beat.type === 'multiChoice') {
                const lt = (beat as any).layoutTemplate as string | undefined;
                if (lt === 'chat-scroll' || lt === 'chat-bubble') return lt;
                return 'positioned';
              }
              return undefined;
            })()}
            initialZoom={vbeZoomRef.current}
            onZoomChange={(z: number) => { vbeZoomRef.current = z; }}
            initialScroll={vbeScrollRef.current}
            onScrollChange={(s: { left: number; top: number }) => { vbeScrollRef.current = s; }}
            onResetLayout={() => {
              // Reset this beat's element positions to the default layout
              // computed by initializeLocationsFromSchema. Useful when a
              // layout-math fix lands and the user wants to opt this beat
              // into the new defaults without deleting and re-adding it.
              // Destructive (any manual edits are lost) — confirm first.
              if (!beat) return;
              const confirmed = window.confirm(
                "Reset this beat's element positions to the default layout? Manual position edits on this beat will be lost. This goes into the undo history."
              );
              if (!confirmed) return;
              const params = beat.getParameters ? beat.getParameters() : {};
              // Clear the persisted locations so the initializer recomputes
              // from scratch (the function skips beats that already have
              // locations elsewhere; here we explicitly wipe + re-init).
              beat.locations = new Map();
              const freshElements = initializeLocationsFromSchema(
                beat,
                params,
                projectSettings,
              );
              // Capture snapshot for undo, then apply
              snapshotRef.current = visualElements.map((el) => ({ ...el }));
              setVisualElements(freshElements);
              syncElementsToBeatLocations(freshElements, beat);
              setHasChanges(true);
              setSelectedElementIds([]);
              commitSnapshot('Reset layout to default');
            }}
          />
        )}
        </div>
      </div>

      {/* Drag-to-snap overlay — faint 3×3 zone grid positioned over
          the SlotFlowView stage during an active custom-template slot
          drag. The slot itself now visibly moves to the live zone
          (previewSlotIntent splices in the snap target), so the
          overlay just hints at the snap grid without an active-cell
          highlight + a small zone label at the top so the author knows
          where it'll land. */}
      {slotDrag && (() => {
        const { stageRect, pointerX, pointerY } = slotDrag;
        const x = pointerX - stageRect.left;
        const y = pointerY - stageRect.top;
        const { h, v } = snapPointerToZone(x, y, stageRect);
        return (
          <div
            style={{
              position: 'fixed',
              left: stageRect.left,
              top: stageRect.top,
              width: stageRect.width,
              height: stageRect.height,
              pointerEvents: 'none',
              zIndex: 9999,
              backgroundImage:
                'linear-gradient(to right, rgba(59,130,246,0.5) 1px, transparent 1px),' +
                'linear-gradient(to bottom, rgba(59,130,246,0.5) 1px, transparent 1px)',
              backgroundSize: `${stageRect.width / 3}px ${stageRect.height / 3}px`,
              backgroundPosition: '0 0',
              boxShadow: 'inset 0 0 0 2px rgba(59,130,246,0.3)',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 8,
                left: '50%',
                transform: 'translateX(-50%)',
                padding: '6px 14px',
                borderRadius: 999,
                background: 'rgba(59,130,246,0.95)',
                color: 'white',
                fontWeight: 600,
                fontSize: 13,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              }}
            >
              {v} · {h}
            </div>
          </div>
        );
      })()}

      {/* Asset Selection Modal */}
      <AssetSelectionModal
        isOpen={assetModal.isOpen}
        onClose={() => setAssetModal({ isOpen: false, type: null, callback: null })}
        onSelect={handleAssetSelected}
        assets={assets}
        onAssetAdd={onAssetAdd!}
        onAssetRemove={onAssetRemove!}
        onAssetUpdate={onAssetUpdate!}
        assetType={assetModal.type === 'sound' ? 'audio' : assetModal.type === 'video' ? 'video' : 'image'}
        assetSubType={assetModal.type === 'sound' ? 'sfx' : assetModal.type ?? undefined}
        title={`Select ${assetModal.type || 'Asset'}`}
      />

      {/* Meter Selection Modal */}
      {meterModal.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Select Counter Meter</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {characters.flatMap(character =>
                (character.counters || [])
                  .filter(counter => counter.showLevelMeter)
                  .map(counter => (
                    <button
                      key={`${character.id}-${counter.name}`}
                      onClick={() => {
                        const stageWidth = projectSettings?.width || 1024;
                        const stageHeight = projectSettings?.height || 768;
                        const isHorizontal = (counter.levelMeterOrientation || 'horizontal') === 'horizontal';

                        const newElement: VisualElement = {
                          id: `meter_${Date.now()}`,
                          type: 'meter',
                          name: `${counter.displayName || counter.name} Meter`,
                          x: 20,
                          y: 20,
                          z: 1000, // High z-index for HUD overlay
                          width: isHorizontal ? 150 : 30,
                          height: isHorizontal ? 20 : 100,
                          rotation: 0,
                          scale: 1,
                          visible: true,
                          locked: false,
                          characterId: character.id,
                          counterName: counter.name,
                          meterOrientation: counter.levelMeterOrientation || 'horizontal',
                          showNumericValue: counter.showNumericValue || false,
                          numericFormat: counter.numericFormat || 'value',
                          meterColor: counter.color || '#3B82F6',
                          meterBackgroundColor: 'rgba(255, 255, 255, 0.3)',
                        };

                        setVisualElements(prev => [...prev, newElement]);
                        setSelectedElementIds([newElement.id]);
                        setHasChanges(true);

                        // Persist to beat.locations
                        if (beat) {
                          const locationName = newElement.name || newElement.id;
                          beat.locations.set(locationName, {
                            kind: 'meter',
                            name: locationName,
                            x: Math.round(newElement.x),
                            y: Math.round(newElement.y),
                            width: Math.round(newElement.width),
                            height: Math.round(newElement.height),
                            zIndex: newElement.z,
                            characterId: character.id,
                            counterName: counter.name,
                            meterOrientation: counter.levelMeterOrientation || 'horizontal',
                            showNumericValue: counter.showNumericValue || false,
                            numericFormat: counter.numericFormat || 'value',
                            meterColor: counter.color || '#3B82F6',
                            meterBackgroundColor: 'rgba(255, 255, 255, 0.3)',
                          });
                          console.log(`[VisualWorkspace] Added meter "${locationName}" to beat.locations`);
                        }

                        setMeterModal({ isOpen: false });
                      }}
                      className="w-full px-4 py-3 text-left border rounded-lg hover:bg-gray-50 flex items-center gap-3"
                    >
                      <div
                        className="w-4 h-4 rounded"
                        style={{ backgroundColor: counter.color || '#3B82F6' }}
                      />
                      <div>
                        <div className="font-medium">{counter.displayName || counter.name}</div>
                        <div className="text-xs text-gray-500">
                          {character.displayName || character.name} • {counter.levelMeterOrientation || 'horizontal'}
                        </div>
                      </div>
                    </button>
                  ))
              )}
              {!characters.some(c => c.counters?.some(counter => counter.showLevelMeter)) && (
                <div className="text-gray-500 text-center py-4">
                  No counters with level meters enabled.<br />
                  Enable "Show Level Meter" in Character Editor.
                </div>
              )}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setMeterModal({ isOpen: false })}
                className="px-4 py-2 border rounded hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
