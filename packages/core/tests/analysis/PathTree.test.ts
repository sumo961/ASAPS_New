import { describe, it, expect } from 'vitest';
import { buildPathTree, type PathTreeNode } from '../../src/analysis/PathTree';
import { StateSimulationAnalyzer } from '../../src/analysis/StateSimulationAnalyzer';
import { Story } from '../../src/engine/Story';
import { createTestBeat } from '../test-utils';
import hollowStarFixture from '../fixtures/hollowstar.json';

function loadFixtureStory(fixture: any): Story {
  const src = fixture.story ?? fixture;
  const story = new Story({
    title: src.metadata?.title || 'fixture',
    author: src.metadata?.author || 'fixture',
    firstBeatId: src.beats?.[0]?.id || 'beat_0',
  });
  for (const b of src.beats || []) {
    const parameters = { ...(b.parameters || {}) };
    if (b.type === 'conditionBeat') {
      if (parameters.trueConnection?.target) {
        parameters.trueTarget = parameters.trueConnection.target;
      }
      if (parameters.falseConnection?.target) {
        parameters.falseTarget = parameters.falseConnection.target;
      }
    }
    story.addBeat(createTestBeat({
      id: b.id,
      name: b.name || b.label || b.id,
      type: b.type,
      parameters,
      connections: b.connections,
    } as any));
  }
  return story;
}

function countNodes(node: PathTreeNode): number {
  let count = 1;
  for (const c of node.children) count += countNodes(c.child);
  if (node.hubExitNode) count += countNodes(node.hubExitNode);
  return count;
}

describe('PathTree', () => {
  it('builds a tree from a simple linear story', () => {
    const story = new Story({ title: 'Linear', author: 't', firstBeatId: 'a' });
    story.addBeat(createTestBeat({ id: 'a', name: 'A', type: 'titleScreen', parameters: { title: 'x' }, connections: [{ targetId: 'b' }] }));
    story.addBeat(createTestBeat({ id: 'b', name: 'B', type: 'infoText', parameters: { text: 'y' }, connections: [{ targetId: 'c' }] }));
    story.addBeat(createTestBeat({ id: 'c', name: 'C', type: 'endScreen', parameters: { message: 'end' } }));

    const analyzer = new StateSimulationAnalyzer(story);
    const paths = analyzer.analyzeRaw();
    const tree = buildPathTree(paths, story);

    expect(tree.totalRawPaths).toBe(1);
    expect(tree.root.beats.length).toBeGreaterThanOrEqual(3);
    expect(tree.root.type).toBe('ending');
    expect(tree.root.children).toHaveLength(0);
  });

  it('builds branches for a simple 2-choice story', () => {
    const story = new Story({ title: 'Branch', author: 't', firstBeatId: 'start' });
    story.addBeat(createTestBeat({
      id: 'start', name: 'Start', type: 'titleScreen',
      parameters: { title: 'x' }, connections: [{ targetId: 'choice' }],
    }));
    story.addBeat(createTestBeat({
      id: 'choice', name: 'Choice', type: 'movementChoice',
      parameters: { choices: [
        { id: 'c1', text: 'Left', location: 'Left', target: 'end_a' },
        { id: 'c2', text: 'Right', location: 'Right', target: 'end_b' },
      ] },
    }));
    story.addBeat(createTestBeat({ id: 'end_a', name: 'End A', type: 'endScreen', parameters: { message: 'A' } }));
    story.addBeat(createTestBeat({ id: 'end_b', name: 'End B', type: 'endScreen', parameters: { message: 'B' } }));

    const paths = new StateSimulationAnalyzer(story).analyzeRaw();
    const tree = buildPathTree(paths, story);

    expect(tree.totalRawPaths).toBe(2);
    expect(tree.root.type).toBe('branch');
    expect(tree.root.children).toHaveLength(2);
    expect(tree.uniqueEndings).toHaveLength(2);
  });

  it('detects a hub in the Hollow Star fixture', () => {
    const story = loadFixtureStory(hollowStarFixture);
    const paths = new StateSimulationAnalyzer(story).analyzeRaw();
    const tree = buildPathTree(paths, story);

    expect(tree.totalRawPaths).toBeGreaterThan(1000);

    // The tree should be dramatically smaller than the flat path count
    expect(tree.totalTreeNodes).toBeLessThan(tree.totalRawPaths / 10);

    // Should find a hub node somewhere in the tree
    const findHub = (n: PathTreeNode): PathTreeNode | null => {
      if (n.type === 'hub') return n;
      for (const c of n.children) {
        const found = findHub(c.child);
        if (found) return found;
      }
      if (n.hubExitNode) {
        const found = findHub(n.hubExitNode);
        if (found) return found;
      }
      return null;
    };

    const hub = findHub(tree.root);
    expect(hub).not.toBeNull();
    expect(hub!.hubOptions.length).toBeGreaterThan(1);

    // getStateAt should work
    const firstPath = paths[0];
    const firstBeatId = firstPath.steps[0].beatId;
    const state = tree.getStateAt(firstBeatId, 0);
    expect(state).not.toBeNull();
  });
});
