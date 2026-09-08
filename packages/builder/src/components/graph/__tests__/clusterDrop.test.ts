/**
 * clusterDrop — the flow-coordinate hit test behind drag-in, drag-out,
 * drag-between and ⏏. Pure, so the four outcomes are pinned here instead of
 * in a ReactFlow harness.
 */
import { describe, it, expect } from 'vitest';
import { clusterAt, toContentRelative, toAbsolute, containerSlotFor, ejectPosition, resolveBeatDrop } from '../clusterDrop';

const cluster = (id: string, x: number, y: number, w = 600, h = 400, isExpanded = true): any => ({
  id, name: id, isExpanded, containerPosition: { x, y }, containerBounds: { width: w, height: h },
});
const A = cluster('A', 100, 100);
const B = cluster('B', 1000, 100);
const collapsed = cluster('C', 100, 700, 600, 400, false);

describe('clusterAt', () => {
  it('finds the expanded frame containing the point, ignores collapsed pills', () => {
    expect(clusterAt([A, B, collapsed], { x: 150, y: 150 })?.id).toBe('A');
    expect(clusterAt([A, B, collapsed], { x: 1500, y: 150 })?.id).toBe('B');
    expect(clusterAt([A, B, collapsed], { x: 150, y: 750 })).toBeUndefined();
    expect(clusterAt([A, B, collapsed], { x: 5, y: 5 })).toBeUndefined();
  });
});

describe('coordinate conversion', () => {
  it('content-relative subtracts the header and snaps to the 20px grid, clamped ≥ 0', () => {
    expect(toContentRelative({ x: 173, y: 151 }, A)).toEqual({ x: 80, y: 20 });
    expect(toContentRelative({ x: 100, y: 100 }, A)).toEqual({ x: 0, y: 0 });
  });
  it('round-trips through absolute', () => {
    const abs = toAbsolute({ x: 80, y: 20 }, A);
    expect(abs).toEqual({ x: 180, y: 160 });
    expect(toContentRelative(abs, A)).toEqual({ x: 80, y: 20 });
  });
});

describe('containerSlotFor', () => {
  const beats: any[] = [{ id: 'b1', cluster: 'A' }, { id: 'b2', cluster: 'A' }, { id: 'b3', cluster: 'A' }];
  it('prefers the stored position', () => {
    const stored: any[] = [{ beatId: 'b2', clusterId: 'A', position: { x: 300, y: 40, z: 0 } }];
    expect(containerSlotFor('b2', 'A', beats, stored)).toEqual({ x: 300, y: 40 });
  });
  it('falls back to the default grid slot graphBuild renders', () => {
    expect(containerSlotFor('b1', 'A', beats, [])).toEqual({ x: 20, y: 20 });
    expect(containerSlotFor('b2', 'A', beats, [])).toEqual({ x: 220, y: 20 });
    expect(containerSlotFor('b3', 'A', beats, [])).toEqual({ x: 20, y: 130 });
  });
});

describe('ejectPosition', () => {
  it('lands just right of the frame, on the same row', () => {
    expect(ejectPosition(A, { x: 20, y: 130 })).toEqual({ x: 740, y: 280 });
  });
});

describe('resolveBeatDrop', () => {
  const clusters = [A, B, collapsed];
  it('top-level beat dropped on the canvas → ordinary snapped move', () => {
    expect(resolveBeatDrop({ absolute: { x: 11, y: 29 }, clusters })).toEqual({ kind: 'move-top-level', x: 20, y: 20 });
  });
  it('top-level beat dropped inside a frame → enters it at the drop point', () => {
    expect(resolveBeatDrop({ absolute: { x: 180, y: 160 }, clusters })).toEqual({ kind: 'enter-cluster', clusterId: 'A', x: 80, y: 20 });
  });
  it('clustered beat dropped inside its own frame → in-container move', () => {
    expect(resolveBeatDrop({ currentClusterId: 'A', absolute: { x: 180, y: 160 }, clusters })).toEqual({ kind: 'move-in-cluster', clusterId: 'A', x: 80, y: 20 });
  });
  it('clustered beat dropped inside another frame → moves between clusters', () => {
    expect(resolveBeatDrop({ currentClusterId: 'A', absolute: { x: 1100, y: 160 }, clusters })).toEqual({ kind: 'enter-cluster', clusterId: 'B', x: 100, y: 20 });
  });
  it('clustered beat dropped outside every frame → ejects at the drop point', () => {
    expect(resolveBeatDrop({ currentClusterId: 'A', absolute: { x: 805, y: 95 }, clusters })).toEqual({ kind: 'eject', x: 800, y: 100 });
  });
  it('a collapsed pill is never a drop target', () => {
    expect(resolveBeatDrop({ currentClusterId: 'A', absolute: { x: 150, y: 750 }, clusters }).kind).toBe('eject');
  });
});
