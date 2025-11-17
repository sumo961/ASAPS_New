/**
 * SaveUnsavedWorkDialog - Dialog to prompt saving unsaved work
 *
 * Appears when user tries to navigate away from an untitled project with changes
 * Options: Save to new project, Discard changes, Cancel
 */

import React, { useState } from 'react';
import { AlertTriangle, Save, Trash2, X } from 'lucide-react';

export interface SaveUnsavedWorkDialogProps {
  /** Open/closed state */
  isOpen: boolean;

  /** Called when dialog should close */
  onClose: () => void;

  /** Called when user chooses to save */
  onSave: () => void;

  /** Called when user chooses to discard */
  onDiscard: () => void;

  /** The navigation action that triggered this dialog (for display) */
  action?: string;
}

export const SaveUnsavedWorkDialog: React.FC<SaveUnsavedWorkDialogProps> = ({
  isOpen,
  onClose,
  onSave,
  onDiscard,
  action = 'create a new project'
}) => {
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscard = () => {
    onDiscard();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-blue-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Unsaved Changes</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title="Cancel"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="mb-6">
          <p className="text-gray-700 mb-2">
            You have unsaved changes in your current project.
          </p>
          <p className="text-sm text-gray-600">
            What would you like to do before {action}?
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? (
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Saving...
              </div>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save to Project
              </>
            )}
          </button>

          <button
            onClick={handleDiscard}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Discard
          </button>

          <button
            onClick={onClose}
            className="px-4 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
        </div>

        {/* Helper text */}
        <p className="mt-3 text-xs text-gray-500 text-center">
          "Save to Project" will create a new project with your current work
        </p>
      </div>
    </div>
  );
};
