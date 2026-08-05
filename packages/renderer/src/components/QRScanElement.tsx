/**
 * QRScanElement — live camera preview with a per-frame QR decode pass.
 *
 * Lifecycle:
 *  1. mount → request camera permission via WebPermissionManager
 *  2. acquire MediaStream (facing-mode hint, but the browser/OS gets
 *     the final say — front camera is the only option on most laptops)
 *  3. on each animation frame, draw the video frame to an offscreen
 *     canvas, hand the ImageData to jsQR. First successful decode
 *     resolves via onDecode(value). If matchPatterns are configured,
 *     only matching codes resolve — non-matches are ignored so the
 *     player can keep aiming.
 *  4. unmount → stop tracks, cancel rAF, release the canvas
 *
 * Reserved onDecode sentinels: 'cancelled' (user pressed cancel),
 * 'permission_denied' (camera was refused or unavailable). Anything
 * else is the decoded payload.
 *
 * The element renders its own permission / error states inline so the
 * outer beat doesn't need a separate fallback UI. Permission denial
 * shows a short message with the cancel button; the beat advances to
 * its target on cancel via the standard onDecode path.
 */
import React, { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { webPermissionManager } from '../utils/webPermissionManager';

export interface QRScanElementProps {
  /** Which camera to prefer ('rear' = environment, 'front' = user). */
  facing?: 'rear' | 'front';
  /** Optional regex patterns — only codes that match resolve. */
  matchPatterns?: string[];
  /** Small helper text shown over the scan target. */
  helperText?: string;
  /** Cancel button label. */
  cancelButtonText?: string;
  /** Resolves with the decoded value, or the literal sentinel
   *  'cancelled' / 'permission_denied'. */
  onDecode: (value: string) => void;
  /** Optional theme hooks (cancel button styling). */
  theme?: {
    buttonBg?: string;
    buttonText?: string;
    buttonBorder?: string;
    pageText?: string;
  };
}

type State =
  | { kind: 'init' }
  | { kind: 'requesting' }
  | { kind: 'scanning' }
  | { kind: 'denied' }
  | { kind: 'unavailable'; reason: string };

export const QRScanElement: React.FC<QRScanElementProps> = ({
  facing = 'rear',
  matchPatterns,
  helperText,
  cancelButtonText = 'Cancel',
  onDecode,
  theme,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const resolvedRef = useRef(false);
  const [state, setState] = useState<State>({ kind: 'init' });

  // Compile match patterns once. Invalid regex → ignore that one
  // entry but keep the others (don't punish the whole scan for one
  // typo). An empty list means accept anything.
  const compiledPatterns = React.useMemo(() => {
    if (!matchPatterns || matchPatterns.length === 0) return null;
    const out: RegExp[] = [];
    for (const src of matchPatterns) {
      try { out.push(new RegExp(src)); }
      catch (e) { console.warn(`[QRScanElement] invalid pattern "${src}": ${e}`); }
    }
    return out.length > 0 ? out : null;
  }, [matchPatterns]);

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const resolveOnce = (value: string) => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    stopStream();
    onDecode(value);
  };

  // Permission + stream acquisition. One-shot on mount.
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
      // Acquire the actual stream (request() released its preview).
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: facing === 'rear' ? { ideal: 'environment' } : { ideal: 'user' },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => { /* autoplay blocked is fine */ });
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
    // facing changes are uncommon and would require a full re-acquire;
    // ignoring it here keeps the scan stable. Authors changing facing
    // mid-beat is not a supported flow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Decode loop — runs only while scanning.
  useEffect(() => {
    if (state.kind !== 'scanning') return;
    const video = videoRef.current;
    const canvas = canvasRef.current ?? document.createElement('canvas');
    canvasRef.current = canvas;
    if (!video) return;

    const tick = () => {
      if (resolvedRef.current) return;
      if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
          if (code && code.data) {
            if (!compiledPatterns) {
              resolveOnce(code.data);
              return;
            }
            const matched = compiledPatterns.some(re => re.test(code.data));
            if (matched) {
              resolveOnce(code.data);
              return;
            }
            // Non-matching code — ignore, keep scanning.
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
    // compiledPatterns identity is stable per matchPatterns input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.kind]);

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
            Allow camera access in your browser settings and reload to scan.
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
        {/* Scan reticle overlay */}
        <div style={reticleStyle} />
        {(state.kind === 'requesting') && (
          <div style={overlayMessageStyle}>Requesting camera…</div>
        )}
      </div>
      {helperText && (
        <div
          style={{
            marginTop: 'clamp(6px, 1.2vh, 10px)',
            fontSize: 'clamp(12px, 1.4vw, 16px)',
            opacity: 0.85,
            textAlign: 'center',
          }}
        >
          {helperText}
        </div>
      )}
      {cancelButton}
    </div>
  );
};

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
};

const frameStyle: React.CSSProperties = {
  position: 'relative',
  width: 'min(80%, 480px)',
  aspectRatio: '4 / 3',
  borderRadius: 12,
  overflow: 'hidden',
  background: 'rgba(0,0,0,0.6)',
  border: '2px solid rgba(255,255,255,0.25)',
};

const reticleStyle: React.CSSProperties = {
  position: 'absolute',
  inset: '15%',
  border: '3px solid rgba(255,255,255,0.85)',
  borderRadius: 8,
  boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)',
  pointerEvents: 'none',
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

export default QRScanElement;
