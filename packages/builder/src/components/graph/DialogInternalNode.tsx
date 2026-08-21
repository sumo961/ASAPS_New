/**
 * DialogInternalNode — one dialog exchange or player choice, rendered as a
 * small beat-like node INSIDE an expanded dialogTree container (B1b v2).
 *
 * Read-only in this phase: not draggable, not connectable, not selectable —
 * ReactFlow gets those flags on the node object; this component just draws
 * a locked mini-card. Clicking bubbles to the container's beat selection.
 */
import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { DLG_NODE_W, DLG_NODE_H } from '../../utils/dialogTreeLayout';

export interface DialogInternalNodeData {
  kind: 'npc' | 'choice';
  speaker?: string;
  text: string;
  /** Root exchange — the loop target for '↩' choices. */
  isRoot?: boolean;
  /** "has key · trust ≥ 2" — rendered as a ◇ chip on the card (the edge
   *  keeps the dashed-violet stroke; a midpoint pill would collide with
   *  neighboring cards in the tight column layout). */
  guardSummary?: string;
}

export const DialogInternalNode = memo<NodeProps<DialogInternalNodeData>>(({ data }) => {
  const isNpc = data.kind === 'npc';
  return (
    <div
      className={`rounded-md border text-xs leading-snug px-2 py-1 shadow-sm overflow-hidden ${
        isNpc
          ? 'bg-emerald-50 border-emerald-300'
          : data.guardSummary
            ? 'bg-white border-violet-300'
            : 'bg-white border-gray-300'
      }`}
      style={{ width: DLG_NODE_W, height: DLG_NODE_H }}
      title={isNpc ? `${data.speaker ? data.speaker + ': ' : ''}${data.text}` : data.text}
    >
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={false}
        style={{ background: isNpc ? '#10b981' : '#94a3b8', width: 7, height: 7, border: '1px solid white' }}
      />
      {isNpc ? (
        <>
          <div className="font-semibold text-emerald-800 truncate">{data.speaker || 'NPC'}</div>
          <div className="text-gray-700 truncate">{data.text}</div>
        </>
      ) : (
        <div className="flex flex-col h-full justify-center">
          <div className="flex items-start gap-1">
            <span className="text-gray-400">▪</span>
            <span className={`text-gray-800 ${data.guardSummary ? 'truncate' : 'line-clamp-2'}`}>{data.text}</span>
          </div>
          {data.guardSummary && (
            <div
              className="text-[10px] text-violet-700 truncate pl-3.5"
              title={`Shown only if: ${data.guardSummary}`}
            >
              ◇ {data.guardSummary}
            </div>
          )}
        </div>
      )}
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={false}
        style={{ background: isNpc ? '#10b981' : '#94a3b8', width: 7, height: 7, border: '1px solid white' }}
      />
    </div>
  );
});

DialogInternalNode.displayName = 'DialogInternalNode';
