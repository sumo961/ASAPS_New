import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ScreenHudLayer, buildScreenHudLayout, type ScreenHudCharacter } from '../../src/components/ScreenHudLayer';

/**
 * A disc-style mood HUD used to place itself in its corner without regard
 * for the meters and inventories there, and sat on top of them (author
 * report, 2026-11-20: Ingrid's mood disc over Tomas's trust meter).
 */
const stage = { width: 1024, height: 768 };
const meterFrame = { dockMode: 'screen', screenPosition: 'screen-top-right', width: 160, showLabels: true, meterHeight: 12, meterSpacing: 6, style: { padding: 8 } };
const counter = { name: 'trust', label: "Tomas's trust", value: 0, min: -5, max: 5 } as any;
const disc = { enabled: true, dockMode: 'screen', screenPosition: 'screen-top-right', displayStyle: 'disc', size: 140, showQualitativeLabel: true, offset: { x: 0, y: 0 }, backgroundOpacity: 0.95 };

const cast = (moodFrame: any): ScreenHudCharacter[] => [
  { id: 'ingrid', name: 'Ingrid', moodFrame, mood: { valence: 0, arousal: 0 } },
  { id: 'tomas', name: 'Tomas', meterFrame: meterFrame as any, counters: [counter] },
];

const overlap = (a: any, b: any) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe('a disc-style mood HUD on the screen', () => {
  it('is packed into its corner, clear of a meter there', () => {
    const layout = buildScreenHudLayout({ characters: cast(disc), stage });
    const discRect = layout.rects.find((r) => r.id === 'mood-disc-ingrid')!;
    const meterRect = layout.rects.find((r) => r.id === 'meter-tomas')!;
    expect(discRect).toBeTruthy();
    expect(discRect.width).toBe(148);
    expect(discRect.height).toBe(22 + 140 + 18 + 8);
    expect(overlap(discRect, meterRect)).toBe(false);
    // The meter keeps the corner; the disc goes under it.
    expect(discRect.y).toBeGreaterThan(meterRect.y);
  });

  it('is drawn where the layout put it', () => {
    const layout = buildScreenHudLayout({ characters: cast(disc), stage });
    const { container } = render(<ScreenHudLayer layout={layout} stage={stage} />);
    const card = Array.from(container.querySelectorAll<HTMLElement>('div')).find((d) => d.style.width === '148px' && d.style.position === 'absolute')!;
    const rect = layout.rects.find((r) => r.id === 'mood-disc-ingrid')!;
    expect(card).toBeTruthy();
    expect(Math.abs(parseFloat(card.style.top) - rect.y)).toBeLessThanOrEqual(4);
  });

  it('keeps the corner to itself when nothing else is there', () => {
    const layout = buildScreenHudLayout({ characters: [cast(disc)[0]], stage });
    expect(layout.rects.find((r) => r.id === 'mood-disc-ingrid')!.edgeOffset).toBe(0);
  });

  it('on a phone it folds into the corner strip like the other panels', () => {
    const layout = buildScreenHudLayout({ characters: cast(disc), stage: { width: 390, height: 844 } });
    expect(layout.compact).toBe(true);
    const strip = layout.strips.find((s) => s.corner === 'top-right')!;
    expect(strip.items.map((i) => i.kind).sort()).toEqual(['meter', 'mood']);
  });
});
