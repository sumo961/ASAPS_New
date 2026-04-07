/**
 * Visual Workspace Component
 * Unified visual editor with all controls in one left panel
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Beat, Cluster, type Location, type AnimationPath, type SharedVisualContent, computeDialogTreeLayout, type DialogTreeLayoutTheme, DEFAULT_DIALOG_TREE_THEME, calculateTextBoxDimensions, calculateButtonDimensions, calculateDialogDimensions } from '@asaps/core';
import { VisualBeatEditor, VisualElement } from './VisualBeatEditor';
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
  if (state.visual.image) {
    // Check if it's a blob URL - these are likely stale after page reload
    if (state.visual.image.startsWith('blob:')) {
      console.warn('[VisualWorkspace] Using potentially stale blob URL - no assetId found:', state.visual.image.substring(0, 50));
    }
    return state.visual.image;
  }

  return defaultImage;
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
}) => {
  const [visualElements, setVisualElements] = useState<VisualElement[]>([]);
  const [backgroundAssetId, setBackgroundAssetId] = useState<string>('');
  const [backgroundUrl, setBackgroundUrl] = useState<string>(''); // Direct URL for ASML import
  const [backgroundSound, setBackgroundSound] = useState<string>('');
  const [showProperties, setShowProperties] = useState(true);
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  // Compatibility helper for single-select consumers
  const selectedElementId = selectedElementIds.length > 0 ? selectedElementIds[0] : null;
  const [hasChanges, setHasChanges] = useState(false);
  const [activeTab, setActiveTab] = useState<'elements' | 'animations'>('elements');
  const [animations, setAnimations] = useState<AnimationPath[]>([]);
  const [leftPanelWidth, setLeftPanelWidth] = useState(320); // Default w-80 = 320px
  const [isResizingPanel, setIsResizingPanel] = useState(false);

  // Phase navigation state for DialogTree beats
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null);
  const [phasesExpanded, setPhasesExpanded] = useState(true);

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
                const resolvedUrl = resolveCharacterImageUrl(state, character.visual?.defaultImage, assets);
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
            const resolvedUrl = resolveCharacterImageUrl(state, character.visual?.defaultImage, assets);
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
            const resolvedUrl = resolveCharacterImageUrl(state, character.visual?.defaultImage, assets);
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
    // Use SchemaLocationInitializer to generate elements from schema
    if (elements.length === 0 && beat.locations.size === 0) {
      console.log(`[VisualWorkspace] Using SchemaLocationInitializer for ${beat.type}`);
      const schemaElements = initializeLocationsFromSchema(beat, params, projectSettings);
      elements = schemaElements;
    }

    // VideoBeat: set the video asset ID and type on the video element
    if (beat.type === 'videoBeat' && params.videoAssetId) {
      const videoEl = elements.find((e: VisualElement) =>
        e.name === 'video' || e.name === 'Video' || e.type === 'prop'
      );
      if (videoEl) {
        videoEl.assetId = params.videoAssetId;
        (videoEl as any).assetType = 'video';
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

    // Supplement missing static elements for beats with dynamic locations
    // movementChoice/pickProp may have choice/prop hotspots in beat.locations
    // but be missing the schema-defined "question" text element
    if (elements.length > 0 && (beat.type === 'movementChoice' || beat.type === 'pickProp')) {
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

    console.warn(`[VisualWorkspace] ★★★ Setting ${elements.length} elements for ${beat.type} ★★★`);
    console.warn(`[VisualWorkspace] ========== ELEMENT POSITIONS BEING SET ==========`);
    elements.forEach((e, idx) => {
      console.warn(`[VisualWorkspace]   [${idx}] ${e.type}/${e.name}: x=${e.x}, y=${e.y}, z=${e.z}, w=${e.width}, h=${e.height}, size=${e.size}, fontSize=${e.fontSize}`);
    });
    console.warn(`[VisualWorkspace] ================================================`);
    console.log(`[VisualWorkspace] Background: bgId=${bgId?.substring?.(0, 8) || 'none'}, bgUrl=${bgUrl ? 'set' : 'none'}`);

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

          {/* DialogTree Phase Navigator */}
          {isDialogTreeBeat && (
            <div className="border-b border-gray-200 bg-purple-50">
              {/* Header with expand/collapse */}
              <button
                onClick={() => setPhasesExpanded(!phasesExpanded)}
                className="w-full px-3 py-2 flex items-center gap-2 text-sm font-medium text-purple-700 hover:bg-purple-100 transition-colors"
              >
                {phasesExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
                <MessageSquare className="w-4 h-4" />
                <span>Dialog Phases ({flattenedPhases.length})</span>
              </button>

              {/* Phase tree list */}
              {phasesExpanded && (
                <div className="px-2 pb-2 max-h-48 overflow-y-auto">
                  {flattenedPhases.map((phase, index) => (
                    <button
                      key={phase.id}
                      onClick={() => handlePhaseSelect(phase.id)}
                      className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
                        selectedPhaseId === phase.id
                          ? 'bg-purple-200 text-purple-900 ring-1 ring-purple-400'
                          : 'hover:bg-purple-100 text-purple-800'
                      }`}
                      style={{ paddingLeft: `${8 + phase.depth * 12}px` }}
                      title={phase.fullText}
                    >
                      <div className="flex items-start gap-1">
                        <span className="text-purple-500 font-medium shrink-0">
                          {index + 1}.
                        </span>
                        <div className="min-w-0">
                          {phase.choiceText && (
                            <div className="text-purple-400 text-[10px] truncate">
                              [{phase.choiceText}] →
                            </div>
                          )}
                          <div className="truncate">
                            <span className="font-medium">{phase.speaker}:</span>{' '}
                            {phase.text}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

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
                backgroundAssetId={backgroundAssetId}
                elements={visualElements}
                selectedElements={selectedElementIds}
                onBackgroundSelect={handleBackgroundSelect}
                onElementSelect={(id: string | null) => setSelectedElementIds(id ? [id] : [])}
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
              />
            )}
          </div>
          </>
        </div>
      )}

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
            presentationMode={(beat.type === 'dialogTree' || beat.type === 'aiDialogTree') ? ((beat as any).presentationMode || 'positioned') : undefined}
            initialZoom={vbeZoomRef.current}
            onZoomChange={(z: number) => { vbeZoomRef.current = z; }}
            initialScroll={vbeScrollRef.current}
            onScrollChange={(s: { left: number; top: number }) => { vbeScrollRef.current = s; }}
          />
        )}
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
