/**
 * ARMarkerScene — MindAR-driven marker tracking (Phase 1b).
 *
 * Loads mind-ar at runtime via the CDN loader (`mindarLoader.ts`) to
 * bypass the Three.js version conflict that prevents the npm package
 * from bundling cleanly. The CDN bundle ships its own Three.js
 * internally; we only consume its public API surface.
 *
 * Phase 1b deliberately keeps the anchor UI as DOM overlays rather
 * than WebGL meshes:
 *  - MindAR's Anchor object dispatches `onTargetFound` / `onTargetLost`
 *    callbacks. We toggle the matching overlay's visibility on those
 *    events — the card appears when the camera sees the marker and
 *    disappears when it leaves the frame.
 *  - Card positioning stays in screen-space (centered) instead of
 *    being pinned to the tracked marker's 3D matrix. This is a
 *    deliberate Phase 1b compromise: it keeps tap handling as
 *    standard DOM (no raycasting), which is sufficient for "tap to
 *    reveal" mechanics. Phase 1c can swap in a CSS3DRenderer for
 *    true marker-pinned overlays if the use case demands it.
 *
 * Cleanup must stop MindAR before stopping camera tracks, otherwise
 * we hold a phantom MediaStreamTrack reference that blocks the
 * camera for the rest of the session.
 */
import React, { useEffect, useRef, useState } from 'react';
import type { ARAnchorProp } from './ARSceneElement';
import { loadMindAR } from '../utils/mindarLoader';

export interface ARMarkerSceneProps {
  markerUrl: string;
  anchors: ARAnchorProp[];
  onAction: (value: string) => void;
  /** Called when MindAR fails to load / start so the parent can
   *  fall back to the Phase 1a screen-space card layout. */
  onFallback: () => void;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'starting' }
  | { kind: 'tracking'; visibleIds: Set<string> }
  | { kind: 'error'; reason: string };

export const ARMarkerScene: React.FC<ARMarkerSceneProps> = ({
  markerUrl,
  anchors,
  onAction,
  onFallback,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mindarRef = useRef<any>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      let MindARThree: any;
      try {
        const m = await loadMindAR();
        MindARThree = m.MindARThree;
      } catch (err) {
        if (cancelled) return;
        console.warn('[ARMarkerScene] mind-ar load failed; falling back', err);
        setState({ kind: 'error', reason: String((err as any)?.message || err) });
        return;
      }

      if (cancelled || !containerRef.current) return;

      setState({ kind: 'starting' });

      // uiLoading/uiScanning/uiError = 'no' suppresses MindAR's
      // built-in overlay UI so we render our own (consistent look
      // with QRScanElement / WebViewElement).
      let mindar: any;
      try {
        mindar = new MindARThree({
          container: containerRef.current,
          imageTargetSrc: markerUrl,
          uiLoading: 'no',
          uiScanning: 'no',
          uiError: 'no',
        });
      } catch (err) {
        setState({ kind: 'error', reason: String((err as any)?.message || err) });
        return;
      }
      mindarRef.current = mindar;

      // Register one MindAR anchor per author-defined anchor. They
      // share targetIndex 0 in Phase 1b — single-marker mode. Future
      // Phase 1c can split markers across multiple .mind files and
      // map each anchor to its own targetIndex.
      const anchorMap = new Map<string, any>(); // id → mindar.anchor
      anchors.forEach((a) => {
        const mindarAnchor = mindar.addAnchor(0);
        mindarAnchor.onTargetFound = () => {
          setState((prev) => {
            if (prev.kind !== 'tracking') return { kind: 'tracking', visibleIds: new Set([a.id]) };
            const next = new Set(prev.visibleIds);
            next.add(a.id);
            return { kind: 'tracking', visibleIds: next };
          });
        };
        mindarAnchor.onTargetLost = () => {
          setState((prev) => {
            if (prev.kind !== 'tracking') return prev;
            const next = new Set(prev.visibleIds);
            next.delete(a.id);
            return { kind: 'tracking', visibleIds: next };
          });
        };
        anchorMap.set(a.id, mindarAnchor);
      });

      try {
        await mindar.start();
        if (cancelled) return;
        // The visibleIds starts empty — MindAR fires onTargetFound on
        // first detection.
        setState({ kind: 'tracking', visibleIds: new Set() });
      } catch (err) {
        setState({ kind: 'error', reason: String((err as any)?.message || err) });
        return;
      }

      cleanupRef.current = () => {
        try { mindar.stop(); } catch { /* ignore */ }
        mindarRef.current = null;
      };
    })();

    return () => {
      cancelled = true;
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
    // marker/anchor changes during a live AR session aren't supported;
    // the parent dismounts/remounts instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
      }}
    >
      {(state.kind === 'loading' || state.kind === 'starting') && (
        <div style={overlayStyle}>
          {state.kind === 'loading' ? 'Loading AR tracker…' : 'Starting camera…'}
        </div>
      )}
      {state.kind === 'error' && (
        <div style={overlayStyle}>
          <div>AR tracker unavailable: {state.reason}</div>
          <button
            type="button"
            onClick={onFallback}
            style={fallbackButtonStyle}
          >
            Use simple overlay
          </button>
        </div>
      )}
      {/* Visible anchors — appear only while their target is in view.
          Tap fires onAction(onTap || id) and the parent resolves. */}
      {state.kind === 'tracking' && anchors.map((a) => {
        if (!state.visibleIds.has(a.id)) return null;
        const cx = ((a.offsetX ?? 0) + 1) * 0.5;
        const cy = ((a.offsetY ?? 0) + 1) * 0.5;
        const scale = a.scale ?? 1;
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => onAction(a.onTap || a.id)}
            style={{
              position: 'absolute',
              left: `${cx * 100}%`,
              top: `${cy * 100}%`,
              transform: `translate(-50%, -50%) scale(${scale})`,
              padding: '10px 14px',
              background: 'rgba(255,255,255,0.92)',
              color: '#111',
              border: '2px solid rgba(255,255,255,1)',
              borderRadius: 10,
              boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
              cursor: 'pointer',
              maxWidth: 220,
              textAlign: 'center',
              zIndex: 5,
            }}
          >
            {a.imageUrl && (
              <img
                src={a.imageUrl}
                alt=""
                draggable={false}
                style={{ width: '100%', maxWidth: 120, display: 'block', marginBottom: 4 }}
              />
            )}
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {a.label || a.id}
            </div>
          </button>
        );
      })}
      {/* When tracking but no markers visible, surface a small hint
          so the player knows to point at the marker. */}
      {state.kind === 'tracking' && state.visibleIds.size === 0 && (
        <div style={hintStyle}>
          Aim at the marker
        </div>
      )}
    </div>
  );
};

const overlayStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(0,0,0,0.6)',
  color: '#fff',
  fontSize: 'clamp(13px, 1.4vw, 16px)',
  textAlign: 'center',
  padding: 16,
};

const fallbackButtonStyle: React.CSSProperties = {
  marginTop: 12,
  padding: '6px 14px',
  background: 'rgba(255,255,255,0.9)',
  color: '#111',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
};

const hintStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 16,
  left: '50%',
  transform: 'translateX(-50%)',
  padding: '6px 14px',
  background: 'rgba(0,0,0,0.55)',
  color: '#fff',
  borderRadius: 16,
  fontSize: 13,
  pointerEvents: 'none',
};
