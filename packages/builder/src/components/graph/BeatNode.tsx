import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Beat } from '@asaps/core';

interface BeatNodeData {
  beat: Beat;
  label: string;
  type: string;
  selected: boolean;
  color: string;
}

// Beat type icons
const beatTypeIcons: Record<string, string> = {
  titleScreen: '🎬',
  introText: '📝',
  dialogTree: '🌳',
  conversationChoice: '💬',
  movementChoice: '🚶',
  pickProp: '🎒',
  videoBeat: '🎥',
  endScreen: '🏁',
  setVariable: '🔧',
  conditionBeat: '❓',
  durScreen: '⏳',
  SWFBeat: '📽️',
};

export const BeatNode = memo<NodeProps<BeatNodeData>>(({ data, selected }) => {
  console.log('[BeatNode] Rendering, type:', data?.type, 'label:', data?.label, 'id:', data?.beat?.id);
  console.log('[BeatNode] Full data object:', data);
  console.log('[BeatNode] Selected?', selected);

  // Safety checks - handle missing or invalid data
  if (!data) {
    console.log('[BeatNode] ERROR: No data received');
    return (
      <div className="px-8 py-6 bg-red-100 border-4 border-red-500 rounded-lg min-w-[200px] min-h-[80px]">
        <Handle type="target" position={Position.Left} className="w-4 h-4" / >
        <div className="text-red-800 font-bold text-sm">ERROR: No Data</div>
        <Handle type="source" position={Position.Right} className="w-4 h-4" / >
      </div>
    );
  }

  if (!data.type) {
    console.log('[BeatNode] ERROR: Missing data.type');
    return (
      <div className="px-8 py-6 bg-orange-100 border-4 border-orange-500 rounded-lg min-w-[200px] min-h-[80px]">
        <Handle type="target" position={Position.Left} className="w-4 h-4" / >
        <div className="text-orange-800 font-bold">ERROR: Missing type</div>
        <Handle type="source" position={Position.Right} className="w-4 h-4" / >
      </div>
    );
  }

  if (!data.label) {
    console.log('[BeatNode] WARNING: Missing data.label, using type:', data.type);
  }

  const icon = beatTypeIcons[data.type] || '📄';
  
  return (
    <div
      className={`
        px-4 py-3 rounded-lg border-2 bg-white shadow-lg
        transition-all duration-200 cursor-pointer
        ${selected ? 'ring-4 ring-blue-400 ring-opacity-50' : ''}
        ${data.selected ? 'border-blue-500' : 'border-gray-300'}
        hover:shadow-xl hover:scale-105
      `}
      style={{
        borderColor: data.selected ? (data.color || '#d1d5db') : '#d1d5db',
        minWidth: '150px',
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{
          background: data.color || '#94a3b8',
          width: 12,
          height: 12,
          border: '2px solid white',
          zIndex: 1,
        }}
      />

      <div className="flex items-center gap-2">
        <span className="text-2xl" title={data.type}>{icon}</span>
        <div className="flex-1">
          <div className="font-semibold text-sm text-gray-800">
            {data.label || 'Unnamed Beat'}
          </div>
          <div className="text-xs text-gray-500">
            {data.type || 'unknown'}
          </div>
        </div>
      </div>

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
        style={{
          background: data.color || '#94a3b8',
          width: 12,
          height: 12,
          border: '2px solid white',
          zIndex: 1,
        }}
      />
    </div>
  );
});

BeatNode.displayName = 'BeatNode';
