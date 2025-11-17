/**
 * NewProjectDialog - Dialog for creating a new project
 *
 * Simple form with project name and optional description
 */

import React, { useState } from 'react';
import { X, Folder } from 'lucide-react';
import { useProject } from '../contexts/PersistenceContext';

export interface NewProjectDialogProps {
  /** Called when dialog should close */
  onClose: () => void;

  /** Called after project is successfully created */
  onProjectCreated?: (projectId: string) => void;

  /** Show as modal (default: true) */
  isModal?: boolean;
}

/**
 * New project dialog component
 */
export const NewProjectDialog: React.FC<NewProjectDialogProps> = ({
  onClose,
  onProjectCreated,
  isModal = true,
}) => {
  const { create } = useProject();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Handle form submission
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError('Project name is required');
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const projectId = await create(name.trim(), description.trim() || undefined);

      if (onProjectCreated) {
        onProjectCreated(projectId);
      }

      onClose();
    } catch (err) {
      console.error('[NewProjectDialog] Failed to create project:', err);
      setError('Failed to create project. Please try again.');
      setCreating(false);
    }
  };

  const containerClass = isModal
    ? 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4'
    : '';

  const dialogClass = isModal
    ? 'bg-white rounded-xl shadow-2xl w-full max-w-md'
    : 'bg-white rounded-lg border border-gray-200 w-full';

  return (
    <div className={containerClass} onClick={isModal ? onClose : undefined}>
      <div
        className={dialogClass}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Folder className="text-blue-600" size={20} />
            </div>
            <h2 className="text-xl font-bold text-gray-900">New Project</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
            disabled={creating}
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Project name */}
          <div>
            <label htmlFor="project-name" className="block text-sm font-medium text-gray-700 mb-1">
              Project Name <span className="text-red-500">*</span>
            </label>
            <input
              id="project-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Awesome Story"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
              disabled={creating}
              maxLength={100}
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="project-description" className="block text-sm font-medium text-gray-700 mb-1">
              Description <span className="text-gray-400 text-xs">(optional)</span>
            </label>
            <textarea
              id="project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of your project..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              disabled={creating}
              maxLength={500}
            />
          </div>

          {/* Error message */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition"
              disabled={creating}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={creating || !name.trim()}
            >
              {creating ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
