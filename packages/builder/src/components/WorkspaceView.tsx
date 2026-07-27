import React from 'react';
import { Beat, Cluster, ContainerBeatPosition } from '@asaps/core';
import { Canvas } from './Canvas';
import { VisualWorkspace } from './visual/VisualWorkspace';
import { KnowledgeGraphView } from './knowledgeGraph/KnowledgeGraphView';
import { Map, Palette, Share2 } from 'lucide-react';
import type { Character } from '../types/character';
import type { GlobalSettings } from './settings/GlobalSettingsInspector';
import type { ThemeAssetUrls } from '../hooks/useThemes';

interface WorkspaceViewProps {
  projectId?: string;
  beats: Beat[];
  connections: any[];
  clusters: Cluster[];
  containerBeatPositions?: ContainerBeatPosition[];
  selectedBeat: Beat | null;
  /** Increments to force visual editor refresh (e.g., after undo/redo) */
  refreshKey?: number;
  selectedCluster: Cluster | null;
  onBeatSelect: (beat: Beat) => void;
  onBeatMove: (beatId: string, position: { x: number; y: number }) => void;
  onBeatUpdate?: (beatId: string, updates: Partial<Beat>) => void;
  onClusterSelect: (cluster: Cluster | null) => void;
  onBeatAdd: (type: string, position: { x: number; y: number }) => void;
  onClusterExpandCollapse: (clusterId: string) => void;
  onClusterMove: (clusterId: string, x: number, y: number) => void;
  onBeatInContainerMove?: (beatId: string, clusterId: string, x: number, y: number) => void;
  onDropBeatToCluster?: (beatId: string, clusterId: string) => void;
  onRemoveBeatFromCluster?: (beatId: string) => void;
  paletteCollapsed: boolean;
  onTogglePalette: () => void;
  assets?: any[];
  onAssetSelect?: (type: 'background' | 'character' | 'prop' | 'sound', callback: (asset: any) => void) => void;
  onAssetAdd?: (asset: any) => Promise<boolean>;
  onAssetRemove?: (assetId: string) => void;
  onAssetUpdate?: (assetId: string, updates: Partial<any>) => void;
  onOpenCharacterManager?: (callback?: (character: Character) => void) => void;
  projectSettings?: {
    width: number;
    height: number;
    aspectRatio: string;
    scalingMode: string;
    boxVisibility: 'all' | 'hideText' | 'hideAll';
  };
  globalSettings?: GlobalSettings;
  highlightedBeatIds?: string[];
  /** Beats visited during the active Preview Window session — passed to the flowchart for the red trace overlay. */
  pwVisitedBeatIds?: string[];
  /** Currently-active beat in the Preview Window — painted more prominently. */
  pwCurrentBeatId?: string | null;
  onAutoLayout?: () => void;
  onAutoLayoutCluster?: (clusterId: string) => void;
  onAddToContainer?: (clusterId: string) => void;
  onRemoveCluster?: (clusterId: string) => void;
  onClusterResize?: (clusterId: string, width: number, height: number) => void;
  onSetClusterMap?: (clusterId: string, assetId: string | null, scale?: number, opacity?: number) => void;
  onSetClusterSound?: (clusterId: string, soundAssetId: string | null, volume?: number) => void;
  onSetClusterSharedVisuals?: (clusterId: string, sharedVisuals: any) => void;
  /** Update the indoor venue's beacons array (forwarded to VisualWorkspace for XRFloorPlanEditor). */
  onUpdateVenueBeacons?: (beacons: Array<{ uuid: string; displayName?: string; x: number; y: number }>) => void;
  characters?: Character[];
  themeAssets?: ThemeAssetUrls | null;
  // Beat context menu actions
  onBeatDuplicate?: (beatId: string) => void;
  onBeatsDuplicate?: (beatIds: string[]) => void;
  onBeatDelete?: (beatId: string) => void;
  onBeatsDelete?: (beatIds: string[]) => void;
  onBeatCopy?: (beatId: string) => void;
  onBeatPaste?: (position: { x: number; y: number }) => void;
  hasBeatClipboard?: boolean;
  // VCS context menu actions
  onViewBeatDiff?: (beatId: string) => void;
  onViewBeatHistory?: (beatId: string) => void;
  onRevertBeat?: (beatId: string) => void;
}

