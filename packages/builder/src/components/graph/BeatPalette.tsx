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
  schemaCategory: string;
  color: string;
  description: string;
  isAi: boolean;
  mobileOnly: boolean;
  /** Beats flagged as experimental in the schema. Surfaces an EXP
   *  pill next to the AI pill and an explanatory tooltip so authors
   *  know the runtime needs real hardware (camera / printed marker /
   *  external URL) we couldn't verify end-to-end pre-release. */
  experimental: boolean;
}

// Per-type colour overrides for the left-border accent. Categories that
// don't have a per-type entry fall back to the category default below.
const BEAT_COLORS: Record<string, string> = {
  // Visible — single choice
  titleScreen: '#3b82f6',
  infoText: '#10b981',
  aiInfoText: '#10b981',
  aiSummary: '#059669',
  onlineContent: '#0891b2',
  webView: '#0891b2',
  endScreen: '#6366f1',
  inputText: '#06b6d4',
  inputImage: '#06b6d4',
  keypad: '#06b6d4',
  qrScan: '#06b6d4',
  arBeat: '#0ea5e9',
  // Visible — multi choice
  multiChoice: '#a78bfa',
  dialogTree: '#8b5cf6',
  aiDialogTree: '#7c3aed',
  aiConversation: '#7c3aed',
  pickProp: '#ef4444',
  movementChoice: '#f59e0b',
  panorama: '#ec4899',
  gpsLocation: '#f59e0b',
  indoorLocation: '#f59e0b',
  hyperText: '#0ea5e9',
  // Timed
  durScreen: '#14b8a6',
  aiDurScreen: '#0d9488',
  videoBeat: '#ec4899',
  // Logic
  setVariable: '#64748b',
  conditionBeat: '#06b6d4',
  aiCondition: '#c026d3',
  randomTarget: '#a855f7',
  setGpsLocation: '#f59e0b',
  setTimer: '#f97316',
  addRemoveInventory: '#84cc16',
  updateAffect: '#84cc16',
};

const CATEGORY_FALLBACK_COLOR: Record<string, string> = {
  singleChoice: '#10b981',
  multiChoice: '#8b5cf6',
  timed: '#14b8a6',
  logic: '#64748b',
};

// Legacy / internal beats hidden from the palette. They still load
// correctly when present in existing projects — we just don't surface
// them as new-beat options.
const EXCLUDED_BEATS = new Set([
  'conversationChoice', // Legacy — superseded by MultiChoice (v0.9.62)
]);

// Beat types that need device-specific runtime capabilities (camera,
// GPS, indoor positioning, etc.). Surfaced as a small badge in the
// palette so authors know up-front that desktop preview can't fully
// exercise them.
const MOBILE_ONLY = new Set([
  'gpsLocation',
  'indoorLocation',
]);

/**
 * Final author-facing taxonomy (locked v0.9.62). The order of beats
 * within each sub-group is meaningful: the most-likely-default goes
 * first, AI variants sit immediately after their non-AI sibling.
 *
 * Adding a new beat type? Add it to the right bucket here AND to
 * core-beats.json. If neither bucket fits, the fallback below puts it
 * in `logic` so authors can still find it.
 */
const TAXONOMY: Array<{
  key: 'singleChoice' | 'multiChoice' | 'timed' | 'logic';
  label: string;
  hint: string;
  subgroups: Array<{ label: string | null; beats: string[] }>;
}> = [
  {
    key: 'singleChoice',
    label: 'Single Choice',
    hint: 'Beats with one path forward — the player reads/inputs, then continues.',
    subgroups: [
      {
        label: 'Display',
        beats: [
          'titleScreen',
          'infoText',
          'explanation',
          'aiInfoText',
          'aiSummary',
          'onlineContent',
          'webView',
          'endScreen',
        ],
      },
      {
        label: 'Input',
        beats: ['inputText', 'inputImage', 'keypad', 'qrScan', 'arBeat'],
      },
    ],
  },
  {
    key: 'multiChoice',
    label: 'Multi Choice',
    hint: 'Beats where the player picks a path from several options.',
    subgroups: [
      {
        label: 'Buttons',
        beats: ['multiChoice', 'dialogTree', 'aiDialogTree', 'pickProp'],
      },
      {
        label: 'Input',
        beats: ['aiConversation'],
      },
      {
        label: 'Spatial',
        beats: [
          'movementChoice',
          'panorama',
          'gpsLocation',
          'indoorLocation',
        ],
      },
      {
        label: 'In-text',
        beats: ['hyperText'],
      },
    ],
  },
  {
    key: 'timed',
    label: 'Timed',
    hint: 'Beats that auto-advance after a duration — no user input required.',
    subgroups: [
      {
        label: null,
        beats: ['durScreen', 'aiDurScreen', 'videoBeat'],
      },
    ],
  },
  {
    key: 'logic',
    label: 'Logic',
    hint: 'Invisible beats that branch / mutate state behind the scenes.',
    subgroups: [
      {
        label: null,
        beats: [
          'conditionBeat',
          'aiCondition',
          'setVariable',
          'addRemoveInventory',
          'randomTarget',
          'setGpsLocation',
          'setTimer',
          'updateAffect',
        ],
      },
    ],
  },
];

