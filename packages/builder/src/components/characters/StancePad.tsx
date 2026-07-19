/**
 * StancePad — 2D representation of an interpersonal stance on the
 * Leary/Wiggins circumplex ("Leary's Rose"): warmth (affiliation) running
 * left → right, dominance (control) running bottom → top, the four
 * Leary-tradition octant labels in the corners, and a draggable dot at the
 * stance position. Sibling of MoodPad (Russell's circumplex for mood) —
 * same interaction pattern, different psychological space.
 *
 * Because the circumplex plane is a rotation of Big Five extraversion ×
 * agreeableness (docs/Interpersonal-Stance-Model.md), the pad can also plot
 * a hollow "traits" marker showing where the variant's CURRENT traits sit
 * (via bigFiveToStance). When the authored stance and the trait-derived
 * position drift apart — e.g. after hand-tuning sliders — the drift is
 * visible instead of silent.
 */

import React, { useCallback, useRef } from 'react';
import type { InterpersonalStance } from '../../services/prompts/interpersonalStance';

export interface StancePadProps {
  /** Stance to display. */
  warmth: number;
  dominance: number;
  /** When set, click / drag emits the new stance, both axes clamped to [-1, 1]. */
  onChange?: (next: InterpersonalStance) => void;
  /** Optional hollow marker: where the variant's current traits sit on the
   *  circumplex (bigFiveToStance). Omit to hide. */
  traitsPosition?: InterpersonalStance | null;
  /** True when the dot merely mirrors the traits (no authored stance yet) —
   *  rendered hollow so "derived" reads differently from "authored". */
  derived?: boolean;
  /** Pixel size (square). Default 180. */
  size?: number;
  title?: string;
  subtitle?: string;
  /** Render corner octant labels + axis words. Default true. */
  showLabels?: boolean;
  testId?: string;
}

