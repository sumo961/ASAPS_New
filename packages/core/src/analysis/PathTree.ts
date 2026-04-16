/**
 * PathTree — Collapsed tree view over flat SimulatedPath[] data.
 *
 * Turns N! combinatorial path explosion into a compact tree that branches
 * only at actual decision points and collapses linear segments, hub loops,
 * and shared suffixes.
 *
 * The tree is a VIEW — the flat SimulatedPath[] stays the source of truth
 * for state snapshots and preset generation.
 */

import type { SimulatedPath, SimulatedStep, SimulationState } from './StateSimulationAnalyzer';
import type { Story } from '../engine/Story';

// ============================================================================
// Types
// ============================================================================

export interface BeatRef {
  beatId: string;
  beatName: string;
  beatType: string;
}

export interface PathTreeBranch {
  label: string;
  stateEffects?: string[];
  child: PathTreeNode;
}

export interface HubOption {
  label: string;
  targetBeatId: string;
  beats: BeatRef[];
  stateEffects: string[];
  subbranches?: PathTreeBranch[];
  returnsToHub: boolean;
}

export interface PathTreeNode {
  id: string;
  type: 'linear' | 'branch' | 'hub' | 'ending' | 'deadEnd';

  beats: BeatRef[];

  branchBeatId?: string;
  branchBeatName?: string;
  branchBeatType?: string;

  children: PathTreeBranch[];

  hubBeatId?: string;
  hubOptions: HubOption[];
  hubExitNode?: PathTreeNode;

  pathCount: number;
  representativePathIndex: number;
  pathIndices: number[];

  endType?: 'ending' | 'deadEnd' | 'cycle';
  endingBeatId?: string;
  endingBeatName?: string;
}

export interface PathTreeResult {
  root: PathTreeNode;
  totalRawPaths: number;
  totalTreeNodes: number;
  uniqueEndings: string[];
  flatPaths: SimulatedPath[];

  getStateAt(beatId: string, pathIndex: number): SimulationState | null;
}

// ============================================================================
// Internal trie structure
// ============================================================================

interface TrieNode {
  beatId: string;
  beatName: string;
  beatType: string;
  children: Map<string, TrieNode>;
  pathIndices: Set<number>;
  decisionLabels: Map<number, string>; // pathIndex → decision label used
  isTerminal: boolean;
  terminalType?: 'ending' | 'deadEnd' | 'cycle';
  terminalBeatId?: string;
  terminalBeatName?: string;
}

// ============================================================================
// Build algorithm
// ============================================================================

let nodeIdCounter = 0;
function nextId(): string {
  return `ptn_${nodeIdCounter++}`;
}

export function buildPathTree(paths: SimulatedPath[], story: Story): PathTreeResult {
  nodeIdCounter = 0;

  if (paths.length === 0) {
    const empty: PathTreeNode = {
      id: nextId(), type: 'linear', beats: [], children: [],
      hubOptions: [], pathCount: 0, representativePathIndex: -1, pathIndices: [],
    };
    return {
      root: empty, totalRawPaths: 0, totalTreeNodes: 1,
      uniqueEndings: [], flatPaths: paths,
      getStateAt: () => null,
    };
  }

  // Phase 1: Build trie
  const trieRoot = buildTrie(paths);

  // Phase 2: Detect hubs
  const hubBeats = detectHubs(paths);

  // Phase 3: Convert trie to PathTreeNode with collapsing
  const root = collapseTrieNode(trieRoot, paths, hubBeats, story, new Set());

  // Count nodes
  let totalNodes = 0;
  const countNodes = (n: PathTreeNode) => {
    totalNodes++;
    for (const c of n.children) countNodes(c.child);
    if (n.hubExitNode) countNodes(n.hubExitNode);
  };
  countNodes(root);

  const uniqueEndings = new Set<string>();
  for (const p of paths) {
    if (p.outcome.type === 'ending') uniqueEndings.add(p.outcome.beatId);
  }

  return {
    root,
    totalRawPaths: paths.length,
    totalTreeNodes: totalNodes,
    uniqueEndings: [...uniqueEndings],
    flatPaths: paths,
    getStateAt(beatId: string, pathIndex: number): SimulationState | null {
      if (pathIndex < 0 || pathIndex >= paths.length) return null;
      const step = paths[pathIndex].steps.find(s => s.beatId === beatId);
      return step?.stateAfter ?? null;
    },
  };
}

