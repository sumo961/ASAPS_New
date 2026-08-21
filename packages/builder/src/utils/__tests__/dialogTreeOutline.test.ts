/**
 * dialogTreeOutline — the flattened view data behind the flowchart's
 * expanded dialogTree node (B1b). Pinned: row order, exit detection,
 * pathId stability (they double as ReactFlow handle ids), depth caps.
 */
import { describe, it, expect } from 'vitest';
import { dialogTreeOutline } from '../dialogTreeOutline';

const tree = {
  id: 'root', speaker: 'Guide', text: 'Welcome.',
  choices: [
    { id: 'c_a', text: 'Ask about the key', dialogNode: {
      id: 'n2', speaker: 'Guide', text: 'It opens the cellar.',
      choices: [
        { id: 'c_b', text: 'Take the key', target: 'beat_9',
          conditions: [{ type: 'counter', operator: '>=', variableName: 'trust', value: 2 }] },
        { id: 'c_c', text: 'Never mind', target: '__self__' },
      ],
    } },
    { id: 'c_d', text: 'Leave', target: 'beat_5' },
  ],
};

describe('dialogTreeOutline', () => {
  it('walks nodes and choices in document order with stable pathIds', () => {
    const o = dialogTreeOutline(tree);
    expect(o.rows.map(r => r.pathId)).toEqual([
      'root', 'root.c0', 'root.c0.n', 'root.c0.n.c0', 'root.c0.n.c1', 'root.c1',
    ]);
    expect(o.rows[0]).toMatchObject({ kind: 'npc', speaker: 'Guide', nodeId: 'root' });
    expect(o.rows[3]).toMatchObject({ kind: 'choice', text: 'Take the key', exitTarget: 'beat_9' });
  });

  it('collects real exits and excludes __self__ loops', () => {
    const o = dialogTreeOutline(tree);
    expect(o.exits.map(e => [e.pathId, e.exitTarget])).toEqual([
      ['root.c0.n.c0', 'beat_9'],
      ['root.c1', 'beat_5'],
    ]);
  });

  it('carries guard conditions on the rows that have them', () => {
    const o = dialogTreeOutline(tree);
    const guarded = o.rows.find(r => r.pathId === 'root.c0.n.c0');
    expect(guarded?.conditions).toHaveLength(1);
    expect(o.rows.find(r => r.pathId === 'root.c1')?.conditions).toBeUndefined();
  });

  it('caps runaway trees and reports truncation', () => {
    // A linear chain deeper than the cap
    let node: any = { id: 'leaf', speaker: 'X', text: 'end', choices: [] };
    for (let i = 0; i < 12; i++) {
      node = { id: `n${i}`, speaker: 'X', text: 't', choices: [{ id: `c${i}`, text: 'go', dialogNode: node }] };
    }
    const o = dialogTreeOutline(node);
    expect(o.truncated).toBe(true);
    expect(o.rows.length).toBeLessThanOrEqual(40);
  });

  it('handles a missing tree gracefully', () => {
    const o = dialogTreeOutline(undefined);
    expect(o.rows).toEqual([]);
    expect(o.exits).toEqual([]);
  });
});
