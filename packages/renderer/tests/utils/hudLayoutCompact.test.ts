import { describe, it, expect } from 'vitest';
import { buildScreenHudLayout, resolveHudCompact, type ScreenHudCharacter } from '../../src/components/ScreenHudLayer';
import { COMPACT_STRIP_HEIGHT, compactStripWidthEstimate, initialsFor } from '../../src/components/CompactHudStrip';

const meterChar = (id: string, name: string, corner = 'screen-top-left', n = 1): ScreenHudCharacter => ({
  id, name,
  meterFrame: { dockMode: 'screen', screenPosition: corner, style: { padding: 8 }, meterHeight: 12, meterSpacing: 6, showLabels: true } as any,
  counters: Array.from({ length: n }, (_, i) => ({
    name: `c${i}`, displayName: `Suspicion ${i}`, value: 2, min: 0, max: 5, color: '#3b82f6',
    showNumericValue: false, numericFormat: 'value', orientation: 'horizontal',
  })) as any,
});
const invChar = (id: string): ScreenHudCharacter => ({
  id, name: 'Watchman',
  inventoryFrame: { dockMode: 'screen', screenPosition: 'screen-bottom-right', style: { padding: 10 }, itemSize: 36, columns: 4, itemSpacing: 6 },
  inventoryItems: [{ id: 'a', name: 'Letter', quantity: 1 }, { id: 'b', name: 'Key', quantity: 2 }] as any,
});

describe('resolveHudCompact', () => {
  it('auto = phone-class stage only', () => {
    expect(resolveHudCompact('auto', { width: 390 })).toBe(true);
    expect(resolveHudCompact(undefined, { width: 390 })).toBe(true);
    expect(resolveHudCompact('auto', { width: 1024 })).toBe(false);
  });
  it('always / never override the stage', () => {
    expect(resolveHudCompact('always', { width: 1024 })).toBe(true);
    expect(resolveHudCompact('never', { width: 390 })).toBe(false);
  });
});

describe('buildScreenHudLayout — phone collapse', () => {
  it('folds three same-corner meters into one strip and reserves only the strip', () => {
    const layout = buildScreenHudLayout({
      characters: [meterChar('a', 'Tomas Brandt'), meterChar('b', 'Dr. Elisabeth Maar'), meterChar('c', 'Lena Okonkwo')],
      stage: { width: 390, height: 740 },
    });
    expect(layout.compact).toBe(true);
    expect(layout.strips).toHaveLength(1);
    expect(layout.strips[0].corner).toBe('top-left');
    expect(layout.strips[0].items.map((i) => i.kind)).toEqual(['meter', 'meter', 'meter']);
    expect(layout.rects).toHaveLength(1);
    expect(layout.rects[0].height).toBe(COMPACT_STRIP_HEIGHT);
    // Same three cards uncollapsed would have stacked to well over 200px.
    const full = buildScreenHudLayout({ characters: [meterChar('a', 'A'), meterChar('b', 'B'), meterChar('c', 'C')], stage: { width: 390, height: 740 }, compactMode: 'never' });
    const fullBottom = Math.max(...full.rects.map((r) => r.y + r.height));
    expect(fullBottom).toBeGreaterThan(200);
    expect(layout.rects[0].y + layout.rects[0].height).toBeLessThan(60);
  });

  it('keeps the expanded card placements for the overlay', () => {
    const layout = buildScreenHudLayout({ characters: [meterChar('a', 'A'), invChar('w')], stage: { width: 390, height: 740 } });
    expect(layout.expanded?.placements.get('meter-a')).toBeTruthy();
    // Expanded cards start below the strip that opens them.
    const stripTop = layout.rects.find((r) => r.id === 'compact-top-left')!;
    expect(layout.expanded!.placements.get('meter-a')!.top).toBeGreaterThanOrEqual(stripTop.y + stripTop.height);
    expect(layout.expanded?.placements.get('inv-w')).toBeTruthy();
    expect(layout.strips.map((s) => s.corner).sort()).toEqual(['bottom-right', 'top-left']);
    const inv = layout.strips.find((s) => s.corner === 'bottom-right')!.items[0];
    expect(inv.kind === 'inventory' && inv.count).toBe(3); // quantities summed
  });

  it('still reserves the global timer box and packs the strip beneath it', () => {
    const layout = buildScreenHudLayout({
      characters: [meterChar('a', 'A', 'screen-top-right')],
      hudOverlays: { timerHud: { enabled: true, position: 'top-right', fontSize: 18, padding: 8 } },
      stage: { width: 390, height: 740 },
    });
    const timer = layout.rects.find((r) => r.id === '__timer')!;
    const strip = layout.rects.find((r) => r.id === 'compact-top-right')!;
    expect(timer).toBeTruthy();
    expect(strip.y).toBeGreaterThanOrEqual(timer.y + timer.height);
  });

  it('is a no-op on desktop stages (and reads hudOverlays.compactMode)', () => {
    const desk = buildScreenHudLayout({ characters: [meterChar('a', 'A')], stage: { width: 1024, height: 768 } });
    expect(desk.compact).toBe(false);
    expect(desk.strips).toEqual([]);
    expect(desk.rects[0].id).toBe('meter-a');
    const forced = buildScreenHudLayout({ characters: [meterChar('a', 'A')], hudOverlays: { compactMode: 'always' }, stage: { width: 1024, height: 768 } });
    expect(forced.compact).toBe(true);
  });
});

describe('CompactHudStrip helpers', () => {
  it('initials', () => {
    expect(initialsFor('Tomas Brandt')).toBe('TB');
    expect(initialsFor('Dr. Elisabeth Maar')).toBe('DM');
    expect(initialsFor('Nia')).toBe('NI');
    expect(initialsFor('')).toBe('??');
  });
  it('width grows with items', () => {
    const one = compactStripWidthEstimate([{ kind: 'inventory', characterId: 'x', name: 'x', count: 1 }]);
    const two = compactStripWidthEstimate([{ kind: 'inventory', characterId: 'x', name: 'x', count: 1 }, { kind: 'mood', characterId: 'y', name: 'y', valence: 0, arousal: 0 }]);
    expect(two).toBeGreaterThan(one);
  });
});
