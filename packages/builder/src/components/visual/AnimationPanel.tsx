/**
 * AnimationPanel - Panel for managing animations in the visual editor
 *
 * Lists all animations for the current beat and allows:
 * - Adding new animations
 * - Editing existing animations
 * - Deleting animations
 * - Previewing animations
 */

import React, { useState } from 'react';
import type { AnimationPath } from '@asaps/core';
import { AnimationPathEditor } from '../animation/AnimationPathEditor';
import { Play, Edit, Trash2, Plus } from 'lucide-react';
import type { VisualElement } from './VisualBeatEditor';

interface AnimationPanelProps {
  /** Current animations for this beat */
  animations: AnimationPath[];

  /** Visual elements that can be animated */
  elements: VisualElement[];

  /** Stage dimensions */
  stageWidth: number;
  stageHeight: number;

  /** Background image URL for reference */
  backgroundUrl?: string;

  /** Callback when animations are updated */
  onAnimationsChange: (animations: AnimationPath[]) => void;
}

export const AnimationPanel: React.FC<AnimationPanelProps> = ({
  animations,
  elements,
  stageWidth,
  stageHeight,
  backgroundUrl,
  onAnimationsChange,
}) => {
  const [editingAnimation, setEditingAnimation] = useState<AnimationPath | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [selectedElementId, setSelectedElementId] = useState<string>('');

  const handleAddAnimation = () => {
    if (!selectedElementId) {
      alert('Please select an element to animate');
      return;
    }

    setEditingAnimation(null);
    setIsEditorOpen(true);
  };

  const handleEditAnimation = (animation: AnimationPath) => {
    setEditingAnimation(animation);
    setSelectedElementId(animation.elementId);
    setIsEditorOpen(true);
  };

  const handleDeleteAnimation = (animationId: string) => {
    if (confirm('Are you sure you want to delete this animation?')) {
      onAnimationsChange(animations.filter(a => a.id !== animationId));
    }
  };

  const handleSaveAnimation = (animation: AnimationPath) => {
    if (editingAnimation) {
      // Update existing animation
      onAnimationsChange(animations.map(a => (a.id === animation.id ? animation : a)));
    } else {
      // Add new animation
      onAnimationsChange([...animations, animation]);
    }
    setIsEditorOpen(false);
    setEditingAnimation(null);
  };

  const handleCloseEditor = () => {
    setIsEditorOpen(false);
    setEditingAnimation(null);
  };

  const getElementName = (elementId: string): string => {
    // Look up by name (which is what elementId now represents) or fall back to id
    const element = elements.find(el => el.name === elementId || el.id === elementId);
    return element ? `${element.type} (${element.name || element.text || element.id.slice(0, 8)})` : elementId;
  };

  return (
    <div className="w-80 bg-white border-r border-gray-200 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Animations</h2>

        {/* Element selector */}
        <div className="mb-3">
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Element to Animate
          </label>
          <select
            value={selectedElementId}
            onChange={(e) => setSelectedElementId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select an element...</option>
            {elements.map((element) => (
              <option key={element.id} value={element.name}>
                {element.type} - {element.name || element.text || element.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </div>

        {/* Add animation button */}
        <button
          onClick={handleAddAnimation}
          disabled={!selectedElementId}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          <Plus size={16} />
          Add Animation
        </button>
      </div>

      {/* Animations list */}
      <div className="flex-1 overflow-y-auto">
        {animations.length === 0 ? (
          <div className="p-4 text-center text-sm text-gray-500">
            No animations yet. Select an element and click "Add Animation" to get started.
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {animations.map((animation) => (
              <div
                key={animation.id}
                className="p-4 hover:bg-gray-50 transition"
              >
                {/* Animation header */}
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-gray-800 mb-1">
                      {animation.name}
                    </h3>
                    <p className="text-xs text-gray-500">
                      Element: {getElementName(animation.elementId)}
                    </p>
                  </div>
                </div>

                {/* Animation details */}
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 mb-3">
                  <div>
                    <span className="font-medium">Type:</span> {animation.type}
                  </div>
                  <div>
                    <span className="font-medium">Duration:</span> {animation.duration}ms
                  </div>
                  <div>
                    <span className="font-medium">Waypoints:</span> {animation.waypoints.length}
                  </div>
                  <div>
                    <span className="font-medium">Trigger:</span> {animation.trigger || 'onLoad'}
                  </div>
                </div>

                {/* Badges */}
                <div className="flex flex-wrap gap-1 mb-3">
                  {animation.loop && (
                    <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full">
                      Loop
                    </span>
                  )}
                  {animation.autoPlay && (
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                      Auto-play
                    </span>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEditAnimation(animation)}
                    className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 transition"
                  >
                    <Edit size={14} />
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteAnimation(animation.id)}
                    className="flex items-center justify-center gap-1 px-3 py-1.5 bg-red-500 text-white text-xs rounded hover:bg-red-600 transition"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Animation editor modal */}
      {isEditorOpen && (
        <AnimationPathEditor
          animation={editingAnimation}
          elementId={selectedElementId}
          stageWidth={stageWidth}
          stageHeight={stageHeight}
          backgroundUrl={backgroundUrl}
          elements={elements}
          onSave={handleSaveAnimation}
          onClose={handleCloseEditor}
        />
      )}
    </div>
  );
};
