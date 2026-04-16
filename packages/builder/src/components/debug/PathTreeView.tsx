import React, { useState, useMemo, useCallback } from 'react';
import { ChevronRight, ChevronDown, GitBranch, RotateCw, MapPin, Flag, AlertTriangle, Layers } from 'lucide-react';
import type { PathTreeNode, PathTreeBranch, PathTreeResult, HubOption } from '@asaps/core';

interface PathTreeViewProps {
  treeResult: PathTreeResult;
  onHighlightPath?: (beatIds: string[]) => void;
}

export const PathTreeView: React.FC<PathTreeViewProps> = ({ treeResult, onHighlightPath }) => {
  return (
    <div className="space-y-1 text-sm">
      {/* Stats header */}
      <div className="flex items-center gap-3 px-2 py-1.5 bg-gray-50 rounded text-xs text-gray-600">
        <span>{treeResult.totalRawPaths.toLocaleString()} total paths</span>
        <span className="text-gray-300">|</span>
        <span>{treeResult.totalTreeNodes} tree nodes</span>
        <span className="text-gray-300">|</span>
        <span>{treeResult.uniqueEndings.length} endings</span>
      </div>

      {/* Tree */}
      <TreeNodeView
        node={treeResult.root}
        treeResult={treeResult}
        onHighlightPath={onHighlightPath}
        depth={0}
        defaultExpanded={true}
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
}

const TreeNodeView: React.FC<TreeNodeViewProps> = ({
  node, treeResult, onHighlightPath, depth, defaultExpanded = false,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded || depth < 1);

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
            />
          )}

          {/* Branch node: show children */}
          {node.children.length > 0 && (
            <div className="space-y-0.5">
              {node.children.map((branch, i) => (
                <BranchView
                  key={i}
                  branch={branch}
                  treeResult={treeResult}
                  onHighlightPath={onHighlightPath}
                  depth={depth + 1}
                />
              ))}
            </div>
          )}
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
  treeResult: PathTreeResult;
  onHighlightPath?: (beatIds: string[]) => void;
  depth: number;
}

const BranchView: React.FC<BranchViewProps> = ({ branch, treeResult, onHighlightPath, depth }) => {
  const label = branch.label.length > 60
    ? branch.label.substring(0, 57) + '...'
    : branch.label;

  return (
    <div>
      {/* Branch label */}
      <div className="flex items-center gap-1 ml-4 pl-2 border-l border-gray-200">
        <GitBranch className="w-3 h-3 text-purple-400 flex-shrink-0" />
        <span className="text-xs text-purple-700 truncate" title={branch.label}>
          {label}
        </span>
        {branch.stateEffects && branch.stateEffects.length > 0 && (
          <span className="text-xs text-amber-600 flex-shrink-0">
            [{branch.stateEffects.join(', ')}]
          </span>
        )}
      </div>

      {/* Child node */}
      <TreeNodeView
        node={branch.child}
        treeResult={treeResult}
        onHighlightPath={onHighlightPath}
        depth={depth}
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
}

const HubNodeDetail: React.FC<HubNodeDetailProps> = ({ node, treeResult, onHighlightPath, depth }) => {
  const [expandedOption, setExpandedOption] = useState<number | null>(null);
  const [showExit, setShowExit] = useState(true);

  const loopOptions = node.hubOptions.filter(o => o.returnsToHub);
  const exitOptions = node.hubOptions.filter(o => !o.returnsToHub);

  return (
    <div className="ml-6 pl-2 border-l border-blue-200 space-y-1">
      {/* Hub options (excursions) */}
      {loopOptions.length > 0 && (
        <div>
          <div className="text-xs text-blue-600 font-medium flex items-center gap-1 py-0.5">
            <RotateCw className="w-3 h-3" />
            Options (visit in any order)
          </div>
          {loopOptions.map((option, i) => (
            <HubOptionView
              key={i}
              option={option}
              isExpanded={expandedOption === i}
              onToggle={() => setExpandedOption(expandedOption === i ? null : i)}
              treeResult={treeResult}
              onHighlightPath={onHighlightPath}
              depth={depth}
            />
          ))}
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
          {showExit && (
            <TreeNodeView
              node={node.hubExitNode}
              treeResult={treeResult}
              onHighlightPath={onHighlightPath}
              depth={depth + 1}
            />
          )}
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
  isExpanded: boolean;
  onToggle: () => void;
  treeResult: PathTreeResult;
  onHighlightPath?: (beatIds: string[]) => void;
  depth: number;
}

const HubOptionView: React.FC<HubOptionViewProps> = ({
  option, isExpanded, onToggle, treeResult, onHighlightPath, depth,
}) => {
  const label = option.label.length > 50
    ? option.label.substring(0, 47) + '...'
    : option.label;

  const hasDetail = (option.subbranches && option.subbranches.length > 0) || option.beats.length > 2;

  return (
    <div className="ml-2">
      <div
        className={`flex items-center gap-1.5 py-0.5 px-1 rounded text-xs ${hasDetail ? 'cursor-pointer hover:bg-blue-50' : ''}`}
        onClick={hasDetail ? onToggle : undefined}
      >
        {hasDetail ? (
          isExpanded
            ? <ChevronDown className="w-3 h-3 text-blue-400" />
            : <ChevronRight className="w-3 h-3 text-blue-400" />
        ) : (
          <span className="w-3" />
        )}
        <span className="text-gray-700 truncate" title={option.label}>{label}</span>
        {option.stateEffects.length > 0 && (
          <span className="text-amber-600 flex-shrink-0">
            [{option.stateEffects.join(', ')}]
          </span>
        )}
        {option.returnsToHub && (
          <RotateCw className="w-2.5 h-2.5 text-blue-300 flex-shrink-0" title="Returns to hub" />
        )}
      </div>

      {/* Expanded: show sub-branches (e.g., pickProp choices) */}
      {isExpanded && option.subbranches && (
        <div className="ml-4 pl-2 border-l border-blue-100 space-y-0.5">
          {option.subbranches.map((branch, i) => (
            <BranchView
              key={i}
              branch={branch}
              treeResult={treeResult}
              onHighlightPath={onHighlightPath}
              depth={depth + 2}
            />
          ))}
        </div>
      )}

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

export default PathTreeView;
