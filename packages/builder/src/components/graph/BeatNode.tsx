import React, { memo, useEffect } from 'react';
import { Handle, Position, NodeProps, useUpdateNodeInternals } from 'reactflow';
import { Beat } from '@asaps/core';
import { FileChangeIndicator } from '../vcs/FileChangeIndicator';
import { TranslationStaleIndicator } from '../translation/TranslationStaleIndicator';
import { dialogTreePhaseCount } from '../../utils/dialogTreePhases';
import { dialogTreeOutline } from '../../utils/dialogTreeOutline';
import { summarizeConditions } from '../../utils/conditionSummary';

interface BeatNodeData {
  beat: Beat;
  label: string;
  type: string;
  selected: boolean;
  color: string;
  highlighted?: boolean;
  /** True when the beat was visited in the current Preview Window session. */
  pwVisited?: boolean;
  /** True for the beat currently executing in the Preview Window — painted
   *  more prominently than past-visited beats. */
  pwCurrent?: boolean;
  /** A choice on this beat points at a beat that does not exist, so the story
   *  stops here when played. Set from the import validator; see
   *  ImportIssuesBanner for why this is surfaced rather than logged. */
  brokenTarget?: string;
  /** B1b — dialogTree disclosure expansion. The tree parameter, whether the
   *  node is expanded, the toggle, and beat names for exit chips. */
  dialogTree?: any;
  dialogExpanded?: boolean;
  onToggleDialogExpand?: (beatId: string) => void;
  beatNames?: Record<string, string>;
}

// Beat type icons
const beatTypeIcons: Record<string, string> = {
  // Visible beats
  titleScreen: '🎬',
  infoText: '📝',
  dialogTree: '🌳',
  conversationChoice: '💬',
  movementChoice: '🚶',
  pickProp: '🎒',
  videoBeat: '🎥',
  durScreen: '⏳',
  inputText: '✏️',
  hyperText: '🔗',
  endScreen: '🏁',
  panorama: '🌐',
  // Logic beats
  setVariable: '🔧',
  conditionBeat: '❓',
  condition: '❓',
  randomTarget: '🎲',
  setTimer: '⏱️',
  addRemoveInventory: '📦',
  // AI beats
  onlineContent: '🌐',
  aiDialogTree: '🤖',
  aiCondition: '🧠',
  aiSummary: '📊',
};

// Fixed node dimensions for consistent layout
const NODE_WIDTH = 160;
const MAX_TITLE_LENGTH = 18;

// Truncate title and return truncated version
const truncateTitle = (title: string, maxLength: number = MAX_TITLE_LENGTH): string => {
  if (!title) return 'Unnamed Beat';
  if (title.length <= maxLength) return title;
  return title.substring(0, maxLength - 1) + '…';
};

