/**
 * DialogContainerNode — an expanded dialogTree beat, rendered cluster-style
 * (B1b v2): a container whose children are the dialog's internal nodes as
 * REAL ReactFlow child nodes. This component draws only the frame and
 * header; the children and their edges are separate graph elements, so the
 * inside of a dialog reads exactly like the rest of the flowchart.
 *
 * Keeps the beat's node id, so inbound edges and the beat's canvas position
 * carry over untouched from the collapsed form.
 */
import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { DLG_HEADER_H } from '../../utils/dialogTreeLayout';

export interface DialogContainerNodeData {
  beatId: string;
  label: string;
  selected?: boolean;
  highlighted?: boolean;
  onToggleDialogExpand?: (beatId: string) => void;
  truncated?: boolean;
}

export const DialogContainerNode = memo<NodeProps<DialogContainerNodeData>>(({ data, selected }) => {
  const isSelected = selected || data.selected;
  return (
    <div
      className={`w-full h-full rounded-xl border-2 shadow-lg ${
        data.highlighted
          ? 'border-yellow-500 bg-yellow-50 ring-4 ring-yellow-400 ring-opacity-70'
          : isSelected
            ? 'border-cyan-500 bg-cyan-50 ring-4 ring-cyan-400'
            : 'border-emerald-400 bg-emerald-50'
      }`}
      title="This dialog's structure — shown in the flowchart, edited in the Dialog editor (click to open it in the Inspector)."
    >
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={false}
        style={{ background: '#8b5cf6', width: 12, height: 12, border: '2px solid white', top: DLG_HEADER_H / 2 }}
      />
      {/* Header — collapse control + identity. Children render below. */}
      <div
        className="flex items-center gap-1.5 px-2 border-b border-emerald-200/70 bg-white/70 rounded-t-xl"
        style={{ height: DLG_HEADER_H }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            data.onToggleDialogExpand?.(data.beatId);
          }}
          className="text-emerald-700 hover:text-emerald-900 text-xl font-bold leading-none px-1.5 py-0.5 rounded hover:bg-emerald-100"
          title="Collapse — back to the compact beat node"
        >
          ▾
        </button>
        <span className="text-lg" aria-hidden>🌳</span>
        <span className="font-semibold text-sm text-gray-800 truncate">{data.label}</span>
        {data.truncated && (
          <span
            className="ml-auto text-[10px] text-gray-500 flex-shrink-0"
            title="Deep levels are folded — open the Dialog editor for the full tree."
          >
            partial view
          </span>
        )}
      </div>
      {/* The beat-level source handle stays for non-choice edges
          (defaultTarget etc.); exits leave from the child nodes. */}
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={false}
        style={{ background: '#8b5cf6', width: 12, height: 12, border: '2px solid white', top: DLG_HEADER_H / 2 }}
      />
    </div>
  );
});

DialogContainerNode.displayName = 'DialogContainerNode';
