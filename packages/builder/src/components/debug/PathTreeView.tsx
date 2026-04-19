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
 * - hubSequence: ordered list of committed visits per hub. Each visit records
 *   which option was taken and (for options with sub-items) which item was
 *   picked. Visits are stacked as cards in the UI, matching real gameplay:
 *   player enters hub, picks option, returns to hub, picks again, ...
 */
/**
 * One visit to a hub: which option was taken (targetBeatId) and which item
 * was picked inside it (itemLabel, optional for options without sub-items).
 */
export interface HubVisit {
  optionTargetBeatId: string;
  optionLabel: string;
  itemLabel?: string;
  /** Combined effects for this visit (option-level + item-level) */
  effects: string[];
}

export interface Selections {
  exclusive: Map<string, string>;
  /** Ordered visit sequence per hub. Empty array is allowed (hub opened but
   *  no visits committed). */
  hubSequence: Map<string, HubVisit[]>;
  /** Effects for exclusive selections, keyed by "excl:<beatId>". Hub visit
   *  effects live inline on each HubVisit entry so we don't duplicate. */
  effects: Map<string, string[]>;
}

function emptySelections(): Selections {
  return {
    exclusive: new Map(),
    hubSequence: new Map(),
    effects: new Map(),
  };
}

function totalSelectionCount(s: Selections): number {
  let n = s.exclusive.size;
  for (const seq of s.hubSequence.values()) n += seq.length;
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
  // Exclusive selection effects
  for (const [key, e] of selections.effects) {
    if (scopeKeys && !scopeKeys.has(key)) continue;
    all.push(e);
  }
  // Hub visit effects — each committed visit contributes its inline effects
  for (const [hubBeatId, visits] of selections.hubSequence) {
    for (let i = 0; i < visits.length; i++) {
      const key = `hubvisit:${hubBeatId}:${i}`;
      if (scopeKeys && !scopeKeys.has(key)) continue;
      all.push(visits[i].effects);
    }
  }
  return composeStateFromEffects(all);
}

/**
 * Filter path indices to paths matching all selections.
 * Kept for highlighting and path count display, though state is now
 * composed additively from selection effects rather than from filtered paths.
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

    for (const [beatId, label] of selections.exclusive) {
      const step = path.steps.find((s: any) => s.beatId === beatId);
      if (step && step.decisionMade && step.decisionMade !== label) return false;
    }

    for (const [, visits] of selections.hubSequence) {
      // For filtering, require the path to visit every committed option target
      for (const visit of visits) {
        if (!path.steps.some((s: any) => s.beatId === visit.optionTargetBeatId)) {
          return false;
        }
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

  const handleCommitHubVisit = useCallback((hubBeatId: string, visit: HubVisit) => {
    setSelections(prev => {
      const next = { ...prev, hubSequence: new Map(prev.hubSequence) };
      const seq = [...(next.hubSequence.get(hubBeatId) ?? [])];
      seq.push(visit);
      next.hubSequence.set(hubBeatId, seq);
      return next;
    });
  }, []);

  const handleRemoveHubVisit = useCallback((hubBeatId: string, visitIndex: number) => {
    setSelections(prev => {
      const next = { ...prev, hubSequence: new Map(prev.hubSequence) };
      const seq = [...(next.hubSequence.get(hubBeatId) ?? [])];
      seq.splice(visitIndex, 1);
      if (seq.length === 0) {
        next.hubSequence.delete(hubBeatId);
      } else {
        next.hubSequence.set(hubBeatId, seq);
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
        onCommitHubVisit={handleCommitHubVisit}
        onRemoveHubVisit={handleRemoveHubVisit}
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
  onCommitHubVisit: (hubBeatId: string, visit: HubVisit) => void;
  onRemoveHubVisit: (hubBeatId: string, visitIndex: number) => void;
  /** Keys of selections committed at or before this render position. */
  priorKeys: Set<string>;
}

