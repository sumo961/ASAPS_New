/**
 * MoodPad — 2D representation of a character's mood on Russell's circumplex
 * (valence × arousal). The classic affect-research visualization: a square
 * SVG canvas with a circle inscribed, valence running left → right, arousal
 * running bottom → top, axis labels at the cardinals, and a dot at the
 * character's current mood.
 *
 * Two modes:
 *   - read-only (default): pure render. Used in CharacterAffectPanel.
 *   - interactive (`onChange` provided): click / drag inside the pad to set
 *     mood. Used in CharacterEditor's "Initial mood" section so authors can
 *     pick a starting mood by feel rather than tuning two sliders.
 *
 * Optional emotion markers: when `palette` is provided, each emotion is
 * placed at (weightToValence, weightToArousal) so the author sees where each
 * emotion lives in mood-space. Same data the runtime uses to nudge mood when
 * an emotion fires (Step 5), so the markers are accurate, not decorative.
 */

import React, { useCallback, useRef } from 'react';
import type { EmotionDefinition } from '@asaps/core';

export interface MoodPadProps {
  valence: number;
  arousal: number;
  /** When set, the pad is interactive — clicks / drags call this with the
   *  new (valence, arousal). Both axes clamped into [-1, 1] before emit. */
  onChange?: (next: { valence: number; arousal: number }) => void;
  /** Optional emotion palette — if provided, each entry is plotted at its
   *  (weightToValence, weightToArousal) so authors see the emotional
   *  geography of the project. Pass at most ~12 entries to stay legible. */
  palette?: ReadonlyArray<EmotionDefinition>;
  /** Pixel size (square). Default 180. */
  size?: number;
  /** Optional title rendered above the disc. */
  title?: string;
  /** When true, axis word-labels at the cardinals (sad / happy / calm /
   *  excited) are rendered. Default true. */
  showLabels?: boolean;
  /** Extra subtitle line under the disc, e.g. the qualitative description. */
  subtitle?: string;
  testId?: string;
}

