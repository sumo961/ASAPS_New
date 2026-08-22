/**
 * graphBuild — the single source of graph nodes and edges.
 *
 * Phase 1 of the cluster unification: these tests pin the behavior of the
 * extracted build functions so the Phase 2 switch (clustered beats as real
 * ReactFlow children) changes exactly what it means to change and nothing
 * else. Cases marked [Phase 2 inverts] document today's dual-path behavior
 * on purpose.
 */
import { describe, it, expect, vi } from 'vitest';
import { buildGraphNodes, buildGraphEdges, GraphNodesInput } from '../graphBuild';
import type { Beat, Cluster } from '@asaps/core';

const beat = (over: any = {}): Beat =>
  ({
    id: 'b1',
    name: 'Beat 1',
    type: 'infoText',
    x: 100,
    y: 100,
    cluster: undefined,
    defaultTarget: undefined,
    sound: undefined,
    getParameters: () => over.params ?? {},
    getConnections: () => over.connections ?? [],
    ...over,
  }) as unknown as Beat;

const cluster = (over: any = {}): Cluster =>
  ({
    id: 'c1',
    name: 'Cluster 1',
    isExpanded: true,
    containerPosition: { x: 500, y: 50 },
    containerBounds: { width: 600, height: 400 },
    ...over,
  }) as unknown as Cluster;

const callbacks = () => ({
  toggleDialogExpand: vi.fn(),
  onBeatSelect: vi.fn(),
  onClusterExpandCollapse: vi.fn(),
  onBeatInContainerMove: vi.fn(),
  onDropBeatToCluster: vi.fn(),
  onRemoveBeatFromCluster: vi.fn(),
  getAssets: () => [],
  getHighlightedBeatIds: () => null,
});

const nodesInput = (over: Partial<GraphNodesInput> = {}): GraphNodesInput => ({
  beats: [],
  clusters: [],
  containerBeatPositions: [],
  selectedBeat: null,
  selectedCluster: null,
  expandedDialogs: new Set(),
  highlighted: null,
  pwVisited: null,
  pwCurrentBeatId: null,
  brokenTargets: undefined,
  callbacks: callbacks(),
  ...over,
});

const SMALL_TREE = {
  id: 'root',
  speaker: 'Wolf',
  text: 'Hello there.',
  choices: [
    { id: '1', text: 'Hi.', target: 'b9' },
    { id: '2', text: 'Bye.', target: 'b9' },
  ],
};

describe('buildGraphNodes', () => {
  it('renders unclustered beats as beat nodes with type accents', () => {
    const nodes = buildGraphNodes(nodesInput({
      beats: [beat(), beat({ id: 'b2', name: 'Choice', type: 'movementChoice', x: 300, y: 40 })],
    }));
    expect(nodes.map(n => n.type)).toEqual(['beat', 'beat']);
    expect(nodes[0].position).toEqual({ x: 100, y: 100 });
    expect(nodes[1].data.color).toBe('#f59e0b');
  });

  it('gives dialogTree beats the expansion trigger data', () => {
    const nodes = buildGraphNodes(nodesInput({
      beats: [beat({ id: 'd1', type: 'dialogTree', params: { dialogTree: SMALL_TREE } })],
    }));
    expect(nodes[0].data.dialogTree).toBe(SMALL_TREE);
    expect(nodes[0].data.dialogExpanded).toBe(false);
    expect(typeof nodes[0].data.onToggleDialogExpand).toBe('function');
  });

  it('expands a dialogTree into a container followed by its child nodes', () => {
    const nodes = buildGraphNodes(nodesInput({
      beats: [beat({ id: 'd1', type: 'dialogTree', params: { dialogTree: SMALL_TREE } })],
      expandedDialogs: new Set(['d1']),
    }));
    expect(nodes[0].type).toBe('dialogContainer');
    expect(nodes[0].id).toBe('d1'); // keeps the beat id so inbound edges survive
    const children = nodes.slice(1);
    expect(children.length).toBeGreaterThan(0);
    for (const child of children) {
      expect(child.type).toBe('dialogInternal');
      expect(child.parentNode).toBe('d1');
      // hard ReactFlow invariant: parents precede children in the array
      expect(nodes.indexOf(child)).toBeGreaterThan(0);
    }
  });

  it('[Phase 2 inverts] hides clustered beats inside the cluster node data', () => {
    const nodes = buildGraphNodes(nodesInput({
      beats: [beat({ id: 'b1', cluster: 'c1' }), beat({ id: 'b2' })],
      clusters: [cluster()],
    }));
    const ids = nodes.map(n => n.id);
    expect(ids).toContain('b2');
    expect(ids).toContain('c1');
    expect(ids).not.toContain('b1'); // clustered beat is NOT a real node today
    const clusterNode = nodes.find(n => n.id === 'c1')!;
    expect(clusterNode.data.containedBeats.map((b: any) => b.beatId)).toEqual(['b1']);
  });

  it('renders beats standalone when their cluster does not exist (defensive)', () => {
    const nodes = buildGraphNodes(nodesInput({
      beats: [beat({ id: 'b1', cluster: 'ghost' })],
    }));
    expect(nodes.map(n => n.id)).toContain('b1');
  });

  it('uses stored container positions, else the default grid', () => {
    const nodes = buildGraphNodes(nodesInput({
      beats: [
        beat({ id: 'b1', cluster: 'c1' }),
        beat({ id: 'b2', cluster: 'c1' }),
      ],
      clusters: [cluster()],
      containerBeatPositions: [
        { beatId: 'b1', clusterId: 'c1', position: { x: 111, y: 222, z: 0 } } as any,
      ],
    }));
    const contained = nodes.find(n => n.id === 'c1')!.data.containedBeats;
    expect(contained[0].position).toMatchObject({ x: 111, y: 222 });
    expect(contained[1].position).toMatchObject({ x: 20 + 200, y: 20 }); // grid slot 1
  });

  it('sets collapsed cluster height to the 40px pill', () => {
    const nodes = buildGraphNodes(nodesInput({
      clusters: [cluster({ isExpanded: false })],
    }));
    expect(nodes[0].style).toMatchObject({ height: 40 });
  });
});

