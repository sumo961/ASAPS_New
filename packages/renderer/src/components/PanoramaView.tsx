import React, { useRef, useEffect, useCallback, useState } from 'react';
import { Viewer } from '@photo-sphere-viewer/core';
import { MarkersPlugin } from '@photo-sphere-viewer/markers-plugin';
import '@photo-sphere-viewer/core/index.css';
import '@photo-sphere-viewer/markers-plugin/index.css';
import { isPresetSound, getPresetSound } from '@asaps/core';
import { getAudioManager } from '../audio/AudioManager';

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/**
 * Compute panoData for a partial (cylindrical) panorama image.
 * PSV treats it as a cropped region of a full equirectangular sphere.
 */
function computePanoData(imageWidth: number, imageHeight: number) {
  const A = imageWidth / imageHeight;
  const horizArcDeg = A * RAD_TO_DEG;
  const fullWidth = Math.round(imageWidth * (360 / horizArcDeg));
  const fullHeight = Math.round(fullWidth / 2);
  return {
    fullWidth,
    fullHeight,
    croppedWidth: imageWidth,
    croppedHeight: imageHeight,
    croppedX: Math.round((fullWidth - imageWidth) / 2),
    croppedY: Math.round((fullHeight - imageHeight) / 2),
  };
}

export interface PanoramaHotspotData {
  id: string;
  pitch: number;
  yaw: number;
  text: string;
  width?: number;
  height?: number;
  scale?: number;
  rotation?: number;
  sound?: string;
  assetId?: string;
  imageUrl?: string;
  kind?: string;
  hotspotOverride?: {
    enabled: boolean;
    opacity?: number;           // 0-100 percentage
    showInPreview?: 'visible' | 'onHover' | 'invisible';
  };
}

export interface PanoramaViewerApi {
  lookAt: (pitch: number, yaw: number, hfov?: number) => void;
  getView: () => { pitch: number; yaw: number; hfov: number };
}

export interface PanoramaViewProps {
  panoramaUrl: string;
  hotspots: PanoramaHotspotData[];
  initialPitch?: number;
  initialYaw?: number;
  hfov?: number;
  prompt?: string;
  /** Prompt display mode: 'static' (CSS overlay) or 'pinned' (marker at yaw/pitch) */
  promptDisplay?: 'static' | 'pinned';
  /** Projection type: 'equirectangular' (sphere, 2:1) or 'cylindrical' (cylinder, 4:1–8:1) */
  projectionType?: 'equirectangular' | 'cylindrical';
  onHotspotClick: (hotspotId: string) => void;
  /** Editor mode: click to place hotspots instead of navigating */
  editorMode?: boolean;
  onEditorClick?: (pitch: number, yaw: number) => void;
  /** ID of the currently selected hotspot (for highlighting) */
  selectedHotspotId?: string;
  /** Callback providing viewer API for programmatic control */
  onViewerReady?: (api: PanoramaViewerApi) => void;
  /** Optional theme styling for the prompt overlay */
  promptStyle?: {
    fontFamily?: string;
    fontSize?: string | number;
    color?: string;
    backgroundColor?: string;
    border?: string;
    borderRadius?: string | number;
    padding?: string | number;
  };
  /** Non-hotspot overlay elements (props, characters) with yaw/pitch positions */
  overlayElements?: Array<{
    id?: string;
    name: string;
    kind: string;
    yaw: number;
    pitch: number;
    width: number;
    height: number;
    scale?: number;
    size?: number;       // Character size percentage (e.g. 90 = 90%)
    rotation?: number;
    assetId?: string;
    imageUrl?: string;
  }>;
  /** Asset URL resolver for overlay element images */
  resolveAssetUrl?: (assetId: string) => string | undefined;
  /** Hotspot appearance settings from theme */
  hotspotStyle?: {
    highlightColor?: string;
    opacity?: number;         // 0-1 normalized
    visible?: boolean;
    showInPreview?: 'visible' | 'onHover' | 'invisible';
    labelDisplay?: 'none' | 'hover' | 'always';
    fontFamily?: string;
    fontSize?: number;
    fontColor?: string;
    // Tooltip styling (from button theme)
    tooltipBackgroundColor?: string;
    tooltipTextColor?: string;
    tooltipBorderColor?: string;
    tooltipBorderRadius?: number;
    tooltipFontFamily?: string;
  };
  /** Sound blob resolver for click sounds on hotspots */
  soundBlobResolver?: (assetId: string) => Promise<Blob | null>;
  /** Stage dimensions for coordinate mapping (default 1024x768) */
  stageWidth?: number;
  stageHeight?: number;
  /** Panorama image aspect ratio (width/height, for cylindrical projection) */
  imageAspect?: number;
}

