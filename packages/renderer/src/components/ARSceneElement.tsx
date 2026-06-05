/**
 * ARSceneElement — Phase 1a scaffolding for the arBeat. The full
 * MindAR integration (image-target tracking + WebGL anchor overlays)
 * lands in Phase 1b; this file gives the beat a working runtime with
 * camera + tappable anchor cards so authors can wire and test the
 * routing flow today, then upgrade to real AR without touching beat
 * code.
 *
 * Lifecycle:
 *  1. mount → request camera via WebPermissionManager
 *  2. acquire MediaStream (rear camera hint)
 *  3. mount <video> as background
 *  4. lay anchor cards over the video at their offsetX/offsetY (in
 *     normalized 0..1 stage space). Each card is tappable; onTap
 *     resolves with the anchor's onTap value.
 *  5. unmount → stop tracks
 *
 * Reserved onAction sentinels: 'cancelled' (player tapped Skip),
 * 'permission_denied' (camera refused). Anything else is the tapped
 * anchor's onTap value (asaps:// URI or bare beat id).
 *
 * Phase 1b will replace the static overlay layer with a MindAR-driven
 * WebGL scene that pins anchors to a tracked marker. The IRenderer
 * surface and prop shape stay the same — only the inside changes.
 */
import React, { useEffect, useRef, useState } from 'react';
import { webPermissionManager } from '../utils/webPermissionManager';

export interface ARAnchorProp {
  id: string;
  label?: string;
  imageUrl?: string;
  anchoredTo?: string;
  offsetX?: number;
  offsetY?: number;
  scale?: number;
  onTap?: string;
}

export interface ARSceneElementProps {
  trackingMode?: 'marker' | 'world' | 'face';
  markerUrl?: string;
  anchors: ARAnchorProp[];
  cancelButtonText?: string;
  onAction: (value: string) => void;
  theme?: {
    buttonBg?: string;
    buttonText?: string;
    buttonBorder?: string;
  };
}

type State =
  | { kind: 'init' }
  | { kind: 'requesting' }
  | { kind: 'scanning' }
  | { kind: 'denied' }
  | { kind: 'unavailable'; reason: string };