export const MoodPad: React.FC<MoodPadProps> = ({
  valence, arousal, onChange, palette, size = 180,
  title, subtitle, showLabels = true, testId,
}) => {
  const interactive = typeof onChange === 'function';
  const padRef = useRef<SVGSVGElement | null>(null);
  const draggingRef = useRef(false);

  // SVG coords: 100 × 100 view-box, origin at centre. We map the (-1, +1)
  // valence/arousal range to ±50 pixels, so a value of 0.7 valence → x = 35.
  // Y is inverted because SVG +y goes down but arousal +y should be up.
  const toPx = (v: number, a: number) => ({ x: 50 + v * 50, y: 50 - a * 50 });
  const dot = toPx(valence, arousal);

  const handlePointer = useCallback((evt: React.PointerEvent<SVGSVGElement>) => {
    if (!interactive || !padRef.current) return;
    const rect = padRef.current.getBoundingClientRect();
    const xRatio = (evt.clientX - rect.left) / rect.width;   // 0..1
    const yRatio = (evt.clientY - rect.top) / rect.height;   // 0..1
    const v = clampUnit(xRatio * 2 - 1);
    const a = clampUnit(-(yRatio * 2 - 1));
    onChange!({ valence: v, arousal: a });
  }, [interactive, onChange]);

  const onDown = (evt: React.PointerEvent<SVGSVGElement>) => {
    if (!interactive) return;
    draggingRef.current = true;
    (evt.target as Element).setPointerCapture?.(evt.pointerId);
    handlePointer(evt);
  };
  const onMove = (evt: React.PointerEvent<SVGSVGElement>) => {
    if (!draggingRef.current) return;
    handlePointer(evt);
  };
  const onUp = (evt: React.PointerEvent<SVGSVGElement>) => {
    draggingRef.current = false;
    (evt.target as Element).releasePointerCapture?.(evt.pointerId);
  };

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }} data-testid={testId}>
      {title && <div style={titleStyle}>{title}</div>}
      <svg
        ref={padRef}
        viewBox="0 0 100 100"
        width={size}
        height={size}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        style={{
          background: '#fafafa',
          borderRadius: 4,
          touchAction: 'none',
          cursor: interactive ? 'crosshair' : 'default',
          userSelect: 'none',
        }}
      >
        {/* Russell's circumplex: square frame + inscribed unit circle */}
        <rect x={0} y={0} width={100} height={100} fill="#ffffff" stroke="#e5e7eb" strokeWidth={0.5} />
        <circle cx={50} cy={50} r={48} fill="#fafafa" stroke="#d1d5db" strokeWidth={0.5} />

        {/* Quadrant tints — extremely faint so the dot stays the focal point */}
        <path d="M 50 50 L 100 50 L 100 0 Z" fill="#fef3c7" opacity={0.25} />
        <path d="M 50 50 L 0 50 L 0 0 Z" fill="#fee2e2" opacity={0.25} />
        <path d="M 50 50 L 0 50 L 0 100 Z" fill="#dbeafe" opacity={0.25} />
        <path d="M 50 50 L 100 50 L 100 100 Z" fill="#dcfce7" opacity={0.25} />

        {/* Axis cross */}
        <line x1={2} y1={50} x2={98} y2={50} stroke="#9ca3af" strokeWidth={0.4} />
        <line x1={50} y1={2} x2={50} y2={98} stroke="#9ca3af" strokeWidth={0.4} />

        {/* Emotion markers */}
        {palette?.map((e) => {
          const p = toPx(clampUnit(e.weightToValence), clampUnit(e.weightToArousal));
          // Skip degenerate (0,0) markers since they'd pile up under the dot.
          if (Math.abs(e.weightToValence) < 0.05 && Math.abs(e.weightToArousal) < 0.05) return null;
          return (
            <g key={e.name}>
              <circle cx={p.x} cy={p.y} r={1.6} fill="#a78bfa" opacity={0.85} />
              <text
                x={p.x + 2.3}
                y={p.y + 1.1}
                fontSize={3.3}
                fill="#6d28d9"
                style={{ pointerEvents: 'none' }}
              >
                {e.name}
              </text>
            </g>
          );
        })}

        {/* Axis labels */}
        {showLabels && (
          <>
            <text x={50} y={6}  textAnchor="middle" fontSize={3.6} fill="#6b7280">excited</text>
            <text x={50} y={97} textAnchor="middle" fontSize={3.6} fill="#6b7280">calm</text>
            <text x={3}  y={51} textAnchor="start"  fontSize={3.6} fill="#6b7280">sad</text>
            <text x={97} y={51} textAnchor="end"    fontSize={3.6} fill="#6b7280">happy</text>
          </>
        )}

        {/* Mood dot */}
        <circle cx={dot.x} cy={dot.y} r={2.6} fill="#111827" stroke="#ffffff" strokeWidth={0.8} />
      </svg>
      {subtitle && <div style={subtitleStyle}>{subtitle}</div>}
      <div style={readoutStyle}>
        <span>v {valence >= 0 ? '+' : ''}{valence.toFixed(2)}</span>
        <span style={{ marginLeft: 10 }}>a {arousal >= 0 ? '+' : ''}{arousal.toFixed(2)}</span>
      </div>
    </div>
  );
};

function clampUnit(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v > 1) return 1;
  if (v < -1) return -1;
  // Normalize -0 → 0 so the readout shows "+0.00" rather than "-0.00".
  return v === 0 ? 0 : v;
}

const titleStyle: React.CSSProperties = { fontSize: 11, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 };
const subtitleStyle: React.CSSProperties = { fontSize: 11, color: '#6b7280', marginTop: 4, fontStyle: 'italic', textAlign: 'center' };
const readoutStyle: React.CSSProperties = { fontSize: 10, fontFamily: 'monospace', color: '#374151', marginTop: 2 };
