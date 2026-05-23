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
import { resolveHotspotRect } from '@asaps/core';
import { imageRectPx } from '@asaps/renderer';

interface Props {
  imageUrl: string | null | undefined;
  fit: 'contain' | 'cover';
  hotspots: Hotspot[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /**
   * Fires on every move (live) and on commit (final). `isPortrait`
   * tells the parent which variant to write: the canonical landscape
   * x/y/width/height, or the `hotspot.portrait` override. The parent
   * is the single source of truth for that mapping — the overlay just
   * forwards the orientation it was rendered for. */
  onChange: (
    id: string,
    next: Pick<Hotspot, 'x' | 'y' | 'width' | 'height'>,
    commit: boolean,
    isPortrait: boolean
  ) => void;
  /**
   * P3-3e — current preview orientation. When true, the overlay
   * renders hotspots at their portrait-override rect (falling back to
   * landscape when no override exists) and routes edits back as the
   * portrait variant. The parent decides whether the override is
   * created on first edit. */
  isPortrait?: boolean;
  /**
   * P3-3c-5 — fires when the author finishes drawing a new rectangle on
   * empty image area. The caller decides which choice gets it (typically:
   * first choice without a hotspot, else a freshly-added choice). Returns
   * the new hotspot id so the overlay can auto-select it.
   */
  onCreate?: (rect: { x: number; y: number; width: number; height: number }) => string | null;
  /**
   * P3-3c-6 — fires when the author presses Backspace/Delete on a
   * selected hotspot. The caller strips choice.hotspot but keeps the
   * choice itself.
   */
  onDelete?: (id: string) => void;
  /**
   * P3-3c-12 — set of hotspot ids whose choice has a nested dialogNode
   * (dialogTree only). Each such hotspot gets a small "Step in" badge;
   * clicking it fires onStepInto. Other beat types omit this prop and
   * the badges don't render.
   */
  stepIntoIds?: Set<string>;
  onStepInto?: (id: string) => void;
}

type DragKind =
  | { kind: 'move'; id: string; startX: number; startY: number; origX: number; origY: number }
  | { kind: 'resize'; id: string; corner: 'tl' | 'tr' | 'bl' | 'br'; startX: number; startY: number; orig: { x: number; y: number; w: number; h: number } }
  | { kind: 'create'; startX: number; startY: number; cur: { x: number; y: number; w: number; h: number } };

const MIN_NORMALIZED = 0.02; // hotspots smaller than 2% are practically un-clickable

export const HotspotEditOverlay: React.FC<Props> = ({
  imageUrl,
  fit,
  hotspots,
  selectedId,
  onSelect,
  onChange,
  onCreate,
  onDelete,
  stepIntoIds,
  onStepInto,
  isPortrait = false,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [imgAspect, setImgAspect] = useState<number>(0);
  const [drag, setDrag] = useState<DragKind | null>(null);

  // Container size from ResizeObserver. P3-3e — orientationchange also
  // listened explicitly so the editor's image rect stays in sync when
  // the author switches the VE viewport orientation (the ResizeObserver
  // fires on the W↔H swap too, but on some devices the layout settles
  // a frame after the resize event lands; rAF on orientationchange
  // makes the re-resolve deterministic).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    const onOrient = () => requestAnimationFrame(() => {
      if (containerRef.current) update();
    });
    window.addEventListener('orientationchange', onOrient);
    const mq = window.matchMedia?.('(orientation: portrait)');
    mq?.addEventListener?.('change', onOrient);
    return () => {
      ro.disconnect();
      window.removeEventListener('orientationchange', onOrient);
      mq?.removeEventListener?.('change', onOrient);
    };
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