const TreeNodeView: React.FC<TreeNodeViewProps> = ({
  node, treeResult, onHighlightPath, depth, defaultExpanded = false,
  selections, onSelectExclusive, onCommitHubVisit, onRemoveHubVisit, priorKeys,
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
              onCommitHubVisit={onCommitHubVisit}
              onRemoveHubVisit={onRemoveHubVisit}
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
                    onCommitHubVisit={onCommitHubVisit}
              onRemoveHubVisit={onRemoveHubVisit}
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
  /** True if another sibling is selected — dim this one (radio mode). */
  isDimmed?: boolean;
  treeResult: PathTreeResult;
  onHighlightPath?: (beatIds: string[]) => void;
  depth: number;
  selections: Selections;
  onSelectExclusive: (beatId: string, label: string, effects?: string[]) => void;
  onCommitHubVisit: (hubBeatId: string, visit: HubVisit) => void;
  onRemoveHubVisit: (hubBeatId: string, visitIndex: number) => void;
  /** Keys of selections committed at or before this render position. */
  priorKeys: Set<string>;
}

const BranchView: React.FC<BranchViewProps> = ({
  branch, parentBeatId, isDimmed, treeResult, onHighlightPath, depth,
  selections, onSelectExclusive, onCommitHubVisit, onRemoveHubVisit, priorKeys,
}) => {
  const label = branch.label.length > 60
    ? branch.label.substring(0, 57) + '...'
    : branch.label;

  const isConditionBranch = branch.conditionResult !== undefined;
  const selectable = !!parentBeatId && !isConditionBranch;
  const isRadioSelected = !!parentBeatId && selections.exclusive.get(parentBeatId) === branch.label;
  const isSelected = isRadioSelected;
  const isChecked = false; // no longer used — kept for minimal classname diff below

  const handleSelectClick = (e: React.MouseEvent) => {
    if (!selectable) return;
    e.stopPropagation();
    onSelectExclusive(parentBeatId!, branch.label, branch.stateEffects ?? []);
  };

  return (
    <div>
      {/* Branch label */}
      <div
        className={`flex items-center gap-1 ml-4 pl-2 border-l border-gray-200 rounded px-1 py-0.5 transition-all ${
          selectable ? 'cursor-pointer' : ''
        } ${
          isRadioSelected
            ? 'bg-purple-100 ring-1 ring-purple-300'
            : isDimmed
            ? 'opacity-40 hover:opacity-70'
            : selectable
            ? 'hover:bg-purple-50'
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
        ) : selectable ? (
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
          isRadioSelected ? 'text-purple-800 font-medium' : 'text-purple-700'
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
        onCommitHubVisit={onCommitHubVisit}
        onRemoveHubVisit={onRemoveHubVisit}
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
  onCommitHubVisit: (hubBeatId: string, visit: HubVisit) => void;
  onRemoveHubVisit: (hubBeatId: string, visitIndex: number) => void;
  /** Keys of selections committed at or before this render position. */
  priorKeys: Set<string>;
}

const HubNodeDetail: React.FC<HubNodeDetailProps> = ({
  node, treeResult, onHighlightPath, depth,
  selections, onSelectExclusive, onCommitHubVisit, onRemoveHubVisit, priorKeys,
}) => {
  const hubBeatId = node.hubBeatId ?? '';
  const loopOptions = node.hubOptions.filter(o => o.returnsToHub);
  const exitOptions = node.hubOptions.filter(o => !o.returnsToHub);
  const committedVisits = selections.hubSequence.get(hubBeatId) ?? [];

  return (
    <HubVisitLog
      hubBeatId={hubBeatId}
      hubBeatName={node.beats[node.beats.length - 1]?.beatName || 'Hub'}
      loopOptions={loopOptions}
      exitOptions={exitOptions}
      committedVisits={committedVisits}
      hubExitNode={node.hubExitNode}
      treeResult={treeResult}
      onHighlightPath={onHighlightPath}
      depth={depth}
      selections={selections}
      onSelectExclusive={onSelectExclusive}
      onCommitHubVisit={onCommitHubVisit}
      onRemoveHubVisit={onRemoveHubVisit}
      priorKeys={priorKeys}
    />
  );
};

// ============================================================================
// HubVisitLog — stacked "visit cards" showing each trip to the hub
// ============================================================================

interface HubVisitLogProps {
  hubBeatId: string;
  hubBeatName: string;
  loopOptions: HubOption[];
  exitOptions: HubOption[];
  committedVisits: HubVisit[];
  hubExitNode?: PathTreeNode;
  treeResult: PathTreeResult;
  onHighlightPath?: (beatIds: string[]) => void;
  depth: number;
  selections: Selections;
  onSelectExclusive: (beatId: string, label: string, effects?: string[]) => void;
  onCommitHubVisit: (hubBeatId: string, visit: HubVisit) => void;
  onRemoveHubVisit: (hubBeatId: string, visitIndex: number) => void;
  priorKeys: Set<string>;
}

const MAX_VISITS = 10;

const HubVisitLog: React.FC<HubVisitLogProps> = ({
  hubBeatId, hubBeatName, loopOptions, exitOptions, committedVisits, hubExitNode,
  treeResult, onHighlightPath, depth, selections, onSelectExclusive,
  onCommitHubVisit, onRemoveHubVisit, priorKeys,
}) => {
  const exitVisitIndex = committedVisits.findIndex(v =>
    exitOptions.some(o => o.targetBeatId === v.optionTargetBeatId)
  );
  const hasExited = exitVisitIndex >= 0;
  const visitCount = committedVisits.length;
  const showNextSlot = !hasExited && visitCount < MAX_VISITS;

  return (
    <div className="ml-6 pl-2 border-l border-blue-200 space-y-2">
      {/* Committed visits */}
      {committedVisits.map((visit, idx) => (
        <VisitCard
          key={idx}
          hubBeatName={hubBeatName}
          hubBeatId={hubBeatId}
          visitIndex={idx}
          visit={visit}
          loopOptions={loopOptions}
          exitOptions={exitOptions}
          committedVisits={committedVisits}
          committed
          onRemove={() => onRemoveHubVisit(hubBeatId, idx)}
        />
      ))}

      {/* Next visit slot */}
      {showNextSlot && (
        <VisitCard
          hubBeatName={hubBeatName}
          hubBeatId={hubBeatId}
          visitIndex={visitCount}
          loopOptions={loopOptions}
          exitOptions={exitOptions}
          committedVisits={committedVisits}
          committed={false}
          onCommit={visit => onCommitHubVisit(hubBeatId, visit)}
        />
      )}

      {/* Accumulated state so far */}
      {visitCount > 0 && (() => {
        const scope = new Set(priorKeys);
        for (let i = 0; i < visitCount; i++) scope.add(`hubvisit:${hubBeatId}:${i}`);
        const state = computeSyntheticState(selections, scope);
        return state ? (
          <div className="ml-2 mt-1">
            <div className="text-[10px] text-blue-600 mb-0.5">
              Accumulated state after {visitCount} visit{visitCount > 1 ? 's' : ''}:
            </div>
            <StateSummaryView summary={state} />
          </div>
        ) : null;
      })()}

      {/* After-hub path (only meaningful after an exit visit is committed) */}
      {hubExitNode && hasExited && (
        <div className="pt-1">
          <div className="text-xs text-green-700 font-medium flex items-center gap-1 py-0.5">
            <ChevronDown className="w-3 h-3" />
            After hub
          </div>
          {(() => {
            const exitPriorKeys = new Set(priorKeys);
            for (let i = 0; i < visitCount; i++) exitPriorKeys.add(`hubvisit:${hubBeatId}:${i}`);
            return (
              <TreeNodeView
                node={hubExitNode}
                treeResult={treeResult}
                onHighlightPath={onHighlightPath}
                depth={depth + 1}
                selections={selections}
                onSelectExclusive={onSelectExclusive}
                onCommitHubVisit={onCommitHubVisit}
                onRemoveHubVisit={onRemoveHubVisit}
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
// VisitCard — one visit to the hub (either committed or a fresh slot)
// ============================================================================

interface VisitCardProps {
  hubBeatId: string;
  hubBeatName: string;
  visitIndex: number;
  visit?: HubVisit;                       // set if committed
  loopOptions: HubOption[];
  exitOptions: HubOption[];
  committedVisits: HubVisit[];
  committed: boolean;
  onCommit?: (visit: HubVisit) => void;
  onRemove?: () => void;
}

const VisitCard: React.FC<VisitCardProps> = ({
  hubBeatId, hubBeatName, visitIndex, visit, loopOptions, exitOptions,
  committedVisits, committed, onCommit, onRemove,
}) => {
  // Staging state while composing an uncommitted visit
  const [stagedOption, setStagedOption] = useState<HubOption | null>(null);
  const [stagedItemLabel, setStagedItemLabel] = useState<string | null>(null);

  // Compute redundancy hints — which options/items are already-done per markVisited
  const allOptions = [...loopOptions, ...exitOptions];
  const optionRedundancy = useMemo(() => {
    const m = new Map<string, { visitedBefore: boolean; itemsPickedBefore: Set<string> }>();
    for (const opt of allOptions) {
      const prior = committedVisits.slice(0, committed ? visitIndex : visitIndex)
        .filter(v => v.optionTargetBeatId === opt.targetBeatId);
      const itemsPickedBefore = new Set(prior.map(v => v.itemLabel).filter(Boolean) as string[]);
      m.set(opt.targetBeatId, {
        visitedBefore: prior.length > 0,
        itemsPickedBefore,
      });
    }
    return m;
  }, [allOptions, committedVisits, visitIndex, committed]);

  // Committed card — render as a compact summary
  if (committed && visit) {
    const option = allOptions.find(o => o.targetBeatId === visit.optionTargetBeatId);
    const isExit = exitOptions.some(o => o.targetBeatId === visit.optionTargetBeatId);
    return (
      <div className={`rounded border px-2 py-1.5 text-xs ${
        isExit ? 'border-green-300 bg-green-50' : 'border-blue-300 bg-blue-50'
      }`}>
        <div className="flex items-center gap-1.5 mb-0.5">
          <Layers className={`w-3 h-3 ${isExit ? 'text-green-600' : 'text-blue-600'}`} />
          <span className={`font-medium ${isExit ? 'text-green-800' : 'text-blue-800'}`}>
            {isExit ? 'Exit' : `Visit ${visitIndex + 1}`}: {hubBeatName}
          </span>
          {onRemove && (
            <button
              onClick={onRemove}
              className="ml-auto text-[10px] text-gray-500 hover:text-red-600 underline"
              title="Remove this visit"
            >
              remove
            </button>
          )}
        </div>
        <div className="ml-4 space-y-0.5">
          <div className="flex items-center gap-1.5">
            <span className="text-gray-400">→</span>
            <span className="text-gray-800">{visit.optionLabel}</span>
          </div>
          {visit.itemLabel && (
            <div className="flex items-center gap-1.5 ml-4">
              <span className="text-gray-400">▸</span>
              <span className="text-gray-800">{visit.itemLabel}</span>
            </div>
          )}
          {visit.effects.length > 0 && (
            <div className="ml-4 text-amber-700">
              [{visit.effects.join(', ')}]
            </div>
          )}
          {/* Beat chain for option + item follow-up */}
          {option && (() => {
            const beats: BeatRef[] = [];
            if (option.beats.length > 0) beats.push(...option.beats);
            if (visit.itemLabel) {
              const item = option.items?.find(it => it.label === visit.itemLabel);
              if (item?.followUpBeats) beats.push(...item.followUpBeats.slice(1));
            }
            if (beats.length <= 1) return null;
            return (
              <div className="ml-4 text-[11px] text-gray-500">
                {beats.map(b => b.beatName || b.beatId).join(' → ')}
              </div>
            );
          })()}
        </div>
      </div>
    );
  }

  // Next-visit slot — staging UI
  const canCommit = stagedOption !== null && (
    !stagedOption.items || stagedOption.items.length === 0 || stagedItemLabel !== null
  );

  const commitVisit = () => {
    if (!stagedOption || !canCommit || !onCommit) return;
    const item = stagedOption.items?.find(it => it.label === stagedItemLabel);
    const effects = [
      ...stagedOption.stateEffects,
      ...(item?.stateEffects ?? []),
    ];
    onCommit({
      optionTargetBeatId: stagedOption.targetBeatId,
      optionLabel: stagedOption.label,
      itemLabel: item?.label,
      effects,
    });
    setStagedOption(null);
    setStagedItemLabel(null);
  };

  return (
    <div className="rounded border border-dashed border-blue-300 bg-white px-2 py-1.5 text-xs">
      <div className="flex items-center gap-1.5 mb-1">
        <Layers className="w-3 h-3 text-blue-500" />
        <span className="text-blue-700 font-medium">
          Visit {visitIndex + 1}: {hubBeatName}
        </span>
        <span className="text-[10px] text-gray-400 ml-auto">pick an option</span>
      </div>

      {/* Option picker */}
      <div className="ml-4 space-y-0.5">
        {[...loopOptions, ...exitOptions].map((opt, i) => {
          const isExit = exitOptions.includes(opt);
          const redundancy = optionRedundancy.get(opt.targetBeatId);
          const dimmed = opt.markVisitedOnHub && redundancy?.visitedBefore;
          const allItemsExhausted = opt.markVisitedOnItems && opt.items
            && opt.items.every(it => redundancy?.itemsPickedBefore.has(it.label));
          const optDimmed = dimmed || allItemsExhausted;
          const selected = stagedOption?.targetBeatId === opt.targetBeatId;
          return (
            <div key={i}>
              <div
                className={`flex items-center gap-1.5 py-0.5 px-1 rounded cursor-pointer transition-all ${
                  selected
                    ? (isExit ? 'bg-green-100 ring-1 ring-green-300' : 'bg-blue-100 ring-1 ring-blue-300')
                    : optDimmed ? 'opacity-40 hover:opacity-70' : 'hover:bg-blue-50'
                }`}
                onClick={() => { setStagedOption(opt); setStagedItemLabel(null); }}
              >
                {/* Radio */}
                <span
                  className={`w-3.5 h-3.5 flex-shrink-0 rounded-full border flex items-center justify-center ${
                    selected
                      ? (isExit ? 'border-green-500 bg-green-500' : 'border-blue-500 bg-blue-500')
                      : 'border-gray-300 bg-white'
                  }`}
                >
                  {selected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                </span>
                <span className={selected ? 'text-blue-900 font-medium' : 'text-gray-800'}>
                  {opt.label}
                </span>
                {optDimmed && (
                  <span className="text-[10px] text-gray-500 italic">(already done)</span>
                )}
                {isExit && (
                  <span className="text-[10px] text-green-700 ml-auto">exits hub</span>
                )}
              </div>

              {/* Item sub-picker for the staged option */}
              {selected && opt.items && opt.items.length > 0 && (
                <div className="ml-6 mt-1 space-y-0.5 border-l border-blue-100 pl-2">
                  <div className="text-[10px] text-blue-500">pick one item:</div>
                  {opt.items.map((item, ii) => {
                    const itemPickedBefore = opt.markVisitedOnItems
                      && redundancy?.itemsPickedBefore.has(item.label);
                    const itemSelected = stagedItemLabel === item.label;
                    return (
                      <div
                        key={ii}
                        className={`flex items-center gap-1.5 py-0.5 px-1 rounded cursor-pointer transition-all ${
                          itemSelected
                            ? 'bg-blue-100 ring-1 ring-blue-300'
                            : itemPickedBefore ? 'opacity-40 hover:opacity-70' : 'hover:bg-blue-50'
                        }`}
                        onClick={() => setStagedItemLabel(item.label)}
                      >
                        <span
                          className={`w-3.5 h-3.5 flex-shrink-0 rounded-full border flex items-center justify-center ${
                            itemSelected ? 'border-blue-500 bg-blue-500' : 'border-gray-300 bg-white'
                          }`}
                        >
                          {itemSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </span>
                        <span className={itemSelected ? 'text-blue-900 font-medium' : 'text-gray-700'}>
                          {item.label}
                        </span>
                        {item.stateEffects.length > 0 && (
                          <span className="text-amber-600 text-[10px]">
                            [{item.stateEffects.join(', ')}]
                          </span>
                        )}
                        {itemPickedBefore && (
                          <span className="text-[10px] text-gray-500 italic">(already picked)</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Commit button */}
      {stagedOption && (
        <div className="ml-4 mt-2 flex items-center gap-2">
          <button
            onClick={commitVisit}
            disabled={!canCommit}
            className={`px-2 py-0.5 text-xs rounded ${
              canCommit
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            Commit visit
          </button>
          <button
            onClick={() => { setStagedOption(null); setStagedItemLabel(null); }}
            className="text-[10px] text-gray-500 hover:text-gray-700 underline"
          >
            cancel
          </button>
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
