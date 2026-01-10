/**
 * MergeDialogTreesModal - Modal for merging multiple DialogTree beats into a single nested conversation
 *
 * This tool helps authors consolidate separate DialogTree beats that form a linear conversation
 * into a single beat with nested dialog structure. The merge process:
 * 1. Takes the first selected beat as the "target" (keeps its position/ID)
 * 2. Converts choices pointing to other selected beats into nested dialogNodes
 * 3. Removes the merged beats from the flowchart
 * 4. Preserves connections to beats outside the selection
 */

import React, { useState, useMemo, useCallback } from 'react';
import { X, GripVertical, MessageSquare, ArrowRight, AlertCircle } from 'lucide-react';
import { Beat, DialogTreeBeat } from '@asaps/core';

interface MergeDialogTreesModalProps {
  isOpen: boolean;
  onClose: () => void;
  beats: Beat[];
  onMerge: (beatIds: string[]) => { success: boolean; mergedBeatId?: string; error?: string };
  onBeatSelect?: (beat: Beat) => void;
}

interface DraggableItem {
  beatId: string;
  beat: DialogTreeBeat;
  isSelected: boolean;
}

export const MergeDialogTreesModal: React.FC<MergeDialogTreesModalProps> = ({
  isOpen,
  onClose,
  beats,
  onMerge,
  onBeatSelect,
}) => {
  // Get all dialogTree beats
  const dialogTreeBeats = useMemo(() => {
    return beats.filter((b): b is DialogTreeBeat => b.type === 'dialogTree');
  }, [beats]);

  // Track selected beats and their order
  const [selectedBeatIds, setSelectedBeatIds] = useState<string[]>([]);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset state when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setSelectedBeatIds([]);
      setDraggedId(null);
      setError(null);
    }
  }, [isOpen]);

  // Toggle beat selection
  const toggleBeat = useCallback((beatId: string) => {
    setSelectedBeatIds((prev) => {
      if (prev.includes(beatId)) {
        return prev.filter((id) => id !== beatId);
      } else {
        return [...prev, beatId];
      }
    });
    setError(null);
  }, []);

  // Handle drag start
  const handleDragStart = useCallback((e: React.DragEvent, beatId: string) => {
    setDraggedId(beatId);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  // Handle drag over
  const handleDragOver = useCallback((e: React.DragEvent, overBeatId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === overBeatId) return;

    setSelectedBeatIds((prev) => {
      const dragIndex = prev.indexOf(draggedId);
      const overIndex = prev.indexOf(overBeatId);

      if (dragIndex === -1 || overIndex === -1) return prev;

      const newOrder = [...prev];
      newOrder.splice(dragIndex, 1);
      newOrder.splice(overIndex, 0, draggedId);
      return newOrder;
    });
  }, [draggedId]);

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    setDraggedId(null);
  }, []);

  // Build preview of merged structure
  const mergePreview = useMemo(() => {
    if (selectedBeatIds.length < 2) return null;

    const selectedBeats = selectedBeatIds
      .map((id) => dialogTreeBeats.find((b) => b.id === id))
      .filter((b): b is DialogTreeBeat => !!b);

    if (selectedBeats.length < 2) return null;

    return selectedBeats.map((beat, index) => ({
      name: beat.name,
      speaker: beat.dialogTree?.speaker || 'Unknown',
      text: beat.dialogTree?.text?.substring(0, 50) + (beat.dialogTree?.text?.length > 50 ? '...' : '') || '',
      choiceCount: beat.dialogTree?.choices?.length || 0,
      isFirst: index === 0,
      isLast: index === selectedBeats.length - 1,
    }));
  }, [selectedBeatIds, dialogTreeBeats]);

  // Handle merge
  const handleMerge = useCallback(() => {
    if (selectedBeatIds.length < 2) {
      setError('Select at least 2 DialogTree beats to merge');
      return;
    }

    const result = onMerge(selectedBeatIds);

    if (result.success) {
      // If a beat select callback is provided, select the merged beat
      if (result.mergedBeatId && onBeatSelect) {
        const mergedBeat = beats.find((b) => b.id === result.mergedBeatId);
        if (mergedBeat) {
          onBeatSelect(mergedBeat);
        }
      }
      onClose();
    } else {
      setError(result.error || 'Failed to merge beats');
    }
  }, [selectedBeatIds, onMerge, onClose, beats, onBeatSelect]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-blue-500" />
              Merge DialogTree Beats
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Select and order DialogTree beats to merge into a nested conversation
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
          {/* Left: Beat List */}
          <div className="flex-1 border-r border-gray-200 overflow-y-auto p-4">
            <h3 className="text-sm font-medium text-gray-700 mb-3">
              Available DialogTree Beats ({dialogTreeBeats.length})
            </h3>

            {dialogTreeBeats.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No DialogTree beats found in this story
              </div>
            ) : (
              <div className="space-y-2">
                {dialogTreeBeats.map((beat) => {
                  const isSelected = selectedBeatIds.includes(beat.id);
                  const orderIndex = selectedBeatIds.indexOf(beat.id);

                  return (
                    <div
                      key={beat.id}
                      draggable={isSelected}
                      onDragStart={(e) => handleDragStart(e, beat.id)}
                      onDragOver={(e) => isSelected && handleDragOver(e, beat.id)}
                      onDragEnd={handleDragEnd}
                      onClick={() => toggleBeat(beat.id)}
                      className={`
                        p-3 rounded-lg border-2 cursor-pointer transition-all
                        ${isSelected
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                        }
                        ${draggedId === beat.id ? 'opacity-50' : ''}
                      `}
                    >
                      <div className="flex items-center gap-3">
                        {isSelected && (
                          <div className="flex items-center gap-2">
                            <GripVertical className="w-4 h-4 text-gray-400 cursor-grab" />
                            <span className="w-6 h-6 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center font-medium">
                              {orderIndex + 1}
                            </span>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-900 truncate">
                            {beat.name}
                          </div>
                          <div className="text-sm text-gray-500 truncate">
                            {beat.dialogTree?.speaker || 'Unknown'}: {beat.dialogTree?.text?.substring(0, 40) || 'No text'}...
                          </div>
                        </div>
                        <div className="text-xs text-gray-400">
                          {beat.dialogTree?.choices?.length || 0} choices
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: Preview */}
          <div className="w-64 bg-gray-50 p-4 overflow-y-auto">
            <h3 className="text-sm font-medium text-gray-700 mb-3">
              Merge Preview
            </h3>

            {selectedBeatIds.length === 0 ? (
              <div className="text-sm text-gray-500 text-center py-4">
                Select beats to see preview
              </div>
            ) : selectedBeatIds.length === 1 ? (
              <div className="text-sm text-gray-500 text-center py-4">
                Select at least 2 beats to merge
              </div>
            ) : mergePreview ? (
              <div className="space-y-2">
                {mergePreview.map((item, index) => (
                  <div key={index}>
                    <div className={`
                      p-2 rounded border text-xs
                      ${item.isFirst ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}
                    `}>
                      <div className="font-medium text-gray-700 truncate">
                        {item.name}
                      </div>
                      <div className="text-gray-500 mt-1">
                        <span className="font-medium">{item.speaker}:</span> {item.text}
                      </div>
                      {item.isFirst && (
                        <div className="text-green-600 mt-1 text-[10px] uppercase font-medium">
                          Target (keeps ID & position)
                        </div>
                      )}
                    </div>
                    {!item.isLast && (
                      <div className="flex justify-center py-1">
                        <ArrowRight className="w-4 h-4 text-gray-300" />
                      </div>
                    )}
                  </div>
                ))}

                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="text-xs text-yellow-800">
                    <strong>Note:</strong> Choices in Beat 1 that lead to other selected beats will become nested dialog nodes. External connections are preserved.
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          {error && (
            <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-500">
              {selectedBeatIds.length} beat{selectedBeatIds.length !== 1 ? 's' : ''} selected
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={handleMerge}
                disabled={selectedBeatIds.length < 2}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Merge Beats
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
