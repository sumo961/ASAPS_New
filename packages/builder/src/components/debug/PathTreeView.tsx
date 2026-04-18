import React, { useState, useMemo, useCallback } from 'react';
import { ChevronRight, ChevronDown, GitBranch, RotateCw, MapPin, Flag, AlertTriangle, Layers, Activity, Check } from 'lucide-react';
import type { PathTreeNode, PathTreeBranch, PathTreeResult, HubOption, ConditionAnnotation, StateSummary, ChoiceVariant } from '@asaps/core';

interface PathTreeViewProps {
  treeResult: PathTreeResult;
  onHighlightPath?: (beatIds: string[]) => void;
}

/**
 * User's current selections across the tree.
 * - exclusive: single-choice selections (dialog variants, main tree branches)
 * - hubVisits: hub options the user has marked as "visited" (multi-select per hub)
 * - itemPicks: items picked inside a pickProp beat that lives within a hub loop.
 *   Hub loops allow revisiting the pickProp and picking different items, so these
 *   are multi-select (checkbox). For a pickProp OUTSIDE a hub loop, use exclusive.
 */
export interface Selections {
  exclusive: Map<string, string>;
  hubVisits: Map<string, Set<string>>;        // hubBeatId → visited target beat IDs
  itemPicks: Map<string, Set<string>>;        // pickPropBeatId → picked item labels
  /**
   * Effects recorded for each selection. Keyed by canonical identifier so we
   * can compose state additively — this lets users build scenarios that
   * wouldn't be realizable as a single simulated path (e.g., picking multiple
   * items from the same pickProp inside a hub loop).
   *   "excl:<beatId>" → effects for that exclusive selection
   *   "hub:<hubBeatId>:<targetBeatId>" → effects for a hub visit
   *   "pick:<pickBeatId>:<label>" → effects for an item pick
   */
  effects: Map<string, string[]>;
}

function emptySelections(): Selections {
  return {
    exclusive: new Map(),
    hubVisits: new Map(),
    itemPicks: new Map(),
    effects: new Map(),
  };
}

function totalSelectionCount(s: Selections): number {
  let n = s.exclusive.size;
  for (const set of s.hubVisits.values()) n += set.size;
  for (const set of s.itemPicks.values()) n += set.size;
  return n;
}

/**
 * Parse a list of effect strings ("+1 cluesFound", "-2 dread", "+Insurance Ledger")
 * and build a StateSummary by summing counters and collecting inventory items.
 */
function composeStateFromEffects(effectsList: string[][]): StateSummary | undefined {
  const counters: Record<string, { min: number; max: number; avg: number }> = {};
  const inventory = new Set<string>();

  for (const effects of effectsList) {
    for (const raw of effects) {
      const counterMatch = raw.match(/^([+-])(\d+)\s+(.+)$/);
      if (counterMatch) {
        const sign = counterMatch[1] === '+' ? 1 : -1;
        const delta = parseInt(counterMatch[2], 10) * sign;
        const name = counterMatch[3].trim();
        const current = counters[name]?.avg ?? 0;
        const next = current + delta;
        counters[name] = { min: next, max: next, avg: next };
        continue;
      }
      const invMatch = raw.match(/^\+(.+)$/);
      if (invMatch && !/^\d/.test(invMatch[1])) {
        inventory.add(invMatch[1].trim());
      }
    }
  }

  if (Object.keys(counters).length === 0 && inventory.size === 0) return undefined;
  return { counters, variables: {}, inventory: [...inventory].sort() };
}

function computeSyntheticState(selections: Selections, scopeKeys?: Set<string>): StateSummary | undefined {
  const all: string[][] = [];
  for (const [key, e] of selections.effects) {
    if (scopeKeys && !scopeKeys.has(key)) continue;
    all.push(e);
  }
  return composeStateFromEffects(all);
}

/**
 * Filter path indices to paths matching all selections.
 * - Exclusive: path's step at beatId must have decisionMade === label
 * - Hub visits: path must contain a step at each visited target beat ID
 */