// ============================================================================
// Phase 1: Trie insertion
// ============================================================================

function buildTrie(paths: SimulatedPath[]): TrieNode {
  const root: TrieNode = {
    beatId: '__root__', beatName: '', beatType: '',
    children: new Map(), pathIndices: new Set(),
    decisionLabels: new Map(), isTerminal: false,
  };

  for (let pi = 0; pi < paths.length; pi++) {
    const path = paths[pi];
    let cursor = root;
    cursor.pathIndices.add(pi);

    for (let si = 0; si < path.steps.length; si++) {
      const step = path.steps[si];
      const key = step.beatId;

      if (!cursor.children.has(key)) {
        cursor.children.set(key, {
          beatId: step.beatId,
          beatName: step.beatName,
          beatType: step.beatType,
          children: new Map(),
          pathIndices: new Set(),
          decisionLabels: new Map(),
          isTerminal: false,
        });
      }

      cursor = cursor.children.get(key)!;
      cursor.pathIndices.add(pi);

      if (step.decisionMade) {
        cursor.decisionLabels.set(pi, step.decisionMade);
      }

      if (si === path.steps.length - 1) {
        cursor.isTerminal = true;
        cursor.terminalType = path.outcome.type;
        cursor.terminalBeatId = path.outcome.beatId;
        cursor.terminalBeatName = path.outcome.beatName;
      }
    }
  }

  return root;
}

// ============================================================================
// Phase 2: Hub detection
// ============================================================================

function detectHubs(paths: SimulatedPath[]): Set<string> {
  const revisitCounts = new Map<string, number>();

  for (const path of paths) {
    const seen = new Set<string>();
    for (const step of path.steps) {
      if (seen.has(step.beatId)) {
        revisitCounts.set(step.beatId, (revisitCounts.get(step.beatId) || 0) + 1);
      }
      seen.add(step.beatId);
    }
  }

  const hubs = new Set<string>();
  for (const [beatId, count] of revisitCounts) {
    // A beat is a hub if it's revisited in at least 10% of paths that visit it
    if (count >= Math.max(3, paths.length * 0.05)) {
      hubs.add(beatId);
    }
  }

  return hubs;
}

// ============================================================================
// Phase 3: Trie → PathTreeNode with collapsing
// ============================================================================

const CHOICE_TYPES = new Set([
  'dialogTree', 'movementChoice', 'pickProp', 'hyperText', 'conditionBeat',
]);

