import React, { useRef, useEffect, useMemo, useCallback } from 'react';
import View360, { EquirectProjection, CylindricalProjection } from '@egjs/react-view360';
import '@egjs/react-view360/css/view360.min.css';

export interface PanoramaHotspotData {
  id: string;
  pitch: number;
  yaw: number;
  text: string;
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
}

export const PanoramaView: React.FC<PanoramaViewProps> = ({
  panoramaUrl,
  hotspots,
  initialPitch = 0,
  initialYaw = 0,
  hfov = 75,
  prompt,
  projectionType = 'equirectangular',
  onHotspotClick,
  editorMode = false,
  onEditorClick,
  selectedHotspotId,
  onViewerReady,
  promptStyle,
}) => {
  const view360Ref = useRef<View360 | null>(null);
  const onHotspotClickRef = useRef(onHotspotClick);
  const onEditorClickRef = useRef(onEditorClick);
  const onViewerReadyRef = useRef(onViewerReady);
  const initializedRef = useRef(false);

  // Keep refs up to date
  onHotspotClickRef.current = onHotspotClick;
  onEditorClickRef.current = onEditorClick;
  onViewerReadyRef.current = onViewerReady;

  // Create projection from panorama URL (equirectangular or cylindrical)
  const projection = useMemo(() => {
    if (!panoramaUrl) return null;
    if (projectionType === 'cylindrical') {
      return new CylindricalProjection({ src: panoramaUrl, partial: true });
    }
    return new EquirectProjection({ src: panoramaUrl });
  }, [panoramaUrl, projectionType]);

  // After viewer is ready, set initial camera position using hfov → zoom conversion
  const handleReady = useCallback((e: { target: any }) => {
    const viewer = e.target;
    const camera = viewer.camera;

    // Convert our horizontal FOV to zoom level
    try {
      const safeHfov = Math.max(50, hfov);
      const zoom = camera.fovToZoom(safeHfov);
      camera.lookAt({ yaw: initialYaw, pitch: initialPitch, zoom });
    } catch (err) {
      // Fallback: just set yaw/pitch
      camera.lookAt({ yaw: initialYaw, pitch: initialPitch });
    }

    initializedRef.current = true;

    // Expose viewer API
    if (onViewerReadyRef.current) {
      onViewerReadyRef.current({
        lookAt: (pitch: number, yaw: number, targetHfov?: number) => {
          try {
            const cam = viewer.camera;
            const lookAtOpts: { yaw: number; pitch: number; zoom?: number } = { yaw, pitch };
            if (targetHfov !== undefined) {
              lookAtOpts.zoom = cam.fovToZoom(Math.max(50, targetHfov));
            }
            cam.lookAt(lookAtOpts);
          } catch (err) { /* viewer may be destroyed */ }
        },
        getView: () => {
          try {
            const cam = viewer.camera;
            // Normalize yaw from egjs 0-360° to -180..180°
            let yaw = cam.yaw % 360;
            if (yaw > 180) yaw -= 360;
            if (yaw < -180) yaw += 360;
            return {
              pitch: cam.pitch,
              yaw,
              hfov: cam.getHorizontalFov(cam.zoom),
            };
          } catch (err) {
            return { pitch: 0, yaw: 0, hfov: 75 };
          }
        },
      });
    }
  }, [initialYaw, initialPitch, hfov]);

  // Update camera when settings change externally (sliders)
  useEffect(() => {
    if (!view360Ref.current || !initializedRef.current) return;
    try {
      const viewer = view360Ref.current.view360;
      const camera = viewer.camera;
      const zoom = camera.fovToZoom(Math.max(50, hfov));
      camera.lookAt({ yaw: initialYaw, pitch: initialPitch, zoom });
    } catch (err) { /* viewer may not be fully loaded yet */ }
  }, [initialPitch, initialYaw, hfov]);

  if (!projection) {
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
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <View360
        ref={view360Ref}
        projection={projection}
        initialYaw={initialYaw}
        initialPitch={initialPitch}
        fov={90}
        hotspot={{ zoom: true }}
        style={{ width: '100%', height: '100%' }}
        onReady={handleReady}
      >
        {/* Hotspots as DOM elements */}
        {!editorMode && (
          <div className="view360-hotspots">
            {hotspots.map((hs) => {
              const isSelected = selectedHotspotId === hs.id;
              return (
                <div
                  key={hs.id}
                  className="view360-hotspot"
                  data-yaw={hs.yaw}
                  data-pitch={hs.pitch}
                  style={{ cursor: 'pointer' }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onHotspotClickRef.current(hs.id);
                  }}
                >
                  <div style={{
                    minWidth: '80px',
                    minHeight: '36px',
                    padding: '6px 12px',
                    backgroundColor: isSelected ? 'rgba(255, 255, 0, 0.4)' : 'rgba(255, 255, 0, 0.25)',
                    border: isSelected ? '2px dashed rgba(245, 158, 11, 0.8)' : '2px dashed rgba(255, 255, 0, 0.7)',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transform: 'translate(-50%, -50%)',
                    fontSize: '13px',
                    fontFamily: 'sans-serif',
                    fontWeight: '600',
                    color: 'white',
                    textShadow: '0 1px 3px rgba(0,0,0,0.6)',
                    whiteSpace: 'nowrap',
                  }}>
                    {hs.text || 'Hotspot'}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </View360>

      {/* Prompt overlay */}
      {prompt && (
        <div style={{
          position: 'absolute',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: promptStyle?.backgroundColor || 'rgba(0, 0, 0, 0.7)',
          color: promptStyle?.color || 'white',
          padding: promptStyle?.padding ?? '10px 24px',
          borderRadius: promptStyle?.borderRadius ?? 8,
          border: promptStyle?.border || 'none',
          fontSize: promptStyle?.fontSize || 16,
          fontFamily: promptStyle?.fontFamily || 'sans-serif',
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          zIndex: 10,
        }}>
          {prompt}
        </div>
      )}
    </div>
  );
};
