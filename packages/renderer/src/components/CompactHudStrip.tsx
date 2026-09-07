/**
 * CompactHudStrip — the collapsed face of a corner's screen HUDs on phones.
 *
 * A stack of meter cards claims ~30% of a phone-portrait stage before the
 * story gets a pixel (bake-off Story M, 2026-09-04). On phone-class stages
 * `buildScreenHudLayout` therefore folds every screen-docked HUD in a corner
 * into ONE slim strip that is itself informative — initials + a micro-bar per
 * metered character, an item count for inventories, a mood token per mood
 * rail entry — and reserves only the strip. Tapping it expands the corner's
 * full cards as a temporary overlay (see ScreenHudLayer), which reserves
 * nothing.
 *
 * The strip is the ONLY pointer-events island in the HUD layer: the layer's
 * root keeps pointer-events off so the stage stays usable.
 */
import React from 'react';
import { MoodToken } from './CharacterMoodToken';
import type { MeterCounterData } from './CharacterMeterFrame';

export const COMPACT_STRIP_HEIGHT = 36;

export interface CompactMeterItem {
  kind: 'meter';
  characterId: string;
  name: string;
  color?: string;
  counters: MeterCounterData[];
}
export interface CompactInventoryItem {
  kind: 'inventory';
  characterId: string;
  name: string;
  count: number;
}
export interface CompactMoodItem {
  kind: 'mood';
  characterId: string;
  name: string;
  valence: number;
  arousal: number;
}
export type CompactHudItem = CompactMeterItem | CompactInventoryItem | CompactMoodItem;

/** Width the strip will occupy — packing happens before render, so estimate. */
export function compactStripWidthEstimate(items: CompactHudItem[]): number {
  let w = 20; // horizontal padding
  for (const it of items) {
    if (it.kind === 'meter') w += 52 + (it.counters.length > 1 ? 14 : 0);
    else if (it.kind === 'inventory') w += 40;
    else w += 24;
  }
  return w + Math.max(0, items.length - 1) * 8;
}

/** "Tomas Brandt" → "TB", "Nia" → "NI". Two glyphs, always. */
export function initialsFor(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function meterFraction(c: MeterCounterData): number {
  const min = c.min ?? 0;
  const max = c.max ?? 100;
  if (max <= min) return 0;
  return Math.max(0, Math.min(1, (c.value - min) / (max - min)));
}

export interface CompactHudStripProps {
  items: CompactHudItem[];
  left: number;
  top: number;
  fontScale?: number;
  /** Transient change notice ("Brandt +1") rendered beside the strip. */
  pulse?: { text: string } | null;
  /** Bottom corners hang the pulse above the strip instead of below. */
  atBottom?: boolean;
  expanded?: boolean;
  accentColor?: string;
  onToggle: () => void;
}

export function CompactHudStrip({
  items, left, top, fontScale = 1, pulse, atBottom, expanded, accentColor = '#f5c451', onToggle,
}: CompactHudStripProps) {
  const fs = Math.round(11 * fontScale);
  const active = !!pulse || !!expanded;
  return (
    <div
      role="button"
      aria-expanded={!!expanded}
      aria-label="Show status panels"
      data-testid="compact-hud-strip"
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      style={{
        position: 'absolute',
        left,
        top,
        height: COMPACT_STRIP_HEIGHT,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 10px',
        borderRadius: COMPACT_STRIP_HEIGHT / 2,
        background: 'rgba(16, 18, 26, 0.82)',
        border: `1px solid ${active ? accentColor : 'rgba(255,255,255,0.18)'}`,
        boxShadow: active ? `0 0 0 3px ${accentColor}33, 0 2px 10px rgba(0,0,0,0.4)` : '0 2px 10px rgba(0,0,0,0.4)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        color: '#fff',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: fs,
        lineHeight: 1,
        cursor: 'pointer',
        pointerEvents: 'auto',
        userSelect: 'none',
        whiteSpace: 'nowrap',
        transition: 'border-color 200ms ease, box-shadow 200ms ease',
      }}
    >
      {items.map((it) => {
        if (it.kind === 'meter') {
          const primary = it.counters[0];
          const frac = primary ? meterFraction(primary) : 0;
          return (
            <span key={`m-${it.characterId}`} title={it.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ fontWeight: 700, color: it.color || '#fff', opacity: 0.95 }}>{initialsFor(it.name)}</span>
              <span style={{ width: 26, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.2)', overflow: 'hidden' }}>
                <span style={{ display: 'block', width: `${Math.round(frac * 100)}%`, height: '100%', background: primary?.color || accentColor, transition: 'width 300ms ease' }} />
              </span>
              {it.counters.length > 1 && (
                <span style={{ fontSize: Math.round(fs * 0.85), opacity: 0.7 }}>+{it.counters.length - 1}</span>
              )}
            </span>
          );
        }
        if (it.kind === 'inventory') {
          return (
            <span key={`i-${it.characterId}`} title={`${it.name}: ${it.count} items`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span aria-hidden style={{ display: 'inline-block', width: 12, height: 10, border: '1.5px solid rgba(255,255,255,0.85)', borderRadius: 2, borderTopWidth: 3 }} />
              <span style={{ fontWeight: 700 }}>{it.count}</span>
            </span>
          );
        }
        return (
          <span key={`d-${it.characterId}`} title={it.name} style={{ display: 'inline-flex', alignItems: 'center' }}>
            <MoodToken valence={it.valence} arousal={it.arousal} size={16} />
          </span>
        );
      })}
      {pulse && (
        <span
          data-testid="compact-hud-pulse"
          style={{
            position: 'absolute',
            left: 8,
            [atBottom ? 'bottom' : 'top']: COMPACT_STRIP_HEIGHT + 6,
            padding: '4px 9px',
            borderRadius: 10,
            background: accentColor,
            color: '#1a1400',
            fontWeight: 700,
            fontSize: fs,
            boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
            animation: 'asapsHudPulse 2.2s ease-out forwards',
            pointerEvents: 'none',
          }}
        >
          {pulse.text}
        </span>
      )}
    </div>
  );
}
