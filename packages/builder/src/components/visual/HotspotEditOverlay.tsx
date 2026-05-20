/**
 * HotspotEditOverlay — interactive author surface for placing hotspots
 * on the SPATIAL layer (P3-3c-3). Sits ABOVE the read-only SpatialFlowView
 * preview, computes the same letterboxed image rect, lets authors drag
 * to move hotspots or drag a corner to resize. Commits via onChange at
 * pointer-up so undo records one operation per drag.
 *
 * Coords are translated through the image rect, NOT the container —
 * a hotspot dragged here lands on the same picture pixel at any
 * viewport because the on-disk values are normalized 0–1 of the
 * IMAGE rect (matching how SpatialFlowView positions them at runtime).
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { Hotspot } from '@asaps/core';
import { imageRectPx } from '@asaps/renderer';

interface Props {
  imageUrl: string | null | undefined;
  fit: 'contain' | 'cover';
  hotspots: Hotspot[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Fires on every move (live) and on commit (final). */
  onChange: (id: string, next: Pick<Hotspot, 'x' | 'y' | 'width' | 'height'>, commit: boolean) => void;
}

type DragKind =
  | { kind: 'move'; id: string; startX: number; startY: number; origX: number; origY: number }
  | { kind: 'resize'; id: string; corner: 'tl' | 'tr' | 'bl' | 'br'; startX: number; startY: number; orig: { x: number; y: number; w: number; h: number } };

const MIN_NORMALIZED = 0.02; // hotspots smaller than 2% are practically un-clickable

