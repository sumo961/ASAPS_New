import { describe, it, expect } from 'vitest';
import { SYSTEMIC_NODE_TYPES as N, SYSTEMIC_EDGE_TYPES as E } from '@asaps/core';
import { toKGStoryInput, buildWorkspaceKG, layoutKG, nodeColor } from '../kgAdapter';

/** Minimal stand-in for a runtime dialogTree Beat (exposes getParameters). */
function dialogBeat(id: string, target: string) {
  return {
    id,
    name: `Beat ${id}`,
    type: 'dialogTree',
    speaker: 'Child',
    connections: [{ targetId: target }],
    getParameters: () => ({
      dialogTree: {
        id: 'root',
        choices: [
          {
            id: `${id}_yes`,
            text: 'Support them',
            effects: [{ target: 'support', type: 'incrementCounter', value: 1 }],
            target,
          },
        ],
      },
    }),
  };
}

const characters = [
  { id: 'c_child', name: 'child', displayName: 'Child', role: 'npc', counters: [{ name: 'support', displayName: 'Support', value: 0 }] },
];

describe('toKGStoryInput', () => {
  it('serializes runtime beats through getParameters()', () => {
    const input = toKGStoryInput([dialogBeat('b1', 'b2')] as any, [], characters as any);
    expect(input.beats?.[0].parameters?.dialogTree).toBeTruthy();
    expect(input.beats?.[0].connections?.[0].targetId).toBe('b2');
    expect(input.characters?.[0].counters?.[0].name).toBe('support');
  });
});

describe('buildWorkspaceKG', () => {
  const graph = buildWorkspaceKG(
    [dialogBeat('b1', 'b2'), dialogBeat('b2', 'b1')] as any,
    [{ source: 'b1', target: 'b2' }],
    characters as any,
    [{ name: 'flag', type: 'string' }]
  );

  it('produces beat, choice, character, counter and variable nodes', () => {
    const types = new Set(graph.nodes.map((n) => n.type));
    expect(types.has(N.Beat)).toBe(true);
    expect(types.has(N.Choice)).toBe(true);
    expect(types.has(N.Character)).toBe(true);
    expect(types.has(N.Counter)).toBe(true);
    expect(types.has(N.Variable)).toBe(true);
  });

  it('wires choices to the counter they affect and the beat they lead to', () => {
    expect(graph.edges.some((e) => e.type === E.affects && e.target === 'counter:support')).toBe(true);
    expect(graph.edges.some((e) => e.type === E.choiceLeadsTo)).toBe(true);
    expect(graph.edges.some((e) => e.type === E.spokenBy)).toBe(true);
  });
});

describe('layoutKG', () => {
  const graph = buildWorkspaceKG([dialogBeat('b1', 'b2')] as any, [], characters as any);

  it('positions every visible node and keeps edges within the visible set', () => {
    const { nodes, edges } = layoutKG(graph);
    expect(nodes.length).toBe(graph.nodes.length);
    for (const n of nodes) {
      expect(typeof n.position.x).toBe('number');
      expect(typeof n.position.y).toBe('number');
    }
    const ids = new Set(nodes.map((n) => n.id));
    for (const e of edges) {
      expect(ids.has(e.source)).toBe(true);
      expect(ids.has(e.target)).toBe(true);
    }
  });

  it('hides filtered-out node types and their edges', () => {
    const visibleTypes = new Set<string>([N.Beat]); // hide everything but beats
    const { nodes, edges } = layoutKG(graph, { visibleTypes });
    expect(nodes.every((n) => (n.data as any).kgType === N.Beat)).toBe(true);
    // No edge can reference a hidden endpoint.
    const ids = new Set(nodes.map((n) => n.id));
    for (const e of edges) {
      expect(ids.has(e.source) && ids.has(e.target)).toBe(true);
    }
  });

  it('dims nodes that do not match the search set', () => {
    const matchIds = new Set<string>(['char:c_child']);
    const { nodes } = layoutKG(graph, { matchIds });
    const matched = nodes.find((n) => n.id === 'char:c_child');
    const other = nodes.find((n) => n.id !== 'char:c_child');
    expect((matched!.style as any).opacity).toBe(1);
    expect((other!.style as any).opacity).toBeLessThan(1);
  });

  it('assigns a stable color per type', () => {
    expect(nodeColor(N.Beat)).toBe(nodeColor(N.Beat));
    expect(nodeColor('SomethingEmergent')).toBeTruthy();
  });
});