describe('buildGraphEdges', () => {
  it('emits connection edges between top-level beats', () => {
    const edges = buildGraphEdges({
      beats: [
        beat({ id: 'b1', connections: [{ targetId: 'b2', label: 'go' }] }),
        beat({ id: 'b2' }),
      ],
      expandedDialogs: new Set(),
    });
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ source: 'b1', target: 'b2', label: 'go' });
  });

  it('[Phase 2 inverts] skips edges internal to one cluster', () => {
    const edges = buildGraphEdges({
      beats: [
        beat({ id: 'b1', cluster: 'c1', connections: [{ targetId: 'b2' }] }),
        beat({ id: 'b2', cluster: 'c1' }),
      ],
      expandedDialogs: new Set(),
    });
    expect(edges).toHaveLength(0);
  });

  it('[Phase 2 inverts] collapses cross-cluster endpoints onto the cluster frames', () => {
    const edges = buildGraphEdges({
      beats: [
        beat({ id: 'b1', cluster: 'c1', connections: [{ targetId: 'b2' }] }),
        beat({ id: 'b2', cluster: 'c2' }),
      ],
      expandedDialogs: new Set(),
    });
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ source: 'c1', target: 'c2' });
  });

  it('emits conditionBeat true/false branch edges', () => {
    const edges = buildGraphEdges({
      beats: [
        beat({ id: 'q1', type: 'conditionBeat', params: { trueTarget: 't1', falseTarget: 'f1' } }),
        beat({ id: 't1' }),
        beat({ id: 'f1' }),
      ],
      expandedDialogs: new Set(),
    });
    expect(edges.map(e => e.label).sort()).toEqual(['False', 'True']);
  });

  it('emits movementChoice edges per choice with labels', () => {
    const edges = buildGraphEdges({
      beats: [
        beat({
          id: 'm1', type: 'movementChoice',
          params: { choices: [{ target: 'x1', text: 'North' }, { target: 'x2', text: 'South' }] },
        }),
        beat({ id: 'x1' }),
        beat({ id: 'x2' }),
      ],
      expandedDialogs: new Set(),
    });
    expect(edges.map(e => e.label)).toEqual(['North', 'South']);
  });

  it('emits legacy single-node dialogTree choice edges when collapsed', () => {
    const edges = buildGraphEdges({
      beats: [
        beat({ id: 'd1', type: 'dialogTree', params: { dialogTree: SMALL_TREE } }),
        beat({ id: 'b9' }),
      ],
      expandedDialogs: new Set(),
    });
    expect(edges.length).toBe(2);
    expect(edges.every(e => e.source === 'd1' && e.target === 'b9')).toBe(true);
  });

  it('routes an expanded dialogTree through per-exit child edges instead', () => {
    const edges = buildGraphEdges({
      beats: [
        beat({ id: 'd1', type: 'dialogTree', params: { dialogTree: SMALL_TREE } }),
        beat({ id: 'b9' }),
      ],
      expandedDialogs: new Set(['d1']),
    });
    const exits = edges.filter(e => e.id.startsWith('dlgexit-'));
    expect(exits.length).toBeGreaterThan(0);
    for (const e of exits) {
      expect(e.source.startsWith('dlg:d1:')).toBe(true);
      expect(e.target).toBe('b9');
    }
    // the collapsed-form beat-level dialog edges must be suppressed
    expect(edges.some(e => e.source === 'd1' && (e.data as any)?.isDialog)).toBe(false);
  });

  it('emits defaultTarget edges', () => {
    const edges = buildGraphEdges({
      beats: [beat({ id: 'b1', defaultTarget: 'b2' }), beat({ id: 'b2' })],
      expandedDialogs: new Set(),
    });
    expect(edges[0]).toMatchObject({ label: 'default', source: 'b1', target: 'b2' });
  });
});
