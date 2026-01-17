import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface BeatPaletteProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onAddCluster?: () => void;
}

interface BeatType {
  type: string;
  name: string;
  icon: string;
  category: 'visible' | 'invisible' | 'ai';
  color: string;
}

const beatTypes: BeatType[] = [
  // Visible beats
  { type: 'titleScreen', name: 'Title Screen', icon: '🎬', category: 'visible', color: '#3b82f6' },
  { type: 'introText', name: 'Intro Text', icon: '📝', category: 'visible', color: '#10b981' },
  { type: 'dialogTree', name: 'Dialog Tree', icon: '🌳', category: 'visible', color: '#8b5cf6' },
  { type: 'movementChoice', name: 'Movement', icon: '🚶', category: 'visible', color: '#f59e0b' },
  { type: 'pickProp', name: 'Pick Prop', icon: '🎒', category: 'visible', color: '#ef4444' },
  { type: 'durScreen', name: 'Duration Screen', icon: '⏳', category: 'visible', color: '#14b8a6' },
  { type: 'videoBeat', name: 'Video', icon: '🎥', category: 'visible', color: '#ec4899' },
  { type: 'inputText', name: 'Input Text', icon: '✏️', category: 'visible', color: '#06b6d4' },
  { type: 'hyperText', name: 'Hyper Text', icon: '🔗', category: 'visible', color: '#0ea5e9' },
  { type: 'endScreen', name: 'End Screen', icon: '🏁', category: 'visible', color: '#6366f1' },

  // Invisible beats
  { type: 'setVariable', name: 'Set Var/Counter', icon: '🔧', category: 'invisible', color: '#64748b' },
  { type: 'conditionBeat', name: 'Condition', icon: '❓', category: 'invisible', color: '#06b6d4' },
  { type: 'randomTarget', name: 'Random Target', icon: '🎲', category: 'invisible', color: '#a855f7' },
  { type: 'setTimer', name: 'Set Timer', icon: '⏱️', category: 'invisible', color: '#f97316' },
  { type: 'addRemoveInventory', name: 'Inventory', icon: '📦', category: 'invisible', color: '#84cc16' },

  // AI-powered beats
  { type: 'onlineContent', name: 'Online Content', icon: '🌐', category: 'ai', color: '#0891b2' },
  { type: 'aiDialogTree', name: 'AI Dialog', icon: '🤖', category: 'ai', color: '#7c3aed' },
  { type: 'aiCondition', name: 'AI Condition', icon: '🧠', category: 'ai', color: '#c026d3' },
  { type: 'aiSummary', name: 'AI Summary', icon: '📊', category: 'ai', color: '#059669' },
];

export const BeatPalette: React.FC<BeatPaletteProps> = ({ collapsed = false, onToggleCollapse, onAddCluster }) => {
  const onDragStart = (event: React.DragEvent, beatType: string) => {
    event.dataTransfer.setData('beatType', beatType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const visibleBeats = beatTypes.filter(b => b.category === 'visible');
  const invisibleBeats = beatTypes.filter(b => b.category === 'invisible');
  const aiBeats = beatTypes.filter(b => b.category === 'ai');

  // Collapsed view - just icons
  if (collapsed) {
    return (
      <div className="p-2 bg-white h-full flex flex-col">
        <button
          onClick={onToggleCollapse}
          className="w-full p-1 mb-2 hover:bg-gray-100 rounded transition-colors"
          title="Expand palette"
        >
          <ChevronLeft className="w-5 h-5 mx-auto" />
        </button>
        
        <div className="flex-1 overflow-y-auto">
          {beatTypes.map((beat) => (
            <div
              key={beat.type}
              className="w-full p-1 mb-1 cursor-move hover:bg-gray-100 rounded transition-colors"
              draggable
              onDragStart={(e) => onDragStart(e, beat.type)}
              title={beat.name}
            >
              <span className="text-lg block text-center">{beat.icon}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Expanded view
  return (
    <div className="p-4 bg-white rounded-lg shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Beat Types</h3>
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
            title="Collapse palette"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
      </div>
      
      <div className="space-y-4">
        {/* Visible Beats */}
        <div>
          <h4 className="text-sm font-medium text-gray-600 mb-2">Visible Beats</h4>
          <div className="grid grid-cols-2 gap-2">
            {visibleBeats.map((beat) => (
              <div
                key={beat.type}
                className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg cursor-move hover:bg-gray-100 transition-colors border-2 border-transparent hover:border-gray-300"
                draggable
                onDragStart={(e) => onDragStart(e, beat.type)}
                style={{ borderLeftColor: beat.color, borderLeftWidth: '4px' }}
              >
                <span className="text-xl">{beat.icon}</span>
                <span className="text-sm font-medium">{beat.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Invisible Beats */}
        <div>
          <h4 className="text-sm font-medium text-gray-600 mb-2">Logic Beats</h4>
          <div className="grid grid-cols-2 gap-2">
            {invisibleBeats.map((beat) => (
              <div
                key={beat.type}
                className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg cursor-move hover:bg-gray-100 transition-colors border-2 border-transparent hover:border-gray-300"
                draggable
                onDragStart={(e) => onDragStart(e, beat.type)}
                style={{ borderLeftColor: beat.color, borderLeftWidth: '4px' }}
              >
                <span className="text-xl">{beat.icon}</span>
                <span className="text-sm font-medium">{beat.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* AI-Powered Beats */}
        <div>
          <h4 className="text-sm font-medium text-gray-600 mb-2">AI Beats</h4>
          <div className="grid grid-cols-2 gap-2">
            {aiBeats.map((beat) => (
              <div
                key={beat.type}
                className="flex items-center gap-2 p-2 bg-purple-50 rounded-lg cursor-move hover:bg-purple-100 transition-colors border-2 border-transparent hover:border-purple-300"
                draggable
                onDragStart={(e) => onDragStart(e, beat.type)}
                style={{ borderLeftColor: beat.color, borderLeftWidth: '4px' }}
              >
                <span className="text-xl">{beat.icon}</span>
                <span className="text-sm font-medium">{beat.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 p-3 bg-blue-50 rounded-lg">
        <p className="text-xs text-blue-700">
          <strong>Tip:</strong> Drag beats onto the canvas to add them to your story
        </p>
      </div>
    </div>
  );
};
