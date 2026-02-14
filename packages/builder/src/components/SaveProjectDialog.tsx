/**
 * SaveProjectDialog - Dialog to save current project with a name
 *
 * Appears when user clicks "Save Project" on an untitled project
 * Allows naming and saving the current work as a persistent project
 */

import React, { useState } from 'react';
import { Save, X, FolderOpen } from 'lucide-react';

export interface SaveProjectDialogProps {
  /** Open/closed state */
  isOpen: boolean;

  /** Called when dialog should close */
  onClose: () => void;

  /** Called when user confirms save with name */
  onSave: (name: string, description?: string) => void;

  /** Current project name (if any) */
  currentName?: string;
}

export const SaveProjectDialog: React.FC<SaveProjectDialogProps> = ({
  isOpen,
  onClose,
  onSave,
  currentName = ''
}) => {
  const [projectName, setProjectName] = useState(currentName);
  const [projectDescription, setProjectDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!projectName.trim()) {
      alert('Please enter a project name');
      return;
    }
    setIsSaving(true);
    try {
      await onSave(projectName.trim(), projectDescription.trim());
      setProjectName('');
      setProjectDescription('');
      onClose();
    } catch (error) {
      console.error('[SaveProjectDialog] Failed to save project:', error);
      alert('Failed to save project. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setProjectName(currentName);
    setProjectDescription('');
    onClose();
  };

  // Auto-focus name input when dialog opens
  const nameInputRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (isOpen && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
              <Save className="w-5 h-5 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Save Project</h2>
          </div>
          <button
            onClick={handleCancel}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title="Cancel"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Icon and description */}
        <div className="flex items-center gap-3 mb-6 p-4 bg-blue-50 rounded-lg">
          <FolderOpen className="w-5 h-5 text-blue-600" />
          <p className="text-sm text-blue-800">
            Save your current work as a named project so you can access it later
          </p>
        </div>

        {/* Form */}
        <div className="space-y-5">
          <div>
            <label htmlFor="project-name" className="block text-sm font-medium text-gray-700 mb-2">
              Project Name <span className="text-red-500">*</span>
            </label>
            <input
              id="project-name"
              ref={nameInputRef}
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSave();
                }
              }}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-gray-900"
              placeholder="My Story Project"
              maxLength={100}
            />
            <div className="flex justify-between mt-1">
              <p className="text-xs text-gray-500">Required</p>
              <p className="text-xs text-gray-400">{projectName.length}/100</p>
            </div>
          </div>

          <div>
            <label htmlFor="project-description" className="block text-sm font-medium text-gray-700 mb-2">
              Description (optional)
            </label>
            <textarea
              id="project-description"
              value={projectDescription}
              onChange={(e) => setProjectDescription(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-gray-900"
              placeholder="Brief description of your project..."
              rows={3}
              maxLength={500}
            />
            <div className="text-right mt-1">
              <p className="text-xs text-gray-400">{projectDescription.length}/500</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-8">
          <button
            onClick={handleSave}
            disabled={!projectName.trim() || isSaving}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-green-600"
          >
            {isSaving ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Project
              </>
            )}
          </button>

          <button
            onClick={handleCancel}
            className="flex-1 px-4 py-3 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