function collapseTrieNode(
  trie: TrieNode,
  paths: SimulatedPath[],
  hubBeats: Set<string>,
  story: Story,
  visitedHubs: Set<string>,
): PathTreeNode {
  const pathIndices = [...trie.pathIndices];

  // Collect the linear prefix: walk down single-child chains
  const linearBeats: BeatRef[] = [];
  let cursor: TrieNode = trie;

  // Skip the __root__ sentinel
  if (cursor.beatId !== '__root__') {
    linearBeats.push({
      beatId: cursor.beatId,
      beatName: cursor.beatName,
      beatType: cursor.beatType,
    });
  }

  // Walk single-child chains
  while (cursor.children.size === 1 && !cursor.isTerminal) {
    const [, child] = [...cursor.children.entries()][0];

    // Stop collapsing if this child is a hub we haven't processed yet
    if (hubBeats.has(child.beatId) && !visitedHubs.has(child.beatId)) {
      break;
    }

    // Stop collapsing at branch points (choice/condition beats with multiple children)
    if (child.children.size > 1 && CHOICE_TYPES.has(child.beatType)) {
      break;
    }

    cursor = child;
    linearBeats.push({
      beatId: cursor.beatId,
      beatName: cursor.beatName,
      beatType: cursor.beatType,
    });
  }

  // Terminal node
  if (cursor.isTerminal && cursor.children.size === 0) {
    const nodeType = cursor.terminalType === 'ending' ? 'ending' : 'deadEnd';
    return {
      id: nextId(),
      type: nodeType,
      beats: linearBeats,
      children: [],
      hubOptions: [],
      pathCount: pathIndices.length,
      representativePathIndex: pathIndices[0] ?? -1,
      pathIndices,
      endType: cursor.terminalType,
      endingBeatId: cursor.terminalBeatId,
      endingBeatName: cursor.terminalBeatName,
    };
  }

  // Hub node: collapse revisited beat into option list
  if (cursor.children.size > 0) {
    const nextChild = [...cursor.children.values()][0];
    const hubCandidateId = cursor.children.size === 1 ? nextChild.beatId : cursor.beatId;

    if (hubBeats.has(hubCandidateId) && !visitedHubs.has(hubCandidateId)) {
      const hubTrie = hubCandidateId === cursor.beatId ? cursor : nextChild;
      const newVisited = new Set(visitedHubs);
      newVisited.add(hubCandidateId);

      const hubNode = buildHubNode(
        hubTrie, linearBeats, paths, hubBeats, story, newVisited
      );
      hubNode.pathIndices = pathIndices;
      hubNode.pathCount = pathIndices.length;
      return hubNode;
    }
  }

  // Branch node: multiple children at a choice/condition beat
  if (cursor.children.size > 1) {
    const children: PathTreeBranch[] = [];

    for (const [, childTrie] of cursor.children) {
      const label = getMajorityDecisionLabel(childTrie) || childTrie.beatName || childTrie.beatId;
      const effects = getStateEffectsSummary(childTrie, paths);

      children.push({
        label,
        stateEffects: effects.length > 0 ? effects : undefined,
        child: collapseTrieNode(childTrie, paths, hubBeats, story, visitedHubs),
      });
    }

    const branchBeat = linearBeats.length > 0 ? linearBeats[linearBeats.length - 1] : undefined;

    return {
      id: nextId(),
      type: 'branch',
      beats: linearBeats,
      branchBeatId: branchBeat?.beatId,
      branchBeatName: branchBeat?.beatName,
      branchBeatType: branchBeat?.beatType,
      children,
      hubOptions: [],
      pathCount: pathIndices.length,
      representativePathIndex: pathIndices[0] ?? -1,
      pathIndices,
    };
  }

  // Single child that wasn't collapsed (e.g., hub boundary) — recurse
  if (cursor.children.size === 1) {
    const [, child] = [...cursor.children.entries()][0];
    const childNode = collapseTrieNode(child, paths, hubBeats, story, visitedHubs);

    // Merge the linear prefix into the child
    if (childNode.type === 'linear' || childNode.type === 'ending' || childNode.type === 'deadEnd') {
      childNode.beats = [...linearBeats, ...childNode.beats];
      childNode.pathIndices = pathIndices;
      childNode.pathCount = pathIndices.length;
      return childNode;
    }

    // Otherwise prepend as linear segment
    return {
      ...childNode,
      beats: [...linearBeats, ...childNode.beats],
      pathIndices,
      pathCount: pathIndices.length,
    };
  }

  // Leaf with no children (shouldn't happen unless terminal wasn't marked)
  return {
    id: nextId(),
    type: 'linear',
    beats: linearBeats,
    children: [],
    hubOptions: [],
    pathCount: pathIndices.length,
    representativePathIndex: pathIndices[0] ?? -1,
    pathIndices,
  };
}

// ============================================================================
// Hub node construction
// ============================================================================

/**
 * Classify a hub child's subtree: does it loop back, exit, or both?
 */
interface HubChildClassification {
  returnsToHub: boolean;
  hasExit: boolean;
  exitSubtrees: TrieNode[];
}