export const WorkspaceView: React.FC<WorkspaceViewProps> = ({
  projectId,
  beats,
  connections,
  clusters,
  containerBeatPositions = [],
  selectedBeat,
  refreshKey = 0,
  selectedCluster,
  onBeatSelect,
  onBeatMove,
  onBeatUpdate,
  onClusterSelect,
  onBeatAdd,
  onClusterExpandCollapse,
  onClusterMove,
  onBeatInContainerMove,
  onDropBeatToCluster,
  onRemoveBeatFromCluster,
  paletteCollapsed,
  onTogglePalette,
  assets = [],
  onAssetSelect,
  onAssetAdd,
  onAssetRemove,
  onAssetUpdate,
  onOpenCharacterManager,
  projectSettings,
  globalSettings,
  highlightedBeatIds = [],
  pwVisitedBeatIds = [],
  pwCurrentBeatId,
  onAutoLayout,
  onAutoLayoutCluster,
  onAddToContainer,
  onRemoveCluster,
  onClusterResize,
  onSetClusterMap,
  onSetClusterSound,
  onSetClusterSharedVisuals,
  characters = [],
  themeAssets,
  // Beat context menu actions
  onBeatDuplicate,
  onBeatsDuplicate,
  onBeatDelete,
  onBeatsDelete,
  onBeatCopy,
  onBeatPaste,
  hasBeatClipboard = false,
  onViewBeatDiff,
  onViewBeatHistory,
  onRevertBeat,
  onUpdateVenueBeacons,
}) => {
  const [activeView, setActiveView] = React.useState<'flowchart' | 'visual' | 'knowledgeGraph'>('flowchart');

  const showKnowledgeGraph = globalSettings?.features?.showKnowledgeGraph === true;

  // Check if selected beat supports visual editing
  const supportsVisualEditor = (beat: Beat | null) => {
    if (!beat) return false;
    const visualBeatTypes = [
      'titleScreen',
      'infoText',
      'durScreen',
      'pickProp',
      'movementChoice',
      'multiChoice',
      'dialogTree',
      'endScreen',
      'videoBeat',
      'inputText',
      'hyperText',
      'onlineContent',
      'aiDialogTree',
      'aiSummary',
      'aiInfoText',
      'aiDurScreen',
      'aiConversation',
      'keypad',
      'panorama',
      'gpsLocation',
      'indoorLocation',
      // Camera/embed slot-mode beats — the VE renders editor placeholders
      // for their webview/camera/AR slots; they were missing from this gate
      // (found during the Web View verification round, same gap class as
      // aiConversation before v0.9.82).
      'webView',
      'qrScan',
      'arBeat'
    ];
    return visualBeatTypes.includes(beat.type);
  };

  const showVisualTab = supportsVisualEditor(selectedBeat);

  // Find the cluster containing the selected beat (for shared visuals)
  const selectedBeatCluster = React.useMemo(() => {
    if (!selectedBeat) return null;
    const position = containerBeatPositions.find(p => p.beatId === selectedBeat.id);
    if (!position) return null;
    return clusters.find(c => c.id === position.clusterId) || null;
  }, [selectedBeat, containerBeatPositions, clusters]);

  return (
    <div className="flex-1 flex flex-col bg-gray-50 overflow-hidden" style={{ minHeight: 0 }}>
      {/* Tab Navigation */}
      <div className="flex-shrink-0 flex border-b border-gray-300 bg-white shadow-sm">
        <button
          onClick={() => setActiveView('flowchart')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-all ${
            activeView === 'flowchart'
              ? 'border-blue-500 text-blue-600 bg-blue-50'
              : 'border-transparent text-gray-600 hover:text-gray-800 hover:bg-gray-50'
          }`}
        >
          <Map className="w-4 h-4 inline mr-2" />
          Flowchart
        </button>
        
        {showVisualTab && (
          <button
            onClick={() => setActiveView('visual')}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-all ${
              activeView === 'visual'
                ? 'border-blue-500 text-blue-600 bg-blue-50'
                : 'border-transparent text-gray-600 hover:text-gray-800 hover:bg-gray-50'
            }`}
          >
            <Palette className="w-4 h-4 inline mr-2" />
            Visual Editor
          </button>
        )}
        
        {showKnowledgeGraph && (
          <button
            onClick={() => setActiveView('knowledgeGraph')}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-all ${
              activeView === 'knowledgeGraph'
                ? 'border-blue-500 text-blue-600 bg-blue-50'
                : 'border-transparent text-gray-600 hover:text-gray-800 hover:bg-gray-50'
            }`}
          >
            <Share2 className="w-4 h-4 inline mr-2" />
            Knowledge Graph
          </button>
        )}

        {!showVisualTab && activeView === 'visual' && (
          <div className="px-6 py-3 text-sm text-gray-400 italic">
            Select a visual beat to enable the Visual Editor
          </div>
        )}

        {/* View-specific controls can go here */}
        <div className="flex-1" />

        {activeView === 'flowchart' && (
          <div className="flex items-center px-4 text-xs text-gray-500">
            <span>Beats: {beats.length}</span>
            <span className="mx-2">•</span>
            <span>Clusters: {clusters.length}</span>
            <span className="mx-2">•</span>
            <span>Connections: {connections.length}</span>
          </div>
        )}
      </div>

      {/* Content Area - Fixed to use full available height */}
      <div className="flex-1 overflow-hidden relative" style={{ minHeight: 0 }}>
        {activeView === 'knowledgeGraph' && showKnowledgeGraph ? (
          <div className="h-full w-full">
            <KnowledgeGraphView
              projectId={projectId}
              beats={beats}
              connections={connections}
              characters={characters}
              globalSettings={globalSettings}
            />
          </div>
        ) : activeView === 'visual' ? (
          <div className="h-full w-full">
            <VisualWorkspace
              // Key includes refreshKey to force re-render on undo/redo
              // NOTE: Do NOT include _version here — it changes on every Inspector edit,
              // which remounts the component and resets phase selection (breaks credits phase editing)
              key={`${selectedBeat?.id}-${refreshKey}`}
              beat={selectedBeat}
              beats={beats}
              assets={assets}
              onAssetSelect={onAssetSelect}
              onAssetAdd={onAssetAdd}
              onAssetRemove={onAssetRemove}
              onAssetUpdate={onAssetUpdate}
              onOpenCharacterManager={onOpenCharacterManager}
              onBeatUpdate={onBeatUpdate}
              projectSettings={projectSettings}
              globalSettings={globalSettings}
              characters={characters}
              themeAssets={themeAssets}
              cluster={selectedBeatCluster}
              onSetClusterSharedVisuals={onSetClusterSharedVisuals}
              onUpdateVenueBeacons={onUpdateVenueBeacons}
            />
          </div>
        ) : (
          <div className="h-full w-full">
            <Canvas
              beats={beats}
              connections={connections}
              clusters={clusters}
              containerBeatPositions={containerBeatPositions}
              selectedBeat={selectedBeat}
              selectedCluster={selectedCluster}
              onBeatSelect={onBeatSelect}
              onBeatMove={onBeatMove}
              onClusterSelect={onClusterSelect}
              onBeatAdd={onBeatAdd}
              onClusterExpandCollapse={onClusterExpandCollapse}
              onClusterMove={onClusterMove}
              onBeatInContainerMove={onBeatInContainerMove}
              onDropBeatToCluster={onDropBeatToCluster}
              onRemoveBeatFromCluster={onRemoveBeatFromCluster}
              paletteCollapsed={paletteCollapsed}
              onTogglePalette={onTogglePalette}
              highlightedBeatIds={highlightedBeatIds}
              pwVisitedBeatIds={pwVisitedBeatIds}
              pwCurrentBeatId={pwCurrentBeatId}
              onAutoLayout={onAutoLayout}
              onAutoLayoutCluster={onAutoLayoutCluster}
              onAddToContainer={onAddToContainer}
              onRemoveCluster={onRemoveCluster}
              onClusterResize={onClusterResize}
              assets={assets}
              onSetClusterMap={onSetClusterMap}
              onSetClusterSound={onSetClusterSound}
              onSetClusterSharedVisuals={onSetClusterSharedVisuals}
              onBeatDuplicate={onBeatDuplicate}
              onBeatsDuplicate={onBeatsDuplicate}
              onBeatDelete={onBeatDelete}
              onBeatsDelete={onBeatsDelete}
              onBeatCopy={onBeatCopy}
              onBeatPaste={onBeatPaste}
              hasBeatClipboard={hasBeatClipboard}
              onViewBeatDiff={onViewBeatDiff}
              onViewBeatHistory={onViewBeatHistory}
              onRevertBeat={onRevertBeat}
            />
          </div>
        )}
      </div>
    </div>
  );
};
