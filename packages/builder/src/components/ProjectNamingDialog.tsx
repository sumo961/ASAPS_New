import React, { useState } from 'react';
import { X } from 'lucide-react';

interface ProjectNamingDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string, description?: string) => void;
  actionDescription?: string;
}

export const ProjectNamingDialog: React.FC<ProjectNamingDialogProps> = ({
  isOpen,
  onClose,
  onSubmit,
  actionDescription = "create your first beat"
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onSubmit(name.trim(), description.trim());
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4">
        {/** Backdrop */}
        <div className="fixed inset-0 bg-black opacity-50" onClick={onClose} />

        {/** Modal content */}
        <div className="relative bg-white rounded-lg max-w-md w-full p-6 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Name Your Project
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <p className="text-gray-600 mb-4">
            To {actionDescription}, please give your project a name:
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="project-name" className="block text-sm font-medium text-gray-700 mb-1">
                Project Name *
              </label>
              <input
                id="project-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="My Interactive Story"
                autoFocus
                required
              />
            </div>

            <div>
              <label htmlFor="project-description" className="block text-sm font-medium text-gray-700 mb-1">
                Description (optional)
              </label>
              <textarea
                id="project-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                placeholder="Brief description of your project..."
              />
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!name.trim()}
                className="flex-1 px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                Create Project
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};