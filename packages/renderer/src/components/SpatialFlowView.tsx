import React from 'react';
import type { SlotIntent, SlotIntentResolution } from '@asaps/core';
import type { SpatialSpec } from '../utils/slotLayout';
import type { RenderThemeSettings } from './PositionedBeatView';
import { SlotFlowView } from './SlotFlowView';

interface SpatialFlowViewProps {
  beatType: string;
  /** Image layer + flow slots (schema-driven, from getSpatialSpec). */
  spatial: SpatialSpec;
  content: Record<string, any>;
  theme?: RenderThemeSettings;
  /** Resolved spatial image URL (beat background / map asset). Falls back to
   *  content[spatial.source] when the renderer didn't resolve one. */
  imageUrl?: string | null;
  /** Painted only when there is no image (true letterbox backdrop). */
  backgroundColor: string;
  slotIntent?: SlotIntent;
  onResolve?: (resolutions: SlotIntentResolution[]) => void;
  onAction: (id: string) => void;
  previewWidth?: number;
  previewCoarse?: boolean;
}

/**
 * Phase 3 — the spatial composite (Option A).
 *
 * Two DECOUPLED, independently-wrappable layers:
 *
 *  1. **spatial layer** — a uniformly-scaled image (background / map). With
 *     `fit:'contain'` the whole image shows, letterboxed, so normalized 0–1
 *     hotspot coords (Phase 3c) map onto its rendered rect exactly. This is
 *     the "uniform scale is correct for pictorial content" half.
 *  2. **flow layer** — the real `SlotFlowView` composited over it with a
 *     transparent background, so text/buttons flow + clamp responsively and
 *     are NEVER uniformly scaled with the picture (the load-bearing reason
 *     slot mode exists).
 *
 * The two layers are separate DOM subtrees on purpose: the responsive
 * animation model (designed-ahead, implemented later) will wrap the spatial
 * layer for pan/zoom and the flow slots for enter/exit independently — this
 * primitive must not foreclose that, hence the discrete `data-layer` roots.
 */
export const SpatialFlowView: React.FC<SpatialFlowViewProps> = ({
  beatType,
  spatial,
  content,
  theme,
  imageUrl,
  backgroundColor,
  slotIntent,
  onResolve,
  onAction,
  previewWidth,
  previewCoarse,
}) => {
  const src: string | null =
    imageUrl ?? (typeof content[spatial.source] === 'string' ? content[spatial.source] : null);
  const objectFit = spatial.fit === 'cover' ? 'cover' : 'contain';

  return (
    <div
      data-layer="spatial-composite"
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        background: src ? '#000' : backgroundColor,
      }}
    >
      {/* Layer 1 — uniformly-scaled image (wrappable later for pan/zoom). */}
      {src && (
        <div
          data-layer="spatial"
          style={{ position: 'absolute', inset: 0, zIndex: 0 }}
        >
          <img
            src={src}
            alt=""
            draggable={false}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit,
              objectPosition: 'center',
              userSelect: 'none',
              pointerEvents: 'none',
            }}
          />
          {/* Normalized 0–1 hotspot overlay lands in Phase 3c. */}
        </div>
      )}

      {/* Layer 2 — responsive flow, transparent so the image shows through
          (wrappable later for per-slot enter/exit). */}
      <div
        data-layer="flow"
        style={{ position: 'absolute', inset: 0, zIndex: 1 }}
      >
        <SlotFlowView
          beatType={beatType}
          slots={spatial.slots}
          content={content}
          theme={theme}
          backgroundUrl={null}
          backgroundColor="transparent"
          slotIntent={slotIntent}
          onResolve={onResolve}
          onAction={onAction}
          previewWidth={previewWidth}
          previewCoarse={previewCoarse}
        />
      </div>
    </div>
  );
};
