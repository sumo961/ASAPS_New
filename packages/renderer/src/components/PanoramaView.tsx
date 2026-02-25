import React, { useRef, useEffect, useCallback } from 'react';

// Pannellum is a global-style library — we import it for side effects
// and access it via window.pannellum
import 'pannellum/build/pannellum.js';
import 'pannellum/build/pannellum.css';

export interface PanoramaHotspotData {
  id: string;
  pitch: number;
  yaw: number;
  text: string;
  icon?: string;
}

export interface PanoramaViewProps {
  panoramaUrl: string;
  hotspots: PanoramaHotspotData[];
  initialPitch?: number;
  initialYaw?: number;
  hfov?: number;
  autoRotate?: number;
  prompt?: string;
  onHotspotClick: (hotspotId: string) => void;
  /** Editor mode: click to place hotspots instead of navigating */
  editorMode?: boolean;
  onEditorClick?: (pitch: number, yaw: number) => void;
}

/**
 * Get the CSS class for a hotspot icon type
 */
function getHotspotIconClass(icon?: string): string {
  switch (icon) {
    case 'info': return 'pnlm-hotspot-info';
    case 'door': return 'pnlm-hotspot-door';
    case 'eye': return 'pnlm-hotspot-eye';
    case 'arrow':
    default: return 'pnlm-hotspot-arrow';
  }
}

export const PanoramaView: React.FC<PanoramaViewProps> = ({
  panoramaUrl,
  hotspots,
  initialPitch = 0,
  initialYaw = 0,
  hfov = 100,
  autoRotate = 0,
  prompt,
  onHotspotClick,
  editorMode = false,
  onEditorClick,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const onHotspotClickRef = useRef(onHotspotClick);
  const onEditorClickRef = useRef(onEditorClick);

  // Keep refs up to date
  onHotspotClickRef.current = onHotspotClick;
  onEditorClickRef.current = onEditorClick;

  // Initialize Pannellum viewer
  useEffect(() => {
    if (!containerRef.current || !panoramaUrl) return;

    const pannellumApi = (window as any).pannellum;
    if (!pannellumApi) {
      console.error('[PanoramaView] pannellum not found on window');
      return;
    }

    // Build hotspot config
    const hotSpotConfig: any[] = hotspots.map(hs => ({
      id: hs.id,
      pitch: hs.pitch,
      yaw: hs.yaw,
      type: 'info',
      text: hs.text,
      cssClass: `pnlm-hotspot-custom ${getHotspotIconClass(hs.icon)}`,
      clickHandlerFunc: () => {
        onHotspotClickRef.current(hs.id);
      },
    }));

    const viewer = pannellumApi.viewer(containerRef.current, {
      type: 'equirectangular',
      panorama: panoramaUrl,
      autoLoad: true,
      pitch: initialPitch,
      yaw: initialYaw,
      hfov: hfov,
      minHfov: 30,
      maxHfov: 120,
      autoRotate: autoRotate || undefined,
      autoRotateInactivityDelay: 3000,
      showZoomCtrl: false,
      showFullscreenCtrl: false,
      showControls: false,
      hotSpots: editorMode ? [] : hotSpotConfig,
      compass: false,
      hotSpotDebug: editorMode,
    });

    viewerRef.current = viewer;

    // In editor mode, capture clicks to place hotspots
    if (editorMode) {
      viewer.on('mouseup', (event: MouseEvent) => {
        if (onEditorClickRef.current) {
          const coords = viewer.mouseEventToCoords(event);
          if (coords) {
            onEditorClickRef.current(coords[0], coords[1]);
          }
        }
      });
    }

    return () => {
      try {
        viewer.destroy();
      } catch (e) {
        // Pannellum may throw during destroy if container is already gone
      }
      viewerRef.current = null;
    };
  // Only reinitialize when the panorama URL changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panoramaUrl]);

  // Update hotspots when they change (without reinitializing the viewer)
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || editorMode) return;

    try {
      // Remove existing hotspots
      const config = viewer.getConfig();
      if (config.hotSpots) {
        for (const hs of [...config.hotSpots]) {
          if (hs.id) {
            try { viewer.removeHotSpot(hs.id); } catch (e) { /* ignore */ }
          }
        }
      }

      // Add updated hotspots
      for (const hs of hotspots) {
        viewer.addHotSpot({
          id: hs.id,
          pitch: hs.pitch,
          yaw: hs.yaw,
          type: 'info',
          text: hs.text,
          cssClass: `pnlm-hotspot-custom ${getHotspotIconClass(hs.icon)}`,
          clickHandlerFunc: () => {
            onHotspotClickRef.current(hs.id);
          },
        });
      }
    } catch (e) {
      console.warn('[PanoramaView] Error updating hotspots:', e);
    }
  }, [hotspots, editorMode]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Pannellum container */}
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%' }}
      />

      {/* Prompt overlay */}
      {prompt && (
        <div style={{
          position: 'absolute',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          color: 'white',
          padding: '10px 24px',
          borderRadius: 8,
          fontSize: 16,
          fontFamily: 'sans-serif',
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          zIndex: 10,
        }}>
          {prompt}
        </div>
      )}

      {/* Custom hotspot styles */}
      <style>{`
        .pnlm-hotspot-custom {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.9);
          border: 3px solid #3b82f6;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        }
        .pnlm-hotspot-custom:hover {
          transform: scale(1.2);
          box-shadow: 0 4px 16px rgba(59, 130, 246, 0.5);
          border-color: #2563eb;
        }
        .pnlm-hotspot-custom .pnlm-tooltip {
          background: rgba(0, 0, 0, 0.8);
          color: white;
          padding: 6px 12px;
          border-radius: 4px;
          font-size: 14px;
          white-space: nowrap;
          pointer-events: none;
        }
        .pnlm-hotspot-arrow::after { content: "→"; font-size: 18px; color: #3b82f6; }
        .pnlm-hotspot-info::after { content: "ℹ"; font-size: 16px; color: #3b82f6; }
        .pnlm-hotspot-door::after { content: "🚪"; font-size: 16px; }
        .pnlm-hotspot-eye::after { content: "👁"; font-size: 16px; }

        /* Override Pannellum default styles for our embedded use */
        .pnlm-container {
          background: #000 !important;
        }
        .pnlm-load-box, .pnlm-load-button {
          display: none !important;
        }
      `}</style>
    </div>
  );
};
