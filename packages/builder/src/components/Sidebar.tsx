import React, { useState } from 'react';
import { Beat, Cluster } from '@asaps/core';
import { Plus, Search, ChevronRight, ChevronDown, ChevronLeft, List, Folder, FolderPlus } from 'lucide-react';

interface SidebarProps {
  beats: Beat[];
  clusters: Cluster[];
  selectedBeat: Beat | null;
  selectedCluster: Cluster | null;
  onBeatSelect: (beat: Beat) => void;
  onClusterSelect: (cluster: Cluster | null) => void;
  onAddBeat: (type: string) => void;
  onAddCluster?: () => void;
  onMoveBeatToCluster: (beatId: string, clusterId: string) => void;
  onToggleCluster: (clusterId: string) => void;
  onRenameCluster?: (clusterId: string, name: string) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  beats,
  clusters,
  selectedBeat,
  selectedCluster,
  onBeatSelect,
  onClusterSelect,
  onAddBeat,
  onAddCluster,
  onMoveBeatToCluster,
  onToggleCluster,
  onRenameCluster,
  collapsed = false,
  onToggleCollapse,
}) => {
  const [searchTerm, setSearchTerm] = React.useState('');
  const [expandedClusters, setExpandedClusters] = React.useState<Set<string>>(new Set());

  // Handle drag and drop for moving beats into clusters
  const handleDragStart = (e: React.DragEvent, beat: Beat) => {
    e.dataTransfer.setData('text/beatId', beat.id);
    console.log('Started dragging beat:', beat.name);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDropOnCluster = (e: React.DragEvent, clusterId: string) => {
    e.preventDefault();
    const beatId = e.dataTransfer.getData('text/beatId');
    if (beatId && beatId !== clusterId) {
      console.log('Dropping beat', beatId, 'into cluster', clusterId);
      onMoveBeatToCluster(beatId, clusterId);
    }
  };

  // Handle cluster creation
  const handleCreateCluster = () => {
    if (onAddCluster) {
      onAddCluster();
    }
  };

  // Handle cluster selection
  const handleClusterClick = (cluster: Cluster) => {
    onClusterSelect(cluster);
    setExpandedClusters(prev => {
      const newSet = new Set(prev);
      if (newSet.has(cluster.id)) {
        newSet.delete(cluster.id);
      } else {
        newSet.add(cluster.id);
      }
      return newSet;
    });
    onToggleCluster(cluster.id);
  };

  // Group beats by cluster and unclustered
  const { clusteredBeats, unclusteredBeats } = React.useMemo(() => {
    const clustered = new Map<string, Beat[]>();
    const unclustered: Beat[] = [];

    // Initialize clusters
    clusters.forEach(cluster => {
      clustered.set(cluster.id, []);
    });

    // Group beats into clusters
    beats.forEach(beat => {
      if (beat.cluster && clustered.has(beat.cluster)) {
        clustered.get(beat.cluster)!.push(beat);
      } else {
        unclustered.push(beat);
      }
    });

    return { clusteredBeats: clustered, unclusteredBeats: unclustered };
  }, [beats, clusters]);

  // Filter beats by search term
  const filteredBeats = React.useMemo(() => {
    if (!searchTerm) return beats;
    
    return beats.filter(beat =>
      beat.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      beat.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      beat.id.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [beats, searchTerm]);

  const toggleCluster = (cluster: string) => {
    const newExpanded = new Set(expandedClusters);
    if (newExpanded.has(cluster)) {
      newExpanded.delete(cluster);
    } else {
      newExpanded.add(cluster);
    }
    setExpandedClusters(newExpanded);
  };

  // Editable cluster name component
  const EditableClusterName: React.FC<{ cluster: Cluster }> = ({ cluster }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(cluster.name);

    const handleSave = () => {
      if (editName.trim() && editName !== cluster.name && onRenameCluster) {
        console.log('Saving cluster name:', cluster.id, 'to', editName.trim());
        onRenameCluster(cluster.id, editName.trim());
      }
      setIsEditing(false);
    };

    const handleCancel = () => {
      setEditName(cluster.name);
      setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleSave();
      } else if (e.key === 'Escape') {
        handleCancel();
      }
    };

    const handleDoubleClick = () => {
      console.log('Double-clicking cluster name:', cluster.name);
      setIsEditing(true);
    };

    if (!isEditing) {
      return (
        <span
          className="cursor-pointer hover:underline hover:text-blue-700"
          onDoubleClick={handleDoubleClick}
          title="Double-click to rename"
        >
          {cluster.name}
        </span>
      );
    }

    return (
      <input
        type="text"
        value={editName}
        onChange={(e) => setEditName(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className="bg-transparent border-b border-blue-500 outline-none text-sm font-medium flex-1 min-w-0"
        autoFocus
        onFocus={(e) => e.target.select()}
        placeholder="Cluster name"
      />
    );
  };

  const beatTypeIcons: Record<string, string> = {
    titleScreen: '🎬',
    introText: '📝',
    dialogTree: '🌳',
    conversationChoice: '💬',
    movementChoice: '🚶',
    pickProp: '🎒',
    durScreen: '⏳',
    videoBeat: '🎥',
    endScreen: '🏁',
    setVariable: '🔧',
    conditionBeat: '❓',
    randomTarget: '🎲',
    setTimer: '⏱️',
    addRemoveInventory: '📦',
  };

  // Collapsed view
  if (collapsed) {
    return (
      <div className="w-12 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-2 border-b border-gray-200">
          <button
            onClick={onToggleCollapse}
            className="w-full p-1 hover:bg-gray-100 rounded transition-colors"
            title="Expand sidebar"
          >
            <ChevronRight className="w-5 h-5 mx-auto" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {beats.map(beat => (
            <button
              key={beat.id}
              onClick={() => onBeatSelect(beat)}
              className={`w-full p-1 mb-1 hover:bg-gray-100 transition-colors ${
                selectedBeat?.id === beat.id ? 'bg-blue-100' : ''
              }`}
              title={beat.name}
            >
              <span className="text-base">
                {beatTypeIcons[beat.type] || '📄'}
              </span>
            </button>
          ))}
        </div>
        <div className="p-2 border-t border-gray-200">
          <div className="text-xs text-center text-gray-500">
            {beats.length}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-800">Story Beats</h2>
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="p-1 hover:bg-gray-100 rounded transition-colors"
              title="Collapse sidebar"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
        </div>
        
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search beats..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Cluster Creation */}
        {onAddCluster && (
          <button
            onClick={handleCreateCluster}
            className="w-full mt-2 p-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors flex items-center justify-center gap-2"
            title="Create New Cluster"
          >
            <FolderPlus className="w-4 h-4" />
            <span className="text-sm">Add Cluster</span>
          </button>
        )}
      </div>

      {/* Beat List */}
      <div className="flex-1 overflow-y-auto p-4">
        {searchTerm ? (
          // Show filtered beats
          <div className="space-y-1">
            {filteredBeats.length > 0 ? (
              filteredBeats.map(beat => (
                <button
                  key={beat.id}
                  onClick={() => onBeatSelect(beat)}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                    selectedBeat?.id === beat.id
                      ? 'bg-blue-100 border-blue-500 border'
                      : 'hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">
                      {beatTypeIcons[beat.type] || '📄'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-gray-800 truncate">
                        {beat.name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {beat.type} • {beat.id}
                      </div>
                    </div>
                  </div>
                </button>
              ))
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">
                No beats found
              </p>
            )}
          </div>
        ) : (
          // Show beats organized by clusters
          <div className="space-y-2">
            {/* Clusters Section - Show as folders */}
            {clusters.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase">Clusters</h4>
                  {onAddCluster && (
                    <button
                      onClick={handleCreateCluster}
                      className="p-1 hover:bg-gray-100 rounded text-gray-500"
                      title="Create new cluster"
                    >
                      <FolderPlus className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {clusters.map(cluster => {
                  const isExpanded = expandedClusters.has(cluster.id);
                  const beatsInCluster = clusteredBeats.get(cluster.id) || [];

                  return (
                    <div key={cluster.id} className="mb-1">
                      {/* Cluster Header - Folder-like with triangle */}
                      <div
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDropOnCluster(e, cluster.id)}
                        className={`flex items-center gap-1 px-2 py-1.5 text-sm rounded-lg transition-colors ${
                          selectedCluster?.id === cluster.id
                            ? 'bg-purple-100 border-purple-500 border'
                            : 'hover:bg-gray-50'
                        }`}
                        title={`Drop beats here to add them to ${cluster.name}`}
                      >
                        {/* Expand/Collapse Triangle */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedClusters(prev => {
                              const newSet = new Set(prev);
                              if (newSet.has(cluster.id)) {
                                newSet.delete(cluster.id);
                              } else {
                                newSet.add(cluster.id);
                              }
                              return newSet;
                            });
                          }}
                          className="p-0.5 hover:bg-gray-200 rounded transition-colors"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
                          )}
                        </button>

                        {/* Folder icon and name - clickable to select */}
                        <button
                          onClick={() => onClusterSelect(cluster)}
                          className="flex items-center gap-2 flex-1 min-w-0"
                        >
                          <Folder className="w-4 h-4 text-purple-500 flex-shrink-0" />
                          <EditableClusterName cluster={cluster} />
                        </button>

                        {/* Beat count */}
                        <span className="text-xs text-gray-400 flex-shrink-0">{beatsInCluster.length}</span>
                      </div>

                      {/* Cluster beats - only shown when expanded */}
                      {isExpanded && beatsInCluster.length > 0 && (
                        <div className="pl-6 mt-1 space-y-0.5">
                          {beatsInCluster.map(beat => (
                            <button
                              key={beat.id}
                              onClick={() => onBeatSelect(beat)}
                              draggable
                              onDragStart={(e) => handleDragStart(e, beat)}
                              className={`w-full text-left px-2 py-1.5 rounded-lg text-sm transition-colors ${
                                selectedBeat?.id === beat.id
                                  ? 'bg-blue-100 border-blue-500 border'
                                  : 'hover:bg-gray-100'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-base">{beatTypeIcons[beat.type] || '📄'}</span>
                                <span className="truncate">{beat.name}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Unclustered Beats Section */}
            {unclusteredBeats.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Draggable to Clusters</h4>
                <div className="space-y-1">
                  {unclusteredBeats.map(beat => (
                    <button
                      key={beat.id}
                      onClick={() => onBeatSelect(beat)}
                      draggable
                      onDragStart={(e) => handleDragStart(e, beat)}
                      className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                        selectedBeat?.id === beat.id
                          ? 'bg-blue-100 border-blue-500 border'
                          : 'hover:bg-gray-100'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{beatTypeIcons[beat.type] || '📄'}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm text-gray-800 truncate">{beat.name}</div>
                          <div className="text-xs text-gray-500">{beat.type}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200">
        <div className="text-xs text-gray-500 mb-2">
          Total: {beats.length} beats
        </div>
      </div>
    </div>
  );
};
