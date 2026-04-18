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
  choiceVariants?: ChoiceVariant[];
}

export interface ConditionAnnotation {
  conditionText: string;
  conditionType: string;
  variable?: string;
  operator?: string;
  value?: any;
}

export interface StateSummary {
  counters: Record<string, { min: number; max: number; avg: number }>;
  variables: Record<string, any>;
  inventory: string[];
}

export interface PathTreeBranch {
  label: string;
  stateEffects?: string[];
  conditionResult?: boolean;
  conditionAnnotation?: ConditionAnnotation;
  branchPathCount?: number;
  child: PathTreeNode;
}

export interface ChoiceVariant {
  label: string;
  stateEffects: string[];
  pathCount: number;
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

  conditionAnnotation?: ConditionAnnotation;
  stateSummary?: StateSummary;
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

  // Phase 4: Annotate conditions and state summaries
  annotateTree(root, paths, story);

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
      // Use the PARENT's (cursor's) decision label filtered to paths going
      // through this child — this gives the choice text the player actually
      // sees at the branch beat, not an internal label from a downstream beat.
      const label = getParentDecisionLabelForChild(cursor, childTrie)
        || childTrie.beatName || childTrie.beatId;

      // Compute state effects by comparing pre-branch state with
      // the child's state (captures per-choice counter effects).
      const effects = getBranchStateEffects(cursor, childTrie, paths);

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
    // Use the hub beat's choice text (what the player sees at the hub)
    // by filtering the hub's decision labels to paths going to this child.
    const label = getParentDecisionLabelForChild(hubTrie, child) || child.beatName || child.beatId;
    const effects = getBranchStateEffects(hubTrie, child, paths);
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
    // Use the PARENT's (cursor's) decision label filtered to paths going to
    // this child. For a pickProp, this gives the prop name ("Insurance Ledger")
    // which matches what the simulator records as decisionMade on the pickProp
    // beat's step — so itemPicks filtering can compare labels correctly.
    const label = getParentDecisionLabelForChild(cursor, child)
      || child.beatName || child.beatId;
    // Compute effects by diffing at the PARENT beat (cursor, the pickProp).
    // The simulator overwrites stateAfter on choice beats with post-choice
    // state, so parent-diff captures both counter changes and inventory adds.
    // Filter the sample to a path that actually goes through this child.
    const sampleIdx = [...child.pathIndices][0];
    const effects = sampleIdx !== undefined
      ? computeChoiceEffectsAtParent(cursor.beatId, sampleIdx, paths)
      : [];
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

/**
 * Get the parent node's decision label for a specific child by filtering
 * the parent's decision labels to paths that flow through the child.
 * This gives the choice text the player actually sees at the parent beat.
 */
function getParentDecisionLabelForChild(parentTrie: TrieNode, childTrie: TrieNode): string | undefined {
  const childPathSet = childTrie.pathIndices;
  const counts = new Map<string, number>();

  for (const [pathIdx, label] of parentTrie.decisionLabels) {
    if (childPathSet.has(pathIdx)) {
      counts.set(label, (counts.get(label) || 0) + 1);
    }
  }

  let best = '';
  let bestCount = 0;
  for (const [label, count] of counts) {
    if (count > bestCount) { best = label; bestCount = count; }
  }
  return best || undefined;
}

/**
 * Compute the IMMEDIATE state effect of a branch choice by comparing
 * the state entering the branch beat with the state after the choice
 * (the branch beat's own stateAfter). This avoids over-counting effects
 * from downstream beats.
 */
function getBranchStateEffects(parentTrie: TrieNode, childTrie: TrieNode, paths: SimulatedPath[]): string[] {
  for (const pi of childTrie.pathIndices) {
    const path = paths[pi];
    if (!path) continue;

    const parentStepIdx = path.steps.findIndex(s => s.beatId === parentTrie.beatId);
    if (parentStepIdx < 0) continue;

    // Pre-choice state = state before the parent beat
    const preState = parentStepIdx > 0
      ? path.steps[parentStepIdx - 1].stateAfter
      : null;
    // Post-choice state = the parent beat's stateAfter (includes choice effect only)
    const postState = path.steps[parentStepIdx].stateAfter;

    if (!preState) return [];
    return diffStateEffects(preState, postState);
  }
  return [];
}

/**
 * Compute the immediate effect of a choice at a specific beat within a specific
 * path — compares state before the beat with the beat's own stateAfter (which
 * the simulator overwrites with post-choice state for choice beats).
 */
function computeChoiceEffectsAtParent(parentBeatId: string, pathIdx: number, paths: SimulatedPath[]): string[] {
  const path = paths[pathIdx];
  if (!path) return [];
  const stepIdx = path.steps.findIndex(s => s.beatId === parentBeatId);
  if (stepIdx < 0) return [];
  const preState = stepIdx > 0 ? path.steps[stepIdx - 1].stateAfter : null;
  const postState = path.steps[stepIdx].stateAfter;
  if (!preState) return [];
  return diffStateEffects(preState, postState);
}

/**
 * Compare two states and return human-readable effect strings.
 */
function diffStateEffects(before: SimulationState, after: SimulationState): string[] {
  const effects: string[] = [];

  for (const [name, value] of after.counters) {
    const prev = before.counters.get(name) || 0;
    if (value > prev) effects.push(`+${value - prev} ${name}`);
    if (value < prev) effects.push(`${value - prev} ${name}`);
  }

  for (const [char, items] of after.inventory) {
    const prevItems = before.inventory.get(char) || new Set<string>();
    for (const item of items) {
      if (!prevItems.has(item)) effects.push(`+${item}`);
    }
  }

  return effects;
}

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

// ============================================================================
// Phase 4: Annotate conditions and state summaries
// ============================================================================

function annotateTree(
  node: PathTreeNode,
  paths: SimulatedPath[],
  story: Story,
): void {
  // Annotate this node's state summary from representative paths.
  // For branch/hub nodes, use the beat BEFORE the branch point because
  // the simulator overwrites stateAfter on choice beats with the
  // post-choice state (which differs per branch). The pre-branch state
  // is what the player has accumulated entering the decision.
  if (node.pathIndices.length > 0 && node.beats.length > 0) {
    const isBranchOrHub = node.type === 'branch' || node.type === 'hub';
    const beatIdx = isBranchOrHub && node.beats.length > 1
      ? node.beats.length - 2
      : node.beats.length - 1;
    const stateBeatId = node.beats[beatIdx].beatId;
    node.stateSummary = computeStateSummary(stateBeatId, node.pathIndices, paths);
  }

  // Detect same-target multi-choice beats within linear segments.
  // These are choice beats (dialogTree, movementChoice, pickProp) where
  // all choices lead to the same target but have different state effects.
  // The trie collapses them into a single child, but we annotate them inline.
  for (const beatRef of node.beats) {
    if (!CHOICE_TYPES.has(beatRef.beatType) || beatRef.beatType === 'conditionBeat') continue;
    const beat = story.getBeat(beatRef.beatId);
    if (!beat) continue;

    const conns = beat.getConnections();
    // Only annotate if multiple connections all go to the same target
    if (conns.length <= 1) continue;
    const targets = new Set(conns.map(c => c.targetId));
    if (targets.size !== 1) continue;

    // Build choice variants by sampling paths
    const variants: ChoiceVariant[] = [];
    const labelCounts = new Map<string, { effects: string[]; count: number }>();

    for (const pi of node.pathIndices) {
      const path = paths[pi];
      if (!path) continue;
      const stepIdx = path.steps.findIndex(s => s.beatId === beatRef.beatId);
      if (stepIdx < 0) continue;

      const step = path.steps[stepIdx];
      const choiceLabel = step.decisionMade || 'unknown';

      if (!labelCounts.has(choiceLabel)) {
        const preState = stepIdx > 0 ? path.steps[stepIdx - 1].stateAfter : step.stateAfter;
        const postState = step.stateAfter;
        const effects = diffStateEffects(preState, postState);
        labelCounts.set(choiceLabel, { effects, count: 0 });
      }
      labelCounts.get(choiceLabel)!.count++;
    }

    for (const [label, { effects, count }] of labelCounts) {
      variants.push({ label, stateEffects: effects, pathCount: count });
    }

    if (variants.length > 1) {
      beatRef.choiceVariants = variants;
    }
  }

  // For branch nodes at condition beats, annotate each branch
  if (node.type === 'branch' && node.branchBeatType === 'conditionBeat' && node.branchBeatId) {
    const beat = story.getBeat(node.branchBeatId);
    if (beat) {
      const params = beat.getParameters();
      const condition = params.condition || params;
      const annotation = buildConditionAnnotation(condition, params);

      if (annotation) {
        node.conditionAnnotation = annotation;

        // Label each branch with true/false and path count
        for (const branch of node.children) {
          const childPaths = branch.child.pathIndices;
          branch.branchPathCount = childPaths.length;

          // Determine if this is the true or false branch by checking
          // the condition result on representative paths
          if (childPaths.length > 0) {
            const repIdx = childPaths[0];
            const path = paths[repIdx];
            if (path) {
              const condStep = path.steps.find(s => s.beatId === node.branchBeatId);
              if (condStep && condStep.conditionResult !== undefined) {
                branch.conditionResult = condStep.conditionResult;
              }
            }
          }
        }
      }
    }
  }

  // Recurse into children
  for (const branch of node.children) {
    annotateTree(branch.child, paths, story);
  }
  if (node.hubExitNode) {
    annotateTree(node.hubExitNode, paths, story);
  }
}

function buildConditionAnnotation(condition: any, params: any): ConditionAnnotation | null {
  const type = condition?.type || params?.conditionType;
  if (!type) return null;

  const variable = condition?.variableName || condition?.variable || params?.variableName;
  const operator = condition?.operator || params?.operator;
  const value = condition?.value ?? params?.value;
  const item = condition?.item || params?.item;

  let conditionText: string;
  switch (type) {
    case 'counter':
      conditionText = `${variable} ${operator} ${value}`;
      break;
    case 'variable':
      conditionText = `${variable} ${operator} ${JSON.stringify(value)}`;
      break;
    case 'inventory':
      conditionText = `has ${item || variable}`;
      break;
    case 'visitedBeat':
      conditionText = `visited ${condition?.beatId || variable}`;
      break;
    case 'counterCompare':
      conditionText = `${condition?.counter1} ${operator} ${condition?.counter2}`;
      break;
    case 'fictionalTime':
      conditionText = `time ${operator} ${JSON.stringify(condition?.compareTime)}`;
      break;
    default:
      conditionText = `${type}: ${variable} ${operator} ${value}`;
  }

  return { conditionText, conditionType: type, variable, operator, value };
}

function computeStateSummary(
  beatId: string,
  pathIndices: number[],
  paths: SimulatedPath[],
): StateSummary | undefined {
  const counterValues = new Map<string, number[]>();
  const variableValues = new Map<string, Set<string>>();
  const inventoryItems = new Set<string>();
  let sampled = 0;

  // Sample up to 50 paths for performance
  const sampleSize = Math.min(pathIndices.length, 50);
  const step = Math.max(1, Math.floor(pathIndices.length / sampleSize));

  for (let i = 0; i < pathIndices.length && sampled < sampleSize; i += step) {
    const path = paths[pathIndices[i]];
    if (!path) continue;

    const foundStep = path.steps.find(s => s.beatId === beatId);
    if (!foundStep?.stateAfter) continue;

    sampled++;
    const state = foundStep.stateAfter;

    for (const [name, value] of state.counters) {
      if (!counterValues.has(name)) counterValues.set(name, []);
      counterValues.get(name)!.push(value);
    }

    for (const [name, value] of state.variables) {
      if (!variableValues.has(name)) variableValues.set(name, new Set());
      variableValues.get(name)!.add(String(value));
    }

    for (const [, items] of state.inventory) {
      for (const item of items) inventoryItems.add(item);
    }
  }

  if (sampled === 0) return undefined;

  const counters: Record<string, { min: number; max: number; avg: number }> = {};
  for (const [name, values] of counterValues) {
    counters[name] = {
      min: Math.min(...values),
      max: Math.max(...values),
      avg: Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10,
    };
  }

  const variables: Record<string, any> = {};
  for (const [name, values] of variableValues) {
    variables[name] = values.size === 1 ? [...values][0] : [...values];
  }

  const inventory = [...inventoryItems].sort();

  // Only return if there's meaningful state
  if (Object.keys(counters).length === 0 && Object.keys(variables).length === 0 && inventory.length === 0) {
    return undefined;
  }

  return { counters, variables, inventory };
}

