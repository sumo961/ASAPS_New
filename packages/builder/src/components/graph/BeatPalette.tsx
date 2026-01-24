import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import beatDefinitions from '../../../../../beat-definitions/core-beats.json';

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

// Color mapping for beat types (can be overridden per-type)
const BEAT_COLORS: Record<string, string> = {
  // Visible beats
  titleScreen: '#3b82f6',
  infoText: '#10b981',
  dialogTree: '#8b5cf6',
  movementChoice: '#f59e0b',
  pickProp: '#ef4444',
  durScreen: '#14b8a6',
  videoBeat: '#ec4899',
  inputText: '#06b6d4',
  hyperText: '#0ea5e9',
  endScreen: '#6366f1',
  // Invisible beats
  setVariable: '#64748b',
  conditionBeat: '#06b6d4',
  randomTarget: '#a855f7',
  setTimer: '#f97316',
  addRemoveInventory: '#84cc16',
  // AI beats
  onlineContent: '#0891b2',
  aiDialogTree: '#7c3aed',
  aiCondition: '#c026d3',
  aiSummary: '#059669',
  aiInfoText: '#8b5cf6',
  aiDurScreen: '#a78bfa',
};

// Default colors by category
const DEFAULT_COLORS: Record<string, string> = {
  visible: '#10b981',
  invisible: '#64748b',
  ai: '#7c3aed',
};

// Beat types to exclude from the palette (legacy, internal, etc.)
const EXCLUDED_BEATS = new Set([
  'conversationChoice', // Legacy - use dialogTree
  'SWFBeat',            // Legacy Flash
]);

/**
 * Determine the palette category for a beat type
 */
function getBeatCategory(beatType: string, schemaCat: string): 'visible' | 'invisible' | 'ai' {
  // AI beats: starts with 'ai' or 'online'
  if (beatType.startsWith('ai') || beatType.startsWith('online')) {
    return 'ai';
  }
  // Use schema category
  return schemaCat === 'invisible' ? 'invisible' : 'visible';
}

/**
 * Build beat list from schema
 */
function buildBeatTypesFromSchema(): BeatType[] {
  const beatTypes: BeatType[] = [];
  const schemaBeats = beatDefinitions.beatTypes as Record<string, {
    category: string;
    displayName: string;
    icon: string;
  }>;

  for (const [type, def] of Object.entries(schemaBeats)) {
    // Skip excluded beats
    if (EXCLUDED_BEATS.has(type)) continue;

    const category = getBeatCategory(type, def.category);
    const color = BEAT_COLORS[type] || DEFAULT_COLORS[category];

    beatTypes.push({
      type,
      name: def.displayName,
      icon: def.icon,
      category,
      color,
    });
  }

  // Sort: visible first, then invisible, then AI
  const categoryOrder = { visible: 0, invisible: 1, ai: 2 };
  beatTypes.sort((a, b) => categoryOrder[a.category] - categoryOrder[b.category]);

  return beatTypes;
}

export const BeatPalette: React.FC<BeatPaletteProps> = ({ collapsed = false, onToggleCollapse, onAddCluster }) => {
  // Build beat types from schema (memoized)
  const beatTypes = useMemo(() => buildBeatTypesFromSchema(), []);

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
        {aiBeats.length > 0 && (
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
        )}
      </div>

      <div className="mt-4 p-3 bg-blue-50 rounded-lg">
        <p className="text-xs text-blue-700">
          <strong>Tip:</strong> Drag beats onto the canvas to add them to your story
        </p>
      </div>
    </div>
  );
};