function filterPathsBySelections(
  pathIndices: number[],
  selections: Selections,
  flatPaths: any[],
): number[] {
  if (totalSelectionCount(selections) === 0) return pathIndices;

  return pathIndices.filter(pi => {
    const path = flatPaths[pi];
    if (!path) return false;

    // Exclusive selections: decisionMade must match at that beat
    for (const [beatId, label] of selections.exclusive) {
      const step = path.steps.find((s: any) => s.beatId === beatId);
      if (step && step.decisionMade && step.decisionMade !== label) return false;
    }

    // Hub visits: path must visit every CHECKED hub-option target (inclusive —
    // path may also visit other unchecked options). Keeps paths viable since
    // most stories require visiting at least one exit option too.
    for (const [, visitedTargets] of selections.hubVisits) {
      for (const targetBeatId of visitedTargets) {
        if (!path.steps.some((s: any) => s.beatId === targetBeatId)) return false;
      }
    }

    // Item picks (multi-select inside hubs): path must include a step at the
    // pickProp beat with decisionMade === each picked label. Hub loops allow
    // multiple visits so several items can be picked cumulatively.
    for (const [pickBeatId, labels] of selections.itemPicks) {
      for (const label of labels) {
        const found = path.steps.some((s: any) =>
          s.beatId === pickBeatId && s.decisionMade === label
        );
        if (!found) return false;
      }
    }

    return true;
  });
}

/**
 * Compute a state summary from a filtered set of path indices at a specific beat.
 */
