/**
 * graphBuild — the single source of graph nodes and edges.
 *
 * These tests pin the conversion rules of the cluster unification: clustered
 * beats are real ReactFlow child nodes (parentNode/extent, +header position
 * conversion, hidden-on-collapse), and every edge is a real edge with
 * collapse-aware endpoint resolution. If a second rendering path ever grows
 * back, these are the tripwire.
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

  it('renders clustered beats as real child nodes of the cluster frame', () => {
    const nodes = buildGraphNodes(nodesInput({
      beats: [beat({ id: 'b1', cluster: 'c1' }), beat({ id: 'b2' })],
      clusters: [cluster()],
    }));
    const child = nodes.find(n => n.id === 'b1')!;
    expect(child.type).toBe('beat');
    expect((child as any).parentNode).toBe('c1');
    expect((child as any).extent).toBe('parent');
    expect(child.hidden).toBeUndefined();
    expect(typeof child.data.onEjectFromCluster).toBe('function');
    // top-level beats carry no eject affordance
    expect(nodes.find(n => n.id === 'b2')!.data.onEjectFromCluster).toBeUndefined();
    // hard ReactFlow invariant: the parent frame precedes its children
    expect(nodes.findIndex(n => n.id === 'c1')).toBeLessThan(nodes.findIndex(n => n.id === 'b1'));
  });

  it('converts stored content-relative positions to parent-relative (+header)', () => {
    const nodes = buildGraphNodes(nodesInput({
      beats: [beat({ id: 'b1', cluster: 'c1' })],
      clusters: [cluster()],
      containerBeatPositions: [
        { beatId: 'b1', clusterId: 'c1', position: { x: 111, y: 222, z: 0 } } as any,
      ],
    }));
    expect(nodes.find(n => n.id === 'b1')!.position).toEqual({ x: 111, y: 222 + 40 });
  });

  it('hides children (not drops them) when their cluster is collapsed', () => {
    const nodes = buildGraphNodes(nodesInput({
      beats: [beat({ id: 'b1', cluster: 'c1' })],
      clusters: [cluster({ isExpanded: false })],
    }));
    const child = nodes.find(n => n.id === 'b1')!;
    expect(child.hidden).toBe(true);
    expect((child as any).parentNode).toBe('c1');
  });

  it('gives CLUSTERED dialogTree beats the expansion trigger too', () => {
    // The Red Story gap that started the unification: all its dialogTrees
    // are clustered and the hand-rendered cards had no ▸.
    const nodes = buildGraphNodes(nodesInput({
      beats: [beat({ id: 'd1', cluster: 'c1', type: 'dialogTree', params: { dialogTree: SMALL_TREE } })],
      clusters: [cluster()],
    }));
    const node = nodes.find(n => n.id === 'd1')!;
    expect(node.data.dialogTree).toBe(SMALL_TREE);
    expect(typeof node.data.onToggleDialogExpand).toBe('function');
  });

  it('expands a clustered dialogTree as a nested sub-flow (cluster → container → cards)', () => {
    const nodes = buildGraphNodes(nodesInput({
      beats: [beat({ id: 'd1', cluster: 'c1', type: 'dialogTree', params: { dialogTree: SMALL_TREE } })],
      clusters: [cluster()],
      expandedDialogs: new Set(['d1']),
    }));
    const container = nodes.find(n => n.id === 'd1')!;
    expect(container.type).toBe('dialogContainer');
    expect((container as any).parentNode).toBe('c1');
    expect((container as any).extent).toBeUndefined(); // may float past the frame
    const cards = nodes.filter(n => n.type === 'dialogInternal');
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) expect((card as any).parentNode).toBe('d1');
    // ancestor ordering: cluster before container before cards
    const iCluster = nodes.findIndex(n => n.id === 'c1');
    const iContainer = nodes.indexOf(container);
    expect(iCluster).toBeLessThan(iContainer);
    expect(iContainer).toBeLessThan(nodes.indexOf(cards[0]));
  });

  it('pushes sibling beats aside and grows the frame when a clustered dialog expands', () => {
    const nodes = buildGraphNodes(nodesInput({
      beats: [
        beat({ id: 'd1', cluster: 'c1', type: 'dialogTree', params: { dialogTree: SMALL_TREE } }),
        beat({ id: 'b2', cluster: 'c1' }),
      ],
      clusters: [cluster()],
      containerBeatPositions: [
        { beatId: 'd1', clusterId: 'c1', position: { x: 20, y: 20, z: 0 } } as any,
        // directly right of the dialog, vertically overlapping it
        { beatId: 'b2', clusterId: 'c1', position: { x: 220, y: 20, z: 0 } } as any,
      ],
      expandedDialogs: new Set(['d1']),
    }));
    const container = nodes.find(n => n.id === 'd1')!;
    const sibling = nodes.find(n => n.id === 'b2')!;
    const W = Number((container.style as any).width);
    // sibling shifted right by the container's growth beyond a normal node
    expect(sibling.position.x).toBe(220 + Math.max(0, W - 160));
    // frame grew (style only) to keep the shifted sibling inside
    const frame = nodes.find(n => n.id === 'c1')!;
    expect(Number((frame.style as any).width)).toBeGreaterThanOrEqual(sibling.position.x + 160 + 20);
  });

  it('hides an expanded dialog (container AND cards) when its cluster collapses', () => {
    const nodes = buildGraphNodes(nodesInput({
      beats: [beat({ id: 'd1', cluster: 'c1', type: 'dialogTree', params: { dialogTree: SMALL_TREE } })],
      clusters: [cluster({ isExpanded: false })],
      expandedDialogs: new Set(['d1']),
    }));
    expect(nodes.find(n => n.id === 'd1')!.hidden).toBe(true);
    for (const card of nodes.filter(n => n.type === 'dialogInternal')) {
      expect(card.hidden).toBe(true);
    }
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
    expect(nodes.find(n => n.id === 'b1')!.position).toEqual({ x: 111, y: 222 + 40 });
    // grid slot 1 (index 1 in this cluster), +header conversion
    expect(nodes.find(n => n.id === 'b2')!.position).toEqual({ x: 20 + 200, y: 20 + 40 });
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
      clusters: [],
      expandedDialogs: new Set(),
    });
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ source: 'b1', target: 'b2', label: 'go' });
  });

  it('emits real edges between beats inside one EXPANDED cluster', () => {
    const edges = buildGraphEdges({
      beats: [
        beat({ id: 'b1', cluster: 'c1', connections: [{ targetId: 'b2' }] }),
        beat({ id: 'b2', cluster: 'c1' }),
      ],
      clusters: [cluster()],
      expandedDialogs: new Set(),
    });
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ source: 'b1', target: 'b2' });
    // must render above the opaque cluster frame
    expect((edges[0] as any).zIndex).toBe(5);
  });

  it('drops edges internal to one COLLAPSED cluster (both dock at the pill)', () => {
    const edges = buildGraphEdges({
      beats: [
        beat({ id: 'b1', cluster: 'c1', connections: [{ targetId: 'b2' }] }),
        beat({ id: 'b2', cluster: 'c1' }),
      ],
      clusters: [cluster({ isExpanded: false })],
      expandedDialogs: new Set(),
    });
    expect(edges).toHaveLength(0);
  });

  it('resolves endpoints per cluster collapse state', () => {
    const edges = buildGraphEdges({
      beats: [
        beat({ id: 'b1', cluster: 'c1', connections: [{ targetId: 'b2' }] }),
        beat({ id: 'b2', cluster: 'c2' }),
      ],
      clusters: [cluster(), cluster({ id: 'c2', isExpanded: false })],
      expandedDialogs: new Set(),
    });
    expect(edges).toHaveLength(1);
    // expanded source keeps the beat id; collapsed target docks at the frame
    expect(edges[0]).toMatchObject({ source: 'b1', target: 'c2' });
  });

  it('treats orphaned cluster refs as unclustered in edge resolution', () => {
    const edges = buildGraphEdges({
      beats: [
        beat({ id: 'b1', cluster: 'ghost', connections: [{ targetId: 'b2' }] }),
        beat({ id: 'b2' }),
      ],
      clusters: [],
      expandedDialogs: new Set(),
    });
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ source: 'b1', target: 'b2' });
  });

  it('routes special-kind edges (conditionBeat) through cluster resolution too', () => {
    // Pre-unification these bypassed createEdge and silently vanished for
    // clustered beats; now every kind is collapse-aware.
    const edges = buildGraphEdges({
      beats: [
        beat({ id: 'q1', cluster: 'c1', type: 'conditionBeat', params: { trueTarget: 't1' } }),
        beat({ id: 't1', cluster: 'c1' }),
      ],
      clusters: [cluster()],
      expandedDialogs: new Set(),
    });
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ source: 'q1', target: 't1', label: 'True' });
  });

  it('emits conditionBeat true/false branch edges', () => {
    const edges = buildGraphEdges({
      beats: [
        beat({ id: 'q1', type: 'conditionBeat', params: { trueTarget: 't1', falseTarget: 'f1' } }),
        beat({ id: 't1' }),
        beat({ id: 'f1' }),
      ],
      clusters: [],
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
      clusters: [],
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
      clusters: [],
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
      clusters: [],
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

  it('routes an expanded CLUSTERED dialogTree through per-exit edges', () => {
    const edges = buildGraphEdges({
      beats: [
        beat({ id: 'd1', cluster: 'c1', type: 'dialogTree', params: { dialogTree: SMALL_TREE } }),
        beat({ id: 'b9' }),
      ],
      clusters: [cluster()],
      expandedDialogs: new Set(['d1']),
    });
    const exits = edges.filter(e => e.id.includes('dlgexit-'));
    expect(exits.length).toBeGreaterThan(0);
    for (const e of exits) expect(e.source.startsWith('dlg:d1:')).toBe(true);
    expect(edges.some(e => (e.data as any)?.isDialog)).toBe(false);
  });

  it('falls back to pill-docked beat edges when the expanded dialog sits in a collapsed cluster', () => {
    const edges = buildGraphEdges({
      beats: [
        beat({ id: 'd1', cluster: 'c1', type: 'dialogTree', params: { dialogTree: SMALL_TREE } }),
        beat({ id: 'b9' }),
      ],
      clusters: [cluster({ isExpanded: false })],
      expandedDialogs: new Set(['d1']),
    });
    // no per-exit edges (they'd hang off hidden cards) …
    expect(edges.some(e => e.id.includes('dlgexit-'))).toBe(false);
    // … instead the legacy dialog-choice edges dock at the cluster pill
    const dialogEdges = edges.filter(e => (e.data as any)?.isDialog);
    expect(dialogEdges.length).toBe(2);
    for (const e of dialogEdges) expect(e.source).toBe('c1');
  });

  it('emits defaultTarget edges', () => {
    const edges = buildGraphEdges({
      beats: [beat({ id: 'b1', defaultTarget: 'b2' }), beat({ id: 'b2' })],
      clusters: [],
      expandedDialogs: new Set(),
    });
    expect(edges[0]).toMatchObject({ label: 'default', source: 'b1', target: 'b2' });
  });
});
