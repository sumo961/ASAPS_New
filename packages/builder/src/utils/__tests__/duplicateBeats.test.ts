/**
 * Tests for multi-beat duplication: fresh ids, internal connections remapped
 * to the copies, external references left intact, and a clean round-trip
 * through deserializeBeats back to real Beat instances.
 */
import { describe, it, expect } from 'vitest';
import { BeatTypeRegistry } from '@asaps/core';
import { cloneBeatsForDuplicate } from '../duplicateBeats';
import { deserializeBeats } from '../projectDeserializer';

const registry = BeatTypeRegistry.getInstance();

function makeBeat(id: string, opts: { target?: string; x?: number; y?: number } = {}) {
  const beat = registry.createBeat('infoText', {
    id,
    name: `Beat ${id}`,
    type: 'infoText',
    x: opts.x ?? 100,
    y: opts.y ?? 100,
  });
  if (opts.target) {
    beat.addConnection({ id: `conn_${id}`, targetId: opts.target, label: 'Continue' } as any);
  }
  return beat;
}

describe('cloneBeatsForDuplicate', () => {
  it('gives every clone a fresh id and an offset position', () => {
    const a = makeBeat('a', { x: 10, y: 20 });
    const { clones, idMap } = cloneBeatsForDuplicate([a], ['a']);
    expect(clones).toHaveLength(1);
    expect(clones[0].id).not.toBe('a');
    expect(clones[0].id).toBe(idMap.get('a'));
    expect(clones[0].name).toBe('Beat a (Copy)');
    expect(clones[0].x).toBe(50);
    expect(clones[0].y).toBe(60);
  });

  it('remaps connections BETWEEN selected beats to the copies', () => {
    const a = makeBeat('a', { target: 'b' });
    const b = makeBeat('b');
    const { clones, idMap } = cloneBeatsForDuplicate([a, b], ['a', 'b']);
    const aCopy = clones.find((c: any) => c.id === idMap.get('a'));
    expect(aCopy.connections[0].targetId).toBe(idMap.get('b'));
  });

  it('keeps connections to UNSELECTED beats pointing at the originals', () => {
    const a = makeBeat('a', { target: 'external' });
    const { clones } = cloneBeatsForDuplicate([a], ['a', 'external']);
    expect(clones[0].connections[0].targetId).toBe('external');
  });

  it('remaps defaultTarget within the selection', () => {
    const a = makeBeat('a');
    (a as any).defaultTarget = 'b';
    const b = makeBeat('b');
    const { clones, idMap } = cloneBeatsForDuplicate([a, b], ['a', 'b']);
    const aCopy = clones.find((c: any) => c.id === idMap.get('a'));
    expect(aCopy.defaultTarget).toBe(idMap.get('b'));
  });

  it('never collides with existing ids, even across repeated duplication', () => {
    const a = makeBeat('a');
    const first = cloneBeatsForDuplicate([a], ['a']);
    const firstId = first.clones[0].id as string;
    const second = cloneBeatsForDuplicate([a], ['a', firstId]);
    expect(second.clones[0].id).not.toBe('a');
    expect(second.clones[0].id).not.toBe(firstId);
  });

  it('round-trips through deserializeBeats into live Beat instances with remapped connections', () => {
    const a = makeBeat('a', { target: 'b' });
    const b = makeBeat('b');
    const { clones, idMap } = cloneBeatsForDuplicate([a, b], ['a', 'b']);
    const instances = deserializeBeats(clones);
    expect(instances).toHaveLength(2);
    const aCopy: any = instances.find(i => i.id === idMap.get('a'));
    expect(typeof aCopy.getParameters).toBe('function');
    expect(aCopy.getConnections().some((c: any) => c.targetId === idMap.get('b'))).toBe(true);
  });

  it('keeps cluster membership on the copies', () => {
    const a = makeBeat('a');
    (a as any).cluster = 'cluster_x';
    const { clones } = cloneBeatsForDuplicate([a], ['a']);
    expect(clones[0].cluster).toBe('cluster_x');
  });
});
