import { describe, it, expect } from 'vitest';
import { derivedBeatId, resolveDuplicateBeatIds } from '../../src/persistence/duplicateBeatIds';
import { deserializeFromDirectory } from '../../src/persistence/DirectoryFormat';

describe('derivedBeatId', () => {
  it('is beat_ + 8 base36 characters and the same for the same seed', () => {
    expect(derivedBeatId('beat_29_copymv54phfs1_copymv54po2v1')).toMatch(/^beat_[0-9a-z]{8}$/);
    expect(derivedBeatId('a')).toBe(derivedBeatId('a'));
    expect(derivedBeatId('a')).not.toBe(derivedBeatId('b'));
  });
});

describe('resolveDuplicateBeatIds', () => {
  const inCluster = { id: 'b1', name: 'cafeteria, ignore', type: 'infoText', cluster: 'c1', x: 548, y: -293, parameters: { text: 'Hi' } };
  it('drops an identical copy that only sits elsewhere, keeping the first file', () => {
    const outside = { id: 'b1', name: 'cafeteria, ignore', type: 'infoText', x: 420, y: 4520, parameters: { text: 'Hi' } };
    const r = resolveDuplicateBeatIds([inCluster, outside], ['clusters/cafeteria/infoText_b1.json', 'clusters/_unclustered/infoText_b1.json']);
    expect(r.beats).toEqual([inCluster]);
    expect(r.duplicates[0]).toMatchObject({ id: 'b1', dropped: ['clusters/_unclustered/infoText_b1.json'], renamed: [] });
  });

  it('keeps a differing copy under its own derived id', () => {
    const other = { ...inCluster, parameters: { text: 'Changed' } };
    const r = resolveDuplicateBeatIds([inCluster, other], ['a.json', 'b.json']);
    expect(r.beats).toHaveLength(2);
    expect(r.beats[1].id).toBe(derivedBeatId('b1@b.json'));
    expect(r.beats[1].parameters.text).toBe('Changed');
    expect(r.duplicates[0].renamed).toEqual([{ file: 'b.json', to: derivedBeatId('b1@b.json') }]);
  });

  it('leaves unique ids alone', () => {
    const r = resolveDuplicateBeatIds([inCluster, { id: 'b2' }], ['a.json', 'b.json']);
    expect(r.duplicates).toEqual([]);
    expect(r.beats).toHaveLength(2);
  });
});

describe('deserializeFromDirectory with one id in two files', () => {
  it('reports it and loads the beat once', async () => {
    const files: Record<string, string> = {
      'p/project.json': JSON.stringify({ id: 'p', name: 'P', firstBeatId: 'b1', createdAt: '2026-01-01', modifiedAt: '2026-01-01', version: '1' }),
      'p/clusters/_index.json': JSON.stringify({ clusters: [{ id: 'c1', name: 'cafeteria', slug: 'cafeteria' }], containerBeatPositions: [] }),
      'p/clusters/cafeteria/cluster.json': JSON.stringify({ id: 'c1', name: 'cafeteria' }),
      'p/clusters/cafeteria/infoText_b1.json': JSON.stringify({ id: 'b1', name: 'x', type: 'infoText', cluster: 'c1', x: 1, parameters: { text: 'Hi' } }),
      'p/clusters/_unclustered/infoText_b1.json': JSON.stringify({ id: 'b1', name: 'x', type: 'infoText', x: 9, parameters: { text: 'Hi' } }),
    };
    const dirs = (p: string) => {
      const kids = new Map<string, boolean>();
      for (const f of Object.keys(files)) if (f.startsWith(p + '/')) { const rest = f.slice(p.length + 1).split('/'); kids.set(rest[0], rest.length > 1); }
      return [...kids].map(([name, isDirectory]) => ({ name, isDirectory }));
    };
    const reader = {
      readText: async (p: string) => files[p],
      exists: async (p: string) => p in files || Object.keys(files).some((f) => f.startsWith(p + '/')),
      listDir: async (p: string) => dirs(p),
    };
    const r = await deserializeFromDirectory('p', reader as any);
    expect(r.beats.filter((b: any) => b.id === 'b1')).toHaveLength(1);
    expect(r.beats.find((b: any) => b.id === 'b1')!.cluster).toBe('c1');
    expect(r.duplicateBeatIds?.[0].files).toEqual(['clusters/cafeteria/infoText_b1.json', 'clusters/_unclustered/infoText_b1.json']);
  });
});