function computeFilteredStateSummary(
  beatId: string,
  pathIndices: number[],
  flatPaths: any[],
): StateSummary | undefined {
  const counterValues = new Map<string, number[]>();
  const inventoryItems = new Set<string>();
  let sampled = 0;
  const sampleSize = Math.min(pathIndices.length, 50);
  const step = Math.max(1, Math.floor(pathIndices.length / sampleSize));

  for (let i = 0; i < pathIndices.length && sampled < sampleSize; i += step) {
    const path = flatPaths[pathIndices[i]];
    if (!path) continue;
    const found = path.steps.find((s: any) => s.beatId === beatId);
    if (!found?.stateAfter) continue;
    sampled++;
    for (const [name, value] of found.stateAfter.counters) {
      if (!counterValues.has(name)) counterValues.set(name, []);
      counterValues.get(name)!.push(value);
    }
    for (const [, items] of found.stateAfter.inventory) {
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
  if (Object.keys(counters).length === 0 && inventoryItems.size === 0) return undefined;
  return { counters, variables: {}, inventory: [...inventoryItems].sort() };
}

export const PathTreeView: React.FC<PathTreeViewProps> = ({ treeResult, onHighlightPath }) => {
  const [selections, setSelections] = useState<Selections>(emptySelections);

  const handleSelectExclusive = useCallback((beatId: string, label: string, effects: string[] = []) => {
    setSelections(prev => {
      const next = {
        ...prev,
        exclusive: new Map(prev.exclusive),
        effects: new Map(prev.effects),
      };
      const key = `excl:${beatId}`;
      if (next.exclusive.get(beatId) === label) {
        next.exclusive.delete(beatId);
        next.effects.delete(key);
      } else {
        next.exclusive.set(beatId, label);
        next.effects.set(key, effects);
      }
      return next;
    });
  }, []);

  const handleToggleHubVisit = useCallback((hubBeatId: string, targetBeatId: string, effects: string[] = []) => {
    setSelections(prev => {
      const next = {
        ...prev,
        hubVisits: new Map(prev.hubVisits),
        effects: new Map(prev.effects),
      };
      const visited = new Set(next.hubVisits.get(hubBeatId) ?? new Set<string>());
      const effectsKey = `hub:${hubBeatId}:${targetBeatId}`;
      if (visited.has(targetBeatId)) {
        visited.delete(targetBeatId);
        next.effects.delete(effectsKey);
      } else {
        visited.add(targetBeatId);
        next.effects.set(effectsKey, effects);
      }
      if (visited.size === 0) {
        next.hubVisits.delete(hubBeatId);
      } else {
        next.hubVisits.set(hubBeatId, visited);
      }
      return next;
    });
  }, []);

  const handleToggleItemPick = useCallback((pickPropBeatId: string, label: string, effects: string[] = []) => {
    setSelections(prev => {
      const next = {
        ...prev,
        itemPicks: new Map(prev.itemPicks),
        effects: new Map(prev.effects),
      };
      const picks = new Set(next.itemPicks.get(pickPropBeatId) ?? new Set<string>());
      const effectsKey = `pick:${pickPropBeatId}:${label}`;
      if (picks.has(label)) {
        picks.delete(label);
        next.effects.delete(effectsKey);
      } else {
        picks.add(label);
        next.effects.set(effectsKey, effects);
      }
      if (picks.size === 0) {
        next.itemPicks.delete(pickPropBeatId);
      } else {
        next.itemPicks.set(pickPropBeatId, picks);
      }
      return next;
    });
  }, []);

  const handleClearSelections = useCallback(() => {
    setSelections(emptySelections());
  }, []);

  const total = totalSelectionCount(selections);

  return (
    <div className="space-y-1 text-sm">
      {/* Stats header */}
      <div className="flex items-center gap-3 px-2 py-1.5 bg-gray-50 rounded text-xs text-gray-600">
        <span>{treeResult.totalRawPaths.toLocaleString()} total paths</span>
        <span className="text-gray-300">|</span>
        <span>{treeResult.totalTreeNodes} tree nodes</span>
        <span className="text-gray-300">|</span>
        <span>{treeResult.uniqueEndings.length} endings</span>
        {total > 0 && (
          <>
            <span className="text-gray-300">|</span>
            <button
              onClick={handleClearSelections}
              className="text-purple-600 hover:text-purple-800 underline"
            >
              Clear {total} selection{total > 1 ? 's' : ''}
            </button>
          </>
        )}
      </div>

      {/* Tree */}
      <TreeNodeView
        node={treeResult.root}
        treeResult={treeResult}
        onHighlightPath={onHighlightPath}
        depth={0}
        defaultExpanded={true}
        selections={selections}
        onSelectExclusive={handleSelectExclusive}
        onToggleHubVisit={handleToggleHubVisit}
        onToggleItemPick={handleToggleItemPick}
        priorKeys={new Set()}
      />
    </div>
  );
};

// ============================================================================
// TreeNodeView — recursive renderer for each PathTreeNode
// ============================================================================

interface TreeNodeViewProps {
  node: PathTreeNode;
  treeResult: PathTreeResult;
  onHighlightPath?: (beatIds: string[]) => void;
  depth: number;
  defaultExpanded?: boolean;
  selections: Selections;
  onSelectExclusive: (beatId: string, label: string, effects?: string[]) => void;
  onToggleHubVisit: (hubBeatId: string, targetBeatId: string, effects?: string[]) => void;
  onToggleItemPick: (pickPropBeatId: string, label: string, effects?: string[]) => void;
  /** Keys of selections committed at or before this render position. */
  priorKeys: Set<string>;
}

const TreeNodeView: React.FC<TreeNodeViewProps> = ({
  node, treeResult, onHighlightPath, depth, defaultExpanded = false,
  selections, onSelectExclusive, onToggleHubVisit, onToggleItemPick, priorKeys,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded || depth < 1);

  // Augment priorKeys with variant selections made within THIS node's beats.
  // Choice variants are inline (not separate tree nodes), so their selections
  // must be folded into the scope before rendering downstream elements
  // (hub options, children, exit path) within the same node.
  const localPriorKeys = useMemo(() => {
    let augmented: Set<string> | null = null;
    for (const beat of node.beats) {
      if (!beat.choiceVariants) continue;
      if (selections.exclusive.has(beat.beatId)) {
        if (!augmented) augmented = new Set(priorKeys);
        augmented.add(`excl:${beat.beatId}`);
      }
    }
    return augmented ?? priorKeys;
  }, [node.beats, selections.exclusive, priorKeys]);

  const hasExpandableContent =
    node.children.length > 0 ||
    node.hubExitNode != null ||
    node.hubOptions.some(o => o.subbranches && o.subbranches.length > 0 || !o.returnsToHub);

  const handleClick = useCallback(() => {
    if (hasExpandableContent) {
      setExpanded(e => !e);
    }
    if (onHighlightPath) {
      onHighlightPath(node.beats.map(b => b.beatId));
    }
  }, [hasExpandableContent, onHighlightPath, node.beats]);

  const beatSummary = node.beats.length > 0
    ? node.beats.length <= 3
      ? node.beats.map(b => b.beatName || b.beatId).join(' → ')
      : `${node.beats[0].beatName} → ... → ${node.beats[node.beats.length - 1].beatName} (${node.beats.length} beats)`
    : '';

  return (
    <div className={depth > 0 ? 'ml-4 border-l border-gray-200 pl-2' : ''}>
      {/* Node header */}
      <div
        className="flex items-center gap-1.5 py-1 px-1.5 rounded cursor-pointer hover:bg-gray-50 group"
        onClick={handleClick}
      >
        {/* Expand/collapse chevron */}
        {hasExpandableContent ? (
          expanded
            ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            : <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
        ) : (
          <span className="w-3.5 flex-shrink-0" />
        )}

        {/* Type icon */}
        <NodeTypeIcon type={node.type} />

        {/* Beat summary */}
        <span className="text-gray-800 truncate" title={node.beats.map(b => b.beatName).join(' → ')}>
          {beatSummary || node.type}
        </span>

        {/* Path count badge */}
        <span className="ml-auto text-xs text-gray-400 flex-shrink-0">
          {node.pathCount.toLocaleString()}
        </span>

        {/* Ending badge */}
        {node.type === 'ending' && node.endingBeatName && (
          <span className="px-1.5 py-0.5 text-xs rounded bg-green-100 text-green-700 flex-shrink-0">
            Ending
          </span>
        )}
        {node.type === 'deadEnd' && (
          <span className="px-1.5 py-0.5 text-xs rounded bg-red-100 text-red-600 flex-shrink-0">
            Dead End
          </span>
        )}
      </div>

      {/* Inline choice variants (same-target multi-choice beats within the linear segment) */}
      {expanded && node.beats.some(b => b.choiceVariants && b.choiceVariants.length > 0) && (
        <div className="ml-8 space-y-0.5">
          {node.beats.filter(b => b.choiceVariants).map((b, i) => (
            <ChoiceVariantsView
              key={i}
              beatId={b.beatId}
              beatName={b.beatName}
              variants={b.choiceVariants!}
              selectedLabel={selections.exclusive.get(b.beatId)}
              onSelect={(label, effects) => onSelectExclusive(b.beatId, label, effects)}
              pathIndices={node.pathIndices}
              treeResult={treeResult}
              allSelections={selections}
              priorKeys={priorKeys}
            />
          ))}
        </div>
      )}

      {/* Condition annotation (shown below header for condition branch nodes) */}
      {expanded && node.conditionAnnotation && (
        <ConditionBadge annotation={node.conditionAnnotation} />
      )}

      {/* Expanded content */}
      {expanded && (
        <div>
          {/* Hub node: show options + exit */}
          {node.type === 'hub' && (
            <HubNodeDetail
              node={node}
              treeResult={treeResult}
              onHighlightPath={onHighlightPath}
              depth={depth}
              selections={selections}
              onSelectExclusive={onSelectExclusive}
              onToggleHubVisit={onToggleHubVisit}
              onToggleItemPick={onToggleItemPick}
              priorKeys={localPriorKeys}
            />
          )}

          {/* Branch node: show children */}
          {node.children.length > 0 && (() => {
            // Parent beat for selection = branch beat of this node (if non-condition)
            const parentBeatId = node.type === 'branch' && node.branchBeatType !== 'conditionBeat'
              ? node.branchBeatId
              : undefined;
            const selectedLabel = parentBeatId ? selections.exclusive.get(parentBeatId) : undefined;
            // Committing a branch selection adds its effect to the scope of downstream children
            const childPriorKeys = parentBeatId && selectedLabel
              ? new Set([...localPriorKeys, `excl:${parentBeatId}`])
              : localPriorKeys;
            return (
              <div className="space-y-0.5">
                {node.children.map((branch, i) => (
                  <BranchView
                    key={i}
                    branch={branch}
                    parentBeatId={parentBeatId}
                    isDimmed={selectedLabel !== undefined && selectedLabel !== branch.label}
                    treeResult={treeResult}
                    onHighlightPath={onHighlightPath}
                    depth={depth + 1}
                    selections={selections}
                    onSelectExclusive={onSelectExclusive}
                    onToggleHubVisit={onToggleHubVisit}
              onToggleItemPick={onToggleItemPick}
              priorKeys={childPriorKeys}
                  />
                ))}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// BranchView — a labeled branch leading to a child node
// ============================================================================

interface BranchViewProps {
  branch: PathTreeBranch;
  /** The beat the choice was made at. If set, this branch is a radio-style exclusive selection. */
  parentBeatId?: string;
  /** The pickProp beat this branch belongs to in a multi-visit (hub) context.
   *  When set, the branch renders as a checkbox and toggles item-pick state. */
  multiPickBeatId?: string;
  /** True if another sibling is selected — dim this one (radio mode). */
  isDimmed?: boolean;
  treeResult: PathTreeResult;
  onHighlightPath?: (beatIds: string[]) => void;
  depth: number;
  selections: Selections;
  onSelectExclusive: (beatId: string, label: string, effects?: string[]) => void;
  onToggleHubVisit: (hubBeatId: string, targetBeatId: string, effects?: string[]) => void;
  onToggleItemPick: (pickPropBeatId: string, label: string, effects?: string[]) => void;
  /** Keys of selections committed at or before this render position. */
  priorKeys: Set<string>;
}

const BranchView: React.FC<BranchViewProps> = ({
  branch, parentBeatId, multiPickBeatId, isDimmed, treeResult, onHighlightPath, depth,
  selections, onSelectExclusive, onToggleHubVisit, onToggleItemPick, priorKeys,
}) => {
  const label = branch.label.length > 60
    ? branch.label.substring(0, 57) + '...'
    : branch.label;

  const isConditionBranch = branch.conditionResult !== undefined;
  const isMultiPick = !!multiPickBeatId && !isConditionBranch;
  const selectable = (!!parentBeatId || isMultiPick) && !isConditionBranch;

  // Radio-mode (exclusive) selection
  const isRadioSelected = !!parentBeatId && selections.exclusive.get(parentBeatId) === branch.label;
  // Checkbox-mode (item picks inside a hub) selection
  const isChecked = isMultiPick
    && (selections.itemPicks.get(multiPickBeatId!)?.has(branch.label) ?? false);

  const isSelected = isRadioSelected || isChecked;

  const handleSelectClick = (e: React.MouseEvent) => {
    if (!selectable) return;
    e.stopPropagation();
    const effects = branch.stateEffects ?? [];
    if (isMultiPick) {
      onToggleItemPick(multiPickBeatId!, branch.label, effects);
    } else if (parentBeatId) {
      onSelectExclusive(parentBeatId, branch.label, effects);
    }
  };

  return (
    <div>
      {/* Branch label */}
      <div
        className={`flex items-center gap-1 ml-4 pl-2 border-l border-gray-200 rounded px-1 py-0.5 transition-all ${
          selectable ? 'cursor-pointer' : ''
        } ${
          isChecked
            ? 'bg-blue-50 ring-1 ring-blue-200'
            : isRadioSelected
            ? 'bg-purple-100 ring-1 ring-purple-300'
            : isDimmed
            ? 'opacity-40 hover:opacity-70'
            : selectable
            ? (isMultiPick ? 'hover:bg-blue-50' : 'hover:bg-purple-50')
            : ''
        }`}
        onClick={handleSelectClick}
        title={selectable ? (isSelected ? 'Click to deselect' : `Click to select: ${branch.label}`) : undefined}
      >
        {isConditionBranch ? (
          <span className={`px-1 py-0.5 text-[10px] font-bold rounded flex-shrink-0 ${
            branch.conditionResult
              ? 'bg-green-100 text-green-700'
              : 'bg-orange-100 text-orange-700'
          }`}>
            {branch.conditionResult ? 'TRUE' : 'FALSE'}
          </span>
        ) : isMultiPick ? (
          /* Checkbox indicator for multi-pick (items inside a hub) */
          <span
            className={`w-3.5 h-3.5 flex-shrink-0 border rounded-sm flex items-center justify-center transition-colors ${
              isChecked
                ? 'bg-blue-500 border-blue-500 text-white'
                : 'border-gray-300 bg-white hover:border-blue-400'
            }`}
          >
            {isChecked && <Check className="w-2.5 h-2.5" strokeWidth={3} />}
          </span>
        ) : selectable ? (
          /* Radio indicator for exclusive selection */
          <span
            className={`w-3.5 h-3.5 flex-shrink-0 rounded-full border flex items-center justify-center transition-colors ${
              isRadioSelected
                ? 'border-purple-500 bg-purple-500'
                : 'border-gray-300 bg-white'
            }`}
          >
            {isRadioSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
          </span>
        ) : (
          <GitBranch className="w-3 h-3 flex-shrink-0 text-purple-400" />
        )}
        <span className={`text-xs truncate ${
          isChecked ? 'text-blue-900 font-medium'
          : isRadioSelected ? 'text-purple-800 font-medium'
          : 'text-purple-700'
        }`} title={branch.label}>
          {label}
        </span>
        {branch.stateEffects && branch.stateEffects.length > 0 && (
          <span className="text-xs text-amber-600 flex-shrink-0">
            [{branch.stateEffects.join(', ')}]
          </span>
        )}
        {branch.branchPathCount != null && (
          <span className="text-[10px] text-gray-400 flex-shrink-0">
            ({branch.branchPathCount.toLocaleString()})
          </span>
        )}
      </div>

      {/* Child node */}
      <TreeNodeView
        node={branch.child}
        treeResult={treeResult}
        onHighlightPath={onHighlightPath}
        depth={depth}
        selections={selections}
        onSelectExclusive={onSelectExclusive}
        onToggleHubVisit={onToggleHubVisit}
        onToggleItemPick={onToggleItemPick}
        priorKeys={priorKeys}
      />
    </div>
  );
};

// ============================================================================
// HubNodeDetail — expanded content for a hub node
// ============================================================================

interface HubNodeDetailProps {
  node: PathTreeNode;
  treeResult: PathTreeResult;
  onHighlightPath?: (beatIds: string[]) => void;
  depth: number;
  selections: Selections;
  onSelectExclusive: (beatId: string, label: string, effects?: string[]) => void;
  onToggleHubVisit: (hubBeatId: string, targetBeatId: string, effects?: string[]) => void;
  onToggleItemPick: (pickPropBeatId: string, label: string, effects?: string[]) => void;
  /** Keys of selections committed at or before this render position. */
  priorKeys: Set<string>;
}

const HubNodeDetail: React.FC<HubNodeDetailProps> = ({ node, treeResult, onHighlightPath, depth, selections, onSelectExclusive, onToggleHubVisit, onToggleItemPick, priorKeys }) => {
  const [expandedOption, setExpandedOption] = useState<number | null>(null);
  const [showExit, setShowExit] = useState(true);

  const loopOptions = node.hubOptions.filter(o => o.returnsToHub);
  const exitOptions = node.hubOptions.filter(o => !o.returnsToHub);
  const hubBeatId = node.hubBeatId ?? '';
  const hubEntry = selections.hubVisits.get(hubBeatId);
  const visitedTargets = hubEntry?.visited ?? new Set<string>();

  // Accumulated state at the hub: ancestors + hub visits + inner picks.
  // Additive composition, not path-based, so scenarios with multiple item
  // picks (not realizable as a single simulated path) still compute.
  const hubState = useMemo(() => {
    const scope = new Set(priorKeys);
    for (const target of visitedTargets) scope.add(`hub:${hubBeatId}:${target}`);
    for (const [pickBeatId, labels] of selections.itemPicks) {
      for (const label of labels) scope.add(`pick:${pickBeatId}:${label}`);
    }
    if (scope.size === 0) return undefined;
    return computeSyntheticState(selections, scope);
  }, [selections, priorKeys, visitedTargets, hubBeatId]);

  return (
    <div className="ml-6 pl-2 border-l border-blue-200 space-y-1">
      {/* Hub options (excursions) */}
      {loopOptions.length > 0 && (
        <div>
          <div className="text-xs text-blue-600 font-medium flex items-center gap-1 py-0.5">
            <RotateCw className="w-3 h-3" />
            Options (check any to visit — effects accumulate)
          </div>
          {loopOptions.map((option, i) => (
            <HubOptionView
              key={i}
              option={option}
              hubBeatId={hubBeatId}
              isVisited={visitedTargets.has(option.targetBeatId)}
              isExpanded={expandedOption === i}
              onToggle={() => setExpandedOption(expandedOption === i ? null : i)}
              treeResult={treeResult}
              onHighlightPath={onHighlightPath}
              depth={depth}
              selections={selections}
              onSelectExclusive={onSelectExclusive}
              onToggleHubVisit={onToggleHubVisit}
              onToggleItemPick={onToggleItemPick}
              priorKeys={priorKeys}
              onToggleItemPick={onToggleItemPick}
            />
          ))}

          {/* Cumulative state from checked options */}
          {hubState && (
            <div className="ml-6 mt-1">
              <div className="text-[10px] text-blue-600 mb-0.5">
                Accumulated state ({visitedTargets.size} option{visitedTargets.size > 1 ? 's' : ''} visited):
              </div>
              <StateSummaryView summary={hubState} />
            </div>
          )}
        </div>
      )}

      {/* Exit options */}
      {exitOptions.length > 0 && (
        <div className="text-xs text-gray-500 py-0.5">
          <span className="flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            Exit options: {exitOptions.map(o => o.label).join(', ')}
          </span>
        </div>
      )}

      {/* Hub exit path */}
      {node.hubExitNode && (
        <div>
          <div
            className="text-xs text-green-700 font-medium flex items-center gap-1 py-0.5 cursor-pointer hover:text-green-800"
            onClick={() => setShowExit(e => !e)}
          >
            {showExit ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            After hub
          </div>
          {showExit && (() => {
            // Augment scope: hub visits + inner picks count as "prior" for beats after the hub
            const exitPriorKeys = new Set(priorKeys);
            for (const target of visitedTargets) exitPriorKeys.add(`hub:${hubBeatId}:${target}`);
            for (const [pickBeatId, labels] of selections.itemPicks) {
              for (const label of labels) exitPriorKeys.add(`pick:${pickBeatId}:${label}`);
            }
            return (
              <TreeNodeView
                node={node.hubExitNode}
                treeResult={treeResult}
                onHighlightPath={onHighlightPath}
                depth={depth + 1}
                selections={selections}
                onSelectExclusive={onSelectExclusive}
                onToggleHubVisit={onToggleHubVisit}
                onToggleItemPick={onToggleItemPick}
                priorKeys={exitPriorKeys}
              />
            );
          })()}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// HubOptionView — a single hub excursion option
// ============================================================================

interface HubOptionViewProps {
  option: HubOption;
  hubBeatId: string;
  isVisited: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  treeResult: PathTreeResult;
  onHighlightPath?: (beatIds: string[]) => void;
  depth: number;
  selections: Selections;
  onSelectExclusive: (beatId: string, label: string, effects?: string[]) => void;
  onToggleHubVisit: (hubBeatId: string, targetBeatId: string, effects?: string[]) => void;
  onToggleItemPick: (pickPropBeatId: string, label: string, effects?: string[]) => void;
  /** Keys of selections committed at or before this render position. */
  priorKeys: Set<string>;
}

const HubOptionView: React.FC<HubOptionViewProps> = ({
  option, hubBeatId, isVisited, isExpanded, onToggle, treeResult, onHighlightPath, depth,
  selections, onSelectExclusive, onToggleHubVisit, onToggleItemPick, priorKeys,
}) => {
  const label = option.label.length > 50
    ? option.label.substring(0, 47) + '...'
    : option.label;

  const hasDetail = (option.subbranches && option.subbranches.length > 0) || option.beats.length > 2;

  return (
    <div className="ml-2">
      <div
        className={`flex items-center gap-1.5 py-0.5 px-1 rounded text-xs ${
          isVisited ? 'bg-blue-50 ring-1 ring-blue-200' : ''
        }`}
      >
        {/* Visit checkbox */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleHubVisit(hubBeatId, option.targetBeatId, option.stateEffects); }}
          className={`w-3.5 h-3.5 flex-shrink-0 border rounded-sm flex items-center justify-center transition-colors ${
            isVisited
              ? 'bg-blue-500 border-blue-500 text-white'
              : 'border-gray-300 bg-white hover:border-blue-400'
          }`}
          title={isVisited ? 'Click to remove this visit' : 'Click to mark as visited'}
        >
          {isVisited && <Check className="w-2.5 h-2.5" strokeWidth={3} />}
        </button>

        {/* Expand/collapse (for options with sub-choices) */}
        {hasDetail && (
          <span
            onClick={onToggle}
            className="cursor-pointer"
            title="Expand sub-choices"
          >
            {isExpanded
              ? <ChevronDown className="w-3 h-3 text-blue-400" />
              : <ChevronRight className="w-3 h-3 text-blue-400" />}
          </span>
        )}

        <span
          className={`truncate ${isVisited ? 'text-blue-900 font-medium' : 'text-gray-700'} ${hasDetail ? 'cursor-pointer' : ''}`}
          title={option.label}
          onClick={hasDetail ? onToggle : undefined}
        >
          {label}
        </span>
        {option.stateEffects.length > 0 && (
          <span className="text-amber-600 flex-shrink-0">
            [{option.stateEffects.join(', ')}]
          </span>
        )}
      </div>

      {/* Expanded: show sub-branches (e.g., pickProp choices within this option).
          Because this option is INSIDE a hub loop, the player can revisit and
          pick multiple items, so render as multi-select checkboxes. */}
      {isExpanded && option.subbranches && (() => {
        const pickBeatId = option.targetBeatId;
        return (
          <div className="ml-4 pl-2 border-l border-blue-100 space-y-0.5">
            {option.subbranches.map((branch, i) => (
              <BranchView
                key={i}
                branch={branch}
                multiPickBeatId={pickBeatId}
                treeResult={treeResult}
                onHighlightPath={onHighlightPath}
                depth={depth + 2}
                selections={selections}
                onSelectExclusive={onSelectExclusive}
                onToggleHubVisit={onToggleHubVisit}
                onToggleItemPick={onToggleItemPick}
              />
            ))}
          </div>
        );
      })()}

      {/* Expanded: show beat chain if no sub-branches but long chain */}
      {isExpanded && !option.subbranches && option.beats.length > 2 && (
        <div className="ml-6 text-xs text-gray-500 py-0.5">
          {option.beats.map(b => b.beatName || b.beatId).join(' → ')}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// NodeTypeIcon
// ============================================================================

const NodeTypeIcon: React.FC<{ type: PathTreeNode['type'] }> = ({ type }) => {
  switch (type) {
    case 'hub':
      return <Layers className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />;
    case 'branch':
      return <GitBranch className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />;
    case 'ending':
      return <Flag className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />;
    case 'deadEnd':
      return <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />;
    default:
      return <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />;
  }
};

// ============================================================================
// ChoiceVariantsView — inline display for same-target multi-choice beats
// ============================================================================

const ChoiceVariantsView: React.FC<{
  beatId: string;
  beatName: string;
  variants: ChoiceVariant[];
  selectedLabel?: string;
  onSelect: (label: string, effects?: string[]) => void;
  /** Needed to compute post-selection state */
  pathIndices: number[];
  treeResult: PathTreeResult;
  allSelections: Selections;
  priorKeys: Set<string>;
}> = ({ beatId, beatName, variants, selectedLabel, onSelect, pathIndices, treeResult, allSelections, priorKeys }) => {
  // Auto-expand required choices — the player must decide here, so the options
  // should be visible by default rather than folded away.
  const [expanded, setExpanded] = useState(true);
  const hasSelection = selectedLabel !== undefined;

  // State accumulated from ancestors + this variant's selection — not
  // downstream selections, which haven't happened at this point in the tree.
  const postSelectionState = useMemo(() => {
    if (!hasSelection) return undefined;
    const scope = new Set([...priorKeys, `excl:${beatId}`]);
    return computeSyntheticState(allSelections, scope);
  }, [hasSelection, allSelections, priorKeys, beatId]);

  return (
    <div className="py-0.5">
      <div
        className="flex items-center gap-1.5 cursor-pointer hover:bg-purple-50 rounded px-1 py-0.5"
        onClick={() => setExpanded(e => !e)}
      >
        {expanded
          ? <ChevronDown className="w-3 h-3 text-purple-400" />
          : <ChevronRight className="w-3 h-3 text-purple-400" />}
        <GitBranch className="w-3 h-3 text-purple-400" />
        <span className="text-xs text-purple-700">
          {beatName}
        </span>
        <span className="text-[10px] text-gray-400">
          ({variants.length} options → same target)
        </span>
      </div>
      {expanded && (
        <div className="ml-6 pl-2 border-l border-purple-100 space-y-0.5">
          {variants.map((v, i) => {
            const isSelected = selectedLabel === v.label;
            const isDimmed = hasSelection && !isSelected;
            const label = v.label.length > 55
              ? v.label.substring(0, 52) + '...'
              : v.label;
            return (
              <div
                key={i}
                className={`flex items-center gap-1.5 py-0.5 text-xs cursor-pointer rounded px-1 transition-all ${
                  isSelected
                    ? 'bg-purple-100 ring-1 ring-purple-300'
                    : isDimmed
                    ? 'opacity-40 hover:opacity-70'
                    : 'hover:bg-purple-50'
                }`}
                onClick={() => onSelect(v.label, v.stateEffects)}
                title={isSelected ? 'Click to deselect' : `Click to select: ${v.label}`}
              >
                {/* Radio indicator */}
                <span
                  className={`w-3.5 h-3.5 flex-shrink-0 rounded-full border flex items-center justify-center transition-colors ${
                    isSelected
                      ? 'border-purple-500 bg-purple-500'
                      : 'border-gray-300 bg-white'
                  }`}
                >
                  {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                </span>
                <span className={`truncate ${isSelected ? 'text-purple-800 font-medium' : 'text-gray-600'}`} title={v.label}>
                  {label}
                </span>
                {v.stateEffects.length > 0 ? (
                  <span className="text-amber-600 flex-shrink-0">
                    [{v.stateEffects.join(', ')}]
                  </span>
                ) : (
                  <span className="text-gray-400 flex-shrink-0 italic">
                    no effect
                  </span>
                )}
                <span className="text-[10px] text-gray-400 flex-shrink-0">
                  ({v.pathCount.toLocaleString()})
                </span>
              </div>
            );
          })}
        </div>
      )}
      {/* Show accumulated state AFTER the selected variant */}
      {postSelectionState && (
        <div className="ml-6 mt-0.5">
          <StateSummaryView summary={postSelectionState} />
        </div>
      )}
    </div>
  );
};

// ============================================================================
// ConditionBadge — shows the condition being tested
// ============================================================================

const ConditionBadge: React.FC<{ annotation: ConditionAnnotation }> = ({ annotation }) => {
  return (
    <div className="ml-8 flex items-center gap-1.5 py-0.5">
      <Activity className="w-3 h-3 text-cyan-500 flex-shrink-0" />
      <span className="text-xs px-1.5 py-0.5 bg-cyan-50 text-cyan-800 rounded font-mono">
        {annotation.conditionText}
      </span>
    </div>
  );
};

// ============================================================================
// StateSummaryView — compact display of accumulated state at a node
// ============================================================================

const StateSummaryView: React.FC<{ summary: StateSummary }> = ({ summary }) => {
  const counterEntries = Object.entries(summary.counters);
  const hasInventory = summary.inventory.length > 0;

  if (counterEntries.length === 0 && !hasInventory) return null;

  return (
    <div className="ml-8 flex flex-wrap items-center gap-1.5 py-0.5">
      {counterEntries.map(([name, { min, max }]) => (
        <span
          key={name}
          className="text-[10px] px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded"
          title={`${name}: min=${min} max=${max} avg=${Object.entries(summary.counters).find(([n])=>n===name)?.[1].avg}`}
        >
          {name}: {min === max ? min : `${min}–${max}`}
        </span>
      ))}
      {hasInventory && summary.inventory.map(item => (
        <span
          key={item}
          className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded"
        >
          {item}
        </span>
      ))}
    </div>
  );
};

export default PathTreeView;