function isAi(beatType: string): boolean {
  return beatType.startsWith('ai') || beatType === 'onlineContent' || beatType === 'inputImage';
}

/**
 * Build the per-type metadata from the schema. Returns a Map keyed by
 * beat type so the taxonomy can look up display data efficiently.
 */
function buildBeatTypeMap(): Map<string, BeatType> {
  const schemaBeats = beatDefinitions.beatTypes as Record<string, {
    category: string;
    displayName: string;
    icon: string;
    description?: string;
    experimental?: boolean;
  }>;
  const out = new Map<string, BeatType>();
  for (const [type, def] of Object.entries(schemaBeats)) {
    if (EXCLUDED_BEATS.has(type)) continue;
    const ai = isAi(type);
    const category = def.category;
    const color = BEAT_COLORS[type]
      || (ai ? '#7c3aed' : CATEGORY_FALLBACK_COLOR.logic);
    out.set(type, {
      type,
      name: def.displayName,
      icon: def.icon,
      schemaCategory: category,
      color,
      description: def.description || `Add a ${def.displayName} beat`,
      isAi: ai,
      mobileOnly: MOBILE_ONLY.has(type),
      experimental: def.experimental === true,
    });
  }
  return out;
}

export const BeatPalette: React.FC<BeatPaletteProps> = ({ collapsed = false, onToggleCollapse }) => {
  const beatMap = useMemo(() => buildBeatTypeMap(), []);

  // Resolve the taxonomy into actual beat-type entries. Beats listed in
  // the taxonomy but missing from the schema are silently skipped (so
  // listing a not-yet-built beat like AR Display doesn't crash).
  const resolvedTaxonomy = useMemo(() => {
    return TAXONOMY.map(group => ({
      ...group,
      subgroups: group.subgroups
        .map(sg => ({
          ...sg,
          beats: sg.beats
            .map(t => beatMap.get(t))
            .filter((b): b is BeatType => !!b),
        }))
        .filter(sg => sg.beats.length > 0),
    })).filter(group => group.subgroups.length > 0);
  }, [beatMap]);

  // Beats from the schema that weren't placed by the taxonomy land in a
  // catch-all "Other" group at the bottom. Keeps the palette complete
  // when someone adds a new beat to core-beats.json before updating the
  // taxonomy table here.
  const orphanBeats = useMemo(() => {
    const placed = new Set<string>();
    TAXONOMY.forEach(g => g.subgroups.forEach(sg => sg.beats.forEach(t => placed.add(t))));
    return Array.from(beatMap.values()).filter(b => !placed.has(b.type));
  }, [beatMap]);

  const onDragStart = (event: React.DragEvent, beatType: string) => {
    event.dataTransfer.setData('beatType', beatType);
    event.dataTransfer.effectAllowed = 'move';
  };

  // Collapsed view — icons only, flat list (no headers).
  if (collapsed) {
    const flatBeats: BeatType[] = [];
    resolvedTaxonomy.forEach(g => g.subgroups.forEach(sg => sg.beats.forEach(b => flatBeats.push(b))));
    orphanBeats.forEach(b => flatBeats.push(b));
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
          {flatBeats.map((beat) => (
            <div
              key={beat.type}
              className="w-full p-1 mb-1 cursor-move hover:bg-gray-100 rounded transition-colors relative"
              draggable
              onDragStart={(e) => onDragStart(e, beat.type)}
              title={`${beat.name}${beat.isAi ? ' (AI)' : ''}${beat.mobileOnly ? ' — needs mobile device' : ''}${beat.experimental ? ' — experimental' : ''}: ${beat.description}`}
            >
              <span className="text-lg block text-center">{beat.icon}</span>
              {beat.mobileOnly && (
                <span className="absolute top-0 right-0 text-[10px]">📱</span>
              )}
              {beat.experimental && (
                <span className="absolute top-0 left-0 text-[8px] font-bold text-amber-700 bg-amber-100 px-0.5 rounded">EXP</span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Expanded view — categorised list.
  return (
    <div className="p-4 bg-white rounded-lg shadow-lg">
      <div className="flex items-center justify-between mb-3">
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
        {resolvedTaxonomy.map(group => (
          <div key={group.key}>
            <h4
              className="text-sm font-semibold text-gray-700 mb-2 pb-1 border-b border-gray-200"
              title={group.hint}
            >
              {group.label}
            </h4>
            <div className="space-y-3">
              {group.subgroups.map((sg, sgIdx) => (
                <div key={sg.label ?? `_${sgIdx}`}>
                  {sg.label && (
                    <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-1.5 px-1">
                      {sg.label}
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-1.5">
                    {sg.beats.map(beat => (
                      <BeatTile key={beat.type} beat={beat} onDragStart={onDragStart} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {orphanBeats.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2 pb-1 border-b border-gray-200" title="Beats that don't fit the groups above — usually newly added ones.">
              Other
            </h4>
            <div className="grid grid-cols-1 gap-1.5">
              {orphanBeats.map(beat => (
                <BeatTile key={beat.type} beat={beat} onDragStart={onDragStart} />
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

interface BeatTileProps {
  beat: BeatType;
  onDragStart: (event: React.DragEvent, beatType: string) => void;
}

const BeatTile: React.FC<BeatTileProps> = ({ beat, onDragStart }) => {
  // Some AI beats bake a leading 🤖 into their schema icon (e.g.
  // "🤖📝" for AI Info Text). The "AI" pill on the right already
  // signals AI-ness, so the robot is redundant — strip it for display
  // and let the canonical category emoji read clearly. Schema stays
  // unchanged; this is a presentation-only normalization.
  const displayIcon = beat.isAi
    ? beat.icon.replace(/^🤖\s*/, '') || beat.icon
    : beat.icon;
  // mobileOnly metadata moves to the tooltip — it's information about
  // what the beat USES (sensors), not what it IS, and competing with
  // the label for horizontal space was the main reason tile names got
  // truncated. The tooltip below carries the full context.
  return (
    <div
      className={`flex items-center gap-2 p-2 rounded-lg cursor-move transition-colors border-2 border-transparent hover:border-gray-300 ${
        beat.isAi ? 'bg-purple-50 hover:bg-purple-100' : 'bg-gray-50 hover:bg-gray-100'
      }`}
      draggable
      onDragStart={(e) => onDragStart(e, beat.type)}
      style={{ borderLeftColor: beat.color, borderLeftWidth: '4px' }}
      title={`${beat.name}${beat.isAi ? ' (AI-powered)' : ''}${beat.mobileOnly ? ' — requires mobile sensors at runtime' : ''}${beat.experimental ? ' — experimental, not yet hardware-verified' : ''}: ${beat.description}`}
    >
      <span className="text-xl shrink-0">{displayIcon}</span>
      <span className="text-sm font-medium flex-1 truncate">{beat.name}</span>
      {beat.experimental && (
        <span
          className="text-[9px] font-semibold uppercase tracking-wide px-1 py-0.5 rounded bg-amber-200 text-amber-900 shrink-0"
          title="Experimental — runtime needs hardware we couldn't verify pre-release. Build with it, but expect rough edges."
        >
          EXP
        </span>
      )}
      {beat.isAi && (
        <span
          className="text-[9px] font-semibold uppercase tracking-wide px-1 py-0.5 rounded bg-purple-200 text-purple-800 shrink-0"
          title="Generates content at playback time via an AI model"
        >
          AI
        </span>
      )}
    </div>
  );
};