/** Convert our HFOV (degrees) to PSV zoom level 0-100 */
function hfovToZoom(viewer: Viewer, hfovDeg: number): number {
  const vFov = viewer.dataHelper.hFovToVFov(hfovDeg);
  return viewer.dataHelper.fovToZoomLevel(vFov);
}

/** Get current HFOV (degrees) from PSV zoom level */
function zoomToHfov(viewer: Viewer): number {
  const vFov = viewer.dataHelper.zoomLevelToFov(viewer.getZoomLevel());
  return viewer.dataHelper.vFovToHFov(vFov);
}

export const PanoramaView: React.FC<PanoramaViewProps> = ({
  panoramaUrl,
  hotspots,
  initialPitch = 0,
  initialYaw = 0,
  hfov = 75,
  prompt,
  promptDisplay = 'static',
  projectionType = 'equirectangular',
  onHotspotClick,
  editorMode = false,
  onEditorClick,
  selectedHotspotId,
  onViewerReady,
  promptStyle,
  hotspotStyle,
  overlayElements,
  resolveAssetUrl,
  soundBlobResolver,
  stageWidth = 1024,
}) => {
  const viewerContainerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const markersPluginRef = useRef<MarkersPlugin | null>(null);
  const onHotspotClickRef = useRef(onHotspotClick);
  const onEditorClickRef = useRef(onEditorClick);
  const onViewerReadyRef = useRef(onViewerReady);
  const editorModeRef = useRef(editorMode);
  const soundBlobResolverRef = useRef(soundBlobResolver);
  const hotspotsRef = useRef(hotspots);
  // Store actual HFOV from the viewer after zoom is applied (may differ from
  // the requested `hfov` prop due to PSV's aspect-ratio-dependent quantization)
  const initialHfovRef = useRef(Math.max(30, hfov));

  // blob: URLs fail in null-origin contexts (file:// HTML exports) because
  // Three.js sets crossOrigin='anonymous' on the img element, which Chrome
  // blocks for blob:null/ URLs. Convert to data URL which works everywhere.
  const [resolvedPanoUrl, setResolvedPanoUrl] = useState(panoramaUrl);
  useEffect(() => {
    let cancelled = false;
    if (!panoramaUrl) {
      setResolvedPanoUrl('');
      return;
    }
    if (panoramaUrl.startsWith('blob:')) {
      fetch(panoramaUrl)
        .then(r => r.blob())
        .then(blob => new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        }))
        .then(dataUrl => { if (!cancelled) setResolvedPanoUrl(dataUrl); })
        .catch(() => { if (!cancelled) setResolvedPanoUrl(panoramaUrl); });
    } else {
      setResolvedPanoUrl(panoramaUrl);
    }
    return () => { cancelled = true; };
  }, [panoramaUrl]);

  // Trigger markers sync when viewer becomes ready
  const [markersVersion, setMarkersVersion] = useState(0);

  // Detect CSS scale applied by parent (e.g. PreviewWindow's transform: scale())
  // so we can compensate the static prompt overlay's font size
  const [cssScale, setCssScale] = useState(1);
  useEffect(() => {
    const el = viewerContainerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      const layoutW = el.offsetWidth;
      if (layoutW > 0) {
        const s = rect.width / layoutW;
        if (Math.abs(s - 1) > 0.01) setCssScale(s);
        else setCssScale(1);
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Tooltip state for hotspot hover labels
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const hotspotStyleRef = useRef(hotspotStyle);
  hotspotStyleRef.current = hotspotStyle;

  // Keep refs up to date
  onHotspotClickRef.current = onHotspotClick;
  onEditorClickRef.current = onEditorClick;
  onViewerReadyRef.current = onViewerReady;
  editorModeRef.current = editorMode;
  soundBlobResolverRef.current = soundBlobResolver;
  hotspotsRef.current = hotspots;

  // Stable callback for panoramaUrl changes - load image to get natural dimensions for cylindrical
  const createViewer = useCallback(() => {
    if (!viewerContainerRef.current || !resolvedPanoUrl) return;

    // Destroy existing viewer
    if (viewerRef.current) {
      try { viewerRef.current.destroy(); } catch { /* ignore */ }
      viewerRef.current = null;
      markersPluginRef.current = null;
    }

    const createWithPanoData = (panoData?: any) => {
      if (!viewerContainerRef.current) return;

      const viewer = new Viewer({
        container: viewerContainerRef.current,
        panorama: resolvedPanoUrl,
        panoData: panoData || undefined,
        defaultYaw: initialYaw * DEG_TO_RAD,
        defaultPitch: initialPitch * DEG_TO_RAD,
        defaultZoomLvl: 50, // refined in ready handler
        minFov: 10,
        maxFov: 120,
        navbar: false,
        mousemove: !editorModeRef.current || true, // always allow panning
        plugins: [[MarkersPlugin, { markers: [] }]],
      });

      viewerRef.current = viewer;
      const markersPlugin = viewer.getPlugin<MarkersPlugin>(MarkersPlugin);
      markersPluginRef.current = markersPlugin;

      // Ready handler: set correct zoom from HFOV and expose API
      viewer.addEventListener('ready', () => {
        try {
          const zoom = hfovToZoom(viewer, Math.max(30, hfov));
          viewer.zoom(zoom);
        } catch { /* ignore */ }

        // Read back actual HFOV from the viewer — PSV's round-trip may differ
        // from the requested value due to aspect-ratio quantization
        initialHfovRef.current = Math.max(30, zoomToHfov(viewer));

        // Expose viewer API
        if (onViewerReadyRef.current) {
          onViewerReadyRef.current({
            lookAt: (pitch: number, yaw: number, targetHfov?: number) => {
              try {
                viewer.rotate({ yaw: yaw * DEG_TO_RAD, pitch: pitch * DEG_TO_RAD });
                if (targetHfov !== undefined) {
                  viewer.zoom(hfovToZoom(viewer, Math.max(30, targetHfov)));
                }
              } catch { /* viewer may be destroyed */ }
            },
            getView: () => {
              try {
                const pos = viewer.getPosition();
                let yawDeg = pos.yaw * RAD_TO_DEG;
                // Normalize to -180..180
                while (yawDeg > 180) yawDeg -= 360;
                while (yawDeg < -180) yawDeg += 360;
                return { pitch: pos.pitch * RAD_TO_DEG, yaw: yawDeg, hfov: zoomToHfov(viewer) };
              } catch {
                return { pitch: 0, yaw: 0, hfov: 75 };
              }
            },
          });
        }

        // Trigger markers sync now that the viewer is ready
        setMarkersVersion(v => v + 1);
      }, { once: true });

      // Zoom handler: trigger marker rebuild so markers scale with zoom
      viewer.addEventListener('zoom-updated', () => {
        setMarkersVersion(v => v + 1);
      });

      // Hotspot click via marker event
      markersPlugin.addEventListener('select-marker', async (e) => {
        const hotspotId = e.marker.data?.hotspotId;
        if (hotspotId) {
          // Clear tooltip immediately so it doesn't persist into the next beat
          setTooltip(null);
          // Play click sound if assigned
          const hs = hotspotsRef.current.find(h => h.id === hotspotId);
          const soundRef = hs?.sound;
          if (soundRef && soundRef !== 'undefined') {
            try {
              const audioManager = getAudioManager();
              if (isPresetSound(soundRef)) {
                const preset = getPresetSound(soundRef);
                if (preset) await audioManager.playSoundAndWait(preset.url, preset.volume);
              } else if (soundBlobResolverRef.current) {
                const blob = await soundBlobResolverRef.current(soundRef);
                if (blob) await audioManager.playSoundFromBlobAndWait(blob, 1.0, soundRef);
              } else if (soundRef.startsWith('http')) {
                await audioManager.playSoundAndWait(soundRef);
              }
            } catch (error) {
              console.error('[PanoramaView] Error playing hotspot sound:', error);
            }
          }
          onHotspotClickRef.current(hotspotId);
        }
      });

      // Hotspot hover — show/hide themed tooltip for 'hover' label mode
      markersPlugin.addEventListener('enter-marker', (e) => {
        const hotspotId = e.marker.data?.hotspotId;
        const labelDisplay = hotspotStyleRef.current?.labelDisplay ?? 'hover';
        if (hotspotId && labelDisplay === 'hover') {
          const text = e.marker.config?.data?.text || '';
          if (text) {
            // Position will be updated by mousemove on the container
            setTooltip({ text, x: 0, y: 0 });
          }
        }
      });
      markersPlugin.addEventListener('leave-marker', (e) => {
        if (e.marker.data?.hotspotId) {
          setTooltip(null);
        }
      });

      // Editor mode click — report yaw/pitch in degrees
      viewer.addEventListener('click', (e) => {
        if (editorModeRef.current && onEditorClickRef.current) {
          onEditorClickRef.current(e.data.pitch * RAD_TO_DEG, e.data.yaw * RAD_TO_DEG);
        }
      });
    };

    // For cylindrical projection, load image to get natural dimensions
    if (projectionType === 'cylindrical') {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        createWithPanoData(computePanoData(img.naturalWidth, img.naturalHeight));
      };
      img.onerror = () => {
        // Fall back to equirectangular
        createWithPanoData();
      };
      img.src = resolvedPanoUrl;
    } else {
      createWithPanoData();
    }
  }, [resolvedPanoUrl, projectionType, initialYaw, initialPitch, hfov]);

  // Effect #1: Viewer lifecycle
  useEffect(() => {
    createViewer();
    return () => {
      if (viewerRef.current) {
        try { viewerRef.current.destroy(); } catch { /* ignore */ }
        viewerRef.current = null;
        markersPluginRef.current = null;
      }
    };
  }, [createViewer]);

  // Effect #2: Sync markers when hotspots/overlayElements/selectedHotspotId change
  useEffect(() => {
    const mp = markersPluginRef.current;
    if (!mp) return;

    // Scale marker pixel sizes from stage coordinates to screen coordinates.
    const stageW = stageWidth || 1024;
    const containerW = viewerContainerRef.current?.clientWidth || stageW;
    const sizeFactor = containerW / stageW;

    // Scale markers proportionally with zoom using perspective-correct tangent ratio.
    // This matches how PSV's Three.js renderer scales the panorama background.
    // Uses the actual initial HFOV from the viewer (stored in initialHfovRef)
    // rather than the requested hfov prop, ensuring zoomScale=1 at default zoom.
    const viewer = viewerRef.current;
    let zoomScale = 1;
    if (viewer && viewer.state.ready) {
      try {
        const currentHfov = zoomToHfov(viewer);
        const initRad = initialHfovRef.current * 0.5 * DEG_TO_RAD;
        const currRad = Math.max(30, currentHfov) * 0.5 * DEG_TO_RAD;
        zoomScale = Math.tan(initRad) / Math.tan(currRad);
      } catch { /* ignore */ }
    }

    const scale = sizeFactor * zoomScale;
    const markers: any[] = [];

    // Hotspot appearance from theme settings
    const hsColor = hotspotStyle?.highlightColor || '#ffff00';
    const hsOpacity = hotspotStyle?.opacity ?? 0.3;
    const hsVisible = hotspotStyle?.visible ?? true;
    const hsShowInPreview = hotspotStyle?.showInPreview ?? 'visible';
    const hsLabelDisplay = hotspotStyle?.labelDisplay ?? 'hover';
    const hsFontFamily = hotspotStyle?.fontFamily || 'sans-serif';
    const hsFontSizeBase = hotspotStyle?.fontSize || 16;
    const hsFontColor = hotspotStyle?.fontColor || 'white';
    // Parse hex color to RGB
    const hsR = parseInt(hsColor.slice(1,3), 16) || 255;
    const hsG = parseInt(hsColor.slice(3,5), 16) || 255;
    const hsB = parseInt(hsColor.slice(5,7), 16) || 0;
    const hsHoverAlpha = Math.min(hsOpacity * 1.5, 1);

    // Track whether any hotspot uses onHover mode (global or per-element override)
    let hasAnyHoverHotspot = false;

    // Hotspot markers (no psv--capture-event: let PSV fire select-marker for navigation)
    for (const hs of hotspots) {
      const elScale = hs.scale || 1;
      const w = (hs.width || 120) * elScale * scale;
      const h = (hs.height || 50) * elScale * scale;
      const isSelected = selectedHotspotId === hs.id;
      const rotateStyle = hs.rotation ? `transform: rotate(${hs.rotation}deg);` : '';
      const fontSize = Math.max(10, Math.round(hsFontSizeBase * scale));

      // Per-hotspot override: use element-level settings when enabled, fall back to global
      const ovr = hs.hotspotOverride?.enabled ? hs.hotspotOverride : undefined;
      const thisOpacity = ovr?.opacity !== undefined ? ovr.opacity / 100 : hsOpacity;
      const thisShowInPreview = ovr?.showInPreview || hsShowInPreview;

      // Check if this hotspot has an image (prop/character assigned via locationName)
      const resolvedFromAssetId = hs.assetId && resolveAssetUrl ? resolveAssetUrl(hs.assetId) : undefined;
      const imgSrc = resolvedFromAssetId || hs.imageUrl;
      const isImageMarker = imgSrc && hs.kind !== 'hotspot';

      // Determine label text
      const labelText = hsLabelDisplay === 'none' ? '' : (hs.text || 'Hotspot');
      // For 'hover' label mode, custom tooltip is shown via marker events (no inline text)
      const showInlineText = hsLabelDisplay === 'always' || editorMode;

      let markerHtml: string;
      if (isImageMarker) {
        // Image-based marker for props/characters — no label in preview (only in editor)
        const showImgLabel = editorMode && hsLabelDisplay !== 'none';
        const labelHtml = showImgLabel && labelText
          ? `<div style="text-align:center;font-size:${fontSize}px;font-family:${hsFontFamily};font-weight:600;color:${hsFontColor};text-shadow:0 1px 3px rgba(0,0,0,0.6);margin-top:2px;white-space:nowrap;">${labelText}</div>`
          : '';
        markerHtml = `<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;${rotateStyle}">
          <img src="${imgSrc}" alt="${hs.text || ''}" style="width:${Math.round(w)}px;height:${Math.round(h)}px;object-fit:contain;" />
          ${labelHtml}</div>`;
      } else {
        // Standard colored-rectangle hotspot
        // Determine background based on per-hotspot or global visibility mode
        let bgStyle: string;
        if (!hsVisible || thisShowInPreview === 'invisible') {
          bgStyle = 'background-color:transparent;';
        } else if (thisShowInPreview === 'onHover') {
          bgStyle = 'background-color:transparent;';
          hasAnyHoverHotspot = true;
        } else {
          const alpha = isSelected ? Math.min(thisOpacity * 1.5, 1) : thisOpacity;
          bgStyle = `background-color:rgba(${hsR},${hsG},${hsB},${alpha.toFixed(2)});`;
        }

        const hoverClass = (thisShowInPreview === 'onHover' && hsVisible) ? `pano-hs-hover` : '';

        markerHtml = `<div class="${hoverClass}" style="width:${Math.round(w)}px;height:${Math.round(h)}px;${rotateStyle}
          ${bgStyle}
          border:${isSelected ? `2px dashed rgba(${hsR},${hsG},${hsB},0.8)` : 'none'};
          border-radius:4px;display:flex;align-items:center;justify-content:center;
          font-size:${fontSize}px;font-family:${hsFontFamily};font-weight:600;color:${hsFontColor};
          text-shadow:0 1px 3px rgba(0,0,0,0.6);white-space:nowrap;overflow:hidden;
          cursor:pointer;box-sizing:border-box;
          transition:background-color 0.15s ease;">
          ${showInlineText ? labelText : ''}</div>`;
      }

      markers.push({
        id: `hotspot-${hs.id}`,
        position: { yaw: hs.yaw * DEG_TO_RAD, pitch: hs.pitch * DEG_TO_RAD },
        html: markerHtml,
        size: { width: Math.round(w), height: Math.round(h) },
        anchor: 'center center',
        data: { hotspotId: hs.id, text: hs.text || '' },
      });
    }

    // Inject hover CSS for onHover mode hotspots (global or per-element override)
    if (hasAnyHoverHotspot || (hsShowInPreview === 'onHover' && hsVisible)) {
      const styleId = 'pano-hotspot-hover-style';
      let styleEl = document.getElementById(styleId);
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = styleId;
        document.head.appendChild(styleEl);
      }
      styleEl.textContent = `.pano-hs-hover:hover { background-color: rgba(${hsR},${hsG},${hsB},${hsHoverAlpha.toFixed(2)}) !important; }`;
    }

    // Overlay element markers (props, characters, pinned text/dialog)
    if (overlayElements) {
      for (const el of overlayElements) {
        const sizeScale = el.size !== undefined ? el.size / 100 : 1;
        const elScale = (el.scale || 1) * sizeScale;
        const w = el.width * elScale * scale;
        const h = el.height * elScale * scale;
        const rotateStyle = el.rotation ? `transform: rotate(${el.rotation}deg);` : '';

        let content: string;
        if (el.kind === 'text' || el.kind === 'dialog') {
          // Pinned prompt text — use promptStyle for proper theming
          const bg = promptStyle?.backgroundColor || 'rgba(0, 0, 0, 0.7)';
          const color = promptStyle?.color || 'white';
          const fontSize = typeof promptStyle?.fontSize === 'number' ? `${Math.round(promptStyle.fontSize * scale)}px` : (promptStyle?.fontSize || `${Math.round(16 * scale)}px`);
          const fontFamily = promptStyle?.fontFamily || 'sans-serif';
          const padding = promptStyle?.padding ?? 8;
          const borderRadius = promptStyle?.borderRadius ?? 8;
          const border = promptStyle?.border || 'none';
          content = `<div style="width:${Math.round(w)}px;height:${Math.round(h)}px;box-sizing:border-box;overflow:hidden;
            background-color:${bg};color:${color};padding:${padding}px;border-radius:${borderRadius}px;border:${border};
            font-size:${fontSize};font-family:${fontFamily};
            display:flex;align-items:center;justify-content:center;
            word-wrap:break-word;overflow-wrap:break-word;text-align:center;${rotateStyle}">${prompt || el.name}</div>`;
        } else {
          const imgSrc = (el.assetId && resolveAssetUrl ? resolveAssetUrl(el.assetId) : undefined) || el.imageUrl;
          content = imgSrc
            ? `<img src="${imgSrc}" alt="${el.name}" style="width:${Math.round(w)}px;height:${Math.round(h)}px;object-fit:contain;${rotateStyle}" />`
            : `<div style="width:${Math.round(w)}px;height:${Math.round(h)}px;${rotateStyle}
                background-color:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.3);
                border-radius:4px;display:flex;align-items:center;justify-content:center;
                font-size:11px;color:rgba(255,255,255,0.5);box-sizing:border-box;">
                ${el.name}</div>`;
        }

        markers.push({
          id: `overlay-${el.id || el.name}`,
          position: { yaw: el.yaw * DEG_TO_RAD, pitch: el.pitch * DEG_TO_RAD },
          html: content,
          size: { width: Math.round(w), height: Math.round(h) },
          anchor: 'center center',
        });
      }
    }

    try {
      mp.setMarkers(markers);
    } catch { /* viewer may be initializing */ }
  }, [hotspots, overlayElements, selectedHotspotId, resolveAssetUrl, markersVersion, stageWidth, promptStyle, prompt, promptDisplay, hotspotStyle, editorMode]);

  // Effect #3: Camera sync when initialPitch/Yaw/hfov props change externally
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !viewer.state.ready) return;
    try {
      viewer.rotate({ yaw: initialYaw * DEG_TO_RAD, pitch: initialPitch * DEG_TO_RAD });
      viewer.zoom(hfovToZoom(viewer, Math.max(30, hfov)));
    } catch { /* viewer may not be fully loaded yet */ }
  }, [initialPitch, initialYaw, hfov]);

  if (!resolvedPanoUrl) {
    return (
      <div style={{
        position: 'relative', width: '100%', height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#000', color: 'rgba(255,255,255,0.5)',
        fontFamily: 'sans-serif', fontSize: '14px',
      }}>
        No panorama image
      </div>
    );
  }

  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100%' }}
      onMouseMove={(e) => {
        if (tooltip) setTooltip(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null);
      }}
    >
      <div ref={viewerContainerRef} style={{ width: '100%', height: '100%' }} />

      {/* Prompt overlay (static mode only — pinned mode renders as a PSV marker) */}
      {prompt && promptDisplay !== 'pinned' && (() => {
        // Compensate for parent CSS scale (PreviewWindow applies transform: scale()
        // which shrinks the prompt; divide by cssScale to undo the shrinkage)
        const scaleComp = cssScale < 1 ? 1 / cssScale : 1;
        const baseFontSize = typeof promptStyle?.fontSize === 'number' ? promptStyle.fontSize : 16;
        const basePadding = promptStyle?.padding ?? '10px 24px';
        const baseRadius = typeof promptStyle?.borderRadius === 'number' ? promptStyle.borderRadius : 8;
        return (
          <div style={{
            position: 'absolute',
            bottom: Math.round(60 * scaleComp),
            left: '50%',
            transform: `translateX(-50%)${scaleComp !== 1 ? ` scale(${scaleComp.toFixed(4)})` : ''}`,
            transformOrigin: 'bottom center',
            backgroundColor: promptStyle?.backgroundColor || 'rgba(0, 0, 0, 0.7)',
            color: promptStyle?.color || 'white',
            padding: basePadding,
            borderRadius: baseRadius,
            border: promptStyle?.border || 'none',
            fontSize: baseFontSize,
            fontFamily: promptStyle?.fontFamily || 'sans-serif',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            zIndex: 10,
          }}>
            {prompt}
          </div>
        );
      })()}

      {/* Hotspot hover tooltip (themed like button, follows cursor) */}
      {tooltip && (
        <div style={{
          position: 'fixed',
          left: tooltip.x + 12,
          top: tooltip.y - 8,
          backgroundColor: hotspotStyle?.tooltipBackgroundColor || '#4a90d9',
          color: hotspotStyle?.tooltipTextColor || '#ffffff',
          padding: '6px 12px',
          borderRadius: `${hotspotStyle?.tooltipBorderRadius ?? 8}px`,
          fontSize: '14px',
          fontFamily: hotspotStyle?.tooltipFontFamily || hotspotStyle?.fontFamily || 'sans-serif',
          fontWeight: 600,
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          border: hotspotStyle?.tooltipBorderColor ? `1px solid ${hotspotStyle.tooltipBorderColor}` : 'none',
          pointerEvents: 'none',
          zIndex: 10000,
          whiteSpace: 'nowrap',
          maxWidth: '300px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {tooltip.text}
        </div>
      )}
    </div>
  );
};