export const HotspotEditOverlay: React.FC<Props> = ({
  imageUrl,
  fit,
  hotspots,
  selectedId,
  onSelect,
  onChange,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [imgAspect, setImgAspect] = useState<number>(0);
  const [drag, setDrag] = useState<DragKind | null>(null);

  // Container size from ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Pre-load the image to capture natural aspect (lets the rect math
  // place hotspots at the LETTERBOXED rect, matching the runtime).
  useEffect(() => {
    if (!imageUrl) {
      setImgAspect(0);
      return;
    }
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth && img.naturalHeight) {
        setImgAspect(img.naturalWidth / img.naturalHeight);
      }
    };
    img.src = imageUrl;
  }, [imageUrl]);

  const rect = imageRectPx(imgAspect, box.w, box.h, fit);

  // Pointer-move: drag handler (live). Commit happens on pointer-up.
  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      if (rect.width <= 0 || rect.height <= 0) return;
      const dx = (e.clientX - drag.startX) / rect.width;
      const dy = (e.clientY - drag.startY) / rect.height;
      if (drag.kind === 'move') {
        const h = hotspots.find(s => s.id === drag.id);
        if (!h) return;
        const nx = Math.max(0, Math.min(1 - h.width, drag.origX + dx));
        const ny = Math.max(0, Math.min(1 - h.height, drag.origY + dy));
        onChange(drag.id, { x: nx, y: ny, width: h.width, height: h.height }, false);
      } else {
        const { x, y, w, h } = drag.orig;
        let nx = x, ny = y, nw = w, nh = h;
        if (drag.corner === 'tl') {
          nx = Math.min(x + w - MIN_NORMALIZED, x + dx);
          ny = Math.min(y + h - MIN_NORMALIZED, y + dy);
          nw = w - (nx - x);
          nh = h - (ny - y);
        } else if (drag.corner === 'tr') {
          ny = Math.min(y + h - MIN_NORMALIZED, y + dy);
          nw = Math.max(MIN_NORMALIZED, w + dx);
          nh = h - (ny - y);
        } else if (drag.corner === 'bl') {
          nx = Math.min(x + w - MIN_NORMALIZED, x + dx);
          nw = w - (nx - x);
          nh = Math.max(MIN_NORMALIZED, h + dy);
        } else {
          nw = Math.max(MIN_NORMALIZED, w + dx);
          nh = Math.max(MIN_NORMALIZED, h + dy);
        }
        // Clamp inside [0,1]
        nx = Math.max(0, Math.min(1 - MIN_NORMALIZED, nx));
        ny = Math.max(0, Math.min(1 - MIN_NORMALIZED, ny));
        nw = Math.min(1 - nx, nw);
        nh = Math.min(1 - ny, nh);
        onChange(drag.id, { x: nx, y: ny, width: nw, height: nh }, false);
      }
    };
    const onUp = () => {
      // Final commit: read the LATEST hotspot value (set during drag) and
      // re-fire with commit:true so the consumer can promote to a command.
      const h = hotspots.find(s => s.id === drag.id);
      if (h) onChange(drag.id, { x: h.x, y: h.y, width: h.width, height: h.height }, true);
      setDrag(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [drag, hotspots, onChange, rect.width, rect.height]);

  const startMove = useCallback((e: React.PointerEvent, hotspot: Hotspot) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect(hotspot.id);
    setDrag({
      kind: 'move',
      id: hotspot.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: hotspot.x,
      origY: hotspot.y,
    });
  }, [onSelect]);

  const startResize = useCallback(
    (e: React.PointerEvent, hotspot: Hotspot, corner: 'tl' | 'tr' | 'bl' | 'br') => {
      e.preventDefault();
      e.stopPropagation();
      setDrag({
        kind: 'resize',
        id: hotspot.id,
        corner,
        startX: e.clientX,
        startY: e.clientY,
        orig: { x: hotspot.x, y: hotspot.y, w: hotspot.width, h: hotspot.height },
      });
    },
    [],
  );

  return (
    <div
      ref={containerRef}
      style={{ position: 'absolute', inset: 0, zIndex: 5 }}
      onPointerDown={(e) => {
        // Clicks on the empty area deselect.
        if (e.target === e.currentTarget) onSelect(null);
      }}
    >
      <div
        // Image-rect anchor — hotspots position relative to this.
        style={{
          position: 'absolute',
          left: rect.x,
          top: rect.y,
          width: rect.width,
          height: rect.height,
        }}
      >
        {hotspots.map((h) => {
          const isSelected = h.id === selectedId;
          const isEllipse = h.shape === 'ellipse';
          return (
            <div
              key={h.id}
              onPointerDown={(e) => startMove(e, h)}
              style={{
                position: 'absolute',
                left: `${h.x * 100}%`,
                top: `${h.y * 100}%`,
                width: `${h.width * 100}%`,
                height: `${h.height * 100}%`,
                background: isSelected
                  ? 'rgba(96, 165, 250, 0.22)'
                  : 'rgba(255, 200, 0, 0.16)',
                border: isSelected
                  ? '2px solid rgba(59, 130, 246, 0.95)'
                  : '2px dashed rgba(255, 200, 0, 0.85)',
                borderRadius: isEllipse ? '50%' : undefined,
                cursor: drag?.kind === 'move' && drag.id === h.id ? 'grabbing' : 'grab',
                touchAction: 'none',
                boxSizing: 'border-box',
              }}
            >
              {/* Label badge */}
              <div
                style={{
                  position: 'absolute',
                  top: 2,
                  left: 4,
                  fontSize: 10,
                  background: 'rgba(0,0,0,0.6)',
                  color: '#fff',
                  padding: '1px 4px',
                  borderRadius: 3,
                  pointerEvents: 'none',
                  userSelect: 'none',
                }}
              >
                {h.label || h.id}
              </div>
              {/* Corner handles — only for the selected hotspot. */}
              {isSelected && (['tl', 'tr', 'bl', 'br'] as const).map((corner) => {
                const pos: React.CSSProperties = {
                  position: 'absolute',
                  width: 10,
                  height: 10,
                  background: '#fff',
                  border: '2px solid rgba(59, 130, 246, 0.95)',
                  borderRadius: 2,
                  cursor: corner === 'tl' || corner === 'br' ? 'nwse-resize' : 'nesw-resize',
                  touchAction: 'none',
                };
                if (corner === 'tl') Object.assign(pos, { left: -6, top: -6 });
                if (corner === 'tr') Object.assign(pos, { right: -6, top: -6 });
                if (corner === 'bl') Object.assign(pos, { left: -6, bottom: -6 });
                if (corner === 'br') Object.assign(pos, { right: -6, bottom: -6 });
                return (
                  <div
                    key={corner}
                    onPointerDown={(e) => startResize(e, h, corner)}
                    style={pos}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};
