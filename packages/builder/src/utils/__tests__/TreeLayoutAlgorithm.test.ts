import { describe, it, expect } from 'vitest';
import {
  calculateTreeLayout,
  extractConnectionsFromBeats,
  applyTreeLayoutToBeats,
  applyClusterAwareTreeLayout,
  ClusterAwareLayoutResult
} from '../TreeLayoutAlgorithm';

describe('TreeLayoutAlgorithm', () => {
  describe('calculateTreeLayout', () => {
    it('should return empty positions for empty input', () => {
      const result = calculateTreeLayout([], []);
      expect(result.positions.size).toBe(0);
      expect(result.layers.size).toBe(0);
    });

    it('should position a single node', () => {
      const nodes = [{ id: 'beat1' }];
      const result = calculateTreeLayout(nodes, []);

      expect(result.positions.has('beat1')).toBe(true);
      const pos = result.positions.get('beat1')!;
      expect(pos.x).toBeGreaterThanOrEqual(0);
      expect(pos.y).toBeGreaterThanOrEqual(0);
    });

    it('should position nodes in a linear chain', () => {
      const nodes = [
        { id: 'beat1' },
        { id: 'beat2' },
        { id: 'beat3' }
      ];
      const edges = [
        { source: 'beat1', target: 'beat2' },
        { source: 'beat2', target: 'beat3' }
      ];

      const result = calculateTreeLayout(nodes, edges);

      // All nodes should be positioned
      expect(result.positions.size).toBe(3);

      // Nodes should be at increasing Y positions (top to bottom)
      const pos1 = result.positions.get('beat1')!;
      const pos2 = result.positions.get('beat2')!;
      const pos3 = result.positions.get('beat3')!;

      expect(pos2.y).toBeGreaterThan(pos1.y);
      expect(pos3.y).toBeGreaterThan(pos2.y);
    });

    it('should position branching nodes side by side', () => {
      const nodes = [
        { id: 'root' },
        { id: 'left' },
        { id: 'right' }
      ];
      const edges = [
        { source: 'root', target: 'left' },
        { source: 'root', target: 'right' }
      ];

      const result = calculateTreeLayout(nodes, edges);

      const leftPos = result.positions.get('left')!;
      const rightPos = result.positions.get('right')!;

      // Children should be at same Y level
      expect(leftPos.y).toBe(rightPos.y);
      // Children should be at different X positions
      expect(leftPos.x).not.toBe(rightPos.x);
    });

    it('should handle disconnected components', () => {
      const nodes = [
        { id: 'tree1_root' },
        { id: 'tree1_child' },
        { id: 'tree2_root' },
        { id: 'tree2_child' }
      ];
      const edges = [
        { source: 'tree1_root', target: 'tree1_child' },
        { source: 'tree2_root', target: 'tree2_child' }
      ];

      const result = calculateTreeLayout(nodes, edges);

      // All nodes should be positioned
      expect(result.positions.size).toBe(4);

      // Trees should be separated horizontally
      const tree1Root = result.positions.get('tree1_root')!;
      const tree2Root = result.positions.get('tree2_root')!;
      expect(tree1Root.x).not.toBe(tree2Root.x);
    });

    it('should respect custom spacing options', () => {
      const nodes = [
        { id: 'parent' },
        { id: 'child' }
      ];
      const edges = [{ source: 'parent', target: 'child' }];

      const smallSpacing = calculateTreeLayout(nodes, edges, {
        nodeSpacingY: 50
      });
      const largeSpacing = calculateTreeLayout(nodes, edges, {
        nodeSpacingY: 200
      });

      const smallDiff = Math.abs(
        smallSpacing.positions.get('child')!.y - smallSpacing.positions.get('parent')!.y
      );
      const largeDiff = Math.abs(
        largeSpacing.positions.get('child')!.y - largeSpacing.positions.get('parent')!.y
      );

      expect(largeDiff).toBeGreaterThan(smallDiff);
    });
  });

  describe('extractConnectionsFromBeats', () => {
    it('should extract single connection', () => {
      const beats = [{
        id: 'beat1',
        type: 'titleScreen',
        parameters: {
          connection: { target: 'beat2' }
        }
      }];

      const edges = extractConnectionsFromBeats(beats);

      expect(edges).toHaveLength(1);
      expect(edges[0]).toEqual({ source: 'beat1', target: 'beat2' });
    });

    it('should extract conditionBeat true/false targets', () => {
      const beats = [{
        id: 'condition1',
        type: 'conditionBeat',
        parameters: {
          trueTarget: 'beatTrue',
          falseTarget: 'beatFalse'
        }
      }];

      const edges = extractConnectionsFromBeats(beats);

      expect(edges).toHaveLength(2);
      expect(edges).toContainEqual({ source: 'condition1', target: 'beatTrue' });
      expect(edges).toContainEqual({ source: 'condition1', target: 'beatFalse' });
    });

    it('should extract movementChoice targets', () => {
      const beats = [{
        id: 'movement1',
        type: 'movementChoice',
        parameters: {
          choices: [
            { label: 'Go left', target: 'leftRoom' },
            { label: 'Go right', target: 'rightRoom' }
          ]
        }
      }];

      const edges = extractConnectionsFromBeats(beats);

      expect(edges).toHaveLength(2);
      expect(edges).toContainEqual({ source: 'movement1', target: 'leftRoom' });
      expect(edges).toContainEqual({ source: 'movement1', target: 'rightRoom' });
    });

    it('should extract dialogTree choices', () => {
      const beats = [{
        id: 'dialog1',
        type: 'dialogTree',
        parameters: {
          dialogTree: {
            choices: [
              { text: 'Option A', target: 'beatA' },
              { text: 'Option B', target: 'beatB' }
            ]
          }
        }
      }];

      const edges = extractConnectionsFromBeats(beats);

      expect(edges).toHaveLength(2);
      expect(edges).toContainEqual({ source: 'dialog1', target: 'beatA' });
      expect(edges).toContainEqual({ source: 'dialog1', target: 'beatB' });
    });

    it('should extract hyperText links', () => {
      const beats = [{
        id: 'hyper1',
        type: 'hyperText',
        parameters: {
          hyperlinks: [
            { word: 'click', targetBeatId: 'target1' },
            { word: 'here', targetBeatId: 'target2' }
          ]
        }
      }];

      const edges = extractConnectionsFromBeats(beats);

      expect(edges).toHaveLength(2);
      expect(edges).toContainEqual({ source: 'hyper1', target: 'target1' });
      expect(edges).toContainEqual({ source: 'hyper1', target: 'target2' });
    });

    it('should deduplicate edges', () => {
      const beats = [{
        id: 'beat1',
        type: 'conditionBeat',
        parameters: {
          trueTarget: 'sameTarget',
          falseTarget: 'sameTarget'
        }
      }];

      const edges = extractConnectionsFromBeats(beats);

      // Should only have one edge even though both conditions point to same target
      expect(edges).toHaveLength(1);
      expect(edges[0]).toEqual({ source: 'beat1', target: 'sameTarget' });
    });
  });

  describe('applyTreeLayoutToBeats', () => {
    it('should return positions for all beats', () => {
      const beats = [
        { id: 'beat1', type: 'titleScreen', parameters: { connection: { target: 'beat2' } } },
        { id: 'beat2', type: 'introText', parameters: {} }
      ];

      const positions = applyTreeLayoutToBeats(beats);

      expect(positions.size).toBe(2);
      expect(positions.has('beat1')).toBe(true);
      expect(positions.has('beat2')).toBe(true);
    });

    it('should merge external edges with parameter edges', () => {
      const beats = [
        { id: 'beat1', type: 'titleScreen', parameters: {} },
        { id: 'beat2', type: 'introText', parameters: {} },
        { id: 'beat3', type: 'endScreen', parameters: {} }
      ];
      const externalEdges = [
        { source: 'beat1', target: 'beat2' },
        { source: 'beat2', target: 'beat3' }
      ];

      const positions = applyTreeLayoutToBeats(beats, undefined, externalEdges);

      // All beats should be positioned in a chain
      const pos1 = positions.get('beat1')!;
      const pos2 = positions.get('beat2')!;
      const pos3 = positions.get('beat3')!;

      expect(pos2.y).toBeGreaterThan(pos1.y);
      expect(pos3.y).toBeGreaterThan(pos2.y);
    });
  });

  describe('applyClusterAwareTreeLayout', () => {
    it('should handle empty input', () => {
      const result = applyClusterAwareTreeLayout([], [], undefined, []);

      expect(result.beatPositions.size).toBe(0);
      expect(result.clusterPositions.size).toBe(0);
      expect(result.clusterInternalPositions.size).toBe(0);
    });

    it('should position unclustered beats normally', () => {
      const beats = [
        { id: 'beat1', type: 'titleScreen', parameters: { connection: { target: 'beat2' } } },
        { id: 'beat2', type: 'endScreen', parameters: {} }
      ];

      const result = applyClusterAwareTreeLayout(beats, []);

      expect(result.beatPositions.size).toBe(2);
      expect(result.beatPositions.has('beat1')).toBe(true);
      expect(result.beatPositions.has('beat2')).toBe(true);
    });

    it('should position clusters and their internal beats', () => {
      const beats = [
        { id: 'outside', type: 'titleScreen', parameters: { connection: { target: 'inside1' } } },
        { id: 'inside1', type: 'introText', cluster: 'cluster1', parameters: { connection: { target: 'inside2' } } },
        { id: 'inside2', type: 'endScreen', cluster: 'cluster1', parameters: {} }
      ];
      const clusters = [{
        id: 'cluster1',
        beatIds: ['inside1', 'inside2'],
        containerBounds: { width: 400, height: 300 }
      }];

      const result = applyClusterAwareTreeLayout(beats, clusters);

      // Unclustered beat should be in beatPositions
      expect(result.beatPositions.has('outside')).toBe(true);

      // Clustered beats should NOT be in beatPositions
      expect(result.beatPositions.has('inside1')).toBe(false);
      expect(result.beatPositions.has('inside2')).toBe(false);

      // Cluster should have a position
      expect(result.clusterPositions.has('cluster1')).toBe(true);

      // Internal beats should have positions within the cluster
      expect(result.clusterInternalPositions.has('cluster1')).toBe(true);
      const internalPositions = result.clusterInternalPositions.get('cluster1')!;
      expect(internalPositions.has('inside1')).toBe(true);
      expect(internalPositions.has('inside2')).toBe(true);
    });

    it('should skip internal cluster edges in main layout', () => {
      const beats = [
        { id: 'start', type: 'titleScreen', parameters: { connection: { target: 'a' } } },
        { id: 'a', type: 'introText', cluster: 'c1', parameters: { connection: { target: 'b' } } },
        { id: 'b', type: 'introText', cluster: 'c1', parameters: { connection: { target: 'end' } } },
        { id: 'end', type: 'endScreen', parameters: {} }
      ];
      const clusters = [{
        id: 'c1',
        beatIds: ['a', 'b'],
        containerBounds: { width: 400, height: 300 }
      }];

      const result = applyClusterAwareTreeLayout(beats, clusters);

      // The cluster should be positioned between start and end
      const startPos = result.beatPositions.get('start')!;
      const clusterPos = result.clusterPositions.get('c1')!;
      const endPos = result.beatPositions.get('end')!;

      // Flow should go: start -> cluster -> end (vertically)
      expect(clusterPos.y).toBeGreaterThan(startPos.y);
      expect(endPos.y).toBeGreaterThan(clusterPos.y);
    });

    it('should handle multiple clusters', () => {
      const beats = [
        { id: 'root', type: 'titleScreen', parameters: {} },
        { id: 'c1_b1', type: 'introText', cluster: 'cluster1', parameters: {} },
        { id: 'c2_b1', type: 'introText', cluster: 'cluster2', parameters: {} }
      ];
      const clusters = [
        { id: 'cluster1', beatIds: ['c1_b1'], containerBounds: { width: 300, height: 200 } },
        { id: 'cluster2', beatIds: ['c2_b1'], containerBounds: { width: 300, height: 200 } }
      ];
      const externalEdges = [
        { source: 'root', target: 'c1_b1' },
        { source: 'root', target: 'c2_b1' }
      ];

      const result = applyClusterAwareTreeLayout(beats, clusters, undefined, externalEdges);

      // Both clusters should be positioned
      expect(result.clusterPositions.has('cluster1')).toBe(true);
      expect(result.clusterPositions.has('cluster2')).toBe(true);

      // Clusters should be at different positions
      const c1Pos = result.clusterPositions.get('cluster1')!;
      const c2Pos = result.clusterPositions.get('cluster2')!;
      expect(c1Pos.x !== c2Pos.x || c1Pos.y !== c2Pos.y).toBe(true);
    });

    it('should layout beats within cluster using tree algorithm', () => {
      const beats = [
        { id: 'parent', type: 'introText', cluster: 'c1', parameters: {} },
        { id: 'child1', type: 'introText', cluster: 'c1', parameters: {} },
        { id: 'child2', type: 'introText', cluster: 'c1', parameters: {} }
      ];
      const clusters = [{
        id: 'c1',
        beatIds: ['parent', 'child1', 'child2'],
        containerBounds: { width: 500, height: 400 }
      }];
      const externalEdges = [
        { source: 'parent', target: 'child1' },
        { source: 'parent', target: 'child2' }
      ];

      const result = applyClusterAwareTreeLayout(beats, clusters, undefined, externalEdges);

      const internalPositions = result.clusterInternalPositions.get('c1')!;
      const parentPos = internalPositions.get('parent')!;
      const child1Pos = internalPositions.get('child1')!;
      const child2Pos = internalPositions.get('child2')!;

      // Children should be below parent
      expect(child1Pos.y).toBeGreaterThan(parentPos.y);
      expect(child2Pos.y).toBeGreaterThan(parentPos.y);

      // Children should be at same level
      expect(child1Pos.y).toBe(child2Pos.y);
    });

    it('should handle empty clusters', () => {
      const beats = [
        { id: 'outside', type: 'titleScreen', parameters: {} }
      ];
      const clusters = [{
        id: 'emptyCluster',
        beatIds: [],
        containerBounds: { width: 300, height: 200 }
      }];

      const result = applyClusterAwareTreeLayout(beats, clusters);

      // Empty cluster should still get internal positions map (empty)
      expect(result.clusterInternalPositions.has('emptyCluster')).toBe(true);
      expect(result.clusterInternalPositions.get('emptyCluster')!.size).toBe(0);
    });
  });
});