export const StancePad: React.FC<StancePadProps> = ({
  warmth, dominance, onChange, traitsPosition, derived = false,
  size = 180, title, subtitle, showLabels = true, testId,
}) => {
  const interactive = typeof onChange === 'function';
  const padRef = useRef<SVGSVGElement | null>(null);
  const draggingRef = useRef(false);

  // Same ±45 position scale as MoodPad — keeps a max-magnitude dot fully
  // inside the r=48 circle.
  const POS_SCALE = 45;
  const toPx = (w: number, d: number) => ({ x: 50 + w * POS_SCALE, y: 50 - d * POS_SCALE });
  const dot = toPx(clampUnit(warmth), clampUnit(dominance));
  const traitsDot = traitsPosition
    ? toPx(clampUnit(traitsPosition.warmth), clampUnit(traitsPosition.dominance))
    : null;
  // Hide the traits ghost when it sits (near) under the stance dot.
  const showTraitsDot = traitsDot
    && (Math.abs(traitsDot.x - dot.x) > 3 || Math.abs(traitsDot.y - dot.y) > 3);

  const handlePointer = useCallback((evt: React.PointerEvent<SVGSVGElement>) => {
    if (!interactive || !padRef.current) return;
    const rect = padRef.current.getBoundingClientRect();
    const xRatio = (evt.clientX - rect.left) / rect.width;
    const yRatio = (evt.clientY - rect.top) / rect.height;
    onChange!({
      warmth: clampUnit(xRatio * 2 - 1),
      dominance: clampUnit(-(yRatio * 2 - 1)),
    });
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
        {/* Leary's rose: square frame + inscribed circle */}
        <rect x={0} y={0} width={100} height={100} fill="#ffffff" stroke="#e5e7eb" strokeWidth={0.5} />
        <circle cx={50} cy={50} r={48} fill="#fafafa" stroke="#d1d5db" strokeWidth={0.5} />

        {/* Quadrant tints: hostile (cold-dominant) red, leading (warm-dominant)
            amber, withdrawn (cold-submissive) blue, cooperative (warm-
            submissive) green — same faintness as MoodPad. */}
        <path d="M 50 50 L 0 50 L 0 0 Z"     fill="#fee2e2" opacity={0.25} />
        <path d="M 50 50 L 100 50 L 100 0 Z" fill="#fef3c7" opacity={0.25} />
        <path d="M 50 50 L 0 50 L 0 100 Z"   fill="#dbeafe" opacity={0.25} />
        <path d="M 50 50 L 100 50 L 100 100 Z" fill="#dcfce7" opacity={0.25} />

        {/* Axis cross */}
        <line x1={2} y1={50} x2={98} y2={50} stroke="#9ca3af" strokeWidth={0.4} />
        <line x1={50} y1={2} x2={50} y2={98} stroke="#9ca3af" strokeWidth={0.4} />

        {showLabels && (
          <>
            {/* Axis words at the cardinals */}
            <text x={50} y={6.5} textAnchor="middle" fontSize={4.5} fill="#6b7280">dominant</text>
            <text x={50} y={97}  textAnchor="middle" fontSize={4.5} fill="#6b7280">submissive</text>
            <text x={3}  y={51.5} textAnchor="start" fontSize={4.5} fill="#6b7280">cold</text>
            <text x={97} y={51.5} textAnchor="end"   fontSize={4.5} fill="#6b7280">warm</text>
            {/* Leary octant labels in the quadrant corners */}
            <text x={14} y={16} textAnchor="start" fontSize={3.8} fill="#b91c1c" opacity={0.7} fontStyle="italic">hostile</text>
            <text x={86} y={16} textAnchor="end"   fontSize={3.8} fill="#b45309" opacity={0.7} fontStyle="italic">leading</text>
            <text x={14} y={88} textAnchor="start" fontSize={3.8} fill="#1d4ed8" opacity={0.7} fontStyle="italic">withdrawn</text>
            <text x={86} y={88} textAnchor="end"   fontSize={3.8} fill="#15803d" opacity={0.7} fontStyle="italic">cooperative</text>
          </>
        )}

        {/* Trait-derived ghost marker (hollow) */}
        {showTraitsDot && traitsDot && (
          <g>
            <circle cx={traitsDot.x} cy={traitsDot.y} r={2.2} fill="none" stroke="#9ca3af" strokeWidth={0.9} strokeDasharray="1.5 1" />
            <text x={traitsDot.x + 3} y={traitsDot.y + 1.4} fontSize={3.6} fill="#9ca3af" style={{ pointerEvents: 'none' }}>traits</text>
          </g>
        )}

        {/* Stance dot — hollow when merely derived from traits, solid when authored */}
        {derived ? (
          <circle cx={dot.x} cy={dot.y} r={2.6} fill="#ffffff" stroke="#111827" strokeWidth={1} strokeDasharray="2 1" />
        ) : (
          <circle cx={dot.x} cy={dot.y} r={2.6} fill="#111827" stroke="#ffffff" strokeWidth={0.8} />
        )}
      </svg>
      {subtitle && <div style={subtitleStyle}>{subtitle}</div>}
      <div style={readoutStyle}>
        <span>w {warmth >= 0 ? '+' : ''}{warmth.toFixed(2)}</span>
        <span style={{ marginLeft: 10 }}>d {dominance >= 0 ? '+' : ''}{dominance.toFixed(2)}</span>
      </div>
    </div>
  );
};

function clampUnit(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v > 1) return 1;
  if (v < -1) return -1;
  return v === 0 ? 0 : v;
}

const titleStyle: React.CSSProperties = { fontSize: 11, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 };
const subtitleStyle: React.CSSProperties = { fontSize: 11, color: '#6b7280', marginTop: 4, fontStyle: 'italic', textAlign: 'center' };
const readoutStyle: React.CSSProperties = { fontSize: 10, fontFamily: 'monospace', color: '#374151', marginTop: 2 };