export const ARSceneElement: React.FC<ARSceneElementProps> = ({
  trackingMode = 'marker',
  markerUrl,
  anchors,
  cancelButtonText = 'Skip',
  onAction,
  theme,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const resolvedRef = useRef(false);
  const [state, setState] = useState<State>({ kind: 'init' });
  // Phase 1b TODO — replace the screen-space anchor cards with
  // marker-pinned overlays. First attempt used mind-ar via npm but
  // mind-ar imports `sRGBEncoding` from `three`, which Three removed
  // in r152; the renderer's transitive three is 0.179. Options:
  //   1. Wait for mind-ar to fix the bundled sRGBEncoding reference
  //   2. Load mind-ar via a CDN script tag at runtime (bypasses our
  //      Vite/Three so its bundle uses its own bundled three)
  //   3. Switch to a different AR library (AR.js + jsartoolkit, or
  //      a WebXR-native flow when iOS support catches up)
  // Schema + IRenderer.renderAR + 'ar' slot role + ARBeat routing
  // are all in place; only the inside of this component needs to
  // change when Phase 1b lands.

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  };

  const resolveOnce = (value: string) => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    stopStream();
    onAction(value);
  };

  // Camera acquisition — identical to QRScanElement so the permission
  // flow stays consistent across all camera-using beats.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState({ kind: 'requesting' });
      const status = await webPermissionManager.request('camera');
      if (cancelled) return;
      if (status === 'denied') {
        setState({ kind: 'denied' });
        return;
      }
      if (status === 'unavailable') {
        setState({ kind: 'unavailable', reason: 'Camera not available on this device.' });
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => { /* autoplay block ok */ });
        }
        setState({ kind: 'scanning' });
      } catch (err: any) {
        if (cancelled) return;
        const name = String(err?.name || '');
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          setState({ kind: 'denied' });
        } else {
          setState({ kind: 'unavailable', reason: err?.message || 'Could not start camera.' });
        }
      }
    })();
    return () => {
      cancelled = true;
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancelButton = (
    <button
      type="button"
      onClick={() => resolveOnce(state.kind === 'denied' || state.kind === 'unavailable' ? 'permission_denied' : 'cancelled')}
      style={{
        marginTop: 'clamp(8px, 2vh, 16px)',
        padding: 'clamp(8px, 1.5vh, 14px) clamp(16px, 4vw, 32px)',
        fontSize: 'clamp(14px, 1.6vw, 18px)',
        background: theme?.buttonBg ?? 'rgba(0,0,0,0.6)',
        color: theme?.buttonText ?? '#fff',
        border: `2px solid ${theme?.buttonBorder ?? 'rgba(255,255,255,0.4)'}`,
        borderRadius: 8,
        cursor: 'pointer',
      }}
    >
      {cancelButtonText}
    </button>
  );

  if (state.kind === 'denied') {
    return (
      <div style={containerStyle}>
        <div style={messageStyle}>
          📷 Camera access was denied.
          <div style={{ fontSize: '0.85em', opacity: 0.8, marginTop: 8 }}>
            AR scenes need camera access. Allow it in your browser settings to continue.
          </div>
        </div>
        {cancelButton}
      </div>
    );
  }
  if (state.kind === 'unavailable') {
    return (
      <div style={containerStyle}>
        <div style={messageStyle}>📷 {state.reason}</div>
        {cancelButton}
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={frameStyle}>
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            background: 'black',
          }}
        />
        {/* Phase 1a anchor overlay layer — flat 2D cards positioned in
            normalized 0..1 stage space. Phase 1b swaps this for a
            MindAR-driven canvas that tracks the marker. Prop shape
            stays the same so the beat code doesn't need to change.
            Coordinates default to centered (0.5, 0.5) when offsets
            are missing. */}
        {state.kind === 'scanning' && anchors.map(a => {
          const cx = ((a.offsetX ?? 0) + 1) * 0.5; // -1..1 → 0..1
          const cy = ((a.offsetY ?? 0) + 1) * 0.5;
          const scale = a.scale ?? 1;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => resolveOnce(a.onTap || a.id)}
              style={{
                position: 'absolute',
                left: `${cx * 100}%`,
                top: `${cy * 100}%`,
                transform: `translate(-50%, -50%) scale(${scale})`,
                padding: '10px 14px',
                background: 'rgba(255,255,255,0.9)',
                color: '#111',
                border: '2px solid rgba(255,255,255,1)',
                borderRadius: 10,
                boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
                cursor: 'pointer',
                maxWidth: 200,
                textAlign: 'center',
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
              {a.label && (
                <div style={{ fontSize: 13, fontWeight: 600 }}>{a.label}</div>
              )}
              {!a.label && !a.imageUrl && (
                <div style={{ fontSize: 13, fontWeight: 600 }}>{a.id}</div>
              )}
            </button>
          );
        })}
        {(state.kind === 'requesting') && (
          <div style={overlayMessageStyle}>Requesting camera…</div>
        )}
        {/* Phase 1a — note that marker tracking is not yet active.
            Once MindAR is integrated in Phase 1b this notice goes
            away and the anchors will pin to the tracked marker. */}
        {state.kind === 'scanning' && trackingMode === 'marker' && !markerUrl && (
          <div style={noticeStyle}>
            ⚠ No marker asset configured yet — anchors are positioned in screen space.
          </div>
        )}
        {state.kind === 'scanning' && trackingMode === 'marker' && markerUrl && (
          <div style={noticeStyle}>
            🥽 Marker tracking — Phase 1b
          </div>
        )}
      </div>
      {cancelButton}
    </div>
  );
};

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  width: '100%',
};

const frameStyle: React.CSSProperties = {
  position: 'relative',
  width: 'min(95%, 720px)',
  aspectRatio: '4 / 3',
  borderRadius: 12,
  overflow: 'hidden',
  background: 'rgba(0,0,0,0.6)',
  border: '2px solid rgba(255,255,255,0.25)',
};

const messageStyle: React.CSSProperties = {
  padding: '24px 32px',
  background: 'rgba(0,0,0,0.6)',
  color: '#fff',
  borderRadius: 10,
  fontSize: 'clamp(14px, 1.6vw, 18px)',
  textAlign: 'center',
  maxWidth: '80%',
};

const overlayMessageStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(0,0,0,0.55)',
  color: '#fff',
  fontSize: 'clamp(14px, 1.6vw, 18px)',
};

const noticeStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 8,
  left: 8,
  padding: '4px 10px',
  background: 'rgba(0,0,0,0.65)',
  color: '#fff',
  borderRadius: 6,
  fontSize: 11,
  fontFamily: 'monospace',
};

export default ARSceneElement;
