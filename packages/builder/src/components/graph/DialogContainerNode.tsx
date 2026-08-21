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
      className={`w-full h-full rounded-xl border-2 ${
        data.highlighted
          ? 'border-yellow-500 bg-yellow-50/60 ring-4 ring-yellow-400 ring-opacity-70'
          : isSelected
            ? 'border-cyan-500 bg-cyan-50/40 ring-4 ring-cyan-400'
            : 'border-emerald-300 bg-emerald-50/30'
      }`}
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
          className="text-gray-600 hover:text-gray-900 text-base leading-none px-1"
          title="Collapse — back to the compact beat node"
        >
          ▾
        </button>
        <span className="text-lg" aria-hidden>🌳</span>
        <span className="font-semibold text-sm text-gray-800 truncate">{data.label}</span>
        <span
          className="ml-auto text-[10px] text-gray-500 flex-shrink-0"
          title="The structure is shown read-only — open the Dialog editor in the Inspector to change it."
        >
          read-only{data.truncated ? ' · partial' : ''}
        </span>
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
