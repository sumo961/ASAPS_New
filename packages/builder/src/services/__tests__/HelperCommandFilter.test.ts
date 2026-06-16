/**
 * Tests for HelperCommandFilter — queries beats / locations / clusters by an
 * ElementSelector for helper commands. Pure logic; beats are minimal fakes
 * exposing the surface it touches (id/name/type/connections/getParameters/
 * locations).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { HelperCommandFilter, getHelperCommandFilter } from '../HelperCommandFilter';

const beat = (over: any = {}) =>
  ({
    id: 'b1',
    name: 'Beat One',
    type: 'infoText',
    connections: [],
    getParameters: () => ({}),
    locations: new Map(),
    ...over,
  }) as any;

const sel = (targetType: string, filters: any = {}) => ({ targetType, filters }) as any;

let filter: HelperCommandFilter;
beforeEach(() => {
  filter = new HelperCommandFilter();
});

function ctx(beats: any[], clusters: any[] = [], containerBeatPositions: any[] = []) {
  filter.setContext({ beats, clusters, containerBeatPositions });
}

describe('beat queries', () => {
  it('filters by beat type (case-insensitive)', () => {
    ctx([beat({ id: 'a', type: 'infoText' }), beat({ id: 'b', type: 'dialogTree' })]);
    const r = filter.query(sel('beat', { beatTypes: ['INFOTEXT'] }));
    expect(r.beats.map((x: any) => x.id)).toEqual(['a']);
    expect(r.totalCount).toBe(1);
  });

  it('filters by explicit beat ids', () => {
    ctx([beat({ id: 'a' }), beat({ id: 'b' }), beat({ id: 'c' })]);
    expect(filter.query(sel('beat', { beatIds: ['a', 'c'] })).beats.map((x: any) => x.id)).toEqual(['a', 'c']);
  });

  it('filters by a wildcard name pattern', () => {
    ctx([beat({ id: 'a', name: 'Forest Hub' }), beat({ id: 'b', name: 'Cave' })]);
    expect(filter.query(sel('beat', { beatNamePattern: 'Forest *' })).beats.map((x: any) => x.id)).toEqual(['a']);
  });

  it('? wildcard matches a single character', () => {
    ctx([beat({ id: 'a', name: 'Intro' }), beat({ id: 'b', name: 'Outro' })]);
    expect(filter.query(sel('beat', { beatNamePattern: '?ntro' })).beats.map((x: any) => x.id)).toEqual(['a']);
  });

  it('filters by property presence and value', () => {
    ctx([
      beat({ id: 'a', getParameters: () => ({ speaker: 'Narrator' }) }),
      beat({ id: 'b', getParameters: () => ({}) }),
    ]);
    expect(filter.query(sel('beat', { hasProperty: 'speaker' })).beats.map((x: any) => x.id)).toEqual(['a']);
    expect(
      filter.query(sel('beat', { propertyValue: { property: 'speaker', operator: 'contains', value: 'narr' } })).beats.map((x: any) => x.id),
    ).toEqual(['a']);
  });

  it('filters by outgoing connection target', () => {
    ctx([
      beat({ id: 'a', connections: [{ targetId: 'end' }] }),
      beat({ id: 'b', connections: [{ targetId: 'other' }] }),
    ]);
    expect(filter.query(sel('beat', { connectsTo: ['end'] })).beats.map((x: any) => x.id)).toEqual(['a']);
  });
});

describe('cluster scoping', () => {
  it('restricts beats to a named cluster via container positions', () => {
    ctx(
      [beat({ id: 'a' }), beat({ id: 'b' })],
      [{ id: 'c1', name: 'Act One' } as any],
      [{ clusterId: 'c1', beatId: 'a' } as any],
    );
    const r = filter.query(sel('beat', { clusterName: 'Act One' }));
    expect(r.beats.map((x: any) => x.id)).toEqual(['a']);
  });

  it('returns no beats when the cluster is not found', () => {
    ctx([beat({ id: 'a' })], [], []);
    expect(filter.query(sel('beat', { clusterName: 'Nope' })).beats).toEqual([]);
  });
});

describe('exclusion', () => {
  it('removes excluded beats and adjusts the count', () => {
    ctx([beat({ id: 'a' }), beat({ id: 'b' }), beat({ id: 'c' })]);
    const r = filter.query(sel('beat', { beatTypes: ['infoText'] }), sel('beat', { beatIds: ['b'] }));
    expect(r.beats.map((x: any) => x.id)).toEqual(['a', 'c']);
    expect(r.totalCount).toBe(2);
  });
});

describe('misc', () => {
  it('returns an empty result for an unknown target type', () => {
    ctx([beat()]);
    const r = filter.query(sel('nonsense', {}));
    expect(r).toEqual({ beats: [], locations: [], clusters: [], totalCount: 0 });
  });

  it('getTextContent extracts the common text fields', () => {
    const b = beat({ getParameters: () => ({ text: 'Hello', title: 'T', buttonText: 'Go' }) });
    const fields = filter.getTextContent(b).map((f) => f.field);
    expect(fields).toEqual(expect.arrayContaining(['text', 'title', 'buttonText']));
  });

  it('findAssetByName matches exact, then contains, then pattern', () => {
    const assets = [{ id: '1', name: 'forest.png' }, { id: '2', name: 'cave_bg.png' }];
    expect(filter.findAssetByName('forest.png', assets)?.id).toBe('1'); // exact
    expect(filter.findAssetByName('cave', assets)?.id).toBe('2'); // contains
    expect(filter.findAssetByName('for*', assets)?.id).toBe('1'); // pattern
  });

  it('getHelperCommandFilter returns a stable singleton', () => {
    expect(getHelperCommandFilter()).toBe(getHelperCommandFilter());
  });
});