export const BeatNode = memo<NodeProps<BeatNodeData>>(({ id, data, selected }) => {
  // B1b — disclosure expansion: the internal tree renders INSIDE the node,
  // read-only, with a source handle per exit row so outgoing edges leave
  // from the exact choice that produces them. Hooks live above the
  // missing-data early returns (hooks must run unconditionally).
  const dialogTreeParam = data?.dialogTree
    ?? (data?.type === 'dialogTree'
      ? ((data.beat as any)?.dialogTree ?? (data.beat as any)?.getParameters?.()?.dialogTree)
      : undefined);
  const canExpandDialog = data?.type === 'dialogTree' && !!dialogTreeParam && !!data?.onToggleDialogExpand;
  const dialogExpanded = !!data?.dialogExpanded && canExpandDialog;
  const outline = dialogExpanded ? dialogTreeOutline(dialogTreeParam) : null;
  const updateNodeInternals = useUpdateNodeInternals();
  useEffect(() => {
    // New/removed exit handles must be re-measured or edges detach.
    updateNodeInternals(id);
  }, [dialogExpanded, outline?.rows.length, id, updateNodeInternals]);

  // Safety checks - handle missing or invalid data
  if (!data) {
    return (
      <div className="px-8 py-6 bg-red-100 border-4 border-red-500 rounded-lg min-w-[200px] min-h-[80px]">
        <Handle type="target" position={Position.Left} className="w-4 h-4" / >
        <div className="text-red-800 font-bold text-sm">ERROR: No Data</div>
        <Handle type="source" position={Position.Right} className="w-4 h-4" / >
      </div>
    );
  }

  if (!data.type) {
    return (
      <div className="px-8 py-6 bg-orange-100 border-4 border-orange-500 rounded-lg min-w-[200px] min-h-[80px]">
        <Handle type="target" position={Position.Left} className="w-4 h-4" / >
        <div className="text-orange-800 font-bold">ERROR: Missing type</div>
        <Handle type="source" position={Position.Right} className="w-4 h-4" / >
      </div>
    );
  }

  const icon = beatTypeIcons[data.type] || '📄';
  
  // Determine if this node is truly selected (either ReactFlow selected or data.selected)
  const isSelected = selected || data.selected;

  const fullLabel = data.label || 'Unnamed Beat';
  const displayLabel = truncateTitle(fullLabel);

  // Multi-phase dialogTrees: a dialog the player spends five exchanges inside
  // used to look identical to a one-liner on the graph. Phases > 1 gets a
  // stacked-card edge (box-shadow — costs no layout size) and a dot strip in
  // the badge row. aiDialogTree generates its tree at runtime, so it has no
  // authored phases to count.
  const dialogPhases = data.type === 'dialogTree'
    ? dialogTreePhaseCount(
        (data.beat as any)?.dialogTree ?? (data.beat as any)?.getParameters?.()?.dialogTree,
      )
    : 0;
  const isStacked = dialogPhases > 1;

  // Debug highlight (yellow) wins over PW trace (red), which wins over selected (cyan).
  // Within the PW trace, the CURRENT beat gets a deeper red and thicker ring than past-visited beats.
  const borderColor = data.highlighted
    ? '#eab308'
    : data.pwCurrent
      ? '#b91c1c'  // red-700 (deeper) for active beat
      : data.pwVisited
        ? '#dc2626'  // red-600 for past-visited beats
        : isSelected
          ? '#06b6d4'
          : '#d1d5db';
  const bgColor = data.highlighted
    ? '#fef9c3'
    : data.pwCurrent
      ? '#fecaca'  // red-200 (brighter) — stands out in the trace
      : data.pwVisited
        ? '#fee2e2'  // red-50/100 for past beats
        : isSelected
          ? '#ecfeff'
          : 'white';

  return (
    <div
      className={`
        px-3 py-2.5 rounded-lg shadow-lg relative
        transition-all duration-200 cursor-pointer
        ${data.pwCurrent ? 'border-4 ring-4 ring-red-500 ring-opacity-70 animate-pulse-slow' : 'border-2'}
        ${isSelected && !data.highlighted && !data.pwVisited && !data.pwCurrent ? 'bg-cyan-50 ring-4 ring-cyan-400 border-cyan-500' : ''}
        ${data.highlighted ? 'ring-4 ring-yellow-400 ring-opacity-70 border-yellow-500 bg-yellow-50' : ''}
        ${!data.highlighted && !data.pwCurrent && data.pwVisited ? 'ring-4 ring-red-400 ring-opacity-60 border-red-500 bg-red-50' : ''}
        ${!isSelected && !data.highlighted && !data.pwVisited && !data.pwCurrent ? 'bg-white border-gray-300' : ''}
        hover:shadow-xl hover:scale-105
      `}
      style={{
        borderColor,
        width: dialogExpanded ? '380px' : `${NODE_WIDTH}px`,
        backgroundColor: bgColor,
        // Stacked-card edge for multi-phase dialogs: two card outlines peek
        // out behind the bottom-right corner. Box-shadow renders outside the
        // border box, so the node's footprint and the layout stay fixed.
        ...(isStacked ? {
          boxShadow:
            `3px 3px 0 -1px ${bgColor}, 3px 3px 0 0 ${borderColor}, ` +
            `6px 6px 0 -2px ${bgColor}, 6px 6px 0 -1px ${borderColor}, ` +
            `0 10px 15px -3px rgb(0 0 0 / 0.1)`,
        } : null),
      }}
      title={data.brokenTarget
        ? `${fullLabel}\n\n⚠ A choice here points at "${data.brokenTarget}", which is not a beat in this story — play stops at this beat.`
        : fullLabel}
    >
      {/* Broken-link mark. Sits above the node's own corner rather than inside
          the label, so it survives the title being truncated. */}
      {data.brokenTarget && (
        <div
          className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-amber-400 border-2 border-white
                     flex items-center justify-center text-[10px] leading-none shadow"
          style={{ zIndex: 2 }}
        >
          ⚠
        </div>
      )}
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={false}
        style={{
          background: data.color || '#94a3b8',
          width: 12,
          height: 12,
          border: '2px solid white',
          zIndex: 1,
        }}
      />

      <div className="flex items-center gap-2">
        {canExpandDialog && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              data.onToggleDialogExpand!(data.beat.id);
            }}
            className="text-gray-600 hover:text-gray-900 text-base leading-none px-1 -ml-1"
            title={dialogExpanded
              ? 'Collapse — hide the internal dialog'
              : 'Expand — show the internal dialog structure in the flowchart'}
          >
            {dialogExpanded ? '▾' : '▸'}
          </button>
        )}
        <span className="text-lg" title={data.type}>{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-gray-800 truncate">
            {displayLabel}
          </div>
          <div className="text-xs text-gray-500">
            {data.type || 'unknown'}
          </div>
        </div>
      </div>

      {/* Phase-dot strip: one dot per exchange inside this dialog (capped at
          six, then a count). Details live in the Dialog Tree editor — the
          node only says "there is more inside here than one card". */}
      {isStacked && (
        <div
          className="flex items-center gap-1 mt-1.5"
          style={{ lineHeight: '1' }}
          title={`${dialogPhases} dialog phases — the conversation moves through ${dialogPhases} exchanges inside this beat. Open the Dialog Tree editor for the structure.`}
        >
          {Array.from({ length: Math.min(dialogPhases, 6) }, (_, i) => (
            <span key={i} className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
          ))}
          <span className="text-[10px] text-emerald-700 ml-0.5">
            {dialogPhases > 6 ? `${dialogPhases} phases` : 'phases'}
          </span>
        </div>
      )}

      {/* B1b — the internal dialog, visible in the flowchart. NPC rows show
          speaker+text, choice rows show guards (◇) exactly as the top-level
          edges do, and exit rows carry the source handle their edge leaves
          from. Clicking an NPC row focuses that node in the Dialog editor. */}
      {dialogExpanded && outline && (
        <div className="mt-2 border-t border-gray-200 pt-1.5 space-y-0.5 nodrag" style={{ cursor: 'default' }}>
          {outline.rows.map((row) => (
            <div
              key={row.pathId}
              className={`relative flex items-start gap-1 rounded px-1 py-0.5 text-xs leading-snug ${
                row.kind === 'npc' ? 'bg-emerald-50' : 'bg-white'
              }`}
              style={{ marginLeft: `${Math.min(row.depth, 4) * 10}px` }}
              // Clicks bubble to the node → beat selection → the Dialog
              // editor opens in the Inspector. Per-node deep focus is B1c.
              title={row.kind === 'npc'
                ? `${row.speaker ? row.speaker + ': ' : ''}${row.text}`
                : row.text}
            >
              {row.kind === 'npc' ? (
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-semibold text-emerald-800">{row.speaker || 'NPC'}:</span>{' '}
                  <span className="text-gray-700">{row.text}</span>
                </span>
              ) : (
                <span className="min-w-0 flex-1 truncate">
                  <span className="text-gray-400">▪</span>{' '}
                  <span className="text-gray-800">{row.text}</span>
                  {row.conditions && (
                    <span className="text-violet-700"> ◇ {summarizeConditions(row.conditions)}</span>
                  )}
                </span>
              )}
              {row.exitTarget && row.exitTarget !== '__self__' && (
                <span className="flex-shrink-0 text-sky-700" title={`Exits to "${data.beatNames?.[row.exitTarget] ?? row.exitTarget}"`}>
                  → {(data.beatNames?.[row.exitTarget] ?? row.exitTarget).slice(0, 12)}
                </span>
              )}
              {row.exitTarget === '__self__' && (
                <span className="flex-shrink-0 text-gray-400" title="Loops back to the start of this dialog">↩</span>
              )}
              {row.exitTarget && row.exitTarget !== '__self__' && (
                <Handle
                  type="source"
                  position={Position.Right}
                  id={row.pathId}
                  isConnectable={false}
                  style={{
                    position: 'absolute',
                    right: -14 - Math.min(row.depth, 4) * 10,
                    top: '50%',
                    background: '#0ea5e9',
                    width: 8,
                    height: 8,
                    border: '2px solid white',
                  }}
                />
              )}
            </div>
          ))}
          {outline.truncated && (
            <div className="text-xs text-gray-400 pl-1">… more inside — open the Dialog editor</div>
          )}
        </div>
      )}

      {/* Show indicators for special properties */}
      {data.beat && (
        <div className="flex gap-1 mt-2" style={{ lineHeight: '1' }}>
          {data.beat.transition && (
            <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded"
              title="Has transition">T</span>
          )}
          {data.beat.sound && (
            <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded"
              title="Has sound">S</span>
          )}
          {data.beat.defaultTarget && (
            <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded"
              title="Has default target">D</span>
          )}
          {data.beat.cluster && (
            <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded"
              title="In cluster">C</span>
          )}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        isConnectable={false}
        style={{
          background: data.color || '#94a3b8',
          width: 12,
          height: 12,
          border: '2px solid white',
          zIndex: 1,
        }}
      />

      {/* VCS status overlay */}
      {data.beat?.id && (
        <FileChangeIndicator beatId={data.beat.id} position="top-right" size={10} />
      )}
      {/* Translation staleness overlay */}
      {data.beat?.id && (
        <TranslationStaleIndicator beatId={data.beat.id} position="top-left" size={10} />
      )}
    </div>
  );
});

BeatNode.displayName = 'BeatNode';
