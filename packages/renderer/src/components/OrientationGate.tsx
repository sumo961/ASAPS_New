import React from 'react';

export type OrientationPolicy = 'flexible' | 'portrait' | 'landscape';

interface OrientationGateProps {
  /** Project orientation policy. 'flexible' = no gating. */
  orientation: OrientationPolicy;
  children: React.ReactNode;
}

/**
 * P2.5 — orientation lock for the player.
 *
 * `screen.orientation.lock()` is unreliable on mobile web (only works
 * fullscreen / installed PWA, fails in normal Safari/Chrome), so instead of
 * forcing the device we **gate the view**: when the project is locked to an
 * orientation and the device is held the other way, a full-screen "rotate
 * your device" overlay is drawn on top and interaction is blocked. The story
 * stays MOUNTED underneath (state preserved) but is visually covered, so the
 * author's layout is never *presented* in the unsupported orientation; on
 * rotate-back the overlay clears and the (responsive) layout is correct.
 *
 * `flexible` renders children untouched — width-responsiveness is always on
 * regardless; this only ever locks the orientation axis.
 */
export const OrientationGate: React.FC<OrientationGateProps> = ({ orientation, children }) => {
  const locked = orientation === 'portrait' || orientation === 'landscape';

  const getCurrent = (): 'portrait' | 'landscape' => {
    if (typeof window === 'undefined' || !window.matchMedia) return 'portrait';
    return window.matchMedia('(orientation: portrait)').matches ? 'portrait' : 'landscape';
  };

  const [current, setCurrent] = React.useState<'portrait' | 'landscape'>(getCurrent);

  React.useEffect(() => {
    if (!locked || typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(orientation: portrait)');
    const update = () => setCurrent(mq.matches ? 'portrait' : 'landscape');
    update();
    // Safari < 14 only supports addListener.
    if (mq.addEventListener) mq.addEventListener('change', update);
    else mq.addListener(update);
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', update);
      else mq.removeListener(update);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, [locked]);

  const mustRotate = locked && current !== orientation;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {children}
      {mustRotate && (
        <div
          role="alert"
          aria-label={`Please rotate your device to ${orientation}`}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 2147483600,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 20,
            textAlign: 'center',
            padding: 32,
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%)',
            color: '#fff',
            fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
            userSelect: 'none',
            touchAction: 'none',
          }}
        >
          <div
            aria-hidden
            style={{
              fontSize: 56,
              lineHeight: 1,
              animation: 'asaps-rotate-hint 1.8s ease-in-out infinite',
            }}
          >
            ↻
          </div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>
            Please rotate your device
          </div>
          <div style={{ fontSize: 14, opacity: 0.8, maxWidth: 320 }}>
            This story is designed for{' '}
            <strong>{orientation}</strong> orientation.
          </div>
          <style>{`
            @keyframes asaps-rotate-hint {
              0%, 100% { transform: rotate(0deg); }
              50% { transform: rotate(${orientation === 'landscape' ? '-90deg' : '90deg'}); }
            }
          `}</style>
        </div>
      )}
    </div>
  );
};