function classifyHubChild(child: TrieNode, hubBeatId: string): HubChildClassification {
  let returnsToHub = false;
  let hasExit = false;
  const exitSubtrees: TrieNode[] = [];

  const walk = (node: TrieNode, depth: number): void => {
    if (depth > 40) return;
    if (node.isTerminal && node.children.size === 0) {
      hasExit = true;
      return;
    }
    for (const [key, grandchild] of node.children) {
      if (key === hubBeatId) {
        returnsToHub = true;
      } else {
        walk(grandchild, depth + 1);
      }
    }
  };
  walk(child, 0);

  // Collect subtrees that DON'T loop back (exit branches)
  if (hasExit) {
    const collectExits = (node: TrieNode, depth: number): void => {
      if (depth > 40) return;
      for (const [key, grandchild] of node.children) {
        if (key === hubBeatId) continue;
        if (grandchild.isTerminal || !childEventuallyReaches(grandchild, hubBeatId)) {
          exitSubtrees.push(grandchild);
        } else {
          collectExits(grandchild, depth + 1);
        }
      }
    };
    collectExits(child, 0);
  }

  return { returnsToHub, hasExit, exitSubtrees };
}

function childEventuallyReaches(node: TrieNode, targetBeatId: string, depth = 0): boolean {
  if (depth > 40) return false;
  for (const [key, child] of node.children) {
    if (key === targetBeatId) return true;
    if (childEventuallyReaches(child, targetBeatId, depth + 1)) return true;
  }
  return false;
}

function buildHubNode(
  hubTrie: TrieNode,
  prefixBeats: BeatRef[],
  paths: SimulatedPath[],
  hubBeats: Set<string>,
  story: Story,
  visitedHubs: Set<string>,
): PathTreeNode {
  const hubBeatId = hubTrie.beatId;
  const options: HubOption[] = [];
  const exitChildren: PathTreeBranch[] = [];

  for (const [, child] of hubTrie.children) {
    const label = getMajorityDecisionLabel(child) || child.beatName || child.beatId;
    const effects = getStateEffectsSummary(child, paths);
    const classification = classifyHubChild(child, hubBeatId);

    // Show as a hub option (excursion) if it loops back
    if (classification.returnsToHub) {
      const excursionBeats = collectExcursionBeats(child, hubBeatId);
      const subbranches = child.children.size > 1
        ? buildExcursionSubbranches(child, hubBeatId, paths)
        : undefined;

      options.push({
        label,
        targetBeatId: child.beatId,
        beats: excursionBeats,
        stateEffects: effects,
        subbranches,
        returnsToHub: !classification.hasExit,
      });
    }

    // If this child has exit paths (either mixed or pure exit),
    // recurse into the full subtree so condition chains branch properly.
    if (classification.hasExit) {
      exitChildren.push({
        label,
        stateEffects: effects.length > 0 ? effects : undefined,
        child: collapseTrieNode(child, paths, hubBeats, story, visitedHubs),
      });
    }

    // Pure exit (no loop-back) — also list as a non-returning option
    if (!classification.returnsToHub) {
      options.push({
        label,
        targetBeatId: child.beatId,
        beats: [{ beatId: child.beatId, beatName: child.beatName, beatType: child.beatType }],
        stateEffects: effects,
        returnsToHub: false,
      });
    }
  }

  // Build a single hub exit node: if there's one exit branch, use it directly;
  // if multiple, create a branch node wrapping them.
  let hubExitNode: PathTreeNode | undefined;
  if (exitChildren.length === 1) {
    hubExitNode = exitChildren[0].child;
  } else if (exitChildren.length > 1) {
    const exitPathIndices = exitChildren.flatMap(c => c.child.pathIndices);
    hubExitNode = {
      id: nextId(),
      type: 'branch',
      beats: [],
      branchBeatName: 'Hub exit',
      children: exitChildren,
      hubOptions: [],
      pathCount: exitPathIndices.length,
      representativePathIndex: exitPathIndices[0] ?? -1,
      pathIndices: exitPathIndices,
    };
  }

  const allBeats = [
    ...prefixBeats,
    { beatId: hubBeatId, beatName: hubTrie.beatName, beatType: hubTrie.beatType },
  ];

  return {
    id: nextId(),
    type: 'hub',
    beats: allBeats,
    hubBeatId,
    hubOptions: options,
    hubExitNode,
    children: [],
    pathCount: hubTrie.pathIndices.size,
    representativePathIndex: [...hubTrie.pathIndices][0] ?? -1,
    pathIndices: [...hubTrie.pathIndices],
  };
}