  // P3-3c-6 — Backspace / Delete removes the selected hotspot. Skip when
  // focus is in a form input so the inspector text fields stay editable.
  useEffect(() => {
    if (!selectedId || !onDelete) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = (t?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || t?.isContentEditable) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        onDelete(selectedId);
        onSelect(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, onDelete, onSelect]);

  // P3-3c-7 — inspector ⇄ canvas hover link. Inspector dispatches
  // asaps:choiceHover with detail.id (or null) when a choice card is
  // hovered; we mirror that into local state to brighten the matching
  // hotspot. The canvas hover (below, on each hotspot rect) dispatches
  // the same event so the inspector can highlight in reverse.
  const [externalHoverId, setExternalHoverId] = useState<string | null>(null);
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { id?: string | null } | undefined;
      setExternalHoverId(detail?.id ?? null);
    };
    window.addEventListener('asaps:choiceHover', handler);
    return () => window.removeEventListener('asaps:choiceHover', handler);
  }, []);
  const dispatchHover = (id: string | null) => {
    window.dispatchEvent(new CustomEvent('asaps:hotspotHover', { detail: { id } }));
  };

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
        // Read the variant's own width/height when constraining, so a
        // portrait override with different dimensions clamps correctly.
        const cur = resolveHotspotRect(h, isPortrait);
        const nx = Math.max(0, Math.min(1 - cur.width, drag.origX + dx));
        const ny = Math.max(0, Math.min(1 - cur.height, drag.origY + dy));
        onChange(
          drag.id,
          { x: nx, y: ny, width: cur.width, height: cur.height },
          false,
          isPortrait
        );
      } else if (drag.kind === 'resize') {
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
        nx = Math.max(0, Math.min(1 - MIN_NORMALIZED, nx));
        ny = Math.max(0, Math.min(1 - MIN_NORMALIZED, ny));
        nw = Math.min(1 - nx, nw);
        nh = Math.min(1 - ny, nh);
        onChange(drag.id, { x: nx, y: ny, width: nw, height: nh }, false, isPortrait);
      } else {
        // create — track the live rectangle from start point to current.
        const newW = Math.abs(dx);
        const newH = Math.abs(dy);
        const newX = Math.max(0, Math.min(1, drag.cur.x + Math.min(dx, 0)));
        const newY = Math.max(0, Math.min(1, drag.cur.y + Math.min(dy, 0)));
        setDrag({ ...drag, cur: { x: newX, y: newY, w: newW, h: newH } });
      }
    };
    const onUp = () => {
      if (drag.kind === 'create') {
        const { w, h } = drag.cur;
        // Require a real drag (≥ MIN_NORMALIZED in each axis) — bare clicks
        // already deselect via the empty-area click handler.
        if (w >= MIN_NORMALIZED && h >= MIN_NORMALIZED && onCreate) {
          const clampedW = Math.min(1 - drag.cur.x, w);
          const clampedH = Math.min(1 - drag.cur.y, h);
          const id = onCreate({
            x: drag.cur.x,
            y: drag.cur.y,
            width: clampedW,
            height: clampedH,
          });
          if (id) onSelect(id);
        }
        setDrag(null);
        return;
      }
      const h = hotspots.find(s => s.id === drag.id);
      if (h) {
        const cur = resolveHotspotRect(h, isPortrait);
        onChange(
          drag.id,
          { x: cur.x, y: cur.y, width: cur.width, height: cur.height },
          true,
          isPortrait
        );
      }
      setDrag(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [drag, hotspots, onChange, onCreate, onSelect, rect.width, rect.height]);

  const startMove = useCallback((e: React.PointerEvent, hotspot: Hotspot) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect(hotspot.id);
    const cur = resolveHotspotRect(hotspot, isPortrait);
    setDrag({
      kind: 'move',
      id: hotspot.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: cur.x,
      origY: cur.y,
    });
  }, [onSelect, isPortrait]);

  const startResize = useCallback(
    (e: React.PointerEvent, hotspot: Hotspot, corner: 'tl' | 'tr' | 'bl' | 'br') => {
      e.preventDefault();
      e.stopPropagation();
      const cur = resolveHotspotRect(hotspot, isPortrait);
      setDrag({
        kind: 'resize',
        id: hotspot.id,
        corner,
        startX: e.clientX,
        startY: e.clientY,
        orig: { x: cur.x, y: cur.y, w: cur.width, h: cur.height },
      });
    },
    [isPortrait],
  );

  // P3-3c-5 — pointerdown on the image rect (but NOT on an existing
  // hotspot) starts drawing a new rectangle. Bare clicks deselect; a
  // real drag commits to onCreate at pointer-up.
  const handleEmptyPointerDown = (e: React.PointerEvent) => {
    if (e.target !== e.currentTarget) return; // only the image-rect surface
    if (rect.width <= 0 || rect.height <= 0) return;
    onSelect(null);
    if (!onCreate) return; // creation disabled — just deselect
    const bcr = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - bcr.left) / bcr.width;
    const y = (e.clientY - bcr.top) / bcr.height;
    setDrag({
      kind: 'create',
      startX: e.clientX,
      startY: e.clientY,
      cur: { x, y, w: 0, h: 0 },
    });
  };

  return (
    <div
      ref={containerRef}
      style={{ position: 'absolute', inset: 0, zIndex: 5 }}
      onPointerDown={(e) => {
        // Clicks on the OUTER (letterbox bar) area deselect. Empty image
        // area starts a draw — handled by the inner div below.
        if (e.target === e.currentTarget) onSelect(null);
      }}
    >
      <div
        // Image-rect anchor — hotspots position relative to this.
        onPointerDown={handleEmptyPointerDown}
        style={{
          position: 'absolute',
          left: rect.x,
          top: rect.y,
          width: rect.width,
          height: rect.height,
          cursor: onCreate ? 'crosshair' : 'default',
        }}
      >
        {/* Live draw preview — only visible during a create drag. */}
        {drag?.kind === 'create' && drag.cur.w > 0.001 && drag.cur.h > 0.001 && (
          <div
            style={{
              position: 'absolute',
              left: `${drag.cur.x * 100}%`,
              top: `${drag.cur.y * 100}%`,
              width: `${drag.cur.w * 100}%`,
              height: `${drag.cur.h * 100}%`,
              border: '2px dashed rgba(59, 130, 246, 0.95)',
              background: 'rgba(96, 165, 250, 0.16)',
              pointerEvents: 'none',
              boxSizing: 'border-box',
            }}
          />
        )}
        {hotspots.map((h) => {
          const isSelected = h.id === selectedId;
          const isExternalHover = h.id === externalHoverId;
          const isEllipse = h.shape === 'ellipse';
          // Render against the resolved variant for this orientation.
          // No portrait override yet → falls back to the canonical rect
          // (matches the runtime's behavior exactly).
          const cur = resolveHotspotRect(h, isPortrait);
          return (
            <div
              key={h.id}
              onPointerDown={(e) => startMove(e, h)}
              onPointerEnter={() => dispatchHover(h.id)}
              onPointerLeave={() => dispatchHover(null)}
              style={{
                position: 'absolute',
                left: `${cur.x * 100}%`,
                top: `${cur.y * 100}%`,
                width: `${cur.width * 100}%`,
                height: `${cur.height * 100}%`,
                background: isSelected
                  ? 'rgba(96, 165, 250, 0.22)'
                  : isExternalHover
                    ? 'rgba(34, 197, 94, 0.22)' // hover-link tint
                    : 'rgba(255, 200, 0, 0.16)',
                border: isSelected
                  ? '2px solid rgba(59, 130, 246, 0.95)'
                  : isExternalHover
                    ? '2px solid rgba(34, 197, 94, 0.95)'
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
              {/* P3-3c-12 — Step-in badge for hotspots whose choice has a
                  nested dialogNode (dialogTree only). Clicking it descends
                  into the nested node so the canvas + breadcrumb update.
                  pointerDown stopPropagation prevents the click from
                  starting a hotspot move-drag. */}
              {stepIntoIds?.has(h.id) && onStepInto && (
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onStepInto(h.id);
                  }}
                  title="Step into this choice's nested dialog"
                  style={{
                    position: 'absolute',
                    top: 2,
                    right: 4,
                    fontSize: 10,
                    background: 'rgba(59, 130, 246, 0.95)',
                    color: '#fff',
                    padding: '1px 6px',
                    borderRadius: 3,
                    border: 'none',
                    cursor: 'pointer',
                    pointerEvents: 'auto',
                    userSelect: 'none',
                  }}
                >
                  Step in →
                </button>
              )}
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
