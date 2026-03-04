import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Beat } from '@asaps/core';
import { FileChangeIndicator } from '../vcs/FileChangeIndicator';
import { TranslationStaleIndicator } from '../translation/TranslationStaleIndicator';

interface BeatNodeData {
  beat: Beat;
  label: string;
  type: string;
  selected: boolean;
  color: string;
  highlighted?: boolean;
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
  SWFBeat: '📽️',
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

export const BeatNode = memo<NodeProps<BeatNodeData>>(({ data, selected }) => {
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

  return (
    <div
      className={`
        px-3 py-2.5 rounded-lg border-2 shadow-lg
        transition-all duration-200 cursor-pointer
        ${isSelected && !data.highlighted ? 'bg-cyan-50 ring-4 ring-cyan-400 border-cyan-500' : ''}
        ${data.highlighted ? 'ring-4 ring-yellow-400 ring-opacity-70 border-yellow-500 bg-yellow-50' : ''}
        ${!isSelected && !data.highlighted ? 'bg-white border-gray-300' : ''}
        hover:shadow-xl hover:scale-105
      `}
      style={{
        borderColor: data.highlighted ? '#eab308' : (isSelected ? '#06b6d4' : '#d1d5db'),
        width: `${NODE_WIDTH}px`,
        backgroundColor: data.highlighted ? '#fef9c3' : (isSelected ? '#ecfeff' : 'white'),
      }}
      title={fullLabel}
    >
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