/**
 * Build sub-branches for an excursion option (e.g., pickProp choices within
 * a hub option, each leading to different items/effects before looping back).
 */
function buildExcursionSubbranches(
  node: TrieNode,
  hubBeatId: string,
  paths: SimulatedPath[],
): PathTreeBranch[] | undefined {
  // Walk down to the first multi-child node within the excursion
  let cursor = node;
  while (cursor.children.size === 1) {
    const [key, child] = [...cursor.children.entries()][0];
    if (key === hubBeatId) return undefined;
    cursor = child;
  }
  if (cursor.children.size <= 1) return undefined;

  const branches: PathTreeBranch[] = [];
  for (const [key, child] of cursor.children) {
    if (key === hubBeatId) continue;
    const label = getMajorityDecisionLabel(child) || child.beatName || child.beatId;
    const effects = getStateEffectsSummary(child, paths);
    const excursionBeats = collectExcursionBeats(child, hubBeatId);

    branches.push({
      label,
      stateEffects: effects.length > 0 ? effects : undefined,
      child: {
        id: nextId(),
        type: 'linear',
        beats: excursionBeats,
        children: [],
        hubOptions: [],
        pathCount: child.pathIndices.size,
        representativePathIndex: [...child.pathIndices][0] ?? -1,
        pathIndices: [...child.pathIndices],
      },
    });
  }

  return branches.length > 1 ? branches : undefined;
}

// ============================================================================
// Helpers
// ============================================================================

function getMajorityDecisionLabel(trie: TrieNode): string | undefined {
  if (trie.decisionLabels.size === 0) return undefined;
  const counts = new Map<string, number>();
  for (const [, label] of trie.decisionLabels) {
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  let best = '';
  let bestCount = 0;
  for (const [label, count] of counts) {
    if (count > bestCount) { best = label; bestCount = count; }
  }
  return best || undefined;
}

function getStateEffectsSummary(trie: TrieNode, paths: SimulatedPath[]): string[] {
  const effects: string[] = [];
  // Sample one path to see what counter/variable changes happen at this beat
  const sampleIdx = [...trie.pathIndices][0];
  if (sampleIdx === undefined) return effects;

  const path = paths[sampleIdx];
  if (!path) return effects;

  const step = path.steps.find(s => s.beatId === trie.beatId);
  if (!step) return effects;

  // Find the previous step to compare state
  const stepIdx = path.steps.indexOf(step);
  if (stepIdx <= 0) return effects;

  const prevState = path.steps[stepIdx - 1].stateAfter;
  const curState = step.stateAfter;

  // Compare counters
  for (const [name, value] of curState.counters) {
    const prev = prevState.counters.get(name) || 0;
    if (value > prev) effects.push(`+${value - prev} ${name}`);
    if (value < prev) effects.push(`${value - prev} ${name}`);
  }

  // Compare inventory
  for (const [char, items] of curState.inventory) {
    const prevItems = prevState.inventory.get(char) || new Set<string>();
    for (const item of items) {
      if (!prevItems.has(item)) effects.push(`+${item}`);
    }
  }

  return effects;
}


function collectExcursionBeats(node: TrieNode, hubBeatId: string): BeatRef[] {
  const beats: BeatRef[] = [
    { beatId: node.beatId, beatName: node.beatName, beatType: node.beatType },
  ];
  let cursor = node;
  while (cursor.children.size === 1) {
    const [key, child] = [...cursor.children.entries()][0];
    if (key === hubBeatId) break;
    beats.push({ beatId: child.beatId, beatName: child.beatName, beatType: child.beatType });
    cursor = child;
  }
  return beats;
}

